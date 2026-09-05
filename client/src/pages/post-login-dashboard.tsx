import { useEffect, useState } from "react"
import { useLocation } from "wouter"
import { useAuth } from "@/hooks/use-auth";
import { Users, TrendingUp, Trophy, Settings, Share2, Code, Newspaper, FilePenLine, CheckCircle, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase"
import SwishLogo from "@/assets/Swish Assistant Logo.png"

type SuggestedLeague = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  type: "league" | "competition";
};

export default function DashboardLanding() {
  const [, navigate] = useLocation();
  const { isAdmin, emailConfirmed, user } = useAuth();
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

  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex items-center justify-between w-full mb-8">
          <Button 
            variant="outline" 
            onClick={() => navigate("/")}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300"
          >
            ← Back to Home
          </Button>
        </div>
        
        <div className="flex flex-col items-center gap-3 mb-2">
          <img 
            src={SwishLogo} 
            alt="Swish Assistant" 
            className="h-16 w-auto object-contain"
          />
          <h2 className="text-center text-orange-600 font-semibold text-sm uppercase tracking-wide">
            Swish Assistant
          </h2>
        </div>
        <p className="mt-2 text-center text-4xl sm:text-5xl font-extrabold text-slate-900">
          {isAdmin ? "Choose your mode" : "Your member dashboard"}
        </p>

        {/* Account status banner for non-admin members */}
        {!isAdmin && user && (
          <div className={`mt-6 mx-auto max-w-xl rounded-xl border px-4 py-3 flex items-start gap-3 ${emailConfirmed ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
            {emailConfirmed ? (
              <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className={`text-sm font-semibold ${emailConfirmed ? "text-emerald-800" : "text-amber-800"}`}>
                {emailConfirmed ? "Verified member" : "Email not yet verified"}
              </p>
              <p className={`text-xs mt-0.5 ${emailConfirmed ? "text-emerald-700" : "text-amber-700"}`}>
                {emailConfirmed
                  ? "You can download performance, comparison, leader, and trending share cards from any player or league page."
                  : "Check your inbox and click the verification link to unlock card downloads and other member features."}
              </p>
              {!emailConfirmed && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 hover:border-amber-400 disabled:opacity-50"
                  onClick={handleResendVerification}
                  disabled={resendLoading || resendCooldown}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${resendLoading ? "animate-spin" : ""}`} />
                  {resendCooldown ? "Email sent — check your inbox" : resendLoading ? "Sending…" : "Resend verification email"}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={`mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 ${isAdmin ? "xl:grid-cols-5" : ""}`}>
          {/* League Management — admin only */}
          {isAdmin && (
            <Card className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group" onClick={() => navigate("/league-management")}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-orange-600 group-hover:bg-orange-700 flex items-center justify-center transition-all duration-300 group-hover:rotate-12 group-hover:scale-110">
                    <Trophy className="h-6 w-6 text-white group-hover:animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300">League Management</CardTitle>
                    <CardDescription className="group-hover:text-orange-600 transition-colors duration-300">Create and manage your leagues</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-orange-700 text-sm mb-4">Create new leagues, upload game data, manage teams, and customize your league experience.</p>
                <Button 
                  size="sm" 
                  className="bg-orange-600 hover:bg-orange-700 text-white transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/league-management");
                  }}
                >
                  <Settings className="h-3 w-3 mr-1 group-hover:animate-bounce" />
                  Manage Leagues
                </Button>
              </CardContent>
            </Card>
          )}

          <Card
            data-testid="card-coaches-hub"
            className={isAdmin
              ? "bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group"
              : "bg-slate-50 border-slate-200 shadow-sm"}
            onClick={isAdmin ? () => navigate("/coaches-hub") : undefined}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-orange-600 group-hover:bg-orange-700 flex items-center justify-center transition-all duration-300 group-hover:rotate-12 group-hover:scale-110">
                  <Users className="h-6 w-6 text-white group-hover:animate-pulse" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300">Coaches Hub</CardTitle>
                      {!isAdmin && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">Coming soon</span>}
                    </div>
                    <CardDescription className="group-hover:text-orange-600 transition-colors duration-300">Coaching tools and resources</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-orange-700 text-sm mb-4">Access coaching resources, game analysis tools, and team management features.</p>
              {isAdmin ? <Button
                size="sm" 
                className="bg-orange-600 hover:bg-orange-700 text-white transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/coaches-hub");
                }}
              >
                <TrendingUp className="h-3 w-3 mr-1 group-hover:animate-bounce" />
                Access Hub
              </Button> : <p className="text-xs font-medium text-slate-500">We’ll let members know when access opens.</p>}
            </CardContent>
          </Card>

          <Card
            data-testid="card-swish-social"
            className={isAdmin
              ? "bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group"
              : "bg-slate-50 border-slate-200 shadow-sm"}
            onClick={isAdmin ? () => navigate("/social-tools") : undefined}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-orange-600 group-hover:bg-orange-700 flex items-center justify-center transition-all duration-300 group-hover:rotate-12 group-hover:scale-110">
                  <Share2 className="h-6 w-6 text-white group-hover:animate-pulse" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300">Swish Social</CardTitle>
                      {!isAdmin && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">Coming soon</span>}
                    </div>
                  <CardDescription className="group-hover:text-orange-600 transition-colors duration-300">Generate social media graphics</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-orange-700 text-sm mb-4">Create performance cards and shareable graphics from your stats database.</p>
              {isAdmin ? <Button
                size="sm" 
                className="bg-orange-600 hover:bg-orange-700 text-white transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/social-tools");
                }}
              >
                <Share2 className="h-3 w-3 mr-1 group-hover:animate-bounce" />
                Create Graphics
              </Button> : <p className="text-xs font-medium text-slate-500">Shareable graphics are being prepared for members.</p>}
            </CardContent>
          </Card>

          <Card
            data-testid="card-api-widgets"
            className={isAdmin
              ? "bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group"
              : "bg-slate-50 border-slate-200 shadow-sm"}
            onClick={isAdmin ? () => navigate("/api-widgets") : undefined}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-orange-600 group-hover:bg-orange-700 flex items-center justify-center transition-all duration-300 group-hover:rotate-12 group-hover:scale-110">
                  <Code className="h-6 w-6 text-white group-hover:animate-pulse" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300">API / Widgets</CardTitle>
                      {!isAdmin && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">Coming soon</span>}
                    </div>
                  <CardDescription className="group-hover:text-orange-600 transition-colors duration-300">Embed league data anywhere</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-orange-700 text-sm mb-4">Create embeddable widgets for standings, player stats, scores, and league leaders.</p>
              {isAdmin ? <Button
                size="sm" 
                className="bg-orange-600 hover:bg-orange-700 text-white transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/api-widgets");
                }}
              >
                <Code className="h-3 w-3 mr-1 group-hover:animate-bounce" />
                Build Widgets
              </Button> : <p className="text-xs font-medium text-slate-500">Embeddable league tools will be available later.</p>}
            </CardContent>
          </Card>

          {/* News Manager — admin only */}
          {isAdmin && (
            <Card className="bg-white border-orange-200 shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/40 transition-all duration-300 cursor-pointer transform hover:scale-105 group" onClick={() => navigate("/news-manager")} data-testid="card-news-manager">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-orange-600 group-hover:bg-orange-700 flex items-center justify-center transition-all duration-300 group-hover:rotate-12 group-hover:scale-110">
                    <Newspaper className="h-6 w-6 text-white group-hover:animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-orange-900 text-lg group-hover:text-orange-700 transition-colors duration-300">News Manager</CardTitle>
                    <CardDescription className="group-hover:text-orange-600 transition-colors duration-300">Publish stories and updates</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-orange-700 text-sm mb-4">Add, edit, and remove articles that appear in the public Latest News section on the home page.</p>
                <Button
                  size="sm"
                  className="bg-orange-600 hover:bg-orange-700 text-white transform transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate("/news-manager");
                  }}
                  data-testid="button-open-news-manager"
                >
                  <FilePenLine className="h-3 w-3 mr-1 group-hover:animate-bounce" />
                  Manage News
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {!isAdmin && (
          <section className="mt-14" aria-labelledby="explore-leagues-heading">
            <div className="mb-5 text-center">
              <h2 id="explore-leagues-heading" className="text-2xl font-bold text-slate-900">Explore leagues while you wait</h2>
              <p className="mt-2 text-sm text-slate-600">Follow scores, standings, player stats, and recent performances from public leagues.</p>
            </div>

            {leaguesLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-10 text-sm text-slate-500" data-testid="suggested-leagues-loading">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Finding leagues…
              </div>
            ) : leaguesError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-8 text-center" data-testid="suggested-leagues-error">
                <p className="font-medium text-amber-900">League suggestions are temporarily unavailable.</p>
                <Button variant="outline" className="mt-3 border-amber-300 text-amber-900" onClick={() => navigate("/")}>
                  Browse from the home page
                </Button>
              </div>
            ) : suggestedLeagues.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-8 text-center" data-testid="suggested-leagues-empty">
                <p className="font-medium text-slate-700">No featured leagues are available right now.</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/")}>Browse all public content</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="suggested-leagues">
                {suggestedLeagues.map((league) => (
                  <button
                    type="button"
                    key={`${league.type}:${league.slug}`}
                    onClick={() => navigate(`/${league.type}/${league.slug}`)}
                    className="group flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                  >
                    {league.logoUrl ? (
                      <img src={league.logoUrl} alt="" className="h-12 w-12 flex-none object-contain" />
                    ) : (
                      <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-orange-100">
                        <Trophy className="h-6 w-6 text-orange-600" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">{league.name}</span>
                      <span className="mt-1 flex items-center text-xs font-medium text-orange-700">
                        View league <ArrowRight className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
