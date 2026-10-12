import type { ReactNode } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowLeft } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

/**
 * The frame the back-office pages share: the site header and rail, a way
 * back, then the eyebrow / title / blurb block with the page's main actions
 * beside it. Pages lay out their own content with the "pro" classes
 * (.sa-pro in index.css).
 */
export default function AdminPageShell({
  title,
  eyebrow = "Admin",
  description,
  back = { href: "/dashboard", label: "Dashboard" },
  actions,
  width = "max-w-6xl",
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  /** Tailwind max-width class for the content column. */
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>{`${title} | Swish Assistant`}</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <SiteHeader />

      <main className={`mx-auto ${width} px-4 pb-16 pt-6 md:px-6 md:pt-9`}>
        <header className="ch-rise mb-6">
          <Link
            href={back.href}
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" /> {back.label}
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">{eyebrow}</div>
              <h1 className="ch-display mt-1.5 text-[2.25rem] font-bold uppercase leading-[0.95] tracking-tight text-[color:var(--ch-text)] md:text-[3rem]">
                {title}
              </h1>
              {description && <p className="mt-2 max-w-2xl text-sm text-[color:var(--ch-text-2)]">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}

/** Centred spinner or message for a page that is loading or has nothing to show yet. */
export function AdminPageNotice({ children }: { children: ReactNode }) {
  return <div className="ch-card px-5 py-14 text-center text-sm text-[color:var(--ch-text-2)]">{children}</div>;
}
