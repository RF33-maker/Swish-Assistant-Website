import { useState, useMemo } from "react";
import { Target } from "lucide-react";

export interface ShotData {
  id?: number | string;
  x: number;
  y: number;
  success: boolean;
  player_name?: string | null;
  player_id?: string | null;
  period?: number | null;
  team_no?: number | null;
  shot_type?: string | null;
  sub_type?: string | null;
  game_key?: string | null;
  action_number?: number | null;
  created_at?: string | null;
}

interface ShotChartFilters {
  showPlayerFilter?: boolean;
  showQuarterFilter?: boolean;
  showTeamFilter?: boolean;
  showResultFilter?: boolean;
  showShotTypeFilter?: boolean;
  showSubTypeFilter?: boolean;
  teamNames?: { home?: string; away?: string };
}

interface ShotChartProps {
  shots: ShotData[];
  filters?: ShotChartFilters;
  title?: string;
  loading?: boolean;
  emptyMessage?: string;
  compact?: boolean;
  pulseRecent?: boolean;
}

const CW = 500;
const CH = 470;

const COLOR_BG = "#152234";
const COLOR_LINE = "#3a5878";
const COLOR_LINE_SOFT = "#2c4763";
const COLOR_PAINT = "rgba(58,88,120,0.18)";
const COLOR_MADE = "#f59e3b";
const COLOR_AVG = "#7a8b9c";
const COLOR_MISSED = "#5b9fbf";

function HalfCourt() {
  const baselineY = 0;
  const halfCourtY = CH;
  const centerX = CW / 2;

  const basketCY = 47;
  const rimR = 7.5;

  const bbHalf = 30;
  const bbY = basketCY - rimR - 4;

  const raR = 40;

  const paintW = 160;
  const paintTop = baselineY;
  const paintBot = 190;
  const paintL = centerX - paintW / 2;
  const paintR = centerX + paintW / 2;

  const ftRadius = 60;

  const tpR = 221.5;
  const cornerLineX_L = centerX - tpR;
  const cornerLineX_R = centerX + tpR;
  const cornerEndY = 140;

  const lw = 1.5;

  return (
    <>
      {/* Court background */}
      <rect x="0" y="0" width={CW} height={CH} fill={COLOR_BG} rx="6" />

      {/* Outer boundary */}
      <rect
        x="1"
        y="1"
        width={CW - 2}
        height={CH - 2}
        fill="none"
        stroke={COLOR_LINE}
        strokeWidth={lw}
        rx="6"
      />

      {/* Half court line */}
      <line x1="0" y1={halfCourtY - 1} x2={CW} y2={halfCourtY - 1} stroke={COLOR_LINE} strokeWidth={lw} />

      {/* Half-court arc (top half visible from below) */}
      <path
        d={`M ${centerX - 60} ${halfCourtY} A 60 60 0 0 1 ${centerX + 60} ${halfCourtY}`}
        fill="none"
        stroke={COLOR_LINE_SOFT}
        strokeWidth={lw}
      />

      {/* Paint */}
      <rect
        x={paintL}
        y={paintTop}
        width={paintW}
        height={paintBot - paintTop}
        fill={COLOR_PAINT}
        stroke={COLOR_LINE}
        strokeWidth={lw}
      />

      {/* Free throw circle (top arc - solid) */}
      <path
        d={`M ${centerX - ftRadius} ${paintBot} A ${ftRadius} ${ftRadius} 0 0 1 ${centerX + ftRadius} ${paintBot}`}
        fill={COLOR_PAINT}
        stroke={COLOR_LINE}
        strokeWidth={lw}
      />
      {/* Free throw circle (bottom arc - dashed) */}
      <path
        d={`M ${centerX - ftRadius} ${paintBot} A ${ftRadius} ${ftRadius} 0 0 0 ${centerX + ftRadius} ${paintBot}`}
        fill="none"
        stroke={COLOR_LINE_SOFT}
        strokeWidth={lw}
        strokeDasharray="4,4"
      />

      {/* Three point line - corners */}
      <line x1={cornerLineX_L} y1={baselineY} x2={cornerLineX_L} y2={cornerEndY} stroke={COLOR_LINE} strokeWidth={lw} />
      <line x1={cornerLineX_R} y1={baselineY} x2={cornerLineX_R} y2={cornerEndY} stroke={COLOR_LINE} strokeWidth={lw} />

      {/* Three point arc */}
      <path
        d={`M ${cornerLineX_L} ${cornerEndY} A ${tpR} ${tpR} 0 0 0 ${cornerLineX_R} ${cornerEndY}`}
        fill="none"
        stroke={COLOR_LINE}
        strokeWidth={lw}
      />

      {/* Backboard */}
      <line x1={centerX - bbHalf} y1={bbY} x2={centerX + bbHalf} y2={bbY} stroke={COLOR_LINE} strokeWidth={lw + 1} />

      {/* Rim */}
      <circle cx={centerX} cy={basketCY} r={rimR} fill="none" stroke={COLOR_LINE} strokeWidth={lw} />

      {/* Restricted area */}
      <path
        d={`M ${centerX - raR} ${basketCY} A ${raR} ${raR} 0 0 0 ${centerX + raR} ${basketCY}`}
        fill="none"
        stroke={COLOR_LINE_SOFT}
        strokeWidth={lw}
      />
    </>
  );
}

interface ZoneInfo {
  key: string;
  label: string;
}

const ZONES: ZoneInfo[] = [
  { key: "ra", label: "Restricted" },
  { key: "paint", label: "Paint (non-RA)" },
  { key: "mid", label: "Mid-range" },
  { key: "arc3", label: "Arc 3" },
  { key: "lc3", label: "L Corner 3" },
  { key: "rc3", label: "R Corner 3" },
];

/**
 * Fold a shot from the legacy full-court coordinate space (0-100 horizontal,
 * 0-100 vertical, two baskets at x≈5 and x≈95) into a vertical half-court
 * view (basket at top center). Returns x/y in viewBox units plus zone key.
 */
function projectShot(shot: ShotData): { sx: number; sy: number; zone: string } {
  let fx = shot.x;
  if (fx > 50) fx = 100 - fx;

  const sx = (shot.y / 100) * CW;
  const sy = (fx / 50) * CH;

  // Compute zone using folded coords
  const centerX = CW / 2;
  const basketCY = 47;
  const dx = sx - centerX;
  const dy = sy - basketCY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const tpR = 221.5;
  const cornerLineX_L = centerX - tpR;
  const cornerLineX_R = centerX + tpR;
  const cornerEndY = 140;
  const raR = 40;
  const paintHalfW = 80;
  const paintBot = 190;

  // Three-point shot?
  const isThree =
    shot.shot_type === "3pt" ||
    sx < cornerLineX_L ||
    sx > cornerLineX_R ||
    dist > tpR;

  let zone = "mid";
  if (isThree) {
    if (sy <= cornerEndY && sx < cornerLineX_L + 5) zone = "lc3";
    else if (sy <= cornerEndY && sx > cornerLineX_R - 5) zone = "rc3";
    else zone = "arc3";
  } else if (dist <= raR) {
    zone = "ra";
  } else if (Math.abs(dx) <= paintHalfW && sy <= paintBot) {
    zone = "paint";
  } else {
    zone = "mid";
  }

  return { sx, sy, zone };
}

export default function ShotChart({
  shots,
  filters = {},
  title,
  loading = false,
  emptyMessage = "No shot data available",
  compact = false,
  pulseRecent = false,
}: ShotChartProps) {
  const {
    showPlayerFilter = false,
    showQuarterFilter = false,
    showTeamFilter = false,
    showResultFilter = false,
    showShotTypeFilter = false,
    showSubTypeFilter = false,
    teamNames,
  } = filters;

  const [playerFilter, setPlayerFilter] = useState("all");
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");
  const [shotTypeFilter, setShotTypeFilter] = useState("all");
  const [subTypeFilter, setSubTypeFilter] = useState("all");

  const players = useMemo(() => {
    const map = new Map<string, string>();
    shots.forEach((s) => {
      if (s.player_id && s.player_name) {
        map.set(s.player_id, s.player_name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [shots]);

  const subTypes = useMemo(() => {
    const set = new Set<string>();
    shots.forEach((s) => {
      if (s.sub_type) set.add(s.sub_type);
    });
    return Array.from(set).sort();
  }, [shots]);

  const filteredShots = useMemo(() => {
    return shots.filter((shot) => {
      if (playerFilter !== "all" && shot.player_id !== playerFilter) return false;
      if (quarterFilter !== "all" && shot.period?.toString() !== quarterFilter) return false;
      if (teamFilter !== "all" && shot.team_no?.toString() !== teamFilter) return false;
      if (resultFilter === "makes" && !shot.success) return false;
      if (resultFilter === "misses" && shot.success) return false;
      if (shotTypeFilter !== "all" && shot.shot_type !== shotTypeFilter) return false;
      if (subTypeFilter !== "all" && shot.sub_type !== subTypeFilter) return false;
      return true;
    });
  }, [shots, playerFilter, quarterFilter, teamFilter, resultFilter, shotTypeFilter, subTypeFilter]);

  const projected = useMemo(
    () =>
      filteredShots.map((shot, idx) => ({
        shot,
        idx,
        ...projectShot(shot),
      })),
    [filteredShots]
  );

  const recentIds = useMemo(() => {
    if (!pulseRecent || filteredShots.length === 0) return new Set<number | string>();
    const sorted = [...filteredShots]
      .filter((s) => s.action_number != null || s.created_at != null)
      .sort((a, b) => {
        if (a.action_number != null && b.action_number != null) return b.action_number - a.action_number;
        if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at);
        return 0;
      });
    const top = sorted.slice(0, Math.max(5, Math.ceil(sorted.length * 0.1)));
    return new Set(top.map((s) => s.id!).filter(Boolean));
  }, [filteredShots, pulseRecent]);

  const makes = filteredShots.filter((s) => s.success).length;
  const total = filteredShots.length;
  const percentage = total > 0 ? ((makes / total) * 100).toFixed(1) : "0.0";

  const overallPct = total > 0 ? makes / total : 0;

  const zoneStats = useMemo(() => {
    const totals: Record<string, { made: number; total: number }> = {};
    ZONES.forEach((z) => (totals[z.key] = { made: 0, total: 0 }));
    projected.forEach((p) => {
      const z = totals[p.zone];
      if (!z) return;
      z.total += 1;
      if (p.shot.success) z.made += 1;
    });
    return totals;
  }, [projected]);

  const hasFilters =
    showPlayerFilter || showQuarterFilter || showTeamFilter || showResultFilter || showShotTypeFilter || showSubTypeFilter;

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
        <p className="mt-4 text-slate-600 dark:text-slate-400">Loading shot data...</p>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="p-8 md:p-12 text-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-800 dark:to-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700">
        <Target className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">No Shot Data Available</h3>
        <p className="text-slate-600 dark:text-slate-400 max-w-md mx-auto">{emptyMessage}</p>
      </div>
    );
  }

  const formatSubType = (st: string) =>
    st.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

  const dotR = compact ? 4 : 5;

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-orange-500" />
          {title}
        </h3>
      )}

      {hasFilters && (
        <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-neutral-700">
          <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-start md:items-center justify-between">
            <div className="flex flex-wrap gap-2 md:gap-3 w-full md:w-auto">
              {showPlayerFilter && players.length > 0 && (
                <select
                  value={playerFilter}
                  onChange={(e) => setPlayerFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
                >
                  <option value="all">All Players</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}

              {showQuarterFilter && (
                <select
                  value={quarterFilter}
                  onChange={(e) => setQuarterFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
                >
                  <option value="all">All Quarters</option>
                  <option value="1">Q1</option>
                  <option value="2">Q2</option>
                  <option value="3">Q3</option>
                  <option value="4">Q4</option>
                </select>
              )}

              {showTeamFilter && (
                <select
                  value={teamFilter}
                  onChange={(e) => setTeamFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
                >
                  <option value="all">Both Teams</option>
                  <option value="1">{teamNames?.home || "Home"}</option>
                  <option value="2">{teamNames?.away || "Away"}</option>
                </select>
              )}

              {showShotTypeFilter && (
                <select
                  value={shotTypeFilter}
                  onChange={(e) => setShotTypeFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
                >
                  <option value="all">All Shot Types</option>
                  <option value="2pt">2PT</option>
                  <option value="3pt">3PT</option>
                </select>
              )}

              {showSubTypeFilter && subTypes.length > 0 && (
                <select
                  value={subTypeFilter}
                  onChange={(e) => setSubTypeFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
                >
                  <option value="all">All Sub Types</option>
                  {subTypes.map((st) => (
                    <option key={st} value={st}>{formatSubType(st)}</option>
                  ))}
                </select>
              )}

              {showResultFilter && (
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
                >
                  <option value="all">All Shots</option>
                  <option value="makes">Makes Only</option>
                  <option value="misses">Misses Only</option>
                </select>
              )}
            </div>

            <div className="text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap font-medium">
              <span className="font-bold text-orange-600 dark:text-orange-400">{makes}/{total}</span>{" "}
              ({percentage}%)
            </div>
          </div>
        </div>
      )}

      {!hasFilters && (
        <div className="flex items-center justify-between px-1">
          <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">
            <span className="font-bold text-orange-600 dark:text-orange-400">{makes}/{total}</span>{" "}
            ({percentage}%)
          </div>
        </div>
      )}

      <div className="rounded-xl p-4 md:p-5 border border-slate-700/50" style={{ backgroundColor: COLOR_BG }}>
        {/* Header inside the dark panel */}
        <div className="flex items-baseline justify-between mb-3 md:mb-4">
          <div>
            <div className="text-white font-bold text-base md:text-lg leading-tight">Shot chart</div>
            <div className="text-slate-400 text-xs md:text-sm mt-0.5 tabular-nums">
              {makes}-{total} FG ({percentage}%)
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
          {/* Court */}
          <div className="flex-1 min-w-0">
            <div className="mx-auto" style={{ maxWidth: compact ? 420 : 560 }}>
              <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full h-auto">
                <defs>
                  <filter id="shotGlowMade" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.2" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <HalfCourt />

                {projected.map(({ shot, sx, sy, idx }) => {
                  const isRecent = pulseRecent && shot.id != null && recentIds.has(shot.id);
                  const fill = shot.success ? COLOR_MADE : COLOR_MISSED;
                  const r = dotR;

                  return (
                    <g
                      key={shot.id ?? idx}
                      transform={`translate(${sx} ${sy}) rotate(45)`}
                      style={{
                        animation: `shotFadeIn 0.4s ease-out ${Math.min(idx * 0.006, 1.4)}s both`,
                      }}
                    >
                      {isRecent && (
                        <rect
                          x={-r - 3}
                          y={-r - 3}
                          width={(r + 3) * 2}
                          height={(r + 3) * 2}
                          fill="none"
                          stroke={fill}
                          strokeWidth="1.5"
                          opacity="0.55"
                          className="shot-pulse"
                        />
                      )}
                      <rect
                        x={-r}
                        y={-r}
                        width={r * 2}
                        height={r * 2}
                        fill={fill}
                        opacity={shot.success ? 0.92 : 0.78}
                        stroke={shot.success ? "#fff" : "transparent"}
                        strokeWidth={shot.success ? 0.4 : 0}
                        filter={shot.success ? "url(#shotGlowMade)" : undefined}
                        className="shot-dot"
                      >
                        <title>
                          {[
                            shot.player_name,
                            shot.success ? "Made" : "Missed",
                            shot.shot_type?.toUpperCase(),
                            shot.sub_type ? formatSubType(shot.sub_type) : null,
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </title>
                      </rect>
                    </g>
                  );
                })}
              </svg>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 md:gap-6 mt-3 text-[11px] md:text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5"
                    style={{ background: COLOR_MISSED, transform: "rotate(45deg)" }}
                  />
                  <span className="text-slate-300">Missed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5"
                    style={{ background: COLOR_AVG, transform: "rotate(45deg)" }}
                  />
                  <span className="text-slate-300">Avg</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5"
                    style={{ background: COLOR_MADE, transform: "rotate(45deg)" }}
                  />
                  <span className="text-slate-300">Made</span>
                </div>
              </div>
            </div>
          </div>

          {/* Zone breakdown */}
          <div className="lg:w-44 flex-shrink-0 grid grid-cols-2 lg:grid-cols-1 gap-x-4 gap-y-3 lg:gap-y-4">
            {ZONES.map((z) => {
              const s = zoneStats[z.key];
              const pct = s.total > 0 ? (s.made / s.total) * 100 : null;
              const color =
                pct === null
                  ? "text-slate-500"
                  : overallPct > 0 && pct / 100 > overallPct + 0.03
                  ? "text-orange-400"
                  : overallPct > 0 && pct / 100 < overallPct - 0.03
                  ? "text-sky-400"
                  : "text-slate-200";
              return (
                <div key={z.key} className="leading-tight">
                  <div className={`font-bold tabular-nums text-xl md:text-2xl ${color}`}>
                    {pct === null ? "—" : pct.toFixed(1)}
                    {pct !== null && <span className="text-sm md:text-base">%</span>}
                  </div>
                  <div className="text-[10px] md:text-[11px] uppercase tracking-wide text-slate-400 mt-0.5">
                    {z.label}
                    {s.total > 0 && (
                      <span className="text-slate-500 normal-case tracking-normal"> · {s.made}-{s.total}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shotFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes shotPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.15; }
        }
        .shot-pulse {
          animation: shotPulse 2s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
      `}</style>
    </div>
  );
}
