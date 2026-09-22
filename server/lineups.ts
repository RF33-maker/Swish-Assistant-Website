/**
 * Five-man units built from `player_on_court_stints` (one row per player per stint, so a stint
 * appears five times). Kept free of I/O so it can be tested against real rows.
 */

export type StintRow = {
  stint_id: string;
  game_key: string;
  team_id: string;
  player_id: string;
  player_name: string | null;
  seconds_played: number | null;
  points_for: number | null;
  points_against: number | null;
  possessions_for: number | null;
  possessions_against: number | null;
};

export type UnitMember = { key: string; ids: Map<string, number>; names: Map<string, number> };

export type Unit = {
  team_id: string;
  key: string;
  secs: number;
  pf: number;
  pa: number;
  posf: number;
  posa: number;
  games: Set<string>;
  members: UnitMember[];
};

export type UnitMetrics = {
  minutes: number;
  games: number;
  pf: number;
  pa: number;
  plusMinus: number;
  ortg: number | null;
  drtg: number | null;
  net: number | null;
};

export type LineupMetric = "net" | "plusminus" | "minutes";

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/**
 * "Ben Baker" / "B. Baker" / "Benedict Baker" all become "b baker", so a player who has more than
 * one record (a roster placeholder next to the full-name row) is counted once in a unit. Hyphens
 * and generational suffixes are ignored, so "Raheem May-Thompson" matches "R May Thompson" and
 * "Rodney Glasgow Jr" matches "R. Glasgow".
 */
export function playerNameKey(name: string | null | undefined): string {
  const parts = (name || "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  if (parts.length === 0) return "";
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

/** Groups stint rows into units per team. Stints that don't have exactly five people are skipped. */
export function buildUnits(rows: StintRow[]): { units: Unit[]; stintsUsed: number; stintsSkipped: number } {
  type Stint = { team_id: string; game_key: string; secs: number; pf: number; pa: number; posf: number; posa: number; members: Map<string, UnitMember> };
  const stints = new Map<string, Stint>();

  for (const r of rows) {
    const key = playerNameKey(r.player_name);
    if (!key || !r.stint_id || !r.team_id) continue;
    let s = stints.get(r.stint_id);
    if (!s) {
      s = { team_id: r.team_id, game_key: r.game_key, secs: 0, pf: 0, pa: 0, posf: 0, posa: 0, members: new Map() };
      stints.set(r.stint_id, s);
    }
    // The stint's numbers repeat on each of its five rows.
    s.secs = Math.max(s.secs, Number(r.seconds_played) || 0);
    s.pf = Math.max(s.pf, Number(r.points_for) || 0);
    s.pa = Math.max(s.pa, Number(r.points_against) || 0);
    s.posf = Math.max(s.posf, Number(r.possessions_for) || 0);
    s.posa = Math.max(s.posa, Number(r.possessions_against) || 0);
    let m = s.members.get(key);
    if (!m) s.members.set(key, (m = { key, ids: new Map(), names: new Map() }));
    m.ids.set(r.player_id, (m.ids.get(r.player_id) || 0) + 1);
    if (r.player_name) m.names.set(r.player_name, (m.names.get(r.player_name) || 0) + 1);
  }

  const units = new Map<string, Unit>();
  let used = 0;
  let skipped = 0;
  for (const s of Array.from(stints.values())) {
    if (s.members.size !== 5 || s.secs <= 0) {
      skipped += 1;
      continue;
    }
    used += 1;
    const keys = Array.from(s.members.keys()).sort();
    const id = `${s.team_id}|${keys.join("|")}`;
    let u = units.get(id);
    if (!u) {
      units.set(id, (u = { team_id: s.team_id, key: id, secs: 0, pf: 0, pa: 0, posf: 0, posa: 0, games: new Set(), members: keys.map((k) => ({ key: k, ids: new Map(), names: new Map() })) }));
    }
    u.secs += s.secs;
    u.pf += s.pf;
    u.pa += s.pa;
    u.posf += s.posf;
    u.posa += s.posa;
    u.games.add(s.game_key);
    for (const um of u.members) {
      const sm = s.members.get(um.key)!;
      sm.ids.forEach((n, pid) => um.ids.set(pid, (um.ids.get(pid) || 0) + n));
      sm.names.forEach((n, name) => um.names.set(name, (um.names.get(name) || 0) + n));
    }
  }
  return { units: Array.from(units.values()), stintsUsed: used, stintsSkipped: skipped };
}

export function unitMetrics(u: Unit): UnitMetrics {
  const ortg = u.posf > 0 ? (100 * u.pf) / u.posf : null;
  const drtg = u.posa > 0 ? (100 * u.pa) / u.posa : null;
  return {
    minutes: u.secs / 60,
    games: u.games.size,
    pf: u.pf,
    pa: u.pa,
    plusMinus: u.pf - u.pa,
    ortg,
    drtg,
    net: ortg != null && drtg != null ? ortg - drtg : null,
  };
}

/**
 * A unit is only ranked once it has played enough together, and only if its recorded possessions
 * are plausible for the minutes (a few units have minutes but almost no events, which would give
 * absurd ratings).
 */
export function qualifies(m: UnitMetrics, u: Unit, minMinutes: number): boolean {
  const possessions = u.posf + u.posa;
  return m.minutes >= minMinutes && possessions >= 12 && possessions / m.minutes >= 1.2;
}

export function rankUnits(units: Unit[], metric: LineupMetric, minMinutes: number): { unit: Unit; m: UnitMetrics }[] {
  const scored = units
    .map((unit) => ({ unit, m: unitMetrics(unit) }))
    .filter(({ unit, m }) => qualifies(m, unit, minMinutes));
  const value = ({ m }: { m: UnitMetrics }) => (metric === "minutes" ? m.minutes : metric === "plusminus" ? m.plusMinus : m.net ?? -Infinity);
  scored.sort((a, b) => value(b) - value(a) || b.m.minutes - a.m.minutes);
  return scored;
}

/** Same club-name folding as the site's team pages: "Worcester Wolves Senior Men I" = "Worcester Wolves". */
export function normalizeClubName(name: string | null | undefined): string {
  return (name || "")
    .trim()
    .replace(/\s+Senior\s+Men\s*/gi, " ")
    .replace(/!/g, "")
    .replace(/^#+/, "")
    .replace(/\s+I(?![IVX])\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type BoxRow = { game_key: string; team_id: string; sminutes: string | null };
export type TeamPointsRow = { game_key: string; team_id: string; tot_spoints: number | null };

const minutesToSeconds = (v: string | null): number => {
  const m = /^(\d+):(\d+)/.exec(v ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/**
 * Which team-games can be trusted. Lineup tracking sometimes can't tell players apart, so a game is
 * only used when it reconciles with the feed's own box score:
 *   - at least 95% of its stints have five distinct players,
 *   - the stints add up to the game length implied by the box-score minutes (within 3%),
 *   - the points scored in those stints match the team's final points (within 2).
 * Returns "gameKey|teamId" keys, plus how many team-games were checked.
 */
export function reliableTeamGames(
  rows: StintRow[],
  box: BoxRow[],
  points: TeamPointsRow[],
): { reliable: Set<string>; checked: number; all: Set<string> } {
  type S = { secs: number; pf: number; names: Set<string> };
  const stints = new Map<string, S & { team_id: string; game_key: string }>();
  for (const r of rows) {
    if (!r.stint_id) continue;
    let s = stints.get(r.stint_id);
    if (!s) stints.set(r.stint_id, (s = { team_id: r.team_id, game_key: r.game_key, secs: 0, pf: 0, names: new Set() }));
    s.secs = Math.max(s.secs, Number(r.seconds_played) || 0);
    s.pf = Math.max(s.pf, Number(r.points_for) || 0);
    const key = playerNameKey(r.player_name);
    if (key) s.names.add(key);
  }

  const perTeamGame = new Map<string, { secs: number; pf: number; stints: number; clean: number }>();
  stints.forEach((s) => {
    const k = `${s.game_key}|${s.team_id}`;
    const t = perTeamGame.get(k) ?? { secs: 0, pf: 0, stints: 0, clean: 0 };
    t.secs += s.secs;
    t.pf += s.pf;
    t.stints += 1;
    if (s.names.size === 5) t.clean += 1;
    perTeamGame.set(k, t);
  });

  const boxSecs = new Map<string, number>();
  for (const b of box) {
    const k = `${b.game_key}|${b.team_id}`;
    boxSecs.set(k, (boxSecs.get(k) || 0) + minutesToSeconds(b.sminutes));
  }
  const finalPoints = new Map(points.map((p) => [`${p.game_key}|${p.team_id}`, Number(p.tot_spoints) || 0]));

  const reliable = new Set<string>();
  perTeamGame.forEach((t, k) => {
    const gameSecs = (boxSecs.get(k) || 0) / 5;
    const final = finalPoints.get(k);
    if (
      gameSecs > 0 &&
      final != null &&
      t.clean / t.stints >= 0.95 &&
      Math.abs(t.secs - gameSecs) <= 0.03 * gameSecs &&
      Math.abs(t.pf - final) <= 2
    ) {
      reliable.add(k);
    }
  });
  return { reliable, checked: perTeamGame.size, all: new Set(Array.from(perTeamGame.keys())) };
}
