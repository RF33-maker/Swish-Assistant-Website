import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import ScoreGameCard from "@/components/scores/ScoreGameCard";
import { dayLabel, useScores, type ScoreGame } from "@/lib/scores";

/**
 * Homepage "Scores" block: at most two games and one clear way into /scores.
 *
 * Deliberately small. The homepage is the site's most-visited page and is
 * already long, so this answers "what's on?" at a glance — live games first,
 * otherwise the next tip-offs, otherwise the latest results — and hands off to
 * the full page for everything else. The button always states the total, so
 * the cap is never silent the way the ticker's is.
 */

const MAX_CARDS = 2;

export default function ScoresBlock() {
  const { data, isLoading } = useScores();

  const live = data?.live ?? [];
  const upcoming = data?.upcoming.games ?? [];
  const results = data?.results ?? [];
  const total = live.length + upcoming.length + results.length;

  const picks: Array<{ game: ScoreGame; kind: "live" | "upcoming" | "result" }> = [
    ...live.map((game) => ({ game, kind: "live" as const })),
    ...upcoming.map((game) => ({ game, kind: "upcoming" as const })),
    ...(live.length + upcoming.length === 0 ? results.map((game) => ({ game, kind: "result" as const })) : []),
  ].slice(0, MAX_CARDS);

  // Nothing scheduled anywhere: leave the homepage as it was rather than
  // showing an empty box.
  if (!isLoading && picks.length === 0) return null;

  const meta = live.length > 0
    ? `${live.length} live now`
    : upcoming.length > 0
      ? `Next up · ${dayLabel(data?.upcoming.date ?? null, data?.upcoming.isToday)}`
      : "Latest results";

  return (
    <section className="py-10 md:py-14 bg-white dark:bg-neutral-950">
      <div className="max-w-xl mx-auto px-4 md:px-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Scores</h2>
          {!isLoading && (
            <span className={`text-xs md:text-sm font-medium ${live.length > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-neutral-400"}`}>
              {meta}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {isLoading
            ? [0, 1].map((i) => (
                <div key={i} className="h-[104px] rounded-2xl bg-slate-100 dark:bg-neutral-900 animate-pulse" />
              ))
            : picks.map(({ game, kind }) => <ScoreGameCard key={game.game_key} game={game} kind={kind} />)}
        </div>

        <Link
          href="/scores"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-orange-300 dark:border-orange-500/40 py-3 text-sm font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-neutral-900 transition"
        >
          {total > MAX_CARDS ? `See all ${total} games` : "See all scores"}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </section>
  );
}
