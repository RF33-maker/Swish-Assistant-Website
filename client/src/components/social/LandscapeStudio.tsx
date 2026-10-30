import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ColourField,
  CompetitionField,
  ERROR,
  FIELD,
  Field,
  HINT,
  Panel,
  readStoredCompetition,
  rememberCompetition,
  SaveActions,
  SELECT_MENU,
  Stage,
  Toggle,
  type CompetitionOption,
} from "@/components/social/studioUi";
import CardStylePicker, { useCardStyle } from "@/components/social/CardStylePicker";
import { supabase } from "@/lib/supabase";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { cleanTeamLabel } from "@/lib/cardStyle";
import { canvasToBlob, CARD_H, CARD_W, ensureDisplayFont } from "@/lib/generateWeeklyCards";
import { renderLandscapeCard, type PlottedTeam } from "@/lib/generateLandscapeCard";
import { formatMetric, LANDSCAPE_PRESETS, type QuadrantLabels } from "@/lib/landscapePresets";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { LandscapeResponse } from "@/types/landscape";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
const SLUG_KEY = "weekly-awards-slug";
const ALL = "all";
const NONE = "none";

const PRESET_KEY = "landscape-preset";

const QUADRANT_FIELDS: { key: keyof QuadrantLabels; label: string }[] = [
  { key: "topLeft", label: "Top left corner" },
  { key: "topRight", label: "Top right corner" },
  { key: "bottomLeft", label: "Bottom left corner" },
  { key: "bottomRight", label: "Bottom right corner" },
];

function readStoredPreset(): string {
  try {
    const stored = localStorage.getItem(PRESET_KEY);
    return LANDSCAPE_PRESETS.find((p) => p.id === stored)?.id ?? LANDSCAPE_PRESETS[0].id;
  } catch {
    return LANDSCAPE_PRESETS[0].id;
  }
}

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

/** Team landscape: every club's crest plotted by one season number against another, from a menu of charts. */
export default function LandscapeStudio() {
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG;

  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [style, setStyle] = useCardStyle();
  const [minGamesText, setMinGamesText] = useState("");
  const [presetId, setPresetId] = useState(readStoredPreset);
  const preset = LANDSCAPE_PRESETS.find((p) => p.id === presetId) ?? LANDSCAPE_PRESETS[0];
  const [data, setData] = useState<LandscapeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState("");
  // null: follow the number of games counted.
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [group, setGroup] = useState(ALL);
  const [highlightId, setHighlightId] = useState(NONE);
  const [showCallouts, setShowCallouts] = useState(true);
  const [quadrants, setQuadrants] = useState<QuadrantLabels>(preset.quadrants);
  const [logoUrls, setLogoUrls] = useState<Record<string, string | null>>({});
  const [plotted, setPlotted] = useState<PlottedTeam[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  const { leagueLogoUrl, primaryHex, colorOverride, updateColour, resetColour } = useCompetitionCardBrand(slug);

  useEffect(() => {
    let cancelled = false;
    void ensureDisplayFont();
    void supabase
      .from("competitions")
      .select("slug, name")
      .eq("is_public", true)
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(120)
      .then(({ data: rows }) => {
        if (!cancelled && rows) setCompetitions((rows as CompetitionOption[]).filter((c) => c.slug && c.name));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    const minGames = Number(minGamesText);
    if (minGamesText && Number.isFinite(minGames) && minGames >= 1) params.set("minGames", String(Math.floor(minGames)));
    fetch(`/api/league/${encodeURIComponent(slug)}/landscape?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Competition not found or not public" : `Request failed (${res.status})`);
        return (await res.json()) as LandscapeResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSubtitle((prev) => (prev && data?.league.name === json.league.name ? prev : stripSeason(json.league.name)));
      })
      .catch((err) => !cancelled && (setData(null), setError(err.message)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // `data` is intentionally not a dependency: it is only read to keep an edited subtitle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, minGamesText]);

  useEffect(() => {
    let cancelled = false;
    setLogoUrls({});
    if (!data) return;
    void Promise.all(
      data.teams.map(async (t) => [t.id, await getTeamLogoCached({ leagueId: t.league_id, teamName: t.name }).catch(() => null)] as const),
    ).then((pairs) => !cancelled && setLogoUrls(Object.fromEntries(pairs)));
    return () => {
      cancelled = true;
    };
  }, [data]);

  const groups = data?.groups ?? [];
  const activeGroup = groups.some((g) => g.id === group) ? group : ALL;
  // A team is only plotted where it has a number on both axes; some feeds don't record every stat.
  const teams = useMemo(
    () =>
      (data?.teams ?? []).filter(
        (t) =>
          (activeGroup === ALL || t.league_id === activeGroup) &&
          t.metrics[preset.x.metric] != null &&
          t.metrics[preset.y.metric] != null,
      ),
    [data, activeGroup, preset],
  );
  const notRecorded = !!data && data.teams.length > 0 && data.teams.every((t) => t.metrics[preset.x.metric] == null || t.metrics[preset.y.metric] == null);
  const teamLogoUrls = useMemo(() => teams.map((t) => logoUrls[t.id] ?? null), [teams, logoUrls]);
  const activeHighlight = teams.some((t) => t.id === highlightId) ? highlightId : null;
  const banner = bannerText ?? (data ? `Through ${data.gamesCounted} game${data.gamesCounted === 1 ? "" : "s"}` : "");

  const brand = useMemo(
    () => ({ leagueName: subtitle || data?.league.name || "", leagueLogoUrl, primaryHex }),
    [subtitle, data, leagueLogoUrl, primaryHex],
  );

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderToken = useRef(0);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const fileName = `landscape-${preset.id}-${slug}${style === "league" ? "" : `-${style}`}.png`;

  useEffect(() => {
    const token = ++renderToken.current;
    if (!data || teams.length === 0) {
      cardCanvasRef.current = null;
      canvasHostRef.current?.replaceChildren();
      setHasCard(false);
      setPlotted([]);
      setShareFile(null);
      return;
    }
    setRendering(true);
    setShareFile(null);
    void renderLandscapeCard({
      style,
      preset,
      teams,
      averages: data.averages,
      banner,
      brand,
      teamLogoUrls,
      quadrants,
      highlightId: activeHighlight,
      showCallouts,
      footnote: data.minGames > 1 ? `Min. ${data.minGames} games` : undefined,
    })
      .then(({ canvas, plotted: placed }) => {
        if (token !== renderToken.current) return;
        canvas.style.cssText = "display:block;width:100%;height:auto;";
        cardCanvasRef.current = canvas;
        canvasHostRef.current?.replaceChildren(canvas);
        setPlotted(placed);
        setHasCard(true);
        void canvasToBlob(canvas).then((blob) => {
          if (token !== renderToken.current || !blob) return;
          const file = new File([blob], fileName, { type: "image/png" });
          setShareFile(file);
          setCanShareFiles(supportsFileSharing(file));
        });
      })
      .catch((err) => token === renderToken.current && setError(err?.message || "Could not draw the card"))
      .finally(() => token === renderToken.current && setRendering(false));
  }, [style, preset, data, teams, banner, brand, teamLogoUrls, quadrants, activeHighlight, showCallouts, fileName]);

  const download = async () => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    try {
      const blob = await canvasToBlob(canvas);
      if (!blob) throw new Error("Could not render the card");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const saveToPhotos = async () => {
    if (!shareFile) return;
    if ((await shareImageFile(shareFile)) === "failed") setError("Couldn't open the share sheet. Use Download file instead.");
  };

  const chooseSlug = (v: string) => {
    setSlug(v);
    setGroup(ALL);
    setHighlightId(NONE);
    setBannerText(null);
    rememberCompetition(SLUG_KEY, v);
  };

  const choosePreset = (id: string) => {
    const next = LANDSCAPE_PRESETS.find((p) => p.id === id);
    if (!next) return;
    setPresetId(id);
    // Each chart has its own corners; labels typed for the last one wouldn't suit this one.
    setQuadrants(next.quadrants);
    try {
      localStorage.setItem(PRESET_KEY, id);
    } catch {
      // remembering the chart is a convenience only
    }
  };

  const hovered = hoverId ? teams.find((t) => t.id === hoverId) : undefined;
  const hoveredAt = hoverId ? plotted.find((p) => p.id === hoverId) : undefined;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Team landscape"
        description="Every club's crest plotted by one number against another, with the league average in the middle."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Chart" hint={preset.hint}>
          <Select value={preset.id} onValueChange={choosePreset}>
            <SelectTrigger className={FIELD} data-testid="select-landscape-chart">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {LANDSCAPE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {groups.length > 0 && (
          <Field label="Show">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Teams shown">
              {[{ id: ALL, name: "All teams" }, ...groups].map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroup(g.id)}
                  data-active={activeGroup === g.id}
                  aria-pressed={activeGroup === g.id}
                  className="ch-chip inline-flex h-8 items-center px-3 text-xs"
                >
                  {g.id === ALL ? g.name : stripSeason(g.name)}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="Highlight a team" hint="Rings one crest and adds its name and numbers.">
          <Select value={activeHighlight ?? NONE} onValueChange={setHighlightId}>
            <SelectTrigger className={FIELD} data-testid="select-highlight-team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              <SelectItem value={NONE}>No highlight</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {cleanTeamLabel(t.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Toggle
          checked={showCallouts}
          onChange={setShowCallouts}
          label="Best and worst callouts"
          hint="Adds the top teams' ranks, and who is best and worst at each end, beside their crests."
          testId="toggle-landscape-callouts"
        />

        <Field
          label={`Minimum games${data ? ` (auto: ${data.minGames})` : ""}`}
          hint="Leave empty for half of the most games any team has played. Ratings swing a lot over one or two games."
        >
          <input
            type="number"
            min={1}
            value={minGamesText}
            placeholder={data ? String(data.minGames) : "auto"}
            onChange={(e) => setMinGamesText(e.target.value)}
            className={FIELD}
            data-testid="input-min-games"
          />
        </Field>

        <Field label="Card subtitle">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={FIELD} />
        </Field>

        <Field label="Banner line" hint='For example "Through week 5". Clear it to go back to the games counted.'>
          <input
            value={banner}
            onChange={(e) => setBannerText(e.target.value || null)}
            className={FIELD}
            data-testid="input-banner"
          />
        </Field>

        <Field label="Corner labels" hint="The big words behind the crests. Empty a box to leave that corner bare.">
          <div className="grid grid-cols-2 gap-2">
            {QUADRANT_FIELDS.map((q) => (
              <input
                key={q.key}
                value={quadrants[q.key]}
                onChange={(e) => setQuadrants((prev) => ({ ...prev, [q.key]: e.target.value }))}
                className={FIELD}
                aria-label={q.label}
                title={q.label}
              />
            ))}
          </div>
        </Field>

        <CardStylePicker value={style} onChange={setStyle} primaryHex={primaryHex} />

        {style !== "swish" && <ColourField value={primaryHex} custom={!!colorOverride} onChange={updateColour} onReset={resetColour} />}

        {error && <p className={ERROR}>{error}</p>}
      </Panel>

      <Panel className="order-1 lg:order-2" bodyClassName="!p-3 sm:!p-5">
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
          </div>
        ) : (
          <Stage
            busy={rendering && !hasCard}
            empty={
              !hasCard && !rendering
                ? notRecorded
                  ? "This competition's box scores don't record these stats. Try another chart."
                  : "No teams have played enough games yet. Try a lower minimum."
                : undefined
            }
          >
            <div ref={canvasHostRef} className="w-full" />
            {/* Each crest is a target, so the exact numbers are a hover (or a tap) away. */}
            {hasCard &&
              plotted.map((p) => {
                const team = teams.find((t) => t.id === p.id);
                if (!team) return null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-label={`${cleanTeamLabel(team.name)}: ${preset.x.label} ${formatMetric(team.metrics[preset.x.metric], preset.x)}, ${preset.y.label} ${formatMetric(team.metrics[preset.y.metric], preset.y)}`}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId((id) => (id === p.id ? null : id))}
                    onFocus={() => setHoverId(p.id)}
                    onBlur={() => setHoverId((id) => (id === p.id ? null : id))}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none ring-white/80 hover:ring-2 focus-visible:ring-2"
                    style={{
                      left: `${(p.x / CARD_W) * 100}%`,
                      top: `${(p.y / CARD_H) * 100}%`,
                      width: `${((p.r * 2) / CARD_W) * 100}%`,
                      aspectRatio: "1",
                    }}
                    data-testid={`crest-${p.id}`}
                  />
                );
              })}
            {hovered && hoveredAt && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 rounded-lg border border-white/15 bg-black/90 p-2.5 text-white shadow-xl"
                style={{
                  left: `${Math.max(20, Math.min(80, (hoveredAt.x / CARD_W) * 100))}%`,
                  ...(hoveredAt.y > CARD_H * 0.5
                    ? { bottom: `${100 - ((hoveredAt.y - hoveredAt.r - 10) / CARD_H) * 100}%` }
                    : { top: `${((hoveredAt.y + hoveredAt.r + 10) / CARD_H) * 100}%` }),
                }}
              >
                <p className="truncate text-xs font-semibold">{cleanTeamLabel(hovered.name)}</p>
                <dl className="ch-num mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]">
                  <dt className="text-white/60">{preset.x.label}</dt>
                  <dd className="text-right">{formatMetric(hovered.metrics[preset.x.metric], preset.x)}</dd>
                  <dt className="text-white/60">{preset.y.label}</dt>
                  <dd className="text-right">{formatMetric(hovered.metrics[preset.y.metric], preset.y)}</dd>
                  {preset.highlightMetric && (
                    <>
                      <dt className="text-white/60">Net rating</dt>
                      <dd className="text-right font-semibold">{formatMetric(hovered.metrics[preset.highlightMetric.metric], { signed: true })}</dd>
                    </>
                  )}
                  <dt className="text-white/60">Games</dt>
                  <dd className="text-right">{hovered.games}</dd>
                </dl>
              </div>
            )}
          </Stage>
        )}

        <div className="mx-auto mt-3 max-w-[640px] space-y-2">
          <SaveActions
            canShare={canShareFiles}
            onSave={saveToPhotos}
            saveDisabled={!shareFile || rendering}
            onDownload={download}
            downloadDisabled={!hasCard || rendering || downloading}
            downloading={downloading}
          />
          <p className={`text-center ${HINT}`}>
            {data ? `Based on ${data.gamesCounted} game${data.gamesCounted === 1 ? "" : "s"} · ` : ""}Hover a crest for its numbers · Card size:
            1080×1350px (Instagram portrait)
          </p>
        </div>
      </Panel>
    </div>
  );
}
