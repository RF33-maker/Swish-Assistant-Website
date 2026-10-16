import { supabaseAdmin } from "../supabaseServiceClient";

/** One row of public.coach_access: a coach's paid access to one team. */
export interface AccessRow {
  id: string;
  user_id: string;
  team_id: string;
  team_name: string;
  email: string | null;
  plan: "monthly" | "season";
  status: "active" | "past_due" | "canceled" | "expired" | "refunded";
  access_until: string | null;
  cancel_at_period_end: boolean;
  verified: boolean;
  livemode: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
}

export type AccessPatch = Partial<Omit<AccessRow, "id" | "created_at" | "updated_at">>;
export type AccessLookup = "stripe_subscription_id" | "stripe_customer_id" | "stripe_payment_intent_id" | "user_id";

/** Everything the billing code needs from the database, so tests can swap it for memory. */
export interface BillingStore {
  /** Records the event as handled. False if it already was. */
  claimEvent(id: string, type: string): Promise<boolean>;
  /** Forget a claimed event, so Stripe's retry is handled again after a failure. */
  releaseEvent(id: string): Promise<void>;
  find(by: AccessLookup, value: string): Promise<AccessRow | null>;
  /** Insert, or replace this user's row. */
  upsert(row: AccessPatch & { user_id: string; team_id: string; team_name: string; plan: AccessRow["plan"]; status: AccessRow["status"] }): Promise<AccessRow>;
  update(userId: string, patch: AccessPatch): Promise<AccessRow | null>;
  /** Live-looking rows that may have run out. */
  listOpen(): Promise<AccessRow[]>;
  team(teamId: string): Promise<{ team_id: string; name: string; league_id: string } | null>;
}

export const supabaseBillingStore: BillingStore = {
  async claimEvent(id, type) {
    const { error } = await supabaseAdmin.from("stripe_events").insert({ id, type });
    if (!error) return true;
    if (error.code === "23505") return false; // already handled
    throw new Error(error.message);
  },
  async releaseEvent(id) {
    await supabaseAdmin.from("stripe_events").delete().eq("id", id);
  },
  async find(by, value) {
    const { data, error } = await supabaseAdmin.from("coach_access").select("*").eq(by, value).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AccessRow | null) ?? null;
  },
  async upsert(row) {
    const { data, error } = await supabaseAdmin
      .from("coach_access")
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as AccessRow;
  },
  async update(userId, patch) {
    const { data, error } = await supabaseAdmin
      .from("coach_access")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as AccessRow | null) ?? null;
  },
  async listOpen() {
    const { data, error } = await supabaseAdmin.from("coach_access").select("*").in("status", ["active", "past_due"]).limit(2000);
    if (error) throw new Error(error.message);
    return (data || []) as AccessRow[];
  },
  async team(teamId) {
    const { data } = await supabaseAdmin.from("teams").select("team_id, name, league_id").eq("team_id", teamId).maybeSingle();
    return (data as any) ?? null;
  },
};
