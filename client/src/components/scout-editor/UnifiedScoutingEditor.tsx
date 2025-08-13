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
  Plus
} from 'lucide-react';

interface UnifiedScoutingEditorProps {
  leagueContext?: {
    leagueId: string;
    leagueName: string;
  };
  onChatInsert?: (content: string) => void;
}

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
    content: '<h1>Game Analysis Report</h1><h2>Team Overview</h2><p>Analysis content here...</p><h2>Key Players</h2><p>Player analysis...</p><h2>Strategic Insights</h2><p>Strategic recommendations...</p>'
  },
  {
    name: 'Player Scouting',
    content: '<h1>Player Scouting Report</h1><h2>Player Profile</h2><p>Basic information and position...</p><h2>Strengths</h2><p>Key strengths...</p><h2>Areas for Improvement</h2><p>Development areas...</p>'
  },
  {
    name: 'Opponent Preview',
    content: '<h1>Opponent Preview</h1><h2>Team Style</h2><p>Playing style and strategy...</p><h2>Key Matchups</h2><p>Important matchups to watch...</p><h2>Game Plan</h2><p>Strategic approach...</p>'
  }
];

export default function UnifiedScoutingEditor({ leagueContext, onChatInsert }: UnifiedScoutingEditorProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('editor');
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
      const docId = currentDocumentId || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const documentData = {
        id: docId,
        title: documentTitle,
        content,
        user_id: user.id,
        updated_at: new Date().toISOString()
      };

      // Store locally as primary storage
      localStorage.setItem(`scouting_doc_${docId}`, JSON.stringify(documentData));
      
      if (!currentDocumentId) {
        setCurrentDocumentId(docId);
      }

      // Try Supabase as backup
      try {
        if (currentDocumentId) {
          await supabase
            .from('scouting_documents')
            .update(documentData)
            .eq('id', currentDocumentId);
        } else {
          await supabase
            .from('scouting_documents')
            .insert([documentData]);
        }
      } catch (error) {
        // Silently fail - localStorage is our primary storage
      }
    } catch (error) {
      console.error('Error saving document:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const insertBlock = (blockType: typeof blockTypes[0]) => {
    if (editor) {
      editor.chain().focus().insertContent(blockType.template).run();
    }
  };

  const insertTemplate = (template: typeof gameTemplates[0]) => {
    if (editor) {
      editor.chain().focus().setContent(template.content).run();
      setDocumentTitle(template.name);
    }
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
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-80 bg-gray-50 border-r border-gray-200 flex-col">
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

              <TabsContent value="templates" className="mt-0 space-y-2">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2">Report Templates</h3>
                  <p className="text-xs text-gray-500">Quick-start templates for common reports</p>
                </div>
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
                      }}
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

        {/* Editor Area */}
        <main className="flex-1 flex flex-col bg-white">
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