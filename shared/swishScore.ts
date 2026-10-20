/**
 * Swish Score: one number for a single game, used to rank Player of the Week,
 * Team of the Week and the trending performances.
 *
 * The database view `vw_player_game_scores` computes the same formula (see
 * supabase/migrations/20261024_swish_score.sql); keep the two in step. The
 * public explainer at /swish-score reads its numbers from here.
 */

export const SWISH_SCORE_WEIGHTS = {
  pts: 1.0,
  reb: 1.2,
  ast: 1.3,
  stl: 1.7,
  blk: 2.0,
  tov: -2.0,
} as const;

/** Each point above (or below) one point per shot used is worth this much more. */
export const SWISH_SCORE_SHOOTING_WEIGHT = 0.8;
/** A free throw uses this share of a possession, as in true shooting %. */
export const SWISH_SCORE_FT_SHARE = 0.44;
export const SWISH_SCORE_WIN_BONUS = 3;

export interface SwishScoreLine {
  pts?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  tov?: number | null;
  fga?: number | null;
  fta?: number | null;
  /** True for a win, false for a loss, null/undefined when not known. */
  won?: boolean | null;
}

export interface SwishScoreBreakdown {
  box: number;
  shotsUsed: number;
  shooting: number;
  win: number;
  total: number;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function swishScoreBreakdown(line: SwishScoreLine): SwishScoreBreakdown {
  const w = SWISH_SCORE_WEIGHTS;
  const pts = n(line.pts);
  const box =
    pts * w.pts + n(line.reb) * w.reb + n(line.ast) * w.ast + n(line.stl) * w.stl + n(line.blk) * w.blk + n(line.tov) * w.tov;
  const shotsUsed = n(line.fga) + SWISH_SCORE_FT_SHARE * n(line.fta);
  const shooting = SWISH_SCORE_SHOOTING_WEIGHT * (pts - shotsUsed);
  const win = line.won ? SWISH_SCORE_WIN_BONUS : 0;
  return { box, shotsUsed, shooting, win, total: box + shooting + win };
}

export function computeSwishScore(line: SwishScoreLine): number {
  return swishScoreBreakdown(line).total;
}

export const formatSwishScore = (v: number | null | undefined) => (v == null ? "—" : Number(v).toFixed(1));
