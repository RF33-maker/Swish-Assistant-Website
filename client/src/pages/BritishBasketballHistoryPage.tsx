import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import AllTimeLeaders from "@/components/league/AllTimeLeaders";
import { gamePath, teamPath } from "@shared/seo";
import { clubDisplayName } from "@shared/teamIdentity";

const SITE_URL = "https://swishassistant.com";

/**
 * /british-basketball-history: every season on file, league by league. Season-by-season
 * leaders, the single-game records and full career boards, all from
 * /api/leagues/:brandId/all-time (server/allTimeLeaders.ts).
 *
 * Only the box scores already on the site count; nothing here comes from outside archives.
 * Each season keeps the team names of the time ("Glasgow Rocks", "Esh Group Eagles
 * Newcastle"); team links still land on today's club.
 */

const SLB = "56cac2cb-6d34-459c-afa8-c34a8d4aa00f";
const BCB = "fdf9aa2d-6685-4ad8-a558-811e96a741df";
const NBL = "3b022087-839f-4329-aa5e-d39d9688139a";

type LeagueOption = { id: string; brandId: string; gender: string; name: string; short: string; lineage: string };

const LEAGUES: LeagueOption[] = [
  { id: "slb-men", brandId: SLB, gender: "Men", name: "Super League Basketball", short: "SLB", lineage: "Played as the British Basketball League (BBL) until 2024." },
  { id: "slb-women", brandId: SLB, gender: "Women", name: "Women's Super League Basketball", short: "SLB Women", lineage: "Played as the Women's British Basketball League (WBBL) until 2023." },
  { id: "bcb", brandId: BCB, gender: "", name: "British Championship Basketball", short: "BCB", lineage: "Played as NBL Division One until 2025." },
  { id: "nbl-men", brandId: NBL, gender: "Men", name: "NBL Division One", short: "NBL D1", lineage: "Played as NBL Division Two until 2025." },
  { id: "nbl-women", brandId: NBL, gender: "Women", name: "WNBL Division One", short: "WNBL D1", lineage: "The women's National Basketball League's Division One." },
];

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

function SeasonRow({ season, gender, stats }: { season: SeasonSummary; gender: string; stats: typeof STATS }) {
  return (
    <div className="py-5 border-b border-[color:var(--ch-border)]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="ch-display font-bold text-2xl tabular-nums text-[color:var(--ch-text)]">{season.season}</h3>
        <Link href={`/competition/${season.competitionSlug}`} className="text-sm font-medium text-[color:var(--ch-text-2)] hover:underline">
          {season.competition}
        </Link>
        <span className="text-xs text-[color:var(--ch-muted)]">
          {season.games} games on file · leaders played {season.minGames}+
        </span>
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

              {(data.seasons?.length ?? 0) > 0 && (
              <section className="mt-12" aria-labelledby="seasons-heading">
                <div className="flex flex-wrap items-end justify-between gap-3 pb-2 border-b border-[color:var(--ch-border-strong)]">
                  <div>
                    <h2 id="seasons-heading" className="ch-eyebrow">Season by season</h2>
                    <p className="mt-1 text-xs text-[color:var(--ch-muted)]">League games only. Per-game leaders played at least half the season's games.</p>
                  </div>
                  <button onClick={() => setAllStats((v) => !v)} className="ch-btn ch-btn-ghost h-8 px-3 text-xs">
                    {allStats ? "Points, rebounds, assists" : "Add steals, blocks, threes"}
                  </button>
                </div>
                {data.seasons.map((season) => (
                  <SeasonRow key={season.season} season={season} gender={league.gender} stats={shownStats} />
                ))}
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
