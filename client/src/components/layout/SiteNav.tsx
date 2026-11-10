import type { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { Home, Radio, Newspaper, Trophy, UserPlus, ExternalLink, Clock3, LogIn, ClipboardList, Settings, LayoutDashboard, Share2, BadgeCheck, UserCheck, Landmark, CreditCard, Sparkles, Mail, Moon, Sun, Camera } from "lucide-react"
import { SheetClose } from "@/components/ui/sheet"
import { useAskSwish } from "@/components/ask-swish/AskSwishProvider"
import { ThemeToggle } from "@/components/ThemeToggle"
import { useTheme } from "@/components/ThemeProvider"
import StatsThreadLogo from "@/assets/statsthread-logo.svg"
import { useAuth } from "@/hooks/use-auth"
import { useScores } from "@/lib/scores"
import { useNavLeagues } from "@/lib/navLeagues"
import { claimEntry, useMyClaim, usePendingClaimCount } from "@/lib/playerClaims"
import { compactLogoUrl } from "@/lib/compactLogo"
import { LiveDot } from "@/components/ui/live-dot"

/**
 * The site's navigation list, rendered in two places from one source:
 * a fixed left rail on desktop (SiteHeader, `lg` and up) and the slide-out
 * menu on mobile. Structured after StatMuse's rail — primary pages, then the
 * leagues, then everything else — so the two can never drift apart.
 *
 * `inSheet` wraps internal links in SheetClose so choosing a page on mobile
 * also closes the drawer, rather than leaving it open over the new page.
 *
 * In the rail every row is an icon in a fixed 20px slot followed by its
 * label. Collapsed, the rail is only as wide as that icon column and the
 * labels, badges and section headings fade out; `expanded` (driven by hover
 * or keyboard focus in SiteHeader) fades them back in as the rail widens.
 * Labels stay in the DOM throughout, so screen readers always get the names.
 */

function LiveCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
      <LiveDot />
      {count} live
    </span>
  )
}

/** Opacity classes for anything that only shows while the rail is open. */
function railFade(rail: boolean, expanded: boolean) {
  return rail ? `transition-opacity duration-200 ${expanded ? "opacity-100" : "opacity-0"}` : ""
}

function SectionLabel({ children, rail = false, expanded = true }: { children: ReactNode; rail?: boolean; expanded?: boolean }) {
  return (
    <p className="relative px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-neutral-500 whitespace-nowrap">
      <span className={railFade(rail, expanded)}>{children}</span>
      {/* Collapsed, the heading gives way to a short rule under the icon
          column so the groups still read as groups. */}
      {rail && (
        <span
          aria-hidden="true"
          className={`absolute left-3 top-6 h-px w-5 bg-slate-200 dark:bg-neutral-800 transition-opacity duration-200 ${expanded ? "opacity-0" : "opacity-100"}`}
        />
      )}
    </p>
  )
}

export default function SiteNav({
  inSheet = false,
  layout = "sheet",
  expanded = true,
}: {
  inSheet?: boolean
  layout?: "rail" | "sheet"
  /** Rail only: whether the rail is open wide enough to show labels. */
  expanded?: boolean
}) {
  const rail = layout === "rail"
  const fade = railFade(rail, expanded)
  const { theme, toggleTheme } = useTheme()
  const [location] = useLocation()
  const { user, isAdmin } = useAuth()
  const { data: scores } = useScores()
  const { data: leagues = [] } = useNavLeagues()
  const { data: myClaim } = useMyClaim(user?.id)
  const profileEntry = claimEntry(myClaim)
  const { data: pendingClaims = 0 } = usePendingClaimCount(!!user && isAdmin)
  const { open: openAskSwish, isOpen: askSwishOpen } = useAskSwish()
  const liveCount = scores?.live.length ?? 0

  const itemClass = (active: boolean) =>
    `group/item flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${rail ? "overflow-hidden whitespace-nowrap" : ""} ${
      active
        ? "bg-orange-50 text-orange-700 font-semibold dark:bg-neutral-800 dark:text-white"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
    }`

  // One row's contents: the icon in a fixed slot (so collapsed icons line up
  // in one column), the label, and anything trailing such as a badge. `dot`
  // marks the icon while the rail is collapsed and the trailing badge that
  // normally carries the news (live games, pending claims) is hidden. The
  // dot sits inside a wrapper that does the fading, so an animated dot (the
  // live one) can't override the fade and keep blinking with the rail open.
  const row = (icon: ReactNode, label: ReactNode, opts: { extra?: ReactNode; dot?: ReactNode } = {}) => (
    <>
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        {icon}
        {rail && opts.dot && (
          <span
            aria-hidden="true"
            className={`absolute -right-0.5 -top-0.5 flex h-2 w-2 rounded-full ring-2 ring-white dark:ring-[#0a0a0f] transition-opacity duration-200 ${expanded ? "opacity-0" : "opacity-100"}`}
          >
            {opts.dot}
          </span>
        )}
      </span>
      <span className={`truncate ${fade} ${rail ? "transition-[opacity,transform] group-hover/item:translate-x-0.5" : ""}`}>{label}</span>
      {opts.extra && <span className={`ml-auto flex shrink-0 items-center ${fade}`}>{opts.extra}</span>}
    </>
  )

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
    // The rail's 10px side padding plus each row's 12px puts the 20px icon
    // slot dead centre of the 64px collapsed rail.
    <nav aria-label="Site" className={`flex flex-col gap-0.5 ${rail ? "flex-1 px-2.5 py-3" : "p-3"}`}>
      {internalLink("/", location === "/", row(<Home className="h-4 w-4" aria-hidden="true" />, "Home"))}
      {internalLink("/scores", location.startsWith("/scores"), row(
        <Radio className="h-4 w-4" aria-hidden="true" />,
        "Scores",
        liveCount > 0 ? { extra: <LiveCount count={liveCount} />, dot: <LiveDot className="h-full w-full" /> } : {},
      ))}
      {internalLink("/news", location.startsWith("/news"), row(<Newspaper className="h-4 w-4" aria-hidden="true" />, "News"))}
      {/* Opens the assistant over the current page; on the /ask page itself
          the entry is the page, so it just reads as active. */}
      {(() => {
        const onAskPage = location.startsWith("/ask")
        const button = (
          <button
            type="button"
            onClick={() => { if (!onAskPage) openAskSwish() }}
            aria-current={onAskPage ? "page" : undefined}
            data-testid="nav-ask-swish"
            className={`${itemClass(onAskPage || askSwishOpen)} w-full text-left`}
          >
            {row(<Sparkles className="h-4 w-4 text-orange-500" aria-hidden="true" />, "Ask Swish", {
              extra: (
                <span className="whitespace-nowrap rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                  New
                </span>
              ),
            })}
          </button>
        )
        return inSheet ? <SheetClose asChild>{button}</SheetClose> : button
      })()}
      {internalLink("/british-basketball-history", location.startsWith("/british-basketball-history"), row(
        <Landmark className="h-4 w-4" aria-hidden="true" />,
        "History",
        {
          extra: (
            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
              Soon
            </span>
          ),
        },
      ))}
      {internalLink("/media", location.startsWith("/media"), row(<Camera className="h-4 w-4" aria-hidden="true" />, "Media Spotlight"))}

      {leagues.length > 0 && (
        <>
          <SectionLabel rail={rail} expanded={expanded}>Leagues</SectionLabel>
          {leagues.map((l) => internalLink(l.href, location.startsWith(l.href), row(
            <span className="h-5 w-5 rounded bg-white/95 overflow-hidden flex items-center justify-center">
              {l.logoUrl
                ? <img src={compactLogoUrl(l.logoUrl)} alt="" className="h-full w-full object-contain" />
                : <Trophy className="h-3 w-3 text-orange-500" aria-hidden="true" />}
            </span>,
            l.label,
          ), l.key))}
        </>
      )}

      <div className={`flex flex-col gap-0.5 ${rail ? "mt-auto pt-2" : ""}`}>
      <SectionLabel rail={rail} expanded={expanded}>Account</SectionLabel>
      {user ? (
        <>
          {/* These were buttons in the league page's own header; that header
              is replaced by this shared one, so they live here now — and are
              reachable from every page, not just league pages. */}
          {internalLink("/dashboard", location.startsWith("/dashboard"), row(<LayoutDashboard className="h-4 w-4" aria-hidden="true" />, "Dashboard"), "dashboard")}
          {/* Claim → pending → owned: one entry that follows the player's claim. */}
          {internalLink(
            profileEntry.href,
            location.startsWith("/claim") || location.startsWith("/my-profile") || location === profileEntry.href,
            row(<BadgeCheck className="h-4 w-4" aria-hidden="true" />, profileEntry.label),
            "player-profile",
          )}
          {internalLink("/coaches-hub", location.startsWith("/coaches-hub"), row(<ClipboardList className="h-4 w-4" aria-hidden="true" />, "Coaches Hub"), "coaches-hub")}
          {internalLink("/league-management", location.startsWith("/league-management"), row(<Settings className="h-4 w-4" aria-hidden="true" />, "League Admin"), "league-admin")}
          {/* /social-tools is admin-only, so only admins get the shortcut;
              everyone else sees the locked card on the dashboard. */}
          {isAdmin && internalLink("/social-tools", location.startsWith("/social-tools"), row(<Share2 className="h-4 w-4" aria-hidden="true" />, "Swish Social"), "swish-social")}
          {isAdmin && internalLink("/admin/player-claims", location.startsWith("/admin/player-claims"), row(
            <UserCheck className="h-4 w-4" aria-hidden="true" />,
            "Player Claims",
            pendingClaims > 0
              ? {
                  extra: (
                    <span
                      className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-orange-500 px-1.5 text-[11px] font-semibold leading-5 text-white"
                      aria-label={`${pendingClaims} pending`}
                    >
                      {pendingClaims}
                    </span>
                  ),
                  dot: <span className="h-full w-full rounded-full bg-orange-500" />,
                }
              : {},
          ), "player-claims")}
          {isAdmin && internalLink("/admin/coach-access", location.startsWith("/admin/coach-access"), row(<CreditCard className="h-4 w-4" aria-hidden="true" />, "Coach Access"), "coach-access")}
          {isAdmin && internalLink("/admin/game-times", location.startsWith("/admin/game-times"), row(<Clock3 className="h-4 w-4" aria-hidden="true" />, "Game Times"), "game-times")}
        </>
      ) : (
        <>
          <a href="/auth" data-testid="sidebar-login" className={itemClass(false)}>
            {row(<LogIn className="h-4 w-4" aria-hidden="true" />, "Login")}
          </a>
          <a href="/auth?tab=register" className={`${itemClass(false)} !text-orange-600 dark:!text-orange-400`}>
            {row(<UserPlus className="h-4 w-4" aria-hidden="true" />, "Register free")}
          </a>
        </>
      )}
      {rail ? (
        // The toggle as a full row, so it keeps its place in the icon column
        // when the rail is collapsed.
        <button
          type="button"
          onClick={toggleTheme}
          data-testid="theme-toggle"
          className={`${itemClass(false)} w-full text-left`}
        >
          {row(
            theme === "light"
              ? <Moon className="h-4 w-4" aria-hidden="true" />
              : <Sun className="h-4 w-4 text-yellow-400" aria-hidden="true" />,
            theme === "light" ? "Dark mode" : "Light mode",
          )}
        </button>
      ) : (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-md text-sm text-slate-600 dark:text-neutral-300">
          <span>Theme</span>
          <ThemeToggle />
        </div>
      )}

      <SectionLabel rail={rail} expanded={expanded}>More from Swish</SectionLabel>
      {rail ? (
        <a
          href="https://www.statsthread.co.uk"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="sidebar-statsthread"
          className={itemClass(false)}
        >
          {row(
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#0A0E15] p-0.5">
              <img src={StatsThreadLogo} alt="" className="h-full w-full" aria-hidden="true" />
            </span>,
            "StatsThread",
            { extra: <ExternalLink className="h-3.5 w-3.5 text-[#1B8FA3] dark:text-[#62D4E8]" aria-hidden="true" /> },
          )}
        </a>
      ) : (
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
      )}
      <div
        aria-disabled="true"
        title="SwishStats is coming soon"
        data-testid="sidebar-swishstats-coming-soon"
        className={`flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 dark:text-neutral-500 ${rail ? "overflow-hidden whitespace-nowrap" : ""}`}
      >
        {row(<Clock3 className="h-4 w-4" aria-hidden="true" />, "SwishStats", {
          extra: (
            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
              Coming soon
            </span>
          ),
        })}
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
        className={
          rail
            // Collapsed this is an orange square holding the envelope; open,
            // the same gradient button as before with its label.
            ? "group/item mt-3 flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-md bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-2 text-sm font-semibold text-white hover:shadow-lg transition-shadow"
            : "mt-3 text-center bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2.5 rounded-md font-semibold hover:shadow-lg transition-all"
        }
      >
        {rail ? row(<Mail className="h-4 w-4" aria-hidden="true" />, "Subscribe") : "Subscribe"}
      </a>
      </div>
    </nav>
  )
}
