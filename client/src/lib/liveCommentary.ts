// Live text commentary, written from the same play-by-play rows the game page
// already fetches. Everything here is rules and templates over numbers we hold
// (running score, the clock, the player's tally so far, the shot's coordinates)
// — no generated text, so a line can only say something the data supports. It
// is a pure function of its inputs: feeding it the same rows gives the same
// lines, which lets the feed rebuild from scratch on every refresh and pick up
// any scorer corrections.
//
// team_no=1 is the home side, team_no=2 the away side (see gameFlow.ts).

export interface CommentaryEvent {
  action_number: number | null;
  period: number | null;
  clock: string | null;
  team_no: number | null;
  player_name: string | null;
  player_id?: string | null;
  shirt_number?: string | number | null;
  action_type: string | null;
  sub_type: string | null;
  success: boolean | null;
  scoring?: boolean | null;
  /** Running score "home-away", as at this play. */
  score: string | null;
}

export interface CommentaryShot {
  action_number: number | null;
  x: number;
  y: number;
  success?: boolean | null;
}

/** A player's best marks in their earlier games of the same competition. */
export interface SeasonBest {
  games: number;
  points: number;
  threes: number;
  rebounds: number;
  assists: number;
}

export interface CommentaryInput {
  events: CommentaryEvent[];
  shots?: CommentaryShot[];
  homeTeam: string;
  awayTeam: string;
  /** Full names by player id; the feed rows only carry "T. Fairbairn". */
  playerNames?: Record<string, string>;
  /** Earlier-game bests by player id, for the "season high" lines. */
  seasonBests?: Record<string, SeasonBest>;
  /** Adds the closing "Final" line. */
  isFinal?: boolean;
  /**
   * Players (by player_id) whose running totals can't be trusted, e.g. the
   * play-by-play credits them differently from the final box score. Their
   * "N for the night", milestone and season-high lines are left out.
   */
  suppressTallies?: Set<string>;
}

export type CommentaryKind =
  | "go-ahead" | "tie" | "bucket" | "three" | "free-throw" | "run" | "block"
  | "milestone" | "season-high" | "period-start" | "period-end" | "final";

export interface PlayerLine {
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
}

export interface CommentaryItem {
  /** The play's action_number, so a tap can find the play and its shot. */
  id: number;
  kind: CommentaryKind;
  period: number;
  clock: string | null;
  /** 0–100: how much a casual reader wants to see it. */
  importance: number;
  emoji: string;
  text: string;
  teamNo: 1 | 2 | null;
  playerId: string | null;
  playerName: string | null;
  homeScore: number;
  awayScore: number;
  /** The scoring play's shot, with its distance from the basket. */
  shot: { x: number; y: number; made: boolean; distanceFt: number | null } | null;
  /** That player's line once the play counts. */
  line: PlayerLine | null;
}

/** Lines at or above this make the "key moments" cut. */
export const KEY_MOMENT_IMPORTANCE = 40;

const FT_PER_X = 0.94; // 100 chart units span the 94ft court
const FT_PER_Y = 0.5; // 100 chart units span the 50ft width
const BASKET_X = 6.4; // chart units from the baseline (matches ShotChart)
const BASKET_Y = 50;

function emptyLine(): PlayerLine {
  return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 };
}

/** Feet from the basket the shot was taken, from the full-court chart coordinates. */
export function shotDistanceFt(x: number, y: number): number {
  const fx = x > 50 ? 100 - x : x;
  const dx = (fx - BASKET_X) * FT_PER_X;
  const dy = (y - BASKET_Y) * FT_PER_Y;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

/** "09:53:00" → 593 seconds. Hundredths, when present, are ignored. */
export function clockSeconds(clock: string | null | undefined): number {
  if (!clock) return 0;
  const [m, s] = clock.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

function clockLabel(clock: string | null): string {
  const secs = clockSeconds(clock);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** "with 0:30 to play" is awkward spoken; under a minute reads "30 seconds". */
function timeLeftPhrase(clock: string | null): string {
  const secs = clockSeconds(clock);
  if (secs <= 0) return "at the buzzer";
  if (secs < 60) return `with ${secs} second${secs === 1 ? "" : "s"} to go`;
  return `with ${clockLabel(clock)} to go`;
}

function periodName(period: number): string {
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

/** "Gloucester City Kings Senior Men I" → "Gloucester City Kings". */
export function commentaryTeamName(name: string): string {
  return (name || "")
    .replace(/\s+Senior\s+(Men|Women)\b/gi, "")
    .replace(/\s+I\s*$/, "")
    .replace(/\s+/g, " ")
    .trim() || name;
}

function pick<T>(options: T[], seed: number): T {
  return options[Math.abs(seed) % options.length];
}

function parseScore(score: string | null): [number, number] | null {
  if (!score) return null;
  const parts = score.split("-").map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0], parts[1]] : null;
}

function pointsFor(e: CommentaryEvent): number {
  if (e.action_type === "3pt") return 3;
  if (e.action_type === "2pt") return 2;
  if (e.action_type === "freethrow") return 1;
  return 0;
}

const isShot = (e: CommentaryEvent) => e.action_type === "2pt" || e.action_type === "3pt";

interface Moment {
  event: CommentaryEvent;
  kind: CommentaryKind;
  importance: number;
  headline: string;
  notes: string[];
  emoji: string;
  line: PlayerLine | null;
  shot: CommentaryItem["shot"];
  homeScore: number;
  awayScore: number;
  playerKey: string | null;
}

export function buildCommentary(input: CommentaryInput): CommentaryItem[] {
  const events = input.events
    .filter((e) => e.action_number != null)
    .slice()
    .sort((a, b) => (a.action_number ?? 0) - (b.action_number ?? 0));
  if (events.length === 0) return [];

  const shotByAction = new Map<number, CommentaryShot>();
  for (const s of input.shots ?? []) if (s.action_number != null) shotByAction.set(s.action_number, s);

  const teamName = (n: number | null) =>
    commentaryTeamName(n === 1 ? input.homeTeam : n === 2 ? input.awayTeam : "") || (n === 1 ? "Home" : "Away");
  const nameOf = (e: CommentaryEvent) =>
    (e.player_id && input.playerNames?.[e.player_id]) || e.player_name || "Unknown player";
  // Same-surname teammates can arrive with one shared player_id, so a player is
  // told apart by side, shirt and name — never by the id alone.
  const keyOf = (e: CommentaryEvent) =>
    e.player_name || e.player_id ? `${e.team_no}|${e.shirt_number ?? ""}|${e.player_name ?? e.player_id}` : null;

  const lines = new Map<string, PlayerLine>();
  const lineOf = (key: string) => {
    let l = lines.get(key);
    if (!l) { l = emptyLine(); lines.set(key, l); }
    return l;
  };
  // Which of a player's season-high marks they have already passed tonight.
  const passed = new Set<string>();
  // A player's consecutive three-point makes (reset by a miss).
  const threeStreak = new Map<string, number>();

  let home = 0;
  let away = 0;
  let maxLead = 0; // the largest lead either side has held, for "biggest lead" notes
  let runTeam: 1 | 2 | 0 = 0;
  let runPoints = 0;
  let lastSteal: { teamNo: number; action: number } | null = null;
  const moments: Moment[] = [];
  const lastPeriod = Math.max(...events.map((e) => e.period ?? 1));

  const snapshot = (key: string | null): PlayerLine | null => (key && lines.has(key) ? { ...lines.get(key)! } : null);

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const teamNo = e.team_no === 1 || e.team_no === 2 ? e.team_no : null;
    const period = e.period ?? 1;
    const seed = e.action_number ?? i;
    const key = keyOf(e);
    const type = e.action_type ?? "";

    if (type === "period") {
      if (e.sub_type === "start" && period === 1) {
        moments.push({ event: e, kind: "period-start", importance: 30, emoji: "🏀", notes: [],
          headline: `We're underway: ${teamName(2)} at ${teamName(1)}.`,
          line: null, shot: null, homeScore: home, awayScore: away, playerKey: null });
      } else if (e.sub_type === "start" && period > 4) {
        moments.push({ event: e, kind: "period-start", importance: 50, emoji: "⏱️", notes: [],
          headline: `Overtime. ${home === away ? `Tied at ${home}` : `${teamName(home > away ? 1 : 2)} lead ${Math.max(home, away)}-${Math.min(home, away)}`} after regulation.`,
          line: null, shot: null, homeScore: home, awayScore: away, playerKey: null });
      } else if (e.sub_type === "end") {
        const isLast = period === lastPeriod;
        if (!(isLast && input.isFinal)) {
          const tied = home === away;
          const lead = home > away ? 1 : 2;
          const label = period === 2 ? "Halftime" : `End of ${periodName(period)}`;
          moments.push({ event: e, kind: "period-end", importance: period === 2 ? 50 : period >= 4 ? 55 : 38, emoji: "🏁", notes: [],
            headline: tied
              ? `${label}: all square at ${home}.`
              : `${label}: ${teamName(lead)} ${Math.max(home, away)}, ${teamName(lead === 1 ? 2 : 1)} ${Math.min(home, away)}.`,
            line: null, shot: null, homeScore: home, awayScore: away, playerKey: null });
        }
      }
      continue;
    }

    if (!key || !teamNo) continue;
    const line = lineOf(key);

    if (type === "steal" && e.success !== false) {
      line.stl++;
      lastSteal = { teamNo, action: e.action_number! };
      continue;
    }
    if (type === "turnover") { line.tov++; continue; }
    if (type === "assist") { line.ast++; continue; }

    if (type === "block") {
      line.blk++;
      const secLeft = clockSeconds(e.clock);
      const closeLate = period >= 4 && secLeft <= 300 && Math.abs(home - away) <= 6;
      moments.push({ event: e, kind: "block", importance: closeLate ? 55 : 28, emoji: "🚫", notes: [],
        headline: `${nameOf(e)} ${pick(["swats it away", "sends it back", "with the rejection"], seed)}${closeLate ? ` ${timeLeftPhrase(e.clock)}` : ""}.`,
        line: snapshot(key), shot: null, homeScore: home, awayScore: away, playerKey: key });
      continue;
    }

    if (type === "rebound") {
      line.reb++;
      const trustedReb = !input.suppressTallies?.has(e.player_id ?? "");
      const notes = trustedReb ? rebAstMilestones(line, key, nameOf(e), "reb") : null;
      if (notes) {
        moments.push({ event: e, kind: "milestone", importance: notes.importance, emoji: "⭐", notes: [],
          headline: notes.text, line: snapshot(key), shot: null, homeScore: home, awayScore: away, playerKey: key });
      }
      // A season-high rebound mark.
      const sb = input.seasonBests?.[e.player_id ?? ""];
      if (trustedReb && sb && sb.games >= 3 && sb.rebounds > 0 && line.reb >= 8 && line.reb > sb.rebounds && !passed.has(`${key}:reb`)) {
        passed.add(`${key}:reb`);
        moments.push({ event: e, kind: "season-high", importance: 52, emoji: "📈", notes: [],
          headline: `${nameOf(e)} reaches ${line.reb} rebounds — a season high (previous best ${sb.rebounds}).`,
          line: snapshot(key), shot: null, homeScore: home, awayScore: away, playerKey: key });
      }
      continue;
    }

    const isFt = type === "freethrow";
    if (!isShot(e) && !isFt) continue;

    // --- a shot or free throw ---
    if (isFt) line.fta++; else line.fga++;
    if (type === "3pt") line.tpa++;

    if (!e.success) {
      if (type === "3pt") threeStreak.set(key, 0);
      continue;
    }

    const pts = pointsFor(e);
    const marginBefore = home - away;
    const parsed = parseScore(e.score);
    if (parsed) { [home, away] = parsed; }
    else if (teamNo === 1) home += pts;
    else away += pts;
    const margin = home - away;
    const myMargin = teamNo === 1 ? margin : -margin;
    const myMarginBefore = teamNo === 1 ? marginBefore : -marginBefore;

    line.pts += pts;
    if (isFt) line.ftm++; else line.fgm++;
    if (type === "3pt") {
      line.tpm++;
      threeStreak.set(key, (threeStreak.get(key) ?? 0) + 1);
    }

    // Unanswered points: the run is the scoring side's, and resets on the other side's basket.
    if (runTeam === teamNo) runPoints += pts;
    else { runTeam = teamNo; runPoints = pts; }
    const prevRun = runPoints - pts;

    const secLeft = clockSeconds(e.clock);
    const late = period >= 4 && secLeft <= 300;
    const tookLead = myMarginBefore <= 0 && myMargin > 0;
    const tiedIt = myMarginBefore < 0 && myMargin === 0;

    // Shot detail.
    const chart = e.action_number != null ? shotByAction.get(e.action_number) : undefined;
    const distanceFt = chart && isShot(e) ? shotDistanceFt(chart.x, chart.y) : null;
    const sub = (e.sub_type || "").toLowerCase();

    // Context from neighbouring rows: who set it up, an and-one, a steal before it.
    let assistName: string | null = null;
    let andOne = false;
    for (let j = i + 1; j < Math.min(events.length, i + 5); j++) {
      const n = events[j];
      if (n.team_no !== teamNo || n.clock !== e.clock) break;
      if (n.action_type === "assist" && !assistName) assistName = nameOf(n);
      if (n.action_type === "freethrow" && n.sub_type === "1of1" && n.success && isShot(e)) andOne = true;
    }
    const offSteal = !!lastSteal && lastSteal.teamNo === teamNo && (e.action_number! - lastSteal.action) <= 4 && isShot(e);

    // --- importance ---
    let importance = type === "3pt" ? 30 : type === "2pt" ? 16 : 8;
    if (sub.includes("dunk")) importance += 12;
    if (andOne) importance += 10;
    if (tookLead) importance += late ? 30 : 14;
    if (tiedIt) importance += late ? 26 : 10;
    if (late) {
      const closeness = Math.abs(marginBefore) <= 3 || Math.abs(margin) <= 3 ? 1 : Math.abs(margin) <= 6 ? 0.5 : 0;
      importance += Math.round(closeness * (secLeft <= 60 ? 40 : secLeft <= 120 ? 30 : 20));
    }

    // --- sentence ---
    const who = nameOf(e);
    const team = teamName(teamNo);
    const dist = distanceFt != null && distanceFt > 0 ? distanceFt : null;
    let verb: string;
    if (isFt) {
      verb = pick(["sinks the free throw", "converts from the line", "makes the free throw"], seed);
    } else if (type === "3pt") {
      if (dist && dist >= 28) verb = pick([`drains a ${dist}ft bomb`, `buries a ${dist}-footer`, `lets it go from ${dist}ft and hits`], seed);
      else if (dist) verb = pick([`hits a ${dist}ft three`, `knocks down a ${dist}ft three`, `drains a ${dist}ft three`], seed);
      else verb = pick(["hits a three", "knocks down a three", "drains a three"], seed);
    } else if (sub.includes("dunk")) {
      verb = pick(["throws it down", "slams it home", "finishes with a dunk"], seed);
    } else if (sub.includes("tipin")) {
      verb = pick(["tips it in", "puts back the miss"], seed);
    } else if (sub.includes("driving")) {
      verb = pick(["drives for the layup", "attacks the rim and finishes", "gets to the rim"], seed);
    } else if (sub.includes("layup")) {
      verb = pick(["finishes at the rim", "lays it in", "scores at the basket"], seed);
    } else if (sub.includes("floating")) {
      verb = pick(["floats one in", "drops in the floater"], seed);
    } else {
      verb = pick(dist && dist >= 12
        ? [`hits a ${dist}ft jumper`, `knocks down a ${dist}-foot jumper`]
        : ["hits the jumper", "knocks down the shot", "scores"], seed);
    }

    let context = "";
    if (tookLead) {
      context = ` to put ${team} up ${myMargin}`;
    } else if (tiedIt) {
      context = ` to tie it at ${home}`;
    } else if (late && Math.abs(margin) <= 6 && pts > 0) {
      context = myMargin > 0 ? `, extending ${team}'s lead to ${myMargin}` : `, cutting it to ${-myMargin}`;
    }
    if (late && (tookLead || tiedIt || Math.abs(margin) <= 6)) context += ` ${timeLeftPhrase(e.clock)}`;

    const extras: string[] = [];
    if (assistName && isShot(e)) extras.push(`${assistName} with the assist`);
    if (andOne) extras.push("and the foul — a three-point play on the way");
    if (offSteal) extras.push("off the steal");

    let headline = `${who} ${verb}${context}`;
    if (extras.length) headline += ` (${extras.join(", ")})`;
    headline += ".";

    const notes: string[] = [];

    // A run of 8+ unanswered, noted as it passes 8, 12, 16, 20…
    const runLevel = (n: number) => (n >= 8 ? Math.floor((n - 8) / 4) : -1);
    if (runPoints >= 8 && runLevel(runPoints) > runLevel(prevRun)) {
      notes.push(`${team} are on ${runPoints === 8 || runPoints === 18 ? "an" : "a"} ${runPoints}-0 run.`);
      importance += 18 + Math.min(12, runLevel(runPoints) * 4);
    }

    // Player tally.
    const trusted = !input.suppressTallies?.has(e.player_id ?? "");
    const sb = trusted ? input.seasonBests?.[e.player_id ?? ""] : undefined;
    const isSeasonHighPts = !!sb && sb.games >= 3 && sb.points > 0 && line.pts >= 10 && line.pts > sb.points && !passed.has(`${key}:pts`);
    if (isSeasonHighPts) passed.add(`${key}:pts`);
    const crossed = !trusted ? undefined : [10, 20, 30, 40, 50].find((m) => line.pts - pts < m && line.pts >= m);
    if (isSeasonHighPts) {
      notes.push(`That's ${line.pts} — a season high, passing their previous best of ${sb!.points}.`);
      importance += 34;
    } else if (crossed) {
      notes.push(`${crossed} points for ${who}.`);
      importance += crossed >= 30 ? 36 : crossed >= 20 ? 26 : 14;
    } else if (trusted && line.pts >= 8 && (type === "3pt" || tookLead || tiedIt || late)) {
      notes.push(`That's ${line.pts} for the night.`);
    }
    if (type === "3pt") {
      if (isSeasonHighThrees(sb, line, key, passed)) {
        notes.push(`${line.tpm} threes is a season high.`);
        importance += 30;
      } else if (trusted && line.tpm >= 3) {
        notes.push(`${who} has ${line.tpm} threes tonight.`);
        importance += line.tpm >= 5 ? 24 : 12;
      }
      const streak = threeStreak.get(key) ?? 0;
      if (streak >= 3) { notes.push(`${streak} threes in a row.`); importance += 14; }
    }
    // The biggest lead so far, at round numbers.
    const lead = Math.abs(margin);
    if (lead > maxLead) {
      if ([10, 15, 20, 25, 30].some((m) => maxLead < m && lead >= m)) {
        notes.push(`${team}'s lead is now ${lead}, the biggest of the game.`);
        importance += 8;
      }
      maxLead = lead;
    }

    let kind: CommentaryKind = type === "3pt" ? "three" : isFt ? "free-throw" : "bucket";
    if (tookLead) kind = "go-ahead";
    else if (tiedIt) kind = "tie";
    else if (notes.some((n) => n.includes("run."))) kind = "run";
    if (isSeasonHighPts) kind = "season-high";

    const emoji =
      kind === "season-high" ? "📈"
      : (tookLead || tiedIt) && late ? "🚨"
      : kind === "run" ? "🔥"
      : sub.includes("dunk") ? "💥"
      : type === "3pt" && dist && dist >= 28 ? "💣"
      : type === "3pt" ? "🎯"
      : andOne ? "💪"
      : kind === "go-ahead" ? "⬆️"
      : kind === "tie" ? "🤝"
      : "🏀";

    // Garbage time: once a game is out of reach, its baskets matter less.
    if (Math.abs(margin) >= 25 && !tookLead && !tiedIt) importance = Math.round(importance * 0.6);

    moments.push({ event: e, kind, importance: Math.min(100, importance), emoji, headline, notes,
      line: snapshot(key), shot: chart ? { x: chart.x, y: chart.y, made: true, distanceFt } : null,
      homeScore: home, awayScore: away, playerKey: key });
  }

  if (input.isFinal) {
    const last = events[events.length - 1];
    const winner = home >= away ? 1 : 2;
    moments.push({ event: last, kind: "final", importance: 100, emoji: "🏆", notes: [],
      headline: home === away
        ? `Final: it finishes level at ${home}.`
        : `Final: ${teamName(winner)} win ${Math.max(home, away)}-${Math.min(home, away)}.`,
      line: null, shot: null, homeScore: home, awayScore: away, playerKey: null });
  }

  return moments.map((m) => ({
    id: m.event.action_number ?? 0,
    kind: m.kind,
    period: m.event.period ?? 1,
    clock: m.event.clock,
    importance: m.importance,
    emoji: m.emoji,
    text: [m.headline, ...m.notes].join(" "),
    teamNo: m.event.team_no === 1 || m.event.team_no === 2 ? m.event.team_no : null,
    playerId: m.event.player_id ?? null,
    playerName: m.playerKey ? (m.event.player_id && input.playerNames?.[m.event.player_id]) || m.event.player_name : null,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    shot: m.shot,
    line: m.line,
  }));
}

function isSeasonHighThrees(sb: SeasonBest | undefined, line: PlayerLine, key: string, passed: Set<string>): boolean {
  if (!sb || sb.games < 3 || sb.threes <= 0 || line.tpm < 3 || line.tpm <= sb.threes || passed.has(`${key}:3pm`)) return false;
  passed.add(`${key}:3pm`);
  return true;
}

/** Double-doubles and triple-doubles, announced the moment they're completed. */
function rebAstMilestones(line: PlayerLine, _key: string, who: string, _trigger: "reb" | "ast"): { text: string; importance: number } | null {
  const cats = [line.pts, line.reb, line.ast, line.stl, line.blk].filter((n) => n >= 10).length;
  if (cats >= 3 && line.reb === 10) return { text: `${who} has a triple-double: ${line.pts} points, ${line.reb} rebounds, ${line.ast} assists.`, importance: 70 };
  if (cats === 2 && line.reb === 10 && line.pts >= 10) return { text: `Double-double for ${who}: ${line.pts} points and ${line.reb} rebounds.`, importance: 48 };
  return null;
}

/** The moments worth reading in a short feed, newest first. */
export function keyMoments(items: CommentaryItem[], minImportance = KEY_MOMENT_IMPORTANCE): CommentaryItem[] {
  return items.filter((i) => i.importance >= minImportance).slice().reverse();
}

/** A player from the box score, whose id and name are reliable. */
export interface RosterEntry {
  playerId: string | null;
  name: string;
  shirt: string | number | null | undefined;
  teamNo: 1 | 2;
  /** Their points in the box score, to check the feed's running totals. */
  points?: number | null;
}

const normName = (n: string) => n.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();

/** "H. Ibrahim" and "Hamza Ibrahim" → "h|ibrahim". */
function initialSurname(name: string): string | null {
  const parts = normName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0][0]}|${parts[parts.length - 1]}`;
}

/**
 * The play-by-play can give two teammates with the same surname one player_id
 * (about one game in five). Match each play to the box score by side and shirt,
 * falling back to initial + surname, so every play lands on the right person.
 * A play that can't be matched and carries a shared id loses the id rather than
 * borrowing someone else's name, photo or season bests.
 */
export function attachRoster(events: CommentaryEvent[], roster: RosterEntry[]): CommentaryEvent[] {
  const namesById = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.player_id || !e.player_name) continue;
    const set = namesById.get(e.player_id) ?? new Set<string>();
    set.add(`${e.team_no}|${e.shirt_number ?? ""}|${e.player_name}`);
    namesById.set(e.player_id, set);
  }
  return events.map((e) => {
    if (!e.player_name || (e.team_no !== 1 && e.team_no !== 2)) return e;
    const side = roster.filter((r) => r.teamNo === e.team_no);
    let match = e.shirt_number != null && e.shirt_number !== ""
      ? side.find((r) => r.shirt != null && String(r.shirt) === String(e.shirt_number))
      : undefined;
    if (!match) {
      const key = initialSurname(e.player_name);
      const named = key ? side.filter((r) => initialSurname(r.name) === key) : [];
      if (named.length === 1) match = named[0];
    }
    if (match) return { ...e, player_id: match.playerId ?? null, player_name: match.name };
    const shared = e.player_id ? (namesById.get(e.player_id)?.size ?? 0) > 1 : false;
    return shared ? { ...e, player_id: null } : e;
  });
}

/**
 * Players whose points in the feed differ from the box score. Run the engine
 * once, compare, and pass the result back as `suppressTallies`.
 */
export function tallyMismatches(items: CommentaryItem[], boxPoints: Record<string, number>): Set<string> {
  const last = new Map<string, number>();
  for (const i of items) if (i.playerId && i.line) last.set(i.playerId, i.line.pts);
  const out = new Set<string>();
  for (const [id, pts] of last) if (id in boxPoints && boxPoints[id] !== pts) out.add(id);
  // A player with box-score points who never scores in the feed is also off.
  for (const [id, pts] of Object.entries(boxPoints)) if (pts > 0 && !last.has(id)) out.add(id);
  return out;
}
