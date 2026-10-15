/**
 * A team's roster and league-percentile strengths and weaknesses, for the
 * scouting report. Pure: it takes box-score rows and returns plain data, so
 * the numbers can be checked by hand and tested against real rows.
 *
 * A percentile says how many of the league's players this player is ahead of.
 * Each player (10+ minutes a game over 2+ games) is compared with every such
 * player in the league. Counting stats are compared per 40 minutes so bench
 * players are not marked down for minutes; shooting percentages need a
 * minimum number of attempts. Turnovers and fouls are scored so that fewer is
 * better, which keeps "higher percentile is better" true for every measure.
 */

export interface BoxScoreRow {
  league_id?: string | null;
  game_key?: string | null;
  player_id: string | null;
  full_name: string | null;
  team_name: string | null;
  shirtnumber?: string | number | null;
  sminutes: string | number | null;
  spoints?: number | null;
  sreboundstotal?: number | null;
  sreboundsoffensive?: number | null;
  sassists?: number | null;
  sturnovers?: number | null;
  ssteals?: number | null;
  sblocks?: number | null;
  sfoulspersonal?: number | null;
  sfreethrowsmade?: number | null;
  sfreethrowsattempted?: number | null;
  sfieldgoalsmade?: number | null;
  sfieldgoalsattempted?: number | null;
  sthreepointersmade?: number | null;
  sthreepointersattempted?: number | null;
  stwopointersmade?: number | null;
  stwopointersattempted?: number | null;
}

export const BOX_SCORE_COLUMNS =
  "league_id, game_key, player_id, full_name, team_name, shirtnumber, sminutes, spoints, sreboundstotal, sreboundsoffensive, sassists, sturnovers, ssteals, sblocks, sfoulspersonal, sfreethrowsmade, sfreethrowsattempted, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, stwopointersmade, stwopointersattempted";

const SUM_KEYS = [
  "spoints", "sreboundstotal", "sreboundsoffensive", "sassists", "sturnovers", "ssteals", "sblocks", "sfoulspersonal",
  "sfreethrowsattempted", "sfreethrowsmade", "sfieldgoalsmade", "sfieldgoalsattempted",
  "sthreepointersmade", "sthreepointersattempted", "stwopointersmade", "stwopointersattempted",
] as const;
type SumKey = (typeof SUM_KEYS)[number];

export interface PlayerTotals {
  id: string;
  name: string;
  team: string;
  /** The club this player's rows belong to, as `clubOf` names it (the team name by default). */
  club: string;
  /** Every player id (one per competition, say) that went into this person. */
  playerIds: string[];
  shirt: string | null;
  gp: number;
  min: number;
  mpg: number;
  t: Record<SumKey, number>;
}

/** "MM:SS", "MM" or a number of minutes, as a number of minutes. */
export function parseMinutes(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parts = String(value).split(":");
  const m = Number(parts[0]);
  if (!Number.isFinite(m)) return 0;
  const s = parts.length > 1 ? Number(parts[1]) : 0;
  return m + (Number.isFinite(s) ? s / 60 : 0);
}

export interface AggregateOptions {
  /**
   * Which rows are one person. By default a player id. Pass one that merges a
   * person across competitions (and across the spellings of their name) to
   * count a whole season's games together.
   */
  personKey?: (row: BoxScoreRow) => string;
  /** The club a row belongs to, for picking out a team and a league's players. Defaults to the team name. */
  clubOf?: (row: BoxScoreRow) => string;
  /** Picks the name shown when a person has several spellings. Defaults to the longest. */
  displayName?: (names: string[]) => string;
}

/** One entry per player, summed over the games they actually played. */
export function aggregatePlayers(rows: BoxScoreRow[], opts: AggregateOptions = {}): Map<string, PlayerTotals> {
  const out = new Map<string, PlayerTotals>();
  const names = new Map<string, Set<string>>();
  for (const r of rows) {
    const minutes = parseMinutes(r.sminutes);
    if (minutes <= 0) continue; // did not play
    const id = (opts.personKey ? opts.personKey(r) : r.player_id) || `${r.team_name}|${r.full_name}`;
    let p = out.get(id);
    if (!p) {
      p = {
        id, name: r.full_name || "Player", team: r.team_name || "", club: opts.clubOf ? opts.clubOf(r) : r.team_name || "",
        playerIds: [], shirt: r.shirtnumber != null ? String(r.shirtnumber) : null,
        gp: 0, min: 0, mpg: 0, t: Object.fromEntries(SUM_KEYS.map((k) => [k, 0])) as Record<SumKey, number>,
      };
      out.set(id, p);
    }
    if (r.player_id && !p.playerIds.includes(r.player_id)) p.playerIds.push(r.player_id);
    if (r.full_name) {
      const set = names.get(id) ?? new Set<string>();
      set.add(r.full_name);
      names.set(id, set);
    }
    p.gp += 1;
    p.min += minutes;
    if (!p.shirt && r.shirtnumber != null) p.shirt = String(r.shirtnumber);
    for (const k of SUM_KEYS) p.t[k] += Number(r[k]) || 0;
  }
  out.forEach((p, id) => {
    p.mpg = p.min / p.gp;
    const spellings = Array.from(names.get(id) ?? []);
    if (spellings.length > 1) p.name = opts.displayName ? opts.displayName(spellings) : spellings.sort((a, b) => b.length - a.length)[0];
  });
  return out;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const fmt = (v: number) => String(r1(v));
const plural = (v: number, one: string, many: string) => `${fmt(v)} ${r1(v) === 1 ? one : many}`;

interface Metric {
  key: string;
  label: string;
  /** The value players are ranked on (counting stats per 40 minutes). */
  value: (p: PlayerTotals) => number;
  higherIsBetter: boolean;
  eligible: (p: PlayerTotals) => boolean;
  /** The player's number in the units a coach knows (a game, a percentage). */
  text: (p: PlayerTotals) => string;
}

const per40 = (p: PlayerTotals, k: SumKey) => (p.t[k] / p.min) * 40;
const perGame = (p: PlayerTotals, k: SumKey) => p.t[k] / p.gp;
const share = (made: number, att: number) => (att > 0 ? (made / att) * 100 : 0);

export const MIN_MPG = 10;
export const MIN_GAMES = 2;
export const STRENGTH_ABOVE = 60;
export const WEAKNESS_BELOW = 40;

export const METRICS: Metric[] = [
  { key: "pts", label: "Scoring", value: (p) => per40(p, "spoints"), higherIsBetter: true, eligible: () => true, text: (p) => `${fmt(perGame(p, "spoints"))} points a game` },
  { key: "fg", label: "Shooting from the field", value: (p) => share(p.t.sfieldgoalsmade, p.t.sfieldgoalsattempted), higherIsBetter: true, eligible: (p) => p.t.sfieldgoalsattempted >= 15, text: (p) => `${fmt(share(p.t.sfieldgoalsmade, p.t.sfieldgoalsattempted))}% on ${p.t.sfieldgoalsattempted} shots` },
  { key: "2p", label: "Two-point shooting", value: (p) => share(p.t.stwopointersmade, p.t.stwopointersattempted), higherIsBetter: true, eligible: (p) => p.t.stwopointersattempted >= 10, text: (p) => `${fmt(share(p.t.stwopointersmade, p.t.stwopointersattempted))}% (${p.t.stwopointersmade} of ${p.t.stwopointersattempted})` },
  { key: "3p", label: "Three-point shooting", value: (p) => share(p.t.sthreepointersmade, p.t.sthreepointersattempted), higherIsBetter: true, eligible: (p) => p.t.sthreepointersattempted >= 5, text: (p) => `${fmt(share(p.t.sthreepointersmade, p.t.sthreepointersattempted))}% (${p.t.sthreepointersmade} of ${p.t.sthreepointersattempted})` },
  { key: "ft", label: "Free throws", value: (p) => share(p.t.sfreethrowsmade, p.t.sfreethrowsattempted), higherIsBetter: true, eligible: (p) => p.t.sfreethrowsattempted >= 4, text: (p) => `${fmt(share(p.t.sfreethrowsmade, p.t.sfreethrowsattempted))}% (${p.t.sfreethrowsmade} of ${p.t.sfreethrowsattempted})` },
  { key: "fta", label: "Getting to the line", value: (p) => per40(p, "sfreethrowsattempted"), higherIsBetter: true, eligible: () => true, text: (p) => `${fmt(perGame(p, "sfreethrowsattempted"))} free throws a game` },
  { key: "reb", label: "Rebounding", value: (p) => per40(p, "sreboundstotal"), higherIsBetter: true, eligible: () => true, text: (p) => `${fmt(perGame(p, "sreboundstotal"))} a game` },
  { key: "oreb", label: "Offensive rebounding", value: (p) => per40(p, "sreboundsoffensive"), higherIsBetter: true, eligible: () => true, text: (p) => `${fmt(perGame(p, "sreboundsoffensive"))} a game` },
  { key: "ast", label: "Passing", value: (p) => per40(p, "sassists"), higherIsBetter: true, eligible: () => true, text: (p) => `${plural(perGame(p, "sassists"), "assist", "assists")} a game` },
  { key: "tov", label: "Ball security", value: (p) => per40(p, "sturnovers"), higherIsBetter: false, eligible: () => true, text: (p) => `${plural(perGame(p, "sturnovers"), "turnover", "turnovers")} a game` },
  { key: "stocks", label: "Steals and blocks", value: (p) => per40(p, "ssteals") + per40(p, "sblocks"), higherIsBetter: true, eligible: () => true, text: (p) => `${plural(perGame(p, "ssteals"), "steal", "steals")} and ${plural(perGame(p, "sblocks"), "block", "blocks")} a game` },
  { key: "pf", label: "Fouling", value: (p) => per40(p, "sfoulspersonal"), higherIsBetter: false, eligible: () => true, text: (p) => `${plural(perGame(p, "sfoulspersonal"), "foul", "fouls")} a game` },
];

export type Tier = "Elite" | "Strength" | "Average" | "Weakness" | "Among the worst";
export function tierOf(percentile: number): Tier {
  if (percentile >= 90) return "Elite";
  if (percentile >= STRENGTH_ABOVE) return "Strength";
  if (percentile > WEAKNESS_BELOW) return "Average";
  if (percentile > 10) return "Weakness";
  return "Among the worst";
}

/** Percentile of `value` among `values` (which include it): the share of the others it beats, ties counting half. */
export function percentileOf(value: number, values: number[], higherIsBetter: boolean): { percentile: number; ahead: number; others: number } {
  let below = 0;
  let ties = 0;
  for (const v of values) {
    if (v === value) ties += 1;
    else if (higherIsBetter ? v < value : v > value) below += 1;
  }
  ties -= 1; // the player themself
  const others = Math.max(values.length - 1, 1);
  const percentile = Math.round(((below + 0.5 * ties) / others) * 100);
  return { percentile, ahead: Math.round((percentile / 100) * others), others: values.length - 1 };
}

export interface Aspect {
  key: string;
  label: string;
  text: string;
  percentile: number;
  /** Size of the pool this percentile was measured in (it differs by measure). */
  pool: number;
  /** How many of the other players in the pool this player is ahead of. */
  ahead: number;
  tier: Tier;
}

/** A player's headshot, when one is on their record. */
export interface Headshot {
  url: string;
  /** Vertical focus (0 to 100) for cropping a tall photo to the face. */
  focusY: number | null;
}

export interface RosterEntry {
  playerId: string;
  /** Every player id that went into this person, for looking up a headshot. */
  playerIds: string[];
  photo?: Headshot | null;
  name: string;
  shirt: string | null;
  gp: number;
  mpg: number;
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgPct: number | null; threePct: number | null; ftPct: number | null;
  /** Has a strengths and weaknesses profile (10+ minutes a game over 2+ games). */
  profiled: boolean;
}

export interface PlayerProfile {
  playerId: string;
  playerIds: string[];
  photo?: Headshot | null;
  name: string;
  shirt: string | null;
  gp: number;
  mpg: number;
  pts: number; reb: number; ast: number;
  strengths: Aspect[];
  weaknesses: Aspect[];
}

export interface ScoutRoster {
  /** Players in the league who qualify (10+ minutes a game over 2+ games). */
  poolSize: number;
  /** Smallest and largest pool across the measures (shooting percentages need attempts). */
  poolRange: [number, number];
  roster: RosterEntry[];
  profiles: PlayerProfile[];
}

const pctOrNull = (made: number, att: number) => (att > 0 ? r1((made / att) * 100) : null);

/**
 * `leagueRows` are every box-score row in the competition; `isTeam` picks the
 * scouted team's rows out of them.
 */
export interface BuildOptions extends AggregateOptions {
  /** Which clubs' players make up the league the percentiles are measured against. Defaults to everyone in the rows. */
  inPool?: (club: string) => boolean;
}

export function buildScoutRoster(leagueRows: BoxScoreRow[], isTeam: (club: string) => boolean, opts: BuildOptions = {}): ScoutRoster {
  const all = aggregatePlayers(leagueRows, opts);
  const inPool = opts.inPool ?? (() => true);
  const pool = new Map(Array.from(all.entries()).filter(([, p]) => p.mpg >= MIN_MPG && p.gp >= MIN_GAMES && inPool(p.club)));

  const strengths = new Map<string, Aspect[]>();
  const weaknesses = new Map<string, Aspect[]>();
  let smallest = Infinity;
  let largest = 0;
  for (const metric of METRICS) {
    const eligible = Array.from(pool.values()).filter(metric.eligible);
    if (eligible.length < 3) continue;
    smallest = Math.min(smallest, eligible.length);
    largest = Math.max(largest, eligible.length);
    const values = eligible.map(metric.value);
    for (const p of eligible) {
      if (!isTeam(p.club)) continue;
      const { percentile, ahead, others } = percentileOf(metric.value(p), values, metric.higherIsBetter);
      const aspect: Aspect = { key: metric.key, label: metric.label, text: metric.text(p), percentile, pool: others + 1, ahead, tier: tierOf(percentile) };
      if (percentile >= STRENGTH_ABOVE) strengths.set(p.id, [...(strengths.get(p.id) || []), aspect]);
      else if (percentile <= WEAKNESS_BELOW) weaknesses.set(p.id, [...(weaknesses.get(p.id) || []), aspect]);
    }
  }

  const team = Array.from(all.values()).filter((p) => isTeam(p.club)).sort((a, b) => b.mpg - a.mpg || a.name.localeCompare(b.name));
  const roster: RosterEntry[] = team.map((p) => ({
    playerId: p.id, playerIds: p.playerIds, name: p.name, shirt: p.shirt, gp: p.gp, mpg: r1(p.mpg),
    pts: r1(perGame(p, "spoints")), reb: r1(perGame(p, "sreboundstotal")), ast: r1(perGame(p, "sassists")),
    stl: r1(perGame(p, "ssteals")), blk: r1(perGame(p, "sblocks")), tov: r1(perGame(p, "sturnovers")),
    fgPct: pctOrNull(p.t.sfieldgoalsmade, p.t.sfieldgoalsattempted),
    threePct: pctOrNull(p.t.sthreepointersmade, p.t.sthreepointersattempted),
    ftPct: pctOrNull(p.t.sfreethrowsmade, p.t.sfreethrowsattempted),
    profiled: pool.has(p.id),
  }));
  const profiles: PlayerProfile[] = team.filter((p) => pool.has(p.id)).map((p) => ({
    playerId: p.id, playerIds: p.playerIds, name: p.name, shirt: p.shirt, gp: p.gp, mpg: r1(p.mpg),
    pts: r1(perGame(p, "spoints")), reb: r1(perGame(p, "sreboundstotal")), ast: r1(perGame(p, "sassists")),
    strengths: (strengths.get(p.id) || []).sort((a, b) => b.percentile - a.percentile).slice(0, 3),
    weaknesses: (weaknesses.get(p.id) || []).sort((a, b) => a.percentile - b.percentile).slice(0, 3),
  }));
  return { poolSize: pool.size, poolRange: [Number.isFinite(smallest) ? smallest : 0, largest], roster, profiles };
}

/** The line under a percentile bar, in plain words. */
export function describeStanding(a: Aspect): string {
  const others = a.pool - 1;
  if (a.ahead >= others) return `Best of all ${a.pool} league players`;
  if (a.ahead <= 0) return `Lowest of all ${a.pool} league players`;
  return `Ahead of ${a.ahead} of ${others} other league players`;
}

export function ordinalOf(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] || "th"}`;
}
