/**
 * Coach plans, and when a season pass runs out.
 *
 * The prices themselves live in Stripe, found by lookup key, so changing the
 * price is a change in Stripe and not in code. scripts/stripe-setup.ts creates
 * them (in test mode first).
 */

export type PlanKey = "monthly" | "season";

export const PLANS: Record<PlanKey, { lookupKey: string; mode: "subscription" | "payment"; label: string }> = {
  monthly: { lookupKey: "coach_monthly", mode: "subscription", label: "Monthly" },
  season: { lookupKey: "coach_season", mode: "payment", label: "Season pass" },
};

export function isPlanKey(value: unknown): value is PlanKey {
  return value === "monthly" || value === "season";
}

/** A season runs 1 September to 31 May. */
const SEASON_END_MONTH = 4; // May (0 = January)
const SEASON_END_DAY = 31;
/** A pass bought with less than this left covers the next season as well, so no one pays full price for a few days. */
const MIN_DAYS_LEFT = 56;

/** The last moment of the season a pass bought `now` runs to: 31 May, or next 31 May when this one is too close. */
export function seasonPassEnd(now: Date = new Date()): Date {
  const thisYear = now.getUTCFullYear();
  const endOf = (year: number) => new Date(Date.UTC(year, SEASON_END_MONTH, SEASON_END_DAY, 23, 59, 59));
  let end = endOf(thisYear);
  const daysLeft = (end.getTime() - now.getTime()) / 86_400_000;
  if (daysLeft < MIN_DAYS_LEFT) end = endOf(thisYear + 1);
  return end;
}

/** What a Stripe subscription's status means for access. "pending" leaves things as they are. */
export function accessStatusFromSubscription(status: string): "active" | "past_due" | "canceled" | "pending" {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "pending"; // incomplete, paused
  }
}

/** Whether a coach_access row should currently unlock the coach role. */
export function accessIsLive(row: { status: string; access_until: string | null }, now: Date = new Date()): boolean {
  if (row.status !== "active" && row.status !== "past_due") return false;
  return !row.access_until || new Date(row.access_until).getTime() > now.getTime();
}
