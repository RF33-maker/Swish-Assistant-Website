import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import BoxScoreTable from "@/components/BoxScoreTable";
import { TeamLogo } from "@/components/TeamLogo";
import { GameSwitcherBar } from "@/components/GameSwitcherBar";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { isGameSlug, parseGameSlug } from "@/lib/gameSlug";
import { ArrowLeft, Clock, MapPin, Calendar, Users, TrendingUp } from "lucide-react";
import { usePublicLeagueBrandingById } from "@/hooks/usePublicLeagueBranding";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LeagueChatbot from "@/components/LeagueChatbot";
import type { ShotData } from "@/components/ShotChart";
import TeamSplitShotChart from "@/components/TeamSplitShotChart";
import PlayByPlay from "@/components/PlayByPlay";
import UpcomingGamePreview from "@/components/UpcomingGamePreview";
import { LiveFeedPanel, LiveFeedStrip } from "@/components/game/LiveFeed";
import { useLiveCommentary } from "@/hooks/useLiveCommentary";
import GameScoreHero, { useMatchupColors, type GameHeroState } from "@/components/game/GameScoreHero";
import { GameOverviewSections, TeamStatsComparison, GAME_TAB_LIST_CLASS, GAME_TAB_TRIGGER_CLASS, type GameLeaderPlayer } from "@/components/game/GameOverview";
import { gameRecap } from "@shared/recaps";
import { playerPath, teamPath } from "@shared/seo";

interface GameSchedule {
  game_key: string;
  league_id: string;
  matchtime: string;
  hometeam: string;
  awayteam: string;
  status: string | null;
  competitionname: string | null;
  venue?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
}

interface PlayerStat {
  firstname?: string;
  familyname?: string;
  full_name?: string;
  player_name?: string;
  team_name?: string;
  side?: string;
  shirtnumber?: string | number | null;
  spoints: number;
  sreboundstotal: number;
  sassists: number;
  ssteals: number;
  sblocks: number;
  sturnovers: number;
  sfoulspersonal?: number;
  sfieldgoalsmade: number;
  sfieldgoalsattempted: number;
  sthreepointersmade: number;
  sthreepointersattempted: number;
  sfreethrowsmade: number;
  sfreethrowsattempted: number;
  sminutes: string;
  player_id?: string | null;
  players?: { slug?: string | null } | null;
}

interface TeamStat {
  name: string;
  side: string;
  score: number;
  tot_spoints: number;
  tot_sreboundstotal: number;
  tot_sassists: number;
  tot_ssteals: number;
  tot_sblocks: number;
  tot_sturnovers: number;
  tot_sfieldgoalsmade: number;
  tot_sfieldgoalsattempted: number;
  tot_sthreepointersmade: number;
  tot_sthreepointersattempted: number;
  tot_sfreethrowsmade: number;
  tot_sfreethrowsattempted: number;
  p1_score: number | null;
  p2_score: number | null;
  p3_score: number | null;
  p4_score: number | null;
}

interface GameResult {
  numericId: string;
  won: boolean;
  teamScore: number;
  opponentScore: number;
}

interface LiveEvent {
  id: number;
  game_key: string;
  action_type: string;
  sub_type: string | null;
  period: number;
  clock: string;
  team_no: number;
  player_name: string | null;
  player_id: string | null;
  description: string | null;
  score: string;
  success: boolean;
  scoring: boolean;
  points: number | null;
  x_coord: number | null;
  y_coord: number | null;
  created_at: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function parseMinutesToDecimal(minutesStr: string | null | undefined): number {
  if (!minutesStr) return 0;
  const parts = minutesStr.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return minutes + seconds / 60;
  }
  return 0;
}

function calculateTimeLeft(matchtime: string): TimeLeft | null {
  const gameTime = new Date(matchtime).getTime();
  const now = new Date().getTime();
  const difference = gameTime - now;

  if (difference <= 0) {
    return null;
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / 1000 / 60) % 60),
    seconds: Math.floor((difference / 1000) % 60)
  };
}

function normalizeGameStatus(status?: string | null) {
  return (status || "").toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function isFinalGameStatus(status?: string | null) {
  const value = normalizeGameStatus(status);
  return ["final", "finished", "completed", "complete", "ft", "full time", "ended"].includes(value);
}

function isLiveGameStatus(status?: string | null) {
  const value = normalizeGameStatus(status);
  return value === "live"
    || value === "playing"
    || value === "in progress"
    || value === "halftime"
    || value === "half time"
    || value === "ot"
    || value === "overtime"
    || /\bq[1-4]\b/.test(value)
    || /\bquarter [1-4]\b/.test(value)
    || /\bperiod [1-9]\b/.test(value);
}

function formatMatchTime(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

function formatDate(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function formatTime(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });
}

function parseMinutes(minutesStr: string | null | undefined): string {
  if (!minutesStr) return '0:00';
  if (minutesStr.includes(':')) return minutesStr;
  const mins = parseFloat(minutesStr);
  const wholeMins = Math.floor(mins);
  const secs = Math.round((mins - wholeMins) * 60);
  return `${wholeMins}:${secs.toString().padStart(2, '0')}`;
}

const leaderName = (p: PlayerStat) => p.full_name || p.player_name || `${p.firstname || ''} ${p.familyname || ''}`.trim();
// The player's page, so box-score and leader names are real links.
const playerHref = (p: PlayerStat) => playerPath({ slug: p.players?.slug, full_name: leaderName(p), id: p.player_id });

const toLeader = (p: PlayerStat): GameLeaderPlayer => ({
  href: playerHref(p),
  name: leaderName(p),
  spoints: p.spoints,
  sreboundstotal: p.sreboundstotal,
  sassists: p.sassists,
  ssteals: p.ssteals,
  sblocks: p.sblocks,
});

function buildEventDescription(actionType: string, subType: string | null, success: boolean, points: number | null): string {
  const action = actionType?.toLowerCase() || '';
  const sub = subType?.toLowerCase() || '';
  
  switch (action) {
    case '2pt':
    case '3pt':
    case 'freethrow':
      const shotType = action === '2pt' ? '2-pointer' : action === '3pt' ? '3-pointer' : 'free throw';
      if (success) {
        return `Made ${shotType}${points ? ` (+${points})` : ''}`;
      } else {
        return `Missed ${shotType}`;
      }
    case 'rebound':
      return sub === 'defensive' ? 'Defensive rebound' : sub === 'offensive' ? 'Offensive rebound' : 'Rebound';
    case 'assist':
      return 'Assist on the basket';
    case 'steal':
      return 'Steal';
    case 'block':
      return 'Block';
    case 'turnover':
      return sub ? `Turnover (${sub})` : 'Turnover';
    case 'foul':
      return sub ? `${sub.charAt(0).toUpperCase() + sub.slice(1)} foul` : 'Foul';
    case 'substitution':
      return sub === 'in' ? 'Checked in' : sub === 'out' ? 'Checked out' : 'Substitution';
    case 'timeout':
      return sub ? `${sub.charAt(0).toUpperCase() + sub.slice(1)} timeout` : 'Timeout';
    case 'jumpball':
      return sub === 'won' ? 'Won jump ball' : sub === 'lost' ? 'Lost jump ball' : 'Jump ball';
    case 'period':
      return sub === 'start' ? 'Period started' : sub === 'end' ? 'Period ended' : 'Period event';
    case 'game':
      return sub === 'start' ? 'Game started' : sub === 'end' ? 'Game ended' : 'Game event';
    default:
      return sub ? `${action} - ${sub}` : action;
  }
}

export default function GamePage() {
  const params = useParams<{ gameKey: string }>();
  const rawParam = params.gameKey ? decodeURIComponent(params.gameKey) : '';
  const [, navigate] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const isTestMode = searchParams.get("mode") === "test";
  // Deep-link support for ?tab=boxscore|teamstats|shotchart|feed (e.g. the
  // Coaches Hub "last game" box score link) — anything else, including no
  // param, falls back to the normal default.
  const requestedTab = searchParams.get("tab");
  const initialTab = ["game", "boxscore", "teamstats", "shotchart", "feed"].includes(requestedTab || "") ? requestedTab! : "game";
  
  const db = isTestMode ? supabase.schema("test") : supabase;

  const slugMode = isGameSlug(rawParam);

  const { data: resolvedGameKey } = useQuery({
    queryKey: ['resolve-game-slug', rawParam, isTestMode],
    queryFn: async () => {
      if (!slugMode) return rawParam;
      const parsed = parseGameSlug(rawParam);
      if (!parsed) return rawParam;

      const dateStart = `${parsed.date}T00:00:00+00:00`;
      const dateEnd = `${parsed.date}T23:59:59+00:00`;

      const { data, error } = await db
        .from('game_schedule')
        .select('game_key, hometeam, awayteam')
        .gte('matchtime', dateStart)
        .lte('matchtime', dateEnd);

      if (error || !data || data.length === 0) return null;

      const slugify = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const match = data.find(g =>
        slugify(g.hometeam) === parsed.home && slugify(g.awayteam) === parsed.away
      );
      return match?.game_key || null;
    },
    enabled: !!rawParam,
    staleTime: Infinity,
  });

  const gameKey = resolvedGameKey || '';

  const { data: gameData, isLoading: gameLoading, error: gameError } = useQuery({
    queryKey: ['game-schedule', gameKey, isTestMode],
    queryFn: async () => {
      const { data, error } = await db
        .from('game_schedule')
        .select('game_key, league_id, matchtime, hometeam, awayteam, status, competitionname, home_team_id, away_team_id')
        .eq('game_key', gameKey)
        .single();
      
      if (error) throw error;
      return data as GameSchedule;
    },
    enabled: !!gameKey,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  // Fetch league slug for back navigation
  const { data: leagueData } = useQuery({
    queryKey: ['league-slug', gameData?.league_id, isTestMode],
    queryFn: async () => {
      if (!gameData?.league_id) return null;
      const { data, error } = await db
        .from('competitions')
        .select('slug, banner_url, logo_url, primary_color, secondary_color, accent_color')
        .eq('league_id', gameData.league_id)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: !!gameData?.league_id
  });

  const { brandingData: publicBrandingData } = usePublicLeagueBrandingById({
    leagueId: gameData?.league_id,
    fallbackLeague: leagueData,
    enabled: !!gameData?.league_id,
  });

  const leagueSlug = leagueData?.slug || publicBrandingData?.slug;

  const { data: playerStats, isLoading: statsLoading } = useQuery({
    queryKey: ['game-player-stats', gameKey, isTestMode],
    queryFn: async () => {
      const { data, error } = await db
        .from('player_stats')
        // The player's slug too, so names link straight to their page.
        .select('*, players:player_id(slug)')
        .eq('game_key', gameKey);
      
      if (error) throw error;
      return data as PlayerStat[];
    },
    enabled: !!gameKey && !!gameData,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const { data: teamStats, dataUpdatedAt: teamStatsUpdatedAt } = useQuery({
    queryKey: ['game-team-stats', gameKey, isTestMode],
    queryFn: async () => {
      const { data, error } = await db
        .from('team_stats')
        .select('*')
        .eq('game_key', gameKey);
      
      if (error) throw error;
      return data as TeamStat[];
    },
    enabled: !!gameKey && !!gameData,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  // Fetch live events for play-by-play
  const { data: liveEvents } = useQuery({
    queryKey: ['game-live-events', gameKey, isTestMode],
    queryFn: async () => {
      const { data, error } = await db
        .from('live_events')
        .select('*')
        .eq('game_key', gameKey)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('[GamePage] live_events error:', error);
        return [];
      }
      return data as LiveEvent[];
    },
    enabled: !!gameKey && !!gameData,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  // Fetch shot chart data from shot_chart table
  const { data: shotChartData, isLoading: shotChartLoading } = useQuery({
    queryKey: ['game-shot-chart', gameKey],
    queryFn: async () => {
      const { data, error } = await db
        .from('shot_chart')
        .select('id, action_number, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
        .eq('game_key', gameKey);
      if (error) { console.error('[GamePage] shot_chart error:', error); return []; }
      return (data || []) as ShotData[];
    },
    enabled: !!gameKey && !!gameData,
    // Shots keep arriving while the game is on, like the play-by-play.
    refetchInterval: isLiveGameStatus(normalizeGameStatus(gameData?.status)) ? 15000 : false,
    refetchIntervalInBackground: false,
  });

  const [lastUpdatedText, setLastUpdatedText] = useState('');

  useEffect(() => {
    if (!teamStatsUpdatedAt) return;
    const update = () => {
      const seconds = Math.floor((Date.now() - teamStatsUpdatedAt) / 1000);
      if (seconds < 5) setLastUpdatedText('Just now');
      else if (seconds < 60) setLastUpdatedText(`${seconds}s ago`);
      else setLastUpdatedText(`${Math.floor(seconds / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [teamStatsUpdatedAt]);

  // Countdown timer state
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    if (!gameData?.matchtime) return;
    
    const updateCountdown = () => {
      setTimeLeft(calculateTimeLeft(gameData.matchtime));
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [gameData?.matchtime]);

  // Check if game is scheduled (for preview mode features)
  const hasOfficialGameData = (playerStats?.length || 0) > 0 || (teamStats?.length || 0) > 0;
  const isScheduled = !!gameData
    && !isLiveGameStatus(gameData.status)
    && !isFinalGameStatus(gameData.status)
    && !hasOfficialGameData;

  // Fetch home team ID
  const { data: homeTeamData } = useQuery({
    queryKey: ['team-lookup-game', gameData?.league_id, gameData?.home_team_id, gameData?.hometeam, isTestMode],
    queryFn: async () => {
      if (!gameData) return null;
      if (gameData.home_team_id) {
        return { team_id: gameData.home_team_id, name: gameData.hometeam };
      }
      let { data, error } = await db
        .from('teams')
        .select('team_id, name')
        .eq('league_id', gameData.league_id)
        .eq('name', gameData.hometeam)
        .single();
      
      if (error || !data) {
        const baseTeamName = gameData.hometeam.split(' Senior ')[0].split(' Men')[0];
        const { data: partialData } = await db
          .from('teams')
          .select('team_id, name')
          .eq('league_id', gameData.league_id)
          .ilike('name', `%${baseTeamName}%`)
          .limit(1)
          .single();
        data = partialData;
      }
      return data;
    },
    enabled: !!gameData
  });

  // Fetch away team ID
  const { data: awayTeamData } = useQuery({
    queryKey: ['team-lookup-game', gameData?.league_id, gameData?.away_team_id, gameData?.awayteam, isTestMode],
    queryFn: async () => {
      if (!gameData) return null;
      if (gameData.away_team_id) {
        return { team_id: gameData.away_team_id, name: gameData.awayteam };
      }
      let { data, error } = await db
        .from('teams')
        .select('team_id, name')
        .eq('league_id', gameData.league_id)
        .eq('name', gameData.awayteam)
        .single();
      
      if (error || !data) {
        const baseTeamName = gameData.awayteam.split(' Senior ')[0].split(' Men')[0];
        const { data: partialData } = await db
          .from('teams')
          .select('team_id, name')
          .eq('league_id', gameData.league_id)
          .ilike('name', `%${baseTeamName}%`)
          .limit(1)
          .single();
        data = partialData;
      }
      return data;
    },
    enabled: !!gameData
  });

  const homeTeamId = homeTeamData?.team_id;
  const awayTeamId = awayTeamData?.team_id;

  // Fetch home team roster for top players
  const { data: homeTeamRoster } = useQuery({
    queryKey: ['roster-game', gameData?.league_id, homeTeamId, isTestMode],
    queryFn: async () => {
      if (!homeTeamId || !gameData) return [];
      const { data, error } = await db
        .from('player_stats')
        .select('player_id, full_name, spoints, sreboundstotal, sassists, sminutes')
        .eq('league_id', gameData.league_id)
        .eq('team_id', homeTeamId);
      
      if (error) throw error;
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const key = stat.player_id || stat.full_name || '';
        if (!key) return;
        if (!playerMap.has(key)) {
          playerMap.set(key, { playerId: stat.player_id, name: stat.full_name || '', games: 0, points: 0, rebounds: 0, assists: 0, minutes: 0 });
        }
        const player = playerMap.get(key);
        if (!player.name && stat.full_name) player.name = stat.full_name;
        const mins = parseMinutesToDecimal(stat.sminutes);
        if (mins > 0) {
          player.games += 1;
          player.points += stat.spoints || 0;
          player.rebounds += stat.sreboundstotal || 0;
          player.assists += stat.sassists || 0;
          player.minutes += mins;
        }
      });

      const playerIds = Array.from(playerMap.values())
        .filter(p => p.playerId)
        .map(p => p.playerId);
      if (playerIds.length > 0) {
        const { data: playersData } = await db
          .from('players')
          .select('id, full_name, photo_path_bg_removed, photo_focus_y')
          .in('id', playerIds);
        if (playersData) {
          playersData.forEach(p => {
            const entry = playerMap.get(p.id);
            if (entry) {
              if (p.full_name) entry.name = p.full_name;
              entry.photoPath = p.photo_path_bg_removed;
              entry.photoFocusY = p.photo_focus_y ?? 30;
            }
          });
        }
      }

      const top3 = Array.from(playerMap.values())
        .filter(p => p.games > 0)
        .map(p => {
          let photoUrl: string | null = null;
          if (p.photoPath) {
            const { data: urlData } = supabase.storage
              .from('player-photos')
              .getPublicUrl(p.photoPath);
            photoUrl = urlData.publicUrl;
          }
          return {
            ...p,
            ppg: (p.points / p.games).toFixed(1),
            rpg: (p.rebounds / p.games).toFixed(1),
            apg: (p.assists / p.games).toFixed(1),
            photoUrl,
            photoFocusY: p.photoFocusY ?? 30,
          };
        })
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 3);

      return top3;
    },
    enabled: !!homeTeamId && isScheduled
  });

  // Fetch away team roster for top players
  const { data: awayTeamRoster } = useQuery({
    queryKey: ['roster-game', gameData?.league_id, awayTeamId, isTestMode],
    queryFn: async () => {
      if (!awayTeamId || !gameData) return [];
      const { data, error } = await db
        .from('player_stats')
        .select('player_id, full_name, spoints, sreboundstotal, sassists, sminutes')
        .eq('league_id', gameData.league_id)
        .eq('team_id', awayTeamId);
      
      if (error) throw error;
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const key = stat.player_id || stat.full_name || '';
        if (!key) return;
        if (!playerMap.has(key)) {
          playerMap.set(key, { playerId: stat.player_id, name: stat.full_name || '', games: 0, points: 0, rebounds: 0, assists: 0, minutes: 0 });
        }
        const player = playerMap.get(key);
        if (!player.name && stat.full_name) player.name = stat.full_name;
        const mins = parseMinutesToDecimal(stat.sminutes);
        if (mins > 0) {
          player.games += 1;
          player.points += stat.spoints || 0;
          player.rebounds += stat.sreboundstotal || 0;
          player.assists += stat.sassists || 0;
          player.minutes += mins;
        }
      });

      const playerIds = Array.from(playerMap.values())
        .filter(p => p.playerId)
        .map(p => p.playerId);
      if (playerIds.length > 0) {
        const { data: playersData } = await db
          .from('players')
          .select('id, full_name, photo_path_bg_removed, photo_focus_y')
          .in('id', playerIds);
        if (playersData) {
          playersData.forEach(p => {
            const entry = playerMap.get(p.id);
            if (entry) {
              if (p.full_name) entry.name = p.full_name;
              entry.photoPath = p.photo_path_bg_removed;
              entry.photoFocusY = p.photo_focus_y ?? 30;
            }
          });
        }
      }

      const top3 = Array.from(playerMap.values())
        .filter(p => p.games > 0)
        .map(p => {
          let photoUrl: string | null = null;
          if (p.photoPath) {
            const { data: urlData } = supabase.storage
              .from('player-photos')
              .getPublicUrl(p.photoPath);
            photoUrl = urlData.publicUrl;
          }
          return {
            ...p,
            ppg: (p.points / p.games).toFixed(1),
            rpg: (p.rebounds / p.games).toFixed(1),
            apg: (p.assists / p.games).toFixed(1),
            photoUrl,
            photoFocusY: p.photoFocusY ?? 30,
          };
        })
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 3);

      return top3;
    },
    enabled: !!awayTeamId && isScheduled
  });

  // Fetch home team last 5 games
  const { data: homeTeamForm } = useQuery({
    queryKey: ['team-form-game', gameData?.league_id, homeTeamId, isTestMode],
    queryFn: async () => {
      if (!homeTeamId || !gameData) return [];
      const { data: teamGames, error } = await db
        .from('team_stats')
        .select('numeric_id, tot_spoints, team_id')
        .eq('league_id', gameData.league_id)
        .eq('team_id', homeTeamId)
        .order('numeric_id', { ascending: false });
      
      if (error || !teamGames) return [];

      const results: GameResult[] = [];
      const processedGames = new Set<string>();

      for (const teamGame of teamGames) {
        if (!teamGame.numeric_id || processedGames.has(teamGame.numeric_id)) continue;
        
        const { data: opponentData } = await db
          .from('team_stats')
          .select('tot_spoints, team_id')
          .eq('league_id', gameData.league_id)
          .eq('numeric_id', teamGame.numeric_id)
          .neq('team_id', homeTeamId)
          .single();

        if (opponentData) {
          results.push({
            numericId: teamGame.numeric_id,
            won: (teamGame.tot_spoints || 0) > (opponentData.tot_spoints || 0),
            teamScore: teamGame.tot_spoints || 0,
            opponentScore: opponentData.tot_spoints || 0
          });
          processedGames.add(teamGame.numeric_id);
        }
        if (results.length >= 5) break;
      }
      return results;
    },
    enabled: !!homeTeamId && isScheduled
  });

  // Fetch away team last 5 games
  const { data: awayTeamForm } = useQuery({
    queryKey: ['team-form-game', gameData?.league_id, awayTeamId, isTestMode],
    queryFn: async () => {
      if (!awayTeamId || !gameData) return [];
      const { data: teamGames, error } = await db
        .from('team_stats')
        .select('numeric_id, tot_spoints, team_id')
        .eq('league_id', gameData.league_id)
        .eq('team_id', awayTeamId)
        .order('numeric_id', { ascending: false });
      
      if (error || !teamGames) return [];

      const results: GameResult[] = [];
      const processedGames = new Set<string>();

      for (const teamGame of teamGames) {
        if (!teamGame.numeric_id || processedGames.has(teamGame.numeric_id)) continue;
        
        const { data: opponentData } = await db
          .from('team_stats')
          .select('tot_spoints, team_id')
          .eq('league_id', gameData.league_id)
          .eq('numeric_id', teamGame.numeric_id)
          .neq('team_id', awayTeamId)
          .single();

        if (opponentData) {
          results.push({
            numericId: teamGame.numeric_id,
            won: (teamGame.tot_spoints || 0) > (opponentData.tot_spoints || 0),
            teamScore: teamGame.tot_spoints || 0,
            opponentScore: opponentData.tot_spoints || 0
          });
          processedGames.add(teamGame.numeric_id);
        }
        if (results.length >= 5) break;
      }
      return results;
    },
    enabled: !!awayTeamId && isScheduled
  });

  const { data: allLeagueGameStats } = useQuery({
    queryKey: ['league-game-stats', gameData?.league_id, isTestMode],
    queryFn: async () => {
      if (!gameData) return null;
      const { data, error } = await db
        .from('team_stats')
        .select('numeric_id, team_id, tot_spoints')
        .eq('league_id', gameData.league_id);
      if (error || !data) return null;
      return data as { numeric_id: string; team_id: string; tot_spoints: number }[];
    },
    enabled: !!gameData
  });

  const computeRecord = (teamId: string | undefined) => {
    if (!teamId || !allLeagueGameStats) return null;
    const gameMap = new Map<string, { teamScore: number; opponentScore: number }>();
    for (const row of allLeagueGameStats) {
      if (!row.numeric_id) continue;
      if (row.team_id === teamId) {
        const existing = gameMap.get(row.numeric_id) || { teamScore: 0, opponentScore: 0 };
        existing.teamScore = row.tot_spoints || 0;
        gameMap.set(row.numeric_id, existing);
      }
    }
    for (const row of allLeagueGameStats) {
      if (!row.numeric_id) continue;
      const existing = gameMap.get(row.numeric_id);
      if (existing && row.team_id !== teamId) {
        existing.opponentScore = row.tot_spoints || 0;
      }
    }
    let wins = 0;
    let losses = 0;
    gameMap.forEach(({ teamScore, opponentScore }) => {
      if (teamScore > opponentScore) wins++;
      else if (opponentScore > 0 || teamScore > 0) losses++;
    });
    return { wins, losses };
  };

  const homeTeamRecord = computeRecord(homeTeamId);
  const awayTeamRecord = computeRecord(awayTeamId);

  // Computed before early returns so hook order is stable
  const hasSideData = playerStats?.some(p => p.side === "1" || p.side === "2");

  const homePlayerStats = (hasSideData
    ? playerStats?.filter(p => p.side === "1")
    : playerStats?.filter(p => p.team_name === gameData?.hometeam)
  )?.sort((a, b) => (b.spoints || 0) - (a.spoints || 0)) || [];

  const awayPlayerStats = (hasSideData
    ? playerStats?.filter(p => p.side === "2")
    : playerStats?.filter(p => p.team_name === gameData?.awayteam)
  )?.sort((a, b) => (b.spoints || 0) - (a.spoints || 0)) || [];

  // Live text commentary, built from the play-by-play (above the early returns
  // so hook order stays stable).
  const feedStatus = normalizeGameStatus(gameData?.status);
  const feedLive = isLiveGameStatus(feedStatus);
  const feedFinal = isFinalGameStatus(feedStatus);
  const { items: feedItems, players: feedPlayers, shots: feedShots } = useLiveCommentary({
    gameKey,
    leagueId: gameData?.league_id,
    homeTeam: gameData?.hometeam ?? '',
    awayTeam: gameData?.awayteam ?? '',
    events: liveEvents as any,
    shots: shotChartData as any,
    isFinal: feedFinal,
    isLive: feedLive,
    knownNames: [...homePlayerStats, ...awayPlayerStats].map(leaderName),
  });

  const gameSuggestions = useMemo(() => {
    const home = gameData?.hometeam || 'home team';
    const away = gameData?.awayteam || 'away team';

    const homePlayers = homePlayerStats.slice(0, 2).map(p => p.player_name).filter(Boolean) as string[];
    const awayPlayers = awayPlayerStats.slice(0, 2).map(p => p.player_name).filter(Boolean) as string[];
    const featuredPlayers = [...homePlayers.slice(0, 1), ...awayPlayers.slice(0, 1)];

    const base = [
      `How has ${home} been performing this season?`,
      `Who are the top scorers for ${away}?`,
      `Compare ${home} and ${away} rebounding stats`,
      `What are ${home}'s shooting percentages this season?`,
      `Which team has the better defence — ${home} or ${away}?`,
    ];

    const playerQs = featuredPlayers.map(name => `How many points is ${name} averaging this season?`);
    return [...playerQs, ...base].slice(0, 5);
  }, [gameData?.hometeam, gameData?.awayteam, homePlayerStats, awayPlayerStats]);

  // Called before the early returns below so the hook order never changes.
  const colors = useMatchupColors(gameData?.hometeam ?? "", gameData?.awayteam ?? "", gameData?.league_id);

  if (gameLoading) {
    return (
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-4" aria-busy="true">
          <div className="ch-skel h-9 w-28" />
          <div className="ch-skel h-[240px] md:h-[300px] !rounded-[14px]" />
          <div className="ch-skel h-11" />
          <div className="ch-skel h-64 !rounded-[14px]" />
        </div>
      </div>
    );
  }

  if (gameError || !gameData) {
    return (
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen flex flex-col`}>
        <SiteHeader />
        <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="ch-display uppercase text-3xl font-bold mb-3">Game not found</h1>
          <p className="text-[color:var(--ch-text-2)] mb-6">The game you're looking for doesn't exist or has been removed.</p>
          <button onClick={() => navigate('/')} className="ch-btn ch-btn-ghost h-10 px-4 mx-auto">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        </div>
        </div>
      </div>
    );
  }

  // Scheduled rows are complete records even when no result/stat rows exist yet.
  // Keep this branch ahead of the recap UI so an upcoming game never looks missing.
  if (isScheduled) {
    return (
      <div className={SITE_RAIL_OFFSET}>
        <SiteHeader />
        <UpcomingGamePreview
          game={gameData}
          onRefresh={() => window.location.reload()}
          leagueSlug={leagueSlug}
        />
      </div>
    );
  }

  const statusLower = normalizeGameStatus(gameData.status);
  let isLive = isLiveGameStatus(statusLower);
  let isFinal = isFinalGameStatus(statusLower);

  const latestEvent = liveEvents && liveEvents.length > 0 ? liveEvents[0] : null;
  const currentPeriod = latestEvent?.period || null;
  const currentClock = latestEvent?.clock || null;

  // Only auto-expire to FINAL if the DB status is ambiguous (not explicitly live/in_progress).
  // If the status field explicitly says live, trust it — don't override with the time check.
  const statusIsExplicitlyLive = isLiveGameStatus(statusLower);
  if (isLive && !statusIsExplicitlyLive) {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
    const now = new Date();
    if (latestEvent?.created_at) {
      const timeSinceLastEvent = now.getTime() - new Date(latestEvent.created_at).getTime();
      if (timeSinceLastEvent >= FOUR_HOURS_MS) {
        isLive = false;
        isFinal = true;
      }
    } else {
      const matchDate = new Date(gameData.matchtime);
      const timeSinceStart = now.getTime() - matchDate.getTime();
      if (isNaN(timeSinceStart) || timeSinceStart >= FOUR_HOURS_MS) {
        isLive = false;
        isFinal = true;
      }
    }
  }

  // Show stats section if game is live/final OR if stats data already exists
  const hasStatsData = (teamStats?.length ?? 0) > 0 || (playerStats?.length ?? 0) > 0;
  const isGamePlayed = isFinal || isLive || hasStatsData;

  // Find team stats — try side-based match first, fall back to name match
  const hasSideTeamData = teamStats?.some(t => t.side === "1" || t.side === "2");
  const homeTeamStats = hasSideTeamData
    ? teamStats?.find(t => t.side === "1")
    : teamStats?.find(t => t.name === gameData?.hometeam);
  const awayTeamStats = hasSideTeamData
    ? teamStats?.find(t => t.side === "2")
    : teamStats?.find(t => t.name === gameData?.awayteam);

  // Score from team_stats; fall back to latest live event score string ("home-away")
  const latestScoredEvent = liveEvents?.find(e => e.score && e.score.includes('-'));
  const liveEventScores = latestScoredEvent?.score
    ? latestScoredEvent.score.split('-').map(Number)
    : null;
  const homeScore = homeTeamStats?.tot_spoints ?? (liveEventScores ? liveEventScores[0] : null);
  const awayScore = awayTeamStats?.tot_spoints ?? (liveEventScores ? liveEventScores[1] : null);

  const heroState: GameHeroState = isLive
    ? 'live'
    : isFinal || hasStatsData
      ? 'final'
      : new Date(gameData.matchtime) > new Date() ? 'upcoming' : 'pending';

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <SiteHeader />
      {gameData?.league_id && (
        <GameSwitcherBar leagueId={gameData.league_id} currentGameKey={gameKey} isTestMode={isTestMode} />
      )}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <button
          onClick={() => navigate(leagueSlug ? `/competition/${leagueSlug}` : '/')}
          className="ch-btn ch-btn-ghost h-9 px-3 text-sm mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          {leagueSlug ? 'Back to League' : 'Back to Home'}
        </button>

        <div>
          <GameScoreHero
            leagueId={gameData.league_id}
            homeTeam={gameData.hometeam}
            awayTeam={gameData.awayteam}
            homeScore={isGamePlayed ? homeScore : null}
            awayScore={isGamePlayed ? awayScore : null}
            state={heroState}
            liveLabel={isLive && currentPeriod
              ? `${currentPeriod <= 4 ? `Q${currentPeriod}` : `OT${currentPeriod - 4}`}${currentClock ? ` · ${currentClock.split(':').slice(0, 2).join(':')}` : ''}`
              : null}
            homeSub={homeTeamRecord ? `${homeTeamRecord.wins}-${homeTeamRecord.losses}` : undefined}
            awaySub={awayTeamRecord ? `${awayTeamRecord.wins}-${awayTeamRecord.losses}` : undefined}
            homeHref={teamPath(gameData.hometeam, leagueSlug) || undefined}
            awayHref={teamPath(gameData.awayteam, leagueSlug) || undefined}
            colors={colors}
            badges={isTestMode ? (
              <span className="rounded-full bg-purple-600 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white">Test mode</span>
            ) : null}
            meta={[
              { icon: <Calendar />, label: formatDate(gameData.matchtime) },
              { icon: <Clock />, label: formatTime(gameData.matchtime) },
              ...(gameData.competitionname ? [{ icon: <MapPin />, label: gameData.competitionname }] : []),
            ]}
            footer={lastUpdatedText ? (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                Updated {lastUpdatedText}
              </span>
            ) : null}
          />

          <div className="mt-4 md:mt-5">
            {!isGamePlayed ? (
              <div className="space-y-4 md:space-y-6">
                {/* Countdown Timer */}
                {timeLeft && (
                  <div className="ch-card p-4 md:p-6">
                    <h3 className="ch-eyebrow text-center mb-3 md:mb-4">
                      <Clock className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                      Countdown to Tip-Off
                    </h3>
                    <div className="grid grid-cols-4 gap-2 md:gap-4 max-w-md mx-auto">
                      <div className="ch-tile p-2 md:p-3 text-center">
                        <div className="ch-display ch-num text-3xl md:text-5xl font-bold text-[color:var(--ch-text)]">{timeLeft.days}</div>
                        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">Days</div>
                      </div>
                      <div className="ch-tile p-2 md:p-3 text-center">
                        <div className="ch-display ch-num text-3xl md:text-5xl font-bold text-[color:var(--ch-text)]">{timeLeft.hours.toString().padStart(2, '0')}</div>
                        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">Hours</div>
                      </div>
                      <div className="ch-tile p-2 md:p-3 text-center">
                        <div className="ch-display ch-num text-3xl md:text-5xl font-bold text-[color:var(--ch-text)]">{timeLeft.minutes.toString().padStart(2, '0')}</div>
                        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">Mins</div>
                      </div>
                      <div className="ch-tile p-2 md:p-3 text-center">
                        <div className="ch-display ch-num text-3xl md:text-5xl font-bold text-[color:var(--ch-text)]">{timeLeft.seconds.toString().padStart(2, '0')}</div>
                        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">Secs</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Team Form - Last 5 Games */}
                <div className="ch-card p-4 md:p-5">
                  <h3 className="ch-eyebrow mb-3.5 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5" />
                    Recent Form
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Home Team Form */}
                    <div className="ch-tile p-3 md:p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-[color:var(--ch-text)] truncate">{gameData.hometeam}</span>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span className="text-xs text-[color:var(--ch-muted)] mr-1 md:mr-2">Last 5:</span>
                        {homeTeamForm && homeTeamForm.length > 0 ? (
                          homeTeamForm.map((result, idx) => (
                            <div
                              key={idx}
                              className={`w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center font-bold text-xs md:text-sm ${
                                result.won
                                  ? 'bg-[color:var(--ch-win)] text-white'
                                  : 'bg-[color:var(--ch-loss)] text-white'
                              }`}
                            >
                              {result.won ? 'W' : 'L'}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-[color:var(--ch-muted)]">No games yet</span>
                        )}
                      </div>
                    </div>

                    {/* Away Team Form */}
                    <div className="ch-tile p-3 md:p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-[color:var(--ch-text)] truncate">{gameData.awayteam}</span>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span className="text-xs text-[color:var(--ch-muted)] mr-1 md:mr-2">Last 5:</span>
                        {awayTeamForm && awayTeamForm.length > 0 ? (
                          awayTeamForm.map((result, idx) => (
                            <div
                              key={idx}
                              className={`w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center font-bold text-xs md:text-sm ${
                                result.won
                                  ? 'bg-[color:var(--ch-win)] text-white'
                                  : 'bg-[color:var(--ch-loss)] text-white'
                              }`}
                            >
                              {result.won ? 'W' : 'L'}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-[color:var(--ch-muted)]">No games yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Players to Watch */}
                <div className="ch-card p-4 md:p-5">
                  <h3 className="ch-eyebrow mb-3.5 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" />
                    Players to Watch
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Home Team Top Players */}
                    <div className="space-y-2 md:space-y-3">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[color:var(--ch-border)]">
                        <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-[color:var(--ch-text)] truncate">{gameData.hometeam}</span>
                      </div>
                      {homeTeamRoster && homeTeamRoster.length > 0 ? (
                        homeTeamRoster.map((player, idx) => (
                          <div key={idx} className="ch-tile p-2.5 md:p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                              {player.photoUrl ? (
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[color:var(--ch-border-strong)]">
                                  <img 
                                    src={player.photoUrl} 
                                    alt={player.name}
                                    className="w-full h-full object-cover"
                                    style={{ objectPosition: `center ${player.photoFocusY}%` }}
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-[color:var(--ch-surface-3)] rounded-full flex items-center justify-center text-[color:var(--ch-text-2)] font-bold text-xs md:text-sm flex-shrink-0">
                                  {idx + 1}
                                </div>
                              )}
                              <span className="font-medium text-sm md:text-base text-[color:var(--ch-text)] truncate">{player.name}</span>
                            </div>
                            <div className="flex gap-2 md:gap-3 text-xs md:text-sm flex-shrink-0">
                              <div className="text-center">
                                <div className="font-bold text-[color:var(--ch-text)]">{player.ppg}</div>
                                <div className="text-[color:var(--ch-muted)]">PPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-[color:var(--ch-text-2)]">{player.rpg}</div>
                                <div className="text-[color:var(--ch-muted)]">RPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-[color:var(--ch-text-2)]">{player.apg}</div>
                                <div className="text-[color:var(--ch-muted)]">APG</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[color:var(--ch-muted)] text-sm">No player data available</p>
                      )}
                    </div>

                    {/* Away Team Top Players */}
                    <div className="space-y-2 md:space-y-3">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-[color:var(--ch-border)]">
                        <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-[color:var(--ch-text)] truncate">{gameData.awayteam}</span>
                      </div>
                      {awayTeamRoster && awayTeamRoster.length > 0 ? (
                        awayTeamRoster.map((player, idx) => (
                          <div key={idx} className="ch-tile p-2.5 md:p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                              {player.photoUrl ? (
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-[color:var(--ch-border-strong)]">
                                  <img 
                                    src={player.photoUrl} 
                                    alt={player.name}
                                    className="w-full h-full object-cover"
                                    style={{ objectPosition: `center ${player.photoFocusY}%` }}
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-[color:var(--ch-surface-3)] rounded-full flex items-center justify-center text-[color:var(--ch-text-2)] font-bold text-xs md:text-sm flex-shrink-0">
                                  {idx + 1}
                                </div>
                              )}
                              <span className="font-medium text-sm md:text-base text-[color:var(--ch-text)] truncate">{player.name}</span>
                            </div>
                            <div className="flex gap-2 md:gap-3 text-xs md:text-sm flex-shrink-0">
                              <div className="text-center">
                                <div className="font-bold text-[color:var(--ch-text)]">{player.ppg}</div>
                                <div className="text-[color:var(--ch-muted)]">PPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-[color:var(--ch-text-2)]">{player.rpg}</div>
                                <div className="text-[color:var(--ch-muted)]">RPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-[color:var(--ch-text-2)]">{player.apg}</div>
                                <div className="text-[color:var(--ch-muted)]">APG</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[color:var(--ch-muted)] text-sm">No player data available</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coming Soon Notice */}
                <div className="ch-card p-4 text-center">
                  <p className="text-[color:var(--ch-text-2)] text-sm">
                    Live stats and play-by-play data will appear when the game starts.
                  </p>
                </div>
              </div>
            ) : (
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
              <div className="min-w-0">
              {feedItems.length > 0 && (
                <div className="mb-4 lg:hidden">
                  <LiveFeedStrip
                    items={feedItems}
                    players={feedPlayers}
                    shots={feedShots}
                    homeTeam={gameData.hometeam}
                    awayTeam={gameData.awayteam}
                    homeColor={colors.homeFill}
                    awayColor={colors.awayFill}
                    isLive={isLive}
                    leagueId={gameData.league_id}
                  />
                </div>
              )}
              <Tabs defaultValue={initialTab} className="w-full">
                <TabsList className={GAME_TAB_LIST_CLASS}>
                  <TabsTrigger value="game" className={GAME_TAB_TRIGGER_CLASS}>Game</TabsTrigger>
                  <TabsTrigger value="boxscore" className={GAME_TAB_TRIGGER_CLASS}>Box Score</TabsTrigger>
                  <TabsTrigger value="teamstats" className={GAME_TAB_TRIGGER_CLASS}>Team Stats</TabsTrigger>
                  <TabsTrigger value="shotchart" className={GAME_TAB_TRIGGER_CLASS}>Shots</TabsTrigger>
                  <TabsTrigger value="feed" className={GAME_TAB_TRIGGER_CLASS}>Play by Play</TabsTrigger>
                </TabsList>

                <TabsContent value="game" className="mt-0">
                  <GameOverviewSections
                    homeTeam={gameData.hometeam}
                    awayTeam={gameData.awayteam}
                    leagueId={gameData.league_id}
                    home={teamStats && teamStats.length >= 2 ? homeTeamStats ?? null : null}
                    away={teamStats && teamStats.length >= 2 ? awayTeamStats ?? null : null}
                    homePlayers={homePlayerStats.map(toLeader)}
                    awayPlayers={awayPlayerStats.map(toLeader)}
                    events={liveEvents}
                    colors={colors}
                    recap={isFinal && homeScore != null && awayScore != null ? gameRecap({
                      home: gameData.hometeam,
                      away: gameData.awayteam,
                      homeScore,
                      awayScore,
                      competition: gameData.competitionname,
                      date: gameData.matchtime,
                      quarters: ([1, 2, 3, 4] as const).map((q) => ({
                        home: homeTeamStats?.[`p${q}_score`] || 0,
                        away: awayTeamStats?.[`p${q}_score`] || 0,
                      })),
                      topHome: homePlayerStats[0] ? { name: leaderName(homePlayerStats[0]), pts: homePlayerStats[0].spoints, reb: homePlayerStats[0].sreboundstotal, ast: homePlayerStats[0].sassists } : null,
                      topAway: awayPlayerStats[0] ? { name: leaderName(awayPlayerStats[0]), pts: awayPlayerStats[0].spoints, reb: awayPlayerStats[0].sreboundstotal, ast: awayPlayerStats[0].sassists } : null,
                    }) : []}
                  />
                </TabsContent>

                <TabsContent value="boxscore" className="mt-0 space-y-5">
                  {statsLoading ? (
                    <div className="space-y-4">
                      <div className="ch-skel h-48 !rounded-[14px]" />
                      <div className="ch-skel h-48 !rounded-[14px]" />
                    </div>
                  ) : (
                    <>
                      <BoxScoreTable
                        players={homePlayerStats.map((p) => ({ ...p, href: playerHref(p) }))}
                        teamName={gameData.hometeam}
                        teamHref={teamPath(gameData.hometeam, leagueSlug)}
                        score={homeScore}
                        leagueId={gameData.league_id}
                        headerColor={colors.homeFill}
                        formatMinutes={parseMinutes}
                      />
                      <BoxScoreTable
                        players={awayPlayerStats.map((p) => ({ ...p, href: playerHref(p) }))}
                        teamName={gameData.awayteam}
                        teamHref={teamPath(gameData.awayteam, leagueSlug)}
                        score={awayScore}
                        leagueId={gameData.league_id}
                        headerColor={colors.awayFill}
                        formatMinutes={parseMinutes}
                      />
                    </>
                  )}
                </TabsContent>

                <TabsContent value="teamstats" className="mt-0">
                  <TeamStatsComparison
                    homeTeam={gameData.hometeam}
                    awayTeam={gameData.awayteam}
                    home={teamStats && teamStats.length >= 2 ? homeTeamStats ?? null : null}
                    away={teamStats && teamStats.length >= 2 ? awayTeamStats ?? null : null}
                    colors={colors}
                  />
                </TabsContent>

                <TabsContent value="shotchart" className="mt-0">
                  <TeamSplitShotChart
                    shots={shotChartData || []}
                    loading={shotChartLoading}
                    emptyMessage="No shot data is available for this game yet."
                    homeTeam={gameData.hometeam}
                    awayTeam={gameData.awayteam}
                    showPlayerFilter
                    showQuarterFilter
                    showResultFilter
                  />
                </TabsContent>

                <TabsContent value="feed" className="mt-0">
                  <PlayByPlay
                    events={liveEvents || []}
                    homeTeam={gameData.hometeam}
                    awayTeam={gameData.awayteam}
                    emptyMessage={isTestMode ? 'No play-by-play events yet. Events will appear here as the game progresses.' : 'Play-by-play data coming soon.'}
                    describeEvent={(event) => event.description || buildEventDescription(event.action_type || 'event', event.sub_type, event.success, event.points)}
                  />
                </TabsContent>
              </Tabs>
              </div>
              {feedItems.length > 0 && (
                <aside className="hidden lg:block lg:sticky lg:top-20" aria-label="Game feed">
                  <LiveFeedPanel
                    items={feedItems}
                    players={feedPlayers}
                    shots={feedShots}
                    homeTeam={gameData.hometeam}
                    awayTeam={gameData.awayteam}
                    homeColor={colors.homeFill}
                    awayColor={colors.awayFill}
                    isLive={isLive}
                    leagueId={gameData.league_id}
                    className="max-h-[calc(100vh-7rem)]"
                  />
                </aside>
              )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating AI assistant — query stats without leaving the game */}
      {gameData?.league_id && (
        <LeagueChatbot
          isFloatingWidget
          leagueId={gameData.league_id}
          leagueName={gameData.competitionname || 'League'}
          leagueSlug={leagueSlug}
          suggestedQuestions={gameSuggestions}
        />
      )}
    </div>
  );
}
