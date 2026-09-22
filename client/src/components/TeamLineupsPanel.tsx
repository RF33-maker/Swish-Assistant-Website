import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { canvasToBlob, ensureDisplayFont } from "@/lib/generateWeeklyCards";
import { renderLineupSimpleCard } from "@/lib/generateLineupSimpleCard";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { LineupMetric, LineupUnit, LineupsResponse } from "@/types/lineups";

const HEADS_KEY = "weekly-awards-heads";

const METRICS: { key: LineupMetric; label: string; card: string }[] = [
  { key: "net", label: "Net rating", card: "net rating" },
  { key: "plusminus", label: "Plus / minus", card: "plus / minus" },
  { key: "minutes", label: "Most minutes", card: "minutes together" },
];
const MIN_OPTIONS = [4, 6, 8, 12];

const signed = (v: number | null, digits = 1) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`);
const stripSeason = (name: string) => name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();

function readHeads(): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(HEADS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** The team's own colour for the card when it suits a dark card; otherwise the competition's. */
function usableTeamHex(rgb?: { r: number; g: number; b: number } | null): string | null {
  if (!rgb) return null;
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  if (brightness < 45 || brightness > 205) return null;
  return `#${[rgb.r, rgb.g, rgb.b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
}

type Props = {
  /** Competition (season) slug the team is being viewed in. */
  slug: string;
  teamName: string;
  /** Colour for numbers and highlights on the page, already readable on white. */
  accentColor: string;
  teamRgb?: { r: number; g: number; b: number } | null;
};

/**
 * A team's best five-man units in plain form, with a simple downloadable card for the one you pick.
 * Lives on the team pages; the Swish Social "Best lineup" template is the photo-panel version.
 */
export function TeamLineupsPanel({ slug, teamName, accentColor, teamRgb }: Props) {
  const [metric, setMetric] = useState<LineupMetric>("net");
  const [minMinutes, setMinMinutes] = useState(8);
  const [selected, setSelected] = useState(0);
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const heads = useMemo(readHeads, []);

  const { leagueLogoUrl, primaryHex } = useCompetitionCardBrand(slug);
  const cardHex = usableTeamHex(teamRgb) ?? primaryHex;

  const { data, isLoading, isError } = useQuery<LineupsResponse | null>({
    queryKey: ["team-lineups", slug, teamName, metric, minMinutes],
    enabled: !!slug && !!teamName,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const params = new URLSearchParams({ team_name: teamName, metric, limit: "3", minMinutes: String(minMinutes) });
      const res = await fetch(`/api/league/${encodeURIComponent(slug)}/lineups?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return (await res.json()) as LineupsResponse;
    },
  });

  useEffect(() => setSelected(0), [slug, teamName, metric, minMinutes]);

  const units = data?.units ?? [];
  const unit: LineupUnit | null = units[selected] ?? units[0] ?? null;
  const leagueName = stripSeason(data?.league.name || "");
  const displayTeam = data?.team?.name || teamName;

  useEffect(() => {
    let cancelled = false;
    void ensureDisplayFont();
    setTeamLogoUrl(null);
    if (!data?.league.league_id) return;
    void getTeamLogoCached({ leagueId: data.league.league_id, teamName: displayTeam })
      .then((url) => !cancelled && setTeamLogoUrl(url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data?.league.league_id, displayTeam]);

  const rankedBy = `Ranked by ${METRICS.find((m) => m.key === metric)?.card} · min. ${minMinutes} minutes together`;
  const note =
    data && data.coverage.games > 0
      ? `Based on ${data.coverage.used} of ${data.coverage.games} games with matching lineup data`
      : undefined;

  const previewRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLCanvasElement | null>(null);
  const renderToken = useRef(0);
  const fileName = `best-lineup-${slug}-${displayTeam.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${selected + 1}.png`;

  useEffect(() => {
    const token = ++renderToken.current;
    setError(null);
    if (!unit) {
      cardRef.current = null;
      previewRef.current?.replaceChildren();
      setHasCard(false);
      setShareFile(null);
      return;
    }
    setRendering(true);
    setShareFile(null);
    void renderLineupSimpleCard({
      unit,
      teamName: displayTeam,
      brand: { leagueName, leagueLogoUrl, primaryHex: cardHex },
      teamLogoUrl,
      rankedBy,
      note,
      heads,
    })
      .then((canvas) => {
        if (token !== renderToken.current) return;
        canvas.style.cssText = "display:block;width:100%;height:auto;";
        cardRef.current = canvas;
        previewRef.current?.replaceChildren(canvas);
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
  }, [unit, displayTeam, leagueName, leagueLogoUrl, cardHex, teamLogoUrl, rankedBy, note, heads, fileName]);

  const download = async () => {
    const canvas = cardRef.current;
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

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-neutral-700">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            aria-pressed={metric === m.key}
            className={`px-3 py-1.5 text-xs font-medium transition-colors md:text-sm ${
              metric === m.key ? "text-white" : "text-slate-600 hover:bg-gray-50 dark:text-slate-400 dark:hover:bg-neutral-800"
            }`}
            style={metric === m.key ? { backgroundColor: accentColor } : undefined}
          >
            {m.label}
          </button>
        ))}
      </div>
      <Select value={String(minMinutes)} onValueChange={(v) => setMinMinutes(Number(v))}>
        <SelectTrigger className="h-8 w-auto gap-2 border-gray-200 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white md:text-sm" aria-label="Minimum minutes together">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="dark:border-neutral-700 dark:bg-neutral-800">
          {MIN_OPTIONS.map((n) => (
            <SelectItem key={n} value={String(n)}>
              Min. {n} minutes together
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  let body: JSX.Element;
  if (isLoading) {
    body = (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: accentColor }} />
      </div>
    );
  } else if (isError || !data) {
    body = (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        {isError ? "Couldn't load lineups right now." : "Lineup data isn't available for this competition."}
      </p>
    );
  } else if (units.length === 0) {
    body = (
      <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        {data.coverage.games === 0
          ? "No lineup data has been recorded for this team yet."
          : `No five-man unit has played ${minMinutes}+ minutes together yet. Try a lower minimum.`}
      </p>
    );
  } else {
    body = (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {units.map((u, i) => {
            const on = i === selected;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(i)}
                aria-pressed={on}
                data-testid={`lineup-unit-${i + 1}`}
                className={`block w-full rounded-xl border p-3 text-left transition md:p-4 ${
                  on ? "bg-gray-50 dark:bg-neutral-800" : "border-gray-200 hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800/60"
                }`}
                style={on ? { borderColor: accentColor, boxShadow: `0 0 0 1px ${accentColor}` } : undefined}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: accentColor }}>
                    #{u.rank}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {u.pf}–{u.pa} in {u.minutes?.toFixed(1)} min · {u.games} game{u.games === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {u.players.map((p) => (
                    <div key={p.key} className="min-w-0 text-center">
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt=""
                          loading="lazy"
                          className="mx-auto h-11 w-11 rounded-full bg-gray-200 object-cover object-top md:h-14 md:w-14 dark:bg-neutral-700"
                        />
                      ) : (
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-slate-600 md:h-14 md:w-14 dark:bg-neutral-700 dark:text-slate-300">
                          {p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                      )}
                      <div className="mt-1 truncate text-[11px] font-medium text-slate-800 md:text-xs dark:text-slate-100">
                        {p.name.split(/\s+/).slice(-1)[0]}
                      </div>
                      <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">{p.name.split(/\s+/)[0]}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 border-t border-gray-100 pt-3 dark:border-neutral-700">
                  {[
                    { label: "Net", value: signed(u.net), strong: true },
                    { label: "Off", value: u.ortg != null ? u.ortg.toFixed(1) : "—" },
                    { label: "Def", value: u.drtg != null ? u.drtg.toFixed(1) : "—" },
                    { label: "+/-", value: signed(u.plusMinus, 0) },
                  ].map((s) => (
                    <div key={s.label} className="text-center">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</div>
                      <div className={`tabular-nums ${s.strong ? "text-lg font-bold" : "text-base font-semibold"}`} style={s.strong ? { color: accentColor } : undefined}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="relative mx-auto max-w-[300px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-neutral-700 dark:bg-neutral-800">
            <div ref={previewRef} className="w-full" style={{ aspectRatio: "1080 / 1350" }} />
            {rendering && !hasCard && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            )}
          </div>
          {canShareFiles ? (
            <>
              <Button onClick={saveToPhotos} disabled={!shareFile || rendering} className="w-full text-white" style={{ backgroundColor: accentColor }} data-testid="button-lineup-save-to-photos">
                <ImagePlus className="mr-2 h-4 w-4" />
                Save to Photos
              </Button>
              <Button onClick={download} disabled={!hasCard || rendering || downloading} variant="outline" className="w-full">
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download file
              </Button>
            </>
          ) : (
            <Button onClick={download} disabled={!hasCard || rendering || downloading} className="w-full text-white" style={{ backgroundColor: accentColor }} data-testid="button-lineup-download">
              {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download card
            </Button>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow dark:bg-neutral-900 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-white md:text-lg">Best lineups - {displayTeam}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 md:text-sm">
            The five-man units that have played best together. Tap one to build its card.
          </p>
        </div>
        {controls}
      </div>
      {body}
      {data && units.length > 0 && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          {data.coverage.games > 0 && `Built from ${data.coverage.used} of ${data.coverage.games} games where the lineup tracking matches the box score. `}
          Net rating is points scored minus allowed per 100 possessions. Units with only a few minutes together can swing a lot, so check the minutes.
        </p>
      )}
    </div>
  );
}
