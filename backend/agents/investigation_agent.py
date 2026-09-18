"""
investigation_agent.py — Multi-hop investigation orchestration.

Owns the loop: question → retrieve → extract entities → follow-up → repeat.
Follow-up queries are ALWAYS generated from entities discovered in prior hops,
never pre-planned.

Max hops: configurable via config.MAX_HOPS (default 3).
"""
import json
import logging
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

from config import MAX_HOPS
from llm_client import chat_json
from retrieval.hybrid_retriever import HybridRetriever, RetrievalResult

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────
# Data structures
# ────────────────────────────────────────────────────────────────

@dataclass
class HopRecord:
    hop_number: int
    query: str
    filters_applied: Dict[str, Any]
    results: List[RetrievalResult]
    extracted_entities: Dict[str, Any]
    triggered_by_entity: Optional[str] = None
    triggered_by_doc_id: Optional[str] = None


@dataclass
class InvestigationState:
    question: str
    hops: List[HopRecord] = field(default_factory=list)
    session_entities: Dict[str, Any] = field(default_factory=dict)  # accumulated across hops

    @property
    def all_evidence(self) -> List[RetrievalResult]:
        """Deduplicated evidence from all hops, ordered by score descending."""
        seen = set()
        results = []
        for hop in self.hops:
            for r in hop.results:
                if r.document.document_id not in seen:
                    seen.add(r.document.document_id)
                    results.append(r)
        return sorted(results, key=lambda r: r.similarity_score, reverse=True)

    @property
    def all_doc_ids(self) -> List[str]:
        return [r.document.document_id for r in self.all_evidence]


# ────────────────────────────────────────────────────────────────
# Prompts
# ────────────────────────────────────────────────────────────────

_ENTITY_EXTRACTION_SYSTEM = """You are an incident investigation assistant.
Your job is to extract structured search entities from a natural language question.
Return ONLY valid JSON, no markdown, no explanation."""

_ENTITY_EXTRACTION_PROMPT = """Extract search entities from this investigation question.
Return a JSON object with these fields (omit any field for which there is no clear evidence in the question):
{{
  "service": "<service name if mentioned, e.g. orders-api, catalog-api>",
  "date": "<specific date if mentioned, ISO format YYYY-MM-DD>",
  "date_from": "<start of date range if mentioned, ISO format>",
  "date_to": "<end of date range if mentioned, ISO format>",
  "version": "<version string if mentioned, e.g. v2.8.1>",
  "symptom": "<brief symptom description, e.g. high latency, errors, slow>",
  "doc_types_hint": ["incident_report", "deployment_note", "postmortem"]
}}

Question: {question}
"""

_FOLLOWUP_DECISION_SYSTEM = """You are an incident investigation agent.
Given the results of a search, decide if a follow-up search is needed to answer the question.
Return ONLY valid JSON, no markdown, no explanation."""

_FOLLOWUP_DECISION_PROMPT = """You are investigating: "{question}"

Discovered evidence so far (hop {hop_num}):
{evidence_summary}

Accumulated known entities: {session_entities}

Based on what you found, decide:
1. Is a follow-up search needed to answer the question more completely?
2. If yes, what specific query should be run, and which EXACT entity from the results triggered this need?

Rules:
- Only request a follow-up if the evidence so far points to a specific gap (e.g., a referenced document ID not yet retrieved, a service name discovered that hasn't been searched, a version or date that warrants a separate search).
- The triggering_entity MUST be something you found in the results above, not something from the original question.
- If evidence is already sufficient, set needs_followup to false.

Return JSON:
{{
  "needs_followup": true or false,
  "followup_query": "<the natural language query for the next search, if needed>",
  "followup_filters": {{
    "service": "<if applicable>",
    "types": ["<doc types to search>"],
    "date_from": "<if applicable>",
    "date_to": "<if applicable>",
    "version": "<if applicable>"
  }},
  "triggering_entity": "<the specific entity from the results that triggered this follow-up>",
  "triggering_doc_id": "<the document_id from the results that led to this follow-up>",
  "reasoning": "<one sentence explaining why this follow-up is needed>"
}}
"""


# ────────────────────────────────────────────────────────────────
# Agent
# ────────────────────────────────────────────────────────────────

class InvestigationAgent:

    def __init__(self, retriever: HybridRetriever):
        self.retriever = retriever

    async def investigate_graph(self, question: str, evidence_agent: Any):
        from agents.graph import RootTraceGraph
        graph_engine = RootTraceGraph(self.retriever, evidence_agent)
        res = await graph_engine.run(question)
        
        state = InvestigationState(
            question=question,
            hops=res.get("hops", []),
            session_entities=res.get("session_entities", {})
        )
        final = res.get("final_answer")
        return state, final

    async def investigate(self, question: str) -> InvestigationState:

        state = InvestigationState(question=question)

        # ── Hop 1: extract initial entities and retrieve ──────────────────
        logger.info(f"[HOP 1] Extracting entities from question: '{question}'")
        initial_entities = await self._extract_initial_entities(question)
        logger.info(f"[HOP 1] Extracted entities: {initial_entities}")

        filters = self._entities_to_filters(initial_entities)
        hop1_results = self.retriever.retrieve(
            query=question,
            filters=filters,
            triggered_by_entity=None,
            triggered_by_doc_id=None,
        )

        extracted = self._summarize_entities_from_results(hop1_results)
        # Merge into session entities
        state.session_entities.update(initial_entities)
        state.session_entities.update(extracted)

        hop1 = HopRecord(
            hop_number=1,
            query=question,
            filters_applied=filters,
            results=hop1_results,
            extracted_entities=extracted,
        )
        state.hops.append(hop1)
        logger.info(f"[HOP 1] Retrieved {len(hop1_results)} documents")

        # ── Follow-up hops ─────────────────────────────────────────────────
        for hop_num in range(2, MAX_HOPS + 1):
            followup = await self._decide_followup(state, hop_num)

            if not followup.get("needs_followup", False):
                logger.info(f"[HOP {hop_num}] No follow-up needed — investigation complete")
                break

            followup_query = followup.get("followup_query", "")
            triggering_entity = followup.get("triggering_entity", "")
            triggering_doc_id = followup.get("triggering_doc_id", "")
            followup_filters = followup.get("followup_filters", {})
            reasoning = followup.get("reasoning", "")

            logger.info(
                f"[HOP {hop_num}] Follow-up query: '{followup_query}' | "
                f"triggered by entity='{triggering_entity}' from doc='{triggering_doc_id}' | "
                f"reason: {reasoning}"
            )

            hop_results = self.retriever.retrieve(
                query=followup_query,
                filters=followup_filters,
                triggered_by_entity=triggering_entity,
                triggered_by_doc_id=triggering_doc_id,
            )

            extracted = self._summarize_entities_from_results(hop_results)
            state.session_entities.update(extracted)
            if triggering_entity:
                state.session_entities["last_triggering_entity"] = triggering_entity

            hop = HopRecord(
                hop_number=hop_num,
                query=followup_query,
                filters_applied=followup_filters,
                results=hop_results,
                extracted_entities=extracted,
                triggered_by_entity=triggering_entity,
                triggered_by_doc_id=triggering_doc_id,
            )
            state.hops.append(hop)
            logger.info(f"[HOP {hop_num}] Retrieved {len(hop_results)} documents")

        logger.info(
            f"Investigation complete: {len(state.hops)} hops, "
            f"{len(state.all_evidence)} unique documents collected"
        )
        return state

    # ── Private helpers ────────────────────────────────────────────────────

    async def _extract_initial_entities(self, question: str) -> Dict[str, Any]:
        prompt = _ENTITY_EXTRACTION_PROMPT.format(question=question)
        try:
            entities = await chat_json(prompt, system=_ENTITY_EXTRACTION_SYSTEM)
            return {k: v for k, v in entities.items() if v}
        except Exception as e:
            logger.warning(f"Entity extraction failed: {e} — proceeding with no filters")
            return {}

    def _entities_to_filters(self, entities: Dict[str, Any]) -> Dict[str, Any]:
        filters: Dict[str, Any] = {}
        if entities.get("service"):
            filters["service"] = entities["service"]
        if entities.get("date"):
            filters["date_from"] = entities["date"]
            filters["date_to"] = entities["date"]
        if entities.get("date_from"):
            filters["date_from"] = entities["date_from"]
        if entities.get("date_to"):
            filters["date_to"] = entities["date_to"]
        if entities.get("version"):
            filters["version"] = entities["version"]
        if entities.get("doc_types_hint"):
            filters["types"] = entities["doc_types_hint"]
        return filters

    def _summarize_entities_from_results(self, results: List[RetrievalResult]) -> Dict[str, Any]:
        """Extract structured entities from retrieval results for use in follow-up decisions."""
        services = set()
        versions = set()
        doc_ids = []
        dates = []
        for r in results:
            if r.document.service:
                services.add(r.document.service)
            if r.document.version:
                versions.add(r.document.version)
            if r.document.date:
                dates.append(r.document.date)
            doc_ids.append(r.document.document_id)
        return {
            "found_services": list(services),
            "found_versions": list(versions),
            "found_doc_ids": doc_ids,
            "found_dates": sorted(dates),
        }

    async def _decide_followup(self, state: InvestigationState, hop_num: int) -> Dict[str, Any]:
        """Ask LLM whether a follow-up search is needed, based on current evidence."""
        evidence_summary = self._build_evidence_summary(state)
        prompt = _FOLLOWUP_DECISION_PROMPT.format(
            question=state.question,
            hop_num=hop_num - 1,
            evidence_summary=evidence_summary,
            session_entities=json.dumps(state.session_entities, indent=2),
        )
        try:
            return await chat_json(prompt, system=_FOLLOWUP_DECISION_SYSTEM)
        except Exception as e:
            logger.warning(f"Follow-up decision failed: {e} — stopping investigation")
            return {"needs_followup": False}

    def _build_evidence_summary(self, state: InvestigationState) -> str:
        lines = []
        for r in state.all_evidence[:12]:  # cap context size
            lines.append(
                f"- [{r.document.document_id}] ({r.document.type}, "
                f"service={r.document.service}, date={r.document.date}, "
                f"version={r.document.version}, score={r.similarity_score:.3f})\n"
                f"  Title: {r.document.title}\n"
                f"  Content (truncated): {r.document.content[:200]}"
            )
        return "\n".join(lines)
