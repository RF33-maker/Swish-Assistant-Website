/**
 * Recent-form comparison between a coach's team and an opponent.
 *
 * Everything here is computed from per-game team box scores (team_stats) and
 * located shots, over the last N completed games for each side. Rates are
 * built from summed totals across the window, never by averaging per-game
 * percentages — a 2-for-2 night would otherwise weigh the same as 30-for-60.
 *
 * The gap write-ups are deterministic: every sentence quotes the numbers it
 * rests on, and a gap is only called out when it clears a per-metric
 * threshold that is meaningful in basketball terms (three points of eFG%,
 * two of turnover rate…), so two similar teams correctly produce few or no
 * talking points instead of manufactured ones.
 */

import { SHOT_ZONE_POINTS, shotZone, type ShotData } from "@/components/ShotChart";
import { analyseDistribution, type ShotGroup, type ZoneTotals } from "@/lib/shotDistribution";

/** One side of one game, as read from team_stats. */
export interface TeamStatLine {
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  oreb: number;
  dreb: number;
  ast: number;
  tov: number;
  stl: number;
  blk: number;
  paint: number;
  fastbreak: number;
  secondChance: number;
  offTurnovers: number;
  bench: number;
}

export interface FormGame {
  gameKey: string;
  date: string;
  opponent: string;
  side: 1 | 2;
  own: TeamStatLine;
  opp: TeamStatLine;
}

const n = (v: unknown) => Number(v) || 0;

/** Map a raw team_stats row onto a stat line. */
export function toStatLine(row: any): TeamStatLine {
  return {
    pts: n(row.tot_spoints),
    fgm: n(row.tot_sfieldgoalsmade),
    fga: n(row.tot_sfieldgoalsattempted),
    tpm: n(row.tot_sthreepointersmade),
    tpa: n(row.tot_sthreepointersattempted),
    ftm: n(row.tot_sfreethrowsmade),
    fta: n(row.tot_sfreethrowsattempted),
    oreb: n(row.tot_sreboundsoffensive),
    dreb: n(row.tot_sreboundsdefensive),
    ast: n(row.tot_sassists),
    tov: n(row.tot_sturnovers),
    stl: n(row.tot_ssteals),
    blk: n(row.tot_sblocks),
    paint: n(row.tot_spointsinthepaint),
    fastbreak: n(row.tot_spointsfastbreak),
    secondChance: n(row.tot_spointssecondchance),
    offTurnovers: n(row.tot_spointsfromturnovers),
    bench: n(row.tot_sbenchpoints),
  };
}

export const TEAM_STAT_SELECT =
  "game_key, league_id, team_id, name, side, created_at, tot_spoints, tot_sfieldgoalsmade, tot_sfieldgoalsattempted, " +
  "tot_sthreepointersmade, tot_sthreepointersattempted, tot_sfreethrowsmade, tot_sfreethrowsattempted, " +
  "tot_sreboundsoffensive, tot_sreboundsdefensive, tot_sassists, tot_sturnovers, tot_ssteals, tot_sblocks, " +
  "tot_spointsinthepaint, tot_spointsfastbreak, tot_spointssecondchance, tot_spointsfromturnovers, tot_sbenchpoints";

// ── Window aggregates ──────────────────────────────────────────────────────

export type MetricKey =
  | "ppg" | "oppPpg" | "margin" | "ortg" | "drtg" | "net" | "pace"
  | "efg" | "oppEfg" | "tovPct" | "forcedTovPct" | "orebPct" | "drebPct"
  | "ftRate" | "oppFtRate" | "threeRate" | "threePct" | "astRate"
  | "paintPpg" | "fastbreakPpg" | "secondChancePpg" | "offTovPpg" | "benchPpg";

export interface FormWindow {
  games: number;
  wins: number;
  losses: number;
  metrics: Record<MetricKey, number | null>;
}

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

function sum(lines: TeamStatLine[]): TeamStatLine {
  const total = toStatLine({});
  lines.forEach((l) => {
    (Object.keys(total) as (keyof TeamStatLine)[]).forEach((k) => { total[k] += l[k]; });
  });
  return total;
}

const possessions = (t: TeamStatLine) => t.fga + 0.44 * t.fta - t.oreb + t.tov;

/** Aggregate the most recent `size` games (games must be newest first). */
export function buildWindow(games: FormGame[], size: number): FormWindow {
  const slice = games.slice(0, size);
  const own = sum(slice.map((g) => g.own));
  const opp = sum(slice.map((g) => g.opp));
  const g = slice.length;
  // Both teams' possession estimates averaged — they differ only by noise
  // in a single game, and averaging steadies small windows.
  const poss = (possessions(own) + possessions(opp)) / 2;
  const perGame = (v: number) => (g > 0 ? v / g : null);
  const ortg = poss > 0 ? (own.pts / poss) * 100 : null;
  const drtg = poss > 0 ? (opp.pts / poss) * 100 : null;

  return {
    games: g,
    wins: slice.filter((x) => x.own.pts > x.opp.pts).length,
    losses: slice.filter((x) => x.own.pts < x.opp.pts).length,
    metrics: {
      ppg: perGame(own.pts),
      oppPpg: perGame(opp.pts),
      margin: perGame(own.pts - opp.pts),
      ortg,
      drtg,
      net: ortg != null && drtg != null ? ortg - drtg : null,
      pace: perGame(poss),
      efg: pct(own.fgm + 0.5 * own.tpm, own.fga),
      oppEfg: pct(opp.fgm + 0.5 * opp.tpm, opp.fga),
      tovPct: pct(own.tov, own.fga + 0.44 * own.fta + own.tov),
      forcedTovPct: pct(opp.tov, opp.fga + 0.44 * opp.fta + opp.tov),
      orebPct: pct(own.oreb, own.oreb + opp.dreb),
      drebPct: pct(own.dreb, own.dreb + opp.oreb),
      ftRate: pct(own.fta, own.fga),
      oppFtRate: pct(opp.fta, opp.fga),
      threeRate: pct(own.tpa, own.fga),
      threePct: pct(own.tpm, own.tpa),
      astRate: pct(own.ast, own.fgm),
      paintPpg: perGame(own.paint),
      fastbreakPpg: perGame(own.fastbreak),
      secondChancePpg: perGame(own.secondChance),
      offTovPpg: perGame(own.offTurnovers),
      benchPpg: perGame(own.bench),
    },
  };
}

// ── Metric catalogue ───────────────────────────────────────────────────────

export interface MetricDef {
  key: MetricKey;
  label: string;
  group: "Results" | "Shooting" | "Possessions" | "Scoring sources";
  unit?: string;
  decimals: number;
  lowerIsBetter?: boolean;
  /** Smallest gap that is worth talking about, in the metric's own units. */
  threshold: number;
  /** Style stats describe how a team plays, not whether it is better. */
  neutral?: boolean;
  /** Why this number matters — the second sentence of a gap write-up. */
  why: string;
}

export const METRICS: MetricDef[] = [
  { key: "ppg", label: "Points scored", group: "Results", decimals: 1, threshold: 6,
    why: "Raw scoring is shaped by pace, so read it alongside offensive rating below." },
  { key: "oppPpg", label: "Points allowed", group: "Results", decimals: 1, lowerIsBetter: true, threshold: 6,
    why: "Like points scored, this moves with pace — defensive rating is the fairer comparison." },
  { key: "margin", label: "Average margin", group: "Results", decimals: 1, threshold: 6,
    why: "Margin is the simplest single read of how comfortably a side has been winning or losing." },
  { key: "ortg", label: "Offensive rating", group: "Results", decimals: 1, threshold: 5,
    why: "Points per 100 possessions strips out pace, so it compares attacking quality directly." },
  { key: "drtg", label: "Defensive rating", group: "Results", decimals: 1, lowerIsBetter: true, threshold: 5,
    why: "Points conceded per 100 possessions — the pace-neutral measure of defence." },
  { key: "pace", label: "Possessions per game", group: "Possessions", decimals: 1, threshold: 4, neutral: true,
    why: "Tempo is style rather than quality: the side that controls it plays the game on its own terms." },
  { key: "efg", label: "Effective FG%", group: "Shooting", unit: "%", decimals: 1, threshold: 3,
    why: "eFG% counts a three as one and a half makes, so it is the best single measure of shot quality and shot-making combined." },
  { key: "oppEfg", label: "Opponent eFG%", group: "Shooting", unit: "%", decimals: 1, lowerIsBetter: true, threshold: 3,
    why: "What opponents shoot is the clearest sign of how hard a defence makes scoring." },
  { key: "threeRate", label: "3PA rate", group: "Shooting", unit: "%", decimals: 1, threshold: 6, neutral: true,
    why: "The share of shots taken from three describes a side's shot diet — how much it leans on the arc." },
  { key: "threePct", label: "3P%", group: "Shooting", unit: "%", decimals: 1, threshold: 4,
    why: "Over a few games three-point percentage swings a lot, so treat a gap here as form rather than a fixed trait." },
  { key: "ftRate", label: "Free-throw rate", group: "Shooting", unit: "%", decimals: 1, threshold: 6,
    why: "Free throws per shot attempt shows how often a side gets to the line — usually a sign it is attacking the paint." },
  { key: "oppFtRate", label: "Opponent FT rate", group: "Shooting", unit: "%", decimals: 1, lowerIsBetter: true, threshold: 6,
    why: "A high number means the defence is fouling — free points conceded and players in foul trouble." },
  { key: "tovPct", label: "Turnover rate", group: "Possessions", unit: "%", decimals: 1, lowerIsBetter: true, threshold: 2,
    why: "Turnovers per possession: every one is a possession that ends without a shot." },
  { key: "forcedTovPct", label: "Turnovers forced", group: "Possessions", unit: "%", decimals: 1, threshold: 2,
    why: "How often a defence ends an opponent's possession before a shot — the source of cheap transition points." },
  { key: "orebPct", label: "Offensive rebound %", group: "Possessions", unit: "%", decimals: 1, threshold: 4,
    why: "The share of its own misses a side gets back — each one is a second chance at a score." },
  { key: "drebPct", label: "Defensive rebound %", group: "Possessions", unit: "%", decimals: 1, threshold: 4,
    why: "Finishing a defensive possession with the rebound; a low number hands the opponent extra shots." },
  { key: "astRate", label: "Assisted baskets", group: "Scoring sources", unit: "%", decimals: 1, threshold: 8, neutral: true,
    why: "The share of made baskets that were assisted — ball movement against one-on-one creation." },
  { key: "paintPpg", label: "Points in the paint", group: "Scoring sources", decimals: 1, threshold: 6,
    why: "Paint points are the most efficient shots on the floor and the ones a set defence most wants to take away." },
  { key: "fastbreakPpg", label: "Fast-break points", group: "Scoring sources", decimals: 1, threshold: 4,
    why: "Points before the defence is set — usually coming off turnovers and long rebounds." },
  { key: "secondChancePpg", label: "Second-chance points", group: "Scoring sources", decimals: 1, threshold: 4,
    why: "What offensive rebounds turn into on the scoreboard." },
  { key: "offTovPpg", label: "Points off turnovers", group: "Scoring sources", decimals: 1, threshold: 4,
    why: "How much a side's defence is feeding its offence." },
  { key: "benchPpg", label: "Bench points", group: "Scoring sources", decimals: 1, threshold: 6,
    why: "Scoring depth beyond the starting five, which matters most in a tight fourth quarter." },
];

export const metricDef = (key: MetricKey) => METRICS.find((m) => m.key === key)!;
export const metricGroup = (key: string) => METRICS.find((m) => m.key === key)?.group;

export function formatMetric(def: MetricDef, value: number | null): string {
  if (value == null) return "—";
  const sign = def.key === "margin" || def.key === "net" ? (value > 0 ? "+" : "") : "";
  return `${sign}${value.toFixed(def.decimals)}${def.unit ?? ""}`;
}

// ── Gap analysis ───────────────────────────────────────────────────────────

export interface Gap {
  key: string;
  title: string;
  /** Who the gap favours: the coach's team, the opponent, or neither (style). */
  favours: "you" | "them" | "style";
  /** How many thresholds wide the gap is — used for ordering. */
  size: number;
  body: string;
  evidence: string[];
}

interface Sides {
  youName: string;
  themName: string;
  you: { window: FormWindow; other: FormWindow };
  them: { window: FormWindow; other: FormWindow };
}

/**
 * How the most recent games compare with the longer window, whichever of
 * the two is being viewed — "recent" is always the shorter one.
 */
function trendNote(def: MetricDef, who: string, current: number | null, other: number | null, currentN: number, otherN: number): string | null {
  if (current == null || other == null || currentN === otherN) return null;
  const [recent, recentN, longer, longerN] =
    currentN < otherN ? [current, currentN, other, otherN] : [other, otherN, current, currentN];
  const change = recent - longer;
  if (Math.abs(change) < def.threshold / 2) return null;
  return `${who}: ${formatMetric(def, recent)} in the last ${recentN}, ${change > 0 ? "higher" : "lower"} than ${formatMetric(def, longer)} across the last ${longerN}.`;
}

/**
 * Same-stat gaps between the two sides, largest first. Only gaps at least one
 * threshold wide are returned.
 */
export function sameStatGaps(s: Sides): Gap[] {
  const gaps: Gap[] = [];
  for (const def of METRICS) {
    const mine = s.you.window.metrics[def.key];
    const theirs = s.them.window.metrics[def.key];
    if (mine == null || theirs == null) continue;
    const diff = mine - theirs;
    const size = Math.abs(diff) / def.threshold;
    if (size < 1) continue;

    const youAhead = def.lowerIsBetter ? diff < 0 : diff > 0;
    const favours: Gap["favours"] = def.neutral ? "style" : youAhead ? "you" : "them";
    const higherName = diff > 0 ? s.youName : s.themName;
    const lowerName = diff > 0 ? s.themName : s.youName;
    const higher = Math.max(mine, theirs);
    const lower = Math.min(mine, theirs);
    const gapText = `${Math.abs(diff).toFixed(def.decimals)}${def.unit === "%" ? " points" : ""}`;

    const lead = def.neutral
      ? `${higherName} ${def.key === "pace" ? "play faster" : "lean on this more"}: ${formatMetric(def, higher)} against ${formatMetric(def, lower)} for ${lowerName} — a gap of ${gapText}.`
      : `${youAhead ? "You have the edge" : `${s.themName} have the edge`} on ${def.label.charAt(0).toLowerCase()}${def.label.slice(1)}: ${s.youName} ${formatMetric(def, mine)}, ${s.themName} ${formatMetric(def, theirs)} — a gap of ${gapText}${def.lowerIsBetter ? " (lower is better)" : ""}.`;

    const evidence = [
      `${s.youName}: ${formatMetric(def, mine)} over ${s.you.window.games} game${s.you.window.games === 1 ? "" : "s"}`,
      `${s.themName}: ${formatMetric(def, theirs)} over ${s.them.window.games} game${s.them.window.games === 1 ? "" : "s"}`,
    ];
    const yourTrend = trendNote(def, "You", mine, s.you.other.metrics[def.key], s.you.window.games, s.you.other.games);
    const theirTrend = trendNote(def, s.themName, theirs, s.them.other.metrics[def.key], s.them.window.games, s.them.other.games);
    if (yourTrend) evidence.push(yourTrend);
    if (theirTrend) evidence.push(theirTrend);

    gaps.push({ key: def.key, title: def.label, favours, size, body: `${lead} ${def.why}`, evidence });
  }
  return gaps.sort((a, b) => b.size - a.size);
}

/**
 * Offence-against-defence matchups: each side's attacking numbers set against
 * what the other side has been allowing. This is the read a game plan is
 * built from — a great shooting team meeting a defence that concedes good
 * looks is a different problem from meeting one that doesn't.
 */
export function matchupGaps(s: Sides): Gap[] {
  const pairs: Array<{
    attack: MetricKey; defend: MetricKey; label: string; threshold: number;
    /** Converts the defending side's number into "what the attacker should expect". */
    allowed: (v: number) => number;
    /** "<who> shoot 54.1% eFG" — the attacking side's normal level. */
    attackText: (who: string, v: string) => string;
    /** "<who> allow 49.0% eFG" — what the defending side usually concedes. */
    defendText: (who: string, v: string) => string;
    /** What the edge means on the floor, from each side's point of view. */
    meaning: { you: string; them: string };
    lowerIsBetterForAttack?: boolean;
  }> = [
    { attack: "efg", defend: "oppEfg", label: "Shooting efficiency", threshold: 3, allowed: (v) => v,
      attackText: (w, v) => `${w} shoot ${v} eFG`, defendText: (w, v) => `${w} allow ${v} eFG`,
      meaning: {
        you: "Your shot-making has been well ahead of what their defence normally allows — keep generating the same looks.",
        them: "Their shot-making has been well ahead of what your defence normally allows — contesting has to be sharper than usual.",
      } },
    { attack: "tovPct", defend: "forcedTovPct", label: "Ball security", threshold: 2, allowed: (v) => v, lowerIsBetterForAttack: true,
      attackText: (w, v) => `${w} turn it over on ${v} of possessions`, defendText: (w, v) => `${w} force turnovers on ${v}`,
      meaning: {
        you: "You look after the ball better than their pressure usually forces, so their defence shouldn't be a source of cheap points for them.",
        them: "They look after the ball better than your pressure usually forces — expect fewer turnovers and transition chances than normal.",
      } },
    { attack: "orebPct", defend: "drebPct", label: "Offensive glass", threshold: 4, allowed: (v) => 100 - v,
      attackText: (w, v) => `${w} get back ${v} of your own misses`, defendText: (w, v) => `${w} give up ${v} of offensive rebounds`,
      meaning: {
        you: "You crash the glass harder than they usually allow — second chances are there if you send bodies.",
        them: "They crash the glass harder than you usually allow — boxing out has to be a priority.",
      } },
    { attack: "ftRate", defend: "oppFtRate", label: "Getting to the line", threshold: 6, allowed: (v) => v,
      attackText: (w, v) => `${w} take ${v} as many free throws as shots`, defendText: (w, v) => `${w} allow a free-throw rate of ${v}`,
      meaning: {
        you: "You get to the line more than their defence usually concedes — keep attacking closeouts and the paint.",
        them: "They get to the line more than you usually concede — stay down on fakes and avoid reaching.",
      } },
  ];

  const gaps: Gap[] = [];
  const sidesToCheck = [
    { attacker: s.youName, defender: s.themName, a: s.you.window, d: s.them.window, youAttacking: true },
    { attacker: s.themName, defender: s.youName, a: s.them.window, d: s.you.window, youAttacking: false },
  ];

  for (const side of sidesToCheck) {
    for (const p of pairs) {
      const attackVal = side.a.metrics[p.attack];
      const defendRaw = side.d.metrics[p.defend];
      if (attackVal == null || defendRaw == null) continue;
      const allowed = p.allowed(defendRaw);
      // Attacker strength vs what this defence typically gives up. Positive
      // means the attacker's normal level already beats what the defence
      // usually concedes — the attacker's advantage.
      const edge = p.lowerIsBetterForAttack ? allowed - attackVal : attackVal - allowed;
      // Only the attacker-favoured direction is a talking point: "their
      // strength meets your weakness" or "your strength meets theirs".
      const size = edge / p.threshold;
      if (size < 1) continue;

      const favours: Gap["favours"] = side.youAttacking ? "you" : "them";
      const title = side.youAttacking ? `Where you can attack: ${p.label.toLowerCase()}` : `Where they can hurt you: ${p.label.toLowerCase()}`;
      const attackerSubject = side.youAttacking ? "You" : side.attacker;
      const defenderSubject = side.youAttacking ? side.defender : "You";
      const a = `${attackVal.toFixed(1)}%`;
      const d = `${allowed.toFixed(1)}%`;
      const attackLine = p.attackText(side.youAttacking ? "You" : side.attacker, a)
        .replace("your own", side.youAttacking ? "your own" : "their own");
      const defendLine = p.defendText(side.youAttacking ? side.defender : "you", d);
      const body = `${attackLine}, and ${defendLine} — a ${edge.toFixed(1)}-point gap. ${side.youAttacking ? p.meaning.you : p.meaning.them}`;

      gaps.push({
        key: `${side.youAttacking ? "you" : "them"}-${p.attack}`,
        title,
        favours,
        size,
        body,
        evidence: [
          `${attackerSubject}: ${metricDef(p.attack).label} ${attackVal.toFixed(1)}% over ${side.a.games} games`,
          `${defenderSubject}: ${p.defend === "drebPct" ? "offensive rebound % allowed" : metricDef(p.defend).label} ${allowed.toFixed(1)}% over ${side.d.games} games`,
        ],
      });
    }
  }
  return gaps.sort((a, b) => b.size - a.size);
}

// ── Shot zones ─────────────────────────────────────────────────────────────

export interface ZoneProfile {
  attempts: number;
  groups: ShotGroup[];
}

const SHOT_ZONE_LABELS = [
  { key: "ra", label: "Restricted" },
  { key: "paint", label: "Paint (non-RA)" },
  { key: "mid", label: "Mid-range" },
  { key: "lw3", label: "L Wing 3" },
  { key: "rw3", label: "R Wing 3" },
  { key: "lc3", label: "L Corner 3" },
  { key: "rc3", label: "R Corner 3" },
];

export function zoneProfile(shots: ShotData[]): ZoneProfile {
  const totals: Record<string, ZoneTotals> = {};
  shots.forEach((shot) => {
    const zone = shotZone(shot);
    const t = (totals[zone] ??= { made: 0, total: 0, points: 0 });
    t.total += 1;
    if (shot.success) {
      t.made += 1;
      t.points += SHOT_ZONE_POINTS[zone] ?? 2;
    }
  });
  const analysis = analyseDistribution(totals, SHOT_ZONE_LABELS);
  return { attempts: analysis.totalAttempts, groups: analysis.groups };
}

/** Below this many attempts in an area, its percentages are not quoted. */
export const MIN_GROUP_ATTEMPTS = 12;

const GROUP_PHRASE: Record<ShotGroup["key"], string> = {
  rim: "at the rim",
  paint: "in the paint",
  mid: "from mid-range",
  three: "from three",
};

/**
 * Zone matchups: where each offence gets its shots and how well it converts,
 * against where the other defence concedes shots and how well opponents
 * convert there.
 */
export function zoneGaps(args: {
  youName: string;
  themName: string;
  yourShots: ZoneProfile;
  theirShots: ZoneProfile;
  yourAllowed: ZoneProfile;
  theirAllowed: ZoneProfile;
}): Gap[] {
  const gaps: Gap[] = [];
  const pairs = [
    { attacking: true, off: args.yourShots, def: args.theirAllowed },
    { attacking: false, off: args.theirShots, def: args.yourAllowed },
  ];

  for (const { attacking, off, def } of pairs) {
    for (const group of off.groups) {
      const conceded = def.groups.find((g) => g.key === group.key);
      if (!conceded || group.attempts < MIN_GROUP_ATTEMPTS || conceded.attempts < MIN_GROUP_ATTEMPTS) continue;
      if (group.pointsPerShot == null || conceded.pointsPerShot == null) continue;

      // A matchup is worth naming when the offence both uses the area (a
      // real share of its shots) and scores well there, and the defence
      // concedes well there too.
      const bothStrong = group.pointsPerShot >= 1.0 && conceded.pointsPerShot >= 1.0 && group.share >= 20;
      if (!bothStrong) continue;

      const attacker = attacking ? "You" : args.themName;
      const defender = attacking ? args.themName : "you";
      const size = (group.pointsPerShot + conceded.pointsPerShot - 2) * 10 + group.share / 20;
      gaps.push({
        key: `${attacking ? "you" : "them"}-zone-${group.key}`,
        title: attacking
          ? `Where you can attack: shots ${GROUP_PHRASE[group.key]}`
          : `Where they can hurt you: shots ${GROUP_PHRASE[group.key]}`,
        favours: attacking ? "you" : "them",
        size,
        body:
          `${attacker} take ${Math.round(group.share)}% of ${attacking ? "your" : "their"} shots ${GROUP_PHRASE[group.key]} and score ${group.pointsPerShot.toFixed(2)} points per shot there, ` +
          `and ${defender} concede ${conceded.pointsPerShot.toFixed(2)} per shot ${GROUP_PHRASE[group.key]} (${Math.round(conceded.share)}% of shots against). ` +
          (attacking
            ? "One of your strongest areas meets a weakness of theirs — build the plan around getting there."
            : "Their preferred area is also one you have struggled to protect — take it away first."),
        evidence: [
          `${attacker}: ${group.made}/${group.attempts} ${GROUP_PHRASE[group.key]} (${group.fgPct?.toFixed(0)}%)`,
          `${attacking ? args.themName : "You"} allow: ${conceded.made}/${conceded.attempts} ${GROUP_PHRASE[group.key]} (${conceded.fgPct?.toFixed(0)}%)`,
        ],
      });
    }
  }
  return gaps.sort((a, b) => b.size - a.size);
}
