import { Suspense, useMemo } from 'react';
import { Flame } from 'lucide-react';
import { parseGameFlow, computeBiggestRuns, computeLeadChanges, formatClock, type RawGameEvent } from '@/lib/gameFlow';
import { periodLabel } from '@/lib/periodLabel';
import { lazyWithReload } from '@/lib/lazyWithReload';

interface Props {
  events: RawGameEvent[];
  homeTeam: string;
  awayTeam: string;
  homeColor?: string;
  awayColor?: string;
}

const DEFAULT_HOME = '#f97316'; // matches the existing Feed tab's team_no===1 (home) orange
const DEFAULT_AWAY = '#3b82f6'; // matches the existing Feed tab's team_no===2 (away) blue

// Recharts loads only when a game flow is on screen (see GameFlowChart).
const GameFlowChart = lazyWithReload(() => import('./GameFlowChart'));

export default function GameFlowSummary({ events, homeTeam, awayTeam, homeColor = DEFAULT_HOME, awayColor = DEFAULT_AWAY }: Props) {
  const flow = useMemo(() => parseGameFlow(events), [events]);
  const runs = useMemo(() => computeBiggestRuns(flow), [flow]);
  const leadInfo = useMemo(() => computeLeadChanges(flow), [flow]);

  const periodBoundaries = useMemo(() => {
    const seen = new Set<number>();
    const marks: { index: number; period: number }[] = [];
    flow.forEach(p => {
      if (!seen.has(p.period)) { seen.add(p.period); marks.push({ index: p.index, period: p.period }); }
    });
    return marks;
  }, [flow]);

  if (flow.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400 dark:text-neutral-500">
        No play-by-play available for this game yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2 text-xs font-medium text-slate-500 dark:text-neutral-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColor }} />{homeTeam}</span>
          <span className="flex items-center gap-1.5">{awayTeam}<span className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColor }} /></span>
        </div>
        <div style={{ width: '100%', height: 160 }}>
          <Suspense fallback={null}>
            <GameFlowChart
              flow={flow}
              periodBoundaries={periodBoundaries}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              homeColor={homeColor}
              awayColor={awayColor}
            />
          </Suspense>
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 dark:text-neutral-500 px-2 -mt-1">
          {periodBoundaries.map(b => <span key={b.period}>{periodLabel(b.period)}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6">
        <div>
          <div className="ch-display text-[2rem] font-bold leading-none tabular-nums text-[color:var(--ch-text)]">{leadInfo.changes}</div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-text-2)]">Lead changes</div>
        </div>
        <div>
          <div className="ch-display text-[2rem] font-bold leading-none tabular-nums text-[color:var(--ch-text)]">
            {leadInfo.biggestLead ? `+${leadInfo.biggestLead.margin}` : '—'}
          </div>
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-text-2)]">
            Biggest lead{leadInfo.biggestLead ? ` (${leadInfo.biggestLead.teamNo === 1 ? homeTeam : awayTeam})` : ''}
          </div>
        </div>
      </div>

      {runs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)] pb-2 border-b border-[color:var(--ch-border-strong)] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Biggest runs
          </h4>
          <div>
            {runs.map((run, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-[color:var(--ch-border)] py-2">
                <span className="font-medium text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: run.teamNo === 1 ? homeColor : awayColor }} />
                  {run.teamNo === 1 ? homeTeam : awayTeam}
                  <span className="font-bold" style={{ color: run.teamNo === 1 ? homeColor : awayColor }}>{run.points}-0 run</span>
                </span>
                <span className="text-xs text-[color:var(--ch-text-2)]">
                  Q{run.startPeriod} {formatClock(run.startClock)} – Q{run.endPeriod} {formatClock(run.endClock)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
