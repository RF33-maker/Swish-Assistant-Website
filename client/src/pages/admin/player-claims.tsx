import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import {
  type AdminClaimRow,
  type AdminPlayerRow,
  type RowCandidate,
  ageFromDob,
  formatDob,
  maxDobInputValue,
  rpcErrorMessage,
} from "@/lib/playerClaims";

// Reached through AdminRoute (app_metadata.role = 'admin'). Every action is
// also checked server-side by is_app_admin(), so an admin who isn't in
// app_admins sees "Admin only" errors rather than gaining access.

type Tab = "pending" | "find" | "approved" | "history";

const INPUT = "ch-input h-10 px-3 text-sm w-full";
const BTN = "ch-btn h-9 px-3.5 text-[13px] disabled:opacity-50";
const BTN_PRIMARY = `${BTN} ch-btn-primary`;
const BTN_GHOST = `${BTN} ch-btn-ghost`;

function Badge({ tone, children }: { tone: "amber" | "red" | "green" | "slate" | "blue"; children: React.ReactNode }) {
  const tones = {
    amber: "bg-amber-500/[0.12] text-amber-700 dark:text-amber-300 border-amber-500/30",
    red: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
    green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    slate: "bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)] border-[color:var(--ch-border)]",
    blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === "adult") return <Badge tone="green">Adult</Badge>;
  if (tier === "u18") return <Badge tone="blue">Under 18</Badge>;
  return <Badge tone="slate">Unverified</Badge>;
}

function ErrorLine({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-1.5 text-[13px] text-red-600 dark:text-red-400">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

function dobLine(dob: string | null) {
  if (!dob) return "—";
  const age = ageFromDob(dob);
  return `${formatDob(dob)}${age !== null ? ` (${age})` : ""}`;
}

/**
 * A player usually has one players row per competition. A claim covers all of
 * them: this lists rows that look like the same person so the admin can tick
 * which ones belong to the claim. The main row is always included.
 *
 * Starts with: the main row, rows already on the claim, and (for a new claim)
 * rows with exactly the same name. Name variants ("N. Smith") are listed but
 * not ticked. Rows owned by another claim can't be ticked.
 */
function RowPicker({
  playerId,
  claimId,
  onChange,
}: {
  playerId: string;
  claimId?: string;
  /** Called with the extra (non-main) rows to include whenever the selection changes. */
  onChange: (extraIds: string[]) => void;
}) {
  const [rows, setRows] = useState<RowCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("admin_claim_row_candidates", { p_player_id: playerId, p_claim_id: claimId ?? null })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) return setError(rpcErrorMessage(error, "Couldn't load this player's other rows"));
        const list = (data ?? []) as RowCandidate[];
        const initial = new Set(
          list
            .filter((r) => r.available && (r.match_kind === "covered" || (!claimId && r.match_kind === "exact")))
            .map((r) => r.player_id),
        );
        setRows(list);
        setSelected(initial);
        onChange(Array.from(initial));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, claimId]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    onChange(Array.from(next));
  };

  if (error) return <ErrorLine message={error} />;
  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[color:var(--ch-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Finding this player's other competitions…
      </div>
    );
  }

  const total = 1 + selected.size;
  const games = rows.filter((r) => r.match_kind === "primary" || selected.has(r.player_id)).reduce((n, r) => n + r.games, 0);

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium text-[color:var(--ch-text-2)]">
        Covers {total} {total === 1 ? "competition" : "competitions"} · {games} games
      </p>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-[color:var(--ch-border)] divide-y divide-[color:var(--ch-border)]">
        {rows.map((r) => {
          const isPrimary = r.match_kind === "primary";
          const checked = isPrimary || selected.has(r.player_id);
          const disabled = isPrimary || !r.available;
          return (
            <label
              key={r.player_id}
              className={`flex items-start gap-3 px-3 py-2.5 text-[13px] ${disabled ? "" : "cursor-pointer hover:bg-[color:var(--ch-surface-3)]"} ${!r.available ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[color:var(--ch-accent)]"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(r.player_id)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-[color:var(--ch-text)]">{r.full_name}</span>
                  {isPrimary && <Badge tone="blue">Main profile</Badge>}
                  {r.match_kind === "variant" && <Badge tone="amber">Name variant</Badge>}
                  {!r.available && <Badge tone="slate">Part of another claim</Badge>}
                </span>
                <span className="block text-[12px] text-[color:var(--ch-text-2)] truncate">
                  {[r.team_name, r.competition_name].filter(Boolean).join(" · ") || "No team"} · {r.games} games
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function CoveredSummary({ rows }: { rows: AdminClaimRow["covered_rows"] }) {
  if (!rows?.length) return null;
  const games = rows.reduce((n, r) => n + Number(r.games || 0), 0);
  return (
    <p className="text-[12px] text-[color:var(--ch-text-2)]">
      <span className="font-medium text-[color:var(--ch-text)]">
        {rows.length} {rows.length === 1 ? "competition" : "competitions"} · {games} games:
      </span>{" "}
      {rows.map((r) => r.competition_name || r.team_name || "Unknown").join(", ")}
    </p>
  );
}

export default function PlayerClaimsAdminPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [claims, setClaims] = useState<AdminClaimRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const { data, error } = await supabase.rpc("admin_list_claims");
    if (error) {
      setLoadError(rpcErrorMessage(error, "Couldn't load claims"));
      setClaims(null);
    } else {
      setClaims((data ?? []) as AdminClaimRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadClaims();
  }, [loadClaims]);

  const pending = claims?.filter((c) => c.status === "pending") ?? [];
  const approved = claims?.filter((c) => c.status === "approved") ?? [];
  const history = claims?.filter((c) => c.status === "rejected" || c.status === "revoked") ?? [];

  const tabs: { id: Tab; label: string }[] = [
    { id: "pending", label: `Pending${claims ? ` (${pending.length})` : ""}` },
    { id: "find", label: "Find a player" },
    { id: "approved", label: `Approved${claims ? ` (${approved.length})` : ""}` },
    { id: "history", label: "Rejected & revoked" },
  ];

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Player claims | Swish Assistant</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <SiteHeader />
      <main className="max-w-4xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16">
        <header className="ch-rise mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Admin</div>
            <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
              Player claims
            </h1>
            <p className="mt-2 text-sm text-[color:var(--ch-text-2)] max-w-xl">
              Issue claim codes, verify dates of birth and manage who owns which player profile.
            </p>
          </div>
          <button type="button" className={BTN_GHOST} onClick={() => void loadClaims()} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        <nav className="ch-rise mb-5 flex flex-wrap gap-2" aria-label="Claim views">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              data-active={tab === t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className="ch-chip inline-flex items-center h-8 px-3.5 text-[13px]"
            >
              {t.label}
            </button>
          ))}
        </nav>

        {loadError && (
          <div className="ch-card p-4 mb-4">
            <ErrorLine message={loadError} />
          </div>
        )}

        {tab === "find" ? (
          <FindPlayers onChanged={loadClaims} />
        ) : !claims && loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" />
          </div>
        ) : tab === "pending" ? (
          <ClaimList
            rows={pending}
            empty="No claims waiting for verification."
            render={(c) => <PendingClaim key={c.claim_id} claim={c} onDone={loadClaims} />}
          />
        ) : tab === "approved" ? (
          <ClaimList
            rows={approved}
            empty="No approved profiles yet."
            render={(c) => <ApprovedClaim key={c.claim_id} claim={c} onDone={loadClaims} />}
          />
        ) : (
          <ClaimList rows={history} empty="Nothing rejected or revoked." render={(c) => <HistoryClaim key={c.claim_id} claim={c} />} />
        )}
      </main>
    </div>
  );
}

function ClaimList({
  rows,
  empty,
  render,
}: {
  rows: AdminClaimRow[];
  empty: string;
  render: (c: AdminClaimRow) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <div className="ch-card p-8 text-center text-sm text-[color:var(--ch-text-2)]">{empty}</div>;
  }
  return <div className="space-y-3">{rows.map(render)}</div>;
}

function ClaimHeading({ claim }: { claim: AdminClaimRow }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-[15px] text-[color:var(--ch-text)] truncate">{claim.player_name}</p>
      <p className="text-[13px] text-[color:var(--ch-text-2)] truncate">
        {[claim.team_name, claim.competition_name].filter(Boolean).join(" · ") || "No team"}
      </p>
      <p className="mt-1 text-[12px] text-[color:var(--ch-muted)] truncate">
        {claim.user_email ?? "Deleted account"} · {claim.method === "admin_manual" ? "assigned manually" : "claim code"} ·{" "}
        {formatDistanceToNow(new Date(claim.created_at), { addSuffix: true })}
      </p>
    </div>
  );
}

function PendingClaim({ claim, onDone }: { claim: AdminClaimRow; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"idle" | "correct" | "reject">("idle");
  const [correctedDob, setCorrectedDob] = useState(claim.submitted_dob ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [extraRows, setExtraRows] = useState<string[] | null>(null);

  const approve = async (dob: string) => {
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("approve_claim", {
      p_claim_id: claim.claim_id,
      p_verified_dob: dob,
      // null keeps the rows from the code; the picker always reports a list once loaded.
      p_player_ids: extraRows,
    });
    setBusy(false);
    if (error) return setError(rpcErrorMessage(error, "Couldn't approve"));
    await onDone();
  };

  const reject = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("reject_claim", { p_claim_id: claim.claim_id, p_reason: reason });
    setBusy(false);
    if (error) return setError(rpcErrorMessage(error, "Couldn't reject"));
    await onDone();
  };

  return (
    <div className="ch-card p-4 md:p-5 space-y-4" data-testid={`pending-claim-${claim.claim_id}`}>
      <ClaimHeading claim={claim} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-[color:var(--ch-surface-3)] p-3">
          <p className="text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">Submitted DOB</p>
          <p className="mt-0.5 font-semibold text-[color:var(--ch-text)]">{dobLine(claim.submitted_dob)}</p>
          <div className="mt-1.5">
            <TierBadge tier={claim.submitted_dob_tier} />
          </div>
        </div>
        <div className="rounded-xl bg-[color:var(--ch-surface-3)] p-3">
          <p className="text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">DOB on record</p>
          <p className="mt-0.5 font-semibold text-[color:var(--ch-text)]">{dobLine(claim.existing_dob)}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {claim.existing_dob ? (
              <>
                <TierBadge tier={claim.existing_dob_tier} />
                <Badge tone="slate">{claim.existing_dob_verified ? "Verified" : "From roster, unverified"}</Badge>
              </>
            ) : (
              <Badge tone="slate">None</Badge>
            )}
          </div>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-[color:var(--ch-muted)]">Rows this claim covers</p>
        <RowPicker playerId={claim.player_id} claimId={claim.claim_id} onChange={setExtraRows} />
      </div>

      {(claim.dob_mismatch || claim.tier_change) && (
        <div className="flex flex-wrap gap-2">
          {claim.dob_mismatch && (
            <Badge tone="amber">
              <AlertTriangle className="h-3 w-3" /> Submitted DOB differs from the record
            </Badge>
          )}
          {claim.tier_change && (
            <Badge tone="red">
              <AlertTriangle className="h-3 w-3" />
              Changes tier: {claim.existing_dob_tier === "adult" ? "adult" : "under 18"} →{" "}
              {claim.submitted_dob_tier === "adult" ? "adult" : "under 18"}
            </Badge>
          )}
        </div>
      )}

      {mode === "correct" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[180px]">
            <span className="block text-[12px] font-medium text-[color:var(--ch-text-2)] mb-1">Verified date of birth</span>
            <input
              type="date"
              className={INPUT}
              value={correctedDob}
              max={maxDobInputValue()}
              min="1920-01-01"
              onChange={(e) => setCorrectedDob(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || !correctedDob || extraRows === null}
            onClick={() => void approve(correctedDob)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve with this DOB
          </button>
          <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setMode("idle")}>
            Cancel
          </button>
        </div>
      )}

      {mode === "reject" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[220px]">
            <span className="block text-[12px] font-medium text-[color:var(--ch-text-2)] mb-1">Reason (shown to the player)</span>
            <input
              className={INPUT}
              value={reason}
              maxLength={300}
              placeholder="e.g. We couldn't confirm this is you"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={`${BTN} bg-red-600 text-white hover:bg-red-700`}
            disabled={busy}
            onClick={() => void reject()}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Reject claim
          </button>
          <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setMode("idle")}>
            Cancel
          </button>
        </div>
      )}

      {mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || !claim.submitted_dob || extraRows === null}
            onClick={() => claim.submitted_dob && void approve(claim.submitted_dob)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve submitted DOB
          </button>
          <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setMode("correct")}>
            Correct DOB…
          </button>
          <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => setMode("reject")}>
            Reject…
          </button>
        </div>
      )}

      <ErrorLine message={error} />
    </div>
  );
}

function ApprovedClaim({ claim, onDone }: { claim: AdminClaimRow; onDone: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [editingRows, setEditingRows] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const revoke = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("revoke_claim", { p_claim_id: claim.claim_id });
    setBusy(false);
    setConfirming(false);
    if (error) return setError(rpcErrorMessage(error, "Couldn't revoke"));
    await onDone();
  };

  return (
    <div className="ch-card p-4 md:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClaimHeading claim={claim} />
        <div className="flex gap-2">
          {claim.profile_slug && (
            <Link href={`/p/${claim.profile_slug}`} className={BTN_GHOST}>
              <ExternalLink className="h-4 w-4" /> Profile
            </Link>
          )}
          <button type="button" className={BTN_GHOST} onClick={() => setEditingRows(true)} disabled={busy}>
            Edit rows
          </button>
          <button type="button" className={BTN_GHOST} onClick={() => setConfirming(true)} disabled={busy}>
            Revoke
          </button>
        </div>
      </div>
      <CoveredSummary rows={claim.covered_rows} />
      <p className="text-[13px] text-[color:var(--ch-text-2)]">
        Verified DOB <span className="font-semibold text-[color:var(--ch-text)]">{dobLine(claim.verified_dob)}</span> ·{" "}
        <TierBadge tier={claim.verified_dob ? (ageFromDob(claim.verified_dob)! >= 18 ? "adult" : "u18") : null} />
        {claim.approved_at && <> · approved {formatDistanceToNow(new Date(claim.approved_at), { addSuffix: true })}</>}
      </p>
      <ErrorLine message={error} />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {claim.player_name}'s profile?</AlertDialogTitle>
            <AlertDialogDescription>
              {claim.user_email ?? "The owner"} loses edit access, the public /p/ link stops working, and the date of birth on
              all {claim.covered_rows?.length ?? 1} of their rows goes back to unverified (under-18 privacy) until a new claim
              is approved. Their edited fields are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void revoke();
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editingRows && (
        <EditRowsDialog
          claim={claim}
          onClose={() => setEditingRows(false)}
          onSaved={async () => {
            setEditingRows(false);
            await onDone();
          }}
        />
      )}
    </div>
  );
}

function EditRowsDialog({
  claim,
  onClose,
  onSaved,
}: {
  claim: AdminClaimRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [extraRows, setExtraRows] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (extraRows === null) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("admin_set_claim_rows", { p_claim_id: claim.claim_id, p_player_ids: extraRows });
    setBusy(false);
    if (error) return setError(rpcErrorMessage(error, "Couldn't update the rows"));
    await onSaved();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sa-pro max-h-[90vh] overflow-y-auto bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] border-[color:var(--ch-border)]">
        <DialogHeader>
          <DialogTitle>Rows on {claim.player_name}'s profile</DialogTitle>
          <DialogDescription className="text-[color:var(--ch-text-2)]">
            Added rows get the verified date of birth and link to their profile. Removed rows go back to unverified.
          </DialogDescription>
        </DialogHeader>
        <RowPicker playerId={claim.player_id} claimId={claim.claim_id} onChange={setExtraRows} />
        <ErrorLine message={error} />
        <button type="button" className={`${BTN_PRIMARY} w-full justify-center`} disabled={busy || extraRows === null} onClick={() => void save()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save rows
        </button>
      </DialogContent>
    </Dialog>
  );
}

function HistoryClaim({ claim }: { claim: AdminClaimRow }) {
  const when = claim.status === "revoked" ? claim.revoked_at : claim.rejected_at;
  return (
    <div className="ch-card p-4 md:p-5 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ClaimHeading claim={claim} />
        <Badge tone={claim.status === "revoked" ? "amber" : "red"}>
          {claim.status === "revoked" ? "Revoked" : "Rejected"}
          {when && ` ${formatDistanceToNow(new Date(when), { addSuffix: true })}`}
        </Badge>
      </div>
      <CoveredSummary rows={claim.covered_rows} />
      {claim.rejection_reason && (
        <p className="text-[13px] text-[color:var(--ch-text-2)]">Reason: {claim.rejection_reason}</p>
      )}
    </div>
  );
}

function FindPlayers({ onChanged }: { onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<AdminPlayerRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [issueFor, setIssueFor] = useState<AdminPlayerRow | null>(null);
  const [assignFor, setAssignFor] = useState<AdminPlayerRow | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setRows(null);
      return;
    }
    setSearching(true);
    setError("");
    const { data, error } = await supabase.rpc("admin_search_players", { p_query: q.trim(), p_limit: 40 });
    setSearching(false);
    if (error) {
      setError(rpcErrorMessage(error, "Search failed"));
      setRows(null);
    } else {
      setRows((data ?? []) as AdminPlayerRow[]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const refresh = async () => {
    await Promise.all([search(query), onChanged()]);
  };

  return (
    <div className="space-y-4">
      <div className="ch-card p-3 flex items-center gap-2">
        <Search className="h-4 w-4 text-[color:var(--ch-muted)] shrink-0 ml-1" />
        <input
          className="ch-input h-10 px-3 text-sm flex-1"
          placeholder="Search players by name"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          data-testid="input-player-search"
        />
        {searching && <Loader2 className="h-4 w-4 animate-spin text-[color:var(--ch-muted)]" />}
      </div>

      <ErrorLine message={error} />

      {rows && rows.length === 0 && (
        <div className="ch-card p-8 text-center text-sm text-[color:var(--ch-text-2)]">No players match “{query}”.</div>
      )}

      {rows && rows.length > 0 && (
        <div className="ch-card divide-y divide-[color:var(--ch-border)] overflow-hidden">
          {rows.map((p) => (
            <div key={p.player_id} className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[15px] text-[color:var(--ch-text)]">{p.full_name}</p>
                  <TierBadge tier={p.tier} />
                  {p.claim_status === "approved" && (
                    <Badge tone="green">{p.is_primary_row ? "Claimed · main profile" : "Claimed · linked row"}</Badge>
                  )}
                  {p.claim_status === "pending" && (
                    <Badge tone="amber">{p.is_primary_row ? "Pending · main profile" : "Pending · linked row"}</Badge>
                  )}
                  {p.claim_status === "unclaimed" && p.live_code_expires_at && (
                    <Badge tone="slate">
                      <KeyRound className="h-3 w-3" /> Code expires{" "}
                      {formatDistanceToNow(new Date(p.live_code_expires_at), { addSuffix: true })}
                    </Badge>
                  )}
                </div>
                <p className="text-[13px] text-[color:var(--ch-text-2)] truncate">
                  {[p.team_name, p.competition_name].filter(Boolean).join(" · ") || "No team"}
                  <span className="text-[color:var(--ch-muted)]"> · {p.games} {p.games === 1 ? "game" : "games"}</span>
                </p>
                <p className="text-[12px] text-[color:var(--ch-muted)]">
                  DOB {dobLine(p.date_of_birth)}
                  {p.date_of_birth && (p.dob_verified ? " · verified" : " · unverified")}
                  {p.owner_email && ` · ${p.owner_email}`}
                </p>
              </div>
              {p.claim_status === "unclaimed" ? (
                <div className="flex gap-2">
                  <button type="button" className={BTN_PRIMARY} onClick={() => setIssueFor(p)}>
                    <KeyRound className="h-4 w-4" /> {p.live_code_expires_at ? "New code" : "Issue code"}
                  </button>
                  <button type="button" className={BTN_GHOST} onClick={() => setAssignFor(p)}>
                    <UserPlus className="h-4 w-4" /> Assign
                  </button>
                </div>
              ) : p.claim_status === "pending" ? (
                <span className="text-[13px] text-[color:var(--ch-text-2)]">In the pending queue</span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {issueFor && <IssueCodeDialog player={issueFor} onClose={() => setIssueFor(null)} onIssued={refresh} />}
      {assignFor && <AssignDialog player={assignFor} onClose={() => setAssignFor(null)} onAssigned={refresh} />}
    </div>
  );
}

function IssueCodeDialog({
  player,
  onClose,
  onIssued,
}: {
  player: AdminPlayerRow;
  onClose: () => void;
  onIssued: () => Promise<void>;
}) {
  const [days, setDays] = useState(14);
  const [extraRows, setExtraRows] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{ code: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = async () => {
    setBusy(true);
    setError("");
    const { data, error } = await supabase
      .rpc("issue_claim_code", {
        p_player_id: player.player_id,
        p_expires_in_days: days,
        p_also_player_ids: extraRows ?? [],
      })
      .single();
    setBusy(false);
    if (error) return setError(rpcErrorMessage(error, "Couldn't issue a code"));
    setIssued(data as { code: string; expires_at: string });
    void onIssued();
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select the code and copy it manually.");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sa-pro max-h-[90vh] overflow-y-auto bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] border-[color:var(--ch-border)]">
        <DialogHeader>
          <DialogTitle>Claim code for {player.full_name}</DialogTitle>
          <DialogDescription className="text-[color:var(--ch-text-2)]">
            {issued
              ? "Send this to the player. It's shown once — only a hash is stored, so it can't be looked up again."
              : "The player enters this code and their date of birth at swishassistant.com/claim. You then verify the claim here."}
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-[color:var(--ch-surface-3)] p-3">
              <code className="flex-1 select-all text-center font-mono text-2xl font-bold tracking-[0.12em]" data-testid="text-claim-code">
                {issued.code}
              </code>
              <button type="button" className={BTN_GHOST} onClick={() => void copy()}>
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[13px] text-[color:var(--ch-text-2)]">
              Covers {1 + (extraRows?.length ?? 0)} {1 + (extraRows?.length ?? 0) === 1 ? "competition" : "competitions"}.
              Expires {formatDob(issued.expires_at.slice(0, 10))}. Single use. Issuing another code for any of these rows cancels this one.
            </p>
            <button type="button" className={`${BTN_PRIMARY} w-full justify-center`} onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {player.live_code_expires_at && (
              <p className="flex items-start gap-1.5 text-[13px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                This player already has an unused code. Issuing a new one cancels it.
              </p>
            )}
            <div>
              <span className="block text-[12px] font-medium text-[color:var(--ch-text-2)] mb-1">One code, one profile — tick all of this player's rows</span>
              <RowPicker playerId={player.player_id} onChange={setExtraRows} />
            </div>
            <label className="block">
              <span className="block text-[12px] font-medium text-[color:var(--ch-text-2)] mb-1">Valid for</span>
              <select className={INPUT} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </label>
            <ErrorLine message={error} />
            <button
              type="button"
              className={`${BTN_PRIMARY} w-full justify-center`}
              disabled={busy || extraRows === null}
              onClick={() => void issue()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Generate code
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  player,
  onClose,
  onAssigned,
}: {
  player: AdminPlayerRow;
  onClose: () => void;
  onAssigned: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState(player.date_of_birth ?? "");
  const [extraRows, setExtraRows] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const assign = async () => {
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("admin_assign_claim", {
      p_player_id: player.player_id,
      p_user_email: email.trim(),
      p_verified_dob: dob,
      p_also_player_ids: extraRows ?? [],
    });
    setBusy(false);
    if (error) return setError(rpcErrorMessage(error, "Couldn't assign"));
    setDone(true);
    void onAssigned();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sa-pro max-h-[90vh] overflow-y-auto bg-[color:var(--ch-surface)] text-[color:var(--ch-text)] border-[color:var(--ch-border)]">
        <DialogHeader>
          <DialogTitle>Assign {player.full_name} to an account</DialogTitle>
          <DialogDescription className="text-[color:var(--ch-text-2)]">
            Skips the code and approves the claim straight away. Only use this when you've already verified who the player is.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="h-4 w-4" /> Assigned to {email.trim()}. They can edit their profile now.
            </p>
            <button type="button" className={`${BTN_PRIMARY} w-full justify-center`} onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void assign();
            }}
          >
            <label className="block">
              <span className="block text-[12px] font-medium text-[color:var(--ch-text-2)] mb-1">Account email</span>
              <input
                type="email"
                required
                className={INPUT}
                value={email}
                placeholder="player@example.com"
                onChange={(e) => setEmail(e.target.value)}
              />
              <span className="mt-1 block text-[12px] text-[color:var(--ch-muted)]">The player must have signed up already.</span>
            </label>
            <label className="block">
              <span className="block text-[12px] font-medium text-[color:var(--ch-text-2)] mb-1">Verified date of birth</span>
              <input
                type="date"
                required
                className={INPUT}
                value={dob}
                min="1920-01-01"
                max={maxDobInputValue()}
                onChange={(e) => setDob(e.target.value)}
              />
              {dob && (
                <span className="mt-1 block text-[12px] text-[color:var(--ch-muted)]">
                  Age {ageFromDob(dob)} — {ageFromDob(dob)! >= 18 ? "full public profile" : "under-18 privacy"}
                </span>
              )}
            </label>
            <div>
              <span className="block text-[12px] font-medium text-[color:var(--ch-text-2)] mb-1">Rows on their profile</span>
              <RowPicker playerId={player.player_id} onChange={setExtraRows} />
            </div>
            <ErrorLine message={error} />
            <button
              type="submit"
              className={`${BTN_PRIMARY} w-full justify-center`}
              disabled={busy || !email || !dob || extraRows === null}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Assign and approve
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
