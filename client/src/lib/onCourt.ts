/**
 * Who is on court right now, worked out from the starters and the game's
 * substitution events (each one an "in" or "out" for a single player).
 */

export interface OnCourtEvent {
  action_number?: number | null;
  action_type?: string | null;
  sub_type?: string | null;
  team_no?: number | null;
  player_id?: string | null;
  shirt_number?: string | number | null;
}

export interface OnCourtPlayer {
  playerId: string | null;
  shirt: string | number | null | undefined;
  teamNo: 1 | 2;
}

const keyOf = (teamNo: number, playerId: string | null | undefined, shirt: string | number | null | undefined) =>
  playerId ? `id|${playerId}` : `${teamNo}|shirt|${shirt ?? ""}`;

/**
 * The players on court for one side. Returns null when the five cannot be
 * trusted (no starters known, or the subs do not add up to five), so the page
 * shows nothing rather than a wrong lineup.
 */
export function onCourtFor(
  teamNo: 1 | 2,
  starters: OnCourtPlayer[],
  events: OnCourtEvent[] | null | undefined,
): Set<string> | null {
  const side = starters.filter((p) => p.teamNo === teamNo);
  if (side.length === 0) return null;
  const court = new Set(side.map((p) => keyOf(teamNo, p.playerId, p.shirt)));
  // Shirt numbers back up a sub event that lacks a player id.
  const idByShirt = new Map<string, string>();
  for (const p of side) if (p.playerId && p.shirt != null) idByShirt.set(String(p.shirt), p.playerId);

  const subs = (events ?? [])
    .filter((e) => e.action_type === "substitution" && e.team_no === teamNo)
    .sort((a, b) => (a.action_number ?? 0) - (b.action_number ?? 0));
  for (const e of subs) {
    const id = e.player_id || (e.shirt_number != null ? idByShirt.get(String(e.shirt_number)) : null) || null;
    const key = keyOf(teamNo, id, e.shirt_number);
    if (e.sub_type === "in") court.add(key);
    else if (e.sub_type === "out") court.delete(key);
  }
  return court.size === 5 ? court : null;
}

export { keyOf as onCourtKey };
