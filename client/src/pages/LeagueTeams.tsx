import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { BarChart3, Eye, Loader2, Star, Users } from "lucide-react";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_PRIMARY, TALL } from "@/components/layout/proUi";
import { TeamLogo } from "@/components/TeamLogo";
import { normalizeTeamName } from "@/lib/teamUtils";
import React from "react";
import { teamPath } from "@shared/seo";

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

export default function LeagueTeams() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeagueAndTeams = async () => {
      if (!slug) return;
      
      setLoading(true);
      try {
        // Fetch league info via service-role endpoint (bypasses RLS for private leagues)
        const leagueBrandRes = await fetch(`/api/public/league-branding/${encodeURIComponent(slug)}`);
        if (!leagueBrandRes.ok) {
          console.error("Error fetching league:", leagueBrandRes.status);
          return;
        }
        const leagueData = await leagueBrandRes.json();
        if (!leagueData?.league_id) {
          console.error("League not found for slug:", slug);
          return;
        }

        setLeague(leagueData);

        const { data: allTeams, error: teamsError } = await supabase
          .from("teams")
          .select("team_id, name")
          .eq("league_id", leagueData.league_id);

        if (teamsError) {
          console.error("Error fetching teams:", teamsError);
          return;
        }

        if (!allTeams || allTeams.length === 0) {
          setTeams([]);
          setLoading(false);
          return;
        }

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
          
            // Filter stats for this team (team_name column in player_stats)
            const teamPlayers = allPlayerStats ? allPlayerStats.filter(stat => 
              normalizeTeamName(stat.team_name || stat.team || '') === normalizedTeamName
            ) : [];
            
            // Calculate team totals and averages using game_key to properly determine opponents
            const gamesByGameId = teamPlayers.reduce((acc: Record<string, any>, player: any) => {
              const gameKey = player.game_key || player.game_id;
              if (!gameKey) return acc;
              if (!acc[gameKey]) {
                acc[gameKey] = {
                  game_id: gameKey,
                  game_date: player.game_date,
                  teams: new Set(),
                  teamScores: {},
                  ourTeam: normalizedTeamName
                };
              }
              
              const playerNormalizedTeam = normalizeTeamName(player.team_name || player.team || '');
              acc[gameKey].teams.add(playerNormalizedTeam);
              if (!acc[gameKey].teamScores[playerNormalizedTeam]) {
                acc[gameKey].teamScores[playerNormalizedTeam] = 0;
              }
              acc[gameKey].teamScores[playerNormalizedTeam] += player.spoints || player.points || 0;
              
              return acc;
            }, {});

            const games = Object.values(gamesByGameId).map((gameData: any) => {
              const teams = Array.from(gameData.teams) as string[];
              const opponent = teams.find(t => t !== normalizedTeamName) || 'Unknown';
              const ourScore = gameData.teamScores[normalizedTeamName] || 0;
              return {
                totalPoints: ourScore,
                date: gameData.game_date,
                opponent,
              };
            });
            
            const recentGames = games.slice(-5);
            
            // Build per-player roster using correct column names
            const playerName = (p: any) => p.full_name || `${p.firstname || ''} ${p.familyname || ''}`.trim() || 'Unknown';
            const roster: PlayerStat[] = teamPlayers.reduce((acc: PlayerStat[], player: any) => {
              const name = playerName(player);
              const existing = acc.find(p => p.name === name);
              const pts = player.spoints ?? player.points ?? 0;
              const reb = player.sreboundstotal ?? player.rebounds_total ?? 0;
              const ast = player.sassists ?? player.assists ?? 0;
              if (existing) {
                existing.totalPoints += pts;
                existing.totalRebounds += reb;
                existing.totalAssists += ast;
                existing.gamesPlayed += 1;
              } else {
                acc.push({
                  name,
                  position: player.playingposition || player.position || 'Player',
                  totalPoints: pts,
                  totalRebounds: reb,
                  totalAssists: ast,
                  gamesPlayed: 1,
                  avgPoints: 0,
                  avgRebounds: 0,
                  avgAssists: 0,
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
        console.error("Error fetching league and teams:", error, JSON.stringify(error));
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueAndTeams();
  }, [slug]);

  const back = { href: `/competition/${slug}`, label: "Back to league" };

  if (loading) {
    return (
      <AdminPageShell title="League teams" eyebrow="League admin" back={back} width="max-w-7xl">
        <AdminPageNotice>
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-[color:var(--ch-accent)]" />
          Loading teams...
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  if (!league) {
    return (
      <AdminPageShell title="League not found" eyebrow="League admin" back={{ href: "/", label: "Home" }} width="max-w-7xl">
        <AdminPageNotice>
          <p>The league you're looking for doesn't exist.</p>
          <button type="button" onClick={() => navigate("/")} className={`${BTN_PRIMARY} mt-4`}>
            Go Home
          </button>
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  const subheading = "mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ch-text)]";

  return (
    <AdminPageShell
      title={league.name}
      eyebrow="League teams"
      back={back}
      width="max-w-7xl"
      description={
        <>
          Organised by {league.organiser_name || "BallParkSports"} · {teams.length} Teams •{" "}
          {teams.reduce((sum, team) => sum + team.totalGames, 0)} Total Games
        </>
      }
    >
      {/* Teams Grid */}
      {teams.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {teams.map((team) => (
            <div key={team.name} className="ch-card ch-hover overflow-hidden">
              {/* Team Header */}
              <div className="flex items-center gap-4 border-b border-[color:var(--ch-border)] p-4 sm:p-5">
                <TeamLogo teamName={team.name} leagueId={league.league_id} size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="ch-display truncate text-[1.5rem] font-bold uppercase leading-none tracking-tight text-[color:var(--ch-text)]">
                    {team.name}
                  </h3>
                  <div className="mt-1.5 text-[13px] text-[color:var(--ch-text-2)]">
                    {team.roster.length} Players • {team.totalGames} Games · Team Average:{" "}
                    <span className="ch-num font-semibold text-[color:var(--ch-text)]">{team.avgTeamPoints} PPG</span>
                  </div>
                </div>
              </div>

              {/* Team Content */}
              <div className="space-y-4 p-4 sm:p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Top Player */}
                  {team.topPlayer && (
                    <div>
                      <h4 className={subheading}>
                        <Star className="h-4 w-4 text-[color:var(--ch-accent)]" />
                        Top Player
                      </h4>
                      <div className="ch-tile flex items-center gap-3 p-3">
                        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[color:var(--ch-accent-soft)] text-sm font-bold text-[color:var(--ch-accent)]">
                          {team.topPlayer.name.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[color:var(--ch-text)]">{team.topPlayer.name}</div>
                          <div className="text-xs text-[color:var(--ch-text-2)]">{team.topPlayer.position}</div>
                        </div>
                        <div className="text-right">
                          <div className="ch-num text-sm font-bold text-[color:var(--ch-accent)]">{team.topPlayer.avgPoints}</div>
                          <div className="text-xs text-[color:var(--ch-muted)]">PPG</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recent Form */}
                  <div>
                    <h4 className={subheading}>
                      <BarChart3 className="h-4 w-4 text-[color:var(--ch-accent)]" />
                      Recent Games
                    </h4>
                    <div className="space-y-2">
                      {team.recentGames.slice(0, 3).map((game, idx) => (
                        <div key={idx} className="ch-tile flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 truncate text-[color:var(--ch-text-2)]">vs {game.opponent}</span>
                          <span className="ch-num flex-none font-bold text-[color:var(--ch-accent)]">{game.totalPoints} PTS</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* View Full Profile Button */}
                <div className="border-t border-[color:var(--ch-border)] pt-4">
                  <button
                    type="button"
                    onClick={() => navigate(teamPath(team.name, slug) || `/team/${encodeURIComponent(team.name)}`)}
                    className={`${BTN_PRIMARY} ${TALL} w-full`}
                  >
                    <Eye className="h-4 w-4" />
                    View Full Team Profile
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <AdminPageNotice>
          <Users className="mx-auto mb-3 h-10 w-10 text-[color:var(--ch-muted)]" />
          <h3 className="text-base font-semibold text-[color:var(--ch-text)]">No Teams Found</h3>
          <p className="mt-1">Teams will appear here once player data is available for this league.</p>
        </AdminPageNotice>
      )}
    </AdminPageShell>
  );
}
