import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import React from "react";
import { EditableDescription } from "@/components/EditableDescription";
import { useAuth } from "@/hooks/use-auth";
import { Helmet } from "react-helmet-async";

interface League {
  league_id: string;
  name: string;
  slug: string;
}

interface PlayerStat {
  player_id?: string;
  player_slug?: string;
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
  opponentScore?: number;
  isWin?: boolean;
}

interface UpcomingGame {
  matchtime: string;
  hometeam: string;
  awayteam: string;
  isHome: boolean;
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
  wins: number;
  losses: number;
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
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [teamDescription, setTeamDescription] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const { user } = useAuth();

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
        
        // Step 1: Get all stats for this team from player_stats using team_name field, include slug from players table
        const { data: allStats, error: statsError } = await supabase
          .from("player_stats")
          .select("*, players:player_id(slug)")
          .eq("team_name", decodedTeamName);

        if (statsError) {
          console.error("Error fetching player stats:", statsError);
          return;
        }

        setPlayerStats(allStats || []);

        // Step 2: Calculate team stats and get unique player roster
        if (allStats && allStats.length > 0) {
          // Group stats by game_key to get unique games
          const gamesByGameKey = allStats.reduce((acc: Record<string, any>, stat: any) => {
            if (!acc[stat.game_key]) {
              acc[stat.game_key] = {
                game_key: stat.game_key,
                created_at: stat.created_at,
                home_team: stat.home_team,
                away_team: stat.away_team,
                playerStats: []
              };
            }
            acc[stat.game_key].playerStats.push(stat);
            return acc;
          }, {});

          // Get unique player IDs from stats to identify our roster
          const playerIds = Array.from(new Set(allStats.map((stat: any) => stat.player_id).filter(Boolean)));

          // Calculate team totals for each game and determine W-L record
          let wins = 0;
          let losses = 0;
          
          const games = await Promise.all(Object.values(gamesByGameKey).map(async (gameData: any) => {
            // Sum all player points for this team in this game
            const ourScore = gameData.playerStats.reduce((sum: number, stat: any) => sum + (stat.spoints || 0), 0);
            
            // Determine opponent from home/away teams
            const opponent = gameData.home_team === decodedTeamName ? gameData.away_team : gameData.home_team;
            
            // Fetch all stats for this game to calculate opponent score
            const { data: allGameStats } = await supabase
              .from("player_stats")
              .select("spoints, player_id")
              .eq("game_key", gameData.game_key);
            
            // Filter out our team's stats to get opponent stats
            const opponentStats = allGameStats?.filter((stat: any) => 
              !playerIds.includes(stat.player_id)
            ) || [];
            
            const opponentScore = opponentStats.reduce((sum: number, stat: any) => sum + (stat.spoints || 0), 0);
            
            const isWin = ourScore > opponentScore;
            
            if (isWin) {
              wins++;
            } else {
              losses++;
            }
            
            return {
              totalPoints: ourScore,
              date: gameData.created_at,
              opponent: opponent,
              opponentScore: opponentScore,
              isWin: isWin
            };
          }));
          
          const recentGames = games.slice(-10);

          // Step 3: Calculate player averages from stats
          const playerStatsMap = new Map<string, {
            player_id: string;
            player_slug?: string;
            name: string;
            position: string;
            totalPoints: number;
            totalRebounds: number;
            totalAssists: number;
            totalSteals: number;
            totalBlocks: number;
            gamesPlayed: number;
          }>();

          allStats.forEach((stat: any) => {
            const playerId = stat.player_id || stat.id;
            const playerName = stat.full_name || stat.name || 'Unknown Player';
            const playerSlug = stat.players?.slug || null;
            
            if (!playerStatsMap.has(playerId)) {
              playerStatsMap.set(playerId, {
                player_id: playerId,
                player_slug: playerSlug,
                name: playerName,
                position: stat.position || 'Player',
                totalPoints: 0,
                totalRebounds: 0,
                totalAssists: 0,
                totalSteals: 0,
                totalBlocks: 0,
                gamesPlayed: 0
              });
            }
            
            const playerData = playerStatsMap.get(playerId)!;
            playerData.totalPoints += stat.spoints || 0;
            playerData.totalRebounds += stat.sreboundstotal || 0;
            playerData.totalAssists += stat.sassists || 0;
            playerData.totalSteals += stat.ssteals || 0;
            playerData.totalBlocks += stat.sblocks || 0;
            playerData.gamesPlayed += 1;
          });

          // Convert to roster array and calculate averages
          const rosterWithStats: PlayerStat[] = Array.from(playerStatsMap.values()).map((player) => {
            const avgPoints = player.gamesPlayed > 0 ? Math.round((player.totalPoints / player.gamesPlayed) * 10) / 10 : 0;
            const avgRebounds = player.gamesPlayed > 0 ? Math.round((player.totalRebounds / player.gamesPlayed) * 10) / 10 : 0;
            const avgAssists = player.gamesPlayed > 0 ? Math.round((player.totalAssists / player.gamesPlayed) * 10) / 10 : 0;
            const avgSteals = player.gamesPlayed > 0 ? Math.round((player.totalSteals / player.gamesPlayed) * 10) / 10 : 0;
            const avgBlocks = player.gamesPlayed > 0 ? Math.round((player.totalBlocks / player.gamesPlayed) * 10) / 10 : 0;
            
            return {
              player_id: player.player_id,
              player_slug: player.player_slug,
              name: player.name,
              position: player.position,
              avgPoints,
              avgRebounds,
              avgAssists,
              avgSteals,
              avgBlocks,
              totalPoints: player.totalPoints,
              totalRebounds: player.totalRebounds,
              totalAssists: player.totalAssists,
              totalSteals: player.totalSteals,
              totalBlocks: player.totalBlocks,
              gamesPlayed: player.gamesPlayed
            };
          });
          
          // Sort roster by points
          rosterWithStats.sort((a: PlayerStat, b: PlayerStat) => b.avgPoints - a.avgPoints);
          
          // Find top player
          const topPlayer = rosterWithStats[0];
          
          // Get league info from first stat record
          let league: League | null = null;
          if (allStats[0]?.league_id) {
            const { data: leagueData } = await supabase
              .from("leagues")
              .select("*")
              .eq("league_id", allStats[0].league_id)
              .single();
            league = leagueData as League;
            
            // Check if current user is the league owner
            if (user && leagueData) {
              setIsOwner(user.id === leagueData.user_id || user.id === leagueData.created_by);
            }
          }
          
          // Try to fetch team description from teams table if it exists
          const { data: teamData } = await supabase
            .from("teams")
            .select("description")
            .eq("name", decodedTeamName)
            .single();
          
          if (teamData?.description) {
            setTeamDescription(teamData.description);
          }
          
          // Step 5: Fetch upcoming games from game_schedule table
          const { data: upcomingGamesData, error: scheduleError } = await supabase
            .from("game_schedule")
            .select("*")
            .or(`hometeam.eq.${decodedTeamName},awayteam.eq.${decodedTeamName}`)
            .gte("matchtime", new Date().toISOString())
            .order("matchtime", { ascending: true })
            .limit(5);

          if (!scheduleError && upcomingGamesData) {
            const formattedUpcomingGames = upcomingGamesData.map((game: any) => ({
              matchtime: game.matchtime,
              hometeam: game.hometeam,
              awayteam: game.awayteam,
              isHome: game.hometeam === decodedTeamName,
              opponent: game.hometeam === decodedTeamName ? game.awayteam : game.hometeam
            }));
            setUpcomingGames(formattedUpcomingGames);
          }

          setTeam({
            name: decodedTeamName,
            roster: rosterWithStats,
            topPlayer,
            recentGames,
            totalGames: games.length,
            avgTeamPoints: games.length > 0 ? 
              Math.round((games.reduce((sum, game) => sum + game.totalPoints, 0) / games.length) * 10) / 10 : 0,
            league,
            wins,
            losses
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
    <>
      <Helmet>
        <title>{`${team.name} | Team Profile | Swish Assistant`}</title>
        <meta
          name="description"
          content={
            teamDescription ||
            `View ${team.name} team profile, roster, stats, and recent games${team.league ? ` in ${team.league.name}` : ''} on Swish Assistant.`
          }
        />
        <meta
          property="og:title"
          content={`${team.name} | Team Profile | Swish Assistant`}
        />
        <meta
          property="og:description"
          content={
            teamDescription ||
            `View ${team.name} team profile, roster, stats, and recent games${team.league ? ` in ${team.league.name}` : ''} on Swish Assistant.`
          }
        />
        <meta property="og:type" content="website" />
        <meta
          property="og:url"
          content={`https://www.swishassistant.com/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`}
        />
        <meta
          property="og:image"
          content="https://www.swishassistant.com/og-image.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={`${team.name} | Team Profile | Swish Assistant`} />
        <meta
          name="twitter:description"
          content={
            teamDescription ||
            `View ${team.name} team profile, roster, stats, and recent games${team.league ? ` in ${team.league.name}` : ''} on Swish Assistant.`
          }
        />
        <link rel="canonical" href={`https://www.swishassistant.com/team/${encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'))}`} />
      </Helmet>
      
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
            placeholder="Find your league"
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
              <EditableDescription
                description={teamDescription}
                onSave={async (newDescription) => {
                  // Check if teams table exists and has description column
                  const { error } = await supabase
                    .from('teams')
                    .update({ description: newDescription })
                    .eq('name', team?.name);
                  
                  if (!error) {
                    setTeamDescription(newDescription);
                  } else {
                    // If teams table doesn't exist, show helpful message
                    if (error.code === '42P01') {
                      throw new Error('Please add a "teams" table with "name" and "description" columns in Supabase first.');
                    }
                    throw error;
                  }
                }}
                placeholder={`${team.name} is a competitive basketball team${team.league ? ` competing in ${team.league.name}` : ''}. Add a description to improve SEO...`}
                canEdit={isOwner}
              />
            </div>

            {/* Team Stats Summary */}
            <div className="bg-gradient-to-br from-orange-50 to-yellow-50 border-2 border-orange-300 rounded-xl shadow-md p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Team Statistics
              </h2>
              <div className="space-y-3 md:space-y-4">
                <div className="bg-white rounded-lg p-3 md:p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-slate-600 font-medium">W-L Record</span>
                    </div>
                    <span className="text-2xl md:text-3xl font-bold text-orange-600" data-testid="team-record">
                      {team.wins}-{team.losses}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600">Games Played</span>
                  <span className="font-semibold text-orange-600">{team.totalGames}</span>
                </div>
                <div className="flex justify-between text-sm md:text-base">
                  <span className="text-slate-600">Avg Points Per Game</span>
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
                  onClick={() => {
                    const identifier = team.topPlayer.player_slug || team.topPlayer.player_id;
                    if (identifier) navigate(`/player/${identifier}`);
                  }}
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
                        onClick={() => {
                          const identifier = player.player_slug || player.player_id;
                          if (identifier) navigate(`/player/${identifier}`);
                        }}
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
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium text-slate-800 text-sm md:text-base">vs {game.opponent}</div>
                      <div className="text-xs md:text-sm text-slate-500 mt-1">
                        Final: <span className="font-semibold text-slate-700">{game.totalPoints} - {game.opponentScore}</span>
                      </div>
                    </div>
                    <div>
                      {game.isWin !== undefined && (
                        <span className={`text-xs md:text-sm px-3 py-1 rounded font-semibold ${game.isWin ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {game.isWin ? 'W' : 'L'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Schedule */}
            {upcomingGames.length > 0 && (
              <div className="bg-white rounded-xl shadow p-4 md:p-6">
                <h2 className="text-base md:text-lg font-semibold text-slate-800 mb-3 md:mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Upcoming Schedule ({upcomingGames.length})
                </h2>
                <div className="space-y-2 md:space-y-3">
                  {upcomingGames.map((game: UpcomingGame, index: number) => (
                    <div 
                      key={index} 
                      className="flex flex-col md:flex-row justify-between md:items-center p-3 bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-lg gap-2 md:gap-0"
                      data-testid={`upcoming-game-${index}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-slate-800 text-sm md:text-base">
                            {game.isHome ? 'vs' : '@'} {game.opponent}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${game.isHome ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                            {game.isHome ? 'HOME' : 'AWAY'}
                          </span>
                        </div>
                        <div className="text-xs md:text-sm text-slate-500 mt-1">
                          {new Date(game.matchtime).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div className="text-left md:text-right">
                        <svg className="w-5 h-5 md:w-6 md:h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      </div>
    </>
  );
}