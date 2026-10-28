import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import { fetchLeagueChildren } from "@/lib/leagueChildren";
import { TeamLogoUploader } from "@/components/TeamLogoUploader";
import { TeamLogo, invalidateLogoCache } from "@/components/TeamLogo";
import UploadSection from "@/components/LeagueAdmin/upload-section-la";
import UploadNamesPanel from "@/components/LeagueAdmin/upload-names-panel";
import DuplicatePlayerManager from "@/components/LeagueAdmin/DuplicatePlayerManager";
import { Link2, ChevronDown, ExternalLink, Image as ImageIcon, Instagram, Loader2, Upload, Users } from "lucide-react";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_GHOST, BTN_PRIMARY, FIELD, Field, Panel, TALL } from "@/components/layout/proUi";
import { CompetitionFieldSelect } from "@/components/CompetitionFieldSelect";
import { fetchCompetitionFieldOptions, type CompetitionFieldOptions } from "@/lib/competitionFieldOptions";
import { canManageCompetition, fetchManagedCompetitions, topManagedCompetitions } from "@/lib/competitionAccess";

const DETAIL_INPUT_CLASS = `${FIELD} pr-8`;
const BACK = { href: "/league-management", label: "League management" };

interface League {
  league_id: string;
  name: string;
  slug: string;
  parent_league_id?: string | null;
  banner_url?: string;
  instagram_embed_url?: string;
  created_by: string;
  user_id: string;
  organisation?: string | null;
  season?: string | null;
  division?: string | null;
  age_group?: string | null;
  gender?: string | null;
  competition_id?: string | null;
}

interface SiblingSeason {
  league_id: string;
  competition_id: string | null;
  name: string;
  slug: string;
  season: string | null;
  gender: string | null;
  division: string | null;
}

interface TeamLogo {
  id: number;
  leagueId: string;
  teamName: string;
  logoUrl: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function LeagueAdmin() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [updatingInstagram, setUpdatingInstagram] = useState(false);
  const [teams, setTeams] = useState<string[]>([]);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});
  const [uploadingLogo, setUploadingLogo] = useState<string | null>(null);
  const [userLeagues, setUserLeagues] = useState<League[]>([]);

  const [orgInput, setOrgInput] = useState("");
  const [seasonInput, setSeasonInput] = useState("");
  const [divisionInput, setDivisionInput] = useState("");
  const [ageGroupInput, setAgeGroupInput] = useState("");
  const [genderInput, setGenderInput] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  const [siblingSeasons, setSiblingSeasons] = useState<SiblingSeason[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linking, setLinking] = useState(false);

  const [fieldOptions, setFieldOptions] = useState<CompetitionFieldOptions>({
    organisations: [],
    seasons: [],
    divisions: [],
    ageGroups: [],
    genders: [],
  });

  useEffect(() => {
    fetchCompetitionFieldOptions().then(setFieldOptions);
  }, []);

  useEffect(() => {
    checkUser();
    if (slug) {
      fetchLeague();
    }
  }, [slug]);

  useEffect(() => {
    if (currentUser) {
      fetchUserLeagues();
    }
  }, [currentUser]);

  // Fetch sibling seasons whenever the league's competition_id changes
  useEffect(() => {
    if (league?.competition_id) {
      fetchSiblingSeasons(league.competition_id);
    } else {
      setSiblingSeasons([]);
    }
  }, [league?.competition_id]);

  // Fetch teams after league is loaded
  useEffect(() => {
    if (league?.league_id) {
      fetchTeams();
    }
  }, [league?.league_id]);

  // Fetch logos after teams are loaded
  useEffect(() => {
    if (league?.league_id && teams.length > 0) {
      fetchTeamLogos();
    }
  }, [league?.league_id, teams.length]);

  const checkUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    } catch (error) {
      console.error("Error checking user:", error);
    }
  };

  const fetchUserLeagues = async () => {
    if (!currentUser) return;
    
    try {
      // Every season this account runs, including ones shared with it.
      const managed = await fetchManagedCompetitions();
      setUserLeagues(topManagedCompetitions(managed) as League[]);
    } catch (error) {
      console.error('Error fetching user leagues:', error);
    }
  };

  const fetchLeague = async () => {
    try {
      setLoading(true);
      
      const { data: leagues, error } = await supabase
        .from('competitions')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        console.error("Error fetching league:", error);
        return;
      }

      setLeague(leagues);
      setInstagramUrl(leagues?.instagram_embed_url || "");
      setOrgInput(leagues?.organisation || "");
      setSeasonInput(leagues?.season || "");
      setDivisionInput(leagues?.division || "");
      setAgeGroupInput(leagues?.age_group || "");
      setGenderInput(leagues?.gender || "");

      // Owners, managers and app admins can run the league.
      setIsOwner(leagues?.league_id ? await canManageCompetition(leagues.league_id) : false);

    } catch (error) {
      console.error("Error fetching league:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSiblingSeasons = async (competitionId: string) => {
    try {
      const res = await fetch(`/api/league/${competitionId}/competitions`);
      if (!res.ok) {
        setSiblingSeasons([]);
        return;
      }
      const data: SiblingSeason[] = await res.json();
      setSiblingSeasons(data);
    } catch (error) {
      console.error("Error fetching sibling seasons:", error);
      setSiblingSeasons([]);
    }
  };

  const handleSaveDetails = async () => {
    if (!league || !currentUser) return;

    setSavingDetails(true);
    try {
      const { error } = await supabase
        .from('competitions')
        .update({
          organisation: orgInput.trim() || null,
          season: seasonInput.trim() || null,
          division: divisionInput.trim() || null,
          age_group: ageGroupInput.trim() || null,
          gender: genderInput.trim() || null,
        })
        .eq('league_id', league.league_id);

      if (error) throw error;

      setLeague({
        ...league,
        organisation: orgInput.trim() || null,
        season: seasonInput.trim() || null,
        division: divisionInput.trim() || null,
        age_group: ageGroupInput.trim() || null,
        gender: genderInput.trim() || null,
      });
    } catch (error) {
      console.error("Error saving competition details:", error);
      alert("Failed to save competition details");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleLinkToLeague = async (existingLeagueId: string) => {
    if (!league || !currentUser) return;

    setLinking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/league-management/link-season', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ newLeagueId: league.league_id, existingLeagueId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to link competitions');

      setLeague({ ...league, competition_id: result.rootId });
      setShowLinkPicker(false);
      setLinkSearch("");
      fetchTeams();
      alert(`Linked successfully${result.teamsMoved ? ` — ${result.teamsMoved} team${result.teamsMoved === 1 ? '' : 's'} carried over.` : '.'}`);
    } catch (error) {
      console.error("Error linking competition:", error);
      alert(`Failed to link competition: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLinking(false);
    }
  };

  const fetchTeams = async () => {
    if (!league?.league_id) {
      return;
    }
    
    try {
      const childCompetitions = await fetchLeagueChildren(league.league_id);

      const childIds = childCompetitions.map((c) => c.league_id);
      const queryLeagueIds = childIds.length > 0 ? [league.league_id, ...childIds] : [league.league_id];

      const result = await supabase
        .from('team_stats')
        .select('name')
        .in('league_id', queryLeagueIds);
        
      if (result.error) {
        console.error("Error in team query:", result.error);
        setTeams([]);
        return;
      }
      
      if (!result.data || result.data.length === 0) {
        const scheduleResult = await supabase
          .from('game_schedule')
          .select('hometeam, awayteam')
          .in('league_id', queryLeagueIds);
        
        if (scheduleResult.error) {
          console.error("Error in schedule query:", scheduleResult.error);
          setTeams([]);
          return;
        }
        
        if (!scheduleResult.data || scheduleResult.data.length === 0) {
          // Third fallback: teams table
          const teamsTableResult = await supabase
            .from('teams')
            .select('name')
            .in('league_id', queryLeagueIds);
          
          if (!teamsTableResult.error && teamsTableResult.data && teamsTableResult.data.length > 0) {
            const uniqueTeams = Array.from(new Set(
              teamsTableResult.data.map((t: any) => t.name).filter(Boolean)
            )).sort() as string[];
            setTeams(uniqueTeams);
            return;
          }

          // Fourth fallback: v_game_results
          const gameResultsResult = await supabase
            .from('v_game_results')
            .select('home_team, away_team')
            .in('league_id', queryLeagueIds);
          
          if (!gameResultsResult.error && gameResultsResult.data && gameResultsResult.data.length > 0) {
            const teamNames = new Set<string>();
            gameResultsResult.data.forEach((game: any) => {
              if (game.home_team) teamNames.add(game.home_team);
              if (game.away_team) teamNames.add(game.away_team);
            });
            setTeams(Array.from(teamNames).sort());
            return;
          }

          setTeams([]);
          return;
        }
        
        const teamNames = new Set<string>();
        scheduleResult.data.forEach((game: any) => {
          if (game.hometeam) teamNames.add(game.hometeam);
          if (game.awayteam) teamNames.add(game.awayteam);
        });
        
        const uniqueTeams = Array.from(teamNames).sort();
        setTeams(uniqueTeams);
        return;
      }
      
      const uniqueTeams = Array.from(new Set(
        result.data
          .map((stat: any) => stat.name)
          .filter(Boolean)
      ));
      
      setTeams(uniqueTeams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      setTeams([]);
    }
  };

  const fetchTeamLogos = async () => {
    if (!league?.league_id || teams.length === 0) {
      return;
    }
    
    try {
      const childCompetitions = await fetchLeagueChildren(league.league_id);

      const childIds = childCompetitions.map((c) => c.league_id);
      const logoQueryIds = childIds.length > 0 ? [league.league_id, ...childIds] : [league.league_id];

      const logoMap: Record<string, string> = {};
      
      for (const teamName of teams) {
        try {
          for (const lid of logoQueryIds) {
            const fileName = `${lid}_${teamName.replace(/\s+/g, '_')}.png`;
            
            const { data } = supabase.storage
              .from('team-logos')
              .getPublicUrl(fileName);
            
            const response = await fetch(data.publicUrl, { method: 'HEAD' });
            if (response.ok) {
              logoMap[teamName] = data.publicUrl;
              break;
            }
          }
        } catch (error) {
        }
      }
      
      setTeamLogos(logoMap);
    } catch (error) {
      console.error("Error fetching team logos:", error);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !league || !currentUser) return;

    setUploadingBanner(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('leagueId', league.league_id);

      const response = await fetch('/api/league-banners/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Banner upload failed');
      }

      const result = await response.json();
      setLeague({ ...league, banner_url: result.publicUrl });
      
    } catch (error) {
      console.error("Error uploading banner:", error);
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleInstagramUpdate = async () => {
    if (!league || !currentUser) return;

    setUpdatingInstagram(true);
    try {
      const { error } = await supabase
        .from('competitions')
        .update({ instagram_embed_url: instagramUrl })
        .eq('league_id', league.league_id);

      if (error) throw error;

      setLeague({ ...league, instagram_embed_url: instagramUrl });
      
    } catch (error) {
      console.error("Error updating Instagram URL:", error);
    } finally {
      setUpdatingInstagram(false);
    }
  };

  const handleTeamLogoUpload = async (teamName: string, file: File) => {
    if (!league || !currentUser) return;

    setUploadingLogo(teamName);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${league.league_id}_${teamName.replace(/\s+/g, '_')}.${fileExt}`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileName', fileName);
      formData.append('leagueId', league.league_id);
      formData.append('teamName', teamName);

      const response = await fetch('/api/team-logos/upload-direct', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
        body: formData,
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Upload failed');
      }

      const result = await response.json();

      setTeamLogos(prev => ({
        ...prev,
        [teamName]: result.publicUrl
      }));
      
      alert('Team logo uploaded successfully!');
    } catch (error) {
      console.error("Error uploading team logo:", error);
      alert(`Failed to upload team logo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploadingLogo(null);
    }
  };

  const handleRemoveLogo = async (teamName: string) => {
    if (!league || !currentUser) return;

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

      // Invalidate cache so all TeamLogo components refetch
      invalidateLogoCache(teamName, league.league_id);
      
      alert('Team logo removed successfully!');
    } catch (error) {
      console.error("Error removing team logo:", error);
      alert('Failed to remove team logo');
    }
  };

  if (loading) {
    return (
      <AdminPageShell title="League admin" eyebrow="League management" back={BACK} width="max-w-7xl">
        <AdminPageNotice>
          <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-[color:var(--ch-accent)]" />
          Loading league admin...
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  if (!league) {
    return (
      <AdminPageShell title="League not found" eyebrow="League management" back={BACK} width="max-w-7xl">
        <AdminPageNotice>
          <p>The league you're looking for doesn't exist.</p>
          <button type="button" onClick={() => navigate('/')} className={`${BTN_PRIMARY} mt-4`}>
            Go Home
          </button>
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  if (!isOwner) {
    return (
      <AdminPageShell title="Access denied" eyebrow="League management" back={BACK} width="max-w-7xl">
        <AdminPageNotice>
          <p>You don't have permission to access this league's admin panel.</p>
          <button type="button" onClick={() => navigate(`/competition/${slug}`)} className={`${BTN_PRIMARY} mt-4`}>
            View League
          </button>
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  const otherLeagues = userLeagues.filter((l) => l.league_id !== league.league_id);

  return (
    <AdminPageShell
      title={league.name}
      eyebrow="League admin"
      back={BACK}
      width="max-w-7xl"
      actions={
        <button type="button" onClick={() => navigate(`/competition/${slug}`)} className={BTN_GHOST} data-testid="button-back-to-league">
          <ExternalLink className="h-4 w-4" />
          View league page
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

        {/* Competition Details & Linking */}
        <Panel
          title="Competition details"
          icon={Link2}
          description="Organisation, season, and division metadata for this competition"
          className="md:col-span-2"
        >
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Organisation">
              <CompetitionFieldSelect
                value={orgInput}
                onChange={setOrgInput}
                options={fieldOptions.organisations}
                placeholder="e.g. Basketball England"
                inputClassName={DETAIL_INPUT_CLASS}
              />
            </Field>
            <Field label="Season">
              <CompetitionFieldSelect
                value={seasonInput}
                onChange={setSeasonInput}
                options={fieldOptions.seasons}
                placeholder="e.g. 2026-27"
                inputClassName={DETAIL_INPUT_CLASS}
              />
            </Field>
            <Field label="Division">
              <CompetitionFieldSelect
                value={divisionInput}
                onChange={setDivisionInput}
                options={fieldOptions.divisions}
                placeholder="e.g. Division One"
                inputClassName={DETAIL_INPUT_CLASS}
              />
            </Field>
            <Field label="Age group">
              <CompetitionFieldSelect
                value={ageGroupInput}
                onChange={setAgeGroupInput}
                options={fieldOptions.ageGroups}
                placeholder="e.g. U16"
                inputClassName={DETAIL_INPUT_CLASS}
              />
            </Field>
            <Field label="Gender">
              <CompetitionFieldSelect
                value={genderInput}
                onChange={setGenderInput}
                options={fieldOptions.genders}
                placeholder="e.g. Women's"
                inputClassName={DETAIL_INPUT_CLASS}
              />
            </Field>
          </div>
          <button type="button" onClick={handleSaveDetails} disabled={savingDetails} className={`${BTN_PRIMARY} ${TALL}`}>
            {savingDetails && <Loader2 className="h-4 w-4 animate-spin" />}
            {savingDetails ? 'Saving...' : 'Save Details'}
          </button>

          <div className="mt-6 border-t border-[color:var(--ch-border)] pt-5">
            <h3 className="text-sm font-semibold text-[color:var(--ch-text)]">Linked seasons</h3>
            <p className="mb-3 mt-1 max-w-3xl text-[13px] text-[color:var(--ch-text-2)]">
              Link this competition to a prior season of the same league so it's recognised as the same league — teams and logos carry over immediately, and new uploads for either season will match instead of creating a duplicate.
            </p>

            {siblingSeasons.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {siblingSeasons
                  .filter((s) => s.league_id !== league.league_id)
                  .map((s) => (
                    <button
                      key={s.league_id}
                      type="button"
                      onClick={() => navigate(`/league-admin/${s.slug}`)}
                      className="ch-chip inline-flex h-8 items-center gap-1.5 px-3 text-xs"
                    >
                      <Link2 className="h-3 w-3" />
                      {s.name}{s.season ? ` · ${s.season}` : ''}
                    </button>
                  ))}
              </div>
            ) : (
              <p className="mb-3 text-sm text-[color:var(--ch-muted)]">Not linked to any other season yet.</p>
            )}

            <div className="relative inline-block">
              <button
                type="button"
                onClick={() => setShowLinkPicker(!showLinkPicker)}
                disabled={linking}
                aria-expanded={showLinkPicker}
                className={BTN_GHOST}
              >
                <Link2 className="h-4 w-4" />
                {linking ? 'Linking...' : 'Link to existing league'}
                <ChevronDown className={`h-3 w-3 transition-transform ${showLinkPicker ? 'rotate-180' : ''}`} />
              </button>

              {showLinkPicker && (
                <div className="absolute z-10 mt-2 w-72 rounded-xl border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] p-2 shadow-[var(--ch-shadow-lg)]">
                  <input
                    type="text"
                    placeholder="Search your leagues..."
                    value={linkSearch}
                    onChange={(e) => setLinkSearch(e.target.value)}
                    className={`${FIELD} mb-2`}
                  />
                  <div className="max-h-48 divide-y divide-[color:var(--ch-border)] overflow-y-auto">
                    {otherLeagues
                      .filter((l) => l.name.toLowerCase().includes(linkSearch.trim().toLowerCase()))
                      .map((l) => (
                        <button
                          key={l.league_id}
                          type="button"
                          onClick={() => handleLinkToLeague(l.league_id)}
                          className="block w-full rounded px-3 py-2 text-left text-sm text-[color:var(--ch-text)] hover:bg-[color:var(--ch-surface-3)]"
                        >
                          {l.name}{l.season ? <span className="text-[color:var(--ch-muted)]"> · {l.season}</span> : null}
                        </button>
                      ))}
                    {otherLeagues.length === 0 && (
                      <p className="px-3 py-2 text-sm text-[color:var(--ch-muted)]">No other leagues found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>

        {/* Banner Management */}
        <Panel title="League banner" icon={ImageIcon} description="Upload a custom banner for your league page">
          {league.banner_url && (
            <div className="mb-4">
              <img
                src={league.banner_url}
                alt="League Banner"
                className="h-32 w-full rounded-[10px] border border-[color:var(--ch-border)] object-cover md:h-48"
              />
            </div>
          )}

          <input
            type="file"
            accept="image/*"
            onChange={handleBannerUpload}
            className="hidden"
            id="banner-upload"
            disabled={uploadingBanner}
          />
          <label
            htmlFor="banner-upload"
            className={`${BTN_PRIMARY} ${TALL} w-full cursor-pointer ${uploadingBanner ? 'pointer-events-none opacity-50' : ''}`}
          >
            {uploadingBanner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploadingBanner ? 'Uploading...' : league.banner_url ? 'Change Banner' : 'Upload Banner'}
          </label>
        </Panel>

        {/* Instagram Management */}
        <Panel title="Instagram" icon={Instagram} description="Connect your league's Instagram profile">
          <div className="flex flex-col gap-2.5 md:flex-row">
            <input
              type="text"
              placeholder="Enter Instagram profile URL (e.g., https://www.instagram.com/yourleague)"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              className={`${FIELD} !h-11`}
            />
            <button type="button" onClick={handleInstagramUpdate} disabled={updatingInstagram} className={`${BTN_PRIMARY} ${TALL} flex-none`}>
              {updatingInstagram && <Loader2 className="h-4 w-4 animate-spin" />}
              {updatingInstagram ? 'Updating...' : 'Update Instagram'}
            </button>
          </div>
        </Panel>

        {/* PDF Upload Section */}
        <div className="md:col-span-2">
          <UploadSection leagues={
            league?.parent_league_id && !userLeagues.some(l => l.league_id === league.league_id)
              ? [...userLeagues, league]
              : userLeagues
          } />
        </div>

        {/* PDF titles that upload into this competition (or the ones under it) */}
        <UploadNamesPanel league={league} />

        {/* Duplicate Player Management */}
        <DuplicatePlayerManager leagueId={league.league_id} />

        {/* Team Logo Management */}
        <Panel
          title="Team logos"
          icon={Users}
          description="Upload and manage logos for all teams in your league"
          className="md:col-span-2"
        >
          <p className="mb-4 text-sm text-[color:var(--ch-text-2)]">Found {teams.length} teams in this league</p>

          {teams.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teams.map((teamName) => (
                <div key={teamName} className="ch-tile p-4">
                  <div className="mb-4 text-center">
                    <TeamLogo
                      teamName={teamName}
                      leagueId={league.league_id}
                      logoUrl={teamLogos[teamName]}
                      size="lg"
                      className="mx-auto mb-2"
                    />
                    <h3 className="text-sm font-medium text-[color:var(--ch-text)]">{teamName}</h3>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleTeamLogoUpload(teamName, file);
                      }}
                      className="hidden"
                      id={`logo-upload-${teamName}`}
                      disabled={uploadingLogo === teamName}
                    />
                    <label
                      htmlFor={`logo-upload-${teamName}`}
                      className={`${BTN_PRIMARY} w-full cursor-pointer ${uploadingLogo === teamName ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      {uploadingLogo === teamName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploadingLogo === teamName ? 'Uploading...' : 'Upload Logo'}
                    </label>

                    {teamLogos[teamName] && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLogo(teamName)}
                        className={`${BTN_GHOST} w-full hover:!text-[color:var(--ch-loss)]`}
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center text-[color:var(--ch-text-2)]">
              <Users className="mx-auto mb-3 h-10 w-10 text-[color:var(--ch-muted)]" />
              <p className="font-semibold text-[color:var(--ch-text)]">No Teams Found</p>
              <p className="mt-1 text-sm">Teams will appear here once player data is added to your league.</p>
            </div>
          )}
        </Panel>

      </div>
    </AdminPageShell>
  );
}
