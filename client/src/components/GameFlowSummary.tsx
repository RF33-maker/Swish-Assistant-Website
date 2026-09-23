import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import { Flame } from 'lucide-react';
import { parseGameFlow, computeBiggestRuns, computeLeadChanges, formatClock, type RawGameEvent } from '@/lib/gameFlow';

interface Props {
  events: RawGameEvent[];
  homeTeam: string;
  awayTeam: string;
  homeColor?: string;
  awayColor?: string;
}

const DEFAULT_HOME = '#f97316'; // matches the existing Feed tab's team_no===1 (home) orange
const DEFAULT_AWAY = '#3b82f6'; // matches the existing Feed tab's team_no===2 (away) blue

function CustomTooltip({ active, payload, homeTeam, awayTeam }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-slate-800 dark:text-white mb-1">
        Q{p.period} · {formatClock(p.clock)}
      </div>
      <div className="text-slate-600 dark:text-slate-300">{homeTeam} {p.homeScore} – {p.awayScore} {awayTeam}</div>
      {p.playerName && <div className="text-slate-400 dark:text-neutral-500 mt-0.5">{p.playerName}</div>}
    </div>
  );
}

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

  const maxMargin = Math.max(...flow.map(f => f.margin), 1);
  const minMargin = Math.min(...flow.map(f => f.margin), -1);
  const gradientOffset = maxMargin / (maxMargin - minMargin);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2 text-xs font-medium text-slate-500 dark:text-neutral-400">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColor }} />{homeTeam}</span>
          <span className="flex items-center gap-1.5">{awayTeam}<span className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColor }} /></span>
        </div>
        <div style={{ width: '100%', height: 160 }}>
          <ResponsiveContainer>
            <AreaChart data={flow} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="gameFlowMargin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={0} stopColor={homeColor} stopOpacity={0.45} />
                  <stop offset={gradientOffset} stopColor={homeColor} stopOpacity={0.15} />
                  <stop offset={gradientOffset} stopColor={awayColor} stopOpacity={0.15} />
                  <stop offset={1} stopColor={awayColor} stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <XAxis dataKey="index" hide />
              <YAxis hide domain={[minMargin, maxMargin]} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
              {periodBoundaries.slice(1).map(b => (
                <ReferenceLine key={b.period} x={b.index} stroke="#e2e8f0" strokeDasharray="3 3" />
              ))}
              <Area type="monotone" dataKey="margin" stroke="#64748b" strokeWidth={1.5} fill="url(#gameFlowMargin)" isAnimationActive={false} />
              <Tooltip content={<CustomTooltip homeTeam={homeTeam} awayTeam={awayTeam} />} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-between text-[11px] text-slate-400 dark:text-neutral-500 px-2 -mt-1">
          {periodBoundaries.map(b => <span key={b.period}>Q{b.period}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="bg-gray-50 dark:bg-neutral-800/60 rounded-lg p-2.5">
          <div className="text-lg font-bold text-slate-800 dark:text-white">{leadInfo.changes}</div>
          <div className="text-[11px] text-slate-500 dark:text-neutral-400">Lead changes</div>
        </div>
        <div className="bg-gray-50 dark:bg-neutral-800/60 rounded-lg p-2.5">
          <div className="text-lg font-bold text-slate-800 dark:text-white">
            {leadInfo.biggestLead ? `+${leadInfo.biggestLead.margin}` : '—'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-neutral-400">
            Biggest lead{leadInfo.biggestLead ? ` (${leadInfo.biggestLead.teamNo === 1 ? homeTeam : awayTeam})` : ''}
          </div>
        </div>
      </div>

      {runs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-2 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Biggest runs
          </h4>
          <div className="space-y-1.5">
            {runs.map((run, i) => (
              <div key={i} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-neutral-800/60 rounded-lg px-3 py-2">
                <span className="font-medium text-slate-800 dark:text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: run.teamNo === 1 ? homeColor : awayColor }} />
                  {run.teamNo === 1 ? homeTeam : awayTeam}
                  <span className="font-bold" style={{ color: run.teamNo === 1 ? homeColor : awayColor }}>{run.points}-0 run</span>
                </span>
                <span className="text-xs text-slate-400 dark:text-neutral-500">
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
