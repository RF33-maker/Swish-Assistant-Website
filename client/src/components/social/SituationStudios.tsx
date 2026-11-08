import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Toggle,
} from "@/components/social/studioUi";
import { supabase } from "@/lib/supabase";
import { useCompetitionCardBrand } from "@/hooks/useCompetitionCardBrand";
import { useStoredState } from "@/hooks/useStoredState";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { canvasToBlob } from "@/lib/generateWeeklyCards";
import { photoChangeReaches, playerPhotoUrl, usePlayerPhotoChange } from "@/lib/playerPhotos";
import { shareImageFile, supportsFileSharing } from "@/lib/shareImage";
import { DEFAULT_ACCENT, ensureCardFonts, type PhotoFields } from "@/lib/cardCanvasKit";
import {
  defaultPreGameKicker,
  renderFinalScoreCard,
  renderMilestoneCard,
  renderPreGameCard,
  teamCode,
  teamNickname,
  type FinalScoreData,
  type MilestoneData,
  type PreGameData,
} from "@/lib/generateSituationCards";

// ── shared ───────────────────────────────────────────────────────────────────

const DEFAULT_SLUG = "nbl-division-1-2026-2027";
/** The same key the other studios use, so the competition follows the admin around. */
const SLUG_KEY = "weekly-awards-slug";

type Competition = { league_id: string; slug: string; name: string };

type PlayerRow = {
  id: string;
  full_name: string;
  team_name: string | null;
  photo_path: string | null;
  photo_path_bg_removed: string | null;
  photo_focus_y: number | null;
  shirtNumber?: number | null;
};

const PLAYER_COLUMNS = "id, full_name, team_name, photo_path, photo_path_bg_removed, photo_focus_y, shirtNumber";

/** "K. Daley" style rows from the feed, which share a photo with the full-name row. */
const isInitialForm = (name: string) => /^[A-Z]\.\s/.test(name);

/** Keeps one row per photo, the full name over the initial form. */
function dedupePlayers(rows: PlayerRow[]): PlayerRow[] {
  const sorted = [...rows].sort((a, b) => Number(isInitialForm(a.full_name)) - Number(isInitialForm(b.full_name)) || a.full_name.localeCompare(b.full_name));
  const seen = new Set<string>();
  return sorted.filter((p) => {
    const key = p.photo_path_bg_removed || p.photo_path || p.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const hasPhoto = (p: PlayerRow | null | undefined) => Boolean(p && (p.photo_path_bg_removed || p.photo_path));

/** The photo fields for a player: the cut-out and the full photo, or whatever is in their folder. */
async function photoFieldsFor(p: PlayerRow | null): Promise<PhotoFields> {
  if (!p) return {};
  const out: PhotoFields = { photo_focus_y: p.photo_focus_y ?? 50 };
  if (p.photo_path_bg_removed) out.cutout_photo_url = playerPhotoUrl(p.photo_path_bg_removed);
  if (p.photo_path) out.photo_url = playerPhotoUrl(p.photo_path);
  if (!out.photo_url && !out.cutout_photo_url) {
    const { data } = await supabase.storage.from("player-photos").list(p.id);
    if (data && data.length > 0) out.photo_url = playerPhotoUrl(`${p.id}/${data[0].name}`);
  }
  return out;
}

function useCompetitions(): Competition[] {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  useEffect(() => {
    let cancelled = false;
    void ensureCardFonts();
    void supabase
      .from("competitions")
      .select("league_id, slug, name")
      .eq("is_public", true)
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(150)
      .then(({ data }) => {
        if (!cancelled && data) setCompetitions((data as Competition[]).filter((c) => c.slug && c.name && c.league_id));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return competitions;
}

function useCompetitionSlug(): [string, (slug: string) => void] {
  const [slug, setSlug] = useState(() => new URLSearchParams(window.location.search).get("slug") || readStoredCompetition(SLUG_KEY) || DEFAULT_SLUG);
  const choose = (v: string) => {
    setSlug(v);
    rememberCompetition(SLUG_KEY, v);
  };
  return [slug, choose];
}

function useTeamLogo(leagueId: string | undefined, teamName: string | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    setUrl(undefined);
    if (!leagueId || !teamName) return;
    getTeamLogoCached({ leagueId, teamName })
      .then((u) => !cancelled && setUrl(u || undefined))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [leagueId, teamName]);
  return url;
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function formatDayTime(iso: string | null | undefined): string {
  const day = formatDay(iso);
  if (!day || !iso) return day;
  const time = new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day} ${time}`;
}

const short = (name: string | null | undefined) => (name || "").replace(/\s+Senior\s+(Men|Women)\b/gi, "").replace(/\s+I\s*$/, "").trim();

/** The card's colour: a swatch, with Swish orange and the competition's own colour one tap away. */
function AccentField({ value, onChange, competitionHex }: { value: string; onChange: (hex: string) => void; competitionHex: string }) {
  const isSwish = value.toLowerCase() === DEFAULT_ACCENT;
  const isComp = value.toLowerCase() === competitionHex.toLowerCase();
  const chip = (on: boolean) => `ch-chip inline-flex h-8 items-center gap-1.5 px-3 text-[12px] ${on ? "!border-[color:var(--ch-accent)]" : ""}`;
  return (
    <Field label="Accent colour" hint="Swish orange unless the competition's colour suits the club better.">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_ACCENT}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-12 flex-none cursor-pointer rounded-lg border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] p-0.5"
          aria-label="Accent colour"
          data-testid="input-accent"
        />
        <button type="button" className={chip(isSwish)} onClick={() => onChange(DEFAULT_ACCENT)} data-testid="accent-swish">
          <span className="h-3 w-3 rounded-full" style={{ background: DEFAULT_ACCENT }} />
          Swish orange
        </button>
        <button type="button" className={chip(isComp)} onClick={() => onChange(competitionHex)} data-testid="accent-competition">
          <span className="h-3 w-3 rounded-full" style={{ background: competitionHex }} />
          Competition colour
        </button>
      </div>
    </Field>
  );
}

type Framing = { zoom: number; x: number; y: number };
const NO_SHIFT: Framing = { zoom: 1, x: 0, y: 0 };

function framingFields(f: Framing, focusY = 50): PhotoFields {
  return { photo_zoom: f.zoom, photo_position_x: 50 + f.x, photo_position_y: Math.max(0, Math.min(100, focusY + f.y)) };
}

const fmtShift = (v: number) => (v > 0 ? `+${Math.round(v)}%` : `${Math.round(v)}%`);

/** Zoom and nudge sliders for one photo. */
function FramingControl({ label, value, onChange }: { label: string; value: Framing; onChange: (f: Framing) => void }) {
  const changed = value.zoom !== 1 || value.x !== 0 || value.y !== 0;
  return (
    <div className="ch-tile space-y-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[color:var(--ch-text)]">{label}</p>
          <p className={HINT}>Adjusts the card only.</p>
        </div>
        <button type="button" onClick={() => onChange(NO_SHIFT)} disabled={!changed} className={`${BTN_GHOST} flex-none`}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <RangeField label="Zoom" display={`${Math.round(value.zoom * 100)}%`} min={0.6} max={2.5} step={0.05} value={value.zoom} onChange={(zoom) => onChange({ ...value, zoom })} />
        <RangeField label="Left ↔ Right" display={fmtShift(value.x)} min={-50} max={50} step={1} value={value.x} onChange={(x) => onChange({ ...value, x })} />
        <RangeField label="Up ↔ Down" display={fmtShift(value.y)} min={-50} max={50} step={1} value={value.y} onChange={(y) => onChange({ ...value, y })} />
      </div>
    </div>
  );
}

/** Draws a card whenever its data changes, and gets it out as a PNG. */
function useCardRender<T>(data: T | null, render: (data: T) => Promise<HTMLCanvasElement>, fileName: string) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const token = useRef(0);
  const [rendering, setRendering] = useState(false);
  const [hasCard, setHasCard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const t = ++token.current;
    if (!data) {
      canvasRef.current = null;
      hostRef.current?.replaceChildren();
      setHasCard(false);
      setShareFile(null);
      return;
    }
    setRendering(true);
    setError(null);
    setShareFile(null);
    render(data)
      .then((canvas) => {
        if (t !== token.current) return;
        canvas.style.cssText = "display:block;width:100%;height:auto;";
        canvasRef.current = canvas;
        hostRef.current?.replaceChildren(canvas);
        setHasCard(true);
        void canvasToBlob(canvas).then((blob) => {
          if (t !== token.current || !blob) return;
          const file = new File([blob], fileName, { type: "image/png" });
          setShareFile(file);
          setCanShare(supportsFileSharing(file));
        });
      })
      .catch((err) => t === token.current && setError(err?.message || "Could not draw the card"))
      .finally(() => t === token.current && setRendering(false));
  }, [data, render, fileName]);

  const download = async () => {
    const canvas = canvasRef.current;
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

  return { hostRef, rendering, hasCard, error, shareFile, canShare, downloading, download, saveToPhotos };
}

function CardStage({
  render,
  loading,
  empty,
  children,
}: {
  render: ReturnType<typeof useCardRender<any>>;
  loading: boolean;
  empty: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Panel className="order-1 lg:order-2" bodyClassName="!p-3 sm:!p-5">
      {loading && !render.hasCard ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
        </div>
      ) : (
        <Stage busy={render.rendering && !render.hasCard} empty={!render.hasCard && !render.rendering ? empty : undefined}>
          <div ref={render.hostRef} className="w-full" />
        </Stage>
      )}
      {children}
      <div className="mx-auto mt-3 max-w-[640px] space-y-2">
        <SaveActions
          canShare={render.canShare}
          onSave={render.saveToPhotos}
          saveDisabled={!render.shareFile || render.rendering}
          onDownload={render.download}
          downloadDisabled={!render.hasCard || render.rendering || render.downloading}
          downloading={render.downloading}
        />
        <p className={`text-center ${HINT}`}>Card size: 1080×1350px (Instagram portrait)</p>
      </div>
    </Panel>
  );
}

// ── final score ──────────────────────────────────────────────────────────────

type TeamLine = { name: string; score: number; code: string | null; shortname: string | null };
type FinishedGame = { game_key: string; home: TeamLine; away: TeamLine; date: string | null; live: boolean };

type GameStatRow = {
  player_id: string | null;
  full_name: string | null;
  team_name: string | null;
  spoints: number | null;
  sreboundstotal: number | null;
  sassists: number | null;
  ssteals: number | null;
  sblocks: number | null;
  shirtnumber: string | null;
};

/** "24 PTS · 8 AST · 4 REB": points, then the two of REB / AST / STL / BLK that mattered most. */
function statLine(s: GameStatRow): string {
  const extras = [
    { label: "REB", v: s.sreboundstotal ?? 0, w: 1.2 },
    { label: "AST", v: s.sassists ?? 0, w: 1.3 },
    { label: "STL", v: s.ssteals ?? 0, w: 1.7 },
    { label: "BLK", v: s.sblocks ?? 0, w: 2 },
  ]
    .sort((a, b) => b.v * b.w - a.v * a.w)
    .slice(0, 2)
    .filter((e) => e.v > 0);
  return [`${s.spoints ?? 0} PTS`, ...extras.map((e) => `${e.v} ${e.label}`)].join(" · ");
}

/** Final score: the winner's nickname giant across the top, the best performer breaking out of a white frame, the score in a black band. */
export function FinalScoreStudio() {
  const competitions = useCompetitions();
  const [slug, chooseSlug] = useCompetitionSlug();
  const competition = competitions.find((c) => c.slug === slug);
  const leagueId = competition?.league_id;
  const { primaryHex } = useCompetitionCardBrand(slug);

  const [games, setGames] = useState<FinishedGame[]>([]);
  const [gameKey, setGameKey] = useState("");
  const [loadingGames, setLoadingGames] = useState(false);
  const [stats, setStats] = useState<GameStatRow[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerRow>>({});
  const [playerId, setPlayerId] = useState("");
  const [photo, setPhoto] = useState<PhotoFields>({});
  const [framing, setFraming] = useState<Framing>(NO_SHIFT);
  const [usePhoto, setUsePhoto] = useState(false);
  const [headlineWord, setHeadlineWord] = useState("");
  const [ticker, setTicker] = useState("");
  const [accent, setAccent] = useStoredState<string>("situation:final:accent", DEFAULT_ACCENT);
  const [error, setError] = useState<string | null>(null);

  // Finished games: two team_stats rows per game, newest first, live ones left out.
  useEffect(() => {
    let cancelled = false;
    setGames([]);
    setGameKey("");
    if (!leagueId) return;
    setLoadingGames(true);
    setError(null);
    void (async () => {
      try {
        const { data: rows, error: err } = await supabase
          .from("team_stats")
          .select("game_key, name, shortname, code, score, side, created_at")
          .eq("league_id", leagueId)
          .not("score", "is", null)
          .order("created_at", { ascending: false })
          .limit(600);
        if (err) throw err;
        const byKey = new Map<string, any[]>();
        (rows || []).forEach((r: any) => {
          if (!r.game_key) return;
          byKey.set(r.game_key, [...(byKey.get(r.game_key) || []), r]);
        });
        const keys = Array.from(byKey.keys());
        const { data: sched } = keys.length
          ? await supabase.from("game_schedule").select("game_key, matchtime, status, hometeam").eq("league_id", leagueId).in("game_key", keys)
          : { data: [] as any[] };
        const schedule = new Map<string, any>((sched || []).map((s: any) => [s.game_key, s]));
        const list: FinishedGame[] = [];
        byKey.forEach((pair, key) => {
          if (pair.length !== 2) return;
          const s = schedule.get(key);
          const ordered = [...pair].sort((a, b) => String(a.side || "").localeCompare(String(b.side || "")));
          // The schedule knows which club was at home when the feed's sides are missing.
          if (s?.hometeam && ordered[1].name === s.hometeam) ordered.reverse();
          const line = (r: any): TeamLine => ({ name: r.name || "", score: Number(r.score) || 0, code: r.code || null, shortname: r.shortname || null });
          list.push({ game_key: key, home: line(ordered[0]), away: line(ordered[1]), date: s?.matchtime || pair[0].created_at || null, live: s?.status === "live" });
        });
        list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        if (cancelled) return;
        const finished = list.filter((g) => !g.live);
        setGames(finished);
        setGameKey(finished[0]?.game_key || "");
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "Couldn't load the games");
      } finally {
        if (!cancelled) setLoadingGames(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const game = games.find((g) => g.game_key === gameKey) || null;
  const homeWon = game ? game.home.score > game.away.score : true;
  const winner = game ? (homeWon ? game.home : game.away) : null;

  // The game's box score and the photos on file for its players.
  useEffect(() => {
    let cancelled = false;
    setStats([]);
    setPlayers({});
    setPlayerId("");
    setHeadlineWord("");
    setTicker("");
    setFraming(NO_SHIFT);
    if (!leagueId || !game) return;
    void (async () => {
      const { data: rows } = await supabase
        .from("player_stats")
        .select("player_id, full_name, team_name, spoints, sreboundstotal, sassists, ssteals, sblocks, shirtnumber")
        .eq("league_id", leagueId)
        .eq("game_key", game.game_key)
        .order("spoints", { ascending: false })
        .limit(40);
      const list = ((rows || []) as GameStatRow[]).filter((r) => r.player_id && r.full_name);
      const ids = Array.from(new Set(list.map((r) => r.player_id!)));
      const { data: prow } = ids.length ? await supabase.from("players").select(PLAYER_COLUMNS).in("id", ids) : { data: [] as any[] };
      if (cancelled) return;
      const map: Record<string, PlayerRow> = {};
      ((prow || []) as PlayerRow[]).forEach((p) => (map[p.id] = p));
      setStats(list);
      setPlayers(map);
      const winnerName = winner?.name;
      const onWinner = list.filter((r) => r.team_name === winnerName);
      const pick = onWinner.find((r) => hasPhoto(map[r.player_id!])) || onWinner[0] || list.find((r) => hasPhoto(map[r.player_id!])) || list[0];
      setPlayerId(pick?.player_id || "");
    })();
    return () => {
      cancelled = true;
    };
    // `winner` is derived from `game`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, game]);

  const stat = stats.find((r) => r.player_id === playerId) || null;
  const player = playerId ? players[playerId] || null : null;

  useEffect(() => {
    let cancelled = false;
    setPhoto({});
    setFraming(NO_SHIFT);
    void photoFieldsFor(player).then((f) => !cancelled && setPhoto(f));
    return () => {
      cancelled = true;
    };
  }, [player]);

  usePlayerPhotoChange((change) => {
    if (player && photoChangeReaches(change, player.id)) setPhoto((prev) => ({ ...prev, photo_url: change.url }));
  });

  const homeLogo = useTeamLogo(leagueId, game?.home.name);
  const awayLogo = useTeamLogo(leagueId, game?.away.name);

  const defaultWord = winner ? teamNickname(winner.name, winner.shortname) : "";
  const data = useMemo<FinalScoreData | null>(() => {
    if (!game) return null;
    return {
      headline_word: headlineWord.trim() || defaultWord,
      home_name: game.home.name,
      away_name: game.away.name,
      home_score: game.home.score,
      away_score: game.away.score,
      home_logo_url: homeLogo,
      away_logo_url: awayLogo,
      competition: competition?.name,
      game_date: game.date || undefined,
      player_name: stat?.full_name || undefined,
      player_line: stat ? statLine(stat) : undefined,
      ticker: ticker.trim() || undefined,
      accent_hex: accent,
      ...photo,
      ...framingFields(framing, photo.photo_focus_y ?? 50),
      photo_mode: usePhoto ? "photo" : "auto",
    };
  }, [game, headlineWord, defaultWord, homeLogo, awayLogo, competition, stat, ticker, accent, photo, framing, usePhoto]);

  const render = useCardRender(data, renderFinalScoreCard, `final-score-${gameKey || "card"}.png`);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Final score"
        description="The winner's name giant across the top, the best performer breaking out of a white frame, the score in a black band."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Game">
          <Select value={gameKey} onValueChange={setGameKey} disabled={games.length === 0}>
            <SelectTrigger className={FIELD} data-testid="select-final-game">
              <SelectValue placeholder={loadingGames ? "Loading games…" : games.length ? "Choose a game" : "No finished games yet"} />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {games.map((g) => (
                <SelectItem key={g.game_key} value={g.game_key}>
                  {formatDay(g.date)} · {short(g.home.name)} {g.home.score}–{g.away.score} {short(g.away.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Player in the picture" hint="The winners' top scorer with a photo on file is picked first.">
          <Select value={playerId} onValueChange={setPlayerId} disabled={stats.length === 0}>
            <SelectTrigger className={FIELD} data-testid="select-final-player">
              <SelectValue placeholder="Choose a player" />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {[game?.home.name, game?.away.name].filter(Boolean).map((team) => (
                <SelectGroup key={team}>
                  <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ch-accent)]">{short(team)}</SelectLabel>
                  {stats
                    .filter((r) => r.team_name === team)
                    .map((r) => (
                      <SelectItem key={r.player_id!} value={r.player_id!}>
                        {r.full_name} · {statLine(r)}
                        {hasPhoto(players[r.player_id!]) ? "" : " · no photo"}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Headline word" hint="The giant word above WIN; the club's nickname unless you type one.">
          <input value={headlineWord} onChange={(e) => setHeadlineWord(e.target.value)} placeholder={defaultWord} className={FIELD} data-testid="input-final-word" />
        </Field>

        <Field label="Ticker" hint="The strip along the bottom, repeated.">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={defaultWord ? `${defaultWord} WIN · ${(competition?.name || "").toUpperCase()}` : ""}
            className={FIELD}
            data-testid="input-final-ticker"
          />
        </Field>

        <AccentField value={accent} onChange={setAccent} competitionHex={primaryHex} />

        {photo.cutout_photo_url && (
          <Toggle checked={usePhoto} onChange={setUsePhoto} label="Use the game photo instead of the cut-out" hint="The cut-out breaks out of the frame; the photo fills it." testId="toggle-final-photo" />
        )}

        {error && <p className={ERROR}>{error}</p>}
        {render.error && <p className={ERROR}>{render.error}</p>}
      </Panel>

      <CardStage render={render} loading={loadingGames} empty="Pick a competition with finished games.">
        {player && (
          <div className="mx-auto mt-3 max-w-[640px] space-y-3">
            <PlayerPhotoControl key={player.id} playerId={player.id} playerName={player.full_name} photoUrl={photo.photo_url || photo.cutout_photo_url} />
            {(photo.cutout_photo_url || photo.photo_url) && <FramingControl label="Photo framing" value={framing} onChange={setFraming} />}
          </div>
        )}
      </CardStage>
    </div>
  );
}

// ── pre-game ─────────────────────────────────────────────────────────────────

type Fixture = { game_key: string; matchtime: string | null; hometeam: string; awayteam: string; status: string | null };

/** Pre-game: both clubs' three-letter codes stacked huge, VS between them, a black date strip, a player from each side threaded through the type. */
export function PreGameStudio() {
  const competitions = useCompetitions();
  const [slug, chooseSlug] = useCompetitionSlug();
  const competition = competitions.find((c) => c.slug === slug);
  const leagueId = competition?.league_id;
  const { primaryHex } = useCompetitionCardBrand(slug);

  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [gameKey, setGameKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [homeCode, setHomeCode] = useState("");
  const [awayCode, setAwayCode] = useState("");
  const [roster, setRoster] = useState<PlayerRow[]>([]);
  const [homePlayerId, setHomePlayerId] = useState("");
  const [awayPlayerId, setAwayPlayerId] = useState("");
  const [homePhoto, setHomePhoto] = useState<PhotoFields>({});
  const [awayPhoto, setAwayPhoto] = useState<PhotoFields>({});
  const [homeFraming, setHomeFraming] = useState<Framing>(NO_SHIFT);
  const [awayFraming, setAwayFraming] = useState<Framing>(NO_SHIFT);
  const [backdrop, setBackdrop] = useState(false);
  const [kicker, setKicker] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [accent, setAccent] = useStoredState<string>("situation:pregame:accent", DEFAULT_ACCENT);
  const [error, setError] = useState<string | null>(null);

  // Fixtures from today on, soonest first.
  useEffect(() => {
    let cancelled = false;
    setFixtures([]);
    setGameKey("");
    if (!leagueId) return;
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    void supabase
      .from("game_schedule")
      .select("game_key, matchtime, hometeam, awayteam, status")
      .eq("league_id", leagueId)
      .gte("matchtime", since)
      .order("matchtime", { ascending: true })
      .limit(80)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err) {
          setError(err.message);
          return;
        }
        const list = ((data || []) as Fixture[]).filter((f) => f.game_key && f.hometeam && f.awayteam && f.status !== "final");
        setFixtures(list);
        setGameKey(list[0]?.game_key || "");
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const fixture = fixtures.find((f) => f.game_key === gameKey) || null;

  // The feed's codes for the two clubs, and everyone on either roster with a photo on file.
  useEffect(() => {
    let cancelled = false;
    setRoster([]);
    setHomePlayerId("");
    setAwayPlayerId("");
    setHomeCode("");
    setAwayCode("");
    setKicker("");
    setDateLabel("");
    setHomeFraming(NO_SHIFT);
    setAwayFraming(NO_SHIFT);
    if (!leagueId || !fixture) return;
    void (async () => {
      const teams = [fixture.hometeam, fixture.awayteam];
      const [{ data: codeRows }, { data: playerRows }] = await Promise.all([
        supabase.from("team_stats").select("name, code").eq("league_id", leagueId).in("name", teams).not("code", "is", null).limit(20),
        supabase.from("players").select(PLAYER_COLUMNS).eq("league_id", leagueId).in("team_name", teams).or("photo_path_bg_removed.not.is.null,photo_path.not.is.null").limit(200),
      ]);
      if (cancelled) return;
      const map: Record<string, string> = {};
      (codeRows || []).forEach((r: any) => r.name && r.code && (map[r.name] = r.code));
      setCodes(map);
      const people = dedupePlayers((playerRows || []) as PlayerRow[]);
      setRoster(people);
      const first = (team: string) => people.find((p) => p.team_name === team && p.photo_path_bg_removed) || null;
      setHomePlayerId(first(fixture.hometeam)?.id || "");
      setAwayPlayerId(first(fixture.awayteam)?.id || "");
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, fixture]);

  const homePlayer = roster.find((p) => p.id === homePlayerId) || null;
  const awayPlayer = roster.find((p) => p.id === awayPlayerId) || null;

  useEffect(() => {
    let cancelled = false;
    setHomePhoto({});
    setHomeFraming(NO_SHIFT);
    void photoFieldsFor(homePlayer).then((f) => !cancelled && setHomePhoto(f));
    return () => {
      cancelled = true;
    };
  }, [homePlayer]);

  useEffect(() => {
    let cancelled = false;
    setAwayPhoto({});
    setAwayFraming(NO_SHIFT);
    void photoFieldsFor(awayPlayer).then((f) => !cancelled && setAwayPhoto(f));
    return () => {
      cancelled = true;
    };
  }, [awayPlayer]);

  const homeLogo = useTeamLogo(leagueId, fixture?.hometeam);
  const awayLogo = useTeamLogo(leagueId, fixture?.awayteam);

  const defaultHomeCode = fixture ? codes[fixture.hometeam] || teamCode(fixture.hometeam) : "";
  const defaultAwayCode = fixture ? codes[fixture.awayteam] || teamCode(fixture.awayteam) : "";
  const defaultKicker = defaultPreGameKicker(fixture?.matchtime || undefined);

  const data = useMemo<PreGameData | null>(() => {
    if (!fixture) return null;
    const backgroundPhoto = homePhoto.photo_url || awayPhoto.photo_url;
    return {
      home_code: homeCode.trim() || defaultHomeCode,
      away_code: awayCode.trim() || defaultAwayCode,
      home_name: fixture.hometeam,
      away_name: fixture.awayteam,
      home_logo_url: homeLogo,
      away_logo_url: awayLogo,
      kicker: kicker.trim() || defaultKicker,
      competition: competition?.name,
      tip_off: fixture.matchtime || undefined,
      date_label: dateLabel.trim() || undefined,
      home_player: homePlayer ? { name: homePlayer.full_name, ...homePhoto, ...framingFields(homeFraming, homePhoto.photo_focus_y ?? 50) } : undefined,
      away_player: awayPlayer ? { name: awayPlayer.full_name, ...awayPhoto, ...framingFields(awayFraming, awayPhoto.photo_focus_y ?? 50) } : undefined,
      background_photo_url: backdrop ? backgroundPhoto : undefined,
      accent_hex: accent,
    };
  }, [fixture, homeCode, awayCode, defaultHomeCode, defaultAwayCode, homeLogo, awayLogo, kicker, defaultKicker, competition, dateLabel, homePlayer, awayPlayer, homePhoto, awayPhoto, homeFraming, awayFraming, backdrop, accent]);

  const render = useCardRender(data, renderPreGameCard, `pre-game-${gameKey || "card"}.png`);

  const playerSelect = (team: string | undefined, value: string, onChange: (id: string) => void, testId: string) => (
    <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={!team}>
      <SelectTrigger className={FIELD} data-testid={testId}>
        <SelectValue placeholder="No player" />
      </SelectTrigger>
      <SelectContent className={SELECT_MENU}>
        <SelectItem value="none">No player</SelectItem>
        {roster
          .filter((p) => p.team_name === team)
          .map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name}
              {p.photo_path_bg_removed ? "" : " · photo only"}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Pre-game"
        description="Both clubs' codes stacked huge, VS between them, the tip-off in a black strip, a player from each side threaded through the type."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Fixture">
          <Select value={gameKey} onValueChange={setGameKey} disabled={fixtures.length === 0}>
            <SelectTrigger className={FIELD} data-testid="select-pregame-fixture">
              <SelectValue placeholder={loading ? "Loading fixtures…" : fixtures.length ? "Choose a fixture" : "No upcoming fixtures"} />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {fixtures.map((f) => (
                <SelectItem key={f.game_key} value={f.game_key}>
                  {formatDayTime(f.matchtime)} · {short(f.hometeam)} v {short(f.awayteam)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Home code">
            <input value={homeCode} onChange={(e) => setHomeCode(e.target.value.toUpperCase())} placeholder={defaultHomeCode} maxLength={4} className={FIELD} data-testid="input-home-code" />
          </Field>
          <Field label="Away code">
            <input value={awayCode} onChange={(e) => setAwayCode(e.target.value.toUpperCase())} placeholder={defaultAwayCode} maxLength={4} className={FIELD} data-testid="input-away-code" />
          </Field>
        </div>

        <Field label={`${short(fixture?.hometeam) || "Home"} player`} hint="Stands high on the right, in front of the first code.">
          {playerSelect(fixture?.hometeam, homePlayerId, setHomePlayerId, "select-home-player")}
        </Field>
        <Field label={`${short(fixture?.awayteam) || "Away"} player`} hint="Lower and in front, over the second code.">
          {playerSelect(fixture?.awayteam, awayPlayerId, setAwayPlayerId, "select-away-player")}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kicker">
            <input value={kicker} onChange={(e) => setKicker(e.target.value)} placeholder={defaultKicker} className={FIELD} data-testid="input-pregame-kicker" />
          </Field>
          <Field label="Date strip">
            <input value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} placeholder="From the fixture" className={FIELD} data-testid="input-pregame-date" />
          </Field>
        </div>

        <AccentField value={accent} onChange={setAccent} competitionHex={primaryHex} />

        {(homePhoto.photo_url || awayPhoto.photo_url) && (
          <Toggle checked={backdrop} onChange={setBackdrop} label="Game photo behind the type" hint="A player's game photo, in two tones, behind everything." testId="toggle-pregame-backdrop" />
        )}

        {error && <p className={ERROR}>{error}</p>}
        {render.error && <p className={ERROR}>{render.error}</p>}
      </Panel>

      <CardStage render={render} loading={loading} empty="Pick a competition with upcoming fixtures.">
        <div className="mx-auto mt-3 max-w-[640px] space-y-3">
          {homePlayer && (homePhoto.cutout_photo_url || homePhoto.photo_url) && (
            <FramingControl label={`${homePlayer.full_name} framing`} value={homeFraming} onChange={setHomeFraming} />
          )}
          {awayPlayer && (awayPhoto.cutout_photo_url || awayPhoto.photo_url) && (
            <FramingControl label={`${awayPlayer.full_name} framing`} value={awayFraming} onChange={setAwayFraming} />
          )}
        </div>
      </CardStage>
    </div>
  );
}

// ── milestone ────────────────────────────────────────────────────────────────

const DEFAULT_LINES = "TYPE THE MILESTONE\nONE LINE AT A TIME";

/** Milestone: a giant serif ordinal or count, a few tracked lines, the player beside it with a glow, the name and number up the edge. */
export function MilestoneStudio() {
  const competitions = useCompetitions();
  const [slug, chooseSlug] = useCompetitionSlug();
  const competition = competitions.find((c) => c.slug === slug);
  const leagueId = competition?.league_id;
  const { primaryHex } = useCompetitionCardBrand(slug);

  const [roster, setRoster] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [playerId, setPlayerId] = useState("");
  const [photo, setPhoto] = useState<PhotoFields>({});
  const [framing, setFraming] = useState<Framing>(NO_SHIFT);
  const [usePhoto, setUsePhoto] = useState(false);
  const [kicker, setKicker] = useState("MILESTONE");
  const [headline, setHeadline] = useState("1ST");
  const [linesText, setLinesText] = useState(DEFAULT_LINES);
  const [contextLine, setContextLine] = useState("");
  const [accent, setAccent] = useStoredState<string>("situation:milestone:accent", DEFAULT_ACCENT);
  const [error, setError] = useState<string | null>(null);

  // Everyone in the competition with a photo on file, by club.
  useEffect(() => {
    let cancelled = false;
    setRoster([]);
    setPlayerId("");
    if (!leagueId) return;
    setLoading(true);
    setError(null);
    void supabase
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("league_id", leagueId)
      .or("photo_path_bg_removed.not.is.null,photo_path.not.is.null")
      .order("team_name")
      .order("full_name")
      .limit(600)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        setLoading(false);
        if (err) {
          setError(err.message);
          return;
        }
        const people = dedupePlayers((data || []) as PlayerRow[]).sort(
          (a, b) => (a.team_name || "").localeCompare(b.team_name || "") || a.full_name.localeCompare(b.full_name),
        );
        setRoster(people);
        setPlayerId((people.find((p) => p.photo_path_bg_removed) || people[0])?.id || "");
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const player = roster.find((p) => p.id === playerId) || null;

  useEffect(() => {
    let cancelled = false;
    setPhoto({});
    setFraming(NO_SHIFT);
    void photoFieldsFor(player).then((f) => !cancelled && setPhoto(f));
    return () => {
      cancelled = true;
    };
  }, [player]);

  usePlayerPhotoChange((change) => {
    if (player && photoChangeReaches(change, player.id)) setPhoto((prev) => ({ ...prev, photo_url: change.url }));
  });

  const crest = useTeamLogo(leagueId, player?.team_name || undefined);
  const teams = useMemo(() => Array.from(new Set(roster.map((p) => p.team_name || "").filter(Boolean))), [roster]);

  const data = useMemo<MilestoneData | null>(() => {
    if (!player) return null;
    return {
      kicker: kicker.trim() || "MILESTONE",
      headline: headline.trim() || "1ST",
      lines: linesText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4),
      player_name: player.full_name,
      shirt_number: player.shirtNumber != null ? String(player.shirtNumber) : undefined,
      team_name: player.team_name || undefined,
      team_logo_url: crest,
      competition: competition?.name,
      context_line: contextLine.trim() || undefined,
      accent_hex: accent,
      ...photo,
      ...framingFields(framing, photo.photo_focus_y ?? 50),
      photo_mode: usePhoto ? "photo" : "auto",
    };
  }, [player, kicker, headline, linesText, crest, competition, contextLine, accent, photo, framing, usePhoto]);

  const render = useCardRender(data, renderMilestoneCard, `milestone-${(player?.full_name || "card").toLowerCase().replace(/\s+/g, "-")}.png`);

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Panel
        title="Milestone"
        description="A giant ordinal or count, two to four tracked lines, the player beside it with a glow. Type any milestone or record."
        className="order-2 lg:order-1"
        bodyClassName="space-y-4"
      >
        <CompetitionField value={slug} onChange={chooseSlug} competitions={competitions} />

        <Field label="Player" hint="Players with a photo on file, by club. Add photos under Player photos.">
          <Select value={playerId} onValueChange={setPlayerId} disabled={roster.length === 0}>
            <SelectTrigger className={FIELD} data-testid="select-milestone-player">
              <SelectValue placeholder={loading ? "Loading players…" : roster.length ? "Choose a player" : "No photos on file yet"} />
            </SelectTrigger>
            <SelectContent className={SELECT_MENU}>
              {teams.map((team) => (
                <SelectGroup key={team}>
                  <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--ch-accent)]">{short(team)}</SelectLabel>
                  {roster
                    .filter((p) => p.team_name === team)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                        {p.photo_path_bg_removed ? "" : " · photo only"}
                      </SelectItem>
                    ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kicker">
            <input value={kicker} onChange={(e) => setKicker(e.target.value)} className={FIELD} data-testid="input-milestone-kicker" />
          </Field>
          <Field label="Big number" hint="9TH, 50, 1,000…">
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} className={FIELD} data-testid="input-milestone-headline" />
          </Field>
        </div>

        <Field label="Lines" hint="One per line, up to four. Set in tracked caps under the number.">
          <textarea value={linesText} onChange={(e) => setLinesText(e.target.value)} rows={4} className={`${FIELD} !h-auto py-2`} data-testid="input-milestone-lines" />
        </Field>

        <Field label="Small print" hint="Bottom-left: the game, the date, the opponent.">
          <input value={contextLine} onChange={(e) => setContextLine(e.target.value)} placeholder={short(player?.team_name) || "V LIVERPOOL · 26 OCT 2026"} className={FIELD} data-testid="input-milestone-context" />
        </Field>

        <AccentField value={accent} onChange={setAccent} competitionHex={primaryHex} />

        {photo.cutout_photo_url && photo.photo_url && (
          <Toggle checked={usePhoto} onChange={setUsePhoto} label="Use the game photo instead of the cut-out" hint="The photo fills the card behind the number." testId="toggle-milestone-photo" />
        )}

        {error && <p className={ERROR}>{error}</p>}
        {render.error && <p className={ERROR}>{render.error}</p>}
      </Panel>

      <CardStage render={render} loading={loading} empty="Pick a competition with player photos on file.">
        {player && (
          <div className="mx-auto mt-3 max-w-[640px] space-y-3">
            <PlayerPhotoControl key={player.id} playerId={player.id} playerName={player.full_name} photoUrl={photo.photo_url || photo.cutout_photo_url} />
            {(photo.cutout_photo_url || photo.photo_url) && <FramingControl label="Photo framing" value={framing} onChange={setFraming} />}
          </div>
        )}
      </CardStage>
    </div>
  );
}
