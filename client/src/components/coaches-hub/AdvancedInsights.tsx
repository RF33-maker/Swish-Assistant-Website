import { useEffect, useState } from 'react';
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

interface LineupAgg {
  lineupKey: string;
  players: string[];
  pointsFor: number;
  pointsAgainst: number;
  possessionsFor: number;
  possessionsAgainst: number;
  stints: number;
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
  const [plusMinusLeaders, setPlusMinusLeaders] = useState<PlayerPlusMinus[]>([]);
  const [minutesLeaders, setMinutesLeaders] = useState<PlayerMinutes[]>([]);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      let lineupQuery = supabase
        .from('lineup_stints')
        .select('lineup_key, team_id, lineup_names, points_for, points_against, possessions_for, possessions_against')
        .eq('league_id', leagueId)
        .eq('is_valid_lineup', true);
      let onCourtQuery = supabase
        .from('player_on_court_stints')
        .select('player_id, player_name, team_id, points_for, points_against')
        .eq('league_id', leagueId);
      // player_lineup_stints_v1 (minutes) has no team_id column of its own —
      // minutes are filtered to this team's roster after the fact instead,
      // via the same player ids the (already team-filtered) plus-minus pass finds.
      const minutesQuery = supabase
        .from('player_lineup_stints_v1')
        .select('player_id, seconds_on_court')
        .eq('league_id', leagueId);
      if (teamId) {
        lineupQuery = lineupQuery.eq('team_id', teamId);
        onCourtQuery = onCourtQuery.eq('team_id', teamId);
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
          existing.stints += 1;
        } else {
          lineupMap.set(row.lineup_key, {
            lineupKey: row.lineup_key,
            players: row.lineup_names || [],
            pointsFor: row.points_for ?? 0,
            pointsAgainst: row.points_against ?? 0,
            possessionsFor: row.possessions_for ?? 0,
            possessionsAgainst: row.possessions_against ?? 0,
            stints: 1,
          });
        }
      });
      const lineupList = Array.from(lineupMap.values())
        .filter(l => l.possessionsFor >= MIN_LINEUP_POSSESSIONS)
        .sort((a, b) => netRating(b) - netRating(a));

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
      // player_lineup_stints_v1 has no team_id column, so when scoped to one
      // team, restrict to player ids the (already team-filtered) on-court
      // pass above found for this team's roster.
      const secondsMap = new Map<string, number>();
      ((minutesRes.data || []) as MinutesRow[]).forEach(row => {
        if (!row.player_id) return;
        if (teamId && !nameByPlayerId.has(row.player_id)) return;
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
  }, [leagueId, teamId]);

  function netRating(l: LineupAgg): number {
    if (l.possessionsFor > 0 && l.possessionsAgainst > 0) {
      return (l.pointsFor / l.possessionsFor) * 100 - (l.pointsAgainst / l.possessionsAgainst) * 100;
    }
    return l.pointsFor - l.pointsAgainst;
  }

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Best lineups by net rating */}
        <div className="bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4 rounded-lg border border-gray-200 dark:border-neutral-700">
          <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Users2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Best Lineups (Net Rating)
          </h4>
          {lineups.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Not enough lineup data yet.</p>
          ) : (
            <div className="space-y-3">
              {lineups.slice(0, 5).map((l, i) => (
                <div key={l.lineupKey} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-white">#{i + 1}</span>
                    <span className={`font-bold ${netRating(l) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {netRating(l) >= 0 ? '+' : ''}{netRating(l).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-neutral-400 truncate" title={l.players.join(', ')}>
                    {l.players.length > 0 ? l.players.join(', ') : 'Unnamed lineup'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

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
