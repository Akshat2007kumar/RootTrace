// API types matching backend response models

export interface HopResultItem {
  document_id: string;
  title: string;
  type: string;
  service: string | null;
  date: string | null;
  version: string | null;
  similarity_score: number;
  matched_filters: string[];
  triggered_by_entity: string | null;
  triggered_by_doc_id: string | null;
  content_snippet: string;
}

export interface HopTraceItem {
  hop_number: number;
  query: string;
  filters_applied: Record<string, unknown>;
  triggered_by_entity: string | null;
  triggered_by_doc_id: string | null;
  results: HopResultItem[];
}

export interface CitationItem {
  doc_id: string;
  title: string;
  type: string;
  date: string;
  service: string;
  similarity_score: number;
}

export interface ContradictionFlagItem {
  doc_id_1: string;
  doc_id_2: string;
  relationship: 'GENUINE_CONTRADICTION' | 'NEWER_SUPERSEDES' | 'CONDITIONAL_BOTH_APPLY';
  reasoning: string;
  date_1: string | null;
  date_2: string | null;
}

export interface CauseAnalysisItem {
  doc_id_1: string;
  doc_id_2: string;
  symptom_match: boolean;
  cause_match: boolean;
  cause_summary_1: string;
  cause_summary_2: string;
  verdict: 'SAME_INCIDENT_PATTERN' | 'SAME_SYMPTOM_DIFFERENT_CAUSE' | 'DIFFERENT_INCIDENT';
}

export interface SufficiencyItem {
  is_sufficient: boolean;
  reason: string;
  doc_count: number;
  max_score: number;
  service_match: boolean;
  cause_verified: boolean;
}

export interface InvestigateResponse {
  verdict: 'ANSWERED' | 'INSUFFICIENT_EVIDENCE';
  answer: string;
  citations: CitationItem[];
  investigation_trace: HopTraceItem[];
  contradiction_flags: ContradictionFlagItem[];
  cause_vs_symptom: CauseAnalysisItem[];
  sufficiency_details: SufficiencyItem | null;
  unverified_claims: string[];
  total_hops: number;
  total_documents_retrieved: number;
}

export async function runInvestigation(question: string): Promise<InvestigateResponse> {
  const res = await fetch('/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function checkHealth(): Promise<{ status: string; doc_count: number; index_ready: boolean }> {
  const res = await fetch('/health');
  return res.json();
}
