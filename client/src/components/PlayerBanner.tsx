import { useEffect, useState, type CSSProperties } from "react";
import { Upload, Loader2, Move, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { getContrastColor } from "@/lib/colorExtractor";
import { relativeLuminance, shadeHex } from "@/lib/colorContrast";
import { getTeamLogoCached } from "@/utils/teamLogoCache";

interface PlayerBannerProps {
  playerInfo: {
    name: string;
    team: string;
    position?: string;
    number?: number;
    leagueId?: string;
    playerId?: string;
    photoPath?: string | null;
    photoFocusY?: number | null;
    previousTeams?: string[];
    height?: string | null;
    heightCm?: number | null;
    dateOfBirth?: string | null;
  };
  playerPhotoUrl: string | null;
  showFocusAdjuster: boolean;
  setShowFocusAdjuster: (show: boolean) => void;
  tempFocusY: number;
  setTempFocusY: (val: number) => void;
  handleSaveFocus: () => void;
  savingFocus: boolean;
  handlePhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  photoUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  /** Admins only: storage and the players table reject everyone else's photo writes. */
  canEditPhoto: boolean;
  brandColorOverride?: string;
  className?: string;
  leagueChip?: { label: string; onClick: () => void };
  teamChip?: { label: string; onClick: () => void };
  extraLeagueIds?: string[];
}

function calculateAge(dateOfBirth: string): number | null {
  try {
    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PlayerBanner({
  playerInfo,
  playerPhotoUrl,
  showFocusAdjuster,
  setShowFocusAdjuster,
  tempFocusY,
  setTempFocusY,
  handleSaveFocus,
  savingFocus,
  handlePhotoUpload,
  photoUploading,
  fileInputRef,
  canEditPhoto,
  brandColorOverride,
  className,
  leagueChip,
  teamChip,
  extraLeagueIds,
}: PlayerBannerProps) {
  const { primaryColor, colors } = useTeamBranding({
    teamName: playerInfo.team || "",
    leagueId: playerInfo.leagueId || "",
    extraLeagueIds,
    enabled: !brandColorOverride && !!playerInfo.team && !!playerInfo.leagueId,
  });

  const bgColor = brandColorOverride || primaryColor;
  const textColor = colors?.textContrast || (brandColorOverride ? getContrastColor(hexToRgb(brandColorOverride)) : "#ffffff");
  const gradientEnd = shadeHex(bgColor, 0.35);

  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!playerInfo.team || !playerInfo.leagueId) {
      setTeamLogoUrl(null);
      return;
    }
    getTeamLogoCached({ teamName: playerInfo.team, leagueId: playerInfo.leagueId, extraLeagueIds })
      .then((url) => { if (!cancelled) setTeamLogoUrl(url); })
      .catch(() => { if (!cancelled) setTeamLogoUrl(null); });
    return () => { cancelled = true; };
  }, [playerInfo.team, playerInfo.leagueId, extraLeagueIds?.join(",")]);

  const age = playerInfo.dateOfBirth ? calculateAge(playerInfo.dateOfBirth) : null;
  const heightDisplay = playerInfo.heightCm
    ? `${Math.floor(playerInfo.heightCm / 30.48)}'${Math.round((playerInfo.heightCm / 2.54) % 12)}"`
    : playerInfo.height || null;

  const detailItems: { label: string; value: string }[] = [];
  if (age !== null) detailItems.push({ label: "Age", value: String(age) });
  if (heightDisplay) detailItems.push({ label: "Height", value: heightDisplay });

  const subtitle = [playerInfo.position, playerInfo.number != null ? `#${playerInfo.number}` : null]
    .filter(Boolean)
    .join(" · ");

  // Glass chips and pills that read on the team colour, whichever way the
  // text contrast goes.
  const onLight = textColor.toLowerCase() === "#000000";
  const glass = onLight
    ? "bg-black/[0.07] hover:bg-black/[0.12] border-black/10"
    : "bg-white/[0.12] hover:bg-white/20 border-white/20";
  // The team logo as a tone-on-tone watermark, as on the trading cards.
  const darkTeam = relativeLuminance(bgColor) < 0.18;
  const watermarkStyle: CSSProperties = darkTeam
    ? { filter: "grayscale(1) invert(1)", mixBlendMode: "screen", opacity: 0.16 }
    : { filter: "grayscale(1) contrast(1.15)", mixBlendMode: "multiply", opacity: 0.24 };

  return (
    <section
      className={`ch-hero ch-rise ${className || ''}`}
      style={{
        background: `radial-gradient(120% 140% at 85% 0%, color-mix(in srgb, ${bgColor} 80%, #fff) 0%, ${bgColor} 45%, ${gradientEnd} 100%)`,
        color: textColor,
      }}
      aria-label={`${playerInfo.name} profile`}
    >
      <svg aria-hidden="true" viewBox="0 0 200 80" preserveAspectRatio="xMaxYMid slice" className="absolute inset-0 h-full w-full pointer-events-none" fill="none" stroke={onLight ? "black" : "white"} strokeWidth="0.5" style={{ opacity: onLight ? 0.08 : 0.12 }}>
        <circle cx="150" cy="-4" r="30" />
        <path d="M 118 0 V 22 A 32 32 0 0 0 182 22 V 0" />
        <rect x="138" y="0" width="24" height="30" />
      </svg>
      {teamLogoUrl && (
        <img
          src={teamLogoUrl}
          alt=""
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-[150%] max-w-none object-contain pointer-events-none select-none"
          style={{ transform: 'translate(-22%, -50%)', ...watermarkStyle }}
        />
      )}

      <div className="relative p-5 md:p-8" style={{ minHeight: 'clamp(200px, 26vw, 320px)' }}>
        {(leagueChip || teamChip) && (
          <div className="flex flex-wrap items-center gap-2 mb-4 max-w-[70%] md:max-w-[60%]">
            {[leagueChip, teamChip].filter((c): c is NonNullable<typeof c> => !!c).map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={chip.onClick}
                className={`inline-flex items-center h-7 px-3 rounded-full border text-xs font-semibold backdrop-blur transition-colors max-w-full ${glass}`}
              >
                <span className="truncate">{chip.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Text column is capped to roughly half width so the large bottom-anchored
            photo below always has clear room on the right, at any card height. */}
        <div className="max-w-[60%] md:max-w-[55%]">
          {subtitle && (
            <div className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.14em]" style={{ opacity: 0.75 }}>
              {subtitle}
            </div>
          )}
          <h1
            className="ch-display uppercase font-bold leading-[0.92] tracking-tight break-words text-[2rem] sm:text-[2.6rem] md:text-[3.4rem] mt-1"
            data-testid="text-player-name"
          >
            {playerInfo.name}
          </h1>
          {playerInfo.previousTeams && playerInfo.previousTeams.length > 0 && (
            <p className="text-xs mt-2" style={{ opacity: 0.72 }}>
              Previously: {playerInfo.previousTeams.join(", ")}
            </p>
          )}
          {detailItems.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {detailItems.map((item) => (
                <span key={item.label} className={`inline-flex items-baseline gap-1.5 h-7 px-2.5 rounded-lg border text-xs ${glass}`}>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ opacity: 0.7 }}>{item.label}</span>
                  <span className="font-bold tabular-nums">{item.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Player photo — large cutout anchored to the bottom-right corner of
            the banner, matching the site's original hero treatment. Falls
            back to a small initials circle when no photo is set.
            The outer box has a FIXED width+height (not just a max-height on
            an auto-width img) so `object-cover` always fills it completely —
            headshots come in in all sorts of aspect ratios, and a `contain`
            fit left a gap under the photo whenever one was wider/shorter
            than the box. Cover crops instead of leaving that gap; the focus
            slider still lets you choose which part of a tall photo shows.
            height is the ONLY sized dimension — width is `auto` and derived
            from aspectRatio, and maxHeight can freely reduce the used height
            without ever decoupling the two. Width used to be its own
            independent clamp() with a DIFFERENT reference unit (vw vs % of
            the parent) than height's — the two tracked completely unrelated
            values above the ~896px layout breakpoint where the card's width
            stops growing with the viewport but height (driven by vw) kept
            climbing, badly distorting the box's aspect ratio on desktop and
            forcing object-cover to crop off the top of every photo. */}
        {playerInfo.playerId && playerPhotoUrl ? (
          <div
            className="absolute bottom-0 right-0 md:right-4 overflow-hidden pointer-events-none select-none"
            style={{
              height: 'clamp(140px, 40vw, 420px)',
              // Capped well under 100% (rather than bleeding above the card)
              // so the top of the photo always clears the chip row above it,
              // regardless of how tall a given photo's crop needs to be.
              maxHeight: '82%',
              width: 'auto',
              aspectRatio: '0.96',
            }}
          >
            <img
              src={playerPhotoUrl}
              alt={playerInfo.name}
              className="w-full h-full object-cover"
              style={{
                objectPosition: `center ${showFocusAdjuster ? tempFocusY : (playerInfo.photoFocusY ?? 100)}%`,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : (
          <div
            className={`absolute bottom-5 right-5 md:bottom-8 md:right-8 w-20 h-20 md:w-28 md:h-28 rounded-full flex items-center justify-center border ${onLight ? 'border-black/15 bg-black/[0.06]' : 'border-white/30 bg-white/15'}`}
          >
            <span className="ch-display font-bold text-2xl md:text-4xl">
              {getInitials(playerInfo.name)}
            </span>
          </div>
        )}

        {canEditPhoto && playerInfo.playerId && !showFocusAdjuster && (
          <div className="absolute bottom-3 right-3 z-10 flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              data-testid="input-player-photo"
            />
            {playerInfo.photoPath && (
              <Button
                onClick={() => {
                  setTempFocusY(playerInfo.photoFocusY ?? 50);
                  setShowFocusAdjuster(true);
                }}
                size="sm"
                variant="outline"
                className="bg-white/90 dark:bg-neutral-800/90 shadow-lg h-7 text-xs"
                data-testid="button-adjust-photo-focus"
              >
                <Move className="w-3 h-3 mr-1" /> Adjust
              </Button>
            )}
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={photoUploading}
              size="sm"
              className="shadow-lg h-7 text-xs"
              style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: '#ffffff' }}
              data-testid="button-upload-player-photo"
            >
              {photoUploading ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <Upload className="w-3 h-3 mr-1" />
              )}
              {photoUploading ? "Uploading..." : playerInfo.photoPath ? "Change" : "Add Photo"}
            </Button>
          </div>
        )}

        {showFocusAdjuster && playerInfo.photoPath && (
          <div className="mt-4 bg-white/95 dark:bg-neutral-800/95 rounded-lg p-3 shadow-lg">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Adjust vertical focus
            </div>
            <Slider
              value={[tempFocusY]}
              onValueChange={(value) => setTempFocusY(value[0])}
              min={0}
              max={100}
              step={1}
              className="mb-3"
              data-testid="slider-photo-focus"
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSaveFocus}
                disabled={savingFocus}
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700"
                data-testid="button-save-focus"
              >
                {savingFocus ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                Save
              </Button>
              <Button
                onClick={() => setShowFocusAdjuster(false)}
                variant="outline"
                size="sm"
                className="flex-1"
                data-testid="button-cancel-focus"
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (hex.startsWith("rgb")) {
    const match = hex.match(/(\d+)/g);
    if (match && match.length >= 3) {
      return { r: parseInt(match[0]), g: parseInt(match[1]), b: parseInt(match[2]) };
    }
  }
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  return { r: 100, g: 100, b: 100 };
}
