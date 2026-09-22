import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Loader2, MailCheck, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// This page is only reachable through AdminRoute in App.tsx, which already
// blocks non-admin users. The isAdmin check here is a defence-in-depth guard.

type UnconfirmedUser = {
  id: string;
  email: string;
  createdAt: string;
  confirmationSentAt: string | null;
};

type RowState = "idle" | "sending" | "sent" | "error";

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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">Access Denied</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">This page is restricted to owner accounts.</p>
        </div>
      </div>
    );
  }

  const sentCount = users?.filter((u) => rowState[u.email] === "sent").length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Unconfirmed accounts</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Accounts that signed up but never confirmed their email. Useful after fixing a problem in the
            confirmation flow itself, to give stuck signups a fresh link.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                {users ? `${users.length} unconfirmed ${users.length === 1 ? "account" : "accounts"}` : "Loading…"}
              </CardTitle>
              <CardDescription>Recent signups are hidden by default — they likely just haven't checked their inbox yet.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={String(olderThanMinutes)} onValueChange={(v) => setOlderThanMinutes(Number(v))}>
                <SelectTrigger className="w-[200px]" data-testid="select-age-threshold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THRESHOLDS.map((t) => (
                    <SelectItem key={t.minutes} value={String(t.minutes)}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => void load()} disabled={loadingList} data-testid="button-refresh">
                <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {listError && (
              <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-sm mb-4">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{listError}</p>
              </div>
            )}

            {loadingList && !users ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : users && users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <MailCheck className="h-10 w-10 text-green-500" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No stuck accounts</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Everyone in this window has confirmed their email.</p>
              </div>
            ) : users ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {sentCount > 0 ? `${sentCount} of ${users.length} resent this session` : "Sends one at a time, a couple of seconds apart"}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => void resendAll()}
                    disabled={resendingAll || users.every((u) => rowState[u.email] === "sent")}
                    data-testid="button-resend-all"
                  >
                    {resendingAll ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resending…
                      </>
                    ) : (
                      "Resend all"
                    )}
                  </Button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
                  {users.map((u) => {
                    const state = rowState[u.email] ?? "idle";
                    return (
                      <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`row-unconfirmed-${u.email}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{u.email}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Signed up {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
                            {u.confirmationSentAt && ` · last email ${formatDistanceToNow(new Date(u.confirmationSentAt), { addSuffix: true })}`}
                          </p>
                          {state === "error" && <p className="text-xs text-red-600 mt-0.5">{rowError[u.email]}</p>}
                        </div>
                        <Button
                          size="sm"
                          variant={state === "sent" ? "secondary" : "outline"}
                          disabled={state === "sending" || state === "sent" || resendingAll}
                          onClick={() => void resendOne(u.email)}
                          data-testid={`button-resend-${u.email}`}
                        >
                          {state === "sending" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : state === "sent" ? (
                            <>
                              <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
                              Sent
                            </>
                          ) : (
                            "Resend"
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
