import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Trophy, ArrowLeft, Users } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

interface League {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
}

interface SeasonCompetition {
  name: string;
  slug: string;
  season: string | null;
  banner_url: string | null;
  logo_url: string | null;
  gender: string | null;
}

interface GenderGroup {
  gender: string;
  mostRecent: SeasonCompetition;
}

const GENDER_ORDER = ["Men's", "Men", "Male", "Women's", "Women", "Female"];

export default function CompetitionPage() {
  const [, params] = useRoute("/league/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug ?? "";

  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<SeasonCompetition[]>([]);
  const [genderGroups, setGenderGroups] = useState<GenderGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const fetchData = async () => {
      setLoading(true);
      setNotFound(false);

      // Look up the league brand in the leagues table
      const { data: leagueData, error: leagueError } = await supabase
        .from("leagues")
        .select("id, name, slug, logo_url, description")
        .eq("slug", slug)
        .single();

      if (leagueError || !leagueData) {
        // Fallback: check if the slug belongs to a competition (season) and redirect
        const { data: comp } = await supabase
          .from("competitions")
          .select("slug")
          .eq("slug", slug)
          .single();
        if (comp?.slug) {
          setLocation(`/competition/${slug}`, { replace: true });
          return;
        }
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLeague(leagueData as League);

      // Fetch all competitions belonging to this league brand
      const { data: competitionsData } = await supabase
        .from("competitions")
        .select("name, slug, season, banner_url, logo_url, gender")
        .eq("competition_id", leagueData.id)
        .eq("is_public", true)
        .order("season", { ascending: false });

      const seasonList = (competitionsData as SeasonCompetition[] | null) || [];

      // Detect gender-based league: at least one competition has gender set
      const isGenderLeague = seasonList.some(c => !!c.gender);

      if (isGenderLeague) {
        // Group by gender, pick the most recent competition per gender group
        const grouped = new Map<string, SeasonCompetition>();
        for (const comp of seasonList) {
          const g = comp.gender || "Other";
          if (!grouped.has(g)) grouped.set(g, comp);
        }
        const groups: GenderGroup[] = Array.from(grouped.entries())
          .sort(([a], [b]) => {
            const ai = GENDER_ORDER.findIndex(g => a.toLowerCase().startsWith(g.toLowerCase().replace("'s", "").trim()));
            const bi = GENDER_ORDER.findIndex(g => b.toLowerCase().startsWith(g.toLowerCase().replace("'s", "").trim()));
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
          })
          .map(([gender, mostRecent]) => ({ gender, mostRecent }));
        setGenderGroups(groups);
        setSeasons([]);
        setLoading(false);
      } else if (seasonList.length > 0) {
        // Year-over-year seasons — redirect straight to the most recent
        setLocation(`/competition/${seasonList[0].slug}`, { replace: true });
      } else {
        setSeasons(seasonList);
        setLoading(false);
      }
    };

    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFound || !league) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col items-center justify-center gap-4 text-center px-6">
        <Trophy className="w-12 h-12 text-orange-300" />
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">League not found</h1>
        <p className="text-slate-500 dark:text-slate-400">No league with the slug "{slug}" exists.</p>
        <button
          onClick={() => setLocation("/")}
          className="mt-2 flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-slate-900 dark:text-slate-100">
      <div className="h-[1px] bg-gradient-to-r from-orange-400 to-amber-400" />

      <header className="sticky top-0 z-30 bg-white/90 dark:bg-neutral-950/90 backdrop-blur border-b border-orange-100 dark:border-neutral-800 px-6 py-3 flex items-center justify-between">
        <img
          src={SwishLogo}
          alt="Swish Assistant"
          className="h-6 md:h-9 cursor-pointer"
          onClick={() => setLocation("/")}
        />
        <ThemeToggle />
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-orange-50 dark:from-neutral-900 to-white dark:to-neutral-950 px-6 pt-10 pb-8 flex flex-col items-center text-center">
        {(league.logo_url || genderGroups[0]?.mostRecent.logo_url || seasons[0]?.logo_url) ? (
          <img
            src={league.logo_url || genderGroups[0]?.mostRecent.logo_url || seasons[0]?.logo_url || ""}
            alt={league.name}
            className="w-20 h-20 object-contain mb-4 rounded-xl shadow-md"
          />
        ) : (
          <div className="w-20 h-20 rounded-xl bg-orange-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
            <Trophy className="w-10 h-10 text-orange-500" />
          </div>
        )}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {league.name}
        </h1>
        {league.description && (
          <p className="mt-3 text-slate-500 dark:text-slate-400 text-sm max-w-lg">
            {league.description}
          </p>
        )}
        {genderGroups.length > 0 && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-medium">
            Choose a competition
          </p>
        )}
      </div>

      <main className="max-w-2xl mx-auto px-6 pb-16">
        {/* Gender-based competition picker */}
        {genderGroups.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-4">
            {genderGroups.map(({ gender, mostRecent }) => (
              <button
                key={gender}
                onClick={() => setLocation(`/competition/${mostRecent.slug}`)}
                className="relative flex-1 overflow-hidden rounded-2xl min-h-[160px] hover:scale-[1.02] hover:shadow-xl transition-all duration-200 text-left group"
                style={{ backgroundColor: "#111" }}
              >
                {mostRecent.banner_url && (
                  <img
                    src={mostRecent.banner_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-55 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end justify-between">
                  <div>
                    <span className="text-xl font-extrabold text-white drop-shadow-md tracking-tight block">
                      {gender}
                    </span>
                    {mostRecent.season && (
                      <span className="text-xs font-medium text-white/60">
                        {mostRecent.season}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Year-over-year season list (non-gender leagues — shown when no auto-redirect happened) */}
        {seasons.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
              Seasons
            </h2>
            {seasons.map((s) => (
              <button
                key={s.slug}
                onClick={() => setLocation(`/competition/${s.slug}`)}
                className="relative overflow-hidden rounded-2xl h-24 hover:scale-[1.02] hover:shadow-lg transition-all duration-200 text-left group w-full"
                style={{ backgroundColor: "#1a1a1a" }}
              >
                {s.banner_url && (
                  <img
                    src={s.banner_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
                  <div>
                    <span className="font-semibold text-sm text-white drop-shadow-sm block">
                      {s.season || s.name}
                    </span>
                    {s.season && s.name !== s.season && (
                      <span className="text-xs text-white/60">{s.name}</span>
                    )}
                  </div>
                  {s.logo_url && (
                    <img src={s.logo_url} alt="" className="h-9 w-9 object-contain" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {genderGroups.length === 0 && seasons.length === 0 && (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <p className="text-sm">No competitions available yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}
