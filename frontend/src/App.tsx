import { useState, useEffect, useRef } from 'react';
import { runInvestigation, checkHealth, type InvestigateResponse } from './api';
import { HopTrace } from './components/HopTrace';
import { FinalAnswer } from './components/FinalAnswer';
import './index.css';

const EXAMPLE_QUESTIONS = [
  "Why did the Order API become slow on September 16? Check whether the deployment was related and whether we have seen this before.",
  "The service is failing after a deployment. What should the on-call engineer do first?",
  "Did this exact failure happen before?",
];

function Header({ docCount, ready }: { docCount: number; ready: boolean }) {
  return (
    <header style={{
      padding: '0 32px',
      height: 60,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-surface)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, boxShadow: '0 0 16px var(--accent-glow)',
        }}>🔍</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>RootTrace</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Incident Investigation Agent
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: ready ? 'var(--green)' : 'var(--yellow)',
          boxShadow: `0 0 8px ${ready ? 'rgba(16,217,160,0.5)' : 'rgba(251,191,36,0.5)'}`,
        }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {ready ? `${docCount} documents indexed` : 'Indexing…'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>· DeadKeys</span>
      </div>
    </header>
  );
}

export default function App() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvestigateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'trace' | 'answer'>('trace');
  const [ready, setReady] = useState(false);
  const [docCount, setDocCount] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const h = await checkHealth();
        setReady(h.index_ready);
        setDocCount(h.doc_count);
        if (!h.index_ready) setTimeout(poll, 2000);
      } catch {}
    };
    poll();
  }, []);

  const handleSubmit = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setActiveTab('trace');
    try {
      const res = await runInvestigation(question.trim());
      setResult(res);
      setActiveTab(res.verdict === 'ANSWERED' ? 'answer' : 'trace');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Header docCount={docCount} ready={ready} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{
              fontSize: 38,
              fontWeight: 800,
              letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, var(--text-primary) 40%, var(--accent) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 10,
            }}>
              The Investigation Nobody Could Answer
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
              Multi-hop agentic investigation across incident reports, deployments, postmortems,
              guides, and complaints — with contradiction detection and citation verification.
            </p>
          </div>

          {/* Input panel */}
          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <textarea
              className="input-main"
              placeholder="Ask an investigation question… e.g. 'Why did the Order API become slow on September 16?'"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ⌘ + Enter to submit
              </div>
              <button className="btn-primary" onClick={handleSubmit} disabled={loading || !question.trim()}>
                {loading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="spinner" /> Investigating…
                  </span>
                ) : 'Investigate →'}
              </button>
            </div>

            {/* Example questions */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Try these:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {EXAMPLE_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setQuestion(q)}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      textAlign: 'left',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.target as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '14px 18px',
              background: 'rgba(255,92,92,0.08)',
              border: '1px solid rgba(255,92,92,0.3)',
              borderRadius: 10,
              color: 'var(--red)',
              fontSize: 13,
              marginBottom: 20,
            }}>
              ⚠ {error}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="card animate-in" style={{ padding: '32px', textAlign: 'center' }}>
              <div style={{ marginBottom: 16 }}>
                <span className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Running multi-hop investigation…
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
                Retrieving documents → Extracting entities → Follow-up searches → Reasoning
              </div>
            </div>
          )}

          {/* Results */}
          {result && (
            <div ref={resultRef} className="animate-in">
              {/* Tab bar */}
              <div style={{
                display: 'flex',
                gap: 2,
                background: 'var(--bg-elevated)',
                borderRadius: '10px 10px 0 0',
                padding: 4,
                border: '1px solid var(--border)',
                borderBottom: 'none',
              }}>
                {(['trace', 'answer'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      borderRadius: 7,
                      border: 'none',
                      background: activeTab === tab ? 'var(--bg-card)' : 'transparent',
                      color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: 13,
                      fontWeight: activeTab === tab ? 600 : 400,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab === 'trace' ? `🔎 Investigation Trace (${result.total_hops} hops)` : '📋 Final Answer'}
                  </button>
                ))}
              </div>

              <div style={{
                border: '1px solid var(--border)',
                borderRadius: '0 0 12px 12px',
                padding: 24,
                background: 'var(--bg-card)',
              }}>
                {activeTab === 'trace' && <HopTrace hops={result.investigation_trace} />}
                {activeTab === 'answer' && <FinalAnswer result={result} />}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
