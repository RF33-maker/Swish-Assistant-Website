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
        // Fetch both team_stats and game_schedule in parallel
        const [teamStatsResult, scheduleResult] = await Promise.all([
          supabase
            .from("team_stats")
            .select("*")
            .eq("league_id", leagueId)
            .order("created_at", { ascending: false }),
          supabase
            .from("game_schedule")
            .select("game_key, matchtime")
            .eq("league_id", leagueId)
        ]);

        const { data: teamStatsData, error: teamStatsError } = teamStatsResult;
        const { data: scheduleData } = scheduleResult;

        // Create a map of game_key -> matchtime for date lookups
        const scheduleDateMap = new Map<string, string>();
        if (scheduleData) {
          scheduleData.forEach((game: any) => {
            if (game.game_key && game.matchtime) {
              scheduleDateMap.set(game.game_key, game.matchtime);
            }
          });
        }

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
              // Find which team is home and which is away using is_home field
              const homeTeam = gameTeams.find(team => team.is_home === true);
              const awayTeam = gameTeams.find(team => team.is_home === false);
              
              let finalHomeTeam;
              let finalAwayTeam;
              
              // If we found both teams with proper is_home flags and they're different, use them
              if (homeTeam && awayTeam && homeTeam !== awayTeam) {
                finalHomeTeam = homeTeam;
                finalAwayTeam = awayTeam;
              } 
              // If we only found home team, the other one must be away
              else if (homeTeam && !awayTeam) {
                finalHomeTeam = homeTeam;
                finalAwayTeam = gameTeams.find(team => team !== homeTeam);
              }
              // If we only found away team, the other one must be home
              else if (!homeTeam && awayTeam) {
                finalAwayTeam = awayTeam;
                finalHomeTeam = gameTeams.find(team => team !== awayTeam);
              }
              // Fallback: neither team has proper is_home flags, just assign them as is
              else {
                finalHomeTeam = gameTeams[0];
                finalAwayTeam = gameTeams[1];
              }
              
              // Safety check: ensure we have two distinct teams
              if (!finalHomeTeam || !finalAwayTeam || finalHomeTeam === finalAwayTeam) {
                console.warn(`⚠️ Invalid team data for game ${numericId}, skipping`);
                return;
              }

              // Get game_key from team_stats to look up matchtime from game_schedule
              const gameKey = finalHomeTeam.game_key || finalAwayTeam.game_key;
              const matchtime = gameKey ? scheduleDateMap.get(gameKey) : null;
              
              gamesFromTeamStats.push({
                game_id: numericId,
                game_date: matchtime || finalHomeTeam.game_date || finalAwayTeam.game_date || new Date().toISOString(),
                home_team: finalHomeTeam.name,
                away_team: finalAwayTeam.name,
                home_score: finalHomeTeam.tot_spoints || 0,
                away_score: finalAwayTeam.tot_spoints || 0,
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

        if (!playerStats || playerStats.length === 0) {
          console.log("No player stats available");
          return;
        }

        // Get game_id or numeric_id values to match against game_schedule
        const gameIds = new Set<string>();
        playerStats.forEach(stat => {
          if (stat.game_id) gameIds.add(stat.game_id);
        });

        // Fetch game schedule to get correct home/away team mapping
        const { data: gameSchedule } = await supabase
          .from("game_schedule")
          .select("*")
          .eq("league_id", leagueId);

        // Create a map of game_id -> {hometeam, awayteam}
        const gameScheduleMap = new Map<string, any>();
        gameSchedule?.forEach(game => {
          if (game.game_id) {
            gameScheduleMap.set(game.game_id, game);
          }
          // Also try numeric_id as fallback
          if (game.numeric_id) {
            gameScheduleMap.set(game.numeric_id?.toString(), game);
          }
        });

        // Group stats by game_id and process
        const gameMap = new Map<string, any>();
        
        playerStats.forEach(stat => {
          if (!gameMap.has(stat.game_id)) {
            gameMap.set(stat.game_id, {
              game_id: stat.game_id,
              game_date: stat.game_date,
              players: [],
              scheduleData: gameScheduleMap.get(stat.game_id)
            });
          }
          gameMap.get(stat.game_id).players.push(stat);
        });

        // Convert to array and process each game
        const processedGames = Array.from(gameMap.values()).map((game) => {
          // Calculate team scores (sum of all player points per team)
          const teamScores = game.players.reduce((acc: any, player: any) => {
            if (!acc[player.team]) acc[player.team] = 0;
            acc[player.team] += player.spoints || 0; // Use spoints for consistency
            return acc;
          }, {});

          // Get the unique teams from player data
          const uniqueTeams = Object.keys(teamScores);
          
          if (uniqueTeams.length !== 2) {
            // Skip invalid games
            return null;
          }

          let homeTeam, awayTeam;

          // First, try to use game_schedule data (most reliable)
          if (game.scheduleData?.hometeam && game.scheduleData?.awayteam) {
            homeTeam = game.scheduleData.hometeam;
            awayTeam = game.scheduleData.awayteam;
          } else {
            // Fallback: use the teams from player data
            const team1 = uniqueTeams[0];
            const team2 = uniqueTeams[1];
            homeTeam = team1;
            awayTeam = team2;
          }
          
          return {
            game_id: game.game_id,
            game_date: game.game_date,
            home_team: homeTeam,
            away_team: awayTeam,
            home_score: teamScores[homeTeam] || 0,
            away_score: teamScores[awayTeam] || 0,
            status: "FINAL"
          };
        }).filter((game): game is GameResult => game !== null);

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