import { shotSide, shotZone, ZONE_GROUPS, type ShotZone } from "./shotZones.ts";

/**
 * Turns raw rows for one opponent's recent games into the fact pack the
 * scouting agent reasons over.
 *
 * Pure: no database access, so it can be run against exported rows in a
 * script and checked by hand. Every number the agent is allowed to quote is
 * produced here; the model is never handed raw tables.
 *
 * Perspective throughout is the scouted team ("they"). "for" = scored by
 * them, "against" = scored on them.
 */

// ---------- Raw input ----------

export interface TeamGameRow {
  game_key: string;
  team_id: string;
  league_id: string;
  name: string;
  played_at: string; // ISO, from game_schedule when known
  competition: string | null;
  // Box/advanced (nullable in the feed)
  score: number | null;
  p1_score: number | null; p2_score: number | null; p3_score: number | null; p4_score: number | null;
  pace: number | null; off_rating: number | null; def_rating: number | null; net_rating: number | null;
  efg_percent: number | null; tov_percent: number | null; oreb_percent: number | null; dreb_percent: number | null;
  ft_rate: number | null; three_point_rate: number | null; ast_percent: number | null;
  opp_efg_percent: number | null; opp_tov_percent: number | null; opp_ft_rate: number | null; opp_oreb_percent: number | null;
  pts_percent_pitp: number | null; pts_percent_fastbreak: number | null; pts_percent_second_chance: number | null;
  pts_percent_off_turnovers: number | null; pts_percent_3pt: number | null; pts_percent_ft: number | null;
  tot_sbenchpoints: number | null; tot_spoints: number | null;
  possessions: number | null;
}

export interface EventRow {
  game_key: string;
  team_id: string | null;
  action_number: number;
  period: number;
  clock: string | null;
  player_name: string | null;
  action_type: string;
  sub_type: string | null;
  qualifiers: string[] | null;
  success: boolean | null;
  team_score: number | null;
  opp_score: number | null;
  previous_action: number | null;
}

export interface ShotRow {
  game_key: string;
  action_number: number | null;
  player_name: string | null;
  x: number;
  y: number;
  shot_type: string | null;
  sub_type: string | null;
  success: boolean;
}

export interface LineupStintRow {
  game_key: string;
  team_id: string;
  lineup_key: string;
  lineup_names: string[];
  period: number;
  start_game_secs: number;
  end_game_secs: number;
  seconds_played: number;
  points_for: number;
  points_against: number;
  possessions_for: number | null;
  possessions_against: number | null;
}

export interface PlayerStintRow {
  game_key: string;
  team_id: string;
  player_name: string;
  period: number;
  start_game_secs: number;
  end_game_secs: number;
  seconds_played: number;
  points_for: number;
  points_against: number;
  possessions_for: number | null;
  possessions_against: number | null;
}

export interface RosterRow {
  game_key: string;
  team_id: string;
  player_name: string;
  shirt_number: string | null;
  starter: boolean | null;
}

export interface LeagueTeamRow {
  team_id: string;
  name: string;
  // same advanced columns as TeamGameRow, per game
  [k: string]: unknown;
}

export interface ScoutingBundle {
  opponentName: string;
  targetLeagueId: string;
  targetLeagueName: string | null;
  /** The scouted team's games, one row per game, newest first. */
  games: TeamGameRow[];
  /** The other side's row for each of those games, keyed by game_key. */
  opponentsInGames: Record<string, TeamGameRow>;
  events: EventRow[]; // both teams, all games
  shots: ShotRow[]; // both teams, all games
  lineupStints: LineupStintRow[]; // scouted team only
  playerStints: PlayerStintRow[]; // scouted team only
  rosters: RosterRow[]; // scouted team only
  /** Every team-game row in the target competition, for league context. */
  leagueRows: TeamGameRow[];
  /** Plain-English description of what the league ranks are measured against. */
  baselineNote?: string | null;
  /** Optional: the coach's own team, profiled the same way for a matchup read. */
  myTeam?: { name: string; games: TeamGameRow[]; opponentsInGames: Record<string, TeamGameRow> } | null;
}

// ---------- Helpers ----------

const r1 = (n: number) => Math.round(n * 10) / 10;
const r0 = (n: number) => Math.round(n);
const pct = (made: number, att: number) => (att > 0 ? r1((made / att) * 100) : null);
const avg = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Name key that survives the feed's case and initial differences ("D. AMEEN" vs "D. Ameen"). */
export function nameKey(name: string | null | undefined): string {
  // The feed names the same player "Jaylon White", "J. White" and "J. WHITE"
  // within a single game, so key on first initial + surname.
  const clean = (name || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tokens = clean.split(/[\s.]+/).map((t) => t.replace(/[^a-z'-]/g, "")).filter(Boolean)
    .filter((t, i, all) => !(i === all.length - 1 && all.length > 2 && /^(jr|sr|ii|iii|iv)$/.test(t)));
  if (tokens.length === 0) return "";
  if (tokens.length === 1) return tokens[0];
  return tokens[0][0] + tokens[tokens.length - 1].replace(/[^a-z]/g, "");
}

/** Of several spellings of one player, the most informative (full first name over an initial). */
function betterName(a: string, b: string): string {
  const score = (n: string) => ((n.split(/\s+/)[0] || "").replace(".", "").length > 1 ? 100 : 0) + (n === n.toUpperCase() ? -10 : 0) + n.length;
  return score(b) > score(a) ? b : a;
}

/** Title-case an all-caps feed name for display. */
function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
}

/** Seconds elapsed in the game at an event, from period + "MM:SS(:cc)" clock. 10-minute quarters, 5-minute OT. */
export function gameSeconds(period: number, clock: string | null): number {
  const [mm, ss] = (clock || "0:0").split(":").map((p) => Number(p) || 0);
  const remaining = mm * 60 + ss;
  if (period <= 4) return (period - 1) * 600 + (600 - remaining);
  return 2400 + (period - 5) * 300 + (300 - remaining);
}

const SHOT_TYPES = new Set(["2pt", "3pt"]);

// ---------- Section builders ----------

type Metric = { value: number | null; leagueAvg: number | null; rank: number | null; of: number | null; better: "high" | "low" };

const IDENTITY_KEYS: Array<{ key: keyof TeamGameRow; label: string; better: "high" | "low" }> = [
  { key: "pace", label: "pace", better: "high" },
  { key: "off_rating", label: "offRating", better: "high" },
  { key: "def_rating", label: "defRating", better: "low" },
  { key: "net_rating", label: "netRating", better: "high" },
  { key: "efg_percent", label: "efgPct", better: "high" },
  { key: "tov_percent", label: "tovPct", better: "low" },
  { key: "oreb_percent", label: "orebPct", better: "high" },
  { key: "dreb_percent", label: "drebPct", better: "high" },
  { key: "ft_rate", label: "ftRate", better: "high" },
  { key: "three_point_rate", label: "threeRate", better: "high" },
  { key: "ast_percent", label: "astPct", better: "high" },
  { key: "opp_efg_percent", label: "oppEfgPct", better: "low" },
  { key: "opp_tov_percent", label: "forcedTovPct", better: "high" },
  { key: "opp_ft_rate", label: "oppFtRate", better: "low" },
  { key: "pts_percent_pitp", label: "ptsShareInPaint", better: "high" },
  { key: "pts_percent_fastbreak", label: "ptsShareFastBreak", better: "high" },
  { key: "pts_percent_second_chance", label: "ptsShareSecondChance", better: "high" },
  { key: "pts_percent_off_turnovers", label: "ptsShareOffTurnovers", better: "high" },
  { key: "pts_percent_3pt", label: "ptsShareThrees", better: "high" },
];

/** Advanced numbers in the feed are sometimes fractions (0.52) and sometimes percentages (52). */
function normPct(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}
const PERCENT_KEYS = new Set<keyof TeamGameRow>([
  "efg_percent", "tov_percent", "oreb_percent", "dreb_percent", "ft_rate", "three_point_rate", "ast_percent",
  "opp_efg_percent", "opp_tov_percent", "opp_ft_rate", "pts_percent_pitp", "pts_percent_fastbreak",
  "pts_percent_second_chance", "pts_percent_off_turnovers", "pts_percent_3pt",
]);
function metricOf(row: TeamGameRow, key: keyof TeamGameRow): number | null {
  const raw = row[key] as number | null;
  if (raw == null) return null;
  return PERCENT_KEYS.has(key) ? normPct(raw) : Number(raw);
}

function teamIdentity(games: TeamGameRow[], leagueRows: TeamGameRow[], teamName: string, isSame: (a: string, b: string) => boolean) {
  // League table of per-team averages in the target competition.
  // Group by club, not team_id: the baseline can span two seasons, and a club
  // has a different team_id (and sometimes name) in each.
  const byTeam = new Map<string, TeamGameRow[]>();
  const idGroup = new Map<string, string>();
  for (const row of leagueRows) {
    let key = idGroup.get(row.team_id);
    if (!key) {
      key = Array.from(byTeam.keys()).find((k) => isSame(k, row.name)) ?? row.name;
      idGroup.set(row.team_id, key);
    }
    if (!byTeam.has(key)) byTeam.set(key, []);
    byTeam.get(key)!.push(row);
  }
  const out: Record<string, Metric> = {};
  for (const { key, label, better } of IDENTITY_KEYS) {
    const value = avg(games.map((g) => metricOf(g, key)));
    const teamAvgs: Array<{ name: string; v: number }> = [];
    byTeam.forEach((rows) => {
      const v = avg(rows.map((g) => metricOf(g, key)));
      if (v != null) teamAvgs.push({ name: rows[0].name, v });
    });
    const leagueAvg = avg(teamAvgs.map((t) => t.v));
    let rank: number | null = null;
    if (value != null && teamAvgs.length >= 4) {
      // Rank the scouted team's recent value against the league's team averages.
      const others = teamAvgs.filter((t) => !isSame(t.name, teamName)).map((t) => t.v);
      const beats = others.filter((v) => (better === "high" ? v > value : v < value)).length;
      rank = beats + 1;
    }
    out[label] = {
      value: value == null ? null : r1(value),
      leagueAvg: leagueAvg == null ? null : r1(leagueAvg),
      rank,
      of: teamAvgs.length >= 4 ? Math.max(teamAvgs.length, rank ?? 0) : null,
      better,
    };
  }
  return out;
}

function quarterSplits(games: TeamGameRow[], opps: Record<string, TeamGameRow>) {
  const qs = [1, 2, 3, 4] as const;
  return qs.map((q) => {
    const k = `p${q}_score` as const;
    const f = avg(games.map((g) => g[k]));
    const a = avg(games.map((g) => opps[g.game_key]?.[k] ?? null));
    return { quarter: q, avgFor: f == null ? null : r1(f), avgAgainst: a == null ? null : r1(a), avgNet: f != null && a != null ? r1(f - a) : null };
  });
}

/**
 * Score timeline for one game from the scouted team's point of view.
 * Rebuilt from made baskets rather than the feed's running score, which is
 * missing for most older games. Ordered by game clock, then action number,
 * so late-inserted corrections land where they happened.
 */
function scoreTimeline(events: EventRow[], teamIds: Set<string>) {
  const scoring = events
    .filter((e) => e.success && e.team_id && (e.action_type === "2pt" || e.action_type === "3pt" || e.action_type === "freethrow"))
    .map((e) => ({ e, secs: gameSeconds(e.period, e.clock) }))
    .sort((a, b) => a.secs - b.secs || a.e.action_number - b.e.action_number);
  const points: Array<{ secs: number; period: number; us: number; them: number }> = [];
  let us = 0, them = 0;
  for (const { e, secs } of scoring) {
    const pts = e.action_type === "3pt" ? 3 : e.action_type === "2pt" ? 2 : 1;
    if (teamIds.has(e.team_id!)) us += pts; else them += pts;
    points.push({ secs, period: e.period, us, them });
  }
  return points;
}

/** Unanswered runs (5+ points to 0) within one game timeline; callers filter for bigger ones. */
function runsIn(timeline: ReturnType<typeof scoreTimeline>) {
  const runs: Array<{ side: "for" | "against"; points: number; period: number }> = [];
  let side: "for" | "against" | null = null;
  let size = 0, startPeriod = 1;
  let prevUs = 0, prevThem = 0;
  const close = () => { if (side && size >= 5) runs.push({ side, points: size, period: startPeriod }); };
  for (const p of timeline) {
    const du = p.us - prevUs, dt = p.them - prevThem;
    prevUs = p.us; prevThem = p.them;
    const scorer: "for" | "against" | null = du > 0 ? "for" : dt > 0 ? "against" : null;
    if (!scorer) continue;
    if (scorer === side) size += scorer === "for" ? du : dt;
    else { close(); side = scorer; size = scorer === "for" ? du : dt; startPeriod = p.period; }
  }
  close();
  return runs;
}

// ---------- Main ----------

export interface ComputeOptions {
  isSameTeam: (a: string, b: string) => boolean;
  now?: Date;
}

/**
 * The feed sometimes adds a phantom stint: one lineup "on court" for the whole
 * period with no points either way, overlapping the real chain of stints, so
 * a game's lineups can add up to 50 minutes. Per period, when the stints
 * overfill it, drop scoreless stints that overlap others.
 */
function dedupeLineupStints(stints: LineupStintRow[]): LineupStintRow[] {
  const groups = new Map<string, LineupStintRow[]>();
  for (const s of stints) {
    const k = `${s.game_key}#${s.period}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const overlaps = (a: LineupStintRow, b: LineupStintRow) =>
    a !== b && Math.min(a.end_game_secs, b.end_game_secs) - Math.max(a.start_game_secs, b.start_game_secs) > 0;
  const out: LineupStintRow[] = [];
  groups.forEach((rows) => {
    const periodLen = rows[0].period <= 4 ? 600 : 300;
    if (sum(rows.map((r) => r.seconds_played)) <= periodLen * 1.05) { out.push(...rows); return; }
    const kept = rows.filter((r) => !(r.points_for + r.points_against === 0 && rows.some((o) => overlaps(r, o))));
    out.push(...kept);
  });
  return out;
}

/** One row per player per lineup stint, so minutes and on/off come from the same deduplicated source. */
function playerStintsFrom(lineups: LineupStintRow[]): PlayerStintRow[] {
  return lineups.flatMap((s) => s.lineup_names.map((player_name) => ({
    game_key: s.game_key, team_id: s.team_id, player_name, period: s.period,
    start_game_secs: s.start_game_secs, end_game_secs: s.end_game_secs, seconds_played: s.seconds_played,
    points_for: s.points_for, points_against: s.points_against,
    possessions_for: s.possessions_for, possessions_against: s.possessions_against,
  })));
}

export function computeScoutingFacts(input: ScoutingBundle, opts: ComputeOptions) {
  const cleanLineups = dedupeLineupStints(input.lineupStints);
  const b: ScoutingBundle = { ...input, lineupStints: cleanLineups, playerStints: playerStintsFrom(cleanLineups) };
  const games = b.games;
  const gameKeys = new Set(games.map((g) => g.game_key));
  // Best spelling of every player we see, whichever table it came from.
  const best = new Map<string, string>();
  const seeName = (raw: string | null | undefined) => {
    if (!raw) return "";
    const k = nameKey(raw);
    if (!k) return "";
    const shown = displayName(raw.trim());
    best.set(k, best.has(k) ? betterName(best.get(k)!, shown) : shown);
    return k;
  };
  const nameOf = (k: string) => best.get(k) ?? k;
  for (const r of b.rosters) seeName(r.player_name);
  for (const s of b.playerStints) seeName(s.player_name);
  for (const s of b.lineupStints) s.lineup_names.forEach(seeName);
  const teamIds = new Set(games.map((g) => g.team_id));
  const isThem = (tid: string | null | undefined) => !!tid && teamIds.has(tid);

  // ----- overview -----
  const results = games.map((g) => {
    const opp = b.opponentsInGames[g.game_key];
    const us = g.score ?? g.tot_spoints ?? null;
    const them = opp?.score ?? opp?.tot_spoints ?? null;
    return {
      date: g.played_at.slice(0, 10),
      competition: g.competition,
      opponent: opp?.name ?? "Unknown",
      score: us != null && them != null ? `${us}-${them}` : null,
      result: us != null && them != null ? (us > them ? "W" : us < them ? "L" : "D") : null,
      margin: us != null && them != null ? us - them : null,
      inTargetCompetition: g.league_id === b.targetLeagueId,
    };
  });
  const wins = results.filter((r) => r.result === "W").length;
  const losses = results.filter((r) => r.result === "L").length;
  const inTarget = results.filter((r) => r.inTargetCompetition).length;

  // ----- events by game, split -----
  const eventsByGame = new Map<string, EventRow[]>();
  for (const e of b.events) {
    if (!gameKeys.has(e.game_key)) continue;
    if (!eventsByGame.has(e.game_key)) eventsByGame.set(e.game_key, []);
    eventsByGame.get(e.game_key)!.push(e);
  }
  const gamesWithEvents = Array.from(eventsByGame.keys());
  const nEv = gamesWithEvents.length || 1;

  // ----- game flow: runs, clutch -----
  const allRuns: ReturnType<typeof runsIn> = [];
  let clutchGames = 0, clutchW = 0, clutchL = 0, clutchFor = 0, clutchAgainst = 0;
  const leadAfter3: number[] = [];
  let blownLeads = 0, comebacks = 0, timelines = 0;
  const eventsSorted = new Map<string, EventRow[]>();
  eventsByGame.forEach((evs, gk) => {
    const sorted = [...evs].sort((a, c) => a.action_number - c.action_number);
    eventsSorted.set(gk, sorted);
    const tl = scoreTimeline(sorted, teamIds);
    if (tl.length < 20) return; // too sparse to read game flow from
    timelines++;
    allRuns.push(...runsIn(tl));
    // Clutch: any point in the last 5 minutes of regulation (or in OT) with the margin within 5.
    const late = tl.filter((p) => p.secs >= 2100);
    const before = [...tl].reverse().find((p) => p.secs < 2100);
    const startMargin = before ? before.us - before.them : 0;
    const isClutch = Math.abs(startMargin) <= 5 || late.some((p) => Math.abs(p.us - p.them) <= 5);
    const final = tl[tl.length - 1];
    if (isClutch && final) {
      clutchGames++;
      if (final.us > final.them) clutchW++; else if (final.us < final.them) clutchL++;
      const base = before ?? { us: 0, them: 0 };
      clutchFor += final.us - base.us;
      clutchAgainst += final.them - base.them;
    }
    const endQ3 = [...tl].reverse().find((p) => p.secs <= 1800);
    if (endQ3 && final) {
      const m = endQ3.us - endQ3.them;
      leadAfter3.push(m);
      if (m >= 6 && final.us < final.them) blownLeads++;
      if (m <= -6 && final.us > final.them) comebacks++;
    }
  });
  const runsFor = allRuns.filter((r) => r.side === "for" && r.points >= 8);
  const runsAgainst = allRuns.filter((r) => r.side === "against" && r.points >= 8);
  const biggestFor = Math.max(0, ...allRuns.filter((r) => r.side === "for").map((r) => r.points));
  const biggestAgainst = Math.max(0, ...allRuns.filter((r) => r.side === "against").map((r) => r.points));
  const byQuarter = (rs: typeof allRuns) => [1, 2, 3, 4].map((q) => rs.filter((r) => (q === 4 ? r.period >= 4 : r.period === q)).length);

  // ----- players from events -----
  type P = {
    key: string; name: string; games: Set<string>; pts: number; fg2m: number; fg2a: number; fg3m: number; fg3a: number;
    ftm: number; fta: number; ast: number; tov: number; stl: number; blk: number; oreb: number; dreb: number; pf: number; foulsDrawn: number;
    foulOutGames: number; fourFoulGames: number; tovTypes: Record<string, number>; styles: Record<string, number>;
    assistedMakes: number; unassistedMakes: number; clutchPts: number; clutchFga: number;
  };
  const players = new Map<string, P>();
  const getP = (name: string) => {
    const key = seeName(name);
    if (!players.has(key)) players.set(key, {
      key, name: displayName(name), games: new Set(), pts: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, ast: 0, tov: 0, stl: 0, blk: 0,
      oreb: 0, dreb: 0, pf: 0, foulsDrawn: 0, foulOutGames: 0, fourFoulGames: 0, tovTypes: {}, styles: {}, assistedMakes: 0, unassistedMakes: 0, clutchPts: 0, clutchFga: 0,
    });
    return players.get(key)!;
  };
  const assistPairs = new Map<string, number>();
  const playsByGame = new Map<string, number>();
  const teamTov: Record<string, number> = {};
  let teamTovTotal = 0, forcedTov = 0, teamFouls = 0, fastbreakPts = 0;
  const firstSubSecs: number[] = [];

  eventsSorted.forEach((evs, gk) => {
    const byAction = new Map(evs.map((e) => [e.action_number, e]));
    const foulsThisGame = new Map<string, number>();
    const assistedShots = new Set<number>();
    let firstSub: number | null = null;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (e.action_type === "assist" && isThem(e.team_id) && e.player_name) {
        // Older games don't link the assist to its shot; take the made field
        // goal by the same team just before it.
        let shotAction = e.previous_action;
        if (shotAction == null) {
          for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
            const c = evs[j];
            if (c.team_id === e.team_id && c.success && SHOT_TYPES.has(c.action_type)) { shotAction = c.action_number; break; }
          }
        }
        if (shotAction == null) continue;
        const shot = byAction.get(shotAction);
        assistedShots.add(shotAction);
        getP(e.player_name).ast++;
        if (shot?.player_name && SHOT_TYPES.has(shot.action_type)) {
          const pair = `${nameKey(e.player_name)}|${nameKey(shot.player_name)}`;
          assistPairs.set(pair, (assistPairs.get(pair) || 0) + 1);
        }
      }
    }
    for (const e of evs) {
      const mine = isThem(e.team_id);
      if (!mine) {
        if (e.action_type === "turnover") forcedTov++;
        continue;
      }
      if (e.action_type === "substitution" && e.sub_type === "out" && firstSub == null) firstSub = gameSeconds(e.period, e.clock);
      if (e.action_type === "turnover") {
        teamTovTotal++;
        const t = e.sub_type || "other";
        teamTov[t] = (teamTov[t] || 0) + 1;
      }
      if (e.action_type === "foul" && e.player_name) teamFouls++;
      if (SHOT_TYPES.has(e.action_type) || e.action_type === "turnover") playsByGame.set(gk, (playsByGame.get(gk) || 0) + 1);
      else if (e.action_type === "freethrow") playsByGame.set(gk, (playsByGame.get(gk) || 0) + 0.44);
      if (!e.player_name) continue; // team rows (team rebounds, bench fouls)
      const p = getP(e.player_name);
      p.games.add(gk);
      const secs = gameSeconds(e.period, e.clock);
      const clutch = secs >= 2100;
      switch (e.action_type) {
        case "2pt":
        case "3pt": {
          const three = e.action_type === "3pt";
          if (three) { p.fg3a++; if (e.success) p.fg3m++; } else { p.fg2a++; if (e.success) p.fg2m++; }
          if (e.success) {
            const pts = three ? 3 : 2;
            p.pts += pts;
            if (clutch) p.clutchPts += pts;
            if (assistedShots.has(e.action_number)) p.assistedMakes++; else p.unassistedMakes++;
            if ((e.qualifiers || []).includes("fastbreak")) fastbreakPts += pts;
          }
          if (clutch) p.clutchFga++;
          const style = e.sub_type || "unspecified";
          p.styles[style] = (p.styles[style] || 0) + 1;
          break;
        }
        case "freethrow":
          p.fta++;
          if (e.success) { p.ftm++; p.pts++; if (clutch) p.clutchPts++; }
          break;
        case "turnover": p.tov++; p.tovTypes[e.sub_type || "other"] = (p.tovTypes[e.sub_type || "other"] || 0) + 1; break;
        case "steal": p.stl++; break;
        case "block": p.blk++; break;
        case "rebound": if (e.sub_type === "offensive") p.oreb++; else p.dreb++; break;
        case "foul": {
          p.pf++;
          foulsThisGame.set(p.key, (foulsThisGame.get(p.key) || 0) + 1);
          break;
        }
        case "foulon": p.foulsDrawn++; break;
      }
    }
    foulsThisGame.forEach((n, k) => {
      const p = players.get(k)!;
      if (n >= 4) p.fourFoulGames++;
      if (n >= 5) p.foulOutGames++;
    });
    if (firstSub != null) firstSubSecs.push(firstSub);
  });

  // ----- minutes & on/off from player stints -----
  const minutes = new Map<string, { secs: number; games: Set<string>; pf: number; pa: number; possF: number; possA: number; closingSecs: number; qSecs: number[] }>();
  let teamSecs = 0, teamPf = 0, teamPa = 0, teamPossF = 0, teamPossA = 0;
  for (const s of b.playerStints) {
    if (!gameKeys.has(s.game_key)) continue;
    const k = nameKey(s.player_name);
    if (!minutes.has(k)) minutes.set(k, { secs: 0, games: new Set(), pf: 0, pa: 0, possF: 0, possA: 0, closingSecs: 0, qSecs: [0, 0, 0, 0, 0] });
    const m = minutes.get(k)!;
    m.secs += s.seconds_played; m.games.add(s.game_key);
    m.pf += s.points_for; m.pa += s.points_against;
    m.possF += s.possessions_for || 0; m.possA += s.possessions_against || 0;
    m.qSecs[Math.min(s.period, 5) - 1] += s.seconds_played;
    // Seconds inside the last 5 minutes of regulation.
    const overlap = Math.max(0, Math.min(s.end_game_secs, 2400) - Math.max(s.start_game_secs, 2100));
    m.closingSecs += overlap;
    getP(s.player_name);
  }
  // Team on-court totals from lineup stints (every second has exactly one lineup).
  for (const s of b.lineupStints) {
    if (!gameKeys.has(s.game_key)) continue;
    teamSecs += s.seconds_played; teamPf += s.points_for; teamPa += s.points_against;
    teamPossF += s.possessions_for || 0; teamPossA += s.possessions_against || 0;
  }
  const gamesWithStints = new Set(b.lineupStints.filter((s) => gameKeys.has(s.game_key)).map((s) => s.game_key)).size || 1;
  const per100 = (pts: number, poss: number) => (poss >= 15 ? r1((pts / poss) * 100) : null);

  // ----- rosters -----
  const rosterGames = new Set(b.rosters.map((r) => r.game_key));
  const withRosters = games.filter((g) => rosterGames.has(g.game_key));
  const latest = withRosters[0] ? new Date(withRosters[0].played_at).getTime() : 0;
  const recentKeys = withRosters.filter((g) => latest - new Date(g.played_at).getTime() <= 21 * 86_400_000).map((g) => g.game_key);
  const recentRoster = new Set(b.rosters.filter((r) => recentKeys.includes(r.game_key)).map((r) => nameKey(r.player_name)));
  const onRoster = (k: string) => recentRoster.size === 0 || recentRoster.has(k);
  const starts = new Map<string, number>();
  const shirt = new Map<string, string>();
  for (const r of b.rosters) {
    if (!gameKeys.has(r.game_key)) continue;
    const k = nameKey(r.player_name);
    if (r.starter) starts.set(k, (starts.get(k) || 0) + 1);
    if (r.shirt_number && !shirt.has(k)) shirt.set(k, r.shirt_number);
  }

  // ----- shots -----
  const zoneAgg = (rows: Array<{ zone: ShotZone; made: boolean }>) => {
    const out: Record<string, { fga: number; fgPct: number | null; share: number | null }> = {};
    const total = rows.length;
    for (const [group, zones] of Object.entries(ZONE_GROUPS)) {
      const inZone = rows.filter((r) => zones.includes(r.zone));
      out[group] = { fga: inZone.length, fgPct: pct(inZone.filter((r) => r.made).length, inZone.length), share: total ? r1((inZone.length / total) * 100) : null };
    }
    return out;
  };
  // Attribute each charted shot to a team via its matching play-by-play action.
  const eventTeam = new Map<string, string | null>();
  for (const e of b.events) eventTeam.set(`${e.game_key}#${e.action_number}`, e.team_id);
  const ourShots: Array<{ player: string; zone: ShotZone; side: string; made: boolean; three: boolean }> = [];
  const theirShots: Array<{ zone: ShotZone; made: boolean }> = [];
  for (const s of b.shots) {
    if (!gameKeys.has(s.game_key) || s.x == null || s.y == null) continue;
    const tid = s.action_number != null ? eventTeam.get(`${s.game_key}#${s.action_number}`) : undefined;
    const zone = shotZone(s.x, s.y, s.shot_type);
    if (tid === undefined) continue;
    if (isThem(tid)) ourShots.push({ player: nameKey(s.player_name), zone, side: shotSide(s.y), made: s.success, three: s.shot_type === "3pt" });
    else theirShots.push({ zone, made: s.success });
  }

  // ----- assemble player cards -----
  // Usage is measured only over the games a player actually played.
  const teamPlaysIn = (gks: Set<string>) => sum(Array.from(gks).map((g) => playsByGame.get(g) || 0)) || 1;
  const totalClosingSecs = sum(Array.from(minutes.values()).map((m) => m.closingSecs)) || 1;

  const playerCards = Array.from(players.values())
    .map((p) => {
      const m = minutes.get(p.key);
      const gp = Math.max(p.games.size, m?.games.size || 0);
      if (gp === 0) return null;
      const mins = m ? m.secs / 60 : 0;
      const onNet = m ? (per100(m.pf, m.possF) != null && per100(m.pa, m.possA) != null ? r1(per100(m.pf, m.possF)! - per100(m.pa, m.possA)!) : null) : null;
      const offF = m ? teamPf - m.pf : 0, offA = m ? teamPa - m.pa : 0;
      const offPF = m ? teamPossF - m.possF : 0, offPA = m ? teamPossA - m.possA : 0;
      const offNet = per100(offF, offPF) != null && per100(offA, offPA) != null ? r1(per100(offF, offPF)! - per100(offA, offPA)!) : null;
      const shots = ourShots.filter((s) => s.player === p.key);
      const sides = { left: shots.filter((s) => s.side === "left").length, right: shots.filter((s) => s.side === "right").length, middle: shots.filter((s) => s.side === "middle").length };
      const fga = p.fg2a + p.fg3a;
      const plays = fga + 0.44 * p.fta + p.tov;
      const topStyles = Object.entries(p.styles).sort((a, c) => c[1] - a[1]).slice(0, 3).map(([style, n]) => ({ style, attempts: n }));
      const makes = p.assistedMakes + p.unassistedMakes;
      return {
        name: nameOf(p.key),
        shirt: shirt.get(p.key) ?? null,
        gp,
        starts: starts.get(p.key) || 0,
        onRecentRoster: onRoster(p.key),
        mpg: m && m.games.size ? r1(mins / m.games.size) : null,
        totalMinutes: r0(mins),
        ppg: r1(p.pts / gp),
        fgaPg: r1(fga / gp),
        fgPct: pct(p.fg2m + p.fg3m, fga),
        twoPct: pct(p.fg2m, p.fg2a),
        threePaPg: r1(p.fg3a / gp),
        threePct: pct(p.fg3m, p.fg3a),
        threeAttempts: p.fg3a,
        ftaPg: r1(p.fta / gp),
        ftPct: pct(p.ftm, p.fta),
        rebPg: r1((p.oreb + p.dreb) / gp),
        orebPg: r1(p.oreb / gp),
        astPg: r1(p.ast / gp),
        tovPg: r1(p.tov / gp),
        stlPg: r1(p.stl / gp),
        blkPg: r1(p.blk / gp),
        foulsPg: r1(p.pf / gp),
        foulsDrawnPg: r1(p.foulsDrawn / gp),
        gamesWith4PlusFouls: p.fourFoulGames,
        fouledOut: p.foulOutGames,
        usageSharePct: p.games.size ? r1((plays / teamPlaysIn(p.games)) * 100) : null,
        assistedShareOfMakes: makes >= 5 ? r0((p.assistedMakes / makes) * 100) : null,
        topShotStyles: topStyles,
        commonTurnovers: Object.entries(p.tovTypes).sort((a, c) => c[1] - a[1]).slice(0, 2).map(([type, n]) => ({ type, n })),
        shotZones: shots.length >= 8 ? zoneAgg(shots) : null,
        chartedShots: shots.length,
        shotSides: shots.length >= 8 ? sides : null,
        closingMinutesPct: m ? Math.min(100, r0((m.closingSecs * 500) / totalClosingSecs)) : 0, // % of closing (last-5-min) minutes they were on court for
        clutchPts: p.clutchPts,
        onCourtNetPer100: onNet,
        offCourtNetPer100: offNet,
        onOffSwing: onNet != null && offNet != null ? r1(onNet - offNet) : null,
        minutesByQuarterPg: m && m.games.size ? m.qSecs.slice(0, 4).map((s) => r1(s / 60 / m.games.size)) : null,
      };
    })
    .filter(<T,>(x: T | null): x is T => x != null)
    .filter((p) => (p.mpg ?? 0) >= 4 || p.ppg >= 3)
    .sort((a, c) => (c.mpg ?? 0) - (a.mpg ?? 0));

  // ----- lineups -----
  type U = { key: string; names: string[]; secs: number; pf: number; pa: number; possF: number; possA: number; games: Set<string> };
  const units = new Map<string, U>();
  for (const s of b.lineupStints) {
    if (!gameKeys.has(s.game_key)) continue;
    const key = [...s.lineup_names].map(nameKey).sort().join("|");
    if (!units.has(key)) units.set(key, { key, names: s.lineup_names.map((n) => nameOf(nameKey(n))), secs: 0, pf: 0, pa: 0, possF: 0, possA: 0, games: new Set() });
    const u = units.get(key)!;
    u.secs += s.seconds_played; u.pf += s.points_for; u.pa += s.points_against;
    u.possF += s.possessions_for || 0; u.possA += s.possessions_against || 0; u.games.add(s.game_key);
  }
  const unitCard = (u: U) => ({
    players: u.names,
    minutes: r1(u.secs / 60),
    games: u.games.size,
    pointsFor: u.pf,
    pointsAgainst: u.pa,
    plusMinus: u.pf - u.pa,
    netPer100: per100(u.pf, u.possF) != null && per100(u.pa, u.possA) != null ? r1(per100(u.pf, u.possF)! - per100(u.pa, u.possA)!) : null,
  });
  // Only units made entirely of current players: last season's fives don't take the floor any more.
  const unitList = Array.from(units.values()).filter((u) => u.key.split("|").every((k) => onRoster(k)));
  const qualified = unitList.filter((u) => u.secs >= 6 * 60);
  const byNet = [...qualified].sort((a, c) => (c.pf - c.pa) / c.secs - (a.pf - a.pa) / a.secs);

  // Closing five: the unit with the most seconds in the last 5 minutes of regulation.
  const closing = new Map<string, number>();
  for (const s of b.lineupStints) {
    if (!gameKeys.has(s.game_key)) continue;
    const overlap = Math.max(0, Math.min(s.end_game_secs, 2400) - Math.max(s.start_game_secs, 2100));
    if (!overlap) continue;
    const key = [...s.lineup_names].map(nameKey).sort().join("|");
    if (!key.split("|").every((k) => onRoster(k))) continue;
    closing.set(key, (closing.get(key) || 0) + overlap);
  }
  const closingTop = Array.from(closing.entries()).sort((a, c) => c[1] - a[1])[0];
  const closingTotal = sum(Array.from(closing.values())) || 1;

  // Most common starting five from rosters.
  const startFives = new Map<string, { names: string[]; n: number }>();
  const rosterByGame = new Map<string, RosterRow[]>();
  for (const r of b.rosters) {
    if (!gameKeys.has(r.game_key) || !r.starter) continue;
    if (!rosterByGame.has(r.game_key)) rosterByGame.set(r.game_key, []);
    rosterByGame.get(r.game_key)!.push(r);
  }
  rosterByGame.forEach((rows, gk) => {
    if (rows.length !== 5 || !recentKeys.includes(gk)) return;
    const key = rows.map((r) => nameKey(r.player_name)).sort().join("|");
    if (!startFives.has(key)) startFives.set(key, { names: rows.map((r) => nameOf(nameKey(r.player_name))), n: 0 });
    startFives.get(key)!.n++;
  });
  const topStart = Array.from(startFives.entries()).sort((a, c) => c[1].n - a[1].n)[0];

  // ----- rotation -----
  // How much of the older games' scoring came from players still on the roster:
  // low continuity means last season's team numbers are a weak guide.
  const olderKeys = new Set(games.map((g) => g.game_key).filter((k) => !recentKeys.includes(k)));
  const olderPts = new Map<string, number>();
  eventsSorted.forEach((evs, gk) => {
    if (!olderKeys.has(gk)) return;
    for (const e of evs) {
      if (!isThem(e.team_id) || !e.success || !e.player_name) continue;
      const pts = e.action_type === "3pt" ? 3 : e.action_type === "2pt" ? 2 : e.action_type === "freethrow" ? 1 : 0;
      if (pts) olderPts.set(nameKey(e.player_name), (olderPts.get(nameKey(e.player_name)) || 0) + pts);
    }
  });
  const olderTotal = sum(Array.from(olderPts.values()));
  const returningScoringPct = olderTotal && recentRoster.size
    ? r0((sum(Array.from(olderPts.entries()).filter(([k]) => recentRoster.has(k)).map(([, v]) => v)) / olderTotal) * 100)
    : null;
  const current = playerCards.filter((p) => p.onRecentRoster && p.mpg != null);
  const mpgs = current.map((p) => p.mpg ?? 0);
  const starterMins = sum(current.filter((p) => p.starts >= Math.ceil(p.gp / 2)).map((p) => p.totalMinutes));
  const allMins = sum(current.map((p) => p.totalMinutes)) || 1;

  // ----- team shooting (charted) -----
  const teamZones = ourShots.length >= 30 ? zoneAgg(ourShots) : null;
  const allowedZones = theirShots.length >= 30 ? zoneAgg(theirShots) : null;

  const facts = {
    opponent: {
      name: b.opponentName,
      competition: b.targetLeagueName,
      gamesAnalysed: games.length,
      gamesInThisCompetition: inTarget,
      gamesWithPlayByPlay: gamesWithEvents.length,
      gamesWithLineupData: gamesWithStints === 1 && b.lineupStints.length === 0 ? 0 : gamesWithStints,
      record: `${wins}-${losses}`,
      avgMargin: avg(results.map((r) => r.margin)) == null ? null : r1(avg(results.map((r) => r.margin))!),
      dataFrom: games.length ? games[games.length - 1].played_at.slice(0, 10) : null,
      dataThrough: games.length ? games[0].played_at.slice(0, 10) : null,
      recentGames: results,
    },
    sampleNote:
      games.length < 3
        ? `Very small sample: only ${games.length} game(s). Treat every tendency as provisional.`
        : inTarget < games.length
          ? `${games.length - inTarget} of ${games.length} games come from other competitions (cup or last season); weigh the most recent games more.`
          : null,
    rosterContinuity: {
      currentRosterFromGames: recentKeys.length,
      olderGames: olderKeys.size,
      returningScoringPct,
      note: returningScoringPct != null && returningScoringPct < 50
        ? `Only ${returningScoringPct}% of the scoring in the older games came from players on the current roster; team-level numbers from those games describe a different team.`
        : null,
    },
    identity: teamIdentity(games, b.leagueRows, b.opponentName, opts.isSameTeam),
    identityBaseline: b.baselineNote ?? null,
    quarterSplits: quarterSplits(games, b.opponentsInGames),
    gameFlow: {
      runsOf8PlusForPerGame: timelines ? r1(runsFor.length / timelines) : null,
      runsOf8PlusAgainstPerGame: timelines ? r1(runsAgainst.length / timelines) : null,
      gamesWithTimeline: timelines,
      biggestRunFor: biggestFor || null,
      biggestRunAgainst: biggestAgainst || null,
      runsForByQuarter: byQuarter(runsFor),
      runsAgainstByQuarter: byQuarter(runsAgainst),
      closeGames: clutchGames,
      closeGameRecord: `${clutchW}-${clutchL}`,
      last5MinPointsForPerCloseGame: clutchGames ? r1(clutchFor / clutchGames) : null,
      last5MinPointsAgainstPerCloseGame: clutchGames ? r1(clutchAgainst / clutchGames) : null,
      avgMarginAfter3Quarters: leadAfter3.length ? r1(avg(leadAfter3)!) : null,
      blownLeadsOf6Plus: blownLeads,
      comebacksFrom6PlusDown: comebacks,
    },
    ballSecurity: {
      turnoversPerGame: r1(teamTovTotal / nEv),
      turnoverTypes: Object.entries(teamTov).sort((a, c) => c[1] - a[1]).slice(0, 5).map(([type, n]) => ({ type, perGame: r1(n / nEv) })),
      forcedTurnoversPerGame: r1(forcedTov / nEv),
      fastBreakPointsPerGame: r1(fastbreakPts / nEv),
    },
    fouls: {
      teamFoulsPerGame: r1(teamFouls / nEv),
      foulTroubleProne: playerCards.filter((p) => p.onRecentRoster && p.gamesWith4PlusFouls > 0).map((p) => ({ name: p.name, gamesWith4PlusFouls: p.gamesWith4PlusFouls, of: p.gp, foulsPg: p.foulsPg })),
    },
    rotation: {
      playersAveraging10PlusMin: mpgs.filter((m) => m >= 10).length,
      playersAveraging25PlusMin: mpgs.filter((m) => m >= 25).length,
      starterMinutesSharePct: r0((starterMins / allMins) * 100),
      benchPointsPerGame: avg(games.map((g) => g.tot_sbenchpoints)) == null ? null : r1(avg(games.map((g) => g.tot_sbenchpoints))!),
      avgFirstSubstitutionAt: firstSubSecs.length ? (() => { const s = avg(firstSubSecs)!; const rem = 600 - (s % 600); return `Q${Math.floor(s / 600) + 1} ${Math.floor(rem / 60)}:${String(Math.round(rem % 60)).padStart(2, "0")} remaining`; })() : null,
      teamOnCourtNetPer100: per100(teamPf, teamPossF) != null && per100(teamPa, teamPossA) != null ? r1(per100(teamPf, teamPossF)! - per100(teamPa, teamPossA)!) : null,
    },
    lineups: {
      usualStartingFive: topStart ? { players: topStart[1].names, started: topStart[1].n, of: recentKeys.length, ...(units.get(topStart[0]) ? { onCourt: unitCard(units.get(topStart[0])!) } : {}) } : null,
      mostUsed: [...unitList].sort((a, c) => c.secs - a.secs).slice(0, 4).map(unitCard),
      bestQualified: byNet.slice(0, 2).map(unitCard),
      worstQualified: byNet.length > 3 ? byNet.slice(-2).reverse().map(unitCard) : [],
      closingFive: closingTop ? { players: units.get(closingTop[0])?.names ?? [], shareOfClosingMinutesPct: r0((closingTop[1] / closingTotal) * 100) } : null,
      distinctLineupsUsed: unitList.length,
      qualifiedMinMinutes: 6,
    },
    shooting: {
      chartedShots: ourShots.length,
      zones: teamZones,
      opponentShotsAllowedByZone: allowedZones,
    },
    playmaking: {
      topAssistConnections: Array.from(assistPairs.entries())
        .filter(([pair]) => pair.split("|").every((k) => onRoster(k)))
        .sort((a, c) => c[1] - a[1]).slice(0, 5)
        .map(([pair, n]) => { const [a, c] = pair.split("|"); return { passer: nameOf(a), scorer: nameOf(c), assists: n }; }),
    },
    players: playerCards.filter((p) => p.onRecentRoster).slice(0, 10),
    playersNotOnRecentRoster: playerCards.filter((p) => !p.onRecentRoster).map((p) => p.name).slice(0, 12),
    matchup: b.myTeam && b.myTeam.games.length
      ? {
          myTeam: b.myTeam.name,
          myGamesAnalysed: b.myTeam.games.length,
          myIdentity: teamIdentity(b.myTeam.games, b.leagueRows, b.myTeam.name, opts.isSameTeam),
          myQuarterSplits: quarterSplits(b.myTeam.games, b.myTeam.opponentsInGames),
        }
      : null,
  };
  return facts;
}

export type ScoutingFacts = ReturnType<typeof computeScoutingFacts>;
