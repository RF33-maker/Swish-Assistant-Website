import { Gem, Layers } from "lucide-react";
import type { Accolade, AccoladeTier } from "@/lib/accolades";
import { accoladeCardText, accoladeTierStyle } from "@/lib/accoladeCards";
import AccoladeCard, { type AccoladeCardPlayer } from "@/components/cards/AccoladeCard";

const TIER_ORDER: Record<AccoladeTier, number> = { diamond: 0, platinum: 1, gold: 2, silver: 3, bronze: 4, star: 5 };

/** Most prestigious first; newest first within a tier. */
export function orderCollection(accolades: Accolade[]) {
  return [...accolades].sort((a, b) =>
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    || new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
  );
}

type CompetitionInfo = Record<string, { name: string | null; logo: string | null } | undefined>;

interface Holder {
  key: string;
  eyebrow: string;
  title: string;
  logo: string | null;
  cards: { accolade: Accolade; number: number }[];
}

/**
 * A player's accolades as a collection of cards: one holder per season (like
 * a page in a binder), with all-time records in their own holder first.
 * Numbered across the whole collection, most prestigious first.
 */
export function AccoladeCollection({
  accolades,
  player,
  seasonOrder,
  competitions,
}: {
  accolades: Accolade[];
  player: AccoladeCardPlayer;
  /** Season labels, newest first; the first is the current season. */
  seasonOrder: string[];
  competitions: CompetitionInfo;
}) {
  const ordered = orderCollection(accolades);
  const total = ordered.length;

  if (total === 0) {
    return (
      <div className="ch-card overflow-hidden">
        <div className="acc-binder p-6 md:p-8 flex flex-col sm:flex-row items-center gap-6">
          <div className="tc-sizes shrink-0">
            <div
              className="rounded-[18px] border-2 border-dashed border-[color:var(--ch-border-strong)] flex items-center justify-center"
              style={{ width: "calc(var(--fan-card-w) * 0.62)", height: "calc(var(--fan-card-h) * 0.62)" }}
            >
              <Layers className="h-8 w-8 text-[color:var(--ch-muted)]" aria-hidden="true" />
            </div>
          </div>
          <div className="text-center sm:text-left max-w-md">
            <h3 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.5rem] text-[color:var(--ch-text)]">No cards yet</h3>
            <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">
              Season records, league-leader finishes and career-best seasons are collected here as cards.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const numbered = ordered.map((accolade, i) => ({ accolade, number: i + 1 }));
  const holders: Holder[] = [];
  const allTime = numbered.filter((c) => c.accolade.seasonLabel === "All-time");
  if (allTime.length > 0) {
    const leagueId = allTime[0].accolade.leagueId;
    holders.push({
      key: "all-time",
      eyebrow: "All-time records",
      title: (leagueId && competitions[leagueId]?.name) || "All-time",
      logo: (leagueId && competitions[leagueId]?.logo) || null,
      cards: allTime,
    });
  }
  const bySeason = new Map<string, typeof numbered>();
  for (const c of numbered) {
    if (c.accolade.seasonLabel === "All-time") continue;
    const label = c.accolade.seasonLabel || "This season";
    if (!bySeason.has(label)) bySeason.set(label, []);
    bySeason.get(label)!.push(c);
  }
  const rank = (label: string) => {
    const i = seasonOrder.indexOf(label);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  for (const [label, cards] of Array.from(bySeason.entries()).sort((a, b) => rank(a[0]) - rank(b[0]))) {
    const leagueId = cards[0].accolade.leagueId;
    holders.push({
      key: label,
      eyebrow: rank(label) === 0 ? "This season" : "Season",
      title: label,
      logo: (leagueId && competitions[leagueId]?.logo) || null,
      cards,
    });
  }

  return (
    <div className="space-y-5" data-testid="accolade-collection">
      {holders.map((holder) => (
        <section key={holder.key} className="ch-card overflow-hidden" aria-label={`${holder.eyebrow}: ${holder.title}`}>
          <header className="flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 border-b border-[color:var(--ch-border)]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 bg-[color:var(--ch-surface-3)] overflow-hidden">
                {holder.logo
                  ? <img src={holder.logo} alt="" className="h-7 w-7 object-contain" />
                  : <Gem className="h-4 w-4 text-[color:var(--ch-muted)]" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <div className="ch-eyebrow">{holder.eyebrow}</div>
                <h3 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.25rem] md:text-[1.4rem] mt-0.5 text-[color:var(--ch-text)] truncate">
                  {holder.title}
                </h3>
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-[color:var(--ch-muted)]">
              {holder.cards.length} card{holder.cards.length === 1 ? "" : "s"}
            </span>
          </header>
          {/* The binder page: swipe through on phones, rows on wider screens */}
          <div className="acc-binder tc-sizes px-4 md:px-5 pt-5">
            <div className="flex gap-4 md:gap-5 overflow-x-auto md:overflow-visible md:flex-wrap snap-x snap-mandatory scrollbar-hide -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 md:scroll-px-0 pb-7">
              {holder.cards.map(({ accolade, number }) => (
                <div key={`${number}-${accolade.label}`} className="acc-sleeve snap-start shrink-0" style={{ width: "var(--fan-card-w)" }}>
                  <AccoladeCard
                    accolade={accolade}
                    player={player}
                    number={number}
                    total={total}
                    competitionName={accolade.leagueId ? competitions[accolade.leagueId]?.name : null}
                    competitionLogo={accolade.leagueId ? competitions[accolade.leagueId]?.logo : null}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

/** A few of the collection's best cards as chips, e.g. on the Overview tab. */
export function AccoladeChips({
  accolades,
  teamColor,
  readableTeamColor,
  onOpen,
  max = 3,
}: {
  accolades: Accolade[];
  teamColor: string;
  readableTeamColor: string;
  onOpen: () => void;
  max?: number;
}) {
  const top = orderCollection(accolades).slice(0, max);
  return (
    <div className="flex flex-col gap-2">
      {top.map((a, i) => {
        const style = accoladeTierStyle(a.tier, teamColor, readableTeamColor);
        const text = accoladeCardText(a);
        return (
          <button
            key={i}
            type="button"
            onClick={onOpen}
            className="group flex items-center gap-3 rounded-xl p-2 pr-3 text-left border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] hover:border-[color:var(--ch-border-strong)] transition-colors"
          >
            <span
              className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ch-display font-bold text-[15px] tabular-nums shadow-[0_4px_10px_-4px_rgba(0,0,0,0.4)]"
              style={{ background: `linear-gradient(135deg, ${style.foil.join(", ")})`, color: style.base[1] }}
              aria-hidden="true"
            >
              {text.headline.length <= 4 ? text.headline : "★"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-[color:var(--ch-text)]">
                {text.kicker}{text.unit ? ` · ${text.unit}` : ""}
              </span>
              <span className="block truncate text-xs text-[color:var(--ch-muted)]">{a.seasonLabel}</span>
            </span>
            <span className="text-xs font-semibold text-[color:var(--ch-text-2)] group-hover:text-[color:var(--ch-text)] transition-colors">View</span>
          </button>
        );
      })}
    </div>
  );
}
