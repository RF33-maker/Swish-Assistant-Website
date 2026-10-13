import { gamePath, playerPath } from "./seo";

/**
 * The weekend match report: what a competition did over a weekend, built from
 * its box scores with no writing by a person or a model.
 *
 * Everything on the page is a number from a game or a sentence assembled from
 * those numbers by the templates below, so no stat can be invented and every
 * figure links back to the box score it came from. News articles stay human;
 * this is a different kind of page (a scoreboard with the best performances),
 * stored as one `weekendReport` block inside a news article so it appears in
 * News and on the competition page like any other story.
 *
 * `buildWeekendReport` is pure (rows in, report out) so it is the same for the
 * server's generator and the tests. `sanitizeWeekendReport` re-checks a stored
 * report the way sanitizeArticleDoc re-checks a body: nothing here trusts the
 * JSON it is given.
 */

// ── The report ─────────────────────────────────────────────────────────────

/** A player's single-game line, as the trading card shows it. */
export interface ReportPerformer {
  playerId: string;
  /** Null when the player has no public page of their own. */
  slug: string | null;
  name: string;
  team: string | null;
  gameKey: string;
  opponent: string | null;
  /** "W 89-66", from the player's side. */
  result: string | null;
  /** ISO date of the game. */
  gameDate: string | null;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
  /** True shooting, 0–1. */
  tsPct: number | null;
  gameScore: number | null;
  /** Storage paths in the player-photos bucket, resolved to URLs in the browser. */
  photoPath: string | null;
  cutoutPath: string | null;
}

/** The two best lines of a game, shown when its score row is opened. */
export interface ReportStar {
  name: string;
  slug: string | null;
  playerId: string;
  team: string | null;
  pts: number;
  reb: number;
  ast: number;
}

/** A team's best in one category in a game. */
export interface ReportLeader {
  name: string;
  slug: string | null;
  playerId: string;
  value: number;
}

export interface ReportTeamLeaders {
  team: string;
  pts: ReportLeader | null;
  reb: ReportLeader | null;
  ast: ReportLeader | null;
}

/** Points by period for each side; a fifth entry or more is overtime. */
export interface ReportQuarters {
  home: number[];
  away: number[];
}

export interface ReportGame {
  gameKey: string;
  leagueId: string | null;
  competitionSlug: string | null;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  /** ISO tip-off time. */
  matchTime: string | null;
  stars: ReportStar[];
  /** The game in a sentence or two, from its score and period scores. */
  recap?: string;
  quarters?: ReportQuarters | null;
  /** Home side first. */
  leaders?: ReportTeamLeaders[];
}

export type ReportCalloutKind = "closest" | "blowout" | "highest-scoring" | "top-scorer" | "triple-double";

export interface ReportCallout {
  kind: ReportCalloutKind;
  /** A complete sentence made from the numbers. */
  text: string;
  gameKey: string | null;
}

export interface WeekendReportData {
  version: 1;
  competitionName: string;
  competitionSlug: string;
  /** The weekend's first and last day, YYYY-MM-DD. */
  from: string;
  to: string;
  lede: string;
  games: ReportGame[];
  /** Best single-game lines by Game Score, one per player. */
  performances: ReportPerformer[];
  callouts: ReportCallout[];
  generatedAt: string;
}

export const MAX_REPORT_GAMES = 60;
export const MAX_REPORT_PERFORMANCES = 12;
export const MAX_REPORT_CALLOUTS = 8;
export const TOP_PERFORMANCES = 5;
const CLOSE_MARGIN = 5;

// ── Dates ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const isDateOnly = (value: unknown): value is string =>
  typeof value === "string" && DATE_ONLY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const toDateOnly = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The weekend that a day falls in or most recently ended: Friday to Sunday.
 * Monday to Thursday belong to the weekend just gone, so a report generated
 * on a Monday morning covers the weekend that finished the night before.
 */
export function weekendContaining(day: string): { from: string; to: string } {
  const ms = Date.parse(`${day}T00:00:00Z`);
  const dow = new Date(ms).getUTCDay(); // 0 Sun … 6 Sat
  // Mon–Thu look back to the Sunday just gone; Fri and Sat are inside a
  // weekend still being played, so they end on the coming Sunday.
  const sunday = dow === 0 ? ms : dow >= 5 ? ms + (7 - dow) * DAY : ms - dow * DAY;
  return { from: toDateOnly(sunday - 2 * DAY), to: toDateOnly(sunday) };
}

/** "Fri 10 – Sun 12 Oct", or "Fri 30 Oct – Sun 1 Nov" across a month. */
export function formatWeekendRange(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  const part = (d: Date, month: boolean) =>
    `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()}${month ? ` ${MONTHS[d.getUTCMonth()]}` : ""}`;
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return `${part(a, !sameMonth)} – ${part(b, true)}`;
}

/** "Saturday 10 Oct" in UK time, for the day headings in the scoreboard. */
export function formatReportDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/London" });
}

/** The UK calendar day a game was played on, "2026-10-10", for grouping. */
export function reportDayKey(iso: string | null): string {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-CA", { timeZone: "Europe/London" }) : "";
}

// ── Sentences ──────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const margin = (g: ReportGame) => Math.abs(g.homeScore - g.awayScore);
const winnerOf = (g: ReportGame) => (g.homeScore >= g.awayScore ? { name: g.home, score: g.homeScore } : { name: g.away, score: g.awayScore });
const loserOf = (g: ReportGame) => (g.homeScore >= g.awayScore ? { name: g.away, score: g.awayScore } : { name: g.home, score: g.homeScore });
/** "Knights 82-79 Hawks", the winner first. */
export const scoreLine = (g: ReportGame) => `${winnerOf(g).name} ${winnerOf(g).score}-${loserOf(g).score} ${loserOf(g).name}`;

export function weekendReportTitle(competitionName: string, from: string, to: string): string {
  return `${competitionName} weekend round-up: ${formatWeekendRange(from, to)}`;
}

/** A one-sentence summary for cards and search results. */
export function weekendReportSummary(data: WeekendReportData): string {
  const parts = [`${plural(data.games.length, "game")} from the weekend`];
  const closest = data.callouts.find((c) => c.kind === "closest");
  if (closest) parts.push(closest.text.replace(/\.$/, ""));
  const top = data.performances[0];
  if (top) parts.push(`Top performance: ${top.name} with ${top.pts} points, ${top.reb} rebounds and ${top.ast} assists`);
  return `${parts.join(". ")}.`.slice(0, 500);
}

function buildLede(competitionName: string, from: string, to: string, games: ReportGame[]): string {
  if (!games.length) return `No ${competitionName} games were completed between ${formatWeekendRange(from, to)}.`;
  const close = games.filter((g) => margin(g) <= CLOSE_MARGIN).length;
  const sentences = [
    `${games.length === 1 ? "One game was" : `${games.length} games were`} played in ${competitionName} over the weekend of ${formatWeekendRange(from, to)}.`,
  ];
  if (games.length > 1 && close > 0) {
    sentences.push(
      close === games.length
        ? `Every game was decided by ${CLOSE_MARGIN} points or fewer.`
        : `${close === 1 ? "One was" : `${close} were`} decided by ${CLOSE_MARGIN} points or fewer.`,
    );
  }
  const total = games.reduce((sum, g) => sum + g.homeScore + g.awayScore, 0);
  sentences.push(`${total.toLocaleString("en-GB")} points were scored in all.`);
  return sentences.join(" ");
}

function buildCallouts(games: ReportGame[], lines: PlayerLine[], gameByKey: Map<string, ReportGame>): ReportCallout[] {
  const callouts: ReportCallout[] = [];
  if (!games.length) return callouts;

  const closest = games.reduce((best, g) => (margin(g) < margin(best) ? g : best));
  if (games.length > 1 && margin(closest) > 0) {
    callouts.push({ kind: "closest", text: `Closest finish: ${scoreLine(closest)}, decided by ${plural(margin(closest), "point")}.`, gameKey: closest.gameKey });
  }

  const biggest = games.reduce((best, g) => (margin(g) > margin(best) ? g : best));
  if (games.length > 1 && margin(biggest) > margin(closest)) {
    callouts.push({ kind: "blowout", text: `Biggest margin: ${scoreLine(biggest)}, a ${margin(biggest)}-point win.`, gameKey: biggest.gameKey });
  }

  const highest = games.reduce((best, g) => (g.homeScore + g.awayScore > best.homeScore + best.awayScore ? g : best));
  if (games.length >= 3) {
    callouts.push({
      kind: "highest-scoring",
      text: `Highest-scoring game: ${scoreLine(highest)}, ${highest.homeScore + highest.awayScore} points between them.`,
      gameKey: highest.gameKey,
    });
  }

  const scorers = [...lines].sort((a, b) => b.pts - a.pts || (b.gameScore ?? 0) - (a.gameScore ?? 0));
  const topScorer = scorers[0];
  if (topScorer && topScorer.pts > 0) {
    const game = gameByKey.get(topScorer.gameKey);
    const opp = game ? (game.home === topScorer.team ? game.away : game.home) : null;
    callouts.push({
      kind: "top-scorer",
      text: `Most points: ${topScorer.name} scored ${topScorer.pts}${topScorer.team ? ` for ${topScorer.team}` : ""}${opp ? ` against ${opp}` : ""}.`,
      gameKey: topScorer.gameKey,
    });
  }

  const tripleDoubles = lines.filter((l) => l.pts >= 10 && l.reb >= 10 && l.ast >= 10);
  for (const l of tripleDoubles.slice(0, 3)) {
    callouts.push({
      kind: "triple-double",
      text: `Triple-double: ${l.name} had ${l.pts} points, ${l.reb} rebounds and ${l.ast} assists.`,
      gameKey: l.gameKey,
    });
  }

  return callouts.slice(0, MAX_REPORT_CALLOUTS);
}

// ── One game's summary ─────────────────────────────────────────────────────

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * The period scores, when they add up. Four periods have to reach the final
 * score, or both sides have to be level after four (the rest is overtime, one
 * extra entry for all of it). Anything else is a feed error, so it's left out
 * rather than shown wrong.
 */
export function reconcileQuarters(row: GameRow, homeScore: number, awayScore: number): ReportQuarters | null {
  const h = [row.home_q1, row.home_q2, row.home_q3, row.home_q4];
  const a = [row.away_q1, row.away_q2, row.away_q3, row.away_q4];
  if (![...h, ...a].every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)) return null;
  const home = h as number[];
  const away = a as number[];
  const regH = sum(home);
  const regA = sum(away);
  if (regH === homeScore && regA === awayScore) return { home, away };
  if (regH === regA && homeScore >= regH && awayScore >= regA && homeScore - regH > 0 && awayScore - regA > 0) {
    return { home: [...home, homeScore - regH], away: [...away, awayScore - regA] };
  }
  return null;
}

/** Team leaders (points, rebounds, assists) for a game, home side first. */
function teamLeaders(game: ReportGame, lines: PlayerLine[]): ReportTeamLeaders[] {
  const best = (team: string, key: "pts" | "reb" | "ast"): ReportLeader | null => {
    const top = lines
      .filter((l) => sameTeam(l.team, team) && l[key] > 0)
      .sort((x, y) => y[key] - x[key] || (y.gameScore ?? -1) - (x.gameScore ?? -1))[0];
    return top ? { name: top.name, slug: top.slug, playerId: top.playerId, value: top[key] } : null;
  };
  return [game.home, game.away].map((team) => ({ team, pts: best(team, "pts"), reb: best(team, "reb"), ast: best(team, "ast") }));
}

/** "Knights beat Hawks 82-79. Decided by 3 points. Hawks led 41-38 at half, but …", from the numbers. */
export function gameRecap(game: ReportGame): string {
  const w = winnerOf(game);
  const l = loserOf(game);
  const diff = margin(game);
  const parts: string[] = [];
  if (diff === 0) parts.push(`${game.home} and ${game.away} finished level at ${game.homeScore}.`);
  else {
    parts.push(`${w.name} beat ${l.name} ${w.score}-${l.score}.`);
    if (diff <= CLOSE_MARGIN) parts.push(`It was decided by ${plural(diff, "point")}.`);
    else if (diff >= 20) parts.push(`It was a ${diff}-point win.`);
  }
  const q = game.quarters;
  if (q) {
    const halfH = q.home[0] + q.home[1];
    const halfA = q.away[0] + q.away[1];
    const overtime = q.home.length > 4;
    if (halfH === halfA) parts.push(`It was level at ${halfH}-${halfA} at half.`);
    else {
      const half = halfH > halfA ? { name: game.home, s: halfH, o: halfA } : { name: game.away, s: halfA, o: halfH };
      const wonHalf = diff !== 0 && half.name === w.name;
      if (diff === 0 || wonHalf) parts.push(`${half.name} led ${half.s}-${half.o} at half.`);
      else if (overtime) parts.push(`${half.name} led ${half.s}-${half.o} at half, but ${w.name} won in overtime.`);
      else parts.push(`${half.name} led ${half.s}-${half.o} at half, but ${w.name} outscored them ${w.score - (half.name === game.home ? halfA : halfH)}-${l.score - half.s} after the break.`);
    }
    if (overtime && !parts.some((p) => p.includes("overtime"))) parts.push("It went to overtime.");
  }
  return parts.join(" ");
}

// ── Building ───────────────────────────────────────────────────────────────

/** A completed game, as v_game_results returns it. */
export interface GameRow {
  game_key: string;
  league_id: string | null;
  home_team: string | null;
  away_team: string | null;
  home_score: number | null;
  away_score: number | null;
  match_time: string | null;
  home_q1?: number | null;
  home_q2?: number | null;
  home_q3?: number | null;
  home_q4?: number | null;
  away_q1?: number | null;
  away_q2?: number | null;
  away_q3?: number | null;
  away_q4?: number | null;
}

/** One player's line in one game, with the enrichment the server adds. */
export interface PlayerLine {
  playerId: string;
  slug: string | null;
  name: string;
  team: string | null;
  gameKey: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
  tsPct: number | null;
  gameScore: number | null;
  photoPath: string | null;
  cutoutPath: string | null;
}

export interface BuildWeekendReportInput {
  competition: { name: string; slug: string };
  from: string;
  to: string;
  games: GameRow[];
  lines: PlayerLine[];
  /** A game's league id → the slug its own page lives under (child competitions have their own). */
  competitionSlugByLeague?: Record<string, string>;
  now?: Date;
}

const sameTeam = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Rows in, report out. Games without a real final score are left out. */
export function buildWeekendReport(input: BuildWeekendReportInput): WeekendReportData {
  const { competition, from, to, competitionSlugByLeague = {} } = input;

  const games: ReportGame[] = input.games
    .filter(
      (g): g is GameRow & { home_score: number; away_score: number; home_team: string; away_team: string } =>
        !!g.game_key &&
        !!g.home_team &&
        !!g.away_team &&
        typeof g.home_score === "number" &&
        typeof g.away_score === "number" &&
        g.home_score + g.away_score > 0,
    )
    .map((g) => ({
      gameKey: g.game_key,
      leagueId: g.league_id,
      competitionSlug: (g.league_id && competitionSlugByLeague[g.league_id]) || competition.slug,
      home: g.home_team,
      away: g.away_team,
      homeScore: g.home_score,
      awayScore: g.away_score,
      matchTime: g.match_time,
      stars: [],
      quarters: reconcileQuarters(g, g.home_score, g.away_score),
    }))
    .sort((a, b) => (a.matchTime ?? "").localeCompare(b.matchTime ?? "") || a.gameKey.localeCompare(b.gameKey))
    .slice(0, MAX_REPORT_GAMES);

  const gameByKey = new Map(games.map((g) => [g.gameKey, g]));
  const lines = input.lines.filter((l) => gameByKey.has(l.gameKey));

  // Each game's two best lines, for the expanded score row.
  const linesByGame = new Map<string, PlayerLine[]>();
  for (const l of lines) linesByGame.set(l.gameKey, [...(linesByGame.get(l.gameKey) ?? []), l]);
  for (const g of games) {
    const best = [...(linesByGame.get(g.gameKey) ?? [])].sort((a, b) => (b.gameScore ?? -1) - (a.gameScore ?? -1)).slice(0, 2);
    g.leaders = teamLeaders(g, linesByGame.get(g.gameKey) ?? []);
    g.recap = gameRecap(g);
    g.stars = best.map((l) => ({ name: l.name, slug: l.slug, playerId: l.playerId, team: l.team, pts: l.pts, reb: l.reb, ast: l.ast }));
  }

  // The weekend's best lines, one per player.
  const seen = new Set<string>();
  const performances: ReportPerformer[] = [];
  for (const l of [...lines].sort((a, b) => (b.gameScore ?? -1) - (a.gameScore ?? -1))) {
    if (l.gameScore == null || seen.has(l.playerId)) continue;
    seen.add(l.playerId);
    const g = gameByKey.get(l.gameKey)!;
    const home = sameTeam(g.home, l.team);
    const mine = home ? g.homeScore : g.awayScore;
    const theirs = home ? g.awayScore : g.homeScore;
    const knownSide = home || sameTeam(g.away, l.team);
    performances.push({
      ...l,
      opponent: knownSide ? (home ? g.away : g.home) : null,
      result: knownSide ? `${mine > theirs ? "W" : mine < theirs ? "L" : "T"} ${mine}-${theirs}` : null,
      gameDate: g.matchTime,
    });
    if (performances.length >= TOP_PERFORMANCES) break;
  }

  const data: WeekendReportData = {
    version: 1,
    competitionName: competition.name,
    competitionSlug: competition.slug,
    from,
    to,
    lede: buildLede(competition.name, from, to, games),
    games,
    performances,
    callouts: buildCallouts(games, lines, gameByKey),
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
  return data;
}

// ── Reading a stored report back ───────────────────────────────────────────

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const textOrNull = (value: unknown, max: number): string | null => text(value, max) || null;
const whole = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(9999, Math.round(value))) : 0);
const wholeOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? whole(value) : null);
const ratioOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1.5, value)) : null;
const scoreOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(-100, Math.min(500, value)) : null;
const slugOrNull = (value: unknown): string | null => {
  const v = text(value, 200);
  return /^[a-z0-9][a-z0-9._-]*$/i.test(v) ? v : null;
};
const isoOrNull = (value: unknown): string | null => {
  const v = text(value, 40);
  return v && !Number.isNaN(Date.parse(v)) ? v : null;
};
/** A path inside the player-photos bucket: no scheme, no climbing out of it. */
const storagePathOrNull = (value: unknown): string | null => {
  const v = text(value, 300);
  return v && /^[\w][\w./%() -]*$/.test(v) && !v.includes("..") ? v : null;
};
const id = (value: unknown): string => text(value, 100).replace(/[^\w-]/g, "");

const sanitizeLeader = (raw: any): ReportLeader | null => {
  const name = text(raw?.name, 200);
  return name && typeof raw?.value === "number" ? { name, slug: slugOrNull(raw.slug), playerId: id(raw.playerId), value: whole(raw.value) } : null;
};

const sanitizeTeamLeaders = (raw: any): ReportTeamLeaders | null => {
  const team = text(raw?.team, 200);
  return team ? { team, pts: sanitizeLeader(raw.pts), reb: sanitizeLeader(raw.reb), ast: sanitizeLeader(raw.ast) } : null;
};

const sanitizeQuarters = (raw: any): ReportQuarters | null => {
  const side = (v: unknown) => (Array.isArray(v) && v.length >= 4 && v.length <= 12 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? v.map(whole) : null);
  const home = side(raw?.home);
  const away = side(raw?.away);
  return home && away && home.length === away.length ? { home, away } : null;
};

/** Rebuilds a report from scratch, keeping only fields it knows. Null when the input isn't a report. */
export function sanitizeWeekendReport(input: unknown): WeekendReportData | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, any>;
  if (raw.version !== 1 || !isDateOnly(raw.from) || !isDateOnly(raw.to)) return null;
  const competitionSlug = slugOrNull(raw.competitionSlug);
  const competitionName = text(raw.competitionName, 200);
  if (!competitionSlug || !competitionName) return null;

  const games: ReportGame[] = (Array.isArray(raw.games) ? raw.games : [])
    .slice(0, MAX_REPORT_GAMES)
    .map((g: any): ReportGame | null => {
      const gameKey = id(g?.gameKey);
      const home = text(g?.home, 200);
      const away = text(g?.away, 200);
      if (!gameKey || !home || !away || typeof g?.homeScore !== "number" || typeof g?.awayScore !== "number") return null;
      return {
        gameKey,
        leagueId: textOrNull(g.leagueId, 60),
        competitionSlug: slugOrNull(g.competitionSlug),
        home,
        away,
        homeScore: whole(g.homeScore),
        awayScore: whole(g.awayScore),
        matchTime: isoOrNull(g.matchTime),
        recap: text(g.recap, 600),
        quarters: sanitizeQuarters(g.quarters),
        leaders: (Array.isArray(g.leaders) ? g.leaders : []).slice(0, 2).map(sanitizeTeamLeaders).filter((l: ReportTeamLeaders | null): l is ReportTeamLeaders => !!l),
        stars: (Array.isArray(g.stars) ? g.stars : [])
          .slice(0, 3)
          .map((s: any): ReportStar | null => {
            const name = text(s?.name, 200);
            return name ? { name, slug: slugOrNull(s.slug), playerId: id(s.playerId), team: textOrNull(s.team, 200), pts: whole(s.pts), reb: whole(s.reb), ast: whole(s.ast) } : null;
          })
          .filter((s: ReportStar | null): s is ReportStar => !!s),
      };
    })
    .filter((g: ReportGame | null): g is ReportGame => !!g);

  const performances: ReportPerformer[] = (Array.isArray(raw.performances) ? raw.performances : [])
    .slice(0, MAX_REPORT_PERFORMANCES)
    .map((p: any): ReportPerformer | null => {
      const name = text(p?.name, 200);
      const gameKey = id(p?.gameKey);
      if (!name || !gameKey) return null;
      return {
        playerId: id(p.playerId),
        slug: slugOrNull(p.slug),
        name,
        team: textOrNull(p.team, 200),
        gameKey,
        opponent: textOrNull(p.opponent, 200),
        result: textOrNull(p.result, 30),
        gameDate: isoOrNull(p.gameDate),
        pts: whole(p.pts),
        reb: whole(p.reb),
        ast: whole(p.ast),
        stl: whole(p.stl),
        blk: whole(p.blk),
        tov: whole(p.tov),
        fgm: wholeOrNull(p.fgm),
        fga: wholeOrNull(p.fga),
        tpm: wholeOrNull(p.tpm),
        tpa: wholeOrNull(p.tpa),
        ftm: wholeOrNull(p.ftm),
        fta: wholeOrNull(p.fta),
        tsPct: ratioOrNull(p.tsPct),
        gameScore: scoreOrNull(p.gameScore),
        photoPath: storagePathOrNull(p.photoPath),
        cutoutPath: storagePathOrNull(p.cutoutPath),
      };
    })
    .filter((p: ReportPerformer | null): p is ReportPerformer => !!p);

  const kinds: ReportCalloutKind[] = ["closest", "blowout", "highest-scoring", "top-scorer", "triple-double"];
  const callouts: ReportCallout[] = (Array.isArray(raw.callouts) ? raw.callouts : [])
    .slice(0, MAX_REPORT_CALLOUTS)
    .map((c: any): ReportCallout | null => {
      const body = text(c?.text, 400);
      return body && kinds.includes(c?.kind) ? { kind: c.kind, text: body, gameKey: id(c.gameKey) || null } : null;
    })
    .filter((c: ReportCallout | null): c is ReportCallout => !!c);

  return {
    version: 1,
    competitionName,
    competitionSlug,
    from: raw.from,
    to: raw.to,
    lede: text(raw.lede, 600),
    games,
    performances,
    callouts,
    generatedAt: isoOrNull(raw.generatedAt) ?? new Date(0).toISOString(),
  };
}

// ── Other renderings: search text and server-rendered HTML ─────────────────

/** The report as plain text, for news_articles.body (search and descriptions). */
export function weekendReportToPlainText(data: WeekendReportData): string {
  const blocks = [data.lede];
  if (data.games.length) blocks.push(data.games.map((g) => `${g.home} ${g.homeScore}-${g.awayScore} ${g.away}`).join("\n"));
  if (data.callouts.length) blocks.push(data.callouts.map((c) => c.text).join("\n"));
  if (data.performances.length) {
    blocks.push(
      "Top performances\n" +
        data.performances.map((p) => `${p.name}${p.team ? ` (${p.team})` : ""}: ${p.pts} pts, ${p.reb} reb, ${p.ast} ast`).join("\n"),
    );
  }
  return blocks.filter(Boolean).join("\n\n");
}

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/** The report as plain semantic HTML for the server-rendered article page. */
export function weekendReportToHtml(data: WeekendReportData): string {
  const out: string[] = [`<p>${escapeHtml(data.lede)}</p>`];
  if (data.games.length) {
    out.push("<h2>Scores</h2><ul>");
    for (const g of data.games) {
      out.push(
        `<li><a href="${escapeHtml(gamePath(g.competitionSlug ?? data.competitionSlug, g.gameKey))}">${escapeHtml(g.home)} ${g.homeScore}-${g.awayScore} ${escapeHtml(g.away)}</a>${g.recap ? ` ${escapeHtml(g.recap)}` : ""}</li>`,
      );
    }
    out.push("</ul>");
  }
  if (data.callouts.length) {
    out.push("<h2>Talking points</h2><ul>", ...data.callouts.map((c) => `<li>${escapeHtml(c.text)}</li>`), "</ul>");
  }
  if (data.performances.length) {
    out.push("<h2>Top performances</h2><ul>");
    for (const p of data.performances) {
      const href = playerPath({ slug: p.slug, name: p.name, id: p.playerId });
      const name = href ? `<a href="${escapeHtml(href)}">${escapeHtml(p.name)}</a>` : escapeHtml(p.name);
      out.push(`<li>${name}${p.team ? ` (${escapeHtml(p.team)})` : ""}: ${p.pts} points, ${p.reb} rebounds, ${p.ast} assists</li>`);
    }
    out.push("</ul>");
  }
  return out.join("");
}
