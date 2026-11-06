import { Link } from "wouter";
import { BadgeCheck } from "lucide-react";
import { isNativeShell, useMyPlan } from "@/lib/plus";

/** The account centre's "Your plan" line: Free, Swish+, or Swish+ included with Coach. */
export function PlanSummaryRow() {
  const plan = useMyPlan();
  const p = plan.data;
  if (plan.isLoading || !p) return null;
  const native = isNativeShell();
  const label = p.coach ? "Coach, with Swish+ included" : p.plus ? "Swish+" : "Free";
  const detail = p.plus && p.expiresAt && p.plusSource !== "role"
    ? `${p.cancelsAtPeriodEnd ? "Ends" : "Renews"} ${new Date(p.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}${p.founding ? " · founding price" : ""}`
    : null;
  return (
    <div data-testid="plan-summary">
      <h3 className="text-sm font-semibold text-[color:var(--ch-text)] mb-1 flex items-center gap-2">
        <BadgeCheck className={`h-4 w-4 ${p.plus ? "text-[color:var(--ch-accent)]" : "text-[color:var(--ch-muted)]"}`} />
        Your plan
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[color:var(--ch-text-2)]">
          <span className="font-semibold text-[color:var(--ch-text)]">{label}</span>
          {detail && <span className="text-[color:var(--ch-muted)]"> · {detail}</span>}
        </p>
        {!native && (
          <Link href={p.coach ? "/coaches-hub" : "/plus"} className="text-sm font-semibold text-[color:var(--ch-accent)] hover:underline underline-offset-2">
            {p.coach ? "Coaches Hub" : p.plus ? "Manage" : "See Swish+"}
          </Link>
        )}
      </div>
    </div>
  );
}
