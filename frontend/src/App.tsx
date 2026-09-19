import { useState, useEffect, useCallback } from 'react';
import type { ActiveTab, HealthStatus, DocumentItem, HopResultItem, CitationItem } from './types';
import { fetchHealth, fetchDocuments } from './services/api';
import { Header } from './components/Header';
import { DocumentDrawer } from './components/DocumentDrawer';
import { InvestigatePage } from './pages/InvestigatePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('investigate');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  // Global Document Drawer state
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | HopResultItem | CitationItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await fetchHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const data = await fetchDocuments();
      setDocuments(data.documents || []);
    } catch (e) {
      console.error('Failed to load documents index', e);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  // Initial load and periodic health telemetry polling
  useEffect(() => {
    loadHealth();
    loadDocs();

    const healthInterval = setInterval(() => {
      loadHealth();
    }, 6000);

    return () => clearInterval(healthInterval);
  }, [loadHealth, loadDocs]);

  const handleOpenDoc = (doc: DocumentItem | HopResultItem | CitationItem) => {
    // If doc only has preview, try looking up full content in documents cache
    const docId = 'document_id' in doc ? doc.document_id : doc.doc_id;
    const cachedFull = documents.find((d) => d.document_id === docId);

    if (cachedFull && cachedFull.content && (!('content' in doc) || !doc.content)) {
      setSelectedDoc({ ...doc, content: cachedFull.content } as DocumentItem);
    } else {
      setSelectedDoc(doc);
    }
    setDrawerOpen(true);
  };

  const handleSelectRelatedDoc = (docId: string) => {
    const found = documents.find((d) => d.document_id === docId);
    if (found) {
      setSelectedDoc(found);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f6fbf5] text-[#1f2937]">
      {/* Top Navigation Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        health={health}
        healthLoading={healthLoading}
      />

      {/* Main Page Content */}
      <main className="flex-1 pb-16">
        {activeTab === 'investigate' && (
          <InvestigatePage
            onSelectDoc={handleOpenDoc}
            allDocsCache={documents}
          />
        )}

        {activeTab === 'documents' && (
          <DocumentsPage
            documents={documents}
            loading={docsLoading}
            onRefresh={loadDocs}
            onSelectDoc={handleOpenDoc}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsDashboard />
        )}
      </main>

      {/* Global Slide-over Document Drawer */}
      <DocumentDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        document={selectedDoc}
        allEvidence={documents}
        onSelectRelatedDoc={handleSelectRelatedDoc}
      />
    </div>
  );
}
