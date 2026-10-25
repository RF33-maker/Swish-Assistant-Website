import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerPhotoControl } from "@/components/social/PlayerPhotoControl";
import {
  BTN_GHOST,
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
  type CompetitionOption,
} from "@/components/social/studioUi";
import { photoChangeLendsTo, usePlayerPhotoChange } from "@/lib/playerPhotos";
import { supabase } from "@/lib/supabase";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { canvasToBlob, DEFAULT_FRAMING, ensureDisplayFont, type PhotoFraming } from "@/lib/generateWeeklyCards";
import { renderRecordCard } from "@/lib/generateRecordCard";
import { cleanTeamLabel } from "@/lib/cardStyle";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { RecordsResponse } from "@/types/records";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
const SLUG_KEY = "weekly-awards-slug";

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

function fmtShift(v: number): string {
  const n = Math.round(v);
  return n > 0 ? `+${n}%` : `${n}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
}

/** Single-game records: who has the biggest one-game total in a category this season, led by their photo. */
export default function RecordsStudio() {
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG;

  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [category, setCategory] = useState("pts");
  const [data, setData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subtitle, setSubtitle] = useState("");
  // Which of the joint record holders the card shows.
  const [pick, setPick] = useState(0);
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(null);
  const [framing, setFraming] = useState<Record<string, PhotoFraming | undefined>>({});
  const [downloading, setDownloading] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  const { leagueLogoUrl, primaryHex } = useCompetitionCardBrand(slug);

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
    setPick(0);
    const params = new URLSearchParams({ category, limit: "5" });
    fetch(`/api/league/${encodeURIComponent(slug)}/records?${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Competition not found or not public" : `Request failed (${res.status})`);
        return (await res.json()) as RecordsResponse;
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
  }, [slug, category]);

  const holders = useMemo(() => (data?.records || []).filter((r) => r.rank === 1), [data]);
  const record = holders[Math.min(pick, holders.length - 1)] ?? null;

  useEffect(() => {
    let cancelled = false;
    setClubLogoUrl(null);
    if (!record?.team_name) return;
    void getTeamLogoCached({ leagueId: record.league_id, teamName: record.team_name })
      .catch(() => null)
      .then((url) => !cancelled && setClubLogoUrl(url ?? null));
    return () => {
      cancelled = true;
    };
  }, [record?.league_id, record?.team_name]);

  // A photo added here or in another studio: redraw with it.
  usePlayerPhotoChange((change) => {
    const gained = (data?.records || []).filter((r) => photoChangeLendsTo(change, { playerId: r.id, name: r.name, hasPhoto: !!r.photoUrl }));
    if (gained.length === 0) return;
    const ids = new Set(gained.map((r) => r.id));
    setData((prev) => prev && { ...prev, records: prev.records.map((r) => (ids.has(r.id) ? { ...r, photoUrl: change.url } : r)) });
    // Framing set for the old photo wouldn't suit the new one.
    setFraming((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))));
  });

  const recordFraming = record ? framing[record.id] ?? DEFAULT_FRAMING : DEFAULT_FRAMING;
  const adjust = (patch: Partial<PhotoFraming>) => {
    if (!record) return;
    setFraming((prev) => ({ ...prev, [record.id]: { ...recordFraming, ...patch } }));
  };

  const brand = useMemo(
    () => ({ leagueName: subtitle || data?.league.name || "", leagueLogoUrl, primaryHex }),
    [subtitle, data, leagueLogoUrl, primaryHex],
  );

  const canvasHostRef = useRef<HTMLDivElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderToken = useRef(0);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const fileName = `record-${category}-${slug}.png`;

  useEffect(() => {
    const token = ++renderToken.current;
    if (!data || !record) {
      cardCanvasRef.current = null;
      canvasHostRef.current?.replaceChildren();
      setHasCard(false);
      setShareFile(null);
      return;
    }
    setRendering(true);
    setShareFile(null);
    void renderRecordCard({
      record,
      categoryTitle: data.category.title,
      unit: data.category.short,
      brand,
      clubLogoUrl,
      framing: recordFraming,
      holders: { players: new Set(holders.map((h) => h.id)).size, games: holders.length },
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
  }, [data, record, holders, brand, clubLogoUrl, recordFraming, fileName]);

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
    rememberCompetition(SLUG_KEY, v);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Single-game records"
        description="The biggest one-game total this season in a category, led by the record holder's photo."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={FIELD} data-testid="select-record-category">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {(data?.categories ?? [{ key: "pts", label: "Points" }]).map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Card subtitle">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={FIELD} />
        </Field>

        {data && data.records.length > 0 && (
          <Field
            label="Top performances"
            hint={holders.length > 1 ? "More than one game is on the record total. Pick which one the card shows." : undefined}
          >
            <ol className="space-y-1" data-testid="list-records">
              {data.records.map((r) => {
                const holderIndex = holders.indexOf(r);
                const selectable = holders.length > 1 && holderIndex >= 0;
                const on = r === record;
                return (
                  <li key={`${r.id}-${r.game_key}`}>
                    <button
                      type="button"
                      disabled={!selectable}
                      onClick={() => setPick(holderIndex)}
                      data-active={on}
                      className={`ch-tile flex w-full items-center gap-3 px-3 py-2 text-left ${on ? "ring-1 ring-[color:var(--ch-accent)]" : ""} ${selectable ? "cursor-pointer" : "cursor-default"}`}
                    >
                      <span className="ch-num w-5 flex-none text-[12px] text-[color:var(--ch-muted)]">{r.rank}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-[color:var(--ch-text)]">{r.name}</span>
                        <span className={`block truncate ${HINT}`}>
                          {[cleanTeamLabel(r.team_name), r.opponent_name ? `vs ${cleanTeamLabel(r.opponent_name)}` : "", fmtDate(r.game_date)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="ch-num flex-none text-[15px] font-semibold text-[color:var(--ch-text)]">{r.value}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Field>
        )}

        {error && <p className={ERROR}>{error}</p>}
      </Panel>

      <Panel className="order-1 lg:order-2" bodyClassName="!p-3 sm:!p-5">
        {loading && !data ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
          </div>
        ) : (
          <Stage busy={rendering && !hasCard} empty={!hasCard && !rendering ? "No games recorded in this category yet." : undefined}>
            <div ref={canvasHostRef} className="w-full" />
          </Stage>
        )}

        {record && (
          <div className="mx-auto mt-3 max-w-[640px] space-y-3">
            <PlayerPhotoControl key={record.id} playerId={record.id} playerName={record.name} photoUrl={record.photoUrl} />

            {record.photoUrl && (
              <div className="ch-tile space-y-3 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[color:var(--ch-text)]">Photo framing</p>
                    <p className={HINT}>Adjusts the card only. The photo fades into the stat at the bottom.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFraming((prev) => ({ ...prev, [record.id]: undefined }))}
                    disabled={!framing[record.id]}
                    className={`${BTN_GHOST} flex-none`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <RangeField
                    label="Zoom"
                    display={`${Math.round(recordFraming.zoom * 100)}%`}
                    min={0.6}
                    max={3}
                    step={0.05}
                    value={recordFraming.zoom}
                    onChange={(v) => adjust({ zoom: v })}
                  />
                  <RangeField
                    label="Left ↔ Right"
                    display={fmtShift(recordFraming.x)}
                    min={-50}
                    max={50}
                    step={1}
                    value={recordFraming.x}
                    onChange={(v) => adjust({ x: v })}
                  />
                  <RangeField
                    label="Up ↔ Down"
                    display={fmtShift(recordFraming.y)}
                    min={-50}
                    max={50}
                    step={1}
                    value={recordFraming.y}
                    onChange={(v) => adjust({ y: v })}
                  />
                </div>
              </div>
            )}
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
            {data ? `Based on ${data.gamesCounted} game${data.gamesCounted === 1 ? "" : "s"} · ` : ""}Card size: 1080×1350px (Instagram portrait)
          </p>
        </div>
      </Panel>
    </div>
  );
}
