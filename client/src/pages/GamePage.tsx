import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { GameSwitcherBar } from "@/components/GameSwitcherBar";
import { ArrowLeft, Clock, MapPin, Calendar, Users, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface GameSchedule {
  game_key: string;
  league_id: string;
  matchtime: string;
  hometeam: string;
  awayteam: string;
  status: string | null;
  competitionname: string | null;
}

interface PlayerStat {
  firstname: string;
  familyname: string;
  team_name: string;
  side: string;
  spoints: number;
  sreboundstotal: number;
  sassists: number;
  ssteals: number;
  sblocks: number;
  sturnovers: number;
  sfieldgoalsmade: number;
  sfieldgoalsattempted: number;
  sthreepointersmade: number;
  sthreepointersattempted: number;
  sfreethrowsmade: number;
  sfreethrowsattempted: number;
  sminutes: string;
}

interface TeamStat {
  name: string;
  side: string;
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
  description: string | null;
  score: string;
  success: boolean;
  scoring: boolean;
  points: number | null;
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

function formatMatchTime(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London'
  });
}

function formatDate(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London'
  });
}

function formatTime(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London'
  });
}

function getStatusBadge(status: string | null, matchtime: string) {
  const normalizedStatus = status?.toLowerCase() || '';
  const now = new Date();
  const gameTime = new Date(matchtime);
  
  if (normalizedStatus === 'final' || normalizedStatus === 'finished') {
    return <span className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-full">FINAL</span>;
  }
  if (normalizedStatus === 'live' || normalizedStatus === 'in_progress') {
    return <span className="px-3 py-1 bg-red-500 text-white text-sm font-semibold rounded-full animate-pulse">LIVE</span>;
  }
  if (gameTime > now) {
    return <span className="px-3 py-1 bg-orange-500 text-white text-sm font-semibold rounded-full">SCHEDULED</span>;
  }
  return <span className="px-3 py-1 bg-slate-500 text-white text-sm font-semibold rounded-full">PENDING</span>;
}

function parseMinutes(minutesStr: string | null | undefined): string {
  if (!minutesStr) return '0:00';
  if (minutesStr.includes(':')) return minutesStr;
  const mins = parseFloat(minutesStr);
  const wholeMins = Math.floor(mins);
  const secs = Math.round((mins - wholeMins) * 60);
  return `${wholeMins}:${secs.toString().padStart(2, '0')}`;
}

function getTeamAbbr(teamName: string): string {
  if (!teamName) return '';
  const words = teamName.trim().split(/\s+/);
  if (words.length === 1) {
    return teamName.substring(0, 3).toUpperCase();
  }
  // Use first letter of each word, max 3 letters
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

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
  const gameKey = params.gameKey ? decodeURIComponent(params.gameKey) : '';
  const [, navigate] = useLocation();

  // Read mode query param for test schema support
  const searchParams = new URLSearchParams(window.location.search);
  const isTestMode = searchParams.get("mode") === "test";
  
  // Create schema-scoped Supabase client (test schema when mode=test, otherwise public)
  const db = isTestMode ? supabase.schema("test") : supabase;

  const { data: gameData, isLoading: gameLoading, error: gameError } = useQuery({
    queryKey: ['game-schedule', gameKey, isTestMode],
    queryFn: async () => {
      const { data, error } = await db
        .from('game_schedule')
        .select('game_key, league_id, matchtime, hometeam, awayteam, status, competitionname')
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
        .from('leagues')
        .select('slug')
        .eq('league_id', gameData.league_id)
        .single();
      
      if (error) return null;
      return data;
    },
    enabled: !!gameData?.league_id
  });

  const { data: playerStats, isLoading: statsLoading } = useQuery({
    queryKey: ['game-player-stats', gameKey, isTestMode],
    queryFn: async () => {
      console.log(`[GamePage] Fetching player_stats for game_key: ${gameKey}, testMode: ${isTestMode}`);
      const { data, error } = await db
        .from('player_stats')
        .select('*')
        .eq('game_key', gameKey);
      
      console.log(`[GamePage] player_stats result:`, { count: data?.length, error });
      // Log first record to see actual field structure
      if (data && data.length > 0) {
        console.log(`[GamePage] player_stats sample record:`, JSON.stringify(data[0]));
        console.log(`[GamePage] player_stats all field names:`, Object.keys(data[0]));
      }
      if (error) throw error;
      return data as PlayerStat[];
    },
    enabled: !!gameKey && !!gameData,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const { data: teamStats } = useQuery({
    queryKey: ['game-team-stats', gameKey, isTestMode],
    queryFn: async () => {
      console.log(`[GamePage] Fetching team_stats for game_key: ${gameKey}, testMode: ${isTestMode}`);
      const { data, error } = await db
        .from('team_stats')
        .select('*')
        .eq('game_key', gameKey);
      
      console.log(`[GamePage] team_stats result:`, { count: data?.length, error });
      // Log first record to see actual field structure
      if (data && data.length > 0) {
        console.log(`[GamePage] team_stats sample record:`, JSON.stringify(data[0]));
        console.log(`[GamePage] team_stats all field names:`, Object.keys(data[0]));
      }
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
      console.log(`[GamePage] Fetching live_events for game_key: ${gameKey}, testMode: ${isTestMode}`);
      const { data, error } = await db
        .from('live_events')
        .select('*')
        .eq('game_key', gameKey)
        .order('created_at', { ascending: false });
      
      console.log(`[GamePage] live_events result:`, { count: data?.length, error });
      // Log first record to see actual field structure
      if (data && data.length > 0) {
        console.log(`[GamePage] live_events sample record:`, JSON.stringify(data[0]));
        console.log(`[GamePage] live_events all field names:`, Object.keys(data[0]));
      }
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
  const isScheduled = gameData ? (
    new Date(gameData.matchtime) > new Date() && 
    gameData.status?.toLowerCase() !== 'live' && 
    gameData.status?.toLowerCase() !== 'final' &&
    gameData.status?.toLowerCase() !== 'finished'
  ) : false;

  // Fetch home team ID
  const { data: homeTeamData } = useQuery({
    queryKey: ['team-lookup-game', gameData?.league_id, gameData?.hometeam, isTestMode],
    queryFn: async () => {
      if (!gameData) return null;
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
    enabled: !!gameData && isScheduled
  });

  // Fetch away team ID
  const { data: awayTeamData } = useQuery({
    queryKey: ['team-lookup-game', gameData?.league_id, gameData?.awayteam, isTestMode],
    queryFn: async () => {
      if (!gameData) return null;
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
    enabled: !!gameData && isScheduled
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
        .select('firstname, familyname, spoints, sreboundstotal, sassists, sminutes')
        .eq('league_id', gameData.league_id)
        .eq('team_id', homeTeamId);
      
      if (error) throw error;
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const name = `${stat.firstname || ''} ${stat.familyname || ''}`.trim();
        if (!playerMap.has(name)) {
          playerMap.set(name, { name, games: 0, points: 0, rebounds: 0, assists: 0, minutes: 0 });
        }
        const player = playerMap.get(name);
        const mins = parseMinutesToDecimal(stat.sminutes);
        if (mins > 0) {
          player.games += 1;
          player.points += stat.spoints || 0;
          player.rebounds += stat.sreboundstotal || 0;
          player.assists += stat.sassists || 0;
          player.minutes += mins;
        }
      });

      const top3 = Array.from(playerMap.values())
        .filter(p => p.games > 0)
        .map(p => ({
          ...p,
          ppg: (p.points / p.games).toFixed(1),
          rpg: (p.rebounds / p.games).toFixed(1),
          apg: (p.assists / p.games).toFixed(1),
          photoUrl: null as string | null,
          photoFocusY: 30 as number,
        }))
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 3);

      // Look up player photos
      for (const player of top3) {
        try {
          const { data: playerData } = await db
            .from('players')
            .select('photo_path, photo_focus_y')
            .ilike('full_name', `%${player.name}%`)
            .not('photo_path', 'is', null)
            .limit(1);
          
          if (playerData && playerData.length > 0 && playerData[0].photo_path) {
            const { data: urlData } = supabase.storage
              .from('player-photos')
              .getPublicUrl(playerData[0].photo_path);
            player.photoUrl = urlData.publicUrl;
            player.photoFocusY = playerData[0].photo_focus_y ?? 30;
          }
        } catch (err) {
          // Silently fail - fallback to numbered circle
        }
      }

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
        .select('firstname, familyname, spoints, sreboundstotal, sassists, sminutes')
        .eq('league_id', gameData.league_id)
        .eq('team_id', awayTeamId);
      
      if (error) throw error;
      
      const playerMap = new Map();
      data?.forEach(stat => {
        const name = `${stat.firstname || ''} ${stat.familyname || ''}`.trim();
        if (!playerMap.has(name)) {
          playerMap.set(name, { name, games: 0, points: 0, rebounds: 0, assists: 0, minutes: 0 });
        }
        const player = playerMap.get(name);
        const mins = parseMinutesToDecimal(stat.sminutes);
        if (mins > 0) {
          player.games += 1;
          player.points += stat.spoints || 0;
          player.rebounds += stat.sreboundstotal || 0;
          player.assists += stat.sassists || 0;
          player.minutes += mins;
        }
      });

      const top3 = Array.from(playerMap.values())
        .filter(p => p.games > 0)
        .map(p => ({
          ...p,
          ppg: (p.points / p.games).toFixed(1),
          rpg: (p.rebounds / p.games).toFixed(1),
          apg: (p.assists / p.games).toFixed(1),
          photoUrl: null as string | null,
          photoFocusY: 30 as number,
        }))
        .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
        .slice(0, 3);

      // Look up player photos
      for (const player of top3) {
        try {
          const { data: playerData } = await db
            .from('players')
            .select('photo_path, photo_focus_y')
            .ilike('full_name', `%${player.name}%`)
            .not('photo_path', 'is', null)
            .limit(1);
          
          if (playerData && playerData.length > 0 && playerData[0].photo_path) {
            const { data: urlData } = supabase.storage
              .from('player-photos')
              .getPublicUrl(playerData[0].photo_path);
            player.photoUrl = urlData.publicUrl;
            player.photoFocusY = playerData[0].photo_focus_y ?? 30;
          }
        } catch (err) {
          // Silently fail - fallback to numbered circle
        }
      }

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

  if (gameLoading) {
    return (
      <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-32 mb-6 bg-orange-100 dark:bg-neutral-700" />
          <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-orange-100 dark:border-neutral-800">
            <div className="flex justify-between items-center mb-8">
              <Skeleton className="h-24 w-24 rounded-full bg-orange-100 dark:bg-neutral-700" />
              <Skeleton className="h-12 w-24 bg-orange-100 dark:bg-neutral-700" />
              <Skeleton className="h-24 w-24 rounded-full bg-orange-100 dark:bg-neutral-700" />
            </div>
            <Skeleton className="h-64 w-full bg-orange-100 dark:bg-neutral-700" />
          </div>
        </div>
      </div>
    );
  }

  if (gameError || !gameData) {
    return (
      <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950 text-slate-800 dark:text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Game Not Found</h1>
          <p className="text-slate-500 mb-6">The game you're looking for doesn't exist or has been removed.</p>
          <button 
            onClick={() => navigate('/')} 
            className="text-orange-500 hover:text-orange-600 flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const isGamePlayed = gameData.status?.toLowerCase() === 'final' || 
                       gameData.status?.toLowerCase() === 'finished' ||
                       gameData.status?.toLowerCase() === 'live';
  
  const homeTeamStats = teamStats?.find(t => t.side === "1");
  const awayTeamStats = teamStats?.find(t => t.side === "2");
  
  const homeScore = homeTeamStats?.tot_spoints ?? null;
  const awayScore = awayTeamStats?.tot_spoints ?? null;

  const homePlayerStats = playerStats?.filter(p => p.side === "1")
    .sort((a, b) => (b.spoints || 0) - (a.spoints || 0)) || [];

  const awayPlayerStats = playerStats?.filter(p => p.side === "2")
    .sort((a, b) => (b.spoints || 0) - (a.spoints || 0)) || [];

  return (
    <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950 text-slate-800 dark:text-white transition-colors">
      {gameData?.league_id && (
        <GameSwitcherBar leagueId={gameData.league_id} currentGameKey={gameKey} isTestMode={isTestMode} />
      )}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <button 
          onClick={() => navigate(leagueData?.slug ? `/league/${leagueData.slug}` : '/')}
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 mb-6 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          {leagueData?.slug ? 'Back to League' : 'Back to Home'}
        </button>

        <div className="bg-white dark:bg-neutral-900 rounded-xl overflow-hidden shadow-lg border border-orange-100 dark:border-neutral-800">
          <div className="bg-gradient-to-r from-orange-100 via-orange-50 to-orange-100 dark:from-neutral-800 dark:via-neutral-850 dark:to-neutral-800 p-6 md:p-8 border-b border-orange-200 dark:border-neutral-700">
            <div className="flex justify-center items-center gap-2 mb-4">
              {getStatusBadge(gameData.status, gameData.matchtime)}
              {isTestMode && (
                <span className="px-2 py-0.5 bg-purple-600 text-white text-xs font-medium rounded-full">
                  TEST MODE
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 md:gap-8">
              <div className="flex-1 text-center min-w-0">
                <div className="flex justify-center mb-2 md:mb-3">
                  <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="md" className="md:w-20 md:h-20" />
                </div>
                <h2 className="text-sm md:text-xl font-bold text-slate-800 dark:text-white md:truncate hidden md:block">{gameData.hometeam}</h2>
                <h2 className="text-base font-bold text-slate-800 dark:text-white md:hidden">{getTeamAbbr(gameData.hometeam)}</h2>
                <span className="text-xs text-orange-600 dark:text-orange-400">HOME</span>
              </div>

              <div className="flex flex-col items-center flex-shrink-0">
                {isGamePlayed && homeScore !== null && awayScore !== null ? (
                  <div className="flex items-center gap-2 md:gap-4">
                    <span className="text-3xl md:text-6xl font-bold text-slate-800 dark:text-white">{homeScore}</span>
                    <span className="text-xl md:text-2xl text-orange-400">-</span>
                    <span className="text-3xl md:text-6xl font-bold text-slate-800 dark:text-white">{awayScore}</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-xl md:text-3xl font-bold text-orange-500">VS</div>
                  </div>
                )}
              </div>

              <div className="flex-1 text-center min-w-0">
                <div className="flex justify-center mb-2 md:mb-3">
                  <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="md" className="md:w-20 md:h-20" />
                </div>
                <h2 className="text-sm md:text-xl font-bold text-slate-800 dark:text-white md:truncate hidden md:block">{gameData.awayteam}</h2>
                <h2 className="text-base font-bold text-slate-800 dark:text-white md:hidden">{getTeamAbbr(gameData.awayteam)}</h2>
                <span className="text-xs text-orange-600 dark:text-orange-400">AWAY</span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4 mt-6 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(gameData.matchtime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{formatTime(gameData.matchtime)}</span>
              </div>
              {gameData.competitionname && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{gameData.competitionname}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 md:p-6">
            {!isGamePlayed ? (
              <div className="space-y-4 md:space-y-6">
                {/* Countdown Timer */}
                {timeLeft && (
                  <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-4 md:p-6 shadow-md">
                    <h3 className="text-base md:text-lg font-semibold text-white text-center mb-3 md:mb-4">
                      <Clock className="w-4 h-4 md:w-5 md:h-5 inline mr-2" />
                      Countdown to Tip-Off
                    </h3>
                    <div className="grid grid-cols-4 gap-2 md:gap-4 max-w-md mx-auto">
                      <div className="bg-white/20 rounded-lg p-2 md:p-3 text-center">
                        <div className="text-2xl md:text-4xl font-bold text-white">{timeLeft.days}</div>
                        <div className="text-xs md:text-sm text-orange-100">Days</div>
                      </div>
                      <div className="bg-white/20 rounded-lg p-2 md:p-3 text-center">
                        <div className="text-2xl md:text-4xl font-bold text-white">{timeLeft.hours.toString().padStart(2, '0')}</div>
                        <div className="text-xs md:text-sm text-orange-100">Hours</div>
                      </div>
                      <div className="bg-white/20 rounded-lg p-2 md:p-3 text-center">
                        <div className="text-2xl md:text-4xl font-bold text-white">{timeLeft.minutes.toString().padStart(2, '0')}</div>
                        <div className="text-xs md:text-sm text-orange-100">Mins</div>
                      </div>
                      <div className="bg-white/20 rounded-lg p-2 md:p-3 text-center">
                        <div className="text-2xl md:text-4xl font-bold text-white">{timeLeft.seconds.toString().padStart(2, '0')}</div>
                        <div className="text-xs md:text-sm text-orange-100">Secs</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Team Form - Last 5 Games */}
                <div className="bg-orange-50 dark:bg-neutral-800 rounded-xl p-4 md:p-6 border border-orange-100 dark:border-neutral-700">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
                    Recent Form
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Home Team Form */}
                    <div className="bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-orange-100 dark:border-neutral-700">
                      <div className="flex items-center gap-2 mb-3">
                        <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-slate-800 dark:text-white truncate">{gameData.hometeam}</span>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 md:mr-2">Last 5:</span>
                        {homeTeamForm && homeTeamForm.length > 0 ? (
                          homeTeamForm.map((result, idx) => (
                            <div
                              key={idx}
                              className={`w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center font-bold text-xs md:text-sm ${
                                result.won
                                  ? 'bg-green-500 text-white'
                                  : 'bg-red-500 text-white'
                              }`}
                            >
                              {result.won ? 'W' : 'L'}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No games yet</span>
                        )}
                      </div>
                    </div>

                    {/* Away Team Form */}
                    <div className="bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-orange-100 dark:border-neutral-700">
                      <div className="flex items-center gap-2 mb-3">
                        <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-slate-800 dark:text-white truncate">{gameData.awayteam}</span>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 md:mr-2">Last 5:</span>
                        {awayTeamForm && awayTeamForm.length > 0 ? (
                          awayTeamForm.map((result, idx) => (
                            <div
                              key={idx}
                              className={`w-7 h-7 md:w-8 md:h-8 rounded-md flex items-center justify-center font-bold text-xs md:text-sm ${
                                result.won
                                  ? 'bg-green-500 text-white'
                                  : 'bg-red-500 text-white'
                              }`}
                            >
                              {result.won ? 'W' : 'L'}
                            </div>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">No games yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Players to Watch */}
                <div className="bg-orange-50 dark:bg-neutral-800 rounded-xl p-4 md:p-6 border border-orange-100 dark:border-neutral-700">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                    <Users className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
                    Players to Watch
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    {/* Home Team Top Players */}
                    <div className="space-y-2 md:space-y-3">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-orange-200 dark:border-neutral-600">
                        <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-slate-800 dark:text-white truncate">{gameData.hometeam}</span>
                      </div>
                      {homeTeamRoster && homeTeamRoster.length > 0 ? (
                        homeTeamRoster.map((player, idx) => (
                          <div key={idx} className="bg-white dark:bg-neutral-900 rounded-lg p-2.5 md:p-3 flex items-center justify-between border border-orange-100 dark:border-neutral-700">
                            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                              {player.photoUrl ? (
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-orange-500">
                                  <img 
                                    src={player.photoUrl} 
                                    alt={player.name}
                                    className="w-full h-full object-cover"
                                    style={{ objectPosition: `center ${player.photoFocusY}%` }}
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-xs md:text-sm flex-shrink-0">
                                  {idx + 1}
                                </div>
                              )}
                              <span className="font-medium text-sm md:text-base text-slate-800 dark:text-white truncate">{player.name}</span>
                            </div>
                            <div className="flex gap-2 md:gap-3 text-xs md:text-sm flex-shrink-0">
                              <div className="text-center">
                                <div className="font-bold text-orange-500">{player.ppg}</div>
                                <div className="text-slate-500">PPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-slate-700 dark:text-slate-300">{player.rpg}</div>
                                <div className="text-slate-500">RPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-slate-700 dark:text-slate-300">{player.apg}</div>
                                <div className="text-slate-500">APG</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 text-sm italic">No player data available</p>
                      )}
                    </div>

                    {/* Away Team Top Players */}
                    <div className="space-y-2 md:space-y-3">
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-orange-200 dark:border-neutral-600">
                        <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="sm" />
                        <span className="font-medium text-sm md:text-base text-slate-800 dark:text-white truncate">{gameData.awayteam}</span>
                      </div>
                      {awayTeamRoster && awayTeamRoster.length > 0 ? (
                        awayTeamRoster.map((player, idx) => (
                          <div key={idx} className="bg-white dark:bg-neutral-900 rounded-lg p-2.5 md:p-3 flex items-center justify-between border border-orange-100 dark:border-neutral-700">
                            <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
                              {player.photoUrl ? (
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-orange-500">
                                  <img 
                                    src={player.photoUrl} 
                                    alt={player.name}
                                    className="w-full h-full object-cover"
                                    style={{ objectPosition: `center ${player.photoFocusY}%` }}
                                  />
                                </div>
                              ) : (
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-xs md:text-sm flex-shrink-0">
                                  {idx + 1}
                                </div>
                              )}
                              <span className="font-medium text-sm md:text-base text-slate-800 dark:text-white truncate">{player.name}</span>
                            </div>
                            <div className="flex gap-2 md:gap-3 text-xs md:text-sm flex-shrink-0">
                              <div className="text-center">
                                <div className="font-bold text-orange-500">{player.ppg}</div>
                                <div className="text-slate-500">PPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-slate-700 dark:text-slate-300">{player.rpg}</div>
                                <div className="text-slate-500">RPG</div>
                              </div>
                              <div className="text-center hidden sm:block">
                                <div className="font-bold text-slate-700 dark:text-slate-300">{player.apg}</div>
                                <div className="text-slate-500">APG</div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-500 text-sm italic">No player data available</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coming Soon Notice */}
                <div className="bg-orange-50 dark:bg-neutral-800/50 rounded-lg p-4 text-center border border-orange-100 dark:border-neutral-700">
                  <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Live stats and play-by-play data will appear when the game starts.
                  </p>
                </div>
              </div>
            ) : (
              <Tabs defaultValue="boxscore" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-orange-100 dark:bg-neutral-800 mb-4">
                  <TabsTrigger value="boxscore" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Box Score</TabsTrigger>
                  <TabsTrigger value="teamstats" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Team Stats</TabsTrigger>
                  <TabsTrigger value="playbyplay" className="data-[state=active]:bg-orange-500 data-[state=active]:text-white">Play-by-Play</TabsTrigger>
                </TabsList>

                <TabsContent value="boxscore" className="space-y-6">
                  {statsLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-48 w-full bg-orange-100 dark:bg-neutral-700" />
                      <Skeleton className="h-48 w-full bg-orange-100 dark:bg-neutral-700" />
                    </div>
                  ) : (
                    <>
                      <div className="bg-white dark:bg-neutral-800 rounded-lg overflow-hidden border border-orange-100 dark:border-neutral-700">
                        <div className="bg-orange-500 px-4 py-3 flex items-center gap-3 text-white">
                          <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="sm" />
                          <h4 className="font-semibold">{gameData.hometeam}</h4>
                          {homeScore !== null && <span className="ml-auto text-2xl font-bold">{homeScore}</span>}
                        </div>
                        {homePlayerStats.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-orange-50 dark:bg-neutral-900 text-slate-600 dark:text-slate-400">
                                <tr>
                                  <th className="text-left py-2 px-3 sticky left-0 bg-orange-50 dark:bg-neutral-900">Player</th>
                                  <th className="text-center py-2 px-2">MIN</th>
                                  <th className="text-center py-2 px-2">PTS</th>
                                  <th className="text-center py-2 px-2">REB</th>
                                  <th className="text-center py-2 px-2">AST</th>
                                  <th className="text-center py-2 px-2">STL</th>
                                  <th className="text-center py-2 px-2">BLK</th>
                                  <th className="text-center py-2 px-2">TO</th>
                                  <th className="text-center py-2 px-2">FG</th>
                                  <th className="text-center py-2 px-2">3PT</th>
                                  <th className="text-center py-2 px-2">FT</th>
                                </tr>
                              </thead>
                              <tbody className="text-slate-800 dark:text-slate-200">
                                {homePlayerStats.map((player, idx) => (
                                  <tr key={idx} className="border-t border-orange-100 dark:border-neutral-700 hover:bg-orange-50 dark:hover:bg-neutral-800">
                                    <td className="py-2 px-3 sticky left-0 bg-white dark:bg-neutral-800 font-medium whitespace-nowrap">
                                      {player.firstname} {player.familyname}
                                    </td>
                                    <td className="text-center py-2 px-2 text-slate-500">{parseMinutes(player.sminutes)}</td>
                                    <td className="text-center py-2 px-2 font-semibold text-orange-500">{player.spoints || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sreboundstotal || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sassists || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500">{player.ssteals || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500">{player.sblocks || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500">{player.sturnovers || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">
                                      {player.sfieldgoalsmade || 0}/{player.sfieldgoalsattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">
                                      {player.sthreepointersmade || 0}/{player.sthreepointersattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">
                                      {player.sfreethrowsmade || 0}/{player.sfreethrowsattempted || 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="p-4 text-slate-500 text-center italic">No player stats available</p>
                        )}
                      </div>

                      <div className="bg-white dark:bg-neutral-800 rounded-lg overflow-hidden border border-orange-100 dark:border-neutral-700">
                        <div className="bg-orange-500 px-4 py-3 flex items-center gap-3 text-white">
                          <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="sm" />
                          <h4 className="font-semibold">{gameData.awayteam}</h4>
                          {awayScore !== null && <span className="ml-auto text-2xl font-bold">{awayScore}</span>}
                        </div>
                        {awayPlayerStats.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-orange-50 dark:bg-neutral-900 text-slate-600 dark:text-slate-400">
                                <tr>
                                  <th className="text-left py-2 px-3 sticky left-0 bg-orange-50 dark:bg-neutral-900">Player</th>
                                  <th className="text-center py-2 px-2">MIN</th>
                                  <th className="text-center py-2 px-2">PTS</th>
                                  <th className="text-center py-2 px-2">REB</th>
                                  <th className="text-center py-2 px-2">AST</th>
                                  <th className="text-center py-2 px-2">STL</th>
                                  <th className="text-center py-2 px-2">BLK</th>
                                  <th className="text-center py-2 px-2">TO</th>
                                  <th className="text-center py-2 px-2">FG</th>
                                  <th className="text-center py-2 px-2">3PT</th>
                                  <th className="text-center py-2 px-2">FT</th>
                                </tr>
                              </thead>
                              <tbody className="text-slate-800 dark:text-slate-200">
                                {awayPlayerStats.map((player, idx) => (
                                  <tr key={idx} className="border-t border-orange-100 dark:border-neutral-700 hover:bg-orange-50 dark:hover:bg-neutral-800">
                                    <td className="py-2 px-3 sticky left-0 bg-white dark:bg-neutral-800 font-medium whitespace-nowrap">
                                      {player.firstname} {player.familyname}
                                    </td>
                                    <td className="text-center py-2 px-2 text-slate-500">{parseMinutes(player.sminutes)}</td>
                                    <td className="text-center py-2 px-2 font-semibold text-orange-500">{player.spoints || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sreboundstotal || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sassists || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500">{player.ssteals || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500">{player.sblocks || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500">{player.sturnovers || 0}</td>
                                    <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">
                                      {player.sfieldgoalsmade || 0}/{player.sfieldgoalsattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">
                                      {player.sthreepointersmade || 0}/{player.sthreepointersattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-slate-500 whitespace-nowrap">
                                      {player.sfreethrowsmade || 0}/{player.sfreethrowsattempted || 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="p-4 text-slate-500 text-center italic">No player stats available</p>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="teamstats">
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                    {teamStats && teamStats.length >= 2 ? (
                      <div className="grid grid-cols-3 gap-4 text-center text-slate-800 dark:text-slate-200">
                        <div className="font-semibold text-orange-600 dark:text-orange-400">
                          {getTeamAbbr(gameData.hometeam)}
                        </div>
                        <div className="text-slate-500">Stat</div>
                        <div className="font-semibold text-orange-600 dark:text-orange-400">
                          {getTeamAbbr(gameData.awayteam)}
                        </div>

                        <div className="text-2xl font-bold">{homeTeamStats?.tot_spoints || 0}</div>
                        <div className="text-slate-500">Points</div>
                        <div className="text-2xl font-bold">{awayTeamStats?.tot_spoints || 0}</div>

                        <div>{homeTeamStats?.tot_sreboundstotal || 0}</div>
                        <div className="text-slate-500">Rebounds</div>
                        <div>{awayTeamStats?.tot_sreboundstotal || 0}</div>

                        <div>{homeTeamStats?.tot_sassists || 0}</div>
                        <div className="text-slate-500">Assists</div>
                        <div>{awayTeamStats?.tot_sassists || 0}</div>

                        <div>{homeTeamStats?.tot_ssteals || 0}</div>
                        <div className="text-slate-500">Steals</div>
                        <div>{awayTeamStats?.tot_ssteals || 0}</div>

                        <div>{homeTeamStats?.tot_sblocks || 0}</div>
                        <div className="text-slate-500">Blocks</div>
                        <div>{awayTeamStats?.tot_sblocks || 0}</div>

                        <div>{homeTeamStats?.tot_sturnovers || 0}</div>
                        <div className="text-slate-500">Turnovers</div>
                        <div>{awayTeamStats?.tot_sturnovers || 0}</div>

                        <div className="whitespace-nowrap">
                          {homeTeamStats?.tot_sfieldgoalsmade || 0}/{homeTeamStats?.tot_sfieldgoalsattempted || 0}
                        </div>
                        <div className="text-slate-500">FG</div>
                        <div className="whitespace-nowrap">
                          {awayTeamStats?.tot_sfieldgoalsmade || 0}/{awayTeamStats?.tot_sfieldgoalsattempted || 0}
                        </div>

                        <div className="whitespace-nowrap">
                          {homeTeamStats?.tot_sthreepointersmade || 0}/{homeTeamStats?.tot_sthreepointersattempted || 0}
                        </div>
                        <div className="text-slate-500">3PT</div>
                        <div className="whitespace-nowrap">
                          {awayTeamStats?.tot_sthreepointersmade || 0}/{awayTeamStats?.tot_sthreepointersattempted || 0}
                        </div>

                        <div className="whitespace-nowrap">
                          {homeTeamStats?.tot_sfreethrowsmade || 0}/{homeTeamStats?.tot_sfreethrowsattempted || 0}
                        </div>
                        <div className="text-slate-500">FT</div>
                        <div className="whitespace-nowrap">
                          {awayTeamStats?.tot_sfreethrowsmade || 0}/{awayTeamStats?.tot_sfreethrowsattempted || 0}
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500 text-center italic">Team stats will appear when available</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="playbyplay">
                  <div className="bg-white dark:bg-neutral-800 rounded-lg p-4 border border-orange-100 dark:border-neutral-700">
                    {liveEvents && liveEvents.length > 0 ? (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {[...liveEvents].sort((a, b) => {
                          const periodDiff = (b.period || 0) - (a.period || 0);
                          if (periodDiff !== 0) return periodDiff;
                          const parseClockSeconds = (clock: string | null | undefined) => {
                            if (!clock) return 0;
                            const parts = clock.split(':').map(Number);
                            if (parts.length >= 2) return parts[0] * 60 + parts[1];
                            return parts[0] || 0;
                          };
                          return parseClockSeconds(a.clock) - parseClockSeconds(b.clock);
                        }).map((event) => {
                          const actionType = event.action_type || 'event';
                          const subType = event.sub_type;
                          const eventDescription = event.description || buildEventDescription(actionType, subType, event.success, event.points);
                          const clockDisplay = event.clock?.split(':').slice(0, 2).join(':') || '';
                          
                          return (
                            <div 
                              key={event.id} 
                              className={`flex items-start gap-3 p-3 rounded-lg ${
                                event.team_no === 1 
                                  ? 'bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500' 
                                  : 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                              }`}
                            >
                              <div className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400 w-16">
                                <div className="font-semibold">Q{event.period}</div>
                                <div>{clockDisplay}</div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                    event.scoring ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                    actionType === 'foul' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                                    actionType === 'substitution' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                                    actionType === 'turnover' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                    actionType === 'rebound' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                                  }`}>
                                    {actionType.toUpperCase()}
                                  </span>
                                  {event.player_name && (
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                      {event.player_name}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400">{eventDescription}</p>
                              </div>
                              <div className="flex-shrink-0 text-right">
                                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                  {event.score || '0-0'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-slate-500 italic text-center py-8">
                        {isTestMode ? 'No play-by-play events yet. Events will appear here as the game progresses.' : 'Play-by-play data coming soon'}
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
