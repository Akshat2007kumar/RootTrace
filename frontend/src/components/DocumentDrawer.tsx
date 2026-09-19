import React, { useEffect } from 'react';
import { X, Calendar, Server, Tag, GitBranch, ArrowRight, ShieldCheck } from 'lucide-react';
import type { DocumentItem, HopResultItem, CitationItem } from '../types';

interface DocumentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  document: DocumentItem | HopResultItem | CitationItem | null;
  allEvidence?: (HopResultItem | DocumentItem)[];
  onSelectRelatedDoc?: (docId: string) => void;
}

export const DocumentDrawer: React.FC<DocumentDrawerProps> = ({
  isOpen,
  onClose,
  document,
  allEvidence = [],
  onSelectRelatedDoc,
}) => {
  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !document) return null;

  const docId = 'document_id' in document ? document.document_id : document.doc_id;
  const title = document.title;
  const type = document.type;
  const service = 'service' in document ? document.service : null;
  const date = 'date' in document ? document.date : null;
  const version = 'version' in document ? document.version : null;
  
  // Content extraction
  let content = '';
  if ('content' in document && document.content) {
    content = document.content;
  } else if ('content_snippet' in document && document.content_snippet) {
    content = document.content_snippet;
  } else if ('content_preview' in document && document.content_preview) {
    content = document.content_preview;
  }

  // Hop metadata if available
  const similarityScore = 'similarity_score' in document ? document.similarity_score : undefined;
  const triggeredByEntity = 'triggered_by_entity' in document ? document.triggered_by_entity : undefined;
  const triggeredByDocId = 'triggered_by_doc_id' in document ? document.triggered_by_doc_id : undefined;
  const matchedFilters = 'matched_filters' in document ? document.matched_filters : undefined;

  // Other related evidence in the investigation
  const relatedDocs = allEvidence.filter(d => {
    const currentId = 'document_id' in d ? d.document_id : '';
    return currentId && currentId !== docId;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-[#d3e7d1] flex flex-col transform transition-transform duration-300 ease-in-out">
          
          {/* Drawer Header */}
          <div className="px-6 py-5 bg-[#f6fbf5] border-b border-[#d3e7d1] flex items-start justify-between">
            <div className="space-y-1 pr-4">
              <div className="flex items-center space-x-2">
                <span className="font-mono-tech text-base font-bold text-[#247c76] bg-[#E5F9E0] px-2.5 py-0.5 rounded border border-[#A3F7B5]">
                  {docId}
                </span>
                <span className="text-xs uppercase font-semibold text-[#664147] tracking-wider px-2 py-0.5 rounded bg-[#f7f1f2] border border-[#d8c3c7]">
                  {type.replace('_', ' ')}
                </span>
                {similarityScore !== undefined && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {(similarityScore * 100).toFixed(1)}% match
                  </span>
                )}
              </div>
              <h2 className="text-lg font-bold text-gray-900 mt-2 leading-snug">
                {title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            
            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-[#edf9ec] border border-[#d3e7d1] text-xs">
              <div className="flex items-center space-x-2 text-gray-700">
                <Server className="w-4 h-4 text-[#2F9C95] shrink-0" />
                <span>
                  Service: <strong className="font-semibold text-gray-900">{service || 'Platform-wide'}</strong>
                </span>
              </div>
              <div className="flex items-center space-x-2 text-gray-700">
                <Calendar className="w-4 h-4 text-[#2F9C95] shrink-0" />
                <span>
                  Date: <strong className="font-semibold text-gray-900">{date || 'N/A'}</strong>
                </span>
              </div>
              {version && (
                <div className="flex items-center space-x-2 text-gray-700">
                  <GitBranch className="w-4 h-4 text-[#2F9C95] shrink-0" />
                  <span>
                    Version: <strong className="font-semibold font-mono-tech text-gray-900">{version}</strong>
                  </span>
                </div>
              )}
              <div className="flex items-center space-x-2 text-gray-700">
                <Tag className="w-4 h-4 text-[#2F9C95] shrink-0" />
                <span>
                  Type: <strong className="font-semibold text-gray-900">{type}</strong>
                </span>
              </div>
            </div>

            {/* Hop Tracing Context if retrieved in a hop */}
            {(triggeredByEntity || triggeredByDocId || (matchedFilters && matchedFilters.length > 0)) && (
              <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs space-y-2">
                <div className="font-semibold text-blue-900 flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Retrieval Trace Context</span>
                </div>
                {triggeredByEntity && (
                  <div className="text-blue-800">
                    Triggered by Entity: <span className="font-semibold bg-white px-1.5 py-0.5 rounded border border-blue-200">{triggeredByEntity}</span>
                  </div>
                )}
                {triggeredByDocId && (
                  <div className="text-blue-800">
                    Discovered via Prior Document: <span className="font-mono-tech font-semibold bg-white px-1.5 py-0.5 rounded border border-blue-200">{triggeredByDocId}</span>
                  </div>
                )}
                {matchedFilters && matchedFilters.length > 0 && (
                  <div className="text-blue-800">
                    Applied Filters: {matchedFilters.map((f, i) => (
                      <span key={i} className="inline-block font-mono-tech bg-white px-1.5 py-0.5 rounded border border-blue-200 mr-1 text-[11px]">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Document Content */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Full Document Content
              </h3>
              <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-sm leading-relaxed text-gray-800 font-mono-tech whitespace-pre-wrap selection:bg-[#A3F7B5]">
                {content || 'No content available for this document.'}
              </div>
            </div>

            {/* Related Evidence in Current Investigation */}
            {relatedDocs.length > 0 && onSelectRelatedDoc && (
              <div className="space-y-2 pt-4 border-t border-gray-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Other Evidence In This Investigation
                </h3>
                <div className="space-y-1.5">
                  {relatedDocs.slice(0, 5).map((rel) => {
                    const rId = 'document_id' in rel ? rel.document_id : '';
                    return (
                      <button
                        key={rId}
                        onClick={() => onSelectRelatedDoc(rId)}
                        className="w-full text-left p-2.5 rounded-md bg-white hover:bg-[#E5F9E0] border border-gray-200 hover:border-[#A3F7B5] transition-colors flex items-center justify-between group text-xs"
                      >
                        <div className="flex items-center space-x-2 truncate pr-2">
                          <span className="font-mono-tech font-bold text-[#247c76] bg-[#edf9ec] px-1.5 py-0.5 rounded border border-[#d3e7d1]">
                            {rId}
                          </span>
                          <span className="truncate font-medium text-gray-800">{rel.title}</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-[#2F9C95] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Drawer Footer */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold rounded-md border border-gray-300 shadow-2xs transition-colors"
            >
              Close
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
