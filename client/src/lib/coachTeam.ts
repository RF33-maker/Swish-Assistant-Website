import { isSameTeam } from "../../../shared/teamIdentity";

/**
 * A coach's team within a competition's team list.
 *
 * The account (or an admin's preview) knows the team by its `teams` row name,
 * but the match stats name it as the feed does, and the two often differ: the
 * NBL's row says "Gloucester City Kings Senior Men" while its stats say
 * "Gloucester City Kings Senior Men I". Matching by exact name found nothing
 * for those clubs and dropped the coach into the league overview. Same-club
 * identity (shared/teamIdentity) treats the spellings as one club.
 *
 * An exact name wins. Otherwise the same-club entry with the most games is
 * used, because the feed sometimes lists one club under two spellings in one
 * competition.
 */
export function findCoachTeam<T extends { team_name: string; games_played?: number | null }>(
  teams: T[],
  coachTeamName: string | null | undefined,
): T | undefined {
  if (!coachTeamName) return undefined;
  const exact = teams.find((t) => t.team_name === coachTeamName);
  if (exact) return exact;
  const same = teams.filter((t) => isSameTeam(t.team_name, coachTeamName));
  if (same.length === 0) return undefined;
  return same.reduce((best, t) => ((t.games_played || 0) > (best.games_played || 0) ? t : best));
}

// ── Fixtures ────────────────────────────────────────────────────────────────
// A schedule row links its sides to team ids, but the same club can carry
// several ids (a new team row each season, or the feed's own), and a fixture
// list can mix them: British Championship Basketball links some of one club's
// fixtures to its 2026-27 team row and others to its 2025-26 one. Matching on a
// single id then finds some fixtures and misreads the rest. Match on any id the
// club is known by, or on the club's identity by name.

export interface TeamRef {
  /** Every team id the club is known by (the account's, the stats row's). */
  ids: Array<string | null | undefined>;
  name: string | null | undefined;
}

export interface FixtureLike {
  hometeam: string | null;
  awayteam: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
}

const hasId = (ref: TeamRef, id: string | null | undefined) => !!id && ref.ids.some((x) => x === id);
const nameIs = (ref: TeamRef, name: string | null | undefined) => !!ref.name && !!name && isSameTeam(name, ref.name);

/** Is the club the home side? Ids first, then club identity by name. */
export function isHomeFor(game: FixtureLike, team: TeamRef): boolean {
  if (hasId(team, game.home_team_id)) return true;
  if (hasId(team, game.away_team_id)) return false;
  return nameIs(team, game.hometeam);
}

export function involvesTeam(game: FixtureLike, team: TeamRef): boolean {
  return hasId(team, game.home_team_id) || hasId(team, game.away_team_id) || nameIs(team, game.hometeam) || nameIs(team, game.awayteam);
}

/** The other side of the fixture. */
export function opponentIn(game: FixtureLike, team: TeamRef): string {
  return (isHomeFor(game, team) ? game.awayteam : game.hometeam) || "";
}

/** The club's next fixture from a list sorted soonest first. */
export function nextFixtureFor<T extends FixtureLike>(upcomingSoonestFirst: T[], team: TeamRef): T | undefined {
  return upcomingSoonestFirst.find((g) => involvesTeam(g, team));
}
