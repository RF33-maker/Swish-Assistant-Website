// Run with: npx tsx --test scripts/plus-billing.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

process.env.VITE_SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";

const { handlePlusEvent, resyncLapsedPlus } = await import("../server/billing/plusHandlers");
const { foundingEligible, summarise, syncCoachBundle } = await import("../server/billing/entitlements");
type EntitlementRow = import("../server/billing/entitlements").EntitlementRow;
type EntitlementStore = import("../server/billing/entitlements").EntitlementStore;
type AccessRow = import("../server/billing/store").AccessRow;

function memory() {
  const rows: EntitlementRow[] = [];
  let n = 0;
  const store: EntitlementStore = {
    async forUser(userId) { return rows.filter((r) => r.user_id === userId); },
    async byRef(ref, source) { return rows.find((r) => r.external_ref === ref && r.source === source) ?? null; },
    async upsert(userId, entitlement, source, patch) {
      const have = rows.find((r) => r.user_id === userId && r.entitlement === entitlement && r.source === source);
      if (have) Object.assign(have, patch);
      else rows.push({ id: `e${++n}`, user_id: userId, entitlement, source, external_ref: null, expires_at: null, plan: null, founding: false, cancel_at_period_end: false, stripe_customer_id: null, livemode: false, created_at: "", updated_at: "", ...patch });
    },
    async updateByRef(ref, source, patch) {
      const hit = rows.filter((r) => r.external_ref === ref && r.source === source);
      hit.forEach((r) => Object.assign(r, patch));
      return hit.length;
    },
    async recentlyLapsed(since, now) {
      return rows.filter((r) => r.source === "stripe" && r.expires_at && new Date(r.expires_at) >= since && new Date(r.expires_at) <= now);
    },
  };
  return { rows, store };
}

const NOW = new Date("2026-11-06T12:00:00Z");
const secs = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
const ev = (type: string, object: any, livemode = false) => ({ id: `evt_${Math.random()}`, type, livemode, data: { object } }) as unknown as Stripe.Event;

function deps(store: EntitlementStore, subs: Record<string, any> = {}, chargeSub: string | null = null) {
  return {
    entitlements: store,
    retrieveSubscription: async (id: string) => subs[id] ?? { id, status: "active", items: { data: [{ current_period_end: secs("2026-12-06T12:00:00Z") }] } },
    subscriptionForCharge: async () => chargeSub,
    now: () => NOW,
  };
}

const checkout = (md: Record<string, string>) => ev("checkout.session.completed", {
  id: "cs_1", metadata: md, client_reference_id: md.user_id, payment_status: "paid", subscription: "sub_plus", customer: "cus_1",
});

test("a paid Swish+ checkout grants plus to the end of the first period, with the founding flag", async () => {
  const { rows, store } = memory();
  const out = await handlePlusEvent(checkout({ product: "plus", user_id: "u1", plan: "monthly", founding: "1" }), deps(store));
  assert.match(out!, /Swish\+ monthly for u1 \(founding price\)/);
  assert.equal(rows.length, 1);
  assert.deepEqual(
    { e: rows[0].entitlement, s: rows[0].source, ref: rows[0].external_ref, until: rows[0].expires_at, plan: rows[0].plan, founding: rows[0].founding, cus: rows[0].stripe_customer_id },
    { e: "plus", s: "stripe", ref: "sub_plus", until: "2026-12-06T12:00:00.000Z", plan: "monthly", founding: true, cus: "cus_1" },
  );
  assert.ok(summarise(rows, null, NOW).plus);
});

test("coach checkouts and other events are handed on (null)", async () => {
  const { store } = memory();
  assert.equal(await handlePlusEvent(checkout({ user_id: "u1", team_id: "t1", plan: "monthly" }), deps(store)), null);
  assert.equal(await handlePlusEvent(ev("invoice.paid", { subscription: "sub_coach", lines: { data: [] } }), deps(store)), null);
  assert.equal(await handlePlusEvent(ev("customer.subscription.updated", { id: "sub_coach", status: "active" }), deps(store)), null);
  assert.equal(await handlePlusEvent(ev("charge.refunded", { refunded: true }), deps(store, {}, "sub_coach")), null);
  assert.equal(await handlePlusEvent(ev("payment_intent.created", {}), deps(store)), null);
});

test("renewal pushes the end out; a failed payment keeps access; cancel at period end keeps it until then", async () => {
  const { rows, store } = memory();
  await handlePlusEvent(checkout({ product: "plus", user_id: "u1", plan: "annual", founding: "0" }), deps(store));
  await handlePlusEvent(ev("invoice.paid", { subscription: "sub_plus", lines: { data: [{ period: { end: secs("2027-12-06T12:00:00Z") } }] } }), deps(store));
  assert.equal(rows[0].expires_at, "2027-12-06T12:00:00.000Z");
  assert.match((await handlePlusEvent(ev("invoice.payment_failed", { subscription: "sub_plus" }), deps(store)))!, /access holds/);
  assert.equal(rows[0].expires_at, "2027-12-06T12:00:00.000Z");
  await handlePlusEvent(ev("customer.subscription.updated", { id: "sub_plus", status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: secs("2027-12-06T12:00:00Z") }] } }), deps(store));
  assert.equal(rows[0].cancel_at_period_end, true);
  assert.ok(summarise(rows, null, NOW).plus);
  assert.ok(summarise(rows, null, NOW).cancelsAtPeriodEnd);
});

test("a deleted subscription or a full refund ends Swish+ now", async () => {
  for (const end of ["deleted", "refund"] as const) {
    const { rows, store } = memory();
    await handlePlusEvent(checkout({ product: "plus", user_id: "u1", plan: "monthly", founding: "0" }), deps(store));
    if (end === "deleted") await handlePlusEvent(ev("customer.subscription.deleted", { id: "sub_plus", status: "canceled" }), deps(store));
    else await handlePlusEvent(ev("charge.refunded", { refunded: true }), deps(store, {}, "sub_plus"));
    assert.equal(rows[0].expires_at, NOW.toISOString(), end);
    assert.ok(!summarise(rows, null, new Date(NOW.getTime() + 1000)).plus, end);
  }
});

test("a missed renewal is re-checked with Stripe", async () => {
  const { rows, store } = memory();
  await store.upsert("u1", "plus", "stripe", { external_ref: "sub_late", expires_at: "2026-11-05T12:00:00Z" });
  await store.upsert("u2", "plus", "stripe", { external_ref: "sub_gone", expires_at: "2026-11-04T12:00:00Z" });
  const subs = {
    sub_late: { id: "sub_late", status: "active", items: { data: [{ current_period_end: secs("2026-12-05T12:00:00Z") }] } },
    sub_gone: { id: "sub_gone", status: "canceled", items: { data: [] } },
  };
  assert.deepEqual(await resyncLapsedPlus(deps(store, subs)), { resynced: 1, ended: 1 });
  assert.equal(rows[0].expires_at, "2026-12-05T12:00:00.000Z");
});

const access = (patch: Partial<AccessRow>): AccessRow => ({
  id: "ca1", user_id: "coach1", team_id: "t1", team_name: "Valur", email: null, plan: "monthly", status: "active",
  access_until: "2026-12-01T00:00:00Z", cancel_at_period_end: false, verified: false, livemode: false,
  stripe_customer_id: "cus_c", stripe_subscription_id: "sub_c", stripe_checkout_session_id: null, stripe_payment_intent_id: null,
  created_at: "", updated_at: "", ...patch,
});

test("Coach includes Swish+: both rows share the end date and end together", async () => {
  const { rows, store } = memory();
  await syncCoachBundle(access({}), store, NOW);
  assert.deepEqual(rows.map((r) => `${r.entitlement}/${r.source}/${r.expires_at}`).sort(), ["coach/stripe/2026-12-01T00:00:00Z", "plus/coach_bundle/2026-12-01T00:00:00Z"]);
  const live = summarise(rows, "coach", NOW);
  assert.ok(live.plus && live.coach);
  assert.equal(live.plusSource, "coach_bundle");
  assert.equal(live.stripeCustomerId, "cus_c");

  await syncCoachBundle(access({ status: "canceled" }), store, NOW);
  assert.ok(rows.every((r) => r.expires_at === NOW.toISOString()));
  assert.ok(!summarise(rows, null, new Date(NOW.getTime() + 1000)).plus);
});

test("a coach who never went live gets no rows", async () => {
  const { rows, store } = memory();
  await syncCoachBundle(access({ status: "canceled" }), store, NOW);
  assert.equal(rows.length, 0);
});

test("admins and hand-set coaches have both without any rows", () => {
  assert.deepEqual([summarise([], "admin").plus, summarise([], "admin").coach], [true, true]);
  assert.equal(summarise([], "coach").plusSource, "role");
  assert.deepEqual([summarise([], null).plus, summarise([], null).coach], [false, false]);
});

test("a person's own Swish+ is what they manage, ahead of a coach bundle", async () => {
  const { rows, store } = memory();
  await store.upsert("u1", "plus", "coach_bundle", { external_ref: "ca1", expires_at: "2027-05-31T00:00:00Z", plan: "season" });
  await store.upsert("u1", "plus", "stripe", { external_ref: "sub_plus", expires_at: "2026-12-06T00:00:00Z", plan: "monthly" });
  const s = summarise(rows, null, NOW);
  assert.equal(s.plusSource, "stripe");
  assert.equal(s.plan, "monthly");
});

test("founding price: accounts made before launch; everyone until the launch date is set", () => {
  assert.ok(foundingEligible("2026-01-01T00:00:00Z", undefined));
  assert.ok(foundingEligible(null, undefined));
  assert.ok(foundingEligible("2026-11-01T00:00:00Z", "2026-12-01"));
  assert.ok(!foundingEligible("2026-12-02T00:00:00Z", "2026-12-01"));
  assert.ok(!foundingEligible(null, "2026-12-01"));
});
