import React, { useState, useRef } from 'react';
import { 
  Search, 
  ArrowRight, 
  ShieldCheck, 
  AlertTriangle, 
  Layers, 
  HelpCircle, 
  Sparkles,
  GitCompare,
  Activity,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { 
  InvestigateResponse, 
  HopResultItem, 
  DocumentItem, 
  CitationItem 
} from '../types';
import { runInvestigation } from '../services/api';
import { PipelineVisualizer } from '../components/PipelineVisualizer';
import { InvestigationTimeline } from '../components/InvestigationTimeline';
import { CitationBadge } from '../components/CitationBadge';

interface InvestigatePageProps {
  onSelectDoc: (doc: DocumentItem | HopResultItem | CitationItem) => void;
  allDocsCache: DocumentItem[];
}

export const InvestigatePage: React.FC<InvestigatePageProps> = ({
  onSelectDoc,
  allDocsCache,
}) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InvestigateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedHop, setExpandedHop] = useState<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const exampleQueries = [
    {
      label: '504 timeout investigation',
      query: 'Why did the Order API become slow on September 16? Check whether the deployment was related and whether we have seen this before.',
    },
    {
      label: 'Deployment regression',
      query: 'Why did user logins fail on the Auth Service in early March 2026, and was the v5.9.0 deployment responsible?',
    },
    {
      label: 'Conflicting runbooks',
      query: 'The service is failing after a deployment. What should the on-call engineer do first?',
    },
    {
      label: 'Configuration issue / Repeat check',
      query: 'Did this exact failure happen before?',
    },
    {
      label: 'Cross-service dependency',
      query: 'The payment gateway is throwing 500s. Could a recent change in the catalog service be causing this?',
    },
    {
      label: 'Performance / High Latency',
      query: 'We saw a latency spike in the auth-service around 2 PM. Were there any database migrations running at that time?',
    },
    {
      label: 'Missing evidence test',
      query: 'Why did the marketing landing page go down yesterday?',
    },
    {
      label: 'Security / Access control',
      query: 'Users are getting 403 Forbidden errors when trying to upload profile pictures. Has the IAM policy for the S3 bucket changed?',
    },
  ];

  const handleInvestigate = async (overrideQuestion?: string) => {
    const q = (overrideQuestion || question).trim();
    if (!q || loading) return;

    if (overrideQuestion) {
      setQuestion(overrideQuestion);
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await runInvestigation(q);
      setResult(data);
      setTimeout(() => {
        workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Investigation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleInvestigate();
    }
  };

  // Helper to open document drawer by ID
  const handleDocClick = (docId: string) => {
    // Look up in citations first
    const fromCitation = result?.citations.find((c) => c.doc_id === docId);
    if (fromCitation) {
      onSelectDoc(fromCitation);
      return;
    }

    // Look up in hops
    if (result) {
      for (const hop of result.investigation_trace) {
        const fromHop = hop.results.find((r) => r.document_id === docId);
        if (fromHop) {
          onSelectDoc(fromHop);
          return;
        }
      }
    }

    // Look up in all cached documents
    const fromCache = allDocsCache.find((d) => d.document_id === docId);
    if (fromCache) {
      onSelectDoc(fromCache);
      return;
    }

    // Fallback minimal document object
    onSelectDoc({
      document_id: docId,
      title: `Document ${docId}`,
      type: 'document',
      service: null,
      date: null,
      version: null,
      content_preview: `Referenced document: ${docId}`,
    });
  };

  const renderInlineCitations = (text: string) => {
    const regex = /\[([A-Z0-9]+-[A-Z0-9_-]+)\]/g;
    const parts: (string | React.ReactNode)[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      const docId = match[1];
      const cit = result?.citations.find((c) => c.doc_id === docId);
      parts.push(
        <CitationBadge
          key={`${docId}-${matchIndex}`}
          docId={docId}
          type={cit?.type}
          similarityScore={cit?.similarity_score}
          onClick={handleDocClick}
        />
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts;
  };

  // Render text containing citations with interactive CitationBadge components
  const renderTextWithCitations = (text: string) => {
    if (!text) return null;

    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        const jsonObj = JSON.parse(jsonMatch[1]);
        return (
          <div className="space-y-4">
            {Object.entries(jsonObj).map(([key, value]) => {
              if (key === 'citations') return null; // citations handled in table below
              
              let displayValue: React.ReactNode;
              if (typeof value === 'string') {
                displayValue = <div className="leading-relaxed whitespace-pre-wrap">{renderInlineCitations(value)}</div>;
              } else if (Array.isArray(value)) {
                displayValue = (
                  <ul className="list-disc pl-5 space-y-1">
                    {value.map((item, i) => (
                      <li key={i}>{typeof item === 'string' ? renderInlineCitations(item) : JSON.stringify(item)}</li>
                    ))}
                  </ul>
                );
              } else {
                displayValue = <pre className="whitespace-pre-wrap text-xs bg-white p-2 rounded border border-gray-100">{JSON.stringify(value, null, 2)}</pre>;
              }

              return (
                <div key={key} className="bg-[#f9fafb] p-4 rounded-lg border border-gray-200">
                  <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2 font-mono-tech">
                    {key.replace(/_/g, ' ')}
                  </h4>
                  <div className="text-sm text-gray-800">
                    {displayValue}
                  </div>
                </div>
              );
            })}
          </div>
        );
      } catch (e) {
        console.error("Failed to parse JSON answer", e);
      }
    }

    return <div className="leading-relaxed whitespace-pre-wrap">{renderInlineCitations(text)}</div>;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Hero Section */}
      <div className="text-center space-y-3 pt-2 pb-4">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-[#E5F9E0] border border-[#A3F7B5] text-[#247c76] text-xs font-mono-tech font-bold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-[#2F9C95]" />
          <span>Incident Investigation Agent</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1f2937] uppercase">
          Trace the evidence. <span className="text-[#2F9C95]">Find the root cause.</span>
        </h1>

        <p className="max-w-2xl mx-auto text-sm sm:text-base text-[#596775]">
          Multi-hop incident investigation grounded in enterprise technical documentation.
        </p>
      </div>

      {/* Investigation Input Card */}
      <div className="bg-white rounded-xl border border-[#d3e7d1] shadow-xs p-5 sm:p-6 space-y-4">
        <div className="relative">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={3}
            className="w-full p-4 rounded-lg bg-[#f6fbf5] border border-[#d3e7d1] focus:border-[#2F9C95] focus:ring-2 focus:ring-[#40C9A2]/30 focus:outline-hidden text-sm sm:text-base text-gray-900 placeholder:text-gray-400 resize-none font-sans leading-relaxed"
            placeholder="Describe an incident, service, symptom or configuration issue... e.g. Why did orders-api experience HTTP 504 timeouts after the latest deployment?"
          />
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <div className="text-xs text-gray-500 font-mono-tech flex items-center space-x-1.5">
            <span className="px-1.5 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-600 font-bold">
              Ctrl/Cmd + Enter
            </span>
            <span>to submit</span>
          </div>

          <button
            type="button"
            onClick={() => handleInvestigate()}
            disabled={loading || !question.trim()}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
              loading || !question.trim()
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300'
                : 'bg-[#2F9C95] hover:bg-[#247c76] text-white shadow-xs border border-[#247c76]'
            }`}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Tracing evidence...</span>
              </>
            ) : (
              <>
                <span>Investigate</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Example Query Chips */}
        <div className="pt-3 border-t border-gray-100">
          <div className="text-[11px] font-mono-tech font-bold uppercase tracking-wider text-gray-400 mb-2">
            Example Investigations:
          </div>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleInvestigate(item.query)}
                disabled={loading}
                className="text-xs font-medium px-3 py-1.5 rounded-md bg-[#edf9ec] hover:bg-[#E5F9E0] text-[#247c76] border border-[#d3e7d1] hover:border-[#A3F7B5] transition-colors text-left truncate max-w-full sm:max-w-md"
              >
                <span className="font-semibold text-[#664147] mr-1.5">[{item.label}]</span>
                <span className="text-gray-600">{item.query.slice(0, 50)}...</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading Pipeline Visualizer */}
      <PipelineVisualizer isLoading={loading} />

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold">Investigation Failed</h4>
            <p className="text-xs text-rose-700 font-mono-tech">{error}</p>
          </div>
        </div>
      )}

      {/* Investigation Workspace Results */}
      {result && (
        <div ref={workspaceRef} className="space-y-6 animate-fadeIn">
          
          {/* Result Header Bar */}
          <div className="p-5 rounded-xl bg-white border border-[#d3e7d1] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-[11px] font-mono-tech font-bold uppercase tracking-wider text-gray-400">
                Investigation Result
              </div>
              <h2 className="text-lg font-bold text-gray-900 mt-0.5">
                {result.citations[0]?.service ? `${result.citations[0].service} Incident` : 'Cross-Service Incident'}
              </h2>
              <div className="text-xs text-gray-500 mt-1 flex items-center space-x-3">
                <span>{result.total_hops} Hop{result.total_hops > 1 ? 's' : ''} Analyzed</span>
                <span>•</span>
                <span>{result.total_documents_retrieved} Evidence Documents</span>
              </div>
            </div>

            {/* Verdict Badge */}
            <div>
              {result.verdict === 'ANSWERED' ? (
                <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-[#E5F9E0] text-[#247c76] border border-[#A3F7B5] font-mono-tech font-bold text-xs uppercase tracking-wider shadow-2xs">
                  <ShieldCheck className="w-4 h-4 text-[#2F9C95]" />
                  <span>VERIFIED CONCLUSION</span>
                </div>
              ) : (
                <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-lg bg-[#f7f1f2] text-[#664147] border border-[#d8c3c7] font-mono-tech font-bold text-xs uppercase tracking-wider shadow-2xs">
                  <HelpCircle className="w-4 h-4 text-[#664147]" />
                  <span>INSUFFICIENT EVIDENCE</span>
                </div>
              )}
            </div>
          </div>

          {/* Diagnostic Timeline Path */}
          <InvestigationTimeline result={result} onSelectDoc={handleDocClick} />

          {/* 1. ROOT CAUSE SECTION */}
          <div className="bg-white rounded-xl border border-[#d3e7d1] shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e6f2e4] pb-3">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2F9C95]" />
                <h3 className="font-mono-tech text-xs font-bold uppercase tracking-wider text-[#664147]">
                  ROOT CAUSE ANALYSIS
                </h3>
              </div>
              <span className="text-xs text-gray-500">
                Click any citation badge to inspect evidence
              </span>
            </div>

            <div className="prose prose-sm max-w-none text-gray-800 leading-relaxed font-sans text-sm sm:text-base">
              {renderTextWithCitations(result.answer)}
            </div>

            {/* Sufficiency Reason Note */}
            {result.sufficiency_details && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Gating: {result.sufficiency_details.reason}</span>
                </div>
                <span className="font-mono-tech text-gray-400">
                  Max score: {(result.sufficiency_details.max_score * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {/* 2. INSUFFICIENT EVIDENCE SAFETY CARD (If applicable) */}
          {result.verdict === 'INSUFFICIENT_EVIDENCE' && (
            <div className="p-6 rounded-xl bg-[#f7f1f2] border-2 border-[#d8c3c7] text-[#472d31] space-y-3">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-[#664147]" />
                <h3 className="font-mono-tech text-sm font-bold uppercase tracking-wider text-[#664147]">
                  INSUFFICIENT EVIDENCE VERDICT
                </h3>
              </div>
              <p className="text-sm leading-relaxed">
                RootTrace could not establish a sufficiently grounded conclusion from the available documentation.
              </p>
              {result.sufficiency_details && (
                <div className="text-xs bg-white/70 p-3 rounded-md border border-[#d8c3c7] font-mono-tech">
                  Rule Check: {result.sufficiency_details.reason}
                </div>
              )}
              <div className="text-xs font-semibold italic text-[#664147]">
                "RootTrace did not speculate beyond the available evidence."
              </div>
            </div>
          )}

          {/* 3. CONTRADICTION & SUPERSESSION ANALYSIS */}
          {result.contradiction_flags && result.contradiction_flags.length > 0 && (
            <div className="bg-white rounded-xl border border-amber-200 shadow-xs p-6 space-y-4">
              <div className="flex items-center space-x-2 border-b border-amber-100 pb-3">
                <GitCompare className="w-4 h-4 text-amber-600" />
                <h3 className="font-mono-tech text-xs font-bold uppercase tracking-wider text-amber-900">
                  EVIDENCE CONFLICT / SUPERSESSION RESOLUTION
                </h3>
              </div>

              <div className="space-y-4">
                {result.contradiction_flags.map((flag, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-amber-50/50 border border-amber-200/80 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center space-x-2">
                        <CitationBadge docId={flag.doc_id_1} onClick={handleDocClick} />
                        <span className="font-mono-tech font-bold text-gray-400">VS</span>
                        <CitationBadge docId={flag.doc_id_2} onClick={handleDocClick} />
                      </div>
                      <span className="font-mono-tech text-[11px] font-bold px-2 py-0.5 rounded bg-white text-amber-800 border border-amber-300">
                        {flag.relationship}
                      </span>
                    </div>
                    <div className="text-sm text-gray-800 leading-relaxed">
                      {flag.reasoning}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. CAUSE VS SYMPTOM MATRIX */}
          {result.cause_vs_symptom && result.cause_vs_symptom.length > 0 && (
            <div className="bg-white rounded-xl border border-[#d3e7d1] shadow-xs p-6 space-y-4">
              <div className="flex items-center space-x-2 border-b border-[#e6f2e4] pb-3">
                <Activity className="w-4 h-4 text-[#2F9C95]" />
                <h3 className="font-mono-tech text-xs font-bold uppercase tracking-wider text-[#664147]">
                  CAUSE VS SYMPTOM DIAGNOSTIC CHAIN
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.cause_vs_symptom.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-[#f6fbf5] border border-[#d3e7d1] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <CitationBadge docId={item.doc_id_1} onClick={handleDocClick} />
                        <span className="text-xs text-gray-400">vs</span>
                        <CitationBadge docId={item.doc_id_2} onClick={handleDocClick} />
                      </div>
                      <span className="text-[10px] font-mono-tech font-bold px-2 py-0.5 rounded bg-white text-[#247c76] border border-[#A3F7B5]">
                        {item.verdict.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="p-2 rounded bg-white border border-gray-100">
                        <span className="font-mono-tech font-bold text-gray-400 mr-1.5">[{item.doc_id_1} Cause]:</span>
                        <span className="text-gray-700">{item.cause_summary_1}</span>
                      </div>
                      <div className="p-2 rounded bg-white border border-gray-100">
                        <span className="font-mono-tech font-bold text-gray-400 mr-1.5">[{item.doc_id_2} Cause]:</span>
                        <span className="text-gray-700">{item.cause_summary_2}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. EVIDENCE USED TABLE */}
          <div className="bg-white rounded-xl border border-[#d3e7d1] shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e6f2e4] pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-[#2F9C95]" />
                <h3 className="font-mono-tech text-xs font-bold uppercase tracking-wider text-[#664147]">
                  EVIDENCE USED ({result.citations.length} Verified Documents)
                </h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#edf9ec] text-gray-600 font-mono-tech uppercase tracking-wider border-b border-[#d3e7d1]">
                    <th className="py-2.5 px-3">DOC-ID</th>
                    <th className="py-2.5 px-3">TITLE</th>
                    <th className="py-2.5 px-3">TYPE</th>
                    <th className="py-2.5 px-3">SERVICE</th>
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">RELEVANCE</th>
                    <th className="py-2.5 px-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.citations.map((cit) => (
                    <tr 
                      key={cit.doc_id} 
                      onClick={() => handleDocClick(cit.doc_id)}
                      className="hover:bg-[#f6fbf5] cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-mono-tech font-bold text-[#247c76] bg-[#E5F9E0] px-1.5 py-0.5 rounded border border-[#A3F7B5]">
                          {cit.doc_id}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-900 max-w-xs truncate">
                        {cit.title}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="uppercase text-[10px] font-semibold text-[#664147] bg-[#f7f1f2] px-1.5 py-0.5 rounded border border-[#d8c3c7]">
                          {cit.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600">
                        {cit.service || 'N/A'}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tech text-gray-500">
                        {cit.date || 'N/A'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-1.5">
                          <div className="w-12 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-[#2F9C95] h-1.5 rounded-full" 
                              style={{ width: `${cit.similarity_score * 100}%` }}
                            />
                          </div>
                          <span className="font-mono-tech text-gray-600">
                            {(cit.similarity_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDocClick(cit.doc_id);
                          }}
                          className="p-1 rounded text-gray-400 hover:text-[#2F9C95] hover:bg-gray-100"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 6. MULTI-HOP TRACE DETAILS (Accordion) */}
          <div className="bg-white rounded-xl border border-[#d3e7d1] shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e6f2e4] pb-3">
              <div className="flex items-center space-x-2">
                <Search className="w-4 h-4 text-[#2F9C95]" />
                <h3 className="font-mono-tech text-xs font-bold uppercase tracking-wider text-[#664147]">
                  MULTI-HOP RETRIEVAL TRACE ({result.investigation_trace.length} Hops)
                </h3>
              </div>
            </div>

            <div className="space-y-3">
              {result.investigation_trace.map((hop) => {
                const isExpanded = expandedHop === hop.hop_number;
                return (
                  <div key={hop.hop_number} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedHop(isExpanded ? null : hop.hop_number)}
                      className="w-full px-4 py-3 bg-[#f6fbf5] hover:bg-[#edf9ec] flex items-center justify-between text-left transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="font-mono-tech font-bold text-xs bg-[#2F9C95] text-white px-2 py-0.5 rounded">
                          Hop {hop.hop_number}
                        </span>
                        <span className="text-xs font-medium text-gray-900 truncate max-w-md">
                          {hop.query}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        <span>{hop.results.length} docs retrieved</span>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-white divide-y divide-gray-100 text-xs space-y-3">
                        {hop.triggered_by_entity && (
                          <div className="text-gray-500">
                            Trigger entity: <strong className="text-gray-800">{hop.triggered_by_entity}</strong>
                          </div>
                        )}
                        <div className="space-y-2 pt-2">
                          {hop.results.map((r) => (
                            <div
                              key={r.document_id}
                              onClick={() => handleDocClick(r.document_id)}
                              className="p-2.5 rounded bg-gray-50 hover:bg-[#E5F9E0] border border-gray-200 hover:border-[#A3F7B5] cursor-pointer flex items-center justify-between"
                            >
                              <div className="flex items-center space-x-2">
                                <span className="font-mono-tech font-bold text-[#247c76]">
                                  {r.document_id}
                                </span>
                                <span className="font-medium text-gray-800 truncate max-w-sm">
                                  {r.title}
                                </span>
                              </div>
                              <span className="font-mono-tech text-gray-500">
                                {(r.similarity_score * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
