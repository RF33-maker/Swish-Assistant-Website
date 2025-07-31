import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Trophy, User, TrendingUp, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlayerStat {
  id: string;
  player_id: string;
  name?: string;  // Using 'name' column as requested
  player_name?: string;  // Fallback column
  team_name?: string;
  team?: string;  // Fallback column
  game_date: string;
  opponent?: string;
  points?: number;
  rebounds?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
  field_goals_made?: number;
  field_goals_attempted?: number;
  three_pointers_made?: number;
  three_pointers_attempted?: number;
  free_throws_made?: number;
  free_throws_attempted?: number;
  minutes_played?: number;
}

interface SeasonAverages {
  games_played: number;
  avg_points: number;
  avg_rebounds: number;
  avg_assists: number;
  avg_steals: number;
  avg_blocks: number;
  fg_percentage: number;
  three_point_percentage: number;
  ft_percentage: number;
}

export default function PlayerStatsPage() {
  const [match, params] = useRoute("/player/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const playerId = params?.id;
  
  console.log('🎯 ROUTE DEBUG - Match:', match);
  console.log('🎯 ROUTE DEBUG - Params:', params);
  console.log('🎯 ROUTE DEBUG - Player ID:', playerId);
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string } | null>(null);
  const [playerLeagues, setPlayerLeagues] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) {
      console.log('No playerId provided');
      return;
    }

    console.log('🏀 PLAYER PAGE - Starting data fetch for playerId:', playerId);

    const fetchPlayerData = async () => {
      setLoading(true);
      try {
        console.log('🔍 Step 1: Fetching player record by ID...');
        
        // First get the player's name from the specific record ID
        const { data: playerRecord, error: playerError } = await supabase
          .from('player_stats')
          .select('name, team')
          .eq('id', playerId)
          .single();

        console.log('📋 Step 1 Result - Player record:', playerRecord);
        console.log('📋 Step 1 Error:', playerError);

        if (playerError || !playerRecord) {
          console.error('❌ Could not find player with ID:', playerId, 'Error:', playerError);
          toast({
            title: "Player Not Found",
            description: "Could not find player with the specified ID",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        console.log('🔍 Step 2: Getting all stats for player:', playerRecord.name);
        const { data: stats, error: statsError } = await supabase
          .from('player_stats')
          .select('*')
          .eq('name', playerRecord.name)
          .order('game_date', { ascending: false });

        console.log('📊 Step 2 Result - Found', stats?.length || 0, 'stat records');
        console.log('📊 Stats data sample:', stats?.[0]);
        console.log('📊 Stats error:', statsError);

        if (statsError) {
          console.error('❌ Error fetching player stats:', statsError);
          toast({
            title: "Error Loading Stats",
            description: "Failed to load player statistics",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        console.log('✅ Step 3: Setting player stats...');
        setPlayerStats(stats || []);

        // Step 4: Get unique leagues for this player
        if (stats && stats.length > 0) {
          console.log('🏆 Step 4: Fetching player leagues...');
          const uniqueLeagues = Array.from(
            new Map(
              stats
                .filter(stat => stat.league_id)
                .map(stat => [stat.league_id, { 
                  id: stat.league_id, 
                  name: 'League',
                  slug: stat.league_id 
                }])
            ).values()
          );
          
          // Try to fetch league names from Supabase first
          if (uniqueLeagues.length > 0) {
            try {
              const { data: leaguesData, error: leaguesError } = await supabase
                .from('leagues')
                .select('id, name, slug')
                .in('id', uniqueLeagues.map(l => l.id));
              
              console.log('🏆 Leagues query result:', { leaguesData, leaguesError });
              
              if (leaguesData && leaguesData.length > 0) {
                setPlayerLeagues(leaguesData);
                console.log('🏆 Found leagues from Supabase:', leaguesData);
              } else {
                // Fallback: Create league entries with IDs as names for now
                const fallbackLeagues = uniqueLeagues.map(league => ({
                  id: league.id,
                  name: `League ${league.id.substring(0, 8)}...`,
                  slug: league.id
                }));
                setPlayerLeagues(fallbackLeagues);
                console.log('🏆 Using fallback leagues:', fallbackLeagues);
              }
            } catch (error) {
              console.error('🏆 Error fetching leagues:', error);
              // Fallback for any errors
              const fallbackLeagues = uniqueLeagues.map(league => ({
                id: league.id,
                name: `League ${league.id.substring(0, 8)}...`,
                slug: league.id
              }));
              setPlayerLeagues(fallbackLeagues);
            }
          }
        }

        // Calculate season averages if we have stats
        if (stats && stats.length > 0) {
          console.log('📈 Step 5: Calculating averages for', stats.length, 'games');
          setPlayerInfo({
            name: stats[0].name || stats[0].player_name || 'Unknown Player',
            team: stats[0].team || stats[0].team_name || 'Unknown Team'
          });

          const totals = stats.reduce((acc, game) => ({
            points: acc.points + (game.points || 0),
            rebounds: acc.rebounds + (game.rebounds_total || game.rebounds || 0),
            assists: acc.assists + (game.assists || 0),
            steals: acc.steals + (game.steals || 0),
            blocks: acc.blocks + (game.blocks || 0),
            field_goals_made: acc.field_goals_made + (game.field_goals_made || 0),
            field_goals_attempted: acc.field_goals_attempted + (game.field_goals_attempted || 0),
            three_pointers_made: acc.three_pointers_made + (game.three_pt_made || game.three_pointers_made || 0),
            three_pointers_attempted: acc.three_pointers_attempted + (game.three_pt_attempted || game.three_pointers_attempted || 0),
            free_throws_made: acc.free_throws_made + (game.free_throws_made || 0),
            free_throws_attempted: acc.free_throws_attempted + (game.free_throws_attempted || 0),
          }), {
            points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
            field_goals_made: 0, field_goals_attempted: 0,
            three_pointers_made: 0, three_pointers_attempted: 0,
            free_throws_made: 0, free_throws_attempted: 0
          });

          const games = stats.length;
          const averages = {
            games_played: games,
            avg_points: totals.points / games,
            avg_rebounds: totals.rebounds / games,
            avg_assists: totals.assists / games,
            avg_steals: totals.steals / games,
            avg_blocks: totals.blocks / games,
            fg_percentage: totals.field_goals_attempted > 0 ? (totals.field_goals_made / totals.field_goals_attempted) * 100 : 0,
            three_point_percentage: totals.three_pointers_attempted > 0 ? (totals.three_pointers_made / totals.three_pointers_attempted) * 100 : 0,
            ft_percentage: totals.free_throws_attempted > 0 ? (totals.free_throws_made / totals.free_throws_attempted) * 100 : 0,
          };
          console.log('📊 Step 6: Calculated averages:', averages);
          setSeasonAverages(averages);
        } else {
          console.log('⚠️ No stats found for player');
        }
        
        console.log('✅ PLAYER PAGE - Data fetch completed successfully');
      } catch (error) {
        console.error('❌ PLAYER PAGE - Unexpected error:', error);
        toast({
          title: "Error",
          description: "Failed to load player data",
          variant: "destructive",
        });
      } finally {
        console.log('🏁 PLAYER PAGE - Setting loading to false');
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerId, toast]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-orange-800">Loading player stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 border-orange-200 hover:bg-orange-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          
          {playerInfo && (
            <div className="flex items-center gap-4 animate-slide-in-up">
              {/* Profile Picture Section */}
              <div className="relative group">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center animate-float hover:animate-shake cursor-pointer shadow-lg">
                  <User className="h-10 w-10 text-white" />
                  {/* Camera overlay for profile pic upload */}
                  <div className="absolute inset-0 rounded-full bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-orange-500 rounded-full p-1.5 shadow-lg animate-pulse">
                  <TrendingUp className="h-3 w-3 text-white" />
                </div>
              </div>
              
              {/* Player Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-bold text-orange-900 hover:text-orange-700 transition-colors duration-300 break-words">{playerInfo.name}</h1>
                  </div>
                  <TrendingUp className="h-6 w-6 text-orange-500 animate-bounce flex-shrink-0 mt-1" />
                </div>
                <p className="text-orange-700 flex items-center gap-2 hover:text-orange-600 transition-colors duration-300 text-lg mb-3">
                  <Trophy className="h-5 w-5 hover:animate-bounce flex-shrink-0" />
                  <span className="break-words">{playerInfo.team}</span>
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm text-orange-600">
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                    Active Player
                  </span>
                  <span className="text-orange-500 font-semibold whitespace-nowrap">Performance Trending ↗</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Player Leagues */}
        {playerLeagues.length > 0 && (
          <Card className="mb-6 border-orange-200 shadow-lg animate-slide-in-up">
            <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 animate-float" />
                Active Leagues ({playerLeagues.length})
              </CardTitle>
              <CardDescription className="text-orange-100">
                Leagues where this player is currently active
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {playerLeagues.map((league, index) => (
                  <div
                    key={league.id}
                    onClick={() => setLocation(`/leagues/${league.slug}`)}
                    className="group cursor-pointer transform hover:scale-105 transition-all duration-300 animate-slide-in-up hover:animate-glow"
                    style={{ animationDelay: `${index * 150}ms` }}
                  >
                    <Card className="border-orange-200 hover:border-orange-400 transition-all duration-300 hover:shadow-xl">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center group-hover:rotate-12 transition-transform duration-300">
                            <Trophy className="h-6 w-6 text-white group-hover:animate-bounce" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-orange-900 group-hover:text-orange-700 transition-colors duration-300 truncate">
                              {league.name}
                            </h3>
                            <p className="text-sm text-orange-600 group-hover:text-orange-500 transition-colors duration-300">
                              Click to view league →
                            </p>
                          </div>
                          <TrendingUp className="h-5 w-5 text-orange-500 group-hover:animate-bounce" />
                        </div>
                        <div className="mt-3 w-full bg-orange-100 h-1 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transform origin-left transition-transform duration-1000 group-hover:scale-x-110 w-full"></div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Season Averages */}
        {seasonAverages && (
          <Card className="mb-8 border-orange-200 shadow-lg animate-slide-in-up hover:animate-glow">
            <CardHeader className="bg-orange-600 text-white rounded-t-lg">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 animate-float" />
                Season Averages ({seasonAverages.games_played} games)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                {/* Points */}
                <div className="text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative">
                    <div className="text-4xl font-bold text-orange-600 group-hover:text-orange-700 transition-colors duration-300 group-hover:animate-pulse">
                      {seasonAverages.avg_points.toFixed(1)}
                    </div>
                    <div className="text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">PPG</div>
                    <div className="w-full bg-orange-100 h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_points / 30) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Rebounds */}
                <div className="text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative">
                    <div className="text-4xl font-bold text-orange-600 group-hover:text-orange-700 transition-colors duration-300 group-hover:animate-bounce">
                      {seasonAverages.avg_rebounds.toFixed(1)}
                    </div>
                    <div className="text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">RPG</div>
                    <div className="w-full bg-orange-100 h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-yellow-500 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_rebounds / 15) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Assists */}
                <div className="text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative">
                    <div className="text-4xl font-bold text-orange-600 group-hover:text-orange-700 transition-colors duration-300 group-hover:animate-pulse">
                      {seasonAverages.avg_assists.toFixed(1)}
                    </div>
                    <div className="text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">APG</div>
                    <div className="w-full bg-orange-100 h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-green-500 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_assists / 12) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Field Goal % */}
                <div className="text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative">
                    <div className="text-4xl font-bold text-orange-600 group-hover:text-orange-700 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(seasonAverages.fg_percentage)}
                    </div>
                    <div className="text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">FG%</div>
                    <div className="w-full bg-orange-100 h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-blue-500 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${seasonAverages.fg_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* 3-Point % */}
                <div className="text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative">
                    <div className="text-4xl font-bold text-orange-600 group-hover:text-orange-700 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(seasonAverages.three_point_percentage)}
                    </div>
                    <div className="text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">3P%</div>
                    <div className="w-full bg-orange-100 h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-purple-500 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${seasonAverages.three_point_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Free Throw % */}
                <div className="text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative">
                    <div className="text-4xl font-bold text-orange-600 group-hover:text-orange-700 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(seasonAverages.ft_percentage)}
                    </div>
                    <div className="text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">FT%</div>
                    <div className="w-full bg-orange-100 h-2 rounded-full mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-400 to-indigo-500 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${seasonAverages.ft_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game Log */}
        <Card className="border-orange-200 shadow-lg">
          <CardHeader className="bg-orange-100 border-b border-orange-200">
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <Calendar className="h-5 w-5" />
              Game Log
            </CardTitle>
            <CardDescription className="text-orange-700">
              Recent game performances
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {playerStats.length === 0 ? (
              <div className="p-8 text-center text-orange-600">
                No game statistics found for this player.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-orange-50 border-b border-orange-200">
                    <tr className="text-left">
                      <th className="px-4 py-3 text-orange-900 font-semibold">Date</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">Opponent</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">MIN</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">PTS</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">REB</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">AST</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">STL</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">BLK</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">FG</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">3P</th>
                      <th className="px-4 py-3 text-orange-900 font-semibold">FT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((game, index) => (
                      <tr 
                        key={game.id} 
                        className={`border-b border-orange-100 hover:bg-orange-50 hover:scale-[1.02] transform transition-all duration-200 cursor-pointer group ${
                          index % 2 === 0 ? 'bg-white' : 'bg-orange-25'
                        }`}
                      >
                        <td className="px-4 py-3 text-orange-800">{formatDate(game.game_date)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="border-orange-300 text-orange-700">
                            vs {game.opponent}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-orange-800">{game.minutes_played || 0}</td>
                        <td className="px-4 py-3 font-semibold text-orange-900 group-hover:text-orange-700 group-hover:scale-110 transition-all duration-200">{game.points || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.rebounds || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.assists || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.steals || 0}</td>
                        <td className="px-4 py-3 text-orange-800">{game.blocks || 0}</td>
                        <td className="px-4 py-3 text-orange-800">
                          {game.field_goals_made || 0}/{game.field_goals_attempted || 0}
                        </td>
                        <td className="px-4 py-3 text-orange-800">
                          {game.three_pointers_made || 0}/{game.three_pointers_attempted || 0}
                        </td>
                        <td className="px-4 py-3 text-orange-800">
                          {game.free_throws_made || 0}/{game.free_throws_attempted || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}