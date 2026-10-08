import { Link } from "wouter";
import { ArrowRight, Landmark } from "lucide-react";
import SectionHeader from "@/components/home/SectionHeader";
import { Reveal } from "@/components/home/motion";

/**
 * Homepage teaser for the British basketball history archive. A placeholder
 * until the archive itself ships; it points at /british-basketball-history.
 */
export default function HistoryComingSoon() {
  return (
    <section className="py-12 md:py-16" aria-labelledby="history-heading">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <SectionHeader
          id="history-heading"
          eyebrow="Coming soon"
          title="British basketball history"
          description="British basketball history is important. It is coming soon to Swish Assistant so it is never lost."
        />
        <Reveal>
          <Link
            href="/british-basketball-history"
            data-testid="home-history-link"
            className="group flex items-center gap-4 rounded-2xl border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] px-5 py-5 md:px-7 md:py-6 transition-colors hover:border-[color:var(--ch-accent)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-[color:var(--ch-accent)]">
              <Landmark className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="flex-1 text-sm md:text-[15px] text-[color:var(--ch-text-2)]">
              Seasons, players and careers from across the British game, kept in one place.
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ch-accent)]">
              Find out more
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
