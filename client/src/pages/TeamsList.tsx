import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ChevronRight, Search, Shield, Trophy, X } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { teamPath } from "@shared/seo";

const SITE_URL = "https://swishassistant.com";
const ALL = "all";
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type DirectoryCompetition = {
  id: string;
  name: string;
  slug: string;
  teamName: string;
  lastPlayed: string | null;
  nextGame: string | null;
  games: number;
};

type DirectoryClub = {
  key: string;
  name: string;
  logo: string | null;
  competitions: DirectoryCompetition[];
  lastPlayed: string | null;
  nextGame: string | null;
  games: number;
};

type CompetitionOption = { id: string; name: string; slug: string; logo: string | null; clubs: number };

type TeamsDirectory = { clubs: DirectoryClub[]; competitions: CompetitionOption[] };

const fold = (value: string) => value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Each team side's permanent page, opened on this competition.
const teamHref = (c: DirectoryCompetition) => teamPath(c.teamName, c.slug) || `/team/${encodeURIComponent(c.teamName)}`;

type Activity = { lastPlayed: string | null; nextGame: string | null; games: number };

// Playing now: a game in the last month, or one coming up in the next.
function isActive(activity: Activity, now: number) {
  const last = activity.lastPlayed ? Date.parse(activity.lastPlayed) : 0;
  const next = activity.nextGame ? Date.parse(activity.nextGame) : 0;
  return now - last < ACTIVE_WINDOW_MS || (next > now && next - now < ACTIVE_WINDOW_MS);
}

const formatNextGame = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

function initials(name: string) {
  const words = fold(name).replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "?").slice(0, 2)).toUpperCase();
}

function ClubCrest({ name, logo }: { name: string; logo: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="h-12 w-12 shrink-0 rounded-xl ch-tile flex items-center justify-center overflow-hidden">
      {logo && !failed ? (
        <img src={logo} alt="" loading="lazy" onError={() => setFailed(true)} className="h-10 w-10 object-contain" />
      ) : (
        <span className="ch-display font-bold text-[17px] tracking-tight text-[color:var(--ch-text-2)]">{initials(name)}</span>
      )}
    </span>
  );
}

function CompetitionMark({ competition }: { competition?: CompetitionOption }) {
  return (
    <span className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center overflow-hidden">
      {competition?.logo ? (
        <img src={competition.logo} alt="" className="h-5 w-5 object-contain" />
      ) : competition ? (
        <Trophy className="h-3.5 w-3.5 text-[color:var(--ch-accent)]" aria-hidden="true" />
      ) : (
        <Shield className="h-3.5 w-3.5 text-[color:var(--ch-accent)]" aria-hidden="true" />
      )}
    </span>
  );
}

function ClubCard({ club, competitionId, now }: { club: DirectoryClub; competitionId: string; now: number }) {
  // Filtered to one competition, the card opens the club's page there and
  // counts its games there; otherwise wherever it played most recently.
  const filtered = club.competitions.find((c) => c.id === competitionId);
  const target = filtered || club.competitions[0];
  const activity: Activity = filtered || club;
  const others = club.competitions.length - 1;
  const active = isActive(activity, now);
  const meta = [
    activity.games > 0 ? `${activity.games} ${activity.games === 1 ? "game" : "games"}` : "No games yet",
    activity.nextGame && Date.parse(activity.nextGame) > now ? `Next ${formatNextGame(activity.nextGame)}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <Link
      href={teamHref(target)}
      className="ch-card ch-hover group flex items-center gap-3.5 p-3.5 md:p-4 min-w-0"
      data-testid="team-directory-card"
    >
      <ClubCrest name={club.name} logo={club.logo} />
      <span className="min-w-0 flex-1">
        <span className="block ch-display uppercase font-bold tracking-tight leading-none text-[1.15rem] md:text-[1.25rem] text-[color:var(--ch-text)] truncate">
          {club.name}
        </span>
        <span className="mt-1 block text-xs text-[color:var(--ch-text-2)] truncate">
          {target.name}
          {others > 0 && competitionId === ALL && <span className="text-[color:var(--ch-muted)]"> +{others} more</span>}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[color:var(--ch-muted)]">
          {active && <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--ch-win)]" aria-label="Playing now" />}
          <span className="truncate">{meta}</span>
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ch-muted)] group-hover:text-[color:var(--ch-accent)] transition-colors" aria-hidden="true" />
    </Link>
  );
}

function ClubGrid({ clubs, competitionId, now }: { clubs: DirectoryClub[]; competitionId: string; now: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
      {clubs.map((club) => (
        <ClubCard key={club.key} club={club} competitionId={competitionId} now={now} />
      ))}
    </div>
  );
}

function SectionHeading({ id, title, count }: { id: string; title: string; count: number }) {
  return (
    <h2 id={id} className="flex items-baseline gap-2.5 mb-3 md:mb-4">
      <span className="ch-display uppercase font-bold tracking-tight leading-none text-[1.5rem] md:text-[1.75rem] text-[color:var(--ch-text)]">
        {title}
      </span>
      <span className="text-sm font-medium text-[color:var(--ch-muted)] ch-num">{count}</span>
    </h2>
  );
}

/**
 * /teams — every club in the leagues we cover, once each however many
 * competitions it plays in. Search by name, or narrow to one competition.
 */
export default function TeamsList() {
  const params = useParams<{ slug?: string }>();
  const initial = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(initial.get("q") || "");
  const [competitionId, setCompetitionId] = useState(initial.get("competition") || ALL);

  const { data, isLoading, isError, refetch } = useQuery<TeamsDirectory>({
    queryKey: ["public", "teams-directory"],
    queryFn: async () => {
      const res = await fetch("/api/public/teams-directory");
      if (!res.ok) throw new Error(`Teams directory failed (${res.status})`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const clubs = data?.clubs ?? [];
  const competitions = data?.competitions ?? [];

  // /teams/:slug opens on that competition.
  useEffect(() => {
    if (!params.slug || !competitions.length) return;
    const match = competitions.find((c) => c.slug === params.slug);
    if (match) setCompetitionId(match.id);
  }, [params.slug, competitions]);

  // Keep the search and filter in the address, so a filtered list can be shared.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (query.trim()) url.searchParams.set("q", query.trim());
    else url.searchParams.delete("q");
    if (competitionId !== ALL) url.searchParams.set("competition", competitionId);
    else url.searchParams.delete("competition");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [query, competitionId]);

  const selected = competitions.find((c) => c.id === competitionId);
  const now = Date.now();

  const results = useMemo(() => {
    const q = fold(query.trim());
    return clubs.filter((club) => {
      if (competitionId !== ALL && !club.competitions.some((c) => c.id === competitionId)) return false;
      if (!q) return true;
      return [club.name, ...club.competitions.flatMap((c) => [c.teamName, c.name])].some((text) => fold(text).includes(q));
    });
  }, [clubs, query, competitionId]);

  const browsing = !query.trim() && competitionId === ALL;
  const playingNow = browsing ? results.filter((club) => isActive(club, now)) : [];
  const theRest = browsing ? results.filter((club) => !isActive(club, now)) : [];

  const clearFilters = () => {
    setQuery("");
    setCompetitionId(ALL);
  };

  const description = "Find any team in the leagues on Swish Assistant — results, rosters, stats and player pages for every club.";
  const canonical = `${SITE_URL}/teams`;

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <Helmet>
        <title>Teams | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="Teams | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-6 md:pt-9 pb-16">
        <header className="ch-rise mb-6 md:mb-7">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">Teams</div>
          <h1 className="mt-1.5 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.25rem] md:text-[3.25rem] text-[color:var(--ch-text)]">
            Find a team
          </h1>
          <p className="mt-2 text-sm md:text-[15px] text-[color:var(--ch-text-2)] max-w-2xl">
            {data
              ? `${clubs.length} clubs across ${competitions.length} competitions. Search by name or pick a competition.`
              : "Every club in the leagues we cover. Search by name or pick a competition."}
          </p>
        </header>

        <div className="ch-rise flex flex-col sm:flex-row gap-3 mb-6 md:mb-8" style={{ animationDelay: "60ms" }}>
          <label className="relative flex-1 sm:max-w-md">
            <span className="sr-only">Search teams</span>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ch-muted)] pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search teams"
              autoComplete="off"
              className="ch-input w-full h-11 pl-10 pr-10 text-[15px] [&::-webkit-search-cancel-button]:hidden"
              data-testid="teams-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md flex items-center justify-center text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <Select value={competitionId} onValueChange={setCompetitionId} disabled={!competitions.length}>
            <SelectTrigger
              aria-label="Competition"
              className="h-11 w-full sm:w-[300px] rounded-[10px] border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] px-3.5 text-left text-sm font-semibold text-[color:var(--ch-text)] focus:ring-2 focus:ring-[color:var(--ch-accent-soft)] focus:ring-offset-0"
              data-testid="teams-competition-filter"
            >
              {/* The trigger line-clamps its direct span, so the row sits inside one. */}
              <span>
                <span className="flex items-center gap-2.5 min-w-0">
                  <CompetitionMark competition={selected} />
                  <span className="truncate">{selected?.name ?? "All competitions"}</span>
                </span>
              </span>
            </SelectTrigger>
            <SelectContent className="rounded-xl p-1 shadow-xl max-h-[60vh]" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
              <SelectItem value={ALL} className="rounded-lg py-2 pr-3 text-sm font-medium">
                <span className="flex items-center gap-2.5">
                  <CompetitionMark />
                  All competitions
                </span>
              </SelectItem>
              {competitions.map((c) => (
                <SelectItem key={c.id} value={c.id} className="rounded-lg py-2 pr-3 text-sm font-medium">
                  <span className="flex items-center gap-2.5 min-w-0">
                    <CompetitionMark competition={c} />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto pl-2 text-xs text-muted-foreground tabular-nums">{c.clubs}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4" aria-busy="true" aria-label="Loading teams">
            {Array.from({ length: 12 }, (_, i) => <div key={i} className="ch-skel h-[84px] rounded-[14px]" />)}
          </div>
        ) : isError ? (
          <div className="ch-card p-10 text-center">
            <p className="font-medium text-[color:var(--ch-text)] text-lg">We couldn't load the teams</p>
            <p className="text-sm text-[color:var(--ch-text-2)] mt-1">Check your connection and try again.</p>
            <button type="button" onClick={() => refetch()} className="mt-5 ch-btn ch-btn-primary h-10 px-5">Try again</button>
          </div>
        ) : results.length === 0 ? (
          <div className="ch-card border-dashed p-10 md:p-12 text-center" data-testid="teams-empty">
            <Shield className="h-9 w-9 text-[color:var(--ch-muted)] mx-auto mb-3" aria-hidden="true" />
            <p className="font-medium text-[color:var(--ch-text)] text-lg">
              {query.trim() ? `No teams match “${query.trim()}”` : "No teams here yet"}
            </p>
            <p className="text-sm text-[color:var(--ch-text-2)] mt-1">
              {competitionId !== ALL ? "Try all competitions, or check the spelling." : "Check the spelling, or try a shorter name."}
            </p>
            <button type="button" onClick={clearFilters} className="mt-5 ch-btn ch-btn-ghost h-10 px-5">Show all teams</button>
          </div>
        ) : browsing ? (
          <div className="space-y-10 md:space-y-12">
            {playingNow.length > 0 && (
              <section aria-labelledby="teams-now-heading">
                <SectionHeading id="teams-now-heading" title="Playing now" count={playingNow.length} />
                <ClubGrid clubs={playingNow} competitionId={competitionId} now={now} />
              </section>
            )}
            {theRest.length > 0 && (
              <section aria-labelledby="teams-more-heading">
                <SectionHeading id="teams-more-heading" title={playingNow.length > 0 ? "More teams" : "All teams"} count={theRest.length} />
                <ClubGrid clubs={theRest} competitionId={competitionId} now={now} />
              </section>
            )}
          </div>
        ) : (
          <section aria-labelledby="teams-results-heading">
            <SectionHeading
              id="teams-results-heading"
              title={query.trim() ? "Results" : selected?.name ?? "Teams"}
              count={results.length}
            />
            <ClubGrid clubs={results} competitionId={competitionId} now={now} />
          </section>
        )}
      </main>
    </div>
  );
}
