import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";

interface PerfRow {
  league_id: string;
  game_key: string;
  game_date: string | null;
  week_start: string | null;
  player_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fga: number | null;
  fta: number | null;
  ts_pct: number | null;
  game_score: number | null;
}

interface PlayerMetaRow {
  id: string;
  slug: string | null;
  photo_path_bg_removed: string | null;
}

interface LeagueMetaRow {
  league_id: string;
  name: string | null;
}

interface TrendingData {
  perfs: PerfRow[];
  leagueNames: Record<string, string>;
  playerMeta: Record<string, { slug: string | null; photoUrl: string | null }>;
}

const ROTATE_MS = 6000;

function formatDate(s: string | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center min-w-[44px]">
      <span className="text-base md:text-lg font-bold text-slate-900 dark:text-white tabular-nums">
        {value}
      </span>
      <span className="text-[10px] md:text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </span>
    </div>
  );
}

export default function TrendingPerformanceSection() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [tabHidden, setTabHidden] = useState(
    typeof document !== "undefined" ? document.hidden : false
  );

  const { data, isLoading } = useQuery<TrendingData>({
    queryKey: ["supabase", "home", "trending-performance"],
    queryFn: async () => {
      const empty: TrendingData = { perfs: [], leagueNames: {}, playerMeta: {} };
      const { data: leagueRows, error: lErr } = await supabase
        .from("leagues")
        .select("league_id, name, trending_position")
        .eq("is_public", true)
        .order("trending_position", { ascending: true, nullsFirst: false })
        .limit(12);

      if (lErr) {
        console.error("[TrendingPerf] leagues error", lErr);
        return empty;
      }

      const leagues = (leagueRows as LeagueMetaRow[] | null) || [];
      const leagueNames: Record<string, string> = {};
      for (const l of leagues) {
        if (l.name) leagueNames[l.league_id] = l.name;
      }

      // Single batched query across all featured leagues. Previously this
      // ran one `.eq('league_id', X).limit(1)` per league which produced
      // N+1 round-trips and consistently tripped Supabase statement
      // timeouts (Postgres 57014). One ordered .in(...) query lets the
      // server pick a single plan and we dedupe to one row per league
      // client-side. The hard cap on row count keeps the response small.
      const leagueIds = leagues.map((l) => l.league_id);
      let perfs: PerfRow[] = [];
      if (leagueIds.length > 0) {
        const fetchCap = Math.min(leagueIds.length * 25, 200);
        const { data: rows, error } = await supabase
          .from("vw_player_game_scores")
          .select(
            "league_id, game_key, game_date, week_start, player_id, full_name, team_id, team_name, pts, reb, ast, stl, blk, tov, fga, fta, ts_pct, game_score"
          )
          .in("league_id", leagueIds)
          .order("week_start", { ascending: false })
          .order("game_score", { ascending: false })
          .limit(fetchCap)
          .returns<PerfRow[]>();

        if (error) {
          console.error("[TrendingPerf] perf error", error);
        } else {
          const seen = new Set<string>();
          for (const r of rows || []) {
            if (!r?.league_id || seen.has(r.league_id)) continue;
            seen.add(r.league_id);
            perfs.push(r);
          }
        }
      }

      perfs.sort((a, b) => {
        const aw = a.week_start || "";
        const bw = b.week_start || "";
        if (aw !== bw) return aw < bw ? 1 : -1;
        return (b.game_score ?? 0) - (a.game_score ?? 0);
      });

      const playerIds = perfs.map((p) => p.player_id);
      const playerMeta: Record<string, { slug: string | null; photoUrl: string | null }> = {};
      if (playerIds.length > 0) {
        const { data: metaRows, error: pErr } = await supabase
          .from("players")
          .select("id, slug, photo_path_bg_removed")
          .in("id", playerIds);
        if (!pErr) {
          for (const p of (metaRows as PlayerMetaRow[] | null) || []) {
            playerMeta[p.id] = {
              slug: p.slug,
              photoUrl: getPlayerPhotoUrlCached(p.photo_path_bg_removed),
            };
          }
        } else {
          console.error("[TrendingPerf] players error", pErr);
        }
      }

      return { perfs, leagueNames, playerMeta };
    },
  });

  const perfs = data?.perfs ?? [];
  const leagueNames = data?.leagueNames ?? {};
  const playerMeta = data?.playerMeta ?? {};

  // Visibility-aware: stop rotation when tab hidden so polling/render churn stops.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // Auto-rotate carousel
  useEffect(() => {
    if (perfs.length <= 1 || tabHidden) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % perfs.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [perfs.length, tabHidden]);

  const perf = perfs[index] || null;
  const meta = perf ? playerMeta[perf.player_id] : undefined;
  const photoUrl = meta?.photoUrl || null;
  const playerSlug = meta?.slug || null;
  const leagueName = perf ? leagueNames[perf.league_id] : undefined;

  const tsPct = useMemo(() => {
    if (!perf) return "—";
    return perf.ts_pct !== null && perf.ts_pct !== undefined
      ? `${(Number(perf.ts_pct) * 100).toFixed(1)}`
      : "—";
  }, [perf]);

  const goToPerformance = () => {
    if (!perf) return;
    if (playerSlug) {
      setLocation(`/player/${playerSlug}`);
    } else {
      setLocation(`/game/${perf.game_key}`);
    }
  };

  if (isLoading || !perf) {
    return (
      <div className="w-full max-w-xl mb-6 md:mb-8">
        <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm p-4 md:p-5 animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 w-40 bg-slate-200 dark:bg-neutral-800 rounded" />
            <div className="h-4 w-4 bg-slate-200 dark:bg-neutral-800 rounded" />
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-neutral-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-slate-200 dark:bg-neutral-800 rounded" />
              <div className="h-3 w-24 bg-slate-200 dark:bg-neutral-800 rounded" />
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-200 dark:bg-neutral-800 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mb-6 md:mb-8 text-left">
      <button
        type="button"
        onClick={goToPerformance}
        className="group block w-full text-left rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-500/50 transition-all p-4 md:p-5"
        data-testid="trending-performance-card"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-baseline gap-2 min-w-0">
            <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">
              Trending Performance
            </h3>
            {leagueName && (
              <span className="text-[10px] md:text-xs uppercase tracking-wide text-orange-600 dark:text-orange-400 font-semibold truncate">
                {leagueName}
              </span>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-slate-400 dark:text-slate-500 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
        </div>

        {/* Player + meta */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 md:h-14 md:w-14 rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-amber-100 dark:from-neutral-800 dark:to-neutral-800 flex items-center justify-center flex-shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={perf.full_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-orange-600 dark:text-orange-300 font-bold text-sm">
                {perf.full_name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white truncate">
              {perf.full_name}
            </div>
            <div className="flex items-center gap-1.5 text-xs md:text-sm text-slate-500 dark:text-slate-400 truncate">
              <span>{formatDate(perf.game_date)}</span>
              {perf.team_name && (
                <>
                  <span aria-hidden="true">•</span>
                  <TeamLogo
                    teamName={perf.team_name}
                    leagueId={perf.league_id}
                    size="xs"
                    className="!w-5 !h-5"
                  />
                  <span className="sr-only">{perf.team_name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200 dark:border-neutral-800 mb-3" />

        {/* Stats grid */}
        <div className="grid grid-cols-5 gap-y-3 gap-x-2">
          <Stat label="GS" value={perf.game_score ?? 0} />
          <Stat label="PTS" value={perf.pts ?? 0} />
          <Stat label="REB" value={perf.reb ?? 0} />
          <Stat label="AST" value={perf.ast ?? 0} />
          <Stat label="STL" value={perf.stl ?? 0} />
          <Stat label="BLK" value={perf.blk ?? 0} />
          <Stat label="TOV" value={perf.tov ?? 0} />
          <Stat label="FGA" value={perf.fga ?? 0} />
          <Stat label="FTA" value={perf.fta ?? 0} />
          <Stat label="TS%" value={tsPct} />
        </div>
      </button>

      {/* Carousel dots */}
      {perfs.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {perfs.map((p, i) => (
            <button
              key={p.league_id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
              }}
              aria-label={`Show ${leagueNames[p.league_id] || "league"} top performance`}
              className={`h-1.5 rounded-full transition-all ${
                i === index
                  ? "w-6 bg-orange-500"
                  : "w-1.5 bg-slate-300 dark:bg-neutral-700 hover:bg-slate-400 dark:hover:bg-neutral-600"
              }`}
              data-testid={`trending-perf-dot-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
