// Run with: npx tsx --test scripts/clubLeagues.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { clubLeagueIds, clubSearchCore } from "../shared/clubLeagues";
import { buildLeagueSides } from "../shared/leagueSides";

const sides = buildLeagueSides([
  { league_id: "nbl", gender: "Men" },
  { league_id: "bcb" },
  { league_id: "cup" },
  { league_id: "slbw", gender: "Women" },
]);
const row = (name: string, league_id: string) => ({ name, league_id });

test("a club's competitions are found whatever each feed calls it", () => {
  const rows = [
    row("Gloucester City Kings", "bcb"),
    row("Gloucester City KIngs", "cup"),
    row("Gloucester City Kings Senior Men", "nbl"),
    row("Gloucester City Kings II", "other"),
  ];
  assert.deepEqual(clubLeagueIds(rows, "Gloucester City Kings", "bcb", sides).sort(), ["bcb", "cup", "nbl"]);
  assert.deepEqual(clubLeagueIds(rows, "Gloucester City Kings Senior Men", "nbl", sides).sort(), ["bcb", "cup", "nbl"]);
});

test("the women's side of a name is not the men's club", () => {
  const rows = [row("London Lions", "bcb"), row("London Lions", "slbw")];
  assert.deepEqual(clubLeagueIds(rows, "London Lions", "slbw", sides), ["slbw"]);
  assert.deepEqual(clubLeagueIds(rows, "London Lions", "bcb", sides), ["bcb"]);
});

test("the home competition is always included", () => {
  assert.deepEqual(clubLeagueIds([], "Valur", "bcb", sides), ["bcb"]);
});

test("search core drops the feed suffixes", () => {
  assert.equal(clubSearchCore("Gloucester City Kings Senior Men I"), "Gloucester City Kings");
  assert.equal(clubSearchCore("London Lions Women"), "London Lions");
});
