import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronRight, Loader2, Lock, Maximize2, Minimize2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { extractTeamColors } from "@/lib/colorExtractor";
import { cleanTeamLabel } from "@/lib/cardStyle";
import { spreadPoints, tickValues } from "@/lib/landscapeLayout";
import { formatMetric, type LandscapeAxis } from "@/lib/landscapePresets";
import { PLAYER_LANDSCAPE_PRESETS } from "@/lib/playerLandscapePresets";
import { AxisCaption, LandscapeGate } from "@/components/LandscapeParts";
import type { PlayerLandscapeMetricKey, PlayerLandscapePlayer, PlayerLandscapeResponse } from "@/types/landscape";

/** The chart anyone can see; the rest come with a free account. */
const FREE_PRESET = PLAYER_LANDSCAPE_PRESETS[0];
/** Chart area (px²) per name shown when no team is picked out, so a bigger chart names more players. */
const AREA_PER_NAME = 9000;

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

  // ── the chart's size on screen ──
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
    // The middle of each axis is the average of the players on the chart.
    const centre = (axis: Axis) => players.reduce((sum, p) => sum + valueOf(p, axis), 0) / players.length;
    const reachOf = (axis: Axis, mid: number) => Math.max(0.5, ...players.map((p) => Math.abs(valueOf(p, axis) - mid)));
    const avgX = centre(preset.x);
    const avgY = centre(preset.y);
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

    // Small enough on a phone that a couple of hundred players don't pile into one blob.
    const r = Math.max(3.5, Math.min(8, w / 110));
    const pad = r + 10;
    const dirX = preset.x.lowerIsBetter ? -1 : 1;
    const dirY = preset.y.lowerIsBetter ? -1 : 1;
    const fracX = (v: number) => (dirX > 0 ? (v - rx.lo) / (rx.hi - rx.lo) : (rx.hi - v) / (rx.hi - rx.lo));
    const fracY = (v: number) => (dirY > 0 ? (v - ry.lo) / (ry.hi - ry.lo) : (ry.hi - v) / (ry.hi - ry.lo));
    const toX = (v: number) => pad + fracX(v) * (w - 2 * pad);
    const toY = (v: number) => h - pad - fracY(v) * (h - 2 * pad);
    const halfX = (rx.hi - rx.lo) / 2;
    const halfY = (ry.hi - ry.lo) / 2;

    const truth = players.map((p) => ({ x: toX(valueOf(p, preset.x)), y: toY(valueOf(p, preset.y)) }));
    const at = spreadPoints(truth, r, { left: 0, top: 0, right: w, bottom: h }, 1);

    // Names: every player of the picked-out team, or else the ones furthest from the middle, skipping any that would overlap.
    const distance = (p: PlayerLandscapePlayer) => Math.hypot((valueOf(p, preset.x) - avgX) / halfX, (valueOf(p, preset.y) - avgY) / halfY);
    const order = players
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (teamFocus ? teamKey(p) === teamFocus : true))
      .sort((a, b) => distance(b.p) - distance(a.p))
      .slice(0, teamFocus ? undefined : Math.max(8, Math.round((w * h) / AREA_PER_NAME)));
    type Box = { left: number; top: number; right: number; bottom: number };
    // The two average tags stay readable.
    const placed: Box[] = [
      { left: toX(avgX) - 45, top: 0, right: toX(avgX) + 45, bottom: 26 },
      { left: w - 100, top: toY(avgY) - 12, right: w, bottom: toY(avgY) + 12 },
    ];
    const overlaps = (b: Box) =>
      placed.some((o) => b.left < o.right && b.right > o.left && b.top < o.bottom && b.bottom > o.top) ||
      at.some((q) => q.x + r > b.left && q.x - r < b.right && q.y + r > b.top && q.y - r < b.bottom);
    const labels: { i: number; text: string; x: number; y: number; side: "right" | "left" }[] = [];
    for (const { p, i } of order) {
      const text = shortName(p.name);
      const width = text.length * 6 + 8;
      const { x, y } = at[i];
      const right: Box = { left: x + r + 3, top: y - 8, right: x + r + 3 + width, bottom: y + 8 };
      const left: Box = { left: x - r - 3 - width, top: y - 8, right: x - r - 3, bottom: y + 8 };
      const fits = (b: Box) => b.left >= 0 && b.right <= w;
      const side = fits(right) && !overlaps(right) ? "right" : fits(left) && !overlaps(left) ? "left" : teamFocus ? (fits(right) ? "right" : "left") : null;
      if (!side) continue;
      placed.push(side === "right" ? right : left);
      labels.push({ i, text, x, y, side });
    }

    return {
      r,
      avgX,
      avgY,
      at,
      labels,
      avgAtX: toX(avgX),
      avgAtY: toY(avgY),
      xTicks: tickValues((rx.lo + rx.hi) / 2, (halfX * w) / (w - 2 * pad)).filter((v) => v >= 0).map((v) => ({ v, at: toX(v) })).filter((t) => t.at > 28 && t.at < w - 28),
      yTicks: tickValues((ry.lo + ry.hi) / 2, (halfY * h) / (h - 2 * pad)).filter((v) => v >= 0).map((v) => ({ v, at: toY(v) })).filter((t) => t.at > 18 && t.at < h - 18),
    };
  }, [size, players, preset, teamFocus]);

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
            title={expanded ? "Exit full screen (Esc)" : "Full screen, with more names"}
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
          <div className={`grid grid-cols-[auto_minmax(0,1fr)] gap-x-1.5 gap-y-1.5 ${wanted ? "pointer-events-none select-none blur-[6px]" : ""}`} aria-hidden={!!wanted}>
            <AxisCaption axis={preset.y} colour={accent} upright />
            <div
              ref={plotRef}
              className={`relative overflow-hidden rounded-xl border border-[color:var(--ch-border)] bg-slate-50 dark:bg-white/[0.03] ${
                expanded ? "h-[calc(100dvh-16rem)] min-h-[420px] md:h-[calc(100dvh-13rem)]" : "aspect-[4/5] sm:aspect-[4/3]"
              }`}
            >
              {players.length === 0 ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[color:var(--ch-text-2)]">
                  {pool.length > 0 ? "This competition's box scores don't record these stats. Try another chart." : "No players have played enough games yet."}
                </p>
              ) : (
                layout && (
                  <>
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
                          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none ring-1 ring-black/25 transition-[left,top,opacity,transform] duration-500 hover:z-20 hover:scale-150 focus-visible:z-20 focus-visible:scale-150 dark:ring-white/40 ${on ? "z-10 scale-150" : ""} ${faded ? "opacity-20" : ""}`}
                          style={{
                            left: at.x,
                            top: at.y,
                            width: layout.r * 2,
                            height: layout.r * 2,
                            backgroundColor: colourOf(p),
                            boxShadow: on ? `0 0 0 2px var(--ch-surface), 0 0 0 4px ${accent}` : undefined,
                          }}
                        />
                      );
                    })}

                    {layout.labels.map((l) => (
                      <span
                        key={players[l.i].id}
                        className="pointer-events-none absolute -translate-y-1/2 whitespace-nowrap rounded bg-white/80 px-1 text-[10px] font-semibold leading-4 text-slate-900 dark:bg-black/60 dark:text-white"
                        style={l.side === "right" ? { left: l.x + layout.r + 3, top: l.y } : { right: size.w - (l.x - layout.r - 3), top: l.y }}
                      >
                        {l.text}
                      </span>
                    ))}

                    {shown && layout.at[shownIndex] && (
                      <div
                        role="status"
                        className="pointer-events-none absolute z-30 w-52 -translate-x-1/2 rounded-lg border border-white/15 bg-slate-900/95 p-2.5 text-white shadow-xl"
                        style={{
                          left: Math.max(108, Math.min(size.w - 108, layout.at[shownIndex].x)),
                          ...(layout.at[shownIndex].y > size.h / 2
                            ? { bottom: size.h - layout.at[shownIndex].y + layout.r + 8 }
                            : { top: layout.at[shownIndex].y + layout.r + 8 }),
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
                  </>
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
                title={on ? "Show every team" : `Name ${cleanTeamLabel(t.name)}'s players`}
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
          {data.minMinutes ? ` and ${data.minMinutes} minutes a game` : ""}. {preset.footnote}. Tap a team to name its players, or a dot for its numbers.
        </p>
      )}
    </div>
  );
}
