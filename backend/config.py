"""
config.py — Loads all environment variables. Single source of truth for settings.
"""
import os
import pathlib
from dotenv import load_dotenv

load_dotenv()

def _get_gemini_keys() -> list[str]:
    """Collect all non-empty active Gemini API keys from environment."""
    raw_keys = [os.getenv("GEMINI_API_KEY", "")] + [
        os.getenv(f"GEMINI_API_KEY_{i}", "") for i in range(2, 11)
    ]
    keys = [k.strip() for k in raw_keys if k.strip()]
    return keys

def _get_featherless_keys() -> list[str]:
    """Collect all non-empty Featherless API keys from environment."""
    raw_keys = [
        os.getenv(f"FEATHERLESS_API_KEY_{i}", "")
        for i in range(1, 11)
    ]
    return [k.strip() for k in raw_keys if k.strip()]

GEMINI_KEYS: list[str] = _get_gemini_keys()
FEATHERLESS_KEYS: list[str] = _get_featherless_keys()

OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "gemma4:e2b")

EMBEDDING_MODEL: str = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")
GEMINI_API_VERSION: str = os.getenv("GEMINI_API_VERSION", "v1")

# Retrieval settings
RETRIEVAL_TOP_N: int = int(os.getenv("RETRIEVAL_TOP_N", "8"))
SIMILARITY_FLOOR: float = float(os.getenv("SIMILARITY_FLOOR", "0.55"))
MAX_HOPS: int = int(os.getenv("MAX_HOPS", "3"))

# Sufficiency thresholds (rule-based, not LLM)
SUFFICIENCY_MIN_DOCS: int = int(os.getenv("SUFFICIENCY_MIN_DOCS", "2"))
SUFFICIENCY_MIN_SCORE: float = float(os.getenv("SUFFICIENCY_MIN_SCORE", "0.65"))

# Path to document store
DATA_DIR = pathlib.Path(__file__).parent / "data"
DOCUMENTS_PATH = DATA_DIR / "documents.json"
