import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle } from "lucide-react";
import AuthShell, { ERROR, INPUT, LABEL, LINK, SUBMIT, SUCCESS } from "@/components/layout/AuthShell";

export default function ResetPassword() {
  const [sessionReady, setSessionReady] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();

  // Supabase's client already auto-detects the #access_token=...&type=recovery
  // hash on a password-reset email link (detectSessionInUrl, on by default)
  // — it runs at client-init time, establishes the session, and clears the
  // hash from the URL. That happens before this effect can run, so trying to
  // re-parse window.location.hash here always finds it already empty and
  // wrongly reports an invalid link, even though the session was actually
  // established. Instead: check for the session it already created, and
  // also listen for Supabase's own PASSWORD_RECOVERY event in case
  // detection is still in flight when this mounts.
  const sessionFoundRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    const markReady = () => {
      sessionFoundRef.current = true;
      if (mounted) setSessionReady(true);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") markReady();
    });

    // Give detection a moment to finish before concluding the link is bad —
    // covers the case where this effect runs before it has resolved.
    const timeout = setTimeout(() => {
      if (mounted && !sessionFoundRef.current) {
        setError("This reset link has expired or is invalid. Please request a new one.");
      }
    }, 3000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!newPassword) {
      setError("Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/auth"), 2500);
    }
  };

  return (
    <AuthShell title="Set a new password" intro="Choose a strong password of at least 8 characters.">
      {success ? (
        <Alert className={SUCCESS}>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Password updated successfully. Redirecting you to sign in…
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {error && (
            <Alert className={ERROR}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {sessionReady && (
            <>
              <label className="block">
                <span className={`block mb-1.5 ${LABEL}`}>New password</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={INPUT}
                  data-testid="input-new-password"
                />
              </label>
              <label className="block">
                <span className={`block mb-1.5 ${LABEL}`}>Confirm password</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={INPUT}
                  data-testid="input-confirm-password"
                />
              </label>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className={SUBMIT}
                data-testid="button-set-password"
              >
                {loading ? "Updating…" : "Set new password"}
              </button>
            </>
          )}

          {!sessionReady && !error && (
            <p className="text-sm text-[color:var(--ch-muted)] text-center">
              Validating reset link…
            </p>
          )}

          <div className="text-center">
            <a href="/auth" className={`text-sm ${LINK}`}>
              Back to sign in
            </a>
          </div>
        </div>
      )}
    </AuthShell>
  );
}
