import { namesMatch } from "@/lib/fuzzyMatch";

interface MatchablePlayer {
  id: string;
  full_name: string;
  team_id?: string | null;
}

const words = (name: string) => name.replace(/\./g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

/** "N. Saa" / "N Saa": a one-letter first name, so it fits any N… with that surname. */
export function isInitialOnlyName(name: string): boolean {
  const w = words(name);
  return w.length >= 2 && w[0].length === 1;
}

const firstName = (name: string) => (words(name)[0] || "").toLowerCase();

/**
 * The player records one profile page should combine: everything whose name
 * fuzzy-matches the viewed player, plus explicit identity links.
 *
 * An abbreviated record ("N. Saa") fits every brother or teammate with that
 * initial and surname (Noah and Nestor Saa). When two or more different people
 * could own it, it is only taken from a team the viewed player has a full-name
 * record on, so one brother's page doesn't absorb the other's games. If only
 * one person could own it, or the viewed player is themselves abbreviated, the
 * ordinary fuzzy rule applies unchanged.
 */
export function selectProfileMatches<T extends MatchablePlayer>(
  allPlayers: T[],
  initialPlayer: T,
  identityLinkedIds: Set<string> = new Set(),
): T[] {
  const fullNamed = allPlayers.filter((p) => !isInitialOnlyName(p.full_name));
  const viewedTeams = new Set(
    fullNamed
      .filter((p) => p.id === initialPlayer.id || namesMatch(p.full_name, initialPlayer.full_name))
      .map((p) => p.team_id)
      .filter((t): t is string => !!t),
  );
  if (initialPlayer.team_id) viewedTeams.add(initialPlayer.team_id);

  return allPlayers.filter((player) => {
    if (player.id === initialPlayer.id || identityLinkedIds.has(player.id)) return true;
    if (!namesMatch(player.full_name, initialPlayer.full_name)) return false;
    if (!isInitialOnlyName(player.full_name) || isInitialOnlyName(initialPlayer.full_name)) return true;
    const owners = new Set(
      fullNamed.filter((p) => namesMatch(p.full_name, player.full_name)).map((p) => firstName(p.full_name)),
    );
    if (owners.size < 2) return true;
    return !!player.team_id && viewedTeams.has(player.team_id);
  });
}
