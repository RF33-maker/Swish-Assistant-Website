import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authHeaders } from "@/lib/billingApi";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_GHOST, BTN_PRIMARY, ERROR, FIELD, HINT, Panel } from "@/components/layout/proUi";

/**
 * Admin: games whose listed time looks wrong, and a log of every time change.
 *
 * Times are stored as UK wall-clock time labelled +00 and the site reads them
 * back in UTC (shared/gameTime.ts), so everything here is shown and entered the
 * same way: what you type is the time fans see.
 */

type Kind = "start_mismatch" | "future_dated" | "stuck_live" | "never_started";

interface Finding {
  gameKey: string;
  homeTeam: string | null;
  awayTeam: string | null;
  competition: string | null;
  status: string | null;
  listedWallClock: string;
  kind: Kind;
  reason: string;
  suggestedWallClock: string | null;
  observedWallClock: string | null;
}

interface Change {
  id: string;
  gameKey: string;
  homeTeam: string | null;
  awayTeam: string | null;
  competition: string | null;
  oldMatchtime: string | null;
  newMatchtime: string | null;
  source: "import" | "admin_review";
  changedBy: string | null;
  note: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<Kind, string> = {
  start_mismatch: "Started at a different time",
  future_dated: "Dated in the future",
  stuck_live: "Stuck live",
  never_started: "Never started",
};

/** A stored time (or a wall-clock entry) as the time fans see it. */
function show(value: string | null): string {
  if (!value) return "—";
  const wall = value.replace(" ", "T").slice(0, 16);
  const d = new Date(`${wall}:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

const matchName = (home: string | null, away: string | null) => `${home ?? "?"} v ${away ?? "?"}`;

async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(await authHeaders()) } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any).error ?? `Request failed (${res.status})`);
  return json as any;
}

export default function GameTimesAdminPage() {
  const { isAdmin, isLoading } = useAuth();
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [review, log] = await Promise.all([call("/api/admin/game-times/review"), call("/api/admin/game-times/changes?limit=100")]);
      setFindings(review.findings);
      setChecked(review.checked);
      setChanges(log.changes);
      setNeedsMigration(Boolean(review.needsMigration || log.needsMigration));
    } catch (err: any) {
      setError(err.message || "Could not check the game times");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const act = async (f: Finding, action: "apply" | "dismiss") => {
    setWorking(f.gameKey);
    setError("");
    try {
      const body = action === "apply" ? { wallClock: edits[f.gameKey] ?? f.suggestedWallClock ?? f.listedWallClock } : {};
      await call(`/api/admin/game-times/${encodeURIComponent(f.gameKey)}/${action}`, { method: "POST", body: JSON.stringify(body) });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  };

  const TITLE = "Game times";
  if (isLoading) return <AdminPageShell title={TITLE} width="max-w-5xl"><AdminPageNotice><Loader2 className="mx-auto h-7 w-7 animate-spin text-[color:var(--ch-accent)]" /></AdminPageNotice></AdminPageShell>;
  if (!isAdmin) return <AdminPageShell title={TITLE} width="max-w-5xl"><AdminPageNotice><p className="font-semibold text-[color:var(--ch-text)]">Access Denied</p></AdminPageNotice></AdminPageShell>;

  return (
    <AdminPageShell
      title={TITLE}
      description="Games whose listed time disagrees with what the scorers' feed did. Nothing changes until you change it here, and every change is logged."
      width="max-w-5xl"
    >
      {needsMigration && (
        <div className={`mb-4 flex items-start gap-2 ${ERROR}`} data-testid="game-times-migration">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>The change log isn't set up yet, so times can't be changed or dismissed from here. Apply supabase/migrations/20261017_game_time_review.sql first.</p>
        </div>
      )}
      {error && <div className={`mb-4 flex items-start gap-2 ${ERROR}`}><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /><p>{error}</p></div>}

      <Panel
        title={findings ? `${findings.length} ${findings.length === 1 ? "game needs" : "games need"} a look` : "Checking…"}
        description={`Looked at ${checked || "recent"} games from the last 10 days. Times are shown as fans see them. A game that tips off in BST is not flagged for the usual hour.`}
        action={<button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh" className={`${BTN_GHOST} !h-10 !w-10 flex-none !px-0`}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>}
      >
        {findings && findings.length === 0 && (
          <p className={`${HINT} flex items-center justify-center gap-2 py-8`}><Check className="h-4 w-4 text-[color:var(--ch-win)]" /> Every recent game's time agrees with its feed.</p>
        )}
        {findings && findings.length > 0 && (
          <div className="ch-tile divide-y divide-[color:var(--ch-border)] overflow-hidden" data-testid="game-times-findings">
            {findings.map((f) => {
              const value = edits[f.gameKey] ?? f.suggestedWallClock ?? f.listedWallClock;
              const unchanged = value === f.listedWallClock;
              return (
                <div key={f.gameKey} className="space-y-3 px-4 py-3" data-testid={`game-time-${f.gameKey}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="font-semibold text-sm text-[color:var(--ch-text)]">{matchName(f.homeTeam, f.awayTeam)}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">{KIND_LABEL[f.kind]}</span>
                    <span className={HINT}>{f.competition} · {f.status}</span>
                  </div>
                  <p className="text-[13px] text-[color:var(--ch-text)]">{f.reason}</p>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-[13px] tabular-nums">
                    <div><p className={HINT}>Listed</p><p className="font-semibold">{show(f.listedWallClock)}</p></div>
                    {f.observedWallClock && <div><p className={HINT}>Feed started</p><p className="font-semibold">{show(f.observedWallClock)}</p></div>}
                    <label className="flex flex-col gap-1">
                      <span className={HINT}>Change to</span>
                      <input
                        type="datetime-local"
                        value={value}
                        onChange={(e) => setEdits((prev) => ({ ...prev, [f.gameKey]: e.target.value }))}
                        className={`${FIELD} !w-auto`}
                        data-testid={`game-time-input-${f.gameKey}`}
                      />
                    </label>
                    <div className="ml-auto flex items-center gap-2">
                      <button type="button" disabled={working === f.gameKey || unchanged || needsMigration} onClick={() => act(f, "apply")} className={`${BTN_PRIMARY} !h-9 !px-3 text-xs`} data-testid={`game-time-apply-${f.gameKey}`}>
                        {working === f.gameKey ? "Saving…" : "Change time"}
                      </button>
                      <button type="button" disabled={working === f.gameKey || needsMigration} onClick={() => act(f, "dismiss")} className={`${BTN_GHOST} !h-9 !px-3 text-xs`} data-testid={`game-time-dismiss-${f.gameKey}`}>
                        Time is right
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="h-6" />

      <Panel title="Recent changes" description="Every change to a game's time, from this page or from a schedule sheet being uploaded. If a sheet puts a corrected time back, it shows here.">
        {changes && changes.length === 0 && <p className={`${HINT} py-6 text-center`}>No changes recorded yet.</p>}
        {changes && changes.length > 0 && (
          <div className="ch-tile divide-y divide-[color:var(--ch-border)] overflow-hidden" data-testid="game-times-changes">
            {changes.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate text-sm font-semibold text-[color:var(--ch-text)]">{matchName(c.homeTeam, c.awayTeam)}</p>
                  <p className={`${HINT} truncate`}>{c.competition}</p>
                </div>
                <p className="text-[13px] tabular-nums text-[color:var(--ch-text)]">{show(c.oldMatchtime)} <span className="text-[color:var(--ch-muted)]">→</span> {show(c.newMatchtime)}</p>
                <p className={`${HINT} text-right`}>
                  {c.source === "admin_review" ? `by ${c.changedBy ?? "an admin"}` : "schedule upload"} · {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </AdminPageShell>
  );
}
