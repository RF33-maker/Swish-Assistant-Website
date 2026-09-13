import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { useGlobalSearch, type SearchSuggestion } from '@/hooks/useGlobalSearch';
import { useLeagueBranding } from '@/hooks/useLeagueBranding';
import { useReadableTeamColor } from '@/hooks/useReadableColor';
import { TeamLogo } from '@/components/TeamLogo';
import { PlayerSearchAvatar } from '@/components/PlayerSearchAvatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import TeamPerformanceTrends, { type TeamGameLogRow } from '@/components/TeamPerformanceTrends';
import AdvancedInsights from '@/components/coaches-hub/AdvancedInsights';
import FullRankings from '@/components/coaches-hub/FullRankings';
import LeagueChatbot from '@/components/LeagueChatbot';
import { TrendingUp, BarChart3, Users, Target, Award, Eye, MessageCircle, Search, FileText, User, Calendar, Trophy, X } from 'lucide-react';
import { Link } from 'wouter';
import SwishLogo from '@/assets/Swish Assistant Logo.png';
import UnifiedScoutingEditor from '@/components/scout-editor/UnifiedScoutingEditor';
import { safelyParseReport } from "@/utils/parseReport";
import { ScoutingReport } from "@/types/reportSchema";
import { namesMatch, strictNamesMatch, getMostCompleteName } from "@/lib/fuzzyMatch";
import { normalizeTeamName } from "@/lib/teamUtils";

export interface PlayerSeasonAverage {
  player_name: string;
  team_id: string;
  team_name: string;
  league_id: string;
  games_played: number;
  avg_pts: number;
  avg_ast: number;
  avg_reb: number;
  avg_stl: number;
  avg_blk: number;
  avg_tov: number;
  total_pts: number;
  total_ast: number;
  total_reb: number;
  total_stl: number;
  total_blk: number;
  total_tov: number;
  total_fgm: number;
  total_fga: number;
  season_fg_pct: number | null;
  total_tpm: number;
  total_tpa: number;
  season_tp_pct: number | null;
  total_ftm: number;
  total_fta: number;
  season_ft_pct: number | null;
}

export interface TeamSeasonAverage {
  team_name: string;
  team_id: string;
  league_id: string;
  games_played: number;
  avg_pts: number;
  avg_ast: number;
  avg_reb: number;
  avg_stl: number;
  avg_blk: number;
  avg_tov: number;
  avg_fgm: number;
  avg_fga: number;
  season_fg_pct: number | null;
  avg_tpm: number;
  avg_tpa: number;
  season_tp_pct: number | null;
  avg_ftm: number;
  avg_fta: number;
  season_ft_pct: number | null;
}

type HubTab = 'overview' | 'trends' | 'advanced' | 'rankings' | 'scouting';

interface RawPlayerAgg {
  playerIds: Set<string>;
  name: string;
  teamId: string;
  teamName: string;
  // player_stats has no date column, so this never actually advances past 0 —
  // kept only so a merged cross-team player's displayed team is deterministic
  // (first-seen wins), matching the same limitation the reference page has.
  latestGameTs: number;
  gamesPlayed: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}

function accumulateRawInto(target: RawPlayerAgg, source: RawPlayerAgg) {
  target.gamesPlayed += source.gamesPlayed;
  target.pts += source.pts;
  target.reb += source.reb;
  target.ast += source.ast;
  target.stl += source.stl;
  target.blk += source.blk;
  target.tov += source.tov;
  target.fgm += source.fgm;
  target.fga += source.fga;
  target.tpm += source.tpm;
  target.tpa += source.tpa;
  target.ftm += source.ftm;
  target.fta += source.fta;
  target.name = getMostCompleteName([target.name, source.name]);
  source.playerIds.forEach(id => target.playerIds.add(id));
  if (source.latestGameTs > target.latestGameTs) {
    target.latestGameTs = source.latestGameTs;
    target.teamId = source.teamId;
    target.teamName = source.teamName;
  }
}

// Player identity in `player_stats` isn't always one row per real human — the same
// player can end up under multiple `player_id`s (re-imports, name typos across
// games). The pre-aggregated `v_player_season_averages` view has no way to dedupe
// that, so it was showing the same coach's player twice under slightly different
// names. This fetches raw per-game rows and applies the same two-pass fuzzy-name
// merge (same-team, then cross-team for mid-season team switches) already proven
// out on the public League Leaders page (`client/src/pages/pages/league-leaders/[slug].tsx`),
// rather than inventing a second dedupe strategy.
async function fetchAndMergePlayerRankings(leagueId: string): Promise<PlayerSeasonAverage[]> {
  let allRows: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('player_stats')
      .select('player_id, id, full_name, firstname, familyname, team_id, team_name, game_key, spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted')
      .eq('league_id', leagueId)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) { hasMore = false; break; }
    allRows = allRows.concat(data);
    hasMore = data.length === pageSize;
    page++;
  }

  // Pass 0: group by raw player_id (or row id if unresolved) — one bucket per
  // distinct database identity, exactly mirroring the source rows.
  const byId = new Map<string, RawPlayerAgg>();
  for (const row of allRows) {
    const key = row.player_id || row.id;
    const name = row.full_name || `${row.firstname || ''} ${row.familyname || ''}`.trim() || 'Unknown Player';
    let agg = byId.get(key);
    if (!agg) {
      agg = {
        playerIds: new Set([key]),
        name,
        teamId: row.team_id,
        teamName: row.team_name || 'Unknown Team',
        latestGameTs: 0,
        gamesPlayed: 0,
        pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
      };
      byId.set(key, agg);
    }
    agg.gamesPlayed += 1;
    agg.pts += row.spoints || 0;
    agg.reb += row.sreboundstotal || 0;
    agg.ast += row.sassists || 0;
    agg.stl += row.ssteals || 0;
    agg.blk += row.sblocks || 0;
    agg.tov += row.sturnovers || 0;
    agg.fgm += row.sfieldgoalsmade || 0;
    agg.fga += row.sfieldgoalsattempted || 0;
    agg.tpm += row.sthreepointersmade || 0;
    agg.tpa += row.sthreepointersattempted || 0;
    agg.ftm += row.sfreethrowsmade || 0;
    agg.fta += row.sfreethrowsattempted || 0;
  }

  // Pass 1: merge fuzzy-name duplicates within the same team.
  const sameTeamMerged: RawPlayerAgg[] = [];
  Array.from(byId.values()).forEach(player => {
    const playerTeamNormalized = normalizeTeamName(player.teamName);
    const existing = sameTeamMerged.find(p =>
      normalizeTeamName(p.teamName) === playerTeamNormalized && namesMatch(player.name, p.name)
    );
    if (existing) {
      accumulateRawInto(existing, player);
    } else {
      sameTeamMerged.push({ ...player, playerIds: new Set(player.playerIds) });
    }
  });

  // Pass 2: merge strict-name duplicates across different teams (mid-season
  // team switchers), guarded so overlapping player_ids never double-count.
  const crossTeamMerged: RawPlayerAgg[] = [];
  sameTeamMerged.forEach(player => {
    const existing = crossTeamMerged.find(p => {
      let overlaps = false;
      player.playerIds.forEach(id => { if (p.playerIds.has(id)) overlaps = true; });
      return !overlaps && strictNamesMatch(player.name, p.name);
    });
    if (existing) {
      accumulateRawInto(existing, player);
    } else {
      crossTeamMerged.push({ ...player, playerIds: new Set(player.playerIds) });
    }
  });

  return crossTeamMerged.map((p): PlayerSeasonAverage => ({
    player_name: p.name,
    team_id: p.teamId,
    team_name: p.teamName,
    league_id: leagueId,
    games_played: p.gamesPlayed,
    avg_pts: p.gamesPlayed ? p.pts / p.gamesPlayed : 0,
    avg_ast: p.gamesPlayed ? p.ast / p.gamesPlayed : 0,
    avg_reb: p.gamesPlayed ? p.reb / p.gamesPlayed : 0,
    avg_stl: p.gamesPlayed ? p.stl / p.gamesPlayed : 0,
    avg_blk: p.gamesPlayed ? p.blk / p.gamesPlayed : 0,
    avg_tov: p.gamesPlayed ? p.tov / p.gamesPlayed : 0,
    total_pts: p.pts,
    total_ast: p.ast,
    total_reb: p.reb,
    total_stl: p.stl,
    total_blk: p.blk,
    total_tov: p.tov,
    total_fgm: p.fgm,
    total_fga: p.fga,
    season_fg_pct: p.fga > 0 ? (p.fgm / p.fga) * 100 : null,
    total_tpm: p.tpm,
    total_tpa: p.tpa,
    season_tp_pct: p.tpa > 0 ? (p.tpm / p.tpa) * 100 : null,
    total_ftm: p.ftm,
    total_fta: p.fta,
    season_ft_pct: p.fta > 0 ? (p.ftm / p.fta) * 100 : null,
  }));
}

export default function CoachesHub() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { query: search, setQuery: setSearch, suggestions, handleSelect: handleSelectSearch, handleSubmit: handleSubmitSearch } = useGlobalSearch();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLeagues, setFilteredLeagues] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  const [chatbotResponse, setChatbotResponse] = useState('');

  // Repointed data — real views instead of the old raw player_stats reads
  const [playerSeasonAverages, setPlayerSeasonAverages] = useState<PlayerSeasonAverage[]>([]);
  const [teamSeasonAverages, setTeamSeasonAverages] = useState<TeamSeasonAverage[]>([]);
  const [teamGameLog, setTeamGameLog] = useState<TeamGameLogRow[]>([]);

  // Templates section states
  const [reportData, setReportData] = useState<ScoutingReport | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("clean-pro");
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
    }
  }, [user]);

  useEffect(() => {
    if (selectedLeague) {
      fetchLeagueStats();
      setActiveTab('overview');
    } else {
      setPlayerSeasonAverages([]);
      setTeamSeasonAverages([]);
      setTeamGameLog([]);
    }
  }, [selectedLeague]);

  useEffect(() => {
    // Filter leagues based on search query
    const filtered = leagues.filter(league =>
      league.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredLeagues(filtered);
  }, [leagues, searchQuery]);

  const fetchUserLeagues = async () => {
    try {
      // Competitions the user owns/administers — this is the real per-competition
      // table (`competitions`), not the near-empty parent-league table (`leagues`).
      const { data, error } = await supabase
        .from('competitions')
        .select('*')
        .or(`created_by.eq.${user?.id},user_id.eq.${user?.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLeagues(data || []);
      if (data && data.length === 1) {
        setSelectedLeague(data[0]);
      }
    } catch (error) {
      console.error('Error fetching leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLeagueStats = async () => {
    if (!selectedLeague) return;

    setStatsLoading(true);
    try {
      const leagueId = selectedLeague.league_id;
      const [players, teamsRes, gameLogRes] = await Promise.all([
        // Raw rows + fuzzy-name merge, not the pre-aggregated view — see
        // fetchAndMergePlayerRankings for why.
        fetchAndMergePlayerRankings(leagueId),
        supabase
          .from('v_team_season_averages')
          .select('*')
          .eq('league_id', leagueId)
          .order('avg_pts', { ascending: false }),
        supabase
          .from('v_team_game_log')
          .select('team_name, game_date, pts, reb, ast, fg_pct')
          .eq('league_id', leagueId)
          .order('game_date', { ascending: true }),
      ]);

      if (teamsRes.error) throw teamsRes.error;
      if (gameLogRes.error) throw gameLogRes.error;

      players.sort((a, b) => b.total_pts - a.total_pts);
      setPlayerSeasonAverages(players);
      setTeamSeasonAverages((teamsRes.data || []) as TeamSeasonAverage[]);
      setTeamGameLog((gameLogRes.data || []) as TeamGameLogRow[]);
    } catch (error) {
      console.error('Error fetching league stats:', error);
      setPlayerSeasonAverages([]);
      setTeamSeasonAverages([]);
      setTeamGameLog([]);
    } finally {
      setStatsLoading(false);
    }
  };

  const hasStats = playerSeasonAverages.length > 0 || teamSeasonAverages.length > 0;
  // v_team_game_log has one row per team per game, so total games = rows / 2 (two teams per game).
  const uniqueGameCount = Math.round(teamGameLog.length / 2);
  const topTeam = teamSeasonAverages[0];

  // Same brand-color extraction the public league pages use, so Coaches Hub
  // picks up each league's own look once one is selected.
  const { colors: brandColors } = useLeagueBranding({
    slug: selectedLeague?.slug,
    bannerUrl: selectedLeague?.banner_url,
    logoUrl: selectedLeague?.logo_url,
    manualPrimaryColor: selectedLeague?.brand_primary_colour,
    enabled: !!selectedLeague,
  });
  const brandColor = brandColors?.primary || '#f97316';
  // Contrast-safe variant for text/icons — the raw brandColor above can be a
  // dark team colour that disappears against the dark-mode surface.
  const readableBrand = useReadableTeamColor(brandColor).body;

  const tabs: { id: HubTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'trends', label: 'Trends' },
    { id: 'advanced', label: 'Advanced Insights' },
    { id: 'rankings', label: 'Rankings' },
    { id: 'scouting', label: 'Scouting Reports' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Loading your coaching hub...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-4">Access Denied</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">Please log in to access the Coaches Hub.</p>
          <Link href="/auth" className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 transition">
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf1] dark:bg-neutral-950">
      {/* Header — same pattern as the public league pages */}
      <header className="bg-white dark:bg-neutral-900 shadow-sm sticky top-0 z-50 px-3 md:px-6 py-1.5 md:py-4">
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center shrink-0">
            <img
              src={SwishLogo}
              alt="Swish Assistant"
              className="h-6 md:h-9 cursor-pointer"
              onClick={() => navigate('/')}
            />
          </div>

          <div className="relative flex-1 md:max-w-md md:mx-2">
            <form onSubmit={handleSubmitSearch} className="flex items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search league, team or player"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 md:pl-9 pr-3 py-1 md:py-2 border border-gray-300 dark:border-neutral-700 rounded-full text-xs md:text-sm bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </form>

            {suggestions.length > 0 && (
              <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-neutral-900 border border-orange-200 dark:border-neutral-700 rounded-md shadow-lg max-h-72 overflow-y-auto">
                {suggestions.map((item: SearchSuggestion, index: number) => (
                  <li
                    key={index}
                    onClick={() => handleSelectSearch(item)}
                    className="px-4 py-2.5 cursor-pointer hover:bg-orange-50 dark:hover:bg-neutral-800 text-left border-b border-orange-100 dark:border-neutral-800 last:border-b-0 transition-colors duration-200"
                  >
                    <div className="flex items-center gap-3">
                      {item.type === 'league' || item.type === 'competition' ? (
                        item.logo_url ? (
                          <div className="h-7 w-7 rounded-full bg-white dark:bg-neutral-800 border border-orange-200 dark:border-neutral-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img src={item.logo_url} alt={item.name} className="h-6 w-6 object-contain" />
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
                            <Trophy className="h-3.5 w-3.5 text-white" />
                          </div>
                        )
                      ) : item.type === 'team' ? (
                        <div className="h-7 w-7 rounded-full bg-white dark:bg-neutral-800 border border-orange-200 dark:border-neutral-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                          <TeamLogo teamName={item.name} leagueId={item.league_id} size="sm" />
                        </div>
                      ) : (
                        <PlayerSearchAvatar name={item.name} photoUrl={item.photo_url} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-orange-900 dark:text-orange-300 text-xs md:text-sm truncate">{item.name}</div>
                        {item.type === 'player' && (
                          <div className="text-xs text-orange-600 dark:text-orange-400 truncate">{item.team}</div>
                        )}
                        {item.type === 'team' && (
                          <div className="text-xs text-orange-600 dark:text-orange-400 truncate">{item.league_name}</div>
                        )}
                        {(item.type === 'league' || item.type === 'competition') && (
                          <div className="text-xs text-orange-600 dark:text-orange-400">League</div>
                        )}
                      </div>
                      <div className="text-xs text-orange-700 dark:text-orange-300 capitalize bg-orange-100 dark:bg-orange-900/50 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                        {item.type}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link href="/dashboard" className="hidden sm:inline text-xs md:text-sm text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition whitespace-nowrap">
            ← Back to Dashboard
          </Link>

          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-full mx-auto px-4 md:px-6 py-4 md:py-6">
        {/* Trimmed welcome — no feature grid, no pulsing taglines */}
        <div className="flex items-center gap-3 mb-4 md:mb-6">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
            <Target className="w-5 h-5 md:w-6 md:h-6 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">Coaches Hub</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Analyze performance, track trends, and build scouting reports.</p>
          </div>
        </div>

        {leagues.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-400 dark:text-neutral-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">No Leagues Found</h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              You need to create or manage a league to access coaching insights.
            </p>
            <Link
              href="/league-admin"
              className="inline-flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 transition"
            >
              <Award className="w-4 h-4" />
              Create League
            </Link>
          </div>
        ) : (
          <div className="space-y-4 md:space-y-6">
            {/* League Selection - Always Show */}
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Select League</h3>
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  {leagues.length} available
                </div>
              </div>

              {/* League Search Input */}
              <div className="mb-4 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Search for a league to analyze..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>

                {/* Filtered League Results */}
                {searchQuery && filteredLeagues.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredLeagues.map((league) => (
                      <button
                        key={league.league_id}
                        onClick={() => {
                          setSelectedLeague(league);
                          setSearchQuery('');
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-orange-800 dark:hover:text-orange-300 focus:outline-none focus:bg-orange-50 dark:focus:bg-neutral-800 focus:text-orange-800 dark:focus:text-orange-300"
                      >
                        <div className="font-medium">{league.name}</div>
                      </button>
                    ))}
                  </div>
                )}

                {/* No Results Message */}
                {searchQuery && filteredLeagues.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md shadow-lg p-3 text-sm text-gray-500 dark:text-neutral-400">
                    No leagues found matching "{searchQuery}"
                  </div>
                )}
              </div>

              {/* Selected League Display */}
              {selectedLeague && (
                <div
                  className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 border rounded-md"
                  style={{ borderColor: brandColor }}
                >
                  <div className="flex items-center gap-3">
                    {selectedLeague.logo_url ? (
                      <img
                        src={selectedLeague.logo_url}
                        alt={selectedLeague.name}
                        className="w-8 h-8 rounded-full object-contain bg-white border border-orange-200 dark:border-neutral-700 shrink-0"
                      />
                    ) : (
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    )}
                    <div>
                      <span className="font-medium text-slate-800 dark:text-white">{selectedLeague.name}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400 ml-2">Active League</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {statsLoading ? 'Loading…' : `${playerSeasonAverages.length} player records`}
                    </div>
                    <button
                      onClick={() => setSelectedLeague(null)}
                      className="text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 focus:outline-none"
                      title="Clear selection"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}

              {/* Quick League Selection (for frequently used leagues) */}
              {!selectedLeague && leagues.length <= 5 && leagues.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs text-gray-500 dark:text-neutral-400 self-center">Quick select:</span>
                  {leagues.map((league) => (
                    <button
                      key={league.league_id}
                      onClick={() => setSelectedLeague(league)}
                      className="px-3 md:px-4 py-1 text-xs md:text-sm text-gray-700 dark:text-neutral-300 bg-gray-100 dark:bg-neutral-800 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-800 dark:hover:text-orange-300 rounded-full transition-colors border border-gray-200 dark:border-neutral-700"
                    >
                      {league.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedLeague && (
              <>
                {/* Section tabs — same pattern as the public league pages, tinted with the league's own brand color */}
                <div className="flex gap-4 md:gap-6 text-sm font-medium text-slate-600 dark:text-slate-400 overflow-x-auto border-b border-gray-200 dark:border-neutral-800 pb-px">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="cursor-pointer whitespace-nowrap pb-2 bg-transparent border-0 border-b-2 -mb-px transition-colors"
                      style={activeTab === tab.id ? { fontWeight: 600, color: readableBrand, borderBottomColor: brandColor } : { borderBottomColor: 'transparent' }}
                      onMouseEnter={(e) => { if (activeTab !== tab.id) (e.target as HTMLElement).style.color = readableBrand; }}
                      onMouseLeave={(e) => { if (activeTab !== tab.id) (e.target as HTMLElement).style.color = ''; }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Overview */}
                {activeTab === 'overview' && (
                  <div className="space-y-4 md:space-y-6">
                    {hasStats ? (
                      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
                          <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
                            <div className="flex items-center gap-2 mb-2">
                              <Users className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                              <span className="text-xs md:text-sm font-medium text-gray-600 dark:text-neutral-400">Teams</span>
                            </div>
                            <div className="text-xl md:text-2xl font-bold" style={{ color: readableBrand }}>
                              {teamSeasonAverages.length}
                            </div>
                          </div>

                          <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
                            <div className="flex items-center gap-2 mb-2">
                              <User className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                              <span className="text-xs md:text-sm font-medium text-gray-600 dark:text-neutral-400">Players</span>
                            </div>
                            <div className="text-xl md:text-2xl font-bold" style={{ color: readableBrand }}>
                              {playerSeasonAverages.length}
                            </div>
                          </div>

                          <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
                            <div className="flex items-center gap-2 mb-2">
                              <Calendar className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                              <span className="text-xs md:text-sm font-medium text-gray-600 dark:text-neutral-400">Games</span>
                            </div>
                            <div className="text-xl md:text-2xl font-bold" style={{ color: readableBrand }}>
                              {uniqueGameCount}
                            </div>
                          </div>

                          <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
                            <div className="flex items-center gap-2 mb-2">
                              <Award className="w-4 h-4 text-gray-500 dark:text-neutral-400" />
                              <span className="text-xs md:text-sm font-medium text-gray-600 dark:text-neutral-400">Top Team</span>
                            </div>
                            <div className="text-base md:text-lg font-bold" style={{ color: readableBrand }}>
                              {topTeam ? topTeam.team_name : 'No Data'}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                          <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                              <Award className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                              Top Scoring Teams
                            </h4>
                            {/* team_id is occasionally duplicated across two different real teams
                                in the source data, so index is folded into the key too */}
                            <div className="space-y-2">
                              {teamSeasonAverages.slice(0, 3).map((team, index) => (
                                <div key={`${team.team_id ?? 'team'}-${index}`} className="flex items-center justify-between py-1">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                      index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : 'bg-amber-600'
                                    }`}>
                                      {index + 1}
                                    </div>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{team.team_name}</span>
                                  </div>
                                  <span className="text-sm font-bold text-gray-700 dark:text-neutral-300">{Number(team.avg_pts ?? 0).toFixed(1)} avg pts</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
                            <h4 className="text-sm md:text-base font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                              <Target className="w-4 h-4 text-green-600 dark:text-green-400" />
                              Team Leaders
                            </h4>
                            <div className="space-y-2">
                              {(() => {
                                const topAssistTeam = [...teamSeasonAverages].sort((a, b) => (b.avg_ast ?? 0) - (a.avg_ast ?? 0))[0];
                                const topReboundTeam = [...teamSeasonAverages].sort((a, b) => (b.avg_reb ?? 0) - (a.avg_reb ?? 0))[0];
                                const topFGTeam = [...teamSeasonAverages].sort((a, b) => (b.season_fg_pct ?? 0) - (a.season_fg_pct ?? 0))[0];
                                return (
                                  <>
                                    <div className="flex justify-between items-center py-1">
                                      <span className="text-sm text-gray-600 dark:text-neutral-400">Most Assists</span>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {topAssistTeam ? `${topAssistTeam.team_name} (${Number(topAssistTeam.avg_ast ?? 0).toFixed(1)})` : 'No Data'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center py-1">
                                      <span className="text-sm text-gray-600 dark:text-neutral-400">Most Rebounds</span>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {topReboundTeam ? `${topReboundTeam.team_name} (${Number(topReboundTeam.avg_reb ?? 0).toFixed(1)})` : 'No Data'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center py-1">
                                      <span className="text-sm text-gray-600 dark:text-neutral-400">Best FG%</span>
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {topFGTeam?.season_fg_pct != null ? `${topFGTeam.team_name} (${Number(topFGTeam.season_fg_pct).toFixed(1)}%)` : 'No Data'}
                                      </span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-8 text-center">
                        <BarChart3 className="w-16 h-16 text-gray-400 dark:text-neutral-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No Data Found</h3>
                        <p className="text-slate-600 dark:text-slate-400">
                          Upload player statistics for this league to see analytics.
                        </p>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
                      <h3 className="font-semibold text-slate-800 dark:text-white mb-3">Quick Actions</h3>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        <Link
                          href="/league-admin"
                          className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition"
                        >
                          <Award className="w-4 h-4" />
                          Upload Player Stats
                        </Link>
                        <Link
                          href={`/competition/${selectedLeague.slug}`}
                          className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition"
                        >
                          <Eye className="w-4 h-4" />
                          View Public League Page
                        </Link>
                        <Link
                          href={`/league-leaders/${selectedLeague.slug}`}
                          className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition"
                        >
                          <TrendingUp className="w-4 h-4" />
                          View League Leaders
                        </Link>
                      </div>
                    </div>
                  </div>
                )}

                {/* Trends */}
                {activeTab === 'trends' && (
                  teamGameLog.length > 0 ? (
                    <TeamPerformanceTrends teamGameLog={teamGameLog} leagueId={selectedLeague.league_id} />
                  ) : (
                    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-8 text-center">
                      <BarChart3 className="w-16 h-16 text-gray-400 dark:text-neutral-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No Player Data Found</h3>
                      <p className="text-slate-600 dark:text-slate-400">
                        Upload player statistics for this league to see performance trends.
                      </p>
                    </div>
                  )
                )}

                {/* Advanced Insights */}
                {activeTab === 'advanced' && (
                  <AdvancedInsights leagueId={selectedLeague.league_id} />
                )}

                {/* Rankings */}
                {activeTab === 'rankings' && (
                  <FullRankings players={playerSeasonAverages} teams={teamSeasonAverages} brandColor={brandColor} />
                )}

                {/* Scouting Reports */}
                {activeTab === 'scouting' && (
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-gray-200 dark:border-neutral-800 gap-2 md:gap-0">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 md:w-6 h-5 md:h-6 text-orange-600 dark:text-orange-400" />
                        <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">Scouting Reports</h2>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">Mobile-optimized A4 editor</span>
                    </div>

                    <UnifiedScoutingEditor
                      leagueContext={{
                        leagueId: selectedLeague.league_id,
                        leagueName: selectedLeague.name,
                      }}
                      onChatInsert={(content: string) => {
                        setChatbotResponse(content);
                      }}
                      reportData={reportData}
                      onReportDataChange={setReportData}
                      selectedTemplateId={selectedTemplateId}
                      onTemplateChange={setSelectedTemplateId}
                      parseError={parseError}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* League Assistant — docked right-edge tab that slides a panel open, always reachable regardless of which section tab is active */}
      {selectedLeague && (
        <>
          <button
            onClick={() => setIsAssistantOpen(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-2 py-4 rounded-l-lg shadow-lg transition-colors"
            aria-label="Open League Assistant"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs font-medium [writing-mode:vertical-rl] rotate-180">League Assistant</span>
          </button>

          {isAssistantOpen && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/40" onClick={() => setIsAssistantOpen(false)} />
              <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[460px] flex flex-col">
                {/* LeagueChatbot's own panel-mode header already shows the icon/title,
                    so this just adds a close button above it rather than a second header. */}
                <button
                  onClick={() => setIsAssistantOpen(false)}
                  className="self-end m-2 text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-200 bg-white dark:bg-neutral-900 rounded-full p-1 shadow-sm shrink-0"
                  aria-label="Close League Assistant"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex-1 overflow-hidden px-2 pb-2">
                  <LeagueChatbot
                    leagueId={selectedLeague.league_id}
                    leagueName={selectedLeague.name}
                    onResponseReceived={(response: string) => {
                      setChatbotResponse(response);
                      const parsed = safelyParseReport(response);
                      if (parsed) {
                        setReportData(parsed);
                        setParseError(null);
                      } else {
                        setReportData(null);
                        setParseError("Could not parse a valid report JSON.");
                      }
                    }}
                    isPanelMode={true}
                    brandColor={brandColor}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
