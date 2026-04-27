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
  children: ReactNode;
}

const BRAND_ORANGE = "#f97316";
const BRAND_NAVY = "#0f1f33";

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

function PlayerAvatar({ player, size = 76 }: { player: SharePlayer; size?: number }) {
  const initials = player.name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="flex-shrink-0 rounded-full overflow-hidden flex items-center justify-center font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: player.primaryColor || BRAND_ORANGE,
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
        // Fallback: copy to clipboard if supported
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
        // Last resort: trigger download
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

      {/* Share button — overlay on the corner of the card */}
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
        <DialogContent className="max-w-2xl p-0 bg-transparent border-none shadow-none [&>button]:bg-white/90 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:right-2 [&>button]:top-2 [&>button]:text-slate-700">
          <DialogTitle className="sr-only">
            Share {title} for {player.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Preview a shareable image of {title} and download it as a PNG or
            share it directly.
          </DialogDescription>

          {/* The capture target — this exact element gets rasterized */}
          <div className="rounded-xl overflow-hidden bg-white shadow-2xl">
            <div ref={captureRef} className="bg-white" data-share-card="true">
              {/* Header band */}
              <div
                className="relative px-5 py-4 md:px-6 md:py-5"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #182b46 100%)`,
                }}
              >
                <DiagonalStripes position="tl" color={BRAND_ORANGE} />

                <div className="relative flex items-center gap-4">
                  <PlayerAvatar player={player} size={68} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] md:text-xs font-bold tracking-[0.18em] text-orange-400 uppercase">
                      {title}
                    </div>
                    <div className="text-xl md:text-2xl font-black text-white leading-tight truncate">
                      {player.name}
                    </div>
                    {player.team && (
                      <div className="text-xs md:text-sm text-slate-300 truncate mt-0.5">
                        {player.team}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Card content (children) */}
              <div className="p-4 md:p-5 bg-gradient-to-b from-white to-slate-50 dark:from-neutral-900 dark:to-neutral-950">
                <div className="share-content">{children}</div>
              </div>

              {/* Footer band */}
              <div
                className="relative px-5 py-3 md:px-6 md:py-4 flex items-center justify-between"
                style={{
                  background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #182b46 100%)`,
                }}
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
                    <div className="text-white font-bold text-sm md:text-base">
                      Swish Assistant
                    </div>
                    <div className="text-orange-400 text-[10px] md:text-xs font-medium tracking-wide">
                      swishassistant.com
                    </div>
                  </div>
                </div>

                <div className="relative text-right text-[10px] md:text-xs text-slate-400 uppercase tracking-wider">
                  Stats &amp; insights
                </div>
              </div>
            </div>

            {/* Action bar (NOT inside captureRef) */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-white border-t border-slate-200">
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
