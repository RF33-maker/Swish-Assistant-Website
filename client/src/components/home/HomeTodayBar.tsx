import { Link } from "wouter";
import { ArrowRight, Trophy } from "lucide-react";
import { useScores } from "@/lib/scores";
import { useNavLeagues } from "@/lib/navLeagues";
import HomeSearch from "@/components/home/HomeSearch";

/**
 * The top of the homepage: a compact "today" bar rather than a marketing
 * hero, so the scores, leagues and news underneath are what a visitor sees
 * first. Today's date and a live-games badge, a search-first box
 * (StatMuse-style) and one-tap shortcuts to every league in the nav.
 */
export default function HomeTodayBar() {
  const { data: scores } = useScores();
  const { data: leagues = [] } = useNavLeagues();
  const liveCount = scores?.live.length ?? 0;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div data-story="top" className="relative w-full max-w-7xl mx-auto px-5 md:px-8 pt-6 md:pt-9 pb-6 md:pb-8">

      <div className="ch-rise flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">
        <span>{today}</span>
        {liveCount > 0 && (
          <Link href="/scores" className="inline-flex items-center gap-1.5 normal-case tracking-normal text-[12px] font-semibold text-red-600 dark:text-red-400 hover:underline underline-offset-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            {liveCount} live now
          </Link>
        )}
      </div>
      <h1 className="ch-rise ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3.25rem] mt-1.5 text-center text-[color:var(--ch-text)]" style={{ animationDelay: "80ms" }}>
        Today on SwishAssistant
        <span className="sr-only"> — basketball stats, league insights and AI-powered scouting</span>
      </h1>

      {/* relative z-30: keeps the suggestion list above the chips and
          scores below, despite the entrance animation's stacking context. */}
      {/* data-story-search: the scroll story measures this box — the balls
          land on its top edge and it's what morphs into the hoop. The extra
          top margin is the shelf the resting balls sit on, clear of the
          headline. */}
      <div data-story-search className="ch-search-in relative z-30 mt-10 md:mt-14 max-w-3xl mx-auto">
        <HomeSearch />
      </div>

      {leagues.length > 0 && (
        <nav aria-label="Leagues" className="ch-rise mt-4 -mx-5 px-5 md:mx-0 md:px-0 overflow-x-auto scrollbar-hide" style={{ animationDelay: "240ms" }}>
          {/* Centred while the chips fit; scrolls from the left edge once they don't. */}
          <div className="flex items-center gap-2 w-max mx-auto">
            {leagues.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className="ch-dribble-on-hover inline-flex items-center gap-2 h-9 pl-1.5 pr-3.5 rounded-full border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] hover:border-[color:var(--ch-border-strong)] text-[13px] font-medium text-[color:var(--ch-text)] whitespace-nowrap transition-colors"
              >
                <span className="ch-dribble-target h-6 w-6 rounded-full bg-white ring-1 ring-black/5 overflow-hidden flex items-center justify-center shrink-0">
                  {l.logoUrl
                    ? <img src={l.logoUrl} alt="" className="h-full w-full object-contain" />
                    : <Trophy className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />}
                </span>
                {l.label}
              </Link>
            ))}
            <Link
              href="/scores"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-2 whitespace-nowrap"
            >
              All scores <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}
