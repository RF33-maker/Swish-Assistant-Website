import { useLocation } from "wouter"
import SwishLogo from "@/assets/Swish Assistant Logo.png"
import { Search, Trophy, Menu } from "lucide-react"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { TeamLogo } from "@/components/TeamLogo"
import { useGlobalSearch } from "@/hooks/useGlobalSearch"
import { PlayerSearchAvatar } from "@/components/PlayerSearchAvatar"
import SiteNav from "@/components/layout/SiteNav"

/**
 * The public site header and navigation.
 *
 * Desktop (lg and up): a fixed left rail holding the logo and SiteNav, in the
 * style of StatMuse, with the search across the top of the content. Mobile:
 * the same SiteNav lives in the slide-out menu behind the hamburger.
 *
 * Layout contract — the rail is position: fixed, so any page rendering this
 * header must offset its own content by the rail's width with
 * SITE_RAIL_OFFSET on its root element, or the rail will cover it.
 *
 * `hideSearch` swaps the header search for the Swish logo, centred. The
 * homepage uses it because it has its own, bigger search further down; every
 * other page keeps the search here for navigation.
 */
export const SITE_RAIL_OFFSET = "lg:pl-60"

export default function SiteHeader({ hideSearch = false }: { hideSearch?: boolean } = {}) {
  const [, setLocation] = useLocation()
  const { query, setQuery, suggestions, handleSelect, handleSubmit } = useGlobalSearch()

  return (
    <>
      <aside
        aria-label="Site navigation"
        className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col bg-white dark:bg-[#0a0a0f] border-r border-slate-200 dark:border-neutral-800 overflow-y-auto"
      >
        <button
          type="button"
          aria-label="Go to home"
          onClick={() => setLocation('/')}
          className="flex h-[65px] shrink-0 items-center gap-2 px-6 border-b border-slate-200 dark:border-neutral-800 hover:opacity-90 transition-opacity"
        >
          <img src={SwishLogo} alt="" className="h-8" />
          <span className="font-semibold text-slate-900 dark:text-white">Swish Assistant</span>
        </button>
        <SiteNav layout="rail" />
      </aside>

      {/* Brand line across the very top. On desktop it's fixed and full-width
          so it runs over the rail as well as the content; in-flow on mobile. */}
      <div className="lg:hidden h-[1px] bg-gradient-to-r from-orange-400 to-amber-400"></div>
      <div className="hidden lg:block fixed top-0 inset-x-0 z-50 h-[1px] bg-gradient-to-r from-orange-400 to-amber-400"></div>

      <header className="bg-white dark:bg-[#0a0a0f] border-b border-slate-200 dark:border-neutral-800">
        {/* Fixed height on desktop so this bottom border meets the rail's logo
            row border in one continuous line. The rail row is 65px because its
            border is inside its box, while this one sits outside the 64px row. */}
        <div className="w-full flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3 lg:py-0 lg:h-16">
          {hideSearch ? (
            <>
              {/* Mobile: balances the menu button so the logo sits dead centre. */}
              <span className="lg:hidden h-10 w-10 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 flex justify-center">
                <button
                  type="button"
                  aria-label="Swish Assistant home"
                  onClick={() => setLocation('/')}
                  className="flex items-center hover:opacity-90 transition-opacity"
                  data-testid="header-logo-home"
                >
                  <img src={SwishLogo} alt="" className="h-9 md:h-10" />
                </button>
              </div>
            </>
          ) : (
          <>
          {/* On desktop the logo sits at the top of the rail instead. */}
          <button
            type="button"
            aria-label="Go to home"
            onClick={() => setLocation('/')}
            className="flex lg:hidden items-center flex-shrink-0 hover:opacity-90 transition-opacity"
            data-testid="header-logo-home"
          >
            <img src={SwishLogo} alt="Swish Logo" className="h-9 md:h-10" />
          </button>

          <div className="flex-1 flex justify-center relative">
            <div className="w-full max-w-xl md:max-w-2xl relative">
            <div className="search-bar-animated-border dark:!bg-[#0a0a0f]">
              <form
                onSubmit={handleSubmit}
                className="flex items-center bg-slate-100 dark:bg-neutral-900 rounded-full overflow-hidden relative z-10"
              >
                <Search className="ml-3 md:ml-4 h-4 w-4 md:h-5 md:w-5 text-slate-400 dark:text-neutral-400 flex-shrink-0" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search league, team or player"
                  className="flex-1 min-w-0 px-3 py-2 md:py-2.5 text-sm md:text-base text-slate-900 dark:text-white bg-transparent placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none"
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

          </>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                data-testid="sidebar-trigger"
                className="inline-flex lg:hidden items-center justify-center h-10 w-10 flex-shrink-0 rounded-md text-slate-700 hover:bg-slate-100 dark:text-white dark:hover:bg-neutral-800 transition-colors"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 bg-white text-slate-900 border-l border-slate-200 dark:bg-neutral-950 dark:text-white dark:border-neutral-800 p-0 overflow-y-auto">
              <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-neutral-800">
                <img src={SwishLogo} alt="Swish Logo" className="h-8" />
                <span className="font-semibold">Swish Assistant</span>
              </div>
              <SiteNav inSheet />
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  )
}
