import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * The leagues listed in the site navigation.
 *
 * League brands (the `leagues` table — BCB, Super League, NBL) come first-class:
 * each opens its own season/competition picker, so one entry covers every
 * season and competition type under it. A trending competition only gets its
 * own entry when no brand covers it (REBA SL today); otherwise NBL Division
 * One, WNBL and the National Cup would all be listed separately under a brand
 * that already links to them.
 *
 * Order and membership follow `trending_position` on both tables, the same
 * lever that drives the homepage's trending row — so an admin reordering that
 * row reorders the nav too.
 */

export interface NavLeague {
  key: string;
  label: string;
  href: string;
  logoUrl: string | null;
}

// The full names don't fit a 240px rail; the brand pages keep them.
const SHORT_LABEL: Record<string, string> = {
  "british-championship-basketball": "BCB",
  "super-league-basketball": "Super League",
  "nbl-division-one": "NBL",
};

export function useNavLeagues() {
  return useQuery<NavLeague[]>({
    queryKey: ["nav-leagues"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const [brandsRes, compsRes] = await Promise.all([
        supabase
          .from("leagues")
          .select("id, name, slug, logo_url, trending_position")
          .not("trending_position", "is", null),
        supabase
          .from("competitions")
          .select("name, slug, logo_url, trending_position, competition_id")
          .eq("is_public", true)
          .not("trending_position", "is", null),
      ]);

      const brands = brandsRes.data || [];
      const brandIds = new Set(brands.map((b: any) => b.id));

      const entries = [
        ...brands.map((b: any) => ({
          pos: b.trending_position as number,
          item: {
            key: `league:${b.slug}`,
            label: SHORT_LABEL[b.slug] ?? b.name,
            href: `/league/${b.slug}`,
            logoUrl: b.logo_url ?? null,
          },
        })),
        ...(compsRes.data || [])
          .filter((c: any) => !c.competition_id || !brandIds.has(c.competition_id))
          .map((c: any) => ({
            pos: c.trending_position as number,
            item: {
              key: `competition:${c.slug}`,
              label: c.name,
              href: `/competition/${c.slug}`,
              logoUrl: c.logo_url ?? null,
            },
          })),
      ];

      return entries.sort((a, b) => a.pos - b.pos).map((e) => e.item);
    },
  });
}
