import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import ShareableCard from "@/components/ShareableCard";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

// ---------------------------------------------------------------------------
// Data: one row of player_on_off_season (filled by refresh_player_on_off)
// ---------------------------------------------------------------------------

/** Counting stats stored for "on" and "off", for the player's team and the opponent. */
const COUNTS = [
  "secs", "poss_for", "poss_against", "pts_for", "pts_against",
  "fg2m", "fg2a", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "ast", "tov", "stl", "blk",
  "opp_fg2m", "opp_fg2a", "opp_fg3m", "opp_fg3a", "opp_ftm", "opp_fta",
  "opp_oreb", "opp_dreb", "opp_ast", "opp_tov", "opp_stl", "opp_blk",
] as const;
type Count = (typeof COUNTS)[number];

type OnOffRow = {
  league_id: string;
  team_id: string;
  player_id: string;
  games: number;
  ortg_diff: number | null;
  drtg_diff: number | null;
  nrtg_diff: number | null;
  plus_minus_diff: number | null;
  qualified: boolean;
  qualified_count: number | null;
  ortg_diff_rank: number | null;
  drtg_diff_rank: number | null;
  nrtg_diff_rank: number | null;
  plus_minus_diff_rank: number | null;
} & Record<`on_${Count}` | `off_${Count}`, number>;

/** A row with its competition's name and season ("2025/26") for labelling and ordering. */
type CompetitionRow = OnOffRow & { competition: string; season: string };

// Possessions a player needs on and off court before he is ranked (matches the SQL).
const MIN_ON_POSS = 100;
const MIN_OFF_POSS = 50;

interface PlayerPerformanceSplitsProps {
  playerId: string;
  leagueId?: string;
  leagueIds?: string[];
  teamId?: string;
  playerName?: string;
  playerTeam?: string;
  playerPhotoUrl?: string | null;
  primaryColor?: string;
  teamLogoUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

type Side = "on" | "off";
type View = "own" | "opp";

interface Metric {
  label: string;
  /** value for one side of the split, from the chosen team's point of view */
  value: (row: OnOffRow, side: Side, view: View) => number | null;
  decimals: number;
  pct?: boolean;
  signed?: boolean;
  /** true when a bigger number is good for the player's team (own view) */
  higherIsGood?: boolean;
  /** no diff column (minutes, possessions) */
  noDiff?: boolean;
  /** diffs within this band are shown in the muted colour */
  neutral?: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** The team whose numbers a row shows ("T") and the team it was up against ("O"). */
function sides(row: OnOffRow, side: Side, view: View) {
  const get = (k: Count) => Number(row[`${side}_${k}`] ?? 0);
  const own = {
    fg2m: get("fg2m"), fg2a: get("fg2a"), fg3m: get("fg3m"), fg3a: get("fg3a"), ftm: get("ftm"), fta: get("fta"),
    oreb: get("oreb"), dreb: get("dreb"), ast: get("ast"), tov: get("tov"), stl: get("stl"), blk: get("blk"),
    pts: get("pts_for"), poss: get("poss_for"),
  };
  const opp = {
    fg2m: get("opp_fg2m"), fg2a: get("opp_fg2a"), fg3m: get("opp_fg3m"), fg3a: get("opp_fg3a"),
    ftm: get("opp_ftm"), fta: get("opp_fta"), oreb: get("opp_oreb"), dreb: get("opp_dreb"),
    ast: get("opp_ast"), tov: get("opp_tov"), stl: get("opp_stl"), blk: get("opp_blk"),
    pts: get("pts_against"), poss: get("poss_against"),
  };
  return view === "own" ? { T: own, O: opp, secs: get("secs") } : { T: opp, O: own, secs: get("secs") };
}

const METRICS: Metric[] = [
  { label: "MIN", decimals: 0, noDiff: true, value: (r, s, v) => sides(r, s, v).secs / 60 },
  {
    label: "POSS", decimals: 0, noDiff: true,
    value: (r, s, v) => { const { T, O } = sides(r, s, v); return (T.poss + O.poss) / 2; },
  },
  {
    label: "+/-", decimals: 0, signed: true, higherIsGood: true, neutral: 0,
    value: (r, s, v) => { const { T, O } = sides(r, s, v); return T.pts - O.pts; },
  },
  {
    label: "ORTG", decimals: 1, higherIsGood: true, neutral: 2,
    value: (r, s, v) => { const { T } = sides(r, s, v); const x = ratio(T.pts, T.poss); return x == null ? null : 100 * x; },
  },
  {
    label: "DRTG", decimals: 1, higherIsGood: false, neutral: 2,
    value: (r, s, v) => { const { O } = sides(r, s, v); const x = ratio(O.pts, O.poss); return x == null ? null : 100 * x; },
  },
  {
    label: "NRTG", decimals: 1, signed: true, higherIsGood: true, neutral: 2,
    value: (r, s, v) => {
      const { T, O } = sides(r, s, v);
      const off = ratio(T.pts, T.poss), def = ratio(O.pts, O.poss);
      return off == null || def == null ? null : 100 * (off - def);
    },
  },
  {
    label: "eFG%", decimals: 1, pct: true, higherIsGood: true, neutral: 1,
    value: (r, s, v) => {
      const { T } = sides(r, s, v);
      const x = ratio(T.fg2m + 1.5 * T.fg3m, T.fg2a + T.fg3a);
      return x == null ? null : 100 * x;
    },
  },
  {
    label: "OREB%", decimals: 1, pct: true, higherIsGood: true, neutral: 1,
    value: (r, s, v) => { const { T, O } = sides(r, s, v); const x = ratio(T.oreb, T.oreb + O.dreb); return x == null ? null : 100 * x; },
  },
  {
    label: "DREB%", decimals: 1, pct: true, higherIsGood: true, neutral: 1,
    value: (r, s, v) => { const { T, O } = sides(r, s, v); const x = ratio(T.dreb, T.dreb + O.oreb); return x == null ? null : 100 * x; },
  },
  {
    label: "REB%", decimals: 1, pct: true, higherIsGood: true, neutral: 1,
    value: (r, s, v) => {
      const { T, O } = sides(r, s, v);
      const x = ratio(T.oreb + T.dreb, T.oreb + T.dreb + O.oreb + O.dreb);
      return x == null ? null : 100 * x;
    },
  },
  {
    label: "AST%", decimals: 1, pct: true, higherIsGood: true, neutral: 1,
    value: (r, s, v) => { const { T } = sides(r, s, v); const x = ratio(T.ast, T.fg2m + T.fg3m); return x == null ? null : 100 * x; },
  },
  {
    label: "BLK%", decimals: 1, pct: true, higherIsGood: true, neutral: 1,
    value: (r, s, v) => { const { T, O } = sides(r, s, v); const x = ratio(T.blk, O.fg2a); return x == null ? null : 100 * x; },
  },
  {
    label: "STL%", decimals: 1, pct: true, higherIsGood: true, neutral: 1,
    value: (r, s, v) => { const { T, O } = sides(r, s, v); const x = ratio(T.stl, O.poss); return x == null ? null : 100 * x; },
  },
  {
    label: "TOV%", decimals: 1, pct: true, higherIsGood: false, neutral: 1,
    value: (r, s, v) => {
      const { T } = sides(r, s, v);
      const x = ratio(T.tov, T.fg2a + T.fg3a + 0.44 * T.fta + T.tov);
      return x == null ? null : 100 * x;
    },
  },
];

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function fmt(v: number | null | undefined, decimals: number, pct = false, signed = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const rounded = Number(v.toFixed(decimals));
  const body = Math.abs(rounded).toFixed(decimals);
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return `${sign}${body}${pct ? "%" : ""}`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Green when the change helps the player's team, red when it hurts, muted when it's within noise. */
function diffTone(diff: number | null, metric: Metric, view: View): string {
  if (diff == null || !Number.isFinite(diff) || metric.noDiff) return "text-[color:var(--ch-muted)]";
  if (Math.abs(diff) <= (metric.neutral ?? 0)) return "text-[color:var(--ch-text-2)]";
  // In the opposing-team view a bigger number is the opponent doing better.
  const good = (diff > 0) === Boolean(metric.higherIsGood) !== (view === "opp");
  return good ? "text-[color:var(--ch-win)]" : "text-[color:var(--ch-loss)]";
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Headshot({ url, name, off }: { url?: string | null; name: string; off?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative h-12 w-12 overflow-hidden rounded-full border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface-3)] ${off ? "opacity-45 grayscale" : ""}`}
      >
        {url ? (
          <img src={url} alt={`${name} ${off ? "off" : "on"} court`} className="h-full w-full object-cover object-top" />
        ) : (
          <span className="ch-display flex h-full w-full items-center justify-center text-base font-bold text-[color:var(--ch-text-2)]">
            {initials}
          </span>
        )}
      </div>
      <span
        className="rounded px-1.5 text-[10px] font-bold uppercase tracking-[0.08em]"
        style={
          off
            ? { background: "var(--ch-surface-3)", color: "var(--ch-muted)" }
            : { background: "var(--ch-accent)", color: "#fff" }
        }
      >
        {off ? "Off" : "On"}
      </span>
    </div>
  );
}

function ImpactTile({
  label, value, decimals, rank, of, tone,
}: { label: string; value: number | null; decimals: number; rank: number | null; of: number | null; tone: string }) {
  return (
    <div className="ch-tile px-3 py-2.5">
      <div className={`ch-display ch-num text-[1.75rem] font-bold leading-none ${tone}`}>{fmt(value, decimals, false, true)}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]">{label}</span>
        {rank != null && (
          <span className="text-[10px] font-semibold text-[color:var(--ch-text-2)]">
            {ordinal(rank)}
            {of ? <span className="text-[color:var(--ch-muted)]"> of {of}</span> : null}
          </span>
        )}
      </div>
    </div>
  );
}

function SplitTable({
  row, view, name, photoUrl, compact = false,
}: { row: OnOffRow; view: View; name: string; photoUrl?: string | null; compact?: boolean }) {
  const cell = compact ? "px-2.5 py-1.5" : "px-3 py-2";
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--ch-border)]">
      <table className="ch-table w-full">
        <thead>
          <tr className="border-b border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)]">
            <th className={`${cell} text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]`}>Stat</th>
            <th className={`${cell} text-center`}><div className="flex justify-center"><Headshot url={photoUrl} name={name} /></div></th>
            <th className={`${cell} text-center`}><div className="flex justify-center"><Headshot url={photoUrl} name={name} off /></div></th>
            <th className={`${cell} text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)]`}>Diff</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m, i) => {
            const on = m.value(row, "on", view);
            const off = m.value(row, "off", view);
            const diff = m.noDiff || on == null || off == null ? null : on - off;
            return (
              <tr
                key={m.label}
                className={`border-t border-[color:var(--ch-border)] ${i % 2 ? "bg-[color:var(--ch-surface-2)]/60" : ""}`}
              >
                <td className={`${cell} text-[11px] font-semibold tracking-[0.08em] text-[color:var(--ch-text-2)]`}>{m.label}</td>
                <td className={`${cell} ch-num text-center ${compact ? "text-[13px]" : "text-[15px]"} font-semibold text-[color:var(--ch-text)]`}>
                  {fmt(on, m.decimals, m.pct, m.signed)}
                </td>
                <td className={`${cell} ch-num text-center ${compact ? "text-[13px]" : "text-[15px]"} font-semibold text-[color:var(--ch-text)]`}>
                  {fmt(off, m.decimals, m.pct, m.signed)}
                </td>
                <td className={`${cell} ch-num text-right ${compact ? "text-[13px]" : "text-[15px]"} font-bold ${diffTone(diff, m, view)}`}>
                  {m.noDiff ? "—" : fmt(diff, m.decimals, m.pct, true)}
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
  leagueIds,
  teamId,
  playerName = "Player",
  playerTeam = "",
  playerPhotoUrl,
  primaryColor,
  teamLogoUrl,
}: PlayerPerformanceSplitsProps) {
  const [view, setView] = useState<View>("own");
  const [explain, setExplain] = useState(false);
  const [pickedLeagueId, setPickedLeagueId] = useState<string | null>(null);

  // leagueIds (multi) takes precedence over the legacy leagueId. Empty means no filter.
  const effectiveLeagueIds: string[] = leagueIds ?? (leagueId ? [leagueId] : []);

  // Every competition the player has on/off for, newest season first.
  const { data: rows, isLoading, isError } = useQuery<CompetitionRow[]>({
    queryKey: ["player-on-off-seasons", playerId, effectiveLeagueIds.join(","), teamId],
    queryFn: async () => {
      let query = supabase
        .from("player_on_off_season")
        .select("*")
        .eq("player_id", playerId)
        .order("on_poss_for", { ascending: false });
      if (effectiveLeagueIds.length === 1) query = query.eq("league_id", effectiveLeagueIds[0]);
      else if (effectiveLeagueIds.length > 1) query = query.in("league_id", effectiveLeagueIds);
      if (teamId) query = query.eq("team_id", teamId);
      const { data, error } = await query;
      if (error) throw error;
      const found = (data ?? []) as OnOffRow[];
      if (!found.length) return [];
      const { data: comps } = await supabase
        .from("competitions")
        .select("league_id, name, season")
        .in("league_id", Array.from(new Set(found.map((r) => r.league_id))));
      const byId = new Map((comps ?? []).map((c: any) => [c.league_id as string, c]));
      return found
        .map((r) => ({ ...r, competition: byId.get(r.league_id)?.name ?? "", season: byId.get(r.league_id)?.season ?? "" }))
        .sort((a, b) => b.season.localeCompare(a.season));
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  // Default to the newest season he's ranked in, so an early-season sample
  // doesn't hide a full one; fall back to the newest season he has at all.
  const row = rows?.find((r) => r.league_id === pickedLeagueId) ?? rows?.find((r) => r.qualified) ?? rows?.[0] ?? null;

  const shell = (body: JSX.Element) => (
    <div className="ch-card p-4 md:p-5" data-testid="player-performance-splits-card">
      {/* pr-8 keeps the competition picker clear of the share button in the corner. */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 pr-8">
        <div>
          <h3 className="ch-display text-xl font-bold uppercase tracking-[0.02em] text-[color:var(--ch-text)]">On/Off Impact</h3>
          <p className="text-xs text-[color:var(--ch-muted)]">
            {row?.competition
              ? `${row.competition} · ${row.games} game${row.games === 1 ? "" : "s"}`
              : "How his team performs with him on the court and off it"}
          </p>
        </div>
        {rows && rows.length > 1 && row && (
          <select
            value={row.league_id}
            onChange={(e) => setPickedLeagueId(e.target.value)}
            aria-label="Competition"
            className="ch-input h-8 max-w-full cursor-pointer px-3 text-[13px] font-medium"
          >
            {rows.map((r) => (
              <option key={r.league_id} value={r.league_id}>
                {r.competition || "Unnamed competition"}
                {r.qualified ? "" : " (not ranked)"}
              </option>
            ))}
          </select>
        )}
      </div>
      {body}
    </div>
  );

  if (isLoading) {
    return shell(
      <div className="animate-pulse space-y-2">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="ch-tile h-16" />)}
        </div>
        {[...Array(6)].map((_, i) => <div key={i} className="h-8 rounded bg-[color:var(--ch-surface-3)]" />)}
      </div>,
    );
  }
  if (isError) return shell(<p className="text-sm text-[color:var(--ch-text-2)]">On/off data is unavailable right now.</p>);
  if (!row) return shell(<p className="text-sm text-[color:var(--ch-text-2)]">No on/off data for this competition yet.</p>);

  const onPoss = (Number(row.on_poss_for) + Number(row.on_poss_against)) / 2;
  const offPoss = (Number(row.off_poss_for) + Number(row.off_poss_against)) / 2;
  const of = row.qualified_count;
  // Unranked samples are too small to colour as good or bad.
  const toneFor = (v: number | null, higherIsGood: boolean, band: number) =>
    !row.qualified
      ? "text-[color:var(--ch-text-2)]"
      : v == null || Math.abs(v) <= band
      ? "text-[color:var(--ch-text)]"
      : (v > 0) === higherIsGood
      ? "text-[color:var(--ch-win)]"
      : "text-[color:var(--ch-loss)]";

  const tiles = (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <ImpactTile label="Raw +/-" value={row.plus_minus_diff} decimals={0} rank={row.plus_minus_diff_rank} of={of}
        tone={toneFor(row.plus_minus_diff, true, 0)} />
      <ImpactTile label="ORTG +/-" value={row.ortg_diff} decimals={1} rank={row.ortg_diff_rank} of={of}
        tone={toneFor(row.ortg_diff, true, 2)} />
      <ImpactTile label="DRTG +/-" value={row.drtg_diff} decimals={1} rank={row.drtg_diff_rank} of={of}
        tone={toneFor(row.drtg_diff, false, 2)} />
      <ImpactTile label="Net +/-" value={row.nrtg_diff} decimals={1} rank={row.nrtg_diff_rank} of={of}
        tone={toneFor(row.nrtg_diff, true, 2)} />
    </div>
  );

  // The smaller of the two samples decides how much weight the swing can bear.
  const sampleNote = !row.qualified
    ? onPoss < MIN_ON_POSS
      ? `Not ranked yet: ${Math.round(onPoss)} possessions on court so far (needs ${MIN_ON_POSS}).`
      : `Not ranked: only ${Math.round(offPoss)} possessions with him off the court (needs ${MIN_OFF_POSS}), so the off numbers are very noisy.`
    : offPoss < 120
    ? `Small off-court sample (${Math.round(offPoss)} possessions): treat the swing as a rough guide.`
    : null;

  const viewToggle = (
    <div className="ch-seg" role="tablist" aria-label="On/off view">
      {(["own", "opp"] as View[]).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          data-active={view === v}
          aria-selected={view === v}
          onClick={() => setView(v)}
          className="px-3 py-1 text-xs"
        >
          {v === "own" ? "Own team" : "Opposing team"}
        </button>
      ))}
    </div>
  );

  const footnote = (
    <p className="text-[11px] leading-relaxed text-[color:var(--ch-muted)]">
      Per 100 possessions, competitive minutes only (garbage time and end-of-quarter heaves left out). Off is the rest of his
      team's minutes in the {row.games} game{row.games === 1 ? "" : "s"} he played. Ranked among players with {MIN_ON_POSS}+
      possessions on and {MIN_OFF_POSS}+ off.
    </p>
  );

  const shareContent = (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <span className="ch-display text-2xl font-bold uppercase">On/Off Impact</span>
      {row.competition && <span className="text-sm opacity-70">{row.competition}</span>}
      {tiles}
      <SplitTable row={row} view="own" name={playerName} photoUrl={playerPhotoUrl} compact />
      {footnote}
    </div>
  );

  return (
    <ShareableCard
      title="On/Off Impact"
      fileSlug="on-off-impact"
      player={{ name: playerName, team: playerTeam, photoUrl: playerPhotoUrl, primaryColor, teamLogoUrl }}
      shareContent={shareContent}
      wide
    >
      {shell(
        <div className="space-y-3">
          {tiles}
          {sampleNote && (
            <div className="flex items-start gap-2 rounded-lg bg-[color:var(--ch-surface-2)] px-3 py-2 text-xs text-[color:var(--ch-text-2)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{sampleNote}</span>
            </div>
          )}
          <div className="flex justify-center">{viewToggle}</div>
          <SplitTable row={row} view={view} name={playerName} photoUrl={playerPhotoUrl} />
          <button
            type="button"
            onClick={() => setExplain((v) => !v)}
            className="flex items-center gap-1 text-xs text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text-2)]"
          >
            <Info className="h-3.5 w-3.5" />
            How is this calculated?
            {explain ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {explain && footnote}
        </div>,
      )}
    </ShareableCard>
  );
}
