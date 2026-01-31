import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";
import { Radio, Clock, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";

interface Game {
  game_key: string;
  hometeam: string;
  awayteam: string;
  matchtime: string;
  status: string | null;
  home_score?: number | null;
  away_score?: number | null;
}

interface GameSwitcherBarProps {
  leagueId: string;
  currentGameKey: string;
  isTestMode: boolean;
}

export function GameSwitcherBar({ leagueId, currentGameKey, isTestMode }: GameSwitcherBarProps) {
  const [games, setGames] = useState<Game[]>([]);
  const [, navigate] = useLocation();
  
  const db = useMemo(() => {
    return isTestMode ? supabase.schema("test") : supabase;
  }, [isTestMode]);

  useEffect(() => {
    const fetchGames = async () => {
      const now = new Date();
      const threeDaysFromNow = new Date(now);
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      let allGames: any[] = [];

      if (isTestMode) {
        const [liveResponse, timeRangeResponse] = await Promise.all([
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
            .lte("matchtime", threeDaysFromNow.toISOString())
        ]);

        allGames = [...(liveResponse.data || []), ...(timeRangeResponse.data || [])];
      } else {
        const { data } = await db
          .from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime")
          .eq("league_id", leagueId)
          .gte("matchtime", now.toISOString())
          .lte("matchtime", threeDaysFromNow.toISOString())
          .order("matchtime", { ascending: true })
          .limit(10);

        allGames = (data || []).map(g => ({ ...g, status: null }));
      }

      const uniqueGames = allGames.filter((game, index, self) => 
        index === self.findIndex(g => g.game_key === game.game_key)
      );

      const filteredGames = uniqueGames.filter(game => {
        const statusLower = (game.status || '').toLowerCase();
        const matchTime = new Date(game.matchtime);
        
        if (isTestMode) {
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
        } else {
          return matchTime >= now && matchTime <= threeDaysFromNow;
        }
      });

      if (isTestMode && filteredGames.length > 0) {
        const gameKeys = filteredGames.map(g => g.game_key);
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
            const game = filteredGames.find(g => g.game_key === stat.game_key);
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

        filteredGames.forEach(game => {
          game.home_score = scoresByGame[game.game_key]?.home_score;
          game.away_score = scoresByGame[game.game_key]?.away_score;
        });
      }

      filteredGames.sort((a, b) => {
        const statusA = getGameStatus(a.status);
        const statusB = getGameStatus(b.status);
        if (statusA === 'live' && statusB !== 'live') return -1;
        if (statusB === 'live' && statusA !== 'live') return 1;
        return new Date(a.matchtime).getTime() - new Date(b.matchtime).getTime();
      });

      setGames(filteredGames);
    };

    if (leagueId) {
      fetchGames();
    }
  }, [leagueId, isTestMode]);

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

  const getTeamAbbr = (teamName: string): string => {
    const words = teamName.replace(/Senior Men|Senior Women|I+$/gi, '').trim().split(' ');
    if (words.length >= 2) {
      return (words[0].substring(0, 3) + words[1].substring(0, 1)).toUpperCase();
    }
    return teamName.substring(0, 4).toUpperCase();
  };

  const formatTime = (matchtime: string): string => {
    const date = new Date(matchtime);
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const handleGameClick = (gameKey: string) => {
    if (gameKey === currentGameKey) return;
    const modeParam = isTestMode ? "?mode=test" : "";
    navigate(`/game/${encodeURIComponent(gameKey)}${modeParam}`);
  };

  if (games.length <= 1) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-full overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-slate-800 [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-500">
        <div className="flex items-center gap-1 px-2 py-2 min-w-max">
          {games.map((game) => {
            const gameStatus = getGameStatus(game.status);
            const isCurrent = game.game_key === currentGameKey;
            
            return (
              <button
                key={game.game_key}
                onClick={() => handleGameClick(game.game_key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all whitespace-nowrap ${
                  isCurrent 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-white/10 hover:bg-white/20 text-white/90'
                }`}
              >
                {gameStatus === 'live' && (
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0"></span>
                )}
                {gameStatus === 'final' && (
                  <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                )}
                {gameStatus === 'scheduled' && (
                  <Clock className="w-3 h-3 text-white/60 flex-shrink-0" />
                )}
                
                <div className="flex items-center gap-1">
                  <TeamLogo teamName={game.awayteam} leagueId={leagueId} size="xs" />
                  <span className="text-xs font-medium">{getTeamAbbr(game.awayteam)}</span>
                  
                  {(gameStatus === 'live' || gameStatus === 'final') && game.away_score !== undefined && game.away_score !== null ? (
                    <span className="text-xs font-bold mx-1">{game.away_score}</span>
                  ) : null}
                  
                  <span className="text-white/40 mx-0.5">-</span>
                  
                  {(gameStatus === 'live' || gameStatus === 'final') && game.home_score !== undefined && game.home_score !== null ? (
                    <span className="text-xs font-bold mx-1">{game.home_score}</span>
                  ) : null}
                  
                  <span className="text-xs font-medium">{getTeamAbbr(game.hometeam)}</span>
                  <TeamLogo teamName={game.hometeam} leagueId={leagueId} size="xs" />
                </div>
                
                {gameStatus === 'scheduled' && (
                  <span className="text-[10px] text-white/60 ml-1">{formatTime(game.matchtime)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
