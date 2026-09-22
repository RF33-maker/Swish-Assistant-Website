import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { canvasToBlob, DEFAULT_HEAD_LINE, ensureDisplayFont } from "@/lib/generateWeeklyCards";
import { renderLineupCard } from "@/lib/generateLineupCard";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { LineupMetric, LineupsResponse } from "@/types/lineups";

const DEFAULT_SLUG = "bcb-trophy-2027";
const SLUG_KEY = "weekly-awards-slug";
const HEADS_KEY = "weekly-awards-heads";
const ALIGN_KEY = "weekly-awards-align";
type CompetitionOption = { slug: string; name: string };

const METRICS: { key: LineupMetric; label: string }[] = [
  { key: "net", label: "Net rating (best per 100 possessions)" },
  { key: "plusminus", label: "Plus / minus" },
  { key: "minutes", label: "Most minutes together" },
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

/** A team's best five-man unit: five photo panels with the unit's numbers underneath. */
export default function LineupsStudio() {
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readJson<string | null>(SLUG_KEY, null) || DEFAULT_SLUG;

  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [teamId, setTeamId] = useState("");
  const [metric, setMetric] = useState<LineupMetric>("net");
  const [minMinutesText, setMinMinutesText] = useState("8");
  const [unitIndex, setUnitIndex] = useState(0);
  const [data, setData] = useState<LineupsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState("");
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [align, setAlign] = useState<{ on: boolean; line: number }>(() => readJson(ALIGN_KEY, { on: true, line: DEFAULT_HEAD_LINE }));
  const heads = useMemo(() => readJson<Record<string, { x: number; y: number }>>(HEADS_KEY, {}), []);

  const { leagueLogoUrl, primaryHex, colorOverride, updateColour, resetColour } = useCompetitionCardBrand(slug);

  useEffect(() => {
    let cancelled = false;
    void ensureDisplayFont();
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      let list: CompetitionOption[] | null = null;
      if (token) {
        const res = await fetch("/api/social/competitions", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
        if (res?.ok) list = (await res.json()) as CompetitionOption[];
      }
      if (!list) {
        const { data: rows } = await supabase
          .from("competitions")
          .select("slug, name")
          .eq("is_public", true)
          .not("slug", "is", null)
          .order("created_at", { ascending: false })
          .limit(120);
        list = (rows as CompetitionOption[] | null) ?? [];
      }
      if (!cancelled) setCompetitions(list.filter((c) => c.slug && c.name));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const params = new URLSearchParams({ metric, limit: "3", minMinutes: String(Math.max(1, Number(minMinutesText) || 8)) });
      if (teamId) params.set("team_id", teamId);
      const res = await fetch(`/api/league/${encodeURIComponent(slug)}/lineups?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(res.status === 404 ? "Competition not found, or you don't have access. Sign in as its owner or an admin." : `Request failed (${res.status})`);
      return (await res.json()) as LineupsResponse;
    })()
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setSubtitle(stripSeason(json.league.name));
        if (!teamId && json.team) setTeamId(json.team.team_id);
      })
      .catch((err) => !cancelled && (setData(null), setError(err.message)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug, teamId, metric, minMinutesText]);

  useEffect(() => setUnitIndex(0), [slug, teamId, metric, minMinutesText]);

  const unit = data?.units[unitIndex] ?? null;
  const teamName = data?.team?.name ?? "";

  useEffect(() => {
    let cancelled = false;
    setTeamLogoUrl(null);
    if (!data?.team) return;
    void getTeamLogoCached({ leagueId: data.league.league_id, teamName: data.team.name })
      .then((url) => !cancelled && setTeamLogoUrl(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data?.team, data?.league.league_id]);

  const brand = useMemo(
    () => ({ leagueName: subtitle || data?.league.name || "", leagueLogoUrl, primaryHex }),
    [subtitle, data, leagueLogoUrl, primaryHex],
  );

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderToken = useRef(0);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const fileName = `best-lineup-${slug}-${teamId || "team"}-${unitIndex + 1}.png`;

  useEffect(() => {
    const token = ++renderToken.current;
    if (!unit) {
      cardCanvasRef.current = null;
      canvasHostRef.current?.replaceChildren();
      setHasCard(false);
      setShareFile(null);
      return;
    }
    setRendering(true);
    setShareFile(null);
    void renderLineupCard({ unit, teamName, brand, teamLogoUrl, heads, alignHeads: align.on, headLine: align.line })
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
  }, [unit, teamName, brand, teamLogoUrl, heads, align, fileName]);

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
    setTeamId("");
    setSlug(v);
    try {
      localStorage.setItem(SLUG_KEY, JSON.stringify(v));
    } catch {
      // remembering the competition is a convenience only
    }
  };
  const updateAlign = (patch: Partial<{ on: boolean; line: number }>) => {
    const next = { ...align, ...patch };
    setAlign(next);
    try {
      localStorage.setItem(ALIGN_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="order-2 h-fit min-w-0 border-orange-200 bg-white dark:border-orange-700 dark:bg-gray-800 lg:order-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-orange-900 dark:text-orange-400">Best lineup</CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">A team's best five-man unit, from who was on court together.</p>
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
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Team</label>
            <Select value={teamId} onValueChange={setTeamId} disabled={!data?.teams.length}>
              <SelectTrigger className="border-orange-200 dark:border-orange-700" data-testid="select-lineup-team">
                <SelectValue placeholder="Best team" />
              </SelectTrigger>
              <SelectContent>
                {(data?.teams ?? []).map((t) => (
                  <SelectItem key={t.team_id} value={t.team_id}>
                    {t.name} ({t.units})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 dark:text-gray-400">The number is how many units qualify for that team.</p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rank units by</label>
            <Select value={metric} onValueChange={(v) => setMetric(v as LineupMetric)}>
              <SelectTrigger className="border-orange-200 dark:border-orange-700" data-testid="select-lineup-metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Min. minutes together</label>
              <Input
                type="number"
                min={1}
                value={minMinutesText}
                onChange={(e) => setMinMinutesText(e.target.value)}
                className="border-orange-200 dark:border-orange-700"
                data-testid="input-min-minutes"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Which unit</label>
              <Select value={String(unitIndex)} onValueChange={(v) => setUnitIndex(Number(v))} disabled={!data?.units.length}>
                <SelectTrigger className="border-orange-200 dark:border-orange-700" data-testid="select-lineup-rank">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(data?.units ?? []).map((u, i) => (
                    <SelectItem key={i} value={String(i)}>
                      #{u.rank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
            Small samples swing wildly early in a season, so keep the minimum up. Units with barely any recorded possessions are ignored.
          </p>

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

          <div className="space-y-2 rounded-md border border-orange-200 p-2.5 dark:border-orange-700">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={align.on} onChange={(e) => updateAlign({ on: e.target.checked })} />
              Line up heads across the photos
            </label>
            {align.on && (
              <>
                <label className="block space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                  <span className="flex justify-between">
                    Head height <span className="tabular-nums text-gray-500">{align.line}%</span>
                  </span>
                  <Slider min={10} max={50} step={1} value={[align.line]} onValueChange={([v]) => updateAlign({ line: v })} />
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Uses the faces you have marked in Team of the Week. Others use a guess until they are marked there.
                </p>
              </>
            )}
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
              {!hasCard && !rendering && !error && (
                <p className="py-10 text-center text-sm text-gray-500">No five-man unit has played enough together yet. Try a lower minimum.</p>
              )}
            </div>
          )}
          <div className="mx-auto mt-3 max-w-[640px] space-y-2">
            {canShareFiles ? (
              <>
                <Button onClick={saveToPhotos} disabled={!shareFile || rendering} className="w-full bg-orange-500 text-white hover:bg-orange-600" data-testid="button-save-to-photos">
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
              {data ? `Built from ${data.stintsUsed} stints in ${data.reliability.reliable} of ${data.reliability.teamGames} team-games that match the box score · ` : ""}Card size: 1080×1350px (Instagram portrait)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
