import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import TeamPerformanceTrends from '@/components/TeamPerformanceTrends';
import LeagueChatbot from '@/components/LeagueChatbot';
import { TrendingUp, BarChart3, Users, Target, Award, Eye, MessageCircle, Search, FileText, Save, Plus, Edit3, ArrowDown, Bot, BookOpen, Brain, Sparkles, Edit, Palette } from 'lucide-react';
import { Link } from 'wouter';
import SwishLogo from '@/assets/Swish Assistant Logo.png';
import InlineScoutingEditor from '@/components/scout-editor/InlineScoutingEditor';
import { ThreePaneEditor } from '@/components/scout-editor/ThreePaneEditor';
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';

export default function CoachesHub() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLeagues, setFilteredLeagues] = useState<any[]>([]);

  const [chatbotResponse, setChatbotResponse] = useState('');
  const [showChatbotInReport, setShowChatbotInReport] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
    }
  }, [user]);

  useEffect(() => {
    if (selectedLeague) {
      fetchLeagueStats();
    }
  }, [selectedLeague]);

  useEffect(() => {
    // Filter leagues based on search query
    const filtered = leagues.filter(league => 
      league.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLeagues(filtered);
  }, [leagues, searchQuery]);

  const fetchUserLeagues = async () => {
    try {
      const { data, error } = await supabase
        .from('leagues')
        .select('*')
        .eq('created_by', user?.id);

      if (error) throw error;
      
      setLeagues(data || []);
      if (data && data.length === 1) {
        setSelectedLeague(data[0]);
      }
    } catch (error) {
      console.error('Error fetching leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeagueStats = async () => {
    if (!selectedLeague) return;
    
    try {
      const { data, error } = await supabase
        .from('player_stats')
        .select('*')
        .eq('league_id', selectedLeague.league_id);

      if (error) throw error;
      setPlayerStats(data || []);
    } catch (error) {
      console.error('Error fetching league stats:', error);
      setPlayerStats([]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading your coaching hub...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-4">Access Denied</h1>
          <p className="text-slate-600 mb-6">Please log in to access the Coaches Hub.</p>
          <Link href="/auth" className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 transition">
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <img 
                  src={SwishLogo} 
                  alt="Swish Assistant" 
                  className="w-6 h-6 object-contain"
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Coaches Hub</h1>
                <p className="text-sm text-slate-500">Advanced analytics and team insights</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-slate-600 hover:text-orange-600 transition">
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {leagues.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">No Leagues Found</h2>
            <p className="text-slate-600 mb-6">
              You need to create or manage a league to access coaching insights.
            </p>
            <Link 
              href="/league-admin" 
              className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition"
            >
              <Award className="w-4 h-4" />
              Create League
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Professional 3-Pane Layout - Top Section */}
            <div className="flex gap-6 h-[500px]">
              {/* Left Pane - Analytics Dashboard */}
              <div className="w-96 flex-shrink-0">
                <AnalyticsDashboard
                  selectedLeague={selectedLeague}
                  playerStats={playerStats}
                  onLeagueSelect={setSelectedLeague}
                  leagues={leagues}
                />
              </div>

              {/* Right Pane - Team Performance Trends */}
              <div className="flex-1 min-w-0">
                <ThreePaneEditor
                  selectedLeague={selectedLeague}
                  playerStats={playerStats}
                  onChatInsert={(content: string) => {
                    setChatbotResponse(content);
                  }}
                />
              </div>
            </div>

            {/* Scouting Reports Section - Below Professional Layout */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-orange-600" />
                  <h2 className="text-xl font-bold text-slate-800">Scouting Reports</h2>
                  <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
                    NEW
                  </span>
                </div>
                <button
                  onClick={() => setShowChatbotInReport(!showChatbotInReport)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg transition text-sm font-medium ${
                    showChatbotInReport 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <MessageCircle className="w-4 h-4" />
                  {showChatbotInReport ? 'Hide Assistant' : 'Show Assistant'}
                </button>
              </div>

              {/* Inline Notion-Style Editor */}
              <div className="space-y-6">
                <InlineScoutingEditor
                  leagueContext={selectedLeague ? {
                    leagueId: selectedLeague.id,
                    leagueName: selectedLeague.name,
                  } : undefined}
                  onChatInsert={(content: string) => {
                    setChatbotResponse(content);
                  }}
                />

                {/* Chatbot Integration */}
                {showChatbotInReport && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle className="w-5 h-5 text-blue-600" />
                      <h4 className="font-semibold text-blue-800">League Assistant</h4>
                      <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        AI responses will auto-insert into your report
                      </span>
                    </div>
                    <LeagueChatbot
                      leagueId={selectedLeague?.league_id}
                      leagueName={selectedLeague?.name || 'League'}
                      onResponseReceived={setChatbotResponse}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Team Profiles Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-6 h-6 text-orange-600" />
                <h2 className="text-xl font-bold text-slate-800">Team Profiles</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Quick Actions */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-800 mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    <Link 
                      href="/league-admin"
                      className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 transition"
                    >
                      <Award className="w-4 h-4" />
                      Upload Player Stats
                    </Link>
                    {selectedLeague && (
                      <Link 
                        href={`/league/${selectedLeague.slug}`}
                        className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 transition"
                      >
                        <Eye className="w-4 h-4" />
                        View Public League Page
                      </Link>
                    )}
                    {selectedLeague && (
                      <Link 
                        href={`/league-leaders/${selectedLeague.slug}`}
                        className="flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 transition"
                      >
                        <TrendingUp className="w-4 h-4" />
                        View League Leaders
                      </Link>
                    )}
                  </div>
                </div>
                
                {/* Team Management Features */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-800 mb-3">Team Management</h3>
                  <div className="text-sm text-slate-600 space-y-2">
                    <p>• Roster tracking and management</p>
                    <p>• Player performance analysis</p>
                    <p>• Team statistics overview</p>
                    <p>• Historical performance data</p>
                  </div>
                </div>
                
                {/* Coming Soon */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-800 mb-3">Coming Soon</h3>
                  <div className="text-sm text-slate-500 space-y-2">
                    <p>• Advanced team comparisons</p>
                    <p>• Injury tracking system</p>
                    <p>• Practice planning tools</p>
                    <p>• Custom team reports</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}