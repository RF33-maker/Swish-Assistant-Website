import type { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

// Shared control styles for the sign-in, reset-password and confirm pages.
export const INPUT = "ch-input h-11 px-3.5 text-[15px]";
export const LABEL = "text-[13px] font-medium";
export const CHECKBOX =
  "border-[color:var(--ch-border-strong)] data-[state=checked]:bg-[color:var(--ch-accent)] data-[state=checked]:border-[color:var(--ch-accent)] data-[state=checked]:text-white";
export const LINK = "font-medium text-[color:var(--ch-accent)] hover:underline underline-offset-2";
export const SUBMIT = "ch-btn ch-btn-primary w-full h-11 justify-center text-[15px] disabled:opacity-60";
export const SUCCESS =
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400";
export const ERROR =
  "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300 [&>svg]:text-red-600 dark:[&>svg]:text-red-400";

/**
 * A single account step (reset password, confirm email): the site header
 * with just the logo, a title block, then the step in a card.
 */
export default function AuthShell({
  title,
  intro,
  icon,
  children,
}: {
  title: string;
  intro?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>{`${title} | Swish Assistant`}</title>
      </Helmet>
      <SiteHeader hideSearch />
      <main className="max-w-md mx-auto px-4 md:px-6 pt-10 md:pt-16 pb-16">
        <div className="ch-rise text-center">
          {icon && <div className="mb-4 flex justify-center">{icon}</div>}
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Your account</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.1rem] md:text-[2.5rem] text-[color:var(--ch-text)]">
            {title}
          </h1>
          {intro && <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)]">{intro}</p>}
        </div>
        <div className="ch-card ch-rise mt-6 p-5 md:p-7" style={{ animationDelay: "60ms" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
