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
      const { data, error } = await supabase
        .from('scouting_documents')
        .insert([documentData])
        .select()
        .single();

      if (error) {
        console.error('Create error:', error);
      } else {
        setCurrentDocumentId(data.id);
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
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_minmax(740px,1fr)_320px] gap-3">
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
            <h3 className="font-semibold text-slate-800 mb-3">Assistant</h3>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <span className="font-medium">AI Helper</span>
              </div>
              <p className="text-sm text-slate-600 mb-3">
                Ask for insights about your league data or help with analysis.
              </p>
              <button 
                onClick={() => setShowAssistant(true)}
                className="w-full bg-blue-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-blue-700 transition"
              >
                Open Assistant
              </button>
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
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  Summarize opponent defense
                </button>
                <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  Player tendencies
                </button>
                <button className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                  Key matchups
                </button>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Ask about your league data..." className="flex-1" />
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Sparkles className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-sm text-slate-600">
                AI responses will be inserted into your report at the cursor position.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}