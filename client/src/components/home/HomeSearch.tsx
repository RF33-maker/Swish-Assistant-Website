import { useEffect, useRef, useState } from "react";
import { Search, Trophy } from "lucide-react";
import { useGlobalSearch, type SearchSuggestion } from "@/hooks/useGlobalSearch";
import { TeamLogo } from "@/components/TeamLogo";
import { PlayerSearchAvatar } from "@/components/PlayerSearchAvatar";

/**
 * The homepage's search-first box (StatMuse-style): one big field that goes
 * straight to any player, team or league, using the same global search as
 * the site header.
 */
export default function HomeSearch() {
  const { query, setQuery, suggestions, handleSelect, handleSubmit } = useGlobalSearch();
  const [focused, setFocused] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close the suggestion list when a click lands outside the search box.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const open = focused && suggestions.length > 0;

  return (
    <div ref={boxRef} className="relative z-20 w-full">
      <form
        onSubmit={handleSubmit}
        role="search"
        className="ch-search-glow flex items-center gap-3 h-14 md:h-[60px] pl-5 pr-2 rounded-2xl bg-[color:var(--ch-surface)] border border-[color:var(--ch-border-strong)] shadow-[var(--ch-shadow)] focus-within:border-[color:var(--ch-accent)] focus-within:shadow-[0_0_0_4px_var(--ch-accent-soft)] transition-shadow"
      >
        <Search className="h-5 w-5 text-[color:var(--ch-muted)] shrink-0" aria-hidden="true" />
        <label htmlFor="home-search" className="sr-only">Search for a player, team or league</label>
        <input
          id="home-search"
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search any player, team or league"
          className="flex-1 min-w-0 bg-transparent text-[16px] md:text-[17px] text-[color:var(--ch-text)] placeholder:text-[color:var(--ch-muted)] focus:outline-none"
          data-testid="home-search-input"
        />
        <button
          type="submit"
          className="hidden sm:inline-flex items-center h-10 md:h-11 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
        >
          Search
        </button>
      </form>

      {open && (
        <ul
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-2 max-h-80 overflow-y-auto ch-card shadow-[var(--ch-shadow-lg)] p-1.5 text-left"
        >
          {suggestions.map((item: SearchSuggestion, index: number) => (
            <li
              key={index}
              role="option"
              aria-selected={false}
              onClick={() => handleSelect(item)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-[color:var(--ch-surface-3)] transition-colors"
            >
              {item.type === "league" || item.type === "competition" ? (
                item.logo_url ? (
                  <span className="h-9 w-9 rounded-lg bg-white ring-1 ring-black/5 flex items-center justify-center overflow-hidden shrink-0">
                    <img src={item.logo_url} alt="" className="h-7 w-7 object-contain" />
                  </span>
                ) : (
                  <span className="h-9 w-9 rounded-lg ch-tile flex items-center justify-center shrink-0">
                    <Trophy className="h-4 w-4 text-orange-500" />
                  </span>
                )
              ) : item.type === "team" ? (
                <span className="h-9 w-9 rounded-lg bg-white ring-1 ring-black/5 flex items-center justify-center overflow-hidden shrink-0">
                  <TeamLogo teamName={item.name} leagueId={item.league_id} size="sm" />
                </span>
              ) : (
                <PlayerSearchAvatar name={item.name} photoUrl={item.photo_url} />
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-[color:var(--ch-text)] truncate">{item.name}</span>
                <span className="block text-xs text-[color:var(--ch-muted)] truncate">
                  {item.type === "player" ? item.team : item.type === "team" ? item.league_name : "League"}
                </span>
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)] bg-[color:var(--ch-surface-3)] px-1.5 py-0.5 rounded shrink-0">
                {item.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
