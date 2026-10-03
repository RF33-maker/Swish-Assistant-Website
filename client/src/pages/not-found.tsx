import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { ArrowRight, CalendarDays, Shield, Users } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import HomeSearch from "@/components/home/HomeSearch";

const DESTINATIONS = [
  { href: "/scores", label: "Scores & results", icon: CalendarDays },
  { href: "/teams", label: "Find a team", icon: Shield },
  { href: "/players", label: "Find a player", icon: Users },
];

export default function NotFound() {
  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Page not found | Swish Assistant</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <SiteHeader />

      <main className="max-w-2xl mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-16 text-center">
        <div className="ch-rise">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Error 404</div>
          <h1 className="mt-2 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.5rem] md:text-[3.5rem] text-[color:var(--ch-text)]">
            Air ball
          </h1>
          <p className="mt-3 text-sm md:text-[15px] text-[color:var(--ch-text-2)]">
            We couldn't find that page. It may have moved, or the link may be out of date. Try searching instead.
          </p>
        </div>

        <div className="ch-rise mt-7 text-left" style={{ animationDelay: "60ms" }}>
          <HomeSearch />
        </div>

        <div className="ch-rise mt-6 flex flex-wrap justify-center gap-2" style={{ animationDelay: "120ms" }}>
          {DESTINATIONS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="ch-chip inline-flex items-center gap-1.5 h-9 px-3.5 text-[13px]">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>

        <Link href="/" className="ch-rise mt-8 ch-btn ch-btn-primary h-10 px-5" style={{ animationDelay: "160ms" }}>
          Back to home
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </main>
    </div>
  );
}
