import { supabase } from "@/lib/supabase";
import { isSameTeam } from "@shared/teamIdentity";

/**
 * League tables from a competition's final results, shared by the app Home's
 * "Your leagues" tables and the Following list's table positions, so both
 * always agree.
 */

export interface TableRow { team: string; w: number; l: number; diff: number }
export interface PoolTable { leagueId: string; pool: string | null; rows: TableRow[] }
/** One side's final score in one game. */
export interface FinalScore { game_key: string; name: string; pts: number }
export interface LeagueResults { tables: PoolTable[]; scores: FinalScore[] }

/**
 * A game's group, from its pool tag: "A" and "0(Pool A)" are both Pool A,
 * named groups (North, South 1) keep their names. Knockout tags (Playoffs,
 * SF1, Final, 5th Place) and blanks ("0") aren't groups.
 */
export function poolOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const inner = (raw.match(/\(([^)]+)\)/)?.[1] ?? raw).trim();
  if (!inner || /^\d+$/.test(inner)) return null;
  if (/play-?offs?|final|semi|quarter|\bsf\d|\bqf\d|place|class|round/i.test(inner)) return null;
  const letter = inner.match(/^(?:pool|group)?\s*([a-z])$/i);
  return letter ? `Pool ${letter[1].toUpperCase()}` : inner;
}

/**
 * Each competition's table, best first: one per pool when it's split into
 * pools (NBL Division One's A and B), from that pool's games only. Tables
 * with fewer than two teams are left out. Also returns every final score the
 * tables were built from.
 */
export async function loadLeagueResults(leagueIds: string[]): Promise<LeagueResults> {
  if (!leagueIds.length) return { tables: [], scores: [] };
  const [{ data: games }, { data: sides }, { data: pools }] = await Promise.all([
    supabase.from("game_schedule").select("game_key, league_id").eq("status", "final").in("league_id", leagueIds).limit(2000),
    supabase.from("team_stats").select("game_key, name, tot_spoints, league_id").in("league_id", leagueIds).limit(4000),
    supabase.from("v_game_results").select("game_key, pool").in("league_id", leagueIds).not("pool", "is", null).limit(2000),
  ]);
  const finals = new Set((games ?? []).map((g) => g.game_key));
  const poolByGame = new Map<string, string>();
  for (const g of pools ?? []) {
    const pool = poolOf(g.pool);
    if (pool) poolByGame.set(g.game_key, pool);
  }
  const scores: FinalScore[] = [];
  const byGame = new Map<string, Array<{ name: string; pts: number; league_id: string }>>();
  for (const s of sides ?? []) {
    if (!finals.has(s.game_key) || s.tot_spoints == null) continue;
    scores.push({ game_key: s.game_key, name: s.name, pts: s.tot_spoints });
    (byGame.get(s.game_key) ?? byGame.set(s.game_key, []).get(s.game_key)!).push({ name: s.name, pts: s.tot_spoints, league_id: s.league_id });
  }

  const poolsIn = new Map<string, Set<string>>();
  byGame.forEach((pair, gameKey) => {
    const pool = poolByGame.get(gameKey);
    if (pool) (poolsIn.get(pair[0].league_id) ?? poolsIn.set(pair[0].league_id, new Set()).get(pair[0].league_id)!).add(pool);
  });
  const pooled = (leagueId: string) => (poolsIn.get(leagueId)?.size ?? 0) >= 2;

  const tables = new Map<string, Map<string, TableRow>>(); // by `${league_id}|${pool}`
  byGame.forEach((pair, gameKey) => {
    if (pair.length !== 2 || pair[0].pts === pair[1].pts) return;
    const lid = pair[0].league_id;
    const pool = pooled(lid) ? poolByGame.get(gameKey) : "";
    if (pool === undefined) return;
    const tk = `${lid}|${pool}`;
    const table = tables.get(tk) ?? tables.set(tk, new Map()).get(tk)!;
    for (const [me, them] of [[pair[0], pair[1]], [pair[1], pair[0]]]) {
      const key = Array.from(table.keys()).find((k) => isSameTeam(k, me.name)) ?? me.name;
      const row = table.get(key) ?? { team: key, w: 0, l: 0, diff: 0 };
      if (me.pts > them.pts) row.w++; else row.l++;
      row.diff += me.pts - them.pts;
      table.set(key, row);
    }
  });

  const out = leagueIds.flatMap((leagueId) => {
    const groups = pooled(leagueId)
      ? Array.from(poolsIn.get(leagueId)!).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
      : [""];
    return groups.flatMap((pool) => {
      const rows = Array.from(tables.get(`${leagueId}|${pool}`)?.values() ?? []);
      if (rows.length < 2) return [];
      rows.sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l) || b.diff - a.diff || b.w - a.w);
      return [{ leagueId, pool: pool || null, rows }];
    });
  });
  return { tables: out, scores };
}
