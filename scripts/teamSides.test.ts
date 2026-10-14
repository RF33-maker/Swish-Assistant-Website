// Run with: npx tsx --test scripts/teamSides.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { sideName, feedName, teamClubKey, isSameTeam, clubSlug, clubDisplayName } from "../shared/teamIdentity";
import { buildLeagueSides } from "../shared/leagueSides";

test("a women's competition's plain team name gains Women", () => {
  assert.equal(sideName("London Lions", "Women"), "London Lions Women");
  assert.equal(sideName("Tindastóll", "women"), "Tindastóll Women");
  assert.equal(sideName("Bristol Flyers II", "Women"), "Bristol Flyers II Women");
});

test("names that already say Women, and non-women's competitions, are untouched", () => {
  assert.equal(sideName("Barking Abbey Senior Women", "Women"), "Barking Abbey Senior Women");
  assert.equal(sideName("Hull Women", "Women"), "Hull Women");
  assert.equal(sideName("London Lions", "Men"), "London Lions");
  assert.equal(sideName("London Lions", null), "London Lions");
  assert.equal(sideName("London Lions", undefined), "London Lions");
  assert.equal(sideName("", "Women"), "");
});

test("feedName undoes sideName", () => {
  assert.equal(feedName("London Lions Women"), "London Lions");
  assert.equal(feedName("London Lions"), "London Lions");
});

test("the men's and women's side of a club are different teams, with their own page", () => {
  const men = "Tindastoll";
  const women = sideName("Tindastóll", "Women");
  assert.equal(isSameTeam(men, women), false);
  assert.notEqual(teamClubKey(men), teamClubKey(women));
  assert.equal(clubSlug(women), "tindastoll-women");
  assert.equal(clubDisplayName(women), "Tindastóll Women");
  assert.equal(clubSlug(men), "tindastoll");
});

test("a women's side still matches itself across competitions", () => {
  assert.equal(isSameTeam(sideName("London Lions", "Women"), "London Lions Women"), true);
  assert.equal(isSameTeam(sideName("Cardiff Met Archers", "Women"), sideName("Cardiff Met Archers", "Women")), true);
});

test("the NBL's own women's names keep grouping with their plain-named sides", () => {
  assert.equal(isSameTeam("London Cavaliers Senior Women I", "London Cavaliers Senior Women"), true);
});

test("league sides read gender from the competition, then its parent", () => {
  const sides = buildLeagueSides([
    { league_id: "w", gender: "Women" },
    { league_id: "wchild", gender: null, parent_league_id: "w" },
    { league_id: "m", gender: "Men" },
    { league_id: "mchild", gender: null, parent_league_id: "m" },
    { league_id: "none" },
    { league_id: "loopA", parent_league_id: "loopB" },
    { league_id: "loopB", parent_league_id: "loopA" },
  ]);
  assert.equal(sides.name("London Lions", "w"), "London Lions Women");
  assert.equal(sides.name("London Lions", "wchild"), "London Lions Women");
  assert.equal(sides.name("London Lions", "m"), "London Lions");
  assert.equal(sides.name("London Lions", "mchild"), "London Lions");
  assert.equal(sides.name("London Lions", "none"), "London Lions");
  assert.equal(sides.name("London Lions", "missing"), "London Lions");
  assert.equal(sides.name("London Lions", null), "London Lions");
  assert.equal(sides.name("London Lions", "loopA"), "London Lions");
});
