import type { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { Home, Radio, Newspaper, Trophy, UserPlus, ExternalLink, Clock3, LogIn, ClipboardList, Settings } from "lucide-react"
import { SheetClose } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/ThemeToggle"
import StatsThreadLogo from "@/assets/statsthread-logo.svg"
import { useAuth } from "@/hooks/use-auth"
import { useScores } from "@/lib/scores"
import { useNavLeagues } from "@/lib/navLeagues"

/**
 * The site's navigation list, rendered in two places from one source:
 * a fixed left rail on desktop (SiteHeader, `lg` and up) and the slide-out
 * menu on mobile. Structured after StatMuse's rail — primary pages, then the
 * leagues, then everything else — so the two can never drift apart.
 *
 * `inSheet` wraps internal links in SheetClose so choosing a page on mobile
 * also closes the drawer, rather than leaving it open over the new page.
 */

function LiveCount({ count }: { count: number }) {
  return (
    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      {count} live
    </span>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500">
      {children}
    </p>
  )
}

export default function SiteNav({ inSheet = false, layout = "sheet" }: { inSheet?: boolean; layout?: "rail" | "sheet" }) {
  const [location] = useLocation()
  const { user } = useAuth()
  const { data: scores } = useScores()
  const { data: leagues = [] } = useNavLeagues()
  const liveCount = scores?.live.length ?? 0

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      active
        ? "bg-orange-50 text-orange-700 font-semibold dark:bg-neutral-800 dark:text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
    }`

  // A plain function rather than a component defined in render: a nested
  // component gets a new identity every render, so each 30-second scores
  // poll would unmount and remount every link in the nav.
  const internalLink = (href: string, active: boolean, children: ReactNode, key?: string) => {
    const link = (
      <Link key={inSheet ? undefined : key} href={href} aria-current={active ? "page" : undefined} className={itemClass(active)}>
        {children}
      </Link>
    )
    return inSheet ? <SheetClose key={key} asChild>{link}</SheetClose> : link
  }

  return (
    // In the rail the nav fills the column and the account / More from Swish /
    // Subscribe group is pushed to the bottom, so the rail reads as anchored
    // top and bottom instead of stopping partway down with blank space below.
    <nav aria-label="Site" className={`flex flex-col p-3 gap-0.5 ${layout === "rail" ? "flex-1" : ""}`}>
      {internalLink("/", location === "/", <>
        <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
        Home
      </>)}
      {internalLink("/scores", location.startsWith("/scores"), <>
        <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
        Scores
        {liveCount > 0 && <LiveCount count={liveCount} />}
      </>)}
      {internalLink("/news", location.startsWith("/news"), <>
        <Newspaper className="h-4 w-4 shrink-0" aria-hidden="true" />
        News
      </>)}

      {leagues.length > 0 && (
        <>
          <SectionLabel>Leagues</SectionLabel>
          {leagues.map((l) => internalLink(l.href, location.startsWith(l.href), <>
            <span className="h-5 w-5 shrink-0 rounded bg-white/95 overflow-hidden flex items-center justify-center">
              {l.logoUrl
                ? <img src={l.logoUrl} alt="" className="h-full w-full object-contain" />
                : <Trophy className="h-3 w-3 text-orange-500" aria-hidden="true" />}
            </span>
            <span className="truncate">{l.label}</span>
          </>, l.key))}
        </>
      )}

      <div className={`flex flex-col gap-0.5 ${layout === "rail" ? "mt-auto pt-2" : ""}`}>
      <SectionLabel>Account</SectionLabel>
      {user ? (
        <>
          {/* These were buttons in the league page's own header; that header
              is replaced by this shared one, so they live here now — and are
              reachable from every page, not just league pages. */}
          {internalLink("/coaches-hub", location.startsWith("/coaches-hub"), <>
            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
            Coaches Hub
          </>, "coaches-hub")}
          {internalLink("/league-management", location.startsWith("/league-management"), <>
            <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
            League Admin
          </>, "league-admin")}
        </>
      ) : (
        <>
          <a href="/auth" data-testid="sidebar-login" className={itemClass(false)}>
            <LogIn className="h-4 w-4 shrink-0" aria-hidden="true" />
            Login
          </a>
          <a href="/auth?tab=register" className={`${itemClass(false)} !text-orange-600 dark:!text-orange-400`}>
            <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            Register free
          </a>
        </>
      )}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-md text-sm text-slate-600 dark:text-neutral-300">
        <span>Theme</span>
        <ThemeToggle />
      </div>

      <SectionLabel>More from Swish</SectionLabel>
      <a
        href="https://www.statsthread.co.uk"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="sidebar-statsthread"
        className="group flex items-center gap-2.5 rounded-lg border border-[#62D4E8]/35 bg-[#62D4E8]/10 px-3 py-2.5 text-sm font-semibold text-[#0B4A57] dark:text-[#E6ECF2] transition-colors hover:border-[#62D4E8] hover:bg-[#62D4E8] hover:text-[#04222A] focus:outline-none focus:ring-2 focus:ring-[#62D4E8]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#62D4E8]/30 bg-[#0A0E15] p-1">
          <img src={StatsThreadLogo} alt="" className="h-full w-full" aria-hidden="true" />
        </span>
        <span className="flex-1">StatsThread</span>
        <ExternalLink className="h-3.5 w-3.5 text-[#1B8FA3] dark:text-[#62D4E8] transition-colors group-hover:text-[#04222A]" aria-hidden="true" />
      </a>
      <div
        aria-disabled="true"
        title="SwishStats is coming soon"
        data-testid="sidebar-swishstats-coming-soon"
        className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-400 dark:text-neutral-500"
      >
        <Clock3 className="h-4 w-4" aria-hidden="true" />
        <span className="flex-1">SwishStats</span>
        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          Coming soon
        </span>
      </div>
      <a
        href="#subscribe"
        data-testid="sidebar-subscribe"
        onClick={(e) => {
          e.preventDefault()
          // The signup form only exists on the homepage.
          const target = document.getElementById("subscribe")
          if (target) target.scrollIntoView({ behavior: "smooth" })
          else window.location.href = "/#subscribe"
        }}
        className="mt-3 text-center bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2.5 rounded-md font-semibold hover:shadow-lg transition-all"
      >
        Subscribe
      </a>
      </div>
    </nav>
  )
}
