import { useState } from 'react';
import type { HopTraceItem, HopResultItem } from '../api';
import { DocTypeBadge, ScoreBar, FilterTag } from './Badges';

function EvidenceCard({ r, index }: { r: HopResultItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="card animate-in"
      style={{
        padding: '12px 16px',
        animationDelay: `${index * 60}ms`,
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(e => !e)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span className="mono" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
          [{r.document_id}]
        </span>
        <DocTypeBadge type={r.type} />
        {r.service && (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {r.service}
          </span>
        )}
        {r.date && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.date}</span>
        )}
        {r.version && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.version}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 8 }}>
        {r.title}
      </div>

      {/* Score bar */}
      <ScoreBar score={r.similarity_score} />

      {/* Filters matched */}
      {r.matched_filters.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {r.matched_filters.map(f => <FilterTag key={f} filter={f} />)}
        </div>
      )}

      {/* Triggered by */}
      {r.triggered_by_entity && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-2)' }}>
          ↩ triggered by: <span className="mono">"{r.triggered_by_entity}"</span>
          {r.triggered_by_doc_id && (
            <> from <span className="mono" style={{ color: 'var(--accent)' }}>[{r.triggered_by_doc_id}]</span></>
          )}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.7,
          borderLeft: '2px solid var(--border-bright)',
        }}>
          {r.content_snippet}
          {r.content_snippet.length >= 299 && <span style={{ color: 'var(--text-muted)' }}>…</span>}
        </div>
      )}
    </div>
  );
}

export function HopTrace({ hops }: { hops: HopTraceItem[] }) {
  if (!hops.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {hops.map((hop, hi) => (
        <div key={hop.hop_number} style={{ display: 'flex', gap: 0 }}>
          {/* Timeline spine */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 36, flexShrink: 0 }}>
            {/* Dot */}
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--bg-elevated)',
              border: '2px solid var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
              boxShadow: '0 0 12px var(--accent-glow)',
            }}>
              {hop.hop_number}
            </div>
            {/* Connector */}
            {hi < hops.length - 1 && (
              <div style={{ width: 2, flex: 1, minHeight: 24, background: 'linear-gradient(to bottom, var(--accent), var(--border))' }} />
            )}
          </div>

          {/* Hop content */}
          <div style={{ flex: 1, paddingLeft: 16, paddingBottom: hi < hops.length - 1 ? 24 : 0 }}>
            {/* Hop header */}
            <div style={{
              padding: '10px 14px',
              background: 'var(--bg-elevated)',
              borderRadius: '10px 10px 0 0',
              borderBottom: '1px solid var(--border)',
              marginBottom: 2,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Hop {hop.hop_number} Query
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>
                "{hop.query}"
              </div>
              {/* Filters */}
              {Object.keys(hop.filters_applied).length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {Object.entries(hop.filters_applied).map(([k, v]) => (
                    <FilterTag key={k} filter={`${k}=${JSON.stringify(v)}`} />
                  ))}
                </div>
              )}
              {/* Triggered by */}
              {hop.triggered_by_entity && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-2)' }}>
                  ↩ Follow-up triggered by: <span className="mono">"{hop.triggered_by_entity}"</span>
                  {hop.triggered_by_doc_id && (
                    <> from <span className="mono" style={{ color: 'var(--accent)' }}>[{hop.triggered_by_doc_id}]</span></>
                  )}
                </div>
              )}
            </div>

            {/* Results */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
              {hop.results.length === 0 ? (
                <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
                  No documents retrieved above similarity threshold.
                </div>
              ) : (
                hop.results.map((r, ri) => <EvidenceCard key={r.document_id} r={r} index={ri} />)
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
