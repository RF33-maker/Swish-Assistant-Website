import express, { type Express, type Request, type Response } from "express";
import type Stripe from "stripe";
import { supabaseAdmin } from "../supabaseServiceClient";
import { getStripe, stripeConfigured, stripeTestMode } from "./stripeClient";
import { PLANS, accessIsLive, isPlanKey, seasonPassEnd, type PlanKey } from "./plans";
import { expireAccess, handleStripeEvent, type BillingDeps } from "./handlers";
import { supabaseBillingStore, type AccessRow } from "./store";
import { supabaseCoachRoles } from "./roles";
import { FOUNDING_COUPON_ID, FOUNDING_PERCENT_OFF, foundingEligible, planFor, supabaseEntitlementStore } from "./entitlements";
import { PLUS_PLANS, handlePlusEvent, isPlusPlan, resyncLapsedPlus, type PlusDeps, type PlusPlan } from "./plusHandlers";

/**
 * Coach billing: pick a plan and a team, pay on Stripe, and the webhook turns
 * the coach role on (see handlers.ts).
 *
 *   GET  /api/billing/config          plans and prices, read from Stripe
 *   POST /api/billing/checkout        start a Stripe Checkout for a plan and team
 *   GET  /api/billing/status          the signed-in user's access
 *   POST /api/billing/portal          Stripe's page to change card, see invoices, cancel
 *   POST /api/stripe/webhook          Stripe -> us (signature checked)
 *   GET  /api/cron/coach-access       daily: end expired passes, re-check missed renewals
 *   GET/POST /api/admin/coach-access  admin: list, verify, revoke
 *
 * Swish+ (see plusHandlers.ts and entitlements.ts):
 *
 *   GET  /api/billing/plan            what the signed-in user has, and Swish+ prices for them
 *   POST /api/billing/plus/checkout   start a Stripe Checkout for Swish+ monthly or annual
 */

/** Parses the webhook's body as raw bytes: Stripe's signature is over exactly those bytes. Mount before express.json(). */
export const stripeWebhookBodyParser = express.raw({ type: "application/json", limit: "1mb" });

const RESEND_URL = "https://api.resend.com/emails";

async function notifyAdmin(subject: string, text: string): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !key) {
    console.log(`[billing] (not emailed: ${!to ? "ADMIN_NOTIFY_EMAIL" : "RESEND_API_KEY"} unset) ${subject}`);
    return;
  }
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.CLAIM_EMAIL_FROM || "Swish Assistant <noreply@swishassistant.com>", to: [to], subject, text }),
    });
    if (!res.ok) console.error("[billing] admin email failed:", res.status, (await res.text()).slice(0, 200));
  } catch (err: any) {
    console.error("[billing] admin email failed:", err?.message);
  }
}

function realDeps(): BillingDeps {
  return {
    store: supabaseBillingStore,
    roles: supabaseCoachRoles,
    retrieveSubscription: (id) => getStripe().subscriptions.retrieve(id) as any,
    notify: notifyAdmin,
  };
}

type Caller = { id: string; email: string | null; role: string | null; createdAt: string | null };

async function callerOf(req: Request): Promise<Caller | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, role: (data.user.app_metadata?.role as string) ?? null, createdAt: data.user.created_at ?? null };
}

async function adminOf(req: Request, res: Response): Promise<Caller | null> {
  const caller = await callerOf(req);
  if (!caller) { res.status(401).json({ error: "Sign in required" }); return null; }
  if (caller.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return null; }
  return caller;
}

/** Where Stripe sends people back to: this site, whichever address it is being served from. */
function siteBase(req: Request): string {
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if (!local && process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const proto = local ? req.protocol : "https";
  return `${proto}://${host}`;
}

// ---------- prices, read from Stripe ----------

interface PlanOffer { key: PlanKey; label: string; priceId: string; amount: number; currency: string; interval: "month" | "season" }
let offerCache: { at: number; offers: PlanOffer[] } | null = null;

async function loadOffers(): Promise<PlanOffer[]> {
  if (offerCache && Date.now() - offerCache.at < 5 * 60_000) return offerCache.offers;
  const prices = await getStripe().prices.list({ lookup_keys: Object.values(PLANS).map((p) => p.lookupKey), active: true, limit: 10 });
  const offers: PlanOffer[] = [];
  for (const [key, plan] of Object.entries(PLANS) as Array<[PlanKey, (typeof PLANS)[PlanKey]]>) {
    const price = prices.data.find((p) => p.lookup_key === plan.lookupKey);
    if (!price || price.unit_amount == null) continue;
    offers.push({ key, label: plan.label, priceId: price.id, amount: price.unit_amount, currency: price.currency, interval: key === "monthly" ? "month" : "season" });
  }
  offerCache = { at: Date.now(), offers };
  return offers;
}

// ---------- Swish+ prices ----------

interface PlusOffer { key: PlusPlan; label: string; priceId: string; amount: number; foundingAmount: number; currency: string; interval: "month" | "year" }
let plusCache: { at: number; offers: PlusOffer[]; coupon: boolean } | null = null;

async function loadPlusOffers(): Promise<{ offers: PlusOffer[]; coupon: boolean }> {
  if (plusCache && Date.now() - plusCache.at < 5 * 60_000) return plusCache;
  const stripe = getStripe();
  const prices = await stripe.prices.list({ lookup_keys: Object.values(PLUS_PLANS).map((p) => p.lookupKey), active: true, limit: 10 });
  const coupon = await stripe.coupons.retrieve(FOUNDING_COUPON_ID).then((c) => c.valid && c.percent_off === FOUNDING_PERCENT_OFF).catch(() => false);
  const offers: PlusOffer[] = [];
  for (const [key, plan] of Object.entries(PLUS_PLANS) as Array<[PlusPlan, (typeof PLUS_PLANS)[PlusPlan]]>) {
    const price = prices.data.find((p) => p.lookup_key === plan.lookupKey);
    if (!price || price.unit_amount == null) continue;
    // Stripe rounds the discount to the nearest penny: 20% of 499 is 99.8, so 100 off.
    const off = Math.round((price.unit_amount * FOUNDING_PERCENT_OFF) / 100);
    offers.push({ key, label: plan.label, priceId: price.id, amount: price.unit_amount, foundingAmount: price.unit_amount - off, currency: price.currency, interval: plan.interval });
  }
  // An empty answer isn't kept, so prices made in Stripe show up straight away.
  const result = { at: Date.now(), offers, coupon };
  if (offers.length) plusCache = result;
  return result;
}

function plusDeps(): PlusDeps {
  return {
    entitlements: supabaseEntitlementStore,
    retrieveSubscription: (id) => getStripe().subscriptions.retrieve(id) as any,
    async subscriptionForCharge(charge) {
      const invoiceId = typeof (charge as any).invoice === "string" ? (charge as any).invoice : (charge as any).invoice?.id;
      if (invoiceId) {
        const inv: any = await getStripe().invoices.retrieve(invoiceId);
        return (typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id) ?? inv.parent?.subscription_details?.subscription ?? null;
      }
      // Newer API versions link the charge to its invoice through the payment intent.
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!pi) return null;
      const payments = await (getStripe() as any).invoicePayments?.list?.({ payment: { type: "payment_intent", payment_intent: pi }, limit: 1 }).catch(() => null);
      const inv = payments?.data?.[0]?.invoice;
      if (!inv) return null;
      const full: any = await getStripe().invoices.retrieve(typeof inv === "string" ? inv : inv.id);
      return full.parent?.subscription_details?.subscription ?? (typeof full.subscription === "string" ? full.subscription : null);
    },
  };
}

/** The public face of a coach_access row. */
function shapeAccess(row: AccessRow | null) {
  if (!row) return null;
  return {
    teamId: row.team_id,
    teamName: row.team_name,
    plan: row.plan,
    status: row.status,
    live: accessIsLive(row),
    accessUntil: row.access_until,
    cancelsAtPeriodEnd: row.cancel_at_period_end,
    verified: row.verified,
  };
}

/** A team that can be bought: it exists, and its competition is public (or sits under a public one). */
async function purchasableTeam(teamId: string): Promise<{ team_id: string; name: string; league_id: string } | null> {
  const team = await supabaseBillingStore.team(teamId);
  if (!team) return null;
  const { data: comp } = await supabaseAdmin.from("competitions").select("is_public, parent_league_id").eq("league_id", team.league_id).maybeSingle();
  if (!comp) return null;
  if (comp.is_public) return team;
  if (comp.parent_league_id) {
    const { data: parent } = await supabaseAdmin.from("competitions").select("is_public").eq("league_id", comp.parent_league_id).maybeSingle();
    if (parent?.is_public) return team;
  }
  return null;
}

export function registerBillingRoutes(app: Express, depsOverride?: Partial<BillingDeps>, plusOverride?: Partial<PlusDeps>) {
  const deps = (): BillingDeps => ({ ...realDeps(), ...depsOverride });

  app.get("/api/billing/config", async (_req: Request, res: Response) => {
    try {
      if (!stripeConfigured()) return res.json({ configured: false, plans: [] });
      const offers = await loadOffers();
      return res.json({
        configured: offers.length === Object.keys(PLANS).length,
        testMode: stripeTestMode(),
        plans: offers.map(({ priceId: _p, ...o }) => o),
        seasonEnds: seasonPassEnd().toISOString(),
      });
    } catch (err: any) {
      console.error("[billing] config failed:", err?.message);
      return res.status(500).json({ error: "Could not load prices" });
    }
  });

  app.post("/api/billing/checkout", async (req: Request, res: Response) => {
    try {
      if (!stripeConfigured()) return res.status(503).json({ error: "Payments are not switched on yet" });
      const caller = await callerOf(req);
      if (!caller) return res.status(401).json({ error: "Sign in to continue" });
      const { plan, teamId } = req.body || {};
      if (!isPlanKey(plan)) return res.status(400).json({ error: "Choose a plan" });
      if (typeof teamId !== "string" || !teamId) return res.status(400).json({ error: "Choose your team" });

      const team = await purchasableTeam(teamId);
      if (!team) return res.status(404).json({ error: "That team isn't available" });

      const existing = await supabaseBillingStore.find("user_id", caller.id);
      if (existing && accessIsLive(existing)) {
        return res.status(409).json({ error: `You already have coach access to ${existing.team_name}. Use Manage billing to change it.` });
      }

      const offer = (await loadOffers()).find((o) => o.key === plan);
      if (!offer) return res.status(503).json({ error: "That plan isn't available right now" });

      const metadata = { user_id: caller.id, team_id: team.team_id, team_name: team.name, plan };
      const base = siteBase(req);
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: PLANS[plan].mode,
        line_items: [{ price: offer.priceId, quantity: 1 }],
        client_reference_id: caller.id,
        metadata,
        allow_promotion_codes: true,
        success_url: `${base}/coach-access/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/coach-access?plan=${plan}&team=${team.team_id}&cancelled=1`,
        ...(existing?.stripe_customer_id ? { customer: existing.stripe_customer_id } : caller.email ? { customer_email: caller.email } : {}),
      };
      if (plan === "monthly") params.subscription_data = { metadata, description: `Swish Assistant coach access: ${team.name}` };
      else {
        params.payment_intent_data = { metadata, description: `Swish Assistant season pass: ${team.name}` };
        if (!existing?.stripe_customer_id) params.customer_creation = "always";
      }
      const session = await getStripe().checkout.sessions.create(params);
      return res.json({ url: session.url });
    } catch (err: any) {
      console.error("[billing] checkout failed:", err?.message);
      return res.status(500).json({ error: "Could not start checkout" });
    }
  });

  app.get("/api/billing/plan", async (req: Request, res: Response) => {
    try {
      const caller = await callerOf(req);
      const summary = caller ? await planFor(caller.id, caller.role) : null;
      const founding = caller ? foundingEligible(caller.createdAt) : true;
      let prices: Array<Omit<PlusOffer, "priceId"> & { yourAmount: number }> = [];
      let configured = false;
      if (stripeConfigured()) {
        const { offers, coupon } = await loadPlusOffers();
        configured = offers.length === Object.keys(PLUS_PLANS).length;
        prices = offers.map(({ priceId: _p, ...o }) => ({ ...o, yourAmount: founding && coupon ? o.foundingAmount : o.amount }));
      }
      const { stripeCustomerId, ...plan } = summary ?? { plus: false, coach: false, plusSource: null, plan: null, expiresAt: null, cancelsAtPeriodEnd: false, founding: false, stripeCustomerId: null };
      return res.json({
        signedIn: !!caller,
        ...plan,
        canManageBilling: !!stripeCustomerId,
        foundingEligible: founding,
        foundingPercentOff: FOUNDING_PERCENT_OFF,
        configured,
        testMode: stripeConfigured() ? stripeTestMode() : false,
        prices,
      });
    } catch (err: any) {
      console.error("[billing] plan failed:", err?.message);
      return res.status(500).json({ error: "Could not load your plan" });
    }
  });

  app.post("/api/billing/plus/checkout", async (req: Request, res: Response) => {
    try {
      if (!stripeConfigured()) return res.status(503).json({ error: "Payments are not switched on yet" });
      const caller = await callerOf(req);
      if (!caller) return res.status(401).json({ error: "Sign in to continue" });
      const plan = req.body?.plan;
      if (!isPlusPlan(plan)) return res.status(400).json({ error: "Choose monthly or annual" });

      const summary = await planFor(caller.id, caller.role);
      if (summary.plus) {
        return res.status(409).json({
          error: summary.plusSource === "coach_bundle" || summary.plusSource === "role" ? "Swish+ is already included with your account." : "You already have Swish+. Use Manage billing to change it.",
        });
      }

      const { offers, coupon } = await loadPlusOffers();
      const offer = offers.find((o) => o.key === plan);
      if (!offer) return res.status(503).json({ error: "That plan isn't available right now" });
      const founding = coupon && foundingEligible(caller.createdAt);

      const metadata = { product: "plus", user_id: caller.id, plan, founding: founding ? "1" : "0" };
      const base = siteBase(req);
      const returnTo = typeof req.body?.returnTo === "string" && req.body.returnTo.startsWith("/") && !req.body.returnTo.startsWith("//") ? req.body.returnTo : "/plus";
      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: offer.priceId, quantity: 1 }],
        client_reference_id: caller.id,
        metadata,
        subscription_data: { metadata, description: `Swish+ (${plan})` },
        // Stripe allows a set discount or promotion codes, not both.
        ...(founding ? { discounts: [{ coupon: FOUNDING_COUPON_ID }] } : { allow_promotion_codes: true }),
        success_url: `${base}/plus?welcome=1&from=${encodeURIComponent(returnTo)}`,
        cancel_url: `${base}${returnTo}${returnTo.includes("?") ? "&" : "?"}plus_cancelled=1`,
        ...(summary.stripeCustomerId ? { customer: summary.stripeCustomerId } : caller.email ? { customer_email: caller.email } : {}),
      });
      return res.json({ url: session.url });
    } catch (err: any) {
      console.error("[billing] Swish+ checkout failed:", err?.message);
      return res.status(500).json({ error: "Could not start checkout" });
    }
  });

  app.get("/api/billing/status", async (req: Request, res: Response) => {
    try {
      const caller = await callerOf(req);
      if (!caller) return res.status(401).json({ error: "Sign in required" });
      const row = await supabaseBillingStore.find("user_id", caller.id);
      return res.json({ access: shapeAccess(row), role: caller.role, canManageBilling: !!row?.stripe_customer_id });
    } catch (err: any) {
      console.error("[billing] status failed:", err?.message);
      return res.status(500).json({ error: "Could not load your access" });
    }
  });

  app.post("/api/billing/portal", async (req: Request, res: Response) => {
    try {
      if (!stripeConfigured()) return res.status(503).json({ error: "Payments are not switched on yet" });
      const caller = await callerOf(req);
      if (!caller) return res.status(401).json({ error: "Sign in required" });
      const row = await supabaseBillingStore.find("user_id", caller.id);
      const customer = row?.stripe_customer_id ?? (await planFor(caller.id, caller.role)).stripeCustomerId;
      if (!customer) return res.status(404).json({ error: "No billing to manage yet" });
      const back = typeof req.body?.returnTo === "string" && req.body.returnTo.startsWith("/") && !req.body.returnTo.startsWith("//") ? req.body.returnTo : row?.stripe_customer_id ? "/coaches-hub" : "/plus";
      const session = await getStripe().billingPortal.sessions.create({ customer, return_url: `${siteBase(req)}${back}` });
      return res.json({ url: session.url });
    } catch (err: any) {
      console.error("[billing] portal failed:", err?.message);
      return res.status(500).json({ error: "Could not open billing" });
    }
  });

  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !stripeConfigured()) return res.status(503).json({ error: "Webhook not configured" });
    const signature = req.headers["stripe-signature"];
    if (typeof signature !== "string" || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Bad request" });
    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, secret);
    } catch (err: any) {
      console.warn("[billing] webhook signature rejected:", err?.message);
      return res.status(400).json({ error: "Invalid signature" });
    }
    const d = deps();
    try {
      if (!(await d.store.claimEvent(event.id, event.type))) return res.json({ received: true, duplicate: true });
    } catch (err: any) {
      console.error("[billing] could not record event:", err?.message);
      return res.status(500).json({ error: "Try again" });
    }
    try {
      // Swish+ first: it answers null for anything that isn't a Swish+ purchase.
      const outcome = (await handlePlusEvent(event, { ...plusDeps(), ...plusOverride })) ?? (await handleStripeEvent(event, d));
      console.log(`[billing] ${event.type} ${event.id}: ${outcome}`);
      return res.json({ received: true });
    } catch (err: any) {
      console.error(`[billing] ${event.type} ${event.id} failed:`, err?.message);
      await d.store.releaseEvent(event.id).catch(() => {});
      return res.status(500).json({ error: "Try again" }); // Stripe retries
    }
  });

  // Vercel sends CRON_SECRET as a bearer token.
  app.get("/api/cron/coach-access", async (req: Request, res: Response) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) return res.status(503).json({ error: "CRON_SECRET isn't set." });
    if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorised" });
    try {
      const coach = await expireAccess(deps());
      const plus = await resyncLapsedPlus({ ...plusDeps(), ...plusOverride });
      return res.json({ ...coach, plus });
    } catch (err: any) {
      console.error("[billing] expiry failed:", err?.message);
      return res.status(500).json({ error: "Expiry run failed" });
    }
  });

  // ----- admin -----

  app.get("/api/admin/coach-access", async (req: Request, res: Response) => {
    if (!(await adminOf(req, res))) return;
    const { data, error } = await supabaseAdmin.from("coach_access").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) return res.status(500).json({ error: "Could not load coach access" });
    return res.json({ rows: (data || []).map((r: any) => ({ ...shapeAccess(r), id: r.id, userId: r.user_id, email: r.email, livemode: r.livemode, createdAt: r.created_at })) });
  });

  app.post("/api/admin/coach-access/:id/verify", async (req: Request, res: Response) => {
    if (!(await adminOf(req, res))) return;
    const verified = req.body?.verified !== false;
    const { data, error } = await supabaseAdmin.from("coach_access").update({ verified, updated_at: new Date().toISOString() }).eq("id", req.params.id).select("id, verified").maybeSingle();
    if (error || !data) return res.status(404).json({ error: "Not found" });
    return res.json({ id: data.id, verified: data.verified });
  });

  // Switches access off now. A monthly subscription is cancelled in Stripe too; refunds are done in the Stripe dashboard.
  app.post("/api/admin/coach-access/:id/revoke", async (req: Request, res: Response) => {
    if (!(await adminOf(req, res))) return;
    const { data: row, error } = await supabaseAdmin.from("coach_access").select("*").eq("id", req.params.id).maybeSingle();
    if (error || !row) return res.status(404).json({ error: "Not found" });
    try {
      if (row.plan === "monthly" && row.stripe_subscription_id && stripeConfigured()) {
        await getStripe().subscriptions.cancel(row.stripe_subscription_id).catch((e: any) => { if (e?.code !== "resource_missing") throw e; });
      }
      await supabaseBillingStore.update(row.user_id, { status: "canceled", access_until: new Date().toISOString(), cancel_at_period_end: false });
      await supabaseCoachRoles.revoke(row.user_id, row.team_id);
      return res.json({ id: row.id, status: "canceled" });
    } catch (err: any) {
      console.error("[billing] revoke failed:", err?.message);
      return res.status(500).json({ error: "Could not revoke" });
    }
  });
}
