import React, { useState, useEffect } from "react";
import { X, Calendar, Users, Trophy, TrendingUp, Clock, Target, Bot, Sparkles, Zap, Activity, MapPin } from "lucide-react";
import { supabase, getSupabaseForLeague } from "@/lib/supabase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TeamLogo } from "./TeamLogo";
import { extractColorsFromImage, TeamColors, adjustOpacity } from "@/lib/colorExtractor";
import { generatePlayCaption } from "@/utils/generatePlayCaption";
import ShotChart, { type ShotData } from "./ShotChart";

interface PlayerGameStats {
  id: string;
  firstname: string;
  familyname: string;
  team: string;
  number?: number;
  sminutes?: string;
  spoints: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sfieldgoalspercentage?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sthreepointerspercentage?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sfreethrowspercentage?: number;
  sreboundstotal: number;
  rebounds_o?: number;
  rebounds_d?: number;
  sassists: number;
  ssteals?: number;
  sblocks?: number;
  sturnovers?: number;
  personal_fouls?: number;
  splusminuspoints?: number;
}

interface LiveEvent {
  id: number;
  league_id: string;
  game_key: string;
  team_id: string;
  action_number: number;
  period: number;
  clock: string;
  player_name: string;
  team_no: number;
  action_type: string;
  sub_type: string;
  qualifiers: string[];
  success: boolean;
  scoring: boolean;
  score: string;
  x_coord: number;
  y_coord: number;
  created_at: string;
  player_id: string;
  assist_player_id: string;
  points: number;
  description: string;
}

interface GameDetailModalProps {
  gameId: string;
  isOpen: boolean;
  onClose: () => void;
}


export default function GameDetailModal({ gameId, isOpen, onClose }: GameDetailModalProps) {
  const [gameStats, setGameStats] = useState<PlayerGameStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [gameInfo, setGameInfo] = useState<{
    date: string;
    teams: string[];
    teamScores: Record<string, number>;
  } | null>(null);
  const [teamStatsFromDb, setTeamStatsFromDb] = useState<any[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  
  // New state for tabs
  const [activeTab, setActiveTab] = useState("summary");
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [shotChartShots, setShotChartShots] = useState<ShotData[]>([]);
  const [shotChartLoading, setShotChartLoading] = useState(false);
  
  // Shot chart filters
  const [quarterFilter, setQuarterFilter] = useState<string>("all");
  
  // Team branding colors
  const [teamColors, setTeamColors] = useState<Record<string, TeamColors>>({});
  const [leagueId, setLeagueId] = useState<string | null>(null);

  useEffect(() => {
    const fetchGameDetails = async () => {
      if (!gameId || !isOpen) return;
      
      setLoading(true);
      setTeamStatsFromDb([]);
      
      try {
        const isGameKey = /^[A-Z0-9]{12,}$/.test(gameId) || gameId.startsWith('PDF_');
        
        let teamsInfo: { [key: string]: number } = {};
        let gameDate = new Date().toISOString();
        
        // Try v_game_detail view first for team-level data
        const gameDetailQuery = isGameKey
          ? supabase.from("v_game_detail").select("*").eq("game_key", gameId).limit(1).maybeSingle()
          : supabase.from("team_stats").select("*").eq("numeric_id", gameId);
        
        const { data: gameDetail, error: detailError } = await gameDetailQuery;
        
        if (gameDetail && !detailError) {
          if (Array.isArray(gameDetail)) {
            // Legacy numeric_id path — got team_stats rows
            setTeamStatsFromDb(gameDetail);
            gameDetail.forEach((teamStat: any) => {
              if (teamStat.name) {
                teamsInfo[teamStat.name] = teamStat.tot_spoints || 0;
              }
            });
            gameDate = gameDetail[0]?.created_at || gameDate;
            if (gameDetail[0]?.league_id) setLeagueId(gameDetail[0].league_id);
          } else {
            // v_game_detail view — single row with both teams
            const detail = gameDetail as any;
            if (detail.league_id) setLeagueId(detail.league_id);
            gameDate = detail.match_time || gameDate;
            
            if (detail.home_team) teamsInfo[detail.home_team] = detail.home_score || 0;
            if (detail.away_team) teamsInfo[detail.away_team] = detail.away_score || 0;
            
            // Build team_stats-like data for downstream use
            const fakeTeamStats = [];
            if (detail.home_team) {
              fakeTeamStats.push({
                name: detail.home_team, tot_spoints: detail.home_score,
                p1_score: detail.home_q1, p2_score: detail.home_q2, p3_score: detail.home_q3, p4_score: detail.home_q4,
                tot_sfieldgoalsmade: detail.home_fgm, tot_sfieldgoalsattempted: detail.home_fga, tot_sfieldgoalspercentage: detail.home_fg_pct,
                tot_sthreepointersmade: detail.home_3pm, tot_sthreepointersattempted: detail.home_3pa, tot_sthreepointerspercentage: detail.home_3p_pct,
                tot_sfreethrowsmade: detail.home_ftm, tot_sfreethrowsattempted: detail.home_fta, tot_sfreethrowspercentage: detail.home_ft_pct,
                tot_sreboundstotal: detail.home_reb, tot_sreboundsoffensive: detail.home_oreb, tot_sreboundsdefensive: detail.home_dreb,
                tot_sassists: detail.home_ast, tot_sturnovers: detail.home_tov, tot_ssteals: detail.home_stl,
                tot_sblocks: detail.home_blk, tot_sfoulspersonal: detail.home_pf,
                tot_spointsfromturnovers: detail.home_pts_off_tov, tot_spointssecondchance: detail.home_second_chance_pts,
                tot_spointsfastbreak: detail.home_fastbreak_pts, tot_sbenchpoints: detail.home_bench_pts,
                tot_spointsinthepaint: detail.home_pitp, tot_sbiggestlead: detail.home_biggest_lead,
                efg_percent: detail.home_efg_pct, ts_percent: detail.home_ts_pct,
                pace: detail.home_pace, off_rating: detail.home_off_rtg, def_rating: detail.home_def_rtg, net_rating: detail.home_net_rtg,
                coach: detail.home_coach, league_id: detail.league_id, game_key: detail.game_key,
              });
            }
            if (detail.away_team) {
              fakeTeamStats.push({
                name: detail.away_team, tot_spoints: detail.away_score,
                p1_score: detail.away_q1, p2_score: detail.away_q2, p3_score: detail.away_q3, p4_score: detail.away_q4,
                tot_sfieldgoalsmade: detail.away_fgm, tot_sfieldgoalsattempted: detail.away_fga, tot_sfieldgoalspercentage: detail.away_fg_pct,
                tot_sthreepointersmade: detail.away_3pm, tot_sthreepointersattempted: detail.away_3pa, tot_sthreepointerspercentage: detail.away_3p_pct,
                tot_sfreethrowsmade: detail.away_ftm, tot_sfreethrowsattempted: detail.away_fta, tot_sfreethrowspercentage: detail.away_ft_pct,
                tot_sreboundstotal: detail.away_reb, tot_sreboundsoffensive: detail.away_oreb, tot_sreboundsdefensive: detail.away_dreb,
                tot_sassists: detail.away_ast, tot_sturnovers: detail.away_tov, tot_ssteals: detail.away_stl,
                tot_sblocks: detail.away_blk, tot_sfoulspersonal: detail.away_pf,
                tot_spointsfromturnovers: detail.away_pts_off_tov, tot_spointssecondchance: detail.away_second_chance_pts,
                tot_spointsfastbreak: detail.away_fastbreak_pts, tot_sbenchpoints: detail.away_bench_pts,
                tot_spointsinthepaint: detail.away_pitp, tot_sbiggestlead: detail.away_biggest_lead,
                efg_percent: detail.away_efg_pct, ts_percent: detail.away_ts_pct,
                pace: detail.away_pace, off_rating: detail.away_off_rtg, def_rating: detail.away_def_rtg, net_rating: detail.away_net_rtg,
                coach: detail.away_coach, league_id: detail.league_id, game_key: detail.game_key,
              });
            }
            setTeamStatsFromDb(fakeTeamStats);
          }
        }
        
        // Fetch player box scores — try v_box_score view first, fallback to player_stats
        let boxScoreQuery = supabase.from("v_box_score").select("*");
        if (isGameKey) {
          boxScoreQuery = boxScoreQuery.eq("game_key", gameId);
        } else {
          boxScoreQuery = boxScoreQuery.eq("numeric_id", gameId);
        }
        
        let { data: boxStats, error: boxError } = await boxScoreQuery.order("points", { ascending: false });
        
        // Fallback to player_stats if v_box_score doesn't exist yet
        if (boxError) {
          let statsQuery = supabase.from("player_stats").select("*, players:player_id(full_name)");
          if (isGameKey) {
            statsQuery = statsQuery.eq("game_key", gameId);
          } else {
            statsQuery = statsQuery.eq("numeric_id", gameId);
          }
          const { data: fallbackStats, error: fallbackError } = await statsQuery.order("spoints", { ascending: false });
          if (!fallbackError && fallbackStats) {
            boxStats = fallbackStats.map((stat: any) => ({
              ...stat,
              player_name: stat.full_name || stat.players?.full_name || stat.name ||
                `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 'Unknown Player',
              team_name: stat.team_name || stat.team || 'Unknown Team',
              points: stat.spoints || 0,
              assists: stat.sassists || 0,
              rebounds: stat.sreboundstotal || 0,
              steals: stat.ssteals || 0,
              blocks: stat.sblocks || 0,
              turnovers: stat.sturnovers || 0,
              fouls: stat.sfoulspersonal || 0,
              plus_minus: stat.splusminuspoints,
              minutes: stat.sminutes,
              fgm: stat.sfieldgoalsmade,
              fga: stat.sfieldgoalsattempted,
              fg_pct: stat.sfieldgoalspercentage,
              three_pm: stat.sthreepointersmade,
              three_pa: stat.sthreepointersattempted,
              three_p_pct: stat.sthreepointerspercentage,
              ftm: stat.sfreethrowsmade,
              fta: stat.sfreethrowsattempted,
              ft_pct: stat.sfreethrowspercentage,
            }));
          }
        }

        if (boxStats && boxStats.length > 0) {
          const processedStats = boxStats.map((stat: any) => ({
            ...stat,
            firstname: stat.player_name || `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 'Unknown Player',
            familyname: '',
            team: stat.team_name || stat.team || 'Unknown Team',
            spoints: stat.points ?? stat.spoints ?? 0,
            sassists: stat.assists ?? stat.sassists ?? 0,
            sreboundstotal: stat.rebounds ?? stat.sreboundstotal ?? 0,
            ssteals: stat.steals ?? stat.ssteals ?? 0,
            sblocks: stat.blocks ?? stat.sblocks ?? 0,
            sturnovers: stat.turnovers ?? stat.sturnovers ?? 0,
            sfoulspersonal: stat.fouls ?? stat.sfoulspersonal ?? 0,
            splusminuspoints: stat.plus_minus ?? stat.splusminuspoints,
            sminutes: stat.minutes ?? stat.sminutes,
            sfieldgoalsmade: stat.fgm ?? stat.sfieldgoalsmade,
            sfieldgoalsattempted: stat.fga ?? stat.sfieldgoalsattempted,
            sfieldgoalspercentage: stat.fg_pct ?? stat.sfieldgoalspercentage,
            sthreepointersmade: stat.three_pm ?? stat.sthreepointersmade,
            sthreepointersattempted: stat.three_pa ?? stat.sthreepointersattempted,
            sthreepointerspercentage: stat.three_p_pct ?? stat.sthreepointerspercentage,
            sfreethrowsmade: stat.ftm ?? stat.sfreethrowsmade,
            sfreethrowsattempted: stat.fta ?? stat.sfreethrowsattempted,
            sfreethrowspercentage: stat.ft_pct ?? stat.sfreethrowspercentage,
          }));
          
          const teamsFromStats = Array.from(new Set(processedStats.map((stat: any) => stat.team).filter(Boolean)));
          
          if (teamsFromStats.length > 0) {
            const updatedTeamsInfo = { ...teamsInfo };
            teamsFromStats.forEach(team => {
              if (!updatedTeamsInfo[team]) {
                const teamScore = processedStats
                  .filter((stat: any) => stat.team === team)
                  .reduce((sum: number, stat: any) => sum + (stat.spoints || 0), 0);
                updatedTeamsInfo[team] = teamScore;
              }
            });
            
            setGameInfo({
              date: gameDate,
              teams: teamsFromStats,
              teamScores: updatedTeamsInfo,
            });
            
            if (teamsFromStats.length > 0 && !selectedTeam) {
              setSelectedTeam(teamsFromStats[0]);
            }
          }
          
          setGameStats(processedStats);
        }
      } catch (error) {
        console.error("Error processing game details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGameDetails();
  }, [gameId, isOpen]);

  const fetchAISummary = async () => {
    if (!gameId) return;
    
    setSummaryLoading(true);
    
    try {
      // Convert game_id format to ref_id format
      // game_id: "2025-07-11_CRI_vs_FRE" 
      // ref_id: "crickhowell_elite_freeball_2025-07-11"
      
      // First try direct match with ref_id
      let existingSummary = null;
      let fetchError = null;
      
      // Try to find summary by ref_id using pattern matching
      const { data: summaries, error } = await supabase
        .from('summaries')
        .select('*')
        .eq('summary_type', 'game');

      if (error) {
        fetchError = error;
        console.error('Error fetching summaries:', error);
      } else if (summaries && summaries.length > 0) {
        
        // Extract date and teams from gameId (format: "2025-07-11_CRI_vs_FRE")
        const parts = gameId.split('_');
        const datePart = parts[0]; // "2025-07-11"
        const team1Code = parts[1]; // "CRI"  
        const team3Code = parts[3]; // "FRE"
        
        
        // Debug: show what we're looking for vs what's available
        const availableGamesOnDate = summaries.filter(s => s.ref_id && s.ref_id.includes(datePart));
        
        // Find summary that matches the date and potentially team codes
        existingSummary = summaries.find(summary => {
          if (!summary.ref_id || !summary.ref_id.includes(datePart)) return false;
          
          // Check if ref_id contains patterns matching team codes
          const refId = summary.ref_id.toLowerCase();
          const cri = team1Code.toLowerCase();
          const fre = team3Code.toLowerCase();
          
          // Map common team code patterns based on the actual data
          const teamMappings: Record<string, string> = {
            'cri': 'crickhowell',
            'fre': 'freeball', 
            'bri': 'bristol',
            'glo': 'gloucester',
            'daw': 'dawgs',
            'emp': 'empees',
            'jus': 'just_us'
          };
          
          const team1Name = teamMappings[cri] || cri;
          const team2Name = teamMappings[fre] || fre;
          
          // Both teams must be in the ref_id for a valid match
          return refId.includes(team1Name) && refId.includes(team2Name);
        });
        
        if (existingSummary) {
        } else {
        }
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching summary:', fetchError);
        // Continue to fallback instead of returning
      }

      if (existingSummary && !fetchError) {
        // Get the summary content from the database
        const summaryText = existingSummary.content || 
                           'Game summary found but content is empty.';
        
        // Add delay for AI effect even if summary exists
        setTimeout(() => {
          setAiSummary(summaryText);
          setShowSummary(true);
          setSummaryLoading(false);
        }, 1500);
      } else {
        // No summary found
        setTimeout(() => {
          setAiSummary("No AI game summary available for this game yet. Summaries are generated after game completion and may take some time to appear.");
          setShowSummary(true);
          setSummaryLoading(false);
        }, 1500);
      }
    } catch (error) {
      console.error('Error with AI summary:', error);
      setTimeout(() => {
        setAiSummary("Unable to load AI summary at this time. Please try again later.");
        setShowSummary(true);
        setSummaryLoading(false);
      }, 1000);
    }
  };

  // Lazy load live events for Feed tab and shot chart for Shot Chart tab
  const fetchLiveEvents = async () => {
    if (eventsLoaded || !gameId) return;
    
    setEventsLoading(true);
    setShotChartLoading(true);
    try {
      // First, get the game_key from player_stats using numeric_id
      const { data: gameData, error: gameError } = await supabase
        .from("player_stats")
        .select("game_key")
        .eq("numeric_id", gameId)
        .limit(1)
        .single();
      
      if (gameError || !gameData?.game_key) {
        console.error("Error fetching game_key:", gameError);
        setEventsLoaded(true);
        setEventsLoading(false);
        setShotChartLoading(false);
        return;
      }
      
      const gameKey = gameData.game_key;
      
      // Fetch live_events for play-by-play feed
      const { data: events, error } = await supabase
        .from("live_events")
        .select("*")
        .eq("game_key", gameKey)
        .order("action_number", { ascending: true });
      
      if (error) {
        console.error("Error fetching live events:", error);
      } else if (events) {
        setLiveEvents(events);
        setEventsLoaded(true);
      }

      // Fetch shot chart data from shot_chart table
      const { data: shots, error: shotsError } = await supabase
        .from("shot_chart")
        .select("id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key")
        .eq("game_key", gameKey);

      if (shotsError) {
        console.error("Error fetching shot chart:", shotsError);
      } else {
        setShotChartShots((shots || []) as ShotData[]);
      }
    } catch (error) {
      console.error("Error loading live events:", error);
    } finally {
      setEventsLoading(false);
      setShotChartLoading(false);
    }
  };

  // Reset events and team colors when gameId changes
  useEffect(() => {
    setEventsLoaded(false);
    setLiveEvents([]);
    setShotChartShots([]);
    setShotChartLoading(false);
    setTeamColors({}); // Clear colors to prevent showing stale branding
  }, [gameId]);

  // Load events when Feed or Shot Chart tab is activated, or when gameId changes while on those tabs
  useEffect(() => {
    if ((activeTab === "feed" || activeTab === "shotchart") && !eventsLoaded && gameId) {
      fetchLiveEvents();
    }
  }, [activeTab, eventsLoaded, gameId]);

  // Extract team colors from logos with caching
  useEffect(() => {
    const extractTeamColors = async () => {
      if (!gameInfo?.teams || !leagueId) return;
      
      const colors: Record<string, TeamColors> = {};
      const CACHE_KEY = 'team_colors_cache';
      const CACHE_VERSION = '2'; // Increment when color extraction changes
      
      // Try to load from cache
      let cache: Record<string, { colors: TeamColors; timestamp: number; version: string }> = {};
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          cache = JSON.parse(cached);
        }
      } catch (error) {
        console.warn("Failed to load color cache:", error);
      }
      
      for (const teamName of gameInfo.teams) {
        const cacheKey = `${leagueId}_${teamName}`;
        const cachedEntry = cache[cacheKey];
        
        // Use cached color if valid (less than 7 days old and same version)
        if (cachedEntry && 
            cachedEntry.version === CACHE_VERSION &&
            Date.now() - cachedEntry.timestamp < 7 * 24 * 60 * 60 * 1000) {
          colors[teamName] = cachedEntry.colors;
          continue;
        }
        
        // Extract colors from logo
        const teamNameNormalized = teamName.replace(/\s+/g, '_');
        const possibleFilenames = [
          `${leagueId}_${teamNameNormalized}.png`,
          `${leagueId}_${teamNameNormalized}.jpg`,
          `${leagueId}_${teamNameNormalized}_Senior_Men.png`,
        ];
        
        for (const filename of possibleFilenames) {
          const logoUrl = `https://omkwqpcgttrgvbhcxgqf.supabase.co/storage/v1/object/public/team-logos/${filename}`;
          const extractedColors = await extractColorsFromImage(logoUrl);
          
          if (extractedColors) {
            colors[teamName] = extractedColors;
            // Cache the result
            cache[cacheKey] = {
              colors: extractedColors,
              timestamp: Date.now(),
              version: CACHE_VERSION,
            };
            break;
          }
        }
      }
      
      // Save updated cache
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (error) {
        console.warn("Failed to save color cache:", error);
      }
      
      // Always set teamColors (even if empty) to ensure clean state
      setTeamColors(colors);
      
      if (Object.keys(colors).length === 0) {
      } else {
      }
    };
    
    extractTeamColors();
  }, [gameInfo?.teams, leagueId]);

  if (!isOpen) return null;

  const teamStats = gameInfo?.teams.map(team => {
    const teamPlayers = gameStats.filter(stat => stat.team === team);
    const dbTeamStats = teamStatsFromDb.find(ts => ts.name === team);
    
    // Fallback: calculate from player stats if team stats not available
    const calcFgMade = teamPlayers.reduce((sum, p) => sum + (p.sfieldgoalsmade || 0), 0);
    const calcFgAttempted = teamPlayers.reduce((sum, p) => sum + (p.sfieldgoalsattempted || 0), 0);
    const calcThreeMade = teamPlayers.reduce((sum, p) => sum + (p.sthreepointersmade || 0), 0);
    const calcThreeAttempted = teamPlayers.reduce((sum, p) => sum + (p.sthreepointersattempted || 0), 0);
    const calcFtMade = teamPlayers.reduce((sum, p) => sum + (p.sfreethrowsmade || 0), 0);
    const calcFtAttempted = teamPlayers.reduce((sum, p) => sum + (p.sfreethrowsattempted || 0), 0);
    const calcSteals = teamPlayers.reduce((sum, p) => sum + (p.ssteals || 0), 0);
    const calcBlocks = teamPlayers.reduce((sum, p) => sum + (p.sblocks || 0), 0);
    
    return {
      name: team,
      score: gameInfo.teamScores[team],
      players: teamPlayers,
      totalFgMade: dbTeamStats?.tot_sfieldgoalsmade ?? calcFgMade,
      totalFgAttempted: dbTeamStats?.tot_sfieldgoalsattempted ?? calcFgAttempted,
      totalThreeMade: dbTeamStats?.tot_sthreepointersmade ?? calcThreeMade,
      totalThreeAttempted: dbTeamStats?.tot_sthreepointersattempted ?? calcThreeAttempted,
      totalFtMade: dbTeamStats?.tot_sfreethrowsmade ?? calcFtMade,
      totalFtAttempted: dbTeamStats?.tot_sfreethrowsattempted ?? calcFtAttempted,
      totalRebounds: dbTeamStats?.tot_sreboundstotal ?? teamPlayers.reduce((sum, p) => sum + (p.sreboundstotal || 0), 0),
      totalAssists: dbTeamStats?.tot_sassists ?? teamPlayers.reduce((sum, p) => sum + (p.sassists || 0), 0),
      totalSteals: dbTeamStats?.tot_ssteals ?? calcSteals,
      totalBlocks: dbTeamStats?.tot_sblocks ?? calcBlocks,
    };
  });

  const selectedTeamStats = teamStats?.find(team => team.name === selectedTeam);
  
  // Compute team colors for stat bars (before JSX)
  const team1Color = teamStats && teamStats.length >= 1 && teamStats[0]?.name ? 
    (teamColors[teamStats[0].name]?.primary || 'rgb(251, 146, 60)') : 'rgb(251, 146, 60)';
  const team2Color = teamStats && teamStats.length >= 2 && teamStats[1]?.name ?
    (teamColors[teamStats[1].name]?.primary || 'rgb(59, 130, 246)') : 'rgb(59, 130, 246)';
  const selectedTeamPlayers = selectedTeamStats?.players || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl max-w-full md:max-w-4xl lg:max-w-6xl w-full max-h-[95vh] md:max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between p-4 md:p-6 border-b border-gray-200 dark:border-neutral-700 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-neutral-800 dark:to-neutral-800 gap-3 md:gap-0">
          <div className="flex-1">
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">Game Details</h2>
            {gameInfo && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-2 text-xs md:text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                  {new Date(gameInfo.date).toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Trophy className="w-3 h-3 md:w-4 md:h-4" />
                  {gameInfo.teams.map((team, index) => (
                    <span key={team} className="font-medium">
                      {team} {gameInfo.teamScores[team]}
                      {index < gameInfo.teams.length - 1 && <span className="mx-2 text-orange-500">vs</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 md:static p-2 hover:bg-orange-200 dark:hover:bg-neutral-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5 md:w-6 md:h-6 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(95vh-140px)] md:max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="p-6 md:p-8 text-center">
              <div className="animate-spin rounded-full h-10 w-10 md:h-12 md:w-12 border-b-2 border-orange-500 mx-auto"></div>
              <p className="mt-4 text-sm md:text-base text-slate-600 dark:text-slate-400">Loading game details...</p>
            </div>
          ) : (
            <div className="p-4 md:p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                {/* Mobile-optimized TabsList */}
                <TabsList className="w-full flex flex-nowrap overflow-x-auto scrollbar-none bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700 sticky top-0 z-20 rounded-none h-auto p-0 justify-start">
                  <TabsTrigger 
                    value="summary" 
                    className="flex-shrink-0 px-4 md:px-6 py-3 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:text-orange-600"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Summary</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="boxscore" 
                    className="flex-shrink-0 px-4 md:px-6 py-3 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:text-orange-600"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Box Score</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="feed" 
                    className="flex-shrink-0 px-4 md:px-6 py-3 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:text-orange-600"
                  >
                    <Activity className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Feed</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="shotchart" 
                    className="flex-shrink-0 px-4 md:px-6 py-3 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-500 data-[state=active]:text-orange-600"
                  >
                    <MapPin className="w-4 h-4 mr-2" />
                    <span className="text-sm font-medium">Shot Chart</span>
                  </TabsTrigger>
                </TabsList>

                {/* Summary Tab */}
                <TabsContent value="summary" className="mt-4 space-y-4">
                  {/* Final Score Summary */}
                  {gameInfo && (
                    <div className="grid grid-cols-2 gap-2 rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700">
                      {/* Team 1 */}
                      <div 
                        className="relative overflow-hidden p-4 md:p-6"
                        style={teamColors[gameInfo.teams[0]] ? {
                          background: `linear-gradient(135deg, ${adjustOpacity(teamColors[gameInfo.teams[0]].primaryRgb, 0.15)} 0%, ${adjustOpacity(teamColors[gameInfo.teams[0]].primaryRgb, 0.05)} 100%)`
                        } : {
                          background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.15) 0%, rgba(251, 146, 60, 0.05) 100%)'
                        }}
                      >
                        {leagueId && (
                          <div className="absolute inset-0 opacity-10 flex items-center justify-center">
                            <TeamLogo teamName={gameInfo.teams[0]} leagueId={leagueId} className="h-24 md:h-32 w-auto" />
                          </div>
                        )}
                        <div className="relative z-10 text-center">
                          <div className="text-sm md:text-base lg:text-lg font-semibold text-slate-800 dark:text-white truncate mb-1">
                            {gameInfo.teams[0]}
                          </div>
                          <div 
                            className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white"
                          >
                            {gameInfo.teamScores[gameInfo.teams[0]]}
                          </div>
                        </div>
                      </div>

                      {/* Team 2 */}
                      <div 
                        className="relative overflow-hidden p-4 md:p-6"
                        style={teamColors[gameInfo.teams[1]] ? {
                          background: `linear-gradient(135deg, ${adjustOpacity(teamColors[gameInfo.teams[1]].primaryRgb, 0.15)} 0%, ${adjustOpacity(teamColors[gameInfo.teams[1]].primaryRgb, 0.05)} 100%)`
                        } : {
                          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%)'
                        }}
                      >
                        {leagueId && (
                          <div className="absolute inset-0 opacity-10 flex items-center justify-center">
                            <TeamLogo teamName={gameInfo.teams[1]} leagueId={leagueId} className="h-24 md:h-32 w-auto" />
                          </div>
                        )}
                        <div className="relative z-10 text-center">
                          <div className="text-sm md:text-base lg:text-lg font-semibold text-slate-800 dark:text-white truncate mb-1">
                            {gameInfo.teams[1]}
                          </div>
                          <div 
                            className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white"
                          >
                            {gameInfo.teamScores[gameInfo.teams[1]]}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Performers */}
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-gray-200 dark:border-neutral-700">
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-orange-500" />
                      Top Performers
                    </h3>
                    <div className="space-y-3">
                      {gameStats
                        .sort((a, b) => (b.spoints || 0) - (a.spoints || 0))
                        .slice(0, 3)
                        .map((player, index) => {
                          const playerTeamColor = teamColors[player.team];
                          const fgPercentage = (player.sfieldgoalsattempted || 0) > 0 
                            ? Number(((player.sfieldgoalsmade || 0) / (player.sfieldgoalsattempted || 0) * 100)).toFixed(1)
                            : '0.0';
                          
                          return (
                            <div 
                              key={player.id} 
                              className="relative overflow-hidden rounded-lg p-4 border-2"
                              style={playerTeamColor ? {
                                background: `linear-gradient(135deg, ${adjustOpacity(playerTeamColor.primaryRgb, 0.12)} 0%, ${adjustOpacity(playerTeamColor.primaryRgb, 0.04)} 100%)`,
                                borderColor: adjustOpacity(playerTeamColor.primaryRgb, 0.3)
                              } : {
                                background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.12) 0%, rgba(251, 146, 60, 0.04) 100%)',
                                borderColor: 'rgba(251, 146, 60, 0.3)'
                              }}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${
                                      index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-orange-600'
                                    }`}
                                  >
                                    {index + 1}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-slate-800 dark:text-white">{player.firstname} {player.familyname}</div>
                                    <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">{player.team}</div>
                                  </div>
                                </div>
                                <div className="flex gap-3 text-sm">
                                  <div className="text-center">
                                    <div 
                                      className="text-lg font-bold"
                                      style={playerTeamColor ? {
                                        color: playerTeamColor.primary
                                      } : {
                                        color: 'rgb(251, 146, 60)'
                                      }}
                                    >
                                      {player.spoints ?? 0}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">PTS</div>
                                  </div>
                                  <div className="text-center">
                                    <div 
                                      className="text-lg font-bold"
                                      style={playerTeamColor ? {
                                        color: playerTeamColor.primary
                                      } : {
                                        color: 'rgb(251, 146, 60)'
                                      }}
                                    >
                                      {player.sreboundstotal ?? 0}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">REB</div>
                                  </div>
                                  <div className="text-center">
                                    <div 
                                      className="text-lg font-bold"
                                      style={playerTeamColor ? {
                                        color: playerTeamColor.primary
                                      } : {
                                        color: 'rgb(251, 146, 60)'
                                      }}
                                    >
                                      {player.sassists ?? 0}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">AST</div>
                                  </div>
                                  <div className="text-center">
                                    <div 
                                      className="text-lg font-bold"
                                      style={playerTeamColor ? {
                                        color: playerTeamColor.primary
                                      } : {
                                        color: 'rgb(251, 146, 60)'
                                      }}
                                    >
                                      {fgPercentage}%
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">FG%</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Team Stats Comparison */}
                  {teamStats && teamStats.length === 2 && (
                    <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-gray-200 dark:border-neutral-700">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-3">Team Stats Comparison</h3>
                      <div className="space-y-3">
                        {/* FG% */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[0].name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">FG%</span>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[1].name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-12 text-right" style={{ color: team1Color }}>
                              {teamStats[0].totalFgAttempted > 0 ? ((teamStats[0].totalFgMade / teamStats[0].totalFgAttempted) * 100).toFixed(1) : 0}%
                            </span>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full"
                                style={{ 
                                  width: `${teamStats[0].totalFgAttempted > 0 ? (teamStats[0].totalFgMade / teamStats[0].totalFgAttempted) * 100 : 0}%`,
                                  background: `linear-gradient(to right, ${team1Color}, ${team1Color})`
                                }}
                              />
                            </div>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full float-right"
                                style={{ 
                                  width: `${teamStats[1].totalFgAttempted > 0 ? (teamStats[1].totalFgMade / teamStats[1].totalFgAttempted) * 100 : 0}%`,
                                  background: `linear-gradient(to right, ${team2Color}, ${team2Color})`
                                }}
                              />
                            </div>
                            <span className="text-sm font-semibold w-12" style={{ color: team2Color }}>
                              {teamStats[1].totalFgAttempted > 0 ? ((teamStats[1].totalFgMade / teamStats[1].totalFgAttempted) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        </div>

                        {/* 3P% */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[0].name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">3P%</span>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[1].name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-12 text-right" style={{ color: team1Color }}>
                              {teamStats[0].totalThreeAttempted > 0 ? ((teamStats[0].totalThreeMade / teamStats[0].totalThreeAttempted) * 100).toFixed(1) : 0}%
                            </span>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full"
                                style={{ 
                                  width: `${teamStats[0].totalThreeAttempted > 0 ? (teamStats[0].totalThreeMade / teamStats[0].totalThreeAttempted) * 100 : 0}%`,
                                  background: `linear-gradient(to right, ${team1Color}, ${team1Color})`
                                }}
                              />
                            </div>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full float-right"
                                style={{ 
                                  width: `${teamStats[1].totalThreeAttempted > 0 ? (teamStats[1].totalThreeMade / teamStats[1].totalThreeAttempted) * 100 : 0}%`,
                                  background: `linear-gradient(to right, ${team2Color}, ${team2Color})`
                                }}
                              />
                            </div>
                            <span className="text-sm font-semibold w-12" style={{ color: team2Color }}>
                              {teamStats[1].totalThreeAttempted > 0 ? ((teamStats[1].totalThreeMade / teamStats[1].totalThreeAttempted) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        </div>

                        {/* FT% */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[0].name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">FT%</span>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[1].name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-12 text-right" style={{ color: team1Color }}>
                              {teamStats[0].totalFtAttempted > 0 ? ((teamStats[0].totalFtMade / teamStats[0].totalFtAttempted) * 100).toFixed(1) : 0}%
                            </span>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full"
                                style={{ 
                                  width: `${teamStats[0].totalFtAttempted > 0 ? (teamStats[0].totalFtMade / teamStats[0].totalFtAttempted) * 100 : 0}%`,
                                  background: `linear-gradient(to right, ${team1Color}, ${team1Color})`
                                }}
                              />
                            </div>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full float-right"
                                style={{ 
                                  width: `${teamStats[1].totalFtAttempted > 0 ? (teamStats[1].totalFtMade / teamStats[1].totalFtAttempted) * 100 : 0}%`,
                                  background: `linear-gradient(to right, ${team2Color}, ${team2Color})`
                                }}
                              />
                            </div>
                            <span className="text-sm font-semibold w-12" style={{ color: team2Color }}>
                              {teamStats[1].totalFtAttempted > 0 ? ((teamStats[1].totalFtMade / teamStats[1].totalFtAttempted) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        </div>

                        {/* Rebounds */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[0].name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Rebounds</span>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[1].name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-12 text-right" style={{ color: team1Color }}>{teamStats[0].totalRebounds}</span>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full"
                                style={{ 
                                  width: `${(teamStats[0].totalRebounds / (teamStats[0].totalRebounds + teamStats[1].totalRebounds)) * 100}%`,
                                  background: `linear-gradient(to right, ${team1Color}, ${team1Color})`
                                }}
                              />
                            </div>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full float-right"
                                style={{ 
                                  width: `${(teamStats[1].totalRebounds / (teamStats[0].totalRebounds + teamStats[1].totalRebounds)) * 100}%`,
                                  background: `linear-gradient(to right, ${team2Color}, ${team2Color})`
                                }}
                              />
                            </div>
                            <span className="text-sm font-semibold w-12" style={{ color: team2Color }}>{teamStats[1].totalRebounds}</span>
                          </div>
                        </div>

                        {/* Assists */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[0].name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">Assists</span>
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{teamStats[1].name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold w-12 text-right" style={{ color: team1Color }}>{teamStats[0].totalAssists}</span>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full"
                                style={{ 
                                  width: `${(teamStats[0].totalAssists / (teamStats[0].totalAssists + teamStats[1].totalAssists)) * 100}%`,
                                  background: `linear-gradient(to right, ${team1Color}, ${team1Color})`
                                }}
                              />
                            </div>
                            <div className="flex-1 h-2 bg-gray-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full float-right"
                                style={{ 
                                  width: `${(teamStats[1].totalAssists / (teamStats[0].totalAssists + teamStats[1].totalAssists)) * 100}%`,
                                  background: `linear-gradient(to right, ${team2Color}, ${team2Color})`
                                }}
                              />
                            </div>
                            <span className="text-sm font-semibold w-12" style={{ color: team2Color }}>{teamStats[1].totalAssists}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Box Score Tab */}
                <TabsContent value="boxscore" className="mt-4 space-y-4">
                  {/* Team Filter Buttons */}
                  {gameInfo && (
                    <div className="flex flex-col sm:flex-row justify-center gap-2 -mx-4 md:mx-0 overflow-x-auto px-4 md:px-0">
                      {gameInfo.teams.map((team) => {
                        const teamColor = teamColors[team];
                        return (
                          <button
                            key={team}
                            onClick={() => setSelectedTeam(team)}
                            className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${
                              selectedTeam === team
                                ? 'text-white shadow-md'
                                : 'bg-white dark:bg-neutral-800 text-slate-700 dark:text-slate-300 hover:opacity-90'
                            }`}
                            style={selectedTeam === team ? (teamColor ? {
                              backgroundColor: teamColor.primary,
                            } : {
                              backgroundColor: 'rgb(249, 115, 22)'
                            }) : (teamColor ? {
                              borderColor: adjustOpacity(teamColor.primaryRgb, 0.3),
                              borderWidth: '1px',
                              borderStyle: 'solid'
                            } : {
                              borderColor: 'rgba(251, 146, 60, 0.3)',
                              borderWidth: '1px',
                              borderStyle: 'solid'
                            })}
                          >
                            {team} Box Score
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Selected Team Summary */}
                  {selectedTeamStats && (
                    <div 
                      className="rounded-lg overflow-hidden"
                      style={teamColors[selectedTeamStats.name] ? {
                        background: `linear-gradient(135deg, ${adjustOpacity(teamColors[selectedTeamStats.name].primaryRgb, 0.1)} 0%, ${adjustOpacity(teamColors[selectedTeamStats.name].primaryRgb, 0.05)} 100%)`,
                        borderColor: adjustOpacity(teamColors[selectedTeamStats.name].primaryRgb, 0.3),
                        borderWidth: '1px',
                        borderStyle: 'solid'
                      } : {
                        background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.1) 0%, rgba(251, 146, 60, 0.05) 100%)',
                        borderColor: 'rgba(251, 146, 60, 0.3)',
                        borderWidth: '1px',
                        borderStyle: 'solid'
                      }}
                    >
                      {/* Team Header */}
                      <div 
                        className="flex items-center gap-3 md:gap-4 p-3 md:p-4 border-b"
                        style={teamColors[selectedTeamStats.name] ? {
                          borderColor: adjustOpacity(teamColors[selectedTeamStats.name].primaryRgb, 0.3)
                        } : {
                          borderColor: 'rgba(251, 146, 60, 0.3)'
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base md:text-xl font-bold text-slate-800 dark:text-white truncate">{selectedTeamStats.name}</h3>
                        </div>
                        <div 
                          className="text-2xl md:text-3xl font-bold shrink-0"
                          style={teamColors[selectedTeamStats.name] ? {
                            color: teamColors[selectedTeamStats.name].primary
                          } : {
                            color: 'rgb(249, 115, 22)'
                          }}
                        >
                          {selectedTeamStats.score}
                        </div>
                      </div>
                      
                      {/* Stats Container */}
                      <div className="overflow-x-auto">
                        <div className="flex md:grid md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 p-3 md:p-4 min-w-max md:min-w-0">
                          <div className="min-w-[140px] md:min-w-0">
                            <div className="text-slate-800 dark:text-slate-200 font-medium text-xs md:text-sm">Field Goals</div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm md:text-base">
                              {selectedTeamStats.totalFgMade}/{selectedTeamStats.totalFgAttempted} 
                              {selectedTeamStats.totalFgAttempted > 0 && (
                                <span className="text-slate-700 dark:text-slate-400 ml-1 text-xs">
                                  ({((selectedTeamStats.totalFgMade / selectedTeamStats.totalFgAttempted) * 100).toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="min-w-[140px] md:min-w-0">
                            <div className="text-slate-800 dark:text-slate-200 font-medium text-xs md:text-sm">3-Pointers</div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm md:text-base">
                              {selectedTeamStats.totalThreeMade}/{selectedTeamStats.totalThreeAttempted}
                              {selectedTeamStats.totalThreeAttempted > 0 && (
                                <span className="text-slate-700 dark:text-slate-400 ml-1 text-xs">
                                  ({((selectedTeamStats.totalThreeMade / selectedTeamStats.totalThreeAttempted) * 100).toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="min-w-[140px] md:min-w-0">
                            <div className="text-slate-800 dark:text-slate-200 font-medium text-xs md:text-sm">Free Throws</div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm md:text-base">
                              {selectedTeamStats.totalFtMade}/{selectedTeamStats.totalFtAttempted}
                              {selectedTeamStats.totalFtAttempted > 0 && (
                                <span className="text-slate-700 dark:text-slate-400 ml-1 text-xs">
                                  ({((selectedTeamStats.totalFtMade / selectedTeamStats.totalFtAttempted) * 100).toFixed(1)}%)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="min-w-[100px] md:min-w-0">
                            <div className="text-slate-800 dark:text-slate-200 font-medium text-xs md:text-sm">Rebounds</div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm md:text-base">{selectedTeamStats.totalRebounds}</div>
                          </div>
                          <div className="min-w-[100px] md:min-w-0">
                            <div className="text-slate-800 dark:text-slate-200 font-medium text-xs md:text-sm">Assists</div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm md:text-base">{selectedTeamStats.totalAssists}</div>
                          </div>
                          <div className="min-w-[100px] md:min-w-0">
                            <div className="text-slate-800 dark:text-slate-200 font-medium text-xs md:text-sm">Steals</div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm md:text-base">{selectedTeamStats.totalSteals}</div>
                          </div>
                          <div className="min-w-[100px] md:min-w-0">
                            <div className="text-slate-800 dark:text-slate-200 font-medium text-xs md:text-sm">Blocks</div>
                            <div className="font-semibold text-slate-900 dark:text-white text-sm md:text-base">{selectedTeamStats.totalBlocks}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Box Score Table for Selected Team */}
                  <div className="bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                    <div className="p-3 md:p-4 bg-gray-50 dark:bg-neutral-700 border-b border-gray-200 dark:border-neutral-600">
                      <h3 className="text-sm md:text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                        <Users className="w-4 h-4 md:w-5 md:h-5" />
                        {selectedTeam} Box Score
                      </h3>
                    </div>
                    <div className="overflow-x-auto -mx-4 md:mx-0 pr-4 md:pr-0">
                      <table className="w-full text-xs md:text-sm min-w-[800px]">
                        <thead className="bg-gray-50 dark:bg-neutral-700 border-b border-gray-200 dark:border-neutral-600">
                          <tr>
                            <th className="text-left py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200 sticky left-4 md:left-0 bg-gray-50 dark:bg-neutral-700 z-10 w-8 md:w-16 pl-2 pr-1">Player</th>
                            <th className="text-center py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200 pl-1 pr-1.5">MIN</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">PTS</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">FG</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">3P</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">FT</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">REB</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">AST</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">STL</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">BLK</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">TO</th>
                            <th className="text-center px-1.5 py-1.5 md:p-3 font-medium text-slate-700 dark:text-slate-200">+/-</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTeamPlayers.map((player, index) => {
                            const playerTeamColor = teamColors[player.team];
                            return (
                            <tr 
                              key={player.id} 
                              className="border-b transition-colors"
                              style={playerTeamColor ? {
                                backgroundColor: index % 2 === 0 ? adjustOpacity(playerTeamColor.primaryRgb, 0.04) : adjustOpacity(playerTeamColor.primaryRgb, 0.08),
                                borderColor: adjustOpacity(playerTeamColor.primaryRgb, 0.1)
                              } : {
                                backgroundColor: index % 2 === 0 ? 'rgba(251, 146, 60, 0.04)' : 'rgba(251, 146, 60, 0.08)',
                                borderColor: 'rgba(251, 146, 60, 0.1)'
                              }}
                              onMouseEnter={(e) => {
                                if (playerTeamColor) {
                                  e.currentTarget.style.backgroundColor = adjustOpacity(playerTeamColor.primaryRgb, 0.15);
                                } else {
                                  e.currentTarget.style.backgroundColor = 'rgba(251, 146, 60, 0.15)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (playerTeamColor) {
                                  e.currentTarget.style.backgroundColor = index % 2 === 0 ? adjustOpacity(playerTeamColor.primaryRgb, 0.04) : adjustOpacity(playerTeamColor.primaryRgb, 0.08);
                                } else {
                                  e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'rgba(251, 146, 60, 0.04)' : 'rgba(251, 146, 60, 0.08)';
                                }
                              }}
                            >
                              <td 
                                className="py-1.5 md:p-3 sticky left-4 md:left-0 z-20 w-28 md:w-32 pl-2 pr-1"
                                style={(() => {
                                  // Use solid colors for the sticky column to prevent text showing through
                                  const isDark = document.documentElement.classList.contains('dark');
                                  const baseColor = isDark ? { r: 38, g: 38, b: 38 } : { r: 255, g: 255, b: 255 }; // neutral-800 or white
                                  const teamRgb = playerTeamColor?.primaryRgb || { r: 251, g: 146, b: 60 };
                                  const opacity = index % 2 === 0 ? 0.06 : 0.12;
                                  // Blend team color with base
                                  const blendedR = Math.round(baseColor.r * (1 - opacity) + teamRgb.r * opacity);
                                  const blendedG = Math.round(baseColor.g * (1 - opacity) + teamRgb.g * opacity);
                                  const blendedB = Math.round(baseColor.b * (1 - opacity) + teamRgb.b * opacity);
                                  return { backgroundColor: `rgb(${blendedR}, ${blendedG}, ${blendedB})` };
                                })()}
                              >
                                <div className="max-w-none whitespace-normal">
                                  <div className="font-medium text-slate-800 dark:text-white">{player.firstname} {player.familyname}</div>
                                  {player.number && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400">#{player.number}</div>
                                  )}
                                </div>
                              </td>
                              <td className="py-1.5 md:p-3 text-center text-slate-800 dark:text-slate-200 pl-1 pr-1.5">
                                {player.sminutes ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span className="text-slate-800 dark:text-slate-200">{player.sminutes}</span>
                                  </div>
                                ) : <span className="text-slate-400">-</span>}
                              </td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center font-semibold text-orange-600 dark:text-orange-400">{player.spoints}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800 dark:text-slate-200">
                                {player.sfieldgoalsmade !== undefined && player.sfieldgoalsattempted !== undefined ? (
                                  <div>
                                    <div className="font-medium">{player.sfieldgoalsmade}/{player.sfieldgoalsattempted}</div>
                                    {player.sfieldgoalspercentage && (
                                      <div className="text-xs text-slate-500 dark:text-slate-400">{player.sfieldgoalspercentage}%</div>
                                    )}
                                  </div>
                                ) : <span className="text-slate-400">-</span>}
                              </td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800 dark:text-slate-200">
                                {player.sthreepointersmade !== undefined && player.sthreepointersattempted !== undefined ? (
                                  <div>
                                    <div className="font-medium">{player.sthreepointersmade}/{player.sthreepointersattempted}</div>
                                    {player.sthreepointerspercentage && (
                                      <div className="text-xs text-slate-500 dark:text-slate-400">{player.sthreepointerspercentage}%</div>
                                    )}
                                  </div>
                                ) : <span className="text-slate-400">-</span>}
                              </td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800 dark:text-slate-200">
                                {player.sfreethrowsmade !== undefined && player.sfreethrowsattempted !== undefined ? (
                                  <div>
                                    <div className="font-medium">{player.sfreethrowsmade}/{player.sfreethrowsattempted}</div>
                                    {player.sfreethrowspercentage && (
                                      <div className="text-xs text-slate-500 dark:text-slate-400">{player.sfreethrowspercentage}%</div>
                                    )}
                                  </div>
                                ) : <span className="text-slate-400">-</span>}
                              </td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center text-slate-800 dark:text-slate-200">
                                <div className="font-medium">{player.sreboundstotal}</div>
                                {(player.rebounds_o || player.rebounds_d) && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {player.rebounds_o || 0}O {player.rebounds_d || 0}D
                                  </div>
                                )}
                              </td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-slate-800 dark:text-slate-200">{player.sassists}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-slate-800 dark:text-slate-200">{player.ssteals || 0}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-slate-800 dark:text-slate-200">{player.sblocks || 0}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center font-medium text-red-600 dark:text-red-400">{player.sturnovers || 0}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">
                                {player.splusminuspoints !== undefined && player.splusminuspoints !== null ? (
                                  <span className={`font-medium ${player.splusminuspoints >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {player.splusminuspoints >= 0 ? '+' : ''}{player.splusminuspoints}
                                  </span>
                                ) : <span className="text-slate-400">-</span>}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                        
                        {/* Team Totals Row */}
                        {selectedTeamStats && (
                          <tfoot className="bg-orange-50 dark:bg-neutral-700 border-t-2 border-orange-200 dark:border-neutral-600">
                            <tr className="font-semibold text-slate-800 dark:text-white">
                              <td className="py-1.5 md:p-3 sticky left-4 md:left-0 bg-orange-50 dark:bg-neutral-700 z-10 w-48 md:w-52 pl-2 pr-1">TEAM TOTALS</td>
                              <td className="py-1.5 md:p-3 text-center pl-1 pr-1.5">-</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center text-orange-600 dark:text-orange-400">{selectedTeamStats.score}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">
                                {selectedTeamStats.totalFgMade}/{selectedTeamStats.totalFgAttempted}
                                {selectedTeamStats.totalFgAttempted > 0 && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {((selectedTeamStats.totalFgMade / selectedTeamStats.totalFgAttempted) * 100).toFixed(1)}%
                                  </div>
                                )}
                              </td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">
                                {selectedTeamStats.totalThreeMade}/{selectedTeamStats.totalThreeAttempted}
                                {selectedTeamStats.totalThreeAttempted > 0 && (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {((selectedTeamStats.totalThreeMade / selectedTeamStats.totalThreeAttempted) * 100).toFixed(1)}%
                                  </div>
                                )}
                              </td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">{selectedTeamStats.totalRebounds}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">{selectedTeamStats.totalAssists}</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                              <td className="px-1.5 py-1.5 md:p-3 text-center">-</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* Team Insights */}
                  {selectedTeamPlayers.length > 0 && (
                    <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-neutral-800 dark:to-neutral-800 rounded-lg p-4 border border-orange-200 dark:border-neutral-700">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-3 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-orange-500" />
                        {selectedTeam} Game Highlights
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                        <div className="bg-white dark:bg-neutral-700 rounded-md p-3">
                          <div className="text-orange-600 dark:text-orange-400 font-medium">Top Scorer</div>
                          <div className="text-slate-800 dark:text-white">
                            {selectedTeamPlayers.sort((a, b) => (b.spoints || 0) - (a.spoints || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.spoints || 0) - (a.spoints || 0))[0]?.familyname}
                          </div>
                          <div className="text-orange-600 dark:text-orange-400 font-bold">
                            {selectedTeamPlayers.sort((a, b) => (b.spoints || 0) - (a.spoints || 0))[0]?.spoints} pts
                          </div>
                        </div>
                        <div className="bg-white dark:bg-neutral-700 rounded-md p-3">
                          <div className="text-orange-600 dark:text-orange-400 font-medium">Best Rebounder</div>
                          <div className="text-slate-800 dark:text-white">
                            {selectedTeamPlayers.sort((a, b) => (b.sreboundstotal || 0) - (a.sreboundstotal || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.sreboundstotal || 0) - (a.sreboundstotal || 0))[0]?.familyname}
                          </div>
                          <div className="text-orange-600 dark:text-orange-400 font-bold">
                            {selectedTeamPlayers.sort((a, b) => (b.sreboundstotal || 0) - (a.sreboundstotal || 0))[0]?.sreboundstotal} reb
                          </div>
                        </div>
                        <div className="bg-white dark:bg-neutral-700 rounded-md p-3">
                          <div className="text-orange-600 dark:text-orange-400 font-medium">Best Playmaker</div>
                          <div className="text-slate-800 dark:text-white">
                            {selectedTeamPlayers.sort((a, b) => (b.sassists || 0) - (a.sassists || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.sassists || 0) - (a.sassists || 0))[0]?.familyname}
                          </div>
                          <div className="text-orange-600 dark:text-orange-400 font-bold">
                            {selectedTeamPlayers.sort((a, b) => (b.sassists || 0) - (a.sassists || 0))[0]?.sassists} ast
                          </div>
                        </div>
                        <div className="bg-white dark:bg-neutral-700 rounded-md p-3">
                          <div className="text-orange-600 dark:text-orange-400 font-medium">Most Steals</div>
                          <div className="text-slate-800 dark:text-white">
                            {selectedTeamPlayers.sort((a, b) => (b.ssteals || 0) - (a.ssteals || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.ssteals || 0) - (a.ssteals || 0))[0]?.familyname}
                          </div>
                          <div className="text-orange-600 dark:text-orange-400 font-bold">
                            {selectedTeamPlayers.sort((a, b) => (b.ssteals || 0) - (a.ssteals || 0))[0]?.ssteals || 0} stl
                          </div>
                        </div>
                        <div className="bg-white dark:bg-neutral-700 rounded-md p-3">
                          <div className="text-orange-600 dark:text-orange-400 font-medium">Most Blocks</div>
                          <div className="text-slate-800 dark:text-white">
                            {selectedTeamPlayers.sort((a, b) => (b.sblocks || 0) - (a.sblocks || 0))[0]?.firstname} {selectedTeamPlayers.sort((a, b) => (b.sblocks || 0) - (a.sblocks || 0))[0]?.familyname}
                          </div>
                          <div className="text-orange-600 dark:text-orange-400 font-bold">
                            {selectedTeamPlayers.sort((a, b) => (b.sblocks || 0) - (a.sblocks || 0))[0]?.sblocks || 0} blk
                          </div>
                        </div>
                        <div className="bg-white dark:bg-neutral-700 rounded-md p-3">
                          <div className="text-orange-600 dark:text-orange-400 font-medium">Best FG%</div>
                          <div className="text-slate-800 dark:text-white">
                            {selectedTeamPlayers.filter(p => (p.sfieldgoalsattempted || 0) >= 3).sort((a, b) => {
                              const aFG = (a.sfieldgoalsmade || 0) / (a.sfieldgoalsattempted || 1) * 100;
                              const bFG = (b.sfieldgoalsmade || 0) / (b.sfieldgoalsattempted || 1) * 100;
                              return bFG - aFG;
                            })[0]?.firstname} {selectedTeamPlayers.filter(p => (p.sfieldgoalsattempted || 0) >= 3).sort((a, b) => {
                              const aFG = (a.sfieldgoalsmade || 0) / (a.sfieldgoalsattempted || 1) * 100;
                              const bFG = (b.sfieldgoalsmade || 0) / (b.sfieldgoalsattempted || 1) * 100;
                              return bFG - aFG;
                            })[0]?.familyname}
                          </div>
                          <div className="text-orange-600 dark:text-orange-400 font-bold">
                            {selectedTeamPlayers.filter(p => (p.sfieldgoalsattempted || 0) >= 3).length > 0 ? (((selectedTeamPlayers.filter(p => (p.sfieldgoalsattempted || 0) >= 3).sort((a, b) => {
                              const aFG = (a.sfieldgoalsmade || 0) / (a.sfieldgoalsattempted || 1) * 100;
                              const bFG = (b.sfieldgoalsmade || 0) / (b.sfieldgoalsattempted || 1) * 100;
                              return bFG - aFG;
                            })[0]?.sfieldgoalsmade || 0) / (selectedTeamPlayers.filter(p => (p.sfieldgoalsattempted || 0) >= 3).sort((a, b) => {
                              const aFG = (a.sfieldgoalsmade || 0) / (a.sfieldgoalsattempted || 1) * 100;
                              const bFG = (b.sfieldgoalsmade || 0) / (b.sfieldgoalsattempted || 1) * 100;
                              return bFG - aFG;
                            })[0]?.sfieldgoalsattempted || 1) * 100).toFixed(0) + '%') : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Feed Tab */}
                <TabsContent value="feed" className="mt-4 space-y-4">
                  {eventsLoading ? (
                    <div className="p-8 text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
                      <p className="mt-4 text-slate-600 dark:text-slate-400">Loading play-by-play data...</p>
                    </div>
                  ) : liveEvents.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 dark:bg-neutral-800 rounded-lg">
                      <Activity className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-slate-600 dark:text-slate-400">No play-by-play data available for this game.</p>
                    </div>
                  ) : (
                    <>
                      {/* Quarter Filter */}
                      <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Filter:</span>
                        {['all', 'Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => (
                          <button
                            key={quarter}
                            onClick={() => setQuarterFilter(quarter)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                              quarterFilter === quarter
                                ? 'bg-orange-500 text-white'
                                : 'bg-gray-100 text-slate-700 hover:bg-gray-200'
                            }`}
                          >
                            {quarter === 'all' ? 'All Quarters' : quarter}
                          </button>
                        ))}
                      </div>

                      {/* Events Feed */}
                      <div className="space-y-3">
                        {(() => {
                          // Preprocess: Build a map of each event to its previous scored event
                          // This scans the full unfiltered liveEvents array for accurate score comparisons
                          const eventToPreviousScoredEvent = new Map<number, LiveEvent>();
                          let lastScoredEvent: LiveEvent | null = null;
                          
                          for (const event of liveEvents) {
                            if (event.score && event.score.trim()) {
                              if (lastScoredEvent) {
                                eventToPreviousScoredEvent.set(event.id, lastScoredEvent);
                              }
                              lastScoredEvent = event;
                            } else if (lastScoredEvent) {
                              // Events without scores still get the last scored event as reference
                              eventToPreviousScoredEvent.set(event.id, lastScoredEvent);
                            }
                          }
                          
                          return liveEvents
                            .filter(event => quarterFilter === 'all' || `Q${event.period}` === quarterFilter)
                            .map((event) => {
                              // Find which team this event belongs to by matching player name
                              const eventPlayer = gameStats.find(p => 
                                event.player_name && (
                                  `${p.firstname} ${p.familyname}`.toLowerCase().includes(event.player_name.toLowerCase()) ||
                                  event.player_name.toLowerCase().includes(`${p.firstname} ${p.familyname}`.toLowerCase())
                                )
                              );
                              const eventTeamColor = eventPlayer ? teamColors[eventPlayer.team] : null;
                              
                              // Get previous scored event from the preprocessed map
                              const previousEvent = eventToPreviousScoredEvent.get(event.id) || null;
                            
                            return (
                              <div 
                                key={event.id} 
                                className="border rounded-lg p-3 hover:shadow-md transition-shadow"
                                style={eventTeamColor ? {
                                  background: `linear-gradient(135deg, ${adjustOpacity(eventTeamColor.primaryRgb, 0.08)} 0%, ${adjustOpacity(eventTeamColor.primaryRgb, 0.03)} 100%)`,
                                  borderColor: adjustOpacity(eventTeamColor.primaryRgb, 0.25),
                                  borderWidth: '1px'
                                } : {
                                  background: 'white',
                                  borderColor: 'rgb(229, 231, 235)',
                                  borderWidth: '1px'
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span 
                                        className="px-2 py-0.5 text-xs font-medium rounded"
                                        style={eventTeamColor ? {
                                          backgroundColor: adjustOpacity(eventTeamColor.primaryRgb, 0.15),
                                          color: eventTeamColor.primary
                                        } : {
                                          backgroundColor: 'rgba(251, 146, 60, 0.15)',
                                          color: 'rgb(249, 115, 22)'
                                        }}
                                      >
                                        Q{event.period}
                                      </span>
                                      <span className="text-xs text-slate-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {event.clock}
                                      </span>
                                    </div>
                                    {event.player_name && (
                                      <div className="text-sm font-medium text-slate-800">
                                        {event.player_name}
                                      </div>
                                    )}
                                    <div 
                                      className="text-sm font-bold mt-1"
                                      style={eventTeamColor ? {
                                        color: eventTeamColor.primary
                                      } : {
                                        color: 'rgb(194, 65, 12)'
                                      }}
                                    >
                                      {generatePlayCaption(event, previousEvent)}
                                    </div>
                                  </div>
                                  {event.score && (
                                    <div className="text-right shrink-0">
                                      <div 
                                        className="text-lg font-bold"
                                        style={eventTeamColor ? {
                                          color: eventTeamColor.primary
                                        } : {
                                          color: 'rgb(249, 115, 22)'
                                        }}
                                      >
                                        {event.score}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              );
                            });
                        })()}
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Shot Chart Tab */}
                <TabsContent value="shotchart" className="mt-4 space-y-4">
                  <ShotChart
                    shots={shotChartShots}
                    loading={shotChartLoading}
                    compact
                    emptyMessage="No shot data is available for this game yet."
                    filters={{
                      showPlayerFilter: true,
                      showQuarterFilter: true,
                      showResultFilter: true,
                    }}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}