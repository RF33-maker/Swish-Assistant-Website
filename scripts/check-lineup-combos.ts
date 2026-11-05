/**
 * Data check for the Swish+ lineup explorer, against the live database (read only).
 *
 *   DOTENV_CONFIG_PATH=../../../.env node --import dotenv/config node_modules/.bin/tsx scripts/check-lineup-combos.ts [competition-slug]
 *
 * 1. Pairs and threes add up: each is the sum of the five-man units that contain it.
 * 2. Five-man units add up to the team's stints.
 * 3. Stint box numbers match each trusted game's box score (FGA, 3PM, FTA, turnovers, points).
 * 4. The explorer's five-man rows match the free "Best lineups" panel for the same units.
 */
import { supabaseAdmin } from "../server/supabaseServiceClient";
import { groupStints, reliableTeamGames, type BoxRow, type StintRow, type TeamPointsRow } from "../server/lineups";
import { buildCombos, comboMetrics, STINT_BOX_COLS, type Combo, type StintBox } from "../server/lineupCombos";
import { computeLineupCombos, computeLineups } from "../server/lineupsService";

const slug = process.argv[2] || "national-basketball-league-d1-mens-20252026";

async function readAll<T>(table: string, cols: string, leagueId: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from(table).select(cols).eq("league_id", leagueId).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as unknown as T[]));
    if ((data?.length || 0) < 1000) break;
  }
  return out;
}

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures += 1;
    if (failures <= 25) console.log("  FAIL", what);
  }
};

const { data: comp } = await supabaseAdmin.from("competitions").select("league_id, name").eq("slug", slug).single();
if (!comp) throw new Error(`No competition ${slug}`);
console.log(`${comp.name} (${comp.league_id})`);

const rows = await readAll<StintRow>("player_on_court_stints", "id,stint_id,game_key,team_id,player_id,player_name,seconds_played,points_for,points_against,possessions_for,possessions_against", comp.league_id);
const boxRows = await readAll<StintBox & { game_key: string; team_id: string; points_for: number }>("lineup_stints", `${STINT_BOX_COLS},game_key,team_id,points_for`, comp.league_id);
const playerBox = await readAll<BoxRow>("player_stats", "id,game_key,team_id,sminutes", comp.league_id);
const teamStats = await readAll<TeamPointsRow & Record<string, number | string | null>>(
  "team_stats",
  "id,game_key,team_id,tot_spoints,tot_sfieldgoalsattempted,tot_sthreepointersmade,tot_sfreethrowsattempted,tot_sturnovers,tot_sreboundsoffensive,tot_sreboundsteamoffensive",
  comp.league_id,
);
const { reliable } = reliableTeamGames(rows, playerBox, teamStats);
const usable = rows.filter((r) => reliable.has(`${r.game_key}|${r.team_id}`));
const stints = groupStints(usable);
const box = new Map(boxRows.map((b) => [String(b.id), b]));
console.log(`${rows.length} on-court rows, ${stints.size} trusted stints, ${reliable.size} trusted team-games`);

// 1 + 2: internal sums, per team.
const teamIds = Array.from(new Set(Array.from(stints.values()).map((s) => s.team_id)));
let pairsChecked = 0;
let threesChecked = 0;
for (const teamId of teamIds) {
  const mine = Array.from(stints.values()).filter((s) => s.team_id === teamId);
  const fives = buildCombos(mine, box, 5);
  const fullStints = mine.filter((s) => s.members.size === 5 && s.secs > 0);
  const sum = (list: { pf: number; secs: number }[]) => list.reduce((a, b) => ({ pf: a.pf + b.pf, secs: a.secs + b.secs }), { pf: 0, secs: 0 });
  const f = sum(fives);
  const s = sum(fullStints);
  check(f.pf === s.pf && f.secs === s.secs, `team ${teamId}: fives ${f.pf} pts/${f.secs}s vs stints ${s.pf}/${s.secs}`);

  for (const size of [2, 3] as const) {
    for (const c of buildCombos(mine, box, size)) {
      const inside = fives.filter((u) => c.keys.every((k) => u.keys.includes(k)));
      const add = (pick: (x: Combo) => number) => inside.reduce((a, u) => a + pick(u), 0);
      const same =
        add((u) => u.pf) === c.pf &&
        add((u) => u.pa) === c.pa &&
        add((u) => u.secs) === c.secs &&
        add((u) => u.posf) === c.posf &&
        add((u) => u.own.fga) === c.own.fga &&
        add((u) => u.opp.oreb) === c.opp.oreb;
      check(same, `team ${teamId}: ${size}-group ${c.keys.join(" + ")} doesn't equal its five-man units`);
      if (size === 2) pairsChecked += 1;
      else threesChecked += 1;
    }
  }
}
console.log(`1-2. ${teamIds.length} teams: fives add up to their stints; ${pairsChecked} pairs and ${threesChecked} threes add up to their units`);

// 3: stint box numbers vs each trusted game's box score.
const perGame = new Map<string, { fga: number; fg3m: number; fta: number; tov: number; pts: number; oreb: number }>();
for (const b of boxRows) {
  const k = `${b.game_key}|${b.team_id}`;
  if (!reliable.has(k)) continue;
  const t = perGame.get(k) ?? { fga: 0, fg3m: 0, fta: 0, tov: 0, pts: 0, oreb: 0 };
  t.fga += (b.fg2_attempted || 0) + (b.fg3_attempted || 0);
  t.fg3m += b.fg3_made || 0;
  t.fta += b.ft_attempted || 0;
  t.tov += b.turnovers || 0;
  t.pts += b.points_for || 0;
  t.oreb += b.oreb || 0;
  perGame.set(k, t);
}
const official = new Map(teamStats.map((t) => [`${t.game_key}|${t.team_id}`, t]));
const off = { fga: 0, fg3m: 0, fta: 0, tov: 0, pts: 0, orebPlayers: 0, orebWithTeam: 0 };
let games = 0;
perGame.forEach((t, k) => {
  const o = official.get(k);
  if (!o) return;
  games += 1;
  const n = (v: unknown) => Number(v) || 0;
  if (t.fga !== n(o.tot_sfieldgoalsattempted)) off.fga += 1;
  if (t.fg3m !== n(o.tot_sthreepointersmade)) off.fg3m += 1;
  if (t.fta !== n(o.tot_sfreethrowsattempted)) off.fta += 1;
  if (t.tov !== n(o.tot_sturnovers)) off.tov += 1;
  if (Math.abs(t.pts - n(o.tot_spoints)) > 2) off.pts += 1;
  if (t.oreb !== n(o.tot_sreboundsoffensive)) off.orebPlayers += 1;
  if (t.oreb !== n(o.tot_sreboundsoffensive) + n(o.tot_sreboundsteamoffensive)) off.orebWithTeam += 1;
});
console.log(`3. ${games} trusted team-games vs box score, games that differ:`, off);

// 4: explorer five-man rows vs the free panel, for the first few teams.
const { data: teamRows } = await supabaseAdmin.from("teams").select("team_id, name").in("team_id", teamIds.slice(0, 6));
let compared = 0;
for (const t of teamRows || []) {
  const fmt = (n: string) => n;
  const free = await computeLineups({ leagueIds: [comp.league_id], leagueName: comp.name, rootLeagueId: comp.league_id, metric: "net", minMinutes: 8, limit: 3, teamId: "", teamName: t.name, formatName: fmt });
  const plus = await computeLineupCombos({ leagueIds: [comp.league_id], leagueName: comp.name, rootLeagueId: comp.league_id, teamName: t.name, size: 5, minMinutes: 8, formatName: fmt });
  for (const u of free.units) {
    const keys = u.players.map((p) => p.key).sort().join("|");
    const row = plus.units.find((r) => r.keys.slice().sort().join("|") === keys);
    check(!!row && row.minutes === u.minutes && row.pf === u.pf && row.pa === u.pa && row.net === u.net, `${t.name}: free unit ${keys} not matched in explorer`);
    compared += 1;
  }
  // Explorer order is best net first, so its top three are the free panel's three.
  check(
    plus.units.slice(0, free.units.length).map((r) => r.net).join() === free.units.map((u) => u.net).join(),
    `${t.name}: explorer top ${free.units.length} differ from the free panel`,
  );
  const sample = plus.units[0];
  if (sample) {
    const named = sample.keys.map((k) => plus.players.find((p) => p.key === k)?.name ?? `?${k}`);
    console.log(`   ${t.name}: ${plus.units.length} units; best ${named.join(", ")} net ${sample.net} in ${sample.minutes} min, eFG ${sample.efg} / opp ${sample.oppEfg}, TOV% ${sample.tovPct}, OREB% ${sample.orebPct}`);
    check(named.every((n) => !n.startsWith("?")), `${t.name}: a player in the explorer has no name`);
  }
}
console.log(`4. ${compared} free-panel units found in the explorer with the same numbers`);

// Range sense check on the four factors across every qualifying five-man unit.
const all = teamIds.flatMap((id) => buildCombos(Array.from(stints.values()).filter((s) => s.team_id === id), box, 5)).map(comboMetrics).filter((m) => m.minutes >= 8);
const range = (pick: (m: ReturnType<typeof comboMetrics>) => number | null) => {
  const v = all.map(pick).filter((x): x is number => x != null).sort((a, b) => a - b);
  return v.length ? `${(v[0] * 100).toFixed(1)}–${(v[v.length - 1] * 100).toFixed(1)} (median ${(v[Math.floor(v.length / 2)] * 100).toFixed(1)})` : "none";
};
console.log(`   eFG% ${range((m) => m.efg)}, TOV% ${range((m) => m.tovPct)}, OREB% ${range((m) => m.orebPct)}, FT/FGA ${range((m) => m.ftRate)} over ${all.length} units with 8+ min`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks failed.`);
process.exit(failures === 0 ? 0 : 1);
