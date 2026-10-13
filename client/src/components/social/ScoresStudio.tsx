import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BTN_GHOST,
  ColourField,
  ERROR,
  FIELD,
  Field,
  HINT,
  Panel,
  SaveActions,
  SELECT_MENU,
  Stage,
} from "@/components/social/studioUi";
import CardStylePicker, { useCardStyle } from "@/components/social/CardStylePicker";
import { canvasToBlob, ensureDisplayFont } from "@/lib/generateWeeklyCards";
import { GAMES_PER_CARD, renderScoresCard, type ScoreGame } from "@/lib/generateScoresCards";
import { fetchNblScores, refreshNblScores } from "@/lib/nblScores";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import { chunk, divisionOf, formatDateRange, poolOf, weekendKey, type SavedNblScore } from "@shared/nblScores";

const COLOUR_KEY = "nbl-scores-colour";
const DEFAULT_COLOUR = "#f97316";
/** Scores older than this are read again when the studio opens. */
const STALE_AFTER_MS = 15 * 60 * 1000;
/** The first read, when nothing is saved yet, goes back far enough to fill the season so far. */
const FIRST_FILL_DAYS = 60;

function readColour(): string | null {
  try {
    const v = localStorage.getItem(COLOUR_KEY);
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
}

function sortGames(a: SavedNblScore, b: SavedNblScore): number {
  return (
    a.grade_name.localeCompare(b.grade_name) ||
    a.game_date.localeCompare(b.game_date) ||
    (a.tip_time ?? "").localeCompare(b.tip_time ?? "") ||
    a.home_team.localeCompare(b.home_team)
  );
}

/** Division Two results: one pool's final scores for a weekend as a card. Scores only; the source has no stats. */
export default function ScoresStudio() {
  const [scores, setScores] = useState<SavedNblScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<string>("");
  const [weekend, setWeekend] = useState<string>("");
  const [page, setPage] = useState(0);
  const [style, setStyle] = useCardStyle();
  const [colour, setColour] = useState<string | null>(readColour);
  const [downloading, setDownloading] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);

  const primaryHex = colour ?? DEFAULT_COLOUR;
  const updateColour = (hex: string) => {
    setColour(hex);
    try {
      localStorage.setItem(COLOUR_KEY, hex);
    } catch {
      // remembering the colour is a convenience only
    }
  };
  const resetColour = () => {
    setColour(null);
    try {
      localStorage.removeItem(COLOUR_KEY);
    } catch {
      // see above
    }
  };

  // Read what is saved, and read Basketball England again if it has been a while.
  const load = useCallback(async (force: boolean) => {
    setError(null);
    let current: Awaited<ReturnType<typeof fetchNblScores>> | null = null;
    try {
      current = await fetchNblScores();
      setScores(current.scores);
    } catch (err: any) {
      setError(err?.message || "Couldn't load the scores.");
      setLoading(false);
      return;
    }
    setLoading(false);
    const stale = !current.scrapedAt || Date.now() - new Date(current.scrapedAt).getTime() > STALE_AFTER_MS;
    if (!force && !stale) return;
    setRefreshing(true);
    try {
      await refreshNblScores(current.scores.length === 0 ? FIRST_FILL_DAYS : undefined);
      setScores((await fetchNblScores()).scores);
    } catch (err: any) {
      setError(current.scores.length > 0 ? `${err?.message || "Couldn't refresh."} Showing the scores saved earlier.` : err?.message || "Couldn't read the scores.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void ensureDisplayFont();
    void load(false);
  }, [load]);

  // What can be picked: a pool, listed under its division. Each card is one pool.
  const pools = useMemo(() => {
    const byDivision = new Map<string, Set<string>>();
    for (const s of scores) {
      const division = divisionOf(s.grade_name);
      byDivision.set(division, (byDivision.get(division) ?? new Set<string>()).add(s.grade_name));
    }
    return [...byDivision.keys()].sort().map((division) => ({ division, pools: [...byDivision.get(division)!].sort() }));
  }, [scores]);

  useEffect(() => {
    const all = pools.flatMap((d) => d.pools);
    if (all.length > 0 && !all.includes(selection)) setSelection(all[0]);
  }, [pools, selection]);

  const inSelection = useMemo(() => scores.filter((s) => s.grade_name === selection), [scores, selection]);

  const weekends = useMemo(() => {
    const groups = new Map<string, SavedNblScore[]>();
    for (const s of inSelection) {
      const key = weekendKey(s.game_date);
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, games]) => {
        const dates = games.map((g) => g.game_date).sort();
        const label = formatDateRange(dates[0], dates[dates.length - 1]);
        return { key, games: games.sort(sortGames), label: `${label} · ${games.length} game${games.length === 1 ? "" : "s"}`, banner: label };
      });
  }, [inSelection]);

  useEffect(() => {
    if (weekends.length > 0 && !weekends.some((w) => w.key === weekend)) setWeekend(weekends[0].key);
    setPage(0);
  }, [weekends, weekend]);

  const chosen = weekends.find((w) => w.key === weekend) ?? null;
  const cards = useMemo(() => chunk(chosen?.games ?? [], GAMES_PER_CARD), [chosen]);
  const safePage = Math.min(page, Math.max(0, cards.length - 1));
  const games = cards[safePage] ?? [];

  // The pool is the banner, as it is what people look for; the division and dates sit above the title.
  const poolName = poolOf(selection) || selection;
  const kicker = chosen ? `NBL ${divisionOf(selection)}  ·  ${chosen.banner}` : "";
  const fileName = `nbl-results-${selection.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${chosen?.key ?? "scores"}${cards.length > 1 ? `-${safePage + 1}` : ""}${style === "league" ? "" : `-${style}`}.png`;

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderToken = useRef(0);

  useEffect(() => {
    const token = ++renderToken.current;
    if (!chosen || games.length === 0) {
      cardCanvasRef.current = null;
      canvasHostRef.current?.replaceChildren();
      setHasCard(false);
      setShareFile(null);
      return;
    }
    setRendering(true);
    setShareFile(null);
    const cardGames: ScoreGame[] = games.map((g) => ({
      homeTeam: g.home_team,
      awayTeam: g.away_team,
      homeScore: g.home_score,
      awayScore: g.away_score,
      homeLogoUrl: g.home_logo_url,
      awayLogoUrl: g.away_logo_url,
    }));
    void renderScoresCard({
      style,
      primaryHex,
      kicker,
      banner: poolName,
      games: cardGames,
      footnote: ["Results: Basketball England", cards.length > 1 ? `${safePage + 1}/${cards.length}` : ""].filter(Boolean).join("  ·  "),
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
  }, [chosen, games, style, primaryHex, kicker, poolName, cards.length, safePage, fileName]);

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

  const lastRead = scores.reduce<string | null>((m, s) => (!m || s.scraped_at > m ? s.scraped_at : m), null);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Division Two results"
        description="One pool's final scores for the weekend, copied from Basketball England. Scores only: there are no stats for these games."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
        action={
          <button type="button" onClick={() => void load(true)} disabled={refreshing || loading} className={BTN_GHOST} data-testid="button-refresh-scores">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
        }
      >
        <Field label="Pool">
          <Select value={selection} onValueChange={setSelection} disabled={pools.length === 0}>
            <SelectTrigger className={FIELD} data-testid="select-scores-pool">
              <SelectValue placeholder="No scores yet" />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {pools.map((d) => (
                <SelectGroup key={d.division}>
                  <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ch-accent)]">{d.division}</SelectLabel>
                  {d.pools.map((pool) => (
                    <SelectItem key={pool} value={pool}>
                      {poolOf(pool) || pool}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Weekend">
          <Select value={weekend} onValueChange={setWeekend} disabled={weekends.length === 0}>
            <SelectTrigger className={FIELD} data-testid="select-scores-weekend">
              <SelectValue placeholder="No games yet" />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {weekends.map((w) => (
                <SelectItem key={w.key} value={w.key}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <CardStylePicker value={style} onChange={setStyle} primaryHex={primaryHex} />

        {style !== "swish" && <ColourField value={primaryHex} custom={!!colour} onChange={updateColour} onReset={resetColour} />}

        {error && <p className={ERROR}>{error}</p>}
        <p className={HINT}>
          {refreshing
            ? "Reading the latest scores from Basketball England…"
            : lastRead
              ? `Scores last read ${new Date(lastRead).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}. They refresh themselves on Saturday and Sunday evenings.`
              : "Nothing saved yet."}
        </p>
      </Panel>

      <Panel className="order-1 lg:order-2" bodyClassName="!p-3 sm:!p-5">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
          </div>
        ) : (
          <Stage
            busy={(rendering && !hasCard) || (refreshing && scores.length === 0)}
            empty={!hasCard && !rendering && !refreshing ? "No Division Two scores saved yet. Try Refresh." : undefined}
          >
            <div ref={canvasHostRef} className="w-full" />
          </Stage>
        )}

        {cards.length > 1 && (
          <div className="mx-auto mt-3 flex max-w-[640px] items-center justify-between gap-3">
            <button type="button" className={BTN_GHOST} onClick={() => setPage(safePage - 1)} disabled={safePage === 0} data-testid="button-scores-prev">
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className={HINT}>
              Card {safePage + 1} of {cards.length}
            </span>
            <button type="button" className={BTN_GHOST} onClick={() => setPage(safePage + 1)} disabled={safePage >= cards.length - 1} data-testid="button-scores-next">
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
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
          <p className={`text-center ${HINT}`}>
            {chosen ? `${chosen.games.length} game${chosen.games.length === 1 ? "" : "s"} · ` : ""}Card size: 1080×1350px (Instagram portrait)
          </p>
        </div>
      </Panel>
    </div>
  );
}
