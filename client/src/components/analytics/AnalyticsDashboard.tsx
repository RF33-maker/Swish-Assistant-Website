import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Users, TrendingUp, Search, Target, UserCheck, Calendar, Award } from 'lucide-react';
import TeamPerformanceTrends from '@/components/TeamPerformanceTrends';

interface AnalyticsDashboardProps {
  selectedLeague: any;
  playerStats: any[];
  onLeagueSelect: (league: any) => void;
  leagues: any[];
}

export function AnalyticsDashboard({ selectedLeague, playerStats, onLeagueSelect, leagues }: AnalyticsDashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLeagues, setFilteredLeagues] = useState<any[]>([]);

  useEffect(() => {
    const filtered = leagues.filter(league => 
      league.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLeagues(filtered);
  }, [leagues, searchQuery]);

  // Calculate league statistics
  const leagueStats = useMemo(() => {
    if (!selectedLeague || !playerStats || playerStats.length === 0) {
      return {
        totalTeams: 0,
        totalPlayers: 0,
        totalGames: 0,
        avgPointsPerGame: 0,
        topScorers: [],
        mostAssists: 0,
        mostRebounds: 0,
        bestFGPercentage: 0
      };
    }

    const uniqueTeams = Array.from(new Set(playerStats.map(stat => stat.team))).filter(Boolean);
    const uniquePlayers = Array.from(new Set(playerStats.map(stat => stat.player))).filter(Boolean);
    
    // Calculate total games (approximate from player game counts)
    const gamesPerPlayer = playerStats.reduce((acc: Record<string, number>, stat) => {
      acc[stat.player] = (acc[stat.player] || 0) + 1;
      return acc;
    }, {});
    
    const avgGamesPerPlayer = Object.values(gamesPerPlayer).length > 0 
      ? Object.values(gamesPerPlayer).reduce((a: number, b: number) => a + b, 0) / Object.values(gamesPerPlayer).length 
      : 0;

    // Calculate player totals
    const playerTotals = playerStats.reduce((acc: Record<string, any>, stat) => {
      const key = stat.player;
      if (!acc[key]) {
        acc[key] = { 
          name: stat.player, 
          points: 0, 
          assists: 0, 
          rebounds: 0, 
          fieldGoalsMade: 0, 
          fieldGoalsAttempted: 0,
          games: 0
        };
      }
      acc[key].points += parseInt(stat.points) || 0;
      acc[key].assists += parseInt(stat.assists) || 0;
      acc[key].rebounds += parseInt(stat.rebounds) || 0;
      acc[key].fieldGoalsMade += parseInt(stat.field_goals_made) || 0;
      acc[key].fieldGoalsAttempted += parseInt(stat.field_goals_attempted) || 0;
      acc[key].games += 1;
      return acc;
    }, {});

    const playerArray = Object.values(playerTotals);
    
    // Top scorers
    const topScorers = playerArray
      .sort((a: any, b: any) => b.points - a.points)
      .slice(0, 5);

    // League leaders
    const mostAssists = playerArray.length > 0 ? Math.max(...playerArray.map((p: any) => p.assists)) : 0;
    const mostRebounds = playerArray.length > 0 ? Math.max(...playerArray.map((p: any) => p.rebounds)) : 0;
    const bestFGPercentage = playerArray.length > 0 ? Math.max(...playerArray.map((p: any) => 
      p.fieldGoalsAttempted > 0 ? Math.round((p.fieldGoalsMade / p.fieldGoalsAttempted) * 100) : 0
    )) : 0;

    // Average points per game
    const totalPoints = playerStats.reduce((sum, stat) => sum + (parseInt(stat.points) || 0), 0);
    const avgPointsPerGame = playerStats.length > 0 ? Math.round(totalPoints / avgGamesPerPlayer) : 0;

    return {
      totalTeams: uniqueTeams.length,
      totalPlayers: uniquePlayers.length,
      totalGames: Math.round(avgGamesPerPlayer),
      avgPointsPerGame,
      topScorers,
      mostAssists,
      mostRebounds,
      bestFGPercentage
    };
  }, [selectedLeague, playerStats]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-6 h-6 text-orange-600" />
        <h2 className="text-xl font-bold text-slate-800">Analytics Dashboard</h2>
      </div>
      
      {/* League Selection */}
      <div className="mb-6">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Find your league"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>

          {/* League Results */}
          {searchQuery && (
            <div className="border border-gray-200 rounded-md">
              {filteredLeagues.length > 0 ? (
                filteredLeagues.map(league => (
                  <button
                    key={league.league_id}
                    onClick={() => {
                      onLeagueSelect(league);
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
                  <span className="text-sm text-slate-500 ml-2">Active League</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analytics Metrics */}
      {selectedLeague && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">League Overview</h3>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Teams</span>
              </div>
              <div className="text-2xl font-bold text-blue-900">{leagueStats.totalTeams}</div>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Players</span>
              </div>
              <div className="text-2xl font-bold text-green-900">{leagueStats.totalPlayers}</div>
            </div>
            
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">Games</span>
              </div>
              <div className="text-2xl font-bold text-purple-900">{leagueStats.totalGames}</div>
            </div>
            
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-lg border border-orange-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-800">Avg PPG</span>
              </div>
              <div className="text-2xl font-bold text-orange-900">{leagueStats.avgPointsPerGame}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg border">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-yellow-600" />
                Top Scorers
              </h4>
              <div className="space-y-2">
                {leagueStats.topScorers.slice(0, 3).map((player: any, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
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
                  <span className="text-sm font-medium text-gray-900">{leagueStats.mostAssists}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Most Rebounds</span>
                  <span className="text-sm font-medium text-gray-900">{leagueStats.mostRebounds}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm text-gray-600">Best FG%</span>
                  <span className="text-sm font-medium text-gray-900">{leagueStats.bestFGPercentage}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Performance Trends */}
      {selectedLeague && (
        <div>
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Performance Trends</h3>
          <TeamPerformanceTrends leagueId={selectedLeague.league_id} />
        </div>
      )}
    </div>
  );
}