/**
 * Short label for a game period: "Q3", "OT1", "OT2" ... "OT5".
 *
 * Overtime is not numbered the same way everywhere. FIBA LiveStats restarts the
 * count for overtime: the first overtime arrives as period 1 with period_type
 * "OVERTIME", the fifth as period 5 with the same type. So when the type says
 * overtime, the number *is* the overtime (1 = OT1, 5 = OT5); reading it as a
 * quarter would show OT1 as Q1. Without a type, a number above 4 is an overtime
 * counted on from the quarters (5 = OT1, 9 = OT5).
 */
export function periodLabel(
  period: number | null | undefined,
  periodType?: string | null,
): string | null {
  if (!period || period < 1) return null;
  const overtime = /^(ot|overtime)/i.test((periodType || "").trim());
  if (overtime) return `OT${period}`;
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}
