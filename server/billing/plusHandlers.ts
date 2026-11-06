import type Stripe from "stripe";
import { accessStatusFromSubscription } from "./plans";
import { subscriptionPeriodEnd, type SubscriptionLike } from "./handlers";
import type { EntitlementStore } from "./entitlements";

/**
 * Swish+ bought on the website: what each Stripe event means for the "plus"
 * entitlement. Coach events are left to handlers.ts (they carry a team_id);
 * this returns null for anything that isn't a Swish+ purchase so the webhook
 * can hand it on.
 *
 *   checkout.session.completed      paid: grant plus to the end of the first period
 *   invoice.paid                    renewal: push the end date out
 *   invoice.payment_failed          nothing changes; access holds while Stripe retries
 *   customer.subscription.updated   end date, cancel-at-period-end, or ended
 *   customer.subscription.deleted   ends now
 *   charge.refunded                 a full refund ends it now
 */

export type PlusPlan = "monthly" | "annual";
export const PLUS_PLANS: Record<PlusPlan, { lookupKey: string; interval: "month" | "year"; label: string }> = {
  monthly: { lookupKey: "plus_monthly", interval: "month", label: "Monthly" },
  annual: { lookupKey: "plus_annual", interval: "year", label: "Annual" },
};
export const isPlusPlan = (v: unknown): v is PlusPlan => v === "monthly" || v === "annual";

export interface PlusDeps {
  entitlements: EntitlementStore;
  retrieveSubscription(id: string): Promise<SubscriptionLike>;
  /** The subscription a charge paid for, when it paid for one. */
  subscriptionForCharge(charge: Stripe.Charge): Promise<string | null>;
  now?: () => Date;
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (!v ? null : typeof v === "string" ? v : v.id);
const subIdOfInvoice = (inv: any): string | null => idOf(inv.subscription ?? inv.parent?.subscription_details?.subscription);

export async function handlePlusEvent(event: Stripe.Event, deps: PlusDeps): Promise<string | null> {
  const { entitlements } = deps;
  const now = deps.now?.() ?? new Date();

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const md = s.metadata || {};
      if (md.product !== "plus") return null;
      const userId = md.user_id || s.client_reference_id;
      if (!userId || !isPlusPlan(md.plan)) return "ignored: Swish+ checkout without a user or plan";
      if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return "ignored: not paid yet";
      const subscriptionId = idOf(s.subscription as any);
      if (!subscriptionId) throw new Error(`subscription missing on Swish+ checkout ${s.id}`);
      const end = subscriptionPeriodEnd(await deps.retrieveSubscription(subscriptionId));
      await entitlements.upsert(userId, "plus", "stripe", {
        external_ref: subscriptionId,
        expires_at: (end ?? new Date(now.getTime() + 86_400_000)).toISOString(),
        plan: md.plan,
        founding: md.founding === "1",
        cancel_at_period_end: false,
        stripe_customer_id: idOf(s.customer as any),
        livemode: !!event.livemode,
      });
      return `Swish+ ${md.plan} for ${userId}${md.founding === "1" ? " (founding price)" : ""}`;
    }

    case "invoice.paid": {
      const subId = subIdOfInvoice(event.data.object);
      if (!subId) return null;
      const row = await entitlements.byRef(subId, "stripe");
      if (!row) return null;
      const ends = ((event.data.object as any).lines?.data || []).map((l: any) => l.period?.end).filter((n: unknown): n is number => typeof n === "number").sort((a: number, b: number) => b - a)[0];
      if (ends) await entitlements.updateByRef(subId, "stripe", { expires_at: new Date(ends * 1000).toISOString() });
      return `Swish+ renewed for ${row.user_id}`;
    }

    case "invoice.payment_failed": {
      const subId = subIdOfInvoice(event.data.object);
      const row = subId ? await entitlements.byRef(subId, "stripe") : null;
      return row ? `Swish+ payment failed for ${row.user_id}; access holds while Stripe retries` : null;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as SubscriptionLike;
      const row = await entitlements.byRef(sub.id, "stripe");
      if (!row) return sub.metadata?.product === "plus" ? "ignored: Swish+ subscription not granted yet" : null;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : accessStatusFromSubscription(sub.status);
      if (status === "pending") return "ignored: subscription not settled";
      if (status === "canceled") {
        await entitlements.updateByRef(sub.id, "stripe", { expires_at: now.toISOString(), cancel_at_period_end: false });
        return `Swish+ ended for ${row.user_id}`;
      }
      const end = subscriptionPeriodEnd(sub);
      await entitlements.updateByRef(sub.id, "stripe", {
        cancel_at_period_end: !!sub.cancel_at_period_end,
        ...(end ? { expires_at: end.toISOString() } : {}),
      });
      return `Swish+ updated for ${row.user_id}${sub.cancel_at_period_end ? " (cancels at period end)" : ""}`;
    }

    case "charge.refunded": {
      const ch = event.data.object as Stripe.Charge;
      if (!ch.refunded) return null;
      const subId = await deps.subscriptionForCharge(ch);
      const row = subId ? await entitlements.byRef(subId, "stripe") : null;
      if (!row || !subId) return null;
      await entitlements.updateByRef(subId, "stripe", { expires_at: now.toISOString(), cancel_at_period_end: false });
      return `Swish+ refunded for ${row.user_id}`;
    }

    default:
      return null;
  }
}

/**
 * Daily: Swish+ rows whose end date passed in the last week without a renewal
 * event. Asks Stripe, so a missed webhook neither gives nor takes access.
 */
export async function resyncLapsedPlus(deps: PlusDeps): Promise<{ resynced: number; ended: number }> {
  const now = deps.now?.() ?? new Date();
  let resynced = 0, ended = 0;
  for (const row of await deps.entitlements.recentlyLapsed(new Date(now.getTime() - 7 * 86_400_000), now)) {
    if (!row.external_ref) continue;
    const sub = await deps.retrieveSubscription(row.external_ref);
    const status = accessStatusFromSubscription(sub.status);
    const end = subscriptionPeriodEnd(sub);
    if (status !== "canceled" && end && end.getTime() > now.getTime()) {
      await deps.entitlements.updateByRef(row.external_ref, "stripe", { expires_at: end.toISOString(), cancel_at_period_end: !!sub.cancel_at_period_end });
      resynced++;
    } else {
      ended++; // already past its end date, so it has already stopped
    }
  }
  return { resynced, ended };
}
