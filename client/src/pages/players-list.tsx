import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ArrowRight, BadgeCheck, ChevronRight, Loader2, Search, Users, X } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import TrendingPerformanceSection from "@/components/home/TrendingPerformanceSection";
import { supabase } from "@/lib/supabase";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import { areSamePlayer } from "@/hooks/useGlobalSearch";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";

const SITE_URL = "https://swishassistant.com";
const MIN_QUERY = 2;

type PlayerRow = {
  id: string;
  full_name: string;
  slug: string | null;
  photo_path: string | null;
  photo_path_bg_removed: string | null;
  league_id: string | null;
  team_name: string | null;
  current_team: string | null;
};

type PlayerResult = {
  key: string;
  name: string;
  href: string;
  team: string | null;
  leagueId: string | null;
  photo: string | null;
};

const fold = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function initials(name: string) {
  const words = fold(name).replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

// Placeholder sides from youth events ("14U Team 2", "Team", "1") say
// nothing about who a player is, so they count as no team.
const isPlaceholderTeam = (name: string) =>
  /^\d+$/.test(name) ||
  name.includes(":") ||
  /^team(\s+\d+)?$/i.test(name) ||
  /^(team\s+)?(black|white|red|blue|green|gold|diamond)$/i.test(name) ||
  /^(u\d{1,2}|\d{1,2}u|\d{1,2}\+)\s+team\b/i.test(name);

const teamOf = (row: PlayerRow) => {
  const team = (row.current_team || row.team_name || "").trim();
  return team && !isPlaceholderTeam(team) ? team : null;
};

// "Manchester Magic Senior Men I" is "Manchester Magic", as on /teams.
const clubName = (team: string) =>
  team.replace(/\s+Senior\s+Men\b/i, "").replace(/\s+Senior\s+Women\b/i, " Women").replace(/\s+I$/, "").trim();
const sameTeam = (a: string | null, b: string | null) =>
  !a || !b || fold(clubName(a)).replace(/[^a-z0-9]/g, "") === fold(clubName(b)).replace(/[^a-z0-9]/g, "");

async function searchPlayers(term: string): Promise<PlayerResult[]> {
  const safe = term.replace(/[%_\\]/g, "").trim();
  const { data, error } = await supabase
    .from("players")
    .select("id, full_name, slug, photo_path, photo_path_bg_removed, league_id, team_name, current_team")
    .ilike("full_name", `%${safe}%`)
    .order("full_name")
    .limit(60);
  if (error) throw new Error(error.message);

  // A player has a row per competition; list them once. Rows sharing a
  // profile are one player; otherwise names are matched as the header search
  // does, keeping namesakes on different teams apart.
  const groups: PlayerRow[][] = [];
  for (const row of (data || []) as PlayerRow[]) {
    const group = groups.find((g) =>
      g.some((p) =>
        (!!row.slug && p.slug === row.slug) ||
        (areSamePlayer(p.full_name, row.full_name) && sameTeam(teamOf(p), teamOf(row))),
      ),
    );
    if (group) group.push(row);
    else groups.push([row]);
  }

  // Names with a word starting with the search come before mid-word matches.
  const q = fold(safe);
  const rank = (name: string) => (fold(name).split(/[\s-]+/).some((w) => w.startsWith(q)) ? 0 : 1);

  return groups
    .map((group) => {
      // The fullest spelling of the name, and a photo if any row has one.
      const best = [...group].sort((a, b) =>
        Number(!!b.slug) - Number(!!a.slug) || b.full_name.length - a.full_name.length,
      )[0];
      const photoPath = group.find((p) => p.photo_path)?.photo_path || group.find((p) => p.photo_path_bg_removed)?.photo_path_bg_removed || null;
      const team = teamOf(best) || group.map(teamOf).find(Boolean) || null;
      return {
        key: String(best.id),
        name: best.full_name,
        href: `/player/${best.slug || best.id}`,
        team: team ? clubName(team) : null,
        leagueId: best.league_id,
        photo: photoPath ? getPlayerPhotoUrlCached(photoPath) : null,
      };
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

// The competition each result plays in, as shown on cards elsewhere.
async function fetchCompetitionNames(ids: string[]): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 20) {
    const res = await fetch(`/api/competition-display?ids=${ids.slice(i, i + 20).join(",")}`);
    if (!res.ok) continue;
    const body = (await res.json()) as Record<string, { name: string | null }>;
    for (const [id, value] of Object.entries(body)) if (value?.name) names[id] = value.name;
  }
  return names;
}

function PlayerAvatar({ name, photo }: { name: string; photo: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="h-12 w-12 shrink-0 rounded-full ch-tile overflow-hidden flex items-center justify-center">
      {photo && !failed ? (
        <PlayerHeadshot src={photo} alt="" loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" fallbackClassName="object-top" />
      ) : (
        <span className="ch-display font-bold text-[17px] tracking-tight text-[color:var(--ch-text-2)]">{initials(name)}</span>
      )}
    </span>
  );
}

function PlayerCard({ player, competition }: { player: PlayerResult; competition?: string }) {
  return (
    <Link href={player.href} className="ch-card ch-hover group flex items-center gap-3.5 p-3.5 md:p-4 min-w-0" data-testid="player-search-result">
      <PlayerAvatar name={player.name} photo={player.photo} />
      <span className="min-w-0 flex-1">
        <span className="block ch-display uppercase font-bold tracking-tight leading-none text-[1.15rem] md:text-[1.25rem] text-[color:var(--ch-text)] truncate">
          {player.name}
        </span>
        <span className="mt-1 block text-xs text-[color:var(--ch-text-2)] truncate">{player.team || "Team not listed"}</span>
        {competition && <span className="mt-0.5 block text-[11px] text-[color:var(--ch-muted)] truncate">{competition}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ch-muted)] group-hover:text-[color:var(--ch-accent)] transition-colors" aria-hidden="true" />
    </Link>
  );
}

/**
 * /players — find any player by name, with the week's standout performances
 * underneath for anyone just browsing.
 */
export default function PlayersListPage() {
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [term, setTerm] = useState(query.trim());

  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Keep the search in the address, so results can be shared or revisited.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (term) url.searchParams.set("q", term);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [term]);

  const searching = term.length >= MIN_QUERY;
  const { data: results = [], isLoading, isFetching, isError } = useQuery({
    queryKey: ["players-directory", "search", term],
    queryFn: () => searchPlayers(term),
    enabled: searching,
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
  });

  const leagueIds = useMemo(
    () => Array.from(new Set(results.map((r) => r.leagueId).filter((id): id is string => !!id))).sort(),
    [results],
  );
  const { data: competitionNames = {} } = useQuery({
    queryKey: ["players-directory", "competitions", leagueIds.join(",")],
    queryFn: () => fetchCompetitionNames(leagueIds),
    enabled: leagueIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const { data: platform } = useQuery<{ players?: number }>({
    queryKey: ["public", "platform-stats"],
    queryFn: async () => {
      const res = await fetch("/api/public/platform-stats");
      return res.ok ? res.json() : {};
    },
    staleTime: 15 * 60 * 1000,
  });
  const playerCount = platform?.players ? `${Math.floor(platform.players / 100) * 100}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : null;

  const description = "Find any player in the leagues on Swish Assistant — season stats, game logs, shot charts and collectible performance cards.";
  const canonical = `${SITE_URL}/players`;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Players | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="Players | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-6 md:pt-9">
        <header className="ch-rise mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Players</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3.25rem] text-[color:var(--ch-text)]">
            Find a player
          </h1>
          <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)] max-w-2xl">
            {playerCount ? `${playerCount}+ players` : "Every player"} with season stats, game logs, shot charts and cards. Search by name.
          </p>
        </header>

        <label className="ch-rise relative block max-w-2xl" style={{ animationDelay: "60ms" }}>
          <span className="sr-only">Search players</span>
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[color:var(--ch-muted)] pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by player name"
            autoComplete="off"
            autoFocus
            className="ch-input w-full h-12 md:h-14 pl-12 pr-12 text-[16px] md:text-[17px] [&::-webkit-search-cancel-button]:hidden"
            data-testid="players-search"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
            {searching && isFetching ? (
              <Loader2 className="h-4 w-4 m-2 animate-spin text-[color:var(--ch-muted)]" aria-label="Searching" />
            ) : query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="h-8 w-8 rounded-md flex items-center justify-center text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </span>
        </label>

        <div className="mt-6 md:mt-8" aria-live="polite">
          {!searching ? (
            query.trim().length > 0 && (
              <p className="text-sm text-[color:var(--ch-muted)]">Keep typing — at least {MIN_QUERY} letters.</p>
            )
          ) : isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="ch-skel h-[84px] rounded-[14px]" />)}
            </div>
          ) : isError ? (
            <div className="ch-card p-8 text-center text-sm text-[color:var(--ch-text-2)]">
              Search isn't available right now. Please try again in a moment.
            </div>
          ) : results.length === 0 ? (
            <div className="ch-card border-dashed p-10 text-center" data-testid="players-empty">
              <Users className="h-9 w-9 text-[color:var(--ch-muted)] mx-auto mb-3" aria-hidden="true" />
              <p className="font-medium text-[color:var(--ch-text)] text-lg">No players match “{term}”</p>
              <p className="text-sm text-[color:var(--ch-text-2)] mt-1">Try their surname, or find them through their team.</p>
              <Link href="/teams" className="mt-5 ch-btn ch-btn-ghost h-10 px-5">Browse teams</Link>
            </div>
          ) : (
            <section aria-labelledby="players-results-heading">
              <h2 id="players-results-heading" className="flex items-baseline gap-2.5 mb-3 md:mb-4">
                <span className="ch-display uppercase font-bold tracking-tight leading-none text-[1.5rem] md:text-[1.75rem] text-[color:var(--ch-text)]">
                  Players
                </span>
                <span className="text-sm font-medium text-[color:var(--ch-muted)] ch-num">{results.length}</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {results.map((player) => (
                  <PlayerCard key={player.key} player={player} competition={player.leagueId ? competitionNames[player.leagueId] : undefined} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <TrendingPerformanceSection headerClassName="max-w-6xl mx-auto px-4 md:px-6" />

      <section className="max-w-6xl mx-auto px-4 md:px-6 pb-16" aria-labelledby="claim-heading">
        <div className="ch-card p-5 md:p-7 flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          <span className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-[color:var(--ch-accent-soft)] text-[color:var(--ch-accent)]">
            <BadgeCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="claim-heading" className="ch-display uppercase font-bold tracking-tight leading-none text-[1.35rem] md:text-[1.5rem] text-[color:var(--ch-text)]">
              Is one of these pages yours?
            </h2>
            <p className="mt-1.5 text-sm text-[color:var(--ch-text-2)] max-w-2xl">
              Claim your player page to keep your details up to date, add your own photo and download your cards.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <Link href="/contact-sales?topic=player-page" className="ch-btn ch-btn-primary h-10 px-5">
              Claim your page
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/claim" className="ch-btn ch-btn-ghost h-10 px-4" data-testid="link-players-have-claim-code">
              Have a code?
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
