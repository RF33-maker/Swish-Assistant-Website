/**
 * All-time leaders for a league brand (e.g. Super League Basketball, Women's side):
 * every public season of the brand at once, so a player's whole career counts.
 *
 * GET /api/leagues/:brandId/all-time?gender=Women&scope=all|league
 *
 * Returns
 *  - `careers`: one row per player (totals over every game played) for anyone with
 *    at least MIN_CAREER_GAMES games, so the page can sort by any column and set its
 *    own minimum-games line without another request;
 *  - `records`: the best single games for each headline stat.
 *
 * A player is grouped across seasons by their identity group when they have one,
 * otherwise by name (the same way profiles join a career together). "League only"
 * leaves out cups, trophies, shields and play-offs.
 *
 * A build reads every box-score row the brand has ever had (about 6 seconds for
 * Super League Basketball), so finished boards are stored in all_time_snapshots:
 * built the first time anyone asks, rebuilt each night (GET /api/cron/all-time),
 * and rebuilt straight away when an admin links or unlinks players.
 */

import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "./supabaseServiceClient";
import { playerPath } from "../shared/seo";

/** How long one server instance keeps a board before reading the stored copy again. */
const MEMORY_MS = 10 * 60 * 1000;
/** A stored board older than this is still served, and rebuilt behind it. Nightly rebuild, with slack. */
const STALE_MS = 26 * 60 * 60 * 1000;
const SNAPSHOTS = "all_time_snapshots";
/** The nightly run stops starting new builds after this, inside the 60s function limit. */
const CRON_BUDGET_MS = 40 * 1000;
const MIN_CAREER_GAMES = 5;
const RECORDS_PER_STAT = 25;
const COMPS_AT_ONCE = 6;
const KNOCKOUT_NAME = /\b(cup|trophy|shield|play-?offs?|finals?)\b/i;

export const RECORD_STATS = [
  { key: "pts", column: "spoints" },
  { key: "reb", column: "sreboundstotal" },
  { key: "ast", column: "sassists" },
  { key: "stl", column: "ssteals" },
  { key: "blk", column: "sblocks" },
  { key: "tpm", column: "sthreepointersmade" },
] as const;

const STAT_COLUMNS =
  "id, player_id, full_name, firstname, familyname, team_name, game_key, league_id, created_at, sminutes, " +
  "spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sfoulspersonal, " +
  "sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted";

type Comp = { league_id: string; name: string; slug: string; season: string | null; gender: string | null };

type StatRow = Record<string, any>;

type Scope = "all" | "league";

/** Box-score rows per competition, shared by the two scopes of one rebuild so each is read once. */
type StatsCache = Map<string, Promise<StatRow[]>>;

export type AllTimeCareer = {
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

export type AllTimeRecord = {
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
  line: { pts: number; reb: number; ast: number; stl: number; blk: number; tpm: number };
};

export type AllTimeResponse = {
  competitions: number;
  games: number;
  firstSeason: string | null;
  lastSeason: string | null;
  careers: AllTimeCareer[];
  records: Record<(typeof RECORD_STATS)[number]["key"], AllTimeRecord[]>;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function minutesOf(row: StatRow): number {
  const m = row.sminutes;
  if (!m) return 0;
  if (typeof m === "number") return m;
  const parts = String(m).split(":");
  if (parts.length === 2) return (parseInt(parts[0], 10) || 0) + (parseInt(parts[1], 10) || 0) / 60;
  return parseFloat(String(m)) || 0;
}

// Same rule as client/src/lib/gamesPlayed.ts: a row is listed for everyone on the
// sheet, so minutes decide it, unless the clock came through as 0:00 with real stats.
function played(row: StatRow): boolean {
  if (minutesOf(row) > 0) return true;
  return ["spoints", "sreboundstotal", "sassists", "ssteals", "sblocks", "sturnovers", "sfieldgoalsattempted", "sfreethrowsattempted", "sfoulspersonal"]
    .some((c) => num(row[c]) > 0);
}

function cleanName(row: StatRow): string {
  const full = String(row.full_name || "").replace(/\s+/g, " ").trim();
  const name = full || [row.firstname, row.familyname].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const parts = name.split(" ");
  if (parts.length > 1 && /^[A-Za-z]$/.test(parts[0])) parts[0] = `${parts[0].toUpperCase()}.`;
  return parts.join(" ");
}

const nameKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

const isInitialForm = (key: string) => /^[a-z] /.test(key);
const initialSurname = (key: string) => {
  const parts = key.split(" ");
  return parts.length > 1 ? `${parts[0][0]}:${parts[parts.length - 1]}` : null;
};

function seasonLabel(comp: Comp): string | null {
  const raw = `${comp.season || ""} ${comp.name}`;
  const m = raw.match(/\b(20\d{2})\s*[-/]\s*(20)?(\d{2})\b/);
  return m ? `${m[1]}/${m[3]}` : comp.season || null;
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

function statsForComp(leagueId: string, cache?: StatsCache): Promise<StatRow[]> {
  if (!cache) return readStatsForComp(leagueId);
  let hit = cache.get(leagueId);
  if (!hit) {
    hit = readStatsForComp(leagueId);
    cache.set(leagueId, hit);
  }
  return hit;
}

async function readStatsForComp(leagueId: string): Promise<StatRow[]> {
  const rows: StatRow[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from("player_stats")
      .select(STAT_COLUMNS)
      .eq("league_id", leagueId)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as unknown as StatRow[]));
    if ((data?.length || 0) < 1000) break;
  }
  return rows;
}

async function identityGroups(playerIds: string[]): Promise<{ byPlayer: Map<string, string>; names: Map<string, string> }> {
  const byPlayer = new Map<string, string>();
  const names = new Map<string, string>();
  for (let i = 0; i < playerIds.length; i += 300) {
    const { data, error } = await supabaseAdmin
      .from("player_identity_members")
      .select("identity_id, player_id")
      .in("player_id", playerIds.slice(i, i + 300));
    if (error) break; // table missing or unreadable: names alone still group careers
    for (const r of data || []) byPlayer.set(r.player_id, `id:${r.identity_id}`);
  }
  // The name an admin gave the person, e.g. a married name over the one most of
  // their old games were recorded under.
  const identityIds = Array.from(new Set(Array.from(byPlayer.values()).map((k) => k.slice(3))));
  for (let i = 0; i < identityIds.length; i += 300) {
    const { data, error } = await supabaseAdmin
      .from("player_identities")
      .select("id, canonical_name")
      .in("id", identityIds.slice(i, i + 300));
    if (error) break;
    for (const r of data || []) {
      const name = String(r.canonical_name || "").replace(/\s+/g, " ").trim();
      const key = nameKey(name);
      if (key.includes(" ") && !isInitialForm(key)) names.set(`id:${r.id}`, name);
    }
  }
  return { byPlayer, names };
}

export async function buildAllTime(brandId: string, gender: string, scope: Scope, stats?: StatsCache): Promise<AllTimeResponse | null> {
  const { data: compRows, error } = await supabaseAdmin
    .from("competitions")
    .select("league_id, name, slug, season, gender")
    .eq("competition_id", brandId)
    .eq("is_public", true);
  if (error) throw new Error(error.message);
  let comps = (compRows || []) as Comp[];
  const hasGenders = comps.some((c) => c.gender);
  // A brand split by gender always has a gender picked on the page; a board mixing
  // the men's and women's sides is never shown, so it isn't built (or stored).
  if (hasGenders && !gender) return null;
  if (hasGenders) comps = comps.filter((c) => !c.gender || c.gender === gender);
  if (scope === "league") comps = comps.filter((c) => !KNOCKOUT_NAME.test(c.name));
  if (comps.length === 0) return null;
  const compById = new Map(comps.map((c) => [c.league_id, c]));

  const rows = (await inBatches(comps, COMPS_AT_ONCE, (c) => statsForComp(c.league_id, stats))).flat().filter(played);

  // Group each row into a career: identity group first, else the player's name.
  // An initial-only name ("J. Smith") joins the one full name it can only mean.
  const { byPlayer: identity, names: identityNames } = await identityGroups(Array.from(new Set(rows.map((r) => r.player_id).filter(Boolean))));
  const fullBySurname = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = nameKey(cleanName(r));
    if (!k || isInitialForm(k)) continue;
    const is = initialSurname(k);
    if (!is) continue;
    if (!fullBySurname.has(is)) fullBySurname.set(is, new Set());
    fullBySurname.get(is)!.add(k);
  }
  const groupOf = (r: StatRow): string => {
    const viaIdentity = r.player_id && identity.get(r.player_id);
    if (viaIdentity) return viaIdentity;
    const k = nameKey(cleanName(r)) || `pid:${r.player_id}`;
    if (isInitialForm(k)) {
      const options = fullBySurname.get(initialSurname(k) || "");
      if (options && options.size === 1) return `name:${Array.from(options)[0]}`;
    }
    return `name:${k}`;
  };

  type Acc = AllTimeCareer & { names: Map<string, number>; lastPlayer: { id: string; at: string; name: string } | null; teamLast: Map<string, string>; seasonSet: Set<string> };
  const careers = new Map<string, Acc>();
  const games = new Set<string>();
  const recordRows: StatRow[] = [];

  for (const r of rows) {
    const key = groupOf(r);
    r.__key = key;
    games.add(r.game_key);
    let c = careers.get(key);
    if (!c) {
      c = {
        key, name: "", href: null, photo: null, teams: [], first: null, last: null, seasons: 0,
        gp: 0, min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
        names: new Map(), lastPlayer: null, teamLast: new Map(), seasonSet: new Set(),
      };
      careers.set(key, c);
    }
    const name = cleanName(r);
    if (name) c.names.set(name, (c.names.get(name) || 0) + 1);
    const at = String(r.created_at || "");
    if (r.player_id && (!c.lastPlayer || at > c.lastPlayer.at)) c.lastPlayer = { id: r.player_id, at, name };
    if (r.team_name) {
      const prev = c.teamLast.get(r.team_name);
      if (!prev || at > prev) c.teamLast.set(r.team_name, at);
    }
    const season = seasonLabel(compById.get(r.league_id)!);
    if (season) c.seasonSet.add(season);
    c.gp += 1;
    c.min += minutesOf(r);
    c.pts += num(r.spoints);
    c.reb += num(r.sreboundstotal);
    c.ast += num(r.sassists);
    c.stl += num(r.ssteals);
    c.blk += num(r.sblocks);
    c.tov += num(r.sturnovers);
    c.fgm += num(r.sfieldgoalsmade);
    c.fga += num(r.sfieldgoalsattempted);
    c.tpm += num(r.sthreepointersmade);
    c.tpa += num(r.sthreepointersattempted);
    c.ftm += num(r.sfreethrowsmade);
    c.fta += num(r.sfreethrowsattempted);
    recordRows.push(r);
  }

  // A career's display name: the identity group's name when it has one, else its
  // full name used most often (never an initial form when a full one exists).
  for (const c of Array.from(careers.values())) {
    const names = Array.from(c.names.entries()).sort((a, b) => {
      const ai = isInitialForm(nameKey(a[0])) ? 1 : 0;
      const bi = isInitialForm(nameKey(b[0])) ? 1 : 0;
      return ai - bi || b[1] - a[1];
    });
    c.name = identityNames.get(c.key) || names[0]?.[0] || "Unknown player";
    c.teams = Array.from(c.teamLast.entries()).sort((a, b) => (a[1] < b[1] ? 1 : -1)).map(([t]) => t);
    const seasons = Array.from(c.seasonSet).sort();
    c.seasons = seasons.length;
    c.first = seasons[0] || null;
    c.last = seasons[seasons.length - 1] || null;
  }

  const keptCareers = Array.from(careers.values()).filter((c) => c.gp >= MIN_CAREER_GAMES);

  const records = {} as AllTimeResponse["records"];
  for (const stat of RECORD_STATS) {
    const sorted = recordRows
      .filter((r) => num(r[stat.column]) > 0)
      .sort((a, b) => num(b[stat.column]) - num(a[stat.column]) || String(a.created_at).localeCompare(String(b.created_at)));
    const cutoff = sorted[RECORDS_PER_STAT - 1] ? num(sorted[RECORDS_PER_STAT - 1][stat.column]) : 0;
    // Ties at the last place stay in, up to a sensible cap.
    const top = sorted.filter((r, i) => i < RECORDS_PER_STAT || (num(r[stat.column]) === cutoff && i < RECORDS_PER_STAT * 2));
    records[stat.key] = top.map((r) => {
      const comp = compById.get(r.league_id)!;
      return {
        key: r.__key,
        name: "",
        href: null,
        value: num(r[stat.column]),
        team: r.team_name || null,
        opponent: null,
        date: r.created_at ? String(r.created_at).slice(0, 10) : null,
        competition: comp.name,
        competitionSlug: comp.slug,
        gameKey: r.game_key,
        line: {
          pts: num(r.spoints), reb: num(r.sreboundstotal), ast: num(r.sassists),
          stl: num(r.ssteals), blk: num(r.sblocks), tpm: num(r.sthreepointersmade),
        },
      };
    });
  }

  // Opponents for the record games.
  const recordGameKeys = Array.from(new Set(Object.values(records).flat().map((r) => r.gameKey)));
  const fixtures = new Map<string, { home: string | null; away: string | null }>();
  for (let i = 0; i < recordGameKeys.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("game_schedule")
      .select("game_key, hometeam, awayteam")
      .in("game_key", recordGameKeys.slice(i, i + 200));
    for (const g of data || []) fixtures.set(g.game_key, { home: g.hometeam, away: g.awayteam });
  }

  // Profile links + photos for every player who appears anywhere in the response.
  const linkIds = Array.from(new Set([...keptCareers, ...Object.values(records).flat().map((r) => careers.get(r.key)!)]
    .map((c) => (c as Acc).lastPlayer?.id).filter(Boolean) as string[]));
  const players = new Map<string, { slug: string | null; full_name: string | null; photo: string | null }>();
  for (let i = 0; i < linkIds.length; i += 300) {
    const { data } = await supabaseAdmin
      .from("players")
      .select("id, slug, full_name, photo_path_bg_removed, photo_path")
      .in("id", linkIds.slice(i, i + 300));
    for (const p of data || []) players.set(p.id, { slug: p.slug, full_name: p.full_name, photo: p.photo_path_bg_removed || p.photo_path || null });
  }
  for (const c of Array.from(careers.values())) {
    const p = c.lastPlayer && players.get(c.lastPlayer.id);
    if (!c.lastPlayer) continue;
    c.href = playerPath({ id: c.lastPlayer.id, slug: p?.slug ?? null, full_name: c.name });
    c.photo = p?.photo ?? null;
  }
  for (const list of Object.values(records)) {
    for (const r of list) {
      const c = careers.get(r.key)!;
      r.name = c.name;
      r.href = c.href;
      const f = fixtures.get(r.gameKey);
      if (f && r.team) r.opponent = f.home === r.team ? f.away : f.away === r.team ? f.home : null;
    }
  }

  const seasonList = comps.map(seasonLabel).filter(Boolean).sort() as string[];
  return {
    competitions: comps.length,
    games: games.size,
    firstSeason: seasonList[0] || null,
    lastSeason: seasonList[seasonList.length - 1] || null,
    careers: keptCareers.map(({ names, lastPlayer, teamLast, seasonSet, ...c }) => ({
      ...c,
      min: Math.round(c.min),
    })),
    records,
  };
}

// ── Stored boards ──────────────────────────────────────────────────────────

/** This instance's copy of each board, in front of the stored one. */
const memory = new Map<string, { at: number; value: Promise<AllTimeResponse | null> }>();
/** Builds in progress, so two asks for the same board share one build. */
const rebuilding = new Map<string, Promise<AllTimeResponse | null>>();

/** Only the genders competitions use, so a made-up value can't store a board of its own. */
function normaliseGender(value: unknown): string {
  const g = String(value || "").trim().toLowerCase();
  return g === "men" ? "Men" : g === "women" ? "Women" : "";
}

const snapshotKey = (brandId: string, gender: string, scope: Scope) => `${brandId}|${gender}|${scope}`;

async function readSnapshot(key: string): Promise<{ data: AllTimeResponse; builtAt: number } | null> {
  const { data, error } = await supabaseAdmin.from(SNAPSHOTS).select("data, built_at").eq("key", key).maybeSingle();
  if (error) {
    // Table missing (before the migration) or unreadable: build live instead.
    console.warn("[AllTime] snapshot read failed", error.message);
    return null;
  }
  if (!data) return null;
  return { data: data.data as AllTimeResponse, builtAt: new Date(data.built_at).getTime() };
}

/** Build one board now and store it. */
export function rebuildAllTime(brandId: string, gender: string, scope: Scope, stats?: StatsCache): Promise<AllTimeResponse | null> {
  const key = snapshotKey(brandId, gender, scope);
  const running = rebuilding.get(key);
  if (running) return running;
  const job = (async () => {
    const started = Date.now();
    const data = await buildAllTime(brandId, gender, scope, stats);
    if (data) {
      const { error } = await supabaseAdmin.from(SNAPSHOTS).upsert({
        key,
        brand_id: brandId,
        gender,
        scope,
        data,
        built_at: new Date().toISOString(),
        build_ms: Date.now() - started,
      });
      if (error) console.warn("[AllTime] snapshot write failed", key, error.message);
    } else {
      // No public competitions any more: drop the stored board so it isn't served.
      await supabaseAdmin.from(SNAPSHOTS).delete().eq("key", key);
    }
    memory.set(key, { at: Date.now(), value: Promise.resolve(data) });
    return data;
  })();
  rebuilding.set(key, job);
  job.finally(() => rebuilding.delete(key)).catch(() => {});
  return job;
}

/** The stored board, or a fresh build when there isn't one. A stale board is served while it rebuilds. */
async function loadBoard(brandId: string, gender: string, scope: Scope): Promise<AllTimeResponse | null> {
  const key = snapshotKey(brandId, gender, scope);
  const stored = await readSnapshot(key);
  if (!stored) return rebuildAllTime(brandId, gender, scope);
  if (Date.now() - stored.builtAt > STALE_MS) {
    rebuildAllTime(brandId, gender, scope).catch((err) => console.warn("[AllTime] background rebuild failed", key, err?.message));
  }
  return stored.data;
}

export type AllTimeRebuildResult = { rebuilt: string[]; failed: Array<{ key: string; error: string }>; left: string[] };

/**
 * Rebuild stored boards, oldest first: all of them, or only the given brands'.
 * A board is only stored once someone has asked for it, so this keeps fresh the
 * boards people actually look at. Stops starting new builds after budgetMs; the
 * boards left over are still served, and the next run starts with them.
 */
export async function rebuildAllTimeSnapshots(opts: { brandIds?: string[]; budgetMs?: number } = {}): Promise<AllTimeRebuildResult> {
  const started = Date.now();
  const budget = opts.budgetMs ?? CRON_BUDGET_MS;
  const result: AllTimeRebuildResult = { rebuilt: [], failed: [], left: [] };
  if (opts.brandIds && opts.brandIds.length === 0) return result;

  let query = supabaseAdmin.from(SNAPSHOTS).select("key, brand_id, gender, scope, built_at").order("built_at", { ascending: true });
  if (opts.brandIds) query = query.in("brand_id", opts.brandIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Both scopes of one brand and gender read the same box scores, so they rebuild together.
  type Board = { key: string; brand_id: string; gender: string; scope: Scope };
  const groups = new Map<string, Board[]>();
  for (const row of (data || []) as Board[]) {
    const group = `${row.brand_id}|${row.gender}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(row);
  }
  const queue = Array.from(groups.values());
  const worker = async () => {
    for (let group = queue.shift(); group; group = queue.shift()) {
      if (Date.now() - started > budget) {
        result.left.push(...group.map((b) => b.key));
        continue;
      }
      const stats: StatsCache = new Map();
      for (const board of group) {
        try {
          await rebuildAllTime(board.brand_id, board.gender, board.scope, stats);
          result.rebuilt.push(board.key);
        } catch (err: any) {
          result.failed.push({ key: board.key, error: err?.message || String(err) });
        }
      }
    }
  };
  await Promise.all([worker(), worker()]);
  return result;
}

/**
 * After an admin links or unlinks players: rebuild the stored boards of every brand
 * those players have played in. Waits up to timeoutMs so the admin's next look shows
 * the change; anything slower carries on, and the nightly run catches what's left.
 */
export async function refreshAllTimeForPlayers(playerIds: string[], timeoutMs = 20_000): Promise<void> {
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  if (ids.length === 0) return;
  try {
    const leagueIds = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin.from("players").select("league_id").in("id", ids.slice(i, i + 200));
      for (const p of data || []) if (p.league_id) leagueIds.add(p.league_id);
    }
    if (leagueIds.size === 0) return;
    const { data: comps } = await supabaseAdmin.from("competitions").select("competition_id").in("league_id", Array.from(leagueIds));
    const brandIds = Array.from(new Set((comps || []).map((c: any) => c.competition_id).filter(Boolean))) as string[];
    if (brandIds.length === 0) return;
    for (const key of Array.from(memory.keys())) {
      if (brandIds.some((b) => key.startsWith(`${b}|`))) memory.delete(key);
    }
    const job = rebuildAllTimeSnapshots({ brandIds, budgetMs: timeoutMs });
    job.catch((err) => console.warn("[AllTime] rebuild after identity change failed", err?.message));
    await Promise.race([job, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  } catch (err: any) {
    console.warn("[AllTime] rebuild after identity change failed", err?.message);
  }
}

function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(String(req.headers.authorization ?? ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const UUID = /^[0-9a-f-]{36}$/i;

type Deps = { requireAdmin: (req: Request, res: Response) => Promise<string | null> };

export function registerAllTimeLeaderRoutes(app: Express, { requireAdmin }: Deps) {
  app.get("/api/leagues/:brandId/all-time", async (req: Request, res: Response) => {
    const brandId = String(req.params.brandId || "");
    if (!UUID.test(brandId)) return res.status(400).json({ error: "Unknown league" });
    const gender = normaliseGender(req.query.gender);
    const scope: Scope = req.query.scope === "league" ? "league" : "all";
    const key = snapshotKey(brandId, gender, scope);
    try {
      let hit = memory.get(key);
      if (!hit || Date.now() - hit.at > MEMORY_MS) {
        hit = { at: Date.now(), value: loadBoard(brandId, gender, scope) };
        memory.set(key, hit);
        hit.value.catch(() => memory.delete(key));
      }
      const data = await hit.value;
      if (!data) return res.status(404).json({ error: "No public competitions" });
      res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400");
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Could not load all-time leaders" });
    }
  });

  // GET /api/cron/all-time — the nightly rebuild. Vercel sends CRON_SECRET as a bearer token.
  app.get("/api/cron/all-time", async (req: Request, res: Response) => {
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET isn't set." });
    if (!cronAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });
    try {
      const result = await rebuildAllTimeSnapshots();
      console.log("[AllTime] cron", JSON.stringify({ rebuilt: result.rebuilt.length, failed: result.failed, left: result.left.length }));
      res.json(result);
    } catch (err: any) {
      console.error("[AllTime] cron failed", err?.message);
      res.status(502).json({ error: err?.message || "Couldn't rebuild the all-time boards." });
    }
  });

  // POST /api/admin/all-time/rebuild { brandId? } — rebuild now, e.g. after merging players by hand.
  app.post("/api/admin/all-time/rebuild", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    const brandId = typeof req.body?.brandId === "string" ? req.body.brandId : "";
    if (brandId && !UUID.test(brandId)) return res.status(400).json({ error: "Unknown league" });
    try {
      res.json(await rebuildAllTimeSnapshots({ brandIds: brandId ? [brandId] : undefined, budgetMs: 50 * 1000 }));
    } catch (err: any) {
      res.status(502).json({ error: err?.message || "Couldn't rebuild the all-time boards." });
    }
  });
}
