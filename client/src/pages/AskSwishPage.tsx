import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useSearch } from "wouter";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import AskSwishPanel from "@/components/ask-swish/AskSwishPanel";
import { useAskScope, useAskSwish } from "@/components/ask-swish/AskSwishProvider";

/**
 * /ask — the full-page home of Ask Swish, for links and for people who come
 * to ask rather than browse. `?q=` asks straight away, so an answer can be
 * shared as a link.
 */
export default function AskSwishPage() {
  const search = useSearch();
  const { ask, turns, busy } = useAskSwish();
  useAskScope(null, "page");

  useEffect(() => {
    const q = new URLSearchParams(search).get("q");
    if (q && !busy && !turns.some((t) => t.question === q)) ask(q);
    // Only on arrival with a query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className={`flex h-[100dvh] flex-col bg-slate-50 dark:bg-[#0a0a0f] ${SITE_RAIL_OFFSET}`}>
      <Helmet>
        <title>Ask Swish — British basketball stats, answered</title>
        <meta name="description" content="Ask about standings, scores, tip-off times, player and team stats, advanced ratings and on/off impact across British basketball." />
      </Helmet>
      <SiteHeader />
      {/* The panel fills whatever the header leaves, so the bar sits at the foot of the screen. */}
      <main className="ask-page-main flex-1 min-h-0">
        <AskSwishPanel size="page" />
      </main>
    </div>
  );
}
