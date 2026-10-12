import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { fetchLeagueChildren } from "@/lib/leagueChildren";
import { Loader2, Trash2, Upload, Users } from "lucide-react";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_GHOST, BTN_PRIMARY } from "@/components/layout/proUi";
import { TeamLogoUploader } from "@/components/TeamLogoUploader";
import { TeamLogo, invalidateLogoCache } from "@/components/TeamLogo";
import React from "react";

interface League {
  league_id: string;
  name: string;
  slug: string;
  user_id: string;
}

interface Team {
  name: string;
  hasLogo: boolean;
}

export default function TeamLogoManager() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const fetchLeagueAndTeams = async () => {
      if (!slug) return;
      
      setLoading(true);
      try {
        // Fetch league info
        const { data: leagueData, error: leagueError } = await supabase
          .from("competitions")
          .select("*")
          .eq("slug", slug)
          .single();

        if (leagueError) {
          console.error("Error fetching league:", leagueError);
          return;
        }

        setLeague(leagueData);
        setIsOwner(currentUser?.id === leagueData.user_id);

        const childCompetitions = await fetchLeagueChildren(leagueData.league_id);

        const childIds = childCompetitions.map((c) => c.league_id);
        const isParent = childIds.length > 0;
        const queryLeagueIds = isParent ? [leagueData.league_id, ...childIds] : [leagueData.league_id];

        const allTeamNames = new Set<string>();
        
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("name")
          .in("league_id", queryLeagueIds);

        if (teamsData && !teamsError) {
          teamsData.forEach(team => {
            if (team.name) allTeamNames.add(team.name);
          });
        }

        const { data: teamStats, error: statsError } = await supabase
          .from("team_stats")
          .select("*")
          .in("league_id", queryLeagueIds);

        if (teamStats && !statsError) {
          teamStats.forEach(stat => {
            if (stat.name) allTeamNames.add(stat.name);
          });
        }

        const { data: scheduleData, error: scheduleError } = await supabase
          .from("game_schedule")
          .select("hometeam, awayteam")
          .in("league_id", queryLeagueIds);

        if (scheduleData && !scheduleError) {
          scheduleData.forEach(game => {
            if (game.hometeam) allTeamNames.add(game.hometeam);
            if (game.awayteam) allTeamNames.add(game.awayteam);
          });
        }

        const uniqueTeams = Array.from(allTeamNames).sort();
        const logoQueryIds = isParent ? [leagueData.league_id, ...childIds] : [leagueData.league_id];

        const logoMap: Record<string, string> = {};

        // Read logo_url directly from the teams table
        const { data: logoRows } = await supabase
          .from("teams")
          .select("name, logo_url")
          .in("league_id", logoQueryIds)
          .not("logo_url", "is", null);

        (logoRows || []).forEach((row: { name: string; logo_url: string }) => {
          if (row.name && row.logo_url) {
            logoMap[row.name] = row.logo_url;
          }
        });

        setTeamLogos(logoMap);

        const teamsWithLogos = uniqueTeams.map(teamName => ({
          name: teamName,
          hasLogo: !!logoMap[teamName]
        }));

        setTeams(teamsWithLogos);
      } catch (error) {
        console.error("Error fetching league and teams:", error);
      } finally {
        setLoading(false);
      }
    };

    if (currentUser !== undefined) {
      fetchLeagueAndTeams();
    }
  }, [slug, currentUser]);

  const handleLogoUploadComplete = (teamName: string) => {
    // Refresh the page to show updated logos
    window.location.reload();
  };

  const handleRemoveLogo = async (teamName: string) => {
    if (!league) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('Not authenticated');
        return;
      }

      const response = await fetch('/api/team-logos/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          leagueId: league.league_id,
          teamName: teamName
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete logo');
      }

      // Update local state
      setTeamLogos(prev => {
        const updated = { ...prev };
        delete updated[teamName];
        return updated;
      });

      setTeams(prev => prev.map(team => 
        team.name === teamName ? { ...team, hasLogo: false } : team
      ));

      // Invalidate cache so all TeamLogo components refetch
      invalidateLogoCache(teamName, league.league_id);
    } catch (error) {
      console.error("Error removing logo:", error);
    }
  };

  const back = { href: `/competition/${slug}`, label: "Back to league" };

  if (loading) {
    return (
      <AdminPageShell title="Team logos" eyebrow="League admin" back={back} width="max-w-7xl">
        <AdminPageNotice>
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-[color:var(--ch-accent)]" />
          Loading team management...
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

  if (!isOwner) {
    return (
      <AdminPageShell title="Access denied" eyebrow="League admin" back={back} width="max-w-7xl">
        <AdminPageNotice>
          <p>Only league owners can manage team logos.</p>
          <button type="button" onClick={() => navigate(`/competition/${slug}`)} className={`${BTN_PRIMARY} mt-4`}>
            Back to League
          </button>
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      title="Team logos"
      eyebrow="League admin"
      back={back}
      width="max-w-7xl"
      description={
        <>
          Upload and manage team logos for <span className="font-semibold text-[color:var(--ch-text)]">{league.name}</span>. They appear across
          all league features including scoreboards, standings, and team profiles.
        </>
      }
    >
      {/* Teams Grid */}
      {teams.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <div key={team.name} className="ch-card overflow-hidden">
              {/* Team Header */}
              <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ch-border)] px-4 py-3">
                <h3 className="min-w-0 truncate text-[15px] font-semibold text-[color:var(--ch-text)]">{team.name}</h3>
                <span
                  className={`inline-flex h-5 flex-none items-center rounded-full px-2 text-[10.5px] font-bold uppercase tracking-[0.06em] ${
                    team.hasLogo ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]"
                  }`}
                >
                  {team.hasLogo ? "Has Logo" : "No Logo"}
                </span>
              </div>

              {/* Team Actions */}
              <div className="space-y-3 p-4">
                {/* Current Logo Preview */}
                <TeamLogo
                  teamName={team.name}
                  leagueId={league.league_id}
                  logoUrl={teamLogos[team.name]}
                  size="xl"
                  className="mx-auto"
                />

                {/* Upload/Replace Button */}
                <TeamLogoUploader
                  leagueId={league.league_id}
                  teamName={team.name}
                  onUploadComplete={() => handleLogoUploadComplete(team.name)}
                  buttonClassName={`${team.hasLogo ? BTN_GHOST : BTN_PRIMARY} w-full`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="h-4 w-4" />
                    {team.hasLogo ? 'Replace Logo' : 'Upload Logo'}
                  </div>
                </TeamLogoUploader>

                {/* Remove Logo Button */}
                {team.hasLogo && (
                  <button
                    type="button"
                    onClick={() => handleRemoveLogo(team.name)}
                    className={`${BTN_GHOST} w-full hover:!text-[color:var(--ch-loss)]`}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove Logo
                  </button>
                )}
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

      {/* Help Section */}
      <div className="ch-card mt-8 p-5">
        <h3 className="text-sm font-semibold text-[color:var(--ch-text)]">Logo guidelines</h3>
        <ul className="mt-2 space-y-1 text-sm text-[color:var(--ch-text-2)]">
          <li>• Logos should be square (1:1 aspect ratio) for best results</li>
          <li>• Recommended size: 512x512 pixels or larger</li>
          <li>• Supported formats: JPG, PNG, GIF, WebP</li>
          <li>• Maximum file size: 5MB</li>
          <li>• Logos will automatically appear in scoreboards, standings, and team profiles</li>
        </ul>
      </div>
    </AdminPageShell>
  );
}
