import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "./TeamLogo";

interface GameResult {
  game_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: string;
}

interface GameResultsCarouselProps {
  leagueId: string;
  onGameClick: (gameId: string) => void;
}

export default function GameResultsCarousel({ leagueId, onGameClick }: GameResultsCarouselProps) {
  const [games, setGames] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGameResults = async () => {
      setLoading(true);
      
      try {
        // Get all player stats grouped by game
        const { data: playerStats, error } = await supabase
          .from("player_stats")
          .select("*")
          .eq("league_id", leagueId)
          .order("game_date", { ascending: false });

        if (error) {
          console.error("Error fetching game results:", error);
          return;
        }

        // Group stats by game_id and process
        const gameMap = new Map<string, any>();
        
        playerStats?.forEach(stat => {
          if (!gameMap.has(stat.game_id)) {
            gameMap.set(stat.game_id, {
              game_id: stat.game_id,
              game_date: stat.game_date,
              home_team: stat.home_team || "Home",
              away_team: stat.away_team || "Away", 
              players: []
            });
          }
          gameMap.get(stat.game_id).players.push(stat);
        });

        // Convert to array and process each game
        const processedGames = Array.from(gameMap.values()).map(game => {
          // Calculate team scores (sum of all player points per team)
          const teamScores = game.players.reduce((acc: any, player: any) => {
            if (!acc[player.team]) acc[player.team] = 0;
            acc[player.team] += player.points || 0;
            return acc;
          }, {});

          const teams = Object.keys(teamScores);
          const [homeTeam, awayTeam] = teams.length >= 2 ? teams : [game.home_team, game.away_team];
          
          return {
            game_id: game.game_id,
            game_date: game.game_date,
            home_team: homeTeam,
            away_team: awayTeam,
            home_score: teamScores[homeTeam] || 0,
            away_score: teamScores[awayTeam] || 0,
            status: "FINAL"
          };
        });

        setGames(processedGames.slice(0, 10)); // Show recent 10 games
      } catch (error) {
        console.error("Error processing game results:", error);
      } finally {
        setLoading(false);
      }
    };

    if (leagueId) {
      fetchGameResults();
    }
  }, [leagueId]);

  if (loading) {
    return (
      <div className="flex gap-4 animate-pulse">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="bg-gray-800 rounded-lg h-16 w-64 flex-shrink-0"></div>
        ))}
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center text-white/70 py-4">
        No recent game results available
      </div>
    );
  }

  // Format date for display
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }).toUpperCase();
  };

  // Get team abbreviation (first 3 letters)
  const getTeamAbbr = (teamName: string) => {
    return teamName.substring(0, 3).toUpperCase();
  };

  return (
    <div className="flex gap-4 min-w-max">
      {/* Duplicate games for seamless loop */}
      {[...games, ...games].map((game, index) => (
        <div
          key={`${game.game_id}-${index}`}
          className="bg-gray-800 rounded-lg px-4 py-3 flex-shrink-0 w-64 cursor-pointer hover:bg-gray-700 transition-colors"
          onClick={() => onGameClick(game.game_id)}
        >
          <div className="text-xs text-gray-400 text-center mb-1">
            {formatDate(game.game_date)}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TeamLogo teamName={game.away_team} leagueId={leagueId} size={8} />
                <div className="text-white font-bold text-sm">
                  {getTeamAbbr(game.away_team)}
                </div>
              </div>
              <div className="text-2xl font-bold text-white">
                {game.away_score}
              </div>
            </div>
            <div className="text-gray-400 text-xs px-2">
              VS
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TeamLogo teamName={game.home_team} leagueId={leagueId} size={8} />
                <div className="text-white font-bold text-sm">
                  {getTeamAbbr(game.home_team)}
                </div>
              </div>
              <div className="text-2xl font-bold text-white">
                {game.home_score}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-400 text-center mt-1">
            {game.status}
          </div>
        </div>
      ))}
    </div>
  );
}