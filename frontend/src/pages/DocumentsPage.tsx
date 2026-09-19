import React, { useState, useMemo } from 'react';
import { Search, RefreshCw, ExternalLink, Server, Upload } from 'lucide-react';
import type { DocumentItem } from '../types';
import { UploadDocumentModal } from '../components/UploadDocumentModal';

interface DocumentsPageProps {
  documents: DocumentItem[];
  loading: boolean;
  onRefresh: () => void;
  onSelectDoc: (doc: DocumentItem) => void;
}

export const DocumentsPage: React.FC<DocumentsPageProps> = ({
  documents,
  loading,
  onRefresh,
  onSelectDoc,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Extract unique types and services for filters
  const uniqueTypes = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => d.type && set.add(d.type));
    return Array.from(set).sort();
  }, [documents]);

  const uniqueServices = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => d.service && set.add(d.service));
    return Array.from(set).sort();
  }, [documents]);

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchSearch =
        !searchTerm.trim() ||
        doc.document_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.content_preview && doc.content_preview.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchType = selectedType === 'ALL' || doc.type === selectedType;
      const matchService = selectedService === 'ALL' || doc.service === selectedService;

      return matchSearch && matchType && matchService;
    });
  }, [documents, searchTerm, selectedType, selectedService]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#d3e7d1] pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-mono-tech text-xs font-bold uppercase tracking-wider text-[#664147]">
              KNOWLEDGE REPOSITORY
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#E5F9E0] text-[#247c76] border border-[#A3F7B5] font-mono-tech font-bold">
              {documents.length} Docs
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 mt-1">
            DOCUMENTATION
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Indexed incident reports, deployment notes, architecture blueprints, postmortems, and runbooks.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-[#2F9C95] hover:bg-[#247c76] text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 text-gray-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Search input */}
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search documents by ID, title or content..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-[#d3e7d1] rounded-lg text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#2F9C95] focus:ring-1 focus:ring-[#2F9C95]"
          />
        </div>

        {/* Type Filter */}
        <div className="sm:col-span-3">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d3e7d1] rounded-lg text-xs sm:text-sm text-gray-700 focus:outline-hidden focus:border-[#2F9C95]"
          >
            <option value="ALL">All Types ({uniqueTypes.length})</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Service Filter */}
        <div className="sm:col-span-3">
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-[#d3e7d1] rounded-lg text-xs sm:text-sm text-gray-700 focus:outline-hidden focus:border-[#2F9C95]"
          >
            <option value="ALL">All Services ({uniqueServices.length})</option>
            {uniqueServices.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl border border-[#d3e7d1] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#edf9ec] text-gray-600 font-mono-tech uppercase tracking-wider border-b border-[#d3e7d1]">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">TITLE</th>
                <th className="py-3 px-4">TYPE</th>
                <th className="py-3 px-4">SERVICE</th>
                <th className="py-3 px-4">DATE</th>
                <th className="py-3 px-4">VERSION</th>
                <th className="py-3 px-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <span className="w-5 h-5 border-2 border-[#2F9C95]/30 border-t-[#2F9C95] rounded-full animate-spin" />
                      <span>Loading documents index...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    No documents matched the specified filters.
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => (
                  <tr
                    key={doc.document_id}
                    onClick={() => onSelectDoc(doc)}
                    className="hover:bg-[#f6fbf5] cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <span className="font-mono-tech font-bold text-[#247c76] bg-[#E5F9E0] px-2 py-0.5 rounded border border-[#A3F7B5]">
                        {doc.document_id}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900 max-w-sm truncate">
                      {doc.title}
                    </td>
                    <td className="py-3 px-4">
                      <span className="uppercase text-[10px] font-semibold text-[#664147] bg-[#f7f1f2] px-1.5 py-0.5 rounded border border-[#d8c3c7]">
                        {doc.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {doc.service ? (
                        <span className="inline-flex items-center space-x-1">
                          <Server className="w-3 h-3 text-[#2F9C95]" />
                          <span>{doc.service}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">Platform-wide</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-gray-500">
                      {doc.date || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono-tech text-gray-500">
                      {doc.version || '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDoc(doc);
                        }}
                        className="p-1 rounded text-gray-400 group-hover:text-[#2F9C95] hover:bg-gray-100"
                        title="View Document Details"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
          <span>Showing {filteredDocs.length} of {documents.length} documents</span>
          <span className="font-mono-tech">FAISS Vector Indexed</span>
        </div>
      </div>

      <UploadDocumentModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={() => {
          onRefresh(); // refresh the list after successful upload
        }}
      />
    </div>
  );
};
