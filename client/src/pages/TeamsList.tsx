import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Search, Trophy, TrendingUp, ChevronRight, ArrowLeft } from 'lucide-react';
import { Link as WouterLink } from 'wouter';
import SwishLogo from '@/assets/Swish Assistant Logo.png';
import { TeamLogo } from '@/components/TeamLogo';

interface Team {
  name: string;
  league_id: string;
  league_name?: string;
  league_slug?: string;
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

      // Get unique teams from player_stats with league info, using team_name field
      const { data: teamsData, error } = await supabase
        .from('player_stats')
        .select(`
          team_name,
          team,
          league_id,
          spoints,
          full_name,
          name,
          leagues!inner(name, slug)
        `);

      if (error) {
        console.error('Error fetching teams:', error);
        return;
      }

      // Process teams data
      const teamsMap = new Map();
      
      teamsData?.forEach(stat => {
        const teamName = stat.team_name || stat.team;
        if (!teamName) return;
        
        const teamKey = `${teamName}-${stat.league_id}`;
        if (!teamsMap.has(teamKey)) {
          teamsMap.set(teamKey, {
            name: teamName,
            league_id: stat.league_id,
            league_name: stat.leagues?.[0]?.name,
            league_slug: stat.leagues?.[0]?.slug,
            players: new Set(),
            total_points: 0,
            games: 0
          });
        }
        
        const team = teamsMap.get(teamKey);
        team.players.add(stat.full_name || stat.name || 'Unknown Player');
        team.total_points += stat.spoints || 0;
        team.games += 1;
      });

      // Convert to array and calculate averages
      const teamsArray = Array.from(teamsMap.values()).map(team => ({
        name: team.name,
        league_id: team.league_id,
        league_name: team.league_name,
        league_slug: team.league_slug,
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
              <WouterLink to="/">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <ArrowLeft className="w-5 h-5 text-gray-600" />
                </button>
              </WouterLink>
              <div className="p-2 bg-orange-100 rounded-lg">
                <img 
                  src={SwishLogo} 
                  alt="Swish Assistant" 
                  className="w-6 h-6 object-contain"
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Teams</h1>
                <p className="text-sm text-slate-600">View team profiles</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Teams List */}
        {filteredTeams.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {filteredTeams.map((team) => (
              <Link key={`${team.name}-${team.league_id}`} to={team.league_slug ? `/league/${team.league_slug}/team/${encodeURIComponent(team.name)}` : `/team/${encodeURIComponent(team.name)}`}>
                <div className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <TeamLogo teamName={team.name} leagueId={team.league_id} size="md" />
                    <div>
                      <h3 className="font-semibold text-slate-800 text-lg">{team.name}</h3>
                      {team.league_name && (
                        <p className="text-sm text-slate-600">{team.league_name}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-600 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No teams available
            </h3>
            <p className="text-gray-600">
              There are no teams to display at the moment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}