"""
llm_client.py — Multi-provider LLM client with 3-tier fallback architecture:

1. Primary: Google Gemini (AIzaSy & fresh keys, gemini-2.5-flash ~1.2s response time)
2. Secondary: Featherless AI (6 rotating keys with concurrency control)
3. Offline Fallback: Local Ollama (http://localhost:11434 with gemma4:e2b)

Embeddings: gemini-embedding-001 with local FAISS disk cache.
"""
import asyncio
import json
import logging
import re
import time
from typing import Any, Optional

import httpx
from google import genai
from google.genai import types

from config import (
    GEMINI_KEYS,
    GEMINI_API_VERSION,
    FEATHERLESS_KEYS,
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
)
from api_logger import log_gemini_call

logger = logging.getLogger(__name__)

# Primary: Gemini Models
GEMINI_MODELS = ["gemini-2.5-flash", "gemini-3.5-flash"]

# Secondary: Featherless Models
FEATHERLESS_MODELS = [
    "Qwen/Qwen2.5-7B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
]
FEATHERLESS_URL = "https://api.featherless.ai/v1/chat/completions"

# Key rotation state
_gemini_key_index = 0
_gemini_lock = asyncio.Lock()

_featherless_key_index = 0
_featherless_key_lock = asyncio.Lock()
_featherless_concurrency_lock = asyncio.Lock()


class LLMUnavailableError(Exception):
    pass


# ── Key Rotators ─────────────────────────────────────────────────────────────

async def _next_gemini_key() -> tuple[str, int]:
    global _gemini_key_index
    async with _gemini_lock:
        idx = _gemini_key_index % len(GEMINI_KEYS)
        key = GEMINI_KEYS[idx]
        _gemini_key_index += 1
        return key, idx


async def _next_featherless_key() -> tuple[str, int]:
    global _featherless_key_index
    async with _featherless_key_lock:
        idx = _featherless_key_index % len(FEATHERLESS_KEYS)
        key = FEATHERLESS_KEYS[idx]
        _featherless_key_index += 1
        return key, idx


def _get_gemini_client(key: str) -> genai.Client:
    return genai.Client(api_key=key, http_options={"api_version": GEMINI_API_VERSION})


# ── 1. PRIMARY: Gemini Caller ────────────────────────────────────────────────

async def _call_gemini(prompt: str, system: str = "") -> Optional[str]:
    """Execute primary chat completion using Gemini with key and model rotation."""
    if not GEMINI_KEYS:
        return None

    config = types.GenerateContentConfig(
        temperature=0.1,
        max_output_tokens=4096,
    )
    full_content = (
        f"[SYSTEM INSTRUCTIONS]\n{system}\n\n[TASK]\n{prompt}"
        if system else prompt
    )

    loop = asyncio.get_event_loop()
    max_attempts = len(GEMINI_KEYS)

    for attempt in range(max_attempts):
        key, key_idx = await _next_gemini_key()
        client = _get_gemini_client(key)

        for model_name in GEMINI_MODELS:
            start_time = time.time()
            try:
                response = await loop.run_in_executor(
                    None,
                    lambda m=model_name: client.models.generate_content(
                        model=m,
                        contents=full_content,
                        config=config,
                    )
                )
                duration = time.time() - start_time
                text = response.text or ""
                if text:
                    log_gemini_call(
                        call_type="LLM_GENERATE",
                        model=model_name,
                        key=key,
                        key_idx=key_idx,
                        prompt_or_input=prompt[:150],
                        duration_sec=duration,
                        status="SUCCESS",
                        output_summary=f"output_len={len(text)} chars",
                        provider="Gemini",
                    )
                    return text
            except Exception as e:
                duration = time.time() - start_time
                err_str = str(e).lower()
                is_rate_limit = "429" in err_str or "quota" in err_str or "resource_exhausted" in err_str
                is_temp_unavailable = "503" in err_str or "unavailable" in err_str
                is_not_found = "404" in err_str or "not_found" in err_str

                status = "RETRY_429" if is_rate_limit else ("TEMP_503" if is_temp_unavailable else "FAILED")
                log_gemini_call(
                    call_type="LLM_GENERATE",
                    model=model_name,
                    key=key,
                    key_idx=key_idx,
                    prompt_or_input=prompt[:150],
                    duration_sec=duration,
                    status=status,
                    error_msg=str(e)[:120],
                    provider="Gemini",
                )

                if is_not_found or is_temp_unavailable:
                    continue  # Try next model
                elif is_rate_limit:
                    break  # Try next key
                else:
                    break

        await asyncio.sleep(0.2)

    return None


# ── 2. SECONDARY: Featherless AI Caller ──────────────────────────────────────

async def _call_featherless(prompt: str, system: str = "") -> Optional[str]:
    """Execute fallback chat completion using Featherless AI with concurrency lock."""
    if not FEATHERLESS_KEYS:
        return None

    # Enforce concurrency lock so requests don't hit Featherless concurrency limit = 1
    try:
        await asyncio.wait_for(_featherless_concurrency_lock.acquire(), timeout=3.0)
    except asyncio.TimeoutError:
        logger.info("Featherless concurrency lock busy, continuing to offline fallback")
        return None

    try:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload_base = {
            "temperature": 0.1,
            "max_tokens": 4096,
            "messages": messages,
        }

        max_attempts = min(len(FEATHERLESS_KEYS), 6)

        async with httpx.AsyncClient(timeout=25.0) as client:
            for attempt in range(max_attempts):
                key, key_idx = await _next_featherless_key()
                headers = {
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                }

                for model_name in FEATHERLESS_MODELS:
                    start_time = time.time()
                    payload = {**payload_base, "model": model_name}
                    try:
                        resp = await client.post(FEATHERLESS_URL, headers=headers, json=payload)
                        duration = time.time() - start_time

                        if resp.status_code == 200:
                            data = resp.json()
                            content = data["choices"][0]["message"]["content"]
                            log_gemini_call(
                                call_type="LLM_GENERATE",
                                model=model_name,
                                key=key,
                                key_idx=key_idx,
                                prompt_or_input=prompt[:150],
                                duration_sec=duration,
                                status="SUCCESS",
                                output_summary=f"output_len={len(content)} chars",
                                provider="Featherless",
                            )
                            return content
                        else:
                            err_text = resp.text[:120]
                            status = "RETRY_429" if resp.status_code == 429 else "FAILED"
                            log_gemini_call(
                                call_type="LLM_GENERATE",
                                model=model_name,
                                key=key,
                                key_idx=key_idx,
                                prompt_or_input=prompt[:150],
                                duration_sec=duration,
                                status=status,
                                error_msg=f"HTTP {resp.status_code}: {err_text}",
                                provider="Featherless",
                            )
                            if resp.status_code == 429:
                                break  # Try next key
                            continue

                    except Exception as e:
                        duration = time.time() - start_time
                        log_gemini_call(
                            call_type="LLM_GENERATE",
                            model=model_name,
                            key=key,
                            key_idx=key_idx,
                            prompt_or_input=prompt[:150],
                            duration_sec=duration,
                            status="FAILED",
                            error_msg=str(e)[:120],
                            provider="Featherless",
                        )
                        continue

                await asyncio.sleep(0.2)

        return None
    finally:
        if _featherless_concurrency_lock.locked():
            _featherless_concurrency_lock.release()


# ── 3. SILENT OFFLINE FALLBACK: Local Ollama ─────────────────────────────────

async def _call_ollama(prompt: str, system: str = "") -> Optional[str]:
    """Execute silent offline fallback call to local Ollama server."""
    full_prompt = f"{system}\n\n{prompt}" if system else prompt
    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": full_prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_ctx": 4096},
                }
            )
            duration = time.time() - start_time
            if resp.status_code == 200:
                content = resp.json().get("response", "")
                if content:
                    log_gemini_call(
                        call_type="LLM_GENERATE",
                        model=OLLAMA_MODEL,
                        key="local_ollama",
                        key_idx=0,
                        prompt_or_input=prompt[:150],
                        duration_sec=duration,
                        status="SUCCESS",
                        output_summary=f"output_len={len(content)} chars",
                        provider="Ollama (Offline)",
                    )
                    return content
    except Exception as e:
        duration = time.time() - start_time
        log_gemini_call(
            call_type="LLM_GENERATE",
            model=OLLAMA_MODEL,
            key="local_ollama",
            key_idx=0,
            prompt_or_input=prompt[:150],
            duration_sec=duration,
            status="FAILED",
            error_msg=str(e)[:120],
            provider="Ollama (Offline)",
        )
    return None


# ── Unified Public Interface ─────────────────────────────────────────────────

async def chat(prompt: str, system: str = "") -> str:
    """
    1. Primary: Google Gemini (gemini-2.5-flash ~1.2s response time)
    2. Secondary: Featherless AI (Qwen2.5-7B across 6 keys)
    3. Silent Offline Fallback: Local Ollama (gemma4:e2b)
    """
    # Tier 1: Gemini Primary
    gemini_result = await _call_gemini(prompt, system=system)
    if gemini_result is not None:
        return gemini_result

    # Tier 2: Featherless AI Secondary
    logger.warning("Gemini keys unavailable or rate limited; falling back to Featherless AI...")
    featherless_result = await _call_featherless(prompt, system=system)
    if featherless_result is not None:
        return featherless_result

    # Tier 3: Local Ollama Silent Offline Fallback
    logger.warning("Cloud providers unavailable; falling back to silent local Ollama...")
    ollama_result = await _call_ollama(prompt, system=system)
    if ollama_result is not None:
        return ollama_result

    raise LLMUnavailableError(
        "All Primary (Gemini), Secondary (Featherless AI), and Local Offline (Ollama) providers failed."
    )


async def chat_json(prompt: str, system: str = "") -> dict[str, Any]:
    """Call LLM and parse response as JSON. Strips markdown fences and preamble."""
    raw = await chat(prompt, system=system)
    text = raw.strip()

    # 1. Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Extract from markdown code block ```json ... ``` or ``` ... ```
    code_block = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if code_block:
        try:
            return json.loads(code_block.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 3. Extract substring between first '{' and last '}'
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        snippet = text[first_brace:last_brace + 1]
        try:
            return json.loads(snippet)
        except json.JSONDecodeError:
            pass

    logger.error(f"JSON parse failed. Raw:\n{raw[:300]}")
    raise ValueError(f"LLM returned invalid JSON: {raw[:150]}")
