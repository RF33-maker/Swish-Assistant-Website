import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ShareableCard from "@/components/ShareableCard";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// View type
// ---------------------------------------------------------------------------

/**
 * Columns currently returned by player_on_off_impact_profile_v1.
 *
 * Missing from the view (frontend placeholder only — will show "—" until
 * the Supabase view is updated to include them):
 *   on_oreb_pct / off_oreb_pct / diff_oreb_pct
 *   on_dreb_pct / off_dreb_pct / diff_dreb_pct
 *   on_reb_pct  / off_reb_pct  / diff_reb_pct
 *   on_ast_pct  / off_ast_pct  / diff_ast_pct
 *   on_blk_pct  / off_blk_pct  / diff_blk_pct
 *   on_stl_pct  / off_stl_pct  / diff_stl_pct
 *   on_tov_pct  / off_tov_pct  / diff_tov_pct
 */
interface PlayerOnOffImpactProfileRow {
  player_id: string;
  league_id?: string | null;
  team_id?: string | null;
  adjusted_net_swing: number | null;
  raw_net_swing: number | null;
  on_ortg: number | null;
  off_ortg: number | null;
  on_drtg: number | null;
  off_drtg: number | null;
  on_nrtg: number | null;
  off_nrtg: number | null;
  on_possessions_for: number | null;
  on_minutes: number | null;
  off_minutes: number | null;
  official_minutes_total: number | null;
  accuracy_label: string | null;
  sample_size_label: string | null;
  tracking_quality: string | null;
  confidence_explanation: string | null;
  profile_safe: boolean | null;
  // Percentage splits — not yet in the view; will be null until view is updated
  on_oreb_pct?: number | null;
  off_oreb_pct?: number | null;
  diff_oreb_pct?: number | null;
  on_dreb_pct?: number | null;
  off_dreb_pct?: number | null;
  diff_dreb_pct?: number | null;
  on_reb_pct?: number | null;
  off_reb_pct?: number | null;
  diff_reb_pct?: number | null;
  on_ast_pct?: number | null;
  off_ast_pct?: number | null;
  diff_ast_pct?: number | null;
  on_blk_pct?: number | null;
  off_blk_pct?: number | null;
  diff_blk_pct?: number | null;
  on_stl_pct?: number | null;
  off_stl_pct?: number | null;
  diff_stl_pct?: number | null;
  on_tov_pct?: number | null;
  off_tov_pct?: number | null;
  diff_tov_pct?: number | null;
}

interface PlayerPerformanceSplitsProps {
  playerId: string;
  leagueId?: string;
  teamId?: string;
  playerName?: string;
  playerTeam?: string;
  playerPhotoUrl?: string | null;
  primaryColor?: string;
  teamLogoUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Metric row definition
// ---------------------------------------------------------------------------

interface MetricRow {
  label: string;
  abbr: string;
  on: number | null | undefined;
  off: number | null | undefined;
  /** pre-computed diff from the view, or null to compute on-the-fly */
  diff: number | null | undefined;
  /** true = lower diff is better (DRTG, TOV%) */
  invertGood?: boolean;
  decimals?: number;
  /** true = show % suffix */
  pct?: boolean;
  /** true = this metric comes from a view column not yet deployed */
  missing?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(v: number | null | undefined, decimals = 1, pct = false): string {
  if (v == null) return "—";
  return `${v.toFixed(decimals)}${pct ? "%" : ""}`;
}

function fmtSigned(v: number | null | undefined, decimals = 1): string {
  if (v == null) return "—";
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(decimals)}`;
}

/**
 * Returns Tailwind text colour classes for a diff value.
 * neutral band: |diff| ≤ 3 → muted
 * invertGood: negative diff is green (DRTG, TOV%)
 */
function diffColor(
  diff: number | null | undefined,
  invertGood = false
): string {
  if (diff == null) return "text-slate-400 dark:text-slate-500";
  const abs = Math.abs(diff);
  if (abs <= 3) return "text-slate-500 dark:text-slate-400";
  const positive = diff > 0;
  const isGood = invertGood ? !positive : positive;
  return isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-500 dark:text-red-400";
}

// ---------------------------------------------------------------------------
// Badge sub-components
// ---------------------------------------------------------------------------

function SwingBadge({ swing }: { swing: number }) {
  if (swing > 3)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
        Positive
      </span>
    );
  if (swing < -3)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
        Negative
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-400 border border-slate-200 dark:border-neutral-700">
      Neutral
    </span>
  );
}

function AccuracyBadge({ label }: { label: string }) {
  const lower = label.toLowerCase();
  if (lower.includes("high"))
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
        {label}
      </span>
    );
  if (lower.includes("medium"))
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        {label}
      </span>
    );
  if (lower.includes("low") || lower.includes("directional"))
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
        {label}
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-400 border border-slate-200 dark:border-neutral-700">
      {label}
    </span>
  );
}

function SampleBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-400 border border-slate-200 dark:border-neutral-700">
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Metric table (shared between card and share snapshot)
// ---------------------------------------------------------------------------

function MetricTable({
  metrics,
  compact = false,
}: {
  metrics: MetricRow[];
  compact?: boolean;
}) {
  const cellPx = compact ? "6px 12px" : "8px 14px";
  const labelSize = compact ? 10 : 11;
  const valSize = compact ? 13 : 15;

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-neutral-700 overflow-hidden"
      style={{ fontSize: 14 }}
    >
      <table className="w-full">
        <thead className="bg-slate-50 dark:bg-neutral-800">
          <tr>
            <th
              className="text-left font-bold text-slate-500 uppercase"
              style={{ padding: cellPx, fontSize: labelSize, letterSpacing: "0.12em" }}
            />
            <th
              className="text-right font-bold text-slate-500 uppercase"
              style={{ padding: cellPx, fontSize: labelSize, letterSpacing: "0.12em" }}
            >
              On
            </th>
            <th
              className="text-right font-bold text-slate-500 uppercase"
              style={{ padding: cellPx, fontSize: labelSize, letterSpacing: "0.12em" }}
            >
              Off
            </th>
            <th
              className="text-right font-bold text-slate-500 uppercase"
              style={{ padding: cellPx, fontSize: labelSize, letterSpacing: "0.12em" }}
            >
              Diff
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m, idx) => {
            const computedDiff =
              m.diff != null
                ? m.diff
                : m.on != null && m.off != null
                ? m.on - m.off
                : null;
            const color = m.missing
              ? "text-slate-400 dark:text-slate-500"
              : diffColor(computedDiff, m.invertGood);
            const dec = m.decimals ?? 1;
            return (
              <tr
                key={m.abbr}
                className={`border-t border-slate-100 dark:border-neutral-700 ${
                  idx % 2 === 1 ? "bg-slate-50/60 dark:bg-neutral-800/30" : ""
                }`}
              >
                <td
                  className="font-semibold uppercase text-slate-600 dark:text-slate-400"
                  style={{ padding: cellPx, fontSize: labelSize, letterSpacing: "0.1em" }}
                >
                  {m.label}
                </td>
                <td
                  className="text-right tabular-nums text-slate-700 dark:text-slate-200"
                  style={{ padding: cellPx, fontSize: valSize, fontWeight: 600 }}
                >
                  {fmt(m.on, dec, m.pct)}
                </td>
                <td
                  className="text-right tabular-nums text-slate-700 dark:text-slate-200"
                  style={{ padding: cellPx, fontSize: valSize, fontWeight: 600 }}
                >
                  {fmt(m.off, dec, m.pct)}
                </td>
                <td
                  className={`text-right tabular-nums font-bold ${color}`}
                  style={{ padding: cellPx, fontSize: valSize }}
                >
                  {m.missing
                    ? "—"
                    : fmtSigned(computedDiff, dec)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PlayerPerformanceSplits({
  playerId,
  leagueId,
  teamId,
  playerName = "Player",
  playerTeam = "",
  playerPhotoUrl,
  primaryColor,
  teamLogoUrl,
}: PlayerPerformanceSplitsProps) {
  const [expanded, setExpanded] = useState(false);

  const { data: row, isLoading, isError } = useQuery<PlayerOnOffImpactProfileRow | null>({
    queryKey: ["player-on-off-impact-profile", playerId, leagueId, teamId],
    queryFn: async () => {
      let query = supabase
        .from("player_on_off_impact_profile_v1")
        .select("*")
        .eq("player_id", playerId)
        .order("on_possessions_for", { ascending: false })
        .limit(1);

      if (leagueId) query = query.eq("league_id", leagueId);
      if (teamId) query = query.eq("team_id", teamId);

      const { data, error } = await query;

      if (error) {
        console.error("PlayerPerformanceSplits: Supabase error", error);
        throw error;
      }

      if (data && data.length > 0) {
        const r = data[0] as PlayerOnOffImpactProfileRow;
        // Detect which percentage columns are missing from the view
        const missingCols: string[] = [];
        const pctFields = [
          "on_oreb_pct","off_oreb_pct","diff_oreb_pct",
          "on_dreb_pct","off_dreb_pct","diff_dreb_pct",
          "on_reb_pct","off_reb_pct","diff_reb_pct",
          "on_ast_pct","off_ast_pct","diff_ast_pct",
          "on_blk_pct","off_blk_pct","diff_blk_pct",
          "on_stl_pct","off_stl_pct","diff_stl_pct",
          "on_tov_pct","off_tov_pct","diff_tov_pct",
        ] as const;
        for (const col of pctFields) {
          if (!(col in r)) missingCols.push(col);
        }
        if (missingCols.length > 0) {
          console.info(
            `[PlayerPerformanceSplits] The following columns are not yet present in ` +
            `player_on_off_impact_profile_v1 — rows will show "—" until the view is updated:\n  ${missingCols.join(", ")}`
          );
        }
        return r;
      }

      return null;
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4 animate-pulse">
        <div className="h-5 w-48 bg-slate-200 dark:bg-neutral-700 rounded mb-1" />
        <div className="h-3 w-64 bg-slate-100 dark:bg-neutral-800 rounded mb-4" />
        <div className="h-10 w-32 bg-slate-100 dark:bg-neutral-800 rounded mb-4" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-8 bg-slate-100 dark:bg-neutral-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
        <span className="text-base font-bold text-slate-800 dark:text-white mb-1 block">
          Team Performance Splits
        </span>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          Per 100 possessions · garbage-time filtered
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Performance split data is temporarily unavailable.
        </p>
      </div>
    );
  }

  // ── No data ───────────────────────────────────────────────────────────────
  if (!row) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
        <span className="text-base font-bold text-slate-800 dark:text-white mb-1 block">
          Team Performance Splits
        </span>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
          Per 100 possessions · garbage-time filtered
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          On/off data not available yet.
        </p>
      </div>
    );
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const accuracyLabel = row.accuracy_label || "";
  const isNeedsReview = accuracyLabel.toLowerCase().includes("needs review");
  const isInsufficient = accuracyLabel.toLowerCase().includes("insufficient");
  const isLowAccuracy = accuracyLabel.toLowerCase().includes("low");
  const hasHeadline = row.adjusted_net_swing != null && !isNeedsReview;

  const swingColor = !hasHeadline
    ? "text-slate-400 dark:text-slate-500"
    : row.adjusted_net_swing! > 3
    ? "text-emerald-600 dark:text-emerald-400"
    : row.adjusted_net_swing! < -3
    ? "text-red-600 dark:text-red-400"
    : "text-slate-700 dark:text-slate-300";

  // Detect if pct columns are missing (from view)
  const pctMissing = !("on_oreb_pct" in row);

  // ── Metric rows ───────────────────────────────────────────────────────────
  const metrics: MetricRow[] = [
    {
      label: "ORTG",     abbr: "ortg",
      on: row.on_ortg,   off: row.off_ortg,
      diff: row.on_ortg != null && row.off_ortg != null ? row.on_ortg - row.off_ortg : null,
    },
    {
      label: "DRTG",     abbr: "drtg",
      on: row.on_drtg,   off: row.off_drtg,
      diff: row.on_drtg != null && row.off_drtg != null ? row.on_drtg - row.off_drtg : null,
      invertGood: true,
    },
    {
      label: "NRTG",     abbr: "nrtg",
      on: row.on_nrtg,   off: row.off_nrtg,
      diff: row.on_nrtg != null && row.off_nrtg != null ? row.on_nrtg - row.off_nrtg : null,
    },
    {
      label: "OREB%",    abbr: "oreb_pct",
      on: row.on_oreb_pct,  off: row.off_oreb_pct,
      diff: row.diff_oreb_pct ?? null,
      pct: true, missing: pctMissing,
    },
    {
      label: "DREB%",    abbr: "dreb_pct",
      on: row.on_dreb_pct,  off: row.off_dreb_pct,
      diff: row.diff_dreb_pct ?? null,
      pct: true, missing: pctMissing,
    },
    {
      label: "REB%",     abbr: "reb_pct",
      on: row.on_reb_pct,   off: row.off_reb_pct,
      diff: row.diff_reb_pct ?? null,
      pct: true, missing: pctMissing,
    },
    {
      label: "AST%",     abbr: "ast_pct",
      on: row.on_ast_pct,   off: row.off_ast_pct,
      diff: row.diff_ast_pct ?? null,
      pct: true, missing: pctMissing,
    },
    {
      label: "TOV%",     abbr: "tov_pct",
      on: row.on_tov_pct,   off: row.off_tov_pct,
      diff: row.diff_tov_pct ?? null,
      pct: true, invertGood: true, missing: pctMissing,
    },
    {
      label: "STL%",     abbr: "stl_pct",
      on: row.on_stl_pct,   off: row.off_stl_pct,
      diff: row.diff_stl_pct ?? null,
      pct: true, missing: pctMissing,
    },
    {
      label: "BLK%",     abbr: "blk_pct",
      on: row.on_blk_pct,   off: row.off_blk_pct,
      diff: row.diff_blk_pct ?? null,
      pct: true, missing: pctMissing,
    },
  ];

  // ── Share card snapshot ───────────────────────────────────────────────────
  const shareContent = (
    <div className="flex flex-col" style={{ gap: 16 }}>
      <div>
        <span
          className="font-bold uppercase text-slate-500 block"
          style={{ fontSize: 17, letterSpacing: "0.18em" }}
        >
          Team Performance Splits
        </span>
        <span style={{ fontSize: 12 }} className="text-slate-400">
          Adjusted per 100 possessions, excluding garbage-time and short-clock stints.
        </span>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <span
          className={`font-extrabold tabular-nums ${swingColor}`}
          style={{ fontSize: 36, lineHeight: 1 }}
        >
          {hasHeadline ? fmtSigned(row.adjusted_net_swing) : "—"}
        </span>
        <div className="flex flex-col gap-1 pb-1">
          <span style={{ fontSize: 13 }} className="text-slate-500 dark:text-slate-400">
            Adjusted On/Off Swing
          </span>
          <div className="flex flex-wrap gap-1">
            {hasHeadline && row.adjusted_net_swing != null && (
              <SwingBadge swing={row.adjusted_net_swing} />
            )}
            {accuracyLabel && <AccuracyBadge label={accuracyLabel} />}
            {row.sample_size_label && <SampleBadge label={row.sample_size_label} />}
          </div>
        </div>
      </div>

      {isNeedsReview && (
        <p style={{ fontSize: 13 }} className="text-slate-500">
          {row.confidence_explanation || "On/off tracking needs review."}
        </p>
      )}

      <MetricTable metrics={metrics} compact />

      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <span className="text-slate-400">
          Raw Swing: {fmtSigned(row.raw_net_swing)}
        </span>
        <span className="text-slate-400">
          Clean Possessions: {fmt(row.on_possessions_for, 0)}
          {row.tracking_quality ? ` · ${row.tracking_quality}` : ""}
        </span>
      </div>

      {row.confidence_explanation && !isNeedsReview && (
        <p style={{ fontSize: 12 }} className="text-slate-500">
          {row.confidence_explanation}
        </p>
      )}
    </div>
  );

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <ShareableCard
      title="Team Performance Splits"
      fileSlug="performance-splits"
      player={{
        name: playerName,
        team: playerTeam,
        photoUrl: playerPhotoUrl,
        primaryColor,
        teamLogoUrl,
      }}
      shareContent={shareContent}
      wide
    >
      <div
        className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4"
        data-testid="player-performance-splits-card"
      >
        {/* Header */}
        <div className="mb-3">
          <span className="text-base md:text-lg font-bold text-slate-800 dark:text-white block">
            Team Performance Splits
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Per 100 possessions · garbage-time filtered
          </span>
        </div>

        {isNeedsReview ? (
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-neutral-800 p-3">
            <Info className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                On/off tracking needs review
              </p>
              {row.confidence_explanation && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {row.confidence_explanation}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Headline swing */}
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <span
                className={`text-4xl font-extrabold tabular-nums leading-none ${swingColor} ${
                  isInsufficient ? "opacity-50" : ""
                }`}
              >
                {hasHeadline ? fmtSigned(row.adjusted_net_swing) : "—"}
              </span>
              <div className="flex flex-col gap-1 pb-0.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Adjusted On/Off Swing
                </span>
                <div className="flex flex-wrap gap-1">
                  {hasHeadline && row.adjusted_net_swing != null && (
                    <SwingBadge swing={row.adjusted_net_swing} />
                  )}
                  {accuracyLabel && <AccuracyBadge label={accuracyLabel} />}
                  {row.sample_size_label && (
                    <SampleBadge label={row.sample_size_label} />
                  )}
                </div>
                {isInsufficient && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic mt-0.5">
                    Insufficient clean sample
                  </span>
                )}
                {isLowAccuracy && !isInsufficient && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 italic mt-0.5">
                    Treat as directional
                  </span>
                )}
              </div>
            </div>

            {/* Main metric table */}
            <div className="mb-3">
              <MetricTable metrics={metrics} />
            </div>

            {/* Footer — raw swing + possessions + tracking */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-slate-400 dark:text-slate-500">
              <span>
                Raw Swing:{" "}
                <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                  {fmtSigned(row.raw_net_swing)}
                </span>
              </span>
              <span>
                Clean Possessions:{" "}
                <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                  {fmt(row.on_possessions_for, 0)}
                </span>
              </span>
              {row.tracking_quality && (
                <span>
                  Tracking:{" "}
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {row.tracking_quality}
                  </span>
                </span>
              )}
            </div>

            {/* "How is this calculated?" collapsible */}
            {row.confidence_explanation && (
              <div>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                  <span>How is this calculated?</span>
                  {expanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                {expanded && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-neutral-800 rounded-lg p-3">
                    {row.confidence_explanation}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ShareableCard>
  );
}
