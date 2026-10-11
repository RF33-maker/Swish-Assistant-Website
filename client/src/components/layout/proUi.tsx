import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Building blocks for the back-office pages, drawn with the site's "pro"
 * tokens (.sa-pro in index.css) so they read as one product: a titled panel,
 * a labelled field, and the class names for inputs and buttons.
 */

export const FIELD = "ch-input h-10 w-full px-3 text-sm";
/** Select menus open in a portal outside the page, so they carry the tokens themselves. */
export const SELECT_MENU =
  "sa-pro !bg-[color:var(--ch-surface)] !text-[color:var(--ch-text)] border-[color:var(--ch-border-strong)]";
const BTN = "ch-btn justify-center disabled:pointer-events-none disabled:opacity-50";
export const BTN_PRIMARY = `${BTN} ch-btn-primary`;
export const BTN_GHOST = `${BTN} ch-btn-ghost`;
/** .ch-btn fixes its own height and text size, so the main action of a panel has to insist. */
export const TALL = "!h-11 !text-sm";
export const HINT = "text-xs text-[color:var(--ch-muted)]";
export const ERROR = "text-[13px] text-[color:var(--ch-loss)]";

export function Panel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`ch-card min-w-0 ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="min-w-0">
            <h2 className="ch-display flex items-center gap-2 text-[1.4rem] font-bold uppercase leading-none tracking-tight text-[color:var(--ch-text)]">
              {Icon && <Icon className="h-[18px] w-[18px] flex-none text-[color:var(--ch-accent)]" />}
              {title}
            </h2>
            {description && <p className="mt-1.5 text-[13px] text-[color:var(--ch-text-2)]">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={`p-4 sm:p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[13px] font-medium text-[color:var(--ch-text)]">{label}</div>
      {children}
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}
