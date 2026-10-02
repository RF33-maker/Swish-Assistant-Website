import { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useSearch } from "wouter";
import { CalendarClock } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import ScoreGameCard from "@/components/scores/ScoreGameCard";
import { dayLabel, useScores, type ScoreGame } from "@/lib/scores";

/**
 * /scores — every live game, what's coming up next, and results from the
 * last day, in one mobile-first list.
 *
 * The homepage ticker only has room for a few games per league, which on a
 * busy Saturday hid up to half of them. This is the complete view behind it,
 * and the link to share on socials: /scores?league=<slug> opens pre-filtered.
 *
 * There is deliberately no date picker. The server applies the rolling rules
 * (see /api/scores): results stay for 24 hours, and "coming up" is the rest of
 * today plus the next six days, grouped by day, so the page is never empty
 * midweek and never asks the visitor to work out which day to look at.
 */

// The app has no global scroll reset, so arriving here from partway down the
// homepage used to open this page partway down too, with the header and "Live
// now" off-screen. Reset on arrival — but not on back/forward, or tapping
// back from a game would throw away your place in the list. The listener is
// registered at import time, ahead of the router's own, so the flag is set
// before this page re-renders.
let lastPopStateAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { lastPopStateAt = Date.now(); });
}

const CANONICAL = "https://swishassistant.com/scores";
const META_DESCRIPTION =
  "Live scores, upcoming fixtures and the latest results from British basketball, updated as games happen.";

function Section({ title, meta, live = false, children }: { title: string; meta?: string; live?: boolean; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 ch-display uppercase font-bold tracking-tight leading-none text-[1.5rem] md:text-[1.75rem] text-[color:var(--ch-text)]">
          {live && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />}
          {title}
        </h2>
        {meta && <span className="text-xs font-medium text-[color:var(--ch-muted)]">{meta}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{children}</div>
    </section>
  );
}

export default function ScoresPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leagueParam = new URLSearchParams(search).get("league") || "";

  const { data, isLoading, isError } = useScores();

  useEffect(() => {
    if (Date.now() - lastPopStateAt > 1000) window.scrollTo(0, 0);
  }, []);

  // An unknown ?league= (a stale social link, or a league with nothing on)
  // falls back to showing everything rather than an empty page.
  const activeLeague = data?.leagues.some((l) => l.slug === leagueParam) ? leagueParam : "";
  const pick = (games: ScoreGame[] = []) => (activeLeague ? games.filter((g) => g.league_slug === activeLeague) : games);

  const live = useMemo(() => pick(data?.live), [data, activeLeague]);
  const upcoming = useMemo(() => pick(data?.upcoming.games), [data, activeLeague]);
  const upcomingDays = useMemo(
    () => (data?.upcoming.days ?? []).map((d) => ({ ...d, games: pick(d.games) })).filter((d) => d.games.length > 0),
    [data, activeLeague],
  );
  const results = useMemo(() => pick(data?.results), [data, activeLeague]);
  const nothingOn = !isLoading && live.length === 0 && upcoming.length === 0 && results.length === 0;

  const selectLeague = (slug: string) => {
    setLocation(slug ? `/scores?league=${encodeURIComponent(slug)}` : "/scores", { replace: true });
  };

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      {/* Managed through Helmet rather than document.title so the title is
          released when you navigate on to a game, instead of sticking. */}
      <Helmet>
        <title>Live scores and results | Swish Assistant</title>
        <meta name="description" content={META_DESCRIPTION} />
        <meta property="og:title" content="Live scores and results | Swish Assistant" />
        <meta property="og:description" content={META_DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={CANONICAL} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16 flex flex-col gap-7 md:gap-9">
        <header className="ch-rise">
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">
            <span>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</span>
            {live.length > 0 && (
              <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[12px] font-semibold text-red-600 dark:text-red-400">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                {live.length} live now
              </span>
            )}
          </div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3.25rem] text-[color:var(--ch-text)]">
            Scores &amp; results
          </h1>
          <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)] max-w-2xl">
            Every game live, what's on over the next week, and the last 24 hours of results.
          </p>
        </header>

        {data && data.leagues.length > 1 && (
          <nav aria-label="Filter by league" className="-mx-4 px-4 md:mx-0 md:px-0 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[{ slug: "", name: "All leagues" }, ...data.leagues].map((l) => {
              const active = activeLeague === l.slug;
              return (
                <button
                  key={l.slug || "all"}
                  onClick={() => selectLeague(l.slug)}
                  data-active={active}
                  aria-pressed={active}
                  className="ch-chip shrink-0 whitespace-nowrap h-9 px-4 text-[13px]"
                >
                  {l.name}
                </button>
              );
            })}
          </nav>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="ch-skel h-[104px] rounded-2xl" />
            ))}
          </div>
        )}

        {isError && !data && (
          <div className="ch-card p-8 text-center text-sm text-[color:var(--ch-text-2)]">
            Scores couldn't load. They'll retry automatically.
          </div>
        )}

        {live.length > 0 && (
          <Section title="Live now" live meta={`${live.length} ${live.length === 1 ? "game" : "games"}`}>
            {live.map((g) => <ScoreGameCard key={g.game_key} game={g} kind="live" />)}
          </Section>
        )}

        {upcomingDays.length > 0 && (
          <section className="flex flex-col gap-4" aria-label="Coming up">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.5rem] md:text-[1.75rem] text-[color:var(--ch-text)]">
                Coming up
              </h2>
              <span className="text-xs font-medium text-[color:var(--ch-muted)]">
                {upcoming.length} {upcoming.length === 1 ? "game" : "games"} · next 7 days
              </span>
            </div>
            {upcomingDays.map((day) => (
              <div key={day.date} className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[color:var(--ch-text)]">{dayLabel(day.date, day.isToday)}</h3>
                  <span className="text-xs text-[color:var(--ch-muted)]">
                    {day.games.length} {day.games.length === 1 ? "game" : "games"}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {day.games.map((g) => <ScoreGameCard key={g.game_key} game={g} kind="upcoming" />)}
                </div>
              </div>
            ))}
          </section>
        )}

        {results.length > 0 && (
          <Section title="Results" meta="Last 24 hours">
            {results.map((g) => <ScoreGameCard key={g.game_key} game={g} kind="result" />)}
          </Section>
        )}

        {nothingOn && !isError && (
          <div className="ch-card flex flex-col items-center text-center gap-2 py-14 px-6">
            <CalendarClock className="w-9 h-9 text-[color:var(--ch-accent)]" />
            <p className="font-semibold text-[color:var(--ch-text)]">No games scheduled right now</p>
            <p className="text-sm text-[color:var(--ch-text-2)]">New fixtures appear here as soon as they're published.</p>
          </div>
        )}
      </main>
    </div>
  );
}
