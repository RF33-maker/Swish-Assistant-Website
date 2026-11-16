import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import AllTimeLeaders from "@/components/league/AllTimeLeaders";
import { supabase } from "@/lib/supabase";
import { HISTORY_LEAGUES, type HistoryLeague } from "@/lib/historyLeagues";
import { competitionNameWithoutSeason, competitionTypeOrder, seasonOf } from "@/lib/leagueSeasons";
import { gamePath, teamPath } from "@shared/seo";
import { clubDisplayName } from "@shared/teamIdentity";

const SITE_URL = "https://swishassistant.com";

/**
 * /british-basketball-history: every season on file, league by league. Season-by-season
 * leaders, the single-game records and full career boards, all from
 * /api/leagues/:brandId/all-time (server/allTimeLeaders.ts).
 *
 * Each season also lists every competition played that year (league, cup, trophy,
 * play-offs). Past seasons are not offered in the league pickers, so this page and the
 * History tab on each league page are how people reach them.
 *
 * Only the box scores already on the site count; nothing here comes from outside archives.
 * Each season keeps the team names of the time ("Glasgow Rocks", "Esh Group Eagles
 * Newcastle"); team links still land on today's club.
 */

type LeagueOption = HistoryLeague;
const LEAGUES = HISTORY_LEAGUES;

type StatKey = "pts" | "reb" | "ast" | "stl" | "blk" | "tpm";

type SeasonLeader = { key: string; name: string; href: string | null; team: string | null; value: number; gp: number };
type SeasonSummary = {
  season: string;
  competition: string;
  competitionSlug: string;
  games: number;
  minGames: number;
  leaders: Record<StatKey, SeasonLeader[]>;
  bestRecord: { team: string; wins: number; losses: number } | null;
};
type GameRecord = {
  key: string;
  name: string;
  href: string | null;
  value: number;
  team: string | null;
  opponent: string | null;
  date: string | null;
  competition: string;
  competitionSlug: string;
  gameKey: string;
};
type HistoryData = {
  competitions: number;
  games: number;
  firstSeason: string | null;
  lastSeason: string | null;
  records: Record<StatKey, GameRecord[]>;
  seasons: SeasonSummary[];
};

const STATS: Array<{ key: StatKey; label: string; record: string; unit: string }> = [
  { key: "pts", label: "Points", record: "Points", unit: "ppg" },
  { key: "reb", label: "Rebounds", record: "Rebounds", unit: "rpg" },
  { key: "ast", label: "Assists", record: "Assists", unit: "apg" },
  { key: "stl", label: "Steals", record: "Steals", unit: "spg" },
  { key: "blk", label: "Blocks", record: "Blocks", unit: "bpg" },
  { key: "tpm", label: "3-pointers", record: "3-pointers", unit: "per game" },
];

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// "Solent Kestrels Senior Men" → "Solent Kestrels"; in a women's league the "Women" is implied.
function teamLabel(name: string | null, gender: string): string {
  if (!name) return "";
  const shown = clubDisplayName(name);
  return gender === "Women" ? shown.replace(/\s+Women$/i, "") : shown;
}

// Seasons between the first and last on file with no league games, e.g. "2024/25".
function missingSeasons(seasons: SeasonSummary[]): string[] {
  const starts = seasons.map((s) => Number(s.season.slice(0, 4))).filter(Number.isFinite);
  if (starts.length < 2) return [];
  const have = new Set(starts);
  const out: string[] = [];
  for (let y = Math.min(...starts) + 1; y < Math.max(...starts); y++) {
    if (!have.has(y)) out.push(`${y}/${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return out;
}

function TeamLink({ name, competitionSlug, gender }: { name: string | null; competitionSlug: string; gender: string }) {
  if (!name) return null;
  const href = teamPath(name, competitionSlug);
  const label = teamLabel(name, gender);
  return href ? <Link href={href} className="hover:underline">{label}</Link> : <>{label}</>;
}

function PlayerLink({ name, href, className }: { name: string; href: string | null; className: string }) {
  return href ? <Link href={href} className={`${className} hover:underline`}>{name}</Link> : <span className={className}>{name}</span>;
}

function RecordsStrip({ data, gender }: { data: HistoryData; gender: string }) {
  return (
    <section className="mt-10" aria-labelledby="records-heading">
      <h2 id="records-heading" className="ch-eyebrow">Single-game records</h2>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-6">
        {STATS.map((stat) => {
          const best = data.records[stat.key] || [];
          const top = best[0];
          if (!top) return null;
          const tied = best.filter((r) => r.value === top.value);
          return (
            <div key={stat.key} className="border-t border-[color:var(--ch-border-strong)] pt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{stat.record}</div>
              <div className="mt-1 ch-display font-bold leading-none text-[2.4rem] tabular-nums text-[color:var(--ch-text)]">{top.value}</div>
              {tied.slice(0, 2).map((r) => (
                <div key={`${r.gameKey}-${r.key}`} className="mt-2">
                  <PlayerLink name={r.name} href={r.href} className="block text-sm font-semibold text-[color:var(--ch-text)] break-words" />
                  <Link href={gamePath(r.competitionSlug, r.gameKey)} className="block text-xs text-[color:var(--ch-text-2)] break-words hover:underline">
                    {teamLabel(r.team, gender)}{r.opponent ? ` v ${teamLabel(r.opponent, gender)}` : ""}
                    {r.date ? `, ${formatDate(r.date)}` : ""}
                  </Link>
                </div>
              ))}
              {tied.length > 2 && <div className="mt-1 text-xs text-[color:var(--ch-muted)]">and {tied.length - 2} more</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

type SeasonCompetitionLink = { name: string; slug: string };

function CompetitionLinks({ competitions }: { competitions: SeasonCompetitionLink[] }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm font-medium text-[color:var(--ch-text-2)]">
      {competitions.map((c, i) => (
        <span key={c.slug} className="inline-flex items-baseline gap-x-1.5">
          {i > 0 && <span aria-hidden className="text-[color:var(--ch-muted)]">·</span>}
          <Link href={`/competition/${c.slug}`} className="hover:underline hover:text-[color:var(--ch-text)]">
            {competitionNameWithoutSeason(c.name)}
          </Link>
        </span>
      ))}
    </span>
  );
}

function SeasonRow({
  season,
  competitions,
  gender,
  stats,
}: {
  season: SeasonSummary;
  competitions: SeasonCompetitionLink[];
  gender: string;
  stats: typeof STATS;
}) {
  const links = competitions.length > 0 ? competitions : [{ name: season.competition, slug: season.competitionSlug }];
  return (
    <div className="py-5 border-b border-[color:var(--ch-border)]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="ch-display font-bold text-2xl tabular-nums text-[color:var(--ch-text)]">{season.season}</h3>
        <CompetitionLinks competitions={links} />
      </div>
      <div className="mt-1 text-xs text-[color:var(--ch-muted)]">
        {season.games} league games on file · leaders played {season.minGames}+
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        {season.bestRecord && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">Best record</div>
            <div className="mt-1 text-sm font-semibold text-[color:var(--ch-text)] break-words">
              <TeamLink name={season.bestRecord.team} competitionSlug={season.competitionSlug} gender={gender} />
            </div>
            <div className="text-xs tabular-nums text-[color:var(--ch-text-2)]">{season.bestRecord.wins}-{season.bestRecord.losses}</div>
          </div>
        )}
        {stats.map((stat) => {
          const leader = season.leaders[stat.key]?.[0];
          if (!leader) return null;
          return (
            <div key={stat.key}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{stat.label}</div>
              <PlayerLink name={leader.name} href={leader.href} className="mt-1 block text-sm font-semibold text-[color:var(--ch-text)] break-words" />
              <div className="text-xs text-[color:var(--ch-text-2)] break-words">
                <span className="font-semibold tabular-nums text-[color:var(--ch-text)]">{leader.value.toFixed(1)}</span> {stat.unit}
                {leader.team && <> · <TeamLink name={leader.team} competitionSlug={season.competitionSlug} gender={gender} /></>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A season with cups or trophies on file but no league games.
function CompetitionsOnlyRow({ label, competitions }: { label: string; competitions: SeasonCompetitionLink[] }) {
  return (
    <div className="py-5 border-b border-[color:var(--ch-border)]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="ch-display font-bold text-2xl tabular-nums text-[color:var(--ch-text)]">{label}</h3>
        <CompetitionLinks competitions={competitions} />
      </div>
      <div className="mt-1 text-xs text-[color:var(--ch-muted)]">No league games on file this season.</div>
    </div>
  );
}

/** Every public competition of one league (and gender), grouped by season label. */
function useSeasonCompetitions(brandId: string, gender: string) {
  const [bySeason, setBySeason] = useState<Map<string, { sort: number; competitions: SeasonCompetitionLink[] }>>(new Map());
  useEffect(() => {
    let cancelled = false;
    setBySeason(new Map());
    let query = supabase
      .from("competitions")
      .select("league_id, parent_league_id, age_group, stop, name, slug, season, gender")
      .eq("competition_id", brandId)
      .eq("is_public", true);
    if (gender) query = query.eq("gender", gender);
    query.then(({ data }) => {
      if (cancelled || !data) return;
      const rows = data as Array<{ league_id: string; parent_league_id: string | null; age_group: string | null; stop: number | null; name: string; slug: string; season: string | null }>;
      const ids = new Set(rows.map((r) => r.league_id));
      const map = new Map<string, { sort: number; competitions: SeasonCompetitionLink[] }>();
      for (const r of rows) {
        // Age-group and stop children are reached from their season parent.
        if (r.parent_league_id && ids.has(r.parent_league_id) && (r.age_group || r.stop != null)) continue;
        const s = seasonOf(r);
        if (!s) continue;
        const entry = map.get(s.label) ?? { sort: s.sort, competitions: [] };
        entry.competitions.push({ name: r.name, slug: r.slug });
        map.set(s.label, entry);
      }
      map.forEach((entry) => {
        entry.competitions.sort((a, b) => competitionTypeOrder(a.name) - competitionTypeOrder(b.name) || a.name.localeCompare(b.name));
      });
      setBySeason(map);
    });
    return () => { cancelled = true; };
  }, [brandId, gender]);
  return bySeason;
}

function readLeague(): LeagueOption {
  try {
    const id = new URLSearchParams(window.location.search).get("league");
    return LEAGUES.find((l) => l.id === id) || LEAGUES[0];
  } catch {
    return LEAGUES[0];
  }
}

export default function BritishBasketballHistoryPage() {
  const [league, setLeague] = useState<LeagueOption>(readLeague);
  const [allStats, setAllStats] = useState(false);
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setData(null);
    const params = new URLSearchParams({ scope: "all" });
    if (league.gender) params.set("gender", league.gender);
    fetch(`/api/leagues/${league.brandId}/all-time?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [league]);

  const pick = (option: LeagueOption) => {
    setLeague(option);
    try {
      const url = new URL(window.location.href);
      if (option.id === LEAGUES[0].id) url.searchParams.delete("league");
      else url.searchParams.set("league", option.id);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* the page still works without the URL */
    }
  };

  const seasonCompetitions = useSeasonCompetitions(league.brandId, league.gender);

  // League seasons with their summaries, plus seasons that only had cups or trophies.
  const seasonRows = useMemo(() => {
    const summaries = data?.seasons || [];
    const covered = new Set(summaries.map((s) => s.season));
    const rows: Array<{ sort: number; label: string; summary: SeasonSummary | null; competitions: SeasonCompetitionLink[] }> = summaries.map((summary) => ({
      sort: seasonOf({ season: summary.season, name: summary.competition })?.sort ?? 0,
      label: summary.season,
      summary,
      competitions: seasonCompetitions.get(summary.season)?.competitions || [],
    }));
    seasonCompetitions.forEach((entry, label) => {
      if (!covered.has(label)) rows.push({ sort: entry.sort, label, summary: null, competitions: entry.competitions });
    });
    return rows.sort((a, b) => b.sort - a.sort);
  }, [data, seasonCompetitions]);

  const gaps = useMemo(() => (data ? missingSeasons(data.seasons || []) : []), [data]);
  const shownStats = allStats ? STATS : STATS.slice(0, 3);

  const canonical = `${SITE_URL}/british-basketball-history`;
  const description =
    "British basketball history on Swish Assistant: career totals and averages, single-game records and every season's leaders in Super League Basketball, the WBBL, BCB and the NBL.";

  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen bg-[color:var(--ch-bg)]`}>
      <Helmet>
        <title>British Basketball History | Swish Assistant</title>
        <meta name="description" content={description} />
        <meta property="og:title" content="British Basketball History | Swish Assistant" />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <link rel="canonical" href={canonical} />
      </Helmet>
      <SiteHeader />

      <main className="max-w-6xl mx-auto px-4 md:px-6 pt-10 md:pt-14 pb-20">
        <div className="ch-rise max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">History</div>
          <h1 className="mt-2 ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2.5rem] md:text-[4rem] text-[color:var(--ch-text)]">
            British basketball history
          </h1>
          <p className="mt-4 text-base md:text-lg text-[color:var(--ch-text-2)]">
            Every season on file, league by league: who led each year, the best single games and whole careers added up.
            Each season keeps its team names as they were then.
          </p>
        </div>

        <nav className="mt-8 flex flex-wrap gap-2" aria-label="League">
          {LEAGUES.map((option) => {
            const active = option.id === league.id;
            return (
              <button
                key={option.id}
                onClick={() => pick(option)}
                aria-pressed={active}
                className={`h-9 px-4 rounded-full text-sm font-semibold border transition-colors ${
                  active
                    ? "bg-[color:var(--ch-text)] text-[color:var(--ch-bg)] border-[color:var(--ch-text)]"
                    : "border-[color:var(--ch-border-strong)] text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
                }`}
              >
                {option.short}
              </button>
            );
          })}
        </nav>

        <section className="mt-8" aria-labelledby="league-heading">
          <h2 id="league-heading" className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[1.9rem] md:text-[2.5rem] text-[color:var(--ch-text)]">
            {league.name}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">
            {league.lineage}
            {data && (
              <>
                {" "}
                {data.firstSeason}
                {data.lastSeason && data.lastSeason !== data.firstSeason ? ` to ${data.lastSeason}` : ""}: {data.games.toLocaleString("en-GB")} games
                across {data.competitions} competitions.
              </>
            )}
          </p>
          {gaps.length > 0 && (
            <p className="mt-1 text-xs text-[color:var(--ch-muted)]">No league games on file for {gaps.join(", ")}.</p>
          )}

          {loading && (
            <div className="mt-10 space-y-4">
              <div className="ch-skel h-32 rounded-[10px]" />
              <div className="ch-skel h-64 rounded-[10px]" />
            </div>
          )}
          {!loading && failed && (
            <p className="mt-8 text-sm text-[color:var(--ch-text-2)]">This league's history could not be loaded just now.</p>
          )}

          {data && (
            <>
              <RecordsStrip data={data} gender={league.gender} />

              {seasonRows.length > 0 && (
              <section className="mt-12" aria-labelledby="seasons-heading">
                <div className="flex flex-wrap items-end justify-between gap-3 pb-2 border-b border-[color:var(--ch-border-strong)]">
                  <div>
                    <h2 id="seasons-heading" className="ch-eyebrow">Season by season</h2>
                    <p className="mt-1 text-xs text-[color:var(--ch-muted)]">Every competition each season. Leaders count league games only and played at least half the season's games.</p>
                  </div>
                  <button onClick={() => setAllStats((v) => !v)} className="ch-btn ch-btn-ghost h-8 px-3 text-xs">
                    {allStats ? "Points, rebounds, assists" : "Add steals, blocks, threes"}
                  </button>
                </div>
                {seasonRows.map((row) =>
                  row.summary ? (
                    <SeasonRow key={row.label} season={row.summary} competitions={row.competitions} gender={league.gender} stats={shownStats} />
                  ) : (
                    <CompetitionsOnlyRow key={row.label} label={row.label} competitions={row.competitions} />
                  ),
                )}
              </section>
              )}
            </>
          )}
        </section>

        {/* Career averages, totals and the full record boards. */}
        <AllTimeLeaders key={league.id} brandId={league.brandId} gender={league.gender} />
      </main>
    </div>
  );
}
