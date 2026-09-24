// Game footage / video-breakdown lookup — the StatsThread integration.
//
// The schema for where per-game footage will actually live in Supabase
// hasn't been finalised yet (game files land in a shared warehouse StatsThread
// writes to once their breakdown pipeline finishes a game, keyed to the same
// player_id/team_id/game_key this app already uses — see the "team login"
// planning conversation). This file is the single place every "watch video"
// affordance in the app calls through, so wiring in the real lookup later is
// a one-file change rather than hunting down every link.
//
// Until that lands, every game has no footage — callers should treat a null
// return as "not available yet" and render accordingly (a muted/disabled
// state, not an error).

export interface GameFootage {
  url: string;
  /** Optional: seconds into the video where play-by-play tap-to-jump would land. */
  startSeconds?: number;
}

/**
 * Returns the footage for a given game, or null if none exists yet.
 * TODO(statsthread-integration): replace with a real lookup once the
 * warehouse schema is agreed — likely a Supabase query by game_key against
 * whatever table/view StatsThread's data lands in.
 */
export function getGameFootage(gameKey: string | null | undefined): GameFootage | null {
  if (!gameKey) return null;
  return null;
}
