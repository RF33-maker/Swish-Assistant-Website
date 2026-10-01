import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * A fanned hand of cards — up to seven visible, the centre one upright and
 * the rest rotated and scaled out either side — that springs in when it
 * scrolls into view, spreads apart on hover, and cycles with the arrows,
 * the dots, a swipe, the arrow keys or by clicking a side card.
 *
 * Adapted from 21st.dev's "card fan carousel": the same fan geometry,
 * responsive scaling and elastic timings, but animated with CSS transitions
 * driven from here instead of GSAP (so no extra dependency), rendering any
 * content rather than only images, and treating the cards as a ring so it
 * can auto-advance. Sizes come from the .fan-layout CSS variables.
 */

const MAX_VISIBLE = 7;
const REM = 16;

const FAN_POSITIONS = [
  { rot: -21, scale: 0.7756, x: -30, y: 7.3, zIndex: 1 },
  { rot: -14, scale: 0.8498, x: -22, y: 4.0, zIndex: 2 },
  { rot: -7, scale: 0.9346, x: -11, y: 1.3, zIndex: 3 },
  { rot: 0, scale: 1.0, x: 0, y: 0.0, zIndex: 10 },
  { rot: 7, scale: 0.9346, x: 11, y: 1.3, zIndex: 3 },
  { rot: 14, scale: 0.8498, x: 22, y: 4.0, zIndex: 2 },
  { rot: 21, scale: 0.7756, x: 30, y: 7.3, zIndex: 1 },
];

function getSlotConfig(visible: number, slot: number) {
  if (visible >= MAX_VISIBLE) return FAN_POSITIONS[slot];
  const center = visible >> 1;
  const distance = visible > 1 ? (slot - center) / center : 0;
  const abs = Math.abs(distance);
  return {
    rot: distance * 21,
    scale: 1 - 0.2244 * abs * abs,
    x: distance * 30,
    y: abs * abs * 7.3,
    zIndex: 10 - Math.abs(slot - center),
  };
}

/** Odd, so there's a true centre card: 7 at most, else the largest odd count. */
function visibleCountFor(total: number) {
  if (total >= MAX_VISIBLE) return MAX_VISIBLE;
  if (total <= 1) return total;
  return total % 2 === 1 ? total : total - 1;
}

// ── Easing: GSAP's elastic.out as a CSS linear() curve, sampled once ──
function elasticOut(amplitude: number, period: number) {
  const a = Math.max(1, amplitude);
  const shift = (period / (2 * Math.PI)) * Math.asin(1 / a);
  const w = (2 * Math.PI) / period;
  return (t: number) => (t >= 1 ? 1 : a * Math.pow(2, -10 * t) * Math.sin((t - shift) * w) + 1);
}
function toLinear(fn: (t: number) => number, steps: number) {
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) points.push(fn(i / steps).toFixed(4));
  return `linear(${points.join(", ")})`;
}
const SUPPORTS_LINEAR =
  typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("transition-timing-function", "linear(0, 1)");
const EASE_ELASTIC_IN = SUPPORTS_LINEAR ? toLinear(elasticOut(1.05, 0.78), 60) : "cubic-bezier(.34,1.56,.64,1)";
const EASE_ELASTIC_HOVER = SUPPORTS_LINEAR ? toLinear(elasticOut(1, 0.75), 50) : "cubic-bezier(.34,1.4,.64,1)";
const EASE_OUT = "cubic-bezier(.25,.46,.45,.94)"; // ≈ power2.out
const EASE_IN = "cubic-bezier(.55,.085,.68,.53)"; // ≈ power2.in

interface Pose { x: number; y: number; rot: number; scale: number; opacity: number; zIndex: number }

function writePose(el: HTMLElement, p: Pose) {
  el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rot}deg) scale(${p.scale})`;
  el.style.opacity = String(p.opacity);
  el.style.zIndex = String(p.zIndex);
  el.style.pointerEvents = p.opacity > 0.05 ? "auto" : "none";
}

function animatePose(
  el: HTMLElement,
  to: Pose,
  opts: { from?: Pose; duration?: number; delay?: number; ease?: string } | null,
) {
  if (!opts) {
    el.style.transition = "none";
    writePose(el, to);
    return;
  }
  if (opts.from) {
    el.style.transition = "none";
    writePose(el, { ...opts.from, zIndex: to.zIndex });
    void el.offsetWidth; // commit the start pose before transitioning
  }
  const d = opts.duration ?? 0.5;
  const delay = opts.delay ?? 0;
  el.style.transition = `transform ${d}s ${opts.ease ?? EASE_OUT} ${delay}s, opacity ${Math.min(d, 0.45)}s ease ${delay}s`;
  writePose(el, to);
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface CardFanCarouselProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderCard: (item: T, state: { index: number; isCenter: boolean }) => ReactNode;
  /** Called when the centre card itself is clicked (side cards come to the centre instead). */
  onCenterClick?: (index: number) => void;
  /** Advance to the next card on this interval (ms) while in view and not hovered. */
  autoAdvanceMs?: number;
  ariaLabel?: string;
  /** Accessible label for card i, for the dots and the live region. */
  getLabel?: (item: T, index: number) => string;
  className?: string;
}

export default function CardFanCarousel<T>({
  items,
  getKey,
  renderCard,
  onCenterClick,
  autoAdvanceMs,
  ariaLabel = "Cards",
  getLabel,
  className = "",
}: CardFanCarouselProps<T>) {
  const total = items.length;
  const visible = visibleCountFor(total);
  const half = visible >> 1;
  const canCycle = total > 1;

  const [center, setCenter] = useState(0);
  const [inView, setInView] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const entered = useRef(false);
  const busy = useRef(false);
  const busyTimer = useRef<number>();
  const direction = useRef<"left" | "right">("right");
  const prevVisible = useRef<Set<number>>(new Set());
  const lastPose = useRef<Map<number, Pose>>(new Map());
  const hovered = useRef<number | null>(null); // hovered slot
  const pointerInside = useRef(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const reduced = prefersReducedMotion();

  // Keep the centre valid if the item list shrinks.
  useEffect(() => {
    if (center >= total && total > 0) setCenter(0);
  }, [center, total]);

  const slotMap = useCallback(
    (c: number) => {
      const map = new Map<number, number>();
      for (let slot = 0; slot < visible; slot++) {
        map.set((((c + slot - half) % total) + total) % total, slot);
      }
      return map;
    },
    [visible, half, total],
  );

  /** Horizontal spread: fits the fan to the container's width. */
  const xMultiplier = () => {
    const el = layoutRef.current;
    if (!el) return 1;
    const cardW = parseFloat(getComputedStyle(el).getPropertyValue("--fan-card-w")) * REM || 17 * REM;
    const spread = visible >= MAX_VISIBLE ? 30 : visible > 1 ? 30 : 0;
    if (!spread) return 1;
    return Math.max(0.16, Math.min(1, (el.clientWidth - cardW * 0.82) / (2 * spread * REM)));
  };
  /** Vertical offsets shrink on short screens so the fan fits in ~70vh. */
  const yMultiplier = () => {
    const el = layoutRef.current;
    if (!el) return 1;
    const cardH = parseFloat(getComputedStyle(el).getPropertyValue("--fan-card-h")) * REM || 26 * REM;
    const ideal = cardH + 8.5 * REM;
    const available = window.innerHeight * 0.7;
    return available >= ideal ? 1 : Math.max(0.35, available / ideal);
  };

  const poseFor = (slot: number, mx: number, my: number): Pose => {
    const c = getSlotConfig(visible, slot);
    return { x: c.x * mx * REM, y: c.y * my * REM, rot: c.rot, scale: c.scale, opacity: 1, zIndex: c.zIndex };
  };

  const markBusy = (ms: number) => {
    busy.current = true;
    window.clearTimeout(busyTimer.current);
    busyTimer.current = window.setTimeout(() => { busy.current = false; }, ms);
  };

  // Play the entrance when the fan first scrolls into view.
  useEffect(() => {
    const el = layoutRef.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined" || reduced) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        io.disconnect();
      }
    }, { threshold: 0.25 });
    io.observe(el);
    // Never leave the cards hidden if the observer is held up.
    const failsafe = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) setInView(true);
    }, 3000);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, [inView, reduced, total]);

  // Lay the cards out whenever the centre changes (and on entrance).
  useLayoutEffect(() => {
    const els = cardRefs.current;
    if (!total) return;
    const my = yMultiplier();
    if (!inView) {
      for (let i = 0; i < total; i++) {
        const el = els[i];
        if (el) animatePose(el, { x: 0, y: 12 * my * REM, rot: 0, scale: 0.5, opacity: 0, zIndex: 0 }, null);
      }
      return;
    }
    const mx = xMultiplier();
    const map = slotMap(center);
    const prev = prevVisible.current;
    const dir = direction.current;
    const first = !entered.current;

    for (let i = 0; i < total; i++) {
      const el = els[i];
      if (!el) continue;
      const slot = map.get(i);
      if (slot !== undefined) {
        const to = poseFor(slot, mx, my);
        if (reduced) animatePose(el, to, null);
        else if (first) {
          animatePose(el, to, {
            from: { x: 0, y: 12 * my * REM, rot: 0, scale: 0.5, opacity: 0, zIndex: to.zIndex },
            duration: 1.2,
            delay: 0.2 + slot * 0.06,
            ease: EASE_ELASTIC_IN,
          });
        } else if (!prev.has(i)) {
          const side = dir === "right" ? 1 : -1;
          animatePose(el, to, {
            from: { x: 40 * side * REM, y: to.y, rot: 30 * side, scale: 0.5, opacity: 0, zIndex: to.zIndex },
            duration: 0.6,
          });
        } else {
          animatePose(el, to, { duration: 0.5 });
        }
        lastPose.current.set(i, to);
      } else if (prev.has(i)) {
        const side = dir === "right" ? -1 : 1;
        const last = lastPose.current.get(i);
        const to: Pose = { x: 40 * side * REM, y: last?.y ?? 0, rot: 30 * side, scale: 0.5, opacity: 0, zIndex: 0 };
        animatePose(el, to, reduced ? null : { duration: 0.4, ease: EASE_IN });
        lastPose.current.set(i, to);
      } else {
        animatePose(el, { x: 0, y: 0, rot: 0, scale: 0.3, opacity: 0, zIndex: 0 }, null);
      }
    }
    prevVisible.current = new Set(map.keys());
    entered.current = true;
    hovered.current = null;
    if (!reduced) markBusy(first ? 1400 + visible * 60 : 650);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, total, inView, slotMap]);

  /** Spread the fan apart around a hovered card (or settle back). */
  const hoverLayout = useCallback(
    (hoveredSlot: number | null) => {
      if (reduced) return;
      const els = cardRefs.current;
      const mx = xMultiplier();
      const my = yMultiplier();
      const map = slotMap(center);
      const centerSlot = half;
      map.forEach((slot, i) => {
        const el = els[i];
        if (!el) return;
        const base = poseFor(slot, mx, my);
        let { x, y, rot, scale } = base;
        let delay = 0;
        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot);
          delay = distance * 0.02;
          if (slot === hoveredSlot) {
            y -= 2.5 * my * REM;
            scale *= 1.08;
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
            const push = 8 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));
            if (slot < hoveredSlot) {
              x -= push * mx * REM;
              rot -= 3 / (distance + 1);
            } else {
              x += push * mx * REM;
              rot += 3 / (distance + 1);
            }
            if (slot === visible - 1 && hoveredSlot < centerSlot) y -= 1 * my * REM;
            if (slot === 0 && hoveredSlot > centerSlot) y -= 1 * my * REM;
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02;
        }
        animatePose(el, { ...base, x, y, rot, scale }, { duration: 0.5, delay, ease: EASE_ELASTIC_HOVER });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [center, slotMap, half, visible, reduced],
  );

  // Re-fit on resize.
  useEffect(() => {
    const el = layoutRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!entered.current || busy.current) return;
      hoverLayout(hovered.current);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hoverLayout]);

  const goTo = useCallback(
    (target: number) => {
      if (!canCycle || target === center) return;
      if (busy.current && entered.current) return;
      const forward = (target - center + total) % total;
      direction.current = forward <= total / 2 ? "right" : "left";
      setCenter(target);
    },
    [canCycle, center, total],
  );
  const step = useCallback(
    (dir: "left" | "right") => goTo(dir === "right" ? (center + 1) % total : (center - 1 + total) % total),
    [goTo, center, total],
  );

  // Auto-advance while in view, visible and not being interacted with.
  useEffect(() => {
    if (!autoAdvanceMs || !canCycle || !inView || reduced) return;
    const id = window.setInterval(() => {
      if (document.hidden || pointerInside.current || busy.current) return;
      step("right");
    }, autoAdvanceMs);
    return () => window.clearInterval(id);
  }, [autoAdvanceMs, canCycle, inView, reduced, step]);

  if (!total) return null;

  const map = slotMap(center);
  const finePointer = typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

  const arrowClass =
    "relative inline-flex items-center justify-center h-10 w-10 md:h-11 md:w-11 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] backdrop-blur-md text-black/55 dark:text-white/65 hover:text-black/80 dark:hover:text-white hover:border-black/25 dark:hover:border-white/25 active:scale-95 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.4)] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400";

  return (
    <section
      className={`relative flex flex-col items-center w-full ${className}`}
      aria-roledescription="carousel"
      aria-label={ariaLabel}
    >
      <div
        ref={layoutRef}
        className="fan-layout"
        style={{ height: `calc(var(--fan-card-h) + ${8.5 * (typeof window !== "undefined" ? yMultiplierSafe() : 1)}rem)` }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") { e.preventDefault(); step("right"); }
          if (e.key === "ArrowLeft") { e.preventDefault(); step("left"); }
        }}
        onMouseEnter={() => { pointerInside.current = true; }}
        onMouseLeave={() => {
          pointerInside.current = false;
          if (!finePointer || busy.current) return;
          hovered.current = null;
          hoverLayout(null);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          swipeStart.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const s = swipeStart.current;
          swipeStart.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            suppressClick.current = true;
            window.setTimeout(() => { suppressClick.current = false; }, 350);
            step(dx < 0 ? "right" : "left");
          }
        }}
      >
        {items.map((item, i) => {
          const slot = map.get(i);
          const isCenter = i === center;
          return (
            <div
              key={getKey(item, i)}
              ref={(el) => { cardRefs.current[i] = el; }}
              className={`fan-card ${isCenter ? "is-center" : ""}`}
              aria-hidden={slot === undefined}
              onMouseEnter={() => {
                if (!finePointer || busy.current || slot === undefined) return;
                if (hovered.current !== slot) {
                  hovered.current = slot;
                  hoverLayout(slot);
                }
              }}
              onClickCapture={(e) => {
                if (suppressClick.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (!isCenter) {
                  // A side card comes to the centre rather than opening.
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(i);
                }
              }}
              onClick={() => { if (isCenter) onCenterClick?.(i); }}
            >
              {renderCard(item, { index: i, isCenter })}
            </div>
          );
        })}
      </div>

      {canCycle && (
        <div className="flex items-center justify-center gap-4 mt-3 md:mt-5 relative z-30">
          <button type="button" className={arrowClass} onClick={() => step("left")} aria-label="Previous">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1.5">
            {items.map((item, i) => (
              <button
                key={getKey(item, i)}
                type="button"
                onClick={() => goTo(i)}
                aria-label={getLabel ? `Show ${getLabel(item, i)}` : `Show card ${i + 1} of ${total}`}
                aria-current={i === center ? "true" : undefined}
                className="relative p-1.5 -m-1.5 group"
              >
                <span
                  className={`block h-2 rounded-full transition-all duration-300 ${
                    i === center ? "w-6 bg-orange-500" : "w-2 bg-black/15 dark:bg-white/20 group-hover:bg-black/30 dark:group-hover:bg-white/35"
                  }`}
                />
              </button>
            ))}
          </div>
          <button type="button" className={arrowClass} onClick={() => step("right")} aria-label="Next">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="sr-only" aria-live="polite">
        {getLabel ? getLabel(items[center] ?? items[0], center) : `Card ${center + 1} of ${total}`}
      </div>
    </section>
  );
}

/** Same as the fan's vertical multiplier, callable during render for the height. */
function yMultiplierSafe() {
  const width = window.innerWidth;
  const cardH = width >= 1024 ? 24.5 : width >= 768 ? 23 : width >= 640 ? 21.5 : width >= 480 ? 20 : 18.5;
  const ideal = (cardH + 8.5) * REM;
  const available = window.innerHeight * 0.7;
  return available >= ideal ? 1 : Math.max(0.35, available / ideal);
}
