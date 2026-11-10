import { useEffect, useRef, useState } from "react";

interface Flash { id: number; x: number; y: number; size: number }

/**
 * A backdrop of camera flashes, like a press row seen from across the floor:
 * one small burst of light every few seconds, somewhere different each time.
 *
 * Kept gentle on purpose. Each flash is a soft bloom that fades over most of a
 * second, never more than one every couple of seconds, and it covers a small
 * part of the screen, far below anything that could trouble someone
 * sensitive to flashing light. It stops entirely for visitors who ask their
 * device for reduced motion, and pauses while the tab or the backdrop is out
 * of view. The look is in index.css (.media-flash).
 */
export default function CameraFlashes({ className = "" }: { className?: string }) {
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let next = 1;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.05 });
    if (root.current) observer.observe(root.current);

    const fire = () => {
      if (visible && !document.hidden) {
        const id = next++;
        // Anywhere across the width, weighted towards the upper part where a crowd would be.
        const flash: Flash = { id, x: 6 + Math.random() * 88, y: 8 + Math.pow(Math.random(), 1.4) * 70, size: 0.55 + Math.random() * 0.75 };
        setFlashes((list) => [...list, flash]);
        window.setTimeout(() => setFlashes((list) => list.filter((f) => f.id !== id)), 1400);
      }
      timer = window.setTimeout(fire, 2600 + Math.random() * 3400);
    };
    timer = window.setTimeout(fire, 1500 + Math.random() * 1500);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={root} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} data-testid="camera-flashes">
      {flashes.map((f) => (
        <span key={f.id} className="media-flash" style={{ left: `${f.x}%`, top: `${f.y}%`, ["--flash-size" as string]: f.size }}>
          <span className="media-flash-bloom" />
          <span className="media-flash-streak" />
          <span className="media-flash-core" />
        </span>
      ))}
    </div>
  );
}
