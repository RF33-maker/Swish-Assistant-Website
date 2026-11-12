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
 */

import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { playerPath } from "../shared/seo";

const CACHE_MS = 60 * 60 * 1000;
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

async function statsForComp(leagueId: string): Promise<StatRow[]> {
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

async function identityGroups(playerIds: string[]): Promise<Map<string, string>> {
  const byPlayer = new Map<string, string>();
  for (let i = 0; i < playerIds.length; i += 300) {
    const { data, error } = await supabaseAdmin
      .from("player_identity_members")
      .select("identity_id, player_id")
      .in("player_id", playerIds.slice(i, i + 300));
    if (error) break; // table missing or unreadable: names alone still group careers
    for (const r of data || []) byPlayer.set(r.player_id, `id:${r.identity_id}`);
  }
  return byPlayer;
}

export async function buildAllTime(brandId: string, gender: string, scope: "all" | "league"): Promise<AllTimeResponse | null> {
  const { data: compRows, error } = await supabaseAdmin
    .from("competitions")
    .select("league_id, name, slug, season, gender")
    .eq("competition_id", brandId)
    .eq("is_public", true);
  if (error) throw new Error(error.message);
  let comps = (compRows || []) as Comp[];
  const hasGenders = comps.some((c) => c.gender);
  if (hasGenders && gender) comps = comps.filter((c) => !c.gender || c.gender === gender);
  if (scope === "league") comps = comps.filter((c) => !KNOCKOUT_NAME.test(c.name));
  if (comps.length === 0) return null;
  const compById = new Map(comps.map((c) => [c.league_id, c]));

  const rows = (await inBatches(comps, COMPS_AT_ONCE, (c) => statsForComp(c.league_id))).flat().filter(played);

  // Group each row into a career: identity group first, else the player's name.
  // An initial-only name ("J. Smith") joins the one full name it can only mean.
  const identity = await identityGroups(Array.from(new Set(rows.map((r) => r.player_id).filter(Boolean))));
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

  // A career's display name: its full name used most often (never an initial form
  // when a full one exists).
  for (const c of Array.from(careers.values())) {
    const names = Array.from(c.names.entries()).sort((a, b) => {
      const ai = isInitialForm(nameKey(a[0])) ? 1 : 0;
      const bi = isInitialForm(nameKey(b[0])) ? 1 : 0;
      return ai - bi || b[1] - a[1];
    });
    c.name = names[0]?.[0] || "Unknown player";
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

const cache = new Map<string, { at: number; value: Promise<AllTimeResponse | null> }>();

export function registerAllTimeLeaderRoutes(app: Express) {
  app.get("/api/leagues/:brandId/all-time", async (req: Request, res: Response) => {
    const brandId = String(req.params.brandId || "");
    if (!/^[0-9a-f-]{36}$/i.test(brandId)) return res.status(400).json({ error: "Unknown league" });
    const gender = String(req.query.gender || "").slice(0, 20);
    const scope = req.query.scope === "league" ? "league" : "all";
    const cacheKey = `${brandId}|${gender}|${scope}`;
    try {
      let hit = cache.get(cacheKey);
      if (!hit || Date.now() - hit.at > CACHE_MS) {
        hit = { at: Date.now(), value: buildAllTime(brandId, gender, scope) };
        cache.set(cacheKey, hit);
        hit.value.catch(() => cache.delete(cacheKey));
      }
      const data = await hit.value;
      if (!data) return res.status(404).json({ error: "No public competitions" });
      res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400");
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Could not load all-time leaders" });
    }
  });
}
