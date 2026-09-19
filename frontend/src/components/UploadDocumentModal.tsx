import React, { useState } from 'react';
import { X, UploadCloud, AlertCircle } from 'lucide-react';
import { uploadDocument } from '../services/api';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('incident_report');
  const [service, setService] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [version, setVersion] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Title and Content are required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await uploadDocument({
        title: title.trim(),
        type,
        service: service.trim() || undefined,
        date: date || undefined,
        version: version.trim() || undefined,
        content: content.trim(),
      });
      
      // Reset form
      setTitle('');
      setType('incident_report');
      setService('');
      setDate(new Date().toISOString().split('T')[0]);
      setVersion('');
      setContent('');
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to upload document');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2">
            <UploadCloud className="w-5 h-5 text-[#2F9C95]" />
            <h2 className="text-lg font-bold text-gray-900">Upload New Document</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3 text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form id="upload-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Document Title <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Order API latency spike"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:ring-1 focus:ring-[#2F9C95] focus:border-[#2F9C95] text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:ring-1 focus:ring-[#2F9C95] focus:border-[#2F9C95] text-sm bg-white"
                >
                  <option value="incident_report">Incident Report</option>
                  <option value="deployment_note">Deployment Note</option>
                  <option value="postmortem">Postmortem</option>
                  <option value="troubleshooting">Troubleshooting Guide</option>
                  <option value="architecture_note">Architecture Note</option>
                  <option value="customer_complaint">Customer Complaint</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Service (Optional)</label>
                <input
                  type="text"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="e.g. orders-api"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:ring-1 focus:ring-[#2F9C95] focus:border-[#2F9C95] text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:ring-1 focus:ring-[#2F9C95] focus:border-[#2F9C95] text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Version (Optional)</label>
                <input
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g. v2.8.1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:ring-1 focus:ring-[#2F9C95] focus:border-[#2F9C95] text-sm"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-bold text-gray-700">Document Content <span className="text-red-500">*</span></label>
                <label className="cursor-pointer text-xs font-semibold text-[#2F9C95] hover:text-[#247c76] flex items-center space-x-1 bg-[#E5F9E0] px-2 py-1 rounded border border-[#A3F7B5] hover:bg-[#d3e7d1] transition-colors">
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Load from File</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".txt,.md,.json,.csv,.log"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          if (event.target?.result) {
                            setContent(event.target.result as string);
                          }
                        };
                        reader.readAsText(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste the full document content here..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-xs focus:ring-1 focus:ring-[#2F9C95] focus:border-[#2F9C95] text-sm min-h-[160px] resize-y"
                required
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="upload-form"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center px-5 py-2 bg-[#2F9C95] border border-transparent rounded-lg text-sm font-semibold text-white hover:bg-[#247c76] focus:ring-2 focus:ring-offset-2 focus:ring-[#2F9C95] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                Uploading...
              </>
            ) : (
              'Upload Document'
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
