import React from 'react';
import { FileCode, AlertTriangle, BookOpen, Clock, Layers } from 'lucide-react';

interface CitationBadgeProps {
  docId: string;
  type?: string;
  similarityScore?: number;
  onClick: (docId: string) => void;
}

export const CitationBadge: React.FC<CitationBadgeProps> = ({
  docId,
  type,
  similarityScore,
  onClick,
}) => {
  const getIcon = () => {
    switch (type?.toLowerCase()) {
      case 'incident_report':
        return <AlertTriangle className="w-3 h-3 text-amber-600 inline mr-1" />;
      case 'deployment_note':
        return <Layers className="w-3 h-3 text-blue-600 inline mr-1" />;
      case 'troubleshooting':
      case 'runbook':
        return <BookOpen className="w-3 h-3 text-emerald-600 inline mr-1" />;
      case 'postmortem':
        return <Clock className="w-3 h-3 text-[#664147] inline mr-1" />;
      default:
        return <FileCode className="w-3 h-3 text-[#2F9C95] inline mr-1" />;
    }
  };

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(docId);
      }}
      className="citation-tag inline-flex items-center px-2 py-0.5 mx-1 my-0.5 text-xs font-mono-tech font-bold rounded bg-[#E5F9E0] text-[#247c76] border border-[#A3F7B5] hover:bg-[#A3F7B5] hover:border-[#40C9A2] cursor-pointer shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-[#2F9C95]"
      title={`Inspect document evidence: ${docId}${similarityScore ? ` (relevance: ${(similarityScore * 100).toFixed(1)}%)` : ''}`}
    >
      {getIcon()}
      <span>{docId}</span>
      {similarityScore !== undefined && (
        <span className="ml-1.5 text-[10px] text-gray-500 font-sans font-normal opacity-80">
          {(similarityScore * 100).toFixed(0)}%
        </span>
      )}
    </button>
  );
};
