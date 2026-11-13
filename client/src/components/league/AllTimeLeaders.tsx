import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { gamePath } from "@shared/seo";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { getPlayerPhotoUrlCached } from "@/utils/playerPhotoCache";

/**
 * All-time leaders for a league brand: every public season at once, so a whole
 * career counts. Data comes from /api/leagues/:brandId/all-time (server/allTimeLeaders.ts).
 */

type Career = {
  key: string;
  name: string;
  href: string | null;
  photo: string | null;
  teams: string[];
  first: string | null;
  last: string | null;
  seasons: number;
  gp: number;
  min: number;
  pts: number; reb: number; ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
};

type GameRecord = {
  key: string;
  name: string;
  href: string | null;
  value: number;
  team: string | null;
  opponent: string | null;
  date: string | null;
  competition: string;
  competitionSlug: string;
  gameKey: string;
};

type AllTimeData = {
  competitions: number;
  games: number;
  firstSeason: string | null;
  lastSeason: string | null;
  careers: Career[];
  records: Record<string, GameRecord[]>;
};

type View = "averages" | "totals" | "records";
type Scope = "all" | "league";

const MIN_GAME_OPTIONS = [10, 25, 50, 100];
/** About two and a half seasons by default; smaller brands drop down until a board fills. */
const DEFAULT_MIN_ORDER = [50, 25, 10];
const SHORT_LIST = 10;
const LONG_LIST = 25;

type CareerBoard = {
  title: string;
  value: (c: Career) => number | null;
  format: (n: number) => string;
  note?: string;
};

const pct = (made: number, att: number, minAtt: number) => (att >= minAtt ? (made / att) * 100 : null);
const oneDp = (n: number) => n.toFixed(1);
const whole = (n: number) => Math.round(n).toLocaleString("en-GB");

const AVERAGE_BOARDS: CareerBoard[] = [
  { title: "Points per game", value: (c) => c.pts / c.gp, format: oneDp },
  { title: "Rebounds per game", value: (c) => c.reb / c.gp, format: oneDp },
  { title: "Assists per game", value: (c) => c.ast / c.gp, format: oneDp },
  { title: "Steals per game", value: (c) => c.stl / c.gp, format: oneDp },
  { title: "Blocks per game", value: (c) => c.blk / c.gp, format: oneDp },
  { title: "3-pointers per game", value: (c) => c.tpm / c.gp, format: oneDp },
  { title: "Field goal %", value: (c) => pct(c.fgm, c.fga, 250), format: (n) => `${oneDp(n)}%`, note: "Min 250 attempts" },
  { title: "3-point %", value: (c) => pct(c.tpm, c.tpa, 100), format: (n) => `${oneDp(n)}%`, note: "Min 100 attempts" },
  { title: "Free throw %", value: (c) => pct(c.ftm, c.fta, 100), format: (n) => `${oneDp(n)}%`, note: "Min 100 attempts" },
];

const TOTAL_BOARDS: CareerBoard[] = [
  { title: "Points", value: (c) => c.pts, format: whole },
  { title: "Rebounds", value: (c) => c.reb, format: whole },
  { title: "Assists", value: (c) => c.ast, format: whole },
  { title: "Steals", value: (c) => c.stl, format: whole },
  { title: "Blocks", value: (c) => c.blk, format: whole },
  { title: "3-pointers made", value: (c) => c.tpm, format: whole },
  { title: "Games played", value: (c) => c.gp, format: whole },
  { title: "Seasons played", value: (c) => c.seasons, format: whole },
];

const RECORD_BOARDS = [
  { key: "pts", title: "Points in a game" },
  { key: "reb", title: "Rebounds in a game" },
  { key: "ast", title: "Assists in a game" },
  { key: "stl", title: "Steals in a game" },
  { key: "blk", title: "Blocks in a game" },
  { key: "tpm", title: "3-pointers in a game" },
];

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// "2016/17" to "2020/21" reads as "2016–21"; a single season keeps its own label.
const careerSpan = (c: Career) => {
  if (!c.first) return "";
  const start = c.first.match(/^(\d{4})/)?.[1];
  const end = c.last?.match(/(\d{2})$/)?.[1];
  if (c.first === c.last || !start || !end) return c.first;
  return `${start}–${end}`;
};

const photoSrc = (path: string | null) => (!path ? null : /^https?:/i.test(path) ? path : getPlayerPhotoUrlCached(path));

function Avatar({ name, photo }: { name: string; photo: string | null }) {
  const src = photoSrc(photo);
  if (src) {
    return (
      <PlayerHeadshot
        src={src}
        alt=""
        loading="lazy"
        className="w-8 h-8 rounded-full object-cover shrink-0 bg-[color:var(--ch-surface-2)]"
        fallbackClassName="object-top"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold bg-[color:var(--ch-surface-2)] text-[color:var(--ch-text-2)]">
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}

function PlayerName({ name, href }: { name: string; href: string | null }) {
  return href ? (
    <Link href={href} className="block text-sm font-medium truncate text-[color:var(--ch-text)] hover:underline">{name}</Link>
  ) : (
    <span className="block text-sm font-medium truncate text-[color:var(--ch-text)]">{name}</span>
  );
}

function BoardHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline gap-2 pb-2 border-b border-[color:var(--ch-border-strong)]">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ch-text-2)]">{title}</h3>
      {note && <span className="text-[10px] font-medium text-[color:var(--ch-muted)] whitespace-nowrap">{note}</span>}
    </div>
  );
}

// Equal values share a rank ("1, 2, 2, 4"), so a tie never reads as a placing.
function ranks(values: number[]): number[] {
  return values.map((v, i) => (i > 0 && v === values[i - 1] ? -1 : i + 1)).map((r, i, all) => {
    if (r !== -1) return r;
    let j = i;
    while (all[j] === -1) j -= 1;
    return all[j];
  });
}

export default function AllTimeLeaders({ brandId, gender }: { brandId: string; gender: string }) {
  const [view, setView] = useState<View>("averages");
  // Regular season by default: the way career records are usually counted.
  const [scope, setScope] = useState<Scope>("league");
  const [minGames, setMinGames] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<AllTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ scope });
    if (gender) params.set("gender", gender);
    fetch(`/api/leagues/${brandId}/all-time?${params}`)
      .then((r) => (r.ok ? r.json() : r.status === 404 ? null : Promise.reject(new Error(String(r.status)))))
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) { setData(null); setFailed(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId, gender, scope]);

  // Default minimum: the highest option that still leaves a full top ten.
  const effectiveMin = useMemo(() => {
    if (minGames != null) return minGames;
    const careers = data?.careers || [];
    const fits = DEFAULT_MIN_ORDER.find((m) => careers.filter((c) => c.gp >= m).length >= 30);
    return fits ?? MIN_GAME_OPTIONS[0];
  }, [data, minGames]);

  const listLength = expanded ? LONG_LIST : SHORT_LIST;

  const careerBoards = useMemo(() => {
    if (!data || view === "records") return [];
    const boards = view === "averages" ? AVERAGE_BOARDS : TOTAL_BOARDS;
    const pool = view === "averages" ? data.careers.filter((c) => c.gp >= effectiveMin) : data.careers;
    return boards.map((board) => {
      const rows = pool
        .map((c) => ({ c, v: board.value(c) }))
        .filter((r): r is { c: Career; v: number } => r.v != null && Number.isFinite(r.v) && r.v > 0)
        .sort((a, b) => b.v - a.v || b.c.gp - a.c.gp)
        .slice(0, listLength);
      return { ...board, rows, ranks: ranks(rows.map((r) => Number(board.format(r.v).replace(/[^0-9.]/g, "")))) };
    });
  }, [data, view, effectiveMin, listLength]);

  if (!loading && !data && !failed) return null;

  const span = data?.firstSeason && data?.lastSeason && data.firstSeason !== data.lastSeason
    ? `${data.firstSeason} to ${data.lastSeason}`
    : data?.firstSeason || "";

  return (
    <section className="mt-10 md:mt-12" aria-labelledby="all-time-heading">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ch-accent)]">All-time</div>
      <div className="mt-1 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 id="all-time-heading" className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[1.9rem] md:text-[2.25rem] text-[color:var(--ch-text)]">
            {gender ? `${gender}'s ` : ""}All-time leaders
          </h2>
          {data && (
            <p className="mt-1.5 text-sm text-[color:var(--ch-text-2)]">
              {span && <>{span} · </>}{data.competitions} competitions · {data.games.toLocaleString("en-GB")} games
            </p>
          )}
        </div>
        <div className="ch-seg self-start md:self-auto" role="tablist" aria-label="Games counted">
          {([["league", "Regular season"], ["all", "All games"]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={scope === key} data-active={scope === key} onClick={() => setScope(key)} className="px-3 h-8 text-xs font-semibold">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="ch-seg ch-seg-fill" role="tablist" aria-label="All-time view">
          {([["averages", "Career averages"], ["totals", "Career totals"], ["records", "Single-game records"]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={view === key} data-active={view === key} onClick={() => setView(key)} className="px-3.5 h-9 text-sm font-semibold">
              {label}
            </button>
          ))}
        </div>
        {view === "averages" && (
          <label className="flex items-center gap-2.5">
            <span className="ch-eyebrow">Min games</span>
            <select
              value={effectiveMin}
              onChange={(e) => setMinGames(Number(e.target.value))}
              aria-label="Minimum games played"
              className="ch-input h-9 px-3 text-sm font-semibold w-24"
            >
              {MIN_GAME_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
      </div>

      {loading && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="ch-skel h-72 rounded-[10px]" />)}
        </div>
      )}

      {!loading && failed && (
        <p className="mt-6 text-sm text-[color:var(--ch-text-2)]">All-time leaders could not be loaded just now.</p>
      )}

      {!loading && data && view !== "records" && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
          {careerBoards.map((board) => (
            <div key={board.title}>
              <BoardHeading title={board.title} note={board.note} />
              {board.rows.map(({ c, v }, i) => (
                <div key={c.key} className="flex items-center gap-2.5 py-2 border-b border-[color:var(--ch-border)]">
                  <span className="text-xs font-bold w-5 text-center text-[color:var(--ch-muted)] shrink-0 tabular-nums">{board.ranks[i]}</span>
                  <Avatar name={c.name} photo={c.photo} />
                  <div className="min-w-0 flex-1">
                    <PlayerName name={c.name} href={c.href} />
                    <p className="text-[11px] text-[color:var(--ch-text-2)] truncate">
                      {[c.teams[0], careerSpan(c), `${c.gp} GP`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-[color:var(--ch-text)] whitespace-nowrap">{board.format(v)}</span>
                </div>
              ))}
              {board.rows.length === 0 && <p className="py-4 text-xs text-[color:var(--ch-muted)]">Nobody qualifies yet.</p>}
            </div>
          ))}
        </div>
      )}

      {!loading && data && view === "records" && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
          {RECORD_BOARDS.map((board) => {
            const rows = (data.records[board.key] || []).slice(0, listLength);
            const rowRanks = ranks(rows.map((r) => r.value));
            return (
              <div key={board.key}>
                <BoardHeading title={board.title} />
                {rows.map((r, i) => (
                  <div key={`${r.gameKey}-${r.key}`} className="flex items-center gap-2.5 py-2 border-b border-[color:var(--ch-border)]">
                    <span className="text-xs font-bold w-5 text-center text-[color:var(--ch-muted)] shrink-0 tabular-nums">{rowRanks[i]}</span>
                    <div className="min-w-0 flex-1">
                      <PlayerName name={r.name} href={r.href} />
                      <Link
                        href={gamePath(r.competitionSlug, r.gameKey)}
                        className="block text-[11px] text-[color:var(--ch-text-2)] truncate hover:underline"
                      >
                        {r.team || ""}{r.opponent ? ` v ${r.opponent}` : ""}{r.date ? ` · ${formatDate(r.date)}` : ""}
                      </Link>
                    </div>
                    <span className="text-lg font-bold tabular-nums text-[color:var(--ch-text)] whitespace-nowrap">{r.value}</span>
                  </div>
                ))}
                {rows.length === 0 && <p className="py-4 text-xs text-[color:var(--ch-muted)]">No games yet.</p>}
              </div>
            );
          })}
        </div>
      )}

      {!loading && data && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-[color:var(--ch-muted)] max-w-xl">
            {scope === "league" ? "Regular season only: cups, trophies and play-offs are left out. " : "Every public game, cups and play-offs included. "}
            Careers join a player's seasons under one name; old seasons can carry gaps where the live feed did.
          </p>
          <button onClick={() => setExpanded((e) => !e)} className="ch-btn ch-btn-ghost h-9 px-3.5 text-xs">
            {expanded ? `Show top ${SHORT_LIST}` : `Show top ${LONG_LIST}`}
          </button>
        </div>
      )}
    </section>
  );
}
