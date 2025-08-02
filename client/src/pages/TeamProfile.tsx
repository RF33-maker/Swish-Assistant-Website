import { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Trophy, TrendingUp, Star, MapPin, Calendar } from 'lucide-react';
import SwishLogo from '@/assets/Swish Assistant Logo.png';

interface Team {
  team_id: string;
  name: string;
  logo_url?: string;
  description?: string;
  created_at: string;
  league_id: string;
  league_name?: string;
}

interface Player {
  player_id: string;
  name: string;
  team: string;
  position?: string;
  jersey_number?: string;
  avg_points?: number;
  avg_rebounds?: number;
  avg_assists?: number;
  games_played?: number;
}

export default function TeamProfile() {
  const [, params] = useRoute('/team/:teamId');
  const teamId = params?.teamId;
  const { user } = useAuth();
  
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<Player[]>([]);
  const [topPlayer, setTopPlayer] = useState<Player | null>(null);
  const [teamLeagues, setTeamLeagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (teamId) {
      fetchTeamData();
    }
  }, [teamId]);

  const fetchTeamData = async () => {
    try {
      setLoading(true);

      // Fetch team basic info - first check if we have a teams table
      const { data: teamData, error: teamError } = await supabase
        .from('teams')
        .select('*')
        .eq('team_id', teamId)
        .single();

      if (teamError) {
        console.log('No teams table found, using player data to construct team info');
        // If no teams table, construct team from player data
        await fetchTeamFromPlayerData();
      } else {
        setTeam(teamData);
        await fetchTeamLeagues(teamData.league_id);
      }

      // Fetch roster and top player
      await fetchRosterData();
      
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamFromPlayerData = async () => {
    // Get team name from player stats
    const { data: playerData, error } = await supabase
      .from('player_stats')
      .select('team, league_id')
      .eq('team', teamId)
      .limit(1);

    if (playerData && playerData.length > 0) {
      const teamInfo = {
        team_id: teamId!,
        name: playerData[0].team,
        created_at: new Date().toISOString(),
        league_id: playerData[0].league_id
      };
      setTeam(teamInfo);
      await fetchTeamLeagues(playerData[0].league_id);
    }
  };

  const fetchTeamLeagues = async (leagueId: string) => {
    const { data: leagueData } = await supabase
      .from('leagues')
      .select('*')
      .eq('league_id', leagueId);
    
    if (leagueData) {
      setTeamLeagues(leagueData);
    }
  };

  const fetchRosterData = async () => {
    // Fetch all players for this team
    const { data: playersData } = await supabase
      .from('player_stats')
      .select(`
        player_id,
        name,
        team,
        position,
        jersey_number,
        points,
        rebounds,
        assists,
        games_played
      `)
      .eq('team', teamId);

    if (playersData) {
      // Calculate averages for each player
      const playersWithAverages = playersData.reduce((acc: any[], stat) => {
        let player = acc.find(p => p.name === stat.name);
        if (!player) {
          player = {
            player_id: stat.player_id || `${stat.name}-${stat.team}`,
            name: stat.name,
            team: stat.team,
            position: stat.position,
            jersey_number: stat.jersey_number,
            total_points: 0,
            total_rebounds: 0,
            total_assists: 0,
            games_played: 0
          };
          acc.push(player);
        }
        
        player.total_points += stat.points || 0;
        player.total_rebounds += stat.rebounds || 0;
        player.total_assists += stat.assists || 0;
        player.games_played += 1;
        
        return acc;
      }, []);

      // Calculate averages
      const finalPlayers = playersWithAverages.map(player => ({
        ...player,
        avg_points: Math.round((player.total_points / player.games_played) * 10) / 10,
        avg_rebounds: Math.round((player.total_rebounds / player.games_played) * 10) / 10,
        avg_assists: Math.round((player.total_assists / player.games_played) * 10) / 10
      }));

      setRoster(finalPlayers);

      // Find top player (highest avg points)
      if (finalPlayers.length > 0) {
        const topScorer = finalPlayers.reduce((prev, current) => 
          (prev.avg_points > current.avg_points) ? prev : current
        );
        setTopPlayer(topScorer);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="h-64 bg-gray-200 rounded-lg"></div>
                <div className="h-96 bg-gray-200 rounded-lg"></div>
              </div>
              <div className="space-y-6">
                <div className="h-32 bg-gray-200 rounded-lg"></div>
                <div className="h-48 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Team Not Found</h2>
          <p className="text-gray-600">The team you're looking for doesn't exist.</p>
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
                <h1 className="text-xl font-bold text-slate-800">Team Profile</h1>
                <p className="text-sm text-slate-600">Comprehensive team overview and roster</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Team Header */}
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center gap-6">
                  {/* Team Logo */}
                  <div className="w-24 h-24 bg-gradient-to-br from-orange-100 to-orange-200 rounded-lg flex items-center justify-center border-2 border-dashed border-orange-300">
                    {team.logo_url ? (
                      <img 
                        src={team.logo_url} 
                        alt={`${team.name} logo`}
                        className="w-20 h-20 object-contain rounded-lg"
                      />
                    ) : (
                      <div className="text-center">
                        <Users className="w-8 h-8 text-orange-400 mx-auto mb-1" />
                        <span className="text-xs text-orange-600">Logo</span>
                      </div>
                    )}
                  </div>

                  {/* Team Info */}
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">{team.name}</h1>
                    <div className="flex items-center gap-4 text-sm text-slate-600 mb-4">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>Est. {new Date(team.created_at).getFullYear()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{roster.length} Players</span>
                      </div>
                    </div>
                    
                    {/* Team Description */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-slate-800 mb-2">Team Description</h3>
                      <p className="text-slate-600 text-sm leading-relaxed">
                        {team.description || "This team hasn't added a description yet. Team descriptions help fans and players learn more about the team's history, playing style, and achievements."}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Roster */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-orange-600" />
                  Team Roster
                </CardTitle>
              </CardHeader>
              <CardContent>
                {roster.length > 0 ? (
                  <div className="grid gap-4">
                    {roster.map((player, index) => (
                      <div 
                        key={player.player_id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                            <span className="font-bold text-orange-600">
                              {player.jersey_number || (index + 1)}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-800">{player.name}</h4>
                            <p className="text-sm text-slate-600">
                              {player.position || 'Player'} • {player.games_played} Games
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-slate-800">
                            {player.avg_points} PPG
                          </div>
                          <div className="text-xs text-slate-600">
                            {player.avg_rebounds} REB • {player.avg_assists} AST
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No roster data</h3>
                    <p className="text-gray-600">This team doesn't have any player statistics yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Leagues */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-orange-600" />
                  League Participation
                </CardTitle>
              </CardHeader>
              <CardContent>
                {teamLeagues.length > 0 ? (
                  <div className="space-y-3">
                    {teamLeagues.map((league) => (
                      <div key={league.league_id} className="p-3 bg-orange-50 rounded-lg">
                        <h4 className="font-semibold text-slate-800">{league.name}</h4>
                        <p className="text-sm text-slate-600">
                          Active League • {league.is_public ? 'Public' : 'Private'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-sm">No league information available.</p>
                )}
              </CardContent>
            </Card>

            {/* Top Player */}
            {topPlayer && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-orange-600" />
                    Top Performer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-white font-bold text-lg">
                        {topPlayer.name.charAt(0)}
                      </span>
                    </div>
                    <h3 className="font-bold text-slate-800 mb-1">{topPlayer.name}</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      {topPlayer.position || 'Player'}
                    </p>
                    
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <div className="font-bold text-orange-600">{topPlayer.avg_points}</div>
                        <div className="text-xs text-slate-600">PPG</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <div className="font-bold text-orange-600">{topPlayer.avg_rebounds}</div>
                        <div className="text-xs text-slate-600">REB</div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <div className="font-bold text-orange-600">{topPlayer.avg_assists}</div>
                        <div className="text-xs text-slate-600">AST</div>
                      </div>
                    </div>
                    
                    <Badge variant="secondary" className="mt-3">
                      {topPlayer.games_played} Games Played
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-orange-600" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Players</span>
                    <span className="font-semibold">{roster.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Avg Team Points</span>
                    <span className="font-semibold">
                      {roster.length > 0 
                        ? Math.round(roster.reduce((sum, p) => sum + (p.avg_points || 0), 0) * 10) / 10
                        : 0
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Games Played</span>
                    <span className="font-semibold">
                      {roster.length > 0 
                        ? Math.max(...roster.map(p => p.games_played || 0))
                        : 0
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Active Leagues</span>
                    <span className="font-semibold">{teamLeagues.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}