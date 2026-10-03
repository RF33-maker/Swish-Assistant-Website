import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { TeamLogo } from "@/components/TeamLogo";
import ShareableCard from "@/components/ShareableCard";
import TiltCard from "@/components/cards/TiltCard";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { generateTradingCardBlob, type TradingCardPalette } from "@/lib/generateTradingCard";
import { useIsDarkMode } from "@/hooks/useReadableColor";
import { relativeLuminance } from "@/lib/colorContrast";

/** One game's stat line, as the trading card shows it. */
export interface TradingCardPerformance {
  playerId: string;
  playerName: string;
  teamName: string | null;
  /** The league the team plays in — used to find the team's colour and logo. */
  leagueId: string | null;
  leagueName?: string | null;
  leagueLogo?: string | null;
  gameDate: string | null;
  opponentName?: string | null;
  /** e.g. "W 89-66". */
  gameResult?: string | null;
  gameScore: number | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fgm?: number | null;
  fga?: number | null;
  tpm?: number | null;
  tpa?: number | null;
  ftm?: number | null;
  fta?: number | null;
  /** True shooting, 0–1. */
  tsPct: number | null;
  /** The background-removed photo; `profilePhotoUrl` is the ordinary one. */
  cutoutUrl?: string | null;
  profilePhotoUrl?: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The card's full date, "26 Sep 2026" (shown uppercase). Spelled out rather
 * than locale-formatted so it reads the same everywhere, canvas included.
 */
export function formatFullCardDate(s: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** A stat on the card: value over label, sized relative to the card. */
function CardStat({ label, value, big = false }: { label: string; value: string | number; big?: boolean }) {
  return (
    <div className="flex flex-col items-center min-w-0">
      <span
        className={`tabular-nums leading-none text-[color:var(--ch-text)] ${big ? "ch-display font-bold text-[max(16px,7.2cqw)]" : "font-semibold text-[max(10px,4.3cqw)]"}`}
      >
        {value}
      </span>
      <span className={`mt-[1.2cqw] uppercase tracking-[0.1em] text-[color:var(--ch-muted)] ${big ? "text-[max(8.5px,2.9cqw)]" : "text-[max(8px,2.6cqw)]"}`}>
        {label}
      </span>
    </div>
  );
}

/** A shooting split: makes/attempts over the label and percentage. */
function ShotStat({ label, attLabel, made, att }: { label: string; attLabel: string; made?: number | null; att?: number | null }) {
  const known = made != null && att != null;
  const pct = known && att > 0 ? Math.round((made / att) * 100) : null;
  return (
    <div className="flex flex-col items-center min-w-0">
      <span className="tabular-nums leading-none font-semibold text-[max(10.5px,4.4cqw)] text-[color:var(--ch-text)] whitespace-nowrap">
        {known ? (
          <>{made}<span className="text-[color:var(--ch-muted)] font-normal">/</span>{att}</>
        ) : (
          att ?? "—"
        )}
      </span>
      <span className="mt-[1.2cqw] uppercase tracking-[0.1em] text-[max(8px,2.6cqw)] text-[color:var(--ch-muted)] whitespace-nowrap">
        {known || att == null ? label : attLabel}
        {pct !== null && <span className="text-[color:var(--ch-text-2)] font-semibold"> {pct}%</span>}
      </span>
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

/**
 * One performance as a basketball trading card: a team-coloured photo panel
 * (team logo watermark, league badge, result, Game Score) over the player's
 * name, matchup, the box score and FG/3PT/FT shooting splits. Its download is
 * the same card drawn on a canvas (generateTradingCard).
 *
 * The card takes its size from the --fan-card-w / --fan-card-h variables
 * (.fan-layout or .tc-sizes in index.css) and scales everything inside with
 * container units.
 */
export default function TradingCard({
  perf,
  shareTitle = "Top Performance",
  onOpen,
  tilt = true,
}: {
  perf: TradingCardPerformance;
  /** Title of the share dialog. */
  shareTitle?: string;
  /** Makes the card a keyboard-activatable link. */
  onOpen?: () => void;
  /** Lean with the phone / mouse (see TiltCard). Off rests it flat. */
  tilt?: boolean;
}) {
  const isDark = useIsDarkMode();
  const articleRef = useRef<HTMLElement>(null);

  // Photo, best first: the cut-out, then the profile photo (in a circle),
  // then initials. A file that fails to load drops to the next one.
  const [cutoutFailed, setCutoutFailed] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  useEffect(() => {
    setCutoutFailed(false);
    setProfileFailed(false);
  }, [perf.cutoutUrl, perf.profilePhotoUrl]);
  const cutoutUrl = cutoutFailed ? null : perf.cutoutUrl || null;
  const profilePhotoUrl = profileFailed ? null : perf.profilePhotoUrl || null;
  const photoUrl = cutoutUrl || profilePhotoUrl;

  const [leagueLogoFailed, setLeagueLogoFailed] = useState(false);
  useEffect(() => setLeagueLogoFailed(false), [perf.leagueLogo]);
  const leagueLogoUrl = leagueLogoFailed ? null : perf.leagueLogo || null;
  const leagueName = perf.leagueName || undefined;
  const fullDate = formatFullCardDate(perf.gameDate);

  const { primaryColor } = useTeamBranding({
    teamName: perf.teamName || "",
    leagueId: perf.leagueId || "",
    enabled: !!(perf.teamName && perf.leagueId),
  });

  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTeamLogoUrl(null);
    if (!perf.teamName || !perf.leagueId) return;
    void getTeamLogoCached({ leagueId: perf.leagueId, teamName: perf.teamName }).then((url) => {
      if (!cancelled) setTeamLogoUrl(url);
    });
    return () => { cancelled = true; };
  }, [perf.teamName, perf.leagueId]);

  const tsPct = useMemo(
    () => (perf.tsPct !== null && perf.tsPct !== undefined ? `${(Number(perf.tsPct) * 100).toFixed(1)}` : "—"),
    [perf.tsPct],
  );

  const won = perf.gameResult?.startsWith("W");
  const lost = perf.gameResult?.startsWith("L");
  const team = primaryColor || "rgb(249, 115, 22)";
  // The team logo sits in the colour as a tone-on-tone watermark: knocked
  // out light on dark team colours, pressed in dark on light ones. Both
  // blends also drop a logo's white background.
  const darkTeam = relativeLuminance(team) < 0.18;
  const watermarkStyle: CSSProperties = darkTeam
    ? { filter: "grayscale(1) invert(1)", mixBlendMode: "screen", opacity: 0.2 }
    : { filter: "grayscale(1) contrast(1.15)", mixBlendMode: "multiply", opacity: 0.32 };

  // The download is this same card, drawn on a canvas from the same values
  // and the card's live colour tokens.
  const generateCardBlob = () => {
    const styles = articleRef.current ? getComputedStyle(articleRef.current) : null;
    const token = (name: string) => styles?.getPropertyValue(name).trim() || undefined;
    const palette: Partial<TradingCardPalette> = {
      surface: token("--ch-surface"),
      surface2: token("--ch-surface-2"),
      border: token("--ch-border"),
      text: token("--ch-text"),
      text2: token("--ch-text-2"),
      muted: token("--ch-muted"),
    };
    return generateTradingCardBlob({
      playerName: perf.playerName,
      teamName: perf.teamName,
      cardDate: fullDate,
      teamColor: team,
      teamLogoUrl,
      cutoutUrl,
      profilePhotoUrl,
      leagueName,
      leagueLogoUrl,
      gameResult: perf.gameResult,
      gameScore: perf.gameScore,
      opponentName: perf.opponentName,
      pts: perf.pts,
      reb: perf.reb,
      ast: perf.ast,
      stl: perf.stl,
      blk: perf.blk,
      tov: perf.tov,
      fgm: perf.fgm,
      fga: perf.fga,
      tpm: perf.tpm,
      tpa: perf.tpa,
      ftm: perf.ftm,
      fta: perf.fta,
      tsPct,
      isDark,
      palette,
    });
  };

  return (
    <TiltCard enabled={tilt}>
      <ShareableCard
        title={shareTitle}
        fileSlug={`${perf.playerId}-${perf.gameDate}`}
        player={{
          name: perf.playerName,
          team: perf.teamName || leagueName || "",
          photoUrl,
          primaryColor,
          teamLogoUrl,
        }}
        shareCaption={leagueName ? `${leagueName} • ${fullDate}` : fullDate}
        generateCardBlob={generateCardBlob}
        // The image is drawn by generateCardBlob, so ShareableCard's hidden
        // html2canvas copy of the card isn't needed.
        shareContent={<></>}
      >
        <article
          ref={articleRef}
          role={onOpen ? "link" : undefined}
          tabIndex={onOpen ? 0 : -1}
          aria-label={`${perf.playerName}: ${perf.pts ?? 0} points, ${perf.reb ?? 0} rebounds, ${perf.ast ?? 0} assists`}
          onKeyDown={onOpen ? (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
          } : undefined}
          className="relative flex flex-col overflow-hidden rounded-[18px] bg-[color:var(--ch-surface)] ring-1 ring-black/[0.06] dark:ring-white/10 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          style={{
            height: "var(--fan-card-h)",
            containerType: "inline-size",
            boxShadow: "0 24px 48px -22px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.08)",
          }}
          data-testid="trading-card"
        >
          {/* Photo panel in the team's colour */}
          <div
            className="relative shrink-0 overflow-hidden"
            style={{
              height: "47%",
              background: `radial-gradient(90% 80% at 50% 12%, color-mix(in srgb, ${team} 70%, #fff) 0%, ${team} 45%, color-mix(in srgb, ${team} 45%, #000) 100%)`,
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full opacity-[0.16]" fill="none" stroke="white" strokeWidth="0.6">
              <circle cx="50" cy="-4" r="30" />
              <path d="M 18 0 V 22 A 32 32 0 0 0 82 22 V 0" />
              <rect x="38" y="0" width="24" height="30" />
            </svg>
            {teamLogoUrl && (
              <img
                src={teamLogoUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                onError={() => setTeamLogoUrl(null)}
                className="pointer-events-none absolute left-1/2 top-[54%] h-[112%] w-auto max-w-[94%] -translate-x-1/2 -translate-y-1/2 object-contain"
                style={watermarkStyle}
                data-testid="trading-card-team-watermark"
              />
            )}
            {cutoutUrl ? (
              <img
                src={cutoutUrl}
                alt=""
                draggable={false}
                onError={() => setCutoutFailed(true)}
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[94%] w-auto max-w-none object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)]"
              />
            ) : profilePhotoUrl ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-[44cqw] w-[44cqw] rounded-full p-[1.1cqw] bg-white/30 shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)]">
                  <img
                    src={profilePhotoUrl}
                    alt=""
                    draggable={false}
                    onError={() => setProfileFailed(true)}
                    className="h-full w-full rounded-full object-cover object-[50%_22%] bg-white/20"
                  />
                </span>
              </span>
            ) : (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="h-[40cqw] w-[40cqw] rounded-full bg-white/15 ring-1 ring-white/30 flex items-center justify-center ch-display font-bold text-white text-[15cqw]">
                  {initials(perf.playerName)}
                </span>
              </span>
            )}
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20" />
            {(leagueLogoUrl || leagueName || fullDate) && (
              // The card's "set line": competition and date, like a collectable.
              // Stops short of the top-right corner, where the download button sits.
              <span className="absolute left-[4.5cqw] top-[4.5cqw] right-[max(48px,17cqw)] flex items-center gap-[2cqw] min-w-0">
                {leagueLogoUrl && (
                  <img
                    src={leagueLogoUrl}
                    alt=""
                    draggable={false}
                    onError={() => setLeagueLogoFailed(true)}
                    className="shrink-0 h-[max(20px,8.5cqw)] w-[max(20px,8.5cqw)] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                    data-testid="trading-card-league-logo"
                  />
                )}
                <span className="min-w-0 flex flex-col [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                  {leagueName && (
                    <span className="truncate leading-tight text-[max(9px,3.1cqw)] font-semibold uppercase tracking-[0.12em] text-white/90">
                      {leagueName}
                    </span>
                  )}
                  {fullDate && (
                    <time
                      dateTime={perf.gameDate || undefined}
                      className="truncate leading-tight text-[max(8px,2.7cqw)] font-semibold uppercase tracking-[0.14em] text-white/70 tabular-nums"
                      data-testid="trading-card-date"
                    >
                      {fullDate}
                    </time>
                  )}
                </span>
              </span>
            )}
            {perf.gameResult && (
              <span
                className="absolute left-[5cqw] bottom-[4.5cqw] rounded-md px-[2.2cqw] py-[0.9cqw] text-[max(10px,3.5cqw)] font-bold text-white tabular-nums"
                style={{ backgroundColor: won ? "#16a34a" : lost ? "#e11d48" : "rgba(0,0,0,0.45)" }}
              >
                {perf.gameResult}
              </span>
            )}
            <span className="absolute right-[5cqw] bottom-[4cqw] text-right text-white">
              <span className="block ch-display font-bold leading-none text-[max(18px,9.5cqw)] tabular-nums">{perf.gameScore ?? 0}</span>
              <span className="block mt-[0.8cqw] text-[max(8px,2.7cqw)] font-semibold uppercase tracking-[0.14em] text-white/80">GmSc</span>
            </span>
          </div>

          {/* Name, matchup and the stat line */}
          <div className="flex-1 min-h-0 flex flex-col px-[5.5cqw] pt-[3.6cqw] pb-[4.2cqw]">
            <h3 className="ch-display uppercase font-bold leading-[0.95] tracking-tight text-[max(15px,7.4cqw)] text-[color:var(--ch-text)] line-clamp-2">
              {perf.playerName}
            </h3>
            <div className="mt-[1.8cqw] flex items-center gap-[1.8cqw] min-w-0 text-[max(10px,3.5cqw)] text-[color:var(--ch-text-2)]">
              {perf.teamName && (
                <>
                  <TeamLogo teamName={perf.teamName} leagueId={perf.leagueId || ""} size="xs" className="!w-[max(14px,4.8cqw)] !h-[max(14px,4.8cqw)] shrink-0" />
                  <span className="sr-only">{perf.teamName}</span>
                </>
              )}
              {perf.opponentName ? (
                <span className="truncate"><span aria-hidden="true">vs </span>{perf.opponentName}</span>
              ) : perf.teamName ? (
                <span className="truncate" aria-hidden="true">{perf.teamName}</span>
              ) : null}
            </div>

            <div className="mt-auto">
              <div className="grid grid-cols-3 gap-x-[2cqw] border-t border-[color:var(--ch-border)] pt-[3cqw]">
                <CardStat label="PTS" value={perf.pts ?? 0} big />
                <CardStat label="REB" value={perf.reb ?? 0} big />
                <CardStat label="AST" value={perf.ast ?? 0} big />
              </div>
              {/* Shooting: makes/attempts for field goals, threes and free throws */}
              <div className="grid grid-cols-3 gap-x-[1.5cqw] mt-[2.6cqw] rounded-[2.4cqw] bg-[color:var(--ch-surface-2)] ring-1 ring-inset ring-[color:var(--ch-border)] py-[1.9cqw]">
                <ShotStat label="FG" attLabel="FGA" made={perf.fgm} att={perf.fga} />
                <ShotStat label="3PT" attLabel="3PA" made={perf.tpm} att={perf.tpa} />
                <ShotStat label="FT" attLabel="FTA" made={perf.ftm} att={perf.fta} />
              </div>
              <div className="grid grid-cols-4 gap-x-[1cqw] mt-[2.4cqw]">
                <CardStat label="STL" value={perf.stl ?? 0} />
                <CardStat label="BLK" value={perf.blk ?? 0} />
                <CardStat label="TOV" value={perf.tov ?? 0} />
                <CardStat label="TS%" value={tsPct} />
              </div>
            </div>
          </div>
        </article>
      </ShareableCard>
    </TiltCard>
  );
}
