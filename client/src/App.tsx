import { Route, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth-page";
import LandingPage from "@/pages/landing-page";
import LeaguePage from "./pages/pages/league/[slug]";
import LeagueAdminPage from "./pages/pages/league-admin/[slug]";
import PostLoginDashboard from "@/pages/post-login-dashboard"; // new dashboard page
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import ResetPassword from "./pages/reset-password";
import SettingsPage from "./pages/settings-page";
import ProfilePage from "./pages/profile-page";

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/league/:slug" component={LeaguePage} />
      <Route path="/reset-password" component={ResetPassword} />

      {/* Protected routes */}
      <ProtectedRoute path="/dashboard" component={PostLoginDashboard} />
      <ProtectedRoute path="/coaches-hub" component={HomePage} />
      <ProtectedRoute path="/league-admin" component={LeagueAdminPage} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />


      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
