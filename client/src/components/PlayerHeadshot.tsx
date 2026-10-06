import { useEffect, useState, type CSSProperties, type ImgHTMLAttributes, type SyntheticEvent } from "react";

/**
 * Player headshots are stored as large background-removed PNGs (often
 * several MB). Each one has two derived files next to it in the
 * player-photos bucket:
 *
 *   <name>.thumb.webp  a 192px face-framed square (head and shoulders, the
 *                      same framing whatever the source photo's crop) for
 *                      avatars — a few KB
 *   <name>.web.webp    the photo's own framing capped at 900px, for banners
 *                      and cards — tens of KB
 *
 * A photo uploaded before its variants exist simply falls back to the
 * original, so nothing here depends on the variants being present.
 */
export type HeadshotVariant = "thumb" | "web";

const BUCKET_MARKER = "/storage/v1/object/public/player-photos/";

/** The variant's URL for a player-photos URL, or null when there isn't one. */
export function headshotVariantUrl(url: string | null | undefined, variant: HeadshotVariant): string | null {
  if (!url || !url.includes(BUCKET_MARKER)) return null;
  const [base, query] = url.split("?");
  if (/\.(thumb|web)\.webp$/i.test(base)) return null;
  const dot = base.lastIndexOf(".");
  if (dot <= base.lastIndexOf("/")) return null;
  return `${base.slice(0, dot)}.${variant}.webp${query ? `?${query}` : ""}`;
}

/**
 * Resolves a headshot URL to its variant when one exists, for callers that
 * need a plain URL (share cards, canvas capture) rather than an <img>.
 * Null while the variant is being checked, then the variant or the original.
 */
export function useHeadshotUrl(url: string | null | undefined, variant: HeadshotVariant): string | null {
  const variantUrl = headshotVariantUrl(url, variant);
  const [resolved, setResolved] = useState<string | null>(variantUrl ? null : url ?? null);
  useEffect(() => {
    if (!url) { setResolved(null); return; }
    if (!variantUrl) { setResolved(url); return; }
    let cancelled = false;
    setResolved(null);
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setResolved(variantUrl); };
    probe.onerror = () => { if (!cancelled) setResolved(url); };
    probe.src = variantUrl;
    return () => { cancelled = true; };
  }, [url, variantUrl]);
  return resolved;
}

interface PlayerHeadshotProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** The original photo URL (what getPlayerPhotoUrlCached returns). */
  src: string;
  variant?: HeadshotVariant;
  /**
   * Extra classes/styles applied only when the original is shown instead of
   * the variant — e.g. the crop that points a tall, uncropped photo at the
   * face. The thumb variant is already framed and needs none of it.
   */
  fallbackClassName?: string;
  fallbackStyle?: CSSProperties;
}

export function PlayerHeadshot({
  src, variant = "thumb", className = "", style, fallbackClassName = "", fallbackStyle, onError, ...rest
}: PlayerHeadshotProps) {
  const variantUrl = headshotVariantUrl(src, variant);
  const [useOriginal, setUseOriginal] = useState(!variantUrl);
  useEffect(() => { setUseOriginal(!variantUrl); }, [variantUrl]);

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if (!useOriginal) { setUseOriginal(true); return; }
    onError?.(event);
  };

  return (
    <img
      {...rest}
      src={useOriginal || !variantUrl ? src : variantUrl}
      className={useOriginal ? `${className} ${fallbackClassName}`.trim() : className}
      style={useOriginal ? { ...style, ...fallbackStyle } : style}
      onError={handleError}
    />
  );
}
