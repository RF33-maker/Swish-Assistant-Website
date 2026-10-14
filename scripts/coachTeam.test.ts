// Run with: npx tsx --test scripts/coachTeam.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { findCoachTeam } from "../client/src/lib/coachTeam";

const t = (team_name: string, games_played = 3) => ({ team_name, games_played });

test("an exact name still matches", () => {
  const teams = [t("Valur"), t("Haukar")];
  assert.equal(findCoachTeam(teams, "Valur")?.team_name, "Valur");
});

test("the NBL's 'Senior Men' row finds its 'Senior Men I' stats (Gloucester City Kings)", () => {
  const teams = [t("Worcester Wolves Senior Men I"), t("Gloucester City Kings Senior Men I"), t("Leicester Warriors Senior Men")];
  assert.equal(findCoachTeam(teams, "Gloucester City Kings Senior Men")?.team_name, "Gloucester City Kings Senior Men I");
});

test("a plain BCB name finds the same club's NBL spelling and vice versa", () => {
  assert.equal(findCoachTeam([t("Gloucester City Kings Senior Men I")], "Gloucester City Kings")?.team_name, "Gloucester City Kings Senior Men I");
  assert.equal(findCoachTeam([t("Gloucester City Kings")], "Gloucester City Kings Senior Men")?.team_name, "Gloucester City Kings");
});

test("accents do not stop a match", () => {
  assert.equal(findCoachTeam([t("Tindastoll")], "Tindastóll")?.team_name, "Tindastoll");
});

test("reserve sides and women's sides stay separate", () => {
  const teams = [t("Bristol Flyers"), t("Bristol Flyers II")];
  assert.equal(findCoachTeam(teams, "Bristol Flyers II")?.team_name, "Bristol Flyers II");
  assert.equal(findCoachTeam([t("Bristol Flyers Senior Women I")], "Bristol Flyers Senior Men"), undefined);
  assert.equal(findCoachTeam([t("Bristol Flyers II")], "Bristol Flyers"), undefined);
});

test("two spellings of one club in a competition: the one with more games wins", () => {
  const teams = [t("Gloucester City Kings Senior Men I", 1), t("Gloucester City Kings Senior Men", 5)];
  assert.equal(findCoachTeam(teams, "Gloucester City Kings Senior Men II")?.team_name, undefined);
  assert.equal(findCoachTeam([t("Kings Senior Men I", 1), t("Kings Senior Men", 5)], "Kings Senior Men")?.team_name, "Kings Senior Men");
  assert.equal(findCoachTeam([t("Kings Senior Men I", 5), t("Kings Senior Men II", 9)], "Kings Senior Men")?.team_name, "Kings Senior Men I");
});

test("no team name, or no match, gives nothing", () => {
  assert.equal(findCoachTeam([t("Valur")], null), undefined);
  assert.equal(findCoachTeam([t("Valur")], ""), undefined);
  assert.equal(findCoachTeam([t("Valur")], "Haukar"), undefined);
});

import { isHomeFor, involvesTeam, nextFixtureFor, opponentIn } from "../client/src/lib/coachTeam";

// British Championship Basketball links one club's fixtures under two ids:
// its 2026-27 team row (NEW) and its 2025-26 one (OLD).
const NEW = "140705ba";
const OLD = "d9cda442";
const mk = (h: string, a: string, hid: string | null, aid: string | null) => ({ hometeam: h, awayteam: a, home_team_id: hid, away_team_id: aid });
const fixtures = [
  mk("Reading Rockets", "Milton Keynes Breakers", "rr", OLD),          // away, linked under the old id
  mk("Milton Keynes Breakers", "London Cavaliers", NEW, "lc"),          // home, linked under the new id
  mk("Bristol Hurricanes", "MK Breakers", "bh", null),                  // away, no id at all, feed spelling
];

test("a club linked under two ids has its fixtures found under either", () => {
  const team = { ids: [NEW], name: "Milton Keynes Breakers" };
  // all three: by id (NEW), by name, and by the club's known alias ("MK Breakers")
  assert.equal(fixtures.filter((g) => involvesTeam(g, team)).length, 3);
  assert.equal(nextFixtureFor(fixtures, team), fixtures[0], "the old-id fixture is found, not skipped");
});

test("the opponent is never the club itself, whichever id the fixture uses", () => {
  const team = { ids: [NEW], name: "Milton Keynes Breakers" };
  assert.equal(opponentIn(fixtures[0], team), "Reading Rockets");
  assert.equal(opponentIn(fixtures[1], team), "London Cavaliers");
  assert.equal(opponentIn(fixtures[2], team), "Bristol Hurricanes");
  for (const g of fixtures.filter((f) => involvesTeam(f, team))) {
    assert.ok(!/milton keynes|mk breakers/i.test(opponentIn(g, team)));
  }
});

test("home and away are right by id and by name", () => {
  const team = { ids: [NEW, OLD], name: "Milton Keynes Breakers" };
  assert.equal(isHomeFor(fixtures[0], team), false);
  assert.equal(isHomeFor(fixtures[1], team), true);
  assert.equal(isHomeFor(mk("Milton Keynes Breakers", "X", null, null), { ids: [], name: "Milton Keynes Breakers" }), true);
  assert.equal(isHomeFor(mk("X", "Milton Keynes Breakers", null, null), { ids: [], name: "Milton Keynes Breakers" }), false);
});

test("an NBL club's fixtures are found by identity when the ids do not match", () => {
  const team = { ids: ["acct-id"], name: "Gloucester City Kings Senior Men" };
  const list = [mk("Worcester Wolves Senior Men I", "Leicester Warriors Senior Men", "w", "l"), mk("Gloucester City Kings Senior Men I", "Birmingham City University Senior Men", "other-id", "b")];
  assert.equal(nextFixtureFor(list, team), list[1]);
  assert.equal(opponentIn(list[1], team), "Birmingham City University Senior Men");
});

test("no fixture for the club gives nothing", () => {
  assert.equal(nextFixtureFor([mk("A", "B", "a", "b")], { ids: ["z"], name: "Gloucester City Kings" }), undefined);
  assert.equal(nextFixtureFor([], { ids: ["z"], name: "x" }), undefined);
});
