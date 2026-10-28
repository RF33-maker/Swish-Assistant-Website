import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Loader2, Lock, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { extractTeamColors } from "@/lib/colorExtractor";
import { cleanTeamLabel } from "@/lib/cardStyle";
import { spreadPoints, tickValues } from "@/lib/landscapeLayout";
import { formatMetric, type LandscapeAxis } from "@/lib/landscapePresets";
import { PLAYER_LANDSCAPE_PRESETS } from "@/lib/playerLandscapePresets";
import { AxisCaption, LandscapeGate } from "@/components/LandscapeParts";
import { LABEL_HEIGHT, placeLabels } from "@/lib/playerLandscapeLabels";
import type { PlayerLandscapeMetricKey, PlayerLandscapePlayer, PlayerLandscapeResponse } from "@/types/landscape";

/** The chart anyone can see; the rest come with a free account. */
const FREE_PRESET = PLAYER_LANDSCAPE_PRESETS[0];
/** Every player is named, so the canvas starts with this much room (px²) per player and grows if names still collide. */
const AREA_PER_PLAYER = 2500;
/** Dot radius on the canvas. */
const DOT_R = 3.5;
/** Below this the names are too small to read, so a small screen starts zoomed in and scrolls. */
const MIN_READABLE_ZOOM = 0.8;
const MAX_ZOOM = 2;
const ZOOM_STEP = 1.25;

type Axis = LandscapeAxis<PlayerLandscapeMetricKey>;

type Props = {
  slug: string;
  brandColor?: string;
  scopedLeagueIds?: string[];
  onPlayerSelect?: (playerSlug: string) => void;
  /** The Teams / Players switch, shown in the header. */
  switcher: ReactNode;
};

/** A team's dot colour, keyed by team id (or competition and name when there's no id). */
const teamKey = (p: Pick<PlayerLandscapePlayer, "team_id" | "league_id" | "team_name">) => p.team_id ?? `${p.league_id}|${p.team_name}`;

/** "Jaydon Wise-Malcolm" → "J. Wise-Malcolm", to keep labels on the chart short. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** A steady colour for a team whose crest gave none, so teams still tell apart. */
function fallbackColour(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 50%)`;
}

/** Every regular player in a league plotted by one per-game number against another, as a dot in their team's colour. */
export function PlayerLandscape({ slug, brandColor, scopedLeagueIds, onPlayerSelect, switcher }: Props) {
  const { user, isMember } = useAuth();
  const accent = brandColor || "var(--ch-accent)";

  const [data, setData] = useState<PlayerLandscapeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(FREE_PRESET.id);
  const [wantedId, setWantedId] = useState<string | null>(null);
  const [colours, setColours] = useState<Record<string, string>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The team whose players are named and the rest faded.
  const [teamFocus, setTeamFocus] = useState<string | null>(null);
  // Full screen: a bigger chart with room for more names.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [expanded]);

  const canOpen = (id: string) => isMember || id === FREE_PRESET.id;
  const preset = PLAYER_LANDSCAPE_PRESETS.find((p) => p.id === presetId && canOpen(p.id)) ?? FREE_PRESET;
  const wanted = !isMember ? PLAYER_LANDSCAPE_PRESETS.find((p) => p.id === wantedId) : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/league/${encodeURIComponent(slug)}/player-landscape`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as PlayerLandscapeResponse;
      })
      .then((json) => !cancelled && setData(json))
      .catch(() => !cancelled && (setData(null), setError("We couldn't load the player landscape. Please try again.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const scopeKey = scopedLeagueIds?.join(",") ?? "";
  const pool = useMemo(() => {
    const all = data?.players ?? [];
    const ids = scopeKey ? new Set(scopeKey.split(",")) : null;
    const inScope = ids ? all.filter((p) => ids.has(p.league_id)) : all;
    // A scope that matches nobody is a league whose data sits under another id: show everyone.
    return inScope.length > 0 ? inScope : all;
  }, [data, scopeKey]);

  // One entry per team, for the colours and the key under the chart.
  const teams = useMemo(() => {
    const seen = new Map<string, { key: string; name: string; league_id: string; count: number }>();
    for (const p of pool) {
      const k = teamKey(p);
      const t = seen.get(k);
      if (t) t.count += 1;
      else seen.set(k, { key: k, name: p.team_name, league_id: p.league_id, count: 1 });
    }
    return Array.from(seen.values()).sort((a, b) => cleanTeamLabel(a.name).localeCompare(cleanTeamLabel(b.name)));
  }, [pool]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      teams.map(async (t) => [t.key, (await extractTeamColors(t.name, t.league_id).catch(() => null))?.primary ?? fallbackColour(t.key)] as const),
    ).then((pairs) => !cancelled && setColours(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [teams]);
  const colourOf = (p: PlayerLandscapePlayer) => colours[teamKey(p)] ?? fallbackColour(teamKey(p));

  const players = useMemo(
    () => pool.filter((p) => p.metrics[preset.x.metric] != null && p.metrics[preset.y.metric] != null),
    [pool, preset],
  );

  // ── the chart's box on screen, and the canvas inside it that every name fits on ──
  const plotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, error, expanded]);

  const layout = useMemo(() => {
    const { w, h } = size;
    if (!w || !h || players.length === 0) return null;
    const valueOf = (p: PlayerLandscapePlayer, axis: Axis) => p.metrics[axis.metric] ?? 0;
    // The average lines: the average of the players on the chart.
    const avgX = players.reduce((sum, p) => sum + valueOf(p, preset.x), 0) / players.length;
    const avgY = players.reduce((sum, p) => sum + valueOf(p, preset.y), 0) / players.length;
    // Per-game numbers bunch up near zero with a few stars far out, so each axis spans the players
    // themselves rather than sitting the average in the middle; the average lines fall where they fall.
    const rangeOf = (axis: Axis) => {
      const values = players.map((p) => valueOf(p, axis));
      let lo = Math.min(...values);
      let hi = Math.max(...values);
      if (hi - lo < 1) (lo -= 0.5), (hi += 0.5);
      return { lo, hi };
    };
    const rx = rangeOf(preset.x);
    const ry = rangeOf(preset.y);
    const texts = players.map((p) => shortName(p.name));

    // Start from enough room for every name, then grow the canvas until (almost) none is left sitting on another.
    const aspect = w / h;
    let area = Math.max(w * h, players.length * AREA_PER_PLAYER);
    for (let attempt = 0; ; attempt += 1) {
      const cw = Math.max(w, Math.sqrt(area * aspect));
      const ch = Math.max(h, cw / aspect);
      const pad = DOT_R + 10;
      const dirX = preset.x.lowerIsBetter ? -1 : 1;
      const dirY = preset.y.lowerIsBetter ? -1 : 1;
      const fracX = (v: number) => (dirX > 0 ? (v - rx.lo) / (rx.hi - rx.lo) : (rx.hi - v) / (rx.hi - rx.lo));
      const fracY = (v: number) => (dirY > 0 ? (v - ry.lo) / (ry.hi - ry.lo) : (ry.hi - v) / (ry.hi - ry.lo));
      const toX = (v: number) => pad + fracX(v) * (cw - 2 * pad);
      const toY = (v: number) => ch - pad - fracY(v) * (ch - 2 * pad);

      const truth = players.map((p) => ({ x: toX(valueOf(p, preset.x)), y: toY(valueOf(p, preset.y)) }));
      const at = spreadPoints(truth, DOT_R, { left: 0, top: 0, right: cw, bottom: ch }, 1);
      const avgAtX = toX(avgX);
      const avgAtY = toY(avgY);
      const labels = placeLabels(at, DOT_R, texts, { left: 2, top: 2, right: cw - 2, bottom: ch - 2 }, [
        // The two average tags stay readable.
        { left: avgAtX - 45, top: 0, right: avgAtX + 45, bottom: 26 },
        { left: cw - 100, top: avgAtY - 12, right: cw, bottom: avgAtY + 12 },
      ]);
      const crowded = labels.filter((l) => l.crowded).length;
      if (crowded <= players.length * 0.02 || attempt === 6) {
        const halfX = (rx.hi - rx.lo) / 2;
        const halfY = (ry.hi - ry.lo) / 2;
        return {
          cw,
          ch,
          avgX,
          avgY,
          avgAtX,
          avgAtY,
          at,
          labels,
          xTicks: tickValues((rx.lo + rx.hi) / 2, (halfX * cw) / (cw - 2 * pad)).filter((v) => v >= 0).map((v) => ({ v, at: toX(v) })).filter((t) => t.at > 28 && t.at < cw - 28),
          yTicks: tickValues((ry.lo + ry.hi) / 2, (halfY * ch) / (ch - 2 * pad)).filter((v) => v >= 0).map((v) => ({ v, at: toY(v) })).filter((t) => t.at > 18 && t.at < ch - 18),
        };
      }
      area *= 1.2;
    }
  }, [size, players, preset]);

  // ── zoom: "fit" shows the whole canvas in the box; zooming in scrolls it ──
  const fit = layout ? Math.min(1, size.w / layout.cw, size.h / layout.ch) : 1;
  // Fit, unless that would shrink the names past reading (a phone): then start at a readable size.
  const [zoomPick, setZoomPick] = useState<number | null>(null);
  useEffect(() => setZoomPick(null), [preset.id, expanded]);
  const zoom = Math.min(MAX_ZOOM, Math.max(fit, zoomPick ?? Math.max(fit, MIN_READABLE_ZOOM)));
  const zoomTo = (next: number) => {
    const el = plotRef.current;
    const target = Math.min(MAX_ZOOM, Math.max(fit, next));
    if (!el) return setZoomPick(target);
    // Keep the middle of the view where it is.
    const cx = (el.scrollLeft + el.clientWidth / 2) / zoom;
    const cy = (el.scrollTop + el.clientHeight / 2) / zoom;
    setZoomPick(target);
    requestAnimationFrame(() => {
      el.scrollLeft = cx * target - el.clientWidth / 2;
      el.scrollTop = cy * target - el.clientHeight / 2;
    });
  };
  const scrollable = !!layout && (layout.cw * zoom > size.w + 1 || layout.ch * zoom > size.h + 1);

  // Drag to move around a zoomed-in chart with a mouse (touch scrolls natively).
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrollable || e.pointerType !== "mouse" || e.button !== 0) return;
    const el = e.currentTarget;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    e.currentTarget.scrollLeft = d.left - dx;
    e.currentTarget.scrollTop = d.top - dy;
  };
  const endDrag = () => {
    // A drag that moved shouldn't also select the dot it ended on.
    if (drag.current?.moved) setTimeout(() => (drag.current = null), 0);
    else drag.current = null;
  };

  const choose = (id: string) => {
    if (!canOpen(id)) {
      setWantedId(id);
      return;
    }
    setWantedId(null);
    setPresetId(id);
  };

  const shownId = hoverId ?? selectedId;
  const shownIndex = shownId ? players.findIndex((p) => p.id === shownId) : -1;
  const shown = shownIndex >= 0 ? players[shownIndex] : null;
  const selected = selectedId ? players.find((p) => p.id === selectedId) : null;
  const corner = "pointer-events-none absolute max-w-[46%] select-none text-base font-black uppercase leading-none tracking-tight sm:text-2xl md:text-3xl";
  const quiet = "text-slate-900/[0.09] dark:text-white/[0.09]";
  const lockedCount = PLAYER_LANDSCAPE_PRESETS.length - 1;
  const zoomButton =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ch-border)] text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] disabled:opacity-40";

  return (
    <div
      className={expanded ? "fixed inset-0 z-[70] space-y-3 overflow-y-auto bg-[color:var(--ch-surface)] p-3 md:p-5" : "ch-card space-y-4 p-3 md:p-5"}
      data-testid="player-landscape"
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? "Player landscape, full screen" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[color:var(--ch-text)] md:text-lg">League landscape</h3>
          <p className="mt-0.5 text-xs text-[color:var(--ch-text-2)] md:text-sm">
            {preset.hint} Each dot is a player in their team's colour; the lines mark the average.
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          {switcher}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            title={expanded ? "Exit full screen (Esc)" : "Full screen"}
            data-testid="player-landscape-expand"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--ch-border)] text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
          >
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="sr-only">{expanded ? "Exit full screen" : "Full screen"}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chart">
        {PLAYER_LANDSCAPE_PRESETS.map((p) => {
          const locked = !canOpen(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p.id)}
              data-active={p.id === preset.id && !wanted}
              aria-pressed={p.id === preset.id}
              title={locked ? "Free account needed" : p.hint}
              data-testid={`player-landscape-chart-${p.id}`}
              className="ch-chip inline-flex h-8 items-center gap-1.5 px-3 text-xs"
            >
              {locked && <Lock className="h-3 w-3 flex-none opacity-70" />}
              {p.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-muted)]" />
        </div>
      ) : error ? (
        <p className="py-10 text-center text-sm text-[color:var(--ch-text-2)]">{error}</p>
      ) : (
        <div className="relative">
          {layout && (
            <div className="mb-2 flex items-center justify-end gap-2" role="group" aria-label="Zoom">
              <span className="mr-auto text-[11px] text-[color:var(--ch-muted)]">
                {scrollable ? "Drag or scroll to move around. Zoom out to see the whole league." : "Every player is named. Zoom in for a closer look."}
              </span>
              <button type="button" onClick={() => zoomTo(zoom / ZOOM_STEP)} disabled={zoom <= fit + 0.001} title="Zoom out" data-testid="player-landscape-zoom-out" className={zoomButton}>
                <ZoomOut className="h-4 w-4" />
                <span className="sr-only">Zoom out</span>
              </button>
              <button type="button" onClick={() => zoomTo(zoom * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM - 0.001} title="Zoom in" data-testid="player-landscape-zoom-in" className={zoomButton}>
                <ZoomIn className="h-4 w-4" />
                <span className="sr-only">Zoom in</span>
              </button>
              <button type="button" onClick={() => zoomTo(fit)} disabled={zoom <= fit + 0.001} className={`${zoomButton} w-auto px-2.5 text-xs font-semibold`}>
                Whole league
              </button>
            </div>
          )}
          <div className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-1.5 gap-y-1.5 ${wanted ? "pointer-events-none select-none blur-[6px]" : ""}`} aria-hidden={!!wanted}>
            <AxisCaption axis={preset.y} colour={accent} upright />
            <div
              ref={plotRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              onClickCapture={(e) => drag.current?.moved && e.stopPropagation()}
              className={`relative rounded-xl border border-[color:var(--ch-border)] bg-slate-50 dark:bg-white/[0.03] ${
                scrollable ? "cursor-grab overflow-auto overscroll-contain active:cursor-grabbing" : "overflow-hidden"
              } ${expanded ? "h-[calc(100dvh-17rem)] min-h-[420px] md:h-[calc(100dvh-14rem)]" : "aspect-[4/5] sm:aspect-[4/3]"}`}
              data-testid="player-landscape-plot"
            >
              {players.length === 0 ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[color:var(--ch-text-2)]">
                  {pool.length > 0 ? "This competition's box scores don't record these stats. Try another chart." : "No players have played enough games yet."}
                </p>
              ) : (
                layout && (
                  <div className="relative" style={{ width: layout.cw * zoom, height: layout.ch * zoom }}>
                    <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.cw, height: layout.ch, transform: `scale(${zoom})` }}>
                      <span className={`${corner} left-3 top-3 ${quiet}`}>{preset.quadrants.topLeft}</span>
                      <span
                        className={`${corner} right-3 top-3 text-right ${preset.bestTopRight ? "opacity-25" : quiet}`}
                        style={preset.bestTopRight ? { color: accent } : undefined}
                      >
                        {preset.quadrants.topRight}
                      </span>
                      <span className={`${corner} bottom-5 left-3 ${quiet}`}>{preset.quadrants.bottomLeft}</span>
                      <span className={`${corner} bottom-5 right-3 text-right ${quiet}`}>{preset.quadrants.bottomRight}</span>

                      {layout.xTicks.map((t) => (
                        <span key={`x${t.v}`} className="pointer-events-none absolute inset-y-0 w-px bg-slate-900/[0.06] dark:bg-white/[0.06]" style={{ left: t.at }}>
                          <span className="ch-num absolute bottom-1 left-1 text-[10px] text-[color:var(--ch-muted)]">{t.v}</span>
                        </span>
                      ))}
                      {layout.yTicks.map((t) => (
                        <span key={`y${t.v}`} className="pointer-events-none absolute inset-x-0 h-px bg-slate-900/[0.06] dark:bg-white/[0.06]" style={{ top: t.at }}>
                          <span className="ch-num absolute left-1 top-0.5 text-[10px] text-[color:var(--ch-muted)]">{t.v}</span>
                        </span>
                      ))}
                      <span className="pointer-events-none absolute inset-y-0 w-px bg-slate-900/30 dark:bg-white/30" style={{ left: layout.avgAtX }} />
                      <span className="pointer-events-none absolute inset-x-0 h-px bg-slate-900/30 dark:bg-white/30" style={{ top: layout.avgAtY }} />
                      <span
                        className="ch-num pointer-events-none absolute top-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-black/70"
                        style={{ left: layout.avgAtX }}
                      >
                        Avg {formatMetric(layout.avgX, preset.x)}
                      </span>
                      <span
                        className="ch-num pointer-events-none absolute right-1.5 -translate-y-1/2 whitespace-nowrap rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-black/70"
                        style={{ top: layout.avgAtY }}
                      >
                        Avg {formatMetric(layout.avgY, preset.y)}
                      </span>

                      {/* Leader lines from names that had to move away from their dot */}
                      <svg className="pointer-events-none absolute inset-0" width={layout.cw} height={layout.ch} aria-hidden="true">
                        {layout.labels
                          .filter((l) => l.leader)
                          .map((l) => {
                            const dot = layout.at[l.i];
                            const ex = Math.max(l.box.left, Math.min(l.box.right, dot.x));
                            const ey = Math.max(l.box.top, Math.min(l.box.bottom, dot.y));
                            const faded = !!teamFocus && teamKey(players[l.i]) !== teamFocus;
                            return (
                              <line
                                key={players[l.i].id}
                                x1={dot.x}
                                y1={dot.y}
                                x2={ex}
                                y2={ey}
                                stroke={colourOf(players[l.i])}
                                strokeWidth={1}
                                opacity={faded ? 0.12 : 0.6}
                              />
                            );
                          })}
                      </svg>

                      {players.map((p, i) => {
                        const at = layout.at[i];
                        if (!at) return null;
                        const on = p.id === selectedId;
                        const faded = !!teamFocus && teamKey(p) !== teamFocus;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            aria-label={`${p.name}, ${cleanTeamLabel(p.team_name)}: ${preset.x.label} ${formatMetric(p.metrics[preset.x.metric], preset.x)}, ${preset.y.label} ${formatMetric(p.metrics[preset.y.metric], preset.y)}`}
                            aria-pressed={on}
                            onClick={() => setSelectedId(on ? null : p.id)}
                            onMouseEnter={() => setHoverId(p.id)}
                            onMouseLeave={() => setHoverId((id) => (id === p.id ? null : id))}
                            onFocus={() => setHoverId(p.id)}
                            onBlur={() => setHoverId((id) => (id === p.id ? null : id))}
                            data-testid={`player-landscape-dot-${p.id}`}
                            className={`absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full outline-none ring-1 ring-black/25 transition-[opacity,transform] hover:z-20 hover:scale-150 focus-visible:z-20 focus-visible:scale-150 dark:ring-white/40 ${on ? "z-10 scale-150" : ""} ${faded ? "opacity-20" : ""}`}
                            style={{
                              left: at.x,
                              top: at.y,
                              width: DOT_R * 2,
                              height: DOT_R * 2,
                              backgroundColor: colourOf(p),
                              boxShadow: on ? `0 0 0 2px var(--ch-surface), 0 0 0 4px ${accent}` : undefined,
                            }}
                          />
                        );
                      })}

                      {layout.labels.map((l) => {
                        const p = players[l.i];
                        const on = p.id === selectedId || p.id === hoverId;
                        const faded = !!teamFocus && teamKey(p) !== teamFocus;
                        return (
                          <span
                            key={p.id}
                            aria-hidden="true"
                            onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
                            onMouseEnter={() => setHoverId(p.id)}
                            onMouseLeave={() => setHoverId((id) => (id === p.id ? null : id))}
                            className={`absolute cursor-pointer whitespace-nowrap rounded px-1 text-[10px] font-semibold leading-[14px] transition-opacity ${
                              on ? "z-20 bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-white/75 text-slate-900 dark:bg-black/55 dark:text-white"
                            } ${faded ? "opacity-20" : ""}`}
                            style={{ left: l.box.left, top: l.box.top, height: LABEL_HEIGHT }}
                          >
                            {shortName(p.name)}
                          </span>
                        );
                      })}

                      {shown && layout.at[shownIndex] && (
                        <div
                          role="status"
                          className="pointer-events-none absolute z-30 w-52 rounded-lg border border-white/15 bg-slate-900/95 p-2.5 text-white shadow-xl"
                          style={{
                            left: Math.max(108 / zoom, Math.min(layout.cw - 108 / zoom, layout.at[shownIndex].x)),
                            // Stays the same size on screen whatever the zoom.
                            transformOrigin: layout.at[shownIndex].y > layout.ch / 2 ? "bottom center" : "top center",
                            transform: `translateX(-50%) scale(${1 / zoom})`,
                            ...(layout.at[shownIndex].y > layout.ch / 2
                              ? { bottom: layout.ch - layout.at[shownIndex].y + DOT_R + 8 / zoom }
                              : { top: layout.at[shownIndex].y + DOT_R + 8 / zoom }),
                          }}
                        >
                          <p className="truncate text-xs font-semibold">{shown.name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-white/70">
                            <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: colourOf(shown) }} />
                            {cleanTeamLabel(shown.team_name)}
                          </p>
                          <dl className="ch-num mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
                            <dt className="text-white/60">{preset.x.label}</dt>
                            <dd className="text-right">{formatMetric(shown.metrics[preset.x.metric], preset.x)}</dd>
                            <dt className="text-white/60">{preset.y.label}</dt>
                            <dd className="text-right">{formatMetric(shown.metrics[preset.y.metric], preset.y)}</dd>
                            {shown.metrics.mpg != null && (
                              <>
                                <dt className="text-white/60">Minutes</dt>
                                <dd className="text-right">{formatMetric(shown.metrics.mpg, {})}</dd>
                              </>
                            )}
                            <dt className="text-white/60">Games</dt>
                            <dd className="text-right">{shown.games}</dd>
                          </dl>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
            <span />
            <AxisCaption axis={preset.x} colour={accent} />
          </div>

          {wanted && (
            <LandscapeGate
              label={wanted.label}
              hint={wanted.hint}
              lockedCount={lockedCount}
              signedIn={!!user}
              accent={accent}
              backTo={preset.label}
              onBack={() => setWantedId(null)}
            />
          )}
        </div>
      )}

      {!loading && !error && teams.length > 1 && !wanted && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Teams" data-testid="player-landscape-teams">
          {teams.map((t) => {
            const on = teamFocus === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTeamFocus(on ? null : t.key)}
                aria-pressed={on}
                data-active={on}
                title={on ? "Show every team" : `Pick out ${cleanTeamLabel(t.name)}'s players`}
                className={`ch-chip inline-flex h-7 items-center gap-1.5 px-2.5 text-[11px] ${teamFocus && !on ? "opacity-50" : ""}`}
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full ring-1 ring-black/20 dark:ring-white/30" style={{ backgroundColor: colours[t.key] ?? fallbackColour(t.key) }} />
                {cleanTeamLabel(t.name)}
              </button>
            );
          })}
        </div>
      )}

      {selected && !wanted && (
        <div className="ch-tile flex flex-wrap items-center justify-between gap-3 p-3" data-testid="player-landscape-selected">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[color:var(--ch-text)]">
              <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: colourOf(selected) }} />
              {selected.name}
              <span className="truncate font-normal text-[color:var(--ch-text-2)]">· {cleanTeamLabel(selected.team_name)}</span>
            </p>
            <p className="ch-num mt-0.5 text-xs text-[color:var(--ch-text-2)]">
              {preset.x.label} {formatMetric(selected.metrics[preset.x.metric], preset.x)} · {preset.y.label}{" "}
              {formatMetric(selected.metrics[preset.y.metric], preset.y)} · {selected.games} games
            </p>
          </div>
          {onPlayerSelect && selected.slug && (
            <button
              type="button"
              onClick={() => onPlayerSelect(selected.slug!)}
              className="inline-flex h-8 flex-none items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              Player page
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {!loading && !error && data && (
        <p className="text-xs text-[color:var(--ch-muted)]">
          {!isMember && !user && (
            <>
              Scoring is free to view.{" "}
              <Link href="/auth?tab=register" className="font-semibold underline underline-offset-2" style={{ color: accent }}>
                Create a free account
              </Link>{" "}
              for the other {lockedCount} charts.{" "}
            </>
          )}
          {players.length} players with at least {data.minGames} game{data.minGames === 1 ? "" : "s"}
          {data.minMinutes ? ` and ${data.minMinutes} minutes a game` : ""}. {preset.footnote}. Tap a team to pick out its players, or a dot or name for the numbers.
        </p>
      )}
    </div>
  );
}
