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

const CW = 940;
const CH = 500;

function BasketballCourt() {
  const basketL = 52.5;
  const basketR = 887.5;
  const cy = 250;

  const paintL = 190;
  const paintR = 750;
  const paintTop = 170;
  const paintBot = 330;

  const ftRadius = 60;

  const bbL = 40;
  const bbR = 900;
  const bbTop = 220;
  const bbBot = 280;

  const rimR = 7.5;

  const raR = 40;

  const tpR = 237.5;
  const cornerY_top = 30;
  const cornerY_bot = 470;
  const arcStartL = 142;
  const arcStartR = 798;

  const centerX = 470;
  const centerR = 60;

  const lineColor = "#b8956a";
  const courtFill = "#e8d5b7";
  const paintFill = "rgba(184,149,106,0.08)";
  const lw = 2;

  return (
    <>
      <rect x="0" y="0" width={CW} height={CH} fill={courtFill} rx="3" />
      <rect x="0" y="0" width={CW} height={CH} fill="none" stroke={lineColor} strokeWidth={lw + 1} rx="3" />

      <rect x="0" y={paintTop} width={paintL} height={paintBot - paintTop} fill={paintFill} stroke={lineColor} strokeWidth={lw} />
      <rect x={paintR} y={paintTop} width={CW - paintR} height={paintBot - paintTop} fill={paintFill} stroke={lineColor} strokeWidth={lw} />

      <circle cx={paintL} cy={cy} r={ftRadius} fill="none" stroke={lineColor} strokeWidth={lw} />
      <circle cx={paintR} cy={cy} r={ftRadius} fill="none" stroke={lineColor} strokeWidth={lw} />

      <line x1={bbL} y1={bbTop} x2={bbL} y2={bbBot} stroke={lineColor} strokeWidth={lw + 1} />
      <line x1={bbR} y1={bbTop} x2={bbR} y2={bbBot} stroke={lineColor} strokeWidth={lw + 1} />

      <circle cx={basketL} cy={cy} r={rimR} fill="none" stroke={lineColor} strokeWidth={lw} />
      <circle cx={basketR} cy={cy} r={rimR} fill="none" stroke={lineColor} strokeWidth={lw} />

      <path d={`M ${basketL + raR} ${cy - raR} A ${raR} ${raR} 0 0 1 ${basketL + raR} ${cy + raR}`} fill="none" stroke={lineColor} strokeWidth={lw} strokeDasharray="4,3" />
      <path d={`M ${basketR - raR} ${cy - raR} A ${raR} ${raR} 0 0 0 ${basketR - raR} ${cy + raR}`} fill="none" stroke={lineColor} strokeWidth={lw} strokeDasharray="4,3" />

      <line x1="0" y1={cornerY_top} x2={arcStartL} y2={cornerY_top} stroke={lineColor} strokeWidth={lw} />
      <line x1="0" y1={cornerY_bot} x2={arcStartL} y2={cornerY_bot} stroke={lineColor} strokeWidth={lw} />
      <path d={`M ${arcStartL} ${cornerY_top} A ${tpR} ${tpR} 0 1 1 ${arcStartL} ${cornerY_bot}`} fill="none" stroke={lineColor} strokeWidth={lw} />

      <line x1={CW} y1={cornerY_top} x2={arcStartR} y2={cornerY_top} stroke={lineColor} strokeWidth={lw} />
      <line x1={CW} y1={cornerY_bot} x2={arcStartR} y2={cornerY_bot} stroke={lineColor} strokeWidth={lw} />
      <path d={`M ${arcStartR} ${cornerY_top} A ${tpR} ${tpR} 0 1 0 ${arcStartR} ${cornerY_bot}`} fill="none" stroke={lineColor} strokeWidth={lw} />

      <line x1={centerX} y1="0" x2={centerX} y2={CH} stroke={lineColor} strokeWidth={lw} />
      <circle cx={centerX} cy={cy} r={centerR} fill="none" stroke={lineColor} strokeWidth={lw} />
      <circle cx={centerX} cy={cy} r="4" fill={lineColor} />
    </>
  );
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

  const hasFilters = showPlayerFilter || showQuarterFilter || showTeamFilter || showResultFilter || showShotTypeFilter || showSubTypeFilter;

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

      <div className="bg-white dark:bg-neutral-800 rounded-lg p-3 md:p-4 border border-gray-200 dark:border-neutral-700">
        <div className={compact ? "max-w-lg mx-auto" : "max-w-3xl mx-auto"}>
          <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full h-auto" style={{ maxHeight: "60vh" }}>
            <defs>
              <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <BasketballCourt />

            {filteredShots.map((shot, idx) => {
              const sx = (shot.x / 100) * CW;
              const sy = (shot.y / 100) * CH;
              const isRecent = pulseRecent && shot.id != null && recentIds.has(shot.id);
              const dotR = compact ? 5 : 6;

              return (
                <g key={shot.id ?? idx}>
                  {isRecent && (
                    <circle
                      cx={sx}
                      cy={sy}
                      r={dotR + 4}
                      fill="none"
                      stroke={shot.success ? "#22c55e" : "#ef4444"}
                      strokeWidth="2"
                      opacity="0.6"
                      className="shot-pulse"
                    />
                  )}
                  <circle
                    cx={sx}
                    cy={sy}
                    r={dotR}
                    fill={shot.success ? "#22c55e" : "transparent"}
                    opacity="0.85"
                    stroke={shot.success ? "#15803d" : "#ef4444"}
                    strokeWidth={shot.success ? 1.5 : 2.5}
                    filter={shot.success ? "url(#glow-green)" : "url(#glow-red)"}
                    className="shot-dot"
                    style={{
                      animation: `shotFadeIn 0.4s ease-out ${Math.min(idx * 0.008, 2)}s both`,
                    }}
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
                  </circle>
                </g>
              );
            })}
          </svg>

          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500 border-2 border-green-700 shadow-[0_0_6px_rgba(34,197,94,0.5)]"></div>
              <span className="text-slate-600 dark:text-slate-400">Made ({makes})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-[2.5px] border-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]"></div>
              <span className="text-slate-600 dark:text-slate-400">Missed ({total - makes})</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shotFadeIn {
          from {
            opacity: 0;
            transform: scale(0.3);
          }
          to {
            opacity: 0.85;
            transform: scale(1);
          }
        }
        @keyframes shotPulse {
          0%, 100% { opacity: 0.6; r: ${compact ? 9 : 10}; }
          50% { opacity: 0.15; r: ${compact ? 16 : 18}; }
        }
        .shot-pulse {
          animation: shotPulse 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
