# RootTrace — Incident Investigation Agent
**Team: DeadKeys | Agentic AI Hackathon**

> Multi-hop agentic investigation across internal operational documents — with real follow-up search, contradiction detection, cause-vs-symptom comparison, and rule-based sufficiency gating.

---

## Quick Start

### 1. API Keys
```
# .env is already created — fill in your keys:
GEMINI_API_KEY=<your-key>
GEMINI_EMBEDDING_MODEL=text-embedding-004
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```
Backend starts at `http://localhost:8000`. FAISS index builds automatically on startup (~5-10 seconds for 150 docs).

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend starts at `http://localhost:5173`.

---

## Test the 3 Official Inputs

**Test A — Deployment-related incident**
```
Why did the Order API become slow on September 16? Check whether the deployment was related and whether we have seen this before.
```
Expected: 2-3 hop trace, citations include INC-1042 + DEP-882 + PM-211

**Test B — Contradictory guidance**
```
The service is failing after a deployment. What should the on-call engineer do first?
```
Expected: Guidance analysis shows GUIDE-12 vs GUIDE-41 as CONDITIONAL_BOTH_APPLY — not a flat contradiction

**Test C — Insufficient evidence**
```
Did this exact failure happen before?
```
Expected: INSUFFICIENT_EVIDENCE verdict — not a hallucinated answer

---

## Architecture

```
Question
  │
  ▼
Investigation Agent (multi-hop loop, max 3 hops)
  │   ├── Hop 1: Extract entities → Hybrid Retrieval (metadata filter + FAISS)
  │   ├── Hop 2: LLM decides follow-up from discovered entities → Hybrid Retrieval
  │   └── Hop 3: (if needed) ...
  │
  ▼
Evidence Reasoning Agent
  ├── Rule-based sufficiency check (NO LLM)
  ├── Contradiction/supersession check (date + version + stated conditions)
  ├── Cause-vs-symptom comparison (prevents treating different-cause incidents as same)
  ├── Final answer generation (LLM, strictly grounded to retrieved docs)
  └── Citation verification (strips hallucinated doc IDs)
```

## Anti-Hallucination Measures

1. **LLM citation jail** — LLM only receives text of retrieved documents; allowed IDs explicitly listed
2. **Post-generation citation verifier** — strips any `[DOC-ID]` not in retrieved set, marks as `[UNVERIFIED]`
3. **Rule-based sufficiency gate** — if evidence is thin, LLM is never called; pure Python returns INSUFFICIENT_EVIDENCE
4. **Score floor** — documents below 0.55 cosine similarity excluded from LLM context
5. **Strict system prompt** — "Only use information from provided documents. Every claim must cite a document_id."

## Adding New Documents
Edit `backend/data/documents.json` and restart the backend. No code changes needed — the FAISS index rebuilds from scratch at startup.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/investigate` | POST | Run a full investigation |
| `/documents` | GET | List all 150 documents (for judge inspection) |
| `/health` | GET | System readiness + doc count |
