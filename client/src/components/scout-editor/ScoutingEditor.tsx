import { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Save, 
  Download, 
  FileText, 
  Plus, 
  MoreHorizontal, 
  Type, 
  BarChart3, 
  Users, 
  Target,
  MessageSquare,
  Grid,
  Camera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScoutingDocument, DocumentTemplate } from '@shared/schema';
import { toast } from '@/hooks/use-toast';

interface Block {
  id: string;
  type: 'game-header' | 'four-factors' | 'player-card' | 'stat-table' | 'ai-summary' | 'text';
  content: any;
  position: number;
}

interface ScoutingEditorProps {
  documentId?: string;
  templateId?: string;
  leagueContext?: {
    leagueId: string;
    leagueName: string;
    gameId?: string;
    homeTeam?: string;
    awayTeam?: string;
  };
  onDocumentChange?: (doc: ScoutingDocument) => void;
  onChatInsert?: (content: string) => void;
}

export default function ScoutingEditor({ 
  documentId, 
  templateId, 
  leagueContext,
  onDocumentChange,
  onChatInsert 
}: ScoutingEditorProps) {
  const { user } = useAuth();
  const [document, setDocument] = useState<ScoutingDocument | null>(null);
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'What\'s the title?';
          }
          return 'Press "/" for commands or start typing...';
        },
      }),
    ],
    content: '<h1></h1><p></p>',
    onUpdate: ({ editor }) => {
      debouncedSave();
    },
  });

  // Initialize document
  useEffect(() => {
    if (documentId) {
      loadDocument(documentId);
    } else if (templateId) {
      loadFromTemplate(templateId);
    } else {
      // Create new blank document
      createBlankDocument();
    }
  }, [documentId, templateId]);

  // Auto-save logic
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument();
    }, 2000); // Save after 2 seconds of inactivity
  }, []);

  const loadDocument = async (docId: string) => {
    try {
      const { data, error } = await supabase
        .from('scouting_documents')
        .select('*')
        .eq('id', docId)
        .single();

      if (error) throw error;

      if (data) {
        setDocument(data);
        setTitle(data.title);
        if (editor && data.content) {
          editor.commands.setContent(data.content);
        }
      }
    } catch (error) {
      console.error('Error loading document:', error);
      toast({
        title: 'Error',
        description: 'Failed to load document',
        variant: 'destructive',
      });
    }
  };

  const loadFromTemplate = async (tempId: string) => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('id', tempId)
        .single();

      if (error) throw error;

      if (data) {
        setTitle(`New ${data.name}`);
        if (editor && data.content) {
          // Resolve smart variables in template
          const resolvedContent = resolveSmartVariables(data.content, leagueContext);
          editor.commands.setContent(resolvedContent);
        }
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast({
        title: 'Error',
        description: 'Failed to load template',
        variant: 'destructive',
      });
    }
  };

  const createBlankDocument = () => {
    setTitle('Untitled Document');
    if (editor) {
      editor.commands.setContent('<h1>Untitled Document</h1><p>Start writing your scouting report...</p>');
    }
  };

  const resolveSmartVariables = (content: any, context?: any): any => {
    if (!context) return content;
    
    let resolvedContent = JSON.stringify(content);
    
    // Replace common smart variables
    if (context.leagueName) {
      resolvedContent = resolvedContent.replace(/\{\{league\.name\}\}/g, context.leagueName);
    }
    if (context.homeTeam) {
      resolvedContent = resolvedContent.replace(/\{\{game\.homeTeam\}\}/g, context.homeTeam);
    }
    if (context.awayTeam) {
      resolvedContent = resolvedContent.replace(/\{\{game\.awayTeam\}\}/g, context.awayTeam);
    }
    if (context.gameDate) {
      resolvedContent = resolvedContent.replace(/\{\{game\.date\}\}/g, context.gameDate);
    }

    return JSON.parse(resolvedContent);
  };

  const saveDocument = async () => {
    if (!user || !editor) return;

    setIsSaving(true);
    try {
      const content = editor.getJSON();
      const documentData = {
        title: title.trim() || 'Untitled Document',
        content: content,
        context: leagueContext || null,
        ownerId: user.id?.toString() || user.email || 'anonymous',
        templateId: templateId || null,
        status: 'draft' as const,
        updatedAt: new Date().toISOString(),
      };

      if (document?.id) {
        // Update existing document
        const { data, error } = await supabase
          .from('scouting_documents')
          .update(documentData)
          .eq('id', document.id)
          .select()
          .single();

        if (error) throw error;
        
        if (data) {
          setDocument(data);
          onDocumentChange?.(data);
        }
      } else {
        // Create new document
        const { data, error } = await supabase
          .from('scouting_documents')
          .insert([documentData])
          .select()
          .single();

        if (error) throw error;
        
        if (data) {
          setDocument(data);
          onDocumentChange?.(data);
        }
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving document:', error);
      toast({
        title: 'Error',
        description: 'Failed to save document',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const insertBlock = (blockType: Block['type']) => {
    if (!editor) return;

    let blockContent = '';
    
    switch (blockType) {
      case 'game-header':
        blockContent = `
          <div class="game-header border rounded-lg p-4 mb-4 bg-orange-50">
            <div class="flex justify-between items-center">
              <div class="text-left">
                <h3 class="font-bold text-lg">${leagueContext?.homeTeam || '{{game.homeTeam}}'}</h3>
                <p class="text-sm text-gray-600">Home</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold">VS</p>
                <p class="text-sm text-gray-500">${new Date().toLocaleDateString()}</p>
              </div>
              <div class="text-right">
                <h3 class="font-bold text-lg">${leagueContext?.awayTeam || '{{game.awayTeam}}'}</h3>
                <p class="text-sm text-gray-600">Away</p>
              </div>
            </div>
          </div>
        `;
        break;
      case 'four-factors':
        blockContent = `
          <div class="four-factors border rounded-lg p-4 mb-4">
            <h3 class="font-semibold mb-3">Four Factors Analysis</h3>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <p class="font-medium">Effective FG%</p>
                <p class="text-2xl font-bold text-orange-600">52.4%</p>
              </div>
              <div>
                <p class="font-medium">Turnover Rate</p>
                <p class="text-2xl font-bold text-red-600">14.2%</p>
              </div>
              <div>
                <p class="font-medium">Offensive Rebound%</p>
                <p class="text-2xl font-bold text-green-600">28.5%</p>
              </div>
              <div>
                <p class="font-medium">Free Throw Rate</p>
                <p class="text-2xl font-bold text-blue-600">22.1%</p>
              </div>
            </div>
          </div>
        `;
        break;
      case 'player-card':
        blockContent = `
          <div class="player-card border rounded-lg p-4 mb-4 bg-gray-50">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center">
                <span class="text-2xl font-bold">📸</span>
              </div>
              <div>
                <h4 class="font-bold text-lg">Player Name</h4>
                <p class="text-gray-600">Position • Team</p>
                <div class="flex gap-4 mt-2">
                  <span class="text-sm"><strong>PPG:</strong> 18.5</span>
                  <span class="text-sm"><strong>RPG:</strong> 7.2</span>
                  <span class="text-sm"><strong>APG:</strong> 4.1</span>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
      case 'ai-summary':
        blockContent = `
          <div class="ai-summary border-2 border-orange-200 rounded-lg p-4 mb-4 bg-orange-50">
            <div class="flex items-center gap-2 mb-2">
              <MessageSquare className="w-4 h-4 text-orange-600" />
              <span class="font-semibold text-orange-800">AI Analysis</span>
            </div>
            <p class="text-gray-700">Click here to insert AI-generated insights...</p>
          </div>
        `;
        break;
      case 'stat-table':
        blockContent = `
          <div class="stat-table border rounded-lg p-4 mb-4">
            <h4 class="font-semibold mb-3">Player Statistics</h4>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b">
                  <th class="text-left p-2">Player</th>
                  <th class="text-right p-2">PTS</th>
                  <th class="text-right p-2">REB</th>
                  <th class="text-right p-2">AST</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b">
                  <td class="p-2">Player Name</td>
                  <td class="text-right p-2">22</td>
                  <td class="text-right p-2">8</td>
                  <td class="text-right p-2">5</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
        break;
    }

    editor.commands.focus();
    editor.commands.insertContent(blockContent);
    setShowBlockMenu(false);
  };

  const exportToPDF = async () => {
    if (!editor) return;
    
    // Create a new window with the document content for printing
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const content = editor.getHTML();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .game-header { background: #fff7ed; border: 1px solid #fed7aa; padding: 16px; margin-bottom: 16px; border-radius: 8px; }
              .four-factors { border: 1px solid #e5e7eb; padding: 16px; margin-bottom: 16px; border-radius: 8px; }
              .player-card { background: #f9fafb; border: 1px solid #e5e7eb; padding: 16px; margin-bottom: 16px; border-radius: 8px; }
              .ai-summary { background: #fff7ed; border: 2px solid #fed7aa; padding: 16px; margin-bottom: 16px; border-radius: 8px; }
              .stat-table { border: 1px solid #e5e7eb; padding: 16px; margin-bottom: 16px; border-radius: 8px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
              @media print {
                body { margin: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <h1>${title}</h1>
            ${content}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Handle chat message insertion
  const insertChatResponse = (message: string) => {
    if (!editor) return;
    
    const aiSummaryBlock = `
      <div class="ai-summary border-2 border-orange-200 rounded-lg p-4 mb-4 bg-orange-50">
        <div class="flex items-center gap-2 mb-2">
          <span class="font-semibold text-orange-800">AI Insight</span>
        </div>
        <p class="text-gray-700">${message}</p>
      </div>
    `;
    
    editor.commands.focus();
    editor.commands.insertContent(aiSummaryBlock);
    onChatInsert?.(message);
  };

  // Expose insertChatResponse to parent components
  useEffect(() => {
    if (onChatInsert) {
      window.insertToScoutingEditor = insertChatResponse;
    }
    return () => {
      if (window.insertToScoutingEditor) {
        delete window.insertToScoutingEditor;
      }
    };
  }, [onChatInsert]);

  const blockMenuItems = [
    { type: 'game-header', icon: Grid, label: 'Game Header', description: 'Teams, date, and score' },
    { type: 'four-factors', icon: BarChart3, label: 'Four Factors', description: 'Key performance metrics' },
    { type: 'player-card', icon: Users, label: 'Player Card', description: 'Player profile and stats' },
    { type: 'stat-table', icon: Target, label: 'Stat Table', description: 'Sortable statistics table' },
    { type: 'ai-summary', icon: MessageSquare, label: 'AI Summary', description: 'AI-generated insights' },
  ];

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-2xl font-bold border-none shadow-none p-0 h-auto"
            placeholder="Document title..."
          />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {isSaving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Not saved'}
            </span>
            <Button variant="outline" size="sm" onClick={saveDocument} disabled={isSaving}>
              <Save className="w-4 h-4 mr-1" />
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <Download className="w-4 h-4 mr-1" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBlockMenu(!showBlockMenu)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Block
          </Button>
          
          {editor && (
            <>
              <Button
                variant={editor.isActive('bold') ? 'default' : 'outline'}
                size="sm"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <strong>B</strong>
              </Button>
              <Button
                variant={editor.isActive('italic') ? 'default' : 'outline'}
                size="sm"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <em>I</em>
              </Button>
              <Button
                variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'outline'}
                size="sm"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              >
                H2
              </Button>
            </>
          )}
        </div>

        {/* Block Menu */}
        {showBlockMenu && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {blockMenuItems.map((item) => (
              <Button
                key={item.type}
                variant="outline"
                className="h-auto p-3 text-left justify-start"
                onClick={() => insertBlock(item.type as Block['type'])}
              >
                <item.icon className="w-5 h-5 mr-3 text-orange-600" />
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.description}</div>
                </div>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="p-6">
        <EditorContent 
          editor={editor} 
          className="prose max-w-none prose-headings:text-slate-800 prose-p:text-slate-700"
        />
      </div>
    </div>
  );
}

// Global function for external components to insert content
declare global {
  interface Window {
    insertToScoutingEditor?: (message: string) => void;
  }
}