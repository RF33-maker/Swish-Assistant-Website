import { Link, useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/home/motion";
import { HoverExpand, type HoverExpandImage } from "@/components/ui/expand-on-hover";
import { photoSrcSet, photoUrl, type Photo, type Photographer } from "@/lib/mediaSpotlight";
import { HandleText } from "./PhotographerBits";

/**
 * A featured photographer on /media: their name and handle, then a row of
 * their photos that opens the one you hover. Clicking the open photo goes to
 * their profile with that photo in the lightbox.
 */
export default function PhotographerShowcase({ photographer, photos, delay = 0, max = 8 }: { photographer: Photographer; photos: Photo[]; delay?: number; max?: number }) {
  const [, setLocation] = useLocation();
  const href = `/media/photographers/${photographer.slug}`;
  const images: HoverExpandImage[] = photos.slice(0, max).map((p) => ({
    src: photoUrl(p, "medium"),
    srcSet: photoSrcSet(p),
    // The open tile is about 530px wide on a laptop; the rest are slivers that can open to the same size.
    sizes: "(min-width: 1024px) 500px, 85vw",
    alt: p.caption || `Photo by ${photographer.display_name}`,
    code: p.event_name || p.caption || undefined,
    href: `${href}?photo=${p.id}`,
    color: p.dominant_color,
  }));

  return (
    <Reveal delay={delay} className="border-t border-[color:var(--ch-border)] py-8 md:py-10">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="ch-display truncate text-[1.75rem] font-bold uppercase leading-none tracking-tight text-[color:var(--ch-text)] md:text-[2.5rem]">
            <Link href={href} className="hover:text-[color:var(--ch-accent)]">{photographer.display_name}</Link>
          </h3>
          <HandleText handle={photographer.handle} className="mt-1.5 block text-[15px] font-medium text-[color:var(--ch-text-2)] md:text-base" />
        </div>
        <Link href={href} className="hidden shrink-0 items-center gap-1.5 text-[14px] font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-4 sm:inline-flex">
          View profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {images.length ? (
        <HoverExpand
          images={images}
          className="mt-5"
          itemClassName="h-56 sm:h-72 md:h-80 lg:h-96 [&:nth-child(n+6)]:hidden sm:[&:nth-child(n+6)]:block"
          onOpen={(img) => img.href && setLocation(img.href)}
        />
      ) : (
        <div className="mt-5 flex h-40 items-center gap-2 rounded-2xl border border-dashed border-[color:var(--ch-border-strong)] px-4 text-sm text-[color:var(--ch-muted)]">
          No photos yet
        </div>
      )}
    </Reveal>
  );
}
