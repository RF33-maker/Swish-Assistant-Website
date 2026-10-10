/**
 * Overtime is not numbered the same way everywhere. FIBA LiveStats restarts the
 * count for overtime: the first overtime arrives as period 1 with period_type
 * "OVERTIME", the fifth as period 5 with the same type. So when the type says
 * overtime, the number *is* the overtime (1 = OT1, 5 = OT5); reading it as a
 * quarter would show OT1 as Q1. Without a type, a number above 4 is an overtime
 * counted on from the quarters (5 = OT1, 9 = OT5).
 */
const isOvertimeType = (periodType?: string | null) =>
  /^(ot|overtime)/i.test((periodType || "").trim());

/**
 * Short label for a game period: "Q3", "OT1", "OT2" ... "OT5".
 */
export function periodLabel(
  period: number | null | undefined,
  periodType?: string | null,
): string | null {
  if (!period || period < 1) return null;
  if (isOvertimeType(periodType)) return `OT${period}`;
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

/**
 * One continuous period number: Q1-Q4 are 1-4 and overtime carries on at 5, 6, 7...
 *
 * Grouping, sorting and "is this overtime" checks all assume this numbering, so
 * events are put through here as they load rather than each consumer having to
 * know about the restart.
 */
export function normalizePeriod(
  period: number | null | undefined,
  periodType?: string | null,
): number | null | undefined {
  if (!period || period < 1) return period;
  return isOvertimeType(periodType) ? 4 + period : period;
}

/**
 * `normalizePeriod` over a list of events.
 *
 * A row this changes comes back with its period_type cleared. The number is now
 * continuous, and an overtime-typed number is read the other way (5 with the type
 * is the fifth overtime; 5 without it is the first). Clearing the type keeps a
 * normalised row unambiguous wherever it is read, so `periodLabel(row.period,
 * row.period_type)` is right for a raw row and a normalised one, and running this
 * twice does no harm. Rows it doesn't change come back as they were.
 */
export function normalizeEventPeriods<T extends { period?: number | null; period_type?: string | null }>(
  events: T[],
): T[] {
  return events.map((e) => {
    const period = normalizePeriod(e.period, e.period_type);
    return period === e.period ? e : { ...e, period, period_type: null };
  });
}
