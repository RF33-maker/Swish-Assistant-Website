import { User, Upload, Loader2, Move, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { TeamLogo } from "@/components/TeamLogo";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { getContrastColor } from "@/lib/colorExtractor";
import bannerTexture from "@assets/banner-texture.png";

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

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return { firstName: "", lastName: parts[0] || "" };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
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
}: PlayerBannerProps) {
  const { primaryColor, colors } = useTeamBranding({
    teamName: playerInfo.team || "",
    leagueId: playerInfo.leagueId || "",
    enabled: !brandColorOverride && !!playerInfo.team && !!playerInfo.leagueId,
  });

  const bgColor = brandColorOverride || primaryColor;
  const textColor = colors?.textContrast || (brandColorOverride ? getContrastColor(hexToRgb(brandColorOverride)) : "#ffffff");

  const { firstName, lastName } = splitName(playerInfo.name);
  const age = playerInfo.dateOfBirth ? calculateAge(playerInfo.dateOfBirth) : null;

  const statItems: { label: string; value: string }[] = [];
  if (age !== null) statItems.push({ label: "Age", value: String(age) });
  if (playerInfo.height) statItems.push({ label: "Height", value: playerInfo.height });
  if (playerInfo.position) statItems.push({ label: "Position", value: playerInfo.position });
  if (playerInfo.number !== undefined && playerInfo.number !== null) statItems.push({ label: "Number", value: `#${playerInfo.number}` });

  return (
    <div className={`relative w-full overflow-hidden ${className || ''}`} style={{ backgroundColor: bgColor }}>
      <img
        src={bannerTexture}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ mixBlendMode: "multiply" }}
      />

      <div className="relative min-h-[220px] md:min-h-[320px]">
        {playerInfo.team && playerInfo.leagueId && (
          <div className="absolute top-3 left-3 md:top-5 md:left-6 z-10">
            <TeamLogo
              teamName={playerInfo.team}
              leagueId={playerInfo.leagueId}
              size="xl"
              className="flex-shrink-0 drop-shadow-lg"
            />
          </div>
        )}

        {playerInfo.playerId && playerPhotoUrl ? (
          <img
            src={playerPhotoUrl}
            alt={playerInfo.name}
            className="absolute -right-[20%] bottom-0 w-auto object-contain object-bottom z-[5]"
            style={{
              height: '180%',
              maxWidth: '70%',
              objectPosition: `center ${showFocusAdjuster ? tempFocusY : (playerInfo.photoFocusY ?? 100)}%`,
            }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="absolute right-8 bottom-8 opacity-10 z-[1]">
            <User className="w-32 h-32" style={{ color: textColor }} />
          </div>
        )}

        <div className="relative z-10 px-4 pt-20 pb-6 md:px-8 md:pt-24 md:pb-10">
          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1 max-w-[45%] md:max-w-[40%]">
              {statItems.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {statItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <span
                        className="text-sm md:text-xl font-black tracking-wide"
                        style={{ color: textColor }}
                      >
                        {item.label}
                      </span>
                      <span
                        className="text-sm md:text-xl font-black"
                        style={{ color: textColor }}
                      >
                        –
                      </span>
                      <span
                        className="text-sm md:text-xl font-black"
                        style={{ color: textColor }}
                      >
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {playerInfo.previousTeams && playerInfo.previousTeams.length > 0 && (
                <p
                  className="text-[10px] md:text-xs mt-1 italic"
                  style={{ color: textColor, opacity: 0.7 }}
                >
                  Previously: {playerInfo.previousTeams.join(", ")}
                </p>
              )}
            </div>

            <div className="text-center md:text-center flex-1 z-10 pointer-events-none">
              {firstName && (
                <div
                  className="text-2xl md:text-5xl lg:text-6xl font-medium leading-tight"
                  style={{ color: textColor }}
                >
                  {firstName}
                </div>
              )}
              <div
                className="text-3xl md:text-6xl lg:text-7xl font-black leading-none uppercase tracking-tight"
                style={{ color: textColor }}
                data-testid="text-player-name"
              >
                {lastName}
              </div>
            </div>
          </div>
        </div>

        {showFocusAdjuster && playerInfo.photoPath && (
          <div className="absolute bottom-12 right-4 left-4 md:left-auto md:w-72 z-20 bg-white/95 dark:bg-neutral-800/95 rounded-lg p-3 shadow-lg">
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

        {isAuthenticated && playerInfo.playerId && !showFocusAdjuster && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
              data-testid="input-player-photo"
            />
            <div className="absolute bottom-12 right-3 z-10 flex gap-2">
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
                style={{
                  backgroundColor: textColor === "#ffffff" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.9)",
                  color: textColor === "#ffffff" ? "#ffffff" : "#000000",
                }}
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
          </>
        )}
      </div>
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
