import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar, Trophy, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface GameResult {
  game_id: string;
  game_date: string;
  home_team: string;
  away_team: string;
  home_score?: number;
  away_score?: number;
  top_performers: Array<{
    name: string;
    team: string;
    points: number;
    rebounds_total: number;
    assists: number;
  }>;
}

interface GameResultsCarouselProps {
  leagueId: string;
  onGameClick: (gameId: string) => void;
}

export default function GameResultsCarousel({ leagueId, onGameClick }: GameResultsCarouselProps) {
  const [games, setGames] = useState<GameResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
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

          // Get top performers (top 3 scorers in the game)
          const topPerformers = game.players
            .sort((a: any, b: any) => (b.points || 0) - (a.points || 0))
            .slice(0, 3)
            .map((player: any) => ({
              name: player.name,
              team: player.team,
              points: player.points || 0,
              rebounds_total: player.rebounds_total || 0,
              assists: player.assists || 0,
            }));

          const teams = Object.keys(teamScores);
          
          return {
            game_id: game.game_id,
            game_date: game.game_date,
            home_team: teams[0] || "Team A",
            away_team: teams[1] || "Team B",
            home_score: teamScores[teams[0]] || 0,
            away_score: teamScores[teams[1]] || 0,
            top_performers: topPerformers,
          };
        });

        setGames(processedGames.slice(0, 10)); // Show last 10 games
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

  const nextGame = () => {
    setCurrentIndex((prev) => (prev + 1) % games.length);
  };

  const prevGame = () => {
    setCurrentIndex((prev) => (prev - 1 + games.length) % games.length);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Recent Game Results</h2>
        <div className="animate-pulse">
          <div className="h-32 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Recent Game Results</h2>
        <p className="text-sm text-slate-600">No game results available.</p>
      </div>
    );
  }

  const currentGame = games[currentIndex];

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Recent Game Results</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={prevGame}
            className="p-1 rounded-full hover:bg-orange-100 transition-colors"
            disabled={games.length <= 1}
          >
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </button>
          <span className="text-sm text-slate-500">
            {currentIndex + 1} / {games.length}
          </span>
          <button
            onClick={nextGame}
            className="p-1 rounded-full hover:bg-orange-100 transition-colors"
            disabled={games.length <= 1}
          >
            <ChevronRight className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      <div 
        className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow border border-orange-200"
        onClick={() => onGameClick(currentGame.game_id)}
      >
        {/* Game Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="w-4 h-4" />
            {new Date(currentGame.game_date).toLocaleDateString()}
          </div>
          <div className="text-xs text-orange-600 font-medium">
            Click for details →
          </div>
        </div>

        {/* Score Display */}
        <div className="flex items-center justify-center mb-4">
          <div className="text-center">
            <div className="text-sm font-medium text-slate-700">{currentGame.home_team}</div>
            <div className="text-2xl font-bold text-orange-600">{currentGame.home_score}</div>
          </div>
          <div className="mx-6 text-slate-400">VS</div>
          <div className="text-center">
            <div className="text-sm font-medium text-slate-700">{currentGame.away_team}</div>
            <div className="text-2xl font-bold text-orange-600">{currentGame.away_score}</div>
          </div>
        </div>

        {/* Top Performers */}
        <div>
          <div className="flex items-center gap-1 mb-2">
            <Trophy className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium text-slate-700">Top Performers</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {currentGame.top_performers.map((player, index) => (
              <div key={index} className="bg-white rounded-md p-2 text-xs">
                <div className="font-medium text-slate-800">{player.name}</div>
                <div className="text-slate-600">{player.team}</div>
                <div className="text-orange-600 font-medium">
                  {player.points}pts / {player.rebounds_total}reb / {player.assists}ast
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicators */}
      <div className="flex justify-center mt-4 gap-1">
        {games.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-colors ${
              index === currentIndex ? "bg-orange-500" : "bg-gray-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}