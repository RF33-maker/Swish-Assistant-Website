import type Stripe from "stripe";
import { accessStatusFromSubscription, isPlanKey, seasonPassEnd } from "./plans";
import type { AccessRow, BillingStore } from "./store";
import type { CoachRoles } from "./roles";

/**
 * What each Stripe event means for a coach's access.
 *
 * The webhook is the only thing that grants or removes access, never the
 * browser coming back from checkout, so a coach cannot reach the Coaches Hub by
 * visiting the success page. Everything is injected (store, roles, Stripe,
 * email) so the whole flow can be exercised in tests without Stripe or a
 * database.
 *
 *   checkout.session.completed   paid: record the plan, switch the coach role on, tell the admin
 *   invoice.paid                 a monthly renewal: push the end date out
 *   invoice.payment_failed       mark past due; access continues while Stripe retries the card
 *   customer.subscription.*      cancel-at-period-end, status changes, and the end of a subscription
 *   charge.refunded              a fully refunded season pass ends access
 */

/** The parts of a Stripe subscription this code reads; the real object has them all. */
export interface SubscriptionLike {
  id: string;
  status: string;
  customer?: string | { id: string } | null;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data?: Array<{ current_period_end?: number }> };
  metadata?: Record<string, string> | null;
  livemode?: boolean;
}

export interface BillingDeps {
  store: BillingStore;
  roles: CoachRoles;
  retrieveSubscription(id: string): Promise<SubscriptionLike>;
  notify(subject: string, text: string): Promise<void>;
  now?: () => Date;
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (!v ? null : typeof v === "string" ? v : v.id);

/** When a subscription's paid period ends (Stripe moved this onto the items in recent API versions). */
export function subscriptionPeriodEnd(sub: SubscriptionLike): Date | null {
  const seconds = sub.items?.data?.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number").sort((a, b) => b - a)[0] ?? sub.current_period_end;
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

export async function handleStripeEvent(event: Stripe.Event, deps: BillingDeps): Promise<string> {
  const { store, roles } = deps;
  const now = deps.now?.() ?? new Date();

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      const md = s.metadata || {};
      const userId = md.user_id || s.client_reference_id;
      const teamId = md.team_id;
      const plan = md.plan;
      if (!userId || !teamId || !isPlanKey(plan)) return "ignored: not a coach checkout";
      if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return "ignored: not paid yet";

      const team = await store.team(teamId);
      if (!team) throw new Error(`team ${teamId} not found for checkout ${s.id}`);

      let accessUntil: Date | null;
      let subscriptionId: string | null = null;
      if (plan === "monthly") {
        subscriptionId = idOf(s.subscription as any);
        if (!subscriptionId) throw new Error(`subscription missing on checkout ${s.id}`);
        accessUntil = subscriptionPeriodEnd(await deps.retrieveSubscription(subscriptionId));
      } else {
        accessUntil = seasonPassEnd(new Date(s.created * 1000));
      }

      const previous = await store.find("user_id", userId);
      const row = await store.upsert({
        user_id: userId,
        team_id: team.team_id,
        team_name: team.name,
        email: s.customer_details?.email || s.customer_email || previous?.email || null,
        plan,
        status: "active",
        access_until: accessUntil ? accessUntil.toISOString() : null,
        cancel_at_period_end: false,
        // Verified follows the person and the team: paying again for the same team keeps it.
        verified: previous?.team_id === team.team_id ? previous.verified : false,
        livemode: !!event.livemode,
        stripe_customer_id: idOf(s.customer as any),
        stripe_subscription_id: subscriptionId,
        stripe_checkout_session_id: s.id,
        stripe_payment_intent_id: idOf(s.payment_intent as any),
      });
      const granted = await roles.grant(userId, team.team_id);
      await deps.notify(
        `New coach: ${team.name} (${plan === "monthly" ? "monthly" : "season pass"})`,
        `${row.email || userId} now has coach access to ${team.name}.\nPlan: ${plan}. Access until ${accessUntil?.toISOString().slice(0, 10) ?? "cancelled"}.\n` +
          `${event.livemode ? "" : "TEST MODE payment.\n"}${granted.reason ? `Role unchanged: ${granted.reason}.\n` : ""}` +
          `If this person doesn't coach ${team.name}, revoke them (and refund in Stripe) from the admin coach access page.`,
      );
      return `granted ${plan} to ${userId} for ${team.name}`;
    }

    case "invoice.paid": {
      const inv = event.data.object as any;
      const subId = idOf(inv.subscription ?? inv.parent?.subscription_details?.subscription);
      if (!subId) return "ignored: not a subscription invoice";
      const row = await store.find("stripe_subscription_id", subId);
      if (!row) return "ignored: no coach for this subscription yet";
      const ends = (inv.lines?.data || []).map((l: any) => l.period?.end).filter((n: unknown): n is number => typeof n === "number").sort((a: number, b: number) => b - a)[0];
      await store.update(row.user_id, {
        status: "active",
        ...(ends ? { access_until: new Date(ends * 1000).toISOString() } : {}),
      });
      await roles.grant(row.user_id, row.team_id);
      return `renewed ${row.user_id}`;
    }

    case "invoice.payment_failed": {
      const inv = event.data.object as any;
      const subId = idOf(inv.subscription ?? inv.parent?.subscription_details?.subscription);
      const row = subId ? await store.find("stripe_subscription_id", subId) : null;
      if (!row) return "ignored: no coach for this subscription";
      await store.update(row.user_id, { status: "past_due" });
      await deps.notify(`Payment failed: ${row.team_name}`, `${row.email || row.user_id}'s card was declined for ${row.team_name}. Stripe will retry; access continues until the subscription is cancelled.`);
      return `past due ${row.user_id}`;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as unknown as SubscriptionLike;
      const row = await store.find("stripe_subscription_id", sub.id);
      if (!row) return "ignored: no coach for this subscription";
      const status = event.type === "customer.subscription.deleted" ? "canceled" : accessStatusFromSubscription(sub.status);
      if (status === "pending") return "ignored: subscription not settled";
      if (status === "canceled") {
        await store.update(row.user_id, { status: "canceled", cancel_at_period_end: false, access_until: now.toISOString() });
        await roles.revoke(row.user_id, row.team_id);
        await deps.notify(`Coach cancelled: ${row.team_name}`, `${row.email || row.user_id}'s subscription for ${row.team_name} has ended and their access is switched off.`);
        return `ended ${row.user_id}`;
      }
      const end = subscriptionPeriodEnd(sub);
      await store.update(row.user_id, {
        status,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        ...(end ? { access_until: end.toISOString() } : {}),
      });
      return `updated ${row.user_id} (${status}${sub.cancel_at_period_end ? ", cancels at period end" : ""})`;
    }

    case "charge.refunded": {
      const ch = event.data.object as Stripe.Charge;
      const pi = idOf(ch.payment_intent as any);
      if (!pi || !ch.refunded) return "ignored: not a full refund";
      const row = await store.find("stripe_payment_intent_id", pi);
      if (!row || row.plan !== "season") return "ignored: no season pass for this charge";
      await store.update(row.user_id, { status: "refunded", access_until: now.toISOString() });
      await roles.revoke(row.user_id, row.team_id);
      return `refunded ${row.user_id}`;
    }

    default:
      return `ignored: ${event.type}`;
  }
}

/**
 * Daily housekeeping: end season passes that have run out, and re-check monthly
 * subscriptions whose end date has passed without a renewal event (a missed
 * webhook must not leave someone with free access, or take it from someone
 * who paid).
 */
export async function expireAccess(deps: BillingDeps): Promise<{ expired: number; resynced: number }> {
  const now = deps.now?.() ?? new Date();
  const grace = 3 * 86_400_000;
  let expired = 0, resynced = 0;
  for (const row of await deps.store.listOpen() as AccessRow[]) {
    if (!row.access_until) continue;
    const until = new Date(row.access_until).getTime();
    if (row.plan === "season") {
      if (until < now.getTime()) {
        await deps.store.update(row.user_id, { status: "expired" });
        await deps.roles.revoke(row.user_id, row.team_id);
        expired++;
      }
    } else if (until + grace < now.getTime() && row.stripe_subscription_id) {
      const sub = await deps.retrieveSubscription(row.stripe_subscription_id);
      const status = accessStatusFromSubscription(sub.status);
      const end = subscriptionPeriodEnd(sub);
      if (status === "canceled") {
        await deps.store.update(row.user_id, { status: "canceled", access_until: now.toISOString() });
        await deps.roles.revoke(row.user_id, row.team_id);
        expired++;
      } else if (end && end.getTime() > until) {
        await deps.store.update(row.user_id, { status: status === "pending" ? row.status : status, access_until: end.toISOString() });
        resynced++;
      } else {
        await deps.store.update(row.user_id, { status: "expired" });
        await deps.roles.revoke(row.user_id, row.team_id);
        expired++;
      }
    }
  }
  return { expired, resynced };
}
