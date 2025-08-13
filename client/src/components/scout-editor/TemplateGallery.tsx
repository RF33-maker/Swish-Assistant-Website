import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  BarChart3, 
  Users, 
  Target,
  Trophy,
  Calendar,
  ClipboardList
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { DocumentTemplate } from '@shared/schema';
import { cn } from '@/lib/utils';

interface TemplateGalleryProps {
  onSelectTemplate: (templateId: string, template: DocumentTemplate) => void;
  onCreateBlank: () => void;
  leagueContext?: {
    leagueId: string;
    leagueName: string;
  };
}

export default function TemplateGallery({ onSelectTemplate, onCreateBlank, leagueContext }: TemplateGalleryProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadTemplates();
    initializeDefaultTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('isPublic', true)
        .order('createdAt', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const initializeDefaultTemplates = async () => {
    // Check if default templates exist, if not create them
    const { data: existingTemplates } = await supabase
      .from('document_templates')
      .select('id')
      .limit(1);

    if (!existingTemplates || existingTemplates.length === 0) {
      await createDefaultTemplates();
      loadTemplates();
    }
  };

  const createDefaultTemplates = async () => {
    const defaultTemplates = [
      {
        name: 'Scouting Report',
        description: 'Comprehensive player and team analysis template',
        category: 'scouting',
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Scouting Report: {{player.name}}' }]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Team: {{team.name}} | Position: {{player.position}}' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Date: {{game.date}}' }
              ]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Key Statistics' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'PPG: {{player.ppg}} | RPG: {{player.rpg}} | APG: {{player.apg}}' }]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Strengths' }]
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Strong shooting ability' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Excellent court vision' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Solid defensive presence' }] }] }
              ]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Areas for Improvement' }]
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ball handling under pressure' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Consistency in free throw shooting' }] }] }
              ]
            }
          ]
        },
        thumbnailUrl: null,
        isPublic: true,
        createdBy: user?.id?.toString() || user?.email || 'system'
      },
      {
        name: 'Game Recap',
        description: 'Post-game analysis and summary template',
        category: 'game-recap',
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Game Recap: {{game.homeTeam}} vs {{game.awayTeam}}' }]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Final Score: {{game.homeScore}} - {{game.awayScore}}' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Date: {{game.date}} | Venue: {{game.venue}}' }
              ]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Game Summary' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Describe the overall flow and key moments of the game...' }]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Player of the Game' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Highlight standout performance and key contributions...' }]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Key Takeaways' }]
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Offensive efficiency' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Defensive intensity' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Areas to improve' }] }] }
              ]
            }
          ]
        },
        thumbnailUrl: null,
        isPublic: true,
        createdBy: user?.id?.toString() || user?.email || 'system'
      },
      {
        name: 'Pre-Game Strategy',
        description: 'Game preparation and strategy planning template',
        category: 'pre-game',
        content: {
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: { level: 1 },
              content: [{ type: 'text', text: 'Pre-Game Strategy: vs {{game.opponent}}' }]
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Game Date: {{game.date}}' },
                { type: 'hardBreak' },
                { type: 'text', text: 'Opponent Record: {{opponent.record}}' }
              ]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Opponent Analysis' }]
            },
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Key players, tendencies, and recent performance...' }]
            },
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Our Game Plan' }]
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Offensive Strategy' }]
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Primary offensive sets' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Key matchups to exploit' }] }] }
              ]
            },
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Defensive Strategy' }]
            },
            {
              type: 'bulletList',
              content: [
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Defensive scheme' }] }] },
                { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Key players to contain' }] }] }
              ]
            }
          ]
        },
        thumbnailUrl: null,
        isPublic: true,
        createdBy: user?.id?.toString() || user?.email || 'system'
      }
    ];

    try {
      const { error } = await supabase
        .from('document_templates')
        .insert(defaultTemplates);

      if (error) throw error;
    } catch (error) {
      console.error('Error creating default templates:', error);
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'all', label: 'All Templates', icon: FileText },
    { id: 'scouting', label: 'Scouting', icon: Target },
    { id: 'game-recap', label: 'Game Recap', icon: Trophy },
    { id: 'pre-game', label: 'Pre-Game', icon: Calendar },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
  ];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'scouting': return Target;
      case 'game-recap': return Trophy;
      case 'pre-game': return Calendar;
      case 'analysis': return BarChart3;
      default: return FileText;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'scouting': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'game-recap': return 'bg-green-50 text-green-700 border-green-200';
      case 'pre-game': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'analysis': return 'bg-orange-50 text-orange-700 border-orange-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Choose a Template</h2>
        <p className="text-slate-600">Start with a professional template or create a blank document</p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category.id)}
              className="flex items-center gap-2"
            >
              <category.icon className="w-4 h-4" />
              {category.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Blank Document Option */}
      <Card 
        className="cursor-pointer hover:shadow-md transition-all border-2 border-dashed border-gray-300 hover:border-orange-300"
        onClick={onCreateBlank}
      >
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Plus className="w-6 h-6 text-gray-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Blank Document</h3>
              <p className="text-slate-600 text-sm">Start from scratch with a clean slate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => {
          const IconComponent = getCategoryIcon(template.category || 'general');
          
          return (
            <Card 
              key={template.id}
              className="cursor-pointer hover:shadow-md transition-all"
              onClick={() => onSelectTemplate(template.id, template)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <IconComponent className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", getCategoryColor(template.category || 'general'))}
                      >
                        {template.category || 'general'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <CardDescription className="text-sm">
                  {template.description || 'No description available'}
                </CardDescription>
                <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                  <span>Created {template.createdAt ? new Date(template.createdAt).toLocaleDateString() : 'Unknown'}</span>
                  <span>Public Template</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredTemplates.length === 0 && searchQuery && (
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="font-medium text-slate-800 mb-1">No templates found</h3>
          <p className="text-sm text-slate-600">Try adjusting your search or create a blank document</p>
        </div>
      )}
    </div>
  );
}