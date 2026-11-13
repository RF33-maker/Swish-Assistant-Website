import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { teamPath } from "@shared/seo";
import { clubDisplayName } from "@shared/teamIdentity";
import { prefersReducedMotion } from "@/components/home/motion";

/** Shapes of /api/leagues/:brandId/all-time (server/allTimeLeaders.ts), as the History page reads them. */

export type StatKey = "pts" | "reb" | "ast" | "stl" | "blk" | "tpm";

export type SeasonLeader = { key: string; name: string; href: string | null; team: string | null; value: number; gp: number };

export type TeamRecord = { team: string; wins: number; losses: number };

export type SeasonSummary = {
  season: string;
  competition: string;
  competitionSlug: string;
  games: number;
  minGames: number;
  leaders: Record<StatKey, SeasonLeader[]>;
  bestRecord: TeamRecord | null;
  standings?: TeamRecord[];
  perTeamGame?: { pts: number; tpm: number; tpa: number; ast: number } | null;
  high?: { key: string; name: string; href: string | null; value: number; team: string | null; gameKey: string; competitionSlug: string } | null;
};

export type GameRecord = {
  key: string;
  name: string;
  href: string | null;
  value: number;
  team: string | null;
  opponent: string | null;
  date: string | null;
  competition: string;
  competitionSlug: string;
  gameKey: string;
  line?: Record<StatKey, number>;
};

export type Career = {
  key: string;
  name: string;
  href: string | null;
  photo: string | null;
  teams: string[];
  first: string | null;
  last: string | null;
  seasons: number;
  gp: number;
  pts: number; reb: number; ast: number; stl: number; blk: number; tpm: number;
};

export type HistoryData = {
  competitions: number;
  games: number;
  players?: number;
  firstSeason: string | null;
  lastSeason: string | null;
  careers: Career[];
  records: Record<StatKey, GameRecord[]>;
  seasons: SeasonSummary[];
  logos?: Record<string, string>;
};

export const STATS: Array<{ key: StatKey; label: string; unit: string; short: string }> = [
  { key: "pts", label: "Points", unit: "ppg", short: "PTS" },
  { key: "reb", label: "Rebounds", unit: "rpg", short: "REB" },
  { key: "ast", label: "Assists", unit: "apg", short: "AST" },
  { key: "stl", label: "Steals", unit: "spg", short: "STL" },
  { key: "blk", label: "Blocks", unit: "bpg", short: "BLK" },
  { key: "tpm", label: "3-pointers", unit: "per game", short: "3PM" },
];

export const formatDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// "Solent Kestrels Senior Men" → "Solent Kestrels"; in a women's league the "Women" is implied.
export function teamLabel(name: string | null, gender: string): string {
  if (!name) return "";
  const shown = clubDisplayName(name);
  return gender === "Women" ? shown.replace(/\s+Women$/i, "") : shown;
}

export const seasonStart = (label: string) => Number(label.slice(0, 4));
/** "2018/19" → "18/19". */
export const seasonShort = (label: string) => label.replace(/^20(\d{2})/, "$1");
export const seasonFromStart = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, "0")}`;

/** A season runs August to June, so the one that started last autumn is still being played. */
export function isInProgress(label: string, now = new Date()): boolean {
  const start = seasonStart(label);
  if (!Number.isFinite(start)) return false;
  return now >= new Date(Date.UTC(start, 7, 1)) && now < new Date(Date.UTC(start + 1, 6, 1));
}

/** "BBL Championship 2018-19" → "BBL Championship": the name a league went by, without the year. */
export function eraName(competition: string): string {
  return competition
    .replace(/\s*\b(20)?\d{2}\s*[-/]\s*(20)?\d{2}\b\s*$/, "")
    .replace(/^Women's SLB\b/i, "SLB Women")
    .trim();
}

export function TeamLink({ name, competitionSlug, gender, className = "" }: { name: string | null; competitionSlug: string; gender: string; className?: string }) {
  if (!name) return null;
  const href = teamPath(name, competitionSlug);
  const label = teamLabel(name, gender);
  return href ? <Link href={href} className={`hover:underline ${className}`}>{label}</Link> : <span className={className}>{label}</span>;
}

export function PlayerLink({ name, href, className = "" }: { name: string; href: string | null; className?: string }) {
  return href ? <Link href={href} className={`${className} hover:underline`}>{name}</Link> : <span className={className}>{name}</span>;
}

/**
 * A club's logo, or its initials when there is none on file (clubs that have folded).
 * An old name wears the logo of the club it became.
 */
export function ClubMark({ name, logos, size, className = "" }: { name: string | null; logos?: Record<string, string>; size: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = name && !broken ? logos?.[name] : undefined;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        onError={() => setBroken(true)}
        // Same lift as the league landscape: dark marks (London Lions) need an edge on a dark page.
        className={`shrink-0 object-contain [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.35))] dark:[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.45))_drop-shadow(0_0_6px_rgba(255,255,255,0.2))] ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = clubDisplayName(name || "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={`shrink-0 inline-flex items-center justify-center rounded-[22%] border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface-2)] font-semibold text-[color:var(--ch-text-2)] ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
    >
      {initials || "?"}
    </span>
  );
}

/** Counts up to `value` once, quickly; reduced motion shows the number straight away. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return; }
    let frame = 0;
    const startAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startAt) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A hidden tab pauses animation frames; never leave the number short.
    const settle = window.setTimeout(() => setShown(value), duration + 400);
    return () => { cancelAnimationFrame(frame); window.clearTimeout(settle); };
  }, [value, duration]);
  return <>{shown.toLocaleString("en-GB")}</>;
}

export function SectionHeading({ id, eyebrow, title, note, aside }: { id: string; eyebrow: string; title: string; note?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">{eyebrow}</div>
        <h2 id={id} className="mt-1 ch-display font-bold tracking-tight leading-[0.95] text-[1.9rem] md:text-[2.25rem] text-[color:var(--ch-text)]">
          {title}
        </h2>
        {note && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[color:var(--ch-text-2)]">{note}</p>}
      </div>
      {aside}
    </div>
  );
}
