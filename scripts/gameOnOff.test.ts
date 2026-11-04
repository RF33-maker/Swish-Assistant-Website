import test from "node:test";
import assert from "node:assert/strict";
import {
  boxPlusMinusAddsUp,
  boxSeconds,
  gameLogOnOff,
  stintsForTeam,
  swingCallouts,
  teamGameOnOff,
  type OnOffBoxPlayer,
  type OnOffStint,
} from "../client/src/lib/gameOnOff";

// Manchester v Cardiff Met, 1 Nov 2026: Manchester won 85-68 (by 17), box +/- sums to 85.
const MANCHESTER: OnOffBoxPlayer[] = [
  { key: "pirttinen", playerId: "p1", seconds: boxSeconds("31:48"), plusMinus: 17 },
  { key: "bratka", playerId: "p2", seconds: boxSeconds("31:27"), plusMinus: 21 },
  { key: "lau", playerId: "p3", seconds: boxSeconds("28:01"), plusMinus: 12 },
  { key: "karasaite", playerId: "p4", seconds: boxSeconds("21:03"), plusMinus: 14 },
  { key: "robb", playerId: "p5", seconds: boxSeconds("19:52"), plusMinus: 9 },
  { key: "mastellone", playerId: "p6", seconds: boxSeconds("19:22"), plusMinus: 5 },
  { key: "odonnell", playerId: "p7", seconds: boxSeconds("16:32"), plusMinus: 2 },
  { key: "brierley", playerId: "p8", seconds: boxSeconds("14:44"), plusMinus: 8 },
  { key: "price", playerId: "p9", seconds: boxSeconds("12:10"), plusMinus: -4 },
  { key: "odemwingie", playerId: "p10", seconds: boxSeconds("5:01"), plusMinus: 1 },
  { key: "dnp", playerId: "p11", seconds: 0, plusMinus: 0 },
];

test("boxSeconds reads MM:SS and plain minutes", () => {
  assert.equal(boxSeconds("31:48"), 1908);
  assert.equal(boxSeconds("12.5"), 750);
  assert.equal(boxSeconds(10), 600);
  assert.equal(boxSeconds(null), 0);
  assert.equal(boxSeconds(""), 0);
});

test("box +/- must sum to five times the margin", () => {
  assert.equal(boxPlusMinusAddsUp(MANCHESTER.map((p) => p.plusMinus), 17), true);
  assert.equal(boxPlusMinusAddsUp(MANCHESTER.map((p) => p.plusMinus), 16), false);
  // A column of zeros was never recorded, even for a tied margin.
  assert.equal(boxPlusMinusAddsUp([0, 0, 0, null], 0), false);
});

test("off is the margin minus the player's +/-", () => {
  const result = teamGameOnOff({ teamPoints: 85, oppPoints: 68, players: MANCHESTER });
  assert.equal(result.addsUp, true);
  assert.equal(result.stintsUsable, false);
  const price = result.players.find((p) => p.key === "price")!;
  assert.deepEqual([price.on, price.off, price.swing], [-4, 21, -25]);
  const bratka = result.players.find((p) => p.key === "bratka")!;
  assert.deepEqual([bratka.on, bratka.off, bratka.swing], [21, -4, 25]);
  assert.equal(bratka.ratings, null);
  // Players who never got on are left out; the rest run by minutes.
  assert.equal(result.players.some((p) => p.key === "dnp"), false);
  assert.equal(result.players[0].key, "pirttinen");
});

test("nothing is shown when the +/- doesn't add up", () => {
  const broken = MANCHESTER.map((p) => (p.key === "lau" ? { ...p, plusMinus: 13 } : p));
  const result = teamGameOnOff({ teamPoints: 85, oppPoints: 68, players: broken });
  assert.equal(result.addsUp, false);
  assert.deepEqual(result.players, []);
});

// A 40-minute game in two stints per lineup: A on for the first 20 minutes, B for the last 20.
const five = (ids: string[]) => ids;
function stint(ids: string[], secs: number, pf: number, pa: number, possF: number, possA: number): OnOffStint {
  return { team_id: "home", lineup_player_ids: ids, seconds_played: secs, points_for: pf, points_against: pa, possessions_for: possF, possessions_against: possA };
}
const SMALL: OnOffBoxPlayer[] = [
  { key: "a", playerId: "a", seconds: 2400, plusMinus: 10 },
  { key: "b", playerId: "b", seconds: 2400, plusMinus: 10 },
  { key: "c", playerId: "c", seconds: 2400, plusMinus: 10 },
  { key: "d", playerId: "d", seconds: 2400, plusMinus: 10 },
  { key: "s1", playerId: "s1", seconds: 1200, plusMinus: 10 },
  { key: "s2", playerId: "s2", seconds: 1200, plusMinus: 0 },
];

test("ratings come from the stints when they cover the game", () => {
  const stints = [
    stint(five(["a", "b", "c", "d", "s1"]), 1200, 40, 30, 40, 40),
    stint(five(["a", "b", "c", "d", "s2"]), 1200, 30, 30, 40, 40),
  ];
  const result = teamGameOnOff({ teamPoints: 70, oppPoints: 60, players: SMALL, stints });
  assert.equal(result.stintsUsable, true);
  const s1 = result.players.find((p) => p.key === "s1")!;
  assert.ok(s1.ratings);
  assert.equal(s1.ratings.onOrtg, 100);
  assert.equal(s1.ratings.onDrtg, 75);
  assert.equal(s1.ratings.offNet, 0);
  assert.equal(s1.ratings.netSwing, 25);
  assert.equal(s1.offSeconds, 1200);
  // Ever-present players have no off sample.
  assert.equal(result.players.find((p) => p.key === "a")!.ratings, null);
});

test("ratings need 15 possessions on and off", () => {
  const stints = [
    stint(five(["a", "b", "c", "d", "s1"]), 2100, 60, 52, 70, 70),
    stint(five(["a", "b", "c", "d", "s2"]), 300, 10, 8, 14, 14),
  ];
  const players = SMALL.map((p) => (p.key === "s1" ? { ...p, seconds: 2100, plusMinus: 8 } : p.key === "s2" ? { ...p, seconds: 300, plusMinus: 2 } : p));
  const result = teamGameOnOff({ teamPoints: 70, oppPoints: 60, players, stints });
  assert.equal(result.stintsUsable, true);
  assert.equal(result.players.find((p) => p.key === "s2")!.ratings, null);
  assert.equal(result.players.find((p) => p.key === "s1")!.ratings, null);
});

test("stints that miss time or points are not used", () => {
  const short = [stint(five(["a", "b", "c", "d", "s1"]), 1200, 40, 30, 40, 40)];
  assert.equal(teamGameOnOff({ teamPoints: 70, oppPoints: 60, players: SMALL, stints: short }).stintsUsable, false);
  const wrongPoints = [
    stint(five(["a", "b", "c", "d", "s1"]), 1200, 44, 30, 40, 40),
    stint(five(["a", "b", "c", "d", "s2"]), 1200, 30, 30, 40, 40),
  ];
  assert.equal(teamGameOnOff({ teamPoints: 70, oppPoints: 60, players: SMALL, stints: wrongPoints }).stintsUsable, false);
});

test("stints are matched by team id, or by player ids when the team ids differ", () => {
  const stints: OnOffStint[] = [
    { ...stint(["a"], 10, 0, 0, 0, 0), team_id: "home" },
    { ...stint(["x"], 10, 0, 0, 0, 0), team_id: "away" },
  ];
  assert.equal(stintsForTeam(stints, ["home"], []).length, 1);
  assert.equal(stintsForTeam(stints, ["other-id"], ["x"])[0].team_id, "away");
  assert.deepEqual(stintsForTeam(stints, ["other-id"], ["nobody"]), []);
});

test("callouts pick the best and worst swing with real time on and off", () => {
  const result = teamGameOnOff({ teamPoints: 85, oppPoints: 68, players: MANCHESTER });
  const callouts = swingCallouts(result.players)!;
  assert.equal(callouts.best.key, "bratka");
  assert.equal(callouts.worst.key, "price");
  // Under five minutes on court doesn't count.
  assert.equal(result.players.some((p) => p.key === "odemwingie"), true);
  assert.notEqual(callouts.worst.key, "odemwingie");
});

test("game log on/off uses the whole game's box rows", () => {
  const rows = [
    ...MANCHESTER.map((p, i) => ({ id: p.key, game_key: "g", team_id: "man", spoints: i === 0 ? 85 : 0, splusminuspoints: p.plusMinus })),
    { id: "opp1", game_key: "g", team_id: "car", spoints: 68, splusminuspoints: -85 },
  ];
  assert.deepEqual(gameLogOnOff("price", rows), { on: -4, off: 21, swing: -25 });
  // A third team id (a split team) means the game can't be read.
  assert.equal(gameLogOnOff("price", [...rows, { id: "x", game_key: "g", team_id: "man-2", spoints: 0, splusminuspoints: 0 }]), null);
  assert.equal(gameLogOnOff("missing", rows), null);
});

test("a tied swing goes to the player with more minutes", () => {
  const players = [
    { key: "long", seconds: 1800, offSeconds: 600, on: -14, off: 6, swing: -20, ratings: null },
    { key: "short", seconds: 1500, offSeconds: 900, on: -14, off: 6, swing: -20, ratings: null },
    { key: "good", seconds: 1200, offSeconds: 1200, on: 7, off: -15, swing: 22, ratings: null },
  ];
  assert.equal(swingCallouts(players)!.worst.key, "long");
});
