import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface PlatformStats {
  players: number;
  games: number;
  teams: number;
  competitions: number;
}

/** "7,705" → "7,700+", "183" → "180+": always an honest lower bound. */
function roundedDown(n: number): string {
  if (n < 10) return String(n);
  const step = n >= 1000 ? 100 : 10;
  return `${(Math.floor(n / step) * step).toLocaleString("en-GB")}+`;
}

/** Counts up to `target` once `run` is true; respects reduced motion. */
function useCountUp(target: number, run: boolean, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, duration]);
  return value;
}

function Figure({ value, label, run }: { value: number; label: string; run: boolean }) {
  const current = useCountUp(value, run);
  return (
    <div className="bg-[color:var(--ch-surface)] px-5 md:px-7 py-5 md:py-6">
      <div className="ch-display ch-num text-[2rem] md:text-[2.75rem] font-bold leading-none text-[color:var(--ch-text)]">
        {run ? roundedDown(current) : "—"}
      </div>
      <div className="mt-1.5 text-[11px] md:text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ch-muted)]">{label}</div>
    </div>
  );
}

/**
 * Real platform numbers as proof, from GET /api/public/platform-stats
 * (cached server-side for an hour). Counts up once scrolled into view;
 * renders nothing if the endpoint is unavailable.
 */
export default function PlatformStatsStrip() {
  const { data: platform } = useQuery<PlatformStats | null>({
    queryKey: ["home", "platform-stats"],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch("/api/public/platform-stats");
      if (!res.ok) return null;
      return res.json();
    },
  });

  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.3, rootMargin: "100000px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [platform, seen]);

  if (!platform) return null;

  return (
    <div ref={ref} className={`ch-card overflow-hidden ch-reveal ${seen ? "is-in" : ""}`}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[color:var(--ch-border)]">
        <Figure value={platform.players} label="Player profiles" run={seen} />
        <Figure value={platform.games} label="Games tracked" run={seen} />
        <Figure value={platform.teams} label="Clubs" run={seen} />
        <Figure value={platform.competitions} label="Competitions" run={seen} />
      </div>
    </div>
  );
}
