import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, ChevronRight, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { cleanTeamLabel } from "@/lib/cardStyle";
import { initialsOf } from "@/lib/generateWeeklyCards";
import { spreadPoints, tickValues } from "@/lib/landscapeLayout";
import { formatMetric, LANDSCAPE_PRESETS, type LandscapeAxis } from "@/lib/landscapePresets";
import type { LandscapeResponse, LandscapeTeam } from "@/types/landscape";
import { AxisCaption, LandscapeGate } from "@/components/LandscapeParts";
import { PlayerLandscape } from "@/components/PlayerLandscape";

/** The chart anyone can see; the rest come with a free account. */
const FREE_PRESET = LANDSCAPE_PRESETS[0];

type Props = {
  /** The competition's slug, as in the page's address. */
  slug: string;
  /** The league's colour, for the better end of each axis and the selected crest. */
  brandColor?: string;
  /** Only teams from these competitions (an age group of a parent league); all of them when left out. */
  scopedLeagueIds?: string[];
  onTeamSelect?: (teamName: string) => void;
  /** Opens a player's profile from the player landscape. */
  onPlayerSelect?: (playerSlug: string) => void;
};

type View = "teams" | "players";

/** The league landscape: teams by default, or every regular player as a dot in their team's colour. */
export function LeagueLandscape({ onPlayerSelect, ...props }: Props) {
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("landscape") === "players" ? "players" : "teams",
  );
  const choose = (next: View) => {
    setView(next);
    // Keeps a copied link on the view it was copied from.
    const url = new URL(window.location.href);
    if (next === "players") url.searchParams.set("landscape", "players");
    else url.searchParams.delete("landscape");
    window.history.replaceState(window.history.state, "", url);
  };
  const switcher = (
    <div className="inline-flex flex-none rounded-lg border border-[color:var(--ch-border)] p-0.5" role="group" aria-label="Plot">
      {(["teams", "players"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => choose(v)}
          aria-pressed={view === v}
          data-testid={`landscape-view-${v}`}
          className={`h-7 rounded-md px-3 text-xs font-semibold capitalize transition-colors ${
            view === v ? "bg-[color:var(--ch-text)] text-[color:var(--ch-surface)]" : "text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)]"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
  return view === "players" ? (
    <PlayerLandscape slug={props.slug} brandColor={props.brandColor} scopedLeagueIds={props.scopedLeagueIds} onPlayerSelect={onPlayerSelect} switcher={switcher} />
  ) : (
    <TeamLandscape {...props} switcher={switcher} />
  );
}

/** Every team in a league plotted by one season number against another, with the league's own figure in the middle. */
function TeamLandscape({ slug, brandColor, scopedLeagueIds, onTeamSelect, switcher }: Omit<Props, "onPlayerSelect"> & { switcher: ReactNode }) {
  const { user, isMember } = useAuth();
  const accent = brandColor || "var(--ch-accent)";

  const [data, setData] = useState<LandscapeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presetId, setPresetId] = useState(FREE_PRESET.id);
  // The locked chart a visitor without an account last asked for.
  const [wantedId, setWantedId] = useState<string | null>(null);
  const [logoUrls, setLogoUrls] = useState<Record<string, string | null>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const canOpen = (id: string) => isMember || id === FREE_PRESET.id;
  const preset = LANDSCAPE_PRESETS.find((p) => p.id === presetId && canOpen(p.id)) ?? FREE_PRESET;
  const wanted = !isMember ? LANDSCAPE_PRESETS.find((p) => p.id === wantedId) : undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/league/${encodeURIComponent(slug)}/landscape`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as LandscapeResponse;
      })
      .then((json) => !cancelled && setData(json))
      .catch(() => !cancelled && (setData(null), setError("We couldn't load the league landscape. Please try again.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    if (!data) return;
    void Promise.all(
      data.teams.map(async (t) => [t.id, await getTeamLogoCached({ leagueId: t.league_id, teamName: t.name }).catch(() => null)] as const),
    ).then((pairs) => !cancelled && setLogoUrls(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [data]);

  const scopeKey = scopedLeagueIds?.join(",") ?? "";
  const { teams, scoped } = useMemo(() => {
    const all = data?.teams ?? [];
    const ids = scopeKey ? new Set(scopeKey.split(",")) : null;
    const inScope = ids ? all.filter((t) => ids.has(t.league_id)) : all;
    // A scope that matches nobody is a league whose data sits under another id: show everyone.
    const pool = inScope.length > 0 ? inScope : all;
    return {
      teams: pool.filter((t) => t.metrics[preset.x.metric] != null && t.metrics[preset.y.metric] != null),
      scoped: pool.length < all.length,
    };
  }, [data, scopeKey, preset]);

  // ── the chart's size on screen, which the crests' size and spacing depend on ──
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
  }, [loading, error]);

  const layout = useMemo(() => {
    const { w, h } = size;
    if (!w || !h || teams.length === 0) return null;
    const valueOf = (t: LandscapeTeam, axis: LandscapeAxis) => t.metrics[axis.metric] ?? 0;
    // One age group of a bigger league is centred on its own teams rather than the whole league's figure.
    const centre = (axis: LandscapeAxis) =>
      (!scoped ? data?.averages[axis.metric] : null) ?? teams.reduce((sum, t) => sum + valueOf(t, axis), 0) / teams.length;
    const reachOf = (axis: LandscapeAxis, mid: number) => Math.max(1, ...teams.map((t) => Math.abs(valueOf(t, axis) - mid)));
    const avgX = centre(preset.x);
    const avgY = centre(preset.y);
    let halfX = reachOf(preset.x, avgX);
    let halfY = reachOf(preset.y, avgY);
    if (preset.sharedScale) halfX = halfY = Math.max(halfX, halfY);

    const r = Math.max(13, Math.min(26, w / (teams.length > 16 ? 32 : 24)));
    const padX = r + 12;
    const padY = r + 12;
    // The better end goes right and up, so an axis where lower is better runs backwards.
    const dirX = preset.x.lowerIsBetter ? -1 : 1;
    const dirY = preset.y.lowerIsBetter ? -1 : 1;
    const toX = (v: number) => w / 2 + dirX * ((v - avgX) / halfX) * (w / 2 - padX);
    const toY = (v: number) => h / 2 - dirY * ((v - avgY) / halfY) * (h / 2 - padY);

    const truth = teams.map((t) => ({ x: toX(valueOf(t, preset.x)), y: toY(valueOf(t, preset.y)) }));
    const at = spreadPoints(truth, r, { left: 0, top: 0, right: w, bottom: h }, 3);
    return {
      r,
      avgX,
      avgY,
      at,
      xTicks: tickValues(avgX, (halfX * (w / 2)) / (w / 2 - padX)).map((v) => ({ v, at: toX(v) })).filter((t) => t.at > 28 && t.at < w - 28),
      yTicks: tickValues(avgY, (halfY * (h / 2)) / (h / 2 - padY)).map((v) => ({ v, at: toY(v) })).filter((t) => t.at > 18 && t.at < h - 18),
    };
  }, [size, teams, preset, data, scoped]);

  const choose = (id: string) => {
    if (!canOpen(id)) {
      setWantedId(id);
      return;
    }
    setWantedId(null);
    setPresetId(id);
  };

  const shownId = hoverId ?? selectedId;
  const shownIndex = shownId ? teams.findIndex((t) => t.id === shownId) : -1;
  const shown = shownIndex >= 0 ? teams[shownIndex] : null;
  const selected = selectedId ? teams.find((t) => t.id === selectedId) : null;
  const corner = "pointer-events-none absolute max-w-[46%] select-none text-base font-black uppercase leading-none tracking-tight sm:text-2xl md:text-3xl";
  const quiet = "text-slate-900/[0.09] dark:text-white/[0.09]";
  const lockedCount = LANDSCAPE_PRESETS.length - 1;

  return (
    <div className="ch-card space-y-4 p-3 md:p-5" data-testid="league-landscape">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[color:var(--ch-text)] md:text-lg">League landscape</h3>
          <p className="mt-0.5 text-xs text-[color:var(--ch-text-2)] md:text-sm">
            {preset.hint} The better end of each axis is to the right and at the top; the lines mark the league average.
          </p>
        </div>
        {switcher}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chart">
        {LANDSCAPE_PRESETS.map((p) => {
          const locked = !canOpen(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p.id)}
              data-active={p.id === preset.id && !wanted}
              aria-pressed={p.id === preset.id}
              title={locked ? "Free account needed" : p.hint}
              data-testid={`landscape-chart-${p.id}`}
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
              className="relative aspect-square overflow-hidden rounded-xl border border-[color:var(--ch-border)] bg-slate-50 dark:bg-white/[0.03] md:aspect-[16/10]"
            >
              {teams.length === 0 ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[color:var(--ch-text-2)]">
                  {data && data.teams.length > 0
                    ? "This competition's box scores don't record these stats. Try another chart."
                    : "No teams have played enough games yet."}
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
                    <span className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-slate-900/30 dark:bg-white/30" />
                    <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-900/30 dark:bg-white/30" />
                    <span className="ch-num pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-black/70">
                      {scoped ? "Avg" : "League avg"} {formatMetric(layout.avgX, preset.x)}
                    </span>
                    {!preset.sharedScale && (
                      <span className="ch-num pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-black/70">
                        {scoped ? "Avg" : "League avg"} {formatMetric(layout.avgY, preset.y)}
                      </span>
                    )}

                    {teams.map((t, i) => {
                      const p = layout.at[i];
                      if (!p) return null;
                      const name = cleanTeamLabel(t.name);
                      const on = t.id === selectedId;
                      const logo = logoUrls[t.id];
                      return (
                        <button
                          key={t.id}
                          type="button"
                          aria-label={`${name}: ${preset.x.label} ${formatMetric(t.metrics[preset.x.metric], preset.x)}, ${preset.y.label} ${formatMetric(t.metrics[preset.y.metric], preset.y)}`}
                          aria-pressed={on}
                          onClick={() => setSelectedId(on ? null : t.id)}
                          onMouseEnter={() => setHoverId(t.id)}
                          onMouseLeave={() => setHoverId((id) => (id === t.id ? null : id))}
                          onFocus={() => setHoverId(t.id)}
                          onBlur={() => setHoverId((id) => (id === t.id ? null : id))}
                          data-testid={`landscape-team-${t.id}`}
                          className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full bg-white shadow-md outline-none ring-1 ring-black/10 transition-[left,top,box-shadow,transform] duration-500 hover:z-20 hover:scale-110 focus-visible:z-20 focus-visible:scale-110 ${on ? "z-10" : ""}`}
                          style={{
                            left: p.x,
                            top: p.y,
                            width: layout.r * 2,
                            height: layout.r * 2,
                            boxShadow: on ? `0 0 0 3px ${accent}, 0 4px 14px rgba(0,0,0,0.3)` : undefined,
                          }}
                        >
                          {logo ? (
                            <img src={logo} alt="" className="h-[72%] w-[72%] object-contain" loading="lazy" />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-700">{initialsOf(name)}</span>
                          )}
                        </button>
                      );
                    })}

                    {shown && layout.at[shownIndex] && (
                      <div
                        role="status"
                        className="pointer-events-none absolute z-30 w-48 -translate-x-1/2 rounded-lg border border-white/15 bg-slate-900/95 p-2.5 text-white shadow-xl"
                        style={{
                          left: Math.max(100, Math.min(size.w - 100, layout.at[shownIndex].x)),
                          ...(layout.at[shownIndex].y > size.h / 2
                            ? { bottom: size.h - layout.at[shownIndex].y + layout.r + 8 }
                            : { top: layout.at[shownIndex].y + layout.r + 8 }),
                        }}
                      >
                        <p className="truncate text-xs font-semibold">{cleanTeamLabel(shown.name)}</p>
                        <dl className="ch-num mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
                          <dt className="text-white/60">{preset.x.label}</dt>
                          <dd className="text-right">{formatMetric(shown.metrics[preset.x.metric], preset.x)}</dd>
                          <dt className="text-white/60">{preset.y.label}</dt>
                          <dd className="text-right">{formatMetric(shown.metrics[preset.y.metric], preset.y)}</dd>
                          {preset.highlightMetric && (
                            <>
                              <dt className="text-white/60">Net rating</dt>
                              <dd className="text-right font-semibold">{formatMetric(shown.metrics[preset.highlightMetric.metric], { signed: true })}</dd>
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

      {selected && !wanted && (
        <div className="ch-tile flex flex-wrap items-center justify-between gap-3 p-3" data-testid="landscape-selected">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[color:var(--ch-text)]">{cleanTeamLabel(selected.name)}</p>
            <p className="ch-num mt-0.5 text-xs text-[color:var(--ch-text-2)]">
              {preset.x.label} {formatMetric(selected.metrics[preset.x.metric], preset.x)} · {preset.y.label}{" "}
              {formatMetric(selected.metrics[preset.y.metric], preset.y)} · {selected.games} games
            </p>
          </div>
          {onTeamSelect && (
            <button
              type="button"
              onClick={() => onTeamSelect(selected.name)}
              className="inline-flex h-8 flex-none items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              Team page
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {!loading && !error && data && (
        <p className="text-xs text-[color:var(--ch-muted)]">
          {!isMember && !user && (
            <>
              Efficiency is free to view.{" "}
              <Link href="/auth?tab=register" className="font-semibold underline underline-offset-2" style={{ color: accent }}>
                Create a free account
              </Link>{" "}
              for the other {lockedCount} charts.{" "}
            </>
          )}
          Based on {data.gamesCounted} game{data.gamesCounted === 1 ? "" : "s"}
          {data.minGames > 1 ? `, teams with at least ${data.minGames} played` : ""}. {preset.footnote}. Tap a crest for its numbers.
        </p>
      )}
    </div>
  );
}

// A made-up scatter for the teaser: enough to say "chart", without fetching the league's numbers on the Overview tab.
const TEASER_DOTS: [number, number][] = [
  [78, 18], [66, 26], [58, 34], [84, 40], [47, 30], [38, 52], [55, 56], [64, 62], [30, 44], [22, 66], [44, 72], [72, 74],
];

/** The Overview tab's way in to the league landscape. */
export function LeagueLandscapeTeaser({ brandColor, onOpen }: { brandColor?: string; onOpen: () => void }) {
  const accent = brandColor || "var(--ch-accent)";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="landscape-teaser"
      className="ch-card ch-hover group flex w-full items-center gap-4 p-4 text-left md:gap-6 md:p-6"
    >
      <span
        aria-hidden="true"
        className="relative h-20 w-24 flex-none overflow-hidden rounded-lg border border-[color:var(--ch-border)] bg-slate-50 dark:bg-white/[0.03] md:h-24 md:w-32"
      >
        <span className="absolute inset-y-0 left-1/2 w-px bg-slate-900/20 dark:bg-white/20" />
        <span className="absolute inset-x-0 top-1/2 h-px bg-slate-900/20 dark:bg-white/20" />
        {TEASER_DOTS.map(([x, y], i) => (
          <span
            key={i}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-400 dark:bg-white/50 md:h-2.5 md:w-2.5"
            style={{ left: `${x}%`, top: `${y}%`, ...(i === 0 ? { backgroundColor: accent, boxShadow: `0 0 0 3px color-mix(in srgb, ${accent} 30%, transparent)` } : {}) }}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tracking-tight text-[color:var(--ch-text)] md:text-base">League landscape</span>
        <span className="mt-1 block text-xs text-[color:var(--ch-text-2)] md:text-sm">
          See where every team sits: offence against defence, pace, shooting, rebounding and more, across {LANDSCAPE_PRESETS.length} charts.
        </span>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold md:text-sm" style={{ color: accent }}>
          Explore the landscape
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </span>
    </button>
  );
}
