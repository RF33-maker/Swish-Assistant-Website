// Run with: npx tsx --test scripts/nationalCup.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  champion,
  displayTeamName,
  formatCupDate,
  findGameForFixture,
  gamesByRound,
  isForfeitScore,
  logoByTeam,
  upgradeCupLogo,
  parseCupDates,
  parseCupFixtures,
  resolveBracket,
  teamKey,
  teamsRemaining,
  updateFromFixture,
  type CupGameRow,
  type CupRound,
} from "../shared/nationalCup";

/** The men's draw exactly as the migration seeds it, so the seed is tested too. */
function seededRows(): CupGameRow[] {
  const sql = readFileSync(new URL("../supabase/migrations/20261021_cup_bracket_games.sql", import.meta.url), "utf8");
  const value = (v: string): string | number | boolean | null => {
    v = v.trim();
    if (v === "null") return null;
    if (v === "true") return true;
    if (v === "false") return false;
    if (/^-?\d+$/.test(v)) return Number(v);
    return v.slice(1, -1).replace(/''/g, "'");
  };
  const rows: CupGameRow[] = [];
  for (const line of sql.split("\n")) {
    if (!line.startsWith("  ('")) continue;
    const parts = line.trim().replace(/^\(/, "").replace(/\),?$/, "").match(/'(?:[^']|'')*'|[^,\s][^,]*/g)!.map(value);
    rows.push({
      league_id: String(parts[0]),
      game_no: parts[1] as number,
      round: parts[2] as CupRound,
      game_date: parts[3] as string | null,
      tip_time: null,
      home_name: parts[4] as string | null,
      away_name: parts[5] as string | null,
      home_from: parts[6] as number | null,
      away_from: parts[7] as number | null,
      is_bye: parts[8] as boolean,
      home_score: parts[9] as number | null,
      away_score: parts[10] as number | null,
      forfeit: parts[11] as boolean,
    });
  }
  return rows;
}

const rows = seededRows();
const games = resolveBracket(rows);
const game = (n: number) => games.find((g) => g.gameNo === n)!;

test("the seed is a full 127-game tree", () => {
  assert.equal(rows.length, 127);
  assert.deepEqual(
    gamesByRound(games).map((r) => [r.round, r.games.length]),
    [["R1", 64], ["R64", 32], ["R32", 16], ["R16", 8], ["QF", 4], ["SF", 2], ["F", 1]],
  );
});

test("byes go straight through and Round 1 results decide the rest", () => {
  assert.equal(game(2).status, "bye");
  assert.equal(game(2).home.winner, true);
  assert.equal(game(1).away.winner, true); // Teesside Lions 88–85
  assert.equal(game(11).forfeit, true); // Barrow Thorns 20–0 Stockport
});

test("Round of 64 sides come from Round 1 winners", () => {
  assert.equal(game(65).home.name, "Teesside Lions Senior Men");
  assert.equal(game(65).away.name, "Tees Valley Mohawks Senior Men I");
  assert.equal(game(65).away.winner, true);
});

test("Round of 32 is set from the Round of 64 results", () => {
  assert.equal(game(97).home.name, "Tees Valley Mohawks Senior Men I");
  assert.equal(game(97).away.name, "West Yorkshire Hawks Senior Men"); // won 20–0 by forfeit
  assert.equal(game(98).home.name, "Sheffield Arrows Senior Men I");
  assert.equal(game(98).away.name, "Sheffield Sharks Senior Men");
  assert.equal(game(104).home.name, "Gloucester City Kings Senior Men I");
  assert.equal(game(104).away.name, "Cardiff Met Archers Senior Men I");
  assert.equal(game(97).status, "upcoming");
});

test("later rounds wait on the games that feed them", () => {
  assert.equal(game(113).status, "waiting");
  assert.equal(game(113).home.waitingOn, 97);
  assert.equal(game(113).away.waitingOn, 98);
  assert.equal(game(127).home.waitingOn, 125);
  assert.equal(champion(games), null);
});

test("a result moves the winner into the next round", () => {
  const withResults = rows.map((r) => (r.game_no === 97 ? { ...r, home_score: 80, away_score: 70 } : r.game_no === 98 ? { ...r, home_score: 60, away_score: 75 } : r));
  const next = resolveBracket(withResults);
  const g113 = next.find((g) => g.gameNo === 113)!;
  assert.equal(g113.home.name, "Tees Valley Mohawks Senior Men I");
  assert.equal(g113.away.name, "Sheffield Sharks Senior Men");
  assert.equal(g113.status, "upcoming");
  assert.ok(teamsRemaining(next) < teamsRemaining(games));
});

test("a champion shows once the final is scored", () => {
  const all = rows.map((r) => ({ ...r }));
  // Give every unplayed game a home win; winners then propagate up the tree.
  for (const r of all) {
    if (r.home_score === null && !r.is_bye) {
      r.home_score = 80;
      r.away_score = 70;
    }
  }
  const done = resolveBracket(all);
  assert.ok(champion(done));
  assert.equal(teamsRemaining(done), 1);
});

test("team names match through suffixes, case and accents", () => {
  assert.equal(teamKey("Sussex Storm Senior Men I"), teamKey("sussex  storm"));
  assert.equal(teamKey("London Lions Senior Men II"), teamKey("London Lions"));
  assert.equal(teamKey("Worthing Thunder & Bears Senior Men"), teamKey("Worthing Thunder and Bears"));
  assert.equal(teamKey("Hackney Jedis Senior Men (Withdrawn)"), teamKey("Hackney Jedis Senior Men"));
  assert.notEqual(teamKey("Sheffield Sharks Senior Men"), teamKey("Sheffield Arrows Senior Men I"));
});

test("forfeit scores are 20–0 either way round", () => {
  assert.ok(isForfeitScore(20, 0));
  assert.ok(isForfeitScore(0, 20));
  assert.ok(!isForfeitScore(20, 10));
  assert.ok(!isForfeitScore(null, null));
});

const DAY = `
<tr class="x js-row-link" data-href="/leagues/nbl/fixtures-and-results/report/d6d986f7-2be9-425d-b338-f6a0b47e3a10">
 <td><div><span class="club-name">Sheffield Arrows Senior Men I</span><span class="score font-bold">96</span>
 <img src="https://res.cloudinary.com/x/h_64,w_64/v1/a.png" alt="a" class="club-logo"></div></td>
 <td><span class="date">Fri 16 Oct</span><span class="time text-sm">19:00</span></td>
 <td><div><span class="score font-bold">103</span><img src="https://res.cloudinary.com/x/h_64,w_64/v1/b.png" class="club-logo"><span class="club-name">Sheffield Sharks Senior Men</span></div></td>
</tr>
<tr>
 <td><div><span class="club-name">Gloucester City Kings Senior Men I</span></div></td>
 <td><span class="time text-sm text-gray-600">17:15</span></td>
 <td><div><span class="club-name">Cardiff Met Archers Senior Men I</span></div></td>
</tr>
<tr><td colspan='3'>No fixtures</td></tr>`;

test("reads played and upcoming fixtures from a day's rows", () => {
  const fx = parseCupFixtures(DAY, "2026-10-16");
  assert.equal(fx.length, 2);
  assert.deepEqual(
    [fx[0].homeTeam, fx[0].awayTeam, fx[0].homeScore, fx[0].awayScore, fx[0].tipTime, fx[0].reportId],
    ["Sheffield Arrows Senior Men I", "Sheffield Sharks Senior Men", 96, 103, "19:00", "d6d986f7-2be9-425d-b338-f6a0b47e3a10"],
  );
  assert.equal(fx[0].homeLogoUrl, "https://res.cloudinary.com/x/c_fit,h_128,w_128/v1/a.png");
  assert.equal(fx[0].awayLogoUrl, "https://res.cloudinary.com/x/c_fit,h_128,w_128/v1/b.png");
  assert.equal(fx[1].homeLogoUrl, null);
  assert.deepEqual([fx[1].homeScore, fx[1].awayScore, fx[1].tipTime], [null, null, "17:15"]);
});

test("reads the match days a division has", () => {
  assert.deepEqual(parseCupDates('<option value="">x</option><option value="2026-10-16" >Fri</option><option value="2026-10-18" selected>Sun</option>'), ["2026-10-16", "2026-10-18"]);
});

test("a fixture finds its bracket game, even listed the other way round", () => {
  const fx = parseCupFixtures(DAY, "2026-10-16");
  assert.equal(findGameForFixture(games, fx[0])?.gameNo, 98);
  assert.equal(findGameForFixture(games, fx[1])?.gameNo, 104);
  assert.equal(findGameForFixture(games, { homeTeam: "Nobody FC", awayTeam: "Sheffield Sharks", gameDate: "2026-10-16" }), null);
  const swapped = findGameForFixture(games, { homeTeam: "Sheffield Sharks Senior Men", awayTeam: "Sheffield Arrows Senior Men I", gameDate: "2026-10-16" });
  assert.equal(swapped?.gameNo, 98);
});

test("a played fixture becomes the game's score, keeping the bracket's order", () => {
  const swapped = parseCupFixtures(DAY, "2026-10-16")[0];
  // Bracket has Arrows at home; the site lists Sharks first: scores follow the teams.
  const flipped = { ...swapped, homeTeam: "Sheffield Sharks Senior Men", awayTeam: "Sheffield Arrows Senior Men I", homeScore: 103, awayScore: 96 };
  const update = updateFromFixture(game(98), flipped);
  assert.equal(update.home_name, "Sheffield Arrows Senior Men I");
  assert.equal(update.home_score, 96);
  assert.equal(update.away_score, 103);
  assert.equal(update.game_date, "2026-10-16");
});

test("names read cleanly on a card", () => {
  assert.equal(displayTeamName("Sussex Storm Senior Men I"), "Sussex Storm");
  assert.equal(displayTeamName("London Lions Senior Men II"), "London Lions II");
  assert.equal(displayTeamName("Northamptonshire Titans Senior Men Moulton"), "Northamptonshire Titans Moulton");
  assert.equal(displayTeamName("Hackney Jedis Senior Men (Withdrawn)"), "Hackney Jedis");
  assert.equal(displayTeamName("Worthing Thunder & Bears Senior Men"), "Worthing Thunder & Bears");
});

test("dates read as a short day", () => {
  assert.equal(formatCupDate("2026-10-18"), "Sun 18 Oct");
  assert.equal(formatCupDate(null), "");
});

test("a fixture's crests follow the teams when the site lists them the other way round", () => {
  const fx = { ...parseCupFixtures(DAY, "2026-10-16")[0], homeTeam: "Sheffield Sharks Senior Men", awayTeam: "Sheffield Arrows Senior Men I", homeLogoUrl: "sharks.png", awayLogoUrl: "arrows.png" };
  const update = updateFromFixture(game(98), fx);
  assert.equal(update.home_logo_url, "arrows.png");
  assert.equal(update.away_logo_url, "sharks.png");
});

test("crests are found by team name from any saved fixture", () => {
  const withLogos = rows.map((r) => (r.game_no === 98 ? { ...r, home_name: "Sheffield Arrows Senior Men I", home_logo_url: "arrows.png" } : r));
  assert.equal(logoByTeam(withLogos).get(teamKey("Sheffield Arrows")), "arrows.png");
  assert.equal(upgradeCupLogo("https://x/h_64,w_64/v1/a.png"), "https://x/c_fit,h_128,w_128/v1/a.png");
  assert.equal(upgradeCupLogo(null), null);
});
