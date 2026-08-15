import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TeamLogo } from "@/components/TeamLogo";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import ShareableCard from "@/components/ShareableCard";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { generateTrendingCardBlob } from "@/lib/generateTrendingCard";

interface PerfRow {
  league_id: string;
  game_date: string | null;
  game_key: string | null;
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
  fgm?: number | null;
  fga: number | null;
  ftm?: number | null;
  fta: number | null;
  ts_pct: number | null;
  game_score: number | null;
  opponent_name?: string | null;
  game_result?: string | null;
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

function StatBlock({ perf, tsPct }: { perf: PerfRow; tsPct: string }) {
  return (
    <div className="grid grid-cols-5 gap-y-3 gap-x-2">
      <Stat label="GmSc" value={perf.game_score ?? 0} />
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
  );
}


export default function TrendingPerformanceSection() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [tabHidden, setTabHidden] = useState(
    typeof document !== "undefined" ? document.hidden : false
  );
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  const { data, isLoading } = useQuery<TrendingData>({
    queryKey: ["home", "trending-performance", "v14-opponent"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const empty: TrendingData = { perfs: [], leagueNames: {}, playerMeta: {} };
      try {
        const res = await fetch("/api/home/trending-performances");
        if (!res.ok) return empty;
        const json = await res.json() as {
          perfs: PerfRow[];
          leagueNames: Record<string, string>;
          playerMeta: Record<string, { slug: string | null; photo_path_bg_removed: string | null }>;
        };
        const playerMeta: Record<string, { slug: string | null; photoUrl: string | null }> = {};
        for (const [id, meta] of Object.entries(json.playerMeta || {})) {
          playerMeta[id] = {
            slug: meta.slug,
            photoUrl: getPlayerPhotoUrlCached(meta.photo_path_bg_removed),
          };
        }
        return { perfs: json.perfs || [], leagueNames: json.leagueNames || {}, playerMeta };
      } catch (err) {
        console.error("[TrendingPerf] fetch error", err);
        return empty;
      }
    },
  });

  const perfs = data?.perfs ?? [];
  const leagueNames = data?.leagueNames ?? {};
  const playerMeta = data?.playerMeta ?? {};

  useEffect(() => {
    if (index >= perfs.length && perfs.length > 0) setIndex(0);
  }, [perfs.length, index]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // Track dark-mode class changes so the compact card re-renders with the right colours.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

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

  const { primaryColor } = useTeamBranding({
    teamName: perf?.team_name || "",
    leagueId: perf?.league_id || "",
    enabled: !!(perf?.team_name && perf?.league_id),
  });

  const [shareTeamLogoUrl, setShareTeamLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setShareTeamLogoUrl(null);
    if (!perf?.team_name || !perf?.league_id) return;
    void getTeamLogoCached({ leagueId: perf.league_id, teamName: perf.team_name }).then((url) => {
      if (!cancelled) setShareTeamLogoUrl(url);
    });
    return () => { cancelled = true; };
  }, [perf?.team_name, perf?.league_id]);

  const tsPct = useMemo(() => {
    if (!perf) return "—";
    return perf.ts_pct !== null && perf.ts_pct !== undefined
      ? `${(Number(perf.ts_pct) * 100).toFixed(1)}`
      : "—";
  }, [perf]);

  const goToPerformance = () => {
    if (!perf) return;
    if (playerSlug) setLocation(`/player/${playerSlug}`);
    else if (perf.player_id) setLocation(`/player/${perf.player_id}`);
  };

  if (isLoading) {
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

  if (!perf) return null;

  const generateCardBlob = () => generateTrendingCardBlob({
    playerName: perf.full_name,
    teamName: perf.team_name,
    gameDate: perf.game_date,
    opponentName: perf.opponent_name,
    gameResult: perf.game_result,
    tsPct,
    gmSc: perf.game_score,
    pts: perf.pts,
    reb: perf.reb,
    ast: perf.ast,
    stl: perf.stl,
    blk: perf.blk,
    tov: perf.tov,
    fgm: perf.fgm ?? null,
    fga: perf.fga,
    ftm: perf.ftm ?? null,
    fta: perf.fta,
    photoUrl,
    teamLogoUrl: shareTeamLogoUrl,
    leagueName,
    isDark,
    cardWidth: 560,
  });

  return (
    <div className="w-full max-w-xl mb-6 md:mb-8 text-left">
      <ShareableCard
        title="Top Performance"
        fileSlug={`trending-${perf.player_id}-${perf.game_date}`}
        player={{
          name: perf.full_name,
          team: perf.team_name || leagueName || "",
          photoUrl,
          primaryColor,
          teamLogoUrl: shareTeamLogoUrl,
        }}
        shareCaption={leagueName ? `${leagueName} • ${formatDate(perf.game_date)}` : formatDate(perf.game_date)}
        generateCardBlob={generateCardBlob}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={goToPerformance}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToPerformance(); }
          }}
          className="group block w-full text-left rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-500/50 transition-all p-4 md:p-5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400"
          data-testid="trending-performance-card"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3 pr-10">
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
          </div>

          {/* Player + meta */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-amber-100 dark:from-neutral-800 dark:to-neutral-800 flex items-center justify-center flex-shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt={perf.full_name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-orange-600 dark:text-orange-300 font-bold text-sm">
                  {perf.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 dark:text-white truncate">{perf.full_name}</div>
              <div className="flex items-center gap-1.5 text-xs md:text-sm text-slate-500 dark:text-slate-400 truncate">
                {perf.team_name && (
                  <>
                    <TeamLogo teamName={perf.team_name} leagueId={perf.league_id} size="xs" className="!w-5 !h-5" />
                    <span className="sr-only">{perf.team_name}</span>
                  </>
                )}
                {perf.opponent_name ? (
                  <>
                    <span aria-hidden="true">vs</span>
                    <span className="truncate">{perf.opponent_name}</span>
                    {perf.game_result && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={`font-semibold shrink-0 ${perf.game_result.startsWith("W") ? "text-green-600 dark:text-green-400" : perf.game_result.startsWith("L") ? "text-red-500 dark:text-red-400" : ""}`}>
                          {perf.game_result}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span>{formatDate(perf.game_date)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200 dark:border-neutral-800 mb-3" />

          {/* Stats grid */}
          <StatBlock perf={perf} tsPct={tsPct} />
        </div>
      </ShareableCard>

      {/* Carousel dots */}
      {perfs.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {perfs.map((p, i) => (
            <button
              key={`${p.league_id}-${p.player_id}-${p.game_date}`}
              type="button"
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              aria-label={`Show performance ${i + 1} of ${perfs.length}`}
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
