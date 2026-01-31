import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";
import { Clock, ExternalLink } from "lucide-react";

interface Game {
  game_key: string;
  hometeam: string;
  awayteam: string;
  matchtime: string;
  competitionname: string | null;
  home_score?: number | null;
  away_score?: number | null;
}

interface LiveGamesSectionProps {
  leagueId: string;
}

export default function LiveGamesSection({ leagueId }: LiveGamesSectionProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  const fetchGames = async () => {
    try {
      const now = new Date();
      const threeDaysFromNow = new Date(now);
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const { data: scheduleData, error: scheduleError } = await supabase
        .from("game_schedule")
        .select("game_key, hometeam, awayteam, matchtime, competitionname")
        .eq("league_id", leagueId)
        .gte("matchtime", now.toISOString())
        .lte("matchtime", threeDaysFromNow.toISOString())
        .order("matchtime", { ascending: true })
        .limit(8);

      if (scheduleError) {
        console.error("Error fetching games:", scheduleError);
        setLoading(false);
        return;
      }

      if (!scheduleData || scheduleData.length === 0) {
        setGames([]);
        setLoading(false);
        return;
      }

      const gameKeys = scheduleData.map(g => g.game_key);
      const { data: teamStatsData } = await supabase
        .from("team_stats")
        .select("game_key, team_name, tot_spoints")
        .in("game_key", gameKeys);

      const scoresByGame: Record<string, { home_score?: number; away_score?: number }> = {};
      
      if (teamStatsData) {
        teamStatsData.forEach(stat => {
          if (!scoresByGame[stat.game_key]) {
            scoresByGame[stat.game_key] = {};
          }
          
          const game = scheduleData.find(g => g.game_key === stat.game_key);
          if (game) {
            const teamNameLower = (stat.team_name || '').toLowerCase();
            const homeTeamLower = (game.hometeam || '').toLowerCase();
            const awayTeamLower = (game.awayteam || '').toLowerCase();
            
            if (teamNameLower.includes(homeTeamLower) || homeTeamLower.includes(teamNameLower)) {
              scoresByGame[stat.game_key].home_score = stat.tot_spoints;
            } else if (teamNameLower.includes(awayTeamLower) || awayTeamLower.includes(teamNameLower)) {
              scoresByGame[stat.game_key].away_score = stat.tot_spoints;
            }
          }
        });
      }

      const gamesWithScores: Game[] = scheduleData.map(game => ({
        ...game,
        home_score: scoresByGame[game.game_key]?.home_score,
        away_score: scoresByGame[game.game_key]?.away_score,
      }));

      setGames(gamesWithScores);
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
    }, 60000);
    return () => clearInterval(interval);
  }, [leagueId]);

  const handleGameClick = (gameKey: string) => {
    navigate(`/game/${encodeURIComponent(gameKey)}`);
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

  return (
    <section className="bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 text-white py-4 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-5 h-5" />
          <h2 className="text-lg font-bold">Upcoming Games</h2>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {games.length} {games.length === 1 ? 'game' : 'games'}
          </span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {games.map((game) => (
            <div
              key={game.game_key}
              onClick={() => handleGameClick(game.game_key)}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-4 cursor-pointer hover:bg-white/20 transition-all border border-white/20 hover:border-white/40 hover:scale-[1.02] group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatMatchTime(game.matchtime)}
                </span>
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
                  {game.away_score !== undefined && game.away_score !== null && (
                    <span className="font-bold text-lg min-w-[2rem] text-right">
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
                  {game.home_score !== undefined && game.home_score !== null && (
                    <span className="font-bold text-lg min-w-[2rem] text-right">
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
          ))}
        </div>
      </div>
    </section>
  );
}
