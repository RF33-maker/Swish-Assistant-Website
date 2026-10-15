import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { BadgeCheck, Loader2 } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { supabase } from "@/lib/supabase";
import { fetchMyAccess, type MyAccess } from "@/lib/billingApi";

/**
 * Where Stripe sends a coach after paying. Access is switched on by the Stripe
 * webhook, which can land a moment after the redirect, so this page waits for
 * it, refreshes the sign-in so the new coach role is in it, and then opens the
 * Coaches Hub. Visiting it without paying changes nothing.
 */

const POLL_MS = 2000;
const GIVE_UP_MS = 90_000;

export default function CoachAccessSuccessPage() {
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const started = useRef(Date.now());

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const status = await fetchMyAccess().catch(() => null);
      if (status?.access?.live) {
        // The coach role rides in the sign-in token: get a fresh one that has it.
        await supabase.auth.refreshSession().catch(() => {});
        if (!stop) setAccess(status.access);
        return;
      }
      if (Date.now() - started.current > GIVE_UP_MS) { if (!stop) setGaveUp(true); return; }
      setTimeout(tick, POLL_MS);
    };
    tick();
    return () => { stop = true; };
  }, []);

  const until = access?.accessUntil ? new Date(access.accessUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet><title>Welcome | Swish Assistant</title><meta name="robots" content="noindex" /></Helmet>
      <SiteHeader />
      <main className="max-w-xl mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-16 text-center">
        {access ? (
          <div className="ch-rise" data-testid="success-ready">
            <span className="mx-auto mb-4 h-14 w-14 rounded-2xl flex items-center justify-center bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-win)]"><BadgeCheck className="h-8 w-8" /></span>
            <h1 className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.4rem] md:text-[3rem] text-[color:var(--ch-text)]">You're in</h1>
            <p className="mt-3 text-[15px] text-[color:var(--ch-text-2)]">
              {access.teamName} now has its Coaches Hub and AI scouting reports{until ? `, ${access.plan === "season" ? "until" : "renewing around"} ${until}` : ""}. A receipt is on its way from Stripe.
            </p>
            <a href="/coaches-hub" className="ch-btn ch-btn-primary h-12 px-7 mt-6 inline-flex text-[15px]" data-testid="open-hub">Open your Coaches Hub</a>
            <p className="mt-4 text-xs text-[color:var(--ch-muted)]">Open any opponent's scout report from your next fixture. You can change your card or cancel any time from Billing in the hub.</p>
          </div>
        ) : gaveUp ? (
          <div className="ch-rise" data-testid="success-slow">
            <h1 className="ch-display uppercase font-bold tracking-tight text-[2rem] text-[color:var(--ch-text)]">Payment received</h1>
            <p className="mt-3 text-[15px] text-[color:var(--ch-text-2)]">Setting up your access is taking longer than usual. It will appear within a few minutes: refresh this page, or open your Coaches Hub. If it still isn't there, tell us and we will sort it straight away.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href="/coach-access/success" className="ch-btn ch-btn-primary h-10 px-5">Refresh</a>
              <Link href="/contact-sales?topic=coach" className="ch-btn ch-btn-ghost h-10 px-5">Tell us</Link>
            </div>
          </div>
        ) : (
          <div className="ch-rise" data-testid="success-waiting">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[color:var(--ch-accent)]" />
            <h1 className="mt-4 ch-display uppercase font-bold tracking-tight text-[2rem] text-[color:var(--ch-text)]">Setting up your team</h1>
            <p className="mt-2 text-[15px] text-[color:var(--ch-text-2)]">Thanks, payment received. This takes a few seconds.</p>
          </div>
        )}
      </main>
    </div>
  );
}
