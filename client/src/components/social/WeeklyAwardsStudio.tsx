import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  renderTeamOfTheWeek,
  teamPanelIndexAt,
  type FramingMap,
  type HeadMap,
  type HeadPoint,
  type PhotoFraming,
} from "@/lib/generateWeeklyCards";
import type { WeeklyAward, WeeklyAwardsResponse } from "@/types/weeklyAwards";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
type CompetitionOption = { slug: string; name: string };
type CardKind = "team" | "player";

/** Phones (touch devices that can share files) get the share sheet, whose "Save Image" goes straight to Photos. */
function supportsFileSharing(file: File): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

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

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

type StudioProps = {
  kind: CardKind;
  showGameScore: boolean;
  onShowGameScoreChange: (on: boolean) => void;
};

export default function WeeklyAwardsStudio({ kind, showGameScore, onShowGameScoreChange }: StudioProps) {
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readStored(SLUG_KEY) || DEFAULT_SLUG;

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
  const cardFileName = `${kind === "team" ? "team" : "player"}-of-the-week-${slug}-${weekStart || "latest"}.png`;
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
  }, [kind, chosen, potw, brand, teamLogoUrl, framing, tint, showGameScore, headMap, align, cardFileName]);

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
    try {
      // Only the file, no title or text: that is what makes iOS offer "Save Image".
      await navigator.share({ files: [shareFile] });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError("Couldn't open the share sheet. Use Download file instead.");
      }
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
    try {
      localStorage.setItem(SLUG_KEY, v);
    } catch {
      // remembering the competition is a convenience only
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="order-2 h-fit min-w-0 bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700 lg:order-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-orange-900 dark:text-orange-400">{title}</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {kind === "team"
              ? "The five best game scores across a Monday–Sunday week."
              : "The best game score of the week, as a full-photo card."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Competition</label>
            <Select value={slug} onValueChange={chooseSlug}>
              <SelectTrigger className="border-orange-200 dark:border-orange-700"><SelectValue placeholder="Choose a competition" /></SelectTrigger>
              <SelectContent>
                {!competitions.some((c) => c.slug === slug) && <SelectItem value={slug}>{slug}</SelectItem>}
                {competitions.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Week</label>
            <Select value={weekStart} onValueChange={setWeekStart} disabled={!data?.weeks.length}>
              <SelectTrigger className="border-orange-200 dark:border-orange-700"><SelectValue placeholder="Latest week" /></SelectTrigger>
              <SelectContent>
                {(data?.weeks || []).map((w) => (
                  <SelectItem key={w} value={w}>{fmtWeek(w)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Card subtitle</label>
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className="border-orange-200 dark:border-orange-700" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Card colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(primaryHex) ? primaryHex : "#f97316"}
                onChange={(e) => updateColour(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border"
              />
              <span className="text-xs text-gray-500">
                {colorOverride ? "Custom (saved for this competition)" : "From the league logo"}
              </span>
              {colorOverride && (
                <button
                  className="text-xs text-orange-700 underline"
                  onClick={() => { setColorOverride(null); try { localStorage.removeItem(`weekly-awards-colour:${slug}`); } catch { /* ignore */ } }}
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-orange-200 p-3 dark:border-orange-700">
            <input
              type="checkbox"
              checked={showGameScore}
              onChange={(e) => onShowGameScoreChange(e.target.checked)}
              className="mt-0.5"
              data-testid="toggle-game-score"
            />
            <span>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Show game score</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Players are still picked by game score; this only shows or hides the number on the card.
              </span>
            </span>
          </label>

          {kind === "team" && (
            <div className="space-y-1">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Players ({selected.length}/5) — top game scores, untick to swap
              </div>
              <div className="max-h-[420px] divide-y overflow-y-auto rounded-md border border-orange-200 bg-white dark:border-orange-700 dark:bg-gray-900">
                {(data?.awards || []).map((a) => (
                  <label key={a.player_id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(a.player_id)}
                      onChange={() => toggle(a.player_id)}
                      disabled={!selected.includes(a.player_id) && selected.length >= 5}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{a.full_name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {a.team_name} · {a.pts}p {a.reb}r {a.ast}a
                        {!a.photoUrl && " · no photo"}
                      </span>
                    </span>
                    <span className="tabular-nums text-orange-600">{a.game_score != null ? Number(a.game_score).toFixed(1) : "—"}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      <Card className="order-1 min-w-0 bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700 lg:order-2">
        <CardContent className="p-2 sm:p-4">
          {loading && !data ? (
            <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
          ) : (
            <div className="relative mx-auto max-w-[640px]">
              <div
                ref={canvasHostRef}
                onClick={selectPanelAt}
                className={`w-full overflow-hidden rounded-lg ${kind === "team" ? "cursor-pointer" : ""}`}
              />
              {rendering && !hasCard && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
              {!hasCard && !rendering && (
                <p className="py-10 text-center text-sm text-gray-500">No stats found for this week.</p>
              )}
            </div>
          )}
          {target && targetFraming && (
            <div className="mx-auto mt-3 max-w-[640px] space-y-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-800 dark:bg-orange-950/20">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Photo framing</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Adjusts the card only. Your original photo stays unchanged.</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetFraming}
                  disabled={!framing[target.player_id]}
                  className="h-8 flex-none gap-1.5"
                  data-testid="button-reset-photo-framing"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
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
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                          on
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-orange-200 bg-white text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:bg-gray-900 dark:text-orange-300"
                        }`}
                      >
                        {a.full_name.split(" ").slice(-1)[0]}
                        {framing[a.player_id] ? " •" : ""}
                        {align.on && a.photoUrl && !heads[a.photoUrl] ? " ?" : ""}
                      </button>
                    );
                  })}
                </div>
              )}
              {kind === "team" && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Tip: tap a photo in the preview to adjust it.</p>
              )}

              {kind === "team" && (
                <div className="space-y-2 rounded-md border border-orange-200 bg-white/70 p-2.5 dark:border-orange-700 dark:bg-gray-900/40">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={align.on}
                      onChange={(e) => updateAlign({ on: e.target.checked })}
                      data-testid="toggle-align-heads"
                    />
                    Line up heads across the photos
                  </label>
                  {align.on && (
                    <>
                      <label className="block space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                        <span className="flex justify-between">
                          Head height
                          <span className="tabular-nums text-gray-500">{align.line}%</span>
                        </span>
                        <Slider min={10} max={50} step={1} value={[align.line]} onValueChange={([v]) => updateAlign({ line: v })} data-testid="slider-head-line" />
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Photos always fill their frame with nothing faded. Each one is zoomed and shifted just enough to put the marked
                        face on this line.
                      </p>
                      {needMarks.length > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Mark the face for {needMarks.map((a) => a.full_name.split(" ").slice(-1)[0]).join(", ")} (chips with ?). Until then a
                          guess is used.
                        </p>
                      )}
                      {couldNotAlign.length > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          {couldNotAlign.map((a) => a.full_name.split(" ").slice(-1)[0]).join(", ")}: face is too close to the edge of the
                          photo to reach the line without zooming in too far, so it sits as near as it can.
                        </p>
                      )}
                      {target.photoUrl && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              Tap the middle of {target.full_name.split(" ")[0]}'s face
                            </p>
                            {targetHead && (
                              <button type="button" onClick={clearHead} className="text-xs text-orange-700 underline">
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
                                className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-500 bg-white/30 shadow"
                                style={{ left: `${targetHead.x * 100}%`, top: `${targetHead.y * 100}%` }}
                              />
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Saved for this photo, so you only do it once.</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {!target.photoUrl ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">{target.full_name} has no photo yet, so there is nothing to frame.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <span className="flex justify-between">
                      Zoom
                      <span className="tabular-nums text-gray-500">{Math.round(targetFraming.zoom * 100)}%</span>
                    </span>
                    <Slider min={kind === "team" ? 1 : 0.4} max={3} step={0.05} value={[targetFraming.zoom]} onValueChange={([v]) => adjust({ zoom: v })} data-testid="slider-photo-zoom" />
                  </label>
                  <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <span className="flex justify-between">
                      Left ↔ Right
                      <span className="tabular-nums text-gray-500">{fmtShift(targetFraming.x)}</span>
                    </span>
                    <Slider min={-50} max={50} step={1} value={[targetFraming.x]} onValueChange={([v]) => adjust({ x: v })} data-testid="slider-photo-position-x" />
                  </label>
                  <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                    <span className="flex justify-between">
                      Up ↔ Down
                      <span className="tabular-nums text-gray-500">{fmtShift(targetFraming.y)}</span>
                    </span>
                    <Slider min={-50} max={50} step={1} value={[targetFraming.y]} onValueChange={([v]) => adjust({ y: v })} data-testid="slider-photo-position-y" />
                  </label>
                </div>
              )}

              {kind === "player" && target.photoUrl && (
                <label className="block space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span className="flex justify-between">
                    Colour tint
                    <span className="tabular-nums text-gray-500">{tint}%</span>
                  </span>
                  <Slider min={0} max={100} step={5} value={[tint]} onValueChange={([v]) => setTint(v)} data-testid="slider-photo-tint" />
                  <span className="block font-normal text-gray-500 dark:text-gray-400">
                    How much of the competition colour washes over the soft photo behind the player. 0% is just the photo.
                  </span>
                </label>
              )}

              {target.photoUrl && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {kind === "team"
                    ? "Fine-tune just this photo: extra zoom, or nudge the head from the shared line. The photo always stays filled edge to edge."
                    : "Move the photo freely: any space that opens up at an edge shows a soft blurred copy of the same photo. Slide Down (or zoom out) to bring a player's head clear of the heading."}
                </p>
              )}
            </div>
          )}

          <div className="mx-auto mt-3 max-w-[640px] space-y-2">
            {canShareFiles ? (
              <>
                <Button
                  onClick={saveToPhotos}
                  disabled={!shareFile || rendering}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                  data-testid="button-save-to-photos"
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Save to Photos
                </Button>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">Tap Save Image in the menu that opens.</p>
                <Button
                  onClick={download}
                  disabled={!hasCard || rendering || downloading}
                  variant="outline"
                  className="w-full"
                  data-testid="button-download-file"
                >
                  {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download file
                </Button>
              </>
            ) : (
              <Button onClick={download} disabled={!hasCard || rendering || downloading} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download PNG
              </Button>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">Card size: 1080×1350px (Instagram portrait)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
