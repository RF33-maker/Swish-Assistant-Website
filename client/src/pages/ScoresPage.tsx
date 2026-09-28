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
 * (see /api/scores): results stay for 24 hours, and "coming up" rolls forward
 * to the next day with games, so the page is never empty midweek and never
 * asks the visitor to work out which day to look at.
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

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        {meta && <span className="text-xs text-slate-500 dark:text-neutral-400">{meta}</span>}
      </div>
      {children}
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
  const results = useMemo(() => pick(data?.results), [data, activeLeague]);
  const nothingOn = !isLoading && live.length === 0 && upcoming.length === 0 && results.length === 0;

  const selectLeague = (slug: string) => {
    setLocation(slug ? `/scores?league=${encodeURIComponent(slug)}` : "/scores", { replace: true });
  };

  return (
    <div className={`${SITE_RAIL_OFFSET} min-h-screen bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100`}>
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

      <main className="max-w-xl mx-auto px-4 pt-4 pb-16 flex flex-col gap-6">
        {data && data.leagues.length > 1 && (
          <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {[{ slug: "", name: "All" }, ...data.leagues].map((l) => {
              const active = activeLeague === l.slug;
              return (
                <button
                  key={l.slug || "all"}
                  onClick={() => selectLeague(l.slug)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium border transition ${
                    active
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-300"
                  }`}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[104px] rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 animate-pulse" />
            ))}
          </div>
        )}

        {isError && !data && (
          <p className="text-center text-sm text-slate-500 dark:text-neutral-400 py-12">
            Scores couldn't load. They'll retry automatically.
          </p>
        )}

        {live.length > 0 && (
          <Section title="Live now" meta={`${live.length} ${live.length === 1 ? "game" : "games"}`}>
            {live.map((g) => <ScoreGameCard key={g.game_key} game={g} kind="live" />)}
          </Section>
        )}

        {upcoming.length > 0 && (
          <Section title="Coming up" meta={dayLabel(data?.upcoming.date ?? null, data?.upcoming.isToday)}>
            {upcoming.map((g) => <ScoreGameCard key={g.game_key} game={g} kind="upcoming" />)}
          </Section>
        )}

        {results.length > 0 && (
          <Section title="Results" meta="Last 24 hours">
            {results.map((g) => <ScoreGameCard key={g.game_key} game={g} kind="result" />)}
          </Section>
        )}

        {nothingOn && !isError && (
          <div className="flex flex-col items-center text-center gap-2 py-16">
            <CalendarClock className="w-10 h-10 text-orange-400" />
            <p className="font-semibold">No games scheduled right now</p>
            <p className="text-sm text-slate-500 dark:text-neutral-400">New fixtures appear here as soon as they're published.</p>
          </div>
        )}
      </main>
    </div>
  );
}
