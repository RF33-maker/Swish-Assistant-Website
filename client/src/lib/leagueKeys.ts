import { isYouthCompetition } from "@shared/youth";

/**
 * What a fan follows as "a league", and its key in user_follows.
 *
 * A competition under a brand league is that brand's: "league:nbl-division-one".
 * Women's competitions get their own key under the brand
 * ("league:nbl-division-one:women" is the WNBL), since a men's fan rarely
 * means both. A competition with no brand belongs to its parent, else it is
 * its own: "competition:weabl-2026-27".
 */

export interface LeagueCompRow {
  league_id: string;
  slug: string;
  name: string;
  age_group: string | null;
  competition_id: string | null;
  parent_league_id: string | null;
  gender: string | null;
  logo_url: string | null;
}

export interface LeagueBrandRow {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
}

export const COMP_COLUMNS = "league_id, slug, name, age_group, competition_id, parent_league_id, gender, logo_url";
export const BRAND_COLUMNS = "id, slug, name, logo_url";

/** "WNBL Division One 2026-27" → "WNBL Division One". */
export const withoutSeason = (name: string) =>
  name.replace(/\s*(\(?\d{4}\s*[-/–]\s*\d{2,4}\)?|\d{2}\s*[-/–]\s*\d{2})\s*$/, "").trim() || name;

const isWomen = (c: LeagueCompRow) => /^women/i.test((c.gender || "").trim());

export interface LeagueOption {
  key: string;
  label: string;
  logoUrl: string | null;
  /** A competition in it, for team logos and links. */
  leagueId: string;
  href: string;
}

export function leagueKeys(comps: LeagueCompRow[], brands: LeagueBrandRow[]) {
  const compById = new Map(comps.map((c) => [c.league_id, c]));
  const brandById = new Map(brands.map((b) => [b.id, b]));

  const keyOf = (c: LeagueCompRow | undefined, depth = 0): string | null => {
    if (!c) return null;
    const brand = c.competition_id ? brandById.get(c.competition_id) : undefined;
    if (brand) return `league:${brand.slug}${isWomen(c) ? ":women" : ""}`;
    const parent = c.parent_league_id ? compById.get(c.parent_league_id) : undefined;
    return parent && parent !== c && depth < 4 ? keyOf(parent, depth + 1) : `competition:${c.slug}`;
  };

  /** The followable leagues these competitions make up, named and with a logo. */
  const options = (from: LeagueCompRow[]): LeagueOption[] => {
    const out = new Map<string, LeagueOption>();
    for (const c of from) {
      if (isYouthCompetition(c)) continue;
      const key = keyOf(c);
      if (!key || out.has(key)) continue;
      const [type, slug, side] = key.split(":");
      const brand = type === "league" ? brands.find((b) => b.slug === slug) : undefined;
      // A brand's men's side goes by the brand's name; its women's side by the competition's.
      const label = brand && !side ? brand.name : withoutSeason(c.name);
      out.set(key, {
        key,
        label,
        logoUrl: (brand && !side ? brand.logo_url : c.logo_url) || brand?.logo_url || null,
        leagueId: c.league_id,
        href: brand ? `/league/${brand.slug}` : `/competition/${c.slug}`,
      });
    }
    return Array.from(out.values());
  };

  return { compById, keyOf, options };
}
