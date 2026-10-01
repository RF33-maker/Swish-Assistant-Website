import type { ReactNode } from "react";
import { Reveal } from "@/components/home/motion";

/**
 * The homepage's one section-heading style: a small uppercase eyebrow, a
 * condensed display title, an optional line of copy, and an optional action
 * (a "View all" link, a toggle) aligned to the right on wide screens.
 * Every section uses it so the page reads as one designed piece rather than
 * a stack of separately styled blocks.
 */
export default function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  id,
  tone = "default",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Heading id, for aria-labelledby on the section. */
  id?: string;
  /** "onDark" for sections drawn on a permanently dark band. */
  tone?: "default" | "onDark";
}) {
  const onDark = tone === "onDark";
  return (
    <Reveal className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 md:mb-8">
      <div className="min-w-0">
        {eyebrow && (
          <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] mb-2 ${onDark ? "text-orange-300" : "text-[color:var(--ch-accent)]"}`}>
            <span className="ch-eyebrow-line h-px w-5 bg-current opacity-60" aria-hidden="true" />
            {eyebrow}
          </div>
        )}
        <h2
          id={id}
          className={`ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2rem] md:text-[2.75rem] ${onDark ? "text-white" : "text-[color:var(--ch-text)]"}`}
        >
          {title}
        </h2>
        {description && (
          <p className={`mt-2.5 text-sm md:text-[15px] max-w-2xl ${onDark ? "text-white/65" : "text-[color:var(--ch-text-2)]"}`}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Reveal>
  );
}
