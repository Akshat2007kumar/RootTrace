# RootTrace — Failed Test Cases & Bug Fixes

> Regression log from testing session on **2026-09-19**.

---

## Bug #1 — LLM Hallucination for Unknown Service

### Test Case
**Input question:**
```
What caused the latency spike in the user-billing service during the October 2026 database migration, and which runbook applies?
```

### Symptom (Before Fix)
The model returned a **fabricated full RCA** — inventing document IDs that do not exist in the knowledge base:
- Cited `DEP-885` as a "database migration deployment"
- Cited `INC-1061` as a "user-billing latency incident"
- Generated a runbook reference that was entirely made up

`verdict: ANSWERED` with confident, specific citations — all hallucinated.

### Root Cause
Three holes in the pipeline allowed synthesis to proceed on zero valid evidence:

1. **`_check_sufficiency_stub()` never used `service_match` flag** — the flag was computed but never acted on. Even if no retrieved doc matched the queried service, the LLM synthesis step still ran.
2. **`SUFFICIENCY_MIN_DOCS=2` was too low** — 2 loosely-related docs from unrelated services could pass the gate.
3. **`_FINAL_ANSWER_SYSTEM` prompt had no hard rule** blocking synthesis when the service is unknown.

### Files Changed
| File | Change |
|------|--------|
| [`evidence_reasoning_agent.py`](file:///c:/Users/aditi/OneDrive/Desktop/RootTrace/RootTrace/backend/agents/evidence_reasoning_agent.py) | Added service-match gate in `_check_sufficiency_stub()` — returns `INSUFFICIENT_EVIDENCE` immediately if no doc belongs to the queried service |
| [`evidence_reasoning_agent.py`](file:///c:/Users/aditi/OneDrive/Desktop/RootTrace/RootTrace/backend/agents/evidence_reasoning_agent.py) | Added fast-exit in `reason()` when `evidence=[]`, with service-specific message |
| [`evidence_reasoning_agent.py`](file:///c:/Users/aditi/OneDrive/Desktop/RootTrace/RootTrace/backend/agents/evidence_reasoning_agent.py) | Added rules 7, 8, 9 to `_FINAL_ANSWER_SYSTEM` prompt — hard blocks on unknown-service synthesis and invented citations |
| [`config.py`](file:///c:/Users/aditi/OneDrive/Desktop/RootTrace/RootTrace/backend/config.py) | Raised `SIMILARITY_FLOOR` from `0.55` → `0.60`; raised `SUFFICIENCY_MIN_SCORE` from `0.65` → `0.72` |

### Expected Output (After Fix)
```json
{
  "verdict": "INSUFFICIENT_EVIDENCE",
  "answer": "No documents exist for service 'user-billing' in the knowledge base...",
  "citations": [],
  "sufficiency_details": {
    "doc_count": 0,
    "service_match": false
  }
}
```
**Status: ✅ Fixed & Verified**

---

## Bug #2 — Date Filter Exact-Match Returns 0 Documents

### Test Case
**Input question:**
```
What caused the latency spike in orders-api on 2025-11-15?
```

### Symptom (Before Fix)
```
Insufficient Evidence — 1 hop · 0 documents retrieved
Reason: No documents were retrieved. No documents exist for service 'orders-api' in the knowledge base.
service_match=false, docs=0, max_score=0.000
```
`orders-api` has **47 documents** in the knowledge base — the retriever was returning zero despite the service clearly existing.

### Root Cause
**Two-part bug — same code duplicated in two files:**

When the LLM entity extractor pulled `"date": "2025-11-15"` from the question, the filter builder in both `graph.py` and `investigation_agent.py` set:
```python
filters["date_from"] = "2025-11-15"
filters["date_to"]   = "2025-11-15"   # ← exact match, not a range
```
The date filter then eliminated **every** orders-api document because none are stamped exactly `2025-11-15`. Combined with `service=orders-api`, zero candidates survived.

**Secondary issue discovered:** `graph.py` has its own independent copy of the filter logic — fixing `investigation_agent.py` alone had no effect because `graph.py` (the LangGraph orchestrator) is the actual execution path. The first fix was applied to the wrong file.

### Files Changed
| File | Change |
|------|--------|
| [`graph.py`](file:///c:/Users/aditi/OneDrive/Desktop/RootTrace/RootTrace/backend/agents/graph.py) | Fixed `entity_extraction_node()`: single date now creates a **±30-day window** (`date_from = date - 30 days`, `date_to = date + 30 days`) instead of exact match |
| [`graph.py`](file:///c:/Users/aditi/OneDrive/Desktop/RootTrace/RootTrace/backend/agents/graph.py) | `doc_types_hint` filter suppressed when a date filter is active — double-filtering on a small corpus leaves 0 candidates |
| [`investigation_agent.py`](file:///c:/Users/aditi/OneDrive/Desktop/RootTrace/RootTrace/backend/agents/investigation_agent.py) | Same ±30-day fix applied to `_entities_to_filters()` (fallback path) |

### Before vs After (filter applied for "2025-11-15")

| | Before | After |
|--|--------|-------|
| `date_from` | `2025-11-15` | `2025-10-16` |
| `date_to` | `2025-11-15` | `2025-12-15` |
| Candidates found | `0` | All orders-api docs in window |

### Additional Finding
After the fix, verified that `"2025-11-15"` **genuinely has no orders-api documents** in the knowledge base — the nearest docs are:
- `INC-1043` — `2025-08-22` (TLS failure)
- `INC-1044` — `2024-11-14` (memory leak)

The **correct test question** for a full `ANSWERED` response is:
```
What caused the latency spike in orders-api on September 16, 2026?
```
This maps to `INC-1042` (2026-09-16), `DEP-882` (2026-09-15), `PM-216` (2026-09-19).

**Status: ✅ Fixed (INSUFFICIENT_EVIDENCE is now correct for Nov 2025 — no docs exist for that date)**

---

## Commit

All fixes landed in commit `5041d7e`:
```
fix: hallucination guard + date filter bug fixes
8 files changed, 226 insertions(+), 71 deletions(-)
```

---

## Lessons Learned

| # | Lesson |
|---|--------|
| 1 | **Duplicate logic = duplicate bugs.** `graph.py` and `investigation_agent.py` both owned filter-building code. A fix in one file had zero effect. Filter logic must live in one place. |
| 2 | **Specific dates in questions must never become exact-match filters** on a document store — use a search window instead. |
| 3 | **`service_match` must gate synthesis, not just be computed.** Computing a flag and ignoring it is worse than useless. |
| 4 | **Test cases must be grounded in actual KB dates.** TC-1 expected `INC-1042` (Sep 2026) for a Nov 2025 question — the expected output was wrong before the KB was inspected. |
