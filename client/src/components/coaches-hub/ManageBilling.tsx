import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { fetchMyAccess, openBillingPortal } from "@/lib/billingApi";

/**
 * "Billing" in the Coaches Hub header: Stripe's own page to change a card, see
 * invoices or cancel. Shown only to a coach who pays through Stripe; coaches an
 * admin set up by hand have nothing to manage, so they see no button.
 */
export default function ManageBilling() {
  const { user, isCoach } = useAuth();
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: ["billing-mine", user?.id], queryFn: fetchMyAccess, enabled: !!user && isCoach, staleTime: 5 * 60_000 });
  if (!status.data?.canManageBilling) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { window.location.assign(await openBillingPortal()); } catch { setBusy(false); }
      }}
      className="inline-flex items-center gap-1.5 h-9 px-2.5 md:px-3 rounded-lg text-[13px] font-medium text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] hover:bg-[color:var(--ch-surface-3)] transition-colors whitespace-nowrap disabled:opacity-50"
      data-testid="button-manage-billing"
    >
      <CreditCard className="w-4 h-4" />
      <span className="hidden lg:inline">{busy ? "Opening…" : "Billing"}</span>
    </button>
  );
}
