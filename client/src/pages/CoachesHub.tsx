import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import TeamPerformanceTrends from '@/components/TeamPerformanceTrends';
import { TrendingUp, BarChart3, Users, Target, Award, Eye } from 'lucide-react';
import { Link } from 'wouter';

export default function CoachesHub() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<any>(null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
                <Target className="w-6 h-6 text-orange-600" />
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
          <div className="space-y-8">
            {/* League Selector */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Eye className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold text-slate-800">League Overview</h2>
              </div>
              
              {leagues.length > 1 ? (
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-slate-700">Select League:</label>
                  <select
                    value={selectedLeague?.league_id || ''}
                    onChange={(e) => {
                      const league = leagues.find(l => l.league_id === e.target.value);
                      setSelectedLeague(league);
                    }}
                    className="border border-gray-300 rounded-md px-3 py-2 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    {leagues.map(league => (
                      <option key={league.league_id} value={league.league_id}>
                        {league.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="font-medium text-slate-800">{selectedLeague?.name}</span>
                  <span className="text-sm text-slate-500">
                    ({playerStats.length} player records)
                  </span>
                </div>
              )}
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
                <Target className="w-6 h-6 text-orange-600 mt-1" />
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
        )}
      </div>
    </div>
  );
}