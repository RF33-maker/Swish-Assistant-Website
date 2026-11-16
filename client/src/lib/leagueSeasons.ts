/**
 * Which season a competition belongs to, and which of a league's competitions
 * are "this season" versus history.
 *
 * League pickers (the /league/:slug hub and the season switcher on a
 * competition page) only offer the current season. Every earlier season lives
 * in the league's History tab and on /british-basketball-history.
 *
 * Seasons are stored loosely: "2025/26", "Season 2026/27", "2024/25 Trophy",
 * null with "SLB Championship 26-27" in the name, "Season 2" (REBA SL), "2026"
 * (summer leagues). All of them are read from `${season} ${name}`.
 */

export interface SeasonInfo {
  /** Comparable within one league: the start year, or the ordinal for "Season N". */
  sort: number;
  /** "2025/26", "2026" or "Season 2". */
  label: string;
}

type SeasonFields = { season?: string | null; name: string };

const twoDigits = (n: number) => String(n % 100).padStart(2, "0");

export function seasonOf(competition: SeasonFields): SeasonInfo | null {
  const raw = `${competition.season || ""} ${competition.name || ""}`;

  // "2025/26", "2025-26", "2025-2026"
  const full = raw.match(/\b(20\d{2})\s*[-/]\s*(?:20)?(\d{2})\b/);
  if (full) {
    const start = Number(full[1]);
    if ((start + 1) % 100 === Number(full[2])) return { sort: start, label: `${start}/${full[2]}` };
  }

  // "26-27"
  const short = raw.match(/(?:^|[^\d])(\d{2})\s*[-/]\s*(\d{2})(?![\d])/);
  if (short && (Number(short[1]) + 1) % 100 === Number(short[2])) {
    const start = 2000 + Number(short[1]);
    return { sort: start, label: `${start}/${twoDigits(start + 1)}` };
  }

  // "Season 2" (ordinal seasons, REBA SL)
  const ordinal = raw.match(/\bseason\s+(\d{1,2})\b/i);
  if (ordinal) return { sort: Number(ordinal[1]), label: `Season ${Number(ordinal[1])}` };

  // "2026" (one-summer competitions)
  const year = raw.match(/\b(20\d{2})\b/);
  if (year) return { sort: Number(year[1]), label: year[1] };

  return null;
}

export interface SeasonGroup<T> {
  label: string;
  sort: number;
  competitions: T[];
}

/**
 * Splits one league's competitions (already scoped to a gender) into the
 * current season and the seasons before it, newest first. A competition with
 * no readable season stays with the current one rather than vanishing.
 */
export function splitCurrentSeason<T extends SeasonFields>(competitions: T[]): {
  current: T[];
  currentLabel: string | null;
  past: SeasonGroup<T>[];
} {
  const read = competitions.map((c) => ({ c, s: seasonOf(c) }));
  const sorts = read.map((r) => r.s?.sort).filter((n): n is number => n != null);
  if (sorts.length === 0) return { current: competitions, currentLabel: null, past: [] };

  const latest = Math.max(...sorts);
  const current = read.filter((r) => !r.s || r.s.sort === latest).map((r) => r.c);
  const currentLabel = read.find((r) => r.s?.sort === latest)?.s?.label ?? null;

  const groups = new Map<number, SeasonGroup<T>>();
  for (const { c, s } of read) {
    if (!s || s.sort === latest) continue;
    const group = groups.get(s.sort) ?? { label: s.label, sort: s.sort, competitions: [] };
    group.competitions.push(c);
    groups.set(s.sort, group);
  }
  const past = Array.from(groups.values()).sort((a, b) => b.sort - a.sort);
  return { current, currentLabel, past };
}

/** Same-season competitions first by type: the league itself, then cups, trophies and play-offs. */
export function competitionTypeOrder(name: string): number {
  const n = name.toLowerCase();
  if (/play-?offs?|final/.test(n)) return 3;
  if (/trophy|shield|patrons/.test(n)) return 2;
  if (/\bcup\b/.test(n)) return 1;
  return 0;
}

/** "BBL Championship 2018-19" → "BBL Championship"; the season is shown beside it. */
export function competitionNameWithoutSeason(name: string): string {
  return name
    .replace(/\s*\bFIBA$/i, "")
    .replace(/\s*\b(?:20\d{2}|\d{2})\s*[-/]\s*(?:20)?\d{2}\b/g, "")
    .replace(/\s*\b20\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim() || name;
}
