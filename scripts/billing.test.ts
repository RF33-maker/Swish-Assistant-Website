// Run with: npx tsx --test scripts/billing.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import Stripe from "stripe";

// The route module builds a Supabase client on import, so give it somewhere to point (nothing is ever called).
process.env.VITE_SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

const { accessIsLive, accessStatusFromSubscription, seasonPassEnd } = await import("../server/billing/plans");
const { expireAccess, handleStripeEvent, subscriptionPeriodEnd } = await import("../server/billing/handlers");
const { registerBillingRoutes, stripeWebhookBodyParser } = await import("../server/billing/billingRoutes");
type AccessRow = import("../server/billing/store").AccessRow;
type BillingDeps = import("../server/billing/handlers").BillingDeps;

// ---------- plans ----------

test("a season pass runs to 31 May, or the next 31 May when too little is left", () => {
  const end = (iso: string) => seasonPassEnd(new Date(iso)).toISOString().slice(0, 10);
  assert.equal(end("2026-10-15T12:00:00Z"), "2027-05-31");
  assert.equal(end("2027-02-01T12:00:00Z"), "2027-05-31");
  assert.equal(end("2026-07-10T12:00:00Z"), "2027-05-31", "bought in the summer: the coming season");
  assert.equal(end("2027-04-15T12:00:00Z"), "2028-05-31", "under 8 weeks left: covers the next season too");
  assert.equal(end("2027-06-02T12:00:00Z"), "2028-05-31");
});

test("subscription statuses map to access", () => {
  assert.equal(accessStatusFromSubscription("active"), "active");
  assert.equal(accessStatusFromSubscription("trialing"), "active");
  assert.equal(accessStatusFromSubscription("past_due"), "past_due");
  assert.equal(accessStatusFromSubscription("unpaid"), "past_due");
  assert.equal(accessStatusFromSubscription("canceled"), "canceled");
  assert.equal(accessStatusFromSubscription("incomplete"), "pending");
});

test("access is live only while active or past due and before the end date", () => {
  const now = new Date("2026-10-15T00:00:00Z");
  assert.ok(accessIsLive({ status: "active", access_until: "2026-11-01T00:00:00Z" }, now));
  assert.ok(accessIsLive({ status: "past_due", access_until: "2026-10-16T00:00:00Z" }, now));
  assert.ok(!accessIsLive({ status: "active", access_until: "2026-10-14T00:00:00Z" }, now));
  for (const status of ["canceled", "expired", "refunded"]) assert.ok(!accessIsLive({ status, access_until: "2027-01-01T00:00:00Z" }, now));
});

// ---------- a memory store, so the whole flow runs without Stripe or a database ----------

function memory() {
  const rows = new Map<string, AccessRow>();
  const events = new Set<string>();
  const teams = new Map([
    ["team-valur", { team_id: "team-valur", name: "Valur", league_id: "league-is" }],
    ["team-reading", { team_id: "team-reading", name: "Reading Rockets", league_id: "league-bcb" }],
  ]);
  const roles = new Map<string, { role: string; team_id: string }>();
  const emails: Array<{ subject: string; text: string }> = [];
  let granted = 0, revoked = 0;
  const subs = new Map<string, any>();
  const admins = new Set<string>();
  let clock = new Date("2026-10-15T12:00:00Z");

  const store: BillingDeps["store"] = {
    async claimEvent(id) { if (events.has(id)) return false; events.add(id); return true; },
    async releaseEvent(id) { events.delete(id); },
    async find(by, value) { return Array.from(rows.values()).find((r) => (r as any)[by] === value) ?? null; },
    async upsert(row) {
      const prev = rows.get(row.user_id);
      const next = { id: prev?.id ?? `row-${rows.size + 1}`, created_at: clock.toISOString(), updated_at: clock.toISOString(), cancel_at_period_end: false, verified: false, livemode: false, email: null, access_until: null, stripe_customer_id: null, stripe_subscription_id: null, stripe_checkout_session_id: null, stripe_payment_intent_id: null, ...row } as AccessRow;
      rows.set(row.user_id, next);
      return next;
    },
    async update(userId, patch) { const r = rows.get(userId); if (!r) return null; Object.assign(r, patch); return r; },
    async listOpen() { return Array.from(rows.values()).filter((r) => r.status === "active" || r.status === "past_due"); },
    async team(id) { return teams.get(id) ?? null; },
  };
  const deps: BillingDeps = {
    store,
    roles: {
      async grant(userId, teamId) { if (admins.has(userId)) return { changed: false, reason: "admin keeps the admin role" }; granted++; roles.set(userId, { role: "coach", team_id: teamId }); return { changed: true }; },
      async revoke(userId, teamId) { const r = roles.get(userId); if (!r || (teamId && r.team_id !== teamId)) return { changed: false }; roles.delete(userId); revoked++; return { changed: true }; },
    },
    retrieveSubscription: async (id) => subs.get(id) ?? { id, status: "active", items: { data: [{ current_period_end: Math.floor(Date.parse("2026-11-15T12:00:00Z") / 1000) }] } },
    notify: async (subject, text) => { emails.push({ subject, text }); },
    now: () => clock,
  };
  return { rows, events, roles, emails, subs, admins, deps, store, setNow: (d: string) => { clock = new Date(d); }, counts: () => ({ granted, revoked }) };
}

const ev = (type: string, object: any, extra: Partial<Stripe.Event> = {}): Stripe.Event =>
  ({ id: `evt_${Math.random().toString(36).slice(2)}`, type, livemode: false, data: { object }, ...extra }) as any;

const checkout = (plan: "monthly" | "season", over: any = {}) => ev("checkout.session.completed", {
  id: "cs_1", created: Math.floor(Date.parse("2026-10-15T12:00:00Z") / 1000), payment_status: "paid",
  metadata: { user_id: "user-1", team_id: "team-valur", plan }, customer: "cus_1", customer_details: { email: "coach@valur.is" },
  subscription: plan === "monthly" ? "sub_1" : null, payment_intent: plan === "season" ? "pi_1" : null, ...over,
});

// ---------- the purchase ----------

test("a paid monthly checkout records the plan, switches the coach role on and tells the admin", async () => {
  const m = memory();
  const out = await handleStripeEvent(checkout("monthly"), m.deps);
  assert.match(out, /granted monthly/);
  const row = m.rows.get("user-1")!;
  assert.equal(row.status, "active");
  assert.equal(row.team_name, "Valur");
  assert.equal(row.stripe_subscription_id, "sub_1");
  assert.equal(row.access_until, "2026-11-15T12:00:00.000Z", "access runs to the end of the paid period");
  assert.equal(row.verified, false);
  assert.equal(row.email, "coach@valur.is");
  assert.deepEqual(m.roles.get("user-1"), { role: "coach", team_id: "team-valur" });
  assert.equal(m.emails.length, 1);
  assert.match(m.emails[0].subject, /New coach: Valur/);
  assert.match(m.emails[0].text, /TEST MODE/);
});

test("a season pass runs to the end of the season and keeps its payment for refunds", async () => {
  const m = memory();
  await handleStripeEvent(checkout("season"), m.deps);
  const row = m.rows.get("user-1")!;
  assert.equal(row.plan, "season");
  assert.equal(row.access_until?.slice(0, 10), "2027-05-31");
  assert.equal(row.stripe_payment_intent_id, "pi_1");
  assert.equal(row.stripe_subscription_id, null);
});

test("an unpaid or unrelated checkout changes nothing", async () => {
  const m = memory();
  assert.match(await handleStripeEvent(checkout("monthly", { payment_status: "unpaid" }), m.deps), /not paid/);
  assert.match(await handleStripeEvent(checkout("monthly", { metadata: {} }), m.deps), /not a coach checkout/);
  assert.match(await handleStripeEvent(checkout("monthly", { metadata: { user_id: "u", team_id: "team-valur", plan: "free-for-all" } }), m.deps), /not a coach checkout/);
  assert.equal(m.rows.size, 0);
  assert.equal(m.roles.size, 0);
});

test("a checkout for a team that doesn't exist is an error, so Stripe retries instead of dropping the payment", async () => {
  const m = memory();
  await assert.rejects(handleStripeEvent(checkout("monthly", { metadata: { user_id: "user-1", team_id: "team-nope", plan: "monthly" } }), m.deps), /not found/);
});

test("paying never downgrades an admin", async () => {
  const m = memory();
  m.admins.add("user-1");
  await handleStripeEvent(checkout("monthly"), m.deps);
  assert.equal(m.roles.size, 0, "no coach role written over the admin's");
  assert.equal(m.rows.get("user-1")!.status, "active");
  assert.match(m.emails[0].text, /admin keeps the admin role/);
});

test("verification follows the team: kept when the same team is bought again, reset for another", async () => {
  const m = memory();
  await handleStripeEvent(checkout("season"), m.deps);
  m.rows.get("user-1")!.verified = true;
  await handleStripeEvent(checkout("season", { id: "cs_2" }), m.deps);
  assert.equal(m.rows.get("user-1")!.verified, true);
  await handleStripeEvent(checkout("season", { id: "cs_3", metadata: { user_id: "user-1", team_id: "team-reading", plan: "season" } }), m.deps);
  assert.equal(m.rows.get("user-1")!.verified, false);
  assert.equal(m.rows.get("user-1")!.team_name, "Reading Rockets");
});

// ---------- the life of a subscription ----------

test("a renewal pushes the end date out; a failed payment keeps access while Stripe retries", async () => {
  const m = memory();
  await handleStripeEvent(checkout("monthly"), m.deps);
  await handleStripeEvent(ev("invoice.paid", { subscription: "sub_1", lines: { data: [{ period: { end: Math.floor(Date.parse("2026-12-15T12:00:00Z") / 1000) } }] } }), m.deps);
  assert.equal(m.rows.get("user-1")!.access_until, "2026-12-15T12:00:00.000Z");
  await handleStripeEvent(ev("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }), m.deps);
  assert.equal(m.rows.get("user-1")!.status, "past_due");
  assert.ok(m.roles.has("user-1"), "still a coach while the card is retried");
  assert.ok(m.emails.some((e) => /Payment failed/.test(e.subject)));
  await handleStripeEvent(ev("invoice.paid", { subscription: "sub_1", lines: { data: [{ period: { end: Math.floor(Date.parse("2027-01-15T12:00:00Z") / 1000) } }] } }), m.deps);
  assert.equal(m.rows.get("user-1")!.status, "active", "a paid retry puts it right");
});

test("cancelling at period end keeps access until then, and the end of the subscription switches it off", async () => {
  const m = memory();
  await handleStripeEvent(checkout("monthly"), m.deps);
  const sub = { id: "sub_1", status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: Math.floor(Date.parse("2026-11-15T12:00:00Z") / 1000) }] } };
  await handleStripeEvent(ev("customer.subscription.updated", sub), m.deps);
  assert.equal(m.rows.get("user-1")!.cancel_at_period_end, true);
  assert.ok(m.roles.has("user-1"), "paid up to the end of the period");
  await handleStripeEvent(ev("customer.subscription.deleted", { ...sub, status: "canceled" }), m.deps);
  assert.equal(m.rows.get("user-1")!.status, "canceled");
  assert.ok(!m.roles.has("user-1"), "coach role removed");
});

test("an event for a subscription we don't know is ignored", async () => {
  const m = memory();
  assert.match(await handleStripeEvent(ev("customer.subscription.deleted", { id: "sub_x", status: "canceled" }), m.deps), /no coach/);
  assert.match(await handleStripeEvent(ev("invoice.paid", { subscription: "sub_x" }), m.deps), /no coach/);
  assert.match(await handleStripeEvent(ev("payment_intent.created", {}), m.deps), /ignored/);
});

test("a full refund ends a season pass; a monthly refund doesn't touch access", async () => {
  const m = memory();
  await handleStripeEvent(checkout("season"), m.deps);
  await handleStripeEvent(ev("charge.refunded", { payment_intent: "pi_1", refunded: false }), m.deps);
  assert.equal(m.rows.get("user-1")!.status, "active", "a partial refund leaves access");
  await handleStripeEvent(ev("charge.refunded", { payment_intent: "pi_1", refunded: true }), m.deps);
  assert.equal(m.rows.get("user-1")!.status, "refunded");
  assert.ok(!m.roles.has("user-1"));
});

test("the subscription's end date is read from its items (current API) or itself (older)", () => {
  assert.equal(subscriptionPeriodEnd({ id: "s", status: "active", items: { data: [{ current_period_end: 100 }, { current_period_end: 200 }] } })?.getTime(), 200_000);
  assert.equal(subscriptionPeriodEnd({ id: "s", status: "active", current_period_end: 300 })?.getTime(), 300_000);
  assert.equal(subscriptionPeriodEnd({ id: "s", status: "active" }), null);
});

// ---------- the daily clean-up ----------

test("season passes end on time; monthly ones are re-checked with Stripe when a renewal was missed", async () => {
  const m = memory();
  await handleStripeEvent(checkout("season"), m.deps); // user-1
  await handleStripeEvent(checkout("monthly", { id: "cs_m", metadata: { user_id: "user-2", team_id: "team-reading", plan: "monthly" }, subscription: "sub_2" }), m.deps);
  await handleStripeEvent(checkout("monthly", { id: "cs_3", metadata: { user_id: "user-3", team_id: "team-valur", plan: "monthly" }, subscription: "sub_3" }), m.deps);

  m.setNow("2026-10-20T00:00:00Z");
  assert.deepEqual(await expireAccess(m.deps), { expired: 0, resynced: 0 }, "nothing has run out yet");

  // Past the monthly end date plus grace: user-2's subscription renewed (missed webhook), user-3's was cancelled.
  m.subs.set("sub_2", { id: "sub_2", status: "active", items: { data: [{ current_period_end: Math.floor(Date.parse("2026-12-15T00:00:00Z") / 1000) }] } });
  m.subs.set("sub_3", { id: "sub_3", status: "canceled" });
  m.setNow("2026-11-20T00:00:00Z");
  assert.deepEqual(await expireAccess(m.deps), { expired: 1, resynced: 1 });
  assert.equal(m.rows.get("user-2")!.access_until, "2026-12-15T00:00:00.000Z");
  assert.equal(m.rows.get("user-3")!.status, "canceled");
  assert.ok(m.roles.has("user-1") && m.roles.has("user-2") && !m.roles.has("user-3"));

  m.setNow("2027-06-02T00:00:00Z");
  m.subs.set("sub_2", { id: "sub_2", status: "canceled" });
  await expireAccess(m.deps);
  assert.equal(m.rows.get("user-1")!.status, "expired", "the season pass ended");
  assert.ok(!m.roles.has("user-1"));
});

// ---------- the webhook endpoint ----------

async function withWebhook(deps: Partial<BillingDeps>, run: (url: string) => Promise<void>) {
  const app = express();
  app.use("/api/stripe/webhook", stripeWebhookBodyParser); // before json, as in the real servers
  app.use(express.json());
  registerBillingRoutes(app, deps);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); } finally { server.close(); }
}

const signed = (payload: string, secret = "whsec_test_secret") =>
  new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret });

test("the webhook accepts a correctly signed event once, and records the purchase", async () => {
  const m = memory();
  await withWebhook(m.deps, async (url) => {
    const payload = JSON.stringify(checkout("season"));
    const post = (body: string, sig: string) => fetch(`${url}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sig }, body });
    const ok = await post(payload, signed(payload));
    assert.equal(ok.status, 200);
    assert.equal(m.rows.get("user-1")?.status, "active");
    const again = await post(payload, signed(payload));
    assert.deepEqual(await again.json(), { received: true, duplicate: true });
    assert.equal(m.counts().granted, 1, "a repeated event is not handled twice");
  });
});

test("the webhook rejects a bad signature, a tampered body and a missing signature", async () => {
  const m = memory();
  await withWebhook(m.deps, async (url) => {
    const payload = JSON.stringify(checkout("season"));
    const post = (body: string, headers: Record<string, string>) => fetch(`${url}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
    assert.equal((await post(payload, { "stripe-signature": signed(payload, "whsec_someone_else") })).status, 400);
    assert.equal((await post(payload.replace("team-valur", "team-reading"), { "stripe-signature": signed(payload) })).status, 400);
    assert.equal((await post(payload, {})).status, 400);
    assert.equal(m.rows.size, 0, "nothing was recorded");
  });
});

test("a failure while handling is reported so Stripe retries, and the event is not marked done", async () => {
  const m = memory();
  m.deps.roles.grant = async () => { throw new Error("auth is down"); };
  await withWebhook(m.deps, async (url) => {
    const payload = JSON.stringify(checkout("season"));
    const res = await fetch(`${url}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signed(payload) }, body: payload });
    assert.equal(res.status, 500);
    assert.equal(m.events.size, 0, "released, so the retry is handled");
  });
});

test("checkout needs a signed-in user", async () => {
  await withWebhook(memory().deps, async (url) => {
    const res = await fetch(`${url}/api/billing/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "monthly", teamId: "team-valur" }) });
    assert.equal(res.status, 401);
    const admin = await fetch(`${url}/api/admin/coach-access`);
    assert.equal(admin.status, 401);
    const cron = await fetch(`${url}/api/cron/coach-access`);
    assert.ok([401, 503].includes(cron.status), "the cron endpoint is not open");
  });
});
