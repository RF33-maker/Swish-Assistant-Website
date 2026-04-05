import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Trophy, User, TrendingUp, Camera, Upload, Loader2, Move, Check, X, Filter } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { generatePlayerAnalysis, type PlayerAnalysisData } from "@/lib/ai-analysis";
import { TeamLogo } from "@/components/TeamLogo";
import { namesMatch, getMostCompleteName, slugToName, type PlayerMatch } from "@/lib/fuzzyMatch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface InlinePlayerProfileProps {
  playerSlug: string;
  brandColor: string;
  onBack: () => void;
  leagueSlug?: string;
}

const getTeamAbbreviation = (name: string): string => {
  if (!name) return '—';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().substring(0, 4);
};

export function InlinePlayerProfile({ playerSlug, brandColor, onBack, leagueSlug }: InlinePlayerProfileProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const [playerStats, setPlayerStats] = useState<PlayerStat[]>([]);
  const [seasonAverages, setSeasonAverages] = useState<SeasonAverages | null>(null);
  const [playerRankings, setPlayerRankings] = useState<PlayerRankings | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ name: string; team: string; position?: string; number?: number; leagueId?: string; playerId?: string; photoPath?: string | null; photoFocusY?: number | null; previousTeams?: string[] } | null>(null);
  const [playerMatches, setPlayerMatches] = useState<PlayerMatch[]>([]);
  const [nameVariations, setNameVariations] = useState<string[]>([]);
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
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

  const brandColorLight = brandColor + '15';

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

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from('players')
        .update({ photo_path: filePath })
        .eq('id', playerInfo.playerId);

      if (updateError) throw updateError;

      setPlayerInfo(prev => prev ? { ...prev, photoPath: filePath } : null);
      setShowFocusAdjuster(true);
      setTempFocusY(50);

      toast({
        title: "Photo uploaded",
        description: "Adjust the focus point to ensure the face is visible",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload photo",
        variant: "destructive",
      });
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      toast({ title: "Focus saved", description: "Photo positioning has been updated" });
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message || "Failed to save focus position", variant: "destructive" });
    } finally {
      setSavingFocus(false);
    }
  };

  const getOrdinalSuffix = (num: number): string => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + "st";
    if (j === 2 && k !== 12) return num + "nd";
    if (j === 3 && k !== 13) return num + "rd";
    return num + "th";
  };

  const parseMinutesPlayed = (stat: any): number => {
    const minutes = stat.sminutes || stat.minutes_played;
    if (!minutes) return 0;
    if (typeof minutes === 'number') return minutes;
    if (typeof minutes === 'string') {
      const parts = minutes.split(':');
      if (parts.length === 2) return parseInt(parts[0]) + parseInt(parts[1]) / 60;
      return parseFloat(minutes) || 0;
    }
    return 0;
  };

  const calculateRankings = async (leagueId: string, currentAverages: SeasonAverages): Promise<PlayerRankings | null> => {
    try {
      const { data: allStats } = await supabase
        .from('player_stats')
        .select('*')
        .eq('league_id', leagueId)
        .eq('is_public', true);

      if (!allStats || allStats.length === 0) return null;

      const playedStats = allStats.filter(stat => parseMinutesPlayed(stat) > 0);
      if (playedStats.length === 0) return null;

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

      const rankings: { [key: string]: number[] } = {
        points: [], rebounds: [], assists: [], steals: [], blocks: [],
        fg_percentage: [], three_point_percentage: [], ft_percentage: []
      };

      playerTotals.forEach((totals) => {
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

      const calculateRank = (arr: number[], value: number): number => {
        return arr.filter(v => v > value).length + 1;
      };

      return {
        points: calculateRank(rankings.points, currentAverages.avg_points),
        rebounds: calculateRank(rankings.rebounds, currentAverages.avg_rebounds),
        assists: calculateRank(rankings.assists, currentAverages.avg_assists),
        steals: calculateRank(rankings.steals, currentAverages.avg_steals),
        blocks: calculateRank(rankings.blocks, currentAverages.avg_blocks),
        fg_percentage: calculateRank(rankings.fg_percentage, currentAverages.fg_percentage),
        three_point_percentage: calculateRank(rankings.three_point_percentage, currentAverages.three_point_percentage),
        ft_percentage: calculateRank(rankings.ft_percentage, currentAverages.ft_percentage)
      };
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    if (!playerSlug) return;

    const fetchPlayerData = async () => {
      setLoading(true);
      try {
        let initialPlayer: any = null;
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerSlug);

        if (isUUID) {
          const { data, error } = await supabase.from('players').select('*').eq('id', playerSlug).single();
          if (data && !error) initialPlayer = data;
        } else {
          const { data, error } = await supabase.from('players').select('*').eq('slug', playerSlug).single();
          if (data && !error) initialPlayer = data;

          if (!initialPlayer) {
            const searchName = slugToName(playerSlug);
            const { data: directMatch } = await supabase.from('players').select('*').ilike('full_name', `%${searchName}%`).limit(10);
            if (directMatch && directMatch.length > 0) {
              initialPlayer = directMatch.find(player => namesMatch(player.full_name, searchName)) || directMatch[0];
            }
          }
        }

        if (!initialPlayer) {
          toast({ title: "Player Not Found", description: "Could not find player with the specified identifier", variant: "destructive" });
          setLoading(false);
          return;
        }

        const searchTerms = initialPlayer.full_name.split(' ').filter((t: string) => t.length > 2);
        const searchQ = searchTerms[searchTerms.length - 1] || initialPlayer.full_name;

        const { data: allPlayersData, error: allPlayersError } = await supabase
          .from('players').select('*').ilike('full_name', `%${searchQ}%`).limit(100);

        let allPlayers = [initialPlayer];
        if (!allPlayersError && allPlayersData) allPlayers = allPlayersData;

        const matchingPlayers = allPlayers.filter(player => namesMatch(player.full_name, initialPlayer.full_name));

        const matches: PlayerMatch[] = matchingPlayers.map(p => ({
          id: p.id, name: p.name, full_name: p.full_name, team: p.team,
          league_id: p.league_id, position: p.position, number: p.number,
          slug: p.slug, matchScore: 1.0
        }));

        setPlayerMatches(matches);
        setNameVariations(Array.from(new Set(matches.map(m => m.full_name))));

        const canonicalName = getMostCompleteName(Array.from(new Set(matches.map(m => m.full_name))));

        let pInfo = {
          name: canonicalName, team: initialPlayer.team,
          position: initialPlayer.position, number: initialPlayer.number,
          leagueId: initialPlayer.league_id, playerId: initialPlayer.id,
          photoPath: initialPlayer.photo_path, photoFocusY: initialPlayer.photo_focus_y
        };

        const playerIds = matches.map(m => m.id);
        const { data: stats, error: statsError } = await supabase
          .from('player_stats').select('*, players:player_id(full_name, league_id)')
          .in('player_id', playerIds).order('created_at', { ascending: false });

        const uniqueLeagueIds = Array.from(new Set(matches.map(m => m.league_id).filter(Boolean)));
        if (uniqueLeagueIds.length > 0) {
          const { data: leaguesData } = await supabase.from('leagues').select('league_id, name').in('league_id', uniqueLeagueIds);
          if (leaguesData) {
            const leagueMap = new Map<string, string>();
            leaguesData.forEach(league => leagueMap.set(league.league_id, league.name));
            setLeagueNames(leagueMap);
          }
        }

        if (statsError) {
          toast({ title: "Error Loading Stats", description: "Failed to load player statistics", variant: "destructive" });
          setLoading(false);
          return;
        }

        let statsWithOpponents = stats || [];
        if (stats && stats.length > 0) {
          const gameKeys = Array.from(new Set(stats.map(stat => stat.game_key).filter(Boolean)));
          if (gameKeys.length > 0) {
            const { data: gamesData, error: gamesError } = await supabase
              .from('game_schedule').select('game_key, hometeam, awayteam').in('game_key', gameKeys);

            if (!gamesError && gamesData && gamesData.length > 0) {
              const gameKeyMap = new Map<string, { hometeam: string; awayteam: string }>();
              gamesData.forEach(game => {
                if (game.game_key) gameKeyMap.set(game.game_key, { hometeam: game.hometeam, awayteam: game.awayteam });
              });

              statsWithOpponents = stats.map(stat => {
                let derivedOpponent = undefined;
                if (stat.game_key) {
                  const gameInfo = gameKeyMap.get(stat.game_key);
                  if (gameInfo) {
                    const playerTeamNorm = (stat.team_name || '').trim().toLowerCase();
                    const homeTeamNorm = (gameInfo.hometeam || '').trim().toLowerCase();
                    const awayTeamNorm = (gameInfo.awayteam || '').trim().toLowerCase();
                    if (playerTeamNorm === homeTeamNorm) derivedOpponent = gameInfo.awayteam;
                    else if (playerTeamNorm === awayTeamNorm) derivedOpponent = gameInfo.hometeam;
                  }
                }
                return { ...stat, opponent: derivedOpponent || stat.opponent };
              });
            }
          }
        }

        setPlayerStats(statsWithOpponents);

        if (statsWithOpponents && statsWithOpponents.length > 0 && statsWithOpponents[0].players) {
          const sortedByGameDate = [...statsWithOpponents].sort((a, b) => {
            const dateA = a.game_date ? new Date(a.game_date).getTime() : 0;
            const dateB = b.game_date ? new Date(b.game_date).getTime() : 0;
            return dateB - dateA;
          });
          const mostRecentStat = sortedByGameDate[0] || statsWithOpponents[0];

          const normalizeTeam = (t: string) => t.trim().toLowerCase();
          const allTeams = statsWithOpponents.map(s => s.team_name || s.team).filter((team): team is string => Boolean(team));
          const teamMap = new Map<string, string>();
          allTeams.forEach(team => { const norm = normalizeTeam(team); if (!teamMap.has(norm)) teamMap.set(norm, team); });
          const uniqueTeams = Array.from(teamMap.values());
          const currentTeam = mostRecentStat.team_name || mostRecentStat.team || 'Unknown Team';
          const currentTeamNorm = normalizeTeam(currentTeam);
          const previousTeams = uniqueTeams.filter(t => normalizeTeam(t) !== currentTeamNorm);

          pInfo = {
            name: mostRecentStat.players?.full_name || mostRecentStat.full_name || mostRecentStat.name || `${mostRecentStat.firstname || ''} ${mostRecentStat.familyname || ''}`.trim() || 'Unknown Player',
            team: currentTeam, position: mostRecentStat.position, number: mostRecentStat.number,
            leagueId: mostRecentStat.league_id, playerId: pInfo.playerId,
            photoPath: pInfo.photoPath, photoFocusY: pInfo.photoFocusY,
            previousTeams: previousTeams.length > 0 ? previousTeams : undefined
          };
        }

        setPlayerInfo(pInfo);

        const gamesPlayed = (stats || []).filter(stat => parseMinutesPlayed(stat) > 0);

        if (gamesPlayed.length > 0) {
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
            free_throws_made: 0, free_throws_attempted: 0, turnovers: 0
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

          if (gamesPlayed[0].league_id) {
            const ranks = await calculateRankings(gamesPlayed[0].league_id, averages);
            if (ranks) setPlayerRankings(ranks);
          }

          if (pInfo && averages) {
            setAnalysisLoading(true);
            try {
              const analysisData: PlayerAnalysisData = {
                name: pInfo.name, games_played: averages.games_played,
                avg_points: averages.avg_points, avg_rebounds: averages.avg_rebounds,
                avg_assists: averages.avg_assists, avg_steals: averages.avg_steals,
                avg_blocks: averages.avg_blocks, fg_percentage: averages.fg_percentage,
                three_point_percentage: averages.three_point_percentage,
                ft_percentage: averages.ft_percentage
              };
              const analysis = await generatePlayerAnalysis(analysisData);
              setAiAnalysis(analysis);
            } catch {
              setAiAnalysis("Dynamic player with strong fundamentals and competitive drive.");
            } finally {
              setAnalysisLoading(false);
            }
          }
        }
      } catch (error) {
        toast({ title: "Error", description: "Failed to load player data", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerData();
  }, [playerSlug, toast]);

  const filteredStats = useMemo(() => {
    let stats = playerStats;
    if (selectedLeagueFilter !== "all") {
      stats = playerStats.filter(stat => {
        const statLeagueId = stat.players?.league_id || stat.league_id;
        return statLeagueId === selectedLeagueFilter;
      });
    }
    return stats.filter(stat => parseMinutesPlayed(stat) > 0);
  }, [playerStats, selectedLeagueFilter]);

  const filteredSeasonAverages = useMemo(() => {
    if (!filteredStats || filteredStats.length === 0) return null;

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
      free_throws_made: 0, free_throws_attempted: 0, turnovers: 0
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

  const nameVariationsWithLeagues = useMemo(() => {
    if (playerMatches.length <= 1) return [];
    const variations = playerMatches.map(match => ({
      name: match.full_name,
      leagueId: match.league_id,
      leagueName: leagueNames.get(match.league_id) || 'Unknown League'
    }));
    return variations.filter((v, index, self) => index === self.findIndex(t => t.name === v.name));
  }, [playerMatches, leagueNames]);

  const playerShotGameKeys = useMemo(() => {
    if (!playerStats || playerStats.length === 0) return [];
    const sorted = [...playerStats].filter(s => s.game_key)
      .sort((a, b) => new Date(b.game_date || b.created_at || '').getTime() - new Date(a.game_date || a.created_at || '').getTime());
    if (playerShotChartRange === "last5") return sorted.slice(0, 5).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange === "last10") return sorted.slice(0, 10).map(s => s.game_key).filter(Boolean) as string[];
    if (playerShotChartRange.startsWith("game:")) return [playerShotChartRange.replace("game:", "")];
    return sorted.map(s => s.game_key).filter(Boolean) as string[];
  }, [playerStats, playerShotChartRange]);

  const playerIdsForShots = useMemo(() => playerMatches.map(m => m.id), [playerMatches]);

  const { data: playerShotData, isLoading: playerShotsLoading } = useQuery({
    queryKey: ['player-shot-chart-inline', playerIdsForShots, playerShotGameKeys],
    queryFn: async () => {
      if (playerIdsForShots.length === 0 || playerShotGameKeys.length === 0) return [];
      const { data, error } = await supabase
        .from('shot_chart')
        .select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
        .in('player_id', playerIdsForShots)
        .in('game_key', playerShotGameKeys);
      if (error) return [];
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

  const playerPhotoUrl = useMemo(() => {
    if (!playerInfo?.photoPath) return null;
    const { data } = supabase.storage.from('player-photos').getPublicUrl(playerInfo.photoPath);
    return data.publicUrl || null;
  }, [playerInfo?.photoPath]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatMinutes = (min: number) => min.toFixed(1);

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: brandColor }}></div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Loading player profile...</p>
        </div>
      </div>
    );
  }

  const cTd = "px-2 py-1.5 text-center text-xs whitespace-nowrap";

  const renderCareerStatsRow = (row: any, isCareer = false) => {
    const gp = row.gp;
    if (careerStatsTab === "averages") {
      return (
        <>
          <td className={cTd}>{gp}</td>
          <td className={cTd}>{formatMinutes(row.min / gp)}</td>
          <td className={cTd}>{(row.pts / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.reb / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.ast / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.stl / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.blk / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.to / gp).toFixed(1)}</td>
          <td className={cTd}>{row.fg_pct.toFixed(1)}</td>
          <td className={cTd}>{row.tp_pct.toFixed(1)}</td>
          <td className={cTd}>{row.ft_pct.toFixed(1)}</td>
          <td className={`${cTd} font-semibold`}>{row.eff.toFixed(1)}</td>
        </>
      );
    } else if (careerStatsTab === "totals") {
      return (
        <>
          <td className={cTd}>{gp}</td>
          <td className={cTd}>{Math.round(row.min)}</td>
          <td className={cTd}>{row.pts}</td>
          <td className={cTd}>{row.reb}</td>
          <td className={cTd}>{row.ast}</td>
          <td className={cTd}>{row.stl}</td>
          <td className={cTd}>{row.blk}</td>
          <td className={cTd}>{row.to}</td>
          <td className={cTd}>{row.fgm}-{row.fga}</td>
          <td className={cTd}>{row.tpm}-{row.tpa}</td>
          <td className={cTd}>{row.ftm}-{row.fta}</td>
          <td className={`${cTd} font-semibold`}>{row.eff.toFixed(1)}</td>
        </>
      );
    } else {
      return (
        <>
          <td className={cTd}>{gp}</td>
          <td className={cTd}>{row.eff.toFixed(1)}</td>
          <td className={cTd}>{(row.to / gp).toFixed(1)}</td>
          <td className={cTd}>{row.fg_pct.toFixed(1)}</td>
          <td className={cTd}>{row.tp_pct.toFixed(1)}</td>
          <td className={cTd}>{row.ft_pct.toFixed(1)}</td>
          <td className={cTd}>{(row.pts / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.reb / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.ast / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.stl / gp).toFixed(1)}</td>
          <td className={cTd}>{(row.blk / gp).toFixed(1)}</td>
        </>
      );
    }
  };

  return (
    <div className="space-y-4 md:space-y-5 animate-fade-in-up">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:underline"
        style={{ color: brandColor }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {playerInfo && (
        <div className="relative rounded-xl overflow-hidden shadow-lg" style={{ borderColor: brandColor + '40' }}>
          <div className="relative min-h-[200px] md:min-h-[260px]" style={{ background: `linear-gradient(135deg, ${brandColor}22 0%, ${brandColor}44 100%)` }}>
            {playerInfo.playerId && playerPhotoUrl ? (
              <>
                <img
                  src={playerPhotoUrl}
                  alt={playerInfo.name}
                  className="absolute right-0 bottom-0 h-full w-1/2 md:w-2/5 object-cover object-top"
                  style={{ objectPosition: `50% ${showFocusAdjuster ? tempFocusY : (playerInfo.photoFocusY ?? 30)}%` }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="absolute right-0 bottom-0 h-full w-1/2 md:w-2/5 bg-gradient-to-r from-white/90 dark:from-neutral-900/90 via-transparent to-transparent" />
                <div className="absolute right-0 bottom-0 h-full w-1/2 md:w-2/5 bg-gradient-to-t from-white/60 dark:from-neutral-900/60 via-transparent to-transparent" />
              </>
            ) : (
              <div className="absolute right-4 bottom-4 opacity-10">
                <User className="w-32 h-32" style={{ color: brandColor }} />
              </div>
            )}

            <div className="relative z-10 p-5 md:p-8 max-w-[65%] md:max-w-[60%]">
              <div className="flex items-center gap-3 mb-3">
                {playerInfo.team && playerInfo.leagueId && (
                  <TeamLogo teamName={playerInfo.team} leagueId={playerInfo.leagueId} size="lg" className="flex-shrink-0" />
                )}
                <div>
                  <h1 className="text-xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-tight">
                    {playerInfo.name}
                  </h1>
                  <p className="text-sm md:text-base font-medium mt-0.5" style={{ color: brandColor }}>
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
                <Slider value={[tempFocusY]} onValueChange={(value) => setTempFocusY(value[0])} min={0} max={100} step={1} className="mb-3" />
                <div className="flex gap-2">
                  <Button onClick={handleSaveFocus} disabled={savingFocus} size="sm" className="flex-1 bg-green-600 hover:bg-green-700">
                    {savingFocus ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />} Save
                  </Button>
                  <Button onClick={() => setShowFocusAdjuster(false)} variant="outline" size="sm" className="flex-1">
                    <X className="w-4 h-4 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            )}

            {user && playerInfo.playerId && !showFocusAdjuster && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                <div className="absolute bottom-3 right-3 z-10 flex gap-2">
                  {playerInfo.photoPath && (
                    <Button onClick={() => { setTempFocusY(playerInfo.photoFocusY ?? 50); setShowFocusAdjuster(true); }} size="sm" variant="outline" className="bg-white/90 dark:bg-neutral-800/90 shadow-lg h-7 text-xs">
                      <Move className="w-3 h-3 mr-1" /> Adjust
                    </Button>
                  )}
                  <Button onClick={() => fileInputRef.current?.click()} disabled={photoUploading} size="sm" className="text-white shadow-lg h-7 text-xs" style={{ backgroundColor: brandColor }}>
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
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: brandColor + '50', color: brandColor }}>
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
                <div className="text-2xl md:text-3xl font-black tabular-nums" style={{ color: brandColor }}>
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
                <div className="text-xl md:text-2xl font-black tabular-nums" style={{ color: brandColor }}>{formatPercentage(stat.value)}</div>
                <div className="mt-1.5 bg-gray-100 dark:bg-neutral-700 h-1 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(stat.value, 100)}%`, backgroundColor: brandColor }} />
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
                      ? 'text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
                  }`}
                  style={careerStatsTab === tab ? { backgroundColor: brandColor } : {}}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-y border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                  <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Season</th>
                  <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Team</th>
                  {careerStatsTab === "averages" && (
                    <>
                      <th className="px-2 py-1.5 text-center font-semibold">GP</th>
                      <th className="px-2 py-1.5 text-center font-semibold">MIN</th>
                      <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                      <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                      <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                      <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                      <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                      <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                      <th className="px-2 py-1.5 text-center font-semibold">FG%</th>
                      <th className="px-2 py-1.5 text-center font-semibold">3P%</th>
                      <th className="px-2 py-1.5 text-center font-semibold">FT%</th>
                      <th className="px-2 py-1.5 text-center font-semibold">EFF</th>
                    </>
                  )}
                  {careerStatsTab === "totals" && (
                    <>
                      <th className="px-2 py-1.5 text-center font-semibold">GP</th>
                      <th className="px-2 py-1.5 text-center font-semibold">MIN</th>
                      <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                      <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                      <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                      <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                      <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                      <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                      <th className="px-2 py-1.5 text-center font-semibold">FG</th>
                      <th className="px-2 py-1.5 text-center font-semibold">3P</th>
                      <th className="px-2 py-1.5 text-center font-semibold">FT</th>
                      <th className="px-2 py-1.5 text-center font-semibold">EFF</th>
                    </>
                  )}
                  {careerStatsTab === "advanced" && (
                    <>
                      <th className="px-2 py-1.5 text-center font-semibold">GP</th>
                      <th className="px-2 py-1.5 text-center font-semibold">EFF</th>
                      <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                      <th className="px-2 py-1.5 text-center font-semibold">FG%</th>
                      <th className="px-2 py-1.5 text-center font-semibold">3P%</th>
                      <th className="px-2 py-1.5 text-center font-semibold">FT%</th>
                      <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                      <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                      <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                      <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                      <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {careerStats.map((row, idx) => (
                  <tr key={idx} className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${idx % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''}`}>
                    <td className="px-2 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap max-w-[100px] truncate">{row.season}</td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <TeamLogo teamName={row.team} leagueId={row.leagueId} size="xs" className="flex-shrink-0" />
                        <span className="truncate max-w-[50px]">{getTeamAbbreviation(row.team)}</span>
                      </div>
                    </td>
                    {renderCareerStatsRow(row)}
                  </tr>
                ))}
                {careerTotals && careerStats.length > 1 && (
                  <tr className="font-bold text-slate-900 dark:text-white border-t-2" style={{ borderColor: brandColor + '40' }}>
                    <td className="px-2 py-1.5 text-xs uppercase" style={{ color: brandColor }}>Career</td>
                    <td className="px-2 py-1.5 text-xs"></td>
                    {renderCareerStatsRow(careerTotals, true)}
                  </tr>
                )}
              </tbody>
            </table>
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
          <Filter className="h-4 w-4" style={{ color: brandColor }} />
          <span className="text-sm" style={{ color: brandColor }}>Competition:</span>
          <Select value={selectedLeagueFilter} onValueChange={setSelectedLeagueFilter}>
            <SelectTrigger className="w-auto min-w-[160px] h-8 text-sm border-gray-200 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent className="dark:bg-neutral-800 dark:border-neutral-700">
              <SelectItem value="all" className="dark:text-white dark:focus:bg-neutral-700">All Competitions</SelectItem>
              {Array.from(new Set(playerMatches.map(m => m.league_id))).filter(Boolean).map(leagueId => (
                <SelectItem key={leagueId} value={leagueId} className="dark:text-white dark:focus:bg-neutral-700">
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
          <div className="p-6 md:p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            No game statistics found for this player{selectedLeagueFilter !== "all" ? " in the selected competition" : ""}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-neutral-800 text-slate-400 dark:text-slate-500 uppercase text-[10px] tracking-wider">
                  <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">Date</th>
                  <th className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">OPP</th>
                  <th className="px-2 py-1.5 text-center font-semibold">MIN</th>
                  <th className="px-2 py-1.5 text-center font-semibold">FG</th>
                  <th className="px-2 py-1.5 text-center font-semibold">3PT</th>
                  <th className="px-2 py-1.5 text-center font-semibold">FT</th>
                  <th className="px-2 py-1.5 text-center font-semibold">REB</th>
                  <th className="px-2 py-1.5 text-center font-semibold">AST</th>
                  <th className="px-2 py-1.5 text-center font-semibold">STL</th>
                  <th className="px-2 py-1.5 text-center font-semibold">BLK</th>
                  <th className="px-2 py-1.5 text-center font-semibold">TO</th>
                  <th className="px-2 py-1.5 text-center font-semibold">PTS</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((game, index) => {
                  const opponentName = (game.opponent && game.opponent.trim()) || 'TBD';
                  return (
                    <tr
                      key={game.id}
                      className={`border-b border-gray-50 dark:border-neutral-800/50 text-slate-700 dark:text-slate-300 ${
                        index % 2 === 1 ? 'bg-gray-50/50 dark:bg-neutral-800/30' : ''
                      }`}
                    >
                      <td className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{formatDate(game.game_date || game.created_at)}</td>
                      <td className="px-2 py-1.5 text-xs font-medium whitespace-nowrap">{opponentName}</td>
                      <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sminutes || '—'}</td>
                      <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sfieldgoalsmade || 0}-{game.sfieldgoalsattempted || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sthreepointersmade || 0}-{game.sthreepointersattempted || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center whitespace-nowrap">{game.sfreethrowsmade || 0}-{game.sfreethrowsattempted || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center">{game.sreboundstotal || game.rebounds_total || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center">{game.sassists || game.assists || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center">{game.ssteals || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center">{game.sblocks || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center">{game.sturnovers || game.turnovers || 0}</td>
                      <td className="px-2 py-1.5 text-xs text-center font-bold text-slate-900 dark:text-white">{game.spoints || game.points || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}