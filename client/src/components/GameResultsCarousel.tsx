import React, { useState, useEffect, useRef } from "react";
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
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const fetchGameResults = async () => {
      setLoading(true);
      
      try {
        // First try to get game results from team_stats table
        const { data: teamStatsData, error: teamStatsError } = await supabase
          .from("team_stats")
          .select("*")
          .eq("league_id", leagueId)
          .order("created_at", { ascending: false });

        if (teamStatsData && teamStatsData.length > 0 && !teamStatsError) {
          // Group team stats by numeric_id to create game results
          const gameMap = new Map<string, any[]>();
          
          teamStatsData.forEach(stat => {
            const numericId = stat.numeric_id;
            if (numericId && stat.name) { // Only process records with team names and numeric_id
              if (!gameMap.has(numericId)) {
                gameMap.set(numericId, []);
              }
              gameMap.get(numericId)!.push(stat);
            }
          });

          // Convert to game results
          const gamesFromTeamStats: GameResult[] = [];
          
          gameMap.forEach((gameTeams, numericId) => {
            if (gameTeams.length === 2) { // Valid game with 2 teams
              const [team1, team2] = gameTeams;
              const team1Score = team1.tot_spoints || 0;
              const team2Score = team2.tot_spoints || 0;
              
              gamesFromTeamStats.push({
                game_id: numericId,
                game_date: team1.created_at || new Date().toISOString(),
                home_team: team1.name,
                away_team: team2.name,
                home_score: team1Score,
                away_score: team2Score,
                status: "FINAL"
              });
            }
          });

          // Sort by date and take recent 10
          const sortedGames = gamesFromTeamStats
            .sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())
            .slice(0, 10);

          setGames(sortedGames);
          return;
        }

        // Fallback to player_stats approach
        console.log("🎮 Using fallback: processing game results from player_stats");
        
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
            acc[player.team] += player.spoints || 0; // Use spoints for consistency
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

  // Calculate animation duration based on number of games
  const animationDuration = games.length > 0 ? games.length * 8 : 40; // 8 seconds per game

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

  // Create duplicated games array for infinite scroll
  const duplicatedGames = [...games, ...games];

  // Calculate fixed track width based on screen size
  const mobileCardWidth = 280;
  const desktopCardWidth = 320;
  const mobileGap = 12; // gap-3
  const desktopGap = 16; // gap-4
  
  // Use desktop values for animation calculation
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
            onClick={() => onGameClick(game.game_id)}
            onMouseDown={(e) => e.preventDefault()}
          >
          {/* Header with date and status */}
          <div className="flex justify-between items-center mb-2 md:mb-3">
            <div className="text-xs font-medium text-gray-300 bg-gray-700 px-2 py-1 rounded">
              {game.status}
            </div>
            <div className="text-xs text-gray-400">
              {formatDate(game.game_date)}
            </div>
          </div>
          
          {/* Team matchup */}
          <div className="space-y-2">
            {/* Away team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TeamLogo teamName={game.away_team} leagueId={leagueId} size="sm" />
                <div className="text-white font-bold text-sm md:text-base">
                  {getTeamAbbr(game.away_team)}
                </div>
              </div>
              <div className="text-xl md:text-2xl font-bold text-white">
                {game.away_score}
              </div>
            </div>
            
            {/* Home team */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TeamLogo teamName={game.home_team} leagueId={leagueId} size="sm" />
                <div className="text-white font-bold text-sm md:text-base">
                  {getTeamAbbr(game.home_team)}
                </div>
              </div>
              <div className="text-xl md:text-2xl font-bold text-white">
                {game.home_score}
              </div>
            </div>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}