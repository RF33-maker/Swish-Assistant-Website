import { Route, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import AuthPage from "@/pages/auth";
import LandingPage from "@/pages/landing-page";
import LeaguePage from "./pages/pages/league/[slug]";
import LeagueAdminPage from "./pages/pages/league-admin/[slug]";
import LeagueLeadersPage from "./pages/pages/league-leaders/[slug]";
import PlayerStatsPage from "./pages/pages/player/[id]";
import PlayersListPage from "./pages/players-list";
import PostLoginDashboard from "@/pages/post-login-dashboard"; // new dashboard page
import CoachesHub from "@/pages/CoachesHub";
import TeamProfile from "@/pages/TeamProfile";
import TeamsList from "@/pages/TeamsList";
import LeagueTeams from "@/pages/LeagueTeams";
import TeamLogoManager from "@/pages/TeamLogoManager";
import LeagueAdmin from "@/pages/LeagueAdmin";
import LeagueManagement from "@/pages/LeagueManagement";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import ResetPassword from "./pages/reset-password";
import SettingsPage from "@/pages/settings-page";
import ProfilePage from "./pages/profile-page";
import TestConnections from "./components/test-connections";
import PaymentPage from "@/pages/payment";
import ContactSalesPage from "@/pages/contact-sales";
import PrivacyPolicyPage from "@/pages/privacy";
import TermsOfServicePage from "@/pages/terms";
import CookiePolicyPage from "@/pages/cookies";

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/test" component={TestConnections} />
      <Route path="/league/:slug" component={LeaguePage} />
      <Route path="/league/:slug/teams" component={LeagueTeams} />
      <Route path="/league/:slug/team-logos" component={TeamLogoManager} />
      <Route path="/league-leaders/:slug" component={LeagueLeadersPage} />
      <Route path="/players" component={PlayersListPage} />
      <Route path="/player/:id" component={PlayerStatsPage} />
      <Route path="/teams" component={TeamsList} />
      <Route path="/team/:teamName" component={TeamProfile} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/privacy" component={PrivacyPolicyPage} />
      <Route path="/terms" component={TermsOfServicePage} />
      <Route path="/cookies" component={CookiePolicyPage} />
      <Route path="/contact-sales" component={ContactSalesPage} />

      {/* Protected routes */}
      <ProtectedRoute path="/dashboard" component={PostLoginDashboard} />
      <ProtectedRoute path="/coaches-hub" component={CoachesHub} />
      <ProtectedRoute path="/league-management" component={LeagueManagement} />
      <ProtectedRoute path="/league-admin/:slug" component={LeagueAdmin} />
      <ProtectedRoute path="/teams/:slug" component={TeamsList} />
      <ProtectedRoute path="/team/:teamName/:slug" component={TeamProfile} />
      <ProtectedRoute path="/league-teams/:slug" component={LeagueTeams} />
      <ProtectedRoute path="/team-logos/:slug" component={TeamLogoManager} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/payment" component={PaymentPage} />


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