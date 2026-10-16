import { seasonLabel, seasonStart, isSeasonLabel } from "./season";

/**
 * Which games a scouting report reads, beyond its window: the season, and which
 * of the club's competitions count. A club plays a league, its cup and a trophy
 * in one season and scouting reads them together; a coach can untick the ones
 * they don't want counted ("leave the cup out, they rest players there").
 *
 * The default (this season, every competition) is the empty key, so everything
 * built before this existed, the hourly sweep and the free look are unchanged.
 */

export interface ScoutScope {
  /** "2025/26", or null for the season now in progress (so the default rolls over with the calendar). */
  season: string | null;
  /** League ids left out of the scout. */
  exclude: string[];
}

export const DEFAULT_SCOPE: ScoutScope = { season: null, exclude: [] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_EXCLUDED = 20;

/** Accepts whatever came over the wire and returns a valid, normalised scope. */
export function parseScope(raw: { season?: unknown; exclude?: unknown } | null | undefined, now: Date = new Date()): ScoutScope {
  const season = isSeasonLabel(raw?.season, now) && raw!.season !== seasonLabel(now) ? (raw!.season as string) : null;
  const list = Array.isArray(raw?.exclude) ? raw!.exclude : typeof raw?.exclude === "string" && raw.exclude ? raw.exclude.split(",") : [];
  const exclude = Array.from(new Set(list.map((v) => String(v).trim().toLowerCase()).filter((v) => UUID.test(v)))).sort().slice(0, MAX_EXCLUDED);
  return { season, exclude };
}

/** '' for the default; otherwise a stable string that identifies the choice. */
export function scopeKey(scope: ScoutScope): string {
  const parts: string[] = [];
  if (scope.season) parts.push(`season=${scope.season}`);
  if (scope.exclude.length) parts.push(`ex=${scope.exclude.join(",")}`);
  return parts.join(";");
}

export function isDefaultScope(scope: ScoutScope): boolean {
  return scopeKey(scope) === "";
}

/** Midnight UTC on 1 September, the start and end of the season a scope points at. */
export function scopeRange(scope: ScoutScope, now: Date = new Date()): { start: number; end: number; current: boolean } {
  if (!scope.season) return { start: seasonStart(now).getTime(), end: Infinity, current: true };
  const y = Number(scope.season.slice(0, 4));
  return { start: Date.UTC(y, 8, 1), end: Date.UTC(y + 1, 8, 1), current: false };
}

/** The season label a game date falls in. */
export function seasonOfDate(iso: string): string {
  return seasonLabel(new Date(iso));
}
