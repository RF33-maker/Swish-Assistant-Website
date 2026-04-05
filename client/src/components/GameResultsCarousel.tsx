import { useState, useEffect, useMemo, useRef } from "react";
import { supabase, getSupabaseForLeague, getDataLeagueId } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  age_group?: string;
  round?: string;
  hasGamePage?: boolean;
}

interface GameClickData {
  gameKey: string;
  status: 'LIVE' | 'FINAL' | 'SCHEDULED';
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  homeScore: number | null;
  awayScore: number | null;
  hasGamePage?: boolean;
}

interface GameResultsCarouselProps {
  leagueId: string;
  slug?: string;
  onGameClick: (data: GameClickData) => void;
  childLeagueIds?: string[];
  childLeagueMap?: Map<string, string>;
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

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1 && diffMs > 0) {
    return 'Yesterday';
  }
  if (diffDays === 1 && diffMs < 0) {
    return 'Tomorrow';
  }
  return formatDateUK(dateStr);
}

export default function GameResultsCarousel({ leagueId, slug, onGameClick, childLeagueIds, childLeagueMap }: GameResultsCarouselProps) {
  const [allGames, setAllGames] = useState<GameItem[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("results");
  const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const db = useMemo(() => getSupabaseForLeague(slug), [slug]);
  const effectiveLeagueId = useMemo(() => getDataLeagueId(slug, leagueId), [slug, leagueId]);
  const isParent = childLeagueIds && childLeagueIds.length > 0;
  const childIdsKey = childLeagueIds?.join(',') || '';

  const fetchGames = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    
    try {
      const now = new Date();
      
      let gameResultsQuery = db
        .from('v_game_results')
        .select('*');
      gameResultsQuery = isParent
        ? gameResultsQuery.in('league_id', childLeagueIds)
        : gameResultsQuery.eq('league_id', effectiveLeagueId);
      const { data: gameResults, error: gameResultsError } = await gameResultsQuery;

      if (gameResultsError) {
        console.error("Error fetching v_game_results:", gameResultsError);
      }

      const gamesWithStats: GameItem[] = [];
      const processedGameKeys = new Set<string>();
      const viewGameKeys: string[] = [];

      if (gameResults && gameResults.length > 0) {
        gameResults.forEach((game: any) => {
          if (!game.home_team || !game.away_team || !game.game_key) return;
          processedGameKeys.add(game.game_key);
          viewGameKeys.push(game.game_key);

          const ageGroup = (isParent && childLeagueMap && game.league_id)
            ? childLeagueMap.get(game.league_id) || game.age_group || undefined
            : game.age_group || undefined;

          gamesWithStats.push({
            game_key: game.game_key,
            game_id: game.game_key,
            game_date: game.match_time || new Date().toISOString(),
            home_team: game.home_team,
            away_team: game.away_team,
            home_score: game.home_score,
            away_score: game.away_score,
            status: 'FINAL',
            age_group: ageGroup,
            round: game.round || undefined,
            hasGamePage: false,
          });
        });

        gamesWithStats.sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());
      }

      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      let scheduleQuery = db
        .from("game_schedule")
        .select("game_key, matchtime, hometeam, awayteam, status, league_id");
      scheduleQuery = isParent
        ? scheduleQuery.in("league_id", childLeagueIds)
        : scheduleQuery.eq("league_id", effectiveLeagueId);
      const { data: scheduleData, error: scheduleError } = await scheduleQuery
        .gte("matchtime", sevenDaysAgo.toISOString())
        .lte("matchtime", sevenDaysAhead.toISOString())
        .order("matchtime", { ascending: true });

      if (scheduleError) {
        console.error("Error fetching schedule:", scheduleError);
      }

      const scheduleStatusMap = new Map<string, string>();
      const upcomingGames: GameItem[] = [];
      const scheduleLiveGames: GameItem[] = [];
      
      if (scheduleData) {
        scheduleData.forEach(game => {
          if (!game.game_key) return;
          if (game.status) {
            scheduleStatusMap.set(game.game_key, game.status);
          }
          if (!game.hometeam || !game.awayteam) return;
          if (processedGameKeys.has(game.game_key)) return;

          const statusLower = (game.status || '').toLowerCase();
          const isLive = statusLower === 'live' || statusLower === 'in_progress' || statusLower.includes('live');
          const isFinal = statusLower === 'final' || statusLower === 'finished';
          
          if (isFinal) return;
          
          const schedAgeGroup = (isParent && childLeagueMap && game.league_id)
            ? childLeagueMap.get(game.league_id) || undefined
            : undefined;

          const gameItem: GameItem = {
            game_key: game.game_key,
            game_id: game.game_key,
            game_date: game.matchtime,
            home_team: game.hometeam,
            away_team: game.awayteam,
            home_score: null,
            away_score: null,
            status: isLive ? 'LIVE' : 'SCHEDULED',
            age_group: schedAgeGroup,
            hasGamePage: true
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

      const scheduleByGameKey = new Map<string, { hometeam: string; awayteam: string }>();
      if (scheduleData) {
        scheduleData.forEach(game => {
          if (game.game_key && game.hometeam && game.awayteam) {
            scheduleByGameKey.set(game.game_key, { hometeam: game.hometeam, awayteam: game.awayteam });
          }
        });
      }

      const missingKeys = viewGameKeys.filter(k => !scheduleByGameKey.has(k));
      if (missingKeys.length > 0) {
        let extraQuery = db
          .from('game_schedule')
          .select('game_key, hometeam, awayteam')
          .in('game_key', missingKeys);
        extraQuery = isParent
          ? extraQuery.in('league_id', childLeagueIds!)
          : extraQuery.eq('league_id', effectiveLeagueId);
        const { data: extraSchedule } = await extraQuery;
        if (extraSchedule) {
          extraSchedule.forEach(game => {
            if (game.game_key && game.hometeam && game.awayteam) {
              scheduleByGameKey.set(game.game_key, { hometeam: game.hometeam, awayteam: game.awayteam });
            }
          });
        }
      }

      const slugify = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      gamesWithStats.forEach(game => {
        const schedEntry = scheduleByGameKey.get(game.game_key);
        if (schedEntry) {
          const homeMatch = slugify(schedEntry.hometeam) === slugify(game.home_team);
          const awayMatch = slugify(schedEntry.awayteam) === slugify(game.away_team);
          game.hasGamePage = homeMatch && awayMatch;
        }
        const schedStatus = (scheduleStatusMap.get(game.game_key) || '').toLowerCase();
        if (schedStatus === 'live' || schedStatus === 'in_progress' || schedStatus.includes('live')) {
          game.status = 'LIVE';
        }
      });

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
    if (effectiveLeagueId) {
      fetchGames();
    }
  }, [effectiveLeagueId, childIdsKey]);

  useEffect(() => {
    if (!effectiveLeagueId) return;
    const interval = setInterval(() => {
      fetchGames(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [effectiveLeagueId, childIdsKey]);

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

  const formatGameTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Europe/London'
    }).toUpperCase();
  };

  if (loading) {
    return (
      <div className="w-full bg-white/5 border-b border-white/10">
        <div className="flex items-center gap-0 animate-pulse px-2 py-1">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="bg-white/10 rounded h-[52px] w-[160px] flex-shrink-0 mx-0.5"></div>
          ))}
        </div>
      </div>
    );
  }

  if (allGames.length === 0) {
    return (
      <div className="text-center text-slate-400 py-2 text-xs bg-white/5 border-b border-white/10">
        No games available
      </div>
    );
  }

  return (
    <div className="w-full bg-white/5 border-b border-white/10">
      <div className="flex items-stretch">
        <div className="flex items-center gap-0 border-r border-white/10 flex-shrink-0">
          <button
            onClick={() => setActiveTab("results")}
            className={`px-2 sm:px-2.5 py-1 text-[10px] font-semibold transition-all whitespace-nowrap uppercase tracking-wide ${
              activeTab === "results"
                ? "text-orange-400 bg-orange-400/10"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            Results
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={`px-2 sm:px-2.5 py-1 text-[10px] font-semibold transition-all whitespace-nowrap uppercase tracking-wide flex items-center gap-1 ${
              activeTab === "live"
                ? "text-red-400 bg-red-400/10"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            {tabCounts.live > 0 && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>}
            Live
            {tabCounts.live > 0 && (
              <span className="text-[9px] bg-red-500/30 text-red-400 rounded px-1 min-w-[14px] text-center font-bold">{tabCounts.live}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`px-2 sm:px-2.5 py-1 text-[10px] font-semibold transition-all whitespace-nowrap uppercase tracking-wide ${
              activeTab === "upcoming"
                ? "text-blue-400 bg-blue-400/10"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
            }`}
          >
            Upcoming
          </button>
        </div>

        <div className="flex items-center flex-1 min-w-0 relative">
          <button
            onClick={scrollLeft}
            className="hidden sm:flex items-center justify-center w-6 flex-shrink-0 bg-gradient-to-r from-white/10 to-transparent hover:from-white/20 transition-colors z-10"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-white/60" />
          </button>

          <div
            ref={scrollRef}
            className="overflow-x-auto flex-1 [&::-webkit-scrollbar]:h-0 [&::-webkit-scrollbar]:hidden"
            style={{ scrollbarWidth: 'none' }}
          >
            {filteredGames.length === 0 ? (
              <div className="flex items-center justify-center py-2 px-4">
                <span className="text-[10px] text-white/40">
                  {activeTab === "live" ? "No live games" : activeTab === "results" ? "No results" : "No upcoming games"}
                </span>
              </div>
            ) : (
              <div className="flex items-stretch min-w-max">
                {filteredGames.map((game) => (
                  <div
                    key={game.game_key}
                    className={`flex-shrink-0 cursor-pointer transition-all border-r border-white/5 hover:bg-white/10 px-3 py-1.5 ${
                      game.status === 'LIVE' ? 'bg-red-500/5' : ''
                    }`}
                    onClick={() => onGameClick({
                      gameKey: game.game_key,
                      status: game.status,
                      homeTeam: game.home_team,
                      awayTeam: game.away_team,
                      gameDate: game.game_date,
                      homeScore: game.home_score,
                      awayScore: game.away_score,
                      hasGamePage: game.hasGamePage
                    })}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-center flex-shrink-0 w-[36px]">
                        {game.status === 'LIVE' ? (
                          <span className="text-[9px] font-bold text-red-400 uppercase leading-tight flex flex-col items-center">
                            <span className="flex items-center gap-0.5">
                              <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse"></span>
                              LIVE
                            </span>
                            {game.current_period && <span className="text-[8px] text-red-400/70">Q{game.current_period}</span>}
                          </span>
                        ) : game.status === 'SCHEDULED' ? (
                          <span className="text-[9px] text-white/40 leading-tight block">
                            {formatGameTime(game.game_date)}
                          </span>
                        ) : (
                          <span className="text-[9px] text-white/30 leading-tight block uppercase">
                            {formatRelativeDate(game.game_date)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-0.5 min-w-[120px]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <TeamLogo teamName={game.home_team} leagueId={leagueId} size="xs" />
                            <span className="text-[11px] font-medium text-white/90 truncate max-w-[80px]">{game.home_team}</span>
                          </div>
                          <span className={`text-[11px] font-bold tabular-nums ${
                            game.status === 'LIVE' ? 'text-red-400'
                            : game.home_score !== null && game.away_score !== null && game.home_score > game.away_score ? 'text-white' : 'text-white/50'
                          }`}>
                            {game.status === 'SCHEDULED' ? '' : (game.home_score ?? '-')}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <TeamLogo teamName={game.away_team} leagueId={leagueId} size="xs" />
                            <span className="text-[11px] font-medium text-white/90 truncate max-w-[80px]">{game.away_team}</span>
                          </div>
                          <span className={`text-[11px] font-bold tabular-nums ${
                            game.status === 'LIVE' ? 'text-red-400'
                            : game.away_score !== null && game.home_score !== null && game.away_score > game.home_score ? 'text-white' : 'text-white/50'
                          }`}>
                            {game.status === 'SCHEDULED' ? '' : (game.away_score ?? '-')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={scrollRight}
            className="hidden sm:flex items-center justify-center w-6 flex-shrink-0 bg-gradient-to-l from-white/10 to-transparent hover:from-white/20 transition-colors z-10"
          >
            <ChevronRight className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>
      </div>
    </div>
  );
}
