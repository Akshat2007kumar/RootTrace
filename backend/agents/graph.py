"""
graph.py — LangGraph orchestration engine for RootTrace.

Builds a stateful, deterministic directed graph for:
  1. Router Node: Classifies queries into 'direct_rag' vs 'multi_hop'.
  2. Entity Extraction Node: Extracts search entities from question.
  3. Retrieval Node: Runs FAISS hybrid retrieval & updates hop records.
  4. Hop Evaluator Node: Evaluates evidence and decides if follow-up search is required.
  5. Contradiction & Cause Analysis Node: Checks sufficiency, cause-vs-symptom, & contradictions.
  6. Verdict Synthesis Node: Generates grounded, cited answer or INSUFFICIENT_EVIDENCE verdict.
"""
import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END

from config import MAX_HOPS
from llm_client import chat_json
from retrieval.hybrid_retriever import HybridRetriever, RetrievalResult
from agents.investigation_agent import HopRecord, InvestigationState
from agents.evidence_reasoning_agent import (
    EvidenceReasoningAgent,
    SufficiencyResult,
    ContradictionFlag,
    CauseVsSymptomAnalysis,
    FinalAnswer
)

logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────
# LangGraph State Definition
# ────────────────────────────────────────────────────────────────

class RootTraceGraphState(TypedDict):
    question: str
    route: str  # "direct_rag" | "multi_hop"
    hop_number: int
    current_query: str
    current_filters: Dict[str, Any]
    session_entities: Dict[str, Any]
    hops: List[HopRecord]
    accumulated_evidence: List[RetrievalResult]
    needs_followup: bool
    triggering_entity: Optional[str]
    triggering_doc_id: Optional[str]
    sufficiency_result: Optional[SufficiencyResult]
    contradiction_flags: List[ContradictionFlag]
    cause_vs_symptom: List[CauseVsSymptomAnalysis]
    final_answer: Optional[FinalAnswer]


# ────────────────────────────────────────────────────────────────
# Prompts for Routing & Hop Evaluation
# ────────────────────────────────────────────────────────────────

_ROUTER_SYSTEM = """You are a query classifier for an incident investigation engine.
Determine if the query is a simple, direct lookup (e.g. asking for specific doc, team, or simple overview)
OR a complex incident investigation requiring multi-hop reasoning (e.g. tracing root cause, latency spikes, cascading failures).
Return ONLY valid JSON: {"route": "direct_rag" or "multi_hop", "reasoning": "<one sentence>"}"
"""

_ROUTER_PROMPT = """Classify this query: "{question}" """


# ────────────────────────────────────────────────────────────────
# LangGraph Workflow Class
# ────────────────────────────────────────────────────────────────

class RootTraceGraph:
    def __init__(self, retriever: HybridRetriever, evidence_agent: EvidenceReasoningAgent):
        self.retriever = retriever
        self.evidence_agent = evidence_agent
        self.graph = self._build_graph()

    def _build_graph(self):
        workflow = StateGraph(RootTraceGraphState)

        # Add Nodes
        workflow.add_node("router", self.router_node)
        workflow.add_node("entity_extraction", self.entity_extraction_node)
        workflow.add_node("retrieval", self.retrieval_node)
        workflow.add_node("hop_evaluator", self.hop_evaluator_node)
        workflow.add_node("evidence_reasoning", self.evidence_reasoning_node)
        workflow.add_node("verdict_synthesis", self.verdict_synthesis_node)

        # Set Entry Point
        workflow.set_entry_point("router")

        # Conditional Edge after Router
        workflow.add_conditional_edges(
            "router",
            self._route_query,
            {
                "direct_rag": "retrieval",
                "multi_hop": "entity_extraction",
            }
        )

        # Sequential Edges
        workflow.add_edge("entity_extraction", "retrieval")
        workflow.add_edge("retrieval", "hop_evaluator")

        # Conditional Edge after Hop Evaluator
        workflow.add_conditional_edges(
            "hop_evaluator",
            self._should_continue_hop,
            {
                "continue_hop": "retrieval",
                "evidence_reasoning": "evidence_reasoning",
            }
        )

        workflow.add_edge("evidence_reasoning", "verdict_synthesis")
        workflow.add_edge("verdict_synthesis", END)

        return workflow.compile()

    # ────────────────────────────────────────────────────────────────
    # Routing Condition Functions
    # ────────────────────────────────────────────────────────────────

    def _route_query(self, state: RootTraceGraphState) -> str:
        return state.get("route", "multi_hop")

    def _should_continue_hop(self, state: RootTraceGraphState) -> str:
        if state.get("route") == "direct_rag":
            return "evidence_reasoning"
        
        needs_followup = state.get("needs_followup", False)
        hop_number = state.get("hop_number", 1)

        if needs_followup and hop_number <= MAX_HOPS:
            return "continue_hop"
        return "evidence_reasoning"

    # ────────────────────────────────────────────────────────────────
    # Node Implementation Methods
    # ────────────────────────────────────────────────────────────────

    async def router_node(self, state: RootTraceGraphState) -> Dict[str, Any]:
        question = state["question"]
        try:
            res = await chat_json(
                prompt=_ROUTER_PROMPT.format(question=question),
                system=_ROUTER_SYSTEM,
            )
            route = res.get("route", "multi_hop")
            if route not in ("direct_rag", "multi_hop"):
                route = "multi_hop"
        except Exception as e:
            logger.warning(f"Router fallback to multi_hop: {e}")
            route = "multi_hop"

        logger.info(f"[LangGraph Router] Query route selected: {route}")
        return {
            "route": route,
            "hop_number": 1,
            "hops": [],
            "accumulated_evidence": [],
            "session_entities": {},
            "current_query": question,
            "current_filters": {},
        }

    async def entity_extraction_node(self, state: RootTraceGraphState) -> Dict[str, Any]:
        question = state["question"]
        from agents.investigation_agent import _ENTITY_EXTRACTION_SYSTEM, _ENTITY_EXTRACTION_PROMPT
        try:
            entities = await chat_json(
                prompt=_ENTITY_EXTRACTION_PROMPT.format(question=question),
                system=_ENTITY_EXTRACTION_SYSTEM,
            )
        except Exception as e:
            logger.warning(f"Entity extraction fallback: {e}")
            entities = {}

        filters = {}
        if entities.get("service"):
            filters["service"] = entities["service"]
        if entities.get("doc_types_hint"):
            filters["types"] = entities["doc_types_hint"]
        if entities.get("date"):
            filters["date_from"] = entities["date"]
            filters["date_to"] = entities["date"]
        if entities.get("date_from"):
            filters["date_from"] = entities["date_from"]
        if entities.get("date_to"):
            filters["date_to"] = entities["date_to"]
        if entities.get("version"):
            filters["version"] = entities["version"]

        logger.info(f"[LangGraph Entity Extraction] Extracted filters: {filters}")
        return {
            "extracted_entities": entities,
            "current_filters": filters,
            "session_entities": dict(entities),
        }

    async def retrieval_node(self, state: RootTraceGraphState) -> Dict[str, Any]:
        hop_num = state.get("hop_number", 1)
        query = state.get("current_query", state["question"])
        filters = state.get("current_filters", {})
        triggering_entity = state.get("triggering_entity")
        triggering_doc_id = state.get("triggering_doc_id")

        logger.info(f"[LangGraph Retrieval Node] Hop {hop_num} | Query: '{query}' | Filters: {filters}")
        results = self.retriever.retrieve(
            query=query,
            filters=filters,
            triggered_by_entity=triggering_entity,
            triggered_by_doc_id=triggering_doc_id,
        )


        # Extract entities from doc content to update session_entities
        discovered_entities = {}
        for r in results:
            d = r.document
            if d.service and "services" not in state.get("session_entities", {}):
                discovered_entities.setdefault("services", set()).add(d.service)
            if d.version:
                discovered_entities.setdefault("versions", set()).add(d.version)

        hop_record = HopRecord(
            hop_number=hop_num,
            query=query,
            filters_applied=filters,
            results=results,
            extracted_entities=discovered_entities,
            triggered_by_entity=triggering_entity,
            triggered_by_doc_id=triggering_doc_id,
        )

        existing_hops = list(state.get("hops", []))
        existing_hops.append(hop_record)

        # Deduplicate evidence
        existing_evidence = list(state.get("accumulated_evidence", []))
        seen_ids = {r.document.document_id for r in existing_evidence}
        for r in results:
            if r.document.document_id not in seen_ids:
                seen_ids.add(r.document.document_id)
                existing_evidence.append(r)

        return {
            "hops": existing_hops,
            "accumulated_evidence": existing_evidence,
        }

    async def hop_evaluator_node(self, state: RootTraceGraphState) -> Dict[str, Any]:
        if state.get("route") == "direct_rag":
            return {"needs_followup": False}

        hop_num = state.get("hop_number", 1)
        if hop_num >= MAX_HOPS:
            logger.info(f"[LangGraph Hop Evaluator] Reached MAX_HOPS ({MAX_HOPS}). Stopping hop sequence.")
            return {"needs_followup": False}

        from agents.investigation_agent import _FOLLOWUP_DECISION_SYSTEM, _FOLLOWUP_DECISION_PROMPT
        evidence = state.get("accumulated_evidence", [])
        evidence_summary = "\n".join([
            f"- [{r.document.document_id}] {r.document.title} ({r.document.service}, {r.document.date}, {r.document.version}): {r.document.content[:200]}"
            for r in evidence
        ])

        try:
            decision = await chat_json(
                prompt=_FOLLOWUP_DECISION_PROMPT.format(
                    question=state["question"],
                    hop_num=hop_num,
                    evidence_summary=evidence_summary,
                    session_entities=state.get("session_entities", {}),
                ),
                system=_FOLLOWUP_DECISION_SYSTEM,
            )
        except Exception as e:
            logger.warning(f"Followup decision fallback: {e}")
            decision = {"needs_followup": False}

        needs_followup = decision.get("needs_followup", False)
        if needs_followup:
            followup_query = decision.get("followup_query", state["question"])
            raw_filters = decision.get("followup_filters", {})
            filters = {k: v for k, v in raw_filters.items() if v}
            logger.info(f"[LangGraph Hop Evaluator] Follow-up requested: '{followup_query}'")
            return {
                "needs_followup": True,
                "current_query": followup_query,
                "current_filters": filters,
                "triggering_entity": decision.get("triggering_entity"),
                "triggering_doc_id": decision.get("triggering_doc_id"),
                "hop_number": hop_num + 1,
            }
        else:
            logger.info("[LangGraph Hop Evaluator] Evidence sufficient or no follow-up gap. Ending hops.")
            return {"needs_followup": False}

    async def evidence_reasoning_node(self, state: RootTraceGraphState) -> Dict[str, Any]:
        inv_state = InvestigationState(
            question=state["question"],
            hops=state.get("hops", []),
            session_entities=state.get("session_entities", {}),
        )

        logger.info("[LangGraph Evidence Reasoning] Delegating evidence analysis & synthesis to EvidenceReasoningAgent...")
        final_answer = await self.evidence_agent.reason(inv_state)
        return {
            "sufficiency_result": final_answer.sufficiency_details,
            "contradiction_flags": final_answer.contradiction_flags,
            "cause_vs_symptom": final_answer.cause_vs_symptom,
            "final_answer": final_answer,
        }

    async def verdict_synthesis_node(self, state: RootTraceGraphState) -> Dict[str, Any]:
        final_answer = state.get("final_answer")
        logger.info(f"[LangGraph Verdict Synthesis] Final verdict: {final_answer.verdict if final_answer else 'UNKNOWN'}")
        return {"final_answer": final_answer}


    async def run(self, question: str) -> Dict[str, Any]:
        initial_state: RootTraceGraphState = {
            "question": question,
            "route": "multi_hop",
            "hop_number": 1,
            "current_query": question,
            "current_filters": {},
            "session_entities": {},
            "hops": [],
            "accumulated_evidence": [],
            "needs_followup": False,
            "triggering_entity": None,
            "triggering_doc_id": None,
            "sufficiency_result": None,
            "contradiction_flags": [],
            "cause_vs_symptom": [],
            "final_answer": None,
        }
        return await self.graph.ainvoke(initial_state)
