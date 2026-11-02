import type { ReactNode } from "react";
import { withAlpha } from "@/lib/colorContrast";

// A number on the page, no box: the figure and its label are the shape.
export function FlatStat({ label, value, rank, rankColor, children }: {
  label: string;
  value: ReactNode;
  rank?: string;
  rankColor?: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="ch-display font-bold tabular-nums leading-none text-[2rem] text-[color:var(--ch-text)]">
        {value}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-text-2)]">
        {label}
        {rank ? <span className="normal-case tracking-normal tabular-nums" style={{ color: rankColor }}>{rank}</span> : null}
      </div>
      {children}
    </div>
  );
}

// Thin team-colour bar under a FlatStat that is a share of 100.
export function StatBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="w-full mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: withAlpha(color, 0.18) }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}
