import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * True once the element has scrolled into view (and stays true). Reduced
 * motion, or no IntersectionObserver, reports "in view" straight away so
 * nothing is ever left hidden.
 */
export function useInView<T extends Element>(options?: { rootMargin?: string; threshold?: number }) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(() => prefersReducedMotion() || typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      // The huge top margin counts everything *above* the viewport as seen:
      // a fast scroll or an anchor jump (#subscribe) can carry an element
      // from below the fold to above it without it ever crossing the
      // screen, and it must not be left invisible when scrolled back to.
      { rootMargin: options?.rootMargin ?? "100000px 0px -8% 0px", threshold: options?.threshold ?? 0.12 },
    );
    io.observe(el);
    // Safety net: browsers pause observer callbacks in background tabs and
    // some embedded views. If the element is on screen (or already scrolled
    // past) and still hasn't revealed after a moment, reveal it anyway —
    // content must never be left invisible.
    const failsafe = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) setInView(true);
    }, 2500);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [inView, options?.rootMargin, options?.threshold]);

  return { ref, inView };
}

/**
 * Fades and lifts its children in when scrolled into view. `delay` (ms)
 * staggers siblings. Styling lives in .ch-reveal (index.css), which is a
 * no-op under prefers-reduced-motion.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`ch-reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ ...style, transitionDelay: inView ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}

export { prefersReducedMotion };
