/**
 * Short label for a game period: "Q3", "OT1", "OT2".
 *
 * Overtime is not numbered the same way by every feed. FIBA LiveStats restarts
 * the count, so the first overtime arrives as period 1 with period_type
 * "OVERTIME" and would read as Q1 if the number were all we looked at. Other
 * sources keep counting (5, 6, ...). The type wins when we have it; the
 * number alone still works for feeds that carry on counting.
 */
export function periodLabel(
  period: number | null | undefined,
  periodType?: string | null,
): string | null {
  if (!period || period < 1) return null;
  const overtime = /^(ot|overtime)/i.test((periodType || "").trim());
  if (overtime) return `OT${period > 4 ? period - 4 : period}`;
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}
