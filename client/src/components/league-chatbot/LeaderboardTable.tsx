import type { LeaderboardContent } from './structuredContent';
import { useReadableTeamColor } from '@/hooks/useReadableColor';

export default function LeaderboardTable({ data, brandColor }: { data: LeaderboardContent; brandColor: string }) {
  const readableBrand = useReadableTeamColor(brandColor).body;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-gray-200 dark:border-neutral-700">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{data.title}</h4>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.rank} className="border-b border-gray-100 dark:border-neutral-800 last:border-0">
              <td className="w-8 pl-3.5 py-2 text-slate-400 dark:text-neutral-500 text-xs tabular-nums">{row.rank}</td>
              <td className="py-2 pr-2">
                <div className="font-medium text-slate-800 dark:text-white leading-tight">{row.name}</div>
                {row.sub && <div className="text-xs text-slate-500 dark:text-neutral-400">{row.sub}</div>}
              </td>
              <td className="pr-3.5 py-2 text-right whitespace-nowrap">
                <span
                  className="font-bold tabular-nums"
                  style={row.rank === 1 ? { color: readableBrand } : undefined}
                >
                  {row.value}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-neutral-500 ml-1">{data.unit}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
