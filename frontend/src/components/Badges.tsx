
const TYPE_LABELS: Record<string, string> = {
  incident_report: 'Incident',
  deployment_note: 'Deploy',
  postmortem: 'Postmortem',
  troubleshooting: 'Guide',
  architecture_note: 'Architecture',
  customer_complaint: 'Complaint',
  engineering_discussion: 'Discussion',
};

export function DocTypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type;
  const cls = `badge badge-${type.replace(/_/g, '_')}`;
  return <span className={cls}>{label}</span>;
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 9999, overflow: 'hidden' }}>
        <div
          className="score-bar"
          style={{ width: `${Math.min(score * 100, 100)}%`, height: '100%' }}
        />
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 36, textAlign: 'right' }}>
        {score.toFixed(3)}
      </span>
    </div>
  );
}

export function FilterTag({ filter }: { filter: string }) {
  return (
    <span style={{
      padding: '1px 7px',
      background: 'rgba(99,131,255,0.08)',
      border: '1px solid var(--border)',
      borderRadius: 4,
      fontSize: 10,
      color: 'var(--accent)',
      fontFamily: 'JetBrains Mono, monospace',
    }}>
      {filter}
    </span>
  );
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  const isOk = verdict === 'ANSWERED';
  return (
    <span className={`badge ${isOk ? 'verdict-answered' : 'verdict-insufficient'}`}
      style={{ fontSize: 13, padding: '4px 14px', gap: 6 }}>
      <span style={{ fontSize: 16 }}>{isOk ? '✓' : '✗'}</span>
      {isOk ? 'Answered' : 'Insufficient Evidence'}
    </span>
  );
}
