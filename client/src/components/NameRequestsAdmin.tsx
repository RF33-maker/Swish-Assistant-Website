import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import {
  approveNameRequest,
  listNameRequests,
  rejectNameRequest,
  type AdminNameRequest,
} from "@/lib/preferredName";

const BTN = "ch-btn h-9 px-3.5 text-[13px] disabled:opacity-50";

/** Admin: players' open requests for a preferred name. */
export default function NameRequestsAdmin() {
  const [rows, setRows] = useState<AdminNameRequest[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setRows((await listNameRequests()).requests);
    } catch (err: any) {
      setError(err.message);
      setRows([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      setError("");
      await fn();
      setRejecting(null);
      setReason("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!rows) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" /></div>;
  }

  return (
    <div className="space-y-3">
      {error && <div className="ch-card p-4 text-sm text-[color:var(--ch-loss)]" role="alert">{error}</div>}
      {rows.length === 0 ? (
        <div className="ch-card p-8 text-center text-sm text-[color:var(--ch-text-2)]">No name requests waiting.</div>
      ) : (
        rows.map((r) => (
          <article key={r.id} className="ch-card p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-[color:var(--ch-muted)]">
                  {r.requested_by_email ?? "A player"} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </p>
                <p className="mt-1 text-[15px] text-[color:var(--ch-text)]">
                  <span className="text-[color:var(--ch-text-2)]">{r.current_name}</span>
                  <span aria-hidden="true" className="mx-2">→</span>
                  <strong>{r.requested_name}</strong>
                </p>
                {r.team_name && <p className="text-[12.5px] text-[color:var(--ch-muted)]">{r.team_name}</p>}
                {r.slug && (
                  <Link href={`/player/${r.slug}`} className="mt-1 inline-block text-[12.5px] text-[color:var(--ch-accent)] hover:underline">View profile</Link>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" className={`${BTN} ch-btn-primary`} disabled={busyId === r.id} onClick={() => void act(r.id, () => approveNameRequest(r.id))}>
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Approve
                </button>
                <button type="button" className={`${BTN} ch-btn-ghost`} disabled={busyId === r.id} onClick={() => setRejecting(rejecting === r.id ? null : r.id)}>
                  Reject
                </button>
              </div>
            </div>
            {rejecting === r.id && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input className="ch-input h-9 flex-1 min-w-[12rem] px-3 text-[13px]" placeholder="Reason (optional)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                <button type="button" className={`${BTN} ch-btn-primary`} disabled={busyId === r.id} onClick={() => void act(r.id, () => rejectNameRequest(r.id, reason))}>
                  Confirm reject
                </button>
              </div>
            )}
          </article>
        ))
      )}
      <p className="text-[12px] text-[color:var(--ch-muted)]">
        Approving renames the player's profile and box scores and keeps the old spelling so new games stay linked.
      </p>
    </div>
  );
}
