import { useAuth } from "@/hooks/use-auth";
import { Loader2, ShieldOff, MailCheck } from "lucide-react";
import { Redirect, Route } from "wouter";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

/**
 * ProtectedRoute – requires an authenticated user with a confirmed email.
 *
 * Access flow:
 *   unauthenticated            → redirect to /auth
 *   authenticated + unconfirmed → VerifyEmailGate (with proper sign-out)
 *   authenticated + confirmed  → render the component
 *
 * Admin accounts are exempt from the email-confirmed check.
 */
export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element | null;
}) {
  const { user, isAdmin, emailConfirmed, isLoading } = useAuth();

  if (isLoading || user === undefined) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  if (!emailConfirmed && !isAdmin) {
    return (
      <Route path={path}>
        <VerifyEmailGate email={user?.email ?? ""} />
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}

/**
 * AdminRoute – requires an authenticated user with the "admin" role.
 */
export function AdminRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element | null;
}) {
  const { user, isAdmin, isLoading } = useAuth();

  if (isLoading || user === undefined) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  if (!isAdmin) {
    return (
      <Route path={path}>
        <AccessDenied />
      </Route>
    );
  }

  return <Route path={path} component={Component} />;
}

// ── Screens ────────────────────────────────────────────────────────────────

/**
 * Shown to authenticated users whose email is not yet confirmed.
 *
 * The "sign in with a different account" action explicitly signs out AND
 * clears the React Query user cache before navigating to /auth.  This prevents
 * the redirect loop where AuthPage sees the stale cached user (staleTime=Infinity)
 * and bounces back to /dashboard → VerifyEmailGate.
 */
function VerifyEmailGate({ email }: { email: string }) {
  const [, navigate] = useLocation();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resendError, setResendError] = useState("");

  const resend = async () => {
    setSending(true);
    setResendError("");
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    if (error) setResendError(error.message);
    else setSent(true);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut().catch(() => null);
    // Must clear React Query cache (staleTime=Infinity) BEFORE navigating,
    // otherwise AuthPage will read the stale user and redirect back here.
    queryClient.setQueryData(["user"], null);
    navigate("/auth");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-orange-50 to-white px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="flex justify-center">
          <MailCheck className="h-16 w-16 text-orange-300" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800">
          Please verify your email
        </h1>
        <p className="text-slate-500">
          We sent a verification link to{" "}
          <span className="font-medium text-slate-700">{email}</span>. Click the
          link in that email to access this page.
        </p>
        {sent ? (
          <p className="text-green-600 text-sm font-medium">
            Verification email sent — check your inbox (and spam folder).
          </p>
        ) : (
          <Button
            variant="outline"
            onClick={resend}
            disabled={sending}
            className="border-orange-200 text-orange-700 hover:bg-orange-50"
          >
            {sending ? "Sending…" : "Resend verification email"}
          </Button>
        )}
        {resendError && <p className="text-red-500 text-sm">{resendError}</p>}
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-gray-400 hover:text-gray-600"
          >
            {signingOut ? "Signing out…" : "Sign in with a different account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="text-center space-y-4 px-4">
        <div className="flex justify-center">
          <ShieldOff className="h-16 w-16 text-slate-300 dark:text-slate-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200">
          Access Denied
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm">
          This page is restricted to owner accounts. If you believe you should
          have access, please contact an administrator.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
