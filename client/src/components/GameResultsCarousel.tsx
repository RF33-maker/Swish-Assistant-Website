import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";
import { CheckCircle2, Clock, ChevronLeft, ChevronRight } from "lucide-react";

interface GameItem {
  game_key: string;
  game_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: 'LIVE' | 'FINAL' | 'SCHEDULED';
  current_period?: number | null;
  current_clock?: string | null;
}

interface GameClickData {
  gameKey: string;
  status: 'LIVE' | 'FINAL' | 'SCHEDULED';
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  homeScore: number | null;
  awayScore: number | null;
}

interface GameResultsCarouselProps {
  leagueId: string;
  onGameClick: (data: GameClickData) => void;
}

type FilterTab = "results" | "live" | "upcoming";

function formatDateUK(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { 
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London'
  }).toUpperCase();
}

function formatTimeUK(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-GB', { 
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London'
  });
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today • ${formatTimeUK(dateStr)}`;
  }
  if (diffDays === 1 && diffMs > 0) {
    return 'Yesterday';
  }
  if (diffDays === 1 && diffMs < 0) {
    return `Tomorrow • ${formatTimeUK(dateStr)}`;
  }
  return `${formatDateUK(dateStr)} • ${formatTimeUK(dateStr)}`;
}

export default function GameResultsCarousel({ leagueId, onGameClick }: GameResultsCarouselProps) {
  const [allGames, setAllGames] = useState<GameItem[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("results");
  const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchGames = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const { data: teamStatsData, error: teamStatsError } = await supabase
        .from("team_stats")
        .select("game_key, name, tot_spoints, created_at, numeric_id")
        .eq("league_id", leagueId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });
      
      if (teamStatsError) {
        console.error("Error fetching team stats:", teamStatsError);
      }

      const gamesWithStats: GameItem[] = [];
      const processedGameKeys = new Set<string>();
      
      const gameMap = new Map<string, any[]>();
      if (teamStatsData && teamStatsData.length > 0) {
        teamStatsData.forEach(stat => {
          const key = stat.game_key || stat.numeric_id;
          if (key) {
            if (!gameMap.has(key)) {
              gameMap.set(key, []);
            }
            gameMap.get(key)!.push(stat);
          }
        });
      }

      const statsGameKeys = Array.from(gameMap.keys());
      let scheduleHomeAwayMap = new Map<string, { hometeam: string; awayteam: string; matchtime: string; status: string | null }>();
      if (statsGameKeys.length > 0) {
        const { data: schedLookup } = await supabase
          .from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime, status")
          .eq("league_id", leagueId)
          .in("game_key", statsGameKeys);
        if (schedLookup) {
          schedLookup.forEach(s => {
            if (s.game_key) {
              scheduleHomeAwayMap.set(s.game_key, { hometeam: s.hometeam, awayteam: s.awayteam, matchtime: s.matchtime, status: s.status });
            }
          });
        }
      }

      gameMap.forEach((teams, gameKey) => {
        if (teams.length === 2) {
          processedGameKeys.add(gameKey);
          
          const schedInfo = scheduleHomeAwayMap.get(gameKey);
          let home_team: string, away_team: string, home_score: number, away_score: number;
          
          if (schedInfo) {
            home_team = schedInfo.hometeam;
            away_team = schedInfo.awayteam;
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            const homeNorm = normalize(schedInfo.hometeam);
            const awayNorm = normalize(schedInfo.awayteam);
            const homeStats = teams.find(t => normalize(t.name) === homeNorm);
            const awayStats = teams.find(t => normalize(t.name) === awayNorm);
            home_score = homeStats?.tot_spoints ?? (awayStats ? teams.find(t => t !== awayStats)?.tot_spoints ?? 0 : teams[0].tot_spoints || 0);
            away_score = awayStats?.tot_spoints ?? (homeStats ? teams.find(t => t !== homeStats)?.tot_spoints ?? 0 : teams[1].tot_spoints || 0);
          } else {
            home_team = teams[0].name;
            away_team = teams[1].name;
            home_score = teams[0].tot_spoints || 0;
            away_score = teams[1].tot_spoints || 0;
          }

          const dbStatus = (schedInfo?.status || '').toLowerCase();
          const isDbLive = dbStatus === 'live' || dbStatus === 'in_progress' || dbStatus.includes('live');
          
          gamesWithStats.push({
            game_key: gameKey,
            game_id: gameKey,
            game_date: schedInfo?.matchtime || teams[0].created_at,
            home_team,
            away_team,
            home_score,
            away_score,
            status: isDbLive ? 'LIVE' : 'FINAL'
          });
        }
      });

      gamesWithStats.sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());

      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const { data: scheduleData, error: scheduleError } = await supabase
        .from("game_schedule")
        .select("game_key, matchtime, hometeam, awayteam, status")
        .eq("league_id", leagueId)
        .gte("matchtime", sevenDaysAgo.toISOString())
        .lte("matchtime", sevenDaysAhead.toISOString())
        .order("matchtime", { ascending: true });

      if (scheduleError) {
        console.error("Error fetching schedule:", scheduleError);
      }

      const upcomingGames: GameItem[] = [];
      const scheduleLiveGames: GameItem[] = [];
      
      if (scheduleData) {
        scheduleData.forEach(game => {
          if (!game.hometeam || !game.awayteam || !game.game_key) return;
          if (processedGameKeys.has(game.game_key)) return;

          const statusLower = (game.status || '').toLowerCase();
          const isLive = statusLower === 'live' || statusLower === 'in_progress' || statusLower.includes('live');
          const isFinal = statusLower === 'final' || statusLower === 'finished';
          
          if (isFinal) return;
          
          const gameItem: GameItem = {
            game_key: game.game_key,
            game_id: game.game_key,
            game_date: game.matchtime,
            home_team: game.hometeam,
            away_team: game.awayteam,
            home_score: null,
            away_score: null,
            status: isLive ? 'LIVE' : 'SCHEDULED'
          };

          if (isLive) {
            scheduleLiveGames.push(gameItem);
          } else {
            const gameTime = new Date(game.matchtime);
            if (gameTime > now) {
              upcomingGames.push(gameItem);
            }
          }
        });
      }

      const combined: GameItem[] = [
        ...gamesWithStats,
        ...scheduleLiveGames,
        ...upcomingGames
      ];

      const allLive = combined.filter(g => g.status === 'LIVE');
      if (allLive.length > 0) {
        const liveKeys = allLive.map(g => g.game_key);
        const { data: liveEventsData } = await supabase
          .from("live_events")
          .select("game_key, period, clock, created_at")
          .in("game_key", liveKeys)
          .order("created_at", { ascending: false });

        const latestByGame: Record<string, { period: number; clock: string; created_at: string }> = {};
        if (liveEventsData) {
          liveEventsData.forEach(ev => {
            if (!latestByGame[ev.game_key]) {
              latestByGame[ev.game_key] = { period: ev.period, clock: ev.clock, created_at: ev.created_at };
            }
          });
        }

        const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
        combined.forEach(game => {
          if (game.status !== 'LIVE') return;
          const latest = latestByGame[game.game_key];
          if (latest) {
            game.current_period = latest.period;
            game.current_clock = latest.clock;
            const timeSinceLastEvent = now.getTime() - new Date(latest.created_at).getTime();
            if (timeSinceLastEvent >= FOUR_HOURS_MS) {
              game.status = 'FINAL';
            }
          } else {
            const matchDate = new Date(game.game_date);
            const timeSinceStart = now.getTime() - matchDate.getTime();
            if (isNaN(timeSinceStart) || timeSinceStart >= FOUR_HOURS_MS) {
              game.status = 'FINAL';
            }
          }
        });
      }

      const finalLiveCount = combined.filter(g => g.status === 'LIVE').length;

      if (!hasSetDefaultTab) {
        if (finalLiveCount > 0) {
          setActiveTab("live");
        } else if (combined.some(g => g.status === 'FINAL')) {
          setActiveTab("results");
        } else {
          setActiveTab("upcoming");
        }
        setHasSetDefaultTab(true);
      }

      setAllGames(combined);
    } catch (error) {
      console.error("Error fetching games:", error);
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  useEffect(() => {
    if (leagueId) {
      fetchGames();
    }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const interval = setInterval(() => {
      fetchGames(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [leagueId]);

  const filteredGames = useMemo(() => {
    const games = allGames.filter(g => {
      if (activeTab === 'live') return g.status === 'LIVE';
      if (activeTab === 'results') return g.status === 'FINAL';
      return g.status === 'SCHEDULED';
    });

    if (activeTab === 'results') {
      return games.sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());
    }
    return games.sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime());
  }, [allGames, activeTab]);

  const tabCounts = useMemo(() => {
    let results = 0, live = 0, upcoming = 0;
    allGames.forEach(g => {
      if (g.status === 'FINAL') results++;
      else if (g.status === 'LIVE') live++;
      else upcoming++;
    });
    return { results, live, upcoming };
  }, [allGames]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [activeTab]);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  if (loading) {
    return (
      <div className="px-3 md:px-4">
        <div className="flex gap-3 md:gap-4 animate-pulse py-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white/10 rounded-xl h-28 w-64 md:w-72 flex-shrink-0"></div>
          ))}
        </div>
      </div>
    );
  }

  if (allGames.length === 0) {
    return (
      <div className="text-center text-slate-400 py-6">
        No games available
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between border-b border-white/10 px-3 md:px-4">
        <div className="flex items-center">
          <button
            onClick={() => setActiveTab("results")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === "results"
                ? "border-orange-400 text-orange-400"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Results</span>
            {tabCounts.results > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
                activeTab === "results" ? "bg-orange-400/20 text-orange-400" : "bg-white/10"
              }`}>{tabCounts.results}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === "live"
                ? "border-red-400 text-red-400"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${tabCounts.live > 0 ? 'bg-red-500 animate-pulse' : 'bg-white/30'}`}></span>
            <span>Live</span>
            {tabCounts.live > 0 && (
              <span className="text-[10px] bg-red-500/20 text-red-400 rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">{tabCounts.live}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
              activeTab === "upcoming"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Upcoming</span>
            {tabCounts.upcoming > 0 && (
              <span className={`text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
                activeTab === "upcoming" ? "bg-blue-400/20 text-blue-400" : "bg-white/10"
              }`}>{tabCounts.upcoming}</span>
            )}
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-1">
          <button onClick={scrollLeft} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={scrollRight} className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="overflow-x-auto pb-2 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-white/30"
        >
          {filteredGames.length === 0 ? (
            <div className="flex items-center justify-center py-6 px-4">
              <span className="text-sm text-white/40">
                {activeTab === "live" ? "No live games right now" : activeTab === "results" ? "No recent results" : "No upcoming games scheduled"}
              </span>
            </div>
          ) : (
            <div className="flex items-stretch gap-2 md:gap-3 px-3 md:px-4 py-3 min-w-max">
              {filteredGames.map((game) => (
                <div
                  key={game.game_key}
                  className={`rounded-xl p-3 flex-shrink-0 cursor-pointer transition-all w-[200px] sm:w-[240px] md:w-[280px] ${
                    game.status === 'LIVE'
                      ? 'bg-gradient-to-br from-red-500/20 to-orange-500/10 border border-red-500/40 hover:border-red-400'
                      : 'bg-white/5 border border-white/10 hover:border-white/25 hover:bg-white/10'
                  }`}
                  onClick={() => onGameClick({
                    gameKey: game.game_key,
                    status: game.status,
                    homeTeam: game.home_team,
                    awayTeam: game.away_team,
                    gameDate: game.game_date,
                    homeScore: game.home_score,
                    awayScore: game.away_score
                  })}
                >
                  <div className="flex justify-between items-center mb-2">
                    {game.status === 'LIVE' && (
                      <span className="text-[10px] sm:text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                        {game.current_period ? `Q${game.current_period}` : 'Live'}
                        {game.current_clock ? ` ${game.current_clock}` : ''}
                      </span>
                    )}
                    {game.status === 'FINAL' && (
                      <span className="text-[10px] sm:text-xs font-semibold text-green-400/80 uppercase tracking-wider">Final</span>
                    )}
                    {game.status === 'SCHEDULED' && (
                      <span className="text-[10px] sm:text-xs font-semibold text-blue-400/80 uppercase tracking-wider">Scheduled</span>
                    )}
                    <span className="text-[10px] sm:text-xs text-white/40">{formatRelativeDate(game.game_date)}</span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <TeamLogo teamName={game.home_team} leagueId={leagueId} size="sm" />
                        <span className="text-xs sm:text-sm font-semibold text-white truncate">{game.home_team}</span>
                      </div>
                      <span className={`text-base sm:text-lg font-bold tabular-nums ml-2 ${
                        game.status === 'LIVE' ? 'text-red-400' : 'text-white'
                      }`}>
                        {game.status === 'SCHEDULED' ? '-' : (game.home_score ?? '-')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <TeamLogo teamName={game.away_team} leagueId={leagueId} size="sm" />
                        <span className="text-xs sm:text-sm font-semibold text-white truncate">{game.away_team}</span>
                      </div>
                      <span className={`text-base sm:text-lg font-bold tabular-nums ml-2 ${
                        game.status === 'LIVE' ? 'text-red-400' : 'text-white'
                      }`}>
                        {game.status === 'SCHEDULED' ? '-' : (game.away_score ?? '-')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
