import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Loader2 } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import PhotographerRow from "@/components/media/PhotographerRow";
import { usePhotographerDirectory } from "@/lib/mediaSpotlight";

const SITE_URL = "https://swishassistant.com";

/**
 * /media/photographers — every photographer, one row each, with a strip of
 * their work. Filter by the teams they cover.
 */
export default function PhotographersDirectoryPage() {
  const { data, isLoading, error } = usePhotographerDirectory();
  const [team, setTeam] = useState<string | null>(null);

  const teams = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data?.photographers ?? []) for (const t of p.teams) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([t]) => t);
  }, [data]);

  const shown = useMemo(() => (data?.photographers ?? []).filter((p) => !team || p.teams.includes(team)), [data, team]);

  const canonical = `${SITE_URL}/media/photographers`;
  const description = "Photographers covering British basketball, with their work, the teams they shoot and how to get in touch.";

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Photographers | Media Spotlight | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="Photographers | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-6 md:pt-9">
        <header className="ch-rise">
          <Link href="/media" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Media Spotlight
          </Link>
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Directory</div>
          <h1 className="ch-display mt-1.5 text-[2.5rem] font-bold uppercase leading-[0.92] tracking-tight text-[color:var(--ch-text)] md:text-[4rem]">The photographers</h1>
          <p className="mt-3 max-w-2xl text-[15px] text-[color:var(--ch-text-2)] md:text-lg">
            The people capturing the game, and where to find more of their work.
          </p>
        </header>

        {teams.length > 1 && (
          <div className="mt-7 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by team">
            {[null, ...teams].map((t) => {
              const active = t === team;
              return (
                <button
                  key={t ?? "all"}
                  type="button"
                  onClick={() => setTeam(t)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "border-[color:var(--ch-accent)] bg-[color:var(--ch-accent)] text-white"
                      : "border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
                  }`}
                >
                  {t ?? "All teams"}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-6">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>
          ) : error ? (
            <p className="py-10 text-sm text-[color:var(--ch-text-2)]">Couldn't load the photographers right now. {String((error as Error).message)}</p>
          ) : shown.length === 0 ? (
            <div className="py-14 text-center text-[15px] text-[color:var(--ch-text-2)]">
              {team ? `No photographers cover ${team} yet.` : "No photographers yet."}{" "}
              <Link href="/media#get-involved" className="font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4">Are you one?</Link>
            </div>
          ) : (
            shown.map((p, i) => <PhotographerRow key={p.id} photographer={p} photos={data!.strips.get(p.id) ?? []} delay={Math.min(i, 4) * 60} />)
          )}
        </div>
      </main>
    </div>
  );
}
