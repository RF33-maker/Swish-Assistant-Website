import type { ReactNode } from "react";
import EntityLink from "@/components/EntityLink";
import {
  Crown, Medal, Swords, Shield, Target, Flame, TrendingDown, Trophy, History, Zap, Crosshair, Layers, Activity,
  type LucideIcon,
} from "lucide-react";
import type { Storyline } from "@/lib/gameStorylines";
import type { MatchupColors } from "./GameScoreHero";

/**
 * The upcoming game's storylines: league accolades in play, as cards. The
 * strongest leads, larger and washed in that team's colour.
 */

const MEDAL: Record<number, { bg: string; fg: string }> = {
  1: { bg: "linear-gradient(135deg, #fde68a, #f59e0b)", fg: "#422006" },
  2: { bg: "linear-gradient(135deg, #f1f5f9, #94a3b8)", fg: "#1e293b" },
  3: { bg: "linear-gradient(135deg, #fed7aa, #c2410c)", fg: "#431407" },
};

function iconFor(s: Storyline): LucideIcon {
  if (s.kind === "player") return s.rank === 1 ? Crown : Medal;
  if (s.kind === "matchup") return Swords;
  if (s.kind === "standings") return Trophy;
  if (s.kind === "h2h") return History;
  if (s.kind === "form") return s.id.includes("skid") ? TrendingDown : Flame;
  if (s.id.includes("-off-")) return Target;
  if (s.id.includes("-def-")) return Shield;
  if (s.id.includes("-pace-")) return Zap;
  if (s.id.includes("-3p-")) return Crosshair;
  if (s.id.includes("-reb-")) return Layers;
  return Activity;
}

function RankChip({ rank }: { rank?: number }) {
  if (!rank || rank > 3) return null;
  const m = MEDAL[rank];
  return (
    <span
      className="inline-flex h-6 items-center rounded-full px-2 text-[10.5px] font-bold uppercase tracking-[0.08em] shadow-sm ring-1 ring-black/10"
      style={{ background: m.bg, color: m.fg }}
    >
      No.{rank}
    </span>
  );
}

export default function GameStorylines({
  storylines, loading, colors, playerLink, seasonNote,
}: {
  storylines: Storyline[];
  loading?: boolean;
  colors: MatchupColors;
  /** Wraps a player's name in a link to their profile, when one is known. */
  playerLink?: (s: Storyline, children: ReactNode) => ReactNode;
  /** e.g. "Ranks from last season" when the current one hasn't started. */
  seasonNote?: string | null;
}) {
  if (loading) {
    return (
      <section className="mt-4" aria-busy="true">
        <div className="ch-skel mb-3 h-4 w-28" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div className="ch-skel h-[132px] md:col-span-2 !rounded-[14px]" />
          {[0, 1, 2, 3].map((i) => <div key={i} className="ch-skel h-[112px] !rounded-[14px]" />)}
        </div>
      </section>
    );
  }
  if (!storylines.length) return null;

  const accent = (s: Storyline) =>
    s.side === "home" ? colors.home : s.side === "away" ? colors.away : null;
  const accentBar = (s: Storyline) =>
    s.side === "both"
      ? `linear-gradient(180deg, ${colors.home}, ${colors.away})`
      : accent(s)!;
  const tint = (s: Storyline, pct: number) =>
    s.side === "both"
      ? `linear-gradient(110deg, color-mix(in srgb, ${colors.homeFill} ${pct}%, var(--ch-surface)) 0%, var(--ch-surface) 50%, color-mix(in srgb, ${colors.awayFill} ${pct}%, var(--ch-surface)) 100%)`
      : `linear-gradient(110deg, color-mix(in srgb, ${s.side === "home" ? colors.homeFill : colors.awayFill} ${pct}%, var(--ch-surface)) 0%, var(--ch-surface) 65%)`;

  const headlineWithLink = (s: Storyline) => {
    if (!s.player || !playerLink) return s.headline;
    const i = s.headline.indexOf(s.player.name);
    if (i < 0) return s.headline;
    return (
      <>
        {s.headline.slice(0, i)}
        {playerLink(s, s.player.name)}
        {s.headline.slice(i + s.player.name.length)}
      </>
    );
  };

  return (
    <section className="mt-5" aria-labelledby="storylines-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 id="storylines-heading" className="ch-display text-[1.5rem] md:text-[1.75rem] font-bold uppercase leading-none tracking-tight text-[color:var(--ch-text)]">
          Storylines
        </h2>
        {seasonNote && <span className="text-xs font-medium text-[color:var(--ch-muted)]">{seasonNote}</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {storylines.map((s, i) => {
          const Icon = iconFor(s);
          const lead = i === 0;
          const color = accent(s);
          return (
            <article
              key={s.id}
              className={`ch-card ch-rise relative overflow-hidden ${lead ? "md:col-span-2 p-5 md:p-6" : "p-4"}`}
              style={{ background: tint(s, lead ? 26 : 10), animationDelay: `${i * 50}ms` }}
              data-testid="storyline"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accentBar(s) }} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex shrink-0 items-center justify-center rounded-lg ${lead ? "h-9 w-9" : "h-8 w-8"}`}
                    style={{
                      background: color ? `color-mix(in srgb, ${color} 16%, transparent)` : "var(--ch-surface-3)",
                      color: color ?? "var(--ch-text)",
                    }}
                  >
                    <Icon className={lead ? "h-[18px] w-[18px]" : "h-4 w-4"} />
                  </span>
                  <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.12em]" style={{ color: color ?? "var(--ch-text-2)" }}>
                    {s.eyebrow}
                  </span>
                </div>
                <RankChip rank={s.rank} />
              </div>
              <h3 className={`mt-3 text-[color:var(--ch-text)] [text-wrap:balance] ${lead ? "ch-display text-[1.6rem] md:text-[2rem] font-bold uppercase leading-[0.98] tracking-tight" : "text-[15px] font-semibold leading-snug"}`}>
                {headlineWithLink(s)}
              </h3>
              <p className={`mt-1.5 text-[color:var(--ch-text-2)] ${lead ? "text-sm" : "text-[13px]"}`}>{s.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Wraps a name in a real link (with an optional in-page click handler), styled for storyline headlines. */
export function StorylinePlayerLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls = "underline decoration-[color:var(--ch-border-strong)] decoration-2 underline-offset-[3px] hover:decoration-current";
  if (!href) return <>{children}</>;
  return <EntityLink href={href} onNavigate={onClick} className={cls}>{children}</EntityLink>;
}
