import { Fragment } from 'react';
import type {
  InvestigateResponse,
  ContradictionFlagItem,
  CauseAnalysisItem,
} from '../api';
import { VerdictBadge, DocTypeBadge } from './Badges';

// Render answer with [DOC-ID] citations highlighted
function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[[A-Z]+-[\w-]+(?:—UNVERIFIED)?\])/g);
  return (
    <div style={{
      fontSize: 14,
      lineHeight: 1.85,
      color: 'var(--text-primary)',
      whiteSpace: 'pre-wrap',
    }}>
      {parts.map((part, i) => {
        const citMatch = part.match(/^\[([A-Z]+-[\w-]+)(—UNVERIFIED)?\]$/);
        if (citMatch) {
          const isUnverified = !!citMatch[2];
          return (
            <span
              key={i}
              className="citation-pill"
              style={isUnverified ? {
                background: 'rgba(255,92,92,0.1)',
                borderColor: 'rgba(255,92,92,0.3)',
                color: 'var(--red)',
              } : undefined}
              title={isUnverified ? 'Warning: this citation was not in retrieved documents' : undefined}
            >
              {isUnverified ? '⚠ ' : ''}{citMatch[1]}
            </span>
          );
        }
        // Bold **text**
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return boldParts.map((bp, bi) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return <strong key={bi}>{bp.slice(2, -2)}</strong>;
          }
          return <Fragment key={bi}>{bp}</Fragment>;
        });
      })}
    </div>
  );
}

function ContradictionPanel({ flags }: { flags: ContradictionFlagItem[] }) {
  if (!flags.length) return null;
  const relClass: Record<string, string> = {
    GENUINE_CONTRADICTION: 'rel-contradiction',
    NEWER_SUPERSEDES: 'rel-supersedes',
    CONDITIONAL_BOTH_APPLY: 'rel-conditional',
  };
  const relLabel: Record<string, string> = {
    GENUINE_CONTRADICTION: '⚡ Genuine Contradiction',
    NEWER_SUPERSEDES: '↑ Newer Supersedes',
    CONDITIONAL_BOTH_APPLY: '✓ Conditionally Both Apply',
  };
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Guidance Analysis
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {flags.map((f, i) => (
          <div key={i} className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span className="mono" style={{ color: 'var(--accent)', fontSize: 12 }}>[{f.doc_id_1}]</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>vs</span>
              <span className="mono" style={{ color: 'var(--accent)', fontSize: 12 }}>[{f.doc_id_2}]</span>
              <span className={`badge ${relClass[f.relationship] || ''}`} style={{ marginLeft: 'auto' }}>
                {relLabel[f.relationship] || f.relationship}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {f.reasoning}
            </div>
            {f.date_1 && f.date_2 && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                Dates: <span className="mono">{f.date_1}</span> → <span className="mono">{f.date_2}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CauseAnalysisPanel({ analyses }: { analyses: CauseAnalysisItem[] }) {
  if (!analyses.length) return null;
  const verdictStyle: Record<string, { color: string; label: string }> = {
    SAME_INCIDENT_PATTERN: { color: 'var(--red)', label: '≈ Same Pattern' },
    SAME_SYMPTOM_DIFFERENT_CAUSE: { color: 'var(--yellow)', label: '⚠ Same Symptom, Different Cause' },
    DIFFERENT_INCIDENT: { color: 'var(--green)', label: '✓ Different Incident' },
  };
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Cause vs. Symptom Analysis
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {analyses.map((a, i) => {
          const vs = verdictStyle[a.verdict] ?? { color: 'var(--text-secondary)', label: a.verdict };
          return (
            <div key={i} className="card" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="mono" style={{ color: 'var(--accent)', fontSize: 12 }}>[{a.doc_id_1}]</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>vs</span>
                <span className="mono" style={{ color: 'var(--accent)', fontSize: 12 }}>[{a.doc_id_2}]</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: vs.color }}>{vs.label}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase' }}>Cause 1</div>
                  {a.cause_summary_1 || '—'}
                </div>
                <div style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase' }}>Cause 2</div>
                  {a.cause_summary_2 || '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CitationsPanel({ citations }: { citations: InvestigateResponse['citations'] }) {
  if (!citations.length) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
        Evidence Used ({citations.length} documents)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {citations.map(c => (
          <div key={c.doc_id} className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mono" style={{ color: 'var(--accent)', fontSize: 12, minWidth: 80 }}>[{c.doc_id}]</span>
            <DocTypeBadge type={c.type} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>{c.title}</span>
            {c.date && <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{c.date}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinalAnswer({ result }: { result: InvestigateResponse }) {
  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <VerdictBadge verdict={result.verdict} />
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {result.total_hops} hop{result.total_hops !== 1 ? 's' : ''} ·{' '}
          {result.total_documents_retrieved} document{result.total_documents_retrieved !== 1 ? 's' : ''} retrieved
        </div>
        {result.unverified_claims.length > 0 && (
          <span className="badge badge-incident" style={{ marginLeft: 'auto' }}>
            ⚠ {result.unverified_claims.length} unverified claim{result.unverified_claims.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Answer */}
      <div style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${result.verdict === 'ANSWERED' ? 'rgba(16,217,160,0.2)' : 'rgba(255,92,92,0.2)'}`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 4,
      }}>
        <AnswerText text={result.answer} />
      </div>

      {/* Analysis panels */}
      <ContradictionPanel flags={result.contradiction_flags} />
      <CauseAnalysisPanel analyses={result.cause_vs_symptom} />
      <CitationsPanel citations={result.citations} />

      {/* Sufficiency debug */}
      {result.sufficiency_details && (
        <div style={{ marginTop: 20, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Sufficiency check: </span>
          docs={result.sufficiency_details.doc_count} · max_score={result.sufficiency_details.max_score.toFixed(3)} ·
          service_match={String(result.sufficiency_details.service_match)} ·
          cause_verified={String(result.sufficiency_details.cause_verified)}
        </div>
      )}
    </div>
  );
}
