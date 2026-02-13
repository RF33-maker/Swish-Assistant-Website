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
  CheckCircle,
  ArrowLeft,
  Sparkles,
  ChevronUp,
  Settings,
  Bold,
  Italic,
  List,
  Heading2,
  Quote,
  Image as ImageIcon,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import LeagueChatbot from '@/components/LeagueChatbot';

interface MobileScoutingEditorProps {
  leagueContext?: {
    leagueId: string;
    leagueName: string;
    gameId?: string;
    homeTeam?: string;
    awayTeam?: string;
  };
  onChatInsert?: (content: string) => void;
}

interface ScoutingBlock {
  id: string;
  type: 'text' | 'heading' | 'stat-table' | 'player-card' | 'four-factors' | 'tendencies' | 'ai-summary';
  icon: any;
  title: string;
  description: string;
  template?: any;
}

const scoutingBlocks: ScoutingBlock[] = [
  {
    id: 'text',
    type: 'text',
    icon: Type,
    title: 'Text Block',
    description: 'Add paragraphs, lists, or formatted text',
    template: { type: 'paragraph', content: [{ type: 'text', text: 'Start typing...' }] }
  },
  {
    id: 'heading',
    type: 'heading',
    icon: Heading2,
    title: 'Heading',
    description: 'Section title or heading',
    template: { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section Title' }] }
  },
  {
    id: 'stat-table',
    type: 'stat-table',
    icon: BarChart3,
    title: 'Stat Table',
    description: 'Player statistics and performance data',
    template: { 
      type: 'paragraph', 
      content: [{ 
        type: 'text', 
        text: '📊 Player Stats\n\nPlayer | PTS | REB | AST\n------ | --- | --- | ---\nPlayer 1 | 25 | 8 | 6\nPlayer 2 | 18 | 12 | 4' 
      }] 
    }
  },
  {
    id: 'player-card',
    type: 'player-card',
    icon: Users,
    title: 'Player Card',
    description: 'Individual player profile and stats',
    template: { 
      type: 'paragraph', 
      content: [{ 
        type: 'text', 
        text: '👤 Player Profile\n\nName: [Player Name]\nPosition: [Position]\nKey Stats: [Stats]\n\nStrengths:\n• [Strength 1]\n• [Strength 2]\n\nAreas for Improvement:\n• [Area 1]\n• [Area 2]' 
      }] 
    }
  },
  {
    id: 'four-factors',
    type: 'four-factors',
    icon: Target,
    title: 'Four Factors',
    description: 'Defensive analysis and key metrics',
    template: { 
      type: 'paragraph', 
      content: [{ 
        type: 'text', 
        text: '🎯 Four Factors Analysis\n\n1. Effective Field Goal %: [Value]\n2. Turnover Rate: [Value]\n3. Offensive Rebound %: [Value]\n4. Free Throw Rate: [Value]\n\nKey Insights:\n• [Insight 1]\n• [Insight 2]' 
      }] 
    }
  },
  {
    id: 'tendencies',
    type: 'tendencies',
    icon: Grid,
    title: 'Team Tendencies',
    description: 'Behavioral patterns and strategies',
    template: { 
      type: 'paragraph', 
      content: [{ 
        type: 'text', 
        text: '📈 Team Tendencies\n\nOffensive Patterns:\n• [Pattern 1]\n• [Pattern 2]\n\nDefensive Strategies:\n• [Strategy 1]\n• [Strategy 2]\n\nSituational Plays:\n• [Situation 1]\n• [Situation 2]' 
      }] 
    }
  },
  {
    id: 'ai-summary',
    type: 'ai-summary',
    icon: Sparkles,
    title: 'AI Summary',
    description: 'Generated insights and analysis',
    template: { 
      type: 'paragraph', 
      content: [{ 
        type: 'text', 
        text: '✨ AI-Generated Summary\n\n[This section will be populated with AI-generated insights based on league data and game analysis.]' 
      }] 
    }
  }
];

export default function MobileScoutingEditor({ 
  leagueContext,
  onChatInsert 
}: MobileScoutingEditorProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('New Scouting Report');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const canvasRef = useRef<HTMLDivElement>(null);

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

  // Mobile zoom handling
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && window.innerWidth < 640) {
        const containerWidth = canvasRef.current.offsetWidth;
        const scale = Math.min(containerWidth / 820, 1);
        setZoomLevel(scale);
      } else {
        setZoomLevel(1);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-save logic
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveDocument();
    }, 600); // Mobile-optimized save timing
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
        const { data, error } = await supabase
          .from('scouting_documents')
          .update(documentData)
          .eq('id', currentDocumentId)
          .select()
          .single();

        if (error) {
          console.error('Update error:', error);
          await createNewDocument(documentData);
        }
      } else {
        await createNewDocument(documentData);
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Error saving document:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const createNewDocument = async (documentData: any) => {
    try {
      // Use a simpler approach for document creation - store in localStorage for now
      // to avoid Supabase table issues
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const docWithId = { ...documentData, id: docId };
      
      // Store in localStorage as fallback
      localStorage.setItem(`scouting_doc_${docId}`, JSON.stringify(docWithId));
      setCurrentDocumentId(docId);
      
      // Still try Supabase but don't fail if it doesn't work
      try {
        const { data, error } = await supabase
          .from('scouting_documents')
          .insert([documentData])
          .select()
          .single();

        if (!error && data) {
          setCurrentDocumentId(data.id);
          // Remove from localStorage if Supabase worked
          localStorage.removeItem(`scouting_doc_${docId}`);
        }
      } catch (supabaseError) {
      }
    } catch (error) {
      console.error('Error creating document:', error);
    }
  };

  const insertBlock = (block: ScoutingBlock) => {
    if (editor && block.template) {
      editor.chain().focus().insertContent(block.template).run();
    }
    setShowBlockMenu(false);
  };

  const exportDocument = async () => {
    // TODO: Implement PDF export functionality
    toast({
      title: "Export",
      description: "PDF export coming soon!",
    });
  };

  if (!editor) return null;

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_minmax(740px,1fr)_320px] gap-3 relative">
      {/* Left Sidebar - Blocks/Templates (hidden on mobile) */}
      <aside className="hidden md:block p-3 bg-gray-50 border-r">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-slate-800 mb-3">Blocks</h3>
            <div className="space-y-2">
              {scoutingBlocks.map((block) => {
                const Icon = block.icon;
                return (
                  <button
                    key={block.id}
                    onClick={() => insertBlock(block)}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-5 h-5 text-orange-600" />
                      <div>
                        <div className="font-medium text-slate-800">{block.title}</div>
                        <div className="text-xs text-slate-500">{block.description}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 mb-3">Templates</h3>
            <div className="space-y-2">
              <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-orange-600" />
                  <div>
                    <div className="font-medium text-slate-800">Game Analysis</div>
                    <div className="text-xs text-slate-500">Pre-game scouting template</div>
                  </div>
                </div>
              </button>
              <button className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-orange-600" />
                  <div>
                    <div className="font-medium text-slate-800">Player Report</div>
                    <div className="text-xs text-slate-500">Individual player analysis</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Center - A4 Canvas */}
      <main className="p-3">
        {/* Mobile Top App Bar */}
        <div className="flex items-center justify-between mb-4 md:hidden">
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold border-none shadow-none p-0 h-auto"
                placeholder="Document title"
              />
              <div className="text-xs text-slate-500">
                {isSaving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Not saved'}
              </div>
            </div>
          </div>
        </div>

        {/* A4 Canvas Container */}
        <div className="a4-viewport overflow-hidden touch-pan-y" ref={canvasRef}>
          <div 
            className="a4-zoom transition-transform duration-200" 
            style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}
          >
            {/* A4 Page */}
            <article className="a4-page bg-white shadow-lg rounded-lg p-8 mx-auto" style={{ 
              aspectRatio: '1 / 1.414',
              width: 'min(100%, 820px)',
              maxWidth: '820px'
            }}>
              {/* Desktop Title */}
              <div className="hidden md:block mb-6">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="text-2xl font-bold border-none shadow-none p-0 h-auto"
                  placeholder="Document title"
                />
                <div className="text-sm text-slate-500 mt-1">
                  {isSaving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : 'Not saved'}
                </div>
              </div>

              {/* TipTap Editor */}
              <EditorContent 
                editor={editor} 
                className="prose prose-lg max-w-none min-h-[600px] focus:outline-none"
              />
            </article>
          </div>
        </div>
      </main>

      {/* Right Sidebar - Inspector/Assistant (hidden on tablet/mobile) */}
      <aside className="hidden lg:block p-3 bg-gray-50 border-l">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-slate-800 mb-3">League Assistant</h3>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              {leagueContext ? (
                <LeagueChatbot
                  leagueId={leagueContext.leagueId}
                  leagueName={leagueContext.leagueName}
                  onResponseReceived={(content) => {
                    if (editor && onChatInsert) {
                      editor.chain().focus().insertContent(`<p>${content}</p>`).run();
                      onChatInsert(content);
                    }
                  }}
                />
              ) : (
                <div className="text-center text-slate-500 py-4">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm">Select a league to enable AI assistant</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 mb-3">Export</h3>
            <div className="space-y-2">
              <button 
                onClick={exportDocument}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition"
              >
                <div className="flex items-center gap-3">
                  <Download className="w-5 h-5 text-orange-600" />
                  <div>
                    <div className="font-medium text-slate-800">Export PDF</div>
                    <div className="text-xs text-slate-500">A4 format</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-white/95 backdrop-blur border-t p-2 flex justify-between" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button 
          onClick={() => setShowBlockMenu(true)}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Block</span>
        </button>
        <button 
          onClick={() => setShowAssistant(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Sparkles className="w-4 h-4" />
          <span>AI</span>
        </button>
        <button 
          onClick={() => setShowExport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
        >
          <Download className="w-4 h-4" />
          <span>Export</span>
        </button>
      </div>

      {/* Mobile Block Menu Sheet */}
      {showBlockMenu && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowBlockMenu(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-lg p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Add Block</h3>
              <button 
                onClick={() => setShowBlockMenu(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {scoutingBlocks.map((block) => {
                const Icon = block.icon;
                return (
                  <button
                    key={block.id}
                    onClick={() => insertBlock(block)}
                    className="p-4 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition text-left"
                  >
                    <Icon className="w-8 h-8 text-orange-600 mb-2" />
                    <div className="font-medium text-slate-800 mb-1">{block.title}</div>
                    <div className="text-xs text-slate-500">{block.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Assistant Sheet */}
      {showAssistant && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowAssistant(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-lg p-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">League Assistant</h3>
              <button 
                onClick={() => setShowAssistant(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
            {leagueContext ? (
              <LeagueChatbot
                leagueId={leagueContext.leagueId}
                leagueName={leagueContext.leagueName}
                onResponseReceived={(content) => {
                  if (editor && onChatInsert) {
                    editor.chain().focus().insertContent(`<p>${content}</p>`).run();
                    onChatInsert(content);
                  }
                }}
              />
            ) : (
              <div className="text-center text-slate-500 py-8">
                <Sparkles className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <p className="text-lg font-medium mb-2">No League Selected</p>
                <p className="text-sm">Select a league to enable AI assistant</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Assistant Widget (always visible when league is selected) */}
      {!showAssistant && leagueContext && (
        <div className="fixed bottom-20 right-4 z-40 md:bottom-6 lg:hidden">
          <div className="relative">
            <button
              onClick={() => setShowAssistant(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 animate-pulse"
            >
              <Sparkles className="w-6 h-6" />
            </button>
            <div className="absolute -top-12 right-0 bg-slate-800 text-white px-3 py-1 rounded-lg text-sm whitespace-nowrap opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
              AI Assistant
            </div>
          </div>
        </div>
      )}
    </div>
  );
}