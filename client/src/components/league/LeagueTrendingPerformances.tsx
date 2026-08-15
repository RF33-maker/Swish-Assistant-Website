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

interface TrendingData {
  perfs: PerfRow[];
  leagueNames: Record<string, string>;
  playerMeta: Record<string, { slug: string | null; photoUrl: string | null }>;
}

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
    <div className="flex flex-col items-center min-w-[36px]">
      <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">{value}</span>
      <span className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}


function PerfCard({
  perf,
  playerMeta,
  leagueName,
}: {
  perf: PerfRow;
  playerMeta: TrendingData["playerMeta"];
  leagueName: string | undefined;
  brandColor: string;
}) {
  const [, setLocation] = useLocation();
  const meta = playerMeta[perf.player_id];
  const photoUrl = meta?.photoUrl || null;
  const playerSlug = meta?.slug || null;

  const { primaryColor } = useTeamBranding({
    teamName: perf.team_name || "",
    leagueId: perf.league_id || "",
    enabled: !!(perf.team_name && perf.league_id),
  });

  const [shareTeamLogoUrl, setShareTeamLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setShareTeamLogoUrl(null);
    if (!perf.team_name || !perf.league_id) return;
    void getTeamLogoCached({ leagueId: perf.league_id, teamName: perf.team_name }).then((url) => {
      if (!cancelled) setShareTeamLogoUrl(url);
    });
    return () => { cancelled = true; };
  }, [perf.team_name, perf.league_id]);

  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    if (typeof document === "undefined") return;
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const tsPct = useMemo(() => {
    return perf.ts_pct !== null && perf.ts_pct !== undefined
      ? `${(Number(perf.ts_pct) * 100).toFixed(1)}`
      : "—";
  }, [perf.ts_pct]);

  const goToPlayer = () => {
    if (playerSlug) setLocation(`/player/${playerSlug}`);
    else if (perf.player_id) setLocation(`/player/${perf.player_id}`);
  };

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
    cardWidth: 480,
  });

  return (
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
        onClick={goToPlayer}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToPlayer(); }
        }}
        className="group w-full text-left rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-500/50 transition-all px-3 pt-2.5 pb-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400"
        data-testid="league-trending-perf-card"
      >
        {/* Top row: avatar + name + team — pr-9 leaves room for the share button */}
        <div className="flex items-center gap-2.5 pr-9 mb-2">
          <div className="h-8 w-8 rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-amber-100 dark:from-neutral-800 dark:to-neutral-800 flex items-center justify-center flex-shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt={perf.full_name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-orange-600 dark:text-orange-300 font-bold text-xs">
                {perf.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-slate-900 dark:text-white truncate leading-tight">{perf.full_name}</div>
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {perf.team_name && (
                <>
                  <TeamLogo teamName={perf.team_name} leagueId={perf.league_id} size="xs" className="!w-3.5 !h-3.5 shrink-0" />
                </>
              )}
              {perf.opponent_name ? (
                <>
                  <span className="shrink-0">vs</span>
                  <span className="truncate">{perf.opponent_name}</span>
                  {perf.game_result && (
                    <>
                      <span aria-hidden="true" className="shrink-0">·</span>
                      <span className={`font-semibold shrink-0 ${perf.game_result.startsWith("W") ? "text-green-600 dark:text-green-400" : perf.game_result.startsWith("L") ? "text-red-500 dark:text-red-400" : ""}`}>
                        {perf.game_result}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span className="shrink-0">{formatDate(perf.game_date)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-100 dark:border-neutral-800 mb-2" />

        {/* Stats — full width, evenly spaced */}
        <div className="flex items-center justify-between">
          <Stat label="GmSc" value={perf.game_score ?? 0} />
          <Stat label="PTS" value={perf.pts ?? 0} />
          <Stat label="REB" value={perf.reb ?? 0} />
          <Stat label="AST" value={perf.ast ?? 0} />
          <Stat label="STL" value={perf.stl ?? 0} />
          <Stat label="BLK" value={perf.blk ?? 0} />
          <Stat label="TS%" value={tsPct} />
        </div>
      </div>
    </ShareableCard>
  );
}

interface Props {
  leagueSlug: string;
  brandColor?: string;
}

export default function LeagueTrendingPerformances({ leagueSlug, brandColor }: Props) {
  const { data, isLoading } = useQuery<TrendingData>({
    queryKey: ["league", leagueSlug, "trending-performances"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const empty: TrendingData = { perfs: [], leagueNames: {}, playerMeta: {} };
      try {
        const res = await fetch(`/api/league/${leagueSlug}/trending-performances`);
        if (!res.ok) return empty;
        const json = await res.json() as {
          perfs: PerfRow[];
          leagueNames: Record<string, string>;
          playerMeta: Record<string, { slug: string | null; photo_path_bg_removed: string | null }>;
        };
        const playerMeta: TrendingData["playerMeta"] = {};
        for (const [id, meta] of Object.entries(json.playerMeta || {})) {
          playerMeta[id] = {
            slug: meta.slug,
            photoUrl: getPlayerPhotoUrlCached(meta.photo_path_bg_removed),
          };
        }
        return { perfs: json.perfs || [], leagueNames: json.leagueNames || {}, playerMeta };
      } catch (err) {
        console.error("[LeagueTrendingPerf] fetch error", err);
        return empty;
      }
    },
  });

  const perfs = data?.perfs ?? [];
  const leagueNames = data?.leagueNames ?? {};
  const playerMeta = data?.playerMeta ?? {};

  if (isLoading) {
    return (
      <div className="w-full py-4 px-4 md:px-6">
        <div className="h-5 w-48 bg-slate-200 dark:bg-neutral-800 rounded animate-pulse mb-3" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 px-3 py-2.5 animate-pulse">
              <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-neutral-800 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 bg-slate-200 dark:bg-neutral-800 rounded" />
                <div className="h-2.5 w-20 bg-slate-200 dark:bg-neutral-800 rounded" />
              </div>
              <div className="flex gap-4 shrink-0">
                {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                  <div key={j} className="h-8 w-8 bg-slate-200 dark:bg-neutral-800 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (perfs.length === 0) return null;

  const accentColor = brandColor || "#f97316";

  return (
    <div className="w-full py-4 px-4 md:px-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wide">
          Top Performances
        </h3>
        <div
          className="flex-1 h-px"
          style={{ background: `linear-gradient(to right, ${accentColor}40, transparent)` }}
        />
      </div>
      <div className="flex flex-col gap-2">
        {perfs.map((perf) => (
          <PerfCard
            key={`${perf.player_id}-${perf.game_date}`}
            perf={perf}
            playerMeta={playerMeta}
            leagueName={leagueNames[perf.league_id]}
            brandColor={accentColor}
          />
        ))}
      </div>
    </div>
  );
}
