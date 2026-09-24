import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

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
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 bg-gradient-to-br from-orange-100 via-white to-white">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src={SwishLogo} alt="Swish Assistant" className="h-12 mb-2" />
          <h1 className="text-lg font-bold text-gray-800">Swish Assistant</h1>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-xl shadow-md border border-gray-200">
          <h2 className="text-xl font-semibold mb-1 text-gray-800">
            Set a new password
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Choose a strong password of at least 8 characters.
          </p>

          {success ? (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Password updated successfully. Redirecting you to sign in…
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              )}

              {sessionReady && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      New password
                    </label>
                    <Input
                      type="password"
                      placeholder="At least 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      data-testid="input-new-password"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm password
                    </label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      data-testid="input-confirm-password"
                    />
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full bg-[#FFC285] hover:bg-[#ffb76c] text-white font-medium"
                    data-testid="button-set-password"
                  >
                    {loading ? "Updating…" : "Set new password"}
                  </Button>
                </>
              )}

              {!sessionReady && !error && (
                <p className="text-sm text-gray-500 text-center">
                  Validating reset link…
                </p>
              )}

              <div className="text-center">
                <a
                  href="/auth"
                  className="text-sm text-orange-600 hover:text-orange-700 hover:underline"
                >
                  Back to sign in
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
