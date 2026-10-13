/**
 * Reading Basketball England's NBL fixtures and results page (basketballengland.co.uk).
 * Everything here is a pure function over the HTML the site returns, so it can be tested
 * without the network. The fetching and saving live in server/nblScores.ts.
 *
 * The site is plain server-rendered HTML:
 *   - /leagues/nbl/fixtures-and-results has a <select id="grade"> listing every pool,
 *   - /php/ajax/getDateOptions.php (POST grade_id) lists a pool's match days as <option>s,
 *   - /php/ajax/filterResults.php (POST grade_id, date) returns that day's rows. A finished
 *     game has two ".score" spans and a link to its match report; an upcoming one has neither.
 */

export type NblGrade = { id: string; name: string };

export type NblScoreRow = {
  gameDate: string;
  tipTime: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  reportId: string | null;
};

/** The divisions we copy scores for: Division Two, men's and women's. */
export const NBL_DIVISION_PATTERN = /^Division Two (Men|Women)\b/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function selectBody(html: string, id: string): string | null {
  const m = new RegExp(`<select[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</select>`, "i").exec(html);
  return m ? m[1] : null;
}

function optionsOf(select: string): { value: string; label: string; selected: boolean }[] {
  return [...select.matchAll(/<option\b([^>]*)>([^<]*)/gi)].map((m) => ({
    value: /\bvalue="([^"]*)"/i.exec(m[1])?.[1] ?? "",
    label: decodeEntities(m[2]),
    selected: /\bselected\b/i.test(m[1]),
  }));
}

/** The pools we want, from the page's division picker (which lists the current season's). */
export function parseGrades(html: string, pattern: RegExp = NBL_DIVISION_PATTERN): NblGrade[] {
  const select = selectBody(html, "grade");
  if (!select) return [];
  return optionsOf(select)
    .filter((o) => o.value && pattern.test(o.label))
    .map((o) => ({ id: o.value, name: o.label }));
}

/** The season the page is showing, e.g. "2026/27" (its selected option, else the first). */
export function parseSeason(html: string): string | null {
  const select = selectBody(html, "season");
  if (!select) return null;
  const options = optionsOf(select).filter((o) => o.value);
  return (options.find((o) => o.selected) ?? options[0])?.label ?? null;
}

/** The match days a pool has, as YYYY-MM-DD, from getDateOptions.php. */
export function parseDateOptions(html: string): string[] {
  return [...html.matchAll(/<option\b[^>]*\bvalue="(\d{4}-\d{2}-\d{2})"/gi)].map((m) => m[1]);
}

/**
 * Match days from `today - lookbackDays` up to and including `today`. Days with nothing
 * played yet cost one request that comes back without scores, so future days are skipped.
 */
export function datesInWindow(dates: string[], today: string, lookbackDays: number): string[] {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - lookbackDays);
  const earliest = from.toISOString().slice(0, 10);
  return dates.filter((d) => d >= earliest && d <= today);
}

/** The site serves 64px squares, which squash non-square crests; ask for a larger, aspect-safe one. */
export function upgradeLogoUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/h_\d+,w_\d+\//, "/c_fit,h_256,w_256/");
}

/** The finished games in one day's rows. Upcoming games (no scores) and unreadable rows are left out. */
export function parseResults(html: string, gameDate: string): NblScoreRow[] {
  const rows: NblScoreRow[] = [];
  for (const m of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const [, attrs, body] = m;
    const names = [...body.matchAll(/class="club-name">([^<]*)</gi)].map((n) => decodeEntities(n[1]));
    const scores = [...body.matchAll(/class="score[^"]*">\s*(\d+)\s*</gi)].map((s) => Number(s[1]));
    if (names.length !== 2 || scores.length !== 2 || !names[0] || !names[1]) continue;
    const logos = [...body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*class="club-logo"/gi)].map((l) => upgradeLogoUrl(l[1].replace(/&amp;/g, "&")));
    rows.push({
      gameDate,
      tipTime: /class="time[^"]*">\s*(\d{1,2}:\d{2})\s*</i.exec(body)?.[1] ?? null,
      homeTeam: names[0],
      awayTeam: names[1],
      homeScore: scores[0],
      awayScore: scores[1],
      homeLogoUrl: logos[0] ?? null,
      awayLogoUrl: logos[1] ?? null,
      reportId: /report\/([0-9a-f-]{36})/i.exec(attrs)?.[1] ?? null,
    });
  }
  return rows;
}

// ── choosing what goes on a card (used by Swish Social) ──────────────────────

/** A saved score as the admin API returns it. */
export type SavedNblScore = {
  id: string;
  grade_id: string;
  grade_name: string;
  season: string;
  game_date: string;
  tip_time: string | null;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  home_logo_url: string | null;
  away_logo_url: string | null;
  scraped_at: string;
};

/** "Division Two Men - Pool A" -> "Division Two Men" */
export function divisionOf(gradeName: string): string {
  return gradeName.replace(/\s+-\s+Pool\s+\w+$/i, "").trim();
}

/** "Division Two Men - Pool A" -> "Pool A" (empty when the name has no pool) */
export function poolOf(gradeName: string): string {
  return /Pool\s+\w+$/i.exec(gradeName)?.[0] ?? "";
}

function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The day a game's "weekend" starts on, so Friday, Saturday and Sunday games land on one card
 * set. A midweek game is its own day.
 */
export function weekendKey(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  if (day === 5) return date;
  if (day === 6) return shiftDay(date, -1);
  if (day === 0) return shiftDay(date, -2);
  return date;
}

const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function dayParts(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return { dow: DAY_NAMES[d.getUTCDay()], day: d.getUTCDate(), month: MONTH_NAMES[d.getUTCMonth()] };
}

/** "SAT 10 – SUN 11 OCT", "SAT 31 OCT – SUN 1 NOV", or "WED 14 OCT" for one day. */
export function formatDateRange(first: string, last: string): string {
  const a = dayParts(first);
  if (first === last) return `${a.dow} ${a.day} ${a.month}`;
  const b = dayParts(last);
  return a.month === b.month ? `${a.dow} ${a.day} – ${b.dow} ${b.day} ${b.month}` : `${a.dow} ${a.day} ${a.month} – ${b.dow} ${b.day} ${b.month}`;
}

/** Splits a list into cards of at most `size`, keeping the order. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
