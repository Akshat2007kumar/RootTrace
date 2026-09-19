import React from 'react';
import { Search, Server, AlertTriangle, Sparkles, FileText, CheckCircle2 } from 'lucide-react';
import type { InvestigateResponse } from '../types';

interface InvestigationTimelineProps {
  result: InvestigateResponse;
  onSelectDoc: (docId: string) => void;
}

export const InvestigationTimeline: React.FC<InvestigationTimelineProps> = ({
  result,
  onSelectDoc,
}) => {
  // Extract primary service and doc from citations or trace
  const primaryCitation = result.citations[0];
  const primaryService = primaryCitation?.service || 'orders-api';
  const primaryDocId = primaryCitation?.doc_id || 'DOC';
  const hopCount = result.total_hops || result.investigation_trace.length;

  const steps = [
    { label: 'QUERY', value: 'Investigated Question', icon: <Search className="w-3.5 h-3.5" /> },
    { label: 'SERVICE', value: primaryService, icon: <Server className="w-3.5 h-3.5" /> },
    { label: 'SYMPTOM', value: 'Observed Latency / Error', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { label: 'ENTITY', value: `${hopCount} Hop Tracing`, icon: <Sparkles className="w-3.5 h-3.5" /> },
    { 
      label: 'DOCUMENT', 
      value: primaryDocId, 
      icon: <FileText className="w-3.5 h-3.5" />,
      clickable: true,
      onClick: () => onSelectDoc(primaryDocId)
    },
    { label: 'ROOT CAUSE', value: result.verdict === 'ANSWERED' ? 'Synthesized & Verified' : 'Insufficient Evidence', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="w-full bg-[#f6fbf5] border border-[#d3e7d1] rounded-xl p-4 my-6">
      <div className="text-[10px] font-mono-tech font-bold uppercase tracking-wider text-[#664147] mb-3">
        Investigation Diagnostic Path
      </div>

      {/* Desktop Horizontal View */}
      <div className="hidden md:flex items-center justify-between relative">
        {/* Connecting line */}
        <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-[#d3e7d1] -translate-y-1/2 z-0" />

        {steps.map((step, idx) => (
          <div key={step.label} className="relative z-10 flex flex-col items-center group">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all ${
              idx === steps.length - 1
                ? result.verdict === 'ANSWERED' 
                  ? 'bg-[#A3F7B5] border-[#40C9A2] text-[#247c76]' 
                  : 'bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-white border-[#2F9C95] text-[#2F9C95]'
            }`}>
              {step.icon}
            </div>
            <div className="mt-1.5 text-center">
              <span className="block text-[10px] font-mono-tech font-bold text-gray-500 tracking-wider">
                {step.label}
              </span>
              {step.clickable ? (
                <button
                  type="button"
                  onClick={step.onClick}
                  className="text-[11px] font-mono-tech font-bold text-[#247c76] bg-[#E5F9E0] px-1.5 py-0.5 rounded border border-[#A3F7B5] hover:bg-[#A3F7B5] cursor-pointer"
                >
                  {step.value}
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-gray-800 max-w-[120px] truncate block">
                  {step.value}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile Vertical View */}
      <div className="flex md:hidden flex-col space-y-3 relative pl-4 border-l-2 border-[#2F9C95]/40 ml-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center space-x-3">
            <div className="w-6 h-6 rounded-full bg-white border border-[#2F9C95] text-[#2F9C95] flex items-center justify-center -ml-[21px]">
              {step.icon}
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono-tech font-bold text-gray-500">{step.label}:</span>
              {step.clickable ? (
                <button
                  type="button"
                  onClick={step.onClick}
                  className="text-[11px] font-mono-tech font-bold text-[#247c76] bg-[#E5F9E0] px-1.5 py-0.5 rounded border border-[#A3F7B5]"
                >
                  {step.value}
                </button>
              ) : (
                <span className="text-xs font-semibold text-gray-800">{step.value}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
