import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Trophy, ArrowLeft, Users } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import BCBLogo from "@/assets/BCB Logo.jpg";
import LeagueDefaultImage from "@/assets/league-default.png";

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

const GENDER_ORDER = ["Men's", "Men", "Male", "Women's", "Women", "Female"];

function genderSortIndex(gender: string): number {
  const normalized = gender.toLowerCase().replace("'s", "").trim();
  const index = GENDER_ORDER.findIndex((g) => normalized.startsWith(g.toLowerCase().replace("'s", "").trim()));
  return index === -1 ? 99 : index;
}

function getSeasonLabel(competition: SeasonCompetition): string {
  const raw = `${competition.season || ""} ${competition.name}`;
  const match = raw.match(/\b(20\d{2})\s*[-/]\s*(20)?(\d{2})\b/);
  return match ? `${match[1]}/${match[3]}` : competition.season || competition.name;
}

function getCompetitionLabel(competition: SeasonCompetition): string {
  const identity = `${competition.season || ""} ${competition.name}`.toLowerCase();
  if (identity.includes("trophy")) return "Trophy";
  if (identity.includes("regular") || identity.includes("season")) return "Regular Season";
  return competition.name;
}

export default function CompetitionPage() {
  const [, params] = useRoute("/league/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug ?? "";

  const [league, setLeague] = useState<League | null>(null);
  const [seasons, setSeasons] = useState<SeasonCompetition[]>([]);
  const [selectedGender, setSelectedGender] = useState("");
  const [selectedSeason, setSelectedSeason] = useState("");
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
      setSeasons(seasonList);

      // Gender-based brands (e.g. Super League Basketball, NBL Division One)
      // show a Men's/Women's split first; the season + competition-type
      // picker below it is then scoped to whichever gender is selected.
      // Brands with no gender set anywhere (e.g. BCB) skip straight to the
      // season picker, same as before.
      const genders = Array.from(new Set(seasonList.map((c) => c.gender).filter((g): g is string => !!g)))
        .sort((a, b) => genderSortIndex(a) - genderSortIndex(b));
      const initialGender = genders[0] || "";
      setSelectedGender(initialGender);

      const initialScope = initialGender
        ? seasonList.filter((c) => c.gender === initialGender)
        : seasonList;
      setSelectedSeason(initialScope[0] ? getSeasonLabel(initialScope[0]) : "");
      setLoading(false);
    };

    fetchData();
  }, [slug]);

  const availableGenders = useMemo(
    () => Array.from(new Set(seasons.map((c) => c.gender).filter((g): g is string => !!g)))
      .sort((a, b) => genderSortIndex(a) - genderSortIndex(b)),
    [seasons],
  );

  // Scoped to the selected gender when this is a gender-split brand;
  // otherwise every competition is in scope, unchanged from before.
  const genderScopedSeasons = useMemo(
    () => (availableGenders.length > 0 ? seasons.filter((c) => c.gender === selectedGender) : seasons),
    [seasons, availableGenders, selectedGender],
  );

  const seasonLabels = useMemo(
    () => Array.from(new Set(genderScopedSeasons.map(getSeasonLabel))),
    [genderScopedSeasons],
  );

  const visibleCompetitions = useMemo(
    () => genderScopedSeasons
      .filter((competition) => getSeasonLabel(competition) === selectedSeason)
      .sort((a, b) => {
        const order = ["Regular Season", "Trophy"];
        const aIndex = order.indexOf(getCompetitionLabel(a));
        const bIndex = order.indexOf(getCompetitionLabel(b));
        return (aIndex === -1 ? order.length : aIndex) - (bIndex === -1 ? order.length : bIndex);
      }),
    [genderScopedSeasons, selectedSeason],
  );

  const handleSelectGender = (gender: string) => {
    setSelectedGender(gender);
    const scope = seasons.filter((c) => c.gender === gender);
    setSelectedSeason(scope[0] ? getSeasonLabel(scope[0]) : "");
  };

  const brandingCompetition =
    visibleCompetitions.find((competition) => getCompetitionLabel(competition) === "Regular Season") ||
    visibleCompetitions[0] ||
    seasons[0];
  const isBritishChampionship = slug === "british-championship-basketball";
  const displayLogoUrl =
    league?.logo_url ||
    brandingCompetition?.logo_url ||
    (isBritishChampionship ? BCBLogo : null);
  const displayBannerUrl =
    brandingCompetition?.banner_url ||
    (isBritishChampionship ? LeagueDefaultImage : null);

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
      <div
        className="relative overflow-hidden bg-gradient-to-b from-orange-50 dark:from-neutral-900 to-white dark:to-neutral-950 px-6 pt-10 pb-8 flex flex-col items-center text-center"
        style={displayBannerUrl ? {
          backgroundImage: `url(${displayBannerUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        } : undefined}
      >
        {displayBannerUrl && <div className="absolute inset-0 bg-slate-950/65" />}
        {displayLogoUrl ? (
          <img
            src={displayLogoUrl}
            alt={league.name}
            className="relative w-20 h-20 object-contain mb-4 rounded-xl shadow-md bg-white p-1"
          />
        ) : (
          <div className="relative w-20 h-20 rounded-xl bg-orange-100 dark:bg-neutral-800 flex items-center justify-center mb-4">
            <Trophy className="w-10 h-10 text-orange-500" />
          </div>
        )}
        <h1 className={`relative text-3xl sm:text-4xl font-extrabold tracking-tight ${displayBannerUrl ? "text-white drop-shadow-md" : "text-slate-900 dark:text-white"}`}>
          {league.name}
        </h1>
        {league.description && (
          <p className={`relative mt-3 text-sm max-w-lg ${displayBannerUrl ? "text-white/85 drop-shadow-sm" : "text-slate-500 dark:text-slate-400"}`}>
            {league.description}
          </p>
        )}
        {seasons.length > 0 && (
          <p className={`relative mt-2 text-xs uppercase tracking-wider font-medium ${displayBannerUrl ? "text-white/70" : "text-slate-400 dark:text-slate-500"}`}>
            Choose a competition
          </p>
        )}
      </div>

      <main className="max-w-2xl mx-auto px-6 pb-16">
        {/* Gender split — sits above the season picker; selecting a gender
            scopes everything below it (season dropdown + competition-type
            buttons) to that gender, rather than jumping straight to a
            single competition. */}
        {availableGenders.length > 0 && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-neutral-700 p-1 w-full sm:w-fit mb-6">
            {availableGenders.map((gender) => (
              <button
                key={gender}
                onClick={() => handleSelectGender(gender)}
                className={`flex-1 sm:flex-initial px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  selectedGender === gender
                    ? "bg-orange-500 text-white"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-neutral-800"
                }`}
              >
                {gender}
              </button>
            ))}
          </div>
        )}

        {/* Season and competition-type picker */}
        {genderScopedSeasons.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Season
              </h2>
              {seasonLabels.length > 1 && (
                <select
                  value={selectedSeason}
                  onChange={(event) => setSelectedSeason(event.target.value)}
                  aria-label="Select season"
                  className="w-full sm:w-44 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  {seasonLabels.map((season) => (
                    <option key={season} value={season}>{season}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleCompetitions.map((competition) => (
              <button
                key={competition.slug}
                onClick={() => setLocation(`/competition/${competition.slug}`)}
                className="relative overflow-hidden rounded-2xl min-h-[150px] hover:scale-[1.02] hover:shadow-xl transition-all duration-200 text-left group w-full"
                style={{ backgroundColor: "#1a1a1a" }}
              >
                {(competition.banner_url || displayBannerUrl) && (
                  <img
                    src={competition.banner_url || displayBannerUrl || ""}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-50 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
                  <div>
                    <span className="font-extrabold text-xl text-white drop-shadow-sm block">
                      {getCompetitionLabel(competition)}
                    </span>
                    <span className="mt-1 text-xs text-white/60 block">{competition.name}</span>
                  </div>
                  {competition.logo_url && (
                    <img src={competition.logo_url} alt="" className="h-9 w-9 object-contain" />
                  )}
                </div>
              </button>
            ))}
            </div>
          </div>
        )}

        {seasons.length === 0 && (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <p className="text-sm">No competitions available yet.</p>
          </div>
        )}
      </main>
    </div>
  );
}
