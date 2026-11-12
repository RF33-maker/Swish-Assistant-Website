import { supabaseAdmin as db } from "../supabaseServiceClient";
import { isSameTeam, teamClubKey } from "@shared/teamIdentity";

/**
 * Ask Swish — the read layer under the tools.
 *
 * Everything the assistant can see comes through here, with the service-role
 * client, so the gate is the route (signed-in users) and the visibility
 * rules below (public competitions, or children of one). Nothing writes.
 *
 * Numbers are computed the same way the site computes them: standings from
 * final results, per-game averages from the game-log views, advanced figures
 * as the mean of the per-game views. Keeping that parity matters more than
 * cleverness — a user who checks a card against a league page must find the
 * same number.
 */

export interface Competition {
  league_id: string;
  name: string;
  slug: string | null;
  parent_league_id: string | null;
  is_public: boolean | null;
  season: string | null;
  brand_primary_colour?: string | null;
  /** The brand (leagues.id) the competition sits under; seasons of one league share it. */
  competition_id?: string | null;
  gender?: string | null;
}

let compCache: { at: number; rows: Competition[] } | null = null;
const COMP_TTL = 5 * 60 * 1000;

/** Every competition a visitor can see: public itself, or under a public ancestor. */
export async function visibleCompetitions(): Promise<Competition[]> {
  if (compCache && Date.now() - compCache.at < COMP_TTL) return compCache.rows;
  const { data, error } = await db
    .from("competitions")
    .select("league_id, name, slug, parent_league_id, is_public, season, brand_primary_colour, competition_id, gender");
  if (error) throw new Error(`competitions: ${error.message}`);
  const all = (data || []) as Competition[];
  const byId = new Map(all.map((c) => [c.league_id, c]));
  const visible = (c: Competition): boolean => {
    let cur: Competition | undefined = c;
    for (let i = 0; cur && i < 6; i++) {
      if (cur.is_public) return true;
      cur = cur.parent_league_id ? byId.get(cur.parent_league_id) : undefined;
    }
    return false;
  };
  const rows = all.filter(visible);
  compCache = { at: Date.now(), rows };
  return rows;
}

export async function competitionById(id: string | null | undefined): Promise<Competition | null> {
  if (!id) return null;
  return (await visibleCompetitions()).find((c) => c.league_id === id) ?? null;
}

/**
 * The ids a league question covers: the competition itself plus its direct
 * children (a parent like "REBA SL" holds no games of its own; its stops do).
 */
export async function leagueFamily(id: string): Promise<string[]> {
  const comps = await visibleCompetitions();
  const children = comps.filter((c) => c.parent_league_id === id).map((c) => c.league_id);
  return [id, ...children];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Best competition for a free-text name ("NBL D1", "the Championship", a slug, an id). */
export async function findCompetition(text: string): Promise<Competition | null> {
  const comps = await visibleCompetitions();
  const q = norm(text);
  if (!q) return null;
  const exact = comps.find((c) => c.league_id === text || c.slug === text || norm(c.name) === q);
  if (exact) return exact;
  // A league named without its season ("BCB Trophy", "NBL Division Two 2019-20" said as "NBL Division Two 2019/20").
  const stem = norm(seriesName(text));
  // Two words at least: a bare "Championship" is for the aliases below (an empty shell has that name).
  const sameLeague = stem.includes(" ") ? comps.filter((c) => norm(seriesName(c.name)) === stem) : [];
  if (sameLeague.length) return newest(sameLeague, text);
  const aliases: Array<[RegExp, RegExp]> = [
    [/\bnbl\b.*\b(d2|division two|division 2|div 2)\b/, /nbl division two/],
    [/\bnbl\b.*\b(d1|division one|division 1|div 1)\b/, /nbl division one/],
    [/\bnbl\b.*\bcup\b/, /nbl mens national cup/],
    [/\bwnbl\b/, /wnbl division one/],
    [/\bwbbl\b.*\bcup\b|\b(slb|wslb)\b.*\bwomen\b.*\bcup\b|\bwomen s (slb|super league)\b.*\bcup\b|\bwslb\b.*\bcup\b/, /slb women cup|^wbbl cup/],
    [/\bwbbl\b.*\bplay ?offs?\b|\b(slb|wslb)\b.*\bwomen\b.*\bplay ?offs?\b|\bwomen s slb\b.*\bplay ?offs?\b/, /slb women play offs|^wbbl play offs/],
    [/\bwbbl\b/, /^wbbl championship/],
    [/\bwslb\b|\bslb\b.*\bwomen|\bwomen s (slb|super league)\b|\bwomen s super league basketball\b/, /slb women championship|women s slb championship/],
    [/\bbbl\b|\bbritish basketball league\b/, /^bbl championship/],
    [/\bslb\b|\bsuper league\b|\bchampionship\b/, /slb championship/],
    [/\bbcb\b|\bbritish championship\b/, /british championship basketball/],
    [/\benbl\b/, /enbl/],
    [/\beabl\b/, /^eabl/],
    [/\bweabl\b/, /weabl/],
    [/\biceland/, /icelandic/],
    [/\breba\b/, /reba sl/],
  ];
  for (const [ask, match] of aliases) {
    if (ask.test(q)) {
      const hits = comps.filter((c) => match.test(norm(c.name)));
      if (hits.length) return newest(hits, text);
    }
  }
  const words = q.split(" ").filter((w) => w.length > 2);
  const scored = comps
    .map((c) => ({ c, score: words.filter((w) => norm(c.name).includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.length ? newest(scored.filter((x) => x.score === scored[0].score).map((x) => x.c), text) : null;
}

/**
 * When several seasons match: the season the text names ("NBL D2 2019-20"),
 * else the latest one. Parents win a tie over their own stops.
 */
function newest(hits: Competition[], text?: string): Competition {
  const want = text ? seasonStartOf(text) : null;
  const pool = want != null && hits.some((c) => seasonStart(c) === want) ? hits.filter((c) => seasonStart(c) === want) : hits;
  const rank = (c: Competition) => seasonOrder(c) ?? (/2026|26-27|season 2/i.test(`${c.name} ${c.season ?? ""}`) ? 2026 : -1);
  return pool
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(b.c) - rank(a.c) || Number(!!a.c.parent_league_id) - Number(!!b.c.parent_league_id) || a.i - b.i)[0].c;
}

// ---------- seasons, and leagues that changed name ----------

/** First year of the season in a piece of text: "2019-20" → 2019, "26-27" → 2026, "2025/2026" → 2025, "2025" → 2025. */
export function seasonStartOf(text: string): number | null {
  const full = /\b(20\d{2})\s*[-/]\s*(?:20)?\d{2}\b/.exec(text);
  if (full) return Number(full[1]);
  const short = /\b(\d{2})\s*[-/]\s*(\d{2})\b/.exec(text);
  if (short && Number(short[2]) === (Number(short[1]) + 1) % 100) return 2000 + Number(short[1]);
  const year = /\b(20\d{2})\b/.exec(text);
  return year ? Number(year[1]) : null;
}

export const seasonStart = (c: Pick<Competition, "name" | "season">) => seasonStartOf(`${c.name} ${c.season ?? ""}`);

/** Sort key for a league's seasons: the start year, or "Season 2" → 2 for leagues numbered that way. */
function seasonOrder(c: Competition): number | null {
  const y = seasonStart(c);
  if (y != null) return y;
  const n = /\bseason\s+(\d+)\b/i.exec(`${c.name} ${c.season ?? ""}`);
  return n ? Number(n[1]) : null;
}

/** "2019-20", "2025", "Season 2" — how a season reads in an answer. */
export function seasonLabel(c: Competition): string {
  const y = seasonStart(c);
  const text = `${c.name} ${c.season ?? ""}`;
  if (y != null) return /\b(20\d{2}|\d{2})\s*[-/]\s*\d{2}/.test(text) ? `${y}-${String((y + 1) % 100).padStart(2, "0")}` : String(y);
  return /\bseason\s+\d+\b/i.exec(text)?.[0].replace(/^s/, "S") ?? c.name;
}

/**
 * One league spelt two ways in the competition names, mapped to the name it
 * goes by now (2025-26 Women's SLB sits between two "SLB Women" seasons).
 */
const SAME_LEAGUE: Record<string, string> = {
  "women s slb championship": "SLB Women Championship",
  "slb women betty codona trophy": "Betty Codona Trophy",
};

/** A competition's name without its season: "NBL Division Two 2019-20" → "NBL Division Two". */
export function seriesName(name: string): string {
  const stem = name
    .replace(/\(?\b(?:20\d{2}\s*[-/]\s*(?:20)?\d{2}|\d{2}\s*[-/]\s*\d{2}|20\d{2})\b\)?/g, " ")
    .replace(/\bseason\s+\d+\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return SAME_LEAGUE[norm(stem)] ?? stem;
}

/**
 * Leagues that carried on under a new name, as [former name, newer name].
 * A former name only links to the newer one under the same brand
 * (competitions.competition_id), which is what keeps the old NBL Division One
 * (2017-18 to 2024-25, now British Championship Basketball) apart from
 * today's NBL Division One (the old NBL Division Two).
 */
const RENAMED: Array<[string, string]> = [
  ["NBL Division Two", "NBL Division One"],
  ["NBL Division One", "British Championship Basketball"],
  ["Men's National Trophy", "National Trophy"],
  ["National Trophy", "Lynch Trophy"],
  ["Lynch Trophy", "KitKing Trophy"],
  ["KitKing Trophy", "BCB Trophy"],
  ["National Cup", "NBL Mens National Cup"],
  ["Women's National Cup", "WNBL National Cup"],
  ["WBBL Championship", "SLB Women Championship"],
  ["WBBL Cup", "SLB Women Cup"],
  ["WBBL Play-Offs", "SLB Women Play-Offs"],
  ["WBBL Trophy", "Betty Codona WBBL Trophy"],
  ["Betty Codona WBBL Trophy", "Betty Codona Trophy"],
  ["BBL Championship", "SLB Championship"],
  ["BBL Cup", "SLB Cup"],
  ["BBL Trophy", "SLB Trophy"],
  ["BBL Play-Offs", "SLB Play-Offs"],
];

/** Every season of one league under one name. */
export interface Series { key: string; name: string; brand: string | null; seasons: Competition[] }

export interface SeasonSpan {
  /** The series the question is about (the one the competition belongs to). */
  asked: Series;
  /** Series included, oldest name first: the asked one plus its former names when wanted. */
  parts: Series[];
  /** Every season covered, oldest first. */
  seasons: Competition[];
  /** Former names left out because the caller asked for the one name only. */
  formerLeftOut: Series[];
  /** The next name, when the asked league was later renamed (never included). */
  renamedTo: Series | null;
  /** The league's name today, at the end of any chain of renames (null when never renamed). */
  nowCalled: Series | null;
  /** Other leagues with the same name under another brand (never included), with what they became or were. */
  namesakes: Array<{ series: Series; renamedTo: Series | null; former: Series[] }>;
}

const seriesKey = (c: Competition) => `${c.competition_id ?? ""}|${norm(seriesName(c.name))}`;
const brandsMeet = (a: string | null, b: string | null) => !a || !b || a === b;

async function allSeries(): Promise<Map<string, Series>> {
  const out = new Map<string, Series>();
  for (const c of await visibleCompetitions()) {
    if (c.parent_league_id) continue; // a stop or finals day belongs to its parent's season
    const key = seriesKey(c);
    const s = out.get(key) ?? { key, name: seriesName(c.name), brand: c.competition_id ?? null, seasons: [] };
    s.seasons.push(c);
    out.set(key, s);
  }
  for (const s of Array.from(out.values())) s.seasons.sort((a, b) => (seasonOrder(a) ?? -1) - (seasonOrder(b) ?? -1));
  return out;
}

/** The seasons an all-time question about `comp`'s league covers. */
export async function seasonSpan(comp: Competition, opts: { formerNames?: boolean } = {}): Promise<SeasonSpan> {
  const all = await allSeries();
  const list = Array.from(all.values());
  const asked = all.get(seriesKey(comp)) ?? { key: seriesKey(comp), name: seriesName(comp.name), brand: comp.competition_id ?? null, seasons: [comp] };
  const linked = (from: Series, dir: "former" | "newer"): Series[] => list.filter((s) => s !== from && brandsMeet(s.brand, from.brand) &&
    RENAMED.some(([before, after]) => dir === "former"
      ? norm(after) === norm(from.name) && norm(before) === norm(s.name)
      : norm(before) === norm(from.name) && norm(after) === norm(s.name)));
  const former: Series[] = [];
  for (let frontier = [asked], i = 0; frontier.length && i < 6; i++) {
    frontier = frontier.flatMap((s) => linked(s, "former")).filter((s) => !former.includes(s));
    former.push(...frontier);
  }
  const parts = [...(opts.formerNames === false ? [] : former), asked]
    .sort((a, b) => (seasonOrder(a.seasons[0]) ?? 0) - (seasonOrder(b.seasons[0]) ?? 0));
  const renamedTo = linked(asked, "newer")[0] ?? null;
  let nowCalled = renamedTo;
  for (let i = 0; nowCalled && i < 6; i++) { const next = linked(nowCalled, "newer")[0]; if (!next) break; nowCalled = next; }
  return {
    asked, parts,
    seasons: parts.flatMap((p) => p.seasons).sort((a, b) => (seasonOrder(a) ?? -1) - (seasonOrder(b) ?? -1)),
    formerLeftOut: opts.formerNames === false ? former : [],
    renamedTo, nowCalled,
    namesakes: list
      .filter((s) => s !== asked && !parts.includes(s) && norm(s.name) === norm(asked.name))
      .map((s) => ({ series: s, renamedTo: linked(s, "newer")[0] ?? null, former: linked(s, "former") })),
  };
}

/** "2017-18 to 2024-25 (7 seasons: 2017-18, …)" for a run of seasons. */
function seasonList(seasons: Competition[]): string {
  const labels = seasons.map(seasonLabel);
  if (labels.length === 1) return labels[0];
  // Years missing from a run (2020-21 for some leagues): say they are not on the site, which is all we know.
  const starts = seasons.map(seasonStart);
  const gaps: string[] = [];
  for (let i = 1; i < starts.length; i++) {
    const a = starts[i - 1], b = starts[i];
    if (a != null && b != null) for (let y = a + 1; y < b && gaps.length < 4; y++) gaps.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return `${labels[0]} to ${labels[labels.length - 1]} (${labels.length} seasons: ${labels.join(", ")}${gaps.length ? `; no ${gaps.join(", ")} season on the site` : ""})`;
}

/** What an all-time answer covered, in words the model can pass on. */
export function describeSpan(span: SeasonSpan): string {
  const lines = [`Seasons covered: ${span.parts.map((p) => `${p.name} ${seasonList(p.seasons)}`).join("; then ")}.`];
  const former = span.parts.filter((p) => p !== span.asked);
  if (former.length) lines.push(`${span.asked.name} was called ${former.map((p) => p.name).join(", then ")} before ${seasonLabel(span.asked.seasons[0])}; those seasons are included as the same league.`);
  if (span.formerLeftOut.length) lines.push(`Left out on request: the seasons under its former name ${span.formerLeftOut.map((p) => `${p.name} (${seasonList(p.seasons)})`).join(", ")}.`);
  if (span.renamedTo && span.nowCalled) {
    const later = span.nowCalled === span.renamedTo ? "" : `, and it is now ${span.nowCalled.name}`;
    lines.push(`From ${seasonLabel(span.renamedTo.seasons[0])} this league is called ${span.renamedTo.name}${later}; those seasons are not included (ask about ${span.nowCalled.name} for the league's full history).`);
  }
  for (const n of span.namesakes) {
    const what = n.renamedTo ? ` (it is now ${n.renamedTo.name})` : n.former.length ? ` (it was ${n.former.map((f) => f.name).join(" / ")} before ${seasonLabel(n.series.seasons[0])})` : "";
    lines.push(`Not included: ${n.series.name} ${seasonList(n.series.seasons)} is a different league with the same name${what}.`);
  }
  return lines.join(" ");
}

/** league_id → "2019-20" (or "2019-20 NBL Division Two" when the span mixes names), stops included. */
export async function seasonTags(span: SeasonSpan): Promise<Map<string, string>> {
  const comps = await visibleCompetitions();
  const out = new Map<string, string>();
  for (const p of span.parts) for (const s of p.seasons) {
    const tag = span.parts.length > 1 ? `${seasonLabel(s)} ${p.name}` : seasonLabel(s);
    out.set(s.league_id, tag);
    for (const child of comps.filter((c) => c.parent_league_id === s.league_id)) out.set(child.league_id, tag);
  }
  return out;
}

/**
 * Every row of a query, not just the first thousand: PostgREST caps a single
 * response at 1,000 rows whatever `.limit()` says, and a league's game log
 * is bigger than that, so a one-shot read silently drops the oldest games.
 */
async function allRows<T>(label: string, make: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>, max = 30000): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; from < max; from += size) {
    const { data, error } = await make(from, from + size - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

// ---------- results and standings ----------

export interface ResultRow {
  game_key: string;
  league_id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  match_time: string | null;
  game_status: string | null;
  competition_name?: string | null;
}

export async function finalResults(leagueIds: string[], max = 3000): Promise<ResultRow[]> {
  return allRows<ResultRow>("results", (from, to) => db
    .from("v_game_results")
    .select("game_key, league_id, home_team, away_team, home_score, away_score, match_time, game_status, competition_name")
    .in("league_id", leagueIds)
    .eq("game_status", "Final")
    .order("match_time", { ascending: false })
    .range(from, to), max);
}

export interface StandingRow {
  team: string;
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  last5: string;
  streak: string;
}

export function computeStandings(results: ResultRow[]): StandingRow[] {
  const rec = new Map<string, { wins: number; losses: number; pf: number; pa: number; form: string[] }>();
  const get = (t: string) => {
    let r = rec.get(t);
    if (!r) { r = { wins: 0, losses: 0, pf: 0, pa: 0, form: [] }; rec.set(t, r); }
    return r;
  };
  // Results arrive newest first; form reads oldest → newest.
  for (const g of [...results].reverse()) {
    if (g.home_score == null || g.away_score == null) continue;
    const h = get(g.home_team), a = get(g.away_team);
    h.pf += g.home_score; h.pa += g.away_score; a.pf += g.away_score; a.pa += g.home_score;
    if (g.home_score > g.away_score) { h.wins++; a.losses++; h.form.push("W"); a.form.push("L"); }
    else { a.wins++; h.losses++; a.form.push("W"); h.form.push("L"); }
  }
  const rows = Array.from(rec.entries()).map(([team, r]) => {
    const last = r.form.slice(-5);
    let streakN = 0;
    const streakK = r.form[r.form.length - 1];
    for (let i = r.form.length - 1; i >= 0 && r.form[i] === streakK; i--) streakN++;
    return { team, wins: r.wins, losses: r.losses, pf: r.pf, pa: r.pa, last5: last.join(""), streak: streakK ? `${streakK}${streakN}` : "" };
  });
  return rows.sort((a, b) => {
    const ap = a.wins / Math.max(1, a.wins + a.losses), bp = b.wins / Math.max(1, b.wins + b.losses);
    if (bp !== ap) return bp - ap;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (b.pf - b.pa) - (a.pf - a.pa);
  });
}

// ---------- game logs (players and teams) ----------

export interface PlayerGame {
  game_key: string; league_id: string; player_id: string | null; player_name: string; team_name: string;
  game_date: string | null; hometeam: string | null; awayteam: string | null; side: string | null;
  min: string | null; pts: number; ast: number; reb: number; oreb: number; dreb: number; stl: number; blk: number; tov: number; pf: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; plus_minus: number | null;
  pitp: number | null; fastbreak_pts: number | null; second_chance_pts: number | null; starter: boolean | null;
}

const PLAYER_GAME_COLS = "game_key, league_id, player_id, player_name, team_name, game_date, hometeam, awayteam, side, min, pts, ast, reb, oreb, dreb, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta, plus_minus, pitp, fastbreak_pts, second_chance_pts, starter";

export async function playerGames(leagueIds: string[], opts: { player?: string; team?: string; limit?: number } = {}): Promise<PlayerGame[]> {
  return allRows<PlayerGame>("player games", (from, to) => {
    let q = db.from("v_player_game_log").select(PLAYER_GAME_COLS).in("league_id", leagueIds);
    if (opts.player) q = q.ilike("player_name", `%${opts.player}%`);
    if (opts.team) q = q.ilike("team_name", `%${opts.team}%`);
    return q.order("game_date", { ascending: false }).range(from, to);
  }, opts.limit ?? 30000);
}

/** playerGames over many seasons: one paged read per season, run side by side. */
export async function playerGamesAcross(leagueIds: string[], opts: { team?: string } = {}): Promise<PlayerGame[]> {
  return (await Promise.all(Array.from(new Set(leagueIds)).map((id) => playerGames([id], opts)))).flat();
}

/** One player's games, by every player id they have, in whatever competition. */
export async function playerGamesById(playerIds: string[]): Promise<PlayerGame[]> {
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  if (!ids.length) return [];
  return allRows<PlayerGame>("player career", (from, to) => db.from("v_player_game_log").select(PLAYER_GAME_COLS)
    .in("player_id", ids.slice(0, 150)).order("game_date", { ascending: false }).range(from, to), 5000);
}

/**
 * The best single games for one column, sorted by the database, so an
 * all-time record across ten seasons is one small read rather than 35,000
 * box-score rows. Earlier games win ties (the first to reach the mark).
 */
export async function topPlayerGames(leagueIds: string[], col: string, opts: { team?: string; limit: number }): Promise<PlayerGame[]> {
  let q = db.from("v_player_game_log").select(PLAYER_GAME_COLS).in("league_id", leagueIds).not(col, "is", null);
  if (opts.team) q = q.ilike("team_name", `%${opts.team}%`);
  const { data, error } = await q.order(col, { ascending: false }).order("game_date", { ascending: true }).limit(opts.limit);
  if (error) throw new Error(`records: ${error.message}`);
  return (data || []) as PlayerGame[];
}

export async function topTeamGames(leagueIds: string[], col: string, opts: { team?: string; limit: number }): Promise<TeamGame[]> {
  let q = db.from("v_team_game_log").select(TEAM_GAME_COLS).in("league_id", leagueIds).not(col, "is", null);
  if (opts.team) q = q.ilike("team_name", `%${opts.team}%`);
  const { data, error } = await q.order(col, { ascending: false }).order("game_date", { ascending: true }).limit(opts.limit);
  if (error) throw new Error(`team records: ${error.message}`);
  return (data || []) as TeamGame[];
}

// ---------- the same person across seasons ----------

/** player_id → identity id, for ids linked across seasons and clubs (player_identity_members). */
export async function identityOf(playerIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(playerIds.filter((x): x is string => !!x)));
  const out = new Map<string, string>();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const res = await Promise.all(chunks.map((c) => db.from("player_identity_members").select("player_id, identity_id").in("player_id", c)));
  for (const r of res) {
    if (r.error) { console.warn(`[ask-swish] identities: ${r.error.message}`); continue; }
    for (const row of (r.data || []) as Array<{ player_id: string; identity_id: string }>) out.set(row.player_id, row.identity_id);
  }
  return out;
}

/** Every player id that shares a linked identity with one of these (the ids themselves included). */
export async function identityMates(playerIds: string[]): Promise<string[]> {
  const identities = Array.from(new Set(Array.from((await identityOf(playerIds)).values())));
  if (!identities.length) return playerIds;
  const { data, error } = await db.from("player_identity_members").select("player_id").in("identity_id", identities.slice(0, 150));
  if (error) { console.warn(`[ask-swish] identity mates: ${error.message}`); return playerIds; }
  return Array.from(new Set([...playerIds, ...((data || []) as Array<{ player_id: string }>).map((r) => r.player_id)]));
}

/**
 * A full name reduced for matching people: "José  Smith-Jones" → "jose smith jones".
 * Null for initial-only names ("J. Smith"), which are too vague to join on.
 */
export function personKey(name: string | null | undefined): string | null {
  const k = (name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = k.split(" ");
  return parts.length >= 2 && parts[0].length > 1 ? k : null;
}

/**
 * Group box-score rows by person across seasons: ids joined by a linked
 * identity, and ids with the identical full name (the player profile pages
 * merge by name too, so a career total here matches the profile).
 */
export function personGrouper(rows: Array<{ player_id: string | null; player_name: string }>, identity: Map<string, string>): (row: { player_id: string | null; player_name: string }) => string {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const r of rows) {
    if (!r.player_id) continue;
    const p = `p:${r.player_id}`;
    if (!parent.has(p)) parent.set(p, p);
    const ident = identity.get(r.player_id);
    if (ident) union(p, `i:${ident}`);
    const name = personKey(r.player_name);
    if (name) union(p, `n:${name}`);
  }
  return (r) => (r.player_id ? find(`p:${r.player_id}`) : `n:${personKey(r.player_name) ?? r.player_name.toLowerCase()}`);
}

export interface TeamGame {
  game_key: string; league_id: string; team_name: string; side: string | null; game_date: string | null;
  hometeam: string | null; awayteam: string | null; score: number | null;
  pts: number; ast: number; reb: number; oreb: number; dreb: number; stl: number; blk: number; tov: number; pf: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  pitp: number | null; fastbreak_pts: number | null; second_chance_pts: number | null; pts_off_turnovers: number | null; bench_pts: number | null;
}

const TEAM_GAME_COLS = "game_key, league_id, team_name, side, game_date, hometeam, awayteam, score, pts, ast, reb, oreb, dreb, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta, pitp, fastbreak_pts, second_chance_pts, pts_off_turnovers, bench_pts";

export async function teamGames(leagueIds: string[], opts: { team?: string; limit?: number } = {}): Promise<TeamGame[]> {
  return allRows<TeamGame>("team games", (from, to) => {
    let q = db.from("v_team_game_log").select(TEAM_GAME_COLS).in("league_id", leagueIds);
    if (opts.team) q = q.ilike("team_name", `%${opts.team}%`);
    return q.order("game_date", { ascending: false }).range(from, to);
  }, opts.limit ?? 6000);
}

export async function teamGamesAcross(leagueIds: string[], opts: { team?: string } = {}): Promise<TeamGame[]> {
  return (await Promise.all(Array.from(new Set(leagueIds)).map((id) => teamGames([id], opts)))).flat();
}

export interface AdvancedGame {
  game_key: string; league_id: string; player_id?: string | null; player_name?: string; team_name: string; game_date: string | null;
  min?: string | null; pts?: number | null;
  off_rating: number | null; def_rating: number | null; net_rating: number | null; efg_percent: number | null; ts_percent: number | null;
  usage_percent?: number | null; pie: number | null; pace?: number | null; ast_percent: number | null; reb_percent: number | null;
  tov_percent: number | null; three_point_rate: number | null; oreb_percent: number | null; dreb_percent: number | null;
  ft_rate?: number | null; opp_efg_percent?: number | null; opp_tov_percent?: number | null; possessions?: number | null;
}

export async function playerAdvanced(leagueIds: string[], opts: { player?: string; team?: string } = {}): Promise<AdvancedGame[]> {
  return allRows<AdvancedGame>("player advanced", (from, to) => {
    let q = db.from("v_player_advanced_game")
      .select("game_key, league_id, player_id, player_name, team_name, game_date, min, pts, off_rating, def_rating, net_rating, efg_percent, ts_percent, usage_percent, pie, ast_percent, reb_percent, tov_percent, three_point_rate, oreb_percent, dreb_percent")
      .in("league_id", leagueIds);
    if (opts.player) q = q.ilike("player_name", `%${opts.player}%`);
    if (opts.team) q = q.ilike("team_name", `%${opts.team}%`);
    return q.order("game_date", { ascending: false }).range(from, to);
  });
}

export async function teamAdvanced(leagueIds: string[], opts: { team?: string } = {}): Promise<AdvancedGame[]> {
  return allRows<AdvancedGame>("team advanced", (from, to) => {
    let q = db.from("v_team_advanced_game")
      .select("game_key, league_id, team_name, game_date, off_rating, def_rating, net_rating, efg_percent, ts_percent, pie, pace, ast_percent, reb_percent, tov_percent, three_point_rate, oreb_percent, dreb_percent, ft_rate, opp_efg_percent, opp_tov_percent, possessions")
      .in("league_id", leagueIds);
    if (opts.team) q = q.ilike("team_name", `%${opts.team}%`);
    return q.order("game_date", { ascending: false }).range(from, to);
  }, 6000);
}

// ---------- schedule and games ----------

export interface ScheduleRow {
  game_key: string; league_id: string; hometeam: string | null; awayteam: string | null;
  matchtime: string | null; status: string | null; competitionname: string | null;
}

export async function schedule(leagueIds: string[] | null, from: Date, to: Date, team?: string): Promise<ScheduleRow[]> {
  let q = db.from("game_schedule")
    .select("game_key, league_id, hometeam, awayteam, matchtime, status, competitionname")
    .gte("matchtime", from.toISOString()).lte("matchtime", to.toISOString());
  if (leagueIds) q = q.in("league_id", leagueIds);
  else q = q.not("league_id", "is", null);
  if (team) q = q.or(`hometeam.ilike.%${team}%,awayteam.ilike.%${team}%`);
  const { data, error } = await q.order("matchtime", { ascending: true }).limit(400);
  if (error) throw new Error(`schedule: ${error.message}`);
  return (data || []) as ScheduleRow[];
}

export async function resultsByKeys(keys: string[]): Promise<Map<string, ResultRow>> {
  if (!keys.length) return new Map();
  const { data, error } = await db
    .from("v_game_results")
    .select("game_key, league_id, home_team, away_team, home_score, away_score, match_time, game_status, competition_name")
    .in("game_key", keys.slice(0, 400));
  if (error) throw new Error(`results by key: ${error.message}`);
  return new Map(((data || []) as ResultRow[]).map((r) => [r.game_key, r]));
}

export async function gameDetail(gameKey: string): Promise<Record<string, any> | null> {
  const { data, error } = await db.from("v_game_detail").select("*").eq("game_key", gameKey).maybeSingle();
  if (error) throw new Error(`game detail: ${error.message}`);
  return data;
}

export async function boxScore(gameKey: string): Promise<Record<string, any>[]> {
  const { data, error } = await db
    .from("v_box_score")
    .select("player_id, player_name, team_name, starter, minutes, points, assists, rebounds, steals, blocks, turnovers, fgm, fga, three_pm, three_pa, ftm, fta, plus_minus, efficiency")
    .eq("game_key", gameKey)
    .order("points", { ascending: false });
  if (error) throw new Error(`box score: ${error.message}`);
  return data || [];
}

/** "final" | "live" | "upcoming" from the schedule status, the clock and whether a score exists. */
export function gameState(status: string | null | undefined, matchTime: string | null | undefined, hasScore: boolean): "final" | "live" | "upcoming" {
  const s = (status || "").toLowerCase();
  if (s.includes("final") || s === "complete" || s === "completed") return "final";
  const tip = matchTime ? new Date(matchTime).getTime() : null;
  const now = Date.now();
  if (s.includes("progress") || s === "live" || s.includes("half") || /^q\d/.test(s)) return "live";
  if (hasScore && tip != null && now - tip > 3 * 60 * 60 * 1000) return "final";
  if (hasScore && tip != null && now > tip) return "live";
  return "upcoming";
}

// ---------- players, teams, on/off, play-by-play ----------

export interface PlayerRow { id: string; full_name: string; team_name: string | null; league_id: string | null; slug: string | null; position: string | null }

export async function findPlayers(name: string, leagueIds: string[] | null, limit = 25): Promise<PlayerRow[]> {
  let q = db.from("players").select("id, full_name, team_name, league_id, slug, position").ilike("full_name", `%${name}%`);
  if (leagueIds) q = q.in("league_id", leagueIds);
  const { data, error } = await q.limit(limit);
  if (error) throw new Error(`players: ${error.message}`);
  return (data || []) as PlayerRow[];
}

// ---------- shot locations ----------

export interface ShotRow {
  game_key: string; league_id: string; player_id: string | null; player_name: string | null;
  team_no: number | null; x: number; y: number; success: boolean; shot_type: string | null;
}

/** Field-goal attempts with a court position (free throws are not in shot_chart). */
export async function shots(leagueIds: string[], opts: { playerIds?: string[]; gameKeys?: string[] } = {}): Promise<ShotRow[]> {
  return allRows<ShotRow>("shots", (from, to) => {
    let q = db.from("shot_chart").select("game_key, league_id, player_id, player_name, team_no, x, y, success, shot_type").in("league_id", leagueIds);
    if (opts.playerIds?.length) q = q.in("player_id", opts.playerIds);
    if (opts.gameKeys?.length) q = q.in("game_key", opts.gameKeys);
    return q.order("id", { ascending: true }).range(from, to);
  }, 60000);
}

/** The competition a player's most recently recorded shot came from. */
export async function latestShotLeague(playerIds: string[], leagueIds: string[]): Promise<string | null> {
  if (!playerIds.length) return null;
  const { data, error } = await db.from("shot_chart").select("league_id").in("player_id", playerIds).in("league_id", leagueIds).order("id", { ascending: false }).limit(1);
  if (error) throw new Error(`shots: ${error.message}`);
  return (data?.[0]?.league_id as string | undefined) ?? null;
}

export interface OnOffRow {
  league_id: string; player_id: string; player_name: string; team_id: string | null; games: number;
  on_minutes: number | null; off_minutes: number | null; on_nrtg: number | null; off_nrtg: number | null;
  on_ortg: number | null; off_ortg: number | null; on_drtg: number | null; off_drtg: number | null;
  raw_net_swing: number | null; adjusted_net_swing: number | null; sample_confidence: string | null;
  is_leaderboard_eligible: boolean | null; impact_summary_label: string | null;
}

/**
 * On/off per player for a competition, from player_on_off_season: one row per
 * (competition, team, player), filled by refresh_player_on_off, which the
 * lineup builder runs after every game. It is the table the player page's
 * on/off panel reads, so Ask quotes the same numbers. (The per-game
 * player_on_off view recomputes "off" and team totals for every game in the
 * database on each read and times out for a whole league.)
 *
 * A player with several rows in the family (moved team, or parent + child
 * competitions) has his counts summed and the ratings recomputed with the
 * table's formulas. Eligibility is the table's qualifying rule: 100 on-court
 * and 50 off-court possessions. Confidence is Low when not qualified, High
 * from 150 on-court minutes over 5 games.
 */
export async function onOffProfiles(leagueIds: string[], opts: { player?: string; teamId?: string; eligibleOnly?: boolean } = {}): Promise<OnOffRow[]> {
  if (!leagueIds.length) return [];
  type Row = {
    league_id: string; team_id: string; player_id: string; player_name: string | null; games: number;
    on_secs: number; off_secs: number; on_poss_for: number; off_poss_for: number; on_poss_against: number; off_poss_against: number;
    on_pts_for: number; off_pts_for: number; on_pts_against: number; off_pts_against: number;
  };
  const rows = await allRows<Row>("on/off", (from, to) => {
    let q = db.from("player_on_off_season")
      .select("league_id, team_id, player_id, player_name, games, on_secs, off_secs, on_poss_for, off_poss_for, on_poss_against, off_poss_against, on_pts_for, off_pts_for, on_pts_against, off_pts_against")
      .in("league_id", leagueIds);
    if (opts.player) q = q.ilike("player_name", `%${opts.player}%`);
    if (opts.teamId) q = q.eq("team_id", opts.teamId);
    return q.order("league_id").order("team_id").order("player_id").range(from, to);
  }, 10000);
  const KEYS = ["on_secs", "off_secs", "on_poss_for", "off_poss_for", "on_poss_against", "off_poss_against", "on_pts_for", "off_pts_for", "on_pts_against", "off_pts_against"] as const;
  type Sum = Record<(typeof KEYS)[number], number> & { name: string; league: string; team: string; teamSecs: number; games: number };
  const by = new Map<string, Sum>();
  for (const r of rows) {
    const e = by.get(r.player_id) ?? { name: r.player_name ?? "", league: r.league_id, team: r.team_id, teamSecs: -1, games: 0, ...Object.fromEntries(KEYS.map((k) => [k, 0])) } as Sum;
    for (const k of KEYS) e[k] += Number(r[k] ?? 0);
    e.games += r.games ?? 0;
    // Label the player with the team and competition he played most minutes for.
    if (Number(r.on_secs ?? 0) > e.teamSecs) { e.teamSecs = Number(r.on_secs ?? 0); e.team = r.team_id; e.league = r.league_id; if (r.player_name) e.name = r.player_name; }
    by.set(r.player_id, e);
  }
  const rate = (pts: number, poss: number) => (poss > 0 ? (100 * pts) / poss : null);
  const minus = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  const out: OnOffRow[] = [];
  for (const [player_id, e] of Array.from(by.entries())) {
    if (e.on_secs <= 0) continue;
    const on_ortg = rate(e.on_pts_for, e.on_poss_for), off_ortg = rate(e.off_pts_for, e.off_poss_for);
    const on_drtg = rate(e.on_pts_against, e.on_poss_against), off_drtg = rate(e.off_pts_against, e.off_poss_against);
    const on_nrtg = minus(on_ortg, on_drtg), off_nrtg = minus(off_ortg, off_drtg);
    const eligible = (e.on_poss_for + e.on_poss_against) / 2 >= 100 && (e.off_poss_for + e.off_poss_against) / 2 >= 50;
    if (opts.eligibleOnly && !eligible) continue;
    const onMin = e.on_secs / 60;
    out.push({
      league_id: e.league, player_id, player_name: e.name, team_id: e.team, games: e.games,
      on_minutes: onMin, off_minutes: e.off_secs / 60, on_nrtg, off_nrtg, on_ortg, off_ortg, on_drtg, off_drtg,
      raw_net_swing: minus(on_nrtg, off_nrtg), adjusted_net_swing: null,
      sample_confidence: !eligible ? "Low" : onMin >= 150 && e.games >= 5 ? "High" : "Medium",
      is_leaderboard_eligible: eligible, impact_summary_label: null,
    });
  }
  return out;
}

export async function teamIdByName(leagueIds: string[], name: string): Promise<{ team_id: string; name: string } | null> {
  const { data, error } = await db.from("teams").select("team_id, name").in("league_id", leagueIds).limit(200);
  if (error) throw new Error(`teams: ${error.message}`);
  const rows = (data || []) as Array<{ team_id: string; name: string }>;
  return rows.find((t) => isSameTeam(t.name, name)) ?? rows.find((t) => t.name.toLowerCase().includes(name.toLowerCase())) ?? null;
}

export interface LiveEvent {
  action_number: number | null; period: number | null; clock: string | null; player_name: string | null; team_no: number | null;
  action_type: string | null; sub_type: string | null; success: boolean | null; scoring: boolean | null; points: number | null;
  description: string | null; team_score: number | null; opp_score: number | null; score: string | null; team_id: string | null; period_type: string | null;
}

export async function playByPlay(gameKey: string, period?: number): Promise<LiveEvent[]> {
  return allRows<LiveEvent>("play-by-play", (from, to) => {
    let q = db.from("live_events")
      .select("action_number, period, clock, player_name, team_no, action_type, sub_type, success, scoring, points, description, team_score, opp_score, score, team_id, period_type")
      .eq("game_key", gameKey);
    if (period) q = q.eq("period", period);
    return q.order("action_number", { ascending: true }).range(from, to);
  }, 4000);
}

export interface LineupStint {
  game_key: string; team_id: string; lineup_key: string; lineup_names: string[] | null; seconds_played: number | null;
  points_for: number | null; points_against: number | null; possessions_for: number | null; possessions_against: number | null; is_valid_lineup: boolean | null;
  period: number | null; start_action: number | null; end_action: number | null;
}

/** Lineup stints for a competition, or for one game when `leagueIds` is null. */
export async function lineupStints(leagueIds: string[] | null, opts: { gameKey?: string; teamId?: string }): Promise<LineupStint[]> {
  if (!leagueIds && !opts.gameKey) return [];
  return allRows<LineupStint>("lineups", (from, to) => {
    let q = db.from("lineup_stints")
      .select("game_key, team_id, lineup_key, lineup_names, seconds_played, points_for, points_against, possessions_for, possessions_against, is_valid_lineup, period, start_action, end_action")
      .eq("is_valid_lineup", true);
    if (leagueIds) q = q.in("league_id", leagueIds);
    if (opts.gameKey) q = q.eq("game_key", opts.gameKey);
    if (opts.teamId) q = q.eq("team_id", opts.teamId);
    return q.order("id").range(from, to);
  }, 20000);
}

// ---------- small helpers shared by the tools ----------

export const fmt1 = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? "–" : (Math.round(n * 10) / 10).toFixed(1));
export const pct = (m: number, a: number) => (a > 0 ? `${((m / a) * 100).toFixed(1)}%` : "–");
export const mean = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => x != null && !Number.isNaN(Number(x))).map(Number);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
export const sum = (xs: Array<number | null | undefined>) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

/** "25:31" → 25.5 minutes. */
export function minutesOf(min: string | null | undefined): number {
  if (!min) return 0;
  const m = /^(\d+):(\d+)/.exec(min);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  const n = Number(min);
  return Number.isFinite(n) ? n : 0;
}

export function ukTime(iso: string | null | undefined): string {
  if (!iso) return "TBC";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ukDate(iso: string | null | undefined): string {
  if (!iso) return "TBC";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
}

/** "1 Dec 2019" — for answers that span seasons. */
export function ukDateY(iso: string | null | undefined): string {
  if (!iso) return "TBC";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
}

export { isSameTeam, teamClubKey };

/** Newest season first, and within a season the league before its cups and play-offs. */
export function recency(c: Competition): number {
  const knockout = /\b(cup|trophy|shield|play-?offs?|finals?)\b/i.test(c.name);
  return (seasonStart(c) ?? 0) * 10 + (knockout ? 0 : 1);
}
