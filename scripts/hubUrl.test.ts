// Run with: npx tsx --test scripts/hubUrl.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildHubSearch, readHubUrl, type HubUrlState } from "../client/src/lib/hubUrl";

const roundTrip = (state: HubUrlState) => readHubUrl(buildHubSearch(state));

test("a bare visit has nothing to read", () => {
  assert.equal(readHubUrl(""), null);
  assert.equal(readHubUrl("?report=abc123"), null);
});

test("league and tab survive a round trip", () => {
  assert.deepEqual(roundTrip({ league: "L1", tab: "scouting" }), { league: "L1", tab: "scouting" });
});

test("the overview tab is left out of the URL", () => {
  assert.equal(buildHubSearch({ league: "L1", tab: "overview" }), "?league=L1");
});

test("an unknown tab is ignored", () => {
  assert.deepEqual(readHubUrl("?league=L1&tab=nonsense"), { league: "L1" });
});

test("each report view survives a round trip", () => {
  const views: HubUrlState[] = [
    { league: "L1", tab: "rankings", view: { type: "player", teamId: "t9", name: "Sam O'Neil & Co" } },
    { league: "L1", view: { type: "team", teamId: "t9" } },
    { league: "L1", tab: "overview", view: { type: "matchReport", gameKey: "2026-10-18|Riders|Lions" } },
    { league: "L1", tab: "scouting", view: { type: "scoutReport", opponentName: "London Lions", forTeamName: "Leicester Riders" } },
    { league: "L1", tab: "scouting", view: { type: "scoutReport", opponentName: "London Lions" } },
  ];
  for (const state of views) {
    const expected = { ...state };
    if (expected.tab === "overview") delete expected.tab;
    assert.deepEqual(roundTrip(state), expected);
  }
});

test("a view missing its id is ignored", () => {
  assert.deepEqual(readHubUrl("?league=L1&view=player&team=t9"), { league: "L1" });
  assert.deepEqual(readHubUrl("?league=L1&view=scout"), { league: "L1" });
});

test("keys the hub doesn't own are kept, and old hub keys are replaced", () => {
  const out = buildHubSearch({ league: "L2", tab: "trends" }, "?report=abc123&league=L1&view=team&team=t9");
  const params = new URLSearchParams(out);
  assert.equal(params.get("report"), "abc123");
  assert.equal(params.get("league"), "L2");
  assert.equal(params.get("tab"), "trends");
  assert.equal(params.get("view"), null);
  assert.equal(params.get("team"), null);
});
