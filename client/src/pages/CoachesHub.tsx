import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import TeamPerformanceTrends from '@/components/TeamPerformanceTrends';
import LeagueChatbot from '@/components/LeagueChatbot';
import { TrendingUp, BarChart3, Users, Target, Award, Eye, MessageCircle, Search, FileText, Save, Plus, Edit3, ArrowDown, Bot, BookOpen, Brain, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import SwishLogo from '@/assets/Swish Assistant Logo.png';

export default function CoachesHub() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLeagues, setFilteredLeagues] = useState<any[]>([]);
  const [scoutingReports, setScoutingReports] = useState<any[]>([]);
  const [activeReport, setActiveReport] = useState<any>(null);
  const [reportContent, setReportContent] = useState('');
  const [reportTitle, setReportTitle] = useState('');
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [chatbotResponse, setChatbotResponse] = useState('');
  const [showChatbotInReport, setShowChatbotInReport] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
      fetchScoutingReports();
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
      
      // Auto-select first league if available
      if (data && data.length > 0) {
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
      console.error('Error fetching player stats:', error);
      setPlayerStats([]);
    }
  };

  const fetchScoutingReports = async () => {
    if (!user) return;
    
    try {
      // First try to create the table if it doesn't exist
      try {
        await supabase.rpc('exec', {
          sql: `
            CREATE TABLE IF NOT EXISTS scouting_reports (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              title VARCHAR(255) NOT NULL,
              content TEXT,
              league_id UUID REFERENCES leagues(league_id),
              created_by UUID NOT NULL,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
          `
        });
      } catch (e) {
        // Ignore errors if table exists or RPC not available
      }

      const { data, error } = await supabase
        .from('scouting_reports')
        .select('*')
        .eq('created_by', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        // If table doesn't exist, use localStorage as fallback
        if (error.code === '42P01') {
          const stored = localStorage.getItem(`scouting_reports_${user.id}`);
          setScoutingReports(stored ? JSON.parse(stored) : []);
          return;
        }
        throw error;
      }
      setScoutingReports(data || []);
    } catch (error) {
      console.error('Error fetching scouting reports:', error);
    }
  };

  const createNewReport = () => {
    setActiveReport(null);
    setReportTitle('');
    setReportContent('');
    setIsCreatingReport(true);
  };

  const saveReport = async () => {
    if (!user || !reportTitle.trim()) return;
    
    setIsSaving(true);
    try {
      const reportData = {
        id: activeReport?.id || generateUUID(),
        title: reportTitle.trim(),
        content: reportContent,
        league_id: selectedLeague?.league_id || null,
        created_by: user.id,
        created_at: activeReport?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      try {
        if (activeReport) {
          // Update existing report
          const { error } = await supabase
            .from('scouting_reports')
            .update(reportData)
            .eq('id', activeReport.id);
          
          if (error) throw error;
        } else {
          // Create new report
          const { data, error } = await supabase
            .from('scouting_reports')
            .insert([reportData])
            .select()
            .single();
          
          if (error) throw error;
          setActiveReport(data);
        }
        
        await fetchScoutingReports();
      } catch (dbError: any) {
        // Fallback to localStorage if database fails
        if (dbError.code === '42P01' || dbError.message?.includes('does not exist')) {
          const stored = localStorage.getItem(`scouting_reports_${user.id}`);
          const reports = stored ? JSON.parse(stored) : [];
          
          if (activeReport) {
            const index = reports.findIndex((r: any) => r.id === activeReport.id);
            if (index >= 0) reports[index] = reportData;
          } else {
            reports.unshift(reportData);
            setActiveReport(reportData);
          }
          
          localStorage.setItem(`scouting_reports_${user.id}`, JSON.stringify(reports));
          setScoutingReports(reports);
        } else {
          throw dbError;
        }
      }
      
      setIsCreatingReport(false);
    } catch (error) {
      console.error('Error saving report:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const loadReport = (report: any) => {
    setActiveReport(report);
    setReportTitle(report.title);
    setReportContent(report.content);
    setIsCreatingReport(false);
  };

  const insertChatbotResponse = () => {
    if (!chatbotResponse.trim()) return;
    
    // Check if a report is open
    if (!isCreatingReport && !activeReport) {
      // Auto-create a new report if none is open
      createNewReport();
      setReportTitle('AI Insights Report');
      setTimeout(() => {
        insertResponseIntoEditor();
      }, 100);
    } else {
      insertResponseIntoEditor();
    }
  };

  const insertResponseIntoEditor = () => {
    const insertText = `\n\n**AI Insight:**\n${chatbotResponse.trim()}\n\n`;
    const currentContent = reportContent;
    const cursorPosition = textareaRef.current?.selectionStart || currentContent.length;
    
    const newContent = 
      currentContent.slice(0, cursorPosition) + 
      insertText + 
      currentContent.slice(cursorPosition);
    
    setReportContent(newContent);
    setChatbotResponse('');
    
    // Focus back to textarea after insert
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        cursorPosition + insertText.length,
        cursorPosition + insertText.length
      );
    }, 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Loading your coaching dashboard...</p>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          <>
          {/* League Assistant Info Banner - Only shown when not in use */}
          {selectedLeague && !showChatbotInReport && (
            <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg p-6 mb-8">
              <div className="flex items-center gap-3 mb-4">
                <MessageCircle className="w-6 h-6 text-orange-600" />
                <h3 className="text-xl font-semibold text-slate-800">League Assistant Available</h3>
                <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-sm rounded-full font-medium">
                  PREMIUM
                </span>
              </div>
              <p className="text-base text-slate-600 mb-4">
                Get instant insights about your team's performance, player statistics, and strategic analysis directly within your scouting reports.
              </p>
              <div className="bg-white rounded-lg border border-orange-200 p-4">
                <p className="text-sm text-slate-700 mb-3">
                  💡 <strong>Integrated Experience:</strong> Use the League Assistant while writing your reports!
                </p>
                <div className="flex items-center gap-2 text-sm text-orange-700">
                  <span>→</span>
                  <span>Click <strong>"Show Assistant"</strong> in the Scouting Reports section below to get started</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="xl:col-span-3 space-y-8">
              {/* Team Profile Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-5 h-5 text-orange-600" />
                  <h2 className="text-lg font-semibold text-slate-800">Team Profiles</h2>
                </div>
                
                <div className="space-y-4">
                  {/* Team Search */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search teams..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  </div>

                  {/* Team Results */}
                  {searchQuery && (
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                      {filteredLeagues.length > 0 ? (
                        filteredLeagues.map(league => (
                          <div key={league.league_id} className="p-3 border-b border-gray-100 last:border-b-0">
                            <div className="font-medium text-slate-800 mb-1">{league.name}</div>
                            <div className="text-xs text-slate-500 mb-2">View team profiles in this league</div>
                            <Link 
                              to="/teams"
                              className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700 text-sm font-medium"
                            >
                              <Users className="w-3 h-3" />
                              Browse Teams
                            </Link>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-slate-500">No teams found matching "{searchQuery}"</div>
                      )}
                    </div>
                  )}

                  {/* Quick Team Access */}
                  {!searchQuery && (
                    <div className="text-center py-8 text-slate-500">
                      <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <h3 className="font-medium mb-1">Explore Team Profiles</h3>
                      <p className="text-sm mb-4">Search for teams to view detailed profiles, rosters, and statistics</p>
                      <Link 
                        to="/teams"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-600 rounded-lg hover:bg-orange-200 transition font-medium"
                      >
                        <Users className="w-4 h-4" />
                        View All Teams
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              
              {/* League Selection for Analytics */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Search className="w-5 h-5 text-orange-600" />
                  <h2 className="text-lg font-semibold text-slate-800">Analytics Selection</h2>
                </div>
                
                <div className="space-y-4">
                  {/* Search Bar */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search your leagues..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  </div>

                  {/* League Results */}
                  {searchQuery && (
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                      {filteredLeagues.length > 0 ? (
                        filteredLeagues.map(league => (
                          <button
                            key={league.league_id}
                            onClick={() => {
                              setSelectedLeague(league);
                              setSearchQuery('');
                            }}
                            className="w-full text-left px-4 py-2 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none transition text-sm"
                          >
                            <div className="font-medium text-slate-800">{league.name}</div>
                            <div className="text-xs text-slate-500">Created {new Date(league.created_at).toLocaleDateString()}</div>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-slate-500">No leagues found matching "{searchQuery}"</div>
                      )}
                    </div>
                  )}

                  {/* Selected League Display */}
                  {selectedLeague && (
                    <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-md">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <div>
                          <span className="font-medium text-slate-800">{selectedLeague.name}</span>
                          <span className="text-sm text-slate-500 ml-2">
                            ({playerStats.length} records)
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedLeague(null)}
                        className="text-slate-400 hover:text-slate-600 transition"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Quick League Access for single league */}
                  {leagues.length === 1 && !selectedLeague && (
                    <button
                      onClick={() => setSelectedLeague(leagues[0])}
                      className="w-full p-3 border-2 border-dashed border-orange-300 rounded-md hover:border-orange-400 hover:bg-orange-50 transition text-center"
                    >
                      <div className="font-medium text-slate-800">{leagues[0].name}</div>
                      <div className="text-sm text-orange-600">Click to select</div>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Stats Cards */}
              {selectedLeague && playerStats.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Total Players</p>
                        <p className="text-2xl font-bold text-slate-800">
                          {new Set(playerStats.map(p => p.name)).size}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <BarChart3 className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Games Recorded</p>
                        <p className="text-2xl font-bold text-slate-800">
                          {new Set(playerStats.map(p => p.game_id)).size}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-sm text-slate-500">Teams Tracked</p>
                        <p className="text-2xl font-bold text-slate-800">
                          {new Set(playerStats.map(p => p.team).filter(Boolean)).size}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* LLM Coaching Material Access - Coming Soon */}
              <div className="relative bg-white rounded-lg shadow-sm border border-gray-200 p-6 overflow-hidden">
                {/* Blur overlay */}
                <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-full font-semibold text-lg mb-2">
                      <BookOpen className="w-5 h-5" />
                      COMING SOON
                    </div>
                    <p className="text-slate-600 font-medium">Advanced coaching material library powered by AI</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-purple-600" />
                    <h2 className="text-lg font-semibold text-slate-800">Coaching Material Library</h2>
                    <span className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs rounded-full font-medium">
                      AI POWERED
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {/* Drill Library */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Target className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-800">Training Drills</h3>
                    </div>
                    <p className="text-sm text-blue-700 mb-3">
                      Access thousands of basketball drills categorized by skill level, position, and focus area.
                    </p>
                    <div className="text-xs text-blue-600 font-medium">• Shooting drills • Defense • Conditioning</div>
                  </div>

                  {/* Strategy Guide */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-green-800">Strategy Guide</h3>
                    </div>
                    <p className="text-sm text-green-700 mb-3">
                      Comprehensive playbook with offensive and defensive strategies for different game situations.
                    </p>
                    <div className="text-xs text-green-600 font-medium">• Set plays • Zone defense • Fast breaks</div>
                  </div>

                  {/* Player Development */}
                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-5 h-5 text-orange-600" />
                      <h3 className="font-semibold text-orange-800">Player Development</h3>
                    </div>
                    <p className="text-sm text-orange-700 mb-3">
                      Individual training programs and skill development paths tailored to each player's needs.
                    </p>
                    <div className="text-xs text-orange-600 font-medium">• Skill assessments • Progress tracking</div>
                  </div>
                </div>

                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <h4 className="font-semibold text-purple-800">AI-Powered Features</h4>
                  </div>
                  <div className="text-sm text-purple-700 space-y-1">
                    <p>• Personalized drill recommendations based on team performance</p>
                    <p>• Dynamic strategy suggestions for upcoming opponents</p>
                    <p>• Interactive coaching scenarios and decision trees</p>
                    <p>• Video analysis integration with drill instructions</p>
                  </div>
                </div>
              </div>

              {/* Scouting Reports Section */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-orange-600" />
                    <h2 className="text-lg font-semibold text-slate-800">Scouting Reports</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowChatbotInReport(!showChatbotInReport)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition text-sm font-medium ${
                        showChatbotInReport 
                          ? 'bg-blue-600 text-white hover:bg-blue-700' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4" />
                      {showChatbotInReport ? 'Hide Assistant' : 'Show Assistant'}
                    </button>
                    <button
                      onClick={createNewReport}
                      className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      New Report
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Reports List */}
                  <div className="lg:col-span-1">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Recent Reports</h3>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {scoutingReports.length > 0 ? (
                        scoutingReports.map((report) => (
                          <div
                            key={report.id}
                            onClick={() => loadReport(report)}
                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                              activeReport?.id === report.id
                                ? 'border-orange-500 bg-orange-50'
                                : 'border-gray-200 hover:border-orange-300 hover:bg-orange-25'
                            }`}
                          >
                            <div className="font-medium text-slate-800 text-sm truncate">
                              {report.title}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {new Date(report.updated_at).toLocaleDateString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-slate-500">
                          <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                          <p className="text-sm">No reports yet</p>
                          <p className="text-xs">Create your first scouting report</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Report Editor */}
                  <div className="lg:col-span-2">
                    {(isCreatingReport || activeReport) ? (
                      <div className="space-y-4">
                        {/* Report Header */}
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            placeholder="Report Title"
                            value={reportTitle}
                            onChange={(e) => setReportTitle(e.target.value)}
                            className="flex-1 text-lg font-semibold border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          />
                          <button
                            onClick={saveReport}
                            disabled={!reportTitle.trim() || isSaving}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                              !reportTitle.trim() || isSaving
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-green-600 text-white hover:bg-green-700'
                            }`}
                          >
                            <Save className="w-4 h-4" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>

                        {/* Show Chatbot in Report Area when toggled */}
                        {showChatbotInReport && selectedLeague && (
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
                            <div className="flex items-center gap-2 mb-3">
                              <MessageCircle className="w-5 h-5 text-blue-600" />
                              <h4 className="font-semibold text-blue-800">League Assistant</h4>
                              <span className="px-2 py-1 bg-gradient-to-r from-orange-500 to-yellow-500 text-white text-xs rounded-full font-medium">
                                PREMIUM
                              </span>
                            </div>
                            <p className="text-sm text-blue-700 mb-4">
                              Ask questions about team performance and get insights to enhance your scouting report.
                            </p>
                            <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                              <LeagueChatbot 
                                leagueId={selectedLeague.league_id} 
                                leagueName={selectedLeague.name || 'League'}
                                onResponseReceived={setChatbotResponse}
                              />
                            </div>
                          </div>
                        )}

                        {/* AI Response Integration */}
                        {chatbotResponse && (
                          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Bot className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium text-green-800">AI Response Ready</span>
                              </div>
                              <button
                                onClick={insertChatbotResponse}
                                className="flex items-center gap-1 bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 transition"
                              >
                                <ArrowDown className="w-3 h-3" />
                                Insert into Report
                              </button>
                            </div>
                            <div className="text-sm text-green-700 bg-white rounded p-2 border max-h-24 overflow-y-auto">
                              {chatbotResponse}
                            </div>
                          </div>
                        )}

                        {/* Report Content */}
                        <div>
                          <textarea
                            ref={textareaRef}
                            placeholder="Write your scouting report here... You can ask the League Assistant questions and insert the responses directly into your report."
                            value={reportContent}
                            onChange={(e) => setReportContent(e.target.value)}
                            className="w-full h-96 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                          />
                          <div className="flex justify-between items-center mt-2 text-xs text-slate-500">
                            <span>{reportContent.length} characters</span>
                            <span>Tip: Use the League Assistant to get insights, then insert them into your report</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-16 text-slate-500">
                        <Edit3 className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                        <h3 className="text-lg font-semibold mb-2">Create or Select a Report</h3>
                        <p className="text-sm mb-4">
                          Use scouting reports to document team analysis, player observations, and strategic insights.
                        </p>
                        <button
                          onClick={createNewReport}
                          className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition"
                        >
                          <Plus className="w-4 h-4" />
                          Create New Report
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Team Performance Trends */}
              {selectedLeague && playerStats.length > 0 ? (
                <div>
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold text-slate-800 mb-2">Team Performance Analysis</h2>
                    <p className="text-slate-600">
                      Analyze your teams' performance trends, identify improvement patterns, and track consistency across games.
                    </p>
                  </div>
                  
                  <TeamPerformanceTrends 
                    playerStats={playerStats} 
                    leagueId={selectedLeague.league_id} 
                  />
                </div>
              ) : selectedLeague ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                  <BarChart3 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">No Game Data Available</h3>
                  <p className="text-slate-600 mb-4">
                    Upload player statistics to see detailed team performance trends and coaching insights.
                  </p>
                  <Link 
                    href="/league-admin" 
                    className="inline-flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition"
                  >
                    <Award className="w-4 h-4" />
                    Upload Stats
                  </Link>
                </div>
              ) : null}

              {/* Coaching Tips */}
              <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <img 
                    src={SwishLogo} 
                    alt="Coaching Tips" 
                    className="w-6 h-6 mt-1 object-contain"
                  />
                  <div>
                    <h3 className="font-semibold text-slate-800 mb-2">Coaching Insights</h3>
                    <div className="text-sm text-slate-700 space-y-2">
                      <p>
                        <strong>Green Trends (↗️):</strong> Teams showing improvement - consider maintaining current strategies and building momentum.
                      </p>
                      <p>
                        <strong>Red Trends (↘️):</strong> Teams declining - review game film, adjust tactics, or focus on player development areas.
                      </p>
                      <p>
                        <strong>Stable Trends (➡️):</strong> Consistent performance - evaluate if current level meets goals or needs enhancement.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Other Features */}
            <div className="lg:col-span-1 space-y-6">



              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="font-semibold text-slate-800 mb-4">Quick Actions</h3>
                <div className="space-y-3">
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
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}