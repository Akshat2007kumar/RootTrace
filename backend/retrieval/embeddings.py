"""
embeddings.py — Gemini embedding client using google-genai SDK (v2).
Model name ALWAYS read from config.EMBEDDING_MODEL (env var). Never hardcoded.
API version read from config.GEMINI_API_VERSION (env var, default: v1).

Rate limit handling:
- Rotates through all 4 API keys per batch to spread quota usage
- Retries with exponential backoff on 429
"""
import asyncio
import logging
import time
from typing import List

import numpy as np
from google import genai

from config import GEMINI_KEYS, EMBEDDING_MODEL, GEMINI_API_VERSION
from api_logger import log_gemini_call

logger = logging.getLogger(__name__)


def _make_client(key: str) -> genai.Client:
    return genai.Client(api_key=key, http_options={"api_version": GEMINI_API_VERSION})


def _normalize(vec) -> np.ndarray:
    arr = np.array(vec, dtype=np.float32)
    norm = np.linalg.norm(arr)
    return arr / norm if norm > 0 else arr


def embed_texts_sync(texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> np.ndarray:
    """
    Embed a list of texts synchronously. Returns L2-normalized (n, dim) array.
    Rotates API keys per batch and retries on 429.
    """
    embeddings = []
    batch_size = 100

    for i in range(0, len(texts), batch_size):
        batch = texts[i: i + batch_size]
        batch_num = i // batch_size + 1
        key_idx = batch_num % len(GEMINI_KEYS)
        key = GEMINI_KEYS[key_idx]
        client = _make_client(key)

        for retry in range(8):
            start_time = time.time()
            try:
                result = client.models.embed_content(
                    model=EMBEDDING_MODEL,
                    contents=batch,
                    config={"task_type": task_type},
                )
                for emb in result.embeddings:
                    embeddings.append(_normalize(emb.values))
                duration = time.time() - start_time
                log_gemini_call(
                    call_type="EMBED_BATCH",
                    model=EMBEDDING_MODEL,
                    key=key,
                    key_idx=key_idx,
                    prompt_or_input=f"Batch {batch_num}: {len(batch)} texts",
                    duration_sec=duration,
                    status="SUCCESS",
                    output_summary=f"dim={len(result.embeddings[0].values)} count={len(result.embeddings)}",
                )
                logger.info(f"Embedded batch {batch_num} ({len(batch)} texts) with key #{key_idx + 1}")
                # Inter-batch pause to respect rate limits
                if i + batch_size < len(texts):
                    time.sleep(10)
                break
            except Exception as e:
                duration = time.time() - start_time
                err_str = str(e)
                is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                log_gemini_call(
                    call_type="EMBED_BATCH",
                    model=EMBEDDING_MODEL,
                    key=key,
                    key_idx=key_idx,
                    prompt_or_input=f"Batch {batch_num}: {len(batch)} texts",
                    duration_sec=duration,
                    status="RETRY_429" if is_rate_limit else "FAILED",
                    error_msg=err_str[:120],
                )
                if is_rate_limit:
                    # Try next key before sleeping
                    key_idx = (batch_num + retry + 1) % len(GEMINI_KEYS)
                    key = GEMINI_KEYS[key_idx]
                    client = _make_client(key)
                    wait = 10 * (retry + 1)
                    logger.warning(
                        f"Rate limit on batch {batch_num} (retry {retry+1}/8), "
                        f"switching to key #{key_idx}, waiting {wait}s"
                    )
                    time.sleep(wait)
                else:
                    raise

    return np.array(embeddings, dtype=np.float32)


def embed_query_sync(query: str) -> np.ndarray:
    """Embed a single query string with RETRIEVAL_QUERY task type."""
    start_time = time.time()
    key = GEMINI_KEYS[0]
    client = _make_client(key)
    try:
        result = client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=query,
            config={"task_type": "RETRIEVAL_QUERY"},
        )
        duration = time.time() - start_time
        vec = _normalize(result.embeddings[0].values)
        log_gemini_call(
            call_type="EMBED_QUERY",
            model=EMBEDDING_MODEL,
            key=key,
            key_idx=0,
            prompt_or_input=query[:120],
            duration_sec=duration,
            status="SUCCESS",
            output_summary=f"dim={len(vec)}",
        )
        return vec
    except Exception as e:
        duration = time.time() - start_time
        log_gemini_call(
            call_type="EMBED_QUERY",
            model=EMBEDDING_MODEL,
            key=key,
            key_idx=0,
            prompt_or_input=query[:120],
            duration_sec=duration,
            status="FAILED",
            error_msg=str(e)[:120],
        )
        raise


async def embed_query(query: str) -> np.ndarray:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, embed_query_sync, query)
