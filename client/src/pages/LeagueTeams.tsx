import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import { normalizeTeamName } from "@/lib/teamUtils";
import React from "react";

interface League {
  league_id: string;
  name: string;
  slug: string;
  banner_url?: string;
  organiser_name?: string;
}

interface PlayerStat {
  name: string;
  position: string;
  avgPoints: number;
  avgRebounds: number;
  avgAssists: number;
  totalPoints: number;
  totalRebounds: number;
  totalAssists: number;
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
}

interface Suggestion {
  name: string;
  slug: string;
}

export default function LeagueTeams() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
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
    const fetchLeagueAndTeams = async () => {
      if (!slug) return;
      
      setLoading(true);
      try {
        // Fetch league info
        const { data: leagueData, error: leagueError } = await supabase
          .from("leagues")
          .select("*")
          .eq("slug", slug)
          .single();

        if (leagueError) {
          console.error("Error fetching league:", leagueError);
          return;
        }

        setLeague(leagueData);

        // Fetch all teams from the teams table
        const { data: allTeams, error: teamsError } = await supabase
          .from("teams")
          .select("team_id, name")
          .eq("league_id", leagueData.league_id);

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
          return;
        }

        if (!allTeams || allTeams.length === 0) {
          console.log("No teams found for this league");
          setTeams([]);
          setLoading(false);
          return;
        }

        // Fetch all player stats for this league
        const { data: allPlayerStats, error: statsError } = await supabase
          .from("player_stats")
          .select("*")
          .eq("league_id", leagueData.league_id);

        if (statsError) {
          console.error("Error fetching player stats:", statsError);
        }

        // Process all teams from the teams table
        const teamsWithData = await Promise.all(allTeams.map(async (team) => {
          const teamName = team.name;
          const normalizedTeamName = normalizeTeamName(teamName);
          
            // Get team stats (only if player stats exist)
            // Normalize both team names for comparison
            const teamPlayers = allPlayerStats ? allPlayerStats.filter(stat => 
              normalizeTeamName(stat.team) === normalizedTeamName
            ) : [];
            
            // Calculate team totals and averages using game_id to properly determine opponents
            const gamesByGameId = teamPlayers.reduce((acc: Record<string, any>, player: any) => {
              if (!acc[player.game_id]) {
                acc[player.game_id] = {
                  game_id: player.game_id,
                  game_date: player.game_date,
                  home_team: player.home_team,
                  away_team: player.away_team,
                  teams: new Set(),
                  teamScores: {},
                  ourTeam: normalizedTeamName
                };
              }
              
              // Track teams and scores in this game using normalized names
              const playerNormalizedTeam = normalizeTeamName(player.team);
              acc[player.game_id].teams.add(playerNormalizedTeam);
              if (!acc[player.game_id].teamScores[playerNormalizedTeam]) {
                acc[player.game_id].teamScores[playerNormalizedTeam] = 0;
              }
              acc[player.game_id].teamScores[playerNormalizedTeam] += player.points || 0;
              
              return acc;
            }, {});

            // Convert to games with proper opponent data
            const games = Object.values(gamesByGameId).map((gameData: any) => {
              const teams = Array.from(gameData.teams) as string[];
              const opponent = teams.find(team => team !== normalizedTeamName) || 'Unknown';
              const ourScore = gameData.teamScores[normalizedTeamName] || 0;
              
              return {
                totalPoints: ourScore,
                date: gameData.game_date,
                opponent: opponent
              };
            });
            
            const recentGames = games.slice(-5); // Last 5 games
            
            // Get roster with stats
            const roster: PlayerStat[] = teamPlayers.reduce((acc: PlayerStat[], player: any) => {
              const existing = acc.find(p => p.name === player.name);
              if (existing) {
                existing.totalPoints += player.points || 0;
                existing.totalRebounds += player.rebounds_total || 0;
                existing.totalAssists += player.assists || 0;
                existing.gamesPlayed += 1;
              } else {
                acc.push({
                  name: player.name,
                  position: player.position || 'Player',
                  totalPoints: player.points || 0,
                  totalRebounds: player.rebounds_total || 0,
                  totalAssists: player.assists || 0,
                  gamesPlayed: 1,
                  avgPoints: 0,
                  avgRebounds: 0,
                  avgAssists: 0
                });
              }
              return acc;
            }, []);
            
            // Calculate averages
            roster.forEach(player => {
              player.avgPoints = Math.round((player.totalPoints / player.gamesPlayed) * 10) / 10;
              player.avgRebounds = Math.round((player.totalRebounds / player.gamesPlayed) * 10) / 10;
              player.avgAssists = Math.round((player.totalAssists / player.gamesPlayed) * 10) / 10;
            });
            
            // Find top player (or provide default if no players)
            const topPlayer = roster.length > 0 
              ? roster.reduce((prev, current) => 
                  (prev.avgPoints > current.avgPoints) ? prev : current
                )
              : {
                  name: 'No players yet',
                  position: '',
                  avgPoints: 0,
                  avgRebounds: 0,
                  avgAssists: 0,
                  totalPoints: 0,
                  totalRebounds: 0,
                  totalAssists: 0,
                  gamesPlayed: 0
                };
            
            return {
              name: teamName,
              roster,
              topPlayer,
              recentGames,
              totalGames: games.length,
              avgTeamPoints: games.length > 0 ? 
                Math.round((games.reduce((sum, game) => sum + game.totalPoints, 0) / games.length) * 10) / 10 : 0
            };
          }));
          
          setTeams(teamsWithData);
      } catch (error) {
        console.error("Error fetching league and teams:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueAndTeams();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading teams...</p>
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-[#fffaf1] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">League Not Found</h1>
          <p className="text-slate-600 mb-4">The league you're looking for doesn't exist.</p>
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
      <header className="bg-white shadow-sm sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={SwishLogo}
            alt="Swish Assistant"
            className="h-9 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>

        <div className="relative w-full max-w-md mx-6">
          <input
            type="text"
            placeholder="Find your league"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full px-4 py-2 border border-gray-300 rounded-full text-sm"
          />
          <button
            onClick={handleSearch}
            className="absolute right-0 top-0 h-full px-4 bg-orange-500 hover:bg-orange-600 text-white rounded-full text-sm"
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

        <div className="flex gap-4 text-sm">
          <button
            onClick={() => navigate("/")}
            className="text-slate-600 hover:text-orange-500"
          >
            Home
          </button>
          <button
            onClick={() => navigate(`/league/${slug}`)}
            className="text-slate-600 hover:text-orange-500"
          >
            Back to League
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* League Header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-xl p-8 text-white mb-8">
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 bg-white/20 rounded-xl flex items-center justify-center border-2 border-white/30">
              <div className="text-center">
                <div className="text-3xl font-bold">{league.name.charAt(0)}</div>
                <div className="text-sm opacity-75">LOGO</div>
              </div>
            </div>
            
            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{league.name}</h1>
              <p className="text-lg opacity-90 mb-2">
                Organised by {league.organiser_name || "BallParkSports"}
              </p>
              <div className="text-lg opacity-90">
                {teams.length} Teams • {teams.reduce((sum, team) => sum + team.totalGames, 0)} Total Games
              </div>
            </div>
          </div>
        </div>

        {/* Teams Grid */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800 mb-6">League Teams</h2>
          
          {teams.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {teams.map((team, index) => (
                <div key={team.name} className="bg-white rounded-xl shadow hover:shadow-lg transition-shadow border border-gray-200 overflow-hidden">
                  {/* Team Header */}
                  <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white">
                    <div className="flex items-center gap-4">
                      {/* Team Logo */}
                      <TeamLogo 
                        teamName={team.name} 
                        leagueId={league.league_id} 
                        size="lg" 
                        className="border-2 border-white/30" 
                      />
                      
                      {/* Team Info */}
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold mb-2">{team.name}</h3>
                        <div className="text-sm opacity-90 space-y-1">
                          <div>{team.roster.length} Players • {team.totalGames} Games</div>
                          <div>Team Average: <span className="font-bold">{team.avgTeamPoints} PPG</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Team Content */}
                  <div className="p-6 space-y-4">
                    {/* Top Player & Team Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Top Player */}
                      {team.topPlayer && (
                        <div>
                          <h4 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-2">
                            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                            </svg>
                            Top Player
                          </h4>
                          <div className="bg-gray-50 border border-orange-100 rounded-lg p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                {team.topPlayer.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-slate-800 text-sm truncate">{team.topPlayer.name}</div>
                                <div className="text-xs text-slate-600">{team.topPlayer.position}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-orange-600 text-sm">{team.topPlayer.avgPoints}</div>
                                <div className="text-xs text-slate-500">PPG</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Recent Form */}
                      <div>
                        <h4 className="font-semibold text-slate-800 mb-3 text-sm flex items-center gap-2">
                          <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          Recent Games
                        </h4>
                        <div className="space-y-2">
                          {team.recentGames.slice(0, 3).map((game, idx) => (
                            <div key={idx} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                              <span className="text-slate-700">vs {game.opponent}</span>
                              <span className="font-bold text-orange-600">{game.totalPoints} PTS</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* View Full Profile Button */}
                    <div className="pt-4 border-t border-gray-100">
                      <button 
                        onClick={() => navigate(`/team/${encodeURIComponent(team.name)}`)}
                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View Full Team Profile
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="text-2xl font-medium text-gray-900 mb-2">No Teams Found</h3>
              <p className="text-gray-600">Teams will appear here once player data is available for this league.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}