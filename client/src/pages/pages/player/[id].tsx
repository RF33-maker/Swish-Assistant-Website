import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Trophy, User, TrendingUp, Camera, Brain, Sparkles, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generatePlayerAnalysis, type PlayerAnalysisData } from "@/lib/ai-analysis";
import SwishLogoImg from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import { Helmet } from "react-helmet-async";
import { namesMatch, getMostCompleteName, slugToName, type PlayerMatch } from "@/lib/fuzzyMatch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";

interface PlayerStat {
  id: string;
  player_id: string;
  game_id?: string;
  name?: string;
  player_name?: string;
  team_name?: string;
  team?: string;
  game_date: string;
  opponent?: string;
  is_home_player?: boolean;
  away_team?: string;
  home_team?: string;
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
  league_id?: string;
  user_id?: string;
  firstname?: string;
  familyname?: string;
  full_name?: string;
  spoints?: number;
  sreboundstotal?: number;
  sassists?: number;
  ssteals?: number;
  sblocks?: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sminutes?: string;
  created_at?: string;
  players?: {
    full_name?: string;
    league_id?: string;
  };
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
  const [match, params] = useRoute("/player/:slug");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const playerSlugOrId = params?.slug;
  
  console.log('🎯 ROUTE DEBUG - Match:', match);
  console.log('🎯 ROUTE DEBUG - Params:', params);
  console.log('🎯 ROUTE DEBUG - Player Slug/ID:', playerSlugOrId);
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string; position?: string; number?: number; leagueId?: string } | null>(null);
  const [playerLeagues, setPlayerLeagues] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [playerMatches, setPlayerMatches] = useState<PlayerMatch[]>([]);
  const [nameVariations, setNameVariations] = useState<string[]>([]);
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [leagueNames, setLeagueNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!playerSlugOrId) {
      console.log('No player slug/ID provided');
      return;
    }

    console.log('🏀 PLAYER PAGE - Starting data fetch for:', playerSlugOrId);

    const fetchPlayerData = async () => {
      setLoading(true);
      try {
        console.log('🔍 Step 1: Fetching initial player record...');
        
        let initialPlayer: any = null;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerSlugOrId);

        if (isUUID) {
          console.log('📋 Looking up player by UUID...');
          const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('id', playerSlugOrId)
            .single();
          if (data && !error) initialPlayer = data;
        } else {
          console.log('📋 Looking up player by slug:', playerSlugOrId);
          const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('slug', playerSlugOrId)
            .single();
          if (data && !error) initialPlayer = data;
          
          // Fallback: If slug not found, try fuzzy matching by name
          if (!initialPlayer) {
            console.log('📋 Slug not found, trying name-based search...');
            const searchName = slugToName(playerSlugOrId);
            console.log('📋 Searching for name:', searchName);
            
            const { data: allPlayers, error: allPlayersError } = await supabase
              .from('players')
              .select('*');
            
            if (allPlayers && !allPlayersError) {
              // Find first player whose name fuzzy matches
              const matchedPlayer = allPlayers.find(player => 
                namesMatch(player.full_name, searchName)
              );
              
              if (matchedPlayer) {
                console.log('✅ Found player via name matching:', matchedPlayer.full_name);
                initialPlayer = matchedPlayer;
              }
            }
          }
        }

        if (!initialPlayer) {
          console.error('❌ Could not find player:', playerSlugOrId);
          toast({
            title: "Player Not Found",
            description: "Could not find player with the specified identifier",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        console.log('✅ Found initial player:', initialPlayer.full_name);

        // Step 2: Find ALL matching player records using fuzzy matching
        console.log('🔍 Step 2: Finding all matching player records via fuzzy matching...');
        
        let allPlayers = [initialPlayer];
        
        // Only query by team if the player has a team
        if (initialPlayer.team) {
          const { data: allPlayersData, error: allPlayersError } = await supabase
            .from('players')
            .select('*')
            .eq('team', initialPlayer.team);

          if (!allPlayersError && allPlayersData) {
            allPlayers = allPlayersData;
          } else if (allPlayersError) {
            console.error('❌ Error fetching team players:', allPlayersError);
          }
        } else {
          console.log('⚠️ Player has no team, skipping team-based search');
        }

        console.log('📋 Found', allPlayers.length, 'players on team:', initialPlayer.team);

        // Fuzzy match by name + team
        const matchingPlayers = allPlayers.filter(player => 
          namesMatch(player.full_name, initialPlayer.full_name)
        );

        console.log('🎯 Fuzzy matched', matchingPlayers.length, 'player records');
        
        const matches: PlayerMatch[] = matchingPlayers.map(p => ({
          id: p.id,
          name: p.name,
          full_name: p.full_name,
          team: p.team,
          league_id: p.league_id,
          position: p.position,
          number: p.number,
          slug: p.slug,
          matchScore: 1.0
        }));

        setPlayerMatches(matches);

        // Get all unique name variations
        const variations = Array.from(new Set(matches.map(m => m.full_name)));
        setNameVariations(variations);
        console.log('📝 Name variations found:', variations);

        // Use the most complete name as the canonical name
        const canonicalName = getMostCompleteName(variations);
        console.log('📛 Canonical name:', canonicalName);

        // Set player info from initial player
        let playerInfo = {
          name: canonicalName,
          team: initialPlayer.team,
          position: initialPlayer.position,
          number: initialPlayer.number,
          leagueId: initialPlayer.league_id
        };

        // Step 3: Get ALL stats for ALL matching player IDs
        const playerIds = matches.map(m => m.id);
        console.log('🔍 Step 3: Getting stats for', playerIds.length, 'player IDs...');
        const { data: stats, error: statsError } = await supabase
          .from('player_stats')
          .select('*, players:player_id(full_name, league_id)')
          .in('player_id', playerIds)
          .order('created_at', { ascending: false });

        // Fetch league names for all unique league_ids from playerMatches
        const uniqueLeagueIds = Array.from(new Set(matches.map(m => m.league_id).filter(Boolean)));
        if (uniqueLeagueIds.length > 0) {
          const { data: leaguesData } = await supabase
            .from('leagues')
            .select('id, name')
            .in('id', uniqueLeagueIds);
          
          if (leaguesData) {
            const leagueMap = new Map<string, string>();
            leaguesData.forEach(league => {
              leagueMap.set(league.id, league.name);
            });
            setLeagueNames(leagueMap);
            console.log('🏆 Fetched league names:', leagueMap);
          }
        }

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
        
        // Fetch leagues
        let statsWithOpponents = stats || [];
        if (stats && stats.length > 0) {
          const userId = stats[0].user_id;
          
          // Fetch leagues if we have a user_id
          if (userId) {
            const { data: leaguesData, error: leaguesError } = await supabase
              .from('leagues')
              .select('name, slug, user_id')
              .eq('user_id', userId)
              .eq('is_public', true);
            
            if (leaguesData && leaguesData.length > 0) {
              let actualLeague = leaguesData.find(league => 
                league.name.toLowerCase().includes('uwe') && 
                league.name.toLowerCase().includes('d1')
              );
              
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
              setPlayerLeagues([]);
            }
          }
        }
        
        setPlayerStats(statsWithOpponents);
        
        // If we have stats with joined players data, use that for player info
        if (statsWithOpponents && statsWithOpponents.length > 0 && statsWithOpponents[0].players) {
          console.log('📋 Using joined players data:', statsWithOpponents[0].players);
          playerInfo = {
            name: statsWithOpponents[0].players.full_name || statsWithOpponents[0].full_name || statsWithOpponents[0].name || `${statsWithOpponents[0].firstname || ''} ${statsWithOpponents[0].familyname || ''}`.trim() || 'Unknown Player',
            team: statsWithOpponents[0].team_name || statsWithOpponents[0].team || 'Unknown Team',
            position: statsWithOpponents[0].position,
            number: statsWithOpponents[0].number,
            leagueId: statsWithOpponents[0].league_id
          };
        }
        
        setPlayerInfo(playerInfo);

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
  }, [playerSlugOrId, toast, setLocation]);

  // Filter stats based on selected league
  const filteredStats = useMemo(() => {
    if (selectedLeagueFilter === "all") {
      return playerStats;
    }
    
    // Filter stats by league_id
    return playerStats.filter(stat => {
      const statLeagueId = stat.players?.league_id || stat.league_id;
      return statLeagueId === selectedLeagueFilter;
    });
  }, [playerStats, selectedLeagueFilter]);

  // Calculate season averages based on filtered stats
  const filteredSeasonAverages = useMemo(() => {
    if (!filteredStats || filteredStats.length === 0) {
      return null;
    }

    const totals = filteredStats.reduce((acc, game) => ({
      points: acc.points + (game.spoints || game.points || 0),
      rebounds: acc.rebounds + (game.sreboundstotal || game.rebounds_total || 0),
      assists: acc.assists + (game.sassists || game.assists || 0),
      steals: acc.steals + (game.ssteals || game.steals || 0),
      blocks: acc.blocks + (game.sblocks || game.blocks || 0),
      field_goals_made: acc.field_goals_made + (game.sfieldgoalsmade || game.field_goals_made || 0),
      field_goals_attempted: acc.field_goals_attempted + (game.sfieldgoalsattempted || game.field_goals_attempted || 0),
      three_pointers_made: acc.three_pointers_made + (game.sthreepointersmade || game.three_pointers_made || 0),
      three_pointers_attempted: acc.three_pointers_attempted + (game.sthreepointersattempted || game.three_pointers_attempted || 0),
      free_throws_made: acc.free_throws_made + (game.sfreethrowsmade || game.free_throws_made || 0),
      free_throws_attempted: acc.free_throws_attempted + (game.sfreethrowsattempted || game.free_throws_attempted || 0),
    }), {
      points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
      field_goals_made: 0, field_goals_attempted: 0,
      three_pointers_made: 0, three_pointers_attempted: 0,
      free_throws_made: 0, free_throws_attempted: 0
    });

    const games = filteredStats.length;
    return {
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
  }, [filteredStats]);

  // Get name variations with league info
  const nameVariationsWithLeagues = useMemo(() => {
    if (playerMatches.length <= 1) return [];

    const variations = playerMatches.map(match => ({
      name: match.full_name,
      leagueId: match.league_id,
      leagueName: leagueNames.get(match.league_id) || 'Unknown League'
    }));

    // Remove duplicates based on name
    const uniqueVariations = variations.filter((v, index, self) => 
      index === self.findIndex(t => t.name === v.name)
    );

    return uniqueVariations;
  }, [playerMatches, leagueNames]);

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
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-orange-800 dark:text-orange-400">Loading player stats...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>
          {playerInfo?.name
            ? `${playerInfo.name} | Player Stats | Swish Assistant`
            : "Player Profile | Swish Assistant"}
        </title>
        <meta
          name="description"
          content={
            playerInfo?.name
              ? `View ${playerInfo.name}${playerInfo.team ? ` (${playerInfo.team})` : ''}'s basketball stats, game-by-game performance${filteredSeasonAverages ? `, averaging ${filteredSeasonAverages.avg_points.toFixed(1)} PPG` : ''}, and AI-powered analysis on Swish Assistant.`
              : "Explore player stats and basketball performance data on Swish Assistant."
          }
        />
        <meta
          property="og:title"
          content={playerInfo?.name ? `${playerInfo.name} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"}
        />
        <meta
          property="og:description"
          content={
            playerInfo?.name
              ? `View ${playerInfo.name}${playerInfo.team ? ` (${playerInfo.team})` : ''}'s basketball stats${filteredSeasonAverages ? `, averaging ${filteredSeasonAverages.avg_points.toFixed(1)} PPG` : ''}.`
              : "Explore player stats and basketball performance data on Swish Assistant."
          }
        />
        <meta property="og:type" content="profile" />
        <meta
          property="og:url"
          content={`https://www.swishassistant.com/player/${playerSlugOrId}`}
        />
        <meta property="og:image" content="https://www.swishassistant.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={playerInfo?.name ? `${playerInfo.name} | Player Stats | Swish Assistant` : "Player Profile | Swish Assistant"} />
        <meta
          name="twitter:description"
          content={
            playerInfo?.name
              ? `${playerInfo.name}'s basketball stats${filteredSeasonAverages ? `: ${filteredSeasonAverages.avg_points.toFixed(1)} PPG, ${filteredSeasonAverages.avg_rebounds.toFixed(1)} RPG, ${filteredSeasonAverages.avg_assists.toFixed(1)} APG` : ''}`
              : "Explore player stats on Swish Assistant."
          }
        />
        <link
          rel="canonical"
          href={`https://www.swishassistant.com/player/${playerSlugOrId}`}
        />
      </Helmet>
      
      <div className="min-h-screen bg-white dark:bg-neutral-950">
        <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="w-full md:w-auto flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation('/')}
              className="group flex items-center gap-2 border-orange-200 dark:border-orange-500/30 hover:bg-white dark:hover:bg-neutral-800 hover:border-orange-300 dark:hover:border-orange-500/50 transition-all duration-300 hover:shadow-md w-full md:w-auto dark:bg-neutral-900"
            >
              <ArrowLeft className="h-4 w-4 group-hover:hidden transition-all duration-300 dark:text-orange-400" />
              <div className="hidden group-hover:block transition-all duration-300">
                <img src={SwishLogoImg} alt="Swish Assistant" className="h-4 w-4 object-contain" />
              </div>
              <span className="text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300">Back to Dashboard</span>
            </Button>
            <ThemeToggle />
          </div>
          
          {/* Search Bar in Header */}
          <div className="flex-1 w-full md:max-w-md lg:max-w-lg relative">
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center shadow-md rounded-full border border-orange-100 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find your league"
                className="flex-1 px-3 md:px-4 py-2 text-sm text-orange-800 dark:text-white focus:outline-none bg-white dark:bg-neutral-900 dark:placeholder-slate-400"
              />
              <button
                type="submit"
                className="bg-orange-400 text-white font-semibold px-3 md:px-4 py-2 hover:bg-orange-500 transition text-sm"
              >
                Search
              </button>
            </form>

            {searchSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full bg-white dark:bg-neutral-800 border border-orange-200 dark:border-neutral-700 mt-1 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchSuggestions.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => handleSearchSelect(item)}
                    className="px-4 py-3 cursor-pointer hover:bg-orange-50 dark:hover:bg-neutral-700 text-left border-b border-orange-100 dark:border-neutral-700 last:border-b-0 transition-colors duration-200"
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
                        <div className="font-medium text-orange-900 dark:text-white text-sm">{item.name}</div>
                        {item.type === 'player' && (
                          <div className="text-xs text-orange-600 dark:text-orange-400">{item.team}</div>
                        )}
                        {item.type === 'league' && (
                          <div className="text-xs text-orange-600 dark:text-orange-400">League</div>
                        )}
                      </div>
                      <div className="text-xs text-orange-700 dark:text-orange-300 capitalize bg-orange-100 dark:bg-orange-900/50 px-2 py-1 rounded-full font-medium">
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
            <Card className="border-orange-200 dark:border-orange-500/30 shadow-md animate-slide-in-up bg-white dark:bg-neutral-900">
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
                    <h1 className="text-xl md:text-2xl font-bold text-orange-900 dark:text-white mb-1 break-words" data-testid="text-player-name">{playerInfo.name}</h1>
                    
                    {/* Name Variations Indicator */}
                    {nameVariationsWithLeagues.length > 0 && (
                      <div className="mb-2">
                        <p className="text-xs md:text-sm text-orange-600 dark:text-orange-400 italic">
                          <span className="font-semibold">Also known as: </span>
                          {nameVariationsWithLeagues.map((variation, index) => (
                            <span key={index}>
                              {variation.name} ({variation.leagueName})
                              {index < nameVariationsWithLeagues.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </p>
                      </div>
                    )}
                    
                    <p className="text-orange-700 dark:text-orange-400 flex items-center gap-2 text-sm md:text-base mb-2" data-testid="text-player-team">
                      <Trophy className="h-4 w-4 flex-shrink-0" />
                      <span className="break-words">{playerInfo.team}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm text-orange-600 dark:text-orange-500">
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
        <Card className="mb-6 md:mb-8 border-orange-200 dark:border-orange-500/30 shadow-md animate-slide-in-up bg-gradient-to-br from-white to-orange-50 dark:from-neutral-900 dark:to-neutral-800">
          <CardHeader className="bg-white dark:bg-neutral-900 text-orange-900 dark:text-white rounded-t-lg border-b border-orange-200 dark:border-neutral-700">
            <CardTitle className="flex items-center gap-2">
              {analysisLoading ? (
                <Brain className="h-5 w-5 animate-pulse text-orange-600 dark:text-orange-400" />
              ) : (
                <Sparkles className="h-5 w-5 text-orange-600 dark:text-orange-400 animate-float" />
              )}
              Player Bio
            </CardTitle>
            <CardDescription className="text-orange-700 dark:text-orange-400">
              {aiAnalysis ? "AI-powered analysis of playing style and strengths" : "AI generation coming soon"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            {analysisLoading ? (
              <div className="flex items-center gap-3 text-orange-700 dark:text-orange-400">
                <Brain className="h-5 w-5 animate-pulse" />
                <span className="animate-pulse">Generating player bio...</span>
              </div>
            ) : (
              <div className="text-sm md:text-base text-orange-600 dark:text-orange-400 leading-relaxed italic">
                Coming soon
              </div>
            )}
          </CardContent>
        </Card>

        {/* Player Leagues */}
        {playerLeagues.length > 0 && (
          <Card className="mb-6 border-orange-200 dark:border-orange-500/30 shadow-md animate-slide-in-up bg-white dark:bg-neutral-900">
            <CardHeader className="bg-white dark:bg-neutral-900 text-orange-900 dark:text-white rounded-t-lg border-b border-orange-200 dark:border-neutral-700">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 animate-float text-orange-700 dark:text-orange-400" />
                Active Leagues ({playerLeagues.length})
              </CardTitle>
              <CardDescription className="text-orange-700 dark:text-orange-400">
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
                    <Card className="border-orange-200 dark:border-orange-500/30 hover:border-orange-300 dark:hover:border-orange-500/50 transition-all duration-300 hover:shadow-md bg-white dark:bg-neutral-800">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center group-hover:rotate-12 transition-transform duration-300">
                            <Trophy className="h-6 w-6 text-white group-hover:animate-bounce" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-orange-800 dark:text-white group-hover:text-orange-700 dark:group-hover:text-orange-300 transition-colors duration-300 truncate">
                              {league.name}
                            </h3>
                            <p className="text-sm text-orange-700 dark:text-orange-400 group-hover:text-orange-600 dark:group-hover:text-orange-300 transition-colors duration-300">
                              Click to view league →
                            </p>
                          </div>
                          <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400 group-hover:animate-bounce" />
                        </div>
                        <div className="mt-3 w-full bg-orange-50 dark:bg-neutral-700 h-1 rounded-full overflow-hidden">
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

        {/* League Filter Dropdown */}
        {playerMatches.length > 1 && (
          <Card className="mb-6 border-orange-200 dark:border-orange-500/30 shadow-md animate-slide-in-up bg-white dark:bg-neutral-900">
            <CardHeader className="bg-white dark:bg-neutral-900 text-orange-900 dark:text-white rounded-t-lg border-b border-orange-200 dark:border-neutral-700">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-orange-700 dark:text-orange-400" />
                Filter by Competition
              </CardTitle>
              <CardDescription className="text-orange-700 dark:text-orange-400">
                View stats from specific competitions or all combined
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Select 
                value={selectedLeagueFilter} 
                onValueChange={setSelectedLeagueFilter}
              >
                <SelectTrigger className="w-full md:w-80 border-orange-200 dark:border-neutral-600 focus:ring-orange-500 dark:bg-neutral-800 dark:text-white" data-testid="select-league-filter">
                  <SelectValue placeholder="Select a competition" />
                </SelectTrigger>
                <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                  <SelectItem value="all" data-testid="select-league-all" className="dark:text-white dark:focus:bg-neutral-700">
                    All Competitions
                  </SelectItem>
                  {Array.from(new Set(playerMatches.map(m => m.league_id)))
                    .filter(Boolean)
                    .map(leagueId => (
                      <SelectItem 
                        key={leagueId} 
                        value={leagueId}
                        data-testid={`select-league-${leagueId}`}
                        className="dark:text-white dark:focus:bg-neutral-700"
                      >
                        {leagueNames.get(leagueId) || leagueId}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
              {selectedLeagueFilter !== "all" && (
                <p className="mt-3 text-sm text-orange-600 dark:text-orange-400">
                  Showing stats from: <span className="font-semibold">{leagueNames.get(selectedLeagueFilter) || selectedLeagueFilter}</span>
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Season Averages */}
        {filteredSeasonAverages && (
          <Card className="mb-8 border-orange-200 dark:border-orange-500/30 shadow-md animate-slide-in-up hover:animate-glow bg-white dark:bg-neutral-900">
            <CardHeader className="bg-white dark:bg-neutral-900 text-orange-900 dark:text-white rounded-t-lg border-b border-orange-200 dark:border-neutral-700">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 animate-float text-orange-700 dark:text-orange-400" />
                Season Averages ({filteredSeasonAverages.games_played} games)
                {selectedLeagueFilter !== "all" && (
                  <Badge variant="outline" className="ml-2 bg-orange-50 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-500/50">
                    {leagueNames.get(selectedLeagueFilter) || 'Filtered'}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 md:pt-6">
              <div className="grid [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))] justify-center gap-3 sm:gap-4 lg:gap-6">
                {/* Points */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-pulse">
                      {filteredSeasonAverages.avg_points.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">PPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((filteredSeasonAverages.avg_points / 30) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Rebounds */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-bounce">
                      {filteredSeasonAverages.avg_rebounds.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">RPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((filteredSeasonAverages.avg_rebounds / 15) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Assists */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-pulse">
                      {filteredSeasonAverages.avg_assists.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">APG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((filteredSeasonAverages.avg_assists / 12) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Steals */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-pulse">
                      {filteredSeasonAverages.avg_steals.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">SPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((filteredSeasonAverages.avg_steals / 5) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Blocks */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-pulse">
                      {filteredSeasonAverages.avg_blocks.toFixed(1)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">BPG</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${Math.min((filteredSeasonAverages.avg_blocks / 5) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Field Goal % */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(filteredSeasonAverages.fg_percentage)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">FG%</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${filteredSeasonAverages.fg_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* 3-Point % */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(filteredSeasonAverages.three_point_percentage)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">3P%</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${filteredSeasonAverages.three_point_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Free Throw % */}
                <div className="mx-auto max-w-[140px] w-full text-center group cursor-pointer transform hover:scale-110 transition-all duration-300">
                  <div className="relative p-2 sm:p-3">
                    <div className="text-lg font-semibold md:text-3xl lg:text-4xl md:font-bold text-orange-700 dark:text-orange-400 group-hover:text-orange-800 dark:group-hover:text-orange-300 transition-colors duration-300 group-hover:animate-pulse">
                      {formatPercentage(filteredSeasonAverages.ft_percentage)}
                    </div>
                    <div className="text-xs md:text-sm text-orange-700 dark:text-orange-500 group-hover:text-orange-800 dark:group-hover:text-orange-400 transition-colors duration-300 mt-1">FT%</div>
                    <div className="max-w-[120px] mx-auto bg-orange-50 dark:bg-neutral-700 h-2 rounded-full mt-2 md:mt-3 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-300 to-orange-400 rounded-full transform origin-left transition-all duration-1000 group-hover:scale-x-110 group-hover:shadow-lg"
                        style={{ width: `${filteredSeasonAverages.ft_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game Log */}
        <Card className="border-orange-200 dark:border-orange-500/30 shadow-md bg-white dark:bg-neutral-900">
          <CardHeader className="bg-white dark:bg-neutral-900 border-b border-orange-200 dark:border-neutral-700">
            <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-white text-base md:text-lg">
              <Calendar className="h-4 w-4 md:h-5 md:w-5 dark:text-orange-400" />
              Game Log
            </CardTitle>
            <CardDescription className="text-orange-700 dark:text-orange-400 text-xs md:text-sm">
              Recent game performances
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {filteredStats.length === 0 ? (
              <div className="p-6 md:p-8 text-center text-orange-600 dark:text-orange-400 text-sm md:text-base">
                No game statistics found for this player{selectedLeagueFilter !== "all" ? " in the selected competition" : ""}.
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden border-t border-orange-200 dark:border-neutral-700">
                  {filteredStats.map((game, index) => {
                    const opponentName = (game.opponent && game.opponent.trim()) || 'TBD';
                    
                    return (
                      <div
                        key={game.id}
                        className={`p-4 border-b border-orange-100 dark:border-neutral-700 hover:bg-orange-50 dark:hover:bg-neutral-800 transition-colors ${
                          index % 2 === 0 ? 'bg-white dark:bg-neutral-900' : 'bg-orange-25 dark:bg-neutral-800/50'
                        }`}
                        data-testid={`game-card-${game.id}`}
                      >
                        {/* Date and Opponent */}
                        <div className="flex justify-between items-center mb-3">
                          <div className="text-xs text-orange-800 dark:text-orange-400 font-medium">
                            {formatDate(game.game_date || game.created_at)}
                          </div>
                          <Badge variant="outline" className="border-orange-300 dark:border-orange-500/50 text-orange-700 dark:text-orange-400 text-xs">
                            vs {opponentName}
                          </Badge>
                        </div>
                        
                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center">
                            <div className="text-xl font-bold text-orange-900 dark:text-white">{game.spoints || game.points || 0}</div>
                            <div className="text-xs text-orange-600 dark:text-orange-500">PTS</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xl font-bold text-orange-900 dark:text-white">{game.sreboundstotal || game.rebounds_total || 0}</div>
                            <div className="text-xs text-orange-600 dark:text-orange-500">REB</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xl font-bold text-orange-900 dark:text-white">{game.sassists || game.assists || 0}</div>
                            <div className="text-xs text-orange-600 dark:text-orange-500">AST</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto border-t border-orange-200 dark:border-neutral-700">
                  <table className="w-full">
                    <thead className="bg-orange-50 dark:bg-neutral-800 border-b border-orange-200 dark:border-neutral-700">
                      <tr className="text-left">
                        <th className="px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm">Date</th>
                        <th className="px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm">OPP</th>
                        <th className="hidden lg:table-cell px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm">MIN</th>
                        <th className="px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">PTS</th>
                        <th className="px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">REB</th>
                        <th className="px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">AST</th>
                        <th className="hidden lg:table-cell px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">STL</th>
                        <th className="hidden lg:table-cell px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">BLK</th>
                        <th className="hidden lg:table-cell px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">FG</th>
                        <th className="hidden lg:table-cell px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">3P</th>
                        <th className="hidden lg:table-cell px-4 py-3 text-orange-900 dark:text-slate-200 font-semibold text-sm text-center">FT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStats.map((game, index) => {
                        const opponentName = (game.opponent && game.opponent.trim()) || 'TBD';


                        return (
                          <tr 
                            key={game.id} 
                            className={`border-b border-orange-100 dark:border-neutral-800 hover:bg-orange-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer group ${
                              index % 2 === 0 ? 'bg-white dark:bg-neutral-900' : 'bg-orange-25 dark:bg-neutral-800/50'
                            }`}
                            data-testid={`game-row-${game.id}`}
                          >
                            <td className="px-4 py-3 text-orange-800 dark:text-slate-200 text-sm font-medium">
                              {formatDate(game.game_date || game.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="border-orange-300 dark:border-orange-500/50 text-orange-700 dark:text-orange-400 text-sm">
                                vs {opponentName}
                              </Badge>
                            </td>
                            <td className="hidden lg:table-cell px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center">{game.sminutes || '0'}</td>
                            <td className="px-4 py-3 font-bold text-orange-900 dark:text-white group-hover:text-orange-700 dark:group-hover:text-orange-400 transition-colors text-sm text-center">{game.spoints || game.points || 0}</td>
                            <td className="px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center font-medium">{game.sreboundstotal || game.rebounds_total || 0}</td>
                            <td className="px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center font-medium">{game.sassists || game.assists || 0}</td>
                            <td className="hidden lg:table-cell px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center">{game.ssteals || 0}</td>
                            <td className="hidden lg:table-cell px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center">{game.sblocks || 0}</td>
                            <td className="hidden lg:table-cell px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center">
                              {game.sfieldgoalsmade || 0}/{game.sfieldgoalsattempted || 0}
                            </td>
                            <td className="hidden lg:table-cell px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center">
                              {game.sthreepointersmade || 0}/{game.sthreepointersattempted || 0}
                            </td>
                            <td className="hidden lg:table-cell px-4 py-3 text-orange-800 dark:text-slate-300 text-sm text-center">
                              {game.sfreethrowsmade || 0}/{game.sfreethrowsattempted || 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  );
}