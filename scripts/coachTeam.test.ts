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
