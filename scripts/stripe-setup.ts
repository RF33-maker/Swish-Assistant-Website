/**
 * One-off Stripe setup for coach billing. Safe to run again: it only creates
 * what is missing. Reads STRIPE_SECRET_KEY from .env, so run it with a TEST key
 * (sk_test_...) first, and again with the live key when you go live.
 *
 *   npx tsx scripts/stripe-setup.ts
 *   npx tsx scripts/stripe-setup.ts --webhook-url https://swishassistant.com/api/stripe/webhook
 *
 * Creates:
 *   - the product "Swish Assistant coach access"
 *   - a monthly price   (lookup key coach_monthly)  default GBP 10.00 a month
 *   - a season price    (lookup key coach_season)   default GBP 75.00 once
 *   - a Customer portal configuration (change card, see invoices, cancel at period end)
 *   - with --webhook-url, the webhook endpoint (its signing secret is shown once)
 *
 * Change the amounts with MONTHLY_PENCE and SEASON_PENCE, e.g. MONTHLY_PENCE=1200.
 * Prices can also be changed later in the Stripe dashboard: the site finds them by lookup key.
 */
import "dotenv/config";
import Stripe from "stripe";

const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
];

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set in .env. Add your test key (sk_test_...) and run this again.");
  process.exit(1);
}
const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
const stripe = new Stripe(key);
const monthly = Number(process.env.MONTHLY_PENCE || 1000);
const season = Number(process.env.SEASON_PENCE || 7500);
const hook = process.argv.includes("--webhook-url") ? process.argv[process.argv.indexOf("--webhook-url") + 1] : null;

async function main() {
  console.log(`Stripe ${live ? "LIVE" : "test"} mode`);
  if (live) console.log("This is a live key: real prices will be created.");

  // Product
  const found = await stripe.products.search({ query: "metadata['swish']:'coach-access' AND active:'true'" });
  const product = found.data[0] ?? await stripe.products.create({
    name: "Swish Assistant coach access",
    description: "Your team's Coaches Hub, AI scouting reports on every opponent, and printable game plans.",
    metadata: { swish: "coach-access" },
  });
  console.log(`product ${product.id}${found.data[0] ? " (existing)" : " (created)"}`);

  // Prices
  const existing = await stripe.prices.list({ lookup_keys: ["coach_monthly", "coach_season"], active: true, limit: 10 });
  const ensure = async (lookup: string, amount: number, recurring: boolean) => {
    const have = existing.data.find((p) => p.lookup_key === lookup);
    if (have) {
      console.log(`price ${lookup}: ${have.id} (existing, ${(have.unit_amount ?? 0) / 100} ${have.currency.toUpperCase()})${have.unit_amount !== amount ? `  note: differs from ${amount / 100}; change it in the dashboard` : ""}`);
      return;
    }
    const price = await stripe.prices.create({
      product: product.id,
      currency: "gbp",
      unit_amount: amount,
      lookup_key: lookup,
      nickname: lookup === "coach_monthly" ? "Coach, monthly" : "Coach, season pass",
      ...(recurring ? { recurring: { interval: "month" as const } } : {}),
    });
    console.log(`price ${lookup}: ${price.id} (created, ${amount / 100} GBP${recurring ? " a month" : " once"})`);
  };
  await ensure("coach_monthly", monthly, true);
  await ensure("coach_season", season, false);

  // Customer portal
  const portals = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (portals.data.length === 0 || !portals.data[0].features?.subscription_cancel?.enabled) {
    const cfg = await stripe.billingPortal.configurations.create({
      business_profile: { headline: "Manage your Swish Assistant coach access" },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address"] },
        subscription_cancel: { enabled: true, mode: "at_period_end", cancellation_reason: { enabled: true, options: ["too_expensive", "missing_features", "switched_service", "unused", "other"] } },
      },
    });
    console.log(`customer portal: ${cfg.id} (created)`);
  } else {
    console.log(`customer portal: ${portals.data[0].id} (existing, cancellation already on)`);
  }

  // Webhook
  if (hook) {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const have = endpoints.data.find((e) => e.url === hook);
    if (have) {
      console.log(`webhook ${have.id} already points at ${hook}. Its signing secret was shown only when it was created: copy it from the dashboard if you need it.`);
    } else {
      const ep = await stripe.webhookEndpoints.create({ url: hook, enabled_events: EVENTS, description: "Swish Assistant coach billing" });
      console.log(`webhook ${ep.id} created for ${hook}`);
      console.log(`  STRIPE_WEBHOOK_SECRET=${ep.secret}   <- add this to .env / Vercel now, it is not shown again`);
    }
  } else {
    console.log("\nWebhook: for local testing run `stripe listen --forward-to localhost:<port>/api/stripe/webhook` and use the whsec_ it prints.");
    console.log("For a deployed site run this script again with --webhook-url https://<your-site>/api/stripe/webhook");
  }
  console.log("\nEvents the webhook must receive:\n  " + EVENTS.join("\n  "));
}

main().catch((err) => {
  console.error("Stripe setup failed:", err?.message || err);
  process.exit(1);
});
