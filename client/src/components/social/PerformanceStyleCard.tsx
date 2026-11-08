import { useEffect, useRef } from "react";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import { renderPerformanceStyle, type PerformanceStyle } from "@/lib/generatePerformanceStyles";

/**
 * A canvas-drawn performance style, shown wherever the DOM templates are shown
 * (the post queue's thumbnails). The export never captures this: the capture
 * path draws the same canvas straight to a PNG.
 */
export function PerformanceStyleCard({ data, style }: { data: PlayerPerformanceV1Data; style: PerformanceStyle }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    renderPerformanceStyle(data, style)
      .then((canvas) => {
        if (!live || !host.current) return;
        canvas.style.cssText = "display:block;width:100%;height:100%;";
        host.current.replaceChildren(canvas);
      })
      .catch((err) => console.error("[SocialTools] style preview failed:", err));
    return () => {
      live = false;
    };
  }, [data, style]);
  return <div ref={host} style={{ width: 1080, height: 1350, background: "#0b0b0d" }} data-testid={`card-style-${style}`} />;
}
