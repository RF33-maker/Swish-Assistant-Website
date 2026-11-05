import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { BadgeCheck, Check, Lock, Minus, ShieldCheck } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { useAuth } from "@/hooks/use-auth";
import { isNativeShell, money, openPlanPortal, startPlusCheckout, useMyPlan, useRefreshPlan, type MyPlan } from "@/lib/plus";

/**
 * /plus: what Swish+ adds, its price (the founding price for accounts made
 * before launch), and Stripe checkout. Payment switches Swish+ on through the
 * Stripe webhook (server/billing/plusHandlers.ts); this page never grants
 * anything itself, it only waits for the plan to show up after checkout.
 *
 * In the iOS app the page lists what Swish+ includes but shows no price or
 * button: App Store rules forbid pointing at web checkout.
 */

type Row = { label: string; free: string | boolean; plus: string | boolean };

const ROWS: Array<{ group: string; rows: Row[] }> = [
  {
    group: "Games and leagues",
    rows: [
      { label: "Live scores, results, standings and brackets", free: true, plus: true },
      { label: "Box scores, play-by-play, game flow and shot charts", free: true, plus: true },
      { label: "League leaders, team pages and team stats", free: true, plus: true },
      { label: "On/Off for every game: who swung it, stint by stint", free: false, plus: true },
    ],
  },
  {
    group: "Players",
    rows: [
      { label: "This season: averages, shooting and game log", free: true, plus: true },
      { label: "Past seasons and career totals", free: "Last season", plus: "Every season" },
      { label: "Advanced splits: ratings, usage, assist and rebound rates", free: false, plus: true },
      { label: "On/Off impact", free: false, plus: true },
      { label: "Season shot chart and shot zones", free: false, plus: true },
      { label: "League rankings, player comparison and the player landscape", free: false, plus: true },
    ],
  },
  {
    group: "Ask Swish and more",
    rows: [
      { label: "Ask Swish questions", free: "20 a month", plus: "300 a month" },
      { label: "Follow teams and players, your For You feed", free: true, plus: true },
      { label: "Shareable cards", free: true, plus: true },
    ],
  },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-[color:var(--ch-accent)]" strokeWidth={2.5} aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-[color:var(--ch-muted)]" aria-label="Not included" />;
  return <span className="text-[12.5px] font-medium text-[color:var(--ch-text)]">{value}</span>;
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

function Status({ plan }: { plan: MyPlan }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bundled = plan.plusSource === "coach_bundle" || plan.plusSource === "role";
  const manage = async () => {
    setBusy(true);
    setError(null);
    try { window.location.assign(await openPlanPortal("/plus")); } catch (err: any) { setError(err?.message); setBusy(false); }
  };
  return (
    <div className="mt-8 text-center" data-testid="plus-status">
      <BadgeCheck className="mx-auto h-8 w-8 text-[color:var(--ch-accent)]" />
      <p className="mt-2 text-lg font-semibold text-[color:var(--ch-text)]">
        {bundled ? "Swish+ is included with your account" : "You have Swish+"}
      </p>
      <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">
        {plan.plusSource === "coach_bundle" ? "It comes with your Coach plan at no extra cost." :
          plan.plusSource === "role" ? "It comes with your coach or admin access." :
          plan.expiresAt ? `${plan.plan === "annual" ? "Annual" : "Monthly"}${plan.founding ? ", founding price" : ""}. ${plan.cancelsAtPeriodEnd ? "Ends" : "Renews"} ${dateOf(plan.expiresAt)}.` : null}
      </p>
      {plan.canManageBilling && !isNativeShell() && plan.plusSource !== "role" && (
        <button type="button" onClick={manage} disabled={busy} className="ch-btn ch-btn-ghost h-10 px-5 mt-4 inline-flex" data-testid="plus-manage">
          {busy ? "Opening…" : "Manage billing"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-[color:var(--ch-loss)]" role="alert">{error}</p>}
    </div>
  );
}

export default function PlusPage() {
  const { user, isLoading: authLoading } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const back = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const welcome = params.get("welcome") === "1";
  const native = isNativeShell();
  const [interval, setInterval_] = useState<"annual" | "monthly">("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = useMyPlan();
  const refresh = useRefreshPlan();

  // Back from checkout: the webhook may land a moment after the browser does.
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    if (!welcome || plan.data?.plus || waited >= 10) return;
    const t = window.setTimeout(() => { refresh(); setWaited((n) => n + 1); }, 1500);
    return () => window.clearTimeout(t);
  }, [welcome, plan.data?.plus, waited, refresh]);

  const prices = plan.data?.prices ?? [];
  const chosen = prices.find((p) => p.key === interval);
  const monthly = prices.find((p) => p.key === "monthly");
  const annual = prices.find((p) => p.key === "annual");
  const founding = !!plan.data?.foundingEligible && !!chosen && chosen.yourAmount < chosen.amount;
  const annualSaving = monthly && annual ? Math.round((1 - annual.yourAmount / (monthly.yourAmount * 12)) * 100) : 0;
  const returnTo = `/plus${back ? `?from=${encodeURIComponent(back)}` : ""}`;

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try { window.location.assign(await startPlusCheckout(interval, back ?? "/plus")); } catch (err: any) { setError(err?.message || "Something went wrong. Please try again."); setBusy(false); }
  };

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Swish+ | Swish Assistant</title>
        <meta name="description" content="Swish+ adds every season, advanced splits, on/off, shot zones, player comparisons and more Ask Swish questions across British basketball." />
      </Helmet>
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-8 md:pt-14 pb-20">
        <div className="ch-rise text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Swish+</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.4rem] md:text-[3.4rem] text-[color:var(--ch-text)]">Go deeper on every player</h1>
          <p className="mt-3 text-[15px] text-[color:var(--ch-text-2)] max-w-xl mx-auto">Scores and box scores stay free. Swish+ adds the history, the advanced numbers and the tools to compare, across every league we cover.</p>
        </div>

        {welcome && (
          <p className="mt-6 text-center text-[15px] font-semibold text-[color:var(--ch-text)]" role="status" data-testid="plus-welcome">
            {plan.data?.plus ? "Welcome to Swish+. Everything is unlocked." : waited >= 10 ? "Payment received. Swish+ can take a minute to switch on: refresh this page shortly." : "Payment received. Switching Swish+ on…"}
          </p>
        )}
        {welcome && plan.data?.plus && back && (
          <p className="mt-2 text-center"><Link href={back} className="ch-btn ch-btn-primary h-10 px-5 inline-flex">Back to where you were</Link></p>
        )}

        {plan.data?.testMode && plan.data?.configured && !native && !plan.data?.plus && (
          <div className="mt-6 rounded-xl border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200" data-testid="test-mode-banner">
            <strong>Test mode.</strong> Nothing is charged. Pay with card <span className="font-mono">4242 4242 4242 4242</span>, any future expiry and any 3-digit CVC.
          </div>
        )}

        {plan.isLoading || authLoading ? (
          <div className="mt-8 h-32 rounded-2xl bg-[color:var(--ch-surface-2)] animate-pulse" />
        ) : plan.data?.plus ? (
          <Status plan={plan.data} />
        ) : native ? null : !plan.data?.configured ? (
          <div className="mt-8 text-center" data-testid="plus-soon">
            <Lock className="mx-auto h-6 w-6 text-[color:var(--ch-muted)]" />
            <p className="mt-2 font-semibold text-[color:var(--ch-text)]">Swish+ opens soon</p>
            <p className="mt-1 text-sm text-[color:var(--ch-text-2)]">{user ? "Your account is already set for the founding price." : "Make a free account now and you'll get the founding price: 20% off for as long as you stay."}</p>
            {!user && <Link href={`/auth?tab=register&next=${encodeURIComponent(returnTo)}`} className="ch-btn ch-btn-primary h-10 px-5 mt-4 inline-flex">Create free account</Link>}
          </div>
        ) : (
          <section className="mt-8 flex flex-col items-center" aria-label="Choose how to pay">
            <div role="radiogroup" aria-label="Billing" className="inline-flex rounded-full border border-[color:var(--ch-border)] p-1">
              {(["annual", "monthly"] as const).map((k) => (
                <button
                  key={k} type="button" role="radio" aria-checked={interval === k} onClick={() => setInterval_(k)} data-testid={`plus-${k}`}
                  className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${interval === k ? "bg-[color:var(--ch-accent)] text-white" : "text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"}`}
                >
                  {k === "annual" ? "Annual" : "Monthly"}
                  {k === "annual" && annualSaving > 0 && <span className={`ml-1.5 text-[11px] font-bold ${interval === k ? "text-white/85" : "text-[color:var(--ch-accent)]"}`}>Save {annualSaving}%</span>}
                </button>
              ))}
            </div>

            {chosen && (
              <div className="mt-6 text-center" data-testid="plus-price">
                <div className="flex items-baseline justify-center gap-2.5">
                  {founding && <span className="text-xl text-[color:var(--ch-muted)] line-through tabular-nums">{money(chosen.amount, chosen.currency)}</span>}
                  <span className="ch-display text-[3rem] leading-none font-bold tabular-nums text-[color:var(--ch-text)]">{money(chosen.yourAmount, chosen.currency)}</span>
                  <span className="text-sm text-[color:var(--ch-text-2)]">a {chosen.interval}</span>
                </div>
                {founding ? (
                  <p className="mt-2 text-[13.5px] text-[color:var(--ch-text-2)]"><span className="font-semibold text-[color:var(--ch-accent)]">Founding price, {plan.data?.foundingPercentOff}% off</span> for as long as you stay subscribed.</p>
                ) : interval === "annual" && monthly ? (
                  <p className="mt-2 text-[13.5px] text-[color:var(--ch-text-2)]">That's {money(Math.round(chosen.yourAmount / 12), chosen.currency)} a month, billed once a year.</p>
                ) : null}
              </div>
            )}

            <div className="mt-6 w-full max-w-sm space-y-3">
              {!user ? (
                <>
                  <Link href={`/auth?tab=register&next=${encodeURIComponent(returnTo)}`} className="ch-btn ch-btn-primary w-full h-12 justify-center text-[15px]" data-testid="plus-register">Create free account to continue</Link>
                  <Link href={`/auth?next=${encodeURIComponent(returnTo)}`} className="ch-btn ch-btn-ghost w-full h-11 justify-center">I already have one</Link>
                </>
              ) : (
                <button type="button" onClick={checkout} disabled={!chosen || busy} className="ch-btn ch-btn-primary w-full h-12 justify-center text-[15px] disabled:opacity-50" data-testid="plus-checkout">
                  {busy ? "Taking you to Stripe…" : "Get Swish+"}
                </button>
              )}
              {error && <p className="text-sm text-center text-[color:var(--ch-loss)]" role="alert">{error}</p>}
              {params.get("plus_cancelled") && <p className="text-sm text-center text-[color:var(--ch-text-2)]">Payment cancelled. Nothing was charged.</p>}
              <p className="flex items-center justify-center gap-1.5 text-xs text-[color:var(--ch-muted)]"><ShieldCheck className="h-3.5 w-3.5" /> Cancel any time. Card details are taken by Stripe.</p>
            </div>
          </section>
        )}

        <section className="mt-12" aria-label="What Swish+ adds">
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-end gap-x-2 border-b border-[color:var(--ch-border)] pb-2">
            <span />
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">Free</span>
            <span className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Swish+</span>
          </div>
          {ROWS.map(({ group, rows }) => (
            <div key={group}>
              <h2 className="pt-6 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-text)]">{group}</h2>
              {rows.map((r) => (
                <div key={r.label} className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-x-2 border-b border-[color:var(--ch-border)] py-2.5">
                  <span className="text-[14px] text-[color:var(--ch-text-2)]">{r.label}</span>
                  <span className="text-center"><Cell value={r.free} /></span>
                  <span className="text-center"><Cell value={r.plus} /></span>
                </div>
              ))}
            </div>
          ))}
        </section>

        {!native && (
          <p className="mt-10 text-center text-[13.5px] text-[color:var(--ch-text-2)]">
            Coaching a team? <Link href="/coach-access" className="font-semibold text-[color:var(--ch-accent)] underline-offset-2 hover:underline">The Coach plan</Link> includes Swish+ at no extra cost.
          </p>
        )}
      </main>
    </div>
  );
}
