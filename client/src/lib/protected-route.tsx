import { useAuth } from "@/hooks/use-auth";
import { Loader2, ShieldOff } from "lucide-react";
import { Redirect, Route } from "wouter";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

/**
 * ProtectedRoute – requires any authenticated user.
 * Redirects unauthenticated visitors to /auth.
 */
export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: () => React.JSX.Element | null;
}) {
  const { user, isLoading } = useAuth();

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

  return <Route path={path} component={Component} />;
}

/**
 * AdminRoute – requires an authenticated user with the "admin" role.
 * - Unauthenticated visitors are redirected to /auth.
 * - Authenticated non-admins see an Access Denied screen instead of being
 *   silently redirected, so the denial is explicit.
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
