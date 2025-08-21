import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import TeamPerformanceTrends from '@/components/TeamPerformanceTrends';
import LeagueChatbot from '@/components/LeagueChatbot';
import { TrendingUp, BarChart3, Users, Target, Award, Eye, MessageCircle, Search, FileText, Save, Plus, Edit3, ArrowDown, Bot, BookOpen, Brain, Sparkles, Edit, Palette, User, Calendar } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Link } from 'wouter';
import SwishLogo from '@/assets/Swish Assistant Logo.png';
import InlineScoutingEditor from '@/components/scout-editor/InlineScoutingEditor';
import UnifiedScoutingEditor from '@/components/scout-editor/UnifiedScoutingEditor';
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
        {/* Welcome Section */}
        <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-100 p-8 mb-8 relative overflow-hidden">
          {/* Background Logo */}
          <div className="absolute top-4 right-4 w-48 h-48 opacity-15 pointer-events-none">
            <img 
              src={SwishLogo} 
              alt="Swish Assistant" 
              className="w-full h-full object-contain"
            />
          </div>
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="flex items-center justify-center mb-6">
              <div className="p-3 bg-orange-100 rounded-full mr-4">
                <Target className="w-8 h-8 text-orange-600" />
              </div>
              <h1 className="text-3xl font-bold text-slate-800">Welcome to the Coaches Hub</h1>
            </div>
            
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              Your comprehensive coaching command center. Analyze performance, track trends, and create detailed scouting reports 
              to elevate your team's game to the next level.
            </p>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg p-6 shadow-sm border border-orange-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">View League Analytics</h3>
                <p className="text-sm text-slate-600">
                  Access comprehensive statistics, team performance trends, and player insights across all your leagues.
                </p>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-sm border border-orange-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Track Performance</h3>
                <p className="text-sm text-slate-600">
                  Monitor team trends, analyze game-by-game performance, and identify key patterns in your league data.
                </p>
              </div>

              <div className="bg-white rounded-lg p-6 shadow-sm border border-orange-100 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-slate-800 mb-2">Create Scouting Reports</h3>
                <p className="text-sm text-slate-600">
                  Build professional scouting reports with AI assistance, document analysis, and rich editing tools.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>AI-Powered Insights</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>Real-Time Analytics</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                <span>Professional Reports</span>
              </div>
            </div>
          </div>
        </div>

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
            {/* League Selection */}
            {selectedLeague && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <div>
                      <span className="font-medium text-slate-800">{selectedLeague.name}</span>
                      <span className="text-sm text-slate-500 ml-2">Active League</span>
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    {playerStats.length} player records
                  </div>
                </div>
              </div>
            )}

            {/* Analytics Dashboard - Horizontal Layout Above Main Content */}
            {selectedLeague && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <BarChart3 className="w-6 h-6 text-orange-600" />
                  <h2 className="text-xl font-bold text-slate-800">League Analytics Overview</h2>
                </div>

                {/* Analytics Metrics Grid - Full Width */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">Teams</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-900">
                      {Array.from(new Set(playerStats.map(stat => stat.team))).filter(Boolean).length}
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 mb-2">
                      <User className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-800">Players</span>
                    </div>
                    <div className="text-2xl font-bold text-green-900">
                      {Array.from(new Set(playerStats.map(stat => stat.player))).filter(Boolean).length}
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-800">Games</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-900">
                      {Math.round(playerStats.length / Array.from(new Set(playerStats.map(stat => stat.player))).filter(Boolean).length) || 0}
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-orange-600" />
                      <span className="text-sm font-medium text-orange-800">Avg PPG</span>
                    </div>
                    <div className="text-2xl font-bold text-orange-900">
                      {Math.round(playerStats.reduce((sum, stat) => sum + (parseInt(stat.points) || 0), 0) / playerStats.length) || 0}
                    </div>
                  </div>
                </div>

                {/* Top Players Summary - Horizontal Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg border">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Award className="w-4 h-4 text-yellow-600" />
                      Top Scorers
                    </h4>
                    <div className="space-y-2">
                      {playerStats
                        .reduce((acc: Record<string, any>, stat) => {
                          const key = stat.player;
                          if (!acc[key]) acc[key] = { name: stat.player, points: 0 };
                          acc[key].points += parseInt(stat.points) || 0;
                          return acc;
                        }, {})
                        && Object.values(playerStats.reduce((acc: Record<string, any>, stat) => {
                          const key = stat.player;
                          if (!acc[key]) acc[key] = { name: stat.player, points: 0 };
                          acc[key].points += parseInt(stat.points) || 0;
                          return acc;
                        }, {}))
                        .sort((a: any, b: any) => b.points - a.points)
                        .slice(0, 3)
                        .map((player: any, index) => (
                          <div key={index} className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-amber-600'
                              }`}>
                                {index + 1}
                              </div>
                              <span className="text-sm font-medium text-gray-900">{player.name}</span>
                            </div>
                            <span className="text-sm font-bold text-gray-700">{player.points} pts</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg border">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Target className="w-4 h-4 text-green-600" />
                      League Leaders
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm text-gray-600">Most Assists</span>
                        <span className="text-sm font-medium text-gray-900">
                          {Math.max(...playerStats.map(stat => parseInt(stat.assists) || 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm text-gray-600">Most Rebounds</span>
                        <span className="text-sm font-medium text-gray-900">
                          {Math.max(...playerStats.map(stat => parseInt(stat.rebounds) || 0))}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-sm text-gray-600">Best FG%</span>
                        <span className="text-sm font-medium text-gray-900">
                          {Math.max(...playerStats.map(stat => {
                            const made = parseInt(stat.field_goals_made) || 0;
                            const attempted = parseInt(stat.field_goals_attempted) || 0;
                            return attempted > 0 ? Math.round((made / attempted) * 100) : 0;
                          }))}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Main Content - Team Performance Trends and League Assistant */}
            <div className="flex gap-6 min-h-[800px]">
              {/* Left Section - Team Performance Trends */}
              <div className="flex-1">
                {selectedLeague && <TeamPerformanceTrends leagueId={selectedLeague.league_id} playerStats={playerStats} />}
              </div>

              {/* Right Section - League Assistant */}
              <div className="w-96 flex-shrink-0">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="w-5 h-5 text-orange-600" />
                      <h3 className="font-semibold text-slate-800">League Assistant</h3>
                    </div>
                  </div>
                  <div className="p-4 h-full overflow-auto">
                    {selectedLeague && (
                      <LeagueChatbot
                        leagueId={selectedLeague.league_id}
                        leagueName={selectedLeague.name}
                        onResponseReceived={(response: string) => {
                          setChatbotResponse(response);
                        }}
                        isPanelMode={true}
                      />
                    )}
                    {!selectedLeague && (
                      <div className="h-full flex items-center justify-center text-gray-500">
                        <div className="text-center">
                          <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                          <p>Select a league to use the chatbot</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Scouting Reports Section - Enhanced Mobile-Friendly Editor */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <FileText className="w-6 h-6 text-orange-600" />
                  <h2 className="text-xl font-bold text-slate-800">Scouting Reports</h2>
                  <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
                    ENHANCED
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 hidden sm:inline">Mobile-optimized A4 editor</span>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </div>
              </div>

              {/* Unified Scouting Editor */}
              <UnifiedScoutingEditor
                leagueContext={selectedLeague ? {
                  leagueId: selectedLeague.league_id,
                  leagueName: selectedLeague.name,
                } : undefined}
                onChatInsert={(content: string) => {
                  setChatbotResponse(content);
                }}
              />
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