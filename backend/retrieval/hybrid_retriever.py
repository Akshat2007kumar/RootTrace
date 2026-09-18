"""
hybrid_retriever.py — FAISS + explicit metadata filtering.

NO LLM calls here. This is a pure function the Investigation Agent uses as a tool.

Every returned document carries a FULL retrieval trace:
  - which metadata filters matched
  - the cosine similarity score
  - which entity (from a prior hop) triggered this search

This trace is kept all the way to the frontend so judges can see exactly
WHY each document was surfaced.
"""
import json
import logging
from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional, Dict, Any

import faiss
import numpy as np

from config import DOCUMENTS_PATH, RETRIEVAL_TOP_N, SIMILARITY_FLOOR
from retrieval.embeddings import embed_texts_sync, embed_query_sync

logger = logging.getLogger(__name__)


@dataclass
class Document:
    document_id: str
    type: str
    service: Optional[str]
    date: Optional[str]
    version: Optional[str]
    title: str
    content: str
    raw: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RetrievalResult:
    document: Document
    similarity_score: float
    matched_filters: List[str]          # e.g. ["service=orders-api", "type=incident_report"]
    triggered_by_entity: Optional[str]  # None for hop-1; entity string for follow-up hops
    triggered_by_doc_id: Optional[str]  # which doc in a prior hop triggered this search


class HybridRetriever:
    """
    Builds an in-memory FAISS index at startup.
    All metadata filtering is done explicitly in Python — fully transparent.
    """

    def __init__(self):
        self.documents: List[Document] = []
        self.index: Optional[faiss.Index] = None
        self._ready = False

    def build_index(self):
        """Load documents.json and build FAISS index. Called once at startup."""
        logger.info(f"Loading documents from {DOCUMENTS_PATH}")
        with open(DOCUMENTS_PATH, "r", encoding="utf-8") as f:
            raw_docs = json.load(f)

        self.documents = [
            Document(
                document_id=d["document_id"],
                type=d.get("type", "unknown"),
                service=d.get("service"),
                date=d.get("date"),
                version=d.get("version"),
                title=d.get("title", ""),
                content=d.get("content", ""),
                raw=d,
            )
            for d in raw_docs
        ]
        logger.info(f"Loaded {len(self.documents)} documents")

        # Embed all documents (with local disk cache to avoid redundant API quota/latency)
        import hashlib
        cache_file = DOCUMENTS_PATH.parent / "embeddings_cache.npy"
        cache_hash_file = DOCUMENTS_PATH.parent / "embeddings_cache.hash"

        doc_bytes = json.dumps(raw_docs, sort_keys=True).encode("utf-8")
        current_hash = hashlib.sha256(doc_bytes).hexdigest()

        loaded = False
        if cache_file.exists() and cache_hash_file.exists():
            try:
                with open(cache_hash_file, "r") as hf:
                    saved_hash = hf.read().strip()
                if saved_hash == current_hash:
                    embeddings = np.load(cache_file)
                    if len(embeddings) == len(self.documents):
                        logger.info(f"Loaded {len(embeddings)} embeddings from local disk cache")
                        loaded = True
            except Exception as e:
                logger.warning(f"Could not load cache: {e}")

        if not loaded:
            texts = [f"{doc.title}. {doc.content}" for doc in self.documents]
            embeddings = embed_texts_sync(texts, task_type="retrieval_document")
            try:
                np.save(cache_file, embeddings)
                with open(cache_hash_file, "w") as hf:
                    hf.write(current_hash)
                logger.info(f"Saved {len(embeddings)} embeddings to cache")
            except Exception as e:
                logger.warning(f"Could not save cache: {e}")

        # Build FAISS index (IndexFlatIP = inner product = cosine similarity on normalized vecs)
        dim = embeddings.shape[1]
        self.index = faiss.IndexFlatIP(dim)
        self.index.add(embeddings)
        self._ready = True
        logger.info(f"FAISS index built: {self.index.ntotal} vectors, dim={dim}")

    def _apply_metadata_filters(
        self,
        filters: Dict[str, Any],
    ) -> tuple[List[int], List[str]]:
        """
        Apply metadata filters to narrow candidate document indices.
        Returns (filtered_indices, list of filter descriptions that matched).
        """
        candidates = list(range(len(self.documents)))
        applied_filters = []

        def _norm_svc(s: Optional[str]) -> str:
            if not s:
                return ""
            return s.lower().replace("-", "").replace("_", "").replace(" ", "").rstrip("s")

        service = filters.get("service")
        if service:
            norm_q = _norm_svc(service)
            svc_candidates = [
                i for i in candidates
                if self.documents[i].service
                and (norm_q in _norm_svc(self.documents[i].service) or _norm_svc(self.documents[i].service) in norm_q)
            ]
            if svc_candidates:
                candidates = svc_candidates
                applied_filters.append(f"service={service}")
            else:
                logger.info(f"Service filter '{service}' yielded 0 docs; relaxing filter")

        doc_types = filters.get("types")
        if doc_types:
            type_candidates = [
                i for i in candidates
                if self.documents[i].type in doc_types
            ]
            if type_candidates:
                candidates = type_candidates
                applied_filters.append(f"type in {doc_types}")
            else:
                logger.info(f"Type filter '{doc_types}' yielded 0 docs; relaxing filter")

        date_from = filters.get("date_from")
        if date_from:
            try:
                df = date.fromisoformat(date_from)
                candidates = [
                    i for i in candidates
                    if self.documents[i].date and date.fromisoformat(self.documents[i].date) >= df
                ]
                applied_filters.append(f"date>={date_from}")
            except ValueError:
                pass

        date_to = filters.get("date_to")
        if date_to:
            try:
                dt = date.fromisoformat(date_to)
                candidates = [
                    i for i in candidates
                    if self.documents[i].date and date.fromisoformat(self.documents[i].date) <= dt
                ]
                applied_filters.append(f"date<={date_to}")
            except ValueError:
                pass

        version = filters.get("version")
        if version:
            candidates = [
                i for i in candidates
                if self.documents[i].version and version in self.documents[i].version
            ]
            applied_filters.append(f"version={version}")

        doc_ids = filters.get("document_ids")
        if doc_ids:
            candidates = [
                i for i in candidates
                if self.documents[i].document_id in doc_ids
            ]
            applied_filters.append(f"doc_ids={doc_ids}")

        # If strict filtering eliminated everything, fall back to all candidates
        if not candidates:
            candidates = list(range(len(self.documents)))
            applied_filters.append("fallback=all")

        return candidates, applied_filters

    def retrieve(
        self,
        query: str,
        filters: Optional[Dict[str, Any]] = None,
        top_n: int = RETRIEVAL_TOP_N,
        triggered_by_entity: Optional[str] = None,
        triggered_by_doc_id: Optional[str] = None,
    ) -> List[RetrievalResult]:
        """
        Main retrieval function.
        1. Apply metadata filters → candidate pool
        2. Embed query → FAISS cosine search on candidates
        3. Return top-N above SIMILARITY_FLOOR with full trace attached
        """
        if not self._ready:
            raise RuntimeError("HybridRetriever.build_index() must be called first")

        filters = filters or {}
        candidate_indices, matched_filters = self._apply_metadata_filters(filters)

        logger.info(
            f"Retrieval | query='{query[:60]}' | filters={matched_filters} "
            f"| candidates={len(candidate_indices)} | triggered_by='{triggered_by_entity}'"
        )

        if not candidate_indices:
            logger.warning("No candidates after metadata filtering")
            return []

        # Embed the query
        query_vec = embed_query_sync(query).reshape(1, -1)

        # If filters narrowed the set, do a selective search
        if len(candidate_indices) < len(self.documents):
            # Extract candidate embeddings
            candidate_matrix = np.vstack([
                self.index.reconstruct(i) for i in candidate_indices
            ])
            scores = (candidate_matrix @ query_vec.T).squeeze()
            if scores.ndim == 0:
                scores = np.array([float(scores)])
            top_k = min(top_n, len(candidate_indices))
            top_local_indices = np.argsort(scores)[::-1][:top_k]
            results = []
            for local_idx in top_local_indices:
                score = float(scores[local_idx])
                if score < SIMILARITY_FLOOR:
                    continue
                doc_idx = candidate_indices[local_idx]
                doc = self.documents[doc_idx]
                result = RetrievalResult(
                    document=doc,
                    similarity_score=round(score, 4),
                    matched_filters=matched_filters,
                    triggered_by_entity=triggered_by_entity,
                    triggered_by_doc_id=triggered_by_doc_id,
                )
                results.append(result)
                logger.info(
                    f"  → {doc.document_id} | score={score:.3f} | "
                    f"filters={matched_filters} | triggered_by='{triggered_by_entity}'"
                )
        else:
            # No filters applied — search full index
            scores_full, indices_full = self.index.search(query_vec, top_n)
            results = []
            for score, idx in zip(scores_full[0], indices_full[0]):
                if idx < 0:
                    continue
                score = float(score)
                if score < SIMILARITY_FLOOR:
                    continue
                doc = self.documents[idx]
                result = RetrievalResult(
                    document=doc,
                    similarity_score=round(score, 4),
                    matched_filters=[],
                    triggered_by_entity=triggered_by_entity,
                    triggered_by_doc_id=triggered_by_doc_id,
                )
                results.append(result)
                logger.info(
                    f"  → {doc.document_id} | score={score:.3f} | "
                    f"no-filter search | triggered_by='{triggered_by_entity}'"
                )

        logger.info(f"Retrieved {len(results)} documents above score floor {SIMILARITY_FLOOR}")
        return results


# Module-level singleton — built once at startup
_retriever_instance: Optional[HybridRetriever] = None


def get_retriever() -> HybridRetriever:
    global _retriever_instance
    if _retriever_instance is None:
        _retriever_instance = HybridRetriever()
        _retriever_instance.build_index()
    return _retriever_instance
