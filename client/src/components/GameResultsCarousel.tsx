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

interface GameResultsCarouselProps {
  leagueId: string;
  onGameClick: (gameKey: string) => void;
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
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const sevenDaysAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const [scheduleResult, teamStatsResult] = await Promise.all([
          supabase
            .from("game_schedule")
            .select("game_key, matchtime, hometeam, awayteam, status")
            .eq("league_id", leagueId)
            .gte("matchtime", sevenDaysAgo.toISOString())
            .lte("matchtime", sevenDaysAhead.toISOString())
            .order("matchtime", { ascending: true }),
          supabase
            .from("team_stats")
            .select("game_key, name, tot_spoints, is_home, game_date")
            .eq("league_id", leagueId)
        ]);

        const { data: scheduleData } = scheduleResult;
        const { data: teamStatsData } = teamStatsResult;

        const scoresByGameKey = new Map<string, { home_score: number; away_score: number }>();
        if (teamStatsData) {
          const gameMap = new Map<string, any[]>();
          teamStatsData.forEach(stat => {
            if (stat.game_key) {
              if (!gameMap.has(stat.game_key)) {
                gameMap.set(stat.game_key, []);
              }
              gameMap.get(stat.game_key)!.push(stat);
            }
          });

          gameMap.forEach((teams, gameKey) => {
            if (teams.length === 2) {
              const homeTeam = teams.find(t => t.is_home === true);
              const awayTeam = teams.find(t => t.is_home === false);
              if (homeTeam && awayTeam) {
                scoresByGameKey.set(gameKey, {
                  home_score: homeTeam.tot_spoints || 0,
                  away_score: awayTeam.tot_spoints || 0
                });
              } else {
                scoresByGameKey.set(gameKey, {
                  home_score: teams[0].tot_spoints || 0,
                  away_score: teams[1].tot_spoints || 0
                });
              }
            }
          });
        }

        const liveGames: GameItem[] = [];
        const resultGames: GameItem[] = [];
        const upcomingGames: GameItem[] = [];

        if (scheduleData) {
          scheduleData.forEach(game => {
            if (!game.hometeam || !game.awayteam || !game.game_key) return;

            const matchTime = new Date(game.matchtime);
            const statusLower = (game.status || '').toLowerCase();
            const scores = scoresByGameKey.get(game.game_key);
            const hasScores = scores !== undefined;

            let gameStatus: 'LIVE' | 'FINAL' | 'SCHEDULED';
            
            if (statusLower === 'live' || statusLower === 'in_progress') {
              gameStatus = 'LIVE';
            } else if (statusLower === 'final' || statusLower === 'finished' || hasScores) {
              gameStatus = 'FINAL';
            } else if (matchTime > now) {
              gameStatus = 'SCHEDULED';
            } else {
              gameStatus = hasScores ? 'FINAL' : 'SCHEDULED';
            }

            const gameItem: GameItem = {
              game_key: game.game_key,
              game_id: game.game_key,
              game_date: game.matchtime,
              home_team: game.hometeam,
              away_team: game.awayteam,
              home_score: scores?.home_score ?? null,
              away_score: scores?.away_score ?? null,
              status: gameStatus
            };

            if (gameStatus === 'LIVE') {
              liveGames.push(gameItem);
            } else if (gameStatus === 'FINAL') {
              resultGames.push(gameItem);
            } else {
              upcomingGames.push(gameItem);
            }
          });
        }

        resultGames.sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime());
        upcomingGames.sort((a, b) => new Date(a.game_date).getTime() - new Date(b.game_date).getTime());

        if (liveGames.length > 0) {
          setGames(liveGames.slice(0, 10));
          setDisplayMode('live');
        } else if (resultGames.length > 0) {
          const last48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);
          const recentResults = resultGames.filter(g => new Date(g.game_date) >= last48h);
          if (recentResults.length > 0) {
            setGames(recentResults.slice(0, 10));
          } else {
            setGames(resultGames.slice(0, 10));
          }
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
            onClick={() => onGameClick(game.game_key)}
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
