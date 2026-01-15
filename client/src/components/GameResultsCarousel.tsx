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
  const [displayMode, setDisplayMode] = useState<'live' | 'results' | 'upcoming'>('results');

  useEffect(() => {
    const fetchGames = async () => {
      setLoading(true);
      
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

        // Fetch upcoming games from game_schedule
        const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const { data: scheduleData, error: scheduleError } = await supabase
          .from("game_schedule")
          .select("game_key, matchtime, hometeam, awayteam, status")
          .eq("league_id", leagueId)
          .gte("matchtime", now.toISOString())
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
              liveGames.push(gameItem);
            } else {
              upcomingGames.push(gameItem);
            }
          });
        }

        // Determine what to display: LIVE > Results > Upcoming
        if (liveGames.length > 0) {
          setGames(liveGames.slice(0, 10));
          setDisplayMode('live');
        } else if (completedGames.length > 0) {
          // Show most recent 10 completed games
          setGames(completedGames.slice(0, 10));
          setDisplayMode('results');
        } else if (upcomingGames.length > 0) {
          setGames(upcomingGames.slice(0, 10));
          setDisplayMode('upcoming');
        } else {
          setGames([]);
        }
      } catch (error) {
        console.error("Error fetching games:", error);
      } finally {
        setLoading(false);
      }
    };

    if (leagueId) {
      fetchGames();
    }
  }, [leagueId]);

  const animationDuration = games.length > 0 ? games.length * 8 : 40;

  if (loading) {
    return (
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex gap-3 md:gap-4 animate-pulse">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="bg-gray-800 rounded-lg h-16 w-64 md:w-80 flex-shrink-0"></div>
          ))}
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center text-white/70 py-4">
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
        return <span className="text-xs font-medium text-white bg-red-600 px-2 py-1 rounded animate-pulse">LIVE</span>;
      case 'FINAL':
        return <span className="text-xs font-medium text-gray-300 bg-gray-700 px-2 py-1 rounded">FINAL</span>;
      case 'SCHEDULED':
        return <span className="text-xs font-medium text-orange-300 bg-orange-700/50 px-2 py-1 rounded">SCHEDULED</span>;
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
            className="bg-gray-800 rounded-lg p-3 md:p-4 flex-shrink-0 cursor-pointer hover:bg-gray-700 transition-colors border border-gray-700 min-w-[280px] md:min-w-[320px]"
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
              <div className="text-xs text-gray-400">
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
                  <div className="text-white font-bold text-sm md:text-base">
                    {getTeamAbbr(game.away_team)}
                  </div>
                </div>
                <div className="text-xl md:text-2xl font-bold text-white">
                  {game.status === 'SCHEDULED' ? '-' : (game.away_score ?? '-')}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TeamLogo teamName={game.home_team} leagueId={leagueId} size="sm" />
                  <div className="text-white font-bold text-sm md:text-base">
                    {getTeamAbbr(game.home_team)}
                  </div>
                </div>
                <div className="text-xl md:text-2xl font-bold text-white">
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
