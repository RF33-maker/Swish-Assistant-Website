import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";
import { Radio, Clock, CheckCircle2, ExternalLink } from "lucide-react";

interface LiveGame {
  game_key: string;
  hometeam: string;
  awayteam: string;
  matchtime: string;
  status: string;
  competitionname: string | null;
  home_score: number | null;
  away_score: number | null;
}

interface LiveGamesSectionProps {
  leagueId: string;
}

export default function LiveGamesSection({ leagueId }: LiveGamesSectionProps) {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  const fetchGames = async () => {
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now);
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [liveResponse, timeRangeResponse] = await Promise.all([
        supabase
          .from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime, status, competitionname, home_score, away_score")
          .eq("league_id", leagueId)
          .or("status.ilike.%live%,status.eq.in_progress"),
        
        supabase
          .from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime, status, competitionname, home_score, away_score")
          .eq("league_id", leagueId)
          .gte("matchtime", sevenDaysAgo.toISOString())
          .lte("matchtime", threeDaysFromNow.toISOString())
      ]);

      if (liveResponse.error) {
        console.error("Error fetching live games:", liveResponse.error);
      }
      if (timeRangeResponse.error) {
        console.error("Error fetching time range games:", timeRangeResponse.error);
        setLoading(false);
        return;
      }

      const allGames = [...(liveResponse.data || []), ...(timeRangeResponse.data || [])];
      const uniqueGames = allGames.filter((game, index, self) => 
        index === self.findIndex(g => g.game_key === game.game_key)
      );

      const filteredGames = uniqueGames.filter(game => {
        const statusLower = (game.status || '').toLowerCase();
        const matchTime = new Date(game.matchtime);
        
        if (statusLower === 'live' || statusLower === 'in_progress' || statusLower.includes('live')) {
          return true;
        }
        
        if (statusLower === 'final' || statusLower === 'finished' || statusLower === 'completed') {
          const timeSinceGame = now.getTime() - matchTime.getTime();
          const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
          return timeSinceGame >= 0 && timeSinceGame <= twoDaysInMs;
        }
        
        if (statusLower === 'scheduled' || statusLower === 'upcoming' || statusLower === '' || !game.status) {
          return matchTime >= now && matchTime <= threeDaysFromNow;
        }
        
        return false;
      });

      filteredGames.sort((a, b) => new Date(a.matchtime).getTime() - new Date(b.matchtime).getTime());

      setGames(filteredGames);
    } catch (err) {
      console.error("Error fetching games:", err);
    } finally {
      setLoading(false);
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
      fetchGames();
    }, 30000);
    return () => clearInterval(interval);
  }, [leagueId]);

  const handleGameClick = (gameKey: string) => {
    navigate(`/game/${encodeURIComponent(gameKey)}`);
  };

  const getGameStatus = (status: string | null): 'live' | 'final' | 'scheduled' => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'live' || statusLower === 'in_progress' || statusLower.includes('live')) {
      return 'live';
    }
    if (statusLower === 'final' || statusLower === 'finished' || statusLower === 'completed') {
      return 'final';
    }
    return 'scheduled';
  };

  const formatMatchTime = (matchtime: string): string => {
    const date = new Date(matchtime);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    if (isToday) {
      return `Today ${timeStr}`;
    } else if (isTomorrow) {
      return `Tomorrow ${timeStr}`;
    } else {
      const dayStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      return `${dayStr} ${timeStr}`;
    }
  };

  if (loading) {
    return null;
  }

  if (games.length === 0) {
    return null;
  }

  const liveGames = games.filter(g => getGameStatus(g.status) === 'live');
  const finalGames = games.filter(g => getGameStatus(g.status) === 'final');
  const scheduledGames = games.filter(g => getGameStatus(g.status) === 'scheduled');

  const getSectionTitle = () => {
    if (liveGames.length > 0) return "Live Now";
    if (finalGames.length > 0 && scheduledGames.length > 0) return "Recent & Upcoming Games";
    if (finalGames.length > 0) return "Recent Results";
    return "Upcoming Games";
  };

  const getSectionStyle = () => {
    if (liveGames.length > 0) {
      return "bg-gradient-to-r from-red-600 via-red-500 to-orange-500";
    }
    return "bg-gradient-to-r from-gray-700 via-gray-600 to-gray-500";
  };

  return (
    <section className={`${getSectionStyle()} text-white py-4 px-4`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          {liveGames.length > 0 ? (
            <Radio className="w-5 h-5 animate-pulse" />
          ) : finalGames.length > 0 ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Clock className="w-5 h-5" />
          )}
          <h2 className="text-lg font-bold">{getSectionTitle()}</h2>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {games.length} {games.length === 1 ? 'game' : 'games'}
          </span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {games.map((game) => {
            const gameStatus = getGameStatus(game.status);
            
            return (
              <div
                key={game.game_key}
                onClick={() => handleGameClick(game.game_key)}
                className={`backdrop-blur-sm rounded-xl p-4 cursor-pointer transition-all border hover:scale-[1.02] group ${
                  gameStatus === 'live' 
                    ? 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40' 
                    : gameStatus === 'final'
                    ? 'bg-white/5 border-white/10 hover:bg-white/15 hover:border-white/30'
                    : 'bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  {gameStatus === 'live' ? (
                    <span className="text-xs font-semibold bg-red-700 px-2 py-1 rounded-full flex items-center gap-1">
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                      LIVE
                    </span>
                  ) : gameStatus === 'final' ? (
                    <span className="text-xs font-semibold bg-gray-600 px-2 py-1 rounded-full">
                      FINAL
                    </span>
                  ) : (
                    <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatMatchTime(game.matchtime)}
                    </span>
                  )}
                  <div className="flex items-center gap-1 text-white/70 group-hover:text-white transition-colors">
                    <span className="text-xs">View</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <TeamLogo teamName={game.awayteam} leagueId={leagueId} size="sm" />
                      <span className="font-medium text-sm truncate">{game.awayteam}</span>
                    </div>
                    {(gameStatus === 'live' || gameStatus === 'final') && game.away_score !== null && (
                      <span className={`font-bold text-lg min-w-[2rem] text-right ${
                        gameStatus === 'live' ? 'text-white' : 'text-white/90'
                      }`}>
                        {game.away_score}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-xs text-white/60 text-center">@</div>
                  
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <TeamLogo teamName={game.hometeam} leagueId={leagueId} size="sm" />
                      <span className="font-medium text-sm truncate">{game.hometeam}</span>
                    </div>
                    {(gameStatus === 'live' || gameStatus === 'final') && game.home_score !== null && (
                      <span className={`font-bold text-lg min-w-[2rem] text-right ${
                        gameStatus === 'live' ? 'text-white' : 'text-white/90'
                      }`}>
                        {game.home_score}
                      </span>
                    )}
                  </div>
                </div>

                {game.competitionname && (
                  <div className="mt-3 pt-2 border-t border-white/20">
                    <span className="text-xs text-white/70">{game.competitionname}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
