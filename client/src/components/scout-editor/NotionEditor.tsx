import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText, Palette, Settings } from 'lucide-react';
import TemplateGallery from './TemplateGallery';
import ScoutingEditor from './ScoutingEditor';
import type { ScoutingDocument, DocumentTemplate } from '@shared/schema';

interface NotionEditorProps {
  leagueContext?: {
    leagueId: string;
    leagueName: string;
    gameId?: string;
    homeTeam?: string;
    awayTeam?: string;
  };
  onClose?: () => void;
  onChatInsert?: (content: string) => void;
  initialDocumentId?: string;
}

export default function NotionEditor({ 
  leagueContext, 
  onClose, 
  onChatInsert,
  initialDocumentId 
}: NotionEditorProps) {
  const { user } = useAuth();
  const [currentView, setCurrentView] = useState<'gallery' | 'editor'>('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
  const [currentDocument, setCurrentDocument] = useState<ScoutingDocument | null>(null);
  const [documentId, setDocumentId] = useState<string | undefined>(initialDocumentId);

  // If initialDocumentId is provided, go directly to editor
  useEffect(() => {
    if (initialDocumentId) {
      setCurrentView('editor');
    }
  }, [initialDocumentId]);

  const handleSelectTemplate = (templateId: string, template: DocumentTemplate) => {
    setSelectedTemplate(template);
    setDocumentId(undefined); // Clear document ID when using template
    setCurrentView('editor');
  };

  const handleCreateBlank = () => {
    setSelectedTemplate(null);
    setDocumentId(undefined);
    setCurrentView('editor');
  };

  const handleBackToGallery = () => {
    setCurrentView('gallery');
    setSelectedTemplate(null);
    setCurrentDocument(null);
    setDocumentId(undefined);
  };

  const handleDocumentChange = (doc: ScoutingDocument) => {
    setCurrentDocument(doc);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              {currentView === 'editor' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToGallery}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Templates
                </Button>
              )}
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <FileText className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-800">
                    {currentView === 'gallery' ? 'Document Templates' : 'Scouting Editor'}
                  </h1>
                  {leagueContext && (
                    <p className="text-sm text-slate-500">{leagueContext.leagueName}</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {currentDocument && (
                <div className="text-sm text-slate-600">
                  <span className="font-medium">{currentDocument.title}</span>
                  <span className="mx-2">•</span>
                  <span className="text-slate-500">
                    {currentDocument.status === 'draft' ? 'Draft' : 'Published'}
                  </span>
                </div>
              )}
              
              {onClose && (
                <Button variant="outline" size="sm" onClick={onClose}>
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'gallery' ? (
          <TemplateGallery
            onSelectTemplate={handleSelectTemplate}
            onCreateBlank={handleCreateBlank}
            leagueContext={leagueContext}
          />
        ) : (
          <ScoutingEditor
            documentId={documentId}
            templateId={selectedTemplate?.id}
            leagueContext={leagueContext}
            onDocumentChange={handleDocumentChange}
            onChatInsert={onChatInsert}
          />
        )}
      </div>
    </div>
  );
}