import type { StandingsContent } from './structuredContent';
import { useReadableTeamColor } from '@/hooks/useReadableColor';

export default function StandingsTable({ data, brandColor }: { data: StandingsContent; brandColor: string }) {
  const readableBrand = useReadableTeamColor(brandColor).body;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-gray-200 dark:border-neutral-700">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{data.title}</h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">
            <th className="w-8 pl-3.5 py-1.5 text-left font-medium"></th>
            <th className="py-1.5 text-left font-medium">Team</th>
            <th className="py-1.5 text-right font-medium">W–L</th>
            <th className="pr-3.5 py-1.5 text-right font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.rank} className="border-t border-gray-100 dark:border-neutral-800">
              <td className="pl-3.5 py-2 text-slate-400 dark:text-neutral-500 text-xs tabular-nums">{row.rank}</td>
              <td className="py-2 pr-2 font-medium text-slate-800 dark:text-white">{row.team}</td>
              <td className="py-2 text-right text-slate-600 dark:text-neutral-300 whitespace-nowrap tabular-nums">
                {row.wins}W–{row.losses}L
              </td>
              <td className="pr-3.5 py-2 text-right font-bold tabular-nums" style={row.rank === 1 ? { color: readableBrand } : undefined}>
                {row.pct}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
