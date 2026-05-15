import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ShareableCard from "@/components/ShareableCard";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

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

function SwingBadge({ swing }: { swing: number }) {
  if (swing > 3) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
        Positive
      </span>
    );
  }
  if (swing < -3) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800">
        Negative
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-slate-400 border border-slate-200 dark:border-neutral-700">
      Neutral
    </span>
  );
}

function AccuracyBadge({ label }: { label: string }) {
  const lower = label.toLowerCase();
  if (lower.includes("high")) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
        {label}
      </span>
    );
  }
  if (lower.includes("medium")) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
        {label}
      </span>
    );
  }
  if (lower.includes("low") || lower.includes("directional")) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
        {label}
      </span>
    );
  }
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

function fmt(v: number | null, decimals = 1): string {
  if (v == null) return "N/A";
  return v.toFixed(decimals);
}

function fmtSigned(v: number | null, decimals = 1): string {
  if (v == null) return "N/A";
  const sign = v >= 0 ? "+" : "−";
  return `${sign}${Math.abs(v).toFixed(decimals)}`;
}

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

      return (data && data.length > 0 ? data[0] : null) as PlayerOnOffImpactProfileRow | null;
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm border border-gray-100 dark:border-neutral-800 p-4 animate-pulse">
        <div className="h-5 w-48 bg-slate-200 dark:bg-neutral-700 rounded mb-1" />
        <div className="h-3 w-64 bg-slate-100 dark:bg-neutral-800 rounded mb-4" />
        <div className="h-10 w-32 bg-slate-100 dark:bg-neutral-800 rounded mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 dark:bg-neutral-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

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

  const accuracyLabel = row.accuracy_label || "";
  const isNeedsReview = accuracyLabel.toLowerCase().includes("needs review");
  const isInsufficient = accuracyLabel.toLowerCase().includes("insufficient");
  const isLowAccuracy = accuracyLabel.toLowerCase().includes("low");
  const hasHeadline = row.adjusted_net_swing != null && !isNeedsReview;

  const swingColor =
    !hasHeadline
      ? "text-slate-400 dark:text-slate-500"
      : row.adjusted_net_swing! > 3
      ? "text-emerald-600 dark:text-emerald-400"
      : row.adjusted_net_swing! < -3
      ? "text-red-600 dark:text-red-400"
      : "text-slate-700 dark:text-slate-300";

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
        <p style={{ fontSize: 13 }} className="text-slate-500 dark:text-slate-400">
          {row.confidence_explanation || "On/off tracking needs review."}
        </p>
      )}

      <div
        className="rounded-xl border border-slate-200 dark:border-neutral-700 overflow-hidden"
        style={{ fontSize: 14 }}
      >
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-neutral-800">
            <tr>
              <th
                className="text-left font-bold text-slate-500 uppercase"
                style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.12em" }}
              />
              <th
                className="text-right font-bold text-slate-500 uppercase"
                style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.12em" }}
              >
                On
              </th>
              <th
                className="text-right font-bold text-slate-500 uppercase"
                style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.12em" }}
              >
                Off
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Net Rating", on: row.on_nrtg, off: row.off_nrtg },
              { label: "Def Rating", on: row.on_drtg, off: row.off_drtg },
              { label: "Off Rating", on: row.on_ortg, off: row.off_ortg },
            ].map((m, idx) => (
              <tr
                key={m.label}
                className={`border-t border-slate-100 dark:border-neutral-700 ${idx % 2 === 1 ? "bg-slate-50/60 dark:bg-neutral-800/30" : ""}`}
              >
                <td
                  className="font-semibold uppercase text-slate-600 dark:text-slate-400"
                  style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.1em" }}
                >
                  {m.label}
                </td>
                <td
                  className="text-right font-bold tabular-nums text-slate-800 dark:text-white"
                  style={{ padding: "8px 14px", fontSize: 16 }}
                >
                  {fmt(m.on)}
                </td>
                <td
                  className="text-right font-bold tabular-nums text-slate-800 dark:text-white"
                  style={{ padding: "8px 14px", fontSize: 16 }}
                >
                  {fmt(m.off)}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-100 dark:border-neutral-700 bg-slate-50/60 dark:bg-neutral-800/30">
              <td
                className="font-semibold uppercase text-slate-600 dark:text-slate-400"
                style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.1em" }}
              >
                Raw Swing
              </td>
              <td
                colSpan={2}
                className="text-right font-bold tabular-nums text-slate-800 dark:text-white"
                style={{ padding: "8px 14px", fontSize: 16 }}
              >
                {fmtSigned(row.raw_net_swing)}
              </td>
            </tr>
            <tr className="border-t border-slate-100 dark:border-neutral-700">
              <td
                className="font-semibold uppercase text-slate-600 dark:text-slate-400"
                style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.1em" }}
              >
                Clean Possessions
              </td>
              <td
                colSpan={2}
                className="text-right font-bold tabular-nums text-slate-800 dark:text-white"
                style={{ padding: "8px 14px", fontSize: 16 }}
              >
                {fmt(row.on_possessions_for, 0)}
              </td>
            </tr>
            <tr className="border-t border-slate-100 dark:border-neutral-700 bg-slate-50/60 dark:bg-neutral-800/30">
              <td
                className="font-semibold uppercase text-slate-600 dark:text-slate-400"
                style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.1em" }}
              >
                Tracking Quality
              </td>
              <td
                colSpan={2}
                className="text-right font-bold tabular-nums text-slate-800 dark:text-white"
                style={{ padding: "8px 14px", fontSize: 16 }}
              >
                {row.tracking_quality || "N/A"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {row.confidence_explanation && !isNeedsReview && (
        <p style={{ fontSize: 12 }} className="text-slate-500 dark:text-slate-400">
          {row.confidence_explanation}
        </p>
      )}
    </div>
  );

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
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <span
                className={`text-4xl font-extrabold tabular-nums leading-none ${swingColor} ${isInsufficient ? "opacity-50" : ""}`}
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
                  {row.sample_size_label && <SampleBadge label={row.sample_size_label} />}
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

            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { label: "On Net Rtg", value: fmt(row.on_nrtg) },
                { label: "Off Net Rtg", value: fmt(row.off_nrtg) },
                { label: "On Def Rtg", value: fmt(row.on_drtg) },
                { label: "Off Def Rtg", value: fmt(row.off_drtg) },
                { label: "Raw Swing", value: fmtSigned(row.raw_net_swing) },
                { label: "Clean Possessions", value: fmt(row.on_possessions_for, 0) },
                { label: "Tracking Quality", value: row.tracking_quality || "N/A" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-slate-50 dark:bg-neutral-800 rounded-lg px-3 py-2"
                >
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold block">
                    {item.label}
                  </span>
                  <span className="text-sm font-bold text-slate-800 dark:text-white tabular-nums">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

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
