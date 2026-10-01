import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CalendarClock } from "lucide-react";
import ScoreGameCard from "@/components/scores/ScoreGameCard";
import { dayLabel, useScores } from "@/lib/scores";
import { Reveal } from "@/components/home/motion";

/**
 * Homepage scores panel — the first real content on the page. Live, upcoming
 * and the last 24 hours of results as three tabs with counts, opening on
 * whichever has games (live first). Shows a handful of games and hands off to
 * /scores for the rest; the button always states the total, so the cap is
 * never silent.
 */

const MAX_CARDS = 6;
type Tab = "live" | "upcoming" | "results";

export default function ScoresBlock() {
  const { data, isLoading } = useScores();

  const live = data?.live ?? [];
  const upcoming = data?.upcoming.games ?? [];
  const results = data?.results ?? [];
  const total = live.length + upcoming.length + results.length;

  const defaultTab: Tab = live.length > 0 ? "live" : upcoming.length > 0 ? "upcoming" : "results";
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [chosen, setChosen] = useState(false);
  // Follow the data until the visitor picks a tab themselves — so a game
  // going live mid-visit brings the Live tab forward, but never yanks them
  // off a tab they chose.
  useEffect(() => {
    if (!chosen) setTab(defaultTab);
  }, [defaultTab, chosen]);

  const games = tab === "live" ? live : tab === "upcoming" ? upcoming : results;
  const kind = tab === "live" ? "live" : tab === "upcoming" ? "upcoming" : "result";

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "live", label: "Live", count: live.length },
    { id: "upcoming", label: "Upcoming", count: upcoming.length },
    { id: "results", label: "Results", count: results.length },
  ];

  const subline =
    tab === "upcoming" && upcoming.length > 0
      ? `Next up · ${dayLabel(data?.upcoming.date ?? null, data?.upcoming.isToday)}`
      : tab === "results"
        ? "Last 24 hours"
        : tab === "live" && live.length > 0
          ? "In progress now"
          : null;

  return (
    <section className="ch-card overflow-hidden ch-rise" style={{ animationDelay: "300ms" }} aria-labelledby="scores-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-5 pt-4 md:pt-5">
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 id="scores-heading" className="ch-display uppercase font-bold tracking-tight text-[1.6rem] md:text-[1.85rem] leading-none text-[color:var(--ch-text)]">
            Scores
          </h2>
          {subline && !isLoading && <span className="text-xs text-[color:var(--ch-muted)] truncate">{subline}</span>}
        </div>
        <div className="ch-seg" role="tablist" aria-label="Scores">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              data-active={tab === t.id}
              onClick={() => { setTab(t.id); setChosen(true); }}
              className="inline-flex items-center gap-1.5 px-3 h-8 text-xs font-semibold"
            >
              {t.id === "live" && t.count > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
              {t.label}
              {!isLoading && <span className="tabular-nums text-[color:var(--ch-muted)]">{t.count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-5">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className={`ch-skel h-[104px] rounded-2xl ${i >= 4 ? "hidden lg:block" : ""}`} />)}
          </div>
        ) : games.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-10 rounded-xl border border-dashed border-[color:var(--ch-border-strong)]">
            <CalendarClock className="h-6 w-6 text-[color:var(--ch-muted)] mb-2" />
            <p className="text-sm font-medium text-[color:var(--ch-text)]">
              {tab === "live" ? "No games live right now" : tab === "upcoming" ? "Nothing scheduled yet" : "No results in the last 24 hours"}
            </p>
            <p className="text-xs text-[color:var(--ch-text-2)] mt-1">
              {tab === "live" && upcoming.length > 0 ? "Check the upcoming tab for the next tip-offs." : "The full scores page has every game."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {games.slice(0, MAX_CARDS).map((game, i) => (
              <Reveal key={`${tab}-${game.game_key}`} delay={i * 60}>
                <ScoreGameCard game={game} kind={kind} />
              </Reveal>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/scores"
        className="flex items-center justify-center gap-2 border-t border-[color:var(--ch-border)] py-3.5 text-sm font-semibold text-[color:var(--ch-accent)] hover:bg-[color:var(--ch-surface-2)] transition-colors"
      >
        {total > 0 ? `See all ${total} games` : "See all scores"}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </section>
  );
}
