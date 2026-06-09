import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Share2, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
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
   * (~1080px logical width) instead of the default ~512px strip.
   * Used by share cards intended for Instagram / X feeds.
   */
  wide?: boolean;
  /**
   * When provided, this element is what gets captured as the PNG instead of
   * the default big banner card. Use this to produce a compact card that
   * mirrors the website UI. Colors should be explicit inline styles so dark
   * mode is handled by the caller. The PNG will have a transparent background
   * so rounded corners show through when overlaid on social posts.
   */
  captureCard?: ReactNode;
  /**
   * When provided, calling this function produces the PNG blob directly —
   * bypassing html2canvas entirely. Use this for canvas-drawn cards that need
   * pixel-perfect output (e.g. the trending performance card).
   */
  generateCardBlob?: () => Promise<Blob | null>;
}

const SHARE_WIDTH_WIDE = 1080;

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
        <span
          style={{
            fontSize: size * 0.38,
            lineHeight: 1,
            display: "inline-block",
            transform: "translateY(2%)",
          }}
        >
          {initials}
        </span>
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
  captureCard,
  generateCardBlob,
}: ShareableCardProps) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const captureRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const { toast } = useToast();

  const slug = (fileSlug || title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const fileName = `swish-${player.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")}-${slug}.png`;

  const bandBase = normalizeHex(player.primaryColor);
  const bandDark = shadeHex(bandBase, 0.25);
  const bandStyle = {
    background: `linear-gradient(135deg, ${bandBase} 0%, ${bandDark} 100%)`,
  } as const;

  const titleColor = ensureContrast(BRAND_ORANGE, bandBase, 4.5);
  const bandTextColor = ensureContrast("#ffffff", bandBase, 4.5);
  const bandTextSubtle = withAlpha(bandTextColor, 0.85);
  const bandTextMuted = withAlpha(bandTextColor, 0.7);

  const accentStripStart = bandBase;
  const accentStripEnd = shadeHex(bandBase, 0.25);
  const bodyTint = tintHex(bandBase, 0.94);

  /**
   * Fetch an image URL and return a base64 data URL so html2canvas can draw
   * it without hitting CORS or browser taint restrictions.
   */
  const fetchAsDataUrl = async (src: string): Promise<string | null> => {
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;
    try {
      const resp = await fetch(src, { mode: "cors", credentials: "omit" });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  /**
   * Reads all CSS custom-property values defined on bare `:root` / `html`
   * selectors from the document's own stylesheets (no CSSOM mutation, no
   * flash). Returns a map of `--prop-name → value` for light-mode.
   */
  const getLightModeCssVars = (): Map<string, string> => {
    const vars = new Map<string, string>();
    try {
      Array.from(document.styleSheets).forEach((sheet) => {
        try {
          Array.from(sheet.cssRules).forEach((rule) => {
            if (
              rule instanceof CSSStyleRule &&
              (rule.selectorText === ":root" || rule.selectorText === "html")
            ) {
              Array.from(rule.style).forEach((prop) => {
                if (prop.startsWith("--"))
                  vars.set(prop, rule.style.getPropertyValue(prop).trim());
              });
            }
          });
        } catch {
          // cross-origin stylesheet — skip
        }
      });
    } catch {
      // silently ignore
    }
    return vars;
  };

  const generatePngBlob = async (): Promise<Blob | null> => {
    if (generateCardBlob) return generateCardBlob();
    if (!captureRef.current) return null;

    // ── 1. Collect every image URL we know about ──────────────────────────
    // Include both DOM-scanned <img> tags AND images referenced in props,
    // so logos from teamLogos / player props are always pre-fetched even if
    // the React component hasn't mounted them yet.
    const liveImgs = Array.from(
      captureRef.current.querySelectorAll<HTMLImageElement>("img"),
    );
    const propSrcs = [
      player.photoUrl,
      player.teamLogoUrl,
      ...(teamLogos?.map((t) => t.logoUrl) ?? []),
    ].filter((s): s is string => !!s);
    const domSrcs = liveImgs
      .map((img) => img.getAttribute("src") || img.src)
      .filter(Boolean) as string[];
    const allSrcs = [...new Set([...propSrcs, ...domSrcs])];

    // ── 2. Pre-fetch all images as data-URLs (avoids CORS taint) ─────────
    const dataUrlMap = new Map<string, string>();
    await Promise.all(
      allSrcs.map(async (src) => {
        if (!dataUrlMap.has(src)) {
          const dataUrl = await fetchAsDataUrl(src);
          if (dataUrl) dataUrlMap.set(src, dataUrl);
        }
      }),
    );

    // ── 3. Wait for in-DOM images to finish loading ────────────────────────
    await Promise.all(
      liveImgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                img.addEventListener("load",  () => res(), { once: true });
                img.addEventListener("error", () => res(), { once: true });
              }),
      ),
    );

    // ── 4. Snapshot light-mode CSS vars for SVG resolution ────────────────
    const lightVars = getLightModeCssVars();

    const resolveCssVar = (value: string): string => {
      if (!value?.includes("var(")) return value;
      return value.replace(/var\(\s*(--[^,)]+)\s*(?:,([^)]*))?\)/g, (_, name, fallback) => {
        const trimName = name.trim();
        return lightVars.get(trimName) ?? fallback?.trim() ?? _;
      });
    };

    const captureEl = captureRef.current;
    const isCompactCapture = !!captureCard;
    const naturalWidth = isCompactCapture
      ? captureEl.scrollWidth
      : wide ? SHARE_WIDTH_WIDE : captureEl.scrollWidth;
    const naturalHeight = captureEl.scrollHeight;
    const canvas = await html2canvas(captureEl, {
      backgroundColor: isCompactCapture ? null : "#ffffff",
      scale: isCompactCapture ? 3 : 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      windowWidth: naturalWidth,
      windowHeight: naturalHeight,
      width: naturalWidth,
      height: naturalHeight,
      onclone: (doc) => {
        if (!isCompactCapture) {
          doc.documentElement.classList.remove("dark");
          doc.body.classList.remove("dark");
        }

        // Replace img src with pre-fetched data-URLs
        doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
          const src = img.getAttribute("src") || img.src;
          const dataUrl = dataUrlMap.get(src);
          if (dataUrl) img.src = dataUrl;
        });

        // Resolve CSS custom properties in SVG presentation attributes and
        // inline styles so shot charts (and any other SVG content) capture
        // correctly. html2canvas doesn't resolve var() in SVG attributes.
        const SVG_ATTRS = [
          "stroke", "fill", "color", "stop-color",
          "flood-color", "lighting-color",
        ] as const;
        doc.querySelectorAll<Element>("svg, svg *").forEach((el) => {
          SVG_ATTRS.forEach((attr) => {
            const val = el.getAttribute(attr);
            if (val?.includes("var(")) el.setAttribute(attr, resolveCssVar(val));
          });
          const style = el.getAttribute("style");
          if (style?.includes("var(")) el.setAttribute("style", resolveCssVar(style));
        });
      },
    });
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png", 0.95)
    );
  };

  // Stable ref so event handlers always call the latest version.
  const generatePngBlobRef = useRef(generatePngBlob);
  generatePngBlobRef.current = generatePngBlob;

  const runPreviewGeneration = async (cancelledRef: { current: boolean }) => {
    setPreviewLoading(true);
    setPreviewError(false);
    try {
      const blob = await generatePngBlobRef.current();
      if (cancelledRef.current) return;
      if (!blob) {
        setPreviewError(true);
        return;
      }
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch {
      if (!cancelledRef.current) setPreviewError(true);
    } finally {
      if (!cancelledRef.current) setPreviewLoading(false);
    }
  };

  const handleRegenerate = () => {
    const cancelledRef = { current: false };
    runPreviewGeneration(cancelledRef);
  };

  // Generate preview PNG when modal opens; clean up when it closes.
  useEffect(() => {
    if (!open) {
      setPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      blobRef.current = null;
      setPreviewError(false);
      return;
    }
    const cancelledRef = { current: false };
    runPreviewGeneration(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  // Only re-run when open changes — generatePngBlobRef is stable by design.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleDownload = async () => {
    setWorking(true);
    try {
      const blob = blobRef.current ?? (await generatePngBlob());
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
      const blob = blobRef.current ?? (await generatePngBlob());
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

  // The card markup rendered both off-screen (for capture) and never shown
  // as live HTML in the modal. Keeping it always in the DOM means html2canvas
  // always sees a clean, unscaled, full-resolution node.
  const cardMarkup = (
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
                        style={{
                          maxWidth: logoInner,
                          maxHeight: logoInner,
                          width: "auto",
                          height: "auto",
                          display: "block",
                        }}
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
        {player.teamLogoUrl && (
          <div
            aria-hidden="true"
            className="absolute pointer-events-none z-[1]"
            style={{
              right: wide ? 36 : 18,
              top: "50%",
              width: wide ? 210 : 118,
              height: wide ? 210 : 118,
              marginTop: wide ? -105 : -59,
              opacity: 0.18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={player.teamLogoUrl}
              alt=""
              crossOrigin="anonymous"
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                width: "auto",
                height: "auto",
                display: "block",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        {player.photoUrl ? (
          <div
            className="absolute bottom-0 pointer-events-none z-[2]"
            style={{
              left: wide ? 32 : 16,
              width: wide ? 220 : 128,
              height: wide ? 280 : 168,
              overflow: "hidden",
            }}
          >
            <div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{
                width: wide ? 180 : 104,
                height: wide ? 180 : 104,
                left: wide ? 20 : 12,
                top: wide ? 40 : 22,
                background:
                  "radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)",
              }}
            />
            <img
              src={player.photoUrl}
              alt={player.name}
              crossOrigin="anonymous"
              style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                height: "100%",
                width: "auto",
                maxWidth: "none",
                display: "block",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        ) : null}

        <div
          className="relative flex items-center h-full"
          style={{
            gap: wide ? 32 : 20,
            paddingLeft: player.photoUrl ? (wide ? 252 : 144) : 0,
            paddingRight: player.teamLogoUrl ? (wide ? 230 : 130) : 0,
            minHeight: wide ? 200 : 120,
          }}
        >
          {!player.photoUrl && (
            <PlayerAvatar player={player} size={wide ? 140 : 76} />
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div
              className="font-bold uppercase"
              style={{
                color: titleColor,
                lineHeight: 1,
                marginBottom: wide ? 14 : 8,
                fontSize: wide ? 18 : 10,
                letterSpacing: "0.22em",
              }}
            >
              {title}
            </div>
            <div
              className="font-black"
              style={{
                wordBreak: "break-word",
                color: bandTextColor,
                lineHeight: 1.1,
                fontSize: wide ? 44 : 20,
              }}
            >
              {player.name}
            </div>
            {player.team && (
              <div
                style={{
                  wordBreak: "break-word",
                  color: bandTextSubtle,
                  marginTop: wide ? 14 : 8,
                  lineHeight: 1.1,
                  fontSize: wide ? 22 : 12,
                }}
              >
                {player.team}
              </div>
            )}
            {shareCaption && (
              <div
                className="font-semibold uppercase"
                style={{
                  color: bandTextMuted,
                  marginTop: wide ? 16 : 10,
                  lineHeight: 1,
                  fontSize: wide ? 16 : 10,
                  letterSpacing: "0.2em",
                }}
              >
                {shareCaption}
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>

      {/* Accent strip */}
      <div
        aria-hidden="true"
        style={{
          height: wide ? 8 : 5,
          background: `linear-gradient(90deg, ${accentStripStart} 0%, ${accentStripEnd} 100%)`,
        }}
      />

      {/* Card content */}
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
          className="relative"
          style={{
            display: "flex",
            alignItems: "center",
            gap: wide ? 18 : 12,
          }}
        >
          <img
            src={SwishLogo}
            alt="Swish Assistant"
            crossOrigin="anonymous"
            style={{
              width: wide ? 56 : 36,
              height: wide ? 56 : 36,
              display: "block",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: bandTextColor,
              lineHeight: 1,
              fontSize: wide ? 24 : 16,
              fontWeight: "bold",
              letterSpacing: "0.025em",
            }}
          >
            swishassistant.com
          </div>
        </div>

        <div
          className="relative"
          style={{
            display: "flex",
            alignItems: "center",
            color: bandTextMuted,
            lineHeight: 1,
            fontSize: wide ? 16 : 11,
            letterSpacing: "0.22em",
            fontWeight: 600,
            textTransform: "uppercase",
            textAlign: "right",
          }}
        >
          Stats &amp; Insights
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Off-screen capture node — always in the DOM so html2canvas sees a
          clean, unscaled, full-resolution element regardless of modal state.
          When captureCard is provided it replaces the default banner layout. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: -9999,
          top: -9999,
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        {captureCard ? (
          <div ref={captureRef}>{captureCard}</div>
        ) : (
          cardMarkup
        )}
      </div>

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
            className={`w-[calc(100vw-16px)] ${wide ? "max-w-[540px]" : "max-w-lg"} p-0 bg-transparent border-none shadow-none max-h-[92vh] overflow-hidden flex flex-col [&>button]:bg-white/95 [&>button]:rounded-full [&>button]:p-1.5 [&>button]:right-2 [&>button]:top-2 [&>button]:text-slate-700 [&>button]:shadow-md [&>button]:z-20`}
          >
            <DialogTitle className="sr-only">
              Share {title} for {player.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Preview a shareable image of {title} and download or share it.
            </DialogDescription>

            <div className="rounded-xl overflow-hidden bg-white shadow-2xl flex flex-col min-h-0">
              {/* Preview area — shows the actual PNG that will be downloaded */}
              <div className="overflow-y-auto bg-slate-100 flex-1 min-h-0 flex items-center justify-center" style={{ minHeight: 200 }}>
                {previewLoading ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                    <span className="text-sm">Generating preview…</span>
                  </div>
                ) : previewError ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
                    <AlertTriangle className="h-8 w-8 text-amber-500" />
                    <span className="text-sm text-center px-4">
                      Preview generation failed.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
                      className="gap-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                ) : previewBlobUrl ? (
                  <img
                    src={previewBlobUrl}
                    alt={`Share preview for ${title}`}
                    className="w-full h-auto block"
                    style={{ display: "block" }}
                  />
                ) : null}
              </div>

              {/* Sticky action bar */}
              {(() => {
                const canNativeShare = (() => {
                  try {
                    const probe = new File([], "probe.png", { type: "image/png" });
                    return !!(
                      navigator.canShare &&
                      (navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare({ files: [probe] })
                    );
                  } catch {
                    return false;
                  }
                })();

                return (
                  <div className="flex items-center gap-2 p-3 bg-white border-t border-slate-200 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRegenerate}
                      disabled={previewLoading || working}
                      title="Regenerate preview"
                      className="text-slate-500 hover:text-orange-600 flex-shrink-0"
                      data-testid="share-regenerate-btn"
                    >
                      <RefreshCw className={`h-4 w-4 ${previewLoading ? "animate-spin" : ""}`} />
                    </Button>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={handleDownload}
                        disabled={working || previewLoading}
                        className="gap-2"
                        data-testid="share-download-btn"
                      >
                        {working ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {canNativeShare ? "Files" : "Download"}
                      </Button>
                      <Button
                        onClick={handleShare}
                        disabled={working || previewLoading}
                        className="gap-2 text-white"
                        style={{ backgroundColor: BRAND_ORANGE }}
                        data-testid="share-share-btn"
                      >
                        {working ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Share2 className="h-4 w-4" />
                        )}
                        {canNativeShare ? "Save to Photos" : "Share"}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
