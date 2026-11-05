/**
 * Independent cross-check of clutch points (read only): a deliberately simple re-count straight from
 * the play-by-play, compared game by game with server/clutch.ts.
 *
 *   DOTENV_CONFIG_PATH=../../../.env node --import dotenv/config node_modules/.bin/tsx scripts/check-clutch-naive.ts [competition-slug]
 *
 * The simple count: sort by period (overtime after regulation), clock down, action number; keep the
 * running score; a made basket counts when it came in period 4 or overtime with 5:00 or less left
 * and the margin before it was 5 or less. Only games where the clutch module counts both teams.
 */
import { supabaseAdmin } from "../server/supabaseServiceClient";
import { readAll, readByGames } from "../server/lineupsService";
import { cachedClutch } from "../server/clutchService";
import { computeClutchStats, type ClutchEvent } from "../server/clutch";

const slug = process.argv[2] || "nbl-division-1-2026-2027";
const { data: comp } = await supabaseAdmin.from("competitions").select("league_id, name").eq("slug", slug).single();
if (!comp) throw new Error(`No competition ${slug}`);
const ids = [comp.league_id as string];
const { trust } = await cachedClutch(ids);
const points = await readAll<{ game_key: string }>("team_stats", "id,game_key", ids, 20000);
const games = Array.from(new Set(points.map((p) => p.game_key)));
const events = await readByGames<ClutchEvent>("live_events", "id,game_key,team_id,action_number,period,period_type,clock,shirt_number,player_name,action_type,sub_type,success,score,team_no", ids, games);

const secs = (c: string | null) => {
  const m = /^(\d+):(\d+)/.exec(c || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const pts = (e: ClutchEvent) => (!e.success ? 0 : e.action_type === "3pt" ? 3 : e.action_type === "2pt" ? 2 : e.action_type === "freethrow" ? 1 : 0);

const byGame = new Map<string, ClutchEvent[]>();
for (const e of events) byGame.set(e.game_key, [...(byGame.get(e.game_key) ?? []), e]);

let compared = 0, same = 0, skippedOt = 0;
const diffs: string[] = [];
byGame.forEach((list, g) => {
  const teams = Array.from(new Set(list.filter((e) => e.team_id && (e.team_no === 1 || e.team_no === 2)).map((e) => e.team_id!)));
  if (teams.length !== 2 || !teams.every((t) => trust.teamTotals.has(`${g}|${t}`))) return;
  // The simple count can't place overtime that restarts at period 1 with no type, so skip those games.
  if (list.some((e) => (e.period_type || "").toUpperCase() !== "OVERTIME" && e.period === 1 && /period/i.test(e.action_type || "") && list.filter((x) => x.period === 1 && /period/i.test(x.action_type || "") && x.sub_type === "start").length > 1)) { skippedOt++; return; }
  const ot = (e: ClutchEvent) => (e.period_type || "").toUpperCase() === "OVERTIME" || (e.period ?? 0) > 4;
  const order = (e: ClutchEvent) => (ot(e) ? 10 + (e.period ?? 0) : e.period ?? 0);
  const evs = list.slice().sort((a, b) => order(a) - order(b) || (secs(b.clock) ?? 0) - (secs(a.clock) ?? 0) || a.action_number - b.action_number);
  let home = 0, away = 0;
  const mine = new Map<string, number>();
  for (const e of evs) {
    const before = home - away;
    const p = pts(e);
    const c = secs(e.clock);
    if (p > 0 && e.team_id && c != null && c <= 300 && (ot(e) || e.period === 4) && Math.abs(before) <= 5) mine.set(e.team_id, (mine.get(e.team_id) || 0) + p);
    const m = /^(\d+)-(\d+)$/.exec((e.score || "").trim());
    if (m) { home = Number(m[1]); away = Number(m[2]); }
  }
  const real = computeClutchStats(list, [], [], { teamTotals: new Set(teams.map((t) => `${g}|${t}`)), lineups: new Set(), credit: new Set() });
  for (const t of teams) {
    compared++;
    const a = mine.get(t) || 0;
    const b = real.teams.get(t)?.own.pts || 0;
    if (a === b) same++;
    else if (diffs.length < 12) diffs.push(`${g} ${t.slice(0, 8)}: simple ${a} vs module ${b}`);
  }
});
console.log(`${comp.name}: ${compared} team-games compared, ${same} agree, ${compared - same} differ; ${skippedOt} games with restarting overtime skipped`);
for (const d of diffs) console.log("  ", d);
process.exit(0);
