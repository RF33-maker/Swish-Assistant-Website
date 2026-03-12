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
}

interface ShotChartFilters {
  showPlayerFilter?: boolean;
  showQuarterFilter?: boolean;
  showTeamFilter?: boolean;
  showResultFilter?: boolean;
  teamNames?: { home?: string; away?: string };
}

interface ShotChartProps {
  shots: ShotData[];
  filters?: ShotChartFilters;
  title?: string;
  loading?: boolean;
  emptyMessage?: string;
  compact?: boolean;
}

const COURT_WIDTH = 500;
const COURT_HEIGHT = 470;

function BasketballCourt() {
  return (
    <>
      <rect x="0" y="0" width={COURT_WIDTH} height={COURT_HEIGHT} fill="#f8f0e3" stroke="#c4956a" strokeWidth="2" rx="4"/>
      <line x1="0" y1="235" x2="500" y2="235" stroke="#c4956a" strokeWidth="1.5" strokeDasharray="6,4"/>
      <circle cx="250" cy="235" r="60" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <circle cx="250" cy="235" r="4" fill="#c4956a"/>
      <rect x="0" y="152.5" width="190" height="165" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <rect x="0" y="187.5" width="60" height="95" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <circle cx="60" cy="235" r="60" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <path d="M 0 62 Q 135 235 0 408" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <line x1="25" y1="235" x2="35" y2="235" stroke="#c4956a" strokeWidth="2"/>
      <circle cx="30" cy="235" r="3" fill="#c4956a"/>
      <rect x="310" y="152.5" width="190" height="165" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <rect x="440" y="187.5" width="60" height="95" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <circle cx="440" cy="235" r="60" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <path d="M 500 62 Q 365 235 500 408" fill="none" stroke="#c4956a" strokeWidth="1.5"/>
      <line x1="465" y1="235" x2="475" y2="235" stroke="#c4956a" strokeWidth="2"/>
      <circle cx="470" cy="235" r="3" fill="#c4956a"/>
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
}: ShotChartProps) {
  const {
    showPlayerFilter = false,
    showQuarterFilter = false,
    showTeamFilter = false,
    showResultFilter = false,
    teamNames,
  } = filters;

  const [playerFilter, setPlayerFilter] = useState("all");
  const [quarterFilter, setQuarterFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("all");

  const players = useMemo(() => {
    const map = new Map<string, string>();
    shots.forEach((s) => {
      if (s.player_id && s.player_name) {
        map.set(s.player_id, s.player_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [shots]);

  const filteredShots = useMemo(() => {
    return shots.filter((shot) => {
      if (playerFilter !== "all" && shot.player_id !== playerFilter) return false;
      if (quarterFilter !== "all" && shot.period?.toString() !== quarterFilter) return false;
      if (teamFilter !== "all" && shot.team_no?.toString() !== teamFilter) return false;
      if (resultFilter === "makes" && !shot.success) return false;
      if (resultFilter === "misses" && shot.success) return false;
      return true;
    });
  }, [shots, playerFilter, quarterFilter, teamFilter, resultFilter]);

  const makes = filteredShots.filter((s) => s.success).length;
  const total = filteredShots.length;
  const percentage = total > 0 ? ((makes / total) * 100).toFixed(1) : "0.0";

  const hasFilters = showPlayerFilter || showQuarterFilter || showTeamFilter || showResultFilter;

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
        <div className={compact ? "max-w-lg mx-auto" : "max-w-2xl mx-auto"}>
          <svg viewBox={`0 0 ${COURT_WIDTH} ${COURT_HEIGHT}`} className="w-full h-auto">
            <defs>
              <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            <BasketballCourt />

            {filteredShots.map((shot, idx) => {
              const x = (shot.x / 100) * COURT_WIDTH;
              const y = (shot.y / 100) * COURT_HEIGHT;

              return (
                <g key={shot.id ?? idx}>
                  {shot.success ? (
                    <circle
                      cx={x}
                      cy={y}
                      r="7"
                      fill="#22c55e"
                      opacity="0.85"
                      stroke="#15803d"
                      strokeWidth="2"
                      filter="url(#glow-green)"
                      className="shot-dot"
                      style={{
                        animation: `shotFadeIn 0.4s ease-out ${idx * 0.02}s both`,
                      }}
                    >
                      <title>{shot.player_name ? `${shot.player_name} - Made` : "Made shot"}</title>
                    </circle>
                  ) : (
                    <circle
                      cx={x}
                      cy={y}
                      r="7"
                      fill="none"
                      opacity="0.85"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      filter="url(#glow-red)"
                      className="shot-dot"
                      style={{
                        animation: `shotFadeIn 0.4s ease-out ${idx * 0.02}s both`,
                      }}
                    >
                      <title>{shot.player_name ? `${shot.player_name} - Missed` : "Missed shot"}</title>
                    </circle>
                  )}
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
      `}</style>
    </div>
  );
}
