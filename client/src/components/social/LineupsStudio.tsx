import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerPhotoButton } from "@/components/social/PlayerPhotoControl";
import {
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
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { canvasToBlob, DEFAULT_HEAD_LINE, ensureDisplayFont } from "@/lib/generateWeeklyCards";
import { renderLineupCard } from "@/lib/generateLineupCard";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { LineupMetric, LineupPlayer, LineupsResponse } from "@/types/lineups";

const DEFAULT_SLUG = "bcb-trophy-2027";
// Lineups need play-by-play data, which only some competitions have, so this
// studio remembers its own competition rather than sharing the other studios'.
const SLUG_KEY = "lineups-slug";
const HEADS_KEY = "weekly-awards-heads";
const ALIGN_KEY = "weekly-awards-align";

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
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG;

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

  // A photo added here or in another studio: redraw with it, keeping the team and the unit picked.
  usePlayerPhotoChange((change) => {
    const gains = (p: LineupPlayer) => photoChangeLendsTo(change, { playerId: p.id, name: p.name, hasPhoto: !!p.photoUrl });
    if (!data?.units.some((u) => u.players.some(gains))) return;
    setData(
      (prev) =>
        prev && {
          ...prev,
          units: prev.units.map((u) => ({ ...u, players: u.players.map((p) => (gains(p) ? { ...p, photoUrl: change.url } : p)) })),
        },
    );
  });

  const unit = data?.units[unitIndex] ?? null;
  const missingPhotos = unit ? unit.players.filter((p) => !p.photoUrl).length : 0;
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
    rememberCompetition(SLUG_KEY, v);
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
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Best lineup"
        description="A team's best five-man unit, from who was on court together."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Team" hint="The number is how many units qualify for that team.">
          <Select value={teamId} onValueChange={setTeamId} disabled={!data?.teams.length}>
            <SelectTrigger className={FIELD} data-testid="select-lineup-team">
              <SelectValue placeholder="Best team" />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {(data?.teams ?? []).map((t) => (
                <SelectItem key={t.team_id} value={t.team_id}>
                  {t.name} ({t.units})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Rank units by">
          <Select value={metric} onValueChange={(v) => setMetric(v as LineupMetric)}>
            <SelectTrigger className={FIELD} data-testid="select-lineup-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {METRICS.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min. minutes together">
              <input
                type="number"
                min={1}
                value={minMinutesText}
                onChange={(e) => setMinMinutesText(e.target.value)}
                className={FIELD}
                data-testid="input-min-minutes"
              />
            </Field>
            <Field label="Which unit">
              <Select value={String(unitIndex)} onValueChange={(v) => setUnitIndex(Number(v))} disabled={!data?.units.length}>
                <SelectTrigger className={FIELD} data-testid="select-lineup-rank">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={SELECT_MENU}>
                  {(data?.units ?? []).map((u, i) => (
                    <SelectItem key={i} value={String(i)}>
                      #{u.rank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <p className={HINT}>
            Small samples swing wildly early in a season, so keep the minimum up. Units with barely any recorded possessions are ignored.
          </p>
        </div>

        <Field label="Card subtitle">
          <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={FIELD} />
        </Field>

        <ColourField value={primaryHex} custom={!!colorOverride} onChange={updateColour} onReset={resetColour} />

        <div className="ch-tile space-y-2 p-3">
          <Toggle bare checked={align.on} onChange={(on) => updateAlign({ on })} label="Line up heads across the photos" />
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
              />
              <p className={HINT}>
                Uses the faces you have marked in Team of the Week. Others use a guess until they are marked there.
              </p>
            </>
          )}
        </div>

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
              !hasCard && !rendering && !error
                ? "No five-man unit has played enough together yet. Try a lower minimum."
                : undefined
            }
          >
            <div ref={canvasHostRef} className="w-full" />
          </Stage>
        )}

        {unit && (
          <div className="ch-tile mx-auto mt-3 max-w-[640px] p-3" data-testid="lineup-photos">
            <p className="text-[13px] font-semibold text-[color:var(--ch-text)]">Player photos</p>
            <p className={HINT}>
              {missingPhotos === 0
                ? "All five have a photo."
                : `${missingPhotos} of the five ${missingPhotos === 1 ? "has" : "have"} no photo yet. Add one and the card redraws by itself.`}
            </p>
            <ul className="mt-2 divide-y divide-[color:var(--ch-border)]">
              {unit.players.map((p) => (
                <li key={p.key} className="flex items-center gap-3 py-1.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center overflow-hidden rounded-md bg-[color:var(--ch-surface-3)]">
                    {p.photoUrl ? (
                      <img src={p.photoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <UserRound className="h-4 w-4 text-[color:var(--ch-muted)]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--ch-text)]">{p.name}</span>
                  <PlayerPhotoButton playerId={p.id} playerName={p.name} label={p.photoUrl ? "Replace" : "Add photo"} />
                </li>
              ))}
            </ul>
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
            {data ? `Built from ${data.stintsUsed} stints in ${data.reliability.reliable} of ${data.reliability.teamGames} team-games that match the box score · ` : ""}Card size: 1080×1350px (Instagram portrait)
          </p>
        </div>
      </Panel>
    </div>
  );
}
