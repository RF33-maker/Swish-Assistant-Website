import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { CalendarClock } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { normalizeTeamName } from "@/lib/teamUtils";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

/**
 * /scores — every live game, what's coming up next, and results from the
 * last day, in one mobile-first list.
 *
 * The homepage ticker only has room for a few games per league, which on a
 * busy Saturday hid up to half of them. This is the complete view behind it,
 * and the link to share on socials: /scores?league=<slug> opens pre-filtered.
 *
 * There is deliberately no date picker. The server applies the rolling rules
 * (see /api/scores): results stay for 24 hours, and "coming up" rolls forward
 * to the next day with games, so the page is never empty midweek and never
 * asks the visitor to work out which day to look at.
 */

interface ScoreGame {
  game_key: string;
  league_id: string;
  league_name: string;
  league_slug: string;
  match_time: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
}

interface ScoresPayload {
  generatedAt: string;
  leagues: Array<{ league_id: string; name: string; slug: string }>;
  live: ScoreGame[];
  upcoming: { date: string | null; isToday?: boolean; games: ScoreGame[] };
  results: ScoreGame[];
}

const UK = "Europe/London";
const CANONICAL = "https://swishassistant.com/scores";
const META_DESCRIPTION =
  "Live scores, upcoming fixtures and the latest results from British basketball, updated as games happen.";

/**
 * Match times are stored as UK wall-clock time labelled +00, so they're read
 * back in UTC — the same convention as every other time on the site. Using
 * Europe/London here would show every tip-off an hour late during BST.
 */
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Today", "Tomorrow", or "Friday 2 October" for a YYYY-MM-DD UK date. */
function dayLabel(dateKey: string | null, isToday?: boolean): string {
  if (!dateKey) return "";
  if (isToday) return "Today";
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: UK, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const tomorrow = new Date(`${todayKey}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (tomorrow.toISOString().slice(0, 10) === dateKey) return "Tomorrow";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(`${dateKey}T12:00:00Z`));
}

/** The feed's live status is things like "Q3", "live", "halftime". */
function liveLabel(status: string | null): string {
  const s = (status || "").trim();
  if (/^q[1-4]/i.test(s)) return s.toUpperCase().slice(0, 2);
  if (/^ot/i.test(s)) return "OT";
  if (/half/i.test(s)) return "Half time";
  return "Live";
}

function TeamRow({
  name, leagueId, score, muted,
}: { name: string; leagueId: string; score: number | null; muted?: boolean }) {
  // Logos are looked up by the raw feed name; only the displayed text is
  // tidied, so "Gloucester City Kings Senior Men I" reads as the club.
  return (
    <div className={`flex items-center gap-3 ${muted ? "text-slate-400 dark:text-neutral-500" : "text-slate-900 dark:text-white"}`}>
      <TeamLogo teamName={name} leagueId={leagueId} size="sm" />
      <span className="flex-1 min-w-0 truncate text-[15px] font-medium">{normalizeTeamName(name) || name}</span>
      {score != null && <span className="text-lg font-bold tabular-nums">{score}</span>}
    </div>
  );
}

function GameCard({ game, kind }: { game: ScoreGame; kind: "live" | "upcoming" | "result" }) {
  const hasScores = game.home_score != null && game.away_score != null;
  const homeWon = kind === "result" && hasScores && game.home_score! > game.away_score!;
  const awayWon = kind === "result" && hasScores && game.away_score! > game.home_score!;

  return (
    <Link
      href={`/competition/${game.league_slug}/game/${encodeURIComponent(game.game_key)}`}
      className="block rounded-2xl border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 active:scale-[0.99] hover:border-orange-300 dark:hover:border-neutral-600 transition"
    >
      <div className="flex items-center justify-between gap-3 mb-2.5 text-xs">
        <span className="truncate text-slate-500 dark:text-neutral-400">{game.league_name}</span>
        {kind === "live" ? (
          <span className="flex items-center gap-1.5 shrink-0 font-semibold text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {liveLabel(game.status)}
          </span>
        ) : kind === "upcoming" ? (
          <span className="shrink-0 font-semibold text-slate-700 dark:text-neutral-200 tabular-nums">{formatTime(game.match_time)}</span>
        ) : (
          <span className="shrink-0 text-slate-500 dark:text-neutral-400">Final</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <TeamRow name={game.home_team} leagueId={game.league_id} score={kind === "upcoming" ? null : game.home_score} muted={awayWon} />
        <TeamRow name={game.away_team} leagueId={game.league_id} score={kind === "upcoming" ? null : game.away_score} muted={homeWon} />
      </div>
    </Link>
  );
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        {meta && <span className="text-xs text-slate-500 dark:text-neutral-400">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

export default function ScoresPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leagueParam = new URLSearchParams(search).get("league") || "";

  const { data, isLoading, isError } = useQuery<ScoresPayload>({
    queryKey: ["scores-page"],
    queryFn: async () => {
      const res = await fetch("/api/scores");
      if (!res.ok) throw new Error("Failed to load scores");
      return res.json();
    },
    staleTime: 15 * 1000,
    // Live scores move; poll while the page is open, same cadence as the ticker.
    refetchInterval: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  // An unknown ?league= (a stale social link, or a league with nothing on)
  // falls back to showing everything rather than an empty page.
  const activeLeague = data?.leagues.some((l) => l.slug === leagueParam) ? leagueParam : "";
  const pick = (games: ScoreGame[] = []) => (activeLeague ? games.filter((g) => g.league_slug === activeLeague) : games);

  const live = useMemo(() => pick(data?.live), [data, activeLeague]);
  const upcoming = useMemo(() => pick(data?.upcoming.games), [data, activeLeague]);
  const results = useMemo(() => pick(data?.results), [data, activeLeague]);
  const nothingOn = !isLoading && live.length === 0 && upcoming.length === 0 && results.length === 0;

  const selectLeague = (slug: string) => {
    setLocation(slug ? `/scores?league=${encodeURIComponent(slug)}` : "/scores", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-slate-100">
      {/* Managed through Helmet rather than document.title so the title is
          released when you navigate on to a game, instead of sticking. */}
      <Helmet>
        <title>Live scores and results | Swish Assistant</title>
        <meta name="description" content={META_DESCRIPTION} />
        <meta property="og:title" content="Live scores and results | Swish Assistant" />
        <meta property="og:description" content={META_DESCRIPTION} />
        <meta property="og:url" content={CANONICAL} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={CANONICAL} />
      </Helmet>
      <div className="h-[1px] bg-gradient-to-r from-orange-400 to-amber-400" />
      <header className="sticky top-0 z-30 bg-white/90 dark:bg-neutral-950/90 backdrop-blur border-b border-orange-100 dark:border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={SwishLogo} alt="Swish Assistant" className="h-7 cursor-pointer" onClick={() => setLocation("/")} />
          <span className="text-lg font-bold">Scores</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 pb-16 flex flex-col gap-6">
        {data && data.leagues.length > 1 && (
          <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {[{ slug: "", name: "All" }, ...data.leagues].map((l) => {
              const active = activeLeague === l.slug;
              return (
                <button
                  key={l.slug || "all"}
                  onClick={() => selectLeague(l.slug)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium border transition ${
                    active
                      ? "bg-orange-500 border-orange-500 text-white"
                      : "bg-white dark:bg-neutral-900 border-slate-200 dark:border-neutral-700 text-slate-700 dark:text-neutral-300"
                  }`}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[104px] rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 animate-pulse" />
            ))}
          </div>
        )}

        {isError && !data && (
          <p className="text-center text-sm text-slate-500 dark:text-neutral-400 py-12">
            Scores couldn't load. They'll retry automatically.
          </p>
        )}

        {live.length > 0 && (
          <Section title="Live now" meta={`${live.length} ${live.length === 1 ? "game" : "games"}`}>
            {live.map((g) => <GameCard key={g.game_key} game={g} kind="live" />)}
          </Section>
        )}

        {upcoming.length > 0 && (
          <Section title="Coming up" meta={dayLabel(data?.upcoming.date ?? null, data?.upcoming.isToday)}>
            {upcoming.map((g) => <GameCard key={g.game_key} game={g} kind="upcoming" />)}
          </Section>
        )}

        {results.length > 0 && (
          <Section title="Results" meta="Last 24 hours">
            {results.map((g) => <GameCard key={g.game_key} game={g} kind="result" />)}
          </Section>
        )}

        {nothingOn && !isError && (
          <div className="flex flex-col items-center text-center gap-2 py-16">
            <CalendarClock className="w-10 h-10 text-orange-400" />
            <p className="font-semibold">No games scheduled right now</p>
            <p className="text-sm text-slate-500 dark:text-neutral-400">New fixtures appear here as soon as they're published.</p>
          </div>
        )}
      </main>
    </div>
  );
}
