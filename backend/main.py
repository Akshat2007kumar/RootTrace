"""
main.py — FastAPI application. Exposes:
  POST /investigate  — run an investigation
  GET  /documents    — list all documents (for judge inspection)
  GET  /health       — check system readiness

FAISS index and document store are built ONCE at startup.
"""
import logging
import sys
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from retrieval.hybrid_retriever import get_retriever
from agents.investigation_agent import InvestigationAgent
from agents.evidence_reasoning_agent import EvidenceReasoningAgent

# ────────────────────────────────────────────────────────────────
# Logging
# ────────────────────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ────────────────────────────────────────────────────────────────
# Startup / shutdown
# ────────────────────────────────────────────────────────────────
retriever = None
investigation_agent = None
evidence_agent = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global retriever, investigation_agent, evidence_agent
    logger.info("Starting RootTrace — building FAISS index...")
    retriever = get_retriever()
    investigation_agent = InvestigationAgent(retriever)
    evidence_agent = EvidenceReasoningAgent()
    logger.info(f"RootTrace ready. Documents indexed: {retriever.index.ntotal}")
    yield
    logger.info("RootTrace shutting down.")


# ────────────────────────────────────────────────────────────────
# App
# ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="RootTrace — Incident Investigation Agent",
    description="Agentic multi-hop document investigation with contradiction detection and citation verification.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ────────────────────────────────────────────────────────────────
# Request / Response models
# ────────────────────────────────────────────────────────────────

class InvestigateRequest(BaseModel):
    question: str
    filters: Optional[Dict[str, Any]] = None  # optional override filters for initial hop


class HopResultItem(BaseModel):
    document_id: str
    title: str
    type: str
    service: Optional[str]
    date: Optional[str]
    version: Optional[str]
    similarity_score: float
    matched_filters: List[str]
    triggered_by_entity: Optional[str]
    triggered_by_doc_id: Optional[str]
    content_snippet: str  # first 300 chars


class HopTraceItem(BaseModel):
    hop_number: int
    query: str
    filters_applied: Dict[str, Any]
    triggered_by_entity: Optional[str]
    triggered_by_doc_id: Optional[str]
    results: List[HopResultItem]


class CitationItem(BaseModel):
    doc_id: str
    title: str
    type: str
    date: str
    service: str
    similarity_score: float


class ContradictionFlagItem(BaseModel):
    doc_id_1: str
    doc_id_2: str
    relationship: str
    reasoning: str
    date_1: Optional[str]
    date_2: Optional[str]


class CauseAnalysisItem(BaseModel):
    doc_id_1: str
    doc_id_2: str
    symptom_match: bool
    cause_match: bool
    cause_summary_1: str
    cause_summary_2: str
    verdict: str


class SufficiencyItem(BaseModel):
    is_sufficient: bool
    reason: str
    doc_count: int
    max_score: float
    service_match: bool
    cause_verified: bool


class InvestigateResponse(BaseModel):
    verdict: str  # ANSWERED | INSUFFICIENT_EVIDENCE
    answer: str
    citations: List[CitationItem]
    investigation_trace: List[HopTraceItem]
    contradiction_flags: List[ContradictionFlagItem]
    cause_vs_symptom: List[CauseAnalysisItem]
    sufficiency_details: Optional[SufficiencyItem]
    unverified_claims: List[str]
    total_hops: int
    total_documents_retrieved: int


# ────────────────────────────────────────────────────────────────
# Routes
# ────────────────────────────────────────────────────────────────

@app.post("/investigate", response_model=InvestigateResponse)
async def investigate(req: InvestigateRequest):
    """
    Run a full multi-hop investigation against the document store.
    Returns a cited answer with full hop trace.
    """
    if not retriever or not investigation_agent or not evidence_agent:
        raise HTTPException(status_code=503, detail="System not ready — index still building")

    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        # Run investigation
        state = await investigation_agent.investigate(question)

        # Run evidence reasoning
        final = await evidence_agent.reason(state)
    except Exception as e:
        logger.error(f"Investigation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # Build hop trace for frontend
    trace: List[HopTraceItem] = []
    for hop in state.hops:
        results = [
            HopResultItem(
                document_id=r.document.document_id,
                title=r.document.title,
                type=r.document.type,
                service=r.document.service,
                date=r.document.date,
                version=r.document.version,
                similarity_score=r.similarity_score,
                matched_filters=r.matched_filters,
                triggered_by_entity=r.triggered_by_entity,
                triggered_by_doc_id=r.triggered_by_doc_id,
                content_snippet=r.document.content[:300],
            )
            for r in hop.results
        ]
        trace.append(HopTraceItem(
            hop_number=hop.hop_number,
            query=hop.query,
            filters_applied=hop.filters_applied,
            triggered_by_entity=hop.triggered_by_entity,
            triggered_by_doc_id=hop.triggered_by_doc_id,
            results=results,
        ))

    return InvestigateResponse(
        verdict=final.verdict,
        answer=final.answer,
        citations=[CitationItem(**c) for c in final.citations],
        investigation_trace=trace,
        contradiction_flags=[
            ContradictionFlagItem(
                doc_id_1=f.doc_id_1,
                doc_id_2=f.doc_id_2,
                relationship=f.relationship,
                reasoning=f.reasoning,
                date_1=f.date_1,
                date_2=f.date_2,
            )
            for f in final.contradiction_flags
        ],
        cause_vs_symptom=[
            CauseAnalysisItem(
                doc_id_1=a.doc_id_1,
                doc_id_2=a.doc_id_2,
                symptom_match=a.symptom_match,
                cause_match=a.cause_match,
                cause_summary_1=a.cause_summary_1,
                cause_summary_2=a.cause_summary_2,
                verdict=a.verdict,
            )
            for a in final.cause_vs_symptom
        ],
        sufficiency_details=SufficiencyItem(
            is_sufficient=final.sufficiency_details.is_sufficient,
            reason=final.sufficiency_details.reason,
            doc_count=final.sufficiency_details.doc_count,
            max_score=final.sufficiency_details.max_score,
            service_match=final.sufficiency_details.service_match,
            cause_verified=final.sufficiency_details.cause_verified,
        ) if final.sufficiency_details else None,
        unverified_claims=final.unverified_claims,
        total_hops=len(state.hops),
        total_documents_retrieved=len(state.all_evidence),
    )


@app.get("/documents")
async def list_documents():
    """Return all documents in the store — for judge inspection."""
    if not retriever:
        raise HTTPException(status_code=503, detail="System not ready")
    return {
        "count": len(retriever.documents),
        "documents": [
            {
                "document_id": d.document_id,
                "type": d.type,
                "service": d.service,
                "date": d.date,
                "version": d.version,
                "title": d.title,
                "content_preview": d.content[:200],
            }
            for d in retriever.documents
        ],
    }


@app.get("/health")
async def health():
    """System health and readiness check."""
    ready = retriever is not None and retriever._ready
    return {
        "status": "ok" if ready else "starting",
        "doc_count": len(retriever.documents) if retriever else 0,
        "index_ready": ready,
        "index_size": retriever.index.ntotal if ready else 0,
    }


@app.get("/gemini-logs")
async def get_gemini_logs(limit: int = 50):
    """View recent Gemini API call logs."""
    from api_logger import LOG_FILE
    if not LOG_FILE.exists():
        return {"total_logged": 0, "log_file": str(LOG_FILE), "recent_logs": []}
    try:
        with open(LOG_FILE, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]
        return {
            "total_logged": len(lines),
            "log_file": str(LOG_FILE),
            "recent_logs": lines[-limit:],
        }
    except Exception as e:
        return {"error": str(e)}


# ────────────────────────────────────────────────────────────────
# Combined Frontend Mounting (Single-Host Mode)
# ────────────────────────────────────────────────────────────────
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/")
    async def serve_root():
        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return {"message": "Frontend built files not found. Run 'npm run build' in frontend/."}

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Do not hijack API or OpenAPI documentation routes
        if full_path in ("investigate", "documents", "health", "gemini-logs", "docs", "openapi.json", "redoc"):
            raise HTTPException(status_code=404, detail="API route not found")
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(status_code=404, detail="File not found")

