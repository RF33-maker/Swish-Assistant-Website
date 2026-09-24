import { useEffect, useMemo, useState } from 'react';
import { LineChart, Users2, Activity, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Props {
  leagueId: string;
  /** When set, every section is scoped to this team only (lineups, plus-minus, minutes) instead of the whole league. */
  teamId?: string;
  /** False hides the built-in heading — for call sites (Coaches Hub's Lineups tab) that already show their own section title above this. */
  showHeading?: boolean;
}

interface LineupRow {
  lineup_key: string;
  team_id: string | null;
  lineup_names: string[] | null;
  points_for: number | null;
  points_against: number | null;
  possessions_for: number | null;
  possessions_against: number | null;
  fg2_made: number | null;
  fg2_attempted: number | null;
  fg3_made: number | null;
  fg3_attempted: number | null;
  ft_made: number | null;
  ft_attempted: number | null;
  oreb: number | null;
  dreb: number | null;
  assists: number | null;
  turnovers: number | null;
  steals: number | null;
  blocks: number | null;
}

interface OnCourtRow {
  player_id: string;
  player_name: string | null;
  team_id: string | null;
  points_for: number | null;
  points_against: number | null;
}

interface MinutesRow {
  player_id: string;
  seconds_on_court: number | null;
}

type TimeRange = 'season' | 'last5' | 'last3';

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: 'season', label: 'Full Season' },
  { key: 'last5', label: 'Last 5 Games' },
  { key: 'last3', label: 'Last 3 Games' },
];

interface LineupAgg {
  lineupKey: string;
  players: string[];
  pointsFor: number;
  pointsAgainst: number;
  possessionsFor: number;
  possessionsAgainst: number;
  fg2Made: number;
  fg2Attempted: number;
  fg3Made: number;
  fg3Attempted: number;
  ftMade: number;
  ftAttempted: number;
  oreb: number;
  dreb: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  stints: number;
}

function per100(value: number, possessions: number): number {
  return possessions > 0 ? (value / possessions) * 100 : 0;
}

function netRatingOf(l: LineupAgg): number {
  if (l.possessionsFor > 0 && l.possessionsAgainst > 0) {
    return per100(l.pointsFor, l.possessionsFor) - per100(l.pointsAgainst, l.possessionsAgainst);
  }
  return l.pointsFor - l.pointsAgainst;
}

// Percentage categories need their own minimum sample (attempts), separate
// from MIN_LINEUP_POSSESSIONS below — a lineup that's only taken one 3 and
// made it would otherwise top the 3PT% list at "100%".
const MIN_FGA_FOR_PCT = 10;
const MIN_3PA_FOR_PCT = 5;
const MIN_FTA_FOR_PCT = 5;

interface LineupCategoryDef {
  key: string;
  label: string;
  isPercent?: boolean;
  /** Per-100-possessions rate stats (rebounds, assists, etc.) vs. ratings (net/off/def), which already are a per-100 basis but read as a single number, not "X/100". */
  isRate?: boolean;
  lowerIsBetter?: boolean;
  qualifies: (l: LineupAgg) => boolean;
  value: (l: LineupAgg) => number;
}

const LINEUP_CATEGORIES: LineupCategoryDef[] = [
  { key: 'net', label: 'Net Rating', qualifies: () => true, value: netRatingOf },
  { key: 'off', label: 'Off Rating', qualifies: () => true, value: (l) => per100(l.pointsFor, l.possessionsFor) },
  { key: 'def', label: 'Def Rating', lowerIsBetter: true, qualifies: () => true, value: (l) => per100(l.pointsAgainst, l.possessionsAgainst) },
  {
    key: 'fg_pct', label: 'FG%', isPercent: true,
    qualifies: (l) => (l.fg2Attempted + l.fg3Attempted) >= MIN_FGA_FOR_PCT,
    value: (l) => (l.fg2Attempted + l.fg3Attempted) > 0 ? ((l.fg2Made + l.fg3Made) / (l.fg2Attempted + l.fg3Attempted)) * 100 : 0,
  },
  {
    key: 'efg_pct', label: 'eFG%', isPercent: true,
    qualifies: (l) => (l.fg2Attempted + l.fg3Attempted) >= MIN_FGA_FOR_PCT,
    value: (l) => (l.fg2Attempted + l.fg3Attempted) > 0 ? ((l.fg2Made + l.fg3Made + 0.5 * l.fg3Made) / (l.fg2Attempted + l.fg3Attempted)) * 100 : 0,
  },
  {
    key: 'tp_pct', label: '3PT%', isPercent: true,
    qualifies: (l) => l.fg3Attempted >= MIN_3PA_FOR_PCT,
    value: (l) => l.fg3Attempted > 0 ? (l.fg3Made / l.fg3Attempted) * 100 : 0,
  },
  {
    key: 'ft_pct', label: 'FT%', isPercent: true,
    qualifies: (l) => l.ftAttempted >= MIN_FTA_FOR_PCT,
    value: (l) => l.ftAttempted > 0 ? (l.ftMade / l.ftAttempted) * 100 : 0,
  },
  { key: 'reb', label: 'Rebounds', isRate: true, qualifies: () => true, value: (l) => per100(l.oreb + l.dreb, l.possessionsFor + l.possessionsAgainst) },
  { key: 'ast', label: 'Assists', isRate: true, qualifies: () => true, value: (l) => per100(l.assists, l.possessionsFor) },
  { key: 'tov', label: 'Turnovers', isRate: true, lowerIsBetter: true, qualifies: () => true, value: (l) => per100(l.turnovers, l.possessionsFor) },
  { key: 'stl', label: 'Steals', isRate: true, qualifies: () => true, value: (l) => per100(l.steals, l.possessionsAgainst) },
  { key: 'blk', label: 'Blocks', isRate: true, qualifies: () => true, value: (l) => per100(l.blocks, l.possessionsAgainst) },
];

function formatLineupValue(cat: LineupCategoryDef, value: number): string {
  if (cat.isPercent) return `${value.toFixed(1)}%`;
  // Only Net Rating is a genuine +/- differential — Off/Def Rating and the
  // per-100 rate stats are plain (always-positive-ish) numbers.
  if (cat.key === 'net') return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
  return value.toFixed(1);
}

interface PlayerPlusMinus {
  playerId: string;
  name: string;
  plusMinus: number;
  stints: number;
}

interface PlayerMinutes {
  playerId: string;
  name: string;
  minutes: number;
}

// Minimum sample size before a lineup/player is considered — small-sample stints
// (e.g. one late-game substitution) produce wildly noisy net ratings otherwise.
const MIN_LINEUP_POSSESSIONS = 10;
const MIN_PLAYER_STINTS = 3;

export default function AdvancedInsights({ leagueId, teamId, showHeading = true }: Props) {
  const [loading, setLoading] = useState(true);
  const [lineups, setLineups] = useState<LineupAgg[]>([]);
  const [lineupCategoryKey, setLineupCategoryKey] = useState(LINEUP_CATEGORIES[0].key);
  const [timeRange, setTimeRange] = useState<TimeRange>('season');
  const [noRecentGames, setNoRecentGames] = useState(false);
  const [plusMinusLeaders, setPlusMinusLeaders] = useState<PlayerPlusMinus[]>([]);
  const [minutesLeaders, setMinutesLeaders] = useState<PlayerMinutes[]>([]);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setNoRecentGames(false);

      // Resolve which games count as "recent" first, when a time range other
      // than the full season is selected — everything below then filters to
      // just those game_keys. Scoped to this team's own games when teamId is
      // set, otherwise the league's games overall.
      let recentGameKeys: string[] | null = null;
      if (timeRange !== 'season') {
        let gamesQuery = supabase
          .from('game_schedule')
          .select('game_key, matchtime, home_team_id, away_team_id')
          .eq('league_id', leagueId)
          .not('matchtime', 'is', null)
          .lte('matchtime', new Date().toISOString())
          .order('matchtime', { ascending: false });
        const { data: games } = await gamesQuery;
        if (cancelled) return;
        const relevant = teamId
          ? (games || []).filter(g => g.home_team_id === teamId || g.away_team_id === teamId)
          : (games || []);
        const n = timeRange === 'last3' ? 3 : 5;
        recentGameKeys = relevant.slice(0, n).map(g => g.game_key).filter((k): k is string => !!k);
        if (recentGameKeys.length === 0) {
          setLineups([]);
          setPlusMinusLeaders([]);
          setMinutesLeaders([]);
          setNoRecentGames(true);
          setLoading(false);
          return;
        }
      }

      let lineupQuery = supabase
        .from('lineup_stints')
        .select('lineup_key, team_id, lineup_names, points_for, points_against, possessions_for, possessions_against, fg2_made, fg2_attempted, fg3_made, fg3_attempted, ft_made, ft_attempted, oreb, dreb, assists, turnovers, steals, blocks')
        .eq('league_id', leagueId)
        .eq('is_valid_lineup', true);
      let onCourtQuery = supabase
        .from('player_on_court_stints')
        .select('player_id, player_name, team_id, points_for, points_against')
        .eq('league_id', leagueId);
      let minutesQuery = supabase
        .from('player_lineup_stints_v1')
        .select('player_id, seconds_on_court')
        .eq('league_id', leagueId);
      if (teamId) {
        lineupQuery = lineupQuery.eq('team_id', teamId);
        onCourtQuery = onCourtQuery.eq('team_id', teamId);
        minutesQuery = minutesQuery.eq('team_id', teamId);
      }
      if (recentGameKeys) {
        lineupQuery = lineupQuery.in('game_key', recentGameKeys);
        onCourtQuery = onCourtQuery.in('game_key', recentGameKeys);
        minutesQuery = minutesQuery.in('game_key', recentGameKeys);
      }

      const [lineupRes, onCourtRes, minutesRes] = await Promise.all([lineupQuery, onCourtQuery, minutesQuery]);

      if (cancelled) return;

      // ── Lineups: aggregate stints sharing the same 5-man lineup ──────────
      const lineupMap = new Map<string, LineupAgg>();
      ((lineupRes.data || []) as LineupRow[]).forEach(row => {
        if (!row.lineup_key) return;
        const existing = lineupMap.get(row.lineup_key);
        if (existing) {
          existing.pointsFor += row.points_for ?? 0;
          existing.pointsAgainst += row.points_against ?? 0;
          existing.possessionsFor += row.possessions_for ?? 0;
          existing.possessionsAgainst += row.possessions_against ?? 0;
          existing.fg2Made += row.fg2_made ?? 0;
          existing.fg2Attempted += row.fg2_attempted ?? 0;
          existing.fg3Made += row.fg3_made ?? 0;
          existing.fg3Attempted += row.fg3_attempted ?? 0;
          existing.ftMade += row.ft_made ?? 0;
          existing.ftAttempted += row.ft_attempted ?? 0;
          existing.oreb += row.oreb ?? 0;
          existing.dreb += row.dreb ?? 0;
          existing.assists += row.assists ?? 0;
          existing.turnovers += row.turnovers ?? 0;
          existing.steals += row.steals ?? 0;
          existing.blocks += row.blocks ?? 0;
          existing.stints += 1;
        } else {
          lineupMap.set(row.lineup_key, {
            lineupKey: row.lineup_key,
            players: row.lineup_names || [],
            pointsFor: row.points_for ?? 0,
            pointsAgainst: row.points_against ?? 0,
            possessionsFor: row.possessions_for ?? 0,
            possessionsAgainst: row.possessions_against ?? 0,
            fg2Made: row.fg2_made ?? 0,
            fg2Attempted: row.fg2_attempted ?? 0,
            fg3Made: row.fg3_made ?? 0,
            fg3Attempted: row.fg3_attempted ?? 0,
            ftMade: row.ft_made ?? 0,
            ftAttempted: row.ft_attempted ?? 0,
            oreb: row.oreb ?? 0,
            dreb: row.dreb ?? 0,
            assists: row.assists ?? 0,
            turnovers: row.turnovers ?? 0,
            steals: row.steals ?? 0,
            blocks: row.blocks ?? 0,
            stints: 1,
          });
        }
      });
      const lineupList = Array.from(lineupMap.values())
        .filter(l => l.possessionsFor >= MIN_LINEUP_POSSESSIONS)
        .sort((a, b) => netRatingOf(b) - netRatingOf(a));

      // ── Plus-minus: aggregate on-court stints per player ──────────────────
      const nameByPlayerId = new Map<string, string>();
      const pmMap = new Map<string, { plusMinus: number; stints: number }>();
      ((onCourtRes.data || []) as OnCourtRow[]).forEach(row => {
        if (!row.player_id) return;
        if (row.player_name) nameByPlayerId.set(row.player_id, row.player_name);
        const existing = pmMap.get(row.player_id) || { plusMinus: 0, stints: 0 };
        existing.plusMinus += (row.points_for ?? 0) - (row.points_against ?? 0);
        existing.stints += 1;
        pmMap.set(row.player_id, existing);
      });
      const plusMinusList = Array.from(pmMap.entries())
        .filter(([, v]) => v.stints >= MIN_PLAYER_STINTS)
        .map(([playerId, v]) => ({
          playerId,
          name: nameByPlayerId.get(playerId) || 'Unknown Player',
          plusMinus: v.plusMinus,
          stints: v.stints,
        }))
        .sort((a, b) => b.plusMinus - a.plusMinus);

      // ── Minutes: total seconds on court per player ─────────────────────
      const secondsMap = new Map<string, number>();
      ((minutesRes.data || []) as MinutesRow[]).forEach(row => {
        if (!row.player_id) return;
        secondsMap.set(row.player_id, (secondsMap.get(row.player_id) || 0) + (row.seconds_on_court ?? 0));
      });
      const minutesList = Array.from(secondsMap.entries())
        .map(([playerId, seconds]) => ({
          playerId,
          name: nameByPlayerId.get(playerId) || 'Unknown Player',
          minutes: seconds / 60,
        }))
        .sort((a, b) => b.minutes - a.minutes);

      setLineups(lineupList);
      setPlusMinusLeaders(plusMinusList);
      setMinutesLeaders(minutesList);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [leagueId, teamId, timeRange]);

  const lineupCategory = LINEUP_CATEGORIES.find(c => c.key === lineupCategoryKey) ?? LINEUP_CATEGORIES[0];
  const rankedLineups = useMemo(() => {
    const eligible = lineups.filter(lineupCategory.qualifies);
    return [...eligible]
      .sort((a, b) => lineupCategory.lowerIsBetter ? lineupCategory.value(a) - lineupCategory.value(b) : lineupCategory.value(b) - lineupCategory.value(a))
      .slice(0, 5);
  }, [lineups, lineupCategory]);

  const hasAnyData = lineups.length > 0 || plusMinusLeaders.length > 0 || minutesLeaders.length > 0;
  const headingText = teamId ? 'Lineups & On-Court Impact' : 'Advanced Insights';
  const scopeText = teamId ? 'this team' : 'this league';

  if (loading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
        {showHeading && (
          <div className="flex items-center gap-3 mb-4">
            <LineChart className="w-5 md:w-6 h-5 md:h-6 text-orange-600 dark:text-orange-400" />
            <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">{headingText}</h2>
          </div>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400">Crunching lineup and on-court data…</p>
      </div>
    );
  }

  const timeRangeSelect = (
    <select
      value={timeRange}
      onChange={(e) => setTimeRange(e.target.value as TimeRange)}
      className="px-3 py-1.5 text-xs md:text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
    >
      {TIME_RANGE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );

  // The time-range filter matched real games, just none this recent — a
  // different message (and still a way back to Full Season) from "no data
  // has been processed for this league/team at all" below.
  if (noRecentGames) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
        {showHeading && (
          <div className="flex items-center gap-3 mb-4">
            <LineChart className="w-5 md:w-6 h-5 md:h-6 text-orange-600 dark:text-orange-400" />
            <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">{headingText}</h2>
          </div>
        )}
        <div className="mb-3">{timeRangeSelect}</div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {teamId ? 'This team hasn’t' : 'This league hasn’t'} played that many games yet — try Full Season instead.
        </p>
      </div>
    );
  }

  if (!hasAnyData) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
        {showHeading && (
          <div className="flex items-center gap-3 mb-2">
            <LineChart className="w-5 md:w-6 h-5 md:h-6 text-orange-600 dark:text-orange-400" />
            <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">{headingText}</h2>
          </div>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No lineup / on-court stint data is available for {scopeText} yet. This section lights up automatically once play-by-play data has been processed for it.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
      {showHeading && (
        <div className="flex items-center gap-3 mb-4 md:mb-6">
          <LineChart className="w-5 md:w-6 h-5 md:h-6 text-orange-600 dark:text-orange-400" />
          <h2 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white">{headingText}</h2>
        </div>
      )}

      {/* Best lineups — by any category, not just net rating */}
      <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700 mb-4 md:mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Users2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Best Lineups
          </h4>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {timeRangeSelect}
          <select
            value={lineupCategoryKey}
            onChange={(e) => setLineupCategoryKey(e.target.value)}
            className="px-3 py-1.5 text-xs md:text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
          >
            {LINEUP_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        {lineups.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Not enough lineup data yet.</p>
        ) : rankedLineups.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No lineup has enough attempts yet to rank by {lineupCategory.label}.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            {rankedLineups.map((l, i) => {
              const value = lineupCategory.value(l);
              return (
                <div key={l.lineupKey} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">#{i + 1}</span>
                    <span className={`font-bold ${lineupCategory.key === 'net' ? (value >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400') : 'text-gray-800 dark:text-white'}`}>
                      {formatLineupValue(lineupCategory, value)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400 truncate" title={l.players.join(', ')}>
                    {l.players.length > 0 ? l.players.join(', ') : 'Unnamed lineup'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Plus-minus leaders */}
        <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-600 dark:text-green-400" />
            Plus-Minus Leaders
          </h4>
          {plusMinusLeaders.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Not enough on-court data yet.</p>
          ) : (
            <div className="space-y-2">
              {plusMinusLeaders.slice(0, 5).map((p, i) => (
                <div key={p.playerId} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                      i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-slate-300 dark:bg-neutral-600'
                    }`}>
                      {i + 1}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                  </div>
                  <span className={`text-sm font-bold ${p.plusMinus >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {p.plusMinus >= 0 ? '+' : ''}{p.plusMinus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Minutes leaders */}
        <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Minutes Leaders
          </h4>
          {minutesLeaders.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Not enough minutes data yet.</p>
          ) : (
            <div className="space-y-2">
              {minutesLeaders.slice(0, 5).map((p, i) => (
                <div key={p.playerId} className="flex items-center justify-between py-1">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{i + 1}. {p.name}</span>
                  <span className="text-sm font-bold text-gray-700 dark:text-neutral-300">{p.minutes.toFixed(0)} min</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-neutral-500 mt-4">
        Lineups need at least {MIN_LINEUP_POSSESSIONS} possessions and players need at least {MIN_PLAYER_STINTS} on-court stints to appear here, to avoid small-sample noise.
      </p>
    </div>
  );
}
