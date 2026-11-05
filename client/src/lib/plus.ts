import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { authHeaders } from "@/lib/billingApi";

/**
 * Swish+ on the client: what the signed-in person has, and whether a Swish+
 * feature should show or be locked.
 *
 * Until launch (VITE_SWISH_PLUS_LIVE=true) Swish+ features show to admins
 * only, so merging this changes nothing the public sees. To look at the locked
 * state, open any page with ?plus=locked (and ?plus=off to stop); it lasts for
 * the tab.
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
    // The member view, for checking layouts on a dev server without a paid account. Dev builds only.
    if (q === "member" && import.meta.env.DEV) sessionStorage.setItem(PREVIEW_KEY, "member");
    if (q === "off") sessionStorage.removeItem(PREVIEW_KEY);
  } catch { /* storage blocked: no preview */ }
}
// Once as the app loads, since some pages redirect and drop the query string.
readPreviewParam();

function previewMode(): "locked" | "member" | null {
  if (typeof window === "undefined") return null;
  readPreviewParam();
  try {
    const v = sessionStorage.getItem(PREVIEW_KEY);
    return v === "1" ? "locked" : v === "member" && import.meta.env.DEV ? "member" : null;
  } catch {
    return null;
  }
}

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
 * Whether to show a Swish+ feature, and whether it's locked.
 *
 * - Before launch, Swish+ features are visible to admins only (unlocked), so nothing appears free
 *   and is later taken away. ?plus=locked shows anyone the locked state; on a dev server,
 *   ?plus=member shows the member view (the server still checks, so its data needs a member).
 * - After launch, everyone sees them: members, coaches and admins unlocked, everyone else locked.
 *
 * `locked` is only ever true once the plan has loaded (or there's no account), so a member never
 * sees a lock flash; `pending` covers the moment before that.
 */
export function usePlusAccess(): { visible: boolean; hasPlus: boolean; locked: boolean; pending: boolean } {
  const { user, isAdmin, isCoach } = useAuth();
  const live = import.meta.env.VITE_SWISH_PLUS_LIVE === "true";
  const preview = previewMode();
  const plan = useMyPlan();
  if (preview === "locked") return { visible: true, hasPlus: false, locked: true, pending: false };
  if (preview === "member") return { visible: true, hasPlus: true, locked: false, pending: false };
  if (!live) return isAdmin ? { visible: true, hasPlus: true, locked: false, pending: false } : { visible: false, hasPlus: false, locked: false, pending: false };
  if (isAdmin || isCoach) return { visible: true, hasPlus: true, locked: false, pending: false };
  if (!user) return { visible: true, hasPlus: false, locked: true, pending: false };
  if (plan.isLoading) return { visible: true, hasPlus: false, locked: false, pending: true };
  const has = !!plan.data?.plus;
  return { visible: true, hasPlus: has, locked: !has, pending: false };
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
