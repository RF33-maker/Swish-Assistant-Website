import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import LeagueChatbot from '@/components/LeagueChatbot';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  FileText,
  Save,
  Download,
  Sparkles,
  MessageCircle,
  Type,
  Hash,
  Table,
  User,
  Target,
  TrendingUp,
  BarChart3,
  Menu,
  X,
  Plus,
  Palette
} from 'lucide-react';
import { safelyParseReport } from "@/utils/parseReport";
import { ScoutingReport } from "@/types/reportSchema";
import ReportPreview from "@/components/scout-templates/ReportPreview";
import { templates } from "@/components/scout-templates";

interface UnifiedScoutingEditorProps {
  leagueContext?: {
    leagueId: string;
    leagueName: string;
  };
  onChatInsert?: (content: string) => void;
  reportData?: any;
  onReportDataChange?: (data: any) => void;
  selectedTemplateId?: string;
  onTemplateChange?: (id: string) => void;
  parseError?: string | null;
}

const isVisualTemplate = Boolean(selectedTemplateId && selectedTemplateId.length > 0);

const EMPTY_REPORT: ScoutingReport = {
  meta: {
    player: "—",
    team: "—",
    opponent: null,
    gameDate: null,
    position: null,
    age: null,
    height: null,
    weight: null,
    photoUrl: null,
  },
  stats: {
    ppg: null, rpg: null, apg: null, spg: null, bpg: null,
    fgPct: null, tpPct: null, ftPct: null,
  },
  strengths: [],
  weaknesses: [],
};


const blockTypes = [
  {
    id: 'text',
    name: 'Text Block',
    icon: Type,
    description: 'Add paragraphs, lists, or formatted text',
    template: '<p>Start writing your analysis...</p>'
  },
  {
    id: 'heading',
    name: 'Heading',
    icon: Hash,
    description: 'Section title or heading',
    template: '<h2>Section Title</h2>'
  },
  {
    id: 'stats',
    name: 'Stat Table',
    icon: Table,
    description: 'Player statistics and performance data',
    template: `<table>
      <tr><th>Player</th><th>PPG</th><th>RPG</th><th>APG</th></tr>
      <tr><td>Player Name</td><td>0.0</td><td>0.0</td><td>0.0</td></tr>
    </table>`
  },
  {
    id: 'player',
    name: 'Player Card',
    icon: User,
    description: 'Individual player profile and stats',
    template: '<h3>Player Name</h3><p><strong>Position:</strong> Guard</p><p><strong>Key Stats:</strong> Add stats here</p>'
  },
  {
    id: 'factors',
    name: 'Four Factors',
    icon: Target,
    description: 'Defensive analysis and key metrics',
    template: '<h3>Four Factors Analysis</h3><ul><li>Effective Field Goal %</li><li>Turnover Rate</li><li>Offensive Rebounding %</li><li>Free Throw Rate</li></ul>'
  },
  {
    id: 'tendencies',
    name: 'Team Tendencies',
    icon: TrendingUp,
    description: 'Behavioral patterns and strategies',
    template: '<h3>Team Tendencies</h3><ul><li>Offensive patterns</li><li>Defensive schemes</li><li>Key matchups</li></ul>'
  }
];

const gameTemplates = [
  {
    name: 'Game Analysis',
    content: '<h1>Game Analysis Report</h1><h2>Team Overview</h2><p>Analysis content here...</p><h2>Key Players</h2><p>Player analysis...</p><h2>Strategic Insights</h2><p>Strategic recommendations...</p>',
    type: 'document'
  },
  {
    name: 'Player Scouting',
    content: '<h1>Player Scouting Report</h1><h2>Player Profile</h2><p>Basic information and position...</p><h2>Strengths</h2><p>Key strengths...</p><h2>Areas for Improvement</h2><p>Development areas...</p>',
    type: 'document'
  },
  {
    name: 'Opponent Preview',
    content: '<h1>Opponent Preview</h1><h2>Team Style</h2><p>Playing style and strategy...</p><h2>Key Matchups</h2><p>Important matchups to watch...</p><h2>Game Plan</h2><p>Strategic approach...</p>',
    type: 'document'
  }
];

// Add professional scouting report templates
const scoutingReportTemplates = [
  {
    name: 'Clean Pro',
    id: 'clean-pro',
    description: 'Professional player scouting card with stats and analysis',
    type: 'visual'
  }
];

export default function UnifiedScoutingEditor({ 
  leagueContext, 
  onChatInsert, 
  reportData, 
  onReportDataChange, 
  selectedTemplateId = "clean-pro", 
  onTemplateChange, 
  parseError 
}: UnifiedScoutingEditorProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('blocks');
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [documentTitle, setDocumentTitle] = useState('New Scouting Report');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Highlight,
      Placeholder.configure({
        placeholder: 'Start writing your analysis...'
      })
    ],
    content: '<h1>New Scouting Report</h1><p>Start writing your analysis...</p>',
    onUpdate: ({ editor }) => {
      saveDocument();
    }
  });

  const saveDocument = async () => {
    if (!editor || !user || isSaving) return;
    
    setIsSaving(true);
    try {
      const content = editor.getHTML();
      
      if (currentDocumentId) {
        await supabase
          .from('scouting_reports')
          .update({
            title: documentTitle,
            content,
            updated_at: new Date().toISOString()
          })
          .eq('id', currentDocumentId);
      } else {
        const { data, error } = await supabase
          .from('scouting_reports')
          .insert({
            title: documentTitle,
            content,
            user_id: user.id,
            league_id: leagueContext?.leagueId || null
          })
          .select('id')
          .single();
        
        if (data) {
          setCurrentDocumentId(data.id);
        }
      }
    } catch (error) {
      console.error('Error saving document:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const insertBlock = (block: typeof blockTypes[0]) => {
    if (editor) {
      editor.chain().focus().insertContent(block.template).run();
    }
  };

  const insertTemplate = (template: typeof gameTemplates[0]) => {
    if (editor) {
      editor.chain().focus().setContent(template.content).run();
      setDocumentTitle(template.name);
    }
  };

  const handleScoutingTemplateSelect = (templateId: string) => {
    onTemplateChange?.(templateId);
  };

  const handleSampleDataPreview = () => {
    // Sample data to demonstrate the template
    const sampleData: ScoutingReport = {
      meta: {
        player: "Sample Player",
        team: "Demo Team", 
        opponent: "Opposition FC",
        gameDate: "2025-01-15",
        position: "Point Guard",
        age: 22,
        height: "6'2\"",
        weight: "185 lbs",
        photoUrl: null
      },
      stats: {
        ppg: 18.5,
        rpg: 6.2,
        apg: 4.8,
        spg: 1.5,
        bpg: 0.8,
        fgPct: 45.2,
        tpPct: 38.7,
        ftPct: 82.4
      },
      strengths: [
        "Excellent court vision and passing ability",
        "Strong three-point shooting percentage", 
        "Good defensive positioning and anticipation",
        "High basketball IQ and decision making"
      ],
      weaknesses: [
        "Could improve strength for finishing at the rim",
        "Sometimes rushes shots under pressure",
        "Needs to work on left-hand dribbling"
      ]
    };
    onReportDataChange?.(sampleData);
  };

  const exportDocument = () => {
    if (!editor) return;
    
    const content = editor.getHTML();
    const blob = new Blob([`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${documentTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            h1, h2, h3 { color: #333; }
            table { border-collapse: collapse; width: 100%; margin: 20px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `], { type: 'text/html' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentTitle.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Document exported",
      description: "Your scouting report has been downloaded"
    });
  };

  if (!editor) return null;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-orange-600" />
          <Input
            value={documentTitle}
            onChange={(e) => setDocumentTitle(e.target.value)}
            className="text-lg font-semibold border-none bg-transparent p-0 h-auto focus-visible:ring-0"
          />
          <Badge variant="secondary" className="text-xs">
            {isSaving ? 'Saving...' : 'Saved'}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button onClick={exportDocument} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            variant="outline" 
            size="sm"
            className="md:hidden"
          >
            {showMobileMenu ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* Desktop Sidebar */}
          <Panel defaultSize={30} minSize={20} maxSize={50} className="hidden md:flex">
            <aside className="w-full bg-gray-50 border-r border-gray-200 flex flex-col">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
                <div className="p-4 border-b border-gray-200 bg-white">
                  <TabsList className="grid w-full grid-cols-3 h-12 bg-gray-100 p-1 rounded-lg">
                    <TabsTrigger 
                      value="blocks" 
                      className="text-sm font-medium data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                    >
                      Blocks
                    </TabsTrigger>
                    <TabsTrigger 
                      value="templates" 
                      className="text-sm font-medium data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                    >
                      Templates
                    </TabsTrigger>
                    <TabsTrigger 
                      value="assistant" 
                      className="text-sm font-medium data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                    >
                      AI Assistant
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  <TabsContent value="blocks" className="mt-0 space-y-2">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">Content Blocks</h3>
                      <p className="text-xs text-gray-500">Add structured content to your report</p>
                    </div>
                    {blockTypes.map((block) => (
                      <Card 
                        key={block.id} 
                        className="cursor-pointer hover:shadow-sm hover:border-orange-200 transition-all duration-200 border border-gray-200 bg-white" 
                        onClick={() => insertBlock(block)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center flex-shrink-0 border border-orange-100">
                              <block.icon className="w-5 h-5 text-orange-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-gray-900 mb-1">{block.name}</div>
                              <div className="text-xs text-gray-600 leading-relaxed">{block.description}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="templates" className="mt-0 space-y-4">
                    {/* Document Templates Section */}
                    <div>
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">Document Templates</h3>
                        <p className="text-xs text-gray-500">Quick-start templates for common reports</p>
                      </div>
                      <div className="space-y-2">
                        {gameTemplates.map((template, index) => (
                          <Card 
                            key={index} 
                            className="cursor-pointer hover:shadow-sm hover:border-blue-200 transition-all duration-200 border border-gray-200 bg-white" 
                            onClick={() => insertTemplate(template)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center flex-shrink-0 border border-blue-100">
                                  <FileText className="w-5 h-5 text-blue-600" />
                                </div>
                                <div className="flex-1">
                                  <div className="font-semibold text-sm text-gray-900">{template.name}</div>
                                  <div className="text-xs text-gray-600 mt-1">Professional template ready to customize</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Visual Scouting Report Templates */}
                    <div>
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">Visual Report Templates</h3>
                        <p className="text-xs text-gray-500">Professional visual scouting report cards</p>
                      </div>
                      
                      {/* Templates – Catalog (left) + Live Preview (right) */}
                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_620px] gap-4">
                        {/* LEFT: Catalog */}
                        <div className="space-y-3">
                   
                          
                          {/* Catalog grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {templates.map((t) => {
                              const selected = selectedTemplateId === t.id;
                              return (
                                <div
                                  key={t.id}
                                  className={`cursor-pointer rounded-lg border transition ${
                                    selected
                                      ? "border-orange-400 ring-1 ring-orange-300 bg-orange-50/40"
                                      : "border-gray-200 hover:shadow-sm bg-white"
                                  }`}
                                  onClick={() => handleScoutingTemplateSelect(t.id)}
                                >
                                  <div className="p-3">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                                        <div className="text-xs text-slate-500">Visual scouting card</div>
                                      </div>
                                      {selected && (
                                        <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-medium">
                                          Selected
                                        </span>
                                      )}
                                    </div>

                                    {/* Thumbnail placeholder */}
                                    <div className="mt-3 h-16 rounded-md bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200" />

                                    <div className="mt-3 flex items-center justify-end">
                                      <button
                                        className="text-xs px-2.5 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleScoutingTemplateSelect(t.id);
                                        }}
                                      >
                                        {selected ? "Use Again" : "Select"}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Parse warning (non-blocking) */}
                          {parseError && (
                            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                              {parseError}
                            </div>
                          )}
                        </div>

                       
                      </div>
                    </div>
                    
                  </TabsContent>

                  <TabsContent value="assistant" className="mt-0">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2">AI Assistant</h3>
                      <p className="text-xs text-gray-500">Get intelligent insights and content suggestions</p>
                    </div>
                    {leagueContext ? (
                      <div className="h-full">
                        <LeagueChatbot
                          leagueId={leagueContext.leagueId}
                          leagueName={leagueContext.leagueName}
                          onResponseReceived={(content) => {
                            if (editor && onChatInsert) {
                              editor.chain().focus().insertContent(`<p>${content}</p>`).run();
                              onChatInsert(content);
                            }
                            // Also try to parse as scouting report data
                            const parsed = safelyParseReport(content);
                            if (parsed) { 
                              onReportDataChange?.(parsed); 
                            }
                          }}
                          isPanelMode={true}
                        />
                      </div>
                    ) : (
                      <Card className="border border-gray-200">
                        <CardContent className="p-6 text-center">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-purple-50 flex items-center justify-center mx-auto mb-4 border border-purple-100">
                            <Sparkles className="w-6 h-6 text-purple-600" />
                          </div>
                          <h3 className="font-semibold text-gray-900 mb-2">No League Selected</h3>
                          <p className="text-sm text-gray-600">Select a league to enable AI assistant</p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </aside>
          </Panel>

          {/* Orange Resize Handle */}
          <PanelResizeHandle className="hidden md:flex items-center justify-center w-2 bg-orange-500 hover:bg-orange-600 transition-colors cursor-col-resize group">
            <div className="w-1 h-8 bg-white rounded-full opacity-80 group-hover:opacity-100 transition-opacity shadow-sm"></div>
          </PanelResizeHandle>

          {/* Editor Area */}
          <Panel defaultSize={70} minSize={50}>
            <main className="flex-1 flex flex-col bg-white h-full">
              <div className="flex-1 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                  <div className="a4-page p-8 my-6">
                    <EditorContent 
                      editor={editor} 
                      className="prose prose-slate max-w-none focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </main>
          </Panel>
        </PanelGroup>

        {/* Mobile Sidebar Overlay */}
        {showMobileMenu && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-80 bg-white shadow-xl">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">Editor Tools</h2>
                  <Button onClick={() => setShowMobileMenu(false)} variant="ghost" size="sm">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
                <TabsList className="grid w-full grid-cols-3 m-4 h-12 bg-gray-100 p-1 rounded-lg">
                  <TabsTrigger 
                    value="blocks"
                    className="text-sm font-medium data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                  >
                    Blocks
                  </TabsTrigger>
                  <TabsTrigger 
                    value="templates"
                    className="text-sm font-medium data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                  >
                    Templates
                  </TabsTrigger>
                  <TabsTrigger 
                    value="assistant"
                    className="text-sm font-medium data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
                  >
                    AI
                  </TabsTrigger>
                </TabsList>

                <div className="px-4 pb-4 overflow-y-auto max-h-[calc(100vh-200px)]">
                  <TabsContent value="blocks" className="space-y-3">
                    {blockTypes.map((block) => (
                      <Card 
                        key={block.id} 
                        className="cursor-pointer hover:shadow-md transition-shadow" 
                        onClick={() => {
                          insertBlock(block);
                          setShowMobileMenu(false);
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                              <block.icon className="w-4 h-4 text-orange-600" />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium text-sm">{block.name}</div>
                              <div className="text-xs text-slate-500">{block.description}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="templates" className="space-y-3">
                    {gameTemplates.map((template, index) => (
                      <Card 
                        key={index} 
                        className="cursor-pointer hover:shadow-md transition-shadow" 
                        onClick={() => {
                          insertTemplate(template);
                          setShowMobileMenu(false);
                        }}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                              <FileText className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="font-medium text-sm">{template.name}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>

                  <TabsContent value="assistant">
                    {leagueContext ? (
                      <LeagueChatbot
                        leagueId={leagueContext.leagueId}
                        leagueName={leagueContext.leagueName}
                        onResponseReceived={(content) => {
                          if (editor && onChatInsert) {
                            editor.chain().focus().insertContent(`<p>${content}</p>`).run();
                            onChatInsert(content);
                          }
                          setShowMobileMenu(false);
                        }}
                        isPanelMode={true}
                      />
                    ) : (
                      <Card>
                        <CardContent className="p-6 text-center">
                          <Sparkles className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                          <h3 className="font-medium mb-2">No League Selected</h3>
                          <p className="text-sm text-slate-500">Select a league to enable AI assistant</p>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        )}
      </div>

      {/* Floating Assistant Button (Mobile) */}
      {!showMobileMenu && leagueContext && (
        <Button
          onClick={() => {
            setActiveTab('assistant');
            setShowMobileMenu(true);
          }}
          className="fixed bottom-6 right-6 md:hidden bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
        >
          <Sparkles className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}