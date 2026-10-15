// Run with: npx tsx --test scripts/season.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { seasonStart, seasonLabel } from "../shared/season";
import { aggregatePlayers, buildScoutRoster, type BoxScoreRow } from "../shared/scoutRoster";
import { playerNameKey, bestPlayerName } from "../shared/playerNameKey";

test("the season turns over on 1 September", () => {
  assert.equal(seasonStart(new Date("2026-10-15T12:00:00Z")).toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(seasonStart(new Date("2026-09-01T00:00:00Z")).toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(seasonStart(new Date("2026-08-31T23:59:00Z")).toISOString(), "2025-09-01T00:00:00.000Z");
  assert.equal(seasonStart(new Date("2027-03-02T12:00:00Z")).toISOString(), "2026-09-01T00:00:00.000Z");
});

test("the season label", () => {
  assert.equal(seasonLabel(new Date("2026-10-15T12:00:00Z")), "2026/27");
  assert.equal(seasonLabel(new Date("2027-04-01T12:00:00Z")), "2026/27");
  assert.equal(seasonLabel(new Date("2099-10-01T00:00:00Z")), "2099/00");
});

const row = (league: string, game: string, id: string, name: string, team: string, pts: number, extra: Partial<BoxScoreRow> = {}): BoxScoreRow => ({
  league_id: league, game_key: game, player_id: id, full_name: name, team_name: team, sminutes: "30:00", spoints: pts,
  sreboundstotal: 5, sassists: 3, sfieldgoalsmade: 5, sfieldgoalsattempted: 12, ...extra,
});

// The same club and player in two competitions, with different player ids and spellings.
const rows: BoxScoreRow[] = [
  row("league", "g1", "p-league", "D. Crnac", "Milton Keynes Breakers", 10),
  row("trophy", "g2", "p-trophy", "Dzana Crnac", "Milton Keynes Breakers", 20),
  row("trophy", "g3", "p-trophy", "Dzana Crnac", "Milton Keynes Breakers", 30),
  row("trophy", "g4", "p-other", "Another Player", "Bristol Flyers", 8),
];
const opts = {
  personKey: (r: BoxScoreRow) => `${r.team_name}|${playerNameKey(r.full_name)}`,
  displayName: bestPlayerName,
};

test("one player in two competitions becomes one person with all their games", () => {
  const out = aggregatePlayers(rows, opts);
  const crnac = Array.from(out.values()).find((p) => p.name.includes("Crnac"))!;
  assert.equal(crnac.gp, 3, "1 league game + 2 trophy games");
  assert.equal(crnac.t.spoints, 60);
  assert.deepEqual(crnac.playerIds.sort(), ["p-league", "p-trophy"]);
  assert.equal(crnac.name, "Dzana Crnac", "the fuller spelling is shown");
});

test("without a personKey the competitions stay separate, as before", () => {
  const out = aggregatePlayers(rows);
  const crnacs = Array.from(out.values()).filter((p) => p.name.includes("Crnac"));
  assert.equal(crnacs.length, 2);
  assert.deepEqual(crnacs.map((p) => p.gp).sort(), [1, 2]);
});

test("a player with 1 game in each of two competitions qualifies once the season's games are joined", () => {
  const split = [
    row("league", "g1", "p-league", "D. Crnac", "Milton Keynes Breakers", 10),
    row("trophy", "g2", "p-trophy", "Dzana Crnac", "Milton Keynes Breakers", 20),
    row("trophy", "g4", "p-other", "Another Player", "Bristol Flyers", 8),
  ];
  const separate = buildScoutRoster(split, (c) => c === "Milton Keynes Breakers");
  assert.equal(separate.profiles.length, 0, "1 game in each competition is not enough on its own");
  assert.equal(separate.roster.length, 2, "and they show as two players");
  const joined = buildScoutRoster(split, (c) => c === "Milton Keynes Breakers", opts);
  assert.equal(joined.roster.length, 1);
  assert.equal(joined.profiles.length, 1, "joined, they have 2 games and get a profile");
  assert.equal(joined.roster[0].gp, 2);
  assert.equal(joined.roster[0].playerIds.length, 2);
});

test("the pool can be limited to the clubs of one league", () => {
  const clubs = new Set(["Milton Keynes Breakers"]);
  const out = buildScoutRoster(rows, (c) => c === "Milton Keynes Breakers", { ...opts, inPool: (c) => clubs.has(c) });
  assert.equal(out.poolSize, 1);
});

import { pickGames } from "../supabase/functions/scout-agent/load";

const played = (...d: string[]) => d.map((played_at) => ({ played_at }));

test("scouting takes every game this season across competitions, newest first, up to the cap", () => {
  const games = played("2026-10-10", "2026-10-01", "2026-09-20", "2026-09-05", "2026-04-01");
  assert.deepEqual(pickGames(games, new Date("2026-10-15"), 20, 4).map((g) => g.played_at), ["2026-10-10", "2026-10-01", "2026-09-20", "2026-09-05"]);
  assert.equal(pickGames(games, new Date("2026-10-15"), 2, 1).length, 2);
});

test("a thin season is padded with the newest older games, and no more than needed", () => {
  const games = played("2026-10-10", "2026-04-01", "2026-03-01", "2026-02-01");
  assert.deepEqual(pickGames(games, new Date("2026-10-15"), 20, 3).map((g) => g.played_at), ["2026-10-10", "2026-04-01", "2026-03-01"]);
});
