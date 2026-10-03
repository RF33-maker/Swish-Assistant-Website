import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  User,
  Mail,
  Lock,
  Download,
  Trash2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  Bell,
  BellOff,
  Shield,
} from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { CHECKBOX } from "@/components/layout/AuthShell";
import { PASSWORD_REQUIREMENTS, validatePassword } from "@shared/passwordPolicy";

type Message = { type: "success" | "error"; text: string };

export default function AccountCentre() {
  const { user, emailConfirmed, logoutMutation } = useAuth();
  const [, navigate] = useLocation();

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Message | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<Message | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Resend verification
  const [resendMsg, setResendMsg] = useState<Message | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  // Export request
  const [exportMsg, setExportMsg] = useState<Message | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [existingExport, setExistingExport] = useState<{ status: string; requested_at: string } | null>(null);

  // Deletion request
  const [deletionMsg, setDeletionMsg] = useState<Message | null>(null);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [existingDeletion, setExistingDeletion] = useState<{ status: string; scheduled_for: string } | null>(null);
  const [deletionConfirmText, setDeletionConfirmText] = useState("");

  const email = (user as any)?.email ?? "";

  // ── Load profile and request state ────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const uid = (user as any).id;

    // member_profiles
    supabase
      .from("member_profiles")
      .select("display_name, marketing_consent")
      .eq("id", uid)
      .single()
      .then(({ data }) => {
        if (data) {
          setDisplayName(data.display_name ?? "");
          setMarketingConsent(data.marketing_consent ?? false);
        }
      });

    // Pending export request
    supabase
      .from("data_export_requests")
      .select("status, requested_at")
      .eq("user_id", uid)
      .in("status", ["pending", "processing", "ready"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setExistingExport(data[0]);
      });

    // Pending deletion request
    supabase
      .from("deletion_requests")
      .select("status, scheduled_for")
      .eq("user_id", uid)
      .in("status", ["pending", "confirmed"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setExistingDeletion(data[0]);
      });
  }, [user]);

  // ── Save profile ───────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    setProfileMsg(null);

    // All profile/consent writes go through server endpoints (no client UPDATE
    // RLS policy on member_profiles) so the service-role key controls every write.
    const session = (await supabase.auth.getSession()).data.session;
    const authHeader = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};

    // Update display name via /api/account/update-profile.
    const profileRes = await fetch("/api/account/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ displayName }),
    });
    if (!profileRes.ok) {
      const json = await profileRes.json().catch(() => ({}));
      setProfileMsg({ type: "error", text: json.error ?? "Failed to save display name." });
      setProfileSaving(false);
      return;
    }

    // Record marketing consent preference via /api/account/update-marketing-consent.
    // The server writes both the member_profiles field and the consent audit row.
    const consentRes = await fetch("/api/account/update-marketing-consent", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({ accepted: marketingConsent }),
    });
    if (!consentRes.ok) {
      const json = await consentRes.json().catch(() => ({}));
      setProfileMsg({ type: "error", text: json.error ?? "Failed to save marketing preference." });
    } else {
      setProfileMsg({ type: "success", text: "Profile updated." });
    }
    setProfileSaving(false);
  };

  // ── Change password ────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    setPasswordMsg(null);
    if (!newPassword) {
      setPasswordMsg({ type: "error", text: "Please enter a new password." });
      return;
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      setPasswordMsg({ type: "error", text: policyError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords don't match." });
      return;
    }
    setPasswordSaving(true);
    // Re-authenticate first to verify the current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      setPasswordMsg({ type: "error", text: "Current password is incorrect." });
      setPasswordSaving(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordMsg({ type: "error", text: error.message });
    } else {
      setPasswordMsg({ type: "success", text: "Password changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordSaving(false);
  };

  // ── Resend verification email ──────────────────────────────────────────────
  const handleResendVerification = async () => {
    if (resendLoading || resendCooldown) return;
    setResendLoading(true);
    setResendMsg(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const res = await fetch("/api/account/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResendMsg({ type: "error", text: (json as any).error ?? "Failed to resend. Please try again." });
      } else {
        setResendMsg({ type: "success", text: "Verification email sent. Check your inbox." });
        setResendCooldown(true);
        setTimeout(() => setResendCooldown(false), 60_000);
      }
    } catch {
      setResendMsg({ type: "error", text: "A network error occurred. Please try again." });
    } finally {
      setResendLoading(false);
    }
  };

  // ── Request data export ────────────────────────────────────────────────────
  const handleExportRequest = async () => {
    if (!user) return;
    setExportLoading(true);
    setExportMsg(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    try {
      const res = await fetch("/api/account/export-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setExistingExport({ status: "pending", requested_at: new Date().toISOString() });
      setExportMsg({
        type: "success",
        text: "Export request received. We'll prepare your data and notify you when it's ready (usually within 72 hours).",
      });
    } catch (err: any) {
      setExportMsg({ type: "error", text: err.message });
    }
    setExportLoading(false);
  };

  // ── Request account deletion ───────────────────────────────────────────────
  const handleDeletionRequest = async () => {
    if (!user) return;
    setDeletionLoading(true);
    setDeletionMsg(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;

    try {
      const res = await fetch("/api/account/deletion-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setExistingDeletion({
        status: "pending",
        scheduled_for: json.scheduledFor,
      });
      setDeletionMsg({
        type: "success",
        text: `Your account has been scheduled for deletion on ${new Date(json.scheduledFor).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. You have been signed out.`,
      });
      // Sign out immediately
      await supabase.auth.signOut();
      setTimeout(() => navigate("/"), 3000);
    } catch (err: any) {
      setDeletionMsg({ type: "error", text: err.message });
    }
    setDeletionLoading(false);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  function Msg({ msg }: { msg: Message | null }) {
    if (!msg) return null;
    return (
      <Alert
        className={
          msg.type === "success"
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-red-500/30 bg-red-500/10"
        }
      >
        {msg.type === "success" ? (
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
        )}
        <AlertDescription
          className={msg.type === "success" ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}
        >
          {msg.text}
        </AlertDescription>
      </Alert>
    );
  }

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Account | Swish Assistant</title>
      </Helmet>
      <SiteHeader />
      <main className="max-w-2xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16 space-y-5">
        <header className="ch-rise">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]">
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Your account</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
            Account centre
          </h1>
          <p className="mt-2 text-sm text-[color:var(--ch-text-2)] truncate">{email}</p>
        </header>

        {/* Email verification banner */}
        {!emailConfirmed && (
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-800 dark:text-amber-300">
              <strong>Email not verified.</strong> Some features are restricted
              until you verify your address.{" "}
              <button
                onClick={handleResendVerification}
                disabled={resendLoading || resendCooldown}
                className="underline font-medium hover:opacity-80 disabled:opacity-50 disabled:cursor-default disabled:no-underline"
              >
                {resendLoading ? "Sending…" : resendCooldown ? "Email sent — check your inbox" : "Resend verification email"}
              </button>
              {resendMsg && (
                <span
                  className={
                    resendMsg.type === "success"
                      ? "ml-2 text-emerald-700 dark:text-emerald-300"
                      : "ml-2 text-red-700 dark:text-red-300"
                  }
                >
                  {resendMsg.text}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* ── Profile ── */}
        <Card className="ch-card ch-rise text-[color:var(--ch-text)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 ch-display uppercase tracking-tight text-[1.35rem] leading-none">
              <User className="h-4 w-4 text-[color:var(--ch-accent)]" />
              Profile
            </CardTitle>
            <CardDescription className="text-[color:var(--ch-text-2)]">
              Your display name and contact preferences.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">
                Display name
              </label>
              <Input
                className="ch-input h-11 px-3.5 text-[15px]"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">
                Email address (read-only)
              </label>
              <Input
                value={email}
                disabled
                className="ch-input h-11 px-3.5 text-[15px] disabled:opacity-70"
              />
              {emailConfirmed && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Verified
                </p>
              )}
            </div>

            <Separator className="bg-[color:var(--ch-border)]" />

            {/* Marketing consent */}
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ch-text)] mb-2 flex items-center gap-2">
                {marketingConsent ? (
                  <Bell className="h-4 w-4 text-[color:var(--ch-accent)]" />
                ) : (
                  <BellOff className="h-4 w-4 text-[color:var(--ch-muted)]" />
                )}
                Email preferences
              </h3>
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="marketingConsent"
                  checked={marketingConsent}
                  onCheckedChange={(v) => setMarketingConsent(!!v)}
                  className={`mt-0.5 ${CHECKBOX}`}
                />
                <label
                  htmlFor="marketingConsent"
                  className="text-sm text-[color:var(--ch-text-2)] leading-relaxed cursor-pointer"
                >
                  Send me occasional product news and coaching tips by email.
                  You can change this at any time.
                </label>
              </div>
              <p className="text-xs text-[color:var(--ch-muted)] mt-2">
                Essential service emails (security alerts, verification) are
                always sent regardless of this preference.
              </p>
            </div>

            <Msg msg={profileMsg} />

            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="ch-btn ch-btn-primary h-10 px-5 disabled:opacity-60"
            >
              {profileSaving ? "Saving…" : "Save changes"}
            </button>
          </CardContent>
        </Card>

        {/* ── Change password ── */}
        <Card className="ch-card ch-rise text-[color:var(--ch-text)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 ch-display uppercase tracking-tight text-[1.35rem] leading-none">
              <Lock className="h-4 w-4 text-[color:var(--ch-accent)]" />
              Change password
            </CardTitle>
            <CardDescription className="text-[color:var(--ch-text-2)]">
              Enter your current password to set a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">
                Current password
              </label>
              <Input
                type="password"
                autoComplete="current-password"
                className="ch-input h-11 px-3.5 text-[15px]"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">
                New password
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                className="ch-input h-11 px-3.5 text-[15px]"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <ul className="text-xs text-[color:var(--ch-muted)] mt-1.5 space-y-0.5">
                {PASSWORD_REQUIREMENTS.map((req) => {
                  const met = req.test(newPassword);
                  return (
                    <li
                      key={req.label}
                      className={met ? "text-emerald-600 dark:text-emerald-400 flex items-center gap-1" : "flex items-center gap-1"}
                    >
                      <CheckCircle className={`h-3 w-3 ${met ? "opacity-100" : "opacity-30"}`} />
                      {req.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[color:var(--ch-text)] mb-1.5">
                Confirm new password
              </label>
              <Input
                type="password"
                autoComplete="new-password"
                className="ch-input h-11 px-3.5 text-[15px]"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <Msg msg={passwordMsg} />

            <button
              type="button"
              onClick={handleChangePassword}
              disabled={passwordSaving}
              className="ch-btn ch-btn-primary h-10 px-5 disabled:opacity-60"
            >
              {passwordSaving ? "Updating…" : "Update password"}
            </button>
          </CardContent>
        </Card>

        {/* ── Data rights ── */}
        <Card className="ch-card ch-rise text-[color:var(--ch-text)]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 ch-display uppercase tracking-tight text-[1.35rem] leading-none">
              <Shield className="h-4 w-4 text-[color:var(--ch-accent)]" />
              Your data rights
            </CardTitle>
            <CardDescription className="text-[color:var(--ch-text-2)]">
              Under UK GDPR you have the right to access and erase your personal
              data. Public basketball statistics are not personal data owned by
              your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Data export */}
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ch-text)] mb-1 flex items-center gap-2">
                <Download className="h-4 w-4 text-[color:var(--ch-muted)]" />
                Request a copy of your data
              </h3>
              <p className="text-sm text-[color:var(--ch-text-2)] mb-3">
                We'll compile your account details, consent records, and any
                other personal data we hold about you. Our team will review
                and email it to your registered address, usually within
                72 hours. Contact us if you don't hear back.
              </p>

              {existingExport ? (
                <Alert className="border-sky-500/30 bg-sky-500/10">
                  <AlertDescription className="text-sky-800 dark:text-sky-300">
                    Export request submitted on{" "}
                    {formatDate(existingExport.requested_at)} — status:{" "}
                    <Badge variant="outline" className="ml-1">
                      {existingExport.status}
                    </Badge>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Msg msg={exportMsg} />
                  {!exportMsg && (
                    <button
                      type="button"
                      onClick={handleExportRequest}
                      disabled={exportLoading}
                      className="ch-btn ch-btn-ghost h-10 px-4 disabled:opacity-60"
                    >
                      <Download className="h-4 w-4" />
                      {exportLoading ? "Requesting…" : "Request my data"}
                    </button>
                  )}
                </>
              )}
            </div>

            <Separator className="bg-[color:var(--ch-border)]" />

            {/* Account deletion */}
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--ch-text)] mb-1 flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
                Delete account
              </h3>
              <p className="text-sm text-[color:var(--ch-text-2)] mb-3">
                Requesting deletion will sign you out immediately and schedule
                removal of your personal data within 30 days. Records kept for
                legal or security reasons (e.g. consent logs, abuse reports) are
                retained according to our{" "}
                <a href="/privacy" className="font-medium text-[color:var(--ch-accent)] underline underline-offset-2">
                  Privacy Policy
                </a>{" "}
                and will be anonymised or deleted on their documented schedule.
              </p>

              {existingDeletion ? (
                <Alert className="border-red-500/30 bg-red-500/10">
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <AlertDescription className="text-red-800 dark:text-red-300">
                    Deletion request is{" "}
                    <Badge variant="outline" className="ml-1">
                      {existingDeletion.status}
                    </Badge>
                    . Scheduled for {formatDate(existingDeletion.scheduled_for)}.
                    To cancel, contact{" "}
                    <a
                      href="mailto:automatedathleteswa@gmail.com"
                      className="underline"
                    >
                      automatedathleteswa@gmail.com
                    </a>
                    .
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Msg msg={deletionMsg} />
                  {!deletionMsg && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="ch-btn h-10 px-4 border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete my account
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Are you absolutely sure?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="space-y-3">
                            <p>
                              Requesting deletion will:
                            </p>
                            <ul className="list-disc pl-5 space-y-1 text-sm">
                              <li>Sign you out immediately</li>
                              <li>
                                Schedule removal of your personal data within
                                30 days
                              </li>
                              <li>
                                Retain anonymised or legally required records
                                per our Privacy Policy
                              </li>
                            </ul>
                            <p className="text-sm">
                              This cannot be undone after the 30-day window. To
                              proceed, type <strong>DELETE</strong> below.
                            </p>
                            <Input
                              placeholder="Type DELETE to confirm"
                              value={deletionConfirmText}
                              onChange={(e) =>
                                setDeletionConfirmText(e.target.value)
                              }
                              className="mt-2"
                              data-testid="input-delete-confirm"
                            />
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={() => setDeletionConfirmText("")}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeletionRequest}
                            disabled={
                              deletionConfirmText !== "DELETE" ||
                              deletionLoading
                            }
                            className="bg-red-600 hover:bg-red-700 text-white"
                            data-testid="button-confirm-delete"
                          >
                            {deletionLoading
                              ? "Processing…"
                              : "Confirm deletion"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Sign out ── */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => logoutMutation.mutate(undefined)}
            className="ch-btn ch-btn-ghost h-10 px-4"
          >
            Sign out
          </button>
        </div>
      </main>
    </div>
  );
}
