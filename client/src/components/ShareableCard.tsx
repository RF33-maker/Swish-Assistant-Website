import { useRef, useState, type ReactNode } from "react";
import { Download, Share2, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

interface SharePlayer {
  name: string;
  team: string;
  photoUrl?: string | null;
  primaryColor?: string;
}

interface ShareableCardProps {
  title: string;
  player: SharePlayer;
  fileSlug?: string;
  /** Children rendered in-page. */
  children: ReactNode;
  /** Optional content rendered inside the share modal instead of children. */
  shareContent?: ReactNode;
  /** Optional caption shown beneath the title in the share modal header. */
  shareCaption?: string;
}

const BRAND_ORANGE = "#f97316";
const FALLBACK_NAVY = "#0f1f33";

/** Convert any supported colour string (`#rgb`, `#rrggbb`, `rgb(r,g,b)`) to `#rrggbb`. */
export function normalizeHex(input: string | null | undefined): string {
  if (!input) return FALLBACK_NAVY;
  const trimmed = input.trim();
  if (trimmed.startsWith("#")) {
    const h = trimmed.slice(1);
    if (/^[0-9a-f]{6}$/i.test(h)) return `#${h.toLowerCase()}`;
    if (/^[0-9a-f]{3}$/i.test(h)) {
      return `#${h
        .split("")
        .map((c) => (c + c).toLowerCase())
        .join("")}`;
    }
  }
  const rgbMatch = trimmed.match(
    /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  );
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)));
    return `#${[r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return FALLBACK_NAVY;
}

/** Darken a colour by `amount` (0-1). Accepts hex or rgb(); always returns `#rrggbb`. */
export function shadeHex(input: string, amount: number): string {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const factor = 1 - amount;
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((num & 0xff) * factor)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Return a `rgba(...)` string for `hex` at the given alpha (0-1). */
export function withAlpha(input: string, alpha: number): string {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Mix a colour toward white by `amount` (0-1). */
export function tintHex(input: string, amount: number): string {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const r = Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * amount);
  const g = Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * amount);
  const b = Math.round((num & 0xff) + (255 - (num & 0xff)) * amount);
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function relativeLuminance(input: string): number {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const channels = [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff].map(
    (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    },
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/**
 * Adjust `color` toward black or white (whichever opposes `bg`) until it has at
 * least `minRatio` contrast against `bg`. Useful for keeping team-coloured text
 * readable on either the white share body or a dark navy band.
 */
export function ensureContrast(
  color: string,
  bg: string,
  minRatio = 4.5,
): string {
  const start = normalizeHex(color);
  if (contrastRatio(start, bg) >= minRatio) return start;
  const bgIsLight = relativeLuminance(bg) > 0.5;
  let result = start;
  for (let amount = 0.08; amount <= 0.92; amount += 0.06) {
    const candidate = bgIsLight ? shadeHex(start, amount) : tintHex(start, amount);
    if (contrastRatio(candidate, bg) >= minRatio) return candidate;
    result = candidate;
  }
  return result;
}

function DiagonalStripes({
  position,
  color = BRAND_ORANGE,
}: {
  position: "tl" | "br";
  color?: string;
}) {
  const transform =
    position === "tl"
      ? "rotate(-45deg) translate(-30%, -50%)"
      : "rotate(-45deg) translate(30%, 50%)";
  return (
    <div
      aria-hidden="true"
      className={`absolute pointer-events-none ${
        position === "tl" ? "top-0 left-0" : "bottom-0 right-0"
      }`}
      style={{ width: 110, height: 70, overflow: "hidden" }}
    >
      <div
        style={{
          transform,
          transformOrigin: "center",
          width: 200,
          height: 200,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: 8,
              marginBottom: 6,
              width: "100%",
              backgroundColor: color,
              opacity: 1 - i * 0.25,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerAvatar({ player, size = 64 }: { player: SharePlayer; size?: number }) {
  const initials = player.name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center font-bold text-white border-2 border-white/30"
      style={{
        width: size,
        height: size,
        backgroundColor: shadeHex(player.primaryColor || BRAND_ORANGE, 0.25),
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      }}
    >
      {player.photoUrl ? (
        <img
          src={player.photoUrl}
          alt={player.name}
          crossOrigin="anonymous"
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span style={{ fontSize: size * 0.34 }}>{initials}</span>
      )}
    </div>
  );
}

export default function ShareableCard({
  title,
  player,
  fileSlug,
  children,
  shareContent,
  shareCaption,
}: ShareableCardProps) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const slug = (fileSlug || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const fileName = `swish-${player.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-${slug}.png`;

  // Use team primary color (with darker shade for the gradient end).
  const bandBase = normalizeHex(player.primaryColor || FALLBACK_NAVY);
  const bandDark = shadeHex(bandBase, 0.25);
  const bandStyle = {
    background: `linear-gradient(135deg, ${bandBase} 0%, ${bandDark} 100%)`,
  } as const;

  // Title sits on the team-coloured band. If the band is light (e.g. a yellow
  // team), pure brand orange disappears, so derive a band-readable variant.
  const titleColor = ensureContrast(BRAND_ORANGE, bandBase, 4.5);

  // All other text on the band (player name, team, caption, footer URL,
  // footer meta) is normally white-on-navy. If the team band is very light
  // (e.g. yellow), white text vanishes; the contrast guard flips it to a
  // dark variant so it stays readable. Muted variants reuse the same base
  // colour with reduced opacity so they don't drift back to a transparent
  // white that would be invisible on a light band.
  const bandTextColor = ensureContrast("#ffffff", bandBase, 4.5);
  const bandTextSubtle = withAlpha(bandTextColor, 0.85);
  const bandTextMuted = withAlpha(bandTextColor, 0.7);

  // Body accents derived from the team colour. The body background stays
  // white for legibility, so the accent strip uses the raw team colour and
  // the subtle body tint is a near-white wash of it.
  const accentStripStart = bandBase;
  const accentStripEnd = shadeHex(bandBase, 0.25);
  const bodyTint = tintHex(bandBase, 0.94);

  const generatePngBlob = async (): Promise<Blob | null> => {
    if (!captureRef.current) return null;
    const canvas = await html2canvas(captureRef.current, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: captureRef.current.scrollWidth,
      windowHeight: captureRef.current.scrollHeight,
      onclone: (doc) => {
        // Strip the global `.dark` class from the cloned document so any
        // `dark:` Tailwind variants inside the captured share card revert to
        // their light-mode values — preventing white-on-white text on the
        // exported PNG when the user has dark mode enabled.
        doc.documentElement.classList.remove("dark");
        doc.body.classList.remove("dark");
      },
    });
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 0.95)
    );
  };

  const handleDownload = async () => {
    setWorking(true);
    try {
      const blob = await generatePngBlob();
      if (!blob) throw new Error("Capture failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: `Saved ${fileName}` });
    } catch (e) {
      console.error("[ShareableCard] download error", e);
      toast({
        title: "Download failed",
        description: "Could not generate the image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const handleShare = async () => {
    setWorking(true);
    try {
      const blob = await generatePngBlob();
      if (!blob) throw new Error("Capture failed");
      const file = new File([blob], fileName, { type: "image/png" });

      const navAny = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${player.name} — ${title}`,
          text: `${player.name} on Swish Assistant`,
        });
        toast({ title: "Shared" });
      } else {
        if (navigator.clipboard && "write" in navigator.clipboard) {
          try {
            await (navigator.clipboard as Clipboard).write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            toast({
              title: "Copied to clipboard",
              description: "Paste anywhere to share.",
            });
            return;
          } catch {
            // fall through to download
          }
        }
        await handleDownload();
      }
    } catch (e) {
      console.error("[ShareableCard] share error", e);
      toast({
        title: "Share failed",
        description: "Could not share the image. Try downloading instead.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="relative group">
      {children}

      {/* Share button overlay */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="absolute top-2 right-2 md:top-3 md:right-3 z-10 inline-flex items-center justify-center h-8 w-8 rounded-full bg-white/90 dark:bg-neutral-800/90 border border-gray-200 dark:border-neutral-700 text-slate-600 dark:text-slate-300 hover:text-orange-600 hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-neutral-700 transition-all shadow-sm opacity-60 hover:opacity-100 focus:opacity-100"
        aria-label={`Share ${title}`}
        title={`Share ${title}`}
        data-testid={`share-${slug}`}
      >
        <Share2 className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-lg p-0 bg-transparent border-none shadow-none max-h-[92vh] overflow-hidden flex flex-col [&>button]:bg-white/95 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:right-2 [&>button]:top-2 [&>button]:text-slate-700 [&>button]:shadow-md [&>button]:z-20"
        >
          <DialogTitle className="sr-only">
            Share {title} for {player.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview a shareable image of {title} and download or share it.
          </DialogDescription>

          <div className="rounded-xl overflow-hidden bg-white shadow-2xl flex flex-col min-h-0">
            {/* Scrollable preview area */}
            <div className="overflow-y-auto bg-slate-100 flex-1 min-h-0">
              <div ref={captureRef} className="bg-white" data-share-card="true">
                {/* Header band */}
                <div
                  className="relative px-5 pt-5 pb-4 overflow-hidden"
                  style={{ ...bandStyle, minHeight: 150 }}
                >
                  <DiagonalStripes position="tl" color={BRAND_ORANGE} />

                  {/* Player photo cutout — anchored to bottom-left so the
                      transparent player image stands tall in the band, like
                      the profile banner. Falls back to the circular initials
                      avatar when no photo is set. */}
                  {player.photoUrl ? (
                    <div
                      className="absolute left-3 bottom-0 pointer-events-none z-[2]"
                      style={{ width: 120, height: 150 }}
                    >
                      {/* Soft circular spotlight behind the cutout */}
                      <div
                        aria-hidden="true"
                        className="absolute rounded-full"
                        style={{
                          width: 96,
                          height: 96,
                          left: 12,
                          top: 18,
                          background:
                            "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)",
                        }}
                      />
                      <img
                        src={player.photoUrl}
                        alt={player.name}
                        crossOrigin="anonymous"
                        className="absolute inset-0 w-full h-full object-contain object-bottom"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  ) : null}

                  <div
                    className="relative flex items-center gap-4 h-full"
                    style={{
                      paddingLeft: player.photoUrl ? 128 : 0,
                      minHeight: 110,
                    }}
                  >
                    {!player.photoUrl && <PlayerAvatar player={player} size={64} />}
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[10px] font-bold tracking-[0.2em] uppercase mb-0.5"
                        style={{ color: titleColor }}
                      >
                        {title}
                      </div>
                      <div
                        className="text-xl font-black leading-tight"
                        style={{ wordBreak: "break-word", color: bandTextColor }}
                      >
                        {player.name}
                      </div>
                      {player.team && (
                        <div
                          className="text-[11px] leading-snug mt-1"
                          style={{ wordBreak: "break-word", color: bandTextSubtle }}
                        >
                          {player.team}
                        </div>
                      )}
                      {shareCaption && (
                        <div
                          className="text-[10px] uppercase tracking-wider mt-1.5"
                          style={{ color: bandTextMuted }}
                        >
                          {shareCaption}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Team-colour accent strip bridging the header band into the
                    body, so the team brand carries through visually. */}
                <div
                  aria-hidden="true"
                  style={{
                    height: 5,
                    background: `linear-gradient(90deg, ${accentStripStart} 0%, ${accentStripEnd} 100%)`,
                  }}
                />

                {/* Card content. We force light styles here so that any
                    `dark:` Tailwind variants from the embedded share content
                    do not flip to white-on-white when the user is in dark
                    mode. The on-page (non-modal) content keeps its own dark
                    behaviour because it lives outside this wrapper. */}
                <div
                  className="p-4 share-content"
                  style={{
                    background: `linear-gradient(180deg, #ffffff 0%, ${bodyTint} 100%)`,
                    color: "#0f172a",
                    colorScheme: "light",
                  }}
                  data-share-body="true"
                >
                  {shareContent ?? children}
                </div>

                {/* Footer band */}
                <div
                  className="relative px-5 py-3 flex items-center justify-between"
                  style={{ ...bandStyle, minHeight: 56 }}
                >
                  <DiagonalStripes position="br" color={BRAND_ORANGE} />

                  <div className="relative flex items-center gap-2">
                    <img
                      src={SwishLogo}
                      alt="Swish Assistant"
                      className="h-7 w-7 object-contain"
                      crossOrigin="anonymous"
                    />
                    <div
                      className="font-bold text-sm tracking-wide"
                      style={{ color: bandTextColor }}
                    >
                      swishassistant.com
                    </div>
                  </div>

                  <div
                    className="relative text-right text-[10px] uppercase tracking-wider"
                    style={{ color: bandTextMuted }}
                  >
                    Stats &amp; insights
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky action bar (NOT inside captureRef) */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-white border-t border-slate-200 flex-shrink-0">
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={working}
                className="gap-2"
                data-testid="share-download-btn"
              >
                {working ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download
              </Button>
              <Button
                onClick={handleShare}
                disabled={working}
                className="gap-2 text-white"
                style={{ backgroundColor: BRAND_ORANGE }}
                data-testid="share-share-btn"
              >
                {working ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
                Share
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
