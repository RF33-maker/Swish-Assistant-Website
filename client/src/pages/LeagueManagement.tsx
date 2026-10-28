
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Plus, Settings, Trophy, Calendar, ExternalLink, Link2, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_GHOST, BTN_PRIMARY, FIELD, Panel, TALL } from "@/components/layout/proUi";
import { CompetitionFieldSelect } from "@/components/CompetitionFieldSelect";
import { fetchCompetitionFieldOptions, type CompetitionFieldOptions } from "@/lib/competitionFieldOptions";
import { fetchManagedCompetitions, topManagedCompetitions } from "@/lib/competitionAccess";

const COMBO_INPUT_CLASS = `${FIELD} pr-8`;
const PILL = "inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold uppercase tracking-[0.06em]";

interface League {
  league_id: string;
  name: string;
  slug: string;
  banner_url?: string;
  created_at: string;
  is_public: boolean;
  approved: boolean;
  organisation?: string | null;
  season?: string | null;
  division?: string | null;
  age_group?: string | null;
  stop?: number | null;
  competition_id?: string | null;
}

export default function LeagueManagement() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [organisation, setOrganisation] = useState("");
  const [season, setSeason] = useState("");
  const [division, setDivision] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [stop, setStop] = useState("");

  const [linkTargetId, setLinkTargetId] = useState<string>("");
  const [linkSearch, setLinkSearch] = useState("");
  const [showLinkPicker, setShowLinkPicker] = useState(false);

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

  const linkableLeagues = useMemo(
    () => leagues.filter((l) =>
      linkSearch.trim()
        ? l.name.toLowerCase().includes(linkSearch.trim().toLowerCase())
        : true
    ),
    [leagues, linkSearch]
  );
  const linkTarget = leagues.find((l) => l.league_id === linkTargetId) || null;

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
    }
  }, [user]);

  const fetchUserLeagues = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      let managed;
      try {
        managed = await fetchManagedCompetitions();
      } catch (error) {
        console.error('Error fetching leagues:', error);
        toast({
          title: "Error Loading Leagues",
          description: "Failed to load your leagues from database",
          variant: "destructive",
        });
        return;
      }

      // Seasons you run (shared ones included), plus anything in your own name.
      const top = new Set(topManagedCompetitions(managed).map((l) => l.league_id));
      setLeagues(managed.filter((l) => top.has(l.league_id) || l.user_id === user.id) as League[]);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Something went wrong while loading leagues",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createLeague = async () => {
    if (!user || !newLeagueName.trim()) return;

    setCreating(true);
    try {
      // Create slug from league name
      const slug = newLeagueName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      // Check if slug already exists
      const { data: existingLeague } = await supabase
        .from('competitions')
        .select('slug')
        .eq('slug', slug)
        .single();

      if (existingLeague) {
        toast({
          title: "League Name Taken",
          description: "A league with this name already exists. Please choose a different name.",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }

      const { data, error } = await supabase
        .from('competitions')
        .insert({
          name: newLeagueName.trim(),
          slug: slug,
          user_id: user.id,
          created_by: user.id,
          is_public: isPublic,
          approved: true,
          organisation: organisation.trim() || null,
          season: season.trim() || null,
          division: division.trim() || null,
          age_group: ageGroup.trim() || null,
          stop: stop.trim() ? Number(stop.trim()) : null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating league:', error);
        toast({
          title: "Error Creating Competition",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      let linkDescription = "";
      if (linkTarget && data?.league_id) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const response = await fetch('/api/league-management/link-season', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({ newLeagueId: data.league_id, existingLeagueId: linkTarget.league_id }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Failed to link competitions');
          linkDescription = ` Linked to ${linkTarget.name}${result.teamsMoved ? ` — ${result.teamsMoved} team${result.teamsMoved === 1 ? '' : 's'} carried over` : ''}.`;
        } catch (linkError) {
          console.error('Error linking competition:', linkError);
          toast({
            title: "Competition Created, But Linking Failed",
            description: linkError instanceof Error ? linkError.message : "You can link it later from the competition's manage page.",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Competition Created!",
        description: `${newLeagueName} has been created successfully.${linkDescription}`,
      });

      setNewLeagueName("");
      setIsPublic(true);
      setOrganisation("");
      setSeason("");
      setDivision("");
      setAgeGroup("");
      setStop("");
      setLinkTargetId("");
      setLinkSearch("");
      setShowLinkPicker(false);
      setShowAdvanced(false);
      setShowCreateForm(false);
      fetchUserLeagues(); // Refresh the list
    } catch (error) {
      console.error('Error creating league:', error);
      toast({
        title: "Error",
        description: "Failed to create league",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleLeagueClick = (slug: string) => {
    setLocation(`/league-admin/${slug}`);
  };

  const handleViewLeague = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLocation(`/competition/${slug}`);
  };

  const resetCreateForm = () => {
    setNewLeagueName("");
    setIsPublic(true);
    setOrganisation("");
    setSeason("");
    setDivision("");
    setAgeGroup("");
    setStop("");
    setLinkTargetId("");
    setLinkSearch("");
    setShowLinkPicker(false);
    setShowAdvanced(false);
    setShowCreateForm(false);
  };

  if (!user) {
    return (
      <AdminPageShell title="League management">
        <AdminPageNotice>
          <p className="font-semibold text-[color:var(--ch-text)]">Access denied</p>
          <p className="mt-1">You need to be logged in to access league management.</p>
          <button type="button" onClick={() => setLocation('/auth')} className={`${BTN_PRIMARY} mt-4`}>
            Sign In
          </button>
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  const optionRow = (active: boolean) =>
    `block w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--ch-surface-3)] ${
      active ? "font-semibold text-[color:var(--ch-accent)]" : "text-[color:var(--ch-text-2)]"
    }`;
  const chevron = (open: boolean) =>
    `h-4 w-4 shrink-0 text-[color:var(--ch-muted)] transition-transform ${open ? "rotate-180" : ""}`;

  return (
    <AdminPageShell
      title="League management"
      description="Create and manage your leagues"
      width="max-w-7xl"
      actions={
        <button type="button" onClick={() => setShowCreateForm(!showCreateForm)} className={`${BTN_PRIMARY} ${TALL}`} data-testid="button-create-competition">
          <Plus className="h-4 w-4" />
          Create Competition
        </button>
      }
    >
      {/* Create League Form */}
      {showCreateForm && (
        <Panel
          title="Create new competition"
          description="Enter a name for your new competition. A URL-friendly slug will be generated automatically."
          className="ch-rise mb-6"
          bodyClassName="space-y-3"
        >
          <input
            placeholder="Enter competition name..."
            value={newLeagueName}
            onChange={(e) => setNewLeagueName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !showLinkPicker && createLeague()}
            className={`${FIELD} !h-11`}
            autoFocus
          />

          {/* Link to existing league */}
          <div className="ch-tile p-4">
            <button
              type="button"
              onClick={() => setShowLinkPicker(!showLinkPicker)}
              aria-expanded={showLinkPicker}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-2.5">
                <Link2 className="mt-0.5 h-4 w-4 flex-none text-[color:var(--ch-accent)]" />
                <div>
                  <h4 className="text-sm font-medium text-[color:var(--ch-text)]">
                    {linkTarget ? `Linked to ${linkTarget.name}` : "Link to an existing league (optional)"}
                  </h4>
                  <p className="mt-0.5 text-[13px] text-[color:var(--ch-text-2)]">
                    {linkTarget
                      ? "This new competition will be recognised as the same league — its teams and logos carry over immediately."
                      : "Pick a prior season of the same league so teams, logos, and future uploads stay linked."}
                  </p>
                </div>
              </div>
              <ChevronDown className={chevron(showLinkPicker)} />
            </button>

            {showLinkPicker && (
              <div className="mt-4 space-y-2">
                <input
                  placeholder="Search your leagues..."
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  className={FIELD}
                />
                <div className="max-h-48 divide-y divide-[color:var(--ch-border)] overflow-y-auto rounded-[10px] border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)]">
                  <button
                    type="button"
                    onClick={() => { setLinkTargetId(""); setShowLinkPicker(false); }}
                    className={optionRow(!linkTargetId)}
                  >
                    Don't link — this is a brand new league
                  </button>
                  {linkableLeagues.length === 0 && (
                    <p className="px-3 py-2 text-sm text-[color:var(--ch-muted)]">No existing leagues found.</p>
                  )}
                  {linkableLeagues.map((l) => (
                    <button
                      key={l.league_id}
                      type="button"
                      onClick={() => { setLinkTargetId(l.league_id); setShowLinkPicker(false); }}
                      className={optionRow(linkTargetId === l.league_id)}
                    >
                      {l.name}
                      {l.season ? <span className="font-normal text-[color:var(--ch-muted)]"> · {l.season}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Advanced details */}
          <div className="ch-tile p-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              aria-expanded={showAdvanced}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <h4 className="text-sm font-medium text-[color:var(--ch-text)]">Competition details (optional)</h4>
              <ChevronDown className={chevron(showAdvanced)} />
            </button>
            {showAdvanced && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CompetitionFieldSelect
                  placeholder="Organisation (e.g. Basketball England)"
                  value={organisation}
                  onChange={setOrganisation}
                  options={fieldOptions.organisations}
                  inputClassName={COMBO_INPUT_CLASS}
                />
                <CompetitionFieldSelect
                  placeholder="Season (e.g. 2026-27)"
                  value={season}
                  onChange={setSeason}
                  options={fieldOptions.seasons}
                  inputClassName={COMBO_INPUT_CLASS}
                />
                <CompetitionFieldSelect
                  placeholder="Division (e.g. Division One)"
                  value={division}
                  onChange={setDivision}
                  options={fieldOptions.divisions}
                  inputClassName={COMBO_INPUT_CLASS}
                />
                <CompetitionFieldSelect
                  placeholder="Age group (e.g. U16)"
                  value={ageGroup}
                  onChange={setAgeGroup}
                  options={fieldOptions.ageGroups}
                  inputClassName={COMBO_INPUT_CLASS}
                />
                <input
                  placeholder="Stop number (optional)"
                  type="number"
                  value={stop}
                  onChange={(e) => setStop(e.target.value)}
                  className={`${FIELD} sm:col-span-2`}
                />
              </div>
            )}
          </div>

          <div className="ch-tile flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-[color:var(--ch-text)]">League Visibility</h4>
              <p className="mt-0.5 text-[13px] text-[color:var(--ch-text-2)]">
                {isPublic 
                  ? "Public leagues can be discovered and viewed by anyone" 
                  : "Private leagues are only visible to you and invited members"
                }
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${!isPublic ? 'text-[color:var(--ch-text)]' : 'text-[color:var(--ch-muted)]'}`}>
                Private
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                aria-label="Public league"
                onClick={() => setIsPublic(!isPublic)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[color:var(--ch-accent-soft)] ${
                  isPublic ? 'bg-[color:var(--ch-accent)]' : 'bg-[color:var(--ch-border-strong)]'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isPublic ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium ${isPublic ? 'text-[color:var(--ch-text)]' : 'text-[color:var(--ch-muted)]'}`}>
                Public
              </span>
            </div>
          </div>
          
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={createLeague}
              disabled={!newLeagueName.trim() || creating}
              className={`${BTN_PRIMARY} ${TALL}`}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? "Creating..." : "Create"}
            </button>
            <button type="button" onClick={resetCreateForm} className={`${BTN_GHOST} ${TALL}`}>
              Cancel
            </button>
          </div>
        </Panel>
      )}

      {/* Leagues Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="ch-skel h-[268px] !rounded-[14px]" />
          ))}
        </div>
      ) : leagues.length === 0 ? (
        <AdminPageNotice>
          <Trophy className="mx-auto mb-3 h-10 w-10 text-[color:var(--ch-muted)]" />
          <h3 className="text-base font-semibold text-[color:var(--ch-text)]">No Competitions Yet</h3>
          <p className="mt-1">
            Create your first competition to start managing teams, players, and games.
          </p>
          <button type="button" onClick={() => setShowCreateForm(true)} className={`${BTN_PRIMARY} ${TALL} mt-5`}>
            <Plus className="h-4 w-4" />
            Create Your First Competition
          </button>
        </AdminPageNotice>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <article
              key={league.league_id}
              className="ch-card ch-hover group flex cursor-pointer flex-col overflow-hidden"
              onClick={() => handleLeagueClick(league.slug)}
              data-testid={`card-competition-${league.slug}`}
            >
              {/* League Banner Preview */}
              <div className="flex h-32 items-center justify-center overflow-hidden bg-[color:var(--ch-surface-3)]">
                {league.banner_url ? (
                  <img src={league.banner_url} alt={`${league.name} banner`} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <Trophy className="h-8 w-8 text-[color:var(--ch-muted)]" />
                )}
              </div>

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 text-[15px] font-semibold leading-snug text-[color:var(--ch-text)]">{league.name}</h2>
                  <div className="flex flex-none flex-col items-end gap-1">
                    <span className={`${PILL} ${league.is_public ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]"}`}>
                      {league.is_public ? "Public" : "Private"}
                    </span>
                    <span className={`${PILL} ${league.approved ? "bg-sky-500/12 text-sky-700 dark:text-sky-300" : "bg-red-500/12 text-red-700 dark:text-red-300"}`}>
                      {league.approved ? "Approved" : "Pending"}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[color:var(--ch-muted)]">
                  Created {new Date(league.created_at).toLocaleDateString()}
                  {league.season ? ` · ${league.season}` : ""}
                </p>
                {(league.organisation || league.competition_id) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[color:var(--ch-text-2)]">
                    {league.organisation && <span>{league.organisation}</span>}
                    {league.competition_id && (
                      <span className="inline-flex items-center gap-1 text-[color:var(--ch-accent)]">
                        <Link2 className="h-3 w-3" /> Linked
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs text-[color:var(--ch-muted)]">
                    <Calendar className="h-3 w-3 flex-none" />
                    <span className="truncate">/{league.slug}</span>
                  </div>
                  <div className="flex flex-none gap-2">
                    <button type="button" className={BTN_GHOST} onClick={(e) => handleViewLeague(league.slug, e)}>
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </button>
                    <button
                      type="button"
                      className={BTN_PRIMARY}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLeagueClick(league.slug);
                      }}
                    >
                      <Settings className="h-3.5 w-3.5" />
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminPageShell>
  );
}
