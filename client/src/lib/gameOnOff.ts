/**
 * On/off for a single game: how a team did with each player on the court and
 * with them sat down.
 *
 * The raw numbers come from the official box score +/-, so they agree with the
 * box score: on = the player's +/-, off = the team's margin minus it. They are
 * only trusted when the team's +/- adds up (five players are always on court,
 * so a team's +/- column sums to five times its margin).
 *
 * Ratings per 100 possessions come from our lineup stints, and only when the
 * stints cover the game and both the on and off samples reach
 * MIN_GAME_POSSESSIONS.
 */

export const MIN_GAME_POSSESSIONS = 15;
/** How far the stints may stray from the box score and still be used. */
const STINT_POINTS_SLACK = 2;
const STINT_SECONDS_SLACK = 120;
/** Callouts skip anyone with less than this much time on or off. */
const CALLOUT_MIN_SECONDS = 5 * 60;

export interface OnOffBoxPlayer {
  key: string;
  playerId?: string | null;
  /** Seconds played, from the box score. */
  seconds: number;
  plusMinus: number | null | undefined;
}

export interface OnOffStint {
  team_id?: string | null;
  lineup_player_ids: string[] | null;
  seconds_played: number | null;
  points_for: number | null;
  points_against: number | null;
  possessions_for: number | null;
  possessions_against: number | null;
}

export interface GameOnOffRatings {
  onPoss: number;
  offPoss: number;
  onOrtg: number;
  onDrtg: number;
  onNet: number;
  offOrtg: number;
  offDrtg: number;
  offNet: number;
  netSwing: number;
}

export interface GameOnOffPlayer {
  key: string;
  seconds: number;
  /** Seconds the team played without them. */
  offSeconds: number;
  on: number;
  off: number;
  swing: number;
  ratings: GameOnOffRatings | null;
}

export interface TeamGameOnOff {
  /** False when the box +/- does not add up; show nothing then. */
  addsUp: boolean;
  /** True when the stints cover the game well enough for ratings. */
  stintsUsable: boolean;
  players: GameOnOffPlayer[];
}

const num = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** "MM:SS" (or plain minutes) from the box score, in seconds. */
export function boxSeconds(minutes: string | number | null | undefined): number {
  if (minutes == null || minutes === "") return 0;
  if (typeof minutes === "number") return Math.round(minutes * 60);
  const parts = minutes.split(":");
  if (parts.length === 2) return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  const mins = parseFloat(minutes);
  return Number.isFinite(mins) ? Math.round(mins * 60) : 0;
}

/**
 * Whether a team's box +/- can be trusted: it must sum to five times the
 * margin. A column of zeros means the +/- was never recorded.
 */
export function boxPlusMinusAddsUp(values: Array<number | null | undefined>, margin: number): boolean {
  if (!values.some((v) => num(v) !== 0)) return false;
  return values.reduce<number>((s, v) => s + num(v), 0) === 5 * margin;
}

/** The stints that belong to one team, by team id, or by its players' ids when the ids differ. */
export function stintsForTeam(
  stints: OnOffStint[] | null | undefined,
  teamIds: Array<string | null | undefined>,
  playerIds: Array<string | null | undefined>,
): OnOffStint[] {
  const all = stints ?? [];
  const ids = new Set(teamIds.filter(Boolean) as string[]);
  const byTeam = all.filter((s) => s.team_id && ids.has(s.team_id));
  if (byTeam.length > 0) return byTeam;
  const players = new Set(playerIds.filter(Boolean) as string[]);
  return all.filter((s) => (s.lineup_player_ids ?? []).some((id) => players.has(id)));
}

const per100 = (points: number, poss: number) => (poss > 0 ? (100 * points) / poss : 0);

function ratingsFor(playerId: string, stints: OnOffStint[]): GameOnOffRatings | null {
  const on = { pf: 0, pa: 0, possF: 0, possA: 0 };
  const off = { pf: 0, pa: 0, possF: 0, possA: 0 };
  for (const s of stints) {
    if (num(s.seconds_played) <= 0) continue;
    const side = (s.lineup_player_ids ?? []).includes(playerId) ? on : off;
    side.pf += num(s.points_for);
    side.pa += num(s.points_against);
    side.possF += num(s.possessions_for);
    side.possA += num(s.possessions_against);
  }
  const onPoss = (on.possF + on.possA) / 2;
  const offPoss = (off.possF + off.possA) / 2;
  if (onPoss < MIN_GAME_POSSESSIONS || offPoss < MIN_GAME_POSSESSIONS) return null;
  if (on.possF <= 0 || on.possA <= 0 || off.possF <= 0 || off.possA <= 0) return null;
  const onOrtg = per100(on.pf, on.possF);
  const onDrtg = per100(on.pa, on.possA);
  const offOrtg = per100(off.pf, off.possF);
  const offDrtg = per100(off.pa, off.possA);
  return {
    onPoss,
    offPoss,
    onOrtg,
    onDrtg,
    onNet: onOrtg - onDrtg,
    offOrtg,
    offDrtg,
    offNet: offOrtg - offDrtg,
    netSwing: onOrtg - onDrtg - (offOrtg - offDrtg),
  };
}

/**
 * On/off for every player who got on the court for one team.
 * `stints` should already be this team's (see stintsForTeam).
 */
export function teamGameOnOff({
  teamPoints,
  oppPoints,
  players,
  stints,
}: {
  teamPoints: number;
  oppPoints: number;
  players: OnOffBoxPlayer[];
  stints?: OnOffStint[] | null;
}): TeamGameOnOff {
  const margin = teamPoints - oppPoints;
  const addsUp = boxPlusMinusAddsUp(players.map((p) => p.plusMinus), margin);
  if (!addsUp) return { addsUp, stintsUsable: false, players: [] };

  const gameSeconds = players.reduce((s, p) => s + Math.max(0, p.seconds), 0) / 5;
  const teamStints = (stints ?? []).filter((s) => num(s.seconds_played) > 0);
  const stintSeconds = teamStints.reduce((s, x) => s + num(x.seconds_played), 0);
  const stintPointsFor = teamStints.reduce((s, x) => s + num(x.points_for), 0);
  const stintPointsAgainst = teamStints.reduce((s, x) => s + num(x.points_against), 0);
  const stintsUsable =
    teamStints.length > 0 &&
    Math.abs(stintSeconds - gameSeconds) <= STINT_SECONDS_SLACK &&
    Math.abs(stintPointsFor - teamPoints) <= STINT_POINTS_SLACK &&
    Math.abs(stintPointsAgainst - oppPoints) <= STINT_POINTS_SLACK;

  const rows = players
    .filter((p) => p.seconds > 0)
    .map((p) => {
      const on = num(p.plusMinus);
      const off = margin - on;
      return {
        key: p.key,
        seconds: p.seconds,
        offSeconds: Math.max(0, Math.round(gameSeconds - p.seconds)),
        on,
        off,
        swing: on - off,
        ratings: stintsUsable && p.playerId ? ratingsFor(p.playerId, teamStints) : null,
      };
    })
    .sort((a, b) => b.seconds - a.seconds);

  return { addsUp, stintsUsable, players: rows };
}

/**
 * The team's best and worst on/off swing, among players with a real stretch
 * both on and off the court. Null when nobody qualifies or every swing is equal.
 */
export function swingCallouts(players: GameOnOffPlayer[]): { best: GameOnOffPlayer; worst: GameOnOffPlayer } | null {
  const pool = players.filter((p) => p.seconds >= CALLOUT_MIN_SECONDS && p.offSeconds >= CALLOUT_MIN_SECONDS);
  if (pool.length < 2) return null;
  // A tie goes to whoever played more.
  const best = [...pool].sort((a, b) => b.swing - a.swing || b.seconds - a.seconds)[0];
  const worst = [...pool].sort((a, b) => a.swing - b.swing || b.seconds - a.seconds)[0];
  if (best.swing === worst.swing) return null;
  return { best, worst };
}

export interface GameLogBoxRow {
  id: string;
  game_key: string | null;
  team_id?: string | null;
  team_name?: string | null;
  spoints?: number | null;
  splusminuspoints?: number | null;
}

export interface GameLogOnOff {
  on: number;
  off: number;
  swing: number;
}

/**
 * Raw on/off for one player's game log row, from every box row in that game.
 * Null when the game's two teams can't be told apart or the +/- doesn't add up.
 */
export function gameLogOnOff(rowId: string, gameRows: GameLogBoxRow[]): GameLogOnOff | null {
  const own = gameRows.find((r) => r.id === rowId);
  if (!own) return null;
  const teamOf = (r: GameLogBoxRow) => r.team_id || (r.team_name || "").trim().toLowerCase() || null;
  const team = teamOf(own);
  if (!team) return null;
  const teams = new Set(gameRows.map(teamOf));
  if (teams.size !== 2 || teams.has(null)) return null;
  const mine = gameRows.filter((r) => teamOf(r) === team);
  const theirs = gameRows.filter((r) => teamOf(r) !== team);
  const margin = mine.reduce((s, r) => s + num(r.spoints), 0) - theirs.reduce((s, r) => s + num(r.spoints), 0);
  if (!boxPlusMinusAddsUp(mine.map((r) => r.splusminuspoints), margin)) return null;
  const on = num(own.splusminuspoints);
  const off = margin - on;
  return { on, off, swing: on - off };
}
