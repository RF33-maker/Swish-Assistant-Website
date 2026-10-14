import { sideName } from "./teamIdentity";

/**
 * Which competitions are women's, so a team's identity can carry it (see `sideName`).
 *
 * A competition is women's when its own gender says so, or — for a private feed child with no
 * gender of its own (the live parser's copy of a public competition) — when its parent's does.
 */

export type LeagueSides = {
  /** The competition's gender for a league id ("Women"), or null. */
  genderOf: (leagueId: string | null | undefined) => string | null;
  /** The team's name for identity purposes: "London Lions" in a women's competition becomes "London Lions Women". */
  name: (teamName: string | null | undefined, leagueId: string | null | undefined) => string;
};

export function buildLeagueSides(rows: Array<{ league_id: string; gender?: string | null; parent_league_id?: string | null }>): LeagueSides {
  const byId = new Map(rows.map((r) => [r.league_id, r]));
  const genderCache = new Map<string, string | null>();
  const genderOf = (leagueId: string | null | undefined): string | null => {
    if (!leagueId) return null;
    if (genderCache.has(leagueId)) return genderCache.get(leagueId)!;
    let gender: string | null = null;
    let row = byId.get(leagueId);
    // Walk up the parent chain, with a bound so a cycle can't loop.
    for (let i = 0; row && i < 5; i++) {
      if (row.gender) { gender = row.gender; break; }
      row = row.parent_league_id ? byId.get(row.parent_league_id) : undefined;
    }
    genderCache.set(leagueId, gender);
    return gender;
  };
  return { genderOf, name: (teamName, leagueId) => sideName(teamName || "", genderOf(leagueId)) };
}
