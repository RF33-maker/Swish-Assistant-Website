// Centralized advanced-stat formulas for the League Leaders page.
//
// Aggregation matches the per-game pattern already used in
// PlayerComparison.tsx, TeamComparison.tsx, and PlayerProfileContent.tsx
// (sum the per-game advanced value across games and divide by games),
// so leaders match what's shown on profiles and comparisons.
//
// Note: PACE is intentionally NOT included. PACE is a team-level stat
// computed only in TeamComparison.tsx; player_stats rows do not carry
// it, and there is no per-player PACE formula in the existing
// comparison/profile code to mirror.

export interface AdvancedStatRow {
  efg_percent?: number | null;
  ts_percent?: number | null;
  three_point_rate?: number | null;
  ast_percent?: number | null;
  oreb_percent?: number | null;
  dreb_percent?: number | null;
  reb_percent?: number | null;
  tov_percent?: number | null;
  usage_percent?: number | null;
  pie?: number | null;
  off_rating?: number | null;
  def_rating?: number | null;
  net_rating?: number | null;
  pts_percent_2pt?: number | null;
  pts_percent_3pt?: number | null;
  pts_percent_ft?: number | null;
  pts_percent_midrange?: number | null;
  pts_percent_pitp?: number | null;
  pts_percent_fastbreak?: number | null;
  pts_percent_second_chance?: number | null;
  pts_percent_off_turnovers?: number | null;
}

export interface AdvancedAggregator {
  // These traditional totals are already maintained by the page's
  // aggregator; declared here so leader compute() functions can read
  // them without `any` casts.
  games_played: number;
  total_points: number;
  total_rebounds: number;
  total_assists: number;
  total_steals: number;
  total_blocks: number;
  total_turnovers: number;
  total_field_goals_made: number;
  total_field_goals_attempted: number;
  total_three_points_made: number;
  total_three_points_attempted: number;
  total_free_throws_made: number;
  total_free_throws_attempted: number;

  sum_efg_percent: number;
  sum_ts_percent: number;
  sum_three_pt_rate: number;
  sum_ast_percent: number;
  sum_oreb_percent: number;
  sum_dreb_percent: number;
  sum_reb_percent: number;
  sum_tov_percent: number;
  sum_usage_percent: number;
  sum_pie: number;
  sum_off_rating: number;
  sum_def_rating: number;
  sum_net_rating: number;

  sum_pts_2pt: number;
  sum_pts_3pt: number;
  sum_pts_ft: number;
  sum_pts_midrange: number;
  sum_pts_pitp: number;
  sum_pts_fb: number;
  sum_pts_2nd_ch: number;
  sum_pts_off_to: number;

  // Counts of rows where the metric was actually captured (non-null,
  // non-undefined). A legitimate `0` value still counts as captured —
  // important for TOV%/scoring-distribution where 0 is meaningful.
  // Cards hide when the count is 0 across all qualifying players.
  has_efg: number;
  has_ts: number;
  has_three_pt_rate: number;
  has_ast_percent: number;
  has_oreb_percent: number;
  has_dreb_percent: number;
  has_reb_percent: number;
  has_tov_percent: number;
  has_usage_percent: number;
  has_pie: number;
  has_off_rating: number;
  has_def_rating: number;
  has_net_rating: number;
  has_pts_2pt: number;
  has_pts_3pt: number;
  has_pts_ft: number;
  has_pts_midrange: number;
  has_pts_pitp: number;
  has_pts_fb: number;
  has_pts_2nd_ch: number;
  has_pts_off_to: number;
}

type SumKey = Extract<keyof AdvancedAggregator, `sum_${string}`>;
type HasKey = Extract<keyof AdvancedAggregator, `has_${string}`>;

const SUM_KEYS: SumKey[] = [
  'sum_efg_percent', 'sum_ts_percent', 'sum_three_pt_rate',
  'sum_ast_percent', 'sum_oreb_percent', 'sum_dreb_percent',
  'sum_reb_percent', 'sum_tov_percent', 'sum_usage_percent',
  'sum_pie', 'sum_off_rating', 'sum_def_rating', 'sum_net_rating',
  'sum_pts_2pt', 'sum_pts_3pt', 'sum_pts_ft', 'sum_pts_midrange',
  'sum_pts_pitp', 'sum_pts_fb', 'sum_pts_2nd_ch', 'sum_pts_off_to',
];

const HAS_KEYS: HasKey[] = [
  'has_efg', 'has_ts', 'has_three_pt_rate', 'has_ast_percent',
  'has_oreb_percent', 'has_dreb_percent', 'has_reb_percent',
  'has_tov_percent', 'has_usage_percent', 'has_pie',
  'has_off_rating', 'has_def_rating', 'has_net_rating',
  'has_pts_2pt', 'has_pts_3pt', 'has_pts_ft', 'has_pts_midrange',
  'has_pts_pitp', 'has_pts_fb', 'has_pts_2nd_ch', 'has_pts_off_to',
];

type AdvancedAggregatorPart = Pick<AdvancedAggregator, SumKey | HasKey>;

export function makeAdvancedAggregator(): AdvancedAggregatorPart {
  const out = {} as AdvancedAggregatorPart;
  for (const k of SUM_KEYS) out[k] = 0;
  for (const k of HAS_KEYS) out[k] = 0;
  return out;
}

const isCaptured = (v: number | null | undefined): v is number =>
  v !== null && v !== undefined && !Number.isNaN(Number(v));

export function accumulateAdvancedRow(
  target: AdvancedAggregatorPart,
  stat: AdvancedStatRow,
) {
  const add = (sumKey: SumKey, hasKey: HasKey, value: number | null | undefined) => {
    if (isCaptured(value)) {
      target[sumKey] = (target[sumKey] || 0) + Number(value);
      target[hasKey] = (target[hasKey] || 0) + 1;
    }
  };
  add('sum_efg_percent', 'has_efg', stat.efg_percent);
  add('sum_ts_percent', 'has_ts', stat.ts_percent);
  add('sum_three_pt_rate', 'has_three_pt_rate', stat.three_point_rate);
  add('sum_ast_percent', 'has_ast_percent', stat.ast_percent);
  add('sum_oreb_percent', 'has_oreb_percent', stat.oreb_percent);
  add('sum_dreb_percent', 'has_dreb_percent', stat.dreb_percent);
  add('sum_reb_percent', 'has_reb_percent', stat.reb_percent);
  add('sum_tov_percent', 'has_tov_percent', stat.tov_percent);
  add('sum_usage_percent', 'has_usage_percent', stat.usage_percent);
  add('sum_pie', 'has_pie', stat.pie);
  add('sum_off_rating', 'has_off_rating', stat.off_rating);
  add('sum_def_rating', 'has_def_rating', stat.def_rating);
  add('sum_net_rating', 'has_net_rating', stat.net_rating);
  add('sum_pts_2pt', 'has_pts_2pt', stat.pts_percent_2pt);
  add('sum_pts_3pt', 'has_pts_3pt', stat.pts_percent_3pt);
  add('sum_pts_ft', 'has_pts_ft', stat.pts_percent_ft);
  add('sum_pts_midrange', 'has_pts_midrange', stat.pts_percent_midrange);
  add('sum_pts_pitp', 'has_pts_pitp', stat.pts_percent_pitp);
  add('sum_pts_fb', 'has_pts_fb', stat.pts_percent_fastbreak);
  add('sum_pts_2nd_ch', 'has_pts_2nd_ch', stat.pts_percent_second_chance);
  add('sum_pts_off_to', 'has_pts_off_to', stat.pts_percent_off_turnovers);
}

export function mergeAdvancedInto(
  target: AdvancedAggregatorPart,
  source: Partial<AdvancedAggregatorPart>,
) {
  for (const k of SUM_KEYS) {
    target[k] = (target[k] || 0) + (source[k] || 0);
  }
  for (const k of HAS_KEYS) {
    target[k] = (target[k] || 0) + (source[k] || 0);
  }
}

export interface AdvancedLeaderDef {
  key: string;
  title: string;
  // Returns null when the player has no captured data for this metric
  // (so they're filtered out and the card hides if nobody qualifies).
  compute: (p: AdvancedAggregator) => { value: number; display: string } | null;
  qualifies: (p: AdvancedAggregator) => boolean;
  lowerIsBetter?: boolean;
}

export interface AdvancedLeaderSection {
  key: string;
  title: string;
  defs: AdvancedLeaderDef[];
}

const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtRate = (v: number) => v.toFixed(1);
const fmtRatio = (v: number) => v.toFixed(2);

// Average a per-row metric across rows where it was captured.
// Dividing by the count of captured rows (instead of total games_played)
// keeps the value true to the captured data even when some games were
// recorded without that metric — fixing the dilution issue that the
// "sum / games_played" pattern would otherwise introduce.
const perCapturedAvg = (sumKey: SumKey, hasKey: HasKey, fmt: (v: number) => string) =>
  (p: AdvancedAggregator) => {
    const has = p[hasKey] || 0;
    if (has === 0) return null;
    const value = (p[sumKey] || 0) / has;
    return { value, display: fmt(value) };
  };

const minGames = (n: number) => (p: AdvancedAggregator) => p.games_played >= n;

export function getAdvancedLeaderSections(): AdvancedLeaderSection[] {
  return [
    {
      key: 'efficiency',
      title: 'Efficiency & shooting',
      defs: [
        {
          key: 'eff',
          title: 'Efficiency (EFF)',
          compute: (p) => {
            const totalEff = p.total_points + p.total_rebounds + p.total_assists + p.total_steals + p.total_blocks
              - (p.total_field_goals_attempted - p.total_field_goals_made)
              - (p.total_free_throws_attempted - p.total_free_throws_made)
              - p.total_turnovers;
            const value = totalEff / p.games_played;
            return { value, display: fmtRate(value) };
          },
          qualifies: minGames(1),
        },
        {
          // Mirrors PlayerComparison: averages the per-row efg_percent
          // captured on player_stats. Falls back to the season-totals
          // formula only if no row had efg_percent captured (so older
          // leagues without the column still get a value).
          key: 'efg_pct',
          title: 'Effective FG% (eFG%)',
          compute: (p) => {
            if (p.has_efg > 0) {
              const value = p.sum_efg_percent / p.has_efg;
              return { value, display: fmtPct(value) };
            }
            if (p.total_field_goals_attempted <= 0) return null;
            const value = ((p.total_field_goals_made + 0.5 * p.total_three_points_made) / p.total_field_goals_attempted) * 100;
            return { value, display: fmtPct(value) };
          },
          qualifies: (p) => p.total_field_goals_attempted >= 2,
        },
        {
          // Mirrors PlayerComparison: averages per-row ts_percent.
          // Falls back to season-totals formula when not captured.
          key: 'ts_pct',
          title: 'True Shooting % (TS%)',
          compute: (p) => {
            if (p.has_ts > 0) {
              const value = p.sum_ts_percent / p.has_ts;
              return { value, display: fmtPct(value) };
            }
            const tsa = 2 * (p.total_field_goals_attempted + 0.44 * p.total_free_throws_attempted);
            if (tsa <= 0) return null;
            const value = (p.total_points / tsa) * 100;
            return { value, display: fmtPct(value) };
          },
          qualifies: (p) => p.total_field_goals_attempted >= 2,
        },
        {
          key: 'three_pt_rate',
          title: '3PT Rate',
          compute: perCapturedAvg('sum_three_pt_rate', 'has_three_pt_rate', fmtPct),
          qualifies: minGames(2),
        },
        {
          key: 'ast_to',
          title: 'Assist / Turnover (AST/TO)',
          compute: (p) => {
            const value = p.total_turnovers > 0 ? p.total_assists / p.total_turnovers : p.total_assists;
            return { value, display: fmtRatio(value) };
          },
          qualifies: minGames(2),
        },
      ],
    },
    {
      key: 'rates',
      title: 'Rebounding & playmaking rates',
      defs: [
        { key: 'ast_pct', title: 'Assist % (AST%)', compute: perCapturedAvg('sum_ast_percent', 'has_ast_percent', fmtPct), qualifies: minGames(2) },
        { key: 'oreb_pct', title: 'Offensive Rebound % (OREB%)', compute: perCapturedAvg('sum_oreb_percent', 'has_oreb_percent', fmtPct), qualifies: minGames(2) },
        { key: 'dreb_pct', title: 'Defensive Rebound % (DREB%)', compute: perCapturedAvg('sum_dreb_percent', 'has_dreb_percent', fmtPct), qualifies: minGames(2) },
        { key: 'reb_pct', title: 'Rebound % (REB%)', compute: perCapturedAvg('sum_reb_percent', 'has_reb_percent', fmtPct), qualifies: minGames(2) },
        { key: 'tov_pct', title: 'Turnover % (TOV%)', compute: perCapturedAvg('sum_tov_percent', 'has_tov_percent', fmtPct), qualifies: minGames(2), lowerIsBetter: true },
      ],
    },
    {
      key: 'impact',
      title: 'Impact & usage',
      defs: [
        {
          // PACE is included as a data-driven hidden metric: player_stats
          // does not carry per-player pace today (it's a team-level stat
          // in TeamComparison), so compute() returns null for every
          // player and the card is automatically filtered out by the
          // "hide cards with zero qualifying players" rule. If a future
          // schema adds per-player pace, switch this to perCapturedAvg
          // on a sum_pace/has_pace pair and the card lights up
          // automatically.
          key: 'pace',
          title: 'Pace (PACE)',
          compute: () => null,
          qualifies: minGames(2),
        },
        { key: 'usg_pct', title: 'Usage % (USG%)', compute: perCapturedAvg('sum_usage_percent', 'has_usage_percent', fmtPct), qualifies: minGames(2) },
        { key: 'pie', title: 'Player Impact Estimate (PIE)', compute: perCapturedAvg('sum_pie', 'has_pie', fmtPct), qualifies: minGames(2) },
        { key: 'off_rtg', title: 'Offensive Rating (OFF RTG)', compute: perCapturedAvg('sum_off_rating', 'has_off_rating', fmtRate), qualifies: minGames(2) },
        { key: 'def_rtg', title: 'Defensive Rating (DEF RTG)', compute: perCapturedAvg('sum_def_rating', 'has_def_rating', fmtRate), qualifies: minGames(2), lowerIsBetter: true },
        { key: 'net_rtg', title: 'Net Rating (NET RTG)', compute: perCapturedAvg('sum_net_rating', 'has_net_rating', fmtRate), qualifies: minGames(2) },
      ],
    },
    {
      key: 'scoring',
      title: 'Scoring distribution',
      defs: [
        { key: 'pts_2pt', title: '%PTS 2PT', compute: perCapturedAvg('sum_pts_2pt', 'has_pts_2pt', fmtPct), qualifies: minGames(2) },
        { key: 'pts_3pt', title: '%PTS 3PT', compute: perCapturedAvg('sum_pts_3pt', 'has_pts_3pt', fmtPct), qualifies: minGames(2) },
        { key: 'pts_ft', title: '%PTS FT', compute: perCapturedAvg('sum_pts_ft', 'has_pts_ft', fmtPct), qualifies: minGames(2) },
        { key: 'pts_midrange', title: '%PTS Midrange', compute: perCapturedAvg('sum_pts_midrange', 'has_pts_midrange', fmtPct), qualifies: minGames(2) },
        { key: 'pts_pitp', title: '%PTS Paint (PITP)', compute: perCapturedAvg('sum_pts_pitp', 'has_pts_pitp', fmtPct), qualifies: minGames(2) },
        { key: 'pts_fb', title: '%PTS Fast Break', compute: perCapturedAvg('sum_pts_fb', 'has_pts_fb', fmtPct), qualifies: minGames(2) },
        { key: 'pts_2nd_ch', title: '%PTS 2nd Chance', compute: perCapturedAvg('sum_pts_2nd_ch', 'has_pts_2nd_ch', fmtPct), qualifies: minGames(2) },
        { key: 'pts_off_to', title: '%PTS Off Turnovers', compute: perCapturedAvg('sum_pts_off_to', 'has_pts_off_to', fmtPct), qualifies: minGames(2) },
      ],
    },
  ];
}
