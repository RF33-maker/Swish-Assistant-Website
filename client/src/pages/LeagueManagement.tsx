
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, Trophy, Calendar, ExternalLink, Link2, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { CompetitionFieldSelect } from "@/components/CompetitionFieldSelect";
import { fetchCompetitionFieldOptions, type CompetitionFieldOptions } from "@/lib/competitionFieldOptions";

const COMBO_INPUT_CLASS =
  "flex h-10 w-full rounded-md border border-orange-200 bg-white text-gray-900 [color-scheme:light] px-3 py-2 pr-8 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-orange-400 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

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
      const { data, error } = await supabase
        .from('competitions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching leagues:', error);
        toast({
          title: "Error Loading Leagues",
          description: "Failed to load your leagues from database",
          variant: "destructive",
        });
        return;
      }

      setLeagues(data || []);
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

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You need to be logged in to access league management.</p>
          <Button onClick={() => setLocation('/auth')}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your leagues...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setLocation('/')}
                className="text-gray-600 hover:text-gray-800"
              >
                <img src={SwishLogo} alt="Swish" className="h-8" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">League Management</h1>
                <p className="text-gray-600">Create and manage your leagues</p>
              </div>
            </div>
            <Button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Competition
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Create League Form */}
        {showCreateForm && (
          <Card className="mb-8 bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/30 transition-all duration-300">
            <CardHeader>
              <CardTitle className="text-orange-800">Create New Competition</CardTitle>
              <CardDescription>
                Enter a name for your new competition. A URL-friendly slug will be generated automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Enter competition name..."
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !showLinkPicker && createLeague()}
                  className="flex-1 border-orange-200 focus:border-orange-400"
                /></div>

              {/* Link to existing league */}
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <button
                  type="button"
                  onClick={() => setShowLinkPicker(!showLinkPicker)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-orange-700" />
                    <div>
                      <h4 className="font-medium text-orange-900">
                        {linkTarget ? `Linked to ${linkTarget.name}` : "Link to an existing league (optional)"}
                      </h4>
                      <p className="text-sm text-orange-700">
                        {linkTarget
                          ? "This new competition will be recognised as the same league — its teams and logos carry over immediately."
                          : "Pick a prior season of the same league so teams, logos, and future uploads stay linked."}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-orange-600 shrink-0 transition-transform ${showLinkPicker ? 'rotate-180' : ''}`} />
                </button>

                {showLinkPicker && (
                  <div className="mt-4 space-y-2">
                    <Input
                      placeholder="Search your leagues..."
                      value={linkSearch}
                      onChange={(e) => setLinkSearch(e.target.value)}
                      className="border-orange-200 focus:border-orange-400 bg-white text-gray-900 [color-scheme:light]"
                    />
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-orange-200 bg-white divide-y divide-orange-100">
                      <button
                        type="button"
                        onClick={() => { setLinkTargetId(""); setShowLinkPicker(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${!linkTargetId ? 'font-semibold text-orange-800' : 'text-gray-600'}`}
                      >
                        Don't link — this is a brand new league
                      </button>
                      {linkableLeagues.length === 0 && (
                        <p className="px-3 py-2 text-sm text-gray-500">No existing leagues found.</p>
                      )}
                      {linkableLeagues.map((l) => (
                        <button
                          key={l.league_id}
                          type="button"
                          onClick={() => { setLinkTargetId(l.league_id); setShowLinkPicker(false); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 ${linkTargetId === l.league_id ? 'font-semibold text-orange-800' : 'text-gray-700'}`}
                        >
                          {l.name}
                          {l.season ? <span className="text-gray-400"> · {l.season}</span> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Advanced details */}
              <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <h4 className="font-medium text-orange-900">Competition details (optional)</h4>
                  <ChevronDown className={`h-4 w-4 text-orange-600 shrink-0 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>
                {showAdvanced && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <Input
                      placeholder="Stop number (optional)"
                      type="number"
                      value={stop}
                      onChange={(e) => setStop(e.target.value)}
                      className="border-orange-200 focus:border-orange-400 bg-white sm:col-span-2"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex-1">
                  <h4 className="font-medium text-orange-900 mb-1">League Visibility</h4>
                  <p className="text-sm text-orange-700">
                    {isPublic 
                      ? "Public leagues can be discovered and viewed by anyone" 
                      : "Private leagues are only visible to you and invited members"
                    }
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${!isPublic ? 'text-orange-900' : 'text-orange-600'}`}>
                    Private
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPublic(!isPublic)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${
                      isPublic ? 'bg-orange-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isPublic ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-sm font-medium ${isPublic ? 'text-orange-900' : 'text-orange-600'}`}>
                    Public
                  </span>
                </div>
              </div>
              
              <div className="flex gap-4">
                <Button
                  onClick={createLeague}
                  disabled={!newLeagueName.trim() || creating}
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {creating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreateForm(false);
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
                  }}
                  className="border-orange-200 text-orange-700 hover:bg-orange-50"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Leagues Grid */}
        {leagues.length === 0 ? (
          <Card className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/30 transition-all duration-300">
            <CardContent className="p-12 text-center">
              <Trophy className="h-16 w-16 text-orange-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-orange-900 mb-2">No Competitions Yet</h3>
              <p className="text-orange-600 mb-6">
                Create your first competition to start managing teams, players, and games.
              </p>
              <Button
                onClick={() => setShowCreateForm(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Competition
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leagues.map((league) => (
              <Card 
                key={league.league_id}
                className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group"
                onClick={() => handleLeagueClick(league.slug)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300 mb-2">
                        {league.name}
                      </CardTitle>
                      <CardDescription className="text-orange-600">
                        Created {new Date(league.created_at).toLocaleDateString()}
                        {league.season ? ` · ${league.season}` : ""}
                      </CardDescription>
                      {(league.organisation || league.competition_id) && (
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {league.organisation && (
                            <span className="text-xs text-orange-500">{league.organisation}</span>
                          )}
                          {league.competition_id && (
                            <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                              <Link2 className="h-3 w-3" /> Linked
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Badge 
                        variant={league.is_public ? "default" : "secondary"}
                        className={league.is_public ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
                        {league.is_public ? "Public" : "Private"}
                      </Badge>
                      <Badge 
                        variant={league.approved ? "default" : "destructive"}
                        className={league.approved ? "bg-blue-100 text-blue-800" : ""}
                      >
                        {league.approved ? "Approved" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* League Banner Preview */}
                  {league.banner_url && (
                    <div className="mb-4 rounded-lg overflow-hidden">
                      <img 
                        src={league.banner_url} 
                        alt={`${league.name} banner`}
                        className="w-full h-32 object-cover"
                      />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-orange-700">
                      <Calendar className="h-3 w-3" />
                      <span>/{league.slug}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={(e) => handleViewLeague(league.slug, e)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      <Button 
                        size="sm" 
                        className="bg-orange-600 hover:bg-orange-700 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLeagueClick(league.slug);
                        }}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Manage
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
