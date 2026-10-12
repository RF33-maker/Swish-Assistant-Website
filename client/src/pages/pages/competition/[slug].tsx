import { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Trophy, ArrowLeft, Users } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import BCBLogo from "@/assets/BCB Logo.jpg";
import LeagueDefaultImage from "@/assets/league-default.jpg";

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
  //
  // A competition with no gender set (someone created it via the league
  // admin panel and left that field blank -- it's free text with no
  // default) doesn't belong to either tab under a strict `===` filter, so it
  // silently disappeared from the page entirely rather than showing under
  // "no competitions available". Surfacing it under every gender tab is the
  // safer default: worst case a competition appears once too often, instead
  // of an admin's real, public, is_public=true competition being invisible
  // with no error and no indication anything is missing.
  const genderScopedSeasons = useMemo(
    () => (availableGenders.length > 0 ? seasons.filter((c) => !c.gender || c.gender === selectedGender) : seasons),
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
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-5">
          <div className="ch-skel h-60 md:h-72 rounded-[14px]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="ch-skel h-40 rounded-[14px]" />
            <div className="ch-skel h-40 rounded-[14px]" />
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !league) {
    return (
      <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
        <SiteHeader />
        <main className="max-w-xl mx-auto px-4 py-16">
          <div className="ch-card p-10 text-center">
            <Trophy className="w-10 h-10 mx-auto text-[color:var(--ch-muted)]" />
            <h1 className="mt-3 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2rem] text-[color:var(--ch-text)]">League not found</h1>
            <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">No league with the slug "{slug}" exists.</p>
            <button onClick={() => setLocation("/")} className="ch-btn ch-btn-ghost h-10 px-4 mt-6">
              <ArrowLeft className="w-4 h-4" /> Back to home
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <SiteHeader />

      <main className="max-w-5xl mx-auto px-4 md:px-6 pt-4 md:pt-6 pb-16">
        {/* Hero, as on the competition pages */}
        <section
          className="ch-hero ch-rise h-56 sm:h-64 md:h-72 bg-[#0b0e13]"
          style={displayBannerUrl ? { backgroundImage: `url(${displayBannerUrl})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        >
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,9,11,0.1) 0%, rgba(8,9,11,0.45) 45%, rgba(8,9,11,0.92) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 flex items-end gap-4 md:gap-5">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden shrink-0">
              {displayLogoUrl
                ? <img src={displayLogoUrl} alt="" className="w-12 h-12 md:w-16 md:h-16 object-contain" />
                : <Trophy className="w-8 h-8 text-orange-500" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.14em] text-white/65">League</div>
              <h1 className="ch-display uppercase font-bold leading-[0.95] tracking-tight text-white text-[1.9rem] sm:text-[2.5rem] md:text-[3.25rem] mt-1 line-clamp-2">
                {league.name}
              </h1>
              {league.description && (
                <p className="mt-2 text-sm text-white/75 max-w-xl line-clamp-2">{league.description}</p>
              )}
            </div>
          </div>
        </section>

        {seasons.length > 0 && (
          <div className="mt-6 md:mt-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Choose a competition</div>

            {/* Gender split — scopes the season picker and the competitions
                below it, rather than jumping straight to one competition. */}
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {availableGenders.length > 0 ? (
                <div className="ch-seg" role="tablist" aria-label="Competition gender">
                  {availableGenders.map((gender) => (
                    <button
                      key={gender}
                      role="tab"
                      aria-selected={selectedGender === gender}
                      data-active={selectedGender === gender}
                      onClick={() => handleSelectGender(gender)}
                      className="px-4 h-9 text-sm font-semibold"
                    >
                      {gender}
                    </button>
                  ))}
                </div>
              ) : <span />}
              {genderScopedSeasons.length > 0 && seasonLabels.length > 1 && (
                <label className="flex items-center gap-3">
                  <span className="ch-eyebrow">Season</span>
                  <select
                    value={selectedSeason}
                    onChange={(event) => setSelectedSeason(event.target.value)}
                    aria-label="Select season"
                    className="ch-input h-10 px-3.5 text-sm font-semibold w-40"
                  >
                    {seasonLabels.map((season) => (
                      <option key={season} value={season}>{season}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {genderScopedSeasons.length > 0 && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {visibleCompetitions.map((competition) => (
                  <button
                    key={competition.slug}
                    onClick={() => setLocation(`/competition/${competition.slug}`)}
                    className="ch-card ch-hover group relative overflow-hidden min-h-[170px] text-left w-full bg-[#0b0e13]"
                  >
                    {(competition.banner_url || displayBannerUrl) && (
                      <img
                        src={competition.banner_url || displayBannerUrl || ""}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover opacity-45 group-hover:opacity-60 group-hover:scale-[1.03] transition-all duration-500"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <span className="ch-display uppercase font-bold tracking-tight leading-none text-[1.7rem] text-white block">
                          {getCompetitionLabel(competition)}
                        </span>
                        <span className="mt-1.5 text-xs text-white/65 block truncate">{competition.name}</span>
                      </div>
                      {competition.logo_url && (
                        <img src={competition.logo_url} alt="" className="h-10 w-10 object-contain shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {seasons.length === 0 && (
          <div className="mt-6 ch-card p-12 text-center text-sm text-[color:var(--ch-text-2)]">
            No competitions available yet.
          </div>
        )}
      </main>
    </div>
  );
}
