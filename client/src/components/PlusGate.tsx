import type { ReactNode } from "react";
import { Link } from "wouter";
import { Lock } from "lucide-react";
import { isNativeShell, plusHref, usePlusAccess } from "@/lib/plus";

/**
 * Shows a Swish+ feature to members and a locked note to everyone else.
 * Before launch it renders nothing for anyone but admins (see usePlusAccess).
 *
 * The locked note never renders the real numbers (they'd still be in the
 * page), only a blurred stand-in, so the gate can't be read around. In the iOS
 * app it names Swish+ but offers no web link (App Store rules).
 *
 *   <PlusGate what="Advanced splits and on/off">{…}</PlusGate>
 *   <PlusLockLine what="5 earlier seasons and career totals" />
 */

function GetPlus({ small = false }: { small?: boolean }) {
  if (isNativeShell()) return null;
  const here = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined;
  return (
    <Link href={plusHref(here)} className={`ch-btn ch-btn-primary ${small ? "h-8 px-3.5 text-xs" : "h-10 px-5"} inline-flex`} data-testid="plus-gate-cta">
      Get Swish+
    </Link>
  );
}

/** A whole section behind Swish+. */
export function PlusGate({ what, detail, children, height = 260 }: { what: string; detail?: string; children: ReactNode; height?: number }) {
  const { visible, locked, pending } = usePlusAccess();
  if (!visible) return null;
  if (pending) return <div className="rounded-2xl bg-[color:var(--ch-surface-2)] animate-pulse" style={{ height }} aria-hidden="true" />;
  if (!locked) return <>{children}</>;
  return (
    <section className="relative overflow-hidden" style={{ minHeight: height }} aria-label={`${what}, part of Swish+`} data-testid="plus-gate">
      {/* A stand-in for the real thing: bars and a chart shape, blurred. */}
      <div className="pointer-events-none select-none absolute inset-0 blur-[6px] opacity-60" aria-hidden="true">
        <div className="flex h-full flex-col gap-3 pt-2">
          {[78, 64, 88, 52, 70, 60].map((w, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-16 rounded bg-[color:var(--ch-border-strong)]" />
              <div className="h-3 rounded" style={{ width: `${w}%`, background: "color-mix(in srgb, var(--ch-accent) 40%, transparent)" }} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, color-mix(in srgb, var(--ch-bg) 40%, transparent), color-mix(in srgb, var(--ch-bg) 85%, transparent) 50%, var(--ch-bg))" }} aria-hidden="true" />
      <div className="relative flex flex-col items-center justify-center text-center px-4" style={{ minHeight: height }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]"><Lock className="h-4 w-4" /></span>
        <p className="mt-2.5 text-[15px] font-semibold text-[color:var(--ch-text)]">{what} {isNativeShell() ? "are part of Swish+" : "come with Swish+"}</p>
        {detail && <p className="mt-1 max-w-md text-[13.5px] text-[color:var(--ch-text-2)]">{detail}</p>}
        <div className="mt-4"><GetPlus /></div>
      </div>
    </section>
  );
}

/** One line under a table: what else Swish+ shows here. Renders nothing for members. */
export function PlusLockLine({ what }: { what: string }) {
  const { locked } = usePlusAccess();
  if (!locked) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ch-border)] pt-3" data-testid="plus-lock-line">
      <p className="flex items-center gap-2 text-[13.5px] text-[color:var(--ch-text-2)]">
        <Lock className="h-3.5 w-3.5 text-[color:var(--ch-accent)]" aria-hidden="true" />
        {what} with Swish+
      </p>
      <GetPlus small />
    </div>
  );
}
