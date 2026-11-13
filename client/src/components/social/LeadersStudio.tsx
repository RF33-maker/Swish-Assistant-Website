import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerPhotoControl } from "@/components/social/PlayerPhotoControl";
import {
  BTN_GHOST,
  ColourField,
  ColourHexInput,
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
import CardStylePicker, { useCardStyle } from "@/components/social/CardStylePicker";
import { cleanTeamLabel, usesLeagueColour } from "@/lib/cardStyle";
import { photoChangeLendsTo, usePlayerPhotoChange } from "@/lib/playerPhotos";
import { supabase } from "@/lib/supabase";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { canvasToBlob, DEFAULT_FRAMING, ensureDisplayFont, type PhotoFraming } from "@/lib/generateWeeklyCards";
import { renderLeadersCard } from "@/lib/generateLeadersCards";
import { renderTeamLeadersDesign, teamCardColour, TEAM_LEADERS_DESIGNS, type TeamLeadersDesign } from "@/lib/generateTeamLeadersDesigns";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import type { LeadersResponse } from "@/types/leaders";

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
const SLUG_KEY = "weekly-awards-slug";

function stripSeason(name: string): string {
  return name.replace(/\s*\(?\d{4}\s*[-/–]\s*\d{2,4}\)?\s*$/, "").trim();
}

// Team leaders: the two poster designs, or the shared Swish Social look ("classic") with its styles.
type TeamDesign = TeamLeadersDesign | "classic";
const DESIGN_KEY = "team-leaders-design";
const TEAM_DESIGNS: { id: TeamDesign; label: string; hint: string }[] = [
  ...TEAM_LEADERS_DESIGNS,
  { id: "classic", label: "Classic", hint: "The shared Swish Social look, in the style and colour chosen below" },
];

function readStoredDesign(): TeamDesign {
  try {
    const stored = localStorage.getItem(DESIGN_KEY);
    return TEAM_DESIGNS.find((d) => d.id === stored)?.id ?? "print";
  } catch {
    return "print";
  }
}

// Cards: a colour picked by hand for a club's card, remembered per club so it carries across categories and weeks.
const CARD_COLOURS_KEY = "team-leaders-card-colours";
const clubKey = (name: string) => cleanTeamLabel(name).toLowerCase();

function readCardColours(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(CARD_COLOURS_KEY) || "{}");
    return stored && typeof stored === "object" ? (stored as Record<string, string>) : {};
  } catch {
    return {};
  }
}

const ATTEMPT_LABEL: Record<string, string> = { "FG%": "FGA", "3P%": "3PA", "FT%": "FTA" };

/** Card small print: the qualifying minimums, e.g. "Min. 3 games · Min. 15 3PA". */
function footnoteFor(data: LeadersResponse): string | undefined {
  const parts: string[] = [];
  if (data.minGames > 1) parts.push(`Min. ${data.minGames} games`);
  if (data.minAttempts && ATTEMPT_LABEL[data.category.short]) parts.push(`Min. ${data.minAttempts} ${ATTEMPT_LABEL[data.category.short]}`);
  return parts.length ? parts.join("  ·  ") : undefined;
}

function fmtShift(v: number): string {
  const n = Math.round(v);
  return n > 0 ? `+${n}%` : `${n}%`;
}

/** Player / Team league leaders: the top five in a category, led by the #1 player's photo or the #1 club's logo. */
export default function LeadersStudio({ kind }: { kind: "player" | "team" }) {
  const initialSlug = new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG;

  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [slug, setSlug] = useState(initialSlug);
  const [category, setCategory] = useState("pts");
  const [style, setStyle] = useCardStyle();
  const [teamDesign, setTeamDesign] = useState<TeamDesign>(readStoredDesign);
  // The poster designs are for the team card only; the player card is always the shared look.
  const design: TeamDesign = kind === "team" ? teamDesign : "classic";
  const [cardColours, setCardColours] = useState<Record<string, string>>(readCardColours);
  const [logoColours, setLogoColours] = useState<string[]>([]);
  const setCardColour = (name: string, hex: string | null) => {
    setCardColours((prev) => {
      const next = { ...prev };
      if (hex) next[clubKey(name)] = hex;
      else delete next[clubKey(name)];
      try {
        localStorage.setItem(CARD_COLOURS_KEY, JSON.stringify(next));
      } catch {
        // remembering the colour is a convenience only
      }
      return next;
    });
  };
  const chooseDesign = (next: TeamDesign) => {
    setTeamDesign(next);
    try {
      localStorage.setItem(DESIGN_KEY, next);
    } catch {
      // remembering the design is a convenience only
    }
  };
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
    if (!data) return;
    // Team leaders show each club's crest; player leaders show the crest of each player's club.
    void Promise.all(
      data.leaders.map((l) => {
        const teamName = l.team_name || (data.kind === "team" ? l.name : null);
        return teamName ? getTeamLogoCached({ leagueId: l.league_id, teamName }).catch(() => null) : null;
      }),
    ).then((urls) => !cancelled && setTeamLogoUrls(urls));
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Cards: what each club's card would be without a pick, so its picker starts on the colour the card is showing.
  useEffect(() => {
    let cancelled = false;
    setLogoColours([]);
    if (design !== "cards" || !data) return;
    void Promise.all(data.leaders.map((_, i) => teamCardColour(teamLogoUrls[i]))).then((colours) => !cancelled && setLogoColours(colours));
    return () => {
      cancelled = true;
    };
  }, [design, data, teamLogoUrls]);

  // The picked colours for the clubs on this card, in card order; a joined string so the card only redraws when one changes.
  const pickedColours = (data?.leaders ?? []).map((l) => cardColours[clubKey(l.name)] ?? "").join(",");

  const brand = useMemo(
    () => ({ leagueName: subtitle || data?.league.name || "", leagueLogoUrl, primaryHex }),
    [subtitle, data, leagueLogoUrl, primaryHex],
  );

  // A photo added here or in another studio: redraw with it, keeping the category and the subtitle.
  usePlayerPhotoChange((change) => {
    if (kind !== "player") return;
    const gained = (data?.leaders || []).filter((l) =>
      photoChangeLendsTo(change, { playerId: l.id, name: l.name, hasPhoto: !!l.photoUrl }),
    );
    if (gained.length === 0) return;
    const ids = new Set(gained.map((l) => l.id));
    setData((prev) => prev && { ...prev, leaders: prev.leaders.map((l) => (ids.has(l.id) ? { ...l, photoUrl: change.url } : l)) });
    // Framing set for the old photo wouldn't suit the new one.
    setFraming((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))));
  });

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
  const look = design === "classic" ? (style === "league" ? "" : `-${style}`) : `-${design}`;
  const fileName = `${kind}-leaders-${category}-${slug}${look}.png`;

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
    const card = {
      kind,
      style,
      categoryTitle: data.category.title,
      unit: data.category.short,
      leaders: data.leaders,
      brand,
      teamLogoUrls,
      framing: leaderFraming,
      footnote: footnoteFor(data),
    };
    const teamColours = pickedColours.split(",").map((c) => c || null);
    void (design === "classic" ? renderLeadersCard(card) : renderTeamLeadersDesign(design, card, { teamColours }))
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
  }, [kind, style, design, data, brand, teamLogoUrls, leaderFraming, fileName, pickedColours]);

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
    rememberCompetition(SLUG_KEY, v);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title={title}
        description={
          kind === "player"
            ? "The top five players in a category, led by the leader's photo."
            : "The top five teams in a category, built round the clubs' logos."
        }
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={FIELD} data-testid="select-leader-category">
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

        <Field
          label={`Minimum games${data ? ` (auto: ${data.minGames})` : ""}`}
          hint="Leave empty for half of the most games anyone has played. Percentage categories also need enough attempts that a few makes can't lead."
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

        {kind === "team" && (
          <Field label="Design" hint={`${TEAM_DESIGNS.find((d) => d.id === design)?.hint}.`}>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Design">
              {TEAM_DESIGNS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={design === d.id}
                  data-active={design === d.id}
                  onClick={() => chooseDesign(d.id)}
                  className="ch-chip px-3 py-2 text-sm"
                  data-testid={`design-${d.id}`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {design === "cards" && data && data.leaders.length > 0 && (
          <Field
            label="Card colours"
            hint="Each card takes its colour from the club's logo. Pick another with the colour picker or type a hex code; it is remembered for that club in this browser."
          >
            <div className="space-y-2">
              {data.leaders.slice(0, 5).map((l, i) => {
                const picked = cardColours[clubKey(l.name)];
                const label = cleanTeamLabel(l.name);
                return (
                  <div key={l.id} className="flex items-center gap-2" data-testid={`card-colour-row-${i + 1}`}>
                    <span className="w-4 flex-none text-right text-xs font-semibold tabular-nums text-[color:var(--ch-text-2)]">{l.rank}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--ch-text)]" title={label}>
                      {label}
                    </span>
                    <ColourHexInput
                      value={picked ?? logoColours[i] ?? "#2b3040"}
                      onChange={(hex) => setCardColour(l.name, hex)}
                      label={`${label} card colour`}
                      testId={`card-colour-${i + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setCardColour(l.name, null)}
                      disabled={!picked}
                      title="Back to the colour from the club's logo"
                      aria-label={`Reset ${label} card colour`}
                      className={`${BTN_GHOST} flex-none !px-2 disabled:opacity-30`}
                      data-testid={`card-colour-${i + 1}-reset`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </Field>
        )}

        {/* The poster designs bring their own colours, so the style and colour only apply to the shared look. */}
        {design === "classic" && <CardStylePicker value={style} onChange={setStyle} primaryHex={primaryHex} />}

        {design === "classic" && usesLeagueColour(style) && (
          <ColourField value={primaryHex} custom={!!colorOverride} onChange={updateColour} onReset={resetColour} />
        )}

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
                ? `No ${kind === "player" ? "players" : "teams"} qualify yet. Try a lower minimum, or another category.`
                : undefined
            }
          >
            <div ref={canvasHostRef} className="w-full" />
          </Stage>
        )}

        {kind === "player" && leader && (
          <div className="mx-auto mt-3 max-w-[640px] space-y-3">
            <PlayerPhotoControl key={leader.id} playerId={leader.id} playerName={leader.name} photoUrl={leader.photoUrl} />

            {leader.photoUrl && (
              <div className="ch-tile space-y-3 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[color:var(--ch-text)]">Photo framing</p>
                    <p className={HINT}>Adjusts the card only. The photo's edges fade into the card wherever it sits.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFraming((prev) => ({ ...prev, [leader.id]: undefined }))}
                    disabled={!framing[leader.id]}
                    className={`${BTN_GHOST} flex-none`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <RangeField
                    label="Zoom"
                    display={`${Math.round(leaderFraming.zoom * 100)}%`}
                    min={0.6}
                    max={3}
                    step={0.05}
                    value={leaderFraming.zoom}
                    onChange={(v) => adjust({ zoom: v })}
                  />
                  <RangeField
                    label="Left ↔ Right"
                    display={fmtShift(leaderFraming.x)}
                    min={-50}
                    max={50}
                    step={1}
                    value={leaderFraming.x}
                    onChange={(v) => adjust({ x: v })}
                  />
                  <RangeField
                    label="Up ↔ Down"
                    display={fmtShift(leaderFraming.y)}
                    min={-50}
                    max={50}
                    step={1}
                    value={leaderFraming.y}
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
