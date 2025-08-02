import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import TeamPerformanceTrends from '@/components/TeamPerformanceTrends';
import LeagueChatbot from '@/components/LeagueChatbot';
import { TrendingUp, BarChart3, Users, Target, Award, Eye, MessageCircle, Search } from 'lucide-react';
import { Link } from 'wouter';

export default function CoachesHub() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLeagues, setFilteredLeagues] = useState<any[]>([]);

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
        .eq('league_id', selectedLeague.league_id)
        .eq('is_public', true);

      if (error) throw error;
      setPlayerStats(data || []);
    } catch (error) {
      console.error('Error fetching player stats:', error);
      setPlayerStats([]);
    }
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
                  src="https://cdn-icons-png.flaticon.com/512/25/25694.png" 
                  alt="Swish Assistant" 
                  className="w-6 h-6"
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
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="xl:col-span-3 space-y-8">
              {/* League Search & Selection */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Search className="w-5 h-5 text-orange-600" />
                  <h2 className="text-lg font-semibold text-slate-800">League Selection</h2>
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
                          {new Set(playerStats.map(p => `${p.game_date}_${p.team}`)).size}
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
                    src="https://cdn-icons-png.flaticon.com/512/25/25694.png" 
                    alt="Coaching Tips" 
                    className="w-6 h-6 mt-1"
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

            {/* Sidebar */}
            <div className="xl:col-span-1 space-y-6">
              {/* Coaching Assistant Chatbot */}
              {selectedLeague && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <MessageCircle className="w-5 h-5 text-orange-600" />
                    <h3 className="font-semibold text-slate-800">Coaching Assistant</h3>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">
                    Ask questions about your team's performance, player statistics, or get strategic insights.
                  </p>
                  <LeagueChatbot 
                    leagueId={selectedLeague.league_id} 
                    leagueName={selectedLeague.name || 'League'} 
                  />
                </div>
              )}

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
        )}
      </div>
    </div>
  );
}