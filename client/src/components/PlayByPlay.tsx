import { useEffect, useMemo, useRef, useState } from "react";

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
  action_number?: number | null;
}

interface Props<T extends PlayByPlayEvent> {
  events: T[];
  homeTeam: string;
  awayTeam: string;
  homeColor?: string;
  awayColor?: string;
  loading?: boolean;
  isLive?: boolean;
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

function formatClock(clock: string | null | undefined): string {
  const [m, s] = (clock || "").split(":").map(Number);
  return Number.isFinite(m) ? `${m}:${String(s || 0).padStart(2, "0")}` : "";
}

function periodLabel(period: number): string {
  return period <= 4 ? `Q${period}` : `OT${period - 4}`;
}

function periodName(period: number): string {
  if (period > 4) return period === 5 ? "Overtime" : `Overtime ${period - 4}`;
  return `${["1st", "2nd", "3rd", "4th"][period - 1] ?? `${period}th`} quarter`;
}

function formatScore(score: string | null | undefined): string {
  return (score || "").trim().replace(/\s*-\s*/, "–");
}

function pointsFor(event: PlayByPlayEvent): number {
  if (event.points) return event.points;
  if (event.action_type === "3pt") return 3;
  if (event.action_type === "2pt") return 2;
  if (event.action_type === "freethrow") return 1;
  return 0;
}

/** Whether a shot went in. The feed's `scoring` flag is set on misses too, so
 * prefer the running score changing, then fall back to `success`. */
function isMadeShot(event: PlayByPlayEvent, previousScored: PlayByPlayEvent | null): boolean {
  if (pointsFor(event) === 0 || event.scoring === false) return false;
  const now = (event.score || "").trim();
  const before = (previousScored?.score || "").trim();
  if (now && before) return now !== before;
  return event.success === true;
}

/** Period and game start/end rows, drawn as dividers rather than plays.
 * Returns null for rows that aren't markers or that another marker covers. */
function markerLabel(event: PlayByPlayEvent, finalPeriods: Set<number>): string | null {
  const action = (event.action_type || "").toLowerCase();
  const sub = (event.sub_type || "").toLowerCase();
  if (action === "game") return sub === "end" ? "Final" : "";
  if (action !== "period") return null;
  if (sub === "start") return `Start of ${periodName(event.period).toLowerCase()}`;
  if (sub === "end") return finalPeriods.has(event.period) ? "" : `End of ${periodName(event.period).toLowerCase()}`;
  return null;
}

function defaultDescribe(event: PlayByPlayEvent): string {
  if (event.description) return event.description;
  const action = event.action_type || "event";
  return event.sub_type ? `${action} (${event.sub_type})` : action;
}

/** The caption with the player's name in bold — in place when the caption
 * already names them, otherwise leading it. */
function Caption({ text: raw, name }: { text: string; name?: string | null }) {
  // The running score has its own column, so drop a "(72-85)" the caption repeats.
  const trimmed = raw.replace(/\s*\(\d+\s*[-–]\s*\d+\)/, "");
  const text = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const strong = (n: string) => <span className="font-semibold text-[color:var(--ch-text)]">{n}</span>;
  if (!name) return <>{text}</>;
  const at = text.toLowerCase().indexOf(name.toLowerCase());
  if (at === -1) return <>{strong(name)} {text}</>;
  return <>{text.slice(0, at)}{strong(text.slice(at, at + name.length))}{text.slice(at + name.length)}</>;
}

export default function PlayByPlay<T extends PlayByPlayEvent>({
  events,
  homeTeam,
  awayTeam,
  homeColor = DEFAULT_HOME,
  awayColor = DEFAULT_AWAY,
  loading = false,
  isLive = false,
  emptyMessage = "Play-by-play data coming soon.",
  describeEvent,
}: Props<T>) {
  const [viewMode, setViewMode] = useState<"full" | "quarter" | "player">("full");
  const [quarterFilter, setQuarterFilter] = useState<number | null>(null);
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const topIdRef = useRef<T["id"] | null>(null);
  const [fresh, setFresh] = useState(0);

  // Chronological order (Q1 10:00 -> ... -> final buzzer), regardless of
  // how the caller's query sorted the raw rows. On a shared clock, period
  // starts open and period/game ends close; other plays keep the feed's order.
  const chronological = useMemo(() => {
    const edge = (e: T) => {
      if (e.action_type !== "period" && e.action_type !== "game") return 0;
      return e.sub_type === "start" ? -1 : e.sub_type === "end" ? 1 : 0;
    };
    return [...events].sort((a, b) => {
      if (a.period !== b.period) return a.period - b.period;
      const byClock = parseClockSeconds(b.clock) - parseClockSeconds(a.clock);
      if (byClock !== 0) return byClock;
      return edge(a) - edge(b) || (a.action_number ?? 0) - (b.action_number ?? 0);
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

  // Periods the game ended in, so "Final" stands in for "End of 4th quarter".
  const finalPeriods = useMemo(
    () => new Set(chronological.filter((e) => e.action_type === "game" && e.sub_type === "end").map((e) => e.period)),
    [chronological]
  );

  const players = useMemo(() => {
    const teamByName = new Map<string, number>();
    chronological.forEach((e) => {
      if (e.player_name && !teamByName.has(e.player_name)) teamByName.set(e.player_name, e.team_no);
    });
    return Array.from(teamByName.entries())
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([name, team]) => ({ name, team }));
  }, [chronological]);

  useEffect(() => {
    if (viewMode === "quarter" && quarterFilter == null && periods.length > 0) {
      setQuarterFilter(periods[periods.length - 1]);
    }
    if (viewMode === "player" && playerFilter == null && players.length > 0) {
      setPlayerFilter(players[0].name);
    }
  }, [viewMode, quarterFilter, playerFilter, periods, players]);

  // Newest play first, so live plays land at the top.
  const latestFirst = useMemo(() => {
    let shown = chronological.filter((e) => markerLabel(e, finalPeriods) !== "");
    if (viewMode === "quarter" && quarterFilter != null) {
      shown = shown.filter((e) => e.period === quarterFilter);
    } else if (viewMode === "player" && playerFilter) {
      shown = shown.filter((e) => e.player_name === playerFilter);
    }
    return shown.reverse();
  }, [chronological, finalPeriods, viewMode, quarterFilter, playerFilter]);

  const groups = useMemo(() => {
    const out: { period: number; items: T[] }[] = [];
    latestFirst.forEach((e) => {
      const last = out[out.length - 1];
      if (last && last.period === e.period) last.items.push(e);
      else out.push({ period: e.period, items: [e] });
    });
    return out;
  }, [latestFirst]);

  // If the reader has scrolled down when new plays arrive, offer a pill instead of jumping.
  useEffect(() => {
    const top = latestFirst[0]?.id ?? null;
    const prev = topIdRef.current;
    topIdRef.current = top;
    if (prev == null || top == null || top === prev) return;
    const el = scrollRef.current;
    const added = latestFirst.findIndex((e) => e.id === prev);
    if (el && el.scrollTop > 40 && added > 0) setFresh((n) => n + added);
  }, [latestFirst]);

  useEffect(() => { setFresh(0); }, [viewMode, quarterFilter, playerFilter]);

  const describe = describeEvent ?? ((e: T) => defaultDescribe(e));
  const teamColor = (teamNo: number) => (teamNo === 1 ? homeColor : teamNo === 2 ? awayColor : "transparent");

  return (
    <div className="ch-card overflow-hidden" data-testid="play-by-play">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--ch-border)] px-4 py-3">
        <h3 className="ch-eyebrow flex items-center gap-2">
          {isLive && (
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          )}
          Play by play
        </h3>
        <div className="ch-seg text-xs" role="group" aria-label="Play-by-play view">
          {(["full", "quarter", "player"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              data-active={viewMode === mode}
              aria-pressed={viewMode === mode}
              className="px-2.5 py-1"
            >
              {mode === "full" ? "All" : mode === "quarter" ? "By quarter" : "By player"}
            </button>
          ))}
        </div>
      </div>

      {viewMode === "quarter" && periods.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-[color:var(--ch-border)] px-4 py-2.5">
          {periods.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQuarterFilter(p)}
              data-active={quarterFilter === p}
              aria-pressed={quarterFilter === p}
              className="ch-chip px-3 py-1 text-xs"
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
      )}

      {viewMode === "player" && players.length > 0 && (
        <div className="border-b border-[color:var(--ch-border)] px-4 py-2.5">
          <select
            value={playerFilter ?? ""}
            onChange={(e) => setPlayerFilter(e.target.value || null)}
            aria-label="Player"
            className="w-full max-w-xs rounded-lg border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] px-3 py-1.5 text-xs text-[color:var(--ch-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ch-accent)]"
          >
            {[1, 2].map((team) => {
              const teamPlayers = players.filter((p) => p.team === team);
              if (teamPlayers.length === 0) return null;
              return (
                <optgroup key={team} label={team === 1 ? homeTeam : awayTeam}>
                  {teamPlayers.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </optgroup>
              );
            })}
            {players.filter((p) => p.team !== 1 && p.team !== 2).map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="ch-skel h-9" />)}
        </div>
      ) : chronological.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[color:var(--ch-muted)]">{emptyMessage}</p>
      ) : latestFirst.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-[color:var(--ch-muted)]">No plays match this filter.</p>
      ) : (
        <div className="relative">
          {fresh > 0 && (
            <button
              type="button"
              onClick={() => { scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); setFresh(0); }}
              className="absolute left-1/2 top-10 z-10 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white shadow-lg"
            >
              {fresh} new {fresh === 1 ? "play" : "plays"}
            </button>
          )}
          <div
            ref={scrollRef}
            onScroll={(e) => { if ((e.target as HTMLElement).scrollTop < 40) setFresh(0); }}
            className="max-h-[min(36rem,75vh)] overflow-y-auto"
          >
            {groups.map((group) => {
              const periodScore = group.items.find((e) => e.score && String(e.score).trim())?.score;
              return (
                <section key={group.period} aria-label={periodName(group.period)}>
                  {viewMode !== "quarter" && (
                    <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] px-4 py-1.5">
                      <span className="ch-eyebrow">{periodName(group.period)}</span>
                      {periodScore && (
                        <span className="ch-num text-[11px] font-semibold text-[color:var(--ch-text-2)]">{formatScore(periodScore)}</span>
                      )}
                    </div>
                  )}
                  <ul className="divide-y divide-[color:var(--ch-border)]">
                    {group.items.map((event, idx) => {
                      const marker = markerLabel(event, finalPeriods);
                      if (marker) {
                        return (
                          <li key={event.id ?? idx} className="flex items-center gap-3 px-4 py-2">
                            <span className="h-px flex-1 bg-[color:var(--ch-border-strong)]" aria-hidden="true" />
                            <span className="ch-eyebrow !text-[color:var(--ch-text-2)]">
                              {marker}
                              {event.score && event.sub_type === "end" && (
                                <span className="ch-num ml-1.5 normal-case tracking-normal">{formatScore(event.score)}</span>
                              )}
                            </span>
                            <span className="h-px flex-1 bg-[color:var(--ch-border-strong)]" aria-hidden="true" />
                          </li>
                        );
                      }
                      const previousScored = previousScoredEventMap.get(event.id) ?? null;
                      const caption = describe(event, previousScored);
                      const color = teamColor(event.team_no);
                      const scored = isMadeShot(event, previousScored);
                      return (
                        <li key={event.id ?? idx} className="flex gap-3 px-4 py-2.5">
                          <span className="w-[3px] shrink-0 self-stretch rounded-full" style={{ background: color }} aria-hidden="true" />
                          <span className="w-10 shrink-0 pt-px text-[11px] font-semibold tabular-nums text-[color:var(--ch-muted)]">
                            {formatClock(event.clock)}
                          </span>
                          <span className={`min-w-0 flex-1 text-[13.5px] leading-snug ${scored ? "text-[color:var(--ch-text)]" : "text-[color:var(--ch-text-2)]"}`}>
                            <Caption text={caption} name={event.player_name?.trim()} />
                          </span>
                          <span className="flex shrink-0 items-start gap-1.5 pt-px">
                            {scored && (
                              <span
                                className="ch-num rounded-md px-1.5 text-[11px] font-bold leading-[18px] text-[color:var(--ch-text)]"
                                style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
                              >
                                +{pointsFor(event)}
                              </span>
                            )}
                            {event.score && (
                              <span className={`ch-num w-12 text-right text-xs leading-[18px] ${scored ? "font-bold text-[color:var(--ch-text)]" : "text-[color:var(--ch-muted)]"}`}>
                                {formatScore(event.score)}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 border-t border-[color:var(--ch-border)] px-4 py-2 text-[11px] text-[color:var(--ch-muted)]">
        <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full" style={{ backgroundColor: homeColor }} />{homeTeam}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded-full" style={{ backgroundColor: awayColor }} />{awayTeam}</span>
      </div>
    </div>
  );
}
