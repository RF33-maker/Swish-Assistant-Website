/**
 * Local testing without the Stripe CLI: takes the real events your test-mode
 * payments produced and delivers them to the local webhook, signed with
 * STRIPE_WEBHOOK_SECRET. Stripe can't reach localhost, so after you pay on
 * Stripe's test checkout, run this and the site reacts exactly as it would in
 * production. Safe to repeat: the site handles each event once.
 *
 *   npx tsx scripts/stripe-replay.ts                    last 60 minutes, to http://localhost:5078
 *   npx tsx scripts/stripe-replay.ts --minutes 10 --url http://localhost:5050
 *
 * Needs STRIPE_SECRET_KEY (a test key) and STRIPE_WEBHOOK_SECRET in .env; the
 * secret can be any whsec_ value as long as the running site uses the same one.
 */
import "dotenv/config";
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!key || !secret) {
  console.error("Set STRIPE_SECRET_KEY (test) and STRIPE_WEBHOOK_SECRET in .env first.");
  process.exit(1);
}
if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) {
  console.error("Refusing to replay live events. Use a test key.");
  process.exit(1);
}
const arg = (name: string, fallback: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const minutes = Number(arg("--minutes", "60"));
const base = arg("--url", "http://localhost:5078").replace(/\/$/, "");
const TYPES = new Set(["checkout.session.completed", "invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted", "charge.refunded"]);

const stripe = new Stripe(key);

async function main() {
  const events: Stripe.Event[] = [];
  for await (const e of stripe.events.list({ created: { gte: Math.floor(Date.now() / 1000) - minutes * 60 }, limit: 100 })) {
    if (TYPES.has(e.type)) events.push(e);
  }
  events.sort((a, b) => a.created - b.created); // oldest first, the order Stripe sent them
  if (events.length === 0) {
    console.log(`No coach-billing events from the last ${minutes} minutes. Make a test payment first.`);
    return;
  }
  for (const event of events) {
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: secret! });
    const res = await fetch(`${base}/api/stripe/webhook`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": header }, body: payload });
    const body = await res.text();
    console.log(`${new Date(event.created * 1000).toISOString().slice(11, 19)}  ${event.type.padEnd(34)} ${res.status} ${body.slice(0, 80)}`);
  }
}

main().catch((err) => {
  console.error("Replay failed:", err?.message || err);
  process.exit(1);
});
