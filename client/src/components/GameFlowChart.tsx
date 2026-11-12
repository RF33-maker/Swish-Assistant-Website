import { AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import { formatClock, type FlowPoint } from '@/lib/gameFlow';
import { periodLabel } from '@/lib/periodLabel';

/**
 * The margin chart on the game flow summary. Recharts is the heaviest library
 * the public game pages use, so this lives in its own file and GameFlowSummary
 * loads it lazily: the numbers and runs show straight away, the chart a moment
 * later in a box that already has its height.
 */
interface Props {
  flow: FlowPoint[];
  periodBoundaries: { index: number; period: number }[];
  homeTeam: string;
  awayTeam: string;
  homeColor: string;
  awayColor: string;
}

function CustomTooltip({ active, payload, homeTeam, awayTeam }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-slate-800 dark:text-white mb-1">
        {periodLabel(p.period)} · {formatClock(p.clock)}
      </div>
      <div className="text-slate-600 dark:text-slate-300">{homeTeam} {p.homeScore} – {p.awayScore} {awayTeam}</div>
      {p.playerName && <div className="text-slate-400 dark:text-neutral-500 mt-0.5">{p.playerName}</div>}
    </div>
  );
}

export default function GameFlowChart({ flow, periodBoundaries, homeTeam, awayTeam, homeColor, awayColor }: Props) {
  const maxMargin = Math.max(...flow.map(f => f.margin), 1);
  const minMargin = Math.min(...flow.map(f => f.margin), -1);
  const gradientOffset = maxMargin / (maxMargin - minMargin);

  return (
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
  );
}
