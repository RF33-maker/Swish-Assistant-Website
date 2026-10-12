import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerPhotoButton, PlayerPhotoControl } from "@/components/social/PlayerPhotoControl";
import {
  BTN_GHOST,
  ColourField,
  CompetitionField,
  ERROR,
  FIELD,
  Field,
  HINT,
  Panel,
  RangeField,
  readStoredCompetition,
  rememberCompetition,
  SaveActions,
  SELECT_MENU,
  Stage,
  Toggle,
  type CompetitionOption,
} from "@/components/social/studioUi";
import { photoChangeLendsTo, usePlayerPhotoChange } from "@/lib/playerPhotos";
import { supabase } from "@/lib/supabase";
import { usePublicLeagueBrandingBySlug } from "@/hooks/usePublicLeagueBranding";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { extractColorsFromImage } from "@/lib/colorExtractor";
import {
  DEFAULT_HEAD_LINE,
  DEFAULT_TINT,
  canvasToBlob,
  defaultFraming,
  ensureDisplayFont,
  renderPlayerOfTheWeek,
  type FramingMap,
  type HeadMap,
  type HeadPoint,
  type PhotoFraming,
} from "@/lib/generateWeeklyCards";
import { renderTeamOfTheWeek, teamPanelIndexAt } from "@/lib/generateTeamOfTheWeekCard";
import CardStylePicker, { useCardStyle } from "@/components/social/CardStylePicker";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { WeeklyAward, WeeklyAwardsResponse } from "@/types/weeklyAwards";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
type CardKind = "team" | "player";

function fmtShift(v: number): string {
  const n = Math.round(v);
  return n > 0 ? `+${n}%` : `${n}%`;
}

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

function fmtWeek(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86400000);
  const f = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(start)} – ${f(end)}`;
}

function toHex(rgb?: { r: number; g: number; b: number } | null): string {
  if (!rgb) return "#f97316";
  return `#${[rgb.r, rgb.g, rgb.b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("")}`;
}

const SLUG_KEY = "weekly-awards-slug";
const HEADS_KEY = "weekly-awards-heads";
const ALIGN_KEY = "weekly-awards-align";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // remembering these is a convenience only
  }
}

type StudioProps = {
  kind: CardKind;
  showGameScore: boolean;
  onShowGameScoreChange: (on: boolean) => void;
};

export default function WeeklyAwardsStudio({ kind, showGameScore, onShowGameScoreChange }: StudioProps) {
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG;

  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [weekStart, setWeekStart] = useState<string>("");
  const [data, setData] = useState<WeeklyAwardsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [subtitle, setSubtitle] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Made ahead of time: iOS only opens the share sheet from a fresh tap, so the file must already exist.
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [framing, setFraming] = useState<FramingMap>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  // Marked face positions, saved by photo so they are reused week after week.
  const [heads, setHeads] = useState<Record<string, HeadPoint>>(() => readJson(HEADS_KEY, {}));
  const [align, setAlign] = useState<{ on: boolean; line: number }>(() =>
    readJson(ALIGN_KEY, { on: true, line: DEFAULT_HEAD_LINE }),
  );
  const [unaligned, setUnaligned] = useState<string[]>([]);
  const [tint, setTint] = useState(DEFAULT_TINT);
  // Team of the Week only: the look shared with the leaders cards, and each player's club crest.
  const [style, setStyle] = useCardStyle();
  const [clubLogos, setClubLogos] = useState<Record<string, string | null>>({});

  const [leagueLogoUrl, setLeagueLogoUrl] = useState<string | null>(null);
  const [logoColorHex, setLogoColorHex] = useState<string | null>(null);
  const [colorOverride, setColorOverride] = useState<string | null>(null);

  const { colors } = usePublicLeagueBrandingBySlug({ slug, enabled: !!slug });
  const primaryHex = colorOverride || logoColorHex || toHex(colors?.primaryRgb);

  // Same lookup Swish Social uses: the competition's own logo, else its league brand's.
  useEffect(() => {
    let cancelled = false;
    setLeagueLogoUrl(null);
    setLogoColorHex(null);
    const queryColour = new URLSearchParams(window.location.search).get("colour");
    if (queryColour && /^[0-9a-f]{6}$/i.test(queryColour)) {
      setColorOverride(`#${queryColour}`);
    } else {
      try {
        setColorOverride(localStorage.getItem(`weekly-awards-colour:${slug}`));
      } catch {
        setColorOverride(null);
      }
    }
    void (async () => {
      const { data: comp } = await supabase
        .from("competitions")
        .select("logo_url, competition_id")
        .eq("slug", slug)
        .maybeSingle();
      let logo: string | null = comp?.logo_url || null;
      if (!logo && comp?.competition_id) {
        const { data: brandRow } = await supabase.from("leagues").select("logo_url").eq("id", comp.competition_id).maybeSingle();
        logo = brandRow?.logo_url || null;
      }
      if (cancelled) return;
      setLeagueLogoUrl(logo);
      if (logo) {
        const extracted = await extractColorsFromImage(logo).catch(() => null);
        if (!cancelled && extracted) setLogoColorHex(toHex(extracted.primaryRgb));
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const updateColour = (hex: string) => {
    setColorOverride(hex);
    try {
      localStorage.setItem(`weekly-awards-colour:${slug}`, hex);
    } catch {
      // remembering the colour is a convenience only
    }
  };

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
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ count: "10" });
    if (weekStart) params.set("weekStart", weekStart);
    fetch(`/api/league/${encodeURIComponent(slug)}/weekly-awards?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Competition not found or not public" : `Request failed (${res.status})`);
        return (await res.json()) as WeeklyAwardsResponse;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
        if (!weekStart && json.weekStart) setWeekStart(json.weekStart);
        setSelected(json.awards.slice(0, 5).map((a) => a.player_id));
        setSubtitle(stripSeason(json.league.name));
      })
      .catch((err) => !cancelled && (setData(null), setError(err.message)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [slug, weekStart]);

  const chosen: WeeklyAward[] = useMemo(
    () => (data?.awards || []).filter((a) => selected.includes(a.player_id)),
    [data, selected],
  );
  const potw = data?.awards[0] || null;

  // A photo added here or in another studio: redraw with it, keeping the week, the picks and the subtitle.
  usePlayerPhotoChange((change) => {
    const gained = (data?.awards || []).filter((a) =>
      photoChangeLendsTo(change, { playerId: a.player_id, name: a.full_name, hasPhoto: !!a.photoUrl }),
    );
    if (gained.length === 0) return;
    const ids = new Set(gained.map((a) => a.player_id));
    setData((prev) => prev && { ...prev, awards: prev.awards.map((a) => (ids.has(a.player_id) ? { ...a, photoUrl: change.url } : a)) });
    // Framing set for the old photo wouldn't suit the new one.
    setFraming((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))));
  });

  // The player whose photo the framing sliders currently adjust.
  const target: WeeklyAward | null =
    kind === "player" ? potw : chosen.find((a) => a.player_id === activeId) ?? chosen[0] ?? null;
  const targetFraming: PhotoFraming | null = target ? framing[target.player_id] ?? defaultFraming(target) : null;

  const adjust = (patch: Partial<PhotoFraming>) => {
    if (!target || !targetFraming) return;
    setFraming((prev) => ({ ...prev, [target.player_id]: { ...targetFraming, ...patch } }));
  };
  const resetFraming = () => {
    if (!target) return;
    setFraming((prev) => ({ ...prev, [target.player_id]: undefined }));
  };

  const headMap: HeadMap = useMemo(
    () => Object.fromEntries(chosen.map((a) => [a.player_id, a.photoUrl ? heads[a.photoUrl] : undefined])),
    [chosen, heads],
  );
  const needMarks = kind === "team" && align.on ? chosen.filter((a) => a.photoUrl && !heads[a.photoUrl]) : [];
  const couldNotAlign = kind === "team" && align.on ? chosen.filter((a) => a.photoUrl && heads[a.photoUrl] && unaligned.includes(a.player_id)) : [];
  const targetHead = target?.photoUrl ? heads[target.photoUrl] : undefined;

  const updateAlign = (patch: Partial<{ on: boolean; line: number }>) => {
    const next = { ...align, ...patch };
    setAlign(next);
    writeJson(ALIGN_KEY, next);
  };
  const markHead = (e: React.MouseEvent<HTMLImageElement>) => {
    const photo = target?.photoUrl;
    if (!photo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
    const next = { ...heads, [photo]: point };
    setHeads(next);
    writeJson(HEADS_KEY, next);
  };
  const clearHead = () => {
    const photo = target?.photoUrl;
    if (!photo) return;
    const next = { ...heads };
    delete next[photo];
    setHeads(next);
    writeJson(HEADS_KEY, next);
  };

  useEffect(() => {
    let cancelled = false;
    setTeamLogoUrl(null);
    if (!potw?.team_name) return;
    void getTeamLogoCached({ leagueId: potw.league_id, teamName: potw.team_name }).then((url) => !cancelled && setTeamLogoUrl(url));
    return () => { cancelled = true; };
  }, [potw]);

  useEffect(() => {
    let cancelled = false;
    if (kind !== "team") return;
    void Promise.all(
      chosen.map(async (a) => {
        const url = a.team_name ? await getTeamLogoCached({ leagueId: a.league_id, teamName: a.team_name }).catch(() => null) : null;
        return [a.player_id, url] as const;
      }),
    ).then((pairs) => !cancelled && setClubLogos(Object.fromEntries(pairs)));
    return () => { cancelled = true; };
  }, [kind, chosen]);

  const brand = useMemo(
    () => ({
      leagueName: subtitle || data?.league.name || "",
      leagueLogoUrl,
      primaryHex,
    }),
    [subtitle, data, leagueLogoUrl, primaryHex],
  );

  // The preview is the exact canvas that gets exported, so what you see is what you download.
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const styleSuffix = kind === "team" && style !== "league" ? `-${style}` : "";
  const cardFileName = `${kind === "team" ? "team" : "player"}-of-the-week-${slug}-${weekStart || "latest"}${styleSuffix}.png`;
  const renderToken = useRef(0);

  useEffect(() => {
    const token = ++renderToken.current;
    const ready = kind === "team" ? chosen.length > 0 : !!potw;
    if (!ready) {
      cardCanvasRef.current = null;
      canvasHostRef.current?.replaceChildren();
      setHasCard(false);
      return;
    }
    setRendering(true);
    setShareFile(null);
    const draw =
      kind === "team"
        ? renderTeamOfTheWeek(chosen, brand, {
            style,
            weekLabel: weekStart ? fmtWeek(weekStart) : "",
            teamLogoUrls: clubLogos,
            framing,
            showGameScore,
            heads: headMap,
            alignHeads: align.on,
            headLine: align.line,
          }).then((result) => {
            if (token === renderToken.current) setUnaligned(result.unaligned);
            return result.canvas;
          })
        : renderPlayerOfTheWeek(potw!, brand, teamLogoUrl, framing[potw!.player_id], tint, showGameScore);
    void draw
      .then((canvas) => {
        if (token !== renderToken.current) return;
        canvas.style.cssText = "display:block;width:100%;height:auto;";
        cardCanvasRef.current = canvas;
        canvasHostRef.current?.replaceChildren(canvas);
        setHasCard(true);
        void canvasToBlob(canvas).then((blob) => {
          if (token !== renderToken.current || !blob) return;
          const file = new File([blob], cardFileName, { type: "image/png" });
          setShareFile(file);
          setCanShareFiles(supportsFileSharing(file));
        });
      })
      .catch((err) => token === renderToken.current && setError(err?.message || "Could not draw the card"))
      .finally(() => token === renderToken.current && setRendering(false));
  }, [kind, chosen, potw, brand, teamLogoUrl, framing, tint, showGameScore, headMap, align, cardFileName, style, clubLogos, weekStart]);

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 5 ? cur : [...cur, id]));

  const selectPanelAt = (e: React.MouseEvent<HTMLDivElement>) => {
    const canvas = cardCanvasRef.current;
    if (kind !== "team" || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const index = teamPanelIndexAt(((e.clientX - rect.left) / rect.width) * canvas.width, chosen.length);
    if (index != null) setActiveId(chosen[index].player_id);
  };

  const saveToPhotos = async () => {
    if (!shareFile) return;
    if ((await shareImageFile(shareFile)) === "failed") {
      setError("Couldn't open the share sheet. Use Download file instead.");
    }
  };

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
      a.download = cardFileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const title = kind === "team" ? "Team of the Week" : "Player of the Week";

  const chooseSlug = (v: string) => {
    setWeekStart("");
    setSlug(v);
    rememberCompetition(SLUG_KEY, v);
  };

  const lastName = (a: WeeklyAward) => a.full_name.split(" ").slice(-1)[0];

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title={title}
        description={
          kind === "team"
            ? "The five best game scores across a Monday–Sunday week."
            : "The best game score of the week, as a full-photo card."
        }
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Week">
          <Select value={weekStart} onValueChange={setWeekStart} disabled={!data?.weeks.length}>
            <SelectTrigger className={FIELD} data-testid="select-week">
              <SelectValue placeholder="Latest week" />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {(data?.weeks || []).map((w) => (
                <SelectItem key={w} value={w}>{fmtWeek(w)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Card subtitle">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={FIELD} />
        </Field>

        {kind === "team" && <CardStylePicker value={style} onChange={setStyle} primaryHex={primaryHex} />}

        {!(kind === "team" && style === "swish") && (
          <ColourField
            value={primaryHex}
            custom={!!colorOverride}
            onChange={updateColour}
            onReset={() => { setColorOverride(null); try { localStorage.removeItem(`weekly-awards-colour:${slug}`); } catch { /* ignore */ } }}
          />
        )}

        <Toggle
          checked={showGameScore}
          onChange={onShowGameScoreChange}
          label="Show game score"
          hint="Players are still picked by game score; this only shows or hides the number on the card."
          testId="toggle-game-score"
        />

        {kind === "team" && (
          <Field label={`Players (${selected.length}/5) — top game scores, untick to swap`}>
            <div className="ch-tile max-h-[420px] divide-y divide-[color:var(--ch-border)] overflow-y-auto">
              {(data?.awards || []).map((a) => (
                <label key={a.player_id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(a.player_id)}
                    onChange={() => toggle(a.player_id)}
                    disabled={!selected.includes(a.player_id) && selected.length >= 5}
                    className="h-4 w-4 flex-none accent-[color:var(--ch-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[color:var(--ch-text)]">{a.full_name}</span>
                    <span className="block truncate text-xs text-[color:var(--ch-muted)]">
                      {a.team_name} · {a.pts}p {a.reb}r {a.ast}a
                    </span>
                  </span>
                  {!a.photoUrl && <PlayerPhotoButton playerId={a.player_id} playerName={a.full_name} />}
                  <span className="ch-num flex-none font-semibold text-[color:var(--ch-accent)]">{a.game_score != null ? Number(a.game_score).toFixed(1) : "—"}</span>
                </label>
              ))}
            </div>
          </Field>
        )}
      </Panel>

      <Panel className="order-1 lg:order-2" bodyClassName="!p-3 sm:!p-5">
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" /></div>
        ) : (
          <Stage busy={rendering && !hasCard} empty={!hasCard && !rendering ? "No stats found for this week." : undefined}>
            <div
              ref={canvasHostRef}
              onClick={selectPanelAt}
              className={`w-full ${kind === "team" ? "cursor-pointer" : ""}`}
            />
          </Stage>
        )}
        {target && targetFraming && (
          <div className="mx-auto mt-3 max-w-[640px] space-y-3">
            <PlayerPhotoControl
              key={target.player_id}
              playerId={target.player_id}
              playerName={target.full_name}
              photoUrl={target.photoUrl}
            />

            <div className="ch-tile space-y-3 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[color:var(--ch-text)]">Photo framing</p>
                  <p className={HINT}>Adjusts the card only. Your original photo stays unchanged.</p>
                </div>
                <button
                  type="button"
                  onClick={resetFraming}
                  disabled={!framing[target.player_id]}
                  className={`${BTN_GHOST} flex-none`}
                  data-testid="button-reset-photo-framing"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </div>

              {kind === "team" && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Choose the player to adjust">
                  {chosen.map((a) => {
                    const on = a.player_id === target.player_id;
                    return (
                      <button
                        key={a.player_id}
                        type="button"
                        onClick={() => setActiveId(a.player_id)}
                        aria-pressed={on}
                        data-active={on}
                        className="ch-chip px-3 py-1 text-xs"
                      >
                        {lastName(a)}
                        {framing[a.player_id] ? " •" : ""}
                        {!a.photoUrl ? " (no photo)" : align.on && !heads[a.photoUrl] ? " ?" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              {kind === "team" && (
                <p className={HINT}>Tip: tap a photo in the preview to adjust it.</p>
              )}

              {kind === "team" && (
                <div className="space-y-2 rounded-lg border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-2.5">
                  <Toggle
                    bare
                    checked={align.on}
                    onChange={(on) => updateAlign({ on })}
                    label="Line up heads across the photos"
                    testId="toggle-align-heads"
                  />
                  {align.on && (
                    <>
                      <RangeField
                        label="Head height"
                        display={`${align.line}%`}
                        min={10}
                        max={50}
                        step={1}
                        value={align.line}
                        onChange={(v) => updateAlign({ line: v })}
                        testId="slider-head-line"
                      />
                      <p className={HINT}>
                        Each photo is zoomed and shifted just enough to put the marked face on this line.
                      </p>
                      {needMarks.length > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Mark the face for {needMarks.map(lastName).join(", ")} (chips with ?). Until then a
                          guess is used.
                        </p>
                      )}
                      {couldNotAlign.length > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {couldNotAlign.map(lastName).join(", ")}: face is too close to the edge of the
                          photo to reach the line without zooming in too far, so it sits as near as it can.
                        </p>
                      )}
                      {target.photoUrl && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-[color:var(--ch-text)]">
                              Tap the middle of {target.full_name.split(" ")[0]}'s face
                            </p>
                            {targetHead && (
                              <button type="button" onClick={clearHead} className="text-xs font-medium text-[color:var(--ch-accent)] hover:underline">
                                Clear
                              </button>
                            )}
                          </div>
                          <div className="relative mx-auto w-fit">
                            <img
                              src={target.photoUrl}
                              alt={target.full_name}
                              draggable={false}
                              onClick={markHead}
                              className="block max-h-64 max-w-full cursor-crosshair rounded-md"
                              data-testid="img-mark-head"
                            />
                            {targetHead && (
                              <span
                                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--ch-accent)] bg-white/30 shadow"
                                style={{ left: `${targetHead.x * 100}%`, top: `${targetHead.y * 100}%` }}
                              />
                            )}
                          </div>
                          <p className={HINT}>Saved for this photo, so you only do it once.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {!target.photoUrl ? (
                <p className={HINT}>Add a photo for {target.full_name} above and the framing controls appear here.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <RangeField
                    label="Zoom"
                    display={`${Math.round(targetFraming.zoom * 100)}%`}
                    min={kind === "team" ? 1 : 0.4}
                    max={3}
                    step={0.05}
                    value={targetFraming.zoom}
                    onChange={(v) => adjust({ zoom: v })}
                    testId="slider-photo-zoom"
                  />
                  <RangeField
                    label="Left ↔ Right"
                    display={fmtShift(targetFraming.x)}
                    min={-50}
                    max={50}
                    step={1}
                    value={targetFraming.x}
                    onChange={(v) => adjust({ x: v })}
                    testId="slider-photo-position-x"
                  />
                  <RangeField
                    label="Up ↔ Down"
                    display={fmtShift(targetFraming.y)}
                    min={-50}
                    max={50}
                    step={1}
                    value={targetFraming.y}
                    onChange={(v) => adjust({ y: v })}
                    testId="slider-photo-position-y"
                  />
                </div>
              )}

              {kind === "player" && target.photoUrl && (
                <RangeField
                  label="Colour tint"
                  display={`${tint}%`}
                  min={0}
                  max={100}
                  step={5}
                  value={tint}
                  onChange={setTint}
                  testId="slider-photo-tint"
                  hint="How much of the competition colour washes over the soft photo behind the player. 0% is just the photo."
                />
              )}

              {target.photoUrl && (
                <p className={HINT}>
                  {kind === "team"
                    ? "Fine-tune just this photo: extra zoom, or nudge the head from the shared line. Its edges melt into the photos beside it."
                    : "Move the photo freely: any space that opens up at an edge shows a soft blurred copy of the same photo. Slide Down (or zoom out) to bring a player's head clear of the heading."}
                </p>
              )}
            </div>
          </div>
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
          {error && <p className={ERROR}>{error}</p>}
          <p className={`text-center ${HINT}`}>Card size: 1080×1350px (Instagram portrait)</p>
        </div>
      </Panel>
    </div>
  );
}
