/**
 * What counts as "this season" for scouting.
 *
 * A club can play in several competitions in one season (the NBL and its Cup,
 * the British Championship and its Trophy, a European league) and early on
 * only a game or two have come in any one of them. Scouting looks at all of a
 * club's games since the season began, across competitions, so the sample is as
 * big as it can honestly be. The season turns over on 1 September: the BCB
 * Trophy, the NBL and the other leagues start after it, and the summer
 * leagues and pro-ams finish before it.
 */
export const SEASON_START_MONTH = 8; // September (0 = January)

/** 1 September of the season `now` is in, at midnight UTC. */
export function seasonStart(now: Date = new Date()): Date {
  const year = now.getUTCMonth() >= SEASON_START_MONTH ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, SEASON_START_MONTH, 1));
}

/** "2026/27" for the season starting 1 Sep 2026. */
export function seasonLabel(now: Date = new Date()): string {
  const y = seasonStart(now).getUTCFullYear();
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
}
