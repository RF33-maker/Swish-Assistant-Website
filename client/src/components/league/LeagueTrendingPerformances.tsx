import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TeamLogo } from "@/components/TeamLogo";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";
import ShareableCard from "@/components/ShareableCard";
import { useTeamBranding } from "@/hooks/useTeamBranding";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

interface PerfRow {
  league_id: string;
  week_start: string | null;
  week_end: string | null;
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
  weekly_score: number | null;
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

/** Builds the compact capture card — pixel-matches the on-screen league card. */
function buildCompactCard({
  perf,
  tsPct,
  photoUrl,
  leagueName,
  isDark,
}: {
  perf: PerfRow;
  tsPct: string;
  photoUrl: string | null;
  leagueName: string | undefined;
  isDark: boolean;
}) {
  const CARD_W = 480;
  const bg         = isDark ? "#171717" : "#ffffff";
  const border     = isDark ? "#262626" : "#e2e8f0";
  const titleColor = isDark ? "#f1f5f9" : "#0f172a";
  const nameColor  = isDark ? "#f1f5f9" : "#0f172a";
  const metaColor  = isDark ? "#94a3b8" : "#64748b";
  const divider    = isDark ? "#262626" : "#e2e8f0";
  const statValue  = isDark ? "#ffffff"  : "#0f172a";
  const statLabel  = isDark ? "#94a3b8"  : "#64748b";
  const accent     = "#f97316";
  const watermark  = "#ffffff";
  const avatarBg   = isDark ? "#374151"  : "linear-gradient(135deg, #ffedd5, #fef9c3)";

  const initials = perf.full_name
    .split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const row1 = [
    { label: "WS",  value: perf.weekly_score ?? 0 },
    { label: "PTS", value: perf.pts ?? 0 },
    { label: "REB", value: perf.reb ?? 0 },
    { label: "AST", value: perf.ast ?? 0 },
    { label: "STL", value: perf.stl ?? 0 },
  ];
  const row2 = [
    { label: "BLK", value: perf.blk ?? 0 },
    { label: "TOV", value: perf.tov ?? 0 },
    { label: "FGA", value: perf.fga ?? 0 },
    { label: "FTA", value: perf.fta ?? 0 },
    { label: "TS%", value: tsPct },
  ];

  const StatCell = ({ label, value }: { label: string; value: string | number }) => (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontWeight: 700, fontSize: 20, color: statValue, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span style={{ fontSize: 9, color: statLabel, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
        {label}
      </span>
    </div>
  );

  return (
    <div
      style={{
        width: CARD_W,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: 16,
        padding: 18,
        fontFamily: "system-ui, -apple-system, ui-sans-serif, sans-serif",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: titleColor, lineHeight: 1 }}>
          Trending Performance
        </span>
        {leagueName && (
          <span style={{ fontWeight: 600, fontSize: 9, color: accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {leagueName}
          </span>
        )}
      </div>

      {/* Player row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
          background: avatarBg,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {photoUrl ? (
            <img src={photoUrl} alt={perf.full_name} crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ color: "#ea580c", fontWeight: 700, fontSize: 13 }}>{initials}</span>
          )}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: nameColor, lineHeight: 1.3 }}>
            {perf.full_name}
          </div>
          <div style={{ fontSize: 11, color: metaColor, marginTop: 2 }}>
            {formatDate(perf.week_start)}{perf.team_name ? ` • ${perf.team_name}` : ""}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, backgroundColor: divider, marginBottom: 14 }} />

      {/* Stats row 1 — flex so each cell is exactly 1/5 width, no boxes */}
      <div style={{ display: "flex" }}>
        {row1.map((s) => <StatCell key={s.label} {...s} />)}
      </div>

      <div style={{ height: 10 }} />

      {/* Stats row 2 */}
      <div style={{ display: "flex" }}>
        {row2.map((s) => <StatCell key={s.label} {...s} />)}
      </div>

      {/* Watermark strip — bleeds to card edges so white text is always legible */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7,
        marginTop: 14, marginLeft: -18, marginRight: -18, marginBottom: -18,
        padding: "7px 18px",
        backgroundColor: "#0f172a",
        borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
      }}>
        <img src={SwishLogo} alt="" crossOrigin="anonymous" style={{ height: 16, width: "auto", display: "block", verticalAlign: "middle" }} />
        <span style={{ fontSize: 10, color: watermark, fontWeight: 600, lineHeight: 1, verticalAlign: "middle" }}>
          www.swishassistant.com
        </span>
      </div>
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
    else if (perf.league_id) setLocation(`/competition/${perf.league_id}`);
  };

  const captureCard = buildCompactCard({ perf, tsPct, photoUrl, leagueName, isDark });

  return (
    <ShareableCard
      title="Top Performance"
      fileSlug={`trending-${perf.player_id}-${perf.week_start}`}
      player={{
        name: perf.full_name,
        team: perf.team_name || leagueName || "",
        photoUrl,
        primaryColor,
        teamLogoUrl: shareTeamLogoUrl,
      }}
      shareCaption={leagueName ? `${leagueName} • ${formatDate(perf.week_start)}` : formatDate(perf.week_start)}
      captureCard={captureCard}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={goToPlayer}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToPlayer(); }
        }}
        className="group block w-full text-left rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-500/50 transition-all p-3 md:p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-orange-400 h-full"
        data-testid="league-trending-perf-card"
      >
        {/* Player avatar + name */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-10 w-10 rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-amber-100 dark:from-neutral-800 dark:to-neutral-800 flex items-center justify-center flex-shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt={perf.full_name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-orange-600 dark:text-orange-300 font-bold text-xs">
                {perf.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{perf.full_name}</div>
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 truncate">
              <span>{formatDate(perf.week_start)}</span>
              {perf.team_name && (
                <>
                  <span aria-hidden="true">·</span>
                  <TeamLogo teamName={perf.team_name} leagueId={perf.league_id} size="xs" className="!w-4 !h-4" />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-200 dark:border-neutral-800 mb-2" />

        {/* Stats — compact 5-col view (full 10 in download) */}
        <div className="grid grid-cols-5 gap-y-2 gap-x-1">
          <Stat label="WS"  value={perf.weekly_score ?? 0} />
          <Stat label="PTS" value={perf.pts ?? 0} />
          <Stat label="REB" value={perf.reb ?? 0} />
          <Stat label="AST" value={perf.ast ?? 0} />
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 p-3 animate-pulse">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-neutral-800" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-24 bg-slate-200 dark:bg-neutral-800 rounded" />
                  <div className="h-2.5 w-16 bg-slate-200 dark:bg-neutral-800 rounded" />
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-neutral-800 mb-2" />
              <div className="grid grid-cols-5 gap-1">
                {[0, 1, 2, 3, 4].map((j) => (
                  <div key={j} className="h-8 bg-slate-200 dark:bg-neutral-800 rounded" />
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
          Top Performances This Week
        </h3>
        <div
          className="flex-1 h-px"
          style={{ background: `linear-gradient(to right, ${accentColor}40, transparent)` }}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {perfs.map((perf) => (
          <PerfCard
            key={`${perf.player_id}-${perf.week_start}`}
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
