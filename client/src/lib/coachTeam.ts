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
