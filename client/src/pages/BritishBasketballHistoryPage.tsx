import { Helmet } from "react-helmet-async";
import { Landmark } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

const SITE_URL = "https://swishassistant.com";

/**
 * /british-basketball-history — a holding page until the archive ships.
 * Linked from the sidebar and the homepage.
 */
export default function BritishBasketballHistoryPage() {
  const canonical = `${SITE_URL}/british-basketball-history`;
  const description =
    "British basketball history is important. It is coming soon to Swish Assistant so it is never lost.";

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>British Basketball History | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="British Basketball History | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-10 md:pt-16 pb-20">
        <div className="ch-rise">
          <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">
            <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
            Coming soon
          </span>
          <h1 className="mt-4 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.5rem] md:text-[4rem] text-[color:var(--ch-text)]">
            British basketball history
          </h1>
          <p className="mt-5 text-lg md:text-xl text-[color:var(--ch-text-2)] max-w-2xl">
            British basketball history is important. It is coming soon to Swish Assistant so it is never lost.
          </p>
        </div>
      </main>
    </div>
  );
}
