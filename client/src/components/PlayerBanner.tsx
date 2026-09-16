import { useEffect, useState } from "react";
import { Upload, Loader2, Move, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ProfileChip } from "@/components/ProfileChip";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { getContrastColor } from "@/lib/colorExtractor";
import { shadeHex } from "@/lib/colorContrast";
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
  isAuthenticated: boolean;
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
  isAuthenticated,
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

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className || ''}`}
      style={{ background: `linear-gradient(135deg, ${bgColor}, ${gradientEnd})` }}
    >
      {teamLogoUrl && (
        <img
          src={teamLogoUrl}
          alt=""
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-[170%] max-w-none object-contain opacity-15 pointer-events-none select-none"
          style={{ transform: 'translate(-20%, -50%)' }}
        />
      )}

      <div className="relative p-5 md:p-8" style={{ minHeight: 'clamp(180px, 26vw, 300px)' }}>
        {(leagueChip || teamChip) && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {leagueChip && <ProfileChip label={leagueChip.label} onClick={leagueChip.onClick} />}
            {teamChip && <ProfileChip label={teamChip.label} onClick={teamChip.onClick} />}
          </div>
        )}

        {/* Text column is capped to roughly half width so the large bottom-anchored
            photo below always has clear room on the right, at any card height. */}
        <div className="max-w-[60%] md:max-w-[55%]">
          <div
            className="font-black leading-tight"
            style={{ color: textColor, fontSize: 'clamp(1.5rem, 4vw, 2.5rem)' }}
            data-testid="text-player-name"
          >
            {playerInfo.name}
          </div>
          {subtitle && (
            <div className="text-sm md:text-base mt-1" style={{ color: textColor, opacity: 0.85 }}>
              {subtitle}
            </div>
          )}
          {playerInfo.previousTeams && playerInfo.previousTeams.length > 0 && (
            <p className="text-xs italic mt-2" style={{ color: textColor, opacity: 0.7 }}>
              Previously: {playerInfo.previousTeams.join(", ")}
            </p>
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
            className="absolute bottom-4 right-4 md:right-8 w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center border-2"
            style={{ borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <span className="font-bold text-lg md:text-xl" style={{ color: textColor }}>
              {getInitials(playerInfo.name)}
            </span>
          </div>
        )}

        {isAuthenticated && playerInfo.playerId && !showFocusAdjuster && (
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

      {detailItems.length > 0 && (
        <div
          className="relative flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 md:px-8 md:py-3 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.15)' }}
        >
          {detailItems.map((item, idx) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-wide" style={{ color: textColor, opacity: 0.7 }}>
                {item.label}
              </span>
              <span className="text-xs font-bold" style={{ color: textColor }}>
                {item.value}
              </span>
              {idx < detailItems.length - 1 && (
                <span className="text-xs font-bold ml-2" style={{ color: textColor, opacity: 0.4 }}>
                  |
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
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
