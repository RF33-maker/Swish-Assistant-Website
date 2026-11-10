import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A row of images where the hovered (or tapped) one opens wide and the rest
 * fold into slim strips. Widths are shares of the row, so it fits any
 * container: the open image takes `expand` parts, each other image one part.
 *
 * Adapted from the "expand on hover" pattern (21st.dev, Skiper 52): the
 * sizes here are fluid instead of fixed rem values, the swiper styles it
 * imported went unused and are dropped, and reduced motion is respected.
 */
export interface HoverExpandImage {
  src: string;
  alt: string;
  /** Small caption shown in the open image's corner. */
  code?: string;
  /** Where the open image goes when clicked again. */
  href?: string;
  /** Background while the image loads. */
  color?: string | null;
  srcSet?: string;
  sizes?: string;
}

export function HoverExpand({
  images,
  className,
  itemClassName,
  initial = 0,
  expand = 7,
  onOpen,
}: {
  images: HoverExpandImage[];
  className?: string;
  /** Extra classes for each image frame (height lives here). */
  itemClassName?: string;
  /** Which image starts open; null for none. */
  initial?: number | null;
  /** How many parts of the row the open image takes (each other image takes one). */
  expand?: number;
  /** Clicking an image that is already open. When given, it replaces the plain link navigation. */
  onOpen?: (image: HoverExpandImage, index: number) => void;
}) {
  const [active, setActive] = useState<number | null>(initial);
  const reduced = useReducedMotion();
  const spring = reduced ? { duration: 0 } : { duration: 0.35, ease: [0.2, 0.7, 0.2, 1] as const };

  if (!images.length) return null;

  return (
    <div className={cn("flex w-full items-stretch gap-1.5", className)}>
      {images.map((image, index) => {
        const open = active === index;
        const inner = (
          <>
            <img
              src={image.src}
              srcSet={image.srcSet}
              sizes={image.sizes}
              alt={image.alt}
              loading={index < 3 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <AnimatePresence>
              {open && (
                <motion.div
                  key="shade"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.25 }}
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/0 to-transparent"
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {open && image.code && (
                <motion.p
                  key="code"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0 : 0.25 }}
                  className="pointer-events-none absolute bottom-3 right-3.5 line-clamp-2 max-w-[80%] text-right text-[12px] leading-snug text-white/75"
                >
                  {image.code}
                </motion.p>
              )}
            </AnimatePresence>
          </>
        );
        const frame = "relative block min-w-0 overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ch-accent)]";
        return (
          <motion.div
            key={`${image.src}-${index}`}
            initial={false}
            animate={{ flexGrow: open ? expand : 1 }}
            transition={spring}
            style={{ flexBasis: 0, background: image.color || "var(--ch-surface-3)" }}
            onHoverStart={() => setActive(index)}
            onFocus={() => setActive(index)}
            className={cn(frame, "cursor-pointer", itemClassName)}
          >
            {open && image.href ? (
              <a
                href={image.href}
                onClick={(e) => {
                  if (!onOpen) return;
                  e.preventDefault();
                  onOpen(image, index);
                }} aria-label={image.alt || "Open photo"} className="absolute inset-0 block">
                {inner}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => (open ? onOpen?.(image, index) : setActive(index))}
                aria-label={open ? image.alt || "Photo" : `Show ${image.alt || "photo"}`}
                aria-pressed={open}
                className="absolute inset-0 block w-full"
              >
                {inner}
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export default HoverExpand;
