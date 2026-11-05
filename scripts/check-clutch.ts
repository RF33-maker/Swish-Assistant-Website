/**
 * Data check for Swish+ clutch numbers, against the live database (read only).
 *
 *   DOTENV_CONFIG_PATH=../../../.env node --import dotenv/config node_modules/.bin/tsx scripts/check-clutch.ts [competition-slug]
 *
 * 1. Every basket lands in the lineup stint that recorded it (stint points match).
 * 2. In games trusted on every count: players' clutch seconds = 5 x the team's, their on-court
 *    points = 5 x the team's (within 2%: trusted lineup games may still have a few stints without
 *    exactly five people), and their own points add up to the team's exactly.
 * 3. How much of the competition each kind of number can use.
 * 4. A sense check: clutch minutes per clutch game, and the league table.
 */
import { supabaseAdmin } from "../server/supabaseServiceClient";
import { cachedClutch, computeTeamClutch } from "../server/clutchService";
import { computeClutchStats, teamClutchMetrics, type ClutchEvent, type ClutchMember, type ClutchStint } from "../server/clutch";
import { readAll } from "../server/lineupsService";

const slug = process.argv[2] || "nbl-division-1-2026-2027";
const { data: comp } = await supabaseAdmin.from("competitions").select("league_id, name").eq("slug", slug).single();
if (!comp) throw new Error(`No competition ${slug}`);
const ids = [comp.league_id as string];
console.log(`${comp.name}`);

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures += 1;
    if (failures <= 20) console.log("  FAIL", what);
  }
};

const loaded = await cachedClutch(ids);
const { trust, teamGames, result, stintRecorded } = loaded;

// 1. Stint points, in lineup-trusted games.
const { data: stintMeta } = { data: await readAll<{ id: string; game_key: string; team_id: string }>("lineup_stints", "id,game_key,team_id", ids, 60000) };
let stintChecked = 0;
let stintOff = 0;
for (const s of stintMeta) {
  if (!trust.lineups.has(`${s.game_key}|${s.team_id}`)) continue;
  stintChecked += 1;
  const mine = result.stintPoints.get(String(s.id)) || 0;
  if (mine !== stintRecorded.get(String(s.id))) stintOff += 1;
}
console.log(`1. ${stintChecked} stints in trusted lineup games; ${stintOff} where our basket-to-stint matching disagrees with the stint's recorded points`);
check(stintOff / Math.max(1, stintChecked) < 0.01, "more than 1% of stints disagree on points");

// 2. Identities in games trusted on every count.
const both = new Set(Array.from(trust.teamTotals).filter((k) => trust.lineups.has(k) && trust.credit.has(k) && !result.leftOut.lineups.has(k) && !result.leftOut.credit.has(k)));
const gamesBoth = new Set(Array.from(both).map((k) => k.split("|")[0]).filter((g) => Array.from(both).filter((k) => k.startsWith(`${g}|`)).length === 2));
const keep = new Set(Array.from(both).filter((k) => gamesBoth.has(k.split("|")[0])));
const [events, stints, members] = await Promise.all([
  readAll<ClutchEvent>("live_events", "id,game_key,team_id,action_number,period,period_type,clock,shirt_number,player_name,action_type,sub_type,success,score,team_no", ids, 400000),
  readAll<ClutchStint>("lineup_stints", "id,game_key,team_id,start_action,end_action", ids, 60000),
  readAll<ClutchMember>("player_on_court_stints", "id,stint_id,shirt_number,player_name,player_id", ids, 300000),
]);
const strict = computeClutchStats(events.filter((e) => gamesBoth.has(e.game_key)), stints, members, { teamTotals: keep, lineups: keep, credit: keep });
let teamsChecked = 0;
strict.teams.forEach((t, id) => {
  const ps = Array.from(strict.players.values()).filter((p) => p.team_id === id);
  const secs = ps.reduce((a, p) => a + p.secs, 0);
  const onPf = ps.reduce((a, p) => a + p.onPf, 0);
  const onPa = ps.reduce((a, p) => a + p.onPa, 0);
  const pts = ps.reduce((a, p) => a + p.pts, 0);
  teamsChecked += 1;
  // Trusted lineup games still allow 5% of stints without exactly five people, so allow 2%.
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1.5, 0.02 * b);
  check(near(secs, 5 * t.secs), `team ${id}: players' clutch seconds ${secs.toFixed(0)} vs 5 x ${t.secs.toFixed(0)}`);
  check(near(onPf, 5 * t.own.pts), `team ${id}: on-court points for ${onPf} vs 5 x ${t.own.pts}`);
  check(near(onPa, 5 * t.opp.pts), `team ${id}: on-court points against ${onPa} vs 5 x ${t.opp.pts}`);
  check(pts === t.own.pts, `team ${id}: players' clutch points ${pts} vs team ${t.own.pts}`);
});
console.log(`2. ${gamesBoth.size} games trusted on every count, ${teamsChecked} teams: seconds, on-court points and own points add up`);

// 2b. In every counted game: no player has more clutch time, games or points than their team.
let insideOff = 0;
result.players.forEach((p) => {
  const t = result.teams.get(p.team_id);
  const tSecs = t?.secs ?? 0;
  const tGames = t?.games ?? new Set<string>();
  if (p.secs > tSecs + 1 || Array.from(p.games).some((g) => !tGames.has(g)) || p.pts > (t?.own.pts ?? 0)) insideOff += 1;
});
console.log(`2b. ${result.players.size} players; ${insideOff} with more clutch time, games or points than their team`);
check(insideOff === 0, "a player's clutch line goes beyond their team's");
const teamPts = new Map<string, number>();
result.players.forEach((p) => teamPts.set(p.team_id, (teamPts.get(p.team_id) || 0) + p.pts));
let ptsOver = 0;
teamPts.forEach((v, id) => { if (v > (result.teams.get(id)?.own.pts ?? 0)) ptsOver += 1; });
check(ptsOver === 0, `${ptsOver} teams whose players' clutch points add to more than the team's`);

// 3. Coverage.
console.log(`3. ${teamGames.size} team-games with play-by-play: team totals trusted ${trust.teamTotals.size}, lineups ${trust.lineups.size}, player credit ${trust.credit.size}; left out for shared names: lineups ${result.leftOut.lineups.size}, credit ${result.leftOut.credit.size}`);

// 4. Sense check.
let clutchGames = 0;
let clutchSecs = 0;
result.teams.forEach((t) => {
  clutchGames += t.games.size;
  clutchSecs += t.secs;
});
console.log(`4. ${(clutchGames / 2).toFixed(0)} games had clutch time, ${(clutchSecs / 60 / Math.max(1, clutchGames)).toFixed(1)} clutch minutes each on average`);
const anyTeam = Array.from(result.teams.keys())[0];
if (anyTeam) {
  const { data: t } = await supabaseAdmin.from("teams").select("name").eq("team_id", anyTeam).single();
  const out = await computeTeamClutch({ leagueIds: ids, leagueName: comp.name, rootLeagueId: ids[0], teamName: t?.name || "", formatName: (n) => n });
  console.log("   League clutch table (top 5):");
  for (const r of out.league.teams.slice(0, 5)) console.log(`     ${r.name}: ${r.wins}-${r.losses} in ${r.games} games, ${r.minutes} min, ${r.plusMinus > 0 ? "+" : ""}${r.plusMinus}, net ${r.net}`);
  console.log(`   ${out.team?.name}: rank ${out.rank}, ${JSON.stringify(out.summary)}`);
  console.log(`   coverage ${JSON.stringify(out.coverage)}`);
  for (const p of out.players.slice(0, 5)) console.log(`     ${p.name}: ${p.minutes} min in ${p.games} games, on ${p.onPlusMinus > 0 ? "+" : ""}${p.onPlusMinus}; ${p.pts} pts ${p.fgm}/${p.fga} FG, ${p.fg3m}/${p.fg3a} 3P, ${p.ftm}/${p.fta} FT (${p.boxGames} games)`);
  check(out.players.every((p) => p.name && !/^[a-z] /.test(p.name)), "a clutch player has no proper name");
  check(teamClutchMetrics(result.teams.get(anyTeam)!).games === out.summary?.games, "team summary games");
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks failed.`);
process.exit(failures === 0 ? 0 : 1);
