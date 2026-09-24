import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

export interface PlayByPlayEvent {
  id: number | string;
  action_type: string;
  sub_type?: string | null;
  period: number;
  clock: string;
  team_no: number;
  player_name?: string | null;
  description?: string | null;
  score?: string | null;
  success?: boolean;
  scoring?: boolean;
  points?: number | null;
}

interface Props<T extends PlayByPlayEvent> {
  events: T[];
  homeTeam: string;
  awayTeam: string;
  homeColor?: string;
  awayColor?: string;
  loading?: boolean;
  emptyMessage?: string;
  /** Turns a raw event into its display caption. Receives the nearest earlier
   * scored event (chronologically) as a hint for make/miss-derived wording,
   * matching what each call site's own caption logic already used. */
  describeEvent?: (event: T, previousScoredEvent: T | null) => string;
}

const DEFAULT_HOME = "#f97316";
const DEFAULT_AWAY = "#3b82f6";

function parseClockSeconds(clock: string | null | undefined): number {
  if (!clock) return 0;
  const parts = clock.split(":").map(Number);
  if (parts.length >= 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  return parts[0] || 0;
}

function periodLabel(period: number): string {
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

function defaultDescribe(event: PlayByPlayEvent): string {
  if (event.description) return event.description;
  const action = event.action_type || "event";
  return event.sub_type ? `${action} (${event.sub_type})` : action;
}

export default function PlayByPlay<T extends PlayByPlayEvent>({
  events,
  homeTeam,
  awayTeam,
  homeColor = DEFAULT_HOME,
  awayColor = DEFAULT_AWAY,
  loading = false,
  emptyMessage = "Play-by-play data coming soon.",
  describeEvent,
}: Props<T>) {
  const [viewMode, setViewMode] = useState<"full" | "quarter" | "player">("full");
  const [quarterFilter, setQuarterFilter] = useState<number | null>(null);
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);

  // Chronological order (Q1 10:00 -> ... -> final buzzer), regardless of
  // how the caller's query sorted the raw rows.
  const chronological = useMemo(() => {
    return [...events].sort((a, b) => {
      if (a.period !== b.period) return a.period - b.period;
      return parseClockSeconds(b.clock) - parseClockSeconds(a.clock);
    });
  }, [events]);

  // The nearest earlier event that carried a score, per event — used as a
  // make/miss hint by callers whose caption logic wants it.
  const previousScoredEventMap = useMemo(() => {
    const map = new Map<string | number, T>();
    let lastScored: T | null = null;
    for (const event of chronological) {
      if (event.score && String(event.score).trim()) {
        if (lastScored) map.set(event.id, lastScored);
        lastScored = event;
      } else if (lastScored) {
        map.set(event.id, lastScored);
      }
    }
    return map;
  }, [chronological]);

  const periods = useMemo(
    () => Array.from(new Set(chronological.map((e) => e.period))).sort((a, b) => a - b),
    [chronological]
  );

  const players = useMemo(() => {
    const teamByName = new Map<string, number>();
    chronological.forEach((e) => {
      if (e.player_name && !teamByName.has(e.player_name)) teamByName.set(e.player_name, e.team_no);
    });
    return Array.from(teamByName.entries())
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([name]) => name);
  }, [chronological]);

  useEffect(() => {
    if (viewMode === "quarter" && quarterFilter == null && periods.length > 0) {
      setQuarterFilter(periods[periods.length - 1]);
    }
    if (viewMode === "player" && playerFilter == null && players.length > 0) {
      setPlayerFilter(players[0]);
    }
  }, [viewMode, quarterFilter, playerFilter, periods, players]);

  const filtered = useMemo(() => {
    if (viewMode === "quarter" && quarterFilter != null) {
      return chronological.filter((e) => e.period === quarterFilter);
    }
    if (viewMode === "player" && playerFilter) {
      return chronological.filter((e) => e.player_name === playerFilter);
    }
    return chronological;
  }, [chronological, viewMode, quarterFilter, playerFilter]);

  const groups = useMemo(() => {
    const out: { period: number; items: T[] }[] = [];
    filtered.forEach((e) => {
      const last = out[out.length - 1];
      if (last && last.period === e.period) last.items.push(e);
      else out.push({ period: e.period, items: [e] });
    });
    return out;
  }, [filtered]);

  const describe = describeEvent ?? ((e: T) => defaultDescribe(e));

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-lg border border-orange-100 dark:border-neutral-700 overflow-hidden">
      <div className="p-3 md:p-4 border-b border-orange-100 dark:border-neutral-700 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-neutral-600 overflow-hidden text-xs font-semibold">
          {(["full", "quarter", "player"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === mode
                  ? "bg-orange-500 text-white"
                  : "bg-white dark:bg-neutral-800 text-slate-600 dark:text-slate-300 hover:bg-orange-50 dark:hover:bg-neutral-700"
              }`}
            >
              {mode === "full" ? "Full" : mode === "quarter" ? "By Quarter" : "By Player"}
            </button>
          ))}
        </div>

        {viewMode === "quarter" && periods.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setQuarterFilter(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  quarterFilter === p
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 dark:bg-neutral-700 text-slate-600 dark:text-slate-300 hover:bg-orange-100 dark:hover:bg-neutral-600"
                }`}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>
        )}

        {viewMode === "player" && players.length > 0 && (
          <select
            value={playerFilter ?? ""}
            onChange={(e) => setPlayerFilter(e.target.value || null)}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-neutral-700 text-slate-800 dark:text-white"
          >
            {players.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-orange-400" />
        </div>
      ) : chronological.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 italic text-center py-8 text-sm">{emptyMessage}</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500 dark:text-slate-400 italic text-center py-8 text-sm">No plays match this filter.</p>
      ) : (
        <div className="max-h-[32rem] overflow-y-auto">
          {groups.map((group) => (
            <div key={group.period}>
              {groups.length > 1 && (
                <div className="sticky top-0 z-[1] text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 py-1.5 bg-orange-50/90 dark:bg-neutral-900/90 backdrop-blur-sm">
                  — {periodLabel(group.period)} —
                </div>
              )}
              <div className="divide-y divide-orange-50 dark:divide-neutral-700">
                {group.items.map((event, idx) => {
                  const caption = describe(event, previousScoredEventMap.get(event.id) ?? null);
                  const clockDisplay = event.clock?.split(":").slice(0, 2).join(":") || "";
                  const teamColor = event.team_no === 1 ? homeColor : event.team_no === 2 ? awayColor : undefined;
                  // Some caption styles (e.g. narrative play-by-play text) already open with the
                  // player's name — don't repeat it in a separate bold prefix when they do.
                  const captionLeadsWithName =
                    !!event.player_name && caption.toLowerCase().startsWith(event.player_name.toLowerCase());
                  return (
                    <div
                      key={event.id ?? idx}
                      className="flex items-center gap-3 px-3 md:px-4 py-2 text-sm odd:bg-slate-50/60 dark:odd:bg-neutral-900/30"
                    >
                      <span className="w-10 shrink-0 tabular-nums text-xs text-slate-400 dark:text-neutral-500">
                        {clockDisplay}
                      </span>
                      {teamColor && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
                      )}
                      <span className="flex-1 min-w-0 text-slate-600 dark:text-slate-300 truncate">
                        {event.player_name && !captionLeadsWithName && (
                          <span className="font-semibold text-slate-800 dark:text-white mr-1.5">{event.player_name}</span>
                        )}
                        <span className={event.scoring ? "text-orange-600 dark:text-orange-400 font-medium" : ""}>
                          {captionLeadsWithName ? (
                            <>
                              <span className="font-semibold text-slate-800 dark:text-white">{event.player_name}</span>
                              {caption.slice(event.player_name!.length)}
                            </>
                          ) : (
                            caption
                          )}
                        </span>
                      </span>
                      {event.score && (
                        <span className="w-14 shrink-0 text-right tabular-nums text-xs font-bold text-slate-600 dark:text-slate-300">
                          {event.score}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 md:px-4 py-2 border-t border-orange-50 dark:border-neutral-700 flex items-center justify-center gap-4 text-[11px] text-slate-400 dark:text-neutral-500">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: homeColor }} />{homeTeam}</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: awayColor }} />{awayTeam}</span>
      </div>
    </div>
  );
}
