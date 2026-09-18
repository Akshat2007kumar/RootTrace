"""
evidence_reasoning_agent.py — Takes accumulated evidence and produces a final, cited answer.

Sub-steps (in order):
  1. Rule-based sufficiency check (NO LLM) — gates whether to proceed
  2. Cause-vs-symptom comparison (P1) — prevents treating different-cause incidents as the same
  3. Contradiction/supersession check (P1) — distinguishes genuine contradictions from scoped guidance
  4. Final answer generation (LLM, but strictly grounded to retrieved docs)
  5. Post-generation citation verification — strips or flags any citation not in retrieved set

Anti-hallucination:
  - LLM only receives the TEXT of retrieved documents, nothing else
  - Allowed doc IDs are passed as a hard list; citations verified programmatically after generation
  - If sufficiency_check fails, LLM is NEVER called — pure Python returns INSUFFICIENT_EVIDENCE
"""
import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple

from llm_client import chat_json, chat
from agents.investigation_agent import InvestigationState
from retrieval.hybrid_retriever import RetrievalResult
from config import SUFFICIENCY_MIN_DOCS, SUFFICIENCY_MIN_SCORE

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────
# Output types
# ────────────────────────────────────────────────────────────────

@dataclass
class ContradictionFlag:
    doc_id_1: str
    doc_id_2: str
    relationship: str  # GENUINE_CONTRADICTION | NEWER_SUPERSEDES | CONDITIONAL_BOTH_APPLY
    reasoning: str
    date_1: Optional[str]
    date_2: Optional[str]


@dataclass
class CauseVsSymptomAnalysis:
    doc_id_1: str
    doc_id_2: str
    symptom_match: bool
    cause_match: bool
    cause_summary_1: str
    cause_summary_2: str
    verdict: str  # SAME_INCIDENT_PATTERN | SAME_SYMPTOM_DIFFERENT_CAUSE | DIFFERENT_INCIDENT


@dataclass
class SufficiencyResult:
    is_sufficient: bool
    reason: str
    doc_count: int
    max_score: float
    service_match: bool
    cause_verified: bool  # P1: whether any similar incident has cause_match=True


@dataclass
class FinalAnswer:
    verdict: str  # ANSWERED | INSUFFICIENT_EVIDENCE
    answer: str
    citations: List[Dict[str, str]]        # [{doc_id, title, type, date}]
    contradiction_flags: List[ContradictionFlag] = field(default_factory=list)
    cause_vs_symptom: List[CauseVsSymptomAnalysis] = field(default_factory=list)
    sufficiency_details: Optional[SufficiencyResult] = None
    unverified_claims: List[str] = field(default_factory=list)  # citations LLM tried to invent


# ────────────────────────────────────────────────────────────────
# Prompts
# ────────────────────────────────────────────────────────────────

_CONTRADICTION_SYSTEM = """You are an expert at analyzing technical documentation.
Determine the relationship between two guidance documents — whether they genuinely contradict
each other or whether one is conditionally scoped and both could apply in different situations.
Return ONLY valid JSON, no markdown."""

_CONTRADICTION_PROMPT = """Analyze these two guidance documents and determine their relationship.

Document 1: [{id1}] dated {date1}, version {ver1}
Title: {title1}
Content: {content1}

Document 2: [{id2}] dated {date2}, version {ver2}
Title: {title2}
Content: {content2}

Determine the relationship. Key rules:
- GENUINE_CONTRADICTION: Both documents give opposing advice that CANNOT both be true simultaneously, with no scope distinction.
- NEWER_SUPERSEDES: The newer document explicitly or clearly replaces the older one for the SAME scenario.
- CONDITIONAL_BOTH_APPLY: The documents appear to conflict but actually apply to different conditions or scenarios — both can be correct simultaneously.

Return JSON:
{{
  "relationship": "GENUINE_CONTRADICTION or NEWER_SUPERSEDES or CONDITIONAL_BOTH_APPLY",
  "reasoning": "<1-2 sentence explanation>",
  "condition_for_doc1": "<what condition/scenario doc1 applies to>",
  "condition_for_doc2": "<what condition/scenario doc2 applies to>"
}}"""

_CAUSE_VS_SYMPTOM_SYSTEM = """You are an expert incident analyst.
Compare two incident documents and determine whether they represent the same root cause
or merely the same symptoms. Return ONLY valid JSON, no markdown."""

_CAUSE_VS_SYMPTOM_PROMPT = """Compare these two incident documents. Focus on ROOT CAUSE, not symptoms.

Incident 1: [{id1}]
Title: {title1}
Content: {content1}

Incident 2: [{id2}]
Title: {title2}
Content: {content2}

Return JSON:
{{
  "symptom_match": true or false,
  "cause_match": true or false,
  "cause_summary_1": "<brief root cause of incident 1>",
  "cause_summary_2": "<brief root cause of incident 2>",
  "verdict": "SAME_INCIDENT_PATTERN or SAME_SYMPTOM_DIFFERENT_CAUSE or DIFFERENT_INCIDENT",
  "explanation": "<1-2 sentences explaining the verdict>"
}}"""

_FINAL_ANSWER_SYSTEM = """You are RootTrace, an incident investigation agent.

CRITICAL RULES — violating these is a failure:
1. You MUST ONLY use information from the documents provided below. Do not use any external knowledge.
2. Every factual claim MUST be followed by [DOCUMENT_ID] citing the exact document it comes from.
3. If a fact is not supported by any provided document, you MUST say "not evidenced in retrieved documents."
4. If the evidence is contradictory, state the contradiction explicitly and cite both documents.
5. Never speculate. Never invent. Never assume.
6. End with a "Summary" section that directly answers the original question."""

_FINAL_ANSWER_PROMPT = """Investigation question: {question}

ALLOWED DOCUMENT IDs (you may ONLY cite these): {allowed_ids}

Retrieved documents:
{documents_text}

{contradiction_context}

{cause_vs_symptom_context}

Provide a thorough, evidence-backed answer to the investigation question.
Format: Use inline citations like [DOC-ID] after every factual claim.
Structure your answer with clear sections if needed.
End with a bold **Summary** that directly answers the question.
If evidence for any part of the question is missing, state that explicitly."""


# ────────────────────────────────────────────────────────────────
# Agent
# ────────────────────────────────────────────────────────────────

class EvidenceReasoningAgent:

    async def reason(self, state: InvestigationState) -> FinalAnswer:
        evidence = state.all_evidence

        # ── Step 1: Rule-based sufficiency check (NO LLM) ─────────────────
        # STUB: Upgrade this once cause_vs_symptom exists (see step 3 upgrade below)
        # For now: uses retrieval-only signals
        sufficiency = self._check_sufficiency_stub(evidence, state.session_entities)
        logger.info(
            f"Sufficiency check: sufficient={sufficiency.is_sufficient}, "
            f"docs={sufficiency.doc_count}, max_score={sufficiency.max_score:.3f}, "
            f"service_match={sufficiency.service_match}"
        )

        if not sufficiency.is_sufficient:
            return FinalAnswer(
                verdict="INSUFFICIENT_EVIDENCE",
                answer=(
                    "Insufficient evidence to answer this question with confidence.\n\n"
                    f"**Reason:** {sufficiency.reason}\n\n"
                    f"**Retrieved documents:** {sufficiency.doc_count} (minimum required: {SUFFICIENCY_MIN_DOCS})\n"
                    f"**Highest similarity score:** {sufficiency.max_score:.3f} (minimum required: {SUFFICIENCY_MIN_SCORE})\n\n"
                    "The available documents do not contain enough directly relevant information "
                    "to support a reliable answer. Adding more specific documents to the knowledge "
                    "base may resolve this."
                ),
                citations=[],
                sufficiency_details=sufficiency,
            )

        # ── Step 2: Contradiction/supersession check (P1) ─────────────────
        guidance_docs = [r for r in evidence if r.document.type == "troubleshooting"]
        contradiction_flags = []
        if len(guidance_docs) >= 2:
            contradiction_flags = await self._check_contradictions(guidance_docs)
            logger.info(f"Contradiction check: {len(contradiction_flags)} pairs analyzed")

        # ── Step 3: Cause-vs-symptom comparison (P1) ──────────────────────
        incident_docs = [
            r for r in evidence
            if r.document.type in ("incident_report", "postmortem")
        ]
        cause_analyses: List[CauseVsSymptomAnalysis] = []
        if len(incident_docs) >= 2:
            cause_analyses = await self._check_cause_vs_symptom(incident_docs)
            logger.info(f"Cause-vs-symptom: {len(cause_analyses)} pairs analyzed")

        # ── Step 3b: Upgrade sufficiency check using cause-vs-symptom ─────
        # NOW we re-check sufficiency using cause_match information.
        # A "similar" incident with a different root cause does NOT count as evidence.
        sufficiency = self._check_sufficiency_with_cause(
            evidence, state.session_entities, cause_analyses
        )
        if not sufficiency.is_sufficient:
            logger.info("Sufficiency re-check (post cause-vs-symptom) FAILED")
            return FinalAnswer(
                verdict="INSUFFICIENT_EVIDENCE",
                answer=(
                    "Insufficient evidence to answer this question with confidence.\n\n"
                    f"**Reason:** {sufficiency.reason}\n\n"
                    "Similar incidents were found but they have **different root causes** — "
                    "they cannot be used as evidence for the same failure pattern.\n\n"
                    "The available documents do not support a reliable conclusion."
                ),
                citations=[],
                cause_vs_symptom=cause_analyses,
                sufficiency_details=sufficiency,
            )

        # ── Step 4: Generate final answer (LLM, strictly grounded) ────────
        allowed_ids = [r.document.document_id for r in evidence]
        documents_text = self._format_documents_for_llm(evidence)
        contradiction_context = self._format_contradiction_context(contradiction_flags)
        cause_context = self._format_cause_context(cause_analyses)

        prompt = _FINAL_ANSWER_PROMPT.format(
            question=state.question,
            allowed_ids=", ".join(allowed_ids),
            documents_text=documents_text,
            contradiction_context=contradiction_context,
            cause_vs_symptom_context=cause_context,
        )

        raw_answer = await chat(prompt, system=_FINAL_ANSWER_SYSTEM)

        # ── Step 5: Citation verification — strip hallucinated citations ───
        verified_answer, unverified = self._verify_citations(raw_answer, allowed_ids)

        citations = [
            {
                "doc_id": r.document.document_id,
                "title": r.document.title,
                "type": r.document.type,
                "date": r.document.date or "",
                "service": r.document.service or "",
                "similarity_score": r.similarity_score,
            }
            for r in evidence
        ]

        return FinalAnswer(
            verdict="ANSWERED",
            answer=verified_answer,
            citations=citations,
            contradiction_flags=contradiction_flags,
            cause_vs_symptom=cause_analyses,
            sufficiency_details=sufficiency,
            unverified_claims=unverified,
        )

    # ── Sufficiency checks ─────────────────────────────────────────────────

    def _check_sufficiency_stub(
        self, evidence: List[RetrievalResult], question_entities: Dict[str, Any]
    ) -> SufficiencyResult:
        """
        # STUB: upgrade once cause_vs_symptom exists.
        # Uses only retrieval signals: doc count, similarity score, service match.
        """
        doc_count = len(evidence)
        max_score = max((r.similarity_score for r in evidence), default=0.0)
        question_service = question_entities.get("service", "")
        service_match = any(
            r.document.service and question_service.lower() in r.document.service.lower()
            for r in evidence
        ) if question_service else True  # if no service in question, don't penalize

        if doc_count < SUFFICIENCY_MIN_DOCS:
            return SufficiencyResult(
                is_sufficient=False,
                reason=f"Only {doc_count} document(s) retrieved (minimum: {SUFFICIENCY_MIN_DOCS})",
                doc_count=doc_count,
                max_score=max_score,
                service_match=service_match,
                cause_verified=False,
            )
        if max_score < SUFFICIENCY_MIN_SCORE:
            return SufficiencyResult(
                is_sufficient=False,
                reason=f"Highest similarity score {max_score:.3f} is below threshold {SUFFICIENCY_MIN_SCORE}",
                doc_count=doc_count,
                max_score=max_score,
                service_match=service_match,
                cause_verified=False,
            )
        return SufficiencyResult(
            is_sufficient=True,
            reason="Sufficient evidence found",
            doc_count=doc_count,
            max_score=max_score,
            service_match=service_match,
            cause_verified=False,  # upgraded in _check_sufficiency_with_cause
        )

    def _check_sufficiency_with_cause(
        self,
        evidence: List[RetrievalResult],
        question_entities: Dict[str, Any],
        cause_analyses: List[CauseVsSymptomAnalysis],
    ) -> SufficiencyResult:
        """
        Upgraded sufficiency check that accounts for cause-vs-symptom analysis.
        A "similar" incident with a DIFFERENT root cause must NOT count as evidence.
        """
        base = self._check_sufficiency_stub(evidence, question_entities)
        if not base.is_sufficient:
            return base

        # Check: if ALL incident pairs are SAME_SYMPTOM_DIFFERENT_CAUSE with no cause_match,
        # and the question is asking about recurrence/past-incidents, it's insufficient.
        if cause_analyses:
            all_different_cause = all(
                not a.cause_match for a in cause_analyses
                if a.verdict == "SAME_SYMPTOM_DIFFERENT_CAUSE"
            )
            has_any_cause_match = any(a.cause_match for a in cause_analyses)

            # If question seems to ask about recurrence and we have no cause matches
            question_lower = question_entities.get("symptom", "").lower()
            recurrence_keywords = ["before", "again", "previous", "recur", "happened", "seen"]
            is_recurrence_question = any(k in question_lower for k in recurrence_keywords)

            if is_recurrence_question and all_different_cause and not has_any_cause_match:
                return SufficiencyResult(
                    is_sufficient=False,
                    reason=(
                        "Similar incidents found but with different root causes — "
                        "cannot confirm recurrence of the same failure pattern"
                    ),
                    doc_count=base.doc_count,
                    max_score=base.max_score,
                    service_match=base.service_match,
                    cause_verified=False,
                )

        return SufficiencyResult(
            is_sufficient=True,
            reason="Sufficient evidence with cause verification passed",
            doc_count=base.doc_count,
            max_score=base.max_score,
            service_match=base.service_match,
            cause_verified=True,
        )

    # ── Contradiction check ────────────────────────────────────────────────

    async def _check_contradictions(
        self, guidance_docs: List[RetrievalResult]
    ) -> List[ContradictionFlag]:
        flags = []
        if len(guidance_docs) < 2:
            return flags

        # Compare primary guidance document against subsequent guidance documents (up to 2)
        d1 = guidance_docs[0].document
        for other in guidance_docs[1:3]:
            d2 = other.document
            prompt = _CONTRADICTION_PROMPT.format(
                id1=d1.document_id, date1=d1.date or "unknown", ver1=d1.version or "unknown",
                title1=d1.title, content1=d1.content[:600],
                id2=d2.document_id, date2=d2.date or "unknown", ver2=d2.version or "unknown",
                title2=d2.title, content2=d2.content[:600],
            )
            try:
                result = await chat_json(prompt, system=_CONTRADICTION_SYSTEM)
                flag = ContradictionFlag(
                    doc_id_1=d1.document_id,
                    doc_id_2=d2.document_id,
                    relationship=result.get("relationship", "UNKNOWN"),
                    reasoning=result.get("reasoning", ""),
                    date_1=d1.date,
                    date_2=d2.date,
                )
                flags.append(flag)
                logger.info(
                    f"Contradiction check [{d1.document_id}] vs [{d2.document_id}]: "
                    f"{flag.relationship} — {flag.reasoning}"
                )
            except Exception as e:
                logger.warning(f"Contradiction check failed for {d1.document_id}/{d2.document_id}: {e}")
        return flags

    # ── Cause-vs-symptom check ─────────────────────────────────────────────

    async def _check_cause_vs_symptom(
        self, incident_docs: List[RetrievalResult]
    ) -> List[CauseVsSymptomAnalysis]:
        analyses = []
        if len(incident_docs) < 2:
            return analyses

        # Compare primary incident against preceding incidents (up to 3)
        d1 = incident_docs[0].document
        for other in incident_docs[1:4]:
            d2 = other.document
            prompt = _CAUSE_VS_SYMPTOM_PROMPT.format(
                id1=d1.document_id, title1=d1.title, content1=d1.content[:500],
                id2=d2.document_id, title2=d2.title, content2=d2.content[:500],
            )
            try:
                result = await chat_json(prompt, system=_CAUSE_VS_SYMPTOM_SYSTEM)
                analysis = CauseVsSymptomAnalysis(
                    doc_id_1=d1.document_id,
                    doc_id_2=d2.document_id,
                    symptom_match=result.get("symptom_match", False),
                    cause_match=result.get("cause_match", False),
                    cause_summary_1=result.get("cause_summary_1", ""),
                    cause_summary_2=result.get("cause_summary_2", ""),
                    verdict=result.get("verdict", "DIFFERENT_INCIDENT"),
                )
                analyses.append(analysis)
                logger.info(
                    f"Cause-vs-symptom [{d1.document_id}] vs [{d2.document_id}]: "
                    f"symptom_match={analysis.symptom_match}, cause_match={analysis.cause_match}, "
                    f"verdict={analysis.verdict}"
                )
            except Exception as e:
                logger.warning(f"Cause-vs-symptom check failed: {e}")
        return analyses

    # ── Citation verification ──────────────────────────────────────────────

    def _verify_citations(
        self, answer: str, allowed_ids: List[str]
    ) -> Tuple[str, List[str]]:
        """
        Extract all [DOC-ID] citations from the answer.
        Any citation NOT in allowed_ids is flagged and annotated with [UNVERIFIED].
        Returns (cleaned_answer, list_of_unverified_citations).
        """
        pattern = re.compile(r'\[([A-Z]+-[\w-]+)\]')
        cited = pattern.findall(answer)
        unverified = [c for c in cited if c not in allowed_ids]

        if unverified:
            logger.warning(f"Unverified citations detected: {unverified}")
            for uc in unverified:
                answer = answer.replace(f"[{uc}]", f"[{uc}—UNVERIFIED]")

        return answer, unverified

    # ── Formatting helpers ─────────────────────────────────────────────────

    def _format_documents_for_llm(self, evidence: List[RetrievalResult]) -> str:
        parts = []
        for r in evidence:
            d = r.document
            parts.append(
                f"=== [{d.document_id}] ===\n"
                f"Type: {d.type} | Service: {d.service or 'N/A'} | "
                f"Date: {d.date or 'N/A'} | Version: {d.version or 'N/A'}\n"
                f"Title: {d.title}\n"
                f"Content: {d.content}\n"
            )
        return "\n".join(parts)

    def _format_contradiction_context(self, flags: List[ContradictionFlag]) -> str:
        if not flags:
            return ""
        lines = ["=== GUIDANCE DOCUMENT ANALYSIS ==="]
        for f in flags:
            lines.append(
                f"[{f.doc_id_1}] vs [{f.doc_id_2}]: {f.relationship}\n"
                f"  Analysis: {f.reasoning}"
            )
        return "\n".join(lines)

    def _format_cause_context(self, analyses: List[CauseVsSymptomAnalysis]) -> str:
        if not analyses:
            return ""
        lines = ["=== INCIDENT CAUSE ANALYSIS ==="]
        for a in analyses:
            lines.append(
                f"[{a.doc_id_1}] vs [{a.doc_id_2}]: {a.verdict}\n"
                f"  Symptom match: {a.symptom_match} | Cause match: {a.cause_match}\n"
                f"  Cause 1: {a.cause_summary_1}\n"
                f"  Cause 2: {a.cause_summary_2}"
            )
        return "\n".join(lines)
