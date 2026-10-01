import { useEffect, useRef, type ReactNode } from "react";

/**
 * Makes a card feel like a physical collectable: it leans a few degrees as
 * the phone tilts (or as the mouse moves over it on desktop) and a soft glare
 * slides across the face. Purely visual — downloads are drawn separately, so
 * the saved image is unaffected.
 *
 * Tilt is measured from how the phone is held, so any natural viewing angle
 * reads as "flat". Pages can show several cards at once, so they share one
 * orientation listener, only animate while moving, and ignore cards that are
 * off screen.
 */

const MAX_TILT_DEG = 10;
// Degrees of phone movement that map to the full card tilt.
const PHONE_RANGE_DEG = 20;
// Per-frame easing toward the target; lower is smoother but laggier.
const EASE = 0.12;
// How quickly the resting angle follows a changed grip.
const BASELINE_DRIFT = 0.01;
// After this long with no card listening, the next reading becomes the new
// resting angle. Shorter gaps (one card handing over to the next in a fan)
// keep it, so the new card doesn't snap flat.
const BASELINE_RESET_MS = 1000;

type Tilt = { x: number; y: number };
type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

let permissionRequested = false;

/**
 * iOS only reports device orientation after the user grants permission, and
 * the request must come from a tap. Asks once per page load; elsewhere it's a
 * no-op.
 */
export function requestTiltPermission() {
  if (permissionRequested || typeof window === "undefined") return;
  const DOE = window.DeviceOrientationEvent as unknown as OrientationPermission | undefined;
  if (!DOE?.requestPermission) return;
  permissionRequested = true;
  DOE.requestPermission().catch(() => {});
}

// ── shared phone orientation ────────────────────────────────────────────────
const subscribers = new Set<(t: Tilt) => void>();
let baseline: { beta: number; gamma: number } | null = null;
let lastUnsubscribedAt = 0;

function onOrientation(e: DeviceOrientationEvent) {
  if (e.beta == null || e.gamma == null) return;
  // In landscape the phone's axes are swapped relative to the screen.
  const angle = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
  let beta = e.beta, gamma = e.gamma;
  if (angle === 90) [beta, gamma] = [-gamma, beta];
  else if (angle === -90 || angle === 270) [beta, gamma] = [gamma, -beta];
  if (!baseline) baseline = { beta, gamma };
  // Let the resting point drift slowly so a changed grip doesn't leave cards stuck leaning.
  baseline.beta += (beta - baseline.beta) * BASELINE_DRIFT;
  baseline.gamma += (gamma - baseline.gamma) * BASELINE_DRIFT;
  const tilt = {
    x: clamp((gamma - baseline.gamma) / PHONE_RANGE_DEG, 1),
    y: clamp((beta - baseline.beta) / PHONE_RANGE_DEG, 1),
  };
  subscribers.forEach((fn) => fn(tilt));
}

function subscribeOrientation(fn: (t: Tilt) => void) {
  if (subscribers.size === 0) {
    if (Date.now() - lastUnsubscribedAt > BASELINE_RESET_MS) baseline = null;
    window.addEventListener("deviceorientation", onOrientation);
  }
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      window.removeEventListener("deviceorientation", onOrientation);
      lastUnsubscribedAt = Date.now();
    }
  };
}

export default function TiltCard({
  children,
  enabled = true,
  className = "",
}: {
  children: ReactNode;
  /** Off rests the card flat, e.g. for the side cards of a fan. */
  enabled?: boolean;
  className?: string;
}) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tiltEl = tiltRef.current;
    const glareEl = glareRef.current;
    if (!tiltEl || !glareEl) return;
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      tiltEl.style.transform = "";
      glareEl.style.opacity = "0";
      return;
    }

    // Target and current tilt, each -1..1 (x: left/right, y: towards/away).
    const target: Tilt = { x: 0, y: 0 };
    const current: Tilt = { x: 0, y: 0 };
    let frame = 0;

    const render = () => {
      current.x += (target.x - current.x) * EASE;
      current.y += (target.y - current.y) * EASE;
      const settled = Math.abs(target.x - current.x) < 0.002 && Math.abs(target.y - current.y) < 0.002;
      if (settled) { current.x = target.x; current.y = target.y; }
      tiltEl.style.transform =
        `perspective(900px) rotateX(${(-current.y * MAX_TILT_DEG).toFixed(2)}deg) rotateY(${(current.x * MAX_TILT_DEG).toFixed(2)}deg)`;
      const strength = Math.min(1, Math.hypot(current.x, current.y));
      glareEl.style.opacity = (strength * 0.6).toFixed(3);
      glareEl.style.backgroundPosition = `${50 - current.x * 40}% ${50 - current.y * 40}%`;
      frame = settled ? 0 : requestAnimationFrame(render);
    };
    const setTarget = (t: Tilt) => {
      target.x = t.x;
      target.y = t.y;
      if (!frame) frame = requestAnimationFrame(render);
    };

    // Only follow the phone while the card is on screen.
    let unsubscribe: (() => void) | null = null;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !unsubscribe) unsubscribe = subscribeOrientation(setTarget);
      else if (!entry.isIntersecting && unsubscribe) { unsubscribe(); unsubscribe = null; setTarget({ x: 0, y: 0 }); }
    });
    io.observe(tiltEl);

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = tiltEl.getBoundingClientRect();
      setTarget({
        x: clamp(((e.clientX - r.left) / r.width - 0.5) * 2, 1),
        y: clamp(((e.clientY - r.top) / r.height - 0.5) * 2, 1),
      });
    };
    const onPointerLeave = (e: PointerEvent) => { if (e.pointerType === "mouse") setTarget({ x: 0, y: 0 }); };
    // Cards not opened by a tap (carousels, rows) ask on the first touch instead.
    const onPointerDown = (e: PointerEvent) => { if (e.pointerType !== "mouse") requestTiltPermission(); };

    tiltEl.addEventListener("pointermove", onPointerMove);
    tiltEl.addEventListener("pointerleave", onPointerLeave);
    tiltEl.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      unsubscribe?.();
      tiltEl.removeEventListener("pointermove", onPointerMove);
      tiltEl.removeEventListener("pointerleave", onPointerLeave);
      tiltEl.removeEventListener("pointerdown", onPointerDown);
      tiltEl.style.transform = "";
      glareEl.style.opacity = "0";
    };
  }, [enabled]);

  return (
    <div ref={tiltRef} className={`relative [transform-style:preserve-3d] ${className}`}>
      {children}
      <div
        ref={glareRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[18px] mix-blend-soft-light"
        style={{
          opacity: 0,
          backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.25) 25%, transparent 55%)",
          backgroundSize: "200% 200%",
          backgroundPosition: "50% 50%",
        }}
      />
    </div>
  );
}
