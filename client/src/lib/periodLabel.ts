/**
 * Overtime is not numbered the same way by every feed. FIBA LiveStats restarts
 * the count, so the first overtime arrives as period 1 with period_type
 * "OVERTIME" and would read as Q1 if the number were all we looked at. Other
 * sources keep counting (5, 6, ...). The type wins when we have it; the
 * number alone still works for feeds that carry on counting.
 */
const isOvertimeType = (periodType?: string | null) =>
  /^(ot|overtime)/i.test((periodType || "").trim());

/**
 * Short label for a game period: "Q3", "OT1", "OT2".
 */
export function periodLabel(
  period: number | null | undefined,
  periodType?: string | null,
): string | null {
  if (!period || period < 1) return null;
  if (isOvertimeType(periodType)) return `OT${period > 4 ? period - 4 : period}`;
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

/**
 * One continuous period number: Q1-Q4 are 1-4 and overtime carries on at 5, 6.
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
  return isOvertimeType(periodType) && period <= 4 ? 4 + period : period;
}

/** `normalizePeriod` over a list of events; rows already in order come back as they were. */
export function normalizeEventPeriods<T extends { period?: number | null; period_type?: string | null }>(
  events: T[],
): T[] {
  return events.map((e) => {
    const period = normalizePeriod(e.period, e.period_type);
    return period === e.period ? e : { ...e, period };
  });
}
