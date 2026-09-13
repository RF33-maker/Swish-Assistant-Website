import type { ComparisonContent } from './structuredContent';
import { useReadableTeamColor } from '@/hooks/useReadableColor';

export default function TeamComparisonCard({ data, brandColor }: { data: ComparisonContent; brandColor: string }) {
  const readableBrand = useReadableTeamColor(brandColor).body;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-gray-200 dark:border-neutral-700">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{data.teamA} vs {data.teamB}</h4>
      </div>

      {data.h2h && data.h2h.length > 0 && (
        <div className="px-3.5 py-2 border-b border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-1">Head to Head</div>
          <div className="space-y-1">
            {data.h2h.map((g, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-neutral-400">{g.label}</span>
                <span className="text-slate-800 dark:text-white tabular-nums">{g.a} – {g.b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">
            <th className="pl-3.5 py-1.5 text-left font-medium">Stat</th>
            <th className="py-1.5 text-right font-medium truncate max-w-[80px]">{data.teamA}</th>
            <th className="pr-3.5 py-1.5 text-right font-medium truncate max-w-[80px]">{data.teamB}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.label} className="border-t border-gray-100 dark:border-neutral-800">
              <td className="pl-3.5 py-2 text-slate-500 dark:text-neutral-400">{row.label}</td>
              <td className="py-2 text-right font-semibold tabular-nums" style={{ color: readableBrand }}>{row.a}</td>
              <td className="pr-3.5 py-2 text-right font-semibold text-slate-700 dark:text-neutral-300 tabular-nums">{row.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
