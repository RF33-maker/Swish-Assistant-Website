import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";
import { Radio, ExternalLink } from "lucide-react";

interface LiveGame {
  game_key: string;
  hometeam: string;
  awayteam: string;
  matchtime: string;
  status: string;
  competitionname: string | null;
}

interface LiveGamesSectionProps {
  leagueId: string;
}

export default function LiveGamesSection({ leagueId }: LiveGamesSectionProps) {
  const [liveGames, setLiveGames] = useState<LiveGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [, navigate] = useLocation();

  const fetchLiveGames = async () => {
    try {
      const { data, error } = await supabase
        .from("game_schedule")
        .select("game_key, hometeam, awayteam, matchtime, status, competitionname")
        .eq("league_id", leagueId)
        .order("matchtime", { ascending: true });

      if (error) {
        console.error("Error fetching live games:", error);
        setLoading(false);
        return;
      }

      // Filter for live games in JavaScript to handle various status formats
      const liveOnly = (data || []).filter(game => {
        const statusLower = (game.status || '').toLowerCase();
        return statusLower === 'live' || statusLower === 'in_progress' || statusLower.includes('live');
      });

      setLiveGames(liveOnly);
    } catch (err) {
      console.error("Error fetching live games:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (leagueId) {
      fetchLiveGames();
    }
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const interval = setInterval(() => {
      fetchLiveGames();
    }, 15000);
    return () => clearInterval(interval);
  }, [leagueId]);

  const handleGameClick = (gameKey: string) => {
    navigate(`/game/${encodeURIComponent(gameKey)}`);
  };

  if (loading) {
    return null;
  }

  if (liveGames.length === 0) {
    return null;
  }

  return (
    <section className="bg-gradient-to-r from-red-600 via-red-500 to-orange-500 text-white py-4 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-5 h-5 animate-pulse" />
          <h2 className="text-lg font-bold">Live Now</h2>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {liveGames.length} {liveGames.length === 1 ? 'game' : 'games'}
          </span>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {liveGames.map((game) => (
            <div
              key={game.game_key}
              onClick={() => handleGameClick(game.game_key)}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-4 cursor-pointer hover:bg-white/20 transition-all border border-white/20 hover:border-white/40 hover:scale-[1.02] group"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold bg-red-700 px-2 py-1 rounded-full flex items-center gap-1">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  LIVE
                </span>
                <div className="flex items-center gap-1 text-white/70 group-hover:text-white transition-colors">
                  <span className="text-xs">Game Centre</span>
                  <ExternalLink className="w-3 h-3" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TeamLogo teamName={game.awayteam} leagueId={leagueId} size="sm" />
                  <span className="font-medium text-sm truncate">{game.awayteam}</span>
                </div>
                
                <div className="text-xs text-white/60 text-center">vs</div>
                
                <div className="flex items-center gap-2">
                  <TeamLogo teamName={game.hometeam} leagueId={leagueId} size="sm" />
                  <span className="font-medium text-sm truncate">{game.hometeam}</span>
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
