import { useEffect, useState } from "react";
import { ArrowRight, Trophy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import SectionHeader from "@/components/home/SectionHeader";
import { Reveal } from "@/components/home/motion";

function cleanLeagueName(name: string): string {
  return name
    .replace(/\s+\d{4}\/\d{4}\s*$/, '')
    .replace(/\s+\d{4}\d{4}\s*$/, '')
    .replace(/\s+\d{2}\/\d{2}\s*$/, '')
    .replace(/\s+\d{4}\/\d{2}\s*$/, '')
    .trim();
}

const FALLBACK_TRENDING = [
  { name: "SLB Championship 25/26", slug: "super-league-basketball-20252026", logo_url: null, banner_url: null, _type: "competition" },
  { name: "BCB Trophy 2026-2027", slug: "bcb-trophy-2026-2027", logo_url: null, banner_url: null, _type: "competition" },
  { name: "NBL Division One 25/26", slug: "national-basketball-league-d1-mens-20252026", logo_url: null, banner_url: null, _type: "competition" },
  { name: "WNBL Division One 25/26", slug: "national-basketball-league-d1-womens-20252026", logo_url: null, banner_url: null, _type: "competition" },
];

/** How many trending leagues/competitions the grid shows. */
const MAX_TRENDING = 8;

/**
 * "Leagues & competitions" — the trending leagues and competitions as large
 * image cards, the homepage's main way into league pages.
 */
export default function ExploreSection() {
  const [trendingLeagues, setTrendingLeagues] = useState<any[]>([]);
  // League cards route through the same selection handler as search.
  const { handleSelect } = useGlobalSearch();

  useEffect(() => {
    const fetchTrending = async () => {
      // Trending items can be pinned two ways: a single competition/season
      // (routes to /competition/:slug), or a league brand that groups
      // several seasons and competition types under one season-picker page
      // (routes to /league/:slug — see pages/competition/[slug].tsx, the
      // actual component behind that route despite the file layout).
      // Both tables carry their own trending_position, so pinning a league
      // brand — e.g. BCB or SLB — surfaces its season/competition picker
      // from the homepage instead of jumping straight to one specific season.
      const [competitionsResult, leaguesResult] = await Promise.all([
        supabase
          .from("competitions")
          .select("name, slug, logo_url, banner_url, trending_position")
          .eq("is_public", true)
          .not("trending_position", "is", null)
          .order("trending_position", { ascending: true }),
        supabase
          .from("leagues")
          .select("name, slug, logo_url, banner_url, trending_position")
          .not("trending_position", "is", null)
          .order("trending_position", { ascending: true }),
      ]);

      // Competition slugs that are redundant in THIS row specifically because
      // their brand-level league (e.g. "British Championship Basketball",
      // "NBL Division One" — which also covers WNBL D1 via its own gender
      // picker) is also pinned to trending and already routes to that season
      // via its own season/gender picker — showing both is two cards for one
      // destination. Scoped to this row only (not the trending_position
      // column itself), so Top Players / Latest Scores — which also read
      // trending_position — keep surfacing that season's data untouched.
      // The mapped value is the brand's own trending_position: the brand
      // card inherits the excluded competition's slot rather than whatever
      // position the brand row happens to carry, so it doesn't get bumped
      // out by an unrelated tie against some other competition.
      const SUPERSEDED_BY_LEAGUE_BRAND: Record<string, string> = {
        "british-championship-basketball-2026-2027": "british-championship-basketball",
        "nbl-division-1-2026-2027": "nbl-division-one",
      };
      // Shorter label for this row only — the underlying league name stays
      // "NBL Division One" everywhere else (its own brand page, search, etc).
      const DISPLAY_NAME_OVERRIDE: Record<string, string> = {
        "nbl-division-one": "NBL",
      };

      const inheritedPositionByLeagueSlug = new Map<string, number>();
      (competitionsResult.data || []).forEach((row: any) => {
        const leagueSlug = SUPERSEDED_BY_LEAGUE_BRAND[row.slug];
        if (leagueSlug) inheritedPositionByLeagueSlug.set(leagueSlug, row.trending_position);
      });

      const combined = [
        ...(competitionsResult.data || [])
          .filter((row: any) => !(row.slug in SUPERSEDED_BY_LEAGUE_BRAND))
          .map((row: any) => ({ ...row, _type: "competition" as const, _sortPos: row.trending_position })),
        ...(leaguesResult.data || []).map((row: any) => ({
          ...row,
          name: DISPLAY_NAME_OVERRIDE[row.slug] ?? row.name,
          _type: "league" as const,
          _sortPos: inheritedPositionByLeagueSlug.get(row.slug) ?? row.trending_position,
        })),
      ].sort((a, b) => a._sortPos - b._sortPos);

      const seen = new Set<string>();
      const deduped: any[] = [];
      for (const item of combined) {
        const key = `${item._type}:${item.slug}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(item);
        }
      }
      setTrendingLeagues(deduped.slice(0, MAX_TRENDING));
    };

    fetchTrending();
  }, []);

  const leagues = trendingLeagues.length > 0 ? trendingLeagues : FALLBACK_TRENDING;
  // Widen the first few cards so the 4-column grid always ends on a full
  // row (7 leagues → the first card spans two columns, and so on).
  const wideCount = (4 - (leagues.length % 4)) % 4;

  return (
    <section id="explore" className="py-12 md:py-16" aria-labelledby="explore-heading">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <SectionHeader
          id="explore-heading"
          eyebrow="Leagues & competitions"
          title="Find your league"
          description="Standings, stats, leaders and every game — pick a league or competition to dive in."
        />

        {/* Trending leagues */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
          {leagues.map((league: any, i: number) => {
            const isCompetition = league._type === "competition";
            return (
              <Reveal key={league.slug} delay={(i % 4) * 70} className={i < wideCount ? "col-span-2" : ""}>
              <button
                type="button"
                onClick={() => handleSelect({ type: isCompetition ? 'competition' : 'league', name: league.name, slug: league.slug, logo_url: league.logo_url ?? null } as any)}
                className={`ch-shine ch-dribble-on-hover w-full group relative h-36 sm:h-40 md:h-44 overflow-hidden rounded-[14px] text-left bg-[#111317] shadow-[var(--ch-shadow)] ring-1 ring-black/5 dark:ring-white/5 hover:-translate-y-0.5 hover:shadow-[var(--ch-shadow-lg)] transition-all duration-300`}
              >
                {league.banner_url && (
                  <img
                    src={league.banner_url}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-55 group-hover:opacity-70 group-hover:scale-[1.04] transition-all duration-500"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
                <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3">
                  <span className="inline-flex items-center h-5 sm:h-6 px-1.5 sm:px-2 rounded-md text-[9.5px] sm:text-[10px] font-semibold uppercase tracking-[0.12em] text-white/85 bg-white/10 backdrop-blur border border-white/10">
                    {isCompetition ? "Competition" : "League"}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 flex items-end justify-between gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <div className="ch-display uppercase text-white text-[1.1rem] sm:text-[1.35rem] md:text-[1.5rem] font-bold leading-[1] tracking-tight line-clamp-2">
                      {cleanLeagueName(league.name)}
                    </div>
                    <div className="mt-1.5 hidden sm:inline-flex items-center gap-1 text-[12px] font-medium text-white/70 group-hover:text-white transition-colors">
                      View stats <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                  <span className="ch-dribble-target h-9 w-9 sm:h-12 sm:w-12 rounded-lg sm:rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
                    {league.logo_url
                      ? <img src={league.logo_url} alt={`${league.name} logo`} className="h-7 w-7 sm:h-10 sm:w-10 object-contain" />
                      : <Trophy className="h-5 w-5 text-orange-500" />}
                  </span>
                </div>
              </button>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
