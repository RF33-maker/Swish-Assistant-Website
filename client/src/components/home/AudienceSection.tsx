import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, BadgeCheck, Building2, Check, ClipboardList, Download, ImagePlus, PlayCircle, Ruler, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import SectionHeader from "@/components/home/SectionHeader";
import { Reveal } from "@/components/home/motion";
import StatsThreadLogo from "@/assets/statsthread-logo.svg";

const STATSTHREAD_URL = "https://www.statsthread.co.uk";

function Feature({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <li className="flex gap-2.5">
      <Check className={`h-4 w-4 mt-0.5 shrink-0 ${tone === "dark" ? "text-orange-300" : "text-[color:var(--ch-accent)]"}`} />
      <span>{children}</span>
    </li>
  );
}

/**
 * "Why Swish" — the homepage's plans: Free for fans and players, Pro for
 * players and coaches who want control of their pages, and a conversation
 * for leagues and clubs. Under the plans, how a player or coach takes
 * ownership of their page.
 */
export default function AudienceSection() {
  const { user } = useAuth();

  return (
    <section className="py-14 md:py-20" aria-labelledby="audience-heading">
      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <SectionHeader
          id="audience-heading"
          eyebrow="Why Swish"
          title="Free to follow. Yours to own."
          description="Every game, stat and profile is free to follow. Players and coaches can take control of their own pages, and leagues get a pro home for every game."
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 items-stretch">
          {/* Free */}
          <Reveal delay={0} className="h-full">
          <div className="ch-card h-full p-6 md:p-7 flex flex-col" data-testid="plan-free">
            <div className="flex items-center justify-between">
              <span className="h-11 w-11 rounded-xl flex items-center justify-center bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]">
                <UserRound className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-md bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]">Free</span>
            </div>
            <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">Fans &amp; players</div>
            <h3 className="mt-1 text-xl md:text-[22px] font-semibold tracking-tight text-[color:var(--ch-text)]">Follow every game you care about</h3>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="ch-display text-[2.5rem] font-bold leading-none text-[color:var(--ch-text)]">£0</span>
              <span className="text-sm text-[color:var(--ch-muted)]">free, forever</span>
            </div>
            <ul className="mt-5 space-y-2.5 text-sm text-[color:var(--ch-text-2)]">
              <Feature>Live scores, results and full box scores</Feature>
              <Feature>Player and team profiles, stats and shot charts</Feature>
              <Feature>Full game logs with a free account</Feature>
              <Feature>Download performance and accolade cards</Feature>
            </ul>
            <div className="mt-auto pt-7">
              {user ? (
                <a href="#explore" className="ch-btn ch-btn-ghost h-10 px-4">Explore the leagues <ArrowRight className="h-4 w-4" /></a>
              ) : (
                <a href="/auth?tab=register" className="ch-btn ch-btn-ghost h-10 px-4">Create free account <ArrowRight className="h-4 w-4" /></a>
              )}
            </div>
          </div>
          </Reveal>

          {/* Pro — featured */}
          <Reveal delay={110} className="h-full">
          <div className="ch-force-dark dark relative h-full overflow-hidden rounded-[14px] p-6 md:p-7 flex flex-col text-white shadow-[var(--ch-shadow-lg)] isolate" style={{ background: "#0b0d12" }} data-testid="plan-pro">
            <div aria-hidden="true" className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl opacity-60 -z-10" style={{ background: "radial-gradient(circle, rgba(249,115,22,0.5) 0%, transparent 65%)" }} />
            <div className="flex items-center justify-between">
              <span className="h-11 w-11 rounded-xl flex items-center justify-center bg-orange-500/15 text-orange-300">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-md bg-white text-neutral-900">Pro · Paid</span>
            </div>
            <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">Players &amp; coaches</div>
            <h3 className="mt-1 text-xl md:text-[22px] font-semibold tracking-tight">Take control of your page</h3>
            <p className="mt-3 text-sm text-white/65">Everything in Free, plus:</p>
            <ul className="mt-3 space-y-2.5 text-sm text-white/75">
              <Feature tone="dark">Own your player page: your details, your photos, your data</Feature>
              <Feature tone="dark">Highlights from StatsThread, when game footage is available</Feature>
              <Feature tone="dark">
                <span className="inline-flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-orange-300" aria-hidden="true" />
                  Coaches Hub:
                </span>{" "}
                scout reports, AI game plans, lineups and impact
              </Feature>
            </ul>
            <div className="mt-auto pt-7 flex flex-wrap items-center gap-3">
              <Link href="/contact-sales?topic=player-page" className="ch-btn h-10 px-4 bg-orange-500 hover:bg-orange-600 text-white">
                Request your page <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/coaches-hub" className="inline-flex items-center min-h-[40px] text-[13px] font-semibold text-white/70 hover:text-white underline-offset-2 hover:underline">
                See the Coaches Hub
              </Link>
            </div>
          </div>
          </Reveal>

          {/* Contact us */}
          <Reveal delay={220} className="h-full">
          <div className="ch-card h-full p-6 md:p-7 flex flex-col" data-testid="plan-contact">
            <div className="flex items-center justify-between">
              <span className="h-11 w-11 rounded-xl flex items-center justify-center bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-md bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]">Contact us</span>
            </div>
            <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-muted)]">Leagues, clubs &amp; organisations</div>
            <h3 className="mt-1 text-xl md:text-[22px] font-semibold tracking-tight text-[color:var(--ch-text)]">Give your league a pro home</h3>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="ch-display text-[2.5rem] font-bold leading-none text-[color:var(--ch-text)]">Custom</span>
              <span className="text-sm text-[color:var(--ch-muted)]">built around you</span>
            </div>
            <ul className="mt-5 space-y-2.5 text-sm text-[color:var(--ch-text-2)]">
              <Feature>Branded league pages with live standings</Feature>
              <Feature>Stats, leaders and team pages for every club</Feature>
              <Feature>Coaches Hub access for your teams</Feature>
              <Feature>Embeddable scores and stats widgets</Feature>
            </ul>
            <div className="mt-auto pt-7">
              <Link href="/contact-sales?topic=league" className="ch-btn ch-btn-ghost h-10 px-4">Contact us <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
          </Reveal>
        </div>

        {/* How players and coaches take ownership of their pages */}
        <Reveal delay={120}>
        <div className="mt-4 md:mt-5 ch-card overflow-hidden grid grid-cols-1 lg:grid-cols-12" data-testid="own-your-page">
          <div className="lg:col-span-7 p-6 md:p-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Own your page</div>
            <h3 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[1.9rem] md:text-[2.3rem] text-[color:var(--ch-text)]">
              It's your career. Run your page.
            </h3>
            <p className="mt-3 text-sm md:text-[15px] text-[color:var(--ch-text-2)] max-w-xl">
              Every player in our leagues already has a page. Request to own yours and, once we've checked it's you, it's yours to manage.
            </p>

            <ol className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { n: "1", t: "Find your page", d: "Search your name — your stats are already there." },
                { n: "2", t: "Request to own it", d: "Tap “Claim this page” on your profile, or ask us here." },
                { n: "3", t: "We verify you", d: "A quick check that it's really you, then it's yours." },
              ].map((step) => (
                <li key={step.n} className="ch-tile p-3.5">
                  <span className="ch-kicker-n text-[color:var(--ch-accent)]">{step.n}</span>
                  <div className="mt-2 text-sm font-semibold text-[color:var(--ch-text)]">{step.t}</div>
                  <div className="mt-1 text-xs text-[color:var(--ch-text-2)] leading-relaxed">{step.d}</div>
                </li>
              ))}
            </ol>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-[color:var(--ch-text-2)]">
              <div className="flex gap-2.5"><Ruler className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--ch-accent)]" />Update your details: height, position and more</div>
              <div className="flex gap-2.5"><ImagePlus className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--ch-accent)]" />Add your own headshot or favourite photo for social posts</div>
              <div className="flex gap-2.5"><Download className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--ch-accent)]" />Access your page's data and download every card</div>
              <div className="flex gap-2.5"><PlayCircle className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--ch-accent)]" />Highlights from StatsThread, when game footage is available</div>
            </div>
            <p className="mt-5 text-sm text-[color:var(--ch-text-2)]">
              <span className="font-semibold text-[color:var(--ch-text)]">Coaches:</span> get your team's pages and the Coaches Hub, so you can prepare for every opponent.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/contact-sales?topic=player-page" className="ch-btn ch-btn-primary h-10 px-4">
                Request your page <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/contact-sales?topic=coach" className="ch-btn ch-btn-ghost h-10 px-4">
                Coaches: get team access
              </Link>
            </div>
          </div>

          {/* What an owned page looks like — an illustration, not a real profile */}
          <div className="lg:col-span-5 p-6 md:p-8 bg-[color:var(--ch-surface-2)] border-t lg:border-t-0 lg:border-l border-[color:var(--ch-border)] flex items-center">
            <div className="w-full max-w-sm mx-auto ch-card overflow-hidden shadow-[var(--ch-shadow-lg)]" aria-hidden="true">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[color:var(--ch-border)]">
                <span className="h-11 w-11 rounded-full flex items-center justify-center ch-display font-bold text-white text-lg" style={{ background: "linear-gradient(135deg, #f97316, #c2410c)" }}>YN</span>
                <div className="min-w-0 flex-1">
                  <div className="ch-display uppercase font-bold tracking-tight leading-none text-lg text-[color:var(--ch-text)]">Your name</div>
                  <div className="mt-1 text-xs text-[color:var(--ch-muted)]">Guard · #7</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="h-3.5 w-3.5" /> Verified
                </span>
              </div>
              <dl className="divide-y divide-[color:var(--ch-border)] text-[13px]">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[color:var(--ch-muted)]">Photo</dt>
                  <dd className="inline-flex items-center gap-1.5 font-medium text-[color:var(--ch-text)]"><ImagePlus className="h-3.5 w-3.5" /> Your headshot</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[color:var(--ch-muted)]">Height · Position</dt>
                  <dd className="font-medium text-[color:var(--ch-text)] tabular-nums">6'4" · Guard</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[color:var(--ch-muted)]">Cards</dt>
                  <dd className="inline-flex items-center gap-1.5 font-medium text-[color:var(--ch-text)]"><Download className="h-3.5 w-3.5" /> Download all</dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <dt className="text-[color:var(--ch-muted)]">Highlights</dt>
                  <dd className="inline-flex items-center gap-1.5 font-medium text-[color:var(--ch-text)]">
                    <img src={StatsThreadLogo} alt="" className="h-4 w-4" /> StatsThread
                  </dd>
                </div>
              </dl>
              <div className="px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--ch-muted)] bg-[color:var(--ch-surface-2)]">Example</div>
            </div>
          </div>
        </div>
        </Reveal>

        <p className="mt-4 text-xs text-[color:var(--ch-muted)]">
          Highlights are provided by{" "}
          <a href={STATSTHREAD_URL} target="_blank" rel="noopener noreferrer" className="font-semibold hover:text-[color:var(--ch-text)] underline-offset-2 hover:underline">StatsThread</a>
          {" "}for games with footage available.
        </p>
      </div>
    </section>
  );
}
