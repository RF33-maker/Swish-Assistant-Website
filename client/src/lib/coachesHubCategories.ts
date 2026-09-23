import type { PlayerSeasonAverage, TeamSeasonAverage } from '@/pages/CoachesHub';

// Shared category/leaderboard definitions for Coaches Hub — used by the
// Rankings table (FullRankings.tsx) and by the player/team percentile bars
// (PlayerDetail.tsx / TeamDetail.tsx) so both read the exact same formulas
// rather than two copies drifting apart.

export type Entity = 'players' | 'teams';
export type ValueMode = 'averages' | 'totals';
export type CategoryGroup = 'Traditional' | 'Advanced';

// Same minimum-attempt floors as the public league leaders page, so a single
// hot shot doesn't top a percentage leaderboard on a tiny sample.
export const MIN_FGA = 12;
export const MIN_3PA = 6;
export const MIN_FTA = 8;

export interface CategoryDef {
  key: string;
  label: string;
  unit: string;
  group: CategoryGroup;
  isPercent?: boolean;
  /** Ranked ascending instead of descending — e.g. turnovers, opponent-favouring rates. */
  lowerIsBetter?: boolean;
  playerValue: (p: PlayerSeasonAverage, mode: ValueMode) => number | null;
  playerEligible?: (p: PlayerSeasonAverage) => boolean;
  playerMinLabel?: string;
  teamValue: (t: TeamSeasonAverage) => number | null;
}

export const TRADITIONAL_CATEGORIES: CategoryDef[] = [
  {
    key: 'points', label: 'Points', unit: 'PTS', group: 'Traditional',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_pts ?? 0) : (p.total_pts ?? 0),
    teamValue: (t) => t.avg_pts ?? 0,
  },
  {
    key: 'rebounds', label: 'Rebounds', unit: 'REB', group: 'Traditional',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_reb ?? 0) : (p.total_reb ?? 0),
    teamValue: (t) => t.avg_reb ?? 0,
  },
  {
    key: 'assists', label: 'Assists', unit: 'AST', group: 'Traditional',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_ast ?? 0) : (p.total_ast ?? 0),
    teamValue: (t) => t.avg_ast ?? 0,
  },
  {
    key: 'steals', label: 'Steals', unit: 'STL', group: 'Traditional',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_stl ?? 0) : (p.total_stl ?? 0),
    teamValue: (t) => t.avg_stl ?? 0,
  },
  {
    key: 'blocks', label: 'Blocks', unit: 'BLK', group: 'Traditional',
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_blk ?? 0) : (p.total_blk ?? 0),
    teamValue: (t) => t.avg_blk ?? 0,
  },
  {
    key: 'turnovers', label: 'Turnovers', unit: 'TOV', group: 'Traditional', lowerIsBetter: true,
    playerValue: (p, mode) => mode === 'averages' ? (p.avg_tov ?? 0) : (p.total_tov ?? 0),
    teamValue: (t) => t.avg_tov ?? 0,
  },
  {
    key: 'fg_pct', label: 'FG%', unit: '%', group: 'Traditional', isPercent: true,
    playerValue: (p) => p.season_fg_pct ?? 0,
    playerEligible: (p) => (p.total_fga ?? 0) >= MIN_FGA,
    playerMinLabel: `Min. ${MIN_FGA} FGA`,
    teamValue: (t) => t.season_fg_pct ?? 0,
  },
  {
    key: 'tp_pct', label: '3P%', unit: '%', group: 'Traditional', isPercent: true,
    playerValue: (p) => p.season_tp_pct ?? 0,
    playerEligible: (p) => (p.total_tpa ?? 0) >= MIN_3PA,
    playerMinLabel: `Min. ${MIN_3PA} 3PA`,
    teamValue: (t) => t.season_tp_pct ?? 0,
  },
  {
    key: 'ft_pct', label: 'FT%', unit: '%', group: 'Traditional', isPercent: true,
    playerValue: (p) => p.season_ft_pct ?? 0,
    playerEligible: (p) => (p.total_fta ?? 0) >= MIN_FTA,
    playerMinLabel: `Min. ${MIN_FTA} FTA`,
    teamValue: (t) => t.season_ft_pct ?? 0,
  },
];

// Same shape as the public League Leaders page's advanced sections
// (client/src/lib/advancedStats.ts) — reusing that already-proven formula
// set rather than a second one, just surfaced here per-team as well as
// per-player, and gated behind Coaches Hub instead of the public site.
export const minGames = (n: number) => (p: PlayerSeasonAverage) => p.games_played >= n;

export const ADVANCED_CATEGORIES: CategoryDef[] = [
  {
    key: 'efg_pct', label: 'eFG%', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.efg_pct,
    playerEligible: (p) => (p.total_fga ?? 0) >= MIN_FGA,
    playerMinLabel: `Min. ${MIN_FGA} FGA`,
    teamValue: (t) => t.advanced?.efg_pct ?? null,
  },
  {
    key: 'ts_pct', label: 'TS%', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.ts_pct,
    playerEligible: (p) => (p.total_fga ?? 0) >= MIN_FGA,
    playerMinLabel: `Min. ${MIN_FGA} FGA`,
    teamValue: (t) => t.advanced?.ts_pct ?? null,
  },
  {
    key: 'usg_pct', label: 'Usage %', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.usg_pct,
    playerEligible: minGames(2),
    teamValue: () => null,
  },
  {
    key: 'off_rtg', label: 'Off Rating', unit: 'RTG', group: 'Advanced',
    playerValue: (p) => p.advanced.off_rtg,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.off_rtg ?? null,
  },
  {
    key: 'def_rtg', label: 'Def Rating', unit: 'RTG', group: 'Advanced', lowerIsBetter: true,
    playerValue: (p) => p.advanced.def_rtg,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.def_rtg ?? null,
  },
  {
    key: 'net_rtg', label: 'Net Rating', unit: 'RTG', group: 'Advanced',
    playerValue: (p) => p.advanced.net_rtg,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.net_rtg ?? null,
  },
  {
    key: 'pace', label: 'Pace', unit: 'POSS', group: 'Advanced',
    playerValue: () => null,
    teamValue: (t) => t.advanced?.pace ?? null,
  },
  {
    key: 'pie', label: 'PIE', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pie,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pie ?? null,
  },
  {
    key: 'ast_pct', label: 'Assist %', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.ast_pct,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.ast_pct ?? null,
  },
  {
    key: 'oreb_pct', label: 'OREB %', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.oreb_pct,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.oreb_pct ?? null,
  },
  {
    key: 'dreb_pct', label: 'DREB %', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.dreb_pct,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.dreb_pct ?? null,
  },
  {
    key: 'reb_pct', label: 'REB %', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.reb_pct,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.reb_pct ?? null,
  },
  {
    key: 'tov_pct', label: 'TOV %', unit: '%', group: 'Advanced', isPercent: true, lowerIsBetter: true,
    playerValue: (p) => p.advanced.tov_pct,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.tov_pct ?? null,
  },
  {
    key: 'pts_pct_2pt', label: '%PTS 2PT', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_2pt,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_2pt ?? null,
  },
  {
    key: 'pts_pct_3pt', label: '%PTS 3PT', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_3pt,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_3pt ?? null,
  },
  {
    key: 'pts_pct_ft', label: '%PTS FT', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_ft,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_ft ?? null,
  },
  {
    key: 'pts_pct_midrange', label: '%PTS Midrange', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_midrange,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_midrange ?? null,
  },
  {
    key: 'pts_pct_pitp', label: '%PTS Paint', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_pitp,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_pitp ?? null,
  },
  {
    key: 'pts_pct_fastbreak', label: '%PTS Fast Break', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_fastbreak,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_fastbreak ?? null,
  },
  {
    key: 'pts_pct_2nd_chance', label: '%PTS 2nd Chance', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_2nd_chance,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_2nd_chance ?? null,
  },
  {
    key: 'pts_pct_off_to', label: '%PTS Off TOs', unit: '%', group: 'Advanced', isPercent: true,
    playerValue: (p) => p.advanced.pts_pct_off_to,
    playerEligible: minGames(2),
    teamValue: (t) => t.advanced?.pts_pct_off_to ?? null,
  },
];

export const CATEGORIES: CategoryDef[] = [...TRADITIONAL_CATEGORIES, ...ADVANCED_CATEGORIES];

export function getCategory(key: string): CategoryDef {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[0];
}

/**
 * Percentile rank of `value` within `pool`, 0-100, mid-rank on ties (so a
 * three-way tie at the top all read the same sensible number instead of one
 * of them getting 100th by array-order luck). `lowerIsBetter` flips the
 * direction for stats like turnovers/def rating where a smaller number is
 * the good outcome.
 */
export function percentileOf(value: number, pool: number[], lowerIsBetter?: boolean): number {
  if (pool.length <= 1) return 100;
  // "beats" = my value is the better outcome than this pool value.
  const beats = (v: number) => (lowerIsBetter ? value < v : value > v);
  let below = 0;
  let equal = 0;
  for (const v of pool) {
    if (v === value) equal++;
    else if (beats(v)) below++;
  }
  const rank = below + equal / 2;
  return Math.round((rank / pool.length) * 100);
}

/** A single percentile-bar row's resolved data, ready to render. */
export interface PercentileRow {
  key: string;
  label: string;
  value: number;
  percentile: number;
  display: string;
}

/**
 * Resolves one category into a percentile row for a player, against the
 * full (eligible) player pool for that category. Returns null when the
 * player has no value for this category (e.g. not enough attempts/games).
 */
export function playerPercentileRow(category: CategoryDef, player: PlayerSeasonAverage, allPlayers: PlayerSeasonAverage[]): PercentileRow | null {
  const value = category.playerValue(player, 'averages');
  if (value === null) return null;
  const eligible = category.playerEligible ? allPlayers.filter(category.playerEligible) : allPlayers;
  const pool = eligible
    .map(p => category.playerValue(p, 'averages'))
    .filter((v): v is number => v !== null);
  return {
    key: category.key,
    label: category.label,
    value,
    percentile: percentileOf(value, pool, category.lowerIsBetter),
    display: category.isPercent ? `${value.toFixed(1)}%` : value.toFixed(1),
  };
}

/** Same as playerPercentileRow but for a team against the league's teams. */
export function teamPercentileRow(category: CategoryDef, team: TeamSeasonAverage, allTeams: TeamSeasonAverage[]): PercentileRow | null {
  const value = category.teamValue(team);
  if (value === null) return null;
  const pool = allTeams
    .map(t => category.teamValue(t))
    .filter((v): v is number => v !== null);
  return {
    key: category.key,
    label: category.label,
    value,
    percentile: percentileOf(value, pool, category.lowerIsBetter),
    display: category.isPercent ? `${value.toFixed(1)}%` : value.toFixed(1),
  };
}
