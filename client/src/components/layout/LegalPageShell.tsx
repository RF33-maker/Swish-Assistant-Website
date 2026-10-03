import type { ReactNode } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { AlertTriangle } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
];

/**
 * The privacy, terms and cookie pages: the site header, a title block with
 * links between the three, any draft notice, then the policy text in a card.
 */
export default function LegalPageShell({
  title,
  path,
  updated,
  draftNote,
  children,
}: {
  title: string;
  path: string;
  updated: string;
  draftNote?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>{`${title} | Swish Assistant`}</title>
        <link rel="canonical" href={`https://swishassistant.com${path}`} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16">
        <header className="ch-rise mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Legal</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
            {title}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--ch-muted)]">{updated}</p>
          <nav className="mt-4 flex flex-wrap gap-2" aria-label="Legal pages">
            {LEGAL_PAGES.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                data-active={page.href === path}
                aria-current={page.href === path ? "page" : undefined}
                className="ch-chip inline-flex items-center h-8 px-3.5 text-[13px]"
              >
                {page.label}
              </Link>
            ))}
          </nav>
        </header>

        {draftNote && (
          <p className="ch-rise mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{draftNote}</span>
          </p>
        )}

        <article className="ch-card ch-rise p-6 md:p-10 text-[15px] [&_strong]:font-semibold [&_strong]:text-[color:var(--ch-text)] [&>h2:first-child]:mt-0 [&>p:first-child]:mt-0">
          {children}
        </article>
      </main>
    </div>
  );
}
