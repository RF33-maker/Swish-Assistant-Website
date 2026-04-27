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

/** Darken a #rrggbb hex by `amount` (0-1). Falls back to input on invalid hex. */
function shadeHex(hex: string, amount: number): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const factor = 1 - amount;
  r = Math.max(0, Math.min(255, Math.round(r * factor)));
  g = Math.max(0, Math.min(255, Math.round(g * factor)));
  b = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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
  const bandBase = player.primaryColor || FALLBACK_NAVY;
  const bandDark = shadeHex(bandBase, 0.25);
  const bandStyle = {
    background: `linear-gradient(135deg, ${bandBase} 0%, ${bandDark} 100%)`,
  } as const;

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
                        style={{ color: BRAND_ORANGE }}
                      >
                        {title}
                      </div>
                      <div
                        className="text-xl font-black text-white leading-tight"
                        style={{ wordBreak: "break-word" }}
                      >
                        {player.name}
                      </div>
                      {player.team && (
                        <div
                          className="text-[11px] text-white/85 leading-snug mt-1"
                          style={{ wordBreak: "break-word" }}
                        >
                          {player.team}
                        </div>
                      )}
                      {shareCaption && (
                        <div className="text-[10px] text-white/70 uppercase tracking-wider mt-1.5">
                          {shareCaption}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card content */}
                <div className="p-4 bg-gradient-to-b from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-950">
                  <div className="share-content">{shareContent ?? children}</div>
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
                    <div className="leading-tight">
                      <div className="text-white font-bold text-sm">
                        Swish Assistant
                      </div>
                      <div
                        className="text-[10px] font-medium tracking-wide"
                        style={{ color: BRAND_ORANGE }}
                      >
                        swishassistant.com
                      </div>
                    </div>
                  </div>

                  <div className="relative text-right text-[10px] text-white/70 uppercase tracking-wider">
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
