"""
api_logger.py — Centralized audit log for all Gemini API requests.
Logs every call (LLM generation, query embedding, batch embedding),
timestamp, key index, latency, status, and input snippet to:
  1. backend/gemini_api_calls.log
  2. Standard application console output
"""
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

LOG_FILE = Path(__file__).resolve().parent / "gemini_api_calls.log"

logger = logging.getLogger("gemini_audit")


def mask_key(key: str) -> str:
    """Mask key for safe logging (shows first 7 and last 4 chars)."""
    if not key or len(key) < 12:
        return "***"
    return f"{key[:7]}...{key[-4:]}"


def log_gemini_call(
    call_type: str,
    model: str,
    key: str,
    key_idx: int,
    prompt_or_input: str,
    duration_sec: float,
    status: str,
    output_summary: str = "",
    error_msg: str = "",
    provider: str = "Gemini",
):
    """Write an entry to gemini_api_calls.log and console."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    masked = mask_key(key)
    snippet = prompt_or_input.replace("\n", " ").strip()
    if len(snippet) > 120:
        snippet = snippet[:117] + "..."

    log_entry = (
        f"[{now}] [{status:7s}] [{provider:11s}] {call_type:<12s} | Model: {model:<24s} | "
        f"Key #{key_idx + 1} ({masked}) | {duration_sec:5.2f}s | Input: \"{snippet}\""
    )

    if output_summary:
        log_entry += f" | {output_summary}"
    if error_msg:
        log_entry += f" | Error: {error_msg}"

    # Log to logger
    if status == "SUCCESS":
        logger.info(log_entry)
    elif status == "RETRY_429":
        logger.warning(log_entry)
    else:
        logger.error(log_entry)

    # Append to file
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(log_entry + "\n")
    except Exception as e:
        logger.error(f"Failed writing to gemini_api_calls.log: {e}")
