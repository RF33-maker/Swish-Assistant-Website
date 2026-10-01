import { useEffect, useRef, type ReactNode } from "react";

/**
 * Makes a card feel like a physical collectable: it leans a few degrees as
 * the phone tilts (or as the mouse moves over it on desktop) and a soft glare
 * slides across the face. Purely visual — downloads are drawn separately, so
 * the saved image is unaffected.
 *
 * Tilt is measured from how the phone is held when the card opens, so any
 * natural viewing angle reads as "flat".
 */

const MAX_TILT_DEG = 10;
// Degrees of phone movement that map to the full card tilt.
const PHONE_RANGE_DEG = 20;
// Per-frame easing toward the target; lower is smoother but laggier.
const EASE = 0.12;

type OrientationPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * iOS only reports device orientation after the user grants permission, and
 * the request must come from a tap. Call this from the click that opens the
 * card; elsewhere it resolves immediately.
 */
export function requestTiltPermission() {
  const DOE = typeof window !== "undefined" ? (window.DeviceOrientationEvent as unknown as OrientationPermission | undefined) : undefined;
  if (DOE?.requestPermission) DOE.requestPermission().catch(() => {});
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

export default function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tiltEl = tiltRef.current;
    const glareEl = glareRef.current;
    if (!tiltEl || !glareEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Target and current tilt, each -1..1 (x: left/right, y: towards/away).
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let baseline: { beta: number; gamma: number } | null = null;
    let frame = 0;

    const render = () => {
      current.x += (target.x - current.x) * EASE;
      current.y += (target.y - current.y) * EASE;
      tiltEl.style.transform =
        `perspective(900px) rotateX(${(-current.y * MAX_TILT_DEG).toFixed(2)}deg) rotateY(${(current.x * MAX_TILT_DEG).toFixed(2)}deg)`;
      const strength = Math.min(1, Math.hypot(current.x, current.y));
      glareEl.style.opacity = (0.15 + strength * 0.45).toFixed(3);
      glareEl.style.backgroundPosition = `${50 - current.x * 40}% ${50 - current.y * 40}%`;
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      // In landscape the phone's axes are swapped relative to the screen.
      const angle = (screen.orientation?.angle ?? (window as any).orientation ?? 0) as number;
      let beta = e.beta, gamma = e.gamma;
      if (angle === 90) [beta, gamma] = [-gamma, beta];
      else if (angle === -90 || angle === 270) [beta, gamma] = [gamma, -beta];
      if (!baseline) baseline = { beta, gamma };
      // Let the resting point drift slowly so a changed grip doesn't leave the card stuck leaning.
      baseline.beta += (beta - baseline.beta) * 0.01;
      baseline.gamma += (gamma - baseline.gamma) * 0.01;
      target.x = clamp((gamma - baseline.gamma) / PHONE_RANGE_DEG, 1);
      target.y = clamp((beta - baseline.beta) / PHONE_RANGE_DEG, 1);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = tiltEl.getBoundingClientRect();
      target.x = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, 1);
      target.y = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, 1);
    };
    const onPointerLeave = () => { target.x = 0; target.y = 0; };

    window.addEventListener("deviceorientation", onOrientation);
    tiltEl.addEventListener("pointermove", onPointerMove);
    tiltEl.addEventListener("pointerleave", onPointerLeave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("deviceorientation", onOrientation);
      tiltEl.removeEventListener("pointermove", onPointerMove);
      tiltEl.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <div ref={tiltRef} className={`relative will-change-transform [transform-style:preserve-3d] ${className}`}>
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
