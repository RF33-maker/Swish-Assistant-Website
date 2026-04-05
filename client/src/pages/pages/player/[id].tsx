import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, Trophy, User, TrendingUp, Camera, Brain, Sparkles, Filter, Upload, Loader2, Move, Check, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { generatePlayerAnalysis, type PlayerAnalysisData } from "@/lib/ai-analysis";
import SwishLogoImg from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import { Helmet } from "react-helmet-async";
import { namesMatch, getMostCompleteName, slugToName, type PlayerMatch } from "@/lib/fuzzyMatch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";
import ShotChart, { type ShotData } from "@/components/ShotChart";

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
  sturnovers?: number;
  turnovers?: number;
  created_at?: string;
  game_key?: string;
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
  avg_efficiency: number;
}

interface PlayerRankings {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fg_percentage: number;
  three_point_percentage: number;
  ft_percentage: number;
}

export default function PlayerStatsPage() {
  const [match, params] = useRoute("/player/:slug");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const playerSlugOrId = params?.slug;
  
  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [playerRankings, setPlayerRankings] = useState<PlayerRankings | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string; position?: string; number?: number; leagueId?: string; playerId?: string; photoPath?: string | null; photoFocusY?: number | null; previousTeams?: string[] } | null>(null);
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
  const [playerShotChartRange, setPlayerShotChartRange] = useState<string>("season");
  const [careerStatsTab, setCareerStatsTab] = useState<string>("averages");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [showFocusAdjuster, setShowFocusAdjuster] = useState(false);
  const [tempFocusY, setTempFocusY] = useState<number>(50);
  const [savingFocus, setSavingFocus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !playerInfo?.playerId) return;

    setPhotoUploading(true);
    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${playerInfo.playerId}/primary.${fileExtension}`;

      const { error: uploadError } = await supabase.storage
        .from('player-photos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { error: updateError } = await supabase
        .from('players')
        .update({ photo_path: filePath })
        .eq('id', playerInfo.playerId);

      if (updateError) {
        throw updateError;
      }

      setPlayerInfo(prev => prev ? { ...prev, photoPath: filePath } : null);
      setShowFocusAdjuster(true);
      setTempFocusY(50);

      toast({
        title: "Photo uploaded",
        description: "Adjust the focus point to ensure the face is visible",
      });
    } catch (error: any) {
      console.error('Photo upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload photo",
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveFocus = async () => {
    if (!playerInfo?.playerId) return;
    
    setSavingFocus(true);
    try {
      const { error } = await supabase
        .from('players')
        .update({ photo_focus_y: tempFocusY })
        .eq('id', playerInfo.playerId);

      if (error) throw error;

      setPlayerInfo(prev => prev ? { ...prev, photoFocusY: tempFocusY } : null);
      setShowFocusAdjuster(false);

      toast({
        title: "Focus saved",
        description: "Photo positioning has been updated",
      });
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Failed to save focus position",
        variant: "destructive",
      });
    } finally {
      setSavingFocus(false);
    }
  };

  // Helper function to get ordinal suffix
  const getOrdinalSuffix = (num: number): string => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + "st";
    if (j === 2 && k !== 12) return num + "nd";
    if (j === 3 && k !== 13) return num + "rd";
    return num + "th";
  };

  // Helper function to parse minutes from various formats and check if > 0
  const parseMinutesPlayed = (stat: any): number => {
    const minutes = stat.sminutes || stat.minutes_played;
    if (!minutes) return 0;
    if (typeof minutes === 'number') return minutes;
    if (typeof minutes === 'string') {
      const parts = minutes.split(':');
      if (parts.length === 2) {
        return parseInt(parts[0]) + parseInt(parts[1]) / 60;
      }
      return parseFloat(minutes) || 0;
    }
    return 0;
  };

  // Function to calculate player rankings in the league
  const calculateRankings = async (leagueId: string, currentAverages: SeasonAverages): Promise<PlayerRankings | null> => {
    try {
      const { data: allStats } = await supabase
        .from('player_stats')
        .select('*')
        .eq('league_id', leagueId)
        .eq('is_public', true);

      if (!allStats || allStats.length === 0) return null;

      // Filter out games where players didn't play (0 minutes)
      const playedStats = allStats.filter(stat => parseMinutesPlayed(stat) > 0);

      if (playedStats.length === 0) return null;

      // Calculate totals for each player (only counting games they played)
      const playerTotals = new Map<string, any>();
      playedStats.forEach(stat => {
        const key = `${stat.firstname || ''}_${stat.familyname || ''}`.trim();
        if (!playerTotals.has(key)) {
          playerTotals.set(key, {
            points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
            fg_made: 0, fg_attempted: 0, three_made: 0, three_attempted: 0,
            ft_made: 0, ft_attempted: 0, games: 0
          });
        }
        const totals = playerTotals.get(key);
        totals.points += stat.spoints || 0;
        totals.rebounds += stat.sreboundstotal || 0;
        totals.assists += stat.sassists || 0;
        totals.steals += stat.ssteals || 0;
        totals.blocks += stat.sblocks || 0;
        totals.fg_made += stat.sfieldgoalsmade || 0;
        totals.fg_attempted += stat.sfieldgoalsattempted || 0;
        totals.three_made += stat.sthreepointersmade || 0;
        totals.three_attempted += stat.sthreepointersattempted || 0;
        totals.ft_made += stat.sfreethrowsmade || 0;
        totals.ft_attempted += stat.sfreethrowsattempted || 0;
        totals.games += 1;
      });

      // Convert totals to averages and rank
      const rankings: { [key: string]: number[] } = {
        points: [],
        rebounds: [],
        assists: [],
        steals: [],
        blocks: [],
        fg_percentage: [],
        three_point_percentage: [],
        ft_percentage: []
      };

      playerTotals.forEach((totals, playerKey) => {
        const games = totals.games || 1;
        rankings.points.push(totals.points / games);
        rankings.rebounds.push(totals.rebounds / games);
        rankings.assists.push(totals.assists / games);
        rankings.steals.push(totals.steals / games);
        rankings.blocks.push(totals.blocks / games);
        rankings.fg_percentage.push(totals.fg_attempted > 0 ? (totals.fg_made / totals.fg_attempted) * 100 : 0);
        rankings.three_point_percentage.push(totals.three_attempted > 0 ? (totals.three_made / totals.three_attempted) * 100 : 0);
        rankings.ft_percentage.push(totals.ft_attempted > 0 ? (totals.ft_made / totals.ft_attempted) * 100 : 0);
      });

      // Calculate ranks by counting how many players are ahead
      const calculateRank = (values: number[], current: number): number => {
        return values.filter(val => val > current).length + 1;
      };

      const ranks: PlayerRankings = {
        points: calculateRank(rankings.points, currentAverages.avg_points),
        rebounds: calculateRank(rankings.rebounds, currentAverages.avg_rebounds),
        assists: calculateRank(rankings.assists, currentAverages.avg_assists),
        steals: calculateRank(rankings.steals, currentAverages.avg_steals),
        blocks: calculateRank(rankings.blocks, currentAverages.avg_blocks),
        fg_percentage: calculateRank(rankings.fg_percentage, currentAverages.fg_percentage),
        three_point_percentage: calculateRank(rankings.three_point_percentage, currentAverages.three_point_percentage),
        ft_percentage: calculateRank(rankings.ft_percentage, currentAverages.ft_percentage)
      };

      return ranks;
    } catch (error) {
      console.error("❌ Error calculating rankings:", error);
      return null;
    }
  };

  useEffect(() => {
    if (!playerSlugOrId) {
      return;
    }


    const fetchPlayerData = async () => {
      setLoading(true);
      try {
        
        let initialPlayer: any = null;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerSlugOrId);

        if (isUUID) {
          const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('id', playerSlugOrId)
            .single();
          if (data && !error) initialPlayer = data;
        } else {
          const { data, error } = await supabase
            .from('players')
            .select('*')
            .eq('slug', playerSlugOrId)
            .single();
          if (data && !error) initialPlayer = data;
          
          // Fallback: If slug not found, try fuzzy matching by name
          if (!initialPlayer) {
            const searchName = slugToName(playerSlugOrId);
            
            // First try a direct ilike search for efficiency
            const { data: directMatch, error: directError } = await supabase
              .from('players')
              .select('*')
              .ilike('full_name', `%${searchName}%`)
              .limit(10);
            
            if (directMatch && directMatch.length > 0 && !directError) {
              // Find best match using fuzzy matching
              const matchedPlayer = directMatch.find(player => 
                namesMatch(player.full_name, searchName)
              ) || directMatch[0];
              
              initialPlayer = matchedPlayer;
            } else {
              // Fallback: fetch all players with higher limit for fuzzy matching
              const { data: allPlayers, error: allPlayersError } = await supabase
                .from('players')
                .select('*')
                .limit(10000);
              
              if (allPlayers && !allPlayersError) {
                // Find first player whose name fuzzy matches
                const matchedPlayer = allPlayers.find(player => 
                  namesMatch(player.full_name, searchName)
                );
                
                if (matchedPlayer) {
                  initialPlayer = matchedPlayer;
                }
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


        // Step 2: Find ALL matching player records using fuzzy matching across ALL teams
        // This catches players who have transferred between teams
        
        // Search for ALL players with similar names (not just same team) to catch transfers
        const searchTerms = initialPlayer.full_name.split(' ').filter((t: string) => t.length > 2);
        const searchQuery = searchTerms[searchTerms.length - 1] || initialPlayer.full_name; // Use last name for broader search
        
        const { data: allPlayersData, error: allPlayersError } = await supabase
          .from('players')
          .select('*')
          .ilike('full_name', `%${searchQuery}%`)
          .limit(100);

        let allPlayers = [initialPlayer];
        if (!allPlayersError && allPlayersData) {
          allPlayers = allPlayersData;
        } else if (allPlayersError) {
          console.error('❌ Error fetching players by name:', allPlayersError);
        }

        // Fuzzy match by name to find the same person across different teams
        const matchingPlayers = allPlayers.filter(player => 
          namesMatch(player.full_name, initialPlayer.full_name)
        );
        
        
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

        // Use the most complete name as the canonical name
        const canonicalName = getMostCompleteName(variations);

        // Set player info from initial player
        let playerInfo = {
          name: canonicalName,
          team: initialPlayer.team,
          position: initialPlayer.position,
          number: initialPlayer.number,
          leagueId: initialPlayer.league_id,
          playerId: initialPlayer.id,
          photoPath: initialPlayer.photo_path,
          photoFocusY: initialPlayer.photo_focus_y
        };

        // Step 3: Get ALL stats for ALL matching player IDs
        const playerIds = matches.map(m => m.id);
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
            .select('league_id, name')
            .in('league_id', uniqueLeagueIds);
          
          if (leaguesData) {
            const leagueMap = new Map<string, string>();
            leaguesData.forEach(league => {
              leagueMap.set(league.league_id, league.name);
            });
            setLeagueNames(leagueMap);
          }
        }


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

        
        // Fetch opponent data using game_key
        let statsWithOpponents = stats || [];
        if (stats && stats.length > 0) {
          const gameKeys = Array.from(new Set(stats.map(stat => stat.game_key).filter(Boolean)));
          
          if (gameKeys.length > 0) {
            const { data: gamesData, error: gamesError } = await supabase
              .from('game_schedule')
              .select('game_key, hometeam, awayteam')
              .in('game_key', gameKeys);
            
            if (!gamesError && gamesData && gamesData.length > 0) {
              const gameKeyMap = new Map<string, { hometeam: string; awayteam: string }>();
              gamesData.forEach(game => {
                if (game.game_key) {
                  gameKeyMap.set(game.game_key, {
                    hometeam: game.hometeam,
                    awayteam: game.awayteam
                  });
                }
              });
              
              statsWithOpponents = stats.map(stat => {
                let derivedOpponent = undefined;
                
                if (stat.game_key) {
                  const gameInfo = gameKeyMap.get(stat.game_key);
                  if (gameInfo) {
                    const playerTeamRaw = stat.team_name || '';
                    const playerTeamNorm = playerTeamRaw.trim().toLowerCase();
                    
                    const homeTeamNorm = (gameInfo.hometeam || '').trim().toLowerCase();
                    const awayTeamNorm = (gameInfo.awayteam || '').trim().toLowerCase();
                    
                    if (playerTeamNorm === homeTeamNorm) {
                      derivedOpponent = gameInfo.awayteam;
                    } else if (playerTeamNorm === awayTeamNorm) {
                      derivedOpponent = gameInfo.hometeam;
                    }
                  }
                }
                
                return {
                  ...stat,
                  opponent: derivedOpponent || stat.opponent
                };
              });
            }
          }
          
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
            } else {
              setPlayerLeagues([]);
            }
          }
        }
        
        setPlayerStats(statsWithOpponents);
        
        // If we have stats with joined players data, use that for player info
        if (statsWithOpponents && statsWithOpponents.length > 0 && statsWithOpponents[0].players) {
          
          // Sort by game_date to find the most recent game (handles cases where created_at order differs)
          const sortedByGameDate = [...statsWithOpponents].sort((a, b) => {
            const dateA = a.game_date ? new Date(a.game_date).getTime() : 0;
            const dateB = b.game_date ? new Date(b.game_date).getTime() : 0;
            return dateB - dateA; // Descending
          });
          const mostRecentStat = sortedByGameDate[0] || statsWithOpponents[0];
          
          // Extract all unique teams from stats to detect transfers (normalize for comparison)
          const normalizeTeam = (t: string) => t.trim().toLowerCase();
          const allTeams = statsWithOpponents
            .map(s => s.team_name || s.team)
            .filter((team): team is string => Boolean(team));
          
          // Dedupe by normalized name, keeping first occurrence (display name)
          const teamMap = new Map<string, string>();
          allTeams.forEach(team => {
            const norm = normalizeTeam(team);
            if (!teamMap.has(norm)) {
              teamMap.set(norm, team);
            }
          });
          const uniqueTeams = Array.from(teamMap.values());
          
          // Current team is from the most recent game by game_date
          const currentTeam = mostRecentStat.team_name || mostRecentStat.team || 'Unknown Team';
          const currentTeamNorm = normalizeTeam(currentTeam);
          
          // Previous teams are any teams that are NOT the current team (compare normalized)
          const previousTeams = uniqueTeams.filter(t => normalizeTeam(t) !== currentTeamNorm);
          
          
          playerInfo = {
            name: mostRecentStat.players?.full_name || mostRecentStat.full_name || mostRecentStat.name || `${mostRecentStat.firstname || ''} ${mostRecentStat.familyname || ''}`.trim() || 'Unknown Player',
            team: currentTeam,
            position: mostRecentStat.position,
            number: mostRecentStat.number,
            leagueId: mostRecentStat.league_id,
            playerId: playerInfo.playerId,
            photoPath: playerInfo.photoPath,
            photoFocusY: playerInfo.photoFocusY,
            previousTeams: previousTeams.length > 0 ? previousTeams : undefined
          };
        }
        
        setPlayerInfo(playerInfo);

        // Filter out games where player didn't actually play (0 minutes)
        const gamesPlayed = stats.filter(stat => parseMinutesPlayed(stat) > 0);
        
        // Calculate season averages if we have stats
        if (gamesPlayed && gamesPlayed.length > 0) {
          // This section is now redundant since we set playerInfo above with joined data
          // but keep as extra fallback safety
          if (!playerInfo || !playerInfo.name || playerInfo.name === 'Unknown Player') {
            const fallbackName = gamesPlayed[0].players?.full_name || 
                                gamesPlayed[0].full_name || 
                                gamesPlayed[0].name || 
                                `${gamesPlayed[0].firstname || ''} ${gamesPlayed[0].familyname || ''}`.trim() || 
                                'Unknown Player';
            const fallbackTeam = gamesPlayed[0].team_name || 
                                gamesPlayed[0].team || 
                                'Unknown Team';
            
            // Also detect transfers in fallback (with normalization)
            const normalizeTeamFallback = (t: string) => t.trim().toLowerCase();
            const allTeamsFallback = gamesPlayed
              .map(s => s.team_name || s.team)
              .filter((team): team is string => Boolean(team));
            const teamMapFallback = new Map<string, string>();
            allTeamsFallback.forEach(team => {
              const norm = normalizeTeamFallback(team);
              if (!teamMapFallback.has(norm)) {
                teamMapFallback.set(norm, team);
              }
            });
            const uniqueTeamsFallback = Array.from(teamMapFallback.values());
            const fallbackTeamNorm = normalizeTeamFallback(fallbackTeam);
            const previousTeamsFallback = uniqueTeamsFallback.filter(t => normalizeTeamFallback(t) !== fallbackTeamNorm);
            
            setPlayerInfo({
              name: fallbackName,
              team: fallbackTeam,
              position: gamesPlayed[0].position,
              number: gamesPlayed[0].number,
              leagueId: gamesPlayed[0].league_id,
              playerId: playerInfo.playerId,
              photoPath: playerInfo.photoPath,
              photoFocusY: playerInfo.photoFocusY,
              previousTeams: previousTeamsFallback.length > 0 ? previousTeamsFallback : undefined
            });
          }

          const totals = gamesPlayed.reduce((acc, game) => ({
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
            turnovers: acc.turnovers + (game.sturnovers || game.turnovers || 0),
          }), {
            points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
            field_goals_made: 0, field_goals_attempted: 0,
            three_pointers_made: 0, three_pointers_attempted: 0,
            free_throws_made: 0, free_throws_attempted: 0,
            turnovers: 0
          });

          const games = gamesPlayed.length;
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
            avg_efficiency: ((totals.points + totals.rebounds + totals.assists + totals.steals + totals.blocks) - (totals.field_goals_attempted - totals.field_goals_made) - (totals.free_throws_attempted - totals.free_throws_made) - totals.turnovers) / games,
          };
          setSeasonAverages(averages);

          // Calculate player rankings
          if (gamesPlayed[0].league_id) {
            const ranks = await calculateRankings(gamesPlayed[0].league_id, averages);
            if (ranks) {
              setPlayerRankings(ranks);
            }
          }

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
            } catch (error) {
              console.error("❌ AI Analysis error:", error);
              setAiAnalysis("Dynamic player with strong fundamentals and competitive drive.");
            } finally {
              setAnalysisLoading(false);
            }
          }
        } else {
        }
        
      } catch (error) {
        console.error('❌ PLAYER PAGE - Unexpected error:', error);
        toast({
          title: "Error",
          description: "Failed to load player data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerSlugOrId, toast, setLocation]);

  // Filter stats based on selected league AND only games where player actually played
  const filteredStats = useMemo(() => {
    // First filter by league if needed
    let stats = playerStats;
    if (selectedLeagueFilter !== "all") {
      stats = playerStats.filter(stat => {
        const statLeagueId = stat.players?.league_id || stat.league_id;
        return statLeagueId === selectedLeagueFilter;
      });
    }
    
    // Then filter out games where player didn't play (0 minutes)
    return stats.filter(stat => parseMinutesPlayed(stat) > 0);
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
      turnovers: acc.turnovers + (game.sturnovers || game.turnovers || 0),
    }), {
      points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0,
      field_goals_made: 0, field_goals_attempted: 0,
      three_pointers_made: 0, three_pointers_attempted: 0,
      free_throws_made: 0, free_throws_attempted: 0,
      turnovers: 0
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
      avg_efficiency: ((totals.points + totals.rebounds + totals.assists + totals.steals + totals.blocks) - (totals.field_goals_attempted - totals.field_goals_made) - (totals.free_throws_attempted - totals.free_throws_made) - totals.turnovers) / games,
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

  const playerShotGameKeys = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];
    const sorted = [...playerStats]
      .filter(s => s.game_key)
      .sort((a, b) => new Date(b.game_date || b.created_at || '').getTime() - new Date(a.game_date || a.created_at || '').getTime());
    if (playerShotChartRange === "last5") return sorted.slice(0, 5).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange === "last10") return sorted.slice(0, 10).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange.startsWith("game:")) return [playerShotChartRange.replace("game:", "")];
    return sorted.map(s => s.game_key).filter(Boolean) as string[];
  }, [playerStats, playerShotChartRange]);

  const playerIdsForShots = useMemo(() => playerMatches.map(m => m.id), [playerMatches]);

  const { data: playerShotData, isLoading: playerShotsLoading } = useQuery({
    queryKey: ['player-shot-chart', playerIdsForShots, playerShotGameKeys],
    queryFn: async () => {
      if (playerIdsForShots.length === 0 || playerShotGameKeys.length === 0) return [];
      const { data, error } = await supabase
        .from('shot_chart')
        .select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
        .in('player_id', playerIdsForShots)
        .in('game_key', playerShotGameKeys);
      if (error) { console.error('Player shot chart error:', error); return []; }
      return (data || []) as ShotData[];
    },
    enabled: playerIdsForShots.length > 0 && playerShotGameKeys.length > 0,
  });

  const playerShotGamesWithKeys = useMemo(() => {
    if (!playerStats) return [];
    return playerStats
      .filter(s => s.game_key)
      .sort((a, b) => new Date(b.game_date || b.created_at || '').getTime() - new Date(a.game_date || a.created_at || '').getTime())
      .map(s => ({ game_key: s.game_key!, opponent: s.opponent || 'TBD', date: s.game_date || s.created_at || '' }))
      .filter((g, i, arr) => arr.findIndex(x => x.game_key === g.game_key) === i);
  }, [playerStats]);

  // Compute player photo URL using Supabase storage getPublicUrl for production compatibility
  const playerPhotoUrl = useMemo(() => {
    if (!playerInfo?.photoPath) return null;
    const { data } = supabase.storage.from('player-photos').getPublicUrl(playerInfo.photoPath);
    return data.publicUrl || null;
  }, [playerInfo?.photoPath]);

  const careerStats = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];
    const leagueGroups = new Map<string, any[]>();
    playerStats.forEach(stat => {
      const leagueId = stat.players?.league_id || stat.league_id || 'unknown';
      if (!leagueGroups.has(leagueId)) leagueGroups.set(leagueId, []);
      leagueGroups.get(leagueId)!.push(stat);
    });
    const seasons: any[] = [];
    leagueGroups.forEach((stats, leagueId) => {
      const played = stats.filter((s: any) => parseMinutesPlayed(s) > 0);
      if (played.length === 0) return;
      const gp = played.length;
      const totals = played.reduce((acc: any, g: any) => ({
        pts: acc.pts + (g.spoints || g.points || 0),
        reb: acc.reb + (g.sreboundstotal || g.rebounds_total || 0),
        ast: acc.ast + (g.sassists || g.assists || 0),
        stl: acc.stl + (g.ssteals || 0),
        blk: acc.blk + (g.sblocks || 0),
        fgm: acc.fgm + (g.sfieldgoalsmade || 0),
        fga: acc.fga + (g.sfieldgoalsattempted || 0),
        tpm: acc.tpm + (g.sthreepointersmade || 0),
        tpa: acc.tpa + (g.sthreepointersattempted || 0),
        ftm: acc.ftm + (g.sfreethrowsmade || 0),
        fta: acc.fta + (g.sfreethrowsattempted || 0),
        to: acc.to + (g.sturnovers || g.turnovers || 0),
        min: acc.min + parseMinutesPlayed(g),
      }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, to: 0, min: 0 });
      const team = played[0].team_name || played[0].team || '';
      seasons.push({
        leagueId, season: leagueNames.get(leagueId) || leagueId, team, gp, ...totals,
        fg_pct: totals.fga > 0 ? (totals.fgm / totals.fga) * 100 : 0,
        tp_pct: totals.tpa > 0 ? (totals.tpm / totals.tpa) * 100 : 0,
        ft_pct: totals.fta > 0 ? (totals.ftm / totals.fta) * 100 : 0,
        eff: ((totals.pts + totals.reb + totals.ast + totals.stl + totals.blk) - (totals.fga - totals.fgm) - (totals.fta - totals.ftm) - totals.to) / gp,
      });
    });
    return seasons;
  }, [playerStats, leagueNames]);

  const careerTotals = useMemo(() => {
    if (careerStats.length === 0) return null;
    const gp = careerStats.reduce((s, r) => s + r.gp, 0);
    const t = careerStats.reduce((acc, r) => ({
      pts: acc.pts + r.pts, reb: acc.reb + r.reb, ast: acc.ast + r.ast,
      stl: acc.stl + r.stl, blk: acc.blk + r.blk, fgm: acc.fgm + r.fgm,
      fga: acc.fga + r.fga, tpm: acc.tpm + r.tpm, tpa: acc.tpa + r.tpa,
      ftm: acc.ftm + r.ftm, fta: acc.fta + r.fta, to: acc.to + r.to, min: acc.min + r.min,
    }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, to: 0, min: 0 });
    return {
      gp, ...t,
      fg_pct: t.fga > 0 ? (t.fgm / t.fga) * 100 : 0,
      tp_pct: t.tpa > 0 ? (t.tpm / t.tpa) * 100 : 0,
      ft_pct: t.fta > 0 ? (t.ftm / t.fta) * 100 : 0,
      eff: ((t.pts + t.reb + t.ast + t.stl + t.blk) - (t.fga - t.fgm) - (t.fta - t.ftm) - t.to) / gp,
    };
  }, [careerStats]);

  const formatMinutes = (min: number) => min.toFixed(1);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      
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
      
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
        <div className="container mx-auto px-4 py-6 max-w-4xl space-y-4 md:space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
          <div className="w-full md:w-auto flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation('/')}
              className="group flex items-center gap-2 border-gray-200 dark:border-neutral-700 hover:bg-white dark:hover:bg-neutral-800 transition-all w-full md:w-auto dark:bg-neutral-900"
            >
              <ArrowLeft className="h-4 w-4 group-hover:hidden dark:text-orange-400" />
              <div className="hidden group-hover:block">
                <img src={SwishLogoImg} alt="Swish Assistant" className="h-4 w-4 object-contain" />
              </div>
              <span className="text-slate-700 dark:text-orange-400">Back to Dashboard</span>
            </Button>
            <ThemeToggle />
          </div>
          
          <div className="flex-1 w-full md:max-w-md lg:max-w-lg relative">
            <form
              onSubmit={handleSearchSubmit}
              className="flex items-center rounded-full border border-gray-200 dark:border-neutral-700 overflow-hidden bg-white dark:bg-neutral-900 shadow-sm"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find your league"
                className="flex-1 px-4 py-2 text-sm text-slate-800 dark:text-white focus:outline-none bg-white dark:bg-neutral-900 dark:placeholder-slate-400"
              />
              <button type="submit" className="bg-orange-500 text-white font-semibold px-4 py-2 hover:bg-orange-600 transition text-sm">
                Search
              </button>
            </form>

            {searchSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 mt-1 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchSuggestions.map((item, index) => (
                  <li
                    key={index}
                    onClick={() => handleSearchSelect(item)}
                    className="px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 text-left border-b border-gray-100 dark:border-neutral-700 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                        <span className="text-sm">{item.type === 'league' ? '🏆' : '👤'}</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-slate-900 dark:text-white text-sm">{item.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{item.type === 'player' ? item.team : 'League'}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {playerInfo && (
          <div className="relative rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-neutral-900 dark:to-neutral-800">
            <div className="relative min-h-[220px] md:min-h-[280px]">
              {playerInfo.playerId && playerPhotoUrl ? (
                <>
                  <img
                    src={playerPhotoUrl}
                    alt={playerInfo.name}
                    className="absolute right-0 bottom-0 h-full w-1/2 md:w-2/5 object-cover object-top"
                    style={{ objectPosition: `50% ${showFocusAdjuster ? tempFocusY : (playerInfo.photoFocusY ?? 30)}%` }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute right-0 bottom-0 h-full w-1/2 md:w-2/5 bg-gradient-to-r from-orange-50/95 dark:from-neutral-900/95 via-transparent to-transparent" />
                  <div className="absolute right-0 bottom-0 h-full w-1/2 md:w-2/5 bg-gradient-to-t from-orange-50/60 dark:from-neutral-900/60 via-transparent to-transparent" />
                </>
              ) : (
                <div className="absolute right-4 bottom-4 opacity-10">
                  <User className="w-32 h-32 text-orange-300 dark:text-neutral-600" />
                </div>
              )}

              <div className="relative z-10 p-6 md:p-8 max-w-[65%] md:max-w-[60%]">
                <div className="flex items-center gap-3 mb-3">
                  {playerInfo.team && playerInfo.leagueId && (
                    <TeamLogo teamName={playerInfo.team} leagueId={playerInfo.leagueId} size="lg" className="flex-shrink-0" />
                  )}
                  <div>
                    <h1 className="text-xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-tight" data-testid="text-player-name">
                      {playerInfo.name}
                    </h1>
                    <p className="text-sm md:text-base font-medium text-orange-600 dark:text-orange-400 mt-0.5" data-testid="text-player-team">
                      {playerInfo.team}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {playerInfo.position && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/80 dark:bg-neutral-800/80 text-slate-700 dark:text-slate-300 backdrop-blur-sm">
                      {playerInfo.position}
                    </span>
                  )}
                  {playerInfo.number && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/80 dark:bg-neutral-800/80 text-slate-700 dark:text-slate-300 backdrop-blur-sm">
                      #{playerInfo.number}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100/80 dark:bg-green-900/30 text-green-700 dark:text-green-400 backdrop-blur-sm">
                    <div className="h-1.5 w-1.5 bg-green-500 rounded-full animate-pulse"></div>
                    Active
                  </span>
                </div>

                {playerInfo.previousTeams && playerInfo.previousTeams.length > 0 && (
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-2 italic">
                    Previously: {playerInfo.previousTeams.join(', ')}
                  </p>
                )}
              </div>

              {showFocusAdjuster && playerInfo.photoPath && (
                <div className="absolute bottom-4 right-4 left-4 md:left-auto md:w-72 z-20 bg-white/95 dark:bg-neutral-800/95 rounded-lg p-3 shadow-lg">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Adjust vertical focus</div>
                  <Slider value={[tempFocusY]} onValueChange={(value) => setTempFocusY(value[0])} min={0} max={100} step={1} className="mb-3" data-testid="slider-photo-focus" />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveFocus} disabled={savingFocus} size="sm" className="flex-1 bg-green-600 hover:bg-green-700" data-testid="button-save-focus">
                      {savingFocus ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />} Save
                    </Button>
                    <Button onClick={() => setShowFocusAdjuster(false)} variant="outline" size="sm" className="flex-1" data-testid="button-cancel-focus">
                      <X className="w-4 h-4 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {user && playerInfo.playerId && !showFocusAdjuster && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" data-testid="input-player-photo" />
                  <div className="absolute bottom-3 right-3 z-10 flex gap-2">
                    {playerInfo.photoPath && (
                      <Button onClick={() => { setTempFocusY(playerInfo.photoFocusY ?? 50); setShowFocusAdjuster(true); }} size="sm" variant="outline" className="bg-white/90 dark:bg-neutral-800/90 shadow-lg h-7 text-xs" data-testid="button-adjust-photo-focus">
                        <Move className="w-3 h-3 mr-1" /> Adjust
                      </Button>
                    )}
                    <Button onClick={() => fileInputRef.current?.click()} disabled={photoUploading} size="sm" className="bg-orange-600 hover:bg-orange-700 text-white shadow-lg h-7 text-xs" data-testid="button-upload-player-photo">
                      {photoUploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                      {photoUploading ? 'Uploading...' : playerInfo.photoPath ? 'Change' : 'Add Photo'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {filteredSeasonAverages && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Season Averages</span>
              {selectedLeagueFilter !== "all" && (
                <Badge variant="outline" className="text-[10px] border-orange-300 dark:border-orange-500/50 text-orange-600 dark:text-orange-400">
                  {leagueNames.get(selectedLeagueFilter) || 'Filtered'}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
              {[
                { value: filteredSeasonAverages.avg_points, label: "PTS", rank: playerRankings?.points },
                { value: filteredSeasonAverages.avg_rebounds, label: "REB", rank: playerRankings?.rebounds },
                { value: filteredSeasonAverages.avg_assists, label: "AST", rank: playerRankings?.assists },
                { value: filteredSeasonAverages.avg_steals, label: "STL", rank: playerRankings?.steals },
                { value: filteredSeasonAverages.avg_blocks, label: "BLK", rank: playerRankings?.blocks },
                { value: filteredSeasonAverages.avg_efficiency, label: "EFF" },
              ].map((stat, i) => (
                <div key={i} className={`text-center py-2 ${i >= 3 ? 'hidden md:block' : ''}`}>
                  <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
                    {stat.label} {stat.rank ? <span className="text-[10px] normal-case">{getOrdinalSuffix(stat.rank)}</span> : null}
                  </div>
                  <div className="text-2xl md:text-3xl font-black text-orange-600 dark:text-orange-400 tabular-nums">
                    {stat.value.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredSeasonAverages && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">Shooting</span>
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: filteredSeasonAverages.fg_percentage, label: "FG%", rank: playerRankings?.fg_percentage },
                { value: filteredSeasonAverages.three_point_percentage, label: "3PT%", rank: playerRankings?.three_point_percentage },
                { value: filteredSeasonAverages.ft_percentage, label: "FT%", rank: playerRankings?.ft_percentage },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
                    {stat.label} {stat.rank ? <span className="text-[10px] normal-case">{getOrdinalSuffix(stat.rank)}</span> : null}
                  </div>
                  <div className="text-xl md:text-2xl font-black text-orange-600 dark:text-orange-400 tabular-nums">{formatPercentage(stat.value)}</div>
                  <div className="mt-1.5 bg-gray-100 dark:bg-neutral-700 h-1 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-orange-500 transition-all duration-500" style={{ width: `${Math.min(stat.value, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {careerStats.length > 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 overflow-hidden">
            <div className="p-4 pb-0 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white">Career Stats</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700">
                {["averages", "totals", "advanced"].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setCareerStatsTab(tab)}
                    className={`px-3 md:px-4 py-1.5 text-xs md:text-sm font-medium transition-colors capitalize ${
                      careerStatsTab === tab
                        ? 'bg-orange-500 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] md:text-xs tracking-wider">
                    <th className="px-2 md:px-3 py-2 text-left font-semibold">Season</th>
                    <th className="px-2 md:px-3 py-2 text-left font-semibold">Team</th>
                    {careerStatsTab === "averages" && (
                      <>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">GP</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">MIN</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">FG%</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">3P%</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">FT%</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">REB</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">AST</th>
                        <th className="hidden md:table-cell px-2 md:px-3 py-2 text-center font-semibold">STL</th>
                        <th className="hidden md:table-cell px-2 md:px-3 py-2 text-center font-semibold">BLK</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">PTS</th>
                      </>
                    )}
                    {careerStatsTab === "totals" && (
                      <>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">GP</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">MIN</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">FG</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">3P</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">FT</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">REB</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">AST</th>
                        <th className="hidden md:table-cell px-2 md:px-3 py-2 text-center font-semibold">STL</th>
                        <th className="hidden md:table-cell px-2 md:px-3 py-2 text-center font-semibold">BLK</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">PTS</th>
                      </>
                    )}
                    {careerStatsTab === "advanced" && (
                      <>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">GP</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">EFF</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">TO</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">FG%</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">3P%</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">FT%</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">REB</th>
                        <th className="px-2 md:px-3 py-2 text-center font-semibold">AST</th>
                        <th className="hidden md:table-cell px-2 md:px-3 py-2 text-center font-semibold">STL</th>
                        <th className="hidden md:table-cell px-2 md:px-3 py-2 text-center font-semibold">BLK</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {careerStats.map((row, idx) => {
                    const gp = row.gp;
                    return (
                      <tr key={idx} className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''}`}>
                        <td className="px-2 md:px-3 py-2 text-xs md:text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap max-w-[100px] truncate">{row.season}</td>
                        <td className="px-2 md:px-3 py-2 text-xs md:text-sm whitespace-nowrap max-w-[80px] truncate">{row.team}</td>
                        {careerStatsTab === "averages" && (
                          <>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{gp}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{formatMinutes(row.min / gp)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.fg_pct.toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.tp_pct.toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.ft_pct.toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.reb / gp).toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.ast / gp).toFixed(1)}</td>
                            <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.stl / gp).toFixed(1)}</td>
                            <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.blk / gp).toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm font-semibold">{(row.pts / gp).toFixed(1)}</td>
                          </>
                        )}
                        {careerStatsTab === "totals" && (
                          <>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{gp}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{Math.round(row.min)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.fgm}-{row.fga}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.tpm}-{row.tpa}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.ftm}-{row.fta}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.reb}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.ast}</td>
                            <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.stl}</td>
                            <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.blk}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm font-semibold">{row.pts}</td>
                          </>
                        )}
                        {careerStatsTab === "advanced" && (
                          <>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{gp}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.eff.toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.to / gp).toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.fg_pct.toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.tp_pct.toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{row.ft_pct.toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.reb / gp).toFixed(1)}</td>
                            <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.ast / gp).toFixed(1)}</td>
                            <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.stl / gp).toFixed(1)}</td>
                            <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(row.blk / gp).toFixed(1)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {careerTotals && careerStats.length > 1 && (
                    <tr className="font-bold text-slate-900 dark:text-white border-t-2 border-orange-300 dark:border-orange-500/40">
                      <td className="px-2 md:px-3 py-2 text-xs md:text-sm uppercase text-orange-600 dark:text-orange-400">Career</td>
                      <td className="px-2 md:px-3 py-2 text-xs md:text-sm"></td>
                      {careerStatsTab === "averages" && (
                        <>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.gp}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{formatMinutes(careerTotals.min / careerTotals.gp)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.fg_pct.toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.tp_pct.toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.ft_pct.toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.reb / careerTotals.gp).toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.ast / careerTotals.gp).toFixed(1)}</td>
                          <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.stl / careerTotals.gp).toFixed(1)}</td>
                          <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.blk / careerTotals.gp).toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.pts / careerTotals.gp).toFixed(1)}</td>
                        </>
                      )}
                      {careerStatsTab === "totals" && (
                        <>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.gp}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{Math.round(careerTotals.min)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.fgm}-{careerTotals.fga}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.tpm}-{careerTotals.tpa}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.ftm}-{careerTotals.fta}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.reb}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.ast}</td>
                          <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.stl}</td>
                          <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.blk}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.pts}</td>
                        </>
                      )}
                      {careerStatsTab === "advanced" && (
                        <>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.gp}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.eff.toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.to / careerTotals.gp).toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.fg_pct.toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.tp_pct.toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{careerTotals.ft_pct.toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.reb / careerTotals.gp).toFixed(1)}</td>
                          <td className="px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.ast / careerTotals.gp).toFixed(1)}</td>
                          <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.stl / careerTotals.gp).toFixed(1)}</td>
                          <td className="hidden md:table-cell px-2 md:px-3 py-2 text-center text-xs md:text-sm">{(careerTotals.blk / careerTotals.gp).toFixed(1)}</td>
                        </>
                      )}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {playerLeagues.length > 0 && (
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">Active Leagues</span>
            <div className="flex flex-wrap gap-2">
              {playerLeagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => setLocation(`/league/${league.slug}`)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-neutral-700 hover:border-orange-300 dark:hover:border-orange-500/50 bg-white dark:bg-neutral-800 hover:bg-orange-50 dark:hover:bg-neutral-700 transition-colors text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  <Trophy className="h-4 w-4 text-orange-500" />
                  {league.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Shot Chart</span>
            <Select value={playerShotChartRange} onValueChange={setPlayerShotChartRange}>
              <SelectTrigger className="w-full md:w-48 h-8 text-sm border-gray-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                <SelectItem value="season">Full Season</SelectItem>
                <SelectItem value="last10">Last 10 Games</SelectItem>
                <SelectItem value="last5">Last 5 Games</SelectItem>
                {playerShotGamesWithKeys.map((g) => (
                  <SelectItem key={g.game_key} value={`game:${g.game_key}`}>
                    vs {g.opponent} ({new Date(g.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ShotChart
            shots={playerShotData || []}
            loading={playerShotsLoading}
            compact
            emptyMessage="No shot data available for this player."
            filters={{ showQuarterFilter: true, showResultFilter: true }}
          />
        </div>

        {playerMatches.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-slate-600 dark:text-slate-400">Competition:</span>
            <Select value={selectedLeagueFilter} onValueChange={setSelectedLeagueFilter}>
              <SelectTrigger className="w-auto min-w-[160px] h-8 text-sm border-gray-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white" data-testid="select-league-filter">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
                <SelectItem value="all" data-testid="select-league-all" className="dark:text-white dark:focus:bg-neutral-700">All Competitions</SelectItem>
                {Array.from(new Set(playerMatches.map(m => m.league_id))).filter(Boolean).map(leagueId => (
                  <SelectItem key={leagueId} value={leagueId} data-testid={`select-league-${leagueId}`} className="dark:text-white dark:focus:bg-neutral-700">
                    {leagueNames.get(leagueId) || leagueId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-neutral-800">
            <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white">Game Log</span>
          </div>
          {filteredStats.length === 0 ? (
            <div className="p-6 md:p-8 text-center text-slate-500 dark:text-slate-400 text-sm md:text-base">
              No game statistics found for this player{selectedLeagueFilter !== "all" ? " in the selected competition" : ""}.
            </div>
          ) : (
            <>
              <div className="md:hidden">
                {filteredStats.map((game, index) => {
                  const opponentName = (game.opponent && game.opponent.trim()) || 'TBD';
                  return (
                    <div
                      key={game.id}
                      className={`p-3 border-b border-gray-50 dark:border-neutral-800 ${
                        index % 2 === 0 ? 'bg-white dark:bg-neutral-900' : 'bg-gray-50/50 dark:bg-neutral-800/30'
                      }`}
                      data-testid={`game-card-${game.id}`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-xs text-slate-500 dark:text-slate-400">{formatDate(game.game_date || game.created_at)}</div>
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">vs {opponentName}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-900 dark:text-white">{game.spoints || game.points || 0}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">PTS</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-900 dark:text-white">{game.sreboundstotal || game.rebounds_total || 0}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">REB</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-slate-900 dark:text-white">{game.sassists || game.assists || 0}</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase">AST</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] md:text-xs tracking-wider">
                      <th className="px-3 py-2 text-left font-semibold">Date</th>
                      <th className="px-3 py-2 text-left font-semibold">OPP</th>
                      <th className="hidden lg:table-cell px-3 py-2 font-semibold">MIN</th>
                      <th className="px-3 py-2 text-center font-semibold">PTS</th>
                      <th className="px-3 py-2 text-center font-semibold">REB</th>
                      <th className="px-3 py-2 text-center font-semibold">AST</th>
                      <th className="hidden lg:table-cell px-3 py-2 text-center font-semibold">STL</th>
                      <th className="hidden lg:table-cell px-3 py-2 text-center font-semibold">BLK</th>
                      <th className="hidden lg:table-cell px-3 py-2 text-center font-semibold">FG</th>
                      <th className="hidden lg:table-cell px-3 py-2 text-center font-semibold">3P</th>
                      <th className="hidden lg:table-cell px-3 py-2 text-center font-semibold">FT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStats.map((game, index) => {
                      const opponentName = (game.opponent && game.opponent.trim()) || 'TBD';
                      return (
                        <tr 
                          key={game.id} 
                          className={`border-b border-gray-50 dark:border-neutral-800/50 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors ${
                            index % 2 === 0 ? 'bg-white dark:bg-neutral-900' : 'bg-gray-50/50 dark:bg-neutral-800/30'
                          }`}
                          data-testid={`game-row-${game.id}`}
                        >
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-300 text-sm">{formatDate(game.game_date || game.created_at)}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 dark:text-slate-300 font-medium">vs {opponentName}</td>
                          <td className="hidden lg:table-cell px-3 py-2 text-slate-500 dark:text-slate-400 text-sm text-center">{game.sminutes || '0'}</td>
                          <td className="px-3 py-2 font-bold text-slate-900 dark:text-white text-sm text-center">{game.spoints || game.points || 0}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-sm text-center">{game.sreboundstotal || game.rebounds_total || 0}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 text-sm text-center">{game.sassists || game.assists || 0}</td>
                          <td className="hidden lg:table-cell px-3 py-2 text-slate-500 dark:text-slate-400 text-sm text-center">{game.ssteals || 0}</td>
                          <td className="hidden lg:table-cell px-3 py-2 text-slate-500 dark:text-slate-400 text-sm text-center">{game.sblocks || 0}</td>
                          <td className="hidden lg:table-cell px-3 py-2 text-slate-500 dark:text-slate-400 text-sm text-center">{game.sfieldgoalsmade || 0}/{game.sfieldgoalsattempted || 0}</td>
                          <td className="hidden lg:table-cell px-3 py-2 text-slate-500 dark:text-slate-400 text-sm text-center">{game.sthreepointersmade || 0}/{game.sthreepointersattempted || 0}</td>
                          <td className="hidden lg:table-cell px-3 py-2 text-slate-500 dark:text-slate-400 text-sm text-center">{game.sfreethrowsmade || 0}/{game.sfreethrowsattempted || 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        </div>
      </div>
    </>
  );
}