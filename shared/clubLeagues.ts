import { isSameTeam } from "./teamIdentity";
import type { LeagueSides } from "./leagueSides";

/** The shared part of every spelling of a club's name, used to narrow a name search before the identity check. */
export function clubSearchCore(name: string): string {
  return (name || "")
    .replace(/\s+Senior\s+(Men|Women)\b.*$/i, "")
    .replace(/\s+Women$/i, "")
    .replace(/\s+I$/i, "")
    .replace(/[%_,]/g, "")
    .trim();
}

/**
 * The competitions a club plays in, from candidate `teams` rows: every row whose name is the same
 * club side as `homeName` (read in `homeLeagueId`'s competition). Matches on club identity, not the
 * exact name, because the same club is "Gloucester City Kings" in one feed, "... Senior Men" in
 * another and has the odd typo ("KIngs") in a third; and a women's competition's plain name is
 * the women's side (`sides`), not the men's.
 */
export function clubLeagueIds(
  rows: Array<{ name: string | null; league_id: string | null }>,
  homeName: string,
  homeLeagueId: string | null | undefined,
  sides: LeagueSides,
): string[] {
  const wanted = sides.name(homeName, homeLeagueId);
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.name || !row.league_id) continue;
    if (isSameTeam(sides.name(row.name, row.league_id), wanted)) ids.add(row.league_id);
  }
  if (homeLeagueId) ids.add(homeLeagueId);
  return Array.from(ids);
}
