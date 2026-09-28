import { useLocation } from "wouter"
import SwishLogo from "@/assets/Swish Assistant Logo.png"
import StatsThreadLogo from "@/assets/statsthread-logo.svg"
import { Search, Trophy, Menu, UserPlus, ExternalLink, Clock3 } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { ThemeToggle } from "@/components/ThemeToggle"
import { TeamLogo } from "@/components/TeamLogo"
import { useGlobalSearch } from "@/hooks/useGlobalSearch"
import { PlayerSearchAvatar } from "@/components/PlayerSearchAvatar"
import { useAuth } from "@/hooks/use-auth"
import { useScores } from "@/lib/scores"

/**
 * The public site header: logo, global search, slide-out menu, and a slim
 * Home / Scores strip underneath.
 *
 * Lifted out of the homepage so /scores (and any other public page) gets the
 * same search and menu instead of a bare logo that was the only way off the
 * page. The nav strip is its own row rather than a button beside the search,
 * because on a phone there isn't room for both without crushing the search.
 */

function LiveCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      {count} live
    </span>
  )
}

const NAV_ITEMS = [
  { href: "/", label: "Home", match: (path: string) => path === "/" },
  { href: "/scores", label: "Scores", match: (path: string) => path.startsWith("/scores") },
] as const

export default function SiteHeader() {
  const [location, setLocation] = useLocation()
  const { query, setQuery, suggestions, handleSelect, handleSubmit } = useGlobalSearch()
  const { user } = useAuth()
  // Shares the Scores page's cached query, so this costs nothing extra there.
  const { data: scores } = useScores()
  const liveCount = scores?.live.length ?? 0

  return (
    <>
    {/* Gradient Top Border */}
    <div className="h-[1px] bg-gradient-to-r from-orange-400 to-amber-400"></div>

    {/* Top header: logo (clickable home) + search bar + hamburger sidebar trigger */}
    <header className="bg-[#0a0a0f] border-b border-neutral-800">
      <div className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3">
        <button
          type="button"
          aria-label="Go to home"
          onClick={() => setLocation('/')}
          className="flex items-center flex-shrink-0 hover:opacity-90 transition-opacity"
          data-testid="header-logo-home"
        >
          <img src={SwishLogo} alt="Swish Logo" className="h-9 md:h-10" />
        </button>

        <div className="flex-1 flex justify-center relative">
          <div className="w-full max-w-xl md:max-w-2xl relative">
          <div className="search-bar-animated-border" style={{ background: '#0a0a0f' }}>
            <form
              onSubmit={handleSubmit}
              className="flex items-center bg-neutral-900 rounded-full overflow-hidden relative z-10"
            >
              <Search className="ml-3 md:ml-4 h-4 w-4 md:h-5 md:w-5 text-neutral-400 flex-shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search league, team or player"
                className="flex-1 min-w-0 px-3 py-2 md:py-2.5 text-sm md:text-base text-white bg-transparent placeholder:text-neutral-500 focus:outline-none"
                data-testid="header-search-input"
              />
            </form>
          </div>

          {suggestions.length > 0 && (
            <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-neutral-900 border border-orange-200 dark:border-neutral-700 rounded-md shadow-lg max-h-72 overflow-y-auto">
              {suggestions.map((item, index) => (
                <li
                  key={index}
                  onClick={() => handleSelect(item)}
                  className="px-4 py-2.5 cursor-pointer hover:bg-orange-50 dark:hover:bg-neutral-800 text-left border-b border-orange-100 dark:border-neutral-800 last:border-b-0 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3">
                    {item.type === 'competition' ? (
                      item.logo_url ? (
                        <div className="h-8 w-8 rounded-full bg-white dark:bg-neutral-800 border border-orange-200 dark:border-neutral-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                          <img src={item.logo_url} alt={item.name} className="h-7 w-7 object-contain" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center flex-shrink-0">
                          <Trophy className="h-4 w-4 text-white" />
                        </div>
                      )
                    ) : item.type === 'league' ? (
                      item.logo_url ? (
                        <div className="h-8 w-8 rounded-full bg-white dark:bg-neutral-800 border border-orange-200 dark:border-neutral-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                          <img src={item.logo_url} alt={item.name} className="h-7 w-7 object-contain" />
                        </div>
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-300 to-orange-400 flex items-center justify-center flex-shrink-0">
                          <Trophy className="h-4 w-4 text-white" />
                        </div>
                      )
                    ) : item.type === 'team' ? (
                      <div className="h-8 w-8 rounded-full bg-white dark:bg-neutral-800 border border-orange-200 dark:border-neutral-600 flex items-center justify-center overflow-hidden flex-shrink-0">
                        <TeamLogo teamName={item.name} leagueId={item.league_id} size="sm" />
                      </div>
                    ) : (
                      <PlayerSearchAvatar name={item.name} photoUrl={item.photo_url} />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-orange-900 dark:text-orange-300 text-sm truncate">{item.name}</div>
                      {item.type === 'player' && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 truncate">{item.team}</div>
                      )}
                      {item.type === 'team' && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 truncate">{item.league_name}</div>
                      )}
                      {item.type === 'league' && (
                        <div className="text-xs text-orange-600 dark:text-orange-400">League</div>
                      )}
                    </div>
                    <div className="text-xs text-orange-700 dark:text-orange-300 capitalize bg-orange-100 dark:bg-orange-900/50 px-2 py-1 rounded-full font-medium flex-shrink-0">
                      {item.type}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              data-testid="sidebar-trigger"
              className="inline-flex items-center justify-center h-10 w-10 flex-shrink-0 rounded-md text-white hover:bg-neutral-800 transition-colors"
            >
              <Menu className="h-6 w-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-neutral-950 text-white border-l border-neutral-800 p-0">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-neutral-800">
              <img src={SwishLogo} alt="Swish Logo" className="h-8" />
              <span className="font-semibold">Swish Assistant</span>
            </div>
            <nav className="flex flex-col p-3 gap-1">
              <a
                href="/scores"
                className="flex items-center justify-between px-3 py-2 rounded-md text-sm font-semibold hover:bg-neutral-900 transition-colors"
              >
                <span>Scores</span>
                {liveCount > 0 && <LiveCount count={liveCount} />}
              </a>
              <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-neutral-900">
                <span className="text-sm">Theme</span>
                <ThemeToggle />
              </div>
              <a
                href="/auth"
                data-testid="sidebar-login"
                className="px-3 py-2 rounded-md text-sm hover:bg-neutral-900 transition-colors"
              >
                Login
              </a>
              {!user && (
                <a
                  href="/auth?tab=register"
                  className="px-3 py-2 rounded-md text-sm text-orange-400 hover:bg-neutral-900 transition-colors flex items-center gap-2"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Register free
                </a>
              )}
              <div className="mt-2 border-t border-neutral-800 pt-2">
                <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  More from Swish
                </p>
                <a
                  href="https://www.statsthread.co.uk"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="sidebar-statsthread"
                  className="group flex items-center gap-2.5 rounded-lg border border-[#62D4E8]/35 bg-[#62D4E8]/10 px-3 py-2.5 text-sm font-semibold text-[#E6ECF2] transition-colors hover:border-[#62D4E8] hover:bg-[#62D4E8] hover:text-[#04222A] focus:outline-none focus:ring-2 focus:ring-[#62D4E8]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#62D4E8]/30 bg-[#0A0E15] p-1">
                    <img src={StatsThreadLogo} alt="" className="h-full w-full" aria-hidden="true" />
                  </span>
                  <span className="flex-1">StatsThread</span>
                  <ExternalLink className="h-3.5 w-3.5 text-[#62D4E8] transition-colors group-hover:text-[#04222A]" aria-hidden="true" />
                </a>
                <div
                  aria-disabled="true"
                  title="SwishStats is coming soon"
                  data-testid="sidebar-swishstats-coming-soon"
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-500"
                >
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  <span className="flex-1">SwishStats</span>
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Coming soon
                  </span>
                </div>
              </div>
              <a
                href="#subscribe"
                data-testid="sidebar-subscribe"
                onClick={(e) => {
                  e.preventDefault();
                  // The signup form only exists on the homepage.
                  const target = document.getElementById('subscribe');
                  if (target) target.scrollIntoView({ behavior: 'smooth' });
                  else window.location.href = '/#subscribe';
                }}
                className="mt-2 text-center bg-gradient-to-r from-orange-500 to-amber-500 text-white px-4 py-2.5 rounded-md font-semibold hover:shadow-lg transition-all"
              >
                Subscribe
              </a>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>

      <nav aria-label="Primary" className="bg-[#0a0a0f] border-b border-neutral-800">
        <div className="flex items-center gap-1 px-4 md:px-6">
          {NAV_ITEMS.map((item) => {
            const active = item.match(location)
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => { e.preventDefault(); setLocation(item.href) }}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active ? "text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {item.label}
                {item.href === "/scores" && liveCount > 0 && <LiveCount count={liveCount} />}
                {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-orange-500" />}
              </a>
            )
          })}
        </div>
      </nav>
    </>
  )
}
