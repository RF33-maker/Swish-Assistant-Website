import { supabase } from "@/lib/supabase";

/** Calls to the billing endpoints (server/billing/billingRoutes.ts), with the signed-in user's token. */

export interface PlanOffer {
  key: "monthly" | "season";
  label: string;
  amount: number;
  currency: string;
  interval: "month" | "season";
}

export interface BillingConfig {
  configured: boolean;
  testMode?: boolean;
  plans: PlanOffer[];
  seasonEnds?: string;
}

export interface MyAccess {
  teamId: string;
  teamName: string;
  plan: "monthly" | "season";
  status: string;
  live: boolean;
  accessUntil: string | null;
  cancelsAtPeriodEnd: boolean;
  verified: boolean;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function fetchBillingConfig(): Promise<BillingConfig> {
  const res = await fetch("/api/billing/config");
  if (!res.ok) return { configured: false, plans: [] };
  return res.json();
}

export async function fetchMyAccess(): Promise<{ access: MyAccess | null; role: string | null; canManageBilling: boolean } | null> {
  const res = await fetch("/api/billing/status", { headers: await authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

/** Starts Stripe Checkout and returns its address. Throws with a message fit to show the coach. */
export async function startCheckout(plan: string, teamId: string): Promise<string> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ plan, teamId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error(json.error || "Could not start checkout. Please try again.");
  return json.url;
}

export async function openBillingPortal(): Promise<string> {
  const res = await fetch("/api/billing/portal", { method: "POST", headers: await authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error(json.error || "Could not open billing.");
  return json.url;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: Number.isInteger(major) ? 0 : 2 }).format(major);
}
