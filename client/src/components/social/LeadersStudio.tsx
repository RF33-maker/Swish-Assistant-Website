import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { canvasToBlob, DEFAULT_FRAMING, ensureDisplayFont, type PhotoFraming } from "@/lib/generateWeeklyCards";
import { renderLeadersCard } from "@/lib/generateLeadersCards";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { LeadersResponse } from "@/types/leaders";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
const SLUG_KEY = "weekly-awards-slug";
type CompetitionOption = { slug: string; name: string };

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

function fmtShift(v: number): string {
  const n = Math.round(v);
  return n > 0 ? `+${n}%` : `${n}%`;
}

/** Player / Team league leaders: the top five in a category, with the #1 player's photo or club logo. */
export default function LeadersStudio({ kind }: { kind: "player" | "team" }) {
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readStored(SLUG_KEY) || DEFAULT_SLUG;

  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [category, setCategory] = useState("pts");
  const [minGamesText, setMinGamesText] = useState("");
  const [data, setData] = useState<LeadersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [teamLogoUrls, setTeamLogoUrls] = useState<(string | null)[]>([]);
  const [framing, setFraming] = useState<Record<string, PhotoFraming | undefined>>({});
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
    const params = new URLSearchParams({ kind, category, limit: "5" });
    const minGames = Number(minGamesText);
    if (minGamesText && Number.isFinite(minGames) && minGames >= 1) params.set("minGames", String(Math.floor(minGames)));
    fetch(`/api/league/${encodeURIComponent(slug)}/leaders?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Competition not found or not public" : `Request failed (${res.status})`);
        return (await res.json()) as LeadersResponse;
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
  }, [slug, kind, category, minGamesText]);

  useEffect(() => {
    let cancelled = false;
    setTeamLogoUrls([]);
    if (kind !== "team" || !data) return;
    void Promise.all(
      data.leaders.map((l) => getTeamLogoCached({ leagueId: l.league_id, teamName: l.team_name || l.name }).catch(() => null)),
    ).then((urls) => !cancelled && setTeamLogoUrls(urls));
    return () => {
      cancelled = true;
    };
  }, [kind, data]);

  const brand = useMemo(
    () => ({ leagueName: subtitle || data?.league.name || "", leagueLogoUrl, primaryHex }),
    [subtitle, data, leagueLogoUrl, primaryHex],
  );

  const leader = data?.leaders[0] ?? null;
  const leaderFraming = leader ? framing[leader.id] ?? DEFAULT_FRAMING : DEFAULT_FRAMING;
  const adjust = (patch: Partial<PhotoFraming>) => {
    if (!leader) return;
    setFraming((prev) => ({ ...prev, [leader.id]: { ...leaderFraming, ...patch } }));
  };

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderToken = useRef(0);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const fileName = `${kind}-leaders-${category}-${slug}.png`;

  useEffect(() => {
    const token = ++renderToken.current;
    if (!data || data.leaders.length === 0) {
      cardCanvasRef.current = null;
      canvasHostRef.current?.replaceChildren();
      setHasCard(false);
      setShareFile(null);
      return;
    }
    setRendering(true);
    setShareFile(null);
    void renderLeadersCard({
      kind,
      categoryTitle: data.category.title,
      unit: data.category.short,
      leaders: data.leaders,
      brand,
      teamLogoUrls,
      framing: leaderFraming,
    })
      .then((canvas) => {
        if (token !== renderToken.current) return;
        canvas.style.cssText = "display:block;width:100%;height:auto;";
        cardCanvasRef.current = canvas;
        canvasHostRef.current?.replaceChildren(canvas);
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
  }, [kind, data, brand, teamLogoUrls, leaderFraming, fileName]);

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

  const title = kind === "player" ? "Player leaders" : "Team leaders";
  const chooseSlug = (v: string) => {
    setSlug(v);
    try {
      localStorage.setItem(SLUG_KEY, v);
    } catch {
      // remembering the competition is a convenience only
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="order-2 h-fit min-w-0 border-orange-200 bg-white dark:border-orange-700 dark:bg-gray-800 lg:order-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-orange-900 dark:text-orange-400">{title}</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {kind === "player"
              ? "The top five players in a category, with the leader's photo."
              : "The top five teams in a category, with the leader's club logo."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Competition</label>
            <Select value={slug} onValueChange={chooseSlug}>
              <SelectTrigger className="border-orange-200 dark:border-orange-700">
                <SelectValue placeholder="Choose a competition" />
              </SelectTrigger>
              <SelectContent>
                {!competitions.some((c) => c.slug === slug) && <SelectItem value={slug}>{slug}</SelectItem>}
                {competitions.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="border-orange-200 dark:border-orange-700" data-testid="select-leader-category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {(data?.categories ?? [{ key: "pts", label: "Points" }]).map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Minimum games{data ? ` (auto: ${data.minGames})` : ""}
            </label>
            <Input
              type="number"
              min={1}
              value={minGamesText}
              placeholder={data ? String(data.minGames) : "auto"}
              onChange={(e) => setMinGamesText(e.target.value)}
              className="border-orange-200 dark:border-orange-700"
              data-testid="input-min-games"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Leave empty for half of the most games anyone has played. Percentage categories also need a few attempts.
            </p>
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
              <span className="text-xs text-gray-500">{colorOverride ? "Custom (saved for this competition)" : "From the league logo"}</span>
              {colorOverride && (
                <button className="text-xs text-orange-700 underline" onClick={resetColour}>
                  Reset
                </button>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <Card className="order-1 min-w-0 border-orange-200 bg-white dark:border-orange-700 dark:bg-gray-800 lg:order-2">
        <CardContent className="p-2 sm:p-4">
          {loading && !data ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <div className="relative mx-auto max-w-[640px]">
              <div ref={canvasHostRef} className="w-full overflow-hidden rounded-lg" />
              {rendering && !hasCard && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
              {!hasCard && !rendering && (
                <p className="py-10 text-center text-sm text-gray-500">
                  No {kind === "player" ? "players" : "teams"} qualify yet. Try a lower minimum, or another category.
                </p>
              )}
            </div>
          )}

          {kind === "player" && leader?.photoUrl && (
            <div className="mx-auto mt-3 max-w-[640px] space-y-3 rounded-lg border border-orange-200 bg-orange-50/60 p-3 dark:border-orange-800 dark:bg-orange-950/20">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{leader.name}'s photo</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Adjusts the card only. The photo always fills its panel.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFraming((prev) => ({ ...prev, [leader.id]: undefined }))}
                  disabled={!framing[leader.id]}
                  className="h-8 flex-none gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span className="flex justify-between">
                    Zoom <span className="tabular-nums text-gray-500">{Math.round(leaderFraming.zoom * 100)}%</span>
                  </span>
                  <Slider min={1} max={3} step={0.05} value={[leaderFraming.zoom]} onValueChange={([v]) => adjust({ zoom: v })} />
                </label>
                <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span className="flex justify-between">
                    Left ↔ Right <span className="tabular-nums text-gray-500">{fmtShift(leaderFraming.x)}</span>
                  </span>
                  <Slider min={-50} max={50} step={1} value={[leaderFraming.x]} onValueChange={([v]) => adjust({ x: v })} />
                </label>
                <label className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span className="flex justify-between">
                    Up ↔ Down <span className="tabular-nums text-gray-500">{fmtShift(leaderFraming.y)}</span>
                  </span>
                  <Slider min={-50} max={50} step={1} value={[leaderFraming.y]} onValueChange={([v]) => adjust({ y: v })} />
                </label>
              </div>
            </div>
          )}

          <div className="mx-auto mt-3 max-w-[640px] space-y-2">
            {canShareFiles ? (
              <>
                <Button
                  onClick={saveToPhotos}
                  disabled={!shareFile || rendering}
                  className="w-full bg-orange-500 text-white hover:bg-orange-600"
                  data-testid="button-save-to-photos"
                >
                  <ImagePlus className="mr-2 h-4 w-4" />
                  Save to Photos
                </Button>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">Tap Save Image in the menu that opens.</p>
                <Button onClick={download} disabled={!hasCard || rendering || downloading} variant="outline" className="w-full">
                  {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download file
                </Button>
              </>
            ) : (
              <Button onClick={download} disabled={!hasCard || rendering || downloading} className="w-full bg-orange-500 text-white hover:bg-orange-600">
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download PNG
              </Button>
            )}
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              {data ? `Based on ${data.gamesCounted} game${data.gamesCounted === 1 ? "" : "s"} · ` : ""}Card size: 1080×1350px (Instagram portrait)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
