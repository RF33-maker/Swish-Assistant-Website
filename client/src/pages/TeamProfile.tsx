import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import React from "react";

interface League {
  league_id: string;
  name: string;
  slug: string;
}

interface PlayerStat {
  player_id?: string;
  name: string;
  position: string;
  avgPoints: number;
  avgRebounds: number;
  avgAssists: number;
  avgSteals: number;
  avgBlocks: number;
  totalPoints: number;
  totalRebounds: number;
  totalAssists: number;
  totalSteals: number;
  totalBlocks: number;
  gamesPlayed: number;
}

interface Game {
  totalPoints: number;
  date: string;
  opponent: string;
}

interface Team {
  name: string;
  roster: PlayerStat[];
  topPlayer: PlayerStat;
  recentGames: Game[];
  totalGames: number;
  avgTeamPoints: number;
  league: League | null;
}

interface Suggestion {
  name: string;
  slug: string;
}

export default function TeamProfile() {
  const { teamName } = useParams();
  const [location, navigate] = useLocation();
  const [team, setTeam] = useState<Team | null>(null);
  const [playerStats, setPlayerStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (search.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      const { data, error } = await supabase
        .from("leagues")
        .select("name, slug")
        .ilike("name", `%${search}%`)
        .eq("is_public", true)
        .limit(5);

      if (!error) {
        setSuggestions(data || []);
      }
    };

    const delay = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(delay);
  }, [search]);

  const handleSearch = () => {
    if (search.trim()) {
      navigate(`/league/${search}`);
    }
  };

  useEffect(() => {
    const fetchTeamData = async () => {
      if (!teamName) return;
      
      setLoading(true);
      try {
        const decodedTeamName = decodeURIComponent(teamName);
        
        // Fetch all player stats for this team
        const { data: allPlayerStats, error } = await supabase
          .from("player_stats")
          .select("*")
          .eq("team", decodedTeamName);

        if (error) {
          console.error("Error fetching team data:", error);
          return;
        }

        setPlayerStats(allPlayerStats || []);

        // Process team data
        if (allPlayerStats && allPlayerStats.length > 0) {
          // Calculate team totals and averages using game_key to properly determine opponents
          const gamesByGameKey = allPlayerStats.reduce((acc: Record<string, any>, player: any) => {
            if (!acc[player.game_key]) {
              acc[player.game_key] = {
                game_key: player.game_key,
                created_at: player.created_at,
                home_team: player.home_team,
                away_team: player.away_team,
                teams: new Set(),
                teamScores: {},
                ourTeam: decodedTeamName
              };
            }
            
            // Track teams and scores in this game
            acc[player.game_key].teams.add(player.team);
            if (!acc[player.game_key].teamScores[player.team]) {
              acc[player.game_key].teamScores[player.team] = 0;
            }
            acc[player.game_key].teamScores[player.team] += player.spoints || 0;
            
            return acc;
          }, {});

          // Convert to games with proper opponent data
          const games = Object.values(gamesByGameKey).map((gameData: any) => {
            const teams = Array.from(gameData.teams) as string[];
            const opponent = teams.find(team => team !== decodedTeamName) || 'Unknown';
            const ourScore = gameData.teamScores[decodedTeamName] || 0;
            
            return {
              totalPoints: ourScore,
              date: gameData.created_at,
              opponent: opponent
            };
          });
          const recentGames = games.slice(-10); // Last 10 games
          
          // Get roster with stats
          const roster: PlayerStat[] = allPlayerStats.reduce((acc: PlayerStat[], player: any) => {
            const existing = acc.find(p => p.name === player.name);
            if (existing) {
              existing.totalPoints += player.spoints || 0;
              existing.totalRebounds += player.sreboundstotal || 0;
              existing.totalAssists += player.sassists || 0;
              existing.totalSteals += player.ssteals || 0;
              existing.totalBlocks += player.sblocks || 0;
              existing.gamesPlayed += 1;
            } else {
              acc.push({
                player_id: player.player_id,
                name: player.name,
                position: player.position || 'Player',
                totalPoints: player.spoints || 0,
                totalRebounds: player.sreboundstotal || 0,
                totalAssists: player.sassists || 0,
                totalSteals: player.ssteals || 0,
                totalBlocks: player.sblocks || 0,
                gamesPlayed: 1,
                avgPoints: 0,
                avgRebounds: 0,
                avgAssists: 0,
                avgSteals: 0,
                avgBlocks: 0
              });
            }
            return acc;
          }, []);
          
          // Calculate averages
          roster.forEach((player: PlayerStat) => {
            player.avgPoints = Math.round((player.totalPoints / player.gamesPlayed) * 10) / 10;
            player.avgRebounds = Math.round((player.totalRebounds / player.gamesPlayed) * 10) / 10;
            player.avgAssists = Math.round((player.totalAssists / player.gamesPlayed) * 10) / 10;
            player.avgSteals = Math.round((player.totalSteals / player.gamesPlayed) * 10) / 10;
            player.avgBlocks = Math.round((player.totalBlocks / player.gamesPlayed) * 10) / 10;
          });
          
          // Sort roster by points
          roster.sort((a: PlayerStat, b: PlayerStat) => b.avgPoints - a.avgPoints);
          
          // Find top player
          const topPlayer = roster[0];
          
          // Get league info from first player stat
          const leagueId = allPlayerStats[0]?.league_id;
          let league: League | null = null;
          if (leagueId) {
            const { data: leagueData } = await supabase
              .from("leagues")
              .select("*")
              .eq("id", leagueId)
              .single();
            league = leagueData as League;
          }
          
          setTeam({
            name: decodedTeamName,
            roster,
            topPlayer,
            recentGames,
            totalGames: games.length,
            avgTeamPoints: games.length > 0 ? 
              Math.round((games.reduce((sum, game) => sum + game.totalPoints, 0) / games.length) * 10) / 10 : 0,
            league
          });
        }
      } catch (error) {
        console.error("Error fetching team data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTeamData();
  }, [teamName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading team profile...</p>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-[#fffaf1] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Team Not Found</h1>
          <p className="text-slate-600 mb-4">The team you're looking for doesn't exist or has no data.</p>
          <button
            onClick={() => navigate("/")}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf1]">
      <header className="bg-white shadow-sm sticky top-0 z-50 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0">
        <div className="flex items-center gap-3 w-full md:w-auto justify-center md:justify-start">
          <img
            src={SwishLogo}
            alt="Swish Assistant"
            className="h-8 md:h-9 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>

        <div className="relative w-full max-w-md md:mx-6">
          <input
            type="text"
            placeholder="Search leagues or players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full px-4 py-2 border border-gray-300 rounded-full text-sm"
          />
          <button
            onClick={handleSearch}
            className="absolute right-0 top-0 h-full px-3 md:px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm"
          >
            Go
          </button>

          {suggestions.length > 0 && (
            <ul className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((item, index) => (
                <li
                  key={index}
                  onClick={() => {
                    setSearch("");
                    setSuggestions([]);
                    navigate(`/league/${item.slug}`);
                  }}
                  className="px-4 py-2 cursor-pointer hover:bg-orange-100 text-left text-slate-800"
                >
                  {item.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3 md:gap-4 text-xs md:text-sm w-full md:w-auto justify-center md:justify-end">
          <button
            onClick={() => navigate("/")}
            className="text-slate-600 hover:text-orange-500"
          >
            Home
          </button>
          {team?.league && (
            <button
              onClick={() => navigate(`/league/${team.league?.slug}`)}
              className="text-slate-600 hover:text-orange-500"
            >
              Back to League
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Team Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-6 md:p-8 text-white mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6">
            {/* Team Logo Placeholder */}
            <TeamLogo 
              teamName={team.name} 
              leagueId={team.league?.league_id || ''} 
              size="xl" 
              className="border-2 border-white/30" 
            />
            
            {/* Team Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-2xl md:text-4xl font-bold mb-2">{team.name}</h1>
              <div className="text-base md:text-lg opacity-90 mb-2">
                {team.roster.length} Players • {team.totalGames} Games Played
              </div>
              <div className="text-base md:text-lg opacity-90">
                Average Team Score: <span className="font-bold">{team.avgTeamPoints} PPG</span>
              </div>
              {team.league && (
                <div className="mt-3">
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs md:text-sm">
                    {team.league.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Team Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Left Column - Team Info */}
          <div className="lg:col-span-1 space-y-4 md:space-y-6">
            {/* Team Description */}
            <div className="bg-white rounded-xl shadow p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Team Description
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                {team.name} is a competitive basketball team known for their dedication, teamwork, and strong performance on the court. 
                {team.league && ` Currently competing in ${team.league.name}.`}
              </p>
            </div>

            {/* Team Stats Summary */}
            <div className="bg-white rounded-xl shadow p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Team Statistics
              </h2>
              <div className="space-y-2 md:space-y-3">
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600">Total Games</span>
                  <span className="font-semibold text-orange-600">{team.totalGames}</span>
                </div>
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600">Average Points</span>
                  <span className="font-semibold text-orange-600">{team.avgTeamPoints} PPG</span>
                </div>
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600">Roster Size</span>
                  <span className="font-semibold text-orange-600">{team.roster.length} Players</span>
                </div>
                {team.topPlayer && (
                  <div className="flex justify-between text-sm md:text-base">
                    <span className="text-slate-600">Top Scorer</span>
                    <span className="font-semibold text-orange-600">{team.topPlayer.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Roster and Games */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Top Player Highlight */}
            {team.topPlayer && (
              <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-4 md:p-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Star Player
                </h2>
                <div 
                  className="bg-white rounded-lg p-3 md:p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => team.topPlayer.player_id && navigate(`/player/${team.topPlayer.player_id}`)}
                  data-testid={`player-card-${team.topPlayer.player_id}`}
                >
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-lg md:text-xl">
                      {team.topPlayer.name.charAt(0)}
                    </div>
                    <div className="flex-1 text-center md:text-left">
                      <h3 className="text-lg md:text-xl font-bold text-slate-800">{team.topPlayer.name}</h3>
                      <p className="text-slate-600 text-sm md:text-base">{team.topPlayer.position}</p>
                      <p className="text-xs md:text-sm text-slate-500">{team.topPlayer.gamesPlayed} games played</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:gap-4 text-center w-full md:w-auto">
                      <div>
                        <div className="text-xl md:text-2xl font-bold text-orange-600">{team.topPlayer.avgPoints}</div>
                        <div className="text-xs text-slate-500">PPG</div>
                      </div>
                      <div>
                        <div className="text-xl md:text-2xl font-bold text-orange-600">{team.topPlayer.avgRebounds}</div>
                        <div className="text-xs text-slate-500">RPG</div>
                      </div>
                      <div>
                        <div className="text-xl md:text-2xl font-bold text-orange-600">{team.topPlayer.avgAssists}</div>
                        <div className="text-xs text-slate-500">APG</div>
                      </div>
                      <div>
                        <div className="text-xl md:text-2xl font-bold text-orange-600">{team.topPlayer.totalPoints}</div>
                        <div className="text-xs text-slate-500">Total PTS</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Team Roster */}
            <div className="bg-white rounded-xl shadow p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
                Team Roster ({team.roster.length} Players)
              </h2>
              <div className="overflow-x-auto -mx-4 md:mx-0">
                <table className="w-full text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="sticky left-0 bg-white text-left py-2 md:py-3 px-2 font-semibold text-slate-700 z-10">Player</th>
                      <th className="text-left py-2 md:py-3 px-2 font-semibold text-slate-700">Position</th>
                      <th className="hidden md:table-cell text-center py-3 px-2 font-semibold text-slate-700">GP</th>
                      <th className="text-right py-2 md:py-3 px-2 font-semibold text-slate-700">PPG</th>
                      <th className="text-right py-2 md:py-3 px-2 font-semibold text-slate-700">RPG</th>
                      <th className="hidden md:table-cell text-right py-3 px-2 font-semibold text-slate-700">APG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.roster.map((player: PlayerStat, index: number) => (
                      <tr 
                        key={player.name} 
                        onClick={() => player.player_id && navigate(`/player/${player.player_id}`)}
                        data-testid={`player-card-${player.player_id}`}
                        className="border-b border-gray-100 hover:bg-orange-50 transition-colors cursor-pointer"
                      >
                        <td className="sticky left-0 bg-inherit py-2 md:py-3 px-2 z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 md:w-8 md:h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                              {player.name.charAt(0)}
                            </div>
                            <span className="font-medium text-slate-800">{player.name}</span>
                          </div>
                        </td>
                        <td className="py-2 md:py-3 px-2 text-slate-600">{player.position}</td>
                        <td className="hidden md:table-cell py-3 px-2 text-center text-slate-600">{player.gamesPlayed}</td>
                        <td className="py-2 md:py-3 px-2 text-right font-medium text-orange-600">{player.avgPoints}</td>
                        <td className="py-2 md:py-3 px-2 text-right text-slate-600">{player.avgRebounds}</td>
                        <td className="hidden md:table-cell py-3 px-2 text-right text-slate-600">{player.avgAssists}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Games */}
            <div className="bg-white rounded-xl shadow p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Recent Games ({team.recentGames.length})
              </h2>
              <div className="space-y-2 md:space-y-3">
                {team.recentGames.slice(0, 8).map((game: Game, index: number) => (
                  <div key={index} className="flex flex-col md:flex-row justify-between md:items-center p-3 bg-gray-50 rounded-lg gap-2 md:gap-0">
                    <div>
                      <div className="font-medium text-slate-800 text-sm md:text-base">vs {game.opponent}</div>
                      <div className="text-xs md:text-sm text-slate-500">{new Date(game.date).toLocaleDateString()}</div>
                    </div>
                    <div className="text-left md:text-right">
                      <div className="text-base md:text-lg font-bold text-orange-600">{game.totalPoints}</div>
                      <div className="text-xs text-slate-500">PTS</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}