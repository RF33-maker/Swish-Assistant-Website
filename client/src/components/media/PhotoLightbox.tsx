import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Calendar, ChevronLeft, ChevronRight, Copy, Check, MapPin, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { creditLine, formatTakenAt, photoSrcSet, photoUrl, TAG_TYPES, type Photo, type PhotoTag, type Photographer } from "@/lib/mediaSpotlight";

/**
 * Full-screen view of one photo with its caption, tags and credit line, and
 * arrows / keys to move through the gallery. Shows the medium and large web
 * variants only; the original never leaves storage.
 */
export default function PhotoLightbox({
  photos,
  index,
  photographer,
  tags,
  onClose,
  onIndexChange,
}: {
  photos: Photo[];
  index: number;
  photographer: Pick<Photographer, "display_name" | "handle" | "credit_line" | "slug">;
  tags?: Map<string, PhotoTag[]>;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const photo = photos[index];
  const [copied, setCopied] = useState(false);
  const prev = useCallback(() => onIndexChange((index - 1 + photos.length) % photos.length), [index, photos.length, onIndexChange]);
  const next = useCallback(() => onIndexChange((index + 1) % photos.length), [index, photos.length, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, prev, next]);

  // Warm the neighbours so arrows feel instant.
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const p = photos[(i + photos.length) % photos.length];
      // The medium copy only: the 4K one is fetched when the photo is actually opened.
      if (p) new Image().src = photoUrl(p, "medium");
    }
  }, [index, photos]);

  if (!photo) return null;
  const credit = creditLine(photographer);
  const photoTags = tags?.get(photo.id) ?? [];
  const teams = photoTags.filter((t) => t.tag_type === "team").map((t) => t.tag_value);
  const others = photoTags.filter((t) => t.tag_type !== "team");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credit);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ title: "Couldn't copy", description: credit });
    }
  };

  // On a phone: swipe sideways between photos, swipe down to close.
  let touchX: number | null = null;
  let touchY: number | null = null;
  const onTouchStart = (e: React.TouchEvent) => {
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX === null || touchY === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = touchY = null;
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy > 80) onClose();
      return;
    }
    if (dx > 60) prev();
    else if (dx < -60) next();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || `Photo by ${photographer.display_name}`}
      className="media-lightbox fixed inset-0 z-[100] flex flex-col bg-black/95 text-white"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 text-sm text-white/70">
          <span className="tabular-nums">{index + 1} / {photos.length}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 pl-3 pr-3.5 text-sm font-semibold hover:bg-white/20">
          <X className="h-4 w-4" aria-hidden="true" /> Close
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 md:px-16" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {photos.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 hover:bg-white/20 md:inline-flex"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
        <img
          key={photo.id}
          src={photoUrl(photo, "medium")}
          srcSet={photoSrcSet(photo, ["medium", "large"])}
          sizes="100vw"
          alt={photo.caption || ""}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full select-none object-contain"
          style={{ background: photo.dominant_color || undefined }}
        />
        {photos.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/10 p-2.5 hover:bg-white/20 md:inline-flex"
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="px-4 py-4 md:px-6" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            {photo.caption && <p className="text-[15px] font-medium leading-snug">{photo.caption}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/60">
              {photo.event_name && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{photo.event_name}</span>}
              {photo.taken_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" aria-hidden="true" />{formatTakenAt(photo.taken_at)}</span>}
              {others.map((t) => (
                <span key={t.id}><span className="text-white/40">{TAG_TYPES[t.tag_type]}:</span> {t.tag_value}</span>
              ))}
            </div>
            {teams.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {teams.map((t) => (
                  <span key={t} className="rounded-full bg-white/10 px-2.5 py-0.5 text-[12px] font-medium text-white/80">{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/media/photographers/${photographer.slug}`} className="text-[13px] text-white/70 underline-offset-2 hover:underline">
              {credit}
            </Link>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-semibold hover:bg-white/20"
              aria-label="Copy credit line"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? "Copied" : "Copy credit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
