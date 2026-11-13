import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import AllTimeLeaders from "@/components/league/AllTimeLeaders";
import { Reveal, prefersReducedMotion } from "@/components/home/motion";
import CareerLadders from "@/components/history/CareerLadders";
import HistoryNav, { NAV_OFFSET, scrollToSection, type NavSection } from "@/components/history/HistoryNav";
import LeagueTrends from "@/components/history/LeagueTrends";
import QuickLook from "@/components/history/QuickLook";
import RecordBoard from "@/components/history/RecordBoard";
import SeasonSpread from "@/components/history/SeasonSpread";
import SeasonTimeline from "@/components/history/SeasonTimeline";
import { CountUp, SectionHeading, isInProgress, seasonStart, type HistoryData } from "@/components/history/shared";
import { supabase } from "@/lib/supabase";

const SITE_URL = "https://swishassistant.com";

/**
 * /british-basketball-history: every season on file, league by league.
 *
 * Reads top to bottom as: pick a league, the league in four facts, then a bar that sticks
 * to the top and jumps between the parts (seasons, records, careers, how the game has
 * changed, the full leaderboards). The league, the open season and the part being read
 * all live in the URL (?league=slb-women&season=2018-19#records), so any view can be shared.
 * Everything comes from /api/leagues/:brandId/all-time (server/allTimeLeaders.ts); the
 * pieces live in components/history.
 *
 * Only the box scores already on the site count; nothing here comes from outside archives.
 * Each season keeps the team names of the time ("Glasgow Rocks", "Esh Group Eagles
 * Newcastle"); team links still land on today's club.
 */

const SLB = "56cac2cb-6d34-459c-afa8-c34a8d4aa00f";
const BCB = "fdf9aa2d-6685-4ad8-a558-811e96a741df";
const NBL = "3b022087-839f-4329-aa5e-d39d9688139a";

type LeagueOption = { id: string; brandId: string; gender: string; name: string; short: string; lineage: string };

const LEAGUES: LeagueOption[] = [
  { id: "slb-men", brandId: SLB, gender: "Men", name: "Super League Basketball", short: "SLB", lineage: "Played as the British Basketball League (BBL) until 2024." },
  { id: "slb-women", brandId: SLB, gender: "Women", name: "Women's Super League Basketball", short: "SLB Women", lineage: "Played as the Women's British Basketball League (WBBL) until 2023." },
  { id: "bcb", brandId: BCB, gender: "", name: "British Championship Basketball", short: "BCB", lineage: "Played as NBL Division One until 2025." },
  { id: "nbl-men", brandId: NBL, gender: "Men", name: "NBL Division One", short: "NBL D1", lineage: "Played as NBL Division Two until 2025." },
  { id: "nbl-women", brandId: NBL, gender: "Women", name: "WNBL Division One", short: "WNBL D1", lineage: "The women's National Basketball League's Division One." },
];

// "2018/19" in the page, "2018-19" in the URL.
const seasonToParam = (season: string) => season.replace("/", "-");
const seasonFromParam = (param: string | null) => (param && /^\d{4}-\d{2}$/.test(param) ? param.replace("-", "/") : null);

function readUrl(): { league: LeagueOption; season: string | null } {
  try {
    const params = new URLSearchParams(window.location.search);
    const league = LEAGUES.find((l) => l.id === params.get("league")) || LEAGUES[0];
    return { league, season: seasonFromParam(params.get("season")) };
  } catch {
    return { league: LEAGUES[0], season: null };
  }
}

function writeUrl(league: LeagueOption, season: string | null, clearHash = false) {
  try {
    const url = new URL(window.location.href);
    if (clearHash) url.hash = "";
    if (league.id === LEAGUES[0].id) url.searchParams.delete("league");
    else url.searchParams.set("league", league.id);
    if (season) url.searchParams.set("season", seasonToParam(season));
    else url.searchParams.delete("season");
    window.history.replaceState(window.history.state, "", url.toString());
  } catch {
    /* the page still works without the URL */
  }
}

/** Each league brand's logo, for the picker and the league heading. */
function useLeagueLogos(): Record<string, string> {
  const [logos, setLogos] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("leagues")
      .select("id, logo_url")
      .in("id", Array.from(new Set(LEAGUES.map((l) => l.brandId))))
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const row of data as Array<{ id: string; logo_url: string | null }>) if (row.logo_url) map[row.id] = row.logo_url;
        setLogos(map);
      });
    return () => { cancelled = true; };
  }, []);
  return logos;
}

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0">
      <dd className="ch-display font-bold leading-none tabular-nums text-[1.75rem] md:text-[2.25rem] text-[color:var(--ch-text)]"><CountUp value={value} /></dd>
      <dt className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{label}</dt>
    </div>
  );
}

export default function BritishBasketballHistoryPage() {
  const initial = useMemo(readUrl, []);
  const [league, setLeague] = useState<LeagueOption>(initial.league);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<string | null>(initial.season);
  const leagueLogos = useLeagueLogos();
  const leagueTop = useRef<HTMLDivElement | null>(null);
  // A #section in the address is honoured once, when the first league has loaded.
  const pendingHash = useRef<string | null>(typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") || null : null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setData(null);
    const params = new URLSearchParams({ scope: "all" });
    if (league.gender) params.set("gender", league.gender);
    fetch(`/api/leagues/${league.brandId}/all-time?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [league]);

  const pickLeague = (id: string, fromBar = false) => {
    const option = LEAGUES.find((l) => l.id === id);
    if (!option) return;
    if (option.id !== league.id) {
      setLeague(option);
      setPicked(null);
      // A new league starts from its overview, so the old #section no longer applies.
      writeUrl(option, null, true);
    }
    // Changing league from the stuck bar goes back up to that league's overview.
    if (fromBar && leagueTop.current) {
      const top = leagueTop.current.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  // Oldest first, the order the timeline reads in.
  const seasons = useMemo(() => [...(data?.seasons || [])].sort((a, b) => seasonStart(a.season) - seasonStart(b.season)), [data]);
  // Open on the last finished season: the one being played now is still filling in.
  const season = useMemo(() => {
    if (seasons.length === 0) return null;
    const chosen = picked && seasons.find((s) => s.season === picked);
    if (chosen) return chosen;
    const finished = seasons.filter((s) => !isInProgress(s.season));
    return finished[finished.length - 1] || seasons[seasons.length - 1];
  }, [seasons, picked]);
  const seasonIndex = season ? seasons.indexOf(season) : -1;

  const pickSeason = useCallback((label: string) => {
    setPicked(label);
    writeUrl(league, label);
  }, [league]);

  const openSeason = useCallback((label: string) => {
    pickSeason(label);
    // Let the season render before measuring where its section sits.
    requestAnimationFrame(() => scrollToSection("seasons"));
  }, [pickSeason]);

  const hasRecords = !!data?.records?.pts?.length;
  const hasCareers = (data?.careers.length ?? 0) >= 5;
  const hasTrends = seasons.filter((s) => s.perTeamGame).length >= 3;

  const sections = useMemo<NavSection[]>(() => {
    if (!data) return [];
    const out: NavSection[] = [];
    if (season) out.push({ id: "seasons", label: "Seasons" });
    if (hasRecords) out.push({ id: "records", label: "Records" });
    if (hasCareers) out.push({ id: "careers", label: "Careers" });
    if (hasTrends) out.push({ id: "the-game", label: "The game" });
    out.push({ id: "leaderboards", label: "Leaderboards" });
    return out;
  }, [data, season, hasRecords, hasCareers, hasTrends]);

  // Honour #records and the like from a shared link, once the sections exist.
  useEffect(() => {
    const id = pendingHash.current;
    if (!id || sections.length === 0) return;
    if (!sections.some((s) => s.id === id)) { pendingHash.current = null; return; }
    // Jump now, then once more after fonts and logos have settled the layout, unless
    // the reader has started scrolling in the meantime.
    const jump = () => {
      const el = document.getElementById(id);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET + 8 });
      return window.scrollY;
    };
    let landed = -1;
    const frame = requestAnimationFrame(() => { pendingHash.current = null; landed = jump(); });
    const settle = window.setTimeout(() => { if (Math.abs(window.scrollY - landed) < 2) jump(); }, 600);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(settle); };
  }, [sections]);

  const leagueLogo = leagueLogos[league.brandId];

  const canonical = `${SITE_URL}/british-basketball-history`;
  const description =
    "British basketball history on Swish Assistant: career totals and averages, single-game records and every season's leaders in Super League Basketball, the WBBL, BCB and the NBL.";

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen bg-[color:var(--ch-bg)]`}>
      <Helmet>
        <title>British Basketball History | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="British Basketball History | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-8 md:pt-12 pb-24">
        <div className="ch-rise max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">History</div>
          <h1 className="mt-2 ch-display font-bold tracking-tight leading-[0.95] text-[2.4rem] md:text-[3.5rem] text-[color:var(--ch-text)]">
            British basketball history
          </h1>
          <p className="mt-3 text-base md:text-[17px] leading-relaxed text-[color:var(--ch-text-2)]">
            Every season on file, league by league. Pick a league, then jump to its seasons, records and careers.
          </p>
        </div>

        {/* League picker */}
        <div ref={leagueTop} className="mt-8 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="tablist" aria-label="League" className="flex gap-2 min-w-max">
            {LEAGUES.map((option) => {
              const active = option.id === league.id;
              const logo = leagueLogos[option.brandId];
              return (
                <button
                  key={option.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => pickLeague(option.id)}
                  className={`flex items-center gap-2.5 h-12 rounded-full pl-2 pr-4 text-[15px] font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-[color:var(--ch-text)] text-[color:var(--ch-bg)]"
                      : "text-[color:var(--ch-text)] shadow-[inset_0_0_0_1px_var(--ch-border-strong)] hover:bg-[color:var(--ch-surface-2)]"
                  }`}
                >
                  {logo ? (
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? "bg-white" : ""}`}>
                      <img src={logo} alt="" className="h-7 w-7 object-contain" />
                    </span>
                  ) : (
                    <span className="w-1.5" />
                  )}
                  {option.short}
                </button>
              );
            })}
          </div>
        </div>

        {/* The league at a glance */}
        <section key={league.id} className="ch-rise mt-10" aria-labelledby="league-heading">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-x-10 gap-y-6">
            <div className="flex items-center gap-4 md:gap-5 min-w-0">
              {leagueLogo && <img src={leagueLogo} alt="" className="h-14 w-14 md:h-[72px] md:w-[72px] shrink-0 object-contain" />}
              <div className="min-w-0">
                <h2 id="league-heading" className="ch-display font-bold tracking-tight leading-[1.05] text-[1.6rem] md:text-[2.1rem] text-[color:var(--ch-text)]">
                  {league.name}
                </h2>
                <p className="mt-1.5 text-sm md:text-[15px] leading-relaxed text-[color:var(--ch-text-2)]">
                  {league.lineage}
                  {data?.firstSeason && (
                    <>
                      {" "}On file from {data.firstSeason}
                      {data.lastSeason && data.lastSeason !== data.firstSeason ? ` to ${data.lastSeason}` : ""}.
                    </>
                  )}
                </p>
              </div>
            </div>
            {data && (
              <dl className="grid grid-cols-3 gap-x-6 md:gap-x-10 shrink-0">
                <Figure value={seasons.length} label="Seasons" />
                <Figure value={data.games} label="Games" />
                {data.players != null && <Figure value={data.players} label="Players" />}
              </dl>
            )}
          </div>

          {data && (
            <QuickLook data={data} seasons={seasons} gender={league.gender} onOpenSeason={openSeason} onJump={scrollToSection} />
          )}

          {loading && (
            <div className="mt-10 space-y-4" aria-busy="true" aria-label="Loading this league's history">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[0, 1, 2, 3].map((i) => <div key={i} className="ch-skel h-28 rounded-[10px]" />)}
              </div>
              <div className="ch-skel h-14 rounded-[10px]" />
              <div className="ch-skel h-72 rounded-[10px]" />
            </div>
          )}
          {!loading && failed && (
            <p className="mt-8 text-sm text-[color:var(--ch-text-2)]">This league's history could not be loaded just now.</p>
          )}
        </section>

        {sections.length > 0 && (
          <HistoryNav
            className="mt-12"
            leagues={LEAGUES.map((l) => ({ id: l.id, short: l.short, name: l.name, logo: leagueLogos[l.brandId] }))}
            activeLeague={league.id}
            onPickLeague={(id) => pickLeague(id, true)}
            sections={sections}
          />
        )}

        {data && season && (
          <section id="seasons" className="mt-10" aria-labelledby="seasons-heading">
            <SectionHeading
              id="seasons-heading"
              eyebrow="Season by season"
              title="Every season on file"
              note="Each year shows the side with the best league record. Pick a year to open that season."
            />
            <div className="mt-7">
              <SeasonTimeline seasons={seasons} selected={season.season} onSelect={pickSeason} logos={data.logos} gender={league.gender} />
            </div>
            <SeasonSpread
              season={season}
              gender={league.gender}
              logos={data.logos}
              onPrev={seasonIndex > 0 ? () => pickSeason(seasons[seasonIndex - 1].season) : null}
              onNext={seasonIndex < seasons.length - 1 ? () => pickSeason(seasons[seasonIndex + 1].season) : null}
            />
          </section>
        )}

        {data && hasRecords && (
          <section id="records" className="mt-24" aria-labelledby="records-heading">
            <Reveal>
              <SectionHeading
                id="records-heading"
                eyebrow="Records"
                title="Single-game records"
                note="The most anyone has put up in one game, cups and play-offs included."
              />
              <RecordBoard data={data} gender={league.gender} />
            </Reveal>
          </section>
        )}

        {data && hasCareers && (
          <section id="careers" className="mt-24" aria-labelledby="careers-heading">
            <Reveal>
              <SectionHeading
                id="careers-heading"
                eyebrow="Careers"
                title="Career leaders"
                note="Every season a player has on file, added up. The top five in each, drawn to scale against the leader."
              />
              <CareerLadders data={data} gender={league.gender} />
            </Reveal>
          </section>
        )}

        {data && hasTrends && (
          <section id="the-game" className="mt-24" aria-labelledby="trends-heading">
            <Reveal>
              <SectionHeading
                id="trends-heading"
                eyebrow="The game"
                title="How the league has changed"
                note="What one team put up in an average league game, season by season."
              />
              <LeagueTrends seasons={seasons} />
            </Reveal>
          </section>
        )}

        {/* Career averages, percentages and the full record boards. */}
        {data && (
          <div id="leaderboards" className="mt-14">
            <AllTimeLeaders key={`leaders-${league.id}`} brandId={league.brandId} gender={league.gender} />
          </div>
        )}
      </main>
    </div>
  );
}
