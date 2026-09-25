import { ordinal } from '@/lib/gameReport';
import type { ComparisonRow, QuarterLine } from '@/lib/gameReport';

/**
 * Shared chart primitives for the match and scout reports.
 *
 * All of these are plain divs and inline SVG rather than a charting library:
 * the shapes are simple, they need to inherit the team's brand colour, and
 * they have to stay legible in both themes and at phone width.
 */

const MUTED = 'text-gray-400 dark:text-neutral-500';

function formatValue(value: number | null, unit?: string, decimals = 0): string {
  if (value == null) return '—';
  return `${value.toFixed(decimals)}${unit ?? ''}`;
}

/**
 * One labelled stat with both teams' numbers either side of a split bar.
 * The bar is proportional within the row, so the reader compares the two
 * teams rather than reading an absolute scale.
 */
export function ComparisonBarRow({
  row,
  myColor,
  theirColor,
  myLabel,
  theirLabel,
}: {
  row: ComparisonRow;
  myColor: string;
  theirColor: string;
  myLabel: string;
  theirLabel: string;
}) {
  const mine = row.mine ?? 0;
  const theirs = row.theirs ?? 0;
  const total = mine + theirs;
  const minePct = total > 0 ? (mine / total) * 100 : 50;
  const better =
    row.mine == null || row.theirs == null
      ? null
      : row.lowerIsBetter
        ? row.mine < row.theirs
        : row.mine > row.theirs;

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span
          className={`text-sm font-bold tabular-nums ${better === true ? '' : MUTED}`}
          style={better === true ? { color: myColor } : undefined}
          title={myLabel}
        >
          {formatValue(row.mine, row.unit, row.decimals ?? 0)}
        </span>
        <span className="text-[11px] md:text-xs font-medium text-gray-600 dark:text-neutral-400 text-center flex-1 truncate">
          {row.label}
        </span>
        <span
          className={`text-sm font-bold tabular-nums ${better === false ? 'text-gray-700 dark:text-neutral-200' : MUTED}`}
          title={theirLabel}
        >
          {formatValue(row.theirs, row.unit, row.decimals ?? 0)}
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-200 dark:bg-neutral-700">
        <div style={{ width: `${minePct}%`, backgroundColor: myColor }} />
        <div style={{ width: `${100 - minePct}%`, backgroundColor: theirColor }} />
      </div>
      {row.note && <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-1">{row.note}</p>}
    </div>
  );
}

/**
 * Quarter-by-quarter scoring with the running margin underneath, so a coach
 * can see *when* the game turned rather than only the final difference.
 */
export function QuarterFlowChart({
  quarters,
  myColor,
  theirColor,
  myLabel,
  theirLabel,
}: {
  quarters: QuarterLine[];
  myColor: string;
  theirColor: string;
  myLabel: string;
  theirLabel: string;
}) {
  const peak = Math.max(
    10,
    ...quarters.flatMap((q) => [q.mine ?? 0, q.theirs ?? 0])
  );
  const margins = quarters.map((q) => q.cumulativeMargin).filter((m): m is number => m != null);
  const maxAbsMargin = Math.max(5, ...margins.map((m) => Math.abs(m)));

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {quarters.map((q) => (
          <div key={q.label} className="text-center">
            <div className="flex items-end justify-center gap-1 h-20 md:h-24">
              <div
                className="w-4 md:w-5 rounded-t"
                style={{ height: `${((q.mine ?? 0) / peak) * 100}%`, backgroundColor: myColor, minHeight: 2 }}
                title={`${myLabel}: ${q.mine ?? '—'}`}
              />
              <div
                className="w-4 md:w-5 rounded-t"
                style={{ height: `${((q.theirs ?? 0) / peak) * 100}%`, backgroundColor: theirColor, minHeight: 2 }}
                title={`${theirLabel}: ${q.theirs ?? '—'}`}
              />
            </div>
            <div className="text-[11px] font-semibold text-gray-600 dark:text-neutral-400 mt-1">{q.label}</div>
            <div className="text-[11px] tabular-nums text-gray-500 dark:text-neutral-500">
              {q.mine ?? '—'}–{q.theirs ?? '—'}
            </div>
          </div>
        ))}
      </div>

      {margins.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium text-gray-500 dark:text-neutral-400 mb-1">Running margin</div>
          <div className="grid grid-cols-4 gap-2 md:gap-3">
            {quarters.map((q) => {
              const m = q.cumulativeMargin;
              const width = m == null ? 0 : (Math.abs(m) / maxAbsMargin) * 50;
              return (
                <div key={q.label} className="relative h-4 bg-gray-100 dark:bg-neutral-800 rounded">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300 dark:bg-neutral-600" />
                  {m != null && (
                    <div
                      className="absolute inset-y-0.5 rounded-sm"
                      style={{
                        width: `${Math.max(width, 1.5)}%`,
                        left: m >= 0 ? '50%' : undefined,
                        right: m < 0 ? '50%' : undefined,
                        backgroundColor: m >= 0 ? myColor : theirColor,
                      }}
                      title={`${m >= 0 ? '+' : ''}${m} after ${q.label}`}
                    />
                  )}
                  {/* The bar fills one half of the cell, so the label sits in
                      the other half rather than on top of it. */}
                  <span
                    className="absolute top-0 bottom-0 flex items-center text-[10px] font-bold tabular-nums text-gray-700 dark:text-neutral-200 px-1"
                    style={
                      m == null || m === 0
                        ? { left: 0, right: 0, justifyContent: 'center' }
                        : m > 0
                          ? { right: '50%' }
                          : { left: '50%' }
                    }
                  >
                    {m == null ? '' : `${m > 0 ? '+' : ''}${m}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** A single horizontal bar split into labelled segments — used for shot mix. */
export function StackedShare({
  segments,
  emptyLabel = 'No breakdown available',
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  emptyLabel?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return <p className={`text-sm italic ${MUTED}`}>{emptyLabel}</p>;
  }
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-neutral-700">
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${Math.round((s.value / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-gray-600 dark:text-neutral-400">
              {s.label} <span className="font-semibold tabular-nums">{Math.round((s.value / total) * 100)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Where a team sits in its competition for one stat, as a percentile track. */
export function RankTrack({
  label,
  value,
  unit,
  decimals = 1,
  rank,
  of,
  color,
}: {
  label: string;
  value: number | null;
  unit?: string;
  decimals?: number;
  rank: number | null;
  of: number | null;
  color: string;
}) {
  // Percentile from rank: 1st sits at the right-hand end.
  const share = rank != null && of != null && of > 1 ? ((of - rank) / (of - 1)) * 100 : null;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-xs font-medium text-gray-600 dark:text-neutral-400">{label}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {formatValue(value, unit, decimals)}
          {rank != null && of != null && (
            <span className="ml-2 text-[11px] font-medium text-gray-500 dark:text-neutral-400">
              {ordinal(rank)} of {of}
            </span>
          )}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gray-200 dark:bg-neutral-700">
        {share != null && (
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
        )}
      </div>
    </div>
  );
}

/**
 * The written analysis card that sits under a report's hero.
 *
 * Renders nothing at all when the analysis is unavailable — the report's own
 * numbers are the product, and an error box in their place would be worse
 * than silence. While loading it shows a single quiet line so the section
 * does not pop in without warning.
 */
export function NarrativeSummary({
  headline,
  overview,
  takeaways,
  status,
  color,
}: {
  headline?: string;
  overview?: string;
  takeaways?: string[];
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  color: string;
}) {
  if (status === 'unavailable' || status === 'idle') return null;

  if (status === 'loading') {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
        <p className="text-sm text-gray-400 dark:text-neutral-500 italic">Writing the analysis…</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color }}>
          ANALYSIS
        </span>
      </div>
      {headline && (
        <h3 className="text-base md:text-xl font-semibold text-slate-800 dark:text-white mb-2 leading-snug">
          {headline}
        </h3>
      )}
      {overview && (
        <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed">{overview}</p>
      )}
      {takeaways && takeaways.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400 mb-2">
            Takeaways
          </h4>
          <ul className="space-y-1.5">
            {takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed">{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The model's read on one section, shown under that section's own chart. */
export function SectionNarrative({ body }: { body?: string }) {
  if (!body) return null;
  return (
    <p className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
      {body}
    </p>
  );
}
