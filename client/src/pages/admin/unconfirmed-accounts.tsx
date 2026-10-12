import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Loader2, MailCheck, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_GHOST, BTN_PRIMARY, ERROR, FIELD, HINT, Panel, SELECT_MENU } from "@/components/layout/proUi";

// This page is only reachable through AdminRoute in App.tsx, which already
// blocks non-admin users. The isAdmin check here is a defence-in-depth guard.

type UnconfirmedUser = {
  id: string;
  email: string;
  createdAt: string;
  confirmationSentAt: string | null;
};

type RowState = "idle" | "sending" | "sent" | "error";

const TITLE = "Unconfirmed accounts";

const THRESHOLDS = [
  { minutes: 15, label: "Older than 15 minutes" },
  { minutes: 60, label: "Older than 1 hour" },
  { minutes: 60 * 24, label: "Older than 1 day" },
  { minutes: 60 * 24 * 7, label: "Older than 1 week" },
];

export default function UnconfirmedAccountsPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const [olderThanMinutes, setOlderThanMinutes] = useState(60);
  const [users, setUsers] = useState<UnconfirmedUser[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [resendingAll, setResendingAll] = useState(false);

  const load = async () => {
    setLoadingList(true);
    setListError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch(`/api/admin/unconfirmed-users?olderThanMinutes=${olderThanMinutes}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error ?? `Request failed (${res.status})`);
      setUsers((json as any).users);
      setRowState({});
      setRowError({});
    } catch (err: any) {
      setListError(err.message || "Failed to load unconfirmed accounts");
      setUsers(null);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, olderThanMinutes]);

  // Deliberately unauthenticated: this hits the same fallback path a stuck
  // registrant's own browser would use (no session yet), rather than the
  // admin's own identity — so it resends for the target address, not for
  // whichever admin happens to click the button.
  const resendOne = async (email: string): Promise<boolean> => {
    setRowState((s) => ({ ...s, [email]: "sending" }));
    setRowError((s) => ({ ...s, [email]: "" }));
    try {
      const res = await fetch("/api/account/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any).error ?? "Failed to resend");
      setRowState((s) => ({ ...s, [email]: "sent" }));
      return true;
    } catch (err: any) {
      setRowState((s) => ({ ...s, [email]: "error" }));
      setRowError((s) => ({ ...s, [email]: err.message || "Failed to resend" }));
      return false;
    }
  };

  const resendAll = async () => {
    if (!users?.length) return;
    setResendingAll(true);
    for (const u of users) {
      if (rowState[u.email] === "sent") continue;
      await resendOne(u.email);
      // Gentle pacing so this doesn't look like a burst to the email provider.
      await new Promise((r) => setTimeout(r, 1500));
    }
    setResendingAll(false);
  };

  if (isLoading) {
    return (
      <AdminPageShell title={TITLE} width="max-w-3xl">
        <AdminPageNotice>
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[color:var(--ch-accent)]" />
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  if (!user || !isAdmin) {
    return (
      <AdminPageShell title={TITLE} width="max-w-3xl">
        <AdminPageNotice>
          <p className="font-semibold text-[color:var(--ch-text)]">Access Denied</p>
          <p className="mt-1">This page is restricted to owner accounts.</p>
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  const sentCount = users?.filter((u) => rowState[u.email] === "sent").length ?? 0;

  return (
    <AdminPageShell
      title={TITLE}
      description="Accounts that signed up but never confirmed their email. Useful after fixing a problem in the confirmation flow itself, to give stuck signups a fresh link."
      width="max-w-3xl"
    >
      <Panel
        title={users ? `${users.length} unconfirmed ${users.length === 1 ? "account" : "accounts"}` : "Loading…"}
        description="Recent signups are hidden by default — they likely just haven't checked their inbox yet."
        action={
          <div className="flex items-center gap-2">
            <Select value={String(olderThanMinutes)} onValueChange={(v) => setOlderThanMinutes(Number(v))}>
              <SelectTrigger className={`${FIELD} !w-[210px]`} data-testid="select-age-threshold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={SELECT_MENU}>
                {THRESHOLDS.map((t) => (
                  <SelectItem key={t.minutes} value={String(t.minutes)}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loadingList}
              aria-label="Refresh"
              className={`${BTN_GHOST} !h-10 !w-10 flex-none !px-0`}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      >
        {listError && (
          <div className={`mb-4 flex items-start gap-2 ${ERROR}`}>
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{listError}</p>
          </div>
        )}

        {loadingList && !users ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
          </div>
        ) : users && users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <MailCheck className="h-10 w-10 text-[color:var(--ch-win)]" />
            <p className="text-sm font-medium text-[color:var(--ch-text)]">No stuck accounts</p>
            <p className={HINT}>Everyone in this window has confirmed their email.</p>
          </div>
        ) : users ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className={HINT}>
                {sentCount > 0 ? `${sentCount} of ${users.length} resent this session` : "Sends one at a time, a couple of seconds apart"}
              </p>
              <button
                type="button"
                onClick={() => void resendAll()}
                disabled={resendingAll || users.every((u) => rowState[u.email] === "sent")}
                className={`${BTN_PRIMARY} flex-none`}
                data-testid="button-resend-all"
              >
                {resendingAll && <Loader2 className="h-4 w-4 animate-spin" />}
                {resendingAll ? "Resending…" : "Resend all"}
              </button>
            </div>

            <div className="ch-tile divide-y divide-[color:var(--ch-border)] overflow-hidden">
              {users.map((u) => {
                const state = rowState[u.email] ?? "idle";
                return (
                  <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-unconfirmed-${u.email}`}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[color:var(--ch-text)]">{u.email}</p>
                      <p className={HINT}>
                        Signed up {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                        {u.confirmationSentAt && ` · last email ${formatDistanceToNow(new Date(u.confirmationSentAt), { addSuffix: true })}`}
                      </p>
                      {state === "error" && <p className={`mt-0.5 !text-xs ${ERROR}`}>{rowError[u.email]}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={state === "sending" || state === "sent" || resendingAll}
                      onClick={() => void resendOne(u.email)}
                      className={`${BTN_GHOST} flex-none`}
                      data-testid={`button-resend-${u.email}`}
                    >
                      {state === "sending" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : state === "sent" ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-[color:var(--ch-win)]" />
                          Sent
                        </>
                      ) : (
                        "Resend"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Panel>
    </AdminPageShell>
  );
}
