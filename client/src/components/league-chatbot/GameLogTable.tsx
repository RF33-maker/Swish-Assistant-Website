import type { GameLogContent } from './structuredContent';
import { useReadableTeamColor } from '@/hooks/useReadableColor';

export default function GameLogTable({ data, brandColor }: { data: GameLogContent; brandColor: string }) {
  const readableBrand = useReadableTeamColor(brandColor).body;
  const bestPts = Math.max(...data.rows.map((r) => r.pts));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-gray-200 dark:border-neutral-700">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{data.title}</h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-neutral-500">
            <th className="pl-3.5 py-1.5 text-left font-medium">Game</th>
            <th className="py-1.5 text-right font-medium">PTS</th>
            <th className="py-1.5 text-right font-medium">REB</th>
            <th className="pr-3.5 py-1.5 text-right font-medium">AST</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-neutral-800">
              <td className="pl-3.5 py-2 pr-2">
                <div className="font-medium text-slate-800 dark:text-white leading-tight">
                  {row.isHome === undefined ? row.opponent : `${row.isHome ? 'vs' : '@'} ${row.opponent}`}
                </div>
                <div className="text-xs text-slate-500 dark:text-neutral-400">
                  {row.date}{row.shootingLine ? ` · ${row.shootingLine}` : ''}
                </div>
              </td>
              <td className="py-2 text-right font-bold tabular-nums" style={row.pts === bestPts ? { color: readableBrand } : undefined}>
                {row.pts}
              </td>
              <td className="py-2 text-right text-slate-600 dark:text-neutral-300 tabular-nums">{row.reb}</td>
              <td className="pr-3.5 py-2 text-right text-slate-600 dark:text-neutral-300 tabular-nums">{row.ast}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
