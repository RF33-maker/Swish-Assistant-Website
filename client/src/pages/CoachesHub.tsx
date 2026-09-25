import { useState, useEffect, useMemo } from 'react';
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
import PlayerDetail from '@/components/coaches-hub/PlayerDetail';
import TeamDetail from '@/components/coaches-hub/TeamDetail';
import CoachTeamOverview from '@/components/coaches-hub/CoachTeamOverview';
import CoachTeamBanner from '@/components/coaches-hub/CoachTeamBanner';
import LeagueChatbot from '@/components/LeagueChatbot';
import { TrendingUp, BarChart3, Users, Target, Award, Eye, MessageCircle, Search, User, Calendar, Trophy, X, ChevronDown } from 'lucide-react';
import { Link } from 'wouter';
import SwishLogo from '@/assets/Swish Assistant Logo.png';
import UnifiedScoutingEditor from '@/components/scout-editor/UnifiedScoutingEditor';
import { safelyParseReport } from "@/utils/parseReport";
import { ScoutingReport } from "@/types/reportSchema";
import { namesMatch, strictNamesMatch, getMostCompleteName } from "@/lib/fuzzyMatch";
import { normalizeTeamName } from "@/lib/teamUtils";
import {
  makeAdvancedAggregator,
  accumulateAdvancedRow,
  mergeAdvancedInto,
  averageAdvanced,
  type AdvancedAggregatorPart,
  type AdvancedAverages,
} from "@/lib/advancedStats";

export interface PlayerSeasonAverage {
  player_name: string;
  team_id: string;
  team_name: string;
  league_id: string;
  /** Every raw player_stats.player_id merged into this row — a coach's
      player can be split across a few ids (re-imports, name typos), so the
      deep-dive game log / shot chart need the full set to query by. */
  player_ids: string[];
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
  advanced: AdvancedAverages;
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
  /** Optional: only populated once the advanced team_stats aggregation pass has run. */
  advanced?: AdvancedAverages & { pace: number | null };
}

/** A completed game from v_game_results — the same source the public Standings widget uses. */
export interface GameResultRow {
  game_key: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  match_time: string | null;
}

/** A coach's own team's next scheduled (not yet played) game. */
export interface NextGameRow {
  game_key: string;
  hometeam: string;
  awayteam: string;
  home_team_id: string | null;
  away_team_id: string | null;
  matchtime: string;
  status: string | null;
}

/** One row of win-loss standings, computed client-side from GameResultRow[]. */
export interface StandingRow {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  games: number;
  /** Total point differential across the season — tiebreaker and the scoring-trend baseline. */
  pointDiff: number;
  pct: number;
  rank: number;
}

/** One of the coach's own team's completed games, from their team's point of view. */
export interface MyTeamGame {
  gameKey: string;
  opponent: string;
  isHome: boolean;
  myScore: number;
  oppScore: number;
  result: 'W' | 'L';
  matchTime: string | null;
}

type HubTab = 'overview' | 'rankings' | 'lineups' | 'trends' | 'scouting';

interface TopLeagueShortcut {
  // Display label/logo prefer the parent league brand (shorter, more
  // recognisable name) when the competition belongs to one.
  name: string;
  logoUrl?: string | null;
  // The actual competitions row — passed straight to setSelectedLeague so
  // clicking a shortcut opens that league's stats *inside* Coaches Hub
  // (same shape fetchUserLeagues already puts in `leagues`), not the public
  // league page.
  competition: any;
}

// Same "trending public competitions" query the post-login dashboard uses to
// suggest leagues to a coach who hasn't set one up yet — reused here so a
// coach can jump straight to a popular league's stats (their own or not) to
// scout, compare, or just explore, without leaving the Coaches Hub.
async function fetchTopLeagueShortcuts(limit = 6): Promise<TopLeagueShortcut[]> {
  const { data, error } = await supabase
    .from('competitions')
    .select('*, leagues:competition_id(name, slug, logo_url)')
    .eq('is_public', true)
    .not('trending_position', 'is', null)
    .order('trending_position', { ascending: true })
    .limit(limit * 2); // headroom for dedupe below

  if (error) throw error;

  const seen = new Set<string>();
  const out: TopLeagueShortcut[] = [];
  for (const competition of data || []) {
    const relation = (competition as any).leagues;
    const league = Array.isArray(relation) ? relation[0] : relation;
    // Dedupe on the parent league brand (or the competition's own slug when
    // it has none), so a league with several trending seasons only shows
    // once here — same idea as the landing page's trending row.
    const key = league?.slug || competition.slug;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: league?.name || competition.name,
      logoUrl: league?.logo_url || competition.logo_url,
      competition,
    });
    if (out.length === limit) break;
  }
  return out;
}

// Small numbered section header — same "01 · label" convention used across
// the tab panels below, borrowed from the sectioned-page pattern coaches
// pointed to as a reference (Epinoia), recolored to the league's own brand.
function SectionKicker({ n, label, color, className = 'mb-3' }: { n: string; label: string; color: string; className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color }}>{n}</span>
      <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">{label}</h3>
    </div>
  );
}

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
  adv: AdvancedAggregatorPart;
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
  mergeAdvancedInto(target.adv, source.adv);
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
      .select('player_id, id, full_name, firstname, familyname, team_id, team_name, game_key, spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted, efg_percent, ts_percent, three_point_rate, ast_percent, oreb_percent, dreb_percent, reb_percent, tov_percent, usage_percent, pie, off_rating, def_rating, net_rating, pts_percent_2pt, pts_percent_3pt, pts_percent_ft, pts_percent_midrange, pts_percent_pitp, pts_percent_fastbreak, pts_percent_second_chance, pts_percent_off_turnovers')
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
        adv: makeAdvancedAggregator(),
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
    accumulateAdvancedRow(agg.adv, row);
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
    player_ids: Array.from(p.playerIds),
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
    advanced: averageAdvanced(p.adv),
  }));
}

// Advanced team-level averages (eFG%, TS%, ORTG/DRTG/NET, PACE, scoring
// distribution) for the "Advanced" rankings in Coaches Hub. team_stats
// carries the same-named advanced columns as player_stats (see
// AdvancedStatRow) plus its own `pace`, which player_stats has no
// equivalent of. Fetched and averaged separately from v_team_season_averages
// (which only has the traditional box columns) rather than changing that
// shared view, and merged onto its rows afterwards by team_id.
async function fetchTeamAdvancedAverages(leagueId: string): Promise<Map<string, AdvancedAverages & { pace: number | null }>> {
  let allRows: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('team_stats')
      // No usage_percent here — it doesn't exist on team_stats (usage% is a
      // per-player share-of-team-possessions stat with no team-level
      // equivalent; requesting it 400s the whole select, which was silently
      // blanking every other team advanced stat too).
      .select('team_id, efg_percent, ts_percent, three_point_rate, ast_percent, oreb_percent, dreb_percent, reb_percent, tov_percent, pie, off_rating, def_rating, net_rating, pace, pts_percent_2pt, pts_percent_3pt, pts_percent_ft, pts_percent_midrange, pts_percent_pitp, pts_percent_fastbreak, pts_percent_second_chance, pts_percent_off_turnovers')
      .eq('league_id', leagueId)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) { hasMore = false; break; }
    allRows = allRows.concat(data);
    hasMore = data.length === pageSize;
    page++;
  }

  const byTeam = new Map<string, { adv: AdvancedAggregatorPart; sumPace: number; hasPace: number }>();
  for (const row of allRows) {
    if (!row.team_id) continue;
    let agg = byTeam.get(row.team_id);
    if (!agg) {
      agg = { adv: makeAdvancedAggregator(), sumPace: 0, hasPace: 0 };
      byTeam.set(row.team_id, agg);
    }
    accumulateAdvancedRow(agg.adv, row);
    if (row.pace !== null && row.pace !== undefined && !Number.isNaN(Number(row.pace))) {
      agg.sumPace += Number(row.pace);
      agg.hasPace += 1;
    }
  }

  const out = new Map<string, AdvancedAverages & { pace: number | null }>();
  byTeam.forEach((agg, teamId) => {
    out.set(teamId, {
      ...averageAdvanced(agg.adv),
      pace: agg.hasPace > 0 ? agg.sumPace / agg.hasPace : null,
    });
  });
  return out;
}

export default function CoachesHub() {
  const { user, isCoach, teamId: coachTeamId, logoutMutation } = useAuth();
  const [, navigate] = useLocation();
  const { query: search, setQuery: setSearch, suggestions, handleSelect: handleSelectSearch, handleSubmit: handleSubmitSearch } = useGlobalSearch();
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<any>(null);
  // The coach's own team name — resolved alongside their league in
  // fetchUserLeagues, purely for a "Coaching {team}" label in the UI.
  const [coachTeamName, setCoachTeamName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLeagues, setFilteredLeagues] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<HubTab>('overview');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [leaguePickerOpen, setLeaguePickerOpen] = useState(false);
  // Deep-dive drill-in — set from a Rankings/roster row click, cleared by the
  // detail view's own back button or a league switch. Lives above the tab
  // strip: while set, it replaces the active tab's content entirely.
  const [detailView, setDetailView] = useState<{ type: 'player'; player: PlayerSeasonAverage } | { type: 'team'; team: TeamSeasonAverage } | null>(null);

  const [chatbotResponse, setChatbotResponse] = useState('');

  // Repointed data — real views instead of the old raw player_stats reads
  const [playerSeasonAverages, setPlayerSeasonAverages] = useState<PlayerSeasonAverage[]>([]);
  const [teamSeasonAverages, setTeamSeasonAverages] = useState<TeamSeasonAverage[]>([]);
  const [teamGameLog, setTeamGameLog] = useState<TeamGameLogRow[]>([]);
  const [leagueGameResults, setLeagueGameResults] = useState<GameResultRow[]>([]);
  const [nextGame, setNextGame] = useState<NextGameRow | null>(null);

  // Templates section states
  const [reportData, setReportData] = useState<ScoutingReport | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("clean-pro");
  const [parseError, setParseError] = useState<string | null>(null);

  // Shortcuts — top public leagues, shown while no league is selected yet.
  const [topLeagues, setTopLeagues] = useState<TopLeagueShortcut[]>([]);
  const [topLeaguesLoading, setTopLeaguesLoading] = useState(true);
  const [topLeaguesError, setTopLeaguesError] = useState(false);

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTopLeaguesLoading(true);
      setTopLeaguesError(false);
      try {
        const shortcuts = await fetchTopLeagueShortcuts();
        if (!cancelled) setTopLeagues(shortcuts);
      } catch (error) {
        console.error('Error fetching top league shortcuts:', error);
        if (!cancelled) setTopLeaguesError(true);
      } finally {
        if (!cancelled) setTopLeaguesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setDetailView(null);
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

      let combined = data || [];
      let coachCompetition: any = null;

      // Coach (team) logins own no competitions of their own — resolve their
      // team_id to its league instead, so Coaches Hub opens straight into
      // their team's data rather than an empty "No Leagues Found" state.
      // Gets the same full analytics any league owner already sees (that's
      // deliberate — a coach scouting an upcoming opponent needs the whole
      // league, not just their own team).
      if (isCoach && coachTeamId) {
        // Resolved server-side (service role) rather than with the anon
        // client: a club fields the same named team across several
        // competitions at once, and the live parser keeps each feed in its
        // own private competition beneath a public parent. RLS on
        // `competitions`/`teams` tests is_public directly instead of walking
        // the parent chain, so querying here would silently drop exactly the
        // competition the coach is currently playing in. The endpoint applies
        // the same public-or-child-of-public scope the league pages use.
        try {
          const res = await fetch(`/api/public/team-competitions/${encodeURIComponent(coachTeamId)}`);
          if (!res.ok) throw new Error(`team-competitions returned ${res.status}`);
          const { teamName, homeLeagueId, competitions } = await res.json();

          if (teamName) setCoachTeamName(teamName);

          const comps: any[] = competitions || [];
          comps.forEach((competition: any) => {
            if (!combined.some((c: any) => c.league_id === competition.league_id)) {
              combined = [...combined, competition];
            }
          });
          // Prefer the competition the account was provisioned against; fall
          // back to any other competition the team plays in.
          coachCompetition =
            comps.find((c: any) => c.league_id === homeLeagueId) || comps[0] || null;
        } catch (coachError) {
          console.error('Error resolving coach competitions:', coachError);
        }
      }

      setLeagues(combined);
      if (coachCompetition) {
        setSelectedLeague(coachCompetition);
      } else if (combined.length === 1) {
        setSelectedLeague(combined[0]);
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
      const [players, teamsRes, gameLogRes, teamAdvancedMap, gameResultsRes, nextGameRes] = await Promise.all([
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
        // Non-fatal: the rest of the hub should still work if this one fails.
        fetchTeamAdvancedAverages(leagueId).catch((err) => {
          console.error('Error fetching team advanced averages:', err);
          return new Map<string, AdvancedAverages & { pace: number | null }>();
        }),
        // Completed-game results, used to build standings (W-L/rank) and a
        // coach's own last-game / last-5-games trend. Same source the
        // Standings widget already uses.
        supabase
          .from('v_game_results')
          .select('game_key, home_team, away_team, home_score, away_score, match_time')
          .eq('league_id', leagueId)
          .order('match_time', { ascending: false }),
        // Next scheduled game for a coach's own team — league owners viewing
        // generally don't need this, so it's skipped for them.
        isCoach && coachTeamId
          ? supabase
              .from('game_schedule')
              .select('game_key, hometeam, awayteam, home_team_id, away_team_id, matchtime, status')
              .eq('league_id', leagueId)
              .or(`home_team_id.eq.${coachTeamId},away_team_id.eq.${coachTeamId}`)
              .gt('matchtime', new Date().toISOString())
              .order('matchtime', { ascending: true })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (teamsRes.error) throw teamsRes.error;
      if (gameLogRes.error) throw gameLogRes.error;
      if (gameResultsRes.error) console.error('Error fetching game results:', gameResultsRes.error);
      if (nextGameRes.error) console.error('Error fetching next game:', nextGameRes.error);

      players.sort((a, b) => b.total_pts - a.total_pts);
      setPlayerSeasonAverages(players);
      setTeamSeasonAverages(
        ((teamsRes.data || []) as TeamSeasonAverage[]).map((t) => ({
          ...t,
          advanced: teamAdvancedMap.get(t.team_id),
        }))
      );
      setTeamGameLog((gameLogRes.data || []) as TeamGameLogRow[]);
      setLeagueGameResults((gameResultsRes.data || []) as GameResultRow[]);
      setNextGame((nextGameRes.data || null) as NextGameRow | null);
    } catch (error) {
      console.error('Error fetching league stats:', error);
      setPlayerSeasonAverages([]);
      setTeamSeasonAverages([]);
      setTeamGameLog([]);
      setLeagueGameResults([]);
      setNextGame(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const hasStats = playerSeasonAverages.length > 0 || teamSeasonAverages.length > 0;
  // v_team_game_log has one row per team per game, so total games = rows / 2 (two teams per game).
  const uniqueGameCount = Math.round(teamGameLog.length / 2);
  const topTeam = teamSeasonAverages[0];
  // A coach's own team, when this league is the one their account is scoped
  // to — used to surface a "Your team" shortcut ahead of the league-wide
  // leaders, so landing on Coaches Hub answers "how's my team doing" before
  // "who else is in this league".
  // Matched by name, not coachTeamId — that id only resolves within the
  // competition the account was originally provisioned against. A coach can
  // now switch to any sibling competition their team also plays in (see
  // fetchUserLeagues), where the same real team has a different team_id.
  const myTeam = isCoach && coachTeamName ? teamSeasonAverages.find((t) => t.team_name === coachTeamName) : undefined;

  // League standings (win-loss based, not the points-per-game sort Rankings
  // uses) — computed client-side from completed results, the same approach
  // the public Standings widget uses. Every team in the league seeds a row
  // first (0-0) so a team with no completed games yet still appears.
  const standings: StandingRow[] = useMemo(() => {
    if (teamSeasonAverages.length === 0) return [];
    const byName = new Map<string, StandingRow>();
    teamSeasonAverages.forEach((t) => {
      byName.set(t.team_name, { teamId: t.team_id, teamName: t.team_name, wins: 0, losses: 0, games: 0, pointDiff: 0, pct: 0, rank: 0 });
    });
    leagueGameResults.forEach((g) => {
      if (g.home_score == null || g.away_score == null) return;
      const diff = g.home_score - g.away_score;
      if (g.home_team) {
        if (!byName.has(g.home_team)) byName.set(g.home_team, { teamId: '', teamName: g.home_team, wins: 0, losses: 0, games: 0, pointDiff: 0, pct: 0, rank: 0 });
        const row = byName.get(g.home_team)!;
        row.games++; row.pointDiff += diff;
        if (diff > 0) row.wins++; else if (diff < 0) row.losses++;
      }
      if (g.away_team) {
        if (!byName.has(g.away_team)) byName.set(g.away_team, { teamId: '', teamName: g.away_team, wins: 0, losses: 0, games: 0, pointDiff: 0, pct: 0, rank: 0 });
        const row = byName.get(g.away_team)!;
        row.games++; row.pointDiff += -diff;
        if (diff < 0) row.wins++; else if (diff > 0) row.losses++;
      }
    });
    const rows = Array.from(byName.values())
      .map((r) => ({ ...r, pct: r.games > 0 ? r.wins / r.games : 0 }))
      .sort((a, b) => b.pct - a.pct || b.wins - a.wins || b.pointDiff - a.pointDiff);
    rows.forEach((r, i) => { r.rank = i + 1; });
    return rows;
  }, [teamSeasonAverages, leagueGameResults]);

  const myStanding = myTeam ? standings.find((s) => s.teamName === myTeam.team_name) : undefined;

  // This team's own completed games, most-recent-first (leagueGameResults is
  // already ordered that way) — the source for "last game" and the last-5
  // trend strip.
  const myTeamGames: MyTeamGame[] = useMemo(() => {
    if (!myTeam) return [];
    return leagueGameResults
      .filter((g) => (g.home_team === myTeam.team_name || g.away_team === myTeam.team_name) && g.home_score != null && g.away_score != null)
      .map((g) => {
        const isHome = g.home_team === myTeam.team_name;
        const myScore = (isHome ? g.home_score : g.away_score) as number;
        const oppScore = (isHome ? g.away_score : g.home_score) as number;
        return {
          gameKey: g.game_key,
          opponent: isHome ? g.away_team : g.home_team,
          isHome,
          myScore,
          oppScore,
          result: (myScore > oppScore ? 'W' : 'L') as 'W' | 'L',
          matchTime: g.match_time,
        };
      });
  }, [leagueGameResults, myTeam]);

  const lastGame = myTeamGames[0];
  const last5 = myTeamGames.slice(0, 5);

  // FG% trend — last 5 games' average vs the season average already on
  // myTeam. teamGameLog covers every team in the league and is ordered
  // oldest-first, so this team's own most recent games are its last 5 rows.
  const last5FgPct = useMemo(() => {
    if (!myTeam) return null;
    // fg_pct (like several other numeric columns from these views) can come
    // back from Supabase as a numeric-typed string rather than a number —
    // Number(...) it explicitly rather than relying on the declared type, or
    // a plain `+` reduce silently does string concatenation instead of
    // summing. Already a 0-100 scale (e.g. "38" = 38%), not a fraction.
    const recent = teamGameLog
      .filter((g) => g.team_name === myTeam.team_name)
      .slice(-5)
      .map((g) => (g.fg_pct != null ? Number(g.fg_pct) : null))
      .filter((v): v is number => v != null && !Number.isNaN(v));
    if (recent.length === 0) return null;
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }, [teamGameLog, myTeam]);

  // Next game's opponent's own most recent completed game — the scouting
  // link target ("watch how they played last time out"). Resolved from the
  // same leagueGameResults already fetched for standings/last-game, no new
  // query needed.
  const opponentLastGame = useMemo(() => {
    if (!nextGame || !myTeam) return null;
    const opponentName = nextGame.home_team_id === myTeam.team_id ? nextGame.awayteam : nextGame.hometeam;
    const game = leagueGameResults.find(
      (g) => (g.home_team === opponentName || g.away_team === opponentName) && g.home_score != null && g.away_score != null
    );
    return game ? { gameKey: game.game_key, opponentName } : null;
  }, [nextGame, myTeam, leagueGameResults]);

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

  // Grouped so "look something up" (Stats) and "write something" (Build) read
  // as two different jobs, not five flat equal-weight options. "Lineups" used
  // to be labelled "Advanced Insights", which collided with the "Advanced"
  // category group inside Rankings below — renamed to what it actually shows.
  const tabGroups: { group: string; tabs: { id: HubTab; label: string }[] }[] = [
    {
      group: 'Stats', tabs: [
        { id: 'overview', label: 'Overview' },
        { id: 'rankings', label: 'Rankings' },
        { id: 'lineups', label: 'Lineups' },
        { id: 'trends', label: 'Trends' },
      ]
    },
    {
      group: 'Build', tabs: [
        { id: 'scouting', label: 'Scouting Reports' },
      ]
    },
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

          <button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="text-xs md:text-sm text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 transition whitespace-nowrap disabled:opacity-50"
            data-testid="button-logout"
          >
            {logoutMutation.isPending ? "Signing out…" : "Log out"}
          </button>

          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-full mx-auto px-4 md:px-6 py-4 md:py-6">
        {/* A coach's own team, once resolved, gets a persistent branded
            banner instead of the generic title — visible above every tab,
            not just Overview, so it reads as "this is my team's hub" rather
            than a stat card that scrolls away. League owners (no single
            team) keep the plain title. */}
        {isCoach && myTeam ? (
          <CoachTeamBanner
            team={myTeam}
            leagueId={selectedLeague?.league_id}
            standing={myStanding}
            standingsCount={standings.length}
            fallbackColor={readableBrand}
            onViewTeam={() => setDetailView({ type: 'team', team: myTeam })}
          />
        ) : (
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
              <Target className="w-5 h-5 md:w-6 md:h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white">Coaches Hub</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">Analyze performance, track trends, and build scouting reports.</p>
            </div>
          </div>
        )}

        {/* Shortcuts — top public leagues, for fast navigation while no
            league is selected yet (whether or not the coach has their own). */}
        {!selectedLeague && (
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6 mb-4 md:mb-6">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
              <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Shortcuts</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Top leagues on Swish Assistant — jump straight in to scout, compare, or explore.
            </p>

            {topLeaguesLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-neutral-500 py-3">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-500" />
                Finding leagues…
              </div>
            ) : topLeaguesError ? (
              <p className="text-sm text-slate-400 dark:text-neutral-500 py-2">League suggestions are temporarily unavailable.</p>
            ) : topLeagues.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-neutral-500 py-2">No featured leagues right now.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
                {topLeagues.map((lg) => (
                  <button
                    key={lg.competition.competition_id ?? lg.competition.league_id}
                    type="button"
                    onClick={() => setSelectedLeague(lg.competition)}
                    className="group flex flex-col items-center gap-2 rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 p-3 text-center hover:border-orange-300 dark:hover:border-orange-500/50 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors"
                  >
                    {lg.logoUrl ? (
                      <img src={lg.logoUrl} alt="" className="h-10 w-10 object-contain" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-orange-500" />
                      </div>
                    )}
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2 group-hover:text-orange-700 dark:group-hover:text-orange-400">
                      {lg.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
            {/* League chooser — full search card until one's picked, then it
                collapses to a small switcher pill so it stops competing with
                the header's own global search and the tab content below. */}
            {!selectedLeague ? (
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Select league</h3>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {leagues.length} available
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Search for a league to analyze..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />

                  {searchQuery && filteredLeagues.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredLeagues.map((league) => (
                        <button
                          key={league.league_id}
                          onClick={() => { setSelectedLeague(league); setSearchQuery(''); }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-900 dark:text-white hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-orange-800 dark:hover:text-orange-300 focus:outline-none focus:bg-orange-50 dark:focus:bg-neutral-800 focus:text-orange-800 dark:focus:text-orange-300"
                        >
                          <div className="font-medium">{league.name}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchQuery && filteredLeagues.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-700 rounded-md shadow-lg p-3 text-sm text-gray-500 dark:text-neutral-400">
                      No leagues found matching "{searchQuery}"
                    </div>
                  )}
                </div>

                {leagues.length <= 5 && (
                  <div className="flex flex-wrap gap-2 mt-3">
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
            ) : (
              <div className="relative inline-block">
                <button
                  onClick={() => setLeaguePickerOpen(o => !o)}
                  className="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-full hover:border-gray-300 dark:hover:border-neutral-700 transition-colors"
                >
                  {selectedLeague.logo_url ? (
                    <img
                      src={selectedLeague.logo_url}
                      alt={selectedLeague.name}
                      className="w-6 h-6 rounded-full object-contain bg-white border border-gray-200 dark:border-neutral-700 shrink-0"
                    />
                  ) : (
                    <div className="w-2 h-2 bg-green-500 rounded-full shrink-0" />
                  )}
                  <span className="text-sm font-medium text-slate-800 dark:text-white">{selectedLeague.name}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
                    {statsLoading ? 'Loading…' : `${playerSeasonAverages.length} players`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500" />
                </button>

                {leaguePickerOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setLeaguePickerOpen(false)} />
                    <div className="absolute z-20 mt-2 w-80 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-lg shadow-lg p-3">
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-neutral-500" />
                        <input
                          type="text"
                          autoFocus
                          placeholder="Switch league..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-neutral-700 rounded-md text-sm bg-white dark:bg-neutral-800 text-slate-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>

                      {searchQuery ? (
                        filteredLeagues.length > 0 ? (
                          <div className="max-h-60 overflow-y-auto">
                            {filteredLeagues.map((league) => (
                              <button
                                key={league.league_id}
                                onClick={() => { setSelectedLeague(league); setSearchQuery(''); setLeaguePickerOpen(false); }}
                                className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white rounded-md hover:bg-orange-50 dark:hover:bg-neutral-800 hover:text-orange-800 dark:hover:text-orange-300"
                              >
                                {league.name}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="px-3 py-2 text-sm text-gray-500 dark:text-neutral-400">No leagues found matching "{searchQuery}"</p>
                        )
                      ) : (
                        <div className="max-h-60 overflow-y-auto">
                          {leagues.map((league) => (
                            <button
                              key={league.league_id}
                              onClick={() => { setSelectedLeague(league); setLeaguePickerOpen(false); }}
                              className="w-full flex items-center justify-between text-left px-3 py-2 text-sm rounded-md hover:bg-orange-50 dark:hover:bg-neutral-800"
                              style={league.league_id === selectedLeague.league_id ? { color: readableBrand, fontWeight: 600 } : {}}
                            >
                              <span className={league.league_id === selectedLeague.league_id ? '' : 'text-gray-900 dark:text-white'}>{league.name}</span>
                              {league.league_id === selectedLeague.league_id && <span className="text-xs">Current</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {selectedLeague && (
              <>
                {/* Section tabs, grouped by job — "Stats" to look something up,
                    "Build" to make something — instead of one flat row. */}
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-4 border-b border-gray-200 dark:border-neutral-800">
                  {tabGroups.map((g) => (
                    <div key={g.group}>
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-neutral-500 mb-1.5">
                        {g.group}
                      </div>
                      <div className="flex gap-1.5">
                        {g.tabs.map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setDetailView(null); }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md border whitespace-nowrap transition-colors ${
                              activeTab === tab.id
                                ? ''
                                : 'border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400 hover:border-gray-300 dark:hover:border-neutral-600'
                            }`}
                            style={activeTab === tab.id ? { backgroundColor: readableBrand, color: '#fff', borderColor: readableBrand } : {}}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Drill-in from a Rankings/roster row takes over the content
                    area regardless of which tab is active; the tab strip
                    above still works to back out of it. */}
                {detailView ? (
                  detailView.type === 'player' ? (
                    <PlayerDetail
                      player={detailView.player}
                      players={playerSeasonAverages}
                      teams={teamSeasonAverages}
                      brandColor={brandColor}
                      onBack={() => setDetailView(null)}
                      onSelectTeam={(team) => setDetailView({ type: 'team', team })}
                    />
                  ) : (
                    <TeamDetail
                      team={detailView.team}
                      teams={teamSeasonAverages}
                      players={playerSeasonAverages}
                      brandColor={brandColor}
                      onBack={() => setDetailView(null)}
                      onSelectPlayer={(player) => setDetailView({ type: 'player', player })}
                    />
                  )
                ) : (
                  <>
                {/* Overview */}
                {activeTab === 'overview' && (
                  <div className="space-y-4 md:space-y-6">
                    {/* The persistent CoachTeamBanner above already covers
                        "here's my team" (logo, record, rank) — Overview
                        picks up straight from next/last game and trends. */}
                    {myTeam && (
                      <CoachTeamOverview
                        team={myTeam}
                        leagueId={selectedLeague.league_id}
                        standing={myStanding}
                        standings={standings}
                        lastGame={lastGame}
                        nextGame={nextGame}
                        opponentLastGame={opponentLastGame}
                        last5={last5}
                        last5FgPct={last5FgPct}
                        fallbackColor={readableBrand}
                      />
                    )}

                    {hasStats ? (
                      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
                        <SectionKicker n="01" label="Season snapshot" color={readableBrand} />
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

                        <SectionKicker n="02" label="Team leaders" color={readableBrand} />
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
                                    <button onClick={() => setDetailView({ type: 'team', team })} className="text-sm font-medium text-gray-900 dark:text-white hover:underline text-left">{team.team_name}</button>
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
                      <SectionKicker n="03" label="Quick actions" color={readableBrand} />
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

                {/* Rankings */}
                {activeTab === 'rankings' && (
                  <div>
                    <SectionKicker n="01" label="Rankings" color={readableBrand} />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                      Season averages across {teamSeasonAverages.length} teams and {playerSeasonAverages.length} players, updated as new stats are uploaded.
                    </p>
                    <FullRankings
                      players={playerSeasonAverages}
                      teams={teamSeasonAverages}
                      brandColor={brandColor}
                      onSelectPlayer={(player) => setDetailView({ type: 'player', player })}
                      onSelectTeam={(team) => setDetailView({ type: 'team', team })}
                    />
                  </div>
                )}

                {/* Lineups — five-man unit net rating / plus-minus / minutes,
                    was labelled "Advanced Insights" which collided with the
                    "Advanced" category group inside Rankings above. Coach
                    accounts get their own team only — reading-focused, not a
                    league-wide leaderboard; to see another team's lineups,
                    visit that team's own profile (Rankings drill-in), which
                    shows the same scoped view. League owners still get the
                    full league here since they're not tied to one team. */}
                {activeTab === 'lineups' && (
                  <div>
                    <SectionKicker n="01" label="Lineups" color={readableBrand} />
                    <AdvancedInsights leagueId={selectedLeague.league_id} teamId={isCoach ? coachTeamId ?? undefined : undefined} showHeading={false} />
                  </div>
                )}

                {/* Trends */}
                {activeTab === 'trends' && (
                  <div>
                    <SectionKicker n="01" label="Performance trends" color={readableBrand} />
                    {teamGameLog.length > 0 ? (
                      <TeamPerformanceTrends teamGameLog={teamGameLog} leagueId={selectedLeague.league_id} />
                    ) : (
                      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-8 text-center">
                        <BarChart3 className="w-16 h-16 text-gray-400 dark:text-neutral-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-2">No Player Data Found</h3>
                        <p className="text-slate-600 dark:text-slate-400">
                          Upload player statistics for this league to see performance trends.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Scouting Reports */}
                {activeTab === 'scouting' && (
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 overflow-hidden">
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-gray-200 dark:border-neutral-800 gap-2 md:gap-0">
                      <SectionKicker n="01" label="Scouting reports" color={readableBrand} className="" />
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
