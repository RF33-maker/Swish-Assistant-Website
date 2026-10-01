import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Clock, Lock } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

interface PlanDetails {
  name: string;
  features: string[];
}

// What each plan is planned to include. Prices and checkout are still being
// finalised, so neither is shown and nothing here can be bought yet.
const PLAN_CONFIGS: Record<string, PlanDetails> = {
  individual: {
    name: "Individual",
    features: [
      "Public league hosting",
      "Full AI league assistant",
      "1 scouting report/month",
      "Priority support",
    ],
  },
  "all-access": {
    name: "All Access",
    features: [
      "Multiple league creation",
      "Full AI assistant features",
      "Full league branding",
      "Unlimited scouting reports",
    ],
  },
};

/**
 * /payment — paid plans are coming soon. The page says so and the subscribe
 * button can't be pressed until checkout opens.
 */
export default function PaymentPage() {
  const plan = PLAN_CONFIGS[new URLSearchParams(window.location.search).get("plan") || ""];

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Plans coming soon | Swish Assistant</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <SiteHeader />

      <main className="max-w-xl mx-auto px-4 md:px-6 pt-10 md:pt-16 pb-16">
        <div className="ch-rise text-center">
          <span className="mx-auto mb-4 h-14 w-14 rounded-2xl flex items-center justify-center bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]">
            <Clock className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Plans</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
            Coming soon
          </h1>
          <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)]">
            We're finalising our paid plans. Everything that's free today stays free, and we'll let members know as soon as subscriptions open.
          </p>
        </div>

        <div className="ch-card ch-rise mt-7 p-5 md:p-7" style={{ animationDelay: "60ms" }} data-testid="payment-coming-soon">
          {plan && (
            <div className="mb-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="ch-display uppercase font-bold tracking-tight leading-none text-[1.4rem] text-[color:var(--ch-text)]">
                  {plan.name} plan
                </h2>
                <span className="rounded-full bg-[color:var(--ch-surface-3)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]">
                  Coming soon
                </span>
              </div>
              <ul className="mt-4 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-[color:var(--ch-text-2)]">
                    <CheckCircle className="h-4 w-4 shrink-0 text-[color:var(--ch-muted)]" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            disabled
            aria-disabled="true"
            className="ch-btn w-full h-11 justify-center text-[15px] bg-[color:var(--ch-surface-3)] text-[color:var(--ch-muted)] cursor-not-allowed"
            data-testid="button-subscribe-disabled"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            Subscribe — coming soon
          </button>
          <p className="mt-3 text-center text-xs text-[color:var(--ch-muted)]">
            Checkout isn't open yet, so you won't be charged for anything.
          </p>
        </div>

        <div className="ch-rise mt-6 flex flex-wrap justify-center gap-3" style={{ animationDelay: "120ms" }}>
          <Link href="/contact-sales" className="ch-btn ch-btn-ghost h-10 px-5">Talk to us</Link>
          <Link href="/" className="ch-btn ch-btn-primary h-10 px-5">Back to home</Link>
        </div>
      </main>
    </div>
  );
}
