import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { Helmet } from "react-helmet-async"
import SwishLogo from "@/assets/Swish Assistant Logo.png"
import Ballpark from "@/assets/ballparksports.jpg"
import BCB from "@/assets/BCB Logo.jpg"
import SLB from "@/assets/Super-League-Basketball-Logo.png"
import NBLBE from "@/assets/NBLBE.jpg"
import { Button } from "@/components/ui/button"
import { X, UserPlus, Mail, Check } from "lucide-react"
import LatestScoresSection from "@/components/home/LatestScoresSection"
import LatestNewsSection from "@/components/home/LatestNewsSection"
import ScoresBlock from "@/components/home/ScoresBlock"
import TrendingPerformanceSection from "@/components/home/TrendingPerformanceSection"
import PodcastSection from "@/components/home/PodcastSection"
import TopPlayersSection from "@/components/home/TopPlayersSection"
import HomeTodayBar from "@/components/home/HomeTodayBar"
import PlatformStatsStrip from "@/components/home/PlatformStatsStrip"
import ScrollStory from "@/components/home/story/ScrollStory"
import ExploreSection from "@/components/home/ExploreSection"
import AudienceSection from "@/components/home/AudienceSection"
import HomeFooter from "@/components/home/HomeFooter"
import SectionHeader from "@/components/home/SectionHeader"
import { InstagramFeedSection } from "@/components/InstagramFeedSection"
import { useAuth } from "@/hooks/use-auth"
import { useReadableTeamColor } from "@/hooks/useReadableColor"
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader"

const PLATFORM_INSTAGRAM_HANDLE = "swishassistant"
const HOSTED_LEAGUE_LOGOS = [Ballpark, NBLBE, BCB, SLB]
const SWISH_ORANGE = "#f97316"

/**
 * "Home to these leagues" — the hosted-league logos as a slow marquee.
 * Tripled so the -50% loop in .animate-infinite-scroll never shows a gap.
 */
function HostedLeaguesBand() {
  return (
    <section className="ch-glass-band border-y border-[color:var(--ch-border)] bg-[color:var(--ch-surface)]" aria-label="Leagues on Swish Assistant">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-6 md:py-7 flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
        <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)] md:w-44">
          Home to these leagues and more
        </h2>
        <div
          className="ch-marquee relative flex-1 overflow-hidden"
          style={{ maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)" }}
        >
          <div className="flex gap-4 md:gap-6 w-max animate-infinite-scroll">
            {[...HOSTED_LEAGUE_LOGOS, ...HOSTED_LEAGUE_LOGOS, ...HOSTED_LEAGUE_LOGOS].map((img, i) => (
              <div
                key={i}
                className="flex-shrink-0 h-14 md:h-16 w-24 md:w-28 rounded-xl bg-white ring-1 ring-black/5 flex items-center justify-center p-2.5"
              >
                <img src={img} alt={`League ${(i % HOSTED_LEAGUE_LOGOS.length) + 1}`} className="max-h-full max-w-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  const [, setLocation] = useLocation()
  const { user, isLoading: authLoading } = useAuth();
  const [showPopup, setShowPopup] = useState(false);
  const accent = useReadableTeamColor(SWISH_ORANGE).body;

  // Show the welcome popup once per session, only to guests
  useEffect(() => {
    if (authLoading) return;
    if (user) return; // already logged in — don't bother them
    const dismissed = sessionStorage.getItem("sa_welcome_dismissed");
    if (dismissed) return;
    const t = setTimeout(() => setShowPopup(true), 2000);
    return () => clearTimeout(t);
  }, [user, authLoading]);

  // Arriving from another page via the menu's Subscribe link (/#subscribe).
  // The browser's own jump fires before the news, podcast and player sections
  // above the form have loaded, so the form keeps moving down and the visitor
  // is left at the top of the page. Scroll once things have had a moment to
  // settle, then once more to absorb any late layout shift.
  useEffect(() => {
    if (window.location.hash !== "#subscribe") return;
    const go = () => document.getElementById("subscribe")?.scrollIntoView({ behavior: "smooth" });
    const t1 = setTimeout(go, 400);
    const t2 = setTimeout(go, 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const dismissPopup = () => {
    sessionStorage.setItem("sa_welcome_dismissed", "1");
    setShowPopup(false);
  };

  return (
    <div
      className={`${SITE_RAIL_OFFSET} sa-pro ch-story-page relative min-h-screen flex flex-col`}
      style={{ "--ch-accent": accent } as React.CSSProperties}
    >
      {/* Layers: the scroll story paints behind everything (z-0), the page
          sits above it (z-1), and the story's basketballs are drawn over the
          top (z-2) — pointer-events-free except the page itself. */}
      <ScrollStory />
      {/* The homepage's title used to come only from index.html, so once other
          pages started setting theirs via Helmet (e.g. /scores), navigating
          back here kept their title. Declaring it restores it in-app. */}
      <Helmet>
        <title>Swish Assistant | The Home of Basketball Stats, Advanced Metrics &amp; League Insights</title>
        <meta
          name="description"
          content="Swish Assistant revolutionizes basketball stats for players, coaches, and leagues. Access AI-powered scouting tools, live data, and player insights from NBL, WNBL, BCB, SLB Championship and more."
        />
      </Helmet>

      {/* Welcome popup — shown once per session to guests */}
      {showPopup && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-[2px]"
          onClick={dismissPopup}
        >
          <div
            className="ch-force-dark dark relative w-full max-w-sm overflow-hidden rounded-2xl text-white shadow-2xl ring-1 ring-white/10 animate-fade-in-up isolate"
            style={{ background: "#0b0d12" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
          >
            <div aria-hidden="true" className="absolute -top-20 -right-16 h-56 w-56 rounded-full blur-3xl opacity-60 -z-10" style={{ background: "radial-gradient(circle, rgba(249,115,22,0.55) 0%, transparent 65%)" }} />
            <div className="p-6">
              {/* Close */}
              <button
                onClick={dismissPopup}
                className="absolute top-3 right-3 h-8 w-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>

              <span className="h-11 w-11 rounded-xl flex items-center justify-center bg-orange-500/15 text-orange-300">
                <UserPlus className="h-5 w-5" />
              </span>
              <h2 id="welcome-title" className="ch-display uppercase font-bold text-[1.75rem] leading-[0.95] tracking-tight mt-4">
                Create your free account
              </h2>
              <p className="text-sm text-white/65 mt-2.5 leading-relaxed">
                Track players, download performance cards, and get insights — all for free. No credit card needed.
              </p>
              <ul className="mt-4 space-y-1.5 text-[13px] text-white/75">
                {["Follow your leagues and players", "Shareable performance cards", "Free forever for fans"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-orange-300" />{t}</li>
                ))}
              </ul>

              <div className="flex flex-col gap-2 mt-6">
                <a
                  href="/auth?tab=register"
                  className="flex items-center justify-center gap-2 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-semibold transition-colors"
                  onClick={dismissPopup}
                >
                  Register free →
                </a>
                <button
                  onClick={dismissPopup}
                  className="h-9 text-sm text-white/55 hover:text-white transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-[1] flex flex-col min-h-screen">
      {/* The homepage has its own search below, so the header shows the
          logo instead; other pages keep the header search. */}
      <SiteHeader hideSearch />

      {/* Live scores ticker */}
      <LatestScoresSection />

      {/* Content first (Bleacher Report / StatMuse): today's bar with
          search and league shortcuts, then the games and the week's top
          performances. */}
      <HomeTodayBar />

      {/* data-story="scores": the scores and the performances — the hoop
          from the search bar hangs behind both as they scroll over it. */}
      <div data-story="scores">
        <div className="max-w-7xl mx-auto w-full px-5 md:px-8">
          <ScoresBlock />
        </div>

        <TrendingPerformanceSection />
      </div>

      <div data-story="leagues">
        <ExploreSection />
      </div>

      <div data-story="news">
        <LatestNewsSection />
      </div>

      {/* Podcast, top players & socials */}
      <div data-story="media">
      <PodcastSection />
      <TopPlayersSection />

      {/* Stay Connected — Instagram feed */}
      <section className="py-12 md:py-16" aria-labelledby="social-heading">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <SectionHeader
            id="social-heading"
            eyebrow="Stay connected"
            title="Follow the action"
            description="Highlights, performance cards and matchday updates from @swishassistant."
          />
          <InstagramFeedSection handle={PLATFORM_INSTAGRAM_HANDLE} title="" />
        </div>
      </section>
      </div>

      {/* Below the content: who Swish is and what it offers */}
      <div data-story="brand">
        <HostedLeaguesBand />
        <div className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-16">
          <PlatformStatsStrip />
        </div>
        <AudienceSection />
      </div>

      {/* Newsletter Signup Section */}
      <section id="subscribe" className="py-12 md:py-16 px-5 md:px-8">
        <div className="ch-force-dark dark relative max-w-7xl mx-auto overflow-hidden rounded-[20px] text-white isolate" style={{ background: "#0b0d12" }}>
          <div aria-hidden="true" className="absolute -left-24 -bottom-32 h-80 w-80 rounded-full blur-3xl opacity-60 -z-10" style={{ background: "radial-gradient(circle, rgba(249,115,22,0.5) 0%, transparent 65%)" }} />
          <img src={SwishLogo} alt="" aria-hidden="true" className="absolute -right-10 -top-10 w-72 h-72 object-contain opacity-[0.05] rotate-12 -z-10" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center p-7 md:p-12">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-300 mb-3">
                <Mail className="h-3.5 w-3.5" /> Newsletter
              </div>
              <h3 className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3rem]">
                Stay updated with Swish Assistant
              </h3>
              <p className="mt-3 text-white/65 max-w-lg">
                Get the latest news, feature updates, and tips delivered straight to your inbox.
                Be the first to know about new league management features and AI improvements.
              </p>
            </div>
            <div>
              <form className="flex flex-col sm:flex-row gap-3">
                <input
                  type="email"
                  placeholder="Enter your email address"
                  aria-label="Email address"
                  className="flex-1 min-w-0 h-12 px-4 rounded-xl bg-white/[0.07] border border-white/15 text-white placeholder:text-white/40 focus:outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-500/20 transition"
                  required
                />
                <button
                  type="submit"
                  className="h-12 px-6 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold transition-colors"
                >
                  Subscribe
                </button>
              </form>
              <p className="mt-3 text-xs text-white/45">
                No spam, just updates. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="hidden py-20 bg-gradient-to-br from-slate-50 to-orange-50 relative">
        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Choose the right plan for your team
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              From individual coaches to full league management, we have a plan that fits your needs and budget.
            </p>
          </div>

          {/* Blurred pricing content */}
          <div className="blur-sm pointer-events-none">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

              {/* Free Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-gray-200 p-6 relative">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Free</h3>
                  <div className="text-3xl font-bold text-slate-900 mb-1">£0</div>
                  <p className="text-gray-600 text-sm mb-6">Perfect for trying out</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>1 private league only</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>View all public leagues</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Limited AI queries</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">✗</span>
                      <span className="text-gray-400">Public league hosting</span>
                    </li>
                  </ul>

                  {/* <Button 
                    size="lg" 
                    variant="outline"
                    className="w-full border-orange-200 text-orange-700 hover:bg-orange-50"
                  >
                    Get Started Free
                  </Button> */}
                </div>
              </div>

              {/* Individual Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-orange-200 p-6 relative">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Individual</h3>
                  <div className="text-3xl font-bold text-orange-600 mb-1">£5</div>
                  <p className="text-gray-600 text-sm mb-6">per month</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Public league hosting</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Full AI league assistant</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>1 scouting report/month</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Advanced analytics</span>
                    </li>
                  </ul>

                  <Button 
                    size="lg"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Choose Individual
                  </Button>
                </div>
              </div>

              {/* All Access Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-purple-200 p-6 relative">
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-purple-600 text-white px-3 py-1 rounded-full text-xs font-semibold">POPULAR</span>
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">All Access</h3>
                  <div className="text-3xl font-bold text-purple-600 mb-1">£15</div>
                  <p className="text-gray-600 text-sm mb-6">per month</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Multiple league creation</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Full AI assistant features</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Full league branding</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Unlimited scouting reports</span>
                    </li>
                  </ul>

                  <Button 
                    size="lg"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Choose All Access
                  </Button>
                </div>
              </div>

              {/* Full League/Season Tier */}
              <div className="bg-white rounded-xl shadow-lg border-2 border-blue-200 p-6 relative">
                <div className="text-center">
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Full League</h3>
                  <div className="text-3xl font-bold text-blue-600 mb-1">Custom</div>
                  <p className="text-gray-600 text-sm mb-6">contact us</p>

                  <ul className="text-left space-y-3 mb-8">
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>All teams included</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Players & coaches access</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>Dedicated support</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>White-label options</span>
                    </li>
                  </ul>

                  <Button 
                    size="lg"
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    Contact Sales
                  </Button>
                </div>
              </div>

            </div>

            <div className="text-center mt-12">
              <p className="text-gray-600 text-sm">
                All plans include secure data storage and regular backups. 
                <a href="#support" className="text-orange-600 hover:text-orange-700 underline ml-1">Need help choosing?</a>
              </p>
            </div>
          </div>

          {/* Beta Overlay Message */}
          <div className="absolute inset-0 flex items-center justify-center bg-white/20 backdrop-blur-md z-10">
            <div className="bg-white rounded-2xl shadow-2xl border-2 border-orange-200 p-8 max-w-md text-center animate-fade-in-up" style={{ animationDelay: '0.2s', opacity: 0, animationFillMode: 'forwards' }}>
              <h3 className="text-2xl font-bold text-slate-900 mb-3 flex items-center justify-center gap-2">
                <span className="text-2xl">🚀</span>
                Product in Beta
              </h3>
              <p className="text-gray-600 mb-6">
                Your stats, always free.
                We’re developing advanced tools that take your experience to the next level — from AI-powered insights to effortless scouting automation. Premium features launching soon!
              </p>
              <p className="text-sm text-gray-500 mb-6">
                Please contact us if you have any questions or would like early access.
              </p>
              <Button 
                size="lg"
                className="w-full bg-orange-500 hover:bg-orange-600 hover:shadow-[0_0_20px_rgba(249,115,22,0.5)] text-white transition-all duration-300"
                onClick={() => setLocation('/contact-sales')}
              >
                Contact Us
              </Button>
            </div>
          </div>
        </div>
      </section>

      <HomeFooter />
      </div>

    </div>
  )
}
