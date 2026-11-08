/**
 * PostgREST filter that leaves games still in play out of a v_game_results
 * query. The view lists a live game with its running score and a "Final"
 * game_status, so standings built from it would count a half-time score as a
 * win or a loss. Rows with no schedule status are kept (older games).
 */
export const EXCLUDE_LIVE_GAMES = "schedule_status.is.null,schedule_status.neq.live";

const FINAL_STATUSES = new Set([
  "final", "finished", "complete", "completed", "ft", "full time", "full-time",
]);
const LIVE_STATUS_KEYWORDS = ["live", "in_progress", "in progress", "playing"];

/**
 * True while a game is being played: a live-type schedule status ("live",
 * "Q3", "halftime"...) on a game that tipped off in the last 12 hours. The
 * time window keeps games whose status got stuck on "live" seasons ago from
 * reading as live. Same rule as the homepage scores and top performances.
 */
export function isGameInProgress(
  status: string | null | undefined,
  matchTime: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!status || !matchTime) return false;
  const lower = status.toLowerCase().trim();
  if (FINAL_STATUSES.has(lower)) return false;
  const liveStatus = LIVE_STATUS_KEYWORDS.some((k) => lower.includes(k))
    || /^(q[1-4]|ot\d*|halftime|half time)(?:\b|$)/.test(lower);
  if (!liveStatus) return false;
  const tipoff = Date.parse(matchTime);
  if (!Number.isFinite(tipoff)) return false;
  return tipoff >= now - 12 * 60 * 60 * 1000 && tipoff <= now + 6 * 60 * 60 * 1000;
}
