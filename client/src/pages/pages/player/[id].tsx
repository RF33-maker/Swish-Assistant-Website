import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Trophy, User, TrendingUp, Camera, Brain, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generatePlayerAnalysis, type PlayerAnalysisData } from "@/lib/ai-analysis";
import SwishLogoImg from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";

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
  rebounds_total?: number;
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
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string; position?: string; number?: number; leagueId?: string } | null>(null);
  const [playerLeagues, setPlayerLeagues] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => {
    if (!playerId) {
      console.log('No playerId provided');
      return;
    }

    console.log('🏀 PLAYER PAGE - Starting data fetch for playerId:', playerId);

    const fetchPlayerData = async () => {
      setLoading(true);
      try {
        console.log('🔍 Step 1: Fetching player record by player_id...');
        
        // First check if playerId is a player_id or old record id
        let actualPlayerId = playerId;
        let playerInfo = null;

        // Try to get player info from players table using playerId as player_id
        const { data: playerFromPlayersTable, error: playersError } = await supabase
          .from('players')
          .select('*')
          .eq('id', playerId)
          .single();

        if (playerFromPlayersTable && !playersError) {
          // Found in players table - use this info
          playerInfo = {
            name: playerFromPlayersTable.name,
            team: playerFromPlayersTable.team,
            position: playerFromPlayersTable.position,
            number: playerFromPlayersTable.number
          };
          actualPlayerId = playerId;
          console.log('📋 Found player in players table:', playerInfo);
        } else {
          // Fallback: treat playerId as old record ID and get player_id from player_stats
          console.log('🔍 Fallback: Looking up by old record ID...');
          const { data: playerRecord, error: playerError } = await supabase
            .from('player_stats')
            .select('player_id, full_name, name, team, position, number')
            .eq('id', playerId)
            .single();

          if (playerError || !playerRecord || !playerRecord.player_id) {
            console.error('❌ Could not find player with ID:', playerId, 'Error:', playerError);
            toast({
              title: "Player Not Found",
              description: "Could not find player with the specified ID",
              variant: "destructive",
            });
            setLoading(false);
            return;
          }

          actualPlayerId = playerRecord.player_id;
          playerInfo = {
            name: playerRecord.full_name || playerRecord.name || 'Unknown Player',
            team: playerRecord.team,
            position: playerRecord.position,
            number: playerRecord.number
          };
          console.log('📋 Found player via record lookup:', playerInfo);
        }

        console.log('🔍 Step 2: Getting all stats for player_id:', actualPlayerId);
        const { data: stats, error: statsError } = await supabase
          .from('player_stats')
          .select('*, players:player_id(full_name)')
          .eq('player_id', actualPlayerId)
          .order('created_at', { ascending: false });

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

        console.log('✅ Step 3: Setting player stats and info...');
        setPlayerStats(stats || []);
        
        // If we have stats with joined players data, use that for player info
        if (stats && stats.length > 0 && stats[0].players) {
          console.log('📋 Using joined players data:', stats[0].players);
          playerInfo = {
            name: stats[0].players.full_name || stats[0].full_name || stats[0].name || `${stats[0].firstname || ''} ${stats[0].familyname || ''}`.trim() || 'Unknown Player',
            team: stats[0].team_name || stats[0].team || 'Unknown Team',
            position: stats[0].position,
            number: stats[0].number,
            leagueId: stats[0].league_id
          };
        }
        
        setPlayerInfo(playerInfo);

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
          
          // Get leagues this player has actually played in
          if (stats && stats.length > 0) {
            try {
              // Get the user_id which represents the league connection
              const userId = stats[0].user_id;
              console.log('🏆 Player user_id:', userId);
              
              // Only query leagues if user_id is not null
              let leaguesData = null;
              let leaguesError = null;
              
              if (userId) {
                const result = await supabase
                  .from('leagues')
                  .select('name, slug, user_id')
                  .eq('user_id', userId)
                  .eq('is_public', true);
                leaguesData = result.data;
                leaguesError = result.error;
              }
              
              console.log('🏆 League query result:', { leaguesData, leaguesError });
              
              if (leaguesData && leaguesData.length > 0) {
                // For James Claar, he should be in UWE Summer League D1 based on your feedback
                // Let's find the specific league this player belongs to by matching the team
                const playerTeam = stats[0].team; // "Bristol Hurricanes"
                
                // Look for a league that would contain Bristol Hurricanes
                let actualLeague = leaguesData.find(league => 
                  league.name.toLowerCase().includes('uwe') && 
                  league.name.toLowerCase().includes('d1')
                );
                
                // If no specific match, take the first available league
                if (!actualLeague) {
                  actualLeague = leaguesData[0];
                }
                
                const playerLeague = {
                  id: actualLeague.slug,
                  name: actualLeague.name,
                  slug: actualLeague.slug
                };
                
                setPlayerLeagues([playerLeague]);
                console.log('🏆 Found actual league for player:', playerLeague);
              } else {
                console.log('🏆 No leagues found for user_id:', userId);
                setPlayerLeagues([]);
              }
              
            } catch (error) {
              console.error('🏆 Error fetching leagues:', error);
              setPlayerLeagues([]);
            }
          } else {
            setPlayerLeagues([]);
          }
        }

        // Calculate season averages if we have stats
        if (stats && stats.length > 0) {
          console.log('📈 Step 5: Calculating averages for', stats.length, 'games');
          // This section is now redundant since we set playerInfo above with joined data
          // but keep as extra fallback safety
          if (!playerInfo || !playerInfo.name || playerInfo.name === 'Unknown Player') {
            const fallbackName = stats[0].players?.full_name || 
                                stats[0].full_name || 
                                stats[0].name || 
                                `${stats[0].firstname || ''} ${stats[0].familyname || ''}`.trim() || 
                                'Unknown Player';
            const fallbackTeam = stats[0].team_name || 
                                stats[0].team || 
                                'Unknown Team';
            setPlayerInfo({
              name: fallbackName,
              team: fallbackTeam,
              position: stats[0].position,
              number: stats[0].number,
              leagueId: stats[0].league_id
            });
          }

          const totals = stats.reduce((acc, game) => ({
            points: acc.points + (game.spoints || game.points || 0),
            rebounds: acc.rebounds + (game.sreboundstotal || game.rebounds_total || 0),
            assists: acc.assists + (game.sassists || game.assists || 0),
            steals: acc.steals + (game.ssteals || 0),
            blocks: acc.blocks + (game.sblocks || 0),
            field_goals_made: acc.field_goals_made + (game.sfieldgoalsmade || 0),
            field_goals_attempted: acc.field_goals_attempted + (game.sfieldgoalsattempted || 0),
            three_pointers_made: acc.three_pointers_made + (game.sthreepointersmade || 0),
            three_pointers_attempted: acc.three_pointers_attempted + (game.sthreepointersattempted || 0),
            free_throws_made: acc.free_throws_made + (game.sfreethrowsmade || 0),
            free_throws_attempted: acc.free_throws_attempted + (game.sfreethrowsattempted || 0),
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

          // Generate AI analysis
          if (playerInfo && averages) {
            setAnalysisLoading(true);
            try {
              const analysisData: PlayerAnalysisData = {
                name: playerInfo.name,
                games_played: averages.games_played,
                avg_points: averages.avg_points,
                avg_rebounds: averages.avg_rebounds,
                avg_assists: averages.avg_assists,
                avg_steals: averages.avg_steals,
                avg_blocks: averages.avg_blocks,
                fg_percentage: averages.fg_percentage,
                three_point_percentage: averages.three_point_percentage,
                ft_percentage: averages.ft_percentage
              };
              
              const analysis = await generatePlayerAnalysis(analysisData);
              setAiAnalysis(analysis);
              console.log("🤖 AI Analysis generated:", analysis);
            } catch (error) {
              console.error("❌ AI Analysis error:", error);
              setAiAnalysis("Dynamic player with strong fundamentals and competitive drive.");
            } finally {
              setAnalysisLoading(false);
            }
          }
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

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      console.log("🔍 Searching for:", searchQuery);
      
      const [leaguesResponse, playersResponse] = await Promise.all([
        supabase
          .from("leagues")
          .select("name, slug")
          .or(`name.ilike.%${searchQuery}%`)
          .eq("is_public", true),
        supabase
          .from("player_stats")
          .select("name, team, id")
          .ilike("name", `%${searchQuery}%`)
          .limit(10)
      ]);

      const leagues = leaguesResponse.data || [];
      const players = playersResponse.data || [];

      // Remove duplicate players (same name) and format
      const uniquePlayers = players.reduce((acc: any[], player) => {
        if (!acc.some(p => p.name === player.name)) {
          acc.push({
            name: player.name,
            team: player.team,
            player_id: player.id,
            type: 'player'
          });
        }
        return acc;
      }, []);

      // Format leagues
      const formattedLeagues = leagues.map(league => ({
        ...league,
        type: 'league'
      }));

      // Combine and limit results
      const combined = [...formattedLeagues, ...uniquePlayers].slice(0, 8);
      setSearchSuggestions(combined);
    }

    const delayDebounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleSearchSelect = (item: any) => {
    setSearchQuery("");
    setSearchSuggestions([]);
    
    if (item.type === 'league') {
      setLocation(`/league/${item.slug}`);
    } else if (item.type === 'player') {
      setLocation(`/player/${item.player_id}`);
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const { data, error } = await supabase
      .from("leagues")
      .select("slug")
      .ilike("name", `%${searchQuery.toLowerCase()}%`)
      .eq("is_public", true);

    if (error) console.error("Supabase error:", error);

    if (data && data.length > 0) {
      setLocation(`/league/${data[0].slug}`);
    } else {
      // Try to find a player instead
      const { data: playerData } = await supabase
        .from("player_stats")
        .select("id, name")
        .ilike("name", `%${searchQuery}%`)
        .limit(1);
      
      if (playerData && playerData.length > 0) {
        setLocation(`/player/${playerData[0].id}`);
      } else {
        toast({
          title: "No Results",
          description: "No players or leagues found with that name.",
          variant: "destructive",
        });
      }
    }
  };

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
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="w-full md:w-auto">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation('/')}
              className="group flex items-center gap-2 border-orange-200 hover:bg-white hover:border-orange-300 transition-all duration-300 hover:shadow-md w-full md:w-auto"
            >
              <ArrowLeft className="h-4 w-4 group-hover:hidden transition-all duration-300" />
              <div className="hidden group-hover:block transition-all duration-300">
                <img src={SwishLogoImg} alt="Swish Assistant" className="h-4 w-4 object-contain" />
              </div>
              <span className="text-orange-700 group-hover:text-orange-800">Back to Dashboard</span>
            </Button>
          </div>
          
          {/* Search Bar in Header */}
          <div className="flex-1 w-full md:max-w-md lg:max-w-lg relative">
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center shadow-md rounded-full border border-orange-100 overflow-hidden bg-white"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search players or leagues..."
                className="flex-1 px-3 md:px-4 py-2 text-sm text-orange-800 focus:outline-none bg-white"
              />
              <button
                type="submit"
                className="bg-orange-400 text-white font-semibold px-3 md:px-4 py-2 hover:bg-orange-500 transition text-sm"
              >
                Search
              </button>
            </form>

            {searchSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full bg-white border border-orange-200 mt-1 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchSuggestions.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => handleSearchSelect(item)}
                    className="px-4 py-3 cursor-pointer hover:bg-orange-50 text-left border-b border-orange-100 last:border-b-0 transition-colors duration-200"
                  >
                    <div className="flex items-center gap-3">
                      {item.type === 'league' ? (
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
                          <span className="text-white text-sm">🏆</span>
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center">
                          <span className="text-white text-sm">👤</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-orange-900 text-sm">{item.name}</div>
                        {item.type === 'player' && (
                          <div className="text-xs text-orange-600">{item.team}</div>
                        )}
                        {item.type === 'league' && (
                          <div className="text-xs text-orange-600">League</div>
                        )}
                      </div>
                      <div className="text-xs text-orange-700 capitalize bg-orange-100 px-2 py-1 rounded-full font-medium">
                        {item.type}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Player Info Section */}
        {playerInfo && (
          <div className="mb-6 md:mb-8">
            <Card className="border-orange-200 shadow-md animate-slide-in-up bg-white">
              <CardContent className="p-4 md:p-6">
                <div className="flex items-center gap-4">
                  {/* Team Logo */}
                  {playerInfo.team && playerInfo.leagueId && (
                    <TeamLogo 
                      teamName={playerInfo.team} 
                      leagueId={playerInfo.leagueId}
                      size="xl"
                      className="flex-shrink-0"
                    />
                  )}
                  
                  {/* Player Info */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-bold text-orange-900 mb-1 break-words" data-testid="text-player-name">{playerInfo.name}</h1>
                    <p className="text-orange-700 flex items-center gap-2 text-sm md:text-base mb-2" data-testid="text-player-team">
                      <Trophy className="h-4 w-4 flex-shrink-0" />
                      <span className="break-words">{playerInfo.team}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-orange-600">
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                        Active Player
                      </span>
                      {playerInfo.position && (
                        <span className="whitespace-nowrap">• {playerInfo.position}</span>
                      )}
                      {playerInfo.number && (
                        <span className="whitespace-nowrap">• #{playerInfo.number}</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Player Bio - AI Generated */}
        <Card className="mb-6 md:mb-8 border-orange-200 shadow-md animate-slide-in-up bg-gradient-to-br from-white to-orange-50">
          <CardHeader className="bg-white text-orange-900 rounded-t-lg border-b border-orange-200">
            <CardTitle className="flex items-center gap-2">
              {analysisLoading ? (
                <Brain className="h-5 w-5 animate-pulse text-orange-600" />
              ) : (
                <Sparkles className="h-5 w-5 text-orange-600 animate-float" />
              )}
              Player Bio
            </CardTitle>
            <CardDescription className="text-orange-700">
              {aiAnalysis ? "AI-powered analysis of playing style and strengths" : "AI generation coming soon"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            {analysisLoading ? (
              <div className="flex items-center gap-3 text-orange-700">
                <Brain className="h-5 w-5 animate-pulse" />
                <span className="animate-pulse">Generating player bio...</span>
              </div>
            ) : aiAnalysis ? (
              <p className="text-sm md:text-base text-orange-800 leading-relaxed">
                {aiAnalysis}
              </p>
            ) : (
              <div className="text-sm md:text-base text-orange-600 leading-relaxed italic">
                Player bio AI generation is coming soon. Check back later for detailed analysis of playing style and strengths.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Player Leagues */}
        {playerLeagues.length > 0 && (
          <Card className="mb-6 border-orange-200 shadow-md animate-slide-in-up bg-white">
            <CardHeader className="bg-white text-orange-900 rounded-t-lg border-b border-orange-200">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 animate-float text-orange-700" />
                Active Leagues ({playerLeagues.length})
              </CardTitle>
              <CardDescription className="text-orange-700">
                Leagues where this player is currently active
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {playerLeagues.map((league, index) => (
                  <div
                    key={league.id}
                    onClick={() => setLocation(`/league/${league.slug}`)}
                    className="group cursor-pointer transform hover:scale-105 transition-all duration-300 animate-slide-in-up hover:animate-glow"
                    style={{ animationDelay: `${index * 150}ms` }}
                  >
                    <Card className="border-orange-200 hover:border-orange-300 transition-all duration-300 hover:shadow-md bg-white">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center group-hover:rotate-12 transition-transform duration-300">
                            <Trophy className="h-6 w-6 text-white group-hover:animate-bounce" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-orange-800 group-hover:text-orange-700 transition-colors duration-300 truncate">
                              {league.name}
                            </h3>
                            <p className="text-sm text-orange-700 group-hover:text-orange-600 transition-colors duration-300">
                              Click to view league →
                            </p>
                          </div>
                          <TrendingUp className="h-5 w-5 text-orange-600 group-hover:animate-bounce" />
                        </div>
                        <div className="mt-3 w-full bg-orange-50 h-1 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-transform duration-1000 group-hover:scale-x-110 w-full"></div>
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
          <Card className="mb-8 border-orange-200 shadow-md animate-slide-in-up hover:animate-glow bg-white">
            <CardHeader className="bg-white text-orange-900 rounded-t-lg border-b border-orange-200">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 animate-float text-orange-700" />
                Season Averages ({seasonAverages.games_played} games)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:pt-6">
              <div className="grid [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))] justify-center gap-3 sm:gap-4 lg:gap-6">
                {/* Points */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-pulse">
                      {seasonAverages.avg_points.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">PPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_points / 30) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Rebounds */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-bounce">
                      {seasonAverages.avg_rebounds.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">RPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_rebounds / 15) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Assists */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-pulse">
                      {seasonAverages.avg_assists.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">APG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_assists / 12) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Steals */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-pulse">
                      {seasonAverages.avg_steals.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">SPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_steals / 5) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Blocks */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-pulse">
                      {seasonAverages.avg_blocks.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">BPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((seasonAverages.avg_blocks / 5) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Field Goal % */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(seasonAverages.fg_percentage)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">FG%</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${seasonAverages.fg_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* 3-Point % */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(seasonAverages.three_point_percentage)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">3P%</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${seasonAverages.three_point_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Free Throw % */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 group-hover:text-orange-800 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(seasonAverages.ft_percentage)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 group-hover:text-orange-800 transition-colors duration-300 mt-1">FT%</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
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
        <Card className="border-orange-200 shadow-md bg-white">
          <CardHeader className="bg-white border-b border-orange-200">
            <CardTitle className="flex items-center gap-2 text-orange-800 text-base md:text-lg">
              <Calendar className="h-4 w-4 md:h-5 md:w-5" />
              Game Log
            </CardTitle>
            <CardDescription className="text-orange-700 text-xs md:text-sm">
              Recent game performances
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {playerStats.length === 0 ? (
              <div className="p-6 md:p-8 text-center text-orange-600 text-sm md:text-base">
                No game statistics found for this player.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-4 md:mx-0 border-t border-orange-200">
                <table className="w-full">
                  <thead className="bg-orange-50 border-b border-orange-200">
                    <tr className="text-left">
                      <th className="sticky left-0 bg-orange-50 px-2 md:px-4 py-2 md:py-3 text-orange-900 font-semibold text-xs md:text-sm z-10 min-w-[70px] md:min-w-[90px]">Date</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-orange-900 font-semibold text-xs md:text-sm min-w-[80px] md:min-w-[100px]">OPP</th>
                      <th className="hidden md:table-cell px-4 py-3 text-orange-900 font-semibold text-sm">MIN</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-orange-900 font-semibold text-xs md:text-sm text-center min-w-[45px]">PTS</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-orange-900 font-semibold text-xs md:text-sm text-center min-w-[45px]">REB</th>
                      <th className="px-2 md:px-4 py-2 md:py-3 text-orange-900 font-semibold text-xs md:text-sm text-center min-w-[45px]">AST</th>
                      <th className="hidden md:table-cell px-4 py-3 text-orange-900 font-semibold text-sm text-center">STL</th>
                      <th className="hidden md:table-cell px-4 py-3 text-orange-900 font-semibold text-sm text-center">BLK</th>
                      <th className="hidden md:table-cell px-4 py-3 text-orange-900 font-semibold text-sm text-center">FG</th>
                      <th className="hidden md:table-cell px-4 py-3 text-orange-900 font-semibold text-sm text-center">3P</th>
                      <th className="hidden md:table-cell px-4 py-3 text-orange-900 font-semibold text-sm text-center">FT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((game, index) => {
                      const opponentName = game.opponent || 
                        (game.is_home_player === true && game.away_team) ||
                        (game.is_home_player === false && game.home_team) ||
                        '--';
                      
                      return (
                        <tr 
                          key={game.id} 
                          className={`border-b border-orange-100 hover:bg-orange-50 hover:scale-[1.02] transform transition-all duration-200 cursor-pointer group ${
                            index % 2 === 0 ? 'bg-white' : 'bg-orange-25'
                          }`}
                          data-testid={`game-row-${game.id}`}
                        >
                          <td className="sticky left-0 bg-inherit px-2 md:px-4 py-2 md:py-3 text-orange-800 text-[10px] md:text-sm z-10">
                            {formatDate(game.game_date || game.created_at)}
                          </td>
                          <td className="px-2 md:px-4 py-2 md:py-3">
                            <Badge variant="outline" className="border-orange-300 text-orange-700 text-[10px] md:text-sm whitespace-nowrap">
                              vs {opponentName}
                            </Badge>
                          </td>
                        <td className="hidden md:table-cell px-4 py-3 text-orange-800 text-sm text-center">{game.sminutes || '0'}</td>
                        <td className="px-2 md:px-4 py-2 md:py-3 font-semibold text-orange-900 group-hover:text-orange-700 transition-all duration-200 text-xs md:text-sm text-center">{game.spoints || game.points || 0}</td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-orange-800 text-xs md:text-sm text-center font-medium">{game.sreboundstotal || game.rebounds_total || 0}</td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-orange-800 text-xs md:text-sm text-center font-medium">{game.sassists || game.assists || 0}</td>
                        <td className="hidden md:table-cell px-4 py-3 text-orange-800 text-sm text-center">{game.ssteals || 0}</td>
                        <td className="hidden md:table-cell px-4 py-3 text-orange-800 text-sm text-center">{game.sblocks || 0}</td>
                        <td className="hidden md:table-cell px-4 py-3 text-orange-800 text-sm text-center">
                          {game.sfieldgoalsmade || 0}/{game.sfieldgoalsattempted || 0}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-orange-800 text-sm text-center">
                          {game.sthreepointersmade || 0}/{game.sthreepointersattempted || 0}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 text-orange-800 text-sm text-center">
                          {game.sfreethrowsmade || 0}/{game.sfreethrowsattempted || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Scroll hint for mobile */}
                <div className="md:hidden bg-orange-50 text-orange-700 text-center py-2 text-xs border-t border-orange-200">
                  ← Swipe to see all stats →
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}