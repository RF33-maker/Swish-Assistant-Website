import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Search, Trophy, TrendingUp } from 'lucide-react';
import SwishLogo from '@/assets/Swish Assistant Logo.png';

interface Team {
  name: string;
  league_id: string;
  league_name?: string;
  player_count: number;
  avg_points?: number;
}

export default function TeamsList() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);

  useEffect(() => {
    fetchTeams();
  }, []);

  useEffect(() => {
    const filtered = teams.filter(team => 
      team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (team.league_name && team.league_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
    setFilteredTeams(filtered);
  }, [teams, searchQuery]);

  const fetchTeams = async () => {
    try {
      setLoading(true);

      // Get unique teams from player_stats with league info
      const { data: teamsData, error } = await supabase
        .from('player_stats')
        .select(`
          team,
          league_id,
          points,
          leagues!inner(name)
        `);

      if (error) {
        console.error('Error fetching teams:', error);
        return;
      }

      // Process teams data
      const teamsMap = new Map();
      
      teamsData?.forEach(stat => {
        const teamKey = `${stat.team}-${stat.league_id}`;
        if (!teamsMap.has(teamKey)) {
          teamsMap.set(teamKey, {
            name: stat.team,
            league_id: stat.league_id,
            league_name: stat.leagues?.name,
            players: new Set(),
            total_points: 0,
            games: 0
          });
        }
        
        const team = teamsMap.get(teamKey);
        team.players.add(stat.name || 'Unknown Player');
        team.total_points += stat.points || 0;
        team.games += 1;
      });

      // Convert to array and calculate averages
      const teamsArray = Array.from(teamsMap.values()).map(team => ({
        name: team.name,
        league_id: team.league_id,
        league_name: team.league_name,
        player_count: team.players.size,
        avg_points: team.games > 0 ? Math.round((team.total_points / team.games) * 10) / 10 : 0
      }));

      // Sort by player count and avg points
      teamsArray.sort((a, b) => {
        if (b.player_count !== a.player_count) {
          return b.player_count - a.player_count;
        }
        return (b.avg_points || 0) - (a.avg_points || 0);
      });

      setTeams(teamsArray);
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
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
                <h1 className="text-xl font-bold text-slate-800">Team Directory</h1>
                <p className="text-sm text-slate-600">Browse all teams across leagues</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Search teams or leagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-4 py-2 pl-10 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Teams Grid */}
        {filteredTeams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeams.map((team, index) => (
              <Link key={`${team.name}-${team.league_id}`} to={`/team/${encodeURIComponent(team.name)}`}>
                <Card className="h-full hover:shadow-lg transition cursor-pointer border-orange-200 hover:border-orange-300">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg flex items-center justify-center">
                        <Users className="w-6 h-6 text-orange-600" />
                      </div>
                      <span className="text-sm font-medium text-orange-600">
                        #{index + 1}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <h3 className="font-bold text-slate-800 mb-2 text-lg">{team.name}</h3>
                    <p className="text-sm text-slate-600 mb-4">{team.league_name}</p>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Players</span>
                        <span className="font-semibold text-slate-800">{team.player_count}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Avg Points</span>
                        <span className="font-semibold text-slate-800">{team.avg_points}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-2 text-orange-600">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-sm font-medium">View Profile</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? 'No teams found' : 'No teams available'}
            </h3>
            <p className="text-gray-600">
              {searchQuery 
                ? `No teams match "${searchQuery}". Try a different search term.`
                : 'There are no teams to display at the moment.'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}