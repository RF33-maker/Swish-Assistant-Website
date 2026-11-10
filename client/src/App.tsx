import { Suspense, useEffect } from "react";
import { Redirect, Route, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from '@vercel/analytics/react';
import { useAnalyticsConsent } from "@/hooks/use-analytics-consent";
import { HelmetProvider } from "react-helmet-async";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing-page";
import { AuthProvider } from "./hooks/use-auth";
import { AdminRoute, ProtectedRoute, TeamRoute } from "./lib/protected-route";
import { CookieBanner } from "@/components/CookieBanner";
import { AskSwishProvider } from "@/components/ask-swish/AskSwishProvider";
import AskSwishLauncher from "@/components/ask-swish/AskSwishLauncher";
import { lazyWithReload } from "@/lib/lazyWithReload";

// The homepage (and the 404, which shares its header and search) ship in the
// main bundle so "/" needs one script. Every other page is its own chunk,
// fetched when its route first renders, so a phone landing on the homepage
// doesn't download the admin tools, Coaches Hub, the social studio and the
// PDF and chart libraries those pages pull in.
const AuthPage = lazyWithReload(() => import("@/pages/auth"));
const LeaguePage = lazyWithReload(() => import("./pages/pages/league/[slug]"));
const CompetitionPage = lazyWithReload(() => import("./pages/pages/competition/[slug]"));
const PlayerStatsPage = lazyWithReload(() => import("./pages/pages/player/[id]"));
const PlayersListPage = lazyWithReload(() => import("./pages/players-list"));
const PostLoginDashboard = lazyWithReload(() => import("@/pages/post-login-dashboard"));
const CoachesHub = lazyWithReload(() => import("@/pages/CoachesHub"));
const TeamProfile = lazyWithReload(() => import("@/pages/TeamProfile"));
const TeamsList = lazyWithReload(() => import("@/pages/TeamsList"));
const LeagueTeams = lazyWithReload(() => import("@/pages/LeagueTeams"));
const TeamLogoManager = lazyWithReload(() => import("@/pages/TeamLogoManager"));
const LeagueAdmin = lazyWithReload(() => import("@/pages/LeagueAdmin"));
const LeagueManagement = lazyWithReload(() => import("@/pages/LeagueManagement"));
const SocialToolsPage = lazyWithReload(() => import("@/pages/social-tools"));
const WidgetBuilder = lazyWithReload(() => import("@/pages/widget-builder"));
const NewsManager = lazyWithReload(() => import("@/pages/NewsManager"));
const NewsEditorPage = lazyWithReload(() => import("@/pages/NewsEditorPage"));
const NewsPreviewPage = lazyWithReload(() => import("@/pages/NewsPreviewPage"));
const NewsArticlePage = lazyWithReload(() => import("@/pages/NewsArticlePage"));
const NewsIndexPage = lazyWithReload(() => import("@/pages/NewsIndexPage"));
const BritishBasketballHistoryPage = lazyWithReload(() => import("@/pages/BritishBasketballHistoryPage"));
const SwishScorePage = lazyWithReload(() => import("@/pages/SwishScorePage"));
const WidgetPage = lazyWithReload(() => import("@/pages/widgets/WidgetPage"));
const EmbedGuide = lazyWithReload(() => import("@/pages/embed-guide"));
const GamePage = lazyWithReload(() => import("@/pages/GamePage"));
const ScoresPage = lazyWithReload(() => import("@/pages/ScoresPage"));
const PlaybookSharePage = lazyWithReload(() => import("@/pages/PlaybookSharePage"));
const ResetPassword = lazyWithReload(() => import("./pages/reset-password"));
const AuthConfirm = lazyWithReload(() => import("./pages/auth-confirm"));
const SettingsPage = lazyWithReload(() => import("@/pages/settings-page"));
const ProfilePage = lazyWithReload(() => import("./pages/profile-page"));
const ImportPlayersPage = lazyWithReload(() => import("@/pages/admin/import-players"));
const UnconfirmedAccountsPage = lazyWithReload(() => import("@/pages/admin/unconfirmed-accounts"));
const PlayerClaimsAdminPage = lazyWithReload(() => import("@/pages/admin/player-claims"));
const ClaimProfilePage = lazyWithReload(() => import("@/pages/claim-profile"));
const PublicProfilePage = lazyWithReload(() => import("@/pages/public-profile"));
const PreferencesPage = lazyWithReload(() => import("@/pages/PreferencesPage"));
const EditMyProfilePage = lazyWithReload(() => import("@/pages/edit-my-profile"));
const PaymentPage = lazyWithReload(() => import("@/pages/payment"));
const ContactSalesPage = lazyWithReload(() => import("@/pages/contact-sales"));
const CoachAccessPage = lazyWithReload(() => import("@/pages/coach-access"));
const PlusPage = lazyWithReload(() => import("@/pages/plus"));
const CoachAccessSuccessPage = lazyWithReload(() => import("@/pages/coach-access-success"));
const CoachAccessAdminPage = lazyWithReload(() => import("@/pages/admin/coach-access"));
const GameTimesAdminPage = lazyWithReload(() => import("@/pages/admin/game-times"));
const PrivacyPolicyPage = lazyWithReload(() => import("@/pages/privacy"));
const TermsOfServicePage = lazyWithReload(() => import("@/pages/terms"));
const CookiePolicyPage = lazyWithReload(() => import("@/pages/cookies"));
const AskSwishPage = lazyWithReload(() => import("@/pages/AskSwishPage"));

/**
 * Shown while a page's chunk downloads: the page background and nothing else,
 * so a fast load doesn't flash a spinner or text. .sa-pro gives the same
 * background the pages use, light or dark (it follows the `dark` class).
 */
function PageFallback() {
  return <div className="sa-pro min-h-screen" aria-hidden="true" />;
}

/**
 * Once the first page has loaded and the browser is idle, fetch the pages
 * people most often go to next, so moving around the site doesn't wait on a
 * download. Skipped when the visitor has asked to save data or is on 2G.
 */
function usePrefetchPublicPages() {
  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? "")) return;

    let timer: number | undefined;
    const prefetch = () => {
      for (const page of [LeaguePage, PlayerStatsPage, TeamProfile, GamePage, ScoresPage, NewsIndexPage]) {
        page.preload().catch(() => {});
      }
    };
    const whenIdle = () => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(prefetch, { timeout: 5000 });
      else timer = window.setTimeout(prefetch, 2000);
    };
    if (document.readyState === "complete") whenIdle();
    else window.addEventListener("load", whenIdle, { once: true });
    return () => {
      window.removeEventListener("load", whenIdle);
      if (timer) window.clearTimeout(timer);
    };
  }, []);
}

// The old league-leaders pages now live in each league page's Leaders section.
function LeadersRedirect({ params }: { params: { slug: string } }) {
  return <Redirect to={`/competition/${params.slug}?section=leaders`} replace />;
}

// The old per-competition teams list is now the league page's Teams tab.
function TeamsSectionRedirect({ params }: { params: { slug: string } }) {
  return <Redirect to={`/competition/${params.slug}?section=teams`} replace />;
}

function Router() {
  return (
    <Switch>
      {/* Public */}
      <Route path="/" component={LandingPage} />
      <Route path="/auth" component={AuthPage} />
      {/* Unlisted, read-only team playbook (no sign-in, no API) */}
      <Route path="/playbook/share/:code" component={PlaybookSharePage} />
      {/* /league/:slug  = league brand page (series hub) */}
      <Route path="/league/:slug" component={CompetitionPage} />
      {/* /competition/:slug = individual season/tournament page */}
      <Route path="/competition/:slug" component={LeaguePage} />
      <Route path="/competition/:slug/player/:playerSlug" component={LeaguePage} />
      <Route path="/competition/:slug/teams" component={TeamsSectionRedirect} />
      <Route path="/competition/:slug/team-logos" component={TeamLogoManager} />
      <Route path="/competition-leaders/:slug" component={LeadersRedirect} />
      {/* Legacy /league-leaders redirect handled by keeping old route */}
      <Route path="/league-leaders/:slug" component={LeadersRedirect} />
      <Route path="/players" component={PlayersListPage} />
      <Route path="/player/:slug" component={PlayerStatsPage} />
      <Route path="/player/:slug/games/page/:page" component={PlayerStatsPage} />
      <Route path="/teams" component={TeamsList} />
      <Route path="/team/:teamName" component={TeamProfile} />
      <Route path="/competition/:competitionSlug/team/:teamName" component={TeamProfile} />
      {/* Direct game routes share the full recap and upcoming preview */}
      <Route path="/competition/:slug/game/:gameKey" component={LeaguePage} />
      <Route path="/league/:slug/game/:gameKey" component={LeaguePage} />
      {/* Legacy redirects: old /league/:slug season URLs → /competition/:slug */}
      <Route path="/league/:slug/player/:playerSlug" component={LeaguePage} />
      <Route path="/league/:slug/teams" component={TeamsSectionRedirect} />
      <Route path="/league/:slug/team-logos" component={TeamLogoManager} />
      <Route path="/league/:leagueSlug/team/:teamName" component={TeamProfile} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/auth/confirm" component={AuthConfirm} />
      <Route path="/privacy" component={PrivacyPolicyPage} />
      <Route path="/terms" component={TermsOfServicePage} />
      <Route path="/cookies" component={CookiePolicyPage} />
      <Route path="/contact-sales" component={ContactSalesPage} />
      <Route path="/coach-access" component={CoachAccessPage} />
      <Route path="/plus" component={PlusPage} />
      <Route path="/game/:gameKey" component={GamePage} />
      <Route path="/scores" component={ScoresPage} />
      <Route path="/ask" component={AskSwishPage} />
      <Route path="/widget/:type" component={WidgetPage} />
      <Route path="/embed" component={EmbedGuide} />
      <Route path="/news" component={NewsIndexPage} />
      <Route path="/british-basketball-history" component={BritishBasketballHistoryPage} />
      <Route path="/swish-score" component={SwishScorePage} />
      <Route path="/news/:slug" component={NewsArticlePage} />
      <Route path="/p/:slug" component={PublicProfilePage} />
      <Route path="/preferences" component={PreferencesPage} />
      {/* Handles signed-out and unconfirmed visitors itself, so it can send them back here after sign-in. */}
      <Route path="/claim" component={ClaimProfilePage} />

      {/* Member routes — any authenticated user */}
      <ProtectedRoute path="/dashboard" component={PostLoginDashboard} />
      <TeamRoute path="/coaches-hub" component={CoachesHub} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <ProtectedRoute path="/settings" component={SettingsPage} />
      <ProtectedRoute path="/payment" component={PaymentPage} />
      <ProtectedRoute path="/coach-access/success" component={CoachAccessSuccessPage} />
      <ProtectedRoute path="/my-profile/edit" component={EditMyProfilePage} />
      <AdminRoute path="/social-tools" component={SocialToolsPage} />
      <AdminRoute path="/api-widgets" component={WidgetBuilder} />

      {/* Admin-only routes — require app_metadata.role === "admin" */}
      <AdminRoute path="/league-management" component={LeagueManagement} />
      <AdminRoute path="/league-admin/:slug" component={LeagueAdmin} />
      <AdminRoute path="/teams/:slug" component={TeamsList} />
      <AdminRoute path="/league-teams/:slug" component={LeagueTeams} />
      <AdminRoute path="/team-logos/:slug" component={TeamLogoManager} />
      <AdminRoute path="/news-manager" component={NewsManager} />
      {/* :id is "new" for an article that hasn't been saved yet */}
      <AdminRoute path="/news-manager/edit/:id" component={NewsEditorPage} />
      <AdminRoute path="/news-manager/preview" component={NewsPreviewPage} />
      <AdminRoute path="/admin/import-players" component={ImportPlayersPage} />
      <AdminRoute path="/admin/unconfirmed-accounts" component={UnconfirmedAccountsPage} />
      <AdminRoute path="/admin/player-claims" component={PlayerClaimsAdminPage} />
      <AdminRoute path="/admin/coach-access" component={CoachAccessAdminPage} />
      <AdminRoute path="/admin/game-times" component={GameTimesAdminPage} />

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Mounts Vercel Analytics only when the user has explicitly accepted analytics
 * cookies. This component must live inside the component tree so it can use
 * the useAnalyticsConsent hook reactively (re-renders when consent changes).
 */
function ConditionalAnalytics() {
  const hasConsent = useAnalyticsConsent();
  return hasConsent ? <Analytics /> : null;
}

function App() {
  usePrefetchPublicPages();
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <TooltipProvider>
                <AskSwishProvider>
                  <Toaster />
                  <Suspense fallback={<PageFallback />}>
                    <Router />
                  </Suspense>
                  <AskSwishLauncher />
                  <ConditionalAnalytics />
                  <CookieBanner />
                </AskSwishProvider>
              </TooltipProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
