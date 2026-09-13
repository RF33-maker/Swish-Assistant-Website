import type { PlayerCardContent } from './structuredContent';
import { useReadableTeamColor } from '@/hooks/useReadableColor';

export default function PlayerStatCard({ data, brandColor }: { data: PlayerCardContent; brandColor: string }) {
  const readableBrand = useReadableTeamColor(brandColor).body;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-gray-200 dark:border-neutral-700">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{data.name}</h4>
        <p className="text-xs text-slate-500 dark:text-neutral-400">{data.team} · {data.gamesPlayed} games</p>
      </div>

      <div className="grid grid-cols-3 gap-px bg-gray-100 dark:bg-neutral-800">
        {data.totals.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-neutral-900 px-2 py-2.5 text-center">
            <div className="text-lg font-bold tabular-nums" style={{ color: readableBrand }}>{stat.value}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {data.shooting.length > 0 && (
        <div className="px-3.5 py-2.5 border-t border-gray-200 dark:border-neutral-700 space-y-1.5">
          {data.shooting.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-neutral-400">{s.label}</span>
              <span className="text-slate-800 dark:text-white tabular-nums">
                {s.made}/{s.attempted} <span className="font-semibold">({s.pct})</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
