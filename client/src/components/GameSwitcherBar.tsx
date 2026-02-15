import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";
import { generateGameSlug } from "@/lib/gameSlug";
import { CheckCircle2, Clock, Radio } from "lucide-react";

interface Game {
  game_key: string;
  hometeam: string;
  awayteam: string;
  matchtime: string;
  status: string | null;
  home_score?: number | null;
  away_score?: number | null;
  current_period?: number | null;
  current_clock?: string | null;
}

type FilterTab = "results" | "live" | "upcoming";

interface GameSwitcherBarProps {
  leagueId: string;
  currentGameKey: string;
  isTestMode: boolean;
}

export function GameSwitcherBar({ leagueId, currentGameKey, isTestMode }: GameSwitcherBarProps) {
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [activeTab, setActiveTab] = useState<FilterTab>("results");
  const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [, navigate] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const db = useMemo(() => {
    return isTestMode ? supabase.schema("test") : supabase;
  }, [isTestMode]);

  const fetchGames = async () => {
      const now = new Date();
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysFromNow = new Date(now);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      let fetchedGames: any[] = [];

      const [liveResponse, rangeResponse] = await Promise.all([
        db
          .from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime, status")
          .eq("league_id", leagueId)
          .or("status.ilike.%live%,status.eq.in_progress"),
        db
          .from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime, status")
          .eq("league_id", leagueId)
          .gte("matchtime", sevenDaysAgo.toISOString())
          .lte("matchtime", sevenDaysFromNow.toISOString())
          .order("matchtime", { ascending: true })
      ]);

      fetchedGames = [...(liveResponse.data || []), ...(rangeResponse.data || [])];

      const uniqueGames = fetchedGames.filter((game, index, self) =>
        index === self.findIndex(g => g.game_key === game.game_key)
      );

      if (uniqueGames.length > 0) {
        const gameKeys = uniqueGames.map(g => g.game_key);
        const { data: teamStatsData } = await db
          .from("team_stats")
          .select("game_key, name, tot_spoints")
          .in("game_key", gameKeys);

        const scoresByGame: Record<string, { home_score?: number; away_score?: number }> = {};

        if (teamStatsData) {
          teamStatsData.forEach(stat => {
            if (!scoresByGame[stat.game_key]) {
              scoresByGame[stat.game_key] = {};
            }
            const game = uniqueGames.find(g => g.game_key === stat.game_key);
            if (game) {
              const statNameLower = (stat.name || '').toLowerCase().trim();
              const homeTeamLower = (game.hometeam || '').toLowerCase().trim();
              const awayTeamLower = (game.awayteam || '').toLowerCase().trim();

              if (statNameLower === homeTeamLower ||
                  statNameLower.includes(homeTeamLower) ||
                  homeTeamLower.includes(statNameLower)) {
                scoresByGame[stat.game_key].home_score = stat.tot_spoints;
              } else if (statNameLower === awayTeamLower ||
                         statNameLower.includes(awayTeamLower) ||
                         awayTeamLower.includes(statNameLower)) {
                scoresByGame[stat.game_key].away_score = stat.tot_spoints;
              }
            }
          });
        }

        uniqueGames.forEach(game => {
          game.home_score = scoresByGame[game.game_key]?.home_score;
          game.away_score = scoresByGame[game.game_key]?.away_score;
        });
      }

      const live = uniqueGames.filter(g => getGameCategory(g) === 'live');
      setLiveCount(live.length);

      if (live.length > 0) {
        const liveKeys = live.map(g => g.game_key);
        const { data: liveEventsData } = await db
          .from("live_events")
          .select("game_key, period, clock, created_at")
          .in("game_key", liveKeys)
          .order("created_at", { ascending: false });

        if (liveEventsData) {
          const latestByGame: Record<string, { period: number; clock: string }> = {};
          liveEventsData.forEach(ev => {
            if (!latestByGame[ev.game_key]) {
              latestByGame[ev.game_key] = { period: ev.period, clock: ev.clock };
            }
          });
          uniqueGames.forEach(game => {
            if (latestByGame[game.game_key]) {
              game.current_period = latestByGame[game.game_key].period;
              game.current_clock = latestByGame[game.game_key].clock;
            }
          });
        }
      }

      if (!hasSetDefaultTab) {
        if (live.length > 0) {
          setActiveTab("live");
        } else {
          const results = uniqueGames.filter(g => getGameCategory(g) === 'results');
          setActiveTab(results.length > 0 ? "results" : "upcoming");
        }
        setHasSetDefaultTab(true);
      }

      setAllGames(uniqueGames);
  };

  useEffect(() => {
    if (leagueId) {
      fetchGames();
      const interval = setInterval(fetchGames, 15000);
      return () => clearInterval(interval);
    }
  }, [leagueId, isTestMode]);

  const getGameCategory = (game: Game): FilterTab => {
    const statusLower = (game.status || '').toLowerCase();
    if (statusLower === 'live' || statusLower === 'in_progress' || statusLower.includes('live')) {
      return 'live';
    }
    if (statusLower === 'final' || statusLower === 'finished' || statusLower === 'completed') {
      return 'results';
    }
    const matchTime = new Date(game.matchtime);
    const now = new Date();
    if (matchTime < now) {
      return 'results';
    }
    return 'upcoming';
  };

  const filteredGames = useMemo(() => {
    const games = allGames.filter(g => getGameCategory(g) === activeTab);

    if (activeTab === 'results') {
      return games.sort((a, b) => new Date(b.matchtime).getTime() - new Date(a.matchtime).getTime());
    }
    return games.sort((a, b) => new Date(a.matchtime).getTime() - new Date(b.matchtime).getTime());
  }, [allGames, activeTab]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [activeTab]);

  const getTeamAbbr = (teamName: string): string => {
    const words = teamName.replace(/Senior Men|Senior Women|I+$/gi, '').trim().split(' ');
    if (words.length >= 2) {
      return (words[0].substring(0, 3) + words[1].substring(0, 1)).toUpperCase();
    }
    return teamName.substring(0, 4).toUpperCase();
  };

  const formatGameDate = (matchtime: string): string => {
    const date = new Date(matchtime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1 && diffMs > 0) {
      return 'Yesterday';
    }
    if (diffDays === 1 && diffMs < 0) {
      return 'Tomorrow';
    }
    return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const handleGameClick = (game: Game) => {
    if (game.game_key === currentGameKey) return;
    const modeParam = isTestMode ? "?mode=test" : "";
    const slug = generateGameSlug(game.hometeam, game.awayteam, game.matchtime);
    navigate(`/game/${slug}${modeParam}`);
  };

  const tabCounts = useMemo(() => {
    let results = 0, live = 0, upcoming = 0;
    allGames.forEach(g => {
      const cat = getGameCategory(g);
      if (cat === 'results') results++;
      else if (cat === 'live') live++;
      else upcoming++;
    });
    return { results, live, upcoming };
  }, [allGames]);

  if (allGames.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="flex items-center border-b border-white/10">
        <button
          onClick={() => setActiveTab("results")}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
            activeTab === "results"
              ? "border-orange-400 text-orange-400"
              : "border-transparent text-white/60 hover:text-white/80"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Results</span>
          {tabCounts.results > 0 && (
            <span className="text-[10px] bg-white/10 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{tabCounts.results}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("live")}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
            activeTab === "live"
              ? "border-red-400 text-red-400"
              : "border-transparent text-white/60 hover:text-white/80"
          }`}
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-white/30'}`}></span>
          <span>Live</span>
          {tabCounts.live > 0 && (
            <span className="text-[10px] bg-red-500/20 text-red-400 rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">{tabCounts.live}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("upcoming")}
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
            activeTab === "upcoming"
              ? "border-blue-400 text-blue-400"
              : "border-transparent text-white/60 hover:text-white/80"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Upcoming</span>
          {tabCounts.upcoming > 0 && (
            <span className="text-[10px] bg-white/10 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{tabCounts.upcoming}</span>
          )}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-slate-800 [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-500"
      >
        {filteredGames.length === 0 ? (
          <div className="flex items-center justify-center py-3 px-4">
            <span className="text-xs text-white/40">
              {activeTab === "live" ? "No live games right now" : activeTab === "results" ? "No recent results" : "No upcoming games"}
            </span>
          </div>
        ) : (
          <div className="flex items-stretch gap-1 px-2 py-2 min-w-max">
            {filteredGames.map((game) => {
              const category = getGameCategory(game);
              const isCurrent = game.game_key === currentGameKey;

              return (
                <button
                  key={game.game_key}
                  onClick={() => handleGameClick(game)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all min-w-[100px] sm:min-w-[120px] ${
                    isCurrent
                      ? 'bg-orange-500 text-white ring-1 ring-orange-400'
                      : 'bg-white/5 hover:bg-white/15 text-white/90'
                  }`}
                >
                  <span className={`text-[10px] ${isCurrent ? 'text-white/80' : 'text-white/40'}`}>
                    {formatGameDate(game.matchtime)}
                  </span>

                  <div className="flex items-center gap-1.5 w-full justify-center">
                    <div className="flex items-center gap-1 flex-1 justify-end">
                      <span className="text-[11px] sm:text-xs font-medium truncate max-w-[40px] sm:max-w-[50px]">{getTeamAbbr(game.hometeam)}</span>
                      <TeamLogo teamName={game.hometeam} leagueId={leagueId} size="xs" />
                    </div>

                    <div className="flex items-center gap-0.5 min-w-[40px] justify-center">
                      {(category === 'live' || category === 'results') && game.home_score != null && game.away_score != null ? (
                        <span className="text-xs sm:text-sm font-bold tabular-nums">
                          {game.home_score} - {game.away_score}
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/30">vs</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-1 justify-start">
                      <TeamLogo teamName={game.awayteam} leagueId={leagueId} size="xs" />
                      <span className="text-[11px] sm:text-xs font-medium truncate max-w-[40px] sm:max-w-[50px]">{getTeamAbbr(game.awayteam)}</span>
                    </div>
                  </div>

                  {category === 'live' && (
                    <span className="text-[9px] sm:text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                      {game.current_period
                        ? `${game.current_period <= 4 ? `Q${game.current_period}` : `OT${game.current_period - 4}`}${game.current_clock ? ` ${game.current_clock.split(':').slice(0, 2).join(':')}` : ''}`
                        : 'Live'}
                    </span>
                  )}
                  {category === 'results' && (
                    <span className={`text-[9px] sm:text-[10px] ${isCurrent ? 'text-white/70' : 'text-green-400/70'} uppercase tracking-wider`}>
                      Final
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
