import { useState, useEffect, useMemo, type CSSProperties } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/lib/supabase';
import { useGlobalSearch, type SearchSuggestion } from '@/hooks/useGlobalSearch';
import { useLeagueBranding } from '@/hooks/useLeagueBranding';
import { useReadableTeamColor } from '@/hooks/useReadableColor';
import { useTeamBranding } from '@/hooks/useTeamBranding';
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
import { TrendingUp, BarChart3, Users, Target, Award, Eye, Search, User, Calendar, Trophy, X, ChevronDown, Check, Lock, LayoutDashboard, LayoutGrid, ArrowLeftRight, ListOrdered, LineChart, ClipboardList, Sparkles, Shield, Upload, ArrowUpRight, LogOut, type LucideIcon } from 'lucide-react';
import { Link } from 'wouter';
import SwishLogo from '@/assets/Swish Assistant Logo.png';
import UnifiedScoutingEditor from '@/components/scout-editor/UnifiedScoutingEditor';
import { ordinal } from '@/lib/gameReport';
import MatchReport from '@/components/coaches-hub/MatchReport';
import OpponentScoutReport from '@/components/coaches-hub/OpponentScoutReport';
import FormComparison from '@/components/coaches-hub/FormComparison';
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

type HubTab = 'overview' | 'compare' | 'rankings' | 'lineups' | 'trends' | 'scouting';

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
function SectionKicker({ n, label, color, className = 'mb-4' }: { n: string; label: string; color: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="ch-kicker-n" style={{ color }}>{n}</span>
      <h3 className="text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">{label}</h3>
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
  const [detailView, setDetailView] = useState<
    | { type: 'player'; player: PlayerSeasonAverage }
    | { type: 'team'; team: TeamSeasonAverage }
    | { type: 'matchReport'; gameKey: string }
    | { type: 'scoutReport'; opponentName: string }
    | null
  >(null);

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
  // The feed records the same club under more than one name in the same
  // competition -- a sponsor prefix ("Signs Express Falkirk Fury"), an
  // abbreviation ("MK Breakers"), a suffix ("Essex Rebels (M)"). Those rows
  // share a team_id, so keying standings purely on the name split one club
  // into two half-record rows and produced duplicate React keys. Collapse
  // onto the team_id and pick the name the competition uses most often,
  // falling back to the shortest so a sponsor prefix loses to the plain club
  // name on a tie.
  const canonicalTeamName = useMemo(() => {
    // The fixture list is the authority: it carries the plain club name
    // ("Falkirk Fury", "Milton Keynes Breakers") while the box-score feed is
    // what varies. Fall back to games played, then to the shortest name, so
    // a sponsor prefix loses -- but never let that fallback alone decide,
    // or "MK Breakers" would beat "Milton Keynes Breakers".
    const scheduleNames = new Set<string>();
    leagueGameResults.forEach((g) => {
      if (g.home_team) scheduleNames.add(g.home_team);
      if (g.away_team) scheduleNames.add(g.away_team);
    });

    const bestByTeamId = new Map<string, { name: string; games: number; inSchedule: boolean }>();
    teamSeasonAverages.forEach((t) => {
      if (!t.team_id) return;
      const candidate = {
        name: t.team_name,
        games: t.games_played || 0,
        inSchedule: scheduleNames.has(t.team_name),
      };
      const current = bestByTeamId.get(t.team_id);
      if (!current) {
        bestByTeamId.set(t.team_id, candidate);
        return;
      }
      const better =
        candidate.inSchedule !== current.inSchedule
          ? candidate.inSchedule
          : candidate.games !== current.games
            ? candidate.games > current.games
            : candidate.name.length < current.name.length;
      if (better) bestByTeamId.set(t.team_id, candidate);
    });
    const aliases = new Map<string, string>();
    teamSeasonAverages.forEach((t) => {
      const best = t.team_id ? bestByTeamId.get(t.team_id) : undefined;
      if (best) aliases.set(t.team_name, best.name);
    });
    return (name: string) => aliases.get(name) || name;
  }, [teamSeasonAverages, leagueGameResults]);

  const standings: StandingRow[] = useMemo(() => {
    if (teamSeasonAverages.length === 0) return [];
    const byName = new Map<string, StandingRow>();
    teamSeasonAverages.forEach((t) => {
      const name = canonicalTeamName(t.team_name);
      const existing = byName.get(name);
      if (existing) {
        // Second alias for a club already seeded; keep the one row.
        if (!existing.teamId && t.team_id) existing.teamId = t.team_id;
        return;
      }
      byName.set(name, { teamId: t.team_id, teamName: name, wins: 0, losses: 0, games: 0, pointDiff: 0, pct: 0, rank: 0 });
    });
    leagueGameResults.forEach((raw) => {
      const g = {
        ...raw,
        home_team: raw.home_team ? canonicalTeamName(raw.home_team) : raw.home_team,
        away_team: raw.away_team ? canonicalTeamName(raw.away_team) : raw.away_team,
      };
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
  }, [teamSeasonAverages, leagueGameResults, canonicalTeamName]);

  const myStanding = myTeam
    ? standings.find((s) => s.teamName === canonicalTeamName(myTeam.team_name))
    : undefined;

  // A coach reads "89.3 PPG" and cannot tell whether that is good. Rank it
  // against the rest of the competition, collapsing alias rows first so the
  // denominator matches the standings ("2nd of 20", not "of 21").
  const teamRanks = useMemo(() => {
    if (!myTeam) return null;
    const byCanonical = new Map<string, TeamSeasonAverage>();
    teamSeasonAverages.forEach((t) => {
      const name = canonicalTeamName(t.team_name);
      const existing = byCanonical.get(name);
      if (!existing || (t.games_played || 0) > (existing.games_played || 0)) {
        byCanonical.set(name, t);
      }
    });
    const teams = Array.from(byCanonical.values());
    const total = teams.length;
    const myName = canonicalTeamName(myTeam.team_name);

    const rankBy = (pick: (t: TeamSeasonAverage) => number | null | undefined) => {
      const scored = teams
        .map((t) => ({ name: canonicalTeamName(t.team_name), value: Number(pick(t) ?? NaN) }))
        .filter((r) => !Number.isNaN(r.value))
        .sort((a, b) => b.value - a.value);
      const index = scored.findIndex((r) => r.name === myName);
      return index >= 0 ? { rank: index + 1, of: scored.length } : null;
    };

    return {
      total,
      pts: rankBy((t) => t.avg_pts),
      reb: rankBy((t) => t.avg_reb),
      ast: rankBy((t) => t.avg_ast),
      fg: rankBy((t) => t.season_fg_pct),
    };
  }, [myTeam, teamSeasonAverages, canonicalTeamName]);

  // Reading's own roster, not the league's. Sorted per category so the coach
  // sees who is carrying each part of their team.
  const myRosterLeaders = useMemo(() => {
    if (!myTeam) return null;
    const mine = playerSeasonAverages.filter(
      (p) => canonicalTeamName(p.team_name) === canonicalTeamName(myTeam.team_name)
    );
    if (mine.length === 0) return null;
    const top = (pick: (p: PlayerSeasonAverage) => number | null | undefined) =>
      [...mine]
        .filter((p) => pick(p) != null && !Number.isNaN(Number(pick(p))))
        .sort((a, b) => Number(pick(b) ?? 0) - Number(pick(a) ?? 0))[0];
    return {
      scorers: [...mine].sort((a, b) => Number(b.avg_pts ?? 0) - Number(a.avg_pts ?? 0)).slice(0, 3),
      rebounder: top((p) => p.avg_reb),
      passer: top((p) => p.avg_ast),
      defender: top((p) => Number(p.avg_stl ?? 0) + Number(p.avg_blk ?? 0)),
    };
  }, [myTeam, playerSeasonAverages, canonicalTeamName]);

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
  const leagueBrandColor = brandColors?.primary || '#f97316';
  // A coach's hub wears their own team's colours (Hurricanes navy, not the
  // league's orange); league owners and visitors keep the league brand.
  const { colors: myTeamColors, isLoading: myTeamBrandLoading } = useTeamBranding({
    teamName: myTeam?.team_name ?? '',
    leagueId: selectedLeague?.league_id ?? '',
    enabled: !!(isCoach && myTeam && selectedLeague),
  });
  const brandColor = isCoach && myTeam && !myTeamBrandLoading && myTeamColors?.primary
    ? myTeamColors.primary
    : leagueBrandColor;
  // Contrast-safe variant for text/icons — the raw brandColor above can be a
  // dark team colour that disappears against the dark-mode surface.
  const readableBrand = useReadableTeamColor(brandColor).body;

  // Grouped so "look something up" (Stats) and "write something" (Build) read
  // as two different jobs, not five flat equal-weight options. "Lineups" used
  // to be labelled "Advanced Insights", which collided with the "Advanced"
  // category group inside Rankings below — renamed to what it actually shows.
  const tabGroups: { group: string; tabs: { id: HubTab; label: string; icon: LucideIcon }[] }[] = [
    {
      group: 'Stats', tabs: [
        { id: 'overview', label: 'Overview', icon: LayoutDashboard },
        // Needs a team of your own to compare from, so team (coach) logins only.
        ...(myTeam ? [{ id: 'compare' as HubTab, label: 'Compare', icon: ArrowLeftRight }] : []),
        { id: 'rankings', label: 'Rankings', icon: ListOrdered },
        { id: 'lineups', label: 'Lineups', icon: Users },
        { id: 'trends', label: 'Trends', icon: LineChart },
      ]
    },
    {
      group: 'Build', tabs: [
        { id: 'scouting', label: 'Scouting Reports', icon: ClipboardList },
      ]
    },
  ];

  // Everything inside the hub reads its accent from this one variable.
  const hubStyle = { '--ch-accent': readableBrand } as CSSProperties;

  if (loading) {
    return (
      <div className="coach-hub sa-pro min-h-screen flex items-center justify-center" style={hubStyle}>
        <div className="flex flex-col items-center gap-5">
          <img src={SwishLogo} alt="Swish Assistant" className="h-8 opacity-90" />
          <div className="w-40 h-1 rounded-full overflow-hidden bg-[color:var(--ch-surface-3)]">
            <div className="h-full w-1/3 rounded-full bg-[color:var(--ch-accent)] animate-[ch-load_1.1s_ease-in-out_infinite]" />
          </div>
          <p className="text-[13px] text-[color:var(--ch-text-2)]">Preparing your Coaches Hub…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="coach-hub sa-pro min-h-screen flex items-center justify-center px-4" style={hubStyle}>
        <div className="ch-card max-w-sm w-full p-8 text-center">
          <div className="w-12 h-12 rounded-xl ch-tile flex items-center justify-center mx-auto mb-5">
            <Lock className="w-5 h-5 text-[color:var(--ch-text-2)]" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--ch-text)] mb-2">Sign in to Coaches Hub</h1>
          <p className="text-sm text-[color:var(--ch-text-2)] mb-6">Scouting, rankings and game plans for your team — log in to continue.</p>
          <Link href="/auth" className="ch-btn ch-btn-primary w-full justify-center h-10">
            Log in
          </Link>
        </div>
      </div>
    );
  }

  const leagueSwitcher = selectedLeague && (
    <div className="relative shrink-0">
      <button
        onClick={() => setLeaguePickerOpen(o => !o)}
        className="flex items-center gap-2 pl-1.5 pr-2.5 h-9 rounded-lg border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] hover:border-[color:var(--ch-border-strong)] transition-colors w-full md:w-auto md:max-w-[320px]"
        aria-haspopup="listbox"
        aria-expanded={leaguePickerOpen}
      >
        {selectedLeague.logo_url ? (
          <img
            src={selectedLeague.logo_url}
            alt=""
            className="w-6 h-6 rounded-md object-contain bg-white ring-1 ring-black/5 shrink-0"
          />
        ) : (
          <span className="w-6 h-6 rounded-md ch-tile flex items-center justify-center shrink-0">
            <Trophy className="w-3.5 h-3.5 text-[color:var(--ch-text-2)]" />
          </span>
        )}
        <span className="text-[13px] font-medium text-[color:var(--ch-text)] truncate flex-1 min-w-0 text-left">{selectedLeague.name}</span>
        <span className="text-[11px] text-[color:var(--ch-muted)] hidden xl:inline whitespace-nowrap ch-num shrink-0">
          {statsLoading ? 'Loading…' : `${playerSeasonAverages.length} players`}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[color:var(--ch-muted)] shrink-0" />
      </button>

      {leaguePickerOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setLeaguePickerOpen(false)} />
          <div className="absolute left-0 md:left-auto md:right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] ch-card shadow-[var(--ch-shadow-lg)] p-2 ch-rise">
            <div className="relative mb-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ch-muted)]" />
              <input
                type="text"
                autoFocus
                placeholder="Switch league…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ch-input w-full pl-9 pr-3 h-9 text-sm"
              />
            </div>

            {searchQuery ? (
              filteredLeagues.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  {filteredLeagues.map((league) => (
                    <button
                      key={league.league_id}
                      onClick={() => { setSelectedLeague(league); setSearchQuery(''); setLeaguePickerOpen(false); }}
                      className="w-full text-left px-3 py-2 text-[13px] text-[color:var(--ch-text)] rounded-md hover:bg-[color:var(--ch-surface-3)]"
                    >
                      {league.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2 text-[13px] text-[color:var(--ch-muted)]">No leagues found matching "{searchQuery}"</p>
              )
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <div className="ch-eyebrow px-3 pt-1.5 pb-1">Your leagues</div>
                {leagues.map((league) => {
                  const isCurrent = league.league_id === selectedLeague.league_id;
                  return (
                    <button
                      key={league.league_id}
                      onClick={() => { setSelectedLeague(league); setLeaguePickerOpen(false); }}
                      className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-[13px] rounded-md hover:bg-[color:var(--ch-surface-3)]"
                      style={isCurrent ? { color: readableBrand, fontWeight: 600 } : { color: 'var(--ch-text)' }}
                    >
                      <span className="truncate">{league.name}</span>
                      {isCurrent && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  const rankTile = (stat: { label: string; value: string; rank: { rank: number; of: number } | null }) => {
    const pct = stat.rank ? (stat.rank.of > 1 ? (stat.rank.of - stat.rank.rank) / (stat.rank.of - 1) : 1) : 0;
    const topThird = stat.rank ? stat.rank.rank <= Math.max(1, Math.ceil(stat.rank.of / 3)) : false;
    return (
      <div key={stat.label} className="ch-tile p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="ch-eyebrow">{stat.label}</span>
          {stat.rank && topThird && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: readableBrand, backgroundColor: 'var(--ch-accent-soft)' }}>
              Top third
            </span>
          )}
        </div>
        <div className="ch-display ch-num text-[2rem] md:text-[2.25rem] font-bold leading-none mt-2 text-[color:var(--ch-text)]">
          {stat.value}
        </div>
        {stat.rank && (
          <div className="mt-3">
            <div className="h-1 rounded-full bg-[color:var(--ch-surface-3)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(pct * 100, 4)}%`, backgroundColor: readableBrand }} />
            </div>
            <div className="text-[11px] text-[color:var(--ch-text-2)] mt-1.5 ch-num">
              {ordinal(stat.rank.rank)} of {stat.rank.of} in the league
            </div>
          </div>
        )}
      </div>
    );
  };

  const plainTile = (label: string, value: string | number, Icon: LucideIcon, small = false) => (
    <div key={label} className="ch-tile p-4">
      <div className="ch-eyebrow flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`${small ? 'text-base font-semibold tracking-tight mt-2.5 leading-snug' : 'ch-display ch-num text-[2rem] md:text-[2.25rem] font-bold leading-none mt-2'} text-[color:var(--ch-text)]`}>
        {value}
      </div>
    </div>
  );

  const rankBadge = (index: number) => (
    <span
      className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ch-num shrink-0"
      style={index === 0
        ? { backgroundColor: readableBrand, color: '#fff' }
        : { backgroundColor: 'var(--ch-surface-3)', color: 'var(--ch-text-2)' }}
    >
      {index + 1}
    </span>
  );

  const loadingPanels = (
    <div className="space-y-4 md:space-y-5">
      <div className="ch-card p-5 md:p-6">
        <div className="ch-skel h-4 w-40 mb-5" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="ch-skel h-[104px]" />)}
        </div>
      </div>
      <div className="ch-card p-5 md:p-6">
        <div className="ch-skel h-4 w-32 mb-5" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="ch-skel h-9" />)}
        </div>
      </div>
    </div>
  );

  // Season profile + squad — shared by the coach dashboard (inside
  // CoachTeamOverview's main column) and the league-owner overview.
  const seasonPanels = statsLoading && !hasStats ? loadingPanels : hasStats ? (
    <>
      <div className="ch-card p-5 md:p-6">
        <SectionKicker n="01" label={myTeam ? `${myTeam.team_name} in this competition` : 'Season snapshot'} color={readableBrand} />
        {myTeam && teamRanks ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {rankTile({ label: 'Points', value: Number(myTeam.avg_pts ?? 0).toFixed(1), rank: teamRanks.pts })}
            {rankTile({ label: 'Rebounds', value: Number(myTeam.avg_reb ?? 0).toFixed(1), rank: teamRanks.reb })}
            {rankTile({ label: 'Assists', value: Number(myTeam.avg_ast ?? 0).toFixed(1), rank: teamRanks.ast })}
            {rankTile({
              label: 'FG%',
              value: myTeam.season_fg_pct != null ? `${Number(myTeam.season_fg_pct).toFixed(1)}%` : '—',
              rank: teamRanks.fg,
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {plainTile('Teams', standings.length || teamSeasonAverages.length, Users)}
            {plainTile('Players', playerSeasonAverages.length, User)}
            {plainTile('Games', uniqueGameCount, Calendar)}
            {plainTile('Top scoring team', topTeam ? topTeam.team_name : 'No Data', Award, true)}
          </div>
        )}
      </div>

      <div className="ch-card p-5 md:p-6">
        <SectionKicker n="02" label={myRosterLeaders ? 'Your squad' : 'Team leaders'} color={readableBrand} />
        {myRosterLeaders ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="ch-tile p-4">
              <h4 className="ch-eyebrow mb-3">Leading scorers</h4>
              <div className="space-y-1">
                {myRosterLeaders.scorers.map((player, index) => {
                  const top = Number(myRosterLeaders.scorers[0]?.avg_pts ?? 0) || 1;
                  const ppg = Number(player.avg_pts ?? 0);
                  return (
                    <button
                      key={`${player.player_name}-${index}`}
                      onClick={() => setDetailView({ type: 'player', player })}
                      className="group w-full flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-[color:var(--ch-surface)] transition-colors text-left"
                    >
                      {rankBadge(index)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13.5px] font-medium text-[color:var(--ch-text)] truncate group-hover:underline underline-offset-2">
                            {player.player_name}
                          </span>
                          <span className="text-[13px] font-semibold ch-num text-[color:var(--ch-text)] shrink-0">
                            {ppg.toFixed(1)} <span className="text-[color:var(--ch-muted)] font-medium">ppg</span>
                          </span>
                        </div>
                        <div className="h-1 mt-1.5 rounded-full bg-[color:var(--ch-surface-3)] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(ppg / top) * 100}%`, backgroundColor: index === 0 ? readableBrand : 'var(--ch-muted)' }} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ch-tile p-4">
              <h4 className="ch-eyebrow mb-3">Who leads what</h4>
              <div className="divide-y divide-[color:var(--ch-border)]">
                {[
                  { label: 'Rebounding', icon: BarChart3, player: myRosterLeaders.rebounder, value: myRosterLeaders.rebounder ? Number(myRosterLeaders.rebounder.avg_reb ?? 0).toFixed(1) : null, unit: 'rpg' },
                  { label: 'Playmaking', icon: Users, player: myRosterLeaders.passer, value: myRosterLeaders.passer ? Number(myRosterLeaders.passer.avg_ast ?? 0).toFixed(1) : null, unit: 'apg' },
                  {
                    label: 'Stocks (stl+blk)', icon: Shield, player: myRosterLeaders.defender,
                    value: myRosterLeaders.defender ? (Number(myRosterLeaders.defender.avg_stl ?? 0) + Number(myRosterLeaders.defender.avg_blk ?? 0)).toFixed(1) : null,
                    unit: 'per game',
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ color: readableBrand, backgroundColor: 'var(--ch-accent-soft)' }}>
                      <row.icon className="w-4 h-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-[color:var(--ch-muted)]">{row.label}</div>
                      {row.player ? (
                        <button
                          onClick={() => setDetailView({ type: 'player', player: row.player! })}
                          className="text-[13.5px] font-medium text-[color:var(--ch-text)] truncate hover:underline underline-offset-2 text-left max-w-full"
                        >
                          {row.player.player_name}
                        </button>
                      ) : (
                        <div className="text-[13.5px] text-[color:var(--ch-muted)]">No Data</div>
                      )}
                    </div>
                    {row.value && (
                      <div className="text-right shrink-0">
                        <div className="text-[15px] font-semibold ch-num text-[color:var(--ch-text)]">{row.value}</div>
                        <div className="text-[10.5px] text-[color:var(--ch-muted)]">{row.unit}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="ch-tile p-4 md:max-w-lg">
            <h4 className="ch-eyebrow mb-3">Top scoring teams</h4>
            <div className="space-y-1">
              {teamSeasonAverages.slice(0, 3).map((team, index) => (
                <button
                  key={`${team.team_id ?? 'team'}-${index}`}
                  onClick={() => setDetailView({ type: 'team', team })}
                  className="group w-full flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-[color:var(--ch-surface)] transition-colors text-left"
                >
                  {rankBadge(index)}
                  <span className="w-6 h-6 shrink-0 flex items-center justify-center">
                    <TeamLogo teamName={team.team_name} leagueId={selectedLeague?.league_id} size="xs" />
                  </span>
                  <span className="flex-1 min-w-0 text-[13.5px] font-medium text-[color:var(--ch-text)] truncate group-hover:underline underline-offset-2">{team.team_name}</span>
                  <span className="text-[13px] font-semibold ch-num text-[color:var(--ch-text)] shrink-0">
                    {Number(team.avg_pts ?? 0).toFixed(1)} <span className="text-[color:var(--ch-muted)] font-medium">avg pts</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  ) : (
    <div className="ch-card p-10 text-center">
      <div className="w-12 h-12 rounded-xl ch-tile flex items-center justify-center mx-auto mb-4">
        <BarChart3 className="w-5 h-5 text-[color:var(--ch-muted)]" />
      </div>
      <h3 className="text-base font-semibold text-[color:var(--ch-text)] mb-1">No data yet</h3>
      <p className="text-sm text-[color:var(--ch-text-2)]">
        Upload player statistics for this league to see analytics.
      </p>
    </div>
  );

  const quickActions = selectedLeague && (
    <div className="ch-card p-5">
      <SectionKicker n="03" label="Quick actions" color={readableBrand} />
      <div className="-mx-2 space-y-0.5">
        {[
          // League-owner action -- a coach account has no access to
          // /league-admin, so offering it here only leads them to a
          // permission wall.
          ...(!isCoach ? [{ href: '/league-admin', label: 'Upload Player Stats', sub: 'Add box scores to this league', icon: Upload }] : []),
          { href: `/competition/${selectedLeague.slug}`, label: 'View Public League Page', sub: 'Fixtures, results and teams', icon: Eye },
          { href: `/competition/${selectedLeague.slug}?section=leaders`, label: 'View League Leaders', sub: 'Stat leaders across the league', icon: TrendingUp },
        ].map((a) => (
          <Link key={a.href} href={a.href} className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-[color:var(--ch-surface-2)] transition-colors">
            <span className="w-8 h-8 rounded-lg ch-tile flex items-center justify-center shrink-0">
              <a.icon className="w-4 h-4 text-[color:var(--ch-text-2)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-medium text-[color:var(--ch-text)]">{a.label}</span>
              <span className="block text-[11.5px] text-[color:var(--ch-muted)] truncate">{a.sub}</span>
            </span>
            <ArrowUpRight className="w-4 h-4 text-[color:var(--ch-muted)] group-hover:text-[color:var(--ch-text)] transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );

  const emptyState = (Icon: LucideIcon, title: string, body: string) => (
    <div className="ch-card p-10 text-center">
      <div className="w-12 h-12 rounded-xl ch-tile flex items-center justify-center mx-auto mb-4">
        <Icon className="w-5 h-5 text-[color:var(--ch-muted)]" />
      </div>
      <h3 className="text-base font-semibold text-[color:var(--ch-text)] mb-1">{title}</h3>
      <p className="text-sm text-[color:var(--ch-text-2)]">{body}</p>
    </div>
  );

  const tabIntro = (n: string, label: string, sub?: string) => (
    <div className="mb-4 md:mb-5">
      <SectionKicker n={n} label={label} color={readableBrand} className="" />
      {sub && <p className="text-[13px] text-[color:var(--ch-text-2)] mt-1.5">{sub}</p>}
    </div>
  );

  return (
    <div className="coach-hub sa-pro min-h-screen" style={hubStyle}>
      {/* Header */}
      <header className="ch-glass sticky top-0 z-50 border-b border-[color:var(--ch-border)]">
        <div className="max-w-[1440px] mx-auto h-14 md:h-16 px-4 md:px-8 flex items-center gap-3 md:gap-5">
          <button onClick={() => navigate('/')} className="flex items-center gap-3 shrink-0" aria-label="Swish Assistant home">
            <img src={SwishLogo} alt="Swish Assistant" className="h-6 md:h-8" />
            <span className="hidden md:block w-px h-6 bg-[color:var(--ch-border-strong)]" />
            <span className="hidden md:flex items-center gap-2">
              <span className="text-[14px] font-semibold tracking-tight text-[color:var(--ch-text)]">Coaches Hub</span>
              <span className="text-[9.5px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-md text-white bg-gradient-to-br from-neutral-800 to-neutral-950 ring-1 ring-white/10 dark:from-white dark:to-neutral-200 dark:text-neutral-900">
                Pro
              </span>
            </span>
          </button>

          <div className="relative flex-1 md:max-w-md md:mx-auto">
            <form onSubmit={handleSubmitSearch} className="flex items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ch-muted)] pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search leagues, teams, players"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ch-input w-full pl-9 pr-3 h-9 text-[13px]"
                />
              </div>
            </form>

            {suggestions.length > 0 && (
              <ul className="absolute z-50 mt-2 w-full ch-card shadow-[var(--ch-shadow-lg)] p-1.5 max-h-80 overflow-y-auto">
                {suggestions.map((item: SearchSuggestion, index: number) => (
                  <li
                    key={index}
                    onClick={() => handleSelectSearch(item)}
                    className="px-2.5 py-2 cursor-pointer rounded-lg hover:bg-[color:var(--ch-surface-3)] text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {item.type === 'league' || item.type === 'competition' ? (
                        item.logo_url ? (
                          <div className="h-8 w-8 rounded-lg bg-white ring-1 ring-black/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                            <img src={item.logo_url} alt={item.name} className="h-6 w-6 object-contain" />
                          </div>
                        ) : (
                          <div className="h-8 w-8 rounded-lg ch-tile flex items-center justify-center flex-shrink-0">
                            <Trophy className="h-4 w-4 text-[color:var(--ch-text-2)]" />
                          </div>
                        )
                      ) : item.type === 'team' ? (
                        <div className="h-8 w-8 rounded-lg bg-white ring-1 ring-black/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                          <TeamLogo teamName={item.name} leagueId={item.league_id} size="sm" />
                        </div>
                      ) : (
                        <PlayerSearchAvatar name={item.name} photoUrl={item.photo_url} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-[color:var(--ch-text)] text-[13px] truncate">{item.name}</div>
                        {item.type === 'player' && (
                          <div className="text-xs text-[color:var(--ch-muted)] truncate">{item.team}</div>
                        )}
                        {item.type === 'team' && (
                          <div className="text-xs text-[color:var(--ch-muted)] truncate">{item.league_name}</div>
                        )}
                        {(item.type === 'league' || item.type === 'competition') && (
                          <div className="text-xs text-[color:var(--ch-muted)]">League</div>
                        )}
                      </div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)] bg-[color:var(--ch-surface-3)] px-1.5 py-0.5 rounded flex-shrink-0">
                        {item.type}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <Link
              href="/dashboard"
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-medium text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] hover:bg-[color:var(--ch-surface-3)] transition-colors"
            >
              <LayoutGrid className="w-4 h-4" /> <span className="hidden lg:inline">Dashboard</span>
            </Link>
            <ThemeToggle />
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 md:px-3 rounded-lg text-[13px] font-medium text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] hover:bg-[color:var(--ch-surface-3)] transition-colors whitespace-nowrap disabled:opacity-50"
              data-testid="button-logout"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden lg:inline">{logoutMutation.isPending ? "Signing out…" : "Log out"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 md:px-8 pt-5 md:pt-8 pb-28">
        {/* A coach's own team, once resolved, gets a persistent branded
            banner instead of the generic title — visible above every tab,
            not just Overview, so it reads as "this is my team's hub" rather
            than a stat card that scrolls away. League owners (no single
            team) keep a league-level hero. */}
        {isCoach && myTeam ? (
          <CoachTeamBanner
            team={myTeam}
            leagueId={selectedLeague?.league_id}
            leagueName={selectedLeague?.name}
            standing={myStanding}
            standingsCount={standings.length}
            fallbackColor={readableBrand}
            onViewTeam={() => setDetailView({ type: 'team', team: myTeam })}
          />
        ) : isCoach && statsLoading ? (
          <div className="ch-card h-[196px] md:h-[236px] mb-5 md:mb-6 overflow-hidden">
            <div className="ch-skel w-full h-full rounded-none" />
          </div>
        ) : (
          <section
            className="ch-hero text-white mb-5 md:mb-6 ch-rise"
            style={{ background: `radial-gradient(90% 160% at 0% 0%, ${brandColor} 0%, color-mix(in srgb, ${brandColor} 45%, transparent) 40%, transparent 75%), #0b0e13` }}
          >
            <div className="relative px-5 py-6 md:px-8 md:py-8 flex items-center gap-4 md:gap-5">
              {selectedLeague?.logo_url ? (
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white ring-1 ring-black/5 flex items-center justify-center overflow-hidden shrink-0 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]">
                  <img src={selectedLeague.logo_url} alt="" className="w-11 h-11 md:w-12 md:h-12 object-contain" />
                </div>
              ) : (
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                  <Target className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.14em] text-white/65">
                  Coaches Hub{selectedLeague ? ` · ${selectedLeague.name}` : ''}
                </div>
                <h1 className="ch-display uppercase font-bold leading-[0.95] text-[2rem] md:text-[3rem] tracking-tight mt-1">
                  {selectedLeague ? 'League intelligence' : 'Coaches Hub'}
                </h1>
                <p className="text-[13px] md:text-sm text-white/70 mt-1.5">Analyze performance, track trends, and build scouting reports.</p>
              </div>
            </div>
          </section>
        )}

        {/* Shortcuts — top public leagues, for fast navigation while no
            league is selected yet (whether or not the coach has their own). */}
        {!selectedLeague && (
          <div className="ch-card p-5 md:p-6 mb-5 md:mb-6">
            <div className="flex items-end justify-between gap-3 mb-4">
              <div>
                <div className="ch-eyebrow flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Shortcuts
                </div>
                <p className="text-[13px] text-[color:var(--ch-text-2)]">
                  Top leagues on Swish Assistant — jump straight in to scout, compare, or explore.
                </p>
              </div>
            </div>

            {topLeaguesLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="ch-skel h-[108px]" />)}
              </div>
            ) : topLeaguesError ? (
              <p className="text-sm text-[color:var(--ch-muted)] py-2">League suggestions are temporarily unavailable.</p>
            ) : topLeagues.length === 0 ? (
              <p className="text-sm text-[color:var(--ch-muted)] py-2">No featured leagues right now.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {topLeagues.map((lg) => (
                  <button
                    key={lg.competition.competition_id ?? lg.competition.league_id}
                    type="button"
                    onClick={() => setSelectedLeague(lg.competition)}
                    className="group ch-tile ch-hover flex flex-col items-center gap-2.5 p-4 text-center hover:-translate-y-0.5"
                  >
                    {lg.logoUrl ? (
                      <div className="h-12 w-12 rounded-xl bg-white ring-1 ring-black/5 flex items-center justify-center overflow-hidden">
                        <img src={lg.logoUrl} alt="" className="h-9 w-9 object-contain" />
                      </div>
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-[color:var(--ch-surface-3)] flex items-center justify-center">
                        <Trophy className="h-5 w-5 text-[color:var(--ch-text-2)]" />
                      </div>
                    )}
                    <span className="text-[12.5px] font-medium text-[color:var(--ch-text)] line-clamp-2 leading-snug">
                      {lg.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {leagues.length === 0 ? (
          <div className="ch-card p-10 md:p-14 text-center">
            <div className="w-14 h-14 rounded-2xl ch-tile flex items-center justify-center mx-auto mb-5">
              <Users className="w-6 h-6 text-[color:var(--ch-text-2)]" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ch-text)] mb-2">No Leagues Found</h2>
            <p className="text-sm text-[color:var(--ch-text-2)] mb-6 max-w-sm mx-auto">
              You need to create or manage a league to access coaching insights.
            </p>
            <Link href="/league-admin" className="ch-btn ch-btn-primary h-10 px-5">
              <Award className="w-4 h-4" />
              Create League
            </Link>
          </div>
        ) : !selectedLeague ? (
          /* League chooser — full search card until one's picked; once
             picked it collapses to the switcher in the section bar. */
          <div className="ch-card p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">Select league</h3>
              <div className="text-[12px] text-[color:var(--ch-muted)] ch-num">{leagues.length} available</div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ch-muted)]" />
              <input
                type="text"
                placeholder="Search for a league to analyze…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="ch-input w-full pl-10 pr-4 h-11 text-sm"
              />

              {searchQuery && filteredLeagues.length > 0 && (
                <div className="absolute z-10 w-full mt-2 ch-card shadow-[var(--ch-shadow-lg)] p-1.5 max-h-60 overflow-y-auto">
                  {filteredLeagues.map((league) => (
                    <button
                      key={league.league_id}
                      onClick={() => { setSelectedLeague(league); setSearchQuery(''); }}
                      className="w-full text-left px-3 py-2 text-sm text-[color:var(--ch-text)] rounded-md hover:bg-[color:var(--ch-surface-3)] focus:outline-none focus:bg-[color:var(--ch-surface-3)]"
                    >
                      <div className="font-medium">{league.name}</div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery && filteredLeagues.length === 0 && (
                <div className="absolute z-10 w-full mt-2 ch-card p-3 text-sm text-[color:var(--ch-muted)]">
                  No leagues found matching "{searchQuery}"
                </div>
              )}
            </div>

            {leagues.length <= 5 && (
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="text-xs text-[color:var(--ch-muted)] mr-1">Quick select</span>
                {leagues.map((league) => (
                  <button
                    key={league.league_id}
                    onClick={() => setSelectedLeague(league)}
                    className="ch-chip px-3 py-1.5 text-[13px]"
                  >
                    {league.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Section bar, grouped by job — "Stats" to look something up,
                "Build" to make something — with the league switcher on the
                right. Sticks under the header so switching never needs a
                scroll back up. */}
            {/* On phones the switcher sits above the bar and scrolls away, so
                only the tabs stay pinned — keeps the sticky strip to one row. */}
            <div className="md:hidden mb-2">{leagueSwitcher}</div>
            <div className="ch-glass sticky top-14 md:top-16 z-40 -mx-4 md:-mx-8 px-4 md:px-8 mb-5 md:mb-6 border-b border-[color:var(--ch-border)]">
              <div className="flex items-center md:gap-3">
                <nav className="flex-1 min-w-0 flex items-stretch gap-4 md:gap-6 overflow-x-auto scrollbar-hide" aria-label="Coaches Hub sections">
                  {tabGroups.map((g, gi) => (
                    <div key={g.group} className="flex items-stretch gap-1 shrink-0">
                      {gi > 0 && <span className="self-center w-px h-5 bg-[color:var(--ch-border-strong)] mr-3 md:mr-5" />}
                      <span className="hidden lg:flex items-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ch-muted)] mr-2">
                        {g.group}
                      </span>
                      {g.tabs.map((tab) => {
                        const active = activeTab === tab.id && !detailView;
                        const selected = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={(e) => {
                              setActiveTab(tab.id);
                              setDetailView(null);
                              // Phones: bring the chosen tab fully into the scrolling strip.
                              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                            }}
                            aria-current={selected ? 'page' : undefined}
                            className={`relative flex items-center gap-2 h-12 md:h-[52px] px-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                              selected ? 'text-[color:var(--ch-text)]' : 'text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]'
                            }`}
                          >
                            <tab.icon className="w-4 h-4" style={selected ? { color: readableBrand } : undefined} />
                            {tab.label}
                            <span
                              className="absolute left-1.5 right-1.5 -bottom-px h-[2px] rounded-full transition-opacity"
                              style={{ backgroundColor: readableBrand, opacity: active ? 1 : selected ? 0.35 : 0 }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </nav>
                <div className="hidden md:block">{leagueSwitcher}</div>
              </div>
            </div>

            <div key={detailView ? `detail-${detailView.type}` : activeTab} className="ch-rise">
              {/* Drill-in from a Rankings/roster row takes over the content
                  area regardless of which tab is active; the tab strip
                  above still works to back out of it. */}
              {detailView ? (
                detailView.type === 'matchReport' ? (
                  <MatchReport
                    gameKey={detailView.gameKey}
                    leagueId={selectedLeague.league_id}
                    teamName={myTeam?.team_name || coachTeamName || ''}
                    brandColor={readableBrand}
                    onBack={() => setDetailView(null)}
                  />
                ) : detailView.type === 'scoutReport' ? (
                  <OpponentScoutReport
                    opponentName={detailView.opponentName}
                    leagueId={selectedLeague.league_id}
                    myTeamName={myTeam?.team_name || coachTeamName || ''}
                    standings={standings}
                    teamSeasonAverages={teamSeasonAverages}
                    playerSeasonAverages={playerSeasonAverages}
                    brandColor={readableBrand}
                    onBack={() => setDetailView(null)}
                  />
                ) : detailView.type === 'player' ? (
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
                    myTeam ? (
                      /* The persistent CoachTeamBanner above already covers
                         "here's my team" (logo, record, rank) — Overview
                         picks up straight from next/last game and trends. */
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
                        onOpenMatchReport={(gameKey) => setDetailView({ type: 'matchReport', gameKey })}
                        onOpenScoutReport={(opponentName) => setDetailView({ type: 'scoutReport', opponentName })}
                        aside={quickActions}
                      >
                        {seasonPanels}
                      </CoachTeamOverview>
                    ) : (
                      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-5">
                        <div className="xl:col-span-2 space-y-4 md:space-y-5 min-w-0">{seasonPanels}</div>
                        <aside className="min-w-0">{quickActions}</aside>
                      </div>
                    )
                  )}

                  {/* Rankings */}
                  {activeTab === 'rankings' && (
                    <div>
                      {tabIntro('01', 'Rankings', `Season averages across ${teamSeasonAverages.length} teams and ${playerSeasonAverages.length} players, updated as new stats are uploaded.`)}
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
                      {tabIntro('01', 'Lineups', 'Five-man units by net rating, plus-minus and minutes together.')}
                      <AdvancedInsights leagueId={selectedLeague.league_id} teamId={isCoach ? coachTeamId ?? undefined : undefined} showHeading={false} />
                    </div>
                  )}

                  {/* Compare: your recent form against an opponent's */}
                  {activeTab === 'compare' && myTeam && (
                    <FormComparison
                      leagueId={selectedLeague.league_id}
                      myTeamId={myTeam.team_id}
                      myTeamName={myTeam.team_name}
                      standings={standings}
                      gameResults={leagueGameResults}
                      nextOpponentName={
                        nextGame ? (nextGame.home_team_id === myTeam.team_id ? nextGame.awayteam : nextGame.hometeam) : null
                      }
                      brandColor={readableBrand}
                    />
                  )}

                  {/* Trends */}
                  {activeTab === 'trends' && (
                    <div>
                      {tabIntro('01', 'Performance trends', 'How every team’s output has moved game to game this season.')}
                      {teamGameLog.length > 0 ? (
                        <TeamPerformanceTrends teamGameLog={teamGameLog} leagueId={selectedLeague.league_id} showHeading={false} />
                      ) : (
                        emptyState(BarChart3, 'No Player Data Found', 'Upload player statistics for this league to see performance trends.')
                      )}
                    </div>
                  )}

                  {/* Scouting Reports */}
                  {activeTab === 'scouting' && (
                    <div className="ch-card overflow-hidden">
                      <div className="flex flex-col md:flex-row md:items-center justify-between px-5 py-4 md:px-6 border-b border-[color:var(--ch-border)] gap-2 md:gap-0">
                        <SectionKicker n="01" label="Scouting reports" color={readableBrand} className="" />
                        <span className="text-[11px] font-medium text-[color:var(--ch-muted)] ch-tile px-2 py-1 rounded-md self-start md:self-auto">Mobile-optimized A4 editor</span>
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
          </>
        )}
      </main>

      {/* League Assistant — floating launcher that slides a panel open, always reachable regardless of which section tab is active */}
      {selectedLeague && (
        <>
          <button
            onClick={() => setIsAssistantOpen(true)}
            className={`fixed right-4 md:right-6 z-40 flex items-center gap-2 h-12 pl-3.5 pr-4 md:pr-5 rounded-full bg-[color:var(--ch-text)] text-[color:var(--ch-surface)] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.45)] ring-1 ring-white/10 hover:scale-[1.03] active:scale-[0.99] transition-transform ${
              activeTab === 'scouting' && !detailView ? 'bottom-24 md:bottom-6' : 'bottom-5 md:bottom-6'
            }`}
            aria-label="Open League Assistant"
          >
            <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: readableBrand }}>
              <Sparkles className="w-4 h-4 text-white" />
            </span>
            <span className="text-[13px] font-semibold hidden sm:inline">League Assistant</span>
          </button>

          {isAssistantOpen && (
            <div className="fixed inset-0 z-50">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[ch-fade_.2s_ease-out]" onClick={() => setIsAssistantOpen(false)} />
              <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[460px] flex flex-col bg-[color:var(--ch-bg)] border-l border-[color:var(--ch-border)] shadow-2xl animate-[ch-slide_.28s_cubic-bezier(.2,.7,.2,1)]">
                {/* LeagueChatbot's own panel-mode header already shows the icon/title,
                    so this just adds a close button above it rather than a second header. */}
                <div className="flex items-center justify-between px-4 h-12 border-b border-[color:var(--ch-border)] shrink-0">
                  <span className="ch-eyebrow flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: readableBrand }} /> {selectedLeague.name}
                  </span>
                  <button
                    onClick={() => setIsAssistantOpen(false)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] hover:bg-[color:var(--ch-surface-3)] transition-colors"
                    aria-label="Close League Assistant"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden p-2">
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
