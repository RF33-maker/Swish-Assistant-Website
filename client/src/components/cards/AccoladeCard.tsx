import { useEffect, useRef, useState } from "react";
import ShareableCard from "@/components/ShareableCard";
import { useIsDarkMode, useReadableTeamColor } from "@/hooks/useReadableColor";
import type { Accolade } from "@/lib/accolades";
import { accoladeCardText, accoladeSetLine, accoladeTierStyle } from "@/lib/accoladeCards";
import { generateAccoladeCardBlob } from "@/lib/generateAccoladeCard";
import type { TradingCardPalette } from "@/lib/generateTradingCard";

/** Emblem shapes (24×24), shared with the canvas download. */
export const EMBLEM_PATHS = {
  gem: ["M6 3h12l4 6-10 13L2 9Z", "M11 3 8 9l4 13 4-13-3-6", "M2 9h20"],
  sparkle: ["M12 2.5 14.3 9.7 21.5 12 14.3 14.3 12 21.5 9.7 14.3 2.5 12 9.7 9.7Z"],
  star: ["M12 2.5 14.9 8.6 21.5 9.4 16.6 13.9 17.9 20.5 12 17.2 6.1 20.5 7.4 13.9 2.5 9.4 9.1 8.6Z"],
} as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fullDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("");
}

/** The tier's emblem: a gem, a sparkle, a star, or the medal's place number. */
function Emblem({ accolade, color }: { accolade: Accolade; color: string }) {
  const place = accolade.value?.replace("#", "");
  if (accolade.tier === "gold" || accolade.tier === "silver" || accolade.tier === "bronze") {
    return <span className="ch-display font-bold leading-none text-[5.6cqw]" style={{ color }}>{place}</span>;
  }
  const paths = accolade.tier === "diamond" ? EMBLEM_PATHS.gem : accolade.tier === "platinum" ? EMBLEM_PATHS.sparkle : EMBLEM_PATHS.star;
  const filled = accolade.tier !== "diamond";
  return (
    <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" aria-hidden="true" fill={filled ? color : "none"} stroke={color} strokeWidth={filled ? 0 : 1.8} strokeLinejoin="round" strokeLinecap="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

export interface AccoladeCardPlayer {
  id: string;
  name: string;
  cutoutUrl?: string | null;
  profilePhotoUrl?: string | null;
  /** Team colour, for "Career best" cards. */
  teamColor: string;
}

/**
 * One accolade as a collectible card, in the trading cards' format: a foil
 * frame in the tier's finish, the player on the art, a stamp ("Record
 * holder", "1st place"), the big number, and a collector number. Tapping it
 * flips it over to the details; members can download the front.
 */
export default function AccoladeCard({
  accolade,
  player,
  number,
  total,
  competitionName,
  competitionLogo,
}: {
  accolade: Accolade;
  player: AccoladeCardPlayer;
  /** Its place in the player's collection, most prestigious first. */
  number: number;
  total: number;
  competitionName?: string | null;
  competitionLogo?: string | null;
}) {
  const isDark = useIsDarkMode();
  const readableTeam = useReadableTeamColor(player.teamColor);
  const style = accoladeTierStyle(accolade.tier, player.teamColor, readableTeam.body);
  const text = accoladeCardText(accolade);
  const set = accoladeSetLine(accolade, competitionName);
  const ink = isDark ? style.ink.dark : style.ink.light;
  const stampColor = style.foil[0];
  const collectorNo = `No. ${String(number).padStart(2, "0")}/${String(total).padStart(2, "0")}`;
  const foil = `linear-gradient(135deg, ${style.foil.join(", ")})`;
  const base = `radial-gradient(85% 75% at 50% 30%, ${style.base[0]} 0%, ${style.base[1]} 100%)`;

  const [flipped, setFlipped] = useState(false);
  const frontRef = useRef<HTMLElement>(null);

  const [cutoutFailed, setCutoutFailed] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  useEffect(() => {
    setCutoutFailed(false);
    setProfileFailed(false);
  }, [player.cutoutUrl, player.profilePhotoUrl]);
  const cutoutUrl = cutoutFailed ? null : player.cutoutUrl || null;
  const profilePhotoUrl = profileFailed ? null : player.profilePhotoUrl || null;

  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [competitionLogo]);
  const logoUrl = logoFailed ? null : competitionLogo || null;

  const generateCardBlob = () => {
    const styles = frontRef.current ? getComputedStyle(frontRef.current) : null;
    const token = (name: string) => styles?.getPropertyValue(name).trim() || undefined;
    const palette: Partial<TradingCardPalette> = {
      surface: token("--ch-surface"),
      border: token("--ch-border"),
      text: token("--ch-text"),
      text2: token("--ch-text-2"),
      muted: token("--ch-muted"),
    };
    return generateAccoladeCardBlob({
      accolade,
      playerName: player.name,
      cutoutUrl,
      profilePhotoUrl,
      teamColor: player.teamColor,
      readableTeamColor: readableTeam.body,
      competitionName: set.title,
      competitionLogoUrl: logoUrl,
      collectorNo,
      isDark,
      palette,
    });
  };

  const toggle = () => setFlipped((f) => !f);

  return (
    <ShareableCard
      title={`${text.kicker} card`}
      fileSlug={`${player.id}-accolade-${number}`}
      player={{ name: player.name, team: set.title, photoUrl: cutoutUrl || profilePhotoUrl }}
      shareCaption={`${text.kicker} · ${set.title}`}
      generateCardBlob={generateCardBlob}
      shareContent={<></>}
    >
      <div
        className="acc-flip select-none cursor-pointer rounded-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ch-bg)]"
        style={{ height: "var(--fan-card-h)" }}
        data-flipped={flipped}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`${text.kicker}: ${text.headline} ${text.unit}. ${flipped ? "Showing details; press to flip back" : "Press to see details"}`}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
        }}
        data-testid="accolade-card"
      >
        <div className="acc-flip-inner">
          {/* Front */}
          <article
            ref={frontRef}
            className="acc-face acc-foil rounded-[18px] overflow-hidden"
            style={{ background: foil, backgroundSize: "200% 200%", containerType: "inline-size", boxShadow: "0 24px 48px -22px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.08)" }}
            aria-hidden={flipped}
          >
            <div className="absolute inset-[1.4cqw] rounded-[14px] overflow-hidden flex flex-col bg-[color:var(--ch-surface)]">
              {/* Art */}
              <div className="relative shrink-0 overflow-hidden" style={{ height: "54%", background: base }}>
                <svg aria-hidden="true" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full opacity-[0.12]" fill="none" stroke="white" strokeWidth="0.6">
                  <circle cx="50" cy="-4" r="30" />
                  <path d="M 18 0 V 22 A 32 32 0 0 0 82 22 V 0" />
                  <rect x="38" y="0" width="24" height="30" />
                </svg>
                {cutoutUrl ? (
                  <img
                    src={cutoutUrl}
                    alt=""
                    draggable={false}
                    onError={() => setCutoutFailed(true)}
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[92%] w-auto max-w-none object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.45)]"
                  />
                ) : profilePhotoUrl ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-[46cqw] w-[46cqw] rounded-full p-[1.1cqw] shadow-[0_14px_30px_-10px_rgba(0,0,0,0.7)]" style={{ background: foil }}>
                      <img
                        src={profilePhotoUrl}
                        alt=""
                        draggable={false}
                        onError={() => setProfileFailed(true)}
                        className="h-full w-full rounded-full object-cover object-[50%_22%] bg-black/20"
                      />
                    </span>
                  </span>
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="h-[40cqw] w-[40cqw] rounded-full bg-white/10 ring-1 ring-white/25 flex items-center justify-center ch-display font-bold text-white text-[15cqw]">
                      {initials(player.name)}
                    </span>
                  </span>
                )}
                {/* A slow foil sheen across the art */}
                <div aria-hidden="true" className="acc-sheen absolute inset-0" />
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/25" />

                <span className="absolute left-[4.5cqw] top-[4.5cqw] right-[max(48px,17cqw)] flex items-center gap-[2cqw] min-w-0 [text-shadow:0_1px_2px_rgba(0,0,0,0.4)]">
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt=""
                      draggable={false}
                      onError={() => setLogoFailed(true)}
                      className="shrink-0 h-[max(20px,8.5cqw)] w-[max(20px,8.5cqw)] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                    />
                  )}
                  <span className="min-w-0 flex flex-col">
                    <span className="truncate leading-tight text-[max(9px,3.1cqw)] font-semibold uppercase tracking-[0.12em] text-white/90">{set.title}</span>
                    <span className="truncate leading-tight text-[max(8px,2.7cqw)] font-semibold uppercase tracking-[0.14em]" style={{ color: stampColor }}>{set.tier}</span>
                  </span>
                </span>

                <span
                  className="absolute left-[4.5cqw] bottom-[5cqw] -rotate-[7deg] origin-left rounded-[1.4cqw] border-[length:max(1.5px,0.6cqw)] px-[2.4cqw] py-[1cqw] text-[max(9px,3.2cqw)] font-extrabold uppercase tracking-[0.16em] whitespace-nowrap bg-black/35"
                  style={{ color: stampColor, borderColor: stampColor }}
                >
                  {text.stamp}
                </span>
                <span
                  className="absolute right-[4.5cqw] bottom-[4.5cqw] h-[12cqw] w-[12cqw] rounded-full flex items-center justify-center shadow-[0_6px_14px_-4px_rgba(0,0,0,0.6)] ring-1 ring-black/10"
                  style={{ background: foil }}
                  aria-hidden="true"
                >
                  <Emblem accolade={accolade} color={style.base[1]} />
                </span>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 flex flex-col px-[5cqw] pt-[3.2cqw] pb-[3.4cqw]">
                <div className="truncate text-[max(8.5px,2.9cqw)] font-bold uppercase tracking-[0.14em]" style={{ color: ink }}>
                  {text.kicker}
                </div>
                <div className="flex items-baseline gap-[1.6cqw] mt-[0.6cqw] min-w-0">
                  <span className="ch-display font-bold leading-none tabular-nums text-[max(28px,13.5cqw)]" style={{ color: ink }}>
                    {text.headline}
                  </span>
                  {text.unit && (
                    <span className="ch-display font-bold uppercase leading-none text-[max(12px,5.4cqw)] text-[color:var(--ch-text)] truncate">
                      {text.unit}
                    </span>
                  )}
                </div>
                <div className="mt-[1cqw] truncate text-[max(9px,3.2cqw)] text-[color:var(--ch-text-2)]">{text.sub}</div>
                <div className="mt-auto pt-[2.6cqw] border-t border-[color:var(--ch-border)]">
                  <div className="truncate ch-display uppercase font-bold leading-[0.95] tracking-tight text-[max(14px,6.4cqw)] text-[color:var(--ch-text)]">
                    {player.name}
                  </div>
                  <div className="mt-[1.4cqw] flex items-center justify-between gap-[2cqw] text-[max(8px,2.6cqw)] font-semibold uppercase tracking-[0.12em] text-[color:var(--ch-muted)]">
                    <span className="truncate">{text.footer}</span>
                    <span className="shrink-0 tabular-nums">{collectorNo}</span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* Back: the details */}
          <div
            className="acc-face acc-face-back acc-foil rounded-[18px] overflow-hidden"
            style={{ background: foil, backgroundSize: "200% 200%", containerType: "inline-size", boxShadow: "0 24px 48px -22px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.08)" }}
            aria-hidden={!flipped}
          >
            <div className="absolute inset-[1.4cqw] rounded-[14px] overflow-hidden text-white flex flex-col p-[6cqw]" style={{ background: base }}>
              {/* Clear of the top-right corner, where the download button sits */}
              <div className="flex items-center justify-between gap-[2cqw] pr-[max(34px,12cqw)] text-[max(8px,2.7cqw)] font-semibold uppercase tracking-[0.14em]" style={{ color: stampColor }}>
                <span className="truncate">{set.tier}</span>
                <span className="shrink-0 tabular-nums">{collectorNo}</span>
              </div>
              <div className="ch-display uppercase font-bold leading-[0.95] tracking-tight text-[max(20px,9cqw)] mt-[3cqw]">{text.kicker}</div>
              <div className="mt-[1.2cqw] text-[max(10px,3.6cqw)] font-semibold text-white/85 tabular-nums">
                {[text.headline, text.unit].filter(Boolean).join(" ")}
              </div>
              <p className="mt-[3.5cqw] text-[max(10px,3.5cqw)] leading-snug text-white/80">{accolade.description}</p>
              <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-[3cqw] gap-y-[1.2cqw] text-[max(9px,3.1cqw)]">
                <dt className="uppercase tracking-[0.1em] text-white/55">Player</dt>
                <dd className="truncate font-semibold">{player.name}</dd>
                <dt className="uppercase tracking-[0.1em] text-white/55">Competition</dt>
                <dd className="truncate font-semibold">{set.title}</dd>
                {accolade.opponent && (
                  <>
                    <dt className="uppercase tracking-[0.1em] text-white/55">Game</dt>
                    <dd className="truncate font-semibold">vs {accolade.opponent}</dd>
                  </>
                )}
                {accolade.date && (
                  <>
                    <dt className="uppercase tracking-[0.1em] text-white/55">Date</dt>
                    <dd className="truncate font-semibold">{fullDate(accolade.date)}</dd>
                  </>
                )}
              </dl>
              <div className="mt-[3cqw] flex items-center justify-between gap-[2cqw]">
                {accolade.gameKey ? (
                  <a
                    href={`/game/${encodeURIComponent(accolade.gameKey)}`}
                    onClick={(e) => e.stopPropagation()}
                    tabIndex={flipped ? 0 : -1}
                    className="inline-flex items-center h-[max(26px,9cqw)] px-[3.4cqw] rounded-full bg-white text-slate-900 text-[max(10px,3.3cqw)] font-semibold hover:bg-white/90 transition-colors"
                  >
                    View game →
                  </a>
                ) : <span />}
                <span className="text-[max(8px,2.6cqw)] text-white/45">Tap to flip</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ShareableCard>
  );
}
