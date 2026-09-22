import { useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, MailCheck, Loader2 } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-orange-100 via-white to-white">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src={SwishLogo} alt="Swish Assistant" className="h-12 mb-2" />
          <h1 className="text-lg font-bold text-gray-800">Swish Assistant</h1>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-xl shadow-md border border-gray-200">
          {status === "success" ? (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-14 w-14 text-green-500" />
              </div>
              <h2 className="text-xl font-semibold mb-1 text-gray-800 text-center">Email confirmed</h2>
              <p className="text-sm text-gray-500 text-center">Taking you to your dashboard…</p>
            </>
          ) : (
            <>
              <div className="flex justify-center mb-4">
                <MailCheck className="h-14 w-14 text-orange-300" />
              </div>
              <h2 className="text-xl font-semibold mb-1 text-gray-800 text-center">Confirm your email</h2>
              <p className="text-sm text-gray-500 mb-6 text-center">
                {status === "error" ? "" : "Tap the button below to finish verifying your account."}
              </p>

              {error && (
                <Alert className="border-red-200 bg-red-50 mb-4">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              {status !== "error" && (
                <Button
                  onClick={confirm}
                  disabled={status === "verifying"}
                  className="w-full bg-[#FFC285] hover:bg-[#ffb76c] text-white font-medium"
                  data-testid="button-confirm-email"
                >
                  {status === "verifying" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Confirming…
                    </>
                  ) : (
                    "Confirm my email"
                  )}
                </Button>
              )}

              {status === "error" && (
                <div className="space-y-3 pt-2 border-t border-gray-100 mt-2">
                  <p className="text-sm text-gray-600 pt-3">Enter your email and we'll send a fresh link.</p>
                  {resendState === "sent" ? (
                    <p className="text-sm text-green-600 font-medium">
                      Sent — check your inbox (and spam folder) for a new link.
                    </p>
                  ) : (
                    <>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        data-testid="input-resend-email"
                      />
                      {resendError && <p className="text-sm text-red-600">{resendError}</p>}
                      <Button
                        onClick={resend}
                        disabled={resendState === "sending" || !resendEmail.trim()}
                        variant="outline"
                        className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                        data-testid="button-resend-confirmation"
                      >
                        {resendState === "sending" ? "Sending…" : "Send new confirmation link"}
                      </Button>
                    </>
                  )}
                </div>
              )}

              <div className="text-center pt-4">
                <a href="/auth" className="text-sm text-orange-600 hover:text-orange-700 hover:underline">
                  Back to sign in
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
