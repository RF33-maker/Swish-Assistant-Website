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
  Plus, 
  Type, 
  BarChart3, 
  Users, 
  Target,
  MessageSquare,
  Grid,
  FileText,
  Palette,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface InlineScoutingEditorProps {
  leagueContext?: {
    leagueId: string;
    leagueName: string;
    gameId?: string;
    homeTeam?: string;
    awayTeam?: string;
  };
  onChatInsert?: (content: string) => void;
}

export default function InlineScoutingEditor({ 
  leagueContext,
  onChatInsert 
}: InlineScoutingEditorProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('New Scouting Report');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
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
    content: '<h1>New Scouting Report</h1><p>Start writing your analysis...</p>',
    onUpdate: ({ editor }) => {
      debouncedSave();
    },
  });

  // Auto-save logic
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument();
    }, 2000); // Save after 2 seconds of inactivity
  }, []);

  const saveDocument = async () => {
    if (!user || !editor) return;

    setIsSaving(true);
    try {
      const content = editor.getJSON();
      const documentData = {
        title: title.trim() || 'Untitled Document',
        content: content,
        context: leagueContext || null,
        owner_id: user.id?.toString() || user.email || 'anonymous',
        status: 'draft',
        updated_at: new Date().toISOString(),
      };

      if (currentDocumentId) {
        // Update existing document
        const { data, error } = await supabase
          .from('scouting_documents')
          .update(documentData)
          .eq('id', currentDocumentId)
          .select()
          .single();

        if (error) {
          console.error('Update error:', error);
          // Create new document if update fails
          await createNewDocument(documentData);
        }
      } else {
        await createNewDocument(documentData);
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving document:', error);
      // Don't show toast for save errors in inline mode - just continue working
    } finally {
      setIsSaving(false);
    }
  };

  const createNewDocument = async (documentData: any) => {
    try {
      const { data, error } = await supabase
        .from('scouting_documents')
        .insert([documentData])
        .select()
        .single();

      if (error) {
        console.error('Create error:', error);
        return;
      }
      
      if (data) {
        setCurrentDocumentId(data.id);
      }
    } catch (error) {
      console.error('Error creating document:', error);
    }
  };

  const insertBlock = (blockType: string) => {
    if (!editor) return;

    let blockContent = '';
    
    switch (blockType) {
      case 'game-header':
        blockContent = `
          <div class="game-header border rounded-lg p-4 mb-4 bg-orange-50">
            <div class="flex justify-between items-center">
              <div class="text-left">
                <h3 class="font-bold text-lg">${leagueContext?.homeTeam || 'Home Team'}</h3>
                <p class="text-sm text-gray-600">Home</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold">VS</p>
                <p class="text-sm text-gray-500">${new Date().toLocaleDateString()}</p>
              </div>
              <div class="text-right">
                <h3 class="font-bold text-lg">${leagueContext?.awayTeam || 'Away Team'}</h3>
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
                <p class="text-2xl font-bold text-orange-600">--.--%</p>
              </div>
              <div>
                <p class="font-medium">Turnover Rate</p>
                <p class="text-2xl font-bold text-red-600">--.--%</p>
              </div>
              <div>
                <p class="font-medium">Offensive Rebound%</p>
                <p class="text-2xl font-bold text-green-600">--.--%</p>
              </div>
              <div>
                <p class="font-medium">Free Throw Rate</p>
                <p class="text-2xl font-bold text-blue-600">--.--%</p>
              </div>
            </div>
          </div>
        `;
        break;
      case 'player-spotlight':
        blockContent = `
          <div class="player-card border rounded-lg p-4 mb-4 bg-gray-50">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 bg-gray-300 rounded-full flex items-center justify-center">
                <span class="text-2xl">👤</span>
              </div>
              <div>
                <h4 class="font-bold text-lg">Player Name</h4>
                <p class="text-gray-600">Position • Team</p>
                <div class="flex gap-4 mt-2">
                  <span class="text-sm"><strong>PPG:</strong> --</span>
                  <span class="text-sm"><strong>RPG:</strong> --</span>
                  <span class="text-sm"><strong>APG:</strong> --</span>
                </div>
              </div>
            </div>
          </div>
        `;
        break;
      case 'ai-insight':
        blockContent = `
          <div class="ai-summary border-2 border-orange-200 rounded-lg p-4 mb-4 bg-orange-50">
            <div class="flex items-center gap-2 mb-2">
              <MessageSquare class="w-4 h-4 text-orange-600" />
              <span class="font-semibold text-orange-800">AI Insight</span>
            </div>
            <p class="text-gray-700">Click here to insert AI-generated insights from the League Assistant...</p>
          </div>
        `;
        break;
      case 'key-stats':
        blockContent = `
          <div class="stat-table border rounded-lg p-4 mb-4">
            <h4 class="font-semibold mb-3">Key Statistics</h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div class="bg-gray-50 p-3 rounded">
                <p class="text-sm text-gray-600">Points</p>
                <p class="text-xl font-bold">--</p>
              </div>
              <div class="bg-gray-50 p-3 rounded">
                <p class="text-sm text-gray-600">Rebounds</p>
                <p class="text-xl font-bold">--</p>
              </div>
              <div class="bg-gray-50 p-3 rounded">
                <p class="text-sm text-gray-600">Assists</p>
                <p class="text-xl font-bold">--</p>
              </div>
              <div class="bg-gray-50 p-3 rounded">
                <p class="text-sm text-gray-600">FG%</p>
                <p class="text-xl font-bold">--%</p>
              </div>
            </div>
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
              @media print { body { margin: 0; } }
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

  const blockMenuItems = [
    { type: 'game-header', icon: Grid, label: 'Game Header', description: 'Teams vs matchup' },
    { type: 'four-factors', icon: BarChart3, label: 'Four Factors', description: 'Key metrics' },
    { type: 'player-spotlight', icon: Users, label: 'Player Spotlight', description: 'Player analysis' },
    { type: 'key-stats', icon: Target, label: 'Key Stats', description: 'Statistics grid' },
    { type: 'ai-insight', icon: MessageSquare, label: 'AI Insight', description: 'Assistant response' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      {/* Compact Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg font-semibold border-none shadow-none p-0 h-auto text-slate-800"
            placeholder="Report title..."
          />
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-orange-600"></div>
                  <span>Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle className="w-3 h-3 text-green-600" />
                  <span>Saved {lastSaved.toLocaleTimeString()}</span>
                </>
              ) : (
                <span>Not saved</span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={exportToPDF} className="text-xs">
              <Download className="w-3 h-3 mr-1" />
              PDF
            </Button>
          </div>
        </div>

        {/* Mobile-Friendly Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBlockMenu(!showBlockMenu)}
            className="text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Block
          </Button>
          
          {editor && (
            <>
              <Button
                variant={editor.isActive('bold') ? 'default' : 'outline'}
                size="sm"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className="text-xs px-2"
              >
                <strong>B</strong>
              </Button>
              <Button
                variant={editor.isActive('italic') ? 'default' : 'outline'}
                size="sm"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className="text-xs px-2"
              >
                <em>I</em>
              </Button>
              <Button
                variant={editor.isActive('heading', { level: 2 }) ? 'default' : 'outline'}
                size="sm"
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className="text-xs px-2"
              >
                H2
              </Button>
            </>
          )}
        </div>

        {/* Mobile-Friendly Block Menu */}
        {showBlockMenu && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {blockMenuItems.map((item) => (
              <Button
                key={item.type}
                variant="outline"
                className="h-auto p-3 text-left justify-start text-xs"
                onClick={() => insertBlock(item.type)}
              >
                <item.icon className="w-4 h-4 mr-2 text-orange-600" />
                <div>
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-gray-500">{item.description}</div>
                </div>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Editor Content */}
      <div className="p-4">
        <EditorContent 
          editor={editor} 
          className="prose max-w-none prose-headings:text-slate-800 prose-p:text-slate-700 prose-sm sm:prose-base"
        />
      </div>
    </div>
  );
}