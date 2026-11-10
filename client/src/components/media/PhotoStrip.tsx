import { Link } from "wouter";
import { photoUrl, type Photo } from "@/lib/mediaSpotlight";

/**
 * A horizontal strip of a photographer's showcase photos that drifts
 * sideways on its own (CSS in index.css, "media-strip"). Each photo links to
 * the profile with that photo open. Fewer than four photos, or reduced
 * motion, and it is a plain row the reader can swipe.
 */
export default function PhotoStrip({
  photos,
  slug,
  height = 150,
  className = "",
}: {
  photos: Photo[];
  slug: string;
  /** Row height in px; widths follow each photo's aspect ratio. */
  height?: number;
  className?: string;
}) {
  if (!photos.length) {
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border border-dashed border-[color:var(--ch-border-strong)] px-4 text-sm text-[color:var(--ch-muted)] ${className}`}
        style={{ height }}
      >
        No photos yet
      </div>
    );
  }

  const loop = photos.length >= 4;
  // Longer strips move at the same speed: ~45px per second.
  const totalWidth = photos.reduce((sum, p) => sum + height * ((p.width && p.height ? p.width / p.height : 1.5)), 0);
  const duration = Math.max(20, Math.round(totalWidth / 45));
  const items = loop ? [...photos, ...photos] : photos;

  return (
    <div className={`media-strip ${loop ? "" : "is-static"} ${className}`} style={{ "--media-marquee-duration": `${duration}s` } as React.CSSProperties}>
      <div className="media-strip-track" style={{ height }}>
        {items.map((p, i) => {
          const ratio = p.width && p.height ? p.width / p.height : 1.5;
          return (
            <Link
              key={`${p.id}-${i}`}
              href={`/media/photographers/${slug}?photo=${p.id}`}
              aria-hidden={i >= photos.length ? true : undefined}
              tabIndex={i >= photos.length ? -1 : undefined}
              className="group relative block shrink-0 overflow-hidden rounded-lg"
              style={{ height, width: Math.round(height * ratio), background: p.dominant_color || "var(--ch-surface-3)" }}
            >
              <img
                src={photoUrl(p, "thumb")}
                alt={p.caption || ""}
                loading="lazy"
                decoding="async"
                width={Math.round(height * ratio)}
                height={height}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
