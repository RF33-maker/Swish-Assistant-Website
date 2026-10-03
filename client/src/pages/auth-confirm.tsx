import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, MailCheck, Loader2 } from "lucide-react";
import AuthShell, { ERROR, INPUT, LINK, SUBMIT } from "@/components/layout/AuthShell";

type EmailOtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change";

/**
 * Confirms a signup (or other OTP-email) link.
 *
 * This page exists instead of sending people straight to Supabase's own
 * `/auth/v1/verify` link because that link is a plain GET request that
 * consumes its one-time token on the first hit — including hits from mail
 * providers that pre-fetch links in incoming email to scan them (this is
 * common with iCloud Mail's link protection and corporate "Safe Links"
 * scanners). By the time the person actually clicks it, the token is
 * already burned and they see "invalid or expired" on their very first try.
 *
 * Routing the email link here instead (via Supabase's `{{ .TokenHash }}`
 * template variable) and only calling verifyOtp() after an explicit button
 * press means an automated prefetch just loads a static page — it doesn't
 * click buttons — so the token survives until the real person acts.
 */
export default function AuthConfirm() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  const typeParam = params.get("type");
  const type: EmailOtpType =
    typeParam === "invite" || typeParam === "magiclink" || typeParam === "recovery" || typeParam === "email_change"
      ? typeParam
      : "signup";

  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(tokenHash ? "idle" : "error");
  const [error, setError] = useState(tokenHash ? "" : "This confirmation link is missing its token. Please use the link from your email, or request a new one below.");

  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState("");

  const confirm = async () => {
    if (!tokenHash) return;
    setStatus("verifying");
    setError("");
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      setStatus("error");
      setError(
        error.message?.toLowerCase().includes("expired") || error.message?.toLowerCase().includes("invalid")
          ? "This link has expired or has already been used. Request a new one below."
          : error.message || "Could not confirm this link. Please try again.",
      );
      return;
    }
    setStatus("success");
    // Seed the cached user immediately so the app doesn't show a stale
    // "unverified" state while React Query's own fetch catches up.
    if (data?.user) queryClient.setQueryData(["user"], data.user);
    setTimeout(() => navigate("/dashboard"), 1200);
  };

  const resend = async () => {
    if (!resendEmail.trim() || resendState === "sending") return;
    setResendState("sending");
    setResendError("");
    try {
      const res = await fetch("/api/account/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim().toLowerCase() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResendError((json as any).error ?? "Failed to resend. Please try again.");
        setResendState("idle");
      } else {
        setResendState("sent");
      }
    } catch {
      setResendError("A network error occurred. Please try again.");
      setResendState("idle");
    }
  };

  const success = status === "success";

  return (
    <AuthShell
      title={success ? "Email confirmed" : "Confirm your email"}
      intro={success ? "Taking you to your dashboard…" : status === "error" ? undefined : "Tap the button below to finish verifying your account."}
      icon={
        <span
          className={`h-14 w-14 rounded-2xl flex items-center justify-center ${
            success ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]"
          }`}
        >
          {success ? <CheckCircle className="h-7 w-7" /> : <MailCheck className="h-7 w-7" />}
        </span>
      }
    >
      {success ? (
        <p className="text-sm text-[color:var(--ch-text-2)] text-center">
          You're verified. If nothing happens, <a href="/dashboard" className={LINK}>go to your dashboard</a>.
        </p>
      ) : (
        <>
          {error && (
            <Alert className={`${ERROR} mb-4`}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {status !== "error" && (
            <button
              type="button"
              onClick={confirm}
              disabled={status === "verifying"}
              className={SUBMIT}
              data-testid="button-confirm-email"
            >
              {status === "verifying" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirming…
                </>
              ) : (
                "Confirm my email"
              )}
            </button>
          )}

          {status === "error" && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--ch-text-2)]">Enter your email and we'll send a fresh link.</p>
              {resendState === "sent" ? (
                <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  Sent — check your inbox (and spam folder) for a new link.
                </p>
              ) : (
                <>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className={INPUT}
                    data-testid="input-resend-email"
                  />
                  {resendError && <p className="text-sm text-red-600 dark:text-red-400">{resendError}</p>}
                  <button
                    type="button"
                    onClick={resend}
                    disabled={resendState === "sending" || !resendEmail.trim()}
                    className="ch-btn ch-btn-ghost w-full h-11 justify-center text-[15px] disabled:opacity-50"
                    data-testid="button-resend-confirmation"
                  >
                    {resendState === "sending" ? "Sending…" : "Send new confirmation link"}
                  </button>
                </>
              )}
            </div>
          )}

          <div className="text-center pt-4">
            <a href="/auth" className={`text-sm ${LINK}`}>
              Back to sign in
            </a>
          </div>
        </>
      )}
    </AuthShell>
  );
}
