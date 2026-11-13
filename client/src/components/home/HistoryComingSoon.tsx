import { Link } from "wouter";
import { ArrowRight, Landmark } from "lucide-react";
import SectionHeader from "@/components/home/SectionHeader";
import { Reveal } from "@/components/home/motion";

/**
 * Homepage link to the British basketball history page (/british-basketball-history):
 * season leaders, single-game records and career boards for every league on file.
 */
export default function HistoryComingSoon() {
  return (
    <section className="py-12 md:py-16" aria-labelledby="history-heading">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <SectionHeader
          id="history-heading"
          eyebrow="History"
          title="British basketball history"
          description="Every season on file, league by league, so British basketball history is never lost."
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
              Each season's leaders, the best single games and whole careers added up, from the WBBL in 2014/15 to today.
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ch-accent)]">
              Explore
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
