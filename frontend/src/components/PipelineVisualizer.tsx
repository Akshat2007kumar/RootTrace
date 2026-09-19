import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Sparkles, Database, Search, Cpu, GitMerge, FileCheck } from 'lucide-react';

interface PipelineVisualizerProps {
  isLoading: boolean;
}

interface PipelineStage {
  id: string;
  name: string;
  desc: string;
  icon: React.ReactNode;
}

export const PipelineVisualizer: React.FC<PipelineVisualizerProps> = ({ isLoading }) => {
  const [activeStage, setActiveStage] = useState(0);

  const stages: PipelineStage[] = [
    { id: 'query', name: 'QUERY', desc: 'Parsing question intent', icon: <Search className="w-3.5 h-3.5" /> },
    { id: 'router', name: 'ROUTER', desc: 'Selecting multi-hop graph', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'retrieval', name: 'RETRIEVAL', desc: 'Hybrid FAISS & filters', icon: <Database className="w-3.5 h-3.5" /> },
    { id: 'entity', name: 'ENTITY EXTRACTION', desc: 'Extracting services & dates', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'hop', name: 'HOP EVALUATION', desc: 'Evaluating evidence gaps', icon: <GitMerge className="w-3.5 h-3.5" /> },
    { id: 'reasoning', name: 'EVIDENCE REASONING', desc: 'Cause vs symptom analysis', icon: <FileCheck className="w-3.5 h-3.5" /> },
    { id: 'verdict', name: 'VERDICT', desc: 'Grounded citation check', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  ];

  useEffect(() => {
    if (!isLoading) {
      setActiveStage(0);
      return;
    }

    const interval = setInterval(() => {
      setActiveStage((prev) => (prev < stages.length - 1 ? prev + 1 : prev));
    }, 1800);

    return () => clearInterval(interval);
  }, [isLoading, stages.length]);

  if (!isLoading) return null;

  return (
    <div className="w-full my-8 p-6 rounded-xl bg-white border border-[#A3F7B5] shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-4 h-4 text-[#2F9C95] animate-spin" />
          <span className="text-xs font-mono-tech uppercase font-bold tracking-wider text-[#247c76]">
            Active Investigation Pipeline Execution
          </span>
        </div>
        <span className="text-xs text-[#664147] font-semibold">
          Stage {activeStage + 1} of {stages.length}: {stages[activeStage].name}
        </span>
      </div>

      {/* Progress Line */}
      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-6 overflow-hidden">
        <div
          className="bg-[#2F9C95] h-1.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${((activeStage + 1) / stages.length) * 100}%` }}
        />
      </div>

      {/* Stage Chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stages.map((stage, idx) => {
          const isDone = idx < activeStage;
          const isCurrent = idx === activeStage;

          return (
            <div
              key={stage.id}
              className={`p-2.5 rounded-lg border text-center transition-all duration-300 flex flex-col items-center justify-center ${
                isCurrent
                  ? 'bg-[#E5F9E0] border-[#2F9C95] text-[#247c76] shadow-xs ring-2 ring-[#40C9A2]/30 scale-[1.02]'
                  : isDone
                  ? 'bg-[#f6fbf5] border-[#d3e7d1] text-emerald-800'
                  : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
              }`}
            >
              <div className="flex items-center justify-center mb-1">
                {isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#2F9C95] animate-spin" />
                ) : isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  stage.icon
                )}
              </div>
              <div className="text-[11px] font-mono-tech font-bold tracking-tight">
                {stage.name}
              </div>
              <div className="text-[9px] text-gray-500 mt-0.5 line-clamp-1 font-sans">
                {stage.desc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
