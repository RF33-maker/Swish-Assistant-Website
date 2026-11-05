import { supabaseAdmin } from "../supabaseServiceClient";
import { accessIsLive } from "./plans";
import type { AccessRow } from "./store";

/**
 * What a person has: Swish+ ("plus") and/or Coach ("coach"), read from
 * public.user_entitlements. The site and the app ask this, never where the
 * person paid (Stripe now, Apple later).
 *
 * Coach includes Swish+: every coach grant writes a matching plus row with
 * source "coach_bundle" and the same end date, and they end together.
 * Admins, and coaches set up by hand before billing existed (the coach role
 * in auth metadata with no paid row), count as having both.
 */

export type Entitlement = "plus" | "coach";
export type EntitlementSource = "apple" | "stripe" | "coach_bundle" | "manual";

export interface EntitlementRow {
  id: string;
  user_id: string;
  entitlement: Entitlement;
  source: EntitlementSource;
  external_ref: string | null;
  expires_at: string | null;
  plan: "monthly" | "annual" | "season" | null;
  founding: boolean;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  livemode: boolean;
  created_at: string;
  updated_at: string;
}

export type GrantPatch = Partial<Omit<EntitlementRow, "id" | "user_id" | "entitlement" | "source" | "created_at" | "updated_at">>;

/** Everything the entitlement code needs from the database, so tests can swap it for memory. */
export interface EntitlementStore {
  /** All of this user's rows, live or not. */
  forUser(userId: string): Promise<EntitlementRow[]>;
  byRef(ref: string, source: EntitlementSource): Promise<EntitlementRow | null>;
  /** Insert or replace the (user, entitlement, source) row. */
  upsert(userId: string, entitlement: Entitlement, source: EntitlementSource, patch: GrantPatch): Promise<void>;
  /** Change rows matched by their external ref (a Stripe subscription id, say). */
  updateByRef(ref: string, source: EntitlementSource, patch: GrantPatch): Promise<number>;
  /** Stripe-paid rows whose end date has passed recently: candidates for a missed renewal. */
  recentlyLapsed(since: Date, now: Date): Promise<EntitlementRow[]>;
}

export const isLive = (row: Pick<EntitlementRow, "expires_at">, now: Date = new Date()): boolean =>
  !row.expires_at || new Date(row.expires_at).getTime() > now.getTime();

// Until the migration is applied the table is missing; billing must keep working without it.
const missing = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === "42P01" || error.code === "PGRST205" || /user_entitlements/.test(error.message || "") && /does not exist|schema cache/.test(error.message || ""));
let warned = false;
function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!missing(error)) return false;
  if (!warned) console.warn("[entitlements] user_entitlements table missing: apply supabase/migrations/20261106_swish_plus_entitlements.sql");
  warned = true;
  return true;
}

export const supabaseEntitlementStore: EntitlementStore = {
  async forUser(userId) {
    const { data, error } = await supabaseAdmin.from("user_entitlements").select("*").eq("user_id", userId);
    if (tableMissing(error)) return [];
    if (error) throw new Error(error.message);
    return (data || []) as EntitlementRow[];
  },
  async byRef(ref, source) {
    const { data, error } = await supabaseAdmin.from("user_entitlements").select("*").eq("external_ref", ref).eq("source", source).limit(1).maybeSingle();
    if (tableMissing(error)) return null;
    if (error) throw new Error(error.message);
    return (data as EntitlementRow | null) ?? null;
  },
  async upsert(userId, entitlement, source, patch) {
    const { error } = await supabaseAdmin
      .from("user_entitlements")
      .upsert({ user_id: userId, entitlement, source, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,entitlement,source" });
    if (tableMissing(error)) return;
    if (error) throw new Error(error.message);
  },
  async updateByRef(ref, source, patch) {
    const { data, error } = await supabaseAdmin
      .from("user_entitlements")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("external_ref", ref)
      .eq("source", source)
      .select("id");
    if (tableMissing(error)) return 0;
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  },
  async recentlyLapsed(since, now) {
    const { data, error } = await supabaseAdmin
      .from("user_entitlements")
      .select("*")
      .eq("source", "stripe")
      .eq("entitlement", "plus")
      .gte("expires_at", since.toISOString())
      .lte("expires_at", now.toISOString())
      .limit(2000);
    if (tableMissing(error)) return [];
    if (error) throw new Error(error.message);
    return (data || []) as EntitlementRow[];
  },
};

/**
 * Mirror a coach_access row into entitlements: coach (paid on Stripe) plus the
 * Swish+ it includes. While access is live both run to the same end date; when
 * it stops, both end now.
 */
export async function syncCoachBundle(row: AccessRow, store: EntitlementStore = supabaseEntitlementStore, now: Date = new Date()): Promise<void> {
  const live = accessIsLive(row, now);
  const patch: GrantPatch = {
    external_ref: row.id,
    expires_at: live ? row.access_until : now.toISOString(),
    plan: row.plan,
    cancel_at_period_end: row.cancel_at_period_end,
    stripe_customer_id: row.stripe_customer_id,
    livemode: row.livemode,
  };
  if (!live) {
    // Only end rows that exist; a coach who never went live has nothing to end.
    const have = await store.forUser(row.user_id);
    if (!have.some((r) => r.source === "stripe" && r.entitlement === "coach") && !have.some((r) => r.source === "coach_bundle")) return;
  }
  await store.upsert(row.user_id, "coach", "stripe", patch);
  await store.upsert(row.user_id, "plus", "coach_bundle", patch);
}

export interface PlanSummary {
  plus: boolean;
  coach: boolean;
  /** Where Swish+ comes from, when it does. "role" = an admin or a hand-set coach. */
  plusSource: EntitlementSource | "role" | null;
  plan: EntitlementRow["plan"];
  expiresAt: string | null;
  cancelsAtPeriodEnd: boolean;
  founding: boolean;
  /** A Stripe customer to open the billing portal for. */
  stripeCustomerId: string | null;
}

/** Sums up a person's rows and role into what they can use now. */
export function summarise(rows: EntitlementRow[], role: string | null, now: Date = new Date()): PlanSummary {
  const live = rows.filter((r) => isLive(r, now));
  const byRole = role === "admin" || role === "coach";
  // A person's own Swish+ purchase is what they manage; the coach bundle comes after it.
  const order: EntitlementSource[] = ["stripe", "apple", "coach_bundle", "manual"];
  const plusRow = live.filter((r) => r.entitlement === "plus").sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))[0] ?? null;
  const coachRow = live.find((r) => r.entitlement === "coach") ?? null;
  const billed = plusRow?.source === "coach_bundle" ? coachRow ?? plusRow : plusRow ?? coachRow;
  return {
    plus: !!plusRow || byRole,
    coach: !!coachRow || byRole,
    plusSource: plusRow?.source ?? (byRole ? "role" : null),
    plan: billed?.plan ?? null,
    expiresAt: billed?.expires_at ?? null,
    cancelsAtPeriodEnd: !!billed?.cancel_at_period_end,
    founding: !!plusRow?.founding,
    stripeCustomerId: rows.find((r) => r.stripe_customer_id)?.stripe_customer_id ?? null,
  };
}

export async function planFor(userId: string, role: string | null, store: EntitlementStore = supabaseEntitlementStore): Promise<PlanSummary> {
  return summarise(await store.forUser(userId), role);
}

/**
 * The founding price: accounts made before Swish+ launched pay 20% less for
 * as long as they stay subscribed. SWISH_PLUS_LAUNCH_AT (an ISO date) is the
 * cut-off; until it is set, every account counts as made before launch.
 */
export const FOUNDING_PERCENT_OFF = 20;
export const FOUNDING_COUPON_ID = "swish_plus_founding_20";

export function foundingEligible(accountCreatedAt: string | null | undefined, launchAt: string | undefined = process.env.SWISH_PLUS_LAUNCH_AT): boolean {
  if (!launchAt) return true;
  const launch = new Date(launchAt).getTime();
  if (!Number.isFinite(launch)) return true;
  if (!accountCreatedAt) return false;
  return new Date(accountCreatedAt).getTime() < launch;
}
