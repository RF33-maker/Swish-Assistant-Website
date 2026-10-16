import Stripe from "stripe";

/**
 * One Stripe client for the server, made on first use so the site still starts
 * (and every other page still works) when Stripe isn't set up yet.
 *
 * STRIPE_SECRET_KEY: sk_test_... while testing, sk_live_... when live.
 * STRIPE_WEBHOOK_SECRET: whsec_... for the webhook endpoint (or `stripe listen`).
 */

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) client = new Stripe(key);
  return client;
}

/** True while the secret key is a test-mode key: nothing charged is real. */
export function stripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_") || (process.env.STRIPE_SECRET_KEY || "").startsWith("rk_test_");
}
