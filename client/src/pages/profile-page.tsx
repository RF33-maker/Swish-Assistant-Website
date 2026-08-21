import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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
import SwishLogo from "@/assets/Swish Assistant Logo.png";

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
    if (newPassword.length < 8) {
      setPasswordMsg({ type: "error", text: "Password must be at least 8 characters." });
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
            ? "border-green-200 bg-green-50"
            : "border-red-200 bg-red-50"
        }
      >
        {msg.type === "success" ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <AlertCircle className="h-4 w-4 text-red-600" />
        )}
        <AlertDescription
          className={msg.type === "success" ? "text-green-800" : "text-red-700"}
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/dashboard")}
            className="text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <img src={SwishLogo} alt="Swish" className="h-7" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-slate-900">Account</h1>
          <p className="text-sm text-gray-500 mt-1">{email}</p>
        </div>

        {/* Email verification banner */}
        {!emailConfirmed && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>Email not verified.</strong> Some features are restricted
              until you verify your address.{" "}
              <button
                onClick={handleResendVerification}
                disabled={resendLoading || resendCooldown}
                className="underline font-medium hover:text-amber-900 disabled:opacity-50 disabled:cursor-default disabled:no-underline"
              >
                {resendLoading ? "Sending…" : resendCooldown ? "Email sent — check your inbox" : "Resend verification email"}
              </button>
              {resendMsg && (
                <span
                  className={
                    resendMsg.type === "success"
                      ? "ml-2 text-green-700"
                      : "ml-2 text-red-700"
                  }
                >
                  {resendMsg.text}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* ── Profile ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-orange-500" />
              Profile
            </CardTitle>
            <CardDescription>
              Your display name and contact preferences.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display name
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email address (read-only)
              </label>
              <Input
                value={email}
                disabled
                className="bg-gray-50 text-gray-500"
              />
              {emailConfirmed && (
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Verified
                </p>
              )}
            </div>

            <Separator />

            {/* Marketing consent */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                {marketingConsent ? (
                  <Bell className="h-4 w-4 text-orange-500" />
                ) : (
                  <BellOff className="h-4 w-4 text-gray-400" />
                )}
                Email preferences
              </h3>
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="marketingConsent"
                  checked={marketingConsent}
                  onCheckedChange={(v) => setMarketingConsent(!!v)}
                  className="mt-0.5"
                />
                <label
                  htmlFor="marketingConsent"
                  className="text-sm text-gray-600 leading-relaxed cursor-pointer"
                >
                  Send me occasional product news and coaching tips by email.
                  You can change this at any time.
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Essential service emails (security alerts, verification) are
                always sent regardless of this preference.
              </p>
            </div>

            <Msg msg={profileMsg} />

            <Button
              onClick={handleSaveProfile}
              disabled={profileSaving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {profileSaving ? "Saving…" : "Save changes"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Change password ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-orange-500" />
              Change password
            </CardTitle>
            <CardDescription>
              Enter your current password to set a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New password
              </label>
              <Input
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm new password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <Msg msg={passwordMsg} />

            <Button
              onClick={handleChangePassword}
              disabled={passwordSaving}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {passwordSaving ? "Updating…" : "Update password"}
            </Button>
          </CardContent>
        </Card>

        {/* ── Data rights ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-orange-500" />
              Your data rights
            </CardTitle>
            <CardDescription>
              Under UK GDPR you have the right to access and erase your personal
              data. Public basketball statistics are not personal data owned by
              your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Data export */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                <Download className="h-4 w-4 text-gray-500" />
                Request a copy of your data
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                We'll compile your account details, consent records, and any
                other personal data we hold about you. Our team will review
                and email it to your registered address, usually within
                72 hours. Contact us if you don't hear back.
              </p>

              {existingExport ? (
                <Alert className="border-blue-200 bg-blue-50">
                  <AlertDescription className="text-blue-800">
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
                    <Button
                      variant="outline"
                      onClick={handleExportRequest}
                      disabled={exportLoading}
                      className="border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {exportLoading ? "Requesting…" : "Request my data"}
                    </Button>
                  )}
                </>
              )}
            </div>

            <Separator />

            {/* Account deletion */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-red-500" />
                Delete account
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Requesting deletion will sign you out immediately and schedule
                removal of your personal data within 30 days. Records kept for
                legal or security reasons (e.g. consent logs, abuse reports) are
                retained according to our{" "}
                <a href="/privacy" className="text-orange-600 underline">
                  Privacy Policy
                </a>{" "}
                and will be anonymised or deleted on their documented schedule.
              </p>

              {existingDeletion ? (
                <Alert className="border-red-200 bg-red-50">
                  <Trash2 className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
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
                        <Button
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete my account
                        </Button>
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
        <div className="flex justify-end pb-8">
          <Button
            variant="ghost"
            onClick={() => logoutMutation.mutate(undefined)}
            className="text-gray-500 hover:text-gray-700"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
