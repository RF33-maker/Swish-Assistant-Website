import { useEffect, useMemo, useRef, useState } from "react";
import { isInProgress, seasonFromStart, seasonShort, seasonStart, type SeasonSummary } from "./shared";

/**
 * How the league's game has changed: what one team put up in an average league game,
 * season by season. One line per chart, so each measure keeps its own scale; a year
 * with nothing on file breaks the line rather than being drawn through.
 */

type Point = { label: string; value: number | null; live: boolean; detail?: string };

const HEIGHT = 200;
const PAD = { top: 22, right: 18, bottom: 30, left: 34 };

function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const step = [0.5, 1, 2, 2.5, 5, 10, 20].find((s) => span / s <= 4) || 20;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 10) / 10);
  return ticks;
}

function TrendChart({ title, unit, points }: { title: string; unit: string; points: Point[] }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(520);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(260, el.clientWidth));
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const known = points.filter((p): p is Point & { value: number } => p.value != null);
  const finished = known.filter((p) => !p.live);
  const first = finished[0];
  const latest = finished[finished.length - 1];

  const scale = useMemo(() => {
    const values = known.map((p) => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const innerW = width - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
    const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * innerH;
    return { ticks, x, y, innerW };
  }, [known, points.length, width]);

  if (known.length < 3 || !first || !latest) return null;

  // Line segments: a missing season ends one and starts the next.
  const segments: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.value == null) { if (run.length > 1) segments.push(run.join(" ")); run = []; return; }
    run.push(`${run.length ? "L" : "M"}${scale.x(i).toFixed(1)} ${scale.y(p.value).toFixed(1)}`);
  });
  if (run.length > 1) segments.push(run.join(" "));

  const change = latest.value - first.value;
  const labelEvery = Math.ceil(points.length / Math.max(2, Math.floor(scale.innerW / 44)));
  const firstIndex = points.indexOf(first);
  const latestIndex = points.indexOf(latest);
  const shown = hover != null && points[hover]?.value != null ? hover : null;

  const onMove = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (clientX - rect.left - PAD.left) / (scale.innerW || 1);
    const i = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    setHover(points[i].value != null ? i : null);
  };

  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{title}</div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="ch-display font-bold leading-none text-[2.5rem] tabular-nums text-[color:var(--ch-text)]">{latest.value.toFixed(1)}</span>
        <span className="text-sm text-[color:var(--ch-text-2)]">
          {unit} in {latest.label}
          {Math.abs(change) >= 0.1 && <>, {change > 0 ? "up" : "down"} {Math.abs(change).toFixed(1)} on {first.label}</>}
        </span>
      </div>

      <div
        ref={box}
        className="relative mt-3"
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
      >
        <svg width={width} height={HEIGHT} role="img" aria-label={`${title} by season, ${first.label} to ${latest.label}`} className="block">
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={scale.y(t)} y2={scale.y(t)} stroke="var(--ch-border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={scale.y(t) + 3.5} textAnchor="end" fontSize={11.5} fill="var(--ch-text-2)" className="tabular-nums">{t}</text>
            </g>
          ))}
          {points.map((p, i) => (i % labelEvery === 0 || i === points.length - 1) && (i === points.length - 1 || points.length - 1 - i >= labelEvery * 0.6) && (
            <text key={p.label} x={scale.x(i)} y={HEIGHT - 6} textAnchor="middle" fontSize={11.5} fill="var(--ch-text-2)" className="tabular-nums">
              {seasonShort(p.label)}
            </text>
          ))}
          {shown != null && (
            <line x1={scale.x(shown)} x2={scale.x(shown)} y1={PAD.top - 6} y2={HEIGHT - PAD.bottom} stroke="var(--ch-border-strong)" strokeWidth={1} />
          )}
          {segments.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="var(--ch-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {points.map((p, i) => p.value != null && (
            <circle
              key={p.label}
              cx={scale.x(i)}
              cy={scale.y(p.value)}
              r={shown === i ? 5.5 : 4}
              fill={p.live ? "var(--ch-bg)" : "var(--ch-accent)"}
              stroke={p.live ? "var(--ch-accent)" : "var(--ch-bg)"}
              strokeWidth={2}
            />
          ))}
          {/* The two ends carry their numbers; the rest are on hover. */}
          {shown == null && [firstIndex, latestIndex].map((i) => {
            // Sit on the side the line doesn't leave from, so the number never lands on it.
            const value = points[i].value as number;
            const neighbour = points[i === firstIndex ? i + 1 : i - 1]?.value;
            const below = neighbour != null && neighbour > value;
            // No room underneath at the foot of the chart: step aside, away from the line.
            const aside = below && scale.y(value) + 20 > HEIGHT - PAD.bottom;
            const side = i === firstIndex ? 1 : -1;
            return (
              <text
                key={i}
                x={scale.x(i) + (aside ? side * 10 : 0)}
                y={scale.y(value) + (aside ? -6 : below ? 18 : -10)}
                textAnchor={aside ? (side > 0 ? "start" : "end") : i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                fontSize={11.5}
                fontWeight={600}
                fill="var(--ch-text)"
                className="tabular-nums"
              >
                {value.toFixed(1)}
              </text>
            );
          })}
        </svg>
        {shown != null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap"
            style={{ left: Math.max(70, Math.min(width - 70, scale.x(shown))), top: scale.y(points[shown].value as number) - 10 }}
          >
            <div className="font-semibold tabular-nums text-[color:var(--ch-text)]">
              {(points[shown].value as number).toFixed(1)} <span className="font-normal text-[color:var(--ch-text-2)]">{unit}</span>
            </div>
            <div className="text-[color:var(--ch-text-2)]">
              {points[shown].label}{points[shown].live ? ", so far" : ""}{points[shown].detail ? ` · ${points[shown].detail}` : ""}
            </div>
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{title} by season</caption>
        <thead><tr><th>Season</th><th>{unit}</th></tr></thead>
        <tbody>
          {known.map((p) => <tr key={p.label}><td>{p.label}</td><td>{p.value.toFixed(1)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default function LeagueTrends({ seasons }: { seasons: SeasonSummary[] }) {
  const slots = useMemo(() => {
    const byYear = new Map(seasons.map((s) => [seasonStart(s.season), s]));
    const years = Array.from(byYear.keys()).filter(Number.isFinite);
    if (years.length === 0) return [];
    const out: Array<{ label: string; season: SeasonSummary | null }> = [];
    for (let y = Math.min(...years); y <= Math.max(...years); y++) out.push({ label: seasonFromStart(y), season: byYear.get(y) || null });
    return out;
  }, [seasons]);

  const withAverages = slots.filter((s) => s.season?.perTeamGame).length;
  if (withAverages < 3) return null;

  const series = (pick: (a: NonNullable<SeasonSummary["perTeamGame"]>) => number, detail?: (a: NonNullable<SeasonSummary["perTeamGame"]>) => string): Point[] =>
    slots.map(({ label, season }) => ({
      label,
      value: season?.perTeamGame ? pick(season.perTeamGame) : null,
      live: isInProgress(label),
      detail: season?.perTeamGame && detail ? detail(season.perTeamGame) : undefined,
    }));

  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
      <TrendChart title="Points a team" unit="a game" points={series((a) => a.pts)} />
      <TrendChart title="3-pointers made a team" unit="a game" points={series((a) => a.tpm, (a) => `${a.tpa.toFixed(1)} attempted`)} />
    </div>
  );
}
