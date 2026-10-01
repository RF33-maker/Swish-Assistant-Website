import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { TeamLogo } from "@/components/TeamLogo";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { useIsDarkMode } from "@/hooks/useReadableColor";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { getTeamAbbreviation } from "@/lib/teamUtils";
import { ensureContrast, normalizeHex, readableTextColor, relativeLuminance } from "@/lib/colorContrast";

/**
 * The game page's scorebug: each team's colour fills its own side and the two
 * meet in the middle behind the score, like a broadcast graphic. Shared by the
 * league page's inline game view, the standalone /game page and the upcoming
 * game preview so a game looks the same however you reach it.
 */

// Teams whose colour we can't find get a neutral slate rather than the site's
// default orange, so an unbranded side doesn't look like a branded one.
const NEUTRAL_HOME = "#334155";
const NEUTRAL_AWAY = "#1e293b";

function rgbDistance(a: string, b: string) {
  const pa = parseInt(normalizeHex(a).slice(1), 16);
  const pb = parseInt(normalizeHex(b).slice(1), 16);
  const dr = ((pa >> 16) & 0xff) - ((pb >> 16) & 0xff);
  const dg = ((pa >> 8) & 0xff) - ((pb >> 8) & 0xff);
  const db = (pa & 0xff) - (pb & 0xff);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export interface MatchupColors {
  /** Background fills for the hero; white text stays readable on them. */
  homeFill: string;
  awayFill: string;
  /** Team colours readable on the page surface (bars, highlights). Kept
   *  distinguishable from each other even when both teams wear similar colours. */
  home: string;
  away: string;
  loaded: boolean;
}

export function useMatchupColors(homeTeam: string, awayTeam: string, leagueId?: string | null): MatchupColors {
  const isDark = useIsDarkMode();
  const enabled = !!leagueId;
  const homeBrand = useTeamBranding({ teamName: homeTeam, leagueId: leagueId || "", enabled: enabled && !!homeTeam });
  const awayBrand = useTeamBranding({ teamName: awayTeam, leagueId: leagueId || "", enabled: enabled && !!awayTeam });
  const homeRaw = homeBrand.colors?.primary ?? null;
  const awayRaw = awayBrand.colors?.primary ?? null;
  const homeSecondary = homeBrand.colors?.secondary ?? null;
  const awaySecondary = awayBrand.colors?.secondary ?? null;

  return useMemo(() => {
    const homeFill = ensureContrast(homeRaw || NEUTRAL_HOME, "#ffffff", 3);
    const awayFill = ensureContrast(awayRaw || NEUTRAL_AWAY, "#ffffff", 3);
    // On the dark theme a navy or black team colour has to be lightened so far
    // it turns grey; their secondary colour (often a gold or white) reads as
    // the team far better there.
    const accentSource = (primary: string | null, secondary: string | null, fallback: string) => {
      if (!primary) return fallback;
      if (isDark && secondary && relativeLuminance(primary) < 0.05 && relativeLuminance(secondary) > 0.15) return secondary;
      return primary;
    };
    const home = readableTextColor(accentSource(homeRaw, homeSecondary, "#64748b"), isDark, 3);
    let away = readableTextColor(accentSource(awayRaw, awaySecondary, "#94a3b8"), isDark, 3);
    // Two reds side by side can't be told apart in a split bar: give the away
    // side its secondary colour, or a neutral, when the primaries clash.
    if (rgbDistance(home, away) < 70) {
      const alt = awaySecondary ? readableTextColor(awaySecondary, isDark, 3) : null;
      away = alt && rgbDistance(home, alt) >= 70 ? alt : isDark ? "#94a3b8" : "#64748b";
    }
    return {
      homeFill,
      awayFill,
      home,
      away,
      loaded: !homeBrand.isLoading && !awayBrand.isLoading,
    };
  }, [homeRaw, awayRaw, homeSecondary, awaySecondary, isDark, homeBrand.isLoading, awayBrand.isLoading]);
}

export type GameHeroState = "final" | "live" | "upcoming" | "pending";

interface GameScoreHeroProps {
  leagueId?: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore?: number | null;
  awayScore?: number | null;
  state: GameHeroState;
  /** e.g. "Q3 · 4:12" while live. */
  liveLabel?: string | null;
  /** Replaces the score, e.g. a countdown before tip-off. */
  center?: ReactNode;
  /** Small line under each team name, e.g. the record. */
  homeSub?: ReactNode;
  awaySub?: ReactNode;
  /** Anything under each team, e.g. recent form. */
  homeExtra?: ReactNode;
  awayExtra?: ReactNode;
  homeHref?: string;
  awayHref?: string;
  /** Date, time, venue… along the bottom. */
  meta?: { icon: ReactNode; label: ReactNode }[];
  /** Extra chips beside the status (e.g. TEST MODE). */
  badges?: ReactNode;
  /** Anything under the meta row (e.g. "Updated 20s ago"). */
  footer?: ReactNode;
  colors?: MatchupColors;
}

function StatusChip({ state, liveLabel }: { state: GameHeroState; liveLabel?: string | null }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] backdrop-blur-md";
  if (state === "live") {
    return (
      <span className={`${base} bg-red-600/90 text-white shadow-[0_0_0_4px_rgba(220,38,38,0.25)]`}>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        Live{liveLabel ? <span className="font-semibold tabular-nums tracking-normal normal-case">· {liveLabel}</span> : null}
      </span>
    );
  }
  const label = state === "final" ? "Final" : state === "upcoming" ? "Upcoming" : "Awaiting result";
  return <span className={`${base} bg-black/30 text-white ring-1 ring-white/20`}>{label}</span>;
}

function TeamSide({
  name, leagueId, sub, extra, href, side,
}: { name: string; leagueId?: string | null; sub?: ReactNode; extra?: ReactNode; href?: string; side: "home" | "away" }) {
  const label = (
    <>
      <span className="ch-display hidden sm:block uppercase font-bold leading-[0.95] tracking-tight text-white text-[1.35rem] md:text-[1.9rem] [text-wrap:balance] drop-shadow-sm">
        {name}
      </span>
      <span className="ch-display sm:hidden uppercase font-bold leading-none text-white text-[1.35rem] drop-shadow-sm">
        {getTeamAbbreviation(name)}
      </span>
    </>
  );
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <div className="mb-2.5 md:mb-3 flex h-14 w-14 md:h-[88px] md:w-[88px] items-center justify-center rounded-2xl bg-white p-1.5 md:p-2.5 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] ring-1 ring-black/5">
        {leagueId
          ? <TeamLogo teamName={name} leagueId={leagueId} size="xl" className="!h-full !w-full !rounded-xl" />
          : <span className="ch-display text-xl md:text-3xl font-bold text-slate-700">{getTeamAbbreviation(name)}</span>}
      </div>
      {href ? <Link href={href} className="min-w-0 max-w-full hover:underline decoration-white/50 underline-offset-4">{label}</Link> : label}
      <span className="mt-1 text-[10.5px] md:text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
        {side === "home" ? "Home" : "Away"}
        {sub ? <span className="font-medium normal-case tracking-normal text-white/80"> · {sub}</span> : null}
      </span>
      {extra ? <div className="mt-2">{extra}</div> : null}
    </div>
  );
}

/** The team logo, huge and faint, bleeding off the edge of its half. */
function Watermark({ teamName, leagueId, side }: { teamName: string; leagueId?: string | null; side: "home" | "away" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!teamName || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName }).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [teamName, leagueId]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      className={`pointer-events-none absolute top-1/2 h-[150%] w-auto max-w-none -translate-y-1/2 select-none ${side === "home" ? "-left-[12%] md:-left-[6%]" : "-right-[12%] md:-right-[6%]"}`}
      style={{ filter: "grayscale(1) invert(1)", mixBlendMode: "screen", opacity: 0.1 }}
      onError={() => setUrl(null)}
    />
  );
}

export default function GameScoreHero({
  leagueId, homeTeam, awayTeam, homeScore, awayScore, state, liveLabel, center,
  homeSub, awaySub, homeExtra, awayExtra, homeHref, awayHref, meta, badges, footer, colors: providedColors,
}: GameScoreHeroProps) {
  const ownColors = useMatchupColors(homeTeam, awayTeam, providedColors ? null : leagueId);
  const colors = providedColors ?? ownColors;

  const hasScore = homeScore != null && awayScore != null && state !== "upcoming";
  const decided = state === "final" && hasScore && homeScore !== awayScore;
  const homeLost = decided && (homeScore as number) < (awayScore as number);
  const awayLost = decided && (awayScore as number) < (homeScore as number);

  // Each side in its own colour, meeting in the middle; a soft dark centre
  // keeps the score crisp however bright the two colours are.
  const background = [
    "radial-gradient(55% 120% at 50% 50%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.18) 45%, transparent 75%)",
    `linear-gradient(100deg, ${colors.homeFill} 0%, ${colors.homeFill} 26%, ${colors.awayFill} 74%, ${colors.awayFill} 100%)`,
  ].join(", ");
  const lightTeams = relativeLuminance(colors.homeFill) > 0.12 && relativeLuminance(colors.awayFill) > 0.12;

  const scoreClass = "ch-display font-bold leading-none tabular-nums text-white text-[3.25rem] sm:text-[4.5rem] md:text-[6rem] transition-opacity";

  return (
    <section
      className="ch-hero ch-rise text-white"
      style={{ background, transition: "background 0.5s ease" }}
      aria-label={`${homeTeam} vs ${awayTeam}`}
      data-testid="game-score-hero"
    >
      <Watermark teamName={homeTeam} leagueId={leagueId} side="home" />
      <Watermark teamName={awayTeam} leagueId={leagueId} side="away" />
      {/* Darkens two bright colours a touch more so the meta row stays readable. */}
      {lightTeams && <div aria-hidden="true" className="absolute inset-0 bg-black/15" />}

      <div className="relative px-4 pb-4 pt-5 sm:px-6 md:px-10 md:pt-7 md:pb-5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <StatusChip state={state} liveLabel={liveLabel} />
          {badges}
        </div>

        {/* A wide centre (a countdown) takes its own row under the teams on a
            phone instead of squeezing them; a score fits between them. */}
        <div className={`mt-4 md:mt-5 grid items-center gap-2 sm:gap-6 md:gap-10 ${center ? "grid-cols-2 gap-y-4 sm:grid-cols-[1fr_auto_1fr]" : "grid-cols-[1fr_auto_1fr]"}`}>
          <TeamSide name={homeTeam} leagueId={leagueId} sub={homeSub} extra={homeExtra} href={homeHref} side="home" />

          <div className={`flex flex-col items-center ${center ? "col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" : ""}`}>
            {center ?? (hasScore ? (
              <div className="flex items-center gap-2.5 sm:gap-4 md:gap-6">
                <span className={scoreClass} style={{ opacity: homeLost ? 0.55 : 1 }} data-testid="home-score">{homeScore}</span>
                <span aria-hidden="true" className="h-8 sm:h-12 md:h-16 w-px bg-white/30" />
                <span className={scoreClass} style={{ opacity: awayLost ? 0.55 : 1 }} data-testid="away-score">{awayScore}</span>
              </div>
            ) : (
              <span className="ch-display font-bold uppercase leading-none text-white/90 text-[2.25rem] md:text-[3.5rem]">VS</span>
            ))}
          </div>

          <TeamSide name={awayTeam} leagueId={leagueId} sub={awaySub} extra={awayExtra} href={awayHref} side="away" />
        </div>

        {meta && meta.length > 0 && (
          <div className="mt-5 md:mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 border-t border-white/15 pt-3.5 text-xs md:text-sm text-white/85">
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-80">
                {m.icon}
                {m.label}
              </span>
            ))}
          </div>
        )}
        {footer && <div className="mt-2 flex justify-center text-[11px] text-white/70">{footer}</div>}
      </div>
    </section>
  );
}

/**
 * One stat, home vs away: the two numbers either side of the label and a
 * split bar in each team's colour. The leader's number is emphasised.
 */
export function StatCompareRow({
  label, home, away, homeDisplay, awayDisplay, colors, lowerIsBetter = false,
}: {
  label: string;
  home: number;
  away: number;
  homeDisplay?: ReactNode;
  awayDisplay?: ReactNode;
  colors: Pick<MatchupColors, "home" | "away">;
  lowerIsBetter?: boolean;
}) {
  const total = home + away;
  const homePct = total > 0 ? (home / total) * 100 : 50;
  const homeLeads = lowerIsBetter ? home < away : home > away;
  const awayLeads = lowerIsBetter ? away < home : away > home;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className={`ch-num text-sm md:text-[15px] ${homeLeads ? "font-bold text-[color:var(--ch-text)]" : "font-medium text-[color:var(--ch-text-2)]"}`}>
          {homeDisplay ?? home}
        </span>
        <span className="ch-eyebrow !text-[10.5px]">{label}</span>
        <span className={`ch-num text-sm md:text-[15px] ${awayLeads ? "font-bold text-[color:var(--ch-text)]" : "font-medium text-[color:var(--ch-text-2)]"}`}>
          {awayDisplay ?? away}
        </span>
      </div>
      <div className="flex h-2 gap-[3px]" role="presentation">
        <div className="h-full rounded-l-full transition-[width] duration-700" style={{ width: `${homePct}%`, backgroundColor: colors.home, opacity: homeLeads || !awayLeads ? 1 : 0.45 }} />
        <div className="h-full flex-1 rounded-r-full transition-[width] duration-700" style={{ backgroundColor: colors.away, opacity: awayLeads || !homeLeads ? 1 : 0.45 }} />
      </div>
    </div>
  );
}
