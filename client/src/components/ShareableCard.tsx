import { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  normalizeHex,
  shadeHex,
  withAlpha,
  tintHex,
  contrastRatio,
  ensureContrast,
} from "@/lib/colorContrast";

export { normalizeHex, shadeHex, withAlpha, tintHex, contrastRatio, ensureContrast };

interface SharePlayer {
  name: string;
  team: string;
  photoUrl?: string | null;
  primaryColor?: string;
  /** Optional resolved team-logo URL shown in the share-card header band. */
  teamLogoUrl?: string | null;
}

interface ShareTeamLogo {
  name: string;
  logoUrl?: string | null;
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
  /**
   * Two-team variant for head-to-head share cards. When provided, the header
   * band renders both team logos side-by-side instead of the single-player
   * team logo / photo. The first entry is shown on the left, the second on
   * the right with a "VS" separator.
   */
  teamLogos?: ShareTeamLogo[];
  /**
   * When true, the captured PNG renders at a wider, social-friendly canvas
   * (~1080px logical width) instead of the default ~512px strip. The modal
   * preview is scaled down to fit while the export keeps full resolution.
   * Used by share cards intended for Instagram / X feeds.
   */
  wide?: boolean;
}

const SHARE_WIDTH_WIDE = 1080;
const PREVIEW_WIDTH_WIDE = 480;

const BRAND_ORANGE = "#f97316";

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
  teamLogos,
  wide,
}: ShareableCardProps) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [captureHeight, setCaptureHeight] = useState<number | null>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const previewScale = wide ? PREVIEW_WIDTH_WIDE / SHARE_WIDTH_WIDE : 1;

  useEffect(() => {
    if (!open || !wide) return;
    const el = captureRef.current;
    if (!el) return;
    const update = () => setCaptureHeight(el.scrollHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, wide, shareContent, children]);

  const slug = (fileSlug || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const fileName = `swish-${player.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-${slug}.png`;

  // Use team primary color (with darker shade for the gradient end).
  const bandBase = normalizeHex(player.primaryColor);
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
    // In wide mode the visible preview lives inside a CSS `transform: scale()`
    // wrapper so it fits the modal. html2canvas measures bounds from the live
    // element, so a transformed ancestor would shrink the captured canvas to
    // the preview size. Force the canvas dimensions to the untransformed
    // layout size and also strip the transform / fixed sizing on the scale
    // wrapper inside the cloned document so the rendered output is the full
    // 1080px-wide social card, not the ~480px preview.
    const captureEl = captureRef.current;
    const naturalWidth = wide ? SHARE_WIDTH_WIDE : captureEl.scrollWidth;
    const naturalHeight = captureEl.scrollHeight;
    const canvas = await html2canvas(captureEl, {
      backgroundColor: "#ffffff",
      scale: wide ? 1 : 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: naturalWidth,
      windowHeight: naturalHeight,
      width: naturalWidth,
      height: naturalHeight,
      onclone: (doc) => {
        // Strip the global `.dark` class from the cloned document so any
        // `dark:` Tailwind variants inside the captured share card revert to
        // their light-mode values — preventing white-on-white text on the
        // exported PNG when the user has dark mode enabled.
        doc.documentElement.classList.remove("dark");
        doc.body.classList.remove("dark");

        // Reset the scaling wrappers so the cloned share card renders at
        // its natural 1080px width. Without this, html2canvas would draw
        // the transformed (scaled-down) version into the canvas.
        const scaler = doc.querySelector<HTMLElement>(
          "[data-share-scale-wrapper='true']",
        );
        if (scaler) {
          scaler.style.transform = "none";
          scaler.style.position = "static";
          scaler.style.width = `${SHARE_WIDTH_WIDE}px`;
        }
        const outer = doc.querySelector<HTMLElement>(
          "[data-share-scale-outer='true']",
        );
        if (outer) {
          outer.style.width = `${SHARE_WIDTH_WIDE}px`;
          outer.style.height = "auto";
          outer.style.minHeight = "0";
          outer.style.position = "static";
          outer.style.overflow = "visible";
        }
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
          className={`${wide ? "max-w-[540px]" : "max-w-lg"} p-0 bg-transparent border-none shadow-none max-h-[92vh] overflow-hidden flex flex-col [&>button]:bg-white/95 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:right-2 [&>button]:top-2 [&>button]:text-slate-700 [&>button]:shadow-md [&>button]:z-20`}
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
              <div
                data-share-scale-outer={wide ? "true" : undefined}
                style={
                  wide
                    ? {
                        width: PREVIEW_WIDTH_WIDE,
                        height:
                          captureHeight != null
                            ? captureHeight * previewScale
                            : undefined,
                        minHeight: captureHeight == null ? 600 : undefined,
                        margin: "0 auto",
                        position: "relative",
                        overflow: "hidden",
                      }
                    : undefined
                }
              >
              <div
                data-share-scale-wrapper={wide ? "true" : undefined}
                style={
                  wide
                    ? {
                        transform: `scale(${previewScale})`,
                        transformOrigin: "top left",
                        width: SHARE_WIDTH_WIDE,
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }
                    : undefined
                }
              >
              <div
                ref={captureRef}
                className="bg-white"
                data-share-card="true"
                style={wide ? { width: SHARE_WIDTH_WIDE } : undefined}
              >
                {/* Header band */}
                <div
                  className="relative overflow-hidden"
                  style={{
                    ...bandStyle,
                    minHeight: wide ? 260 : 170,
                    paddingLeft: wide ? 40 : 24,
                    paddingRight: wide ? 40 : 24,
                    paddingTop: wide ? 36 : 24,
                    paddingBottom: wide ? 32 : 20,
                  }}
                >
                  <DiagonalStripes position="tl" color={BRAND_ORANGE} />

                  {/* Two-team variant: render the pair of team logos with a
                      "VS" in between, in place of the single player photo /
                      avatar. Used by Team & Player head-to-head share cards. */}
                  {teamLogos && teamLogos.length >= 2 ? (
                    <div
                      className="relative flex items-center h-full"
                      style={{ minHeight: wide ? 200 : 120, gap: wide ? 28 : 20 }}
                    >
                      <div
                        className="flex items-center flex-shrink-0"
                        style={{ gap: wide ? 14 : 8 }}
                      >
                        {[teamLogos[0], teamLogos[1]].map((tl, i) => {
                          const logoOuter = wide ? 110 : 60;
                          const logoInner = wide ? 96 : 52;
                          return (
                          <div
                            key={i}
                            className="flex items-center"
                            style={{ gap: wide ? 14 : 8 }}
                          >
                            <div
                              className="rounded-full bg-white/95 flex items-center justify-center overflow-hidden border-2 border-white/40 shadow"
                              style={{ width: logoOuter, height: logoOuter }}
                            >
                              {tl.logoUrl ? (
                                <img
                                  src={tl.logoUrl}
                                  alt={tl.name}
                                  crossOrigin="anonymous"
                                  width={logoInner}
                                  height={logoInner}
                                  style={{ width: logoInner, height: logoInner, objectFit: "contain" }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = "none";
                                  }}
                                  data-testid={`share-team-logo-${i}`}
                                />
                              ) : (
                                <span
                                  className="font-bold"
                                  style={{
                                    color: shadeHex(player.primaryColor || BRAND_ORANGE, 0.25),
                                    fontSize: wide ? 36 : 16,
                                  }}
                                >
                                  {(tl.name || "?").charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            {i === 0 && (
                              <div
                                className="font-black tracking-widest"
                                style={{ color: titleColor, fontSize: wide ? 22 : 11 }}
                              >
                                VS
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-bold uppercase"
                          style={{
                            color: titleColor,
                            fontSize: wide ? 16 : 10,
                            letterSpacing: "0.22em",
                            marginBottom: wide ? 10 : 6,
                          }}
                        >
                          {title}
                        </div>
                        <div
                          className="font-black leading-tight"
                          style={{
                            wordBreak: "break-word",
                            color: bandTextColor,
                            fontSize: wide ? 36 : 18,
                          }}
                        >
                          {player.name}
                        </div>
                        {player.team && (
                          <div
                            className="leading-snug"
                            style={{
                              wordBreak: "break-word",
                              color: bandTextSubtle,
                              fontSize: wide ? 16 : 11,
                              marginTop: wide ? 10 : 6,
                            }}
                          >
                            {player.team}
                          </div>
                        )}
                        {shareCaption && (
                          <div
                            className="uppercase"
                            style={{
                              color: bandTextMuted,
                              fontSize: wide ? 13 : 10,
                              letterSpacing: "0.18em",
                              marginTop: wide ? 12 : 8,
                            }}
                          >
                            {shareCaption}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                  <>
                  {/* Player photo cutout — anchored to bottom-left so the
                      transparent player image stands tall in the band, like
                      the profile banner. Falls back to the circular initials
                      avatar when no photo is set. */}
                  {player.photoUrl ? (
                    <div
                      className="absolute left-4 bottom-0 pointer-events-none z-[2]"
                      style={{ width: 128, height: 168 }}
                    >
                      {/* Soft circular spotlight behind the cutout */}
                      <div
                        aria-hidden="true"
                        className="absolute rounded-full"
                        style={{
                          width: 104,
                          height: 104,
                          left: 12,
                          top: 22,
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
                    className="relative flex items-center gap-5 h-full"
                    style={{
                      paddingLeft: player.photoUrl ? 144 : 0,
                      minHeight: 120,
                    }}
                  >
                    {!player.photoUrl && <PlayerAvatar player={player} size={76} />}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div
                        className="text-[10px] font-bold tracking-[0.22em] uppercase"
                        style={{ color: titleColor, lineHeight: 1, marginBottom: 8 }}
                      >
                        {title}
                      </div>
                      <div
                        className="text-xl font-black"
                        style={{ wordBreak: "break-word", color: bandTextColor, lineHeight: 1.1 }}
                      >
                        {player.name}
                      </div>
                      {player.team && (
                        <div
                          className="text-[12px] flex items-center gap-2"
                          style={{
                            wordBreak: "break-word",
                            color: bandTextSubtle,
                            marginTop: 8,
                            lineHeight: 1.1,
                          }}
                        >
                          {player.teamLogoUrl && (
                            <span
                              className="inline-flex items-center justify-center rounded-full bg-white border border-white/60 overflow-hidden flex-shrink-0 shadow-sm"
                              style={{ width: 28, height: 28 }}
                            >
                              <img
                                src={player.teamLogoUrl}
                                alt={player.team}
                                crossOrigin="anonymous"
                                width={24}
                                height={24}
                                style={{ width: 24, height: 24, objectFit: "contain" }}
                                onError={(e) => {
                                  const img = e.currentTarget as HTMLImageElement;
                                  const wrap = img.parentElement;
                                  if (wrap) wrap.style.display = "none";
                                }}
                                data-testid="share-team-logo"
                              />
                            </span>
                          )}
                          <span>{player.team}</span>
                        </div>
                      )}
                      {shareCaption && (
                        <div
                          className="text-[10px] font-semibold uppercase tracking-[0.2em]"
                          style={{ color: bandTextMuted, marginTop: 10, lineHeight: 1 }}
                        >
                          {shareCaption}
                        </div>
                      )}
                    </div>
                  </div>
                  </>
                  )}
                </div>

                {/* Team-colour accent strip bridging the header band into the
                    body, so the team brand carries through visually. */}
                <div
                  aria-hidden="true"
                  style={{
                    height: wide ? 8 : 5,
                    background: `linear-gradient(90deg, ${accentStripStart} 0%, ${accentStripEnd} 100%)`,
                  }}
                />

                {/* Card content. We force light styles here so that any
                    `dark:` Tailwind variants from the embedded share content
                    do not flip to white-on-white when the user is in dark
                    mode. The on-page (non-modal) content keeps its own dark
                    behaviour because it lives outside this wrapper. */}
                <div
                  className="share-content"
                  style={{
                    background: `linear-gradient(180deg, #ffffff 0%, ${bodyTint} 100%)`,
                    color: "#0f172a",
                    colorScheme: "light",
                    padding: wide ? 36 : 16,
                  }}
                  data-share-body="true"
                >
                  {shareContent ?? children}
                </div>

                {/* Footer band */}
                <div
                  className="relative flex items-center justify-between"
                  style={{
                    ...bandStyle,
                    height: wide ? 110 : 72,
                    paddingLeft: wide ? 40 : 24,
                    paddingRight: wide ? 40 : 24,
                  }}
                >
                  <DiagonalStripes position="br" color={BRAND_ORANGE} />

                  <div
                    className="relative flex items-center"
                    style={{ gap: wide ? 18 : 12 }}
                  >
                    <img
                      src={SwishLogo}
                      alt="Swish Assistant"
                      width={wide ? 56 : 36}
                      height={wide ? 56 : 36}
                      className="block flex-shrink-0"
                      style={{ width: wide ? 56 : 36, height: wide ? 56 : 36 }}
                      crossOrigin="anonymous"
                    />
                    <div
                      className="font-bold tracking-wide"
                      style={{
                        color: bandTextColor,
                        lineHeight: 1,
                        fontSize: wide ? 24 : 16,
                      }}
                    >
                      swishassistant.com
                    </div>
                  </div>

                  <div
                    className="relative text-right font-semibold uppercase"
                    style={{
                      color: bandTextMuted,
                      lineHeight: 1,
                      fontSize: wide ? 16 : 11,
                      letterSpacing: "0.22em",
                    }}
                  >
                    Stats &amp; Insights
                  </div>
                </div>
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
