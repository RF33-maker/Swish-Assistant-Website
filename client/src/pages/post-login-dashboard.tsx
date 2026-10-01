import { useEffect, useState } from "react"
import { Link, useLocation } from "wouter"
import type { ComponentType } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/use-auth";
import { Users, Trophy, Share2, Code, Newspaper, CheckCircle, AlertCircle, RefreshCw, ArrowRight, BadgeCheck, LogOut } from "lucide-react";
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";

type SuggestedLeague = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  type: "league" | "competition";
};

type Tool = {
  key: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  body: string;
  href: string;
  cta: string;
  enabled: boolean;
  lockedNote?: string;
  testId?: string;
  ctaTestId?: string;
};

/** One dashboard destination: the whole card opens it, or it waits with a note. */
function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const inner = (
    <>
      <span className="flex items-start gap-3.5">
        <span
          className={`h-11 w-11 shrink-0 rounded-xl flex items-center justify-center ${
            tool.enabled ? "bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]" : "bg-[color:var(--ch-surface-3)] text-[color:var(--ch-muted)]"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="ch-display uppercase font-bold tracking-tight leading-none text-[1.3rem] text-[color:var(--ch-text)]">{tool.title}</span>
            {!tool.enabled && (
              <span className="rounded-full bg-[color:var(--ch-surface-3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ch-text-2)]">
                Coming soon
              </span>
            )}
          </span>
          <span className="mt-1 block text-[13px] text-[color:var(--ch-muted)]">{tool.description}</span>
        </span>
      </span>
      <span className="mt-4 block text-sm text-[color:var(--ch-text-2)]">{tool.body}</span>
      {tool.enabled ? (
        <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--ch-accent)]" data-testid={tool.ctaTestId}>
          {tool.cta}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      ) : (
        <span className="mt-auto pt-4 block text-xs font-medium text-[color:var(--ch-muted)]">{tool.lockedNote}</span>
      )}
    </>
  );
  return tool.enabled ? (
    <Link href={tool.href} className="ch-card ch-hover group flex flex-col p-5 min-h-[196px]" data-testid={tool.testId}>
      {inner}
    </Link>
  ) : (
    <div className="ch-card flex flex-col p-5 min-h-[196px] opacity-80" data-testid={tool.testId}>
      {inner}
    </div>
  );
}

export default function DashboardLanding() {
  const [, navigate] = useLocation();
  const { isAdmin, isCoach, emailConfirmed, user, logoutMutation } = useAuth();
  // Coach (team) accounts get the Coaches Hub card too — everything else on
  // this dashboard (League Management, Social Tools, API/Widgets) stays
  // admin-only.
  const canAccessCoachesHub = isAdmin || isCoach;
  const { toast } = useToast();
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);
  const [suggestedLeagues, setSuggestedLeagues] = useState<SuggestedLeague[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(!isAdmin);
  const [leaguesError, setLeaguesError] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      setLeaguesLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSuggestedLeagues() {
      setLeaguesLoading(true);
      setLeaguesError(false);

      const { data, error } = await supabase
        .from("competitions")
        .select("name, slug, logo_url, trending_position, competition_id, leagues:competition_id(name, slug, logo_url)")
        .eq("is_public", true)
        .not("trending_position", "is", null)
        .order("trending_position", { ascending: true })
        .limit(8);

      if (cancelled) return;

      if (error) {
        setLeaguesError(true);
        setLeaguesLoading(false);
        return;
      }

      const seen = new Set<string>();
      const suggestions: SuggestedLeague[] = [];

      for (const competition of data || []) {
        const relation = (competition as any).leagues;
        const league = Array.isArray(relation) ? relation[0] : relation;
        const type = league?.slug ? "league" : "competition";
        const slug = league?.slug || competition.slug;
        const key = `${type}:${slug}`;

        if (!slug || seen.has(key)) continue;
        seen.add(key);
        suggestions.push({
          name: league?.name || competition.name,
          slug,
          logoUrl: league?.logo_url || competition.logo_url,
          type,
        });
        if (suggestions.length === 4) break;
      }

      setSuggestedLeagues(suggestions);
      setLeaguesLoading(false);
    }

    fetchSuggestedLeagues();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  async function handleResendVerification() {
    if (resendLoading || resendCooldown) return;
    setResendLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/account/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: (user as any)?.email ?? "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Could not resend email",
          description: json.error ?? "An unexpected error occurred.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Verification email sent",
          description: "Check your inbox and click the link to verify your account.",
          duration: 8000,
        });
        // Disable button for 60 seconds to match server-side rate limit
        setResendCooldown(true);
        setTimeout(() => setResendCooldown(false), 60_000);
      }
    } catch {
      toast({
        title: "Could not resend email",
        description: "A network error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResendLoading(false);
    }
  }

  const tools: Tool[] = [
    ...(isAdmin
      ? [{
          key: "leagues",
          icon: Trophy,
          title: "League Management",
          description: "Create and manage your leagues",
          body: "Create new leagues, upload game data, manage teams, and customise your league experience.",
          href: "/league-management",
          cta: "Manage leagues",
          enabled: true,
        }]
      : [{
          key: "claim",
          icon: BadgeCheck,
          title: "Your player page",
          description: "Own your page on Swish",
          body: "Play in one of our leagues? Request your page to update your details, add your own photo and download your cards.",
          href: "/contact-sales?topic=player-page",
          cta: "Claim your page",
          enabled: true,
          testId: "card-claim-player-page",
        }]),
    {
      key: "coaches",
      icon: Users,
      title: "Coaches Hub",
      description: "Coaching tools and resources",
      body: "Scouting reports, game analysis and team tools built from your league's data.",
      href: "/coaches-hub",
      cta: "Open the hub",
      enabled: canAccessCoachesHub,
      lockedNote: "We'll let members know when access opens.",
      testId: "card-coaches-hub",
    },
    {
      key: "social",
      icon: Share2,
      title: "Swish Social",
      description: "Generate social media graphics",
      body: "Create performance cards and shareable graphics from your stats database.",
      href: "/social-tools",
      cta: "Create graphics",
      enabled: isAdmin,
      lockedNote: "Shareable graphics are being prepared for members.",
      testId: "card-swish-social",
    },
    {
      key: "widgets",
      icon: Code,
      title: "API / Widgets",
      description: "Embed league data anywhere",
      body: "Create embeddable widgets for standings, player stats, scores and league leaders.",
      href: "/api-widgets",
      cta: "Build widgets",
      enabled: isAdmin,
      lockedNote: "Embeddable league tools will be available later.",
      testId: "card-api-widgets",
    },
    ...(isAdmin
      ? [{
          key: "news",
          icon: Newspaper,
          title: "News Manager",
          description: "Publish stories and updates",
          body: "Add, edit and remove articles that appear in the Latest News section on the home page.",
          href: "/news-manager",
          cta: "Manage news",
          enabled: true,
          testId: "card-news-manager",
          ctaTestId: "button-open-news-manager",
        }]
      : []),
  ];

  const email = (user as { email?: string } | null)?.email;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Dashboard | Swish Assistant</title>
      </Helmet>
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16">
        <header className="ch-rise flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Dashboard</div>
            <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem] text-[color:var(--ch-text)]">
              {isAdmin ? "Choose your mode" : "Your member dashboard"}
            </h1>
            {email && <p className="mt-2 text-sm text-[color:var(--ch-text-2)] truncate">Signed in as {email}</p>}
          </div>
          {user && (
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="ch-btn ch-btn-ghost h-10 px-4 self-start sm:self-auto disabled:opacity-60"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              {logoutMutation.isPending ? "Signing out…" : "Log out"}
            </button>
          )}
        </header>

        {/* Account status banner for non-admin members */}
        {!isAdmin && user && (
          <div
            className={`ch-rise mb-6 rounded-[14px] border px-4 py-3.5 flex items-start gap-3 ${
              emailConfirmed ? "bg-emerald-500/10 border-emerald-500/30" : "bg-amber-500/10 border-amber-500/30"
            }`}
          >
            {emailConfirmed ? (
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-semibold ${emailConfirmed ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
                {emailConfirmed ? "Verified member" : "Email not yet verified"}
              </p>
              <p className="text-[13px] mt-0.5 text-[color:var(--ch-text-2)]">
                {emailConfirmed
                  ? "You can download performance, comparison, leader and trending share cards from any player or league page."
                  : "Check your inbox and click the verification link to unlock card downloads and other member features."}
              </p>
              {!emailConfirmed && (
                <button
                  type="button"
                  className="mt-2.5 ch-btn ch-btn-ghost h-8 px-3 text-xs disabled:opacity-50"
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendCooldown}
                >
                  <RefreshCw className={`h-3 w-3 ${resendLoading ? "animate-spin" : ""}`} />
                  {resendCooldown ? "Email sent — check your inbox" : resendLoading ? "Sending…" : "Resend verification email"}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {tools.map((tool, i) => (
            <div key={tool.key} className="ch-rise flex" style={{ animationDelay: `${60 + i * 40}ms` }}>
              <div className="flex-1 flex flex-col [&>*]:flex-1">
                <ToolCard tool={tool} />
              </div>
            </div>
          ))}
        </div>

        {!isAdmin && (
          <section className="mt-12" aria-labelledby="explore-leagues-heading">
            <div className="mb-4">
              <h2 id="explore-leagues-heading" className="ch-display uppercase font-bold tracking-tight leading-none text-[1.5rem] md:text-[1.75rem] text-[color:var(--ch-text)]">
                Explore leagues
              </h2>
              <p className="mt-1.5 text-sm text-[color:var(--ch-text-2)]">Follow scores, standings, player stats and recent performances from public leagues.</p>
            </div>

            {leaguesLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="suggested-leagues-loading" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <div key={i} className="ch-skel h-[88px] rounded-[14px]" />)}
              </div>
            ) : leaguesError ? (
              <div className="ch-card px-5 py-8 text-center" data-testid="suggested-leagues-error">
                <p className="font-medium text-[color:var(--ch-text)]">League suggestions are temporarily unavailable.</p>
                <Link href="/" className="mt-3 ch-btn ch-btn-ghost h-10 px-4">Browse from the home page</Link>
              </div>
            ) : suggestedLeagues.length === 0 ? (
              <div className="ch-card px-5 py-8 text-center" data-testid="suggested-leagues-empty">
                <p className="font-medium text-[color:var(--ch-text)]">No featured leagues are available right now.</p>
                <Link href="/" className="mt-3 ch-btn ch-btn-ghost h-10 px-4">Browse all public content</Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="suggested-leagues">
                {suggestedLeagues.map((league) => (
                  <button
                    type="button"
                    key={`${league.type}:${league.slug}`}
                    onClick={() => navigate(`/${league.type}/${league.slug}`)}
                    className="ch-card ch-hover group flex min-h-[88px] items-center gap-3.5 p-4 text-left"
                  >
                    <span className="h-12 w-12 flex-none rounded-xl ch-tile flex items-center justify-center overflow-hidden">
                      {league.logoUrl ? (
                        <img src={league.logoUrl} alt="" className="h-10 w-10 object-contain" />
                      ) : (
                        <Trophy className="h-5 w-5 text-[color:var(--ch-accent)]" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-[color:var(--ch-text)]">{league.name}</span>
                      <span className="mt-1 flex items-center text-xs font-medium text-[color:var(--ch-accent)]">
                        View league <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
