import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, BadgeCheck, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authHeaders, type MyAccess } from "@/lib/billingApi";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_GHOST, ERROR, HINT, Panel } from "@/components/layout/proUi";

/**
 * Admin: who has paid for coach access to which team. Payment switches access on
 * at once; this page is where you check each coach really coaches that team
 * ("Verified" unlocks anything private to a team) or switch someone off.
 * Refunds are made in the Stripe dashboard.
 */

type Row = MyAccess & { id: string; userId: string; email: string | null; livemode: boolean; createdAt: string };

const STATUS_TONE: Record<string, string> = {
  active: "var(--ch-win)", past_due: "#d97706", canceled: "var(--ch-muted)", expired: "var(--ch-muted)", refunded: "var(--ch-loss)",
};

export default function CoachAccessAdminPage() {
  const { isAdmin, isLoading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/coach-access", { headers: await authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error ?? `Request failed (${res.status})`);
      setRows((json as any).rows);
    } catch (err: any) {
      setError(err.message || "Could not load coach access");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const act = async (id: string, path: "verify" | "revoke", body?: object) => {
    setWorking(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/coach-access/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify(body ?? {}) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error ?? "That didn't work");
      setConfirming(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  };

  const TITLE = "Coach access";
  if (isLoading) return <AdminPageShell title={TITLE} width="max-w-5xl"><AdminPageNotice><Loader2 className="mx-auto h-7 w-7 animate-spin text-[color:var(--ch-accent)]" /></AdminPageNotice></AdminPageShell>;
  if (!isAdmin) return <AdminPageShell title={TITLE} width="max-w-5xl"><AdminPageNotice><p className="font-semibold text-[color:var(--ch-text)]">Access Denied</p></AdminPageNotice></AdminPageShell>;

  return (
    <AdminPageShell title={TITLE} description="Coaches who have paid for their team's Coaches Hub and scouting reports. Access starts as soon as they pay; check each one coaches the team they chose." width="max-w-5xl">
      <Panel
        title={rows ? `${rows.length} ${rows.length === 1 ? "coach" : "coaches"}` : "Loading…"}
        description="Revoking cancels a monthly subscription and switches the coach role off now. Refund in the Stripe dashboard if you need to."
        action={<button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh" className={`${BTN_GHOST} !h-10 !w-10 flex-none !px-0`}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>}
      >
        {error && <div className={`mb-4 flex items-start gap-2 ${ERROR}`}><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /><p>{error}</p></div>}
        {rows && rows.length === 0 && <p className={`${HINT} py-8 text-center`}>No coaches have paid yet.</p>}
        {rows && rows.length > 0 && (
          <div className="ch-tile divide-y divide-[color:var(--ch-border)] overflow-hidden" data-testid="coach-access-list">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-semibold text-sm text-[color:var(--ch-text)] truncate">{r.teamName}{!r.livemode && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-amber-600">test</span>}</p>
                  <p className={`${HINT} truncate`}>{r.email || r.userId} · joined {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</p>
                </div>
                <div className="text-[13px] tabular-nums">
                  <span className="font-semibold" style={{ color: STATUS_TONE[r.status] || "inherit" }}>{r.status.replace("_", " ")}</span>
                  <span className="text-[color:var(--ch-muted)]"> · {r.plan === "season" ? "season pass" : "monthly"}{r.accessUntil ? ` · to ${new Date(r.accessUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}{r.cancelsAtPeriodEnd ? " · cancelling" : ""}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button type="button" disabled={working === r.id} onClick={() => act(r.id, "verify", { verified: !r.verified })} className={`${BTN_GHOST} !h-8 !px-2.5 text-xs`} data-testid={`verify-${r.id}`}>
                    <BadgeCheck className={`h-3.5 w-3.5 ${r.verified ? "text-[color:var(--ch-win)]" : ""}`} /> {r.verified ? "Verified" : "Mark verified"}
                  </button>
                  {r.live && (confirming === r.id ? (
                    <>
                      <button type="button" disabled={working === r.id} onClick={() => act(r.id, "revoke")} className={`${BTN_GHOST} !h-8 !px-2.5 text-xs !text-[color:var(--ch-loss)]`} data-testid={`confirm-revoke-${r.id}`}>{working === r.id ? "Revoking…" : "Yes, revoke"}</button>
                      <button type="button" onClick={() => setConfirming(null)} className={`${BTN_GHOST} !h-8 !px-2.5 text-xs`}>No</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirming(r.id)} className={`${BTN_GHOST} !h-8 !px-2.5 text-xs`}>Revoke</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </AdminPageShell>
  );
}
