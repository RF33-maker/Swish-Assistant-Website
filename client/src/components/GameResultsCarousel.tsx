import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";

interface GameItem {
  game_key: string;
  game_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: 'LIVE' | 'FINAL' | 'SCHEDULED';
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

export default function GameResultsCarousel({ leagueId, onGameClick }: GameResultsCarouselProps) {
  const [games, setGames] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

  const fetchGames = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    
    try {
      const now = new Date();
      
      // Fetch completed games from team_stats (these have actual scores)
      // Get recent games - last 30 days by created_at
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const { data: teamStatsData, error: teamStatsError } = await supabase
        .from("team_stats")
        .select("game_key, name, tot_spoints, is_home, created_at, numeric_id")
        .eq("league_id", leagueId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });
      
      if (teamStatsError) {
        console.error("Error fetching team stats:", teamStatsError);
      }

      // Build completed games from team_stats
      const completedGames: GameItem[] = [];
      const processedGameKeys = new Set<string>();
      
      if (teamStatsData && teamStatsData.length > 0) {
        // Group by game_key
        const gameMap = new Map<string, any[]>();
        teamStatsData.forEach(stat => {
          const key = stat.game_key || stat.numeric_id;
          if (key) {
            if (!gameMap.has(key)) {
              gameMap.set(key, []);
            }
            gameMap.get(key)!.push(stat);
          }
        });

        gameMap.forEach((teams, gameKey) => {
          if (teams.length === 2) {
            processedGameKeys.add(gameKey);
            
            const homeTeam = teams.find(t => t.is_home === true);
            const awayTeam = teams.find(t => t.is_home === false);
            
            let home_team: string, away_team: string, home_score: number, away_score: number;
            
            if (homeTeam && awayTeam) {
              home_team = homeTeam.name;
              away_team = awayTeam.name;
              home_score = homeTeam.tot_spoints || 0;
              away_score = awayTeam.tot_spoints || 0;
            } else {
              // Fallback if is_home not set - use first as home, second as away
              home_team = teams[0].name;
              away_team = teams[1].name;
              home_score = teams[0].tot_spoints || 0;
              away_score = teams[1].tot_spoints || 0;
            }
            
            completedGames.push({
              game_key: gameKey,
              game_id: gameKey,
              game_date: teams[0].created_at,
              home_team,
              away_team,
              home_score,
              away_score,
              status: 'FINAL'
            });
          }
        });
      }

      // Sort completed games by date (most recent first)
      completedGames.sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());

      // Fetch all games from game_schedule (past week + next week for live detection)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      const { data: scheduleData, error: scheduleError } = await supabase
        .from("game_schedule")
        .select("game_key, matchtime, hometeam, awayteam, status, home_score, away_score")
        .eq("league_id", leagueId)
        .gte("matchtime", sevenDaysAgo.toISOString())
        .lte("matchtime", sevenDaysAhead.toISOString())
        .order("matchtime", { ascending: true });

      if (scheduleError) {
        console.error("Error fetching schedule:", scheduleError);
      }

      const upcomingGames: GameItem[] = [];
      const liveGames: GameItem[] = [];
      
      if (scheduleData) {
        scheduleData.forEach(game => {
          if (!game.hometeam || !game.awayteam || !game.game_key) return;
          // Skip if we already have this game as completed
          if (processedGameKeys.has(game.game_key)) return;

          const statusLower = (game.status || '').toLowerCase();
          const isLive = statusLower === 'live' || statusLower === 'in_progress';
          const isFinal = statusLower === 'final' || statusLower === 'finished';
          
          // Skip finished games from schedule if we don't have stats for them yet
          if (isFinal) return;
          
          const gameItem: GameItem = {
            game_key: game.game_key,
            game_id: game.game_key,
            game_date: game.matchtime,
            home_team: game.hometeam,
            away_team: game.awayteam,
            home_score: (game as any).home_score ?? null,
            away_score: (game as any).away_score ?? null,
            status: isLive ? 'LIVE' : 'SCHEDULED'
          };

          if (isLive) {
            liveGames.push(gameItem);
          } else {
            // Only include future games as upcoming
            const gameTime = new Date(game.matchtime);
            if (gameTime > now) {
              upcomingGames.push(gameItem);
            }
          }
        });
      }

      // Combine all games: LIVE first, then recent FINAL, then SCHEDULED
      const allGames: GameItem[] = [
        ...liveGames,
        ...completedGames.slice(0, 5),
        ...upcomingGames.slice(0, 5)
      ];

      setGames(allGames.slice(0, 15));
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

  // Auto-refresh every 30 seconds to detect live games
  useEffect(() => {
    if (!leagueId) return;
    
    const interval = setInterval(() => {
      fetchGames(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [leagueId]);

  const animationDuration = games.length > 0 ? games.length * 8 : 40;

  if (loading) {
    return (
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 md:gap-4 animate-pulse">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="bg-orange-100 dark:bg-neutral-800 rounded-lg h-24 w-64 md:w-80 flex-shrink-0"></div>
          ))}
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center text-slate-500 dark:text-slate-400 py-4">
        No games available
      </div>
    );
  }

  const getTeamAbbr = (teamName: string) => {
    return teamName.substring(0, 3).toUpperCase();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'LIVE':
        return <span className="text-xs font-semibold text-white bg-red-500 px-2 py-1 rounded-full animate-pulse shadow-sm">LIVE</span>;
      case 'FINAL':
        return <span className="text-xs font-semibold text-white bg-green-600 px-2 py-1 rounded-full">FINAL</span>;
      case 'SCHEDULED':
        return <span className="text-xs font-semibold text-white bg-orange-500 px-2 py-1 rounded-full">UPCOMING</span>;
      default:
        return null;
    }
  };

  const duplicatedGames = [...games, ...games];
  const desktopCardWidth = 320;
  const desktopGap = 16;
  const trackWidth = duplicatedGames.length * (desktopCardWidth + desktopGap);

  return (
    <div className="w-full overflow-hidden">
      <div 
        className="flex gap-3 md:gap-4 px-3 md:px-4 py-2"
        style={{
          width: `${trackWidth}px`,
          animation: `scroll ${animationDuration}s linear infinite`,
          animationPlayState: isPaused ? 'paused' : 'running'
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {duplicatedGames.map((game, index) => (
          <div
            key={`carousel-game-${index}`}
            className={`rounded-xl p-3 md:p-4 flex-shrink-0 cursor-pointer transition-all min-w-[280px] md:min-w-[320px] shadow-sm hover:shadow-md ${
              game.status === 'LIVE' 
                ? 'bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/50 dark:to-neutral-900 border-2 border-red-400 dark:border-red-600' 
                : 'bg-white dark:bg-neutral-900 border border-orange-200 dark:border-neutral-700 hover:border-orange-400 dark:hover:border-orange-600'
            }`}
            style={{ width: '280px' }}
            onClick={() => onGameClick({
              gameKey: game.game_key,
              status: game.status,
              homeTeam: game.home_team,
              awayTeam: game.away_team,
              gameDate: game.game_date,
              homeScore: game.home_score,
              awayScore: game.away_score
            })}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex justify-between items-center mb-2 md:mb-3">
              {getStatusBadge(game.status)}
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {game.status === 'SCHEDULED' ? (
                  <span>{formatDateUK(game.game_date)} • {formatTimeUK(game.game_date)}</span>
                ) : (
                  formatDateUK(game.game_date)
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TeamLogo teamName={game.away_team} leagueId={leagueId} size="sm" />
                  <div className="text-slate-800 dark:text-white font-bold text-sm md:text-base">
                    {getTeamAbbr(game.away_team)}
                  </div>
                </div>
                <div className={`text-xl md:text-2xl font-bold ${game.status === 'LIVE' ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
                  {game.status === 'SCHEDULED' ? '-' : (game.away_score ?? '-')}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TeamLogo teamName={game.home_team} leagueId={leagueId} size="sm" />
                  <div className="text-slate-800 dark:text-white font-bold text-sm md:text-base">
                    {getTeamAbbr(game.home_team)}
                  </div>
                </div>
                <div className={`text-xl md:text-2xl font-bold ${game.status === 'LIVE' ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
                  {game.status === 'SCHEDULED' ? '-' : (game.home_score ?? '-')}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
