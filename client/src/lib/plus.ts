import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { authHeaders } from "@/lib/billingApi";

/**
 * Swish+ on the client: what the signed-in person has, and whether a Swish+
 * feature should show or be locked.
 *
 * Gates are off until launch (VITE_SWISH_PLUS_LIVE=true), so merging this
 * changes nothing anyone sees. To look at the locked state before then, open
 * any page with ?plus=locked (and ?plus=off to stop); it lasts for the tab.
 *
 * In the iOS app no web price or checkout may appear (App Store rules), so
 * isNativeShell() hides every "Get Swish+" link there; the app gets its own
 * in-app purchase later.
 */

export interface PlusPrice {
  key: "monthly" | "annual";
  label: string;
  amount: number;
  foundingAmount: number;
  /** What this person pays: the founding price when they qualify. */
  yourAmount: number;
  currency: string;
  interval: "month" | "year";
}

export interface MyPlan {
  signedIn: boolean;
  plus: boolean;
  coach: boolean;
  plusSource: "apple" | "stripe" | "coach_bundle" | "manual" | "role" | null;
  plan: "monthly" | "annual" | "season" | null;
  expiresAt: string | null;
  cancelsAtPeriodEnd: boolean;
  founding: boolean;
  canManageBilling: boolean;
  foundingEligible: boolean;
  foundingPercentOff: number;
  configured: boolean;
  testMode: boolean;
  prices: PlusPrice[];
}

const PREVIEW_KEY = "swish-plus-preview";

function readPreviewParam(): void {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(window.location.search).get("plus");
    if (q === "locked") sessionStorage.setItem(PREVIEW_KEY, "1");
    if (q === "off") sessionStorage.removeItem(PREVIEW_KEY);
  } catch { /* storage blocked: no preview */ }
}
// Once as the app loads, since some pages redirect and drop the query string.
readPreviewParam();

function previewLocked(): boolean {
  if (typeof window === "undefined") return false;
  readPreviewParam();
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

/** True once Swish+ is on sale, or while previewing the locked state. */
export const plusGatesOn = (): boolean => import.meta.env.VITE_SWISH_PLUS_LIVE === "true" || previewLocked();

/** Inside the iOS (Capacitor) app. */
export const isNativeShell = (): boolean => typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();

export async function fetchMyPlan(): Promise<MyPlan | null> {
  const res = await fetch("/api/billing/plan", { headers: await authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export function useMyPlan() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["my-plan", user?.id ?? null], queryFn: fetchMyPlan, staleTime: 60_000 });
}

export function useRefreshPlan() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["my-plan"] });
}

/**
 * Whether to show a Swish+ feature. `locked` is only ever true once the plan
 * has loaded (or there's no account), so a member never sees a lock flash;
 * `pending` covers the moment before that.
 */
export function usePlusAccess(): { hasPlus: boolean; locked: boolean; pending: boolean } {
  const { user, isAdmin, isCoach } = useAuth();
  const gates = plusGatesOn();
  // In the locked preview an admin sees what everyone else would.
  const preview = previewLocked();
  const byRole = !preview && (isAdmin || isCoach);
  const plan = useMyPlan();
  if (!gates || byRole) return { hasPlus: true, locked: false, pending: false };
  if (!user) return { hasPlus: false, locked: true, pending: false };
  if (plan.isLoading) return { hasPlus: false, locked: false, pending: true };
  const has = !preview && !!plan.data?.plus;
  return { hasPlus: has, locked: !has, pending: false };
}

export async function startPlusCheckout(plan: "monthly" | "annual", returnTo: string): Promise<string> {
  const res = await fetch("/api/billing/plus/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ plan, returnTo }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error(json.error || "Could not start checkout. Please try again.");
  return json.url;
}

export async function openPlanPortal(returnTo: string): Promise<string> {
  const res = await fetch("/api/billing/portal", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ returnTo }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error(json.error || "Could not open billing. Please try again.");
  return json.url;
}

export const money = (pence: number, currency = "gbp") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(pence / 100);

/** Where a "Get Swish+" link goes, bringing the person back to this page after. */
export const plusHref = (from?: string) => `/plus${from ? `?from=${encodeURIComponent(from)}` : ""}`;
