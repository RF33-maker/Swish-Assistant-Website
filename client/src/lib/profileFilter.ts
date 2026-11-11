/**
 * The player profile's one filter: a season and a league, kept in the URL
 * (?season=2025-26&league=nbl-division-one) so every tab, a refresh and a
 * shared link all show the same games.
 *
 * Competitions are stored one row per season ("NBL Division One 2025-26"), and
 * their `season` column is filled inconsistently, so both halves are worked out
 * here from the competition's name and the dates of the player's games in it:
 *   - season: "2025-26", or "Summer 2026" for summer leagues
 *   - league: the name with the season taken off ("NBL Division One"), so the
 *     same league in different seasons is one choice.
 */

export interface SeasonInfo {
  /** URL value: "2025-26" or "summer-2026". */
  key: string;
  /** "2025-26" or "Summer 2026". */
  label: string;
  /** Orders seasons: 2024-25 < Summer 2025 < 2025-26. */
  order: number;
}

/** URL value for every season. Leaving ?season= off means the latest one. */
export const ALL_SEASONS = "all";

const seasonFromStart = (start: number): SeasonInfo => ({
  key: `${start}-${String(start + 1).slice(-2)}`,
  label: `${start}-${String(start + 1).slice(-2)}`,
  order: start * 2,
});

const summerOf = (year: number): SeasonInfo => ({
  key: `summer-${year}`,
  label: `Summer ${year}`,
  order: year * 2 - 1,
});

/** A season range written in a name: "2025-26", "2025/2026", "26-27". */
function seasonStartInText(text: string): number | null {
  const long = text.match(/\b((?:19|20)\d{2})\s*[-/–]\s*((?:19|20)?\d{2})\b/);
  if (long) {
    const start = Number(long[1]);
    const end = Number(long[2].slice(-2));
    if ((start + 1) % 100 === end) return start;
  }
  const short = text.match(/(?:^|\s)(\d{2})\s*[-/]\s*(\d{2})(?=\s|$|\))/);
  if (short) {
    const a = Number(short[1]);
    const b = Number(short[2]);
    if ((a + 1) % 100 === b) return 2000 + a;
  }
  return null;
}

/**
 * The season a competition belongs to. The name wins when it says; otherwise
 * the date of the player's latest game in it decides (August starts a season,
 * June and July are the summer, as is any league with "summer" in its name).
 */
export function seasonForCompetition(names: (string | null | undefined)[], latestGame: number | null): SeasonInfo | null {
  const text = names.filter(Boolean).join(" ");
  const start = seasonStartInText(text);
  if (start != null) return seasonFromStart(start);
  const isSummer = /\bsummer\b/i.test(text);
  const namedYear = text.match(/\b(20\d{2})\b/);
  if (isSummer && namedYear) return summerOf(Number(namedYear[1]));
  if (latestGame == null || Number.isNaN(latestGame)) return null;
  const d = new Date(latestGame);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  if (isSummer || (month >= 5 && month <= 6)) return summerOf(year);
  return seasonFromStart(month >= 7 ? year : year - 1);
}

/** "NBL Division One 2025-26" → "NBL Division One"; "REBA SL Season 2" → "REBA SL". */
export function leagueFamilyName(name: string): string {
  const cleaned = name
    .replace(/\(?\b(?:season\s+)?(?:19|20)\d{2}\s*[-/–]\s*(?:(?:19|20)?\d{2})\b\)?/gi, " ")
    .replace(/(?:^|\s)\d{2}\s*[-/]\s*\d{2}(?=\s|$)/g, " ")
    .replace(/\bseason\s+\d+\b/gi, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\bFIBA\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–:·|(]+$/, "")
    .replace(/^[\s\-–:·|)]+/, "")
    .trim();
  return cleaned || name.trim();
}

export function filterSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ProfileFilterState {
  /** A season key, ALL_SEASONS, or null for "the latest season". */
  season: string | null;
  /** A league key (filterSlug of the family name), or null for every league. */
  league: string | null;
}

/** Reads the filter from a query string. */
export function readProfileFilter(search: string): ProfileFilterState {
  const params = new URLSearchParams(search);
  return {
    season: params.get("season") || null,
    league: params.get("league") || null,
  };
}

/** Writes the filter into the current URL without adding a history entry. */
export function writeProfileFilter(state: ProfileFilterState) {
  const params = new URLSearchParams(window.location.search);
  if (state.season) params.set("season", state.season);
  else params.delete("season");
  if (state.league) params.set("league", state.league);
  else params.delete("league");
  const search = params.toString();
  const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(window.history.state, "", next);
  }
}
