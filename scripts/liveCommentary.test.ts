// Run with: npx tsx --test scripts/liveCommentary.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildCommentary, shotDistanceFt, clockSeconds, type CommentaryEvent } from "../client/src/lib/liveCommentary";

let n = 0;
const ev = (o: Partial<CommentaryEvent>): CommentaryEvent => ({
  action_number: ++n, period: 4, clock: "00:30:00", team_no: 1, player_name: "R. Farrell", player_id: "p1",
  action_type: "3pt", sub_type: "jumpshot", success: true, scoring: true, score: "60-58", ...o,
});
const base = { homeTeam: "Gloucester City Kings Senior Men I", awayTeam: "Bath Basketball Senior Men" };

test("a late three that takes the lead reads as the go-ahead moment", () => {
  n = 0;
  const events = [
    ev({ clock: "05:00:00", score: "57-58", team_no: 2, player_id: "p2", player_name: "A. Other" }),
    ev({ clock: "00:30:00", score: "60-58" }),
  ];
  const items = buildCommentary({ ...base, events, shots: [{ action_number: 2, x: 30, y: 50 }], playerNames: { p1: "Rhys Farrell" } });
  const last = items[items.length - 1];
  assert.equal(last.kind, "go-ahead");
  assert.match(last.text, /Rhys Farrell/);
  assert.match(last.text, /put Gloucester City Kings up 2/);
  assert.match(last.text, /30 seconds to go/);
  assert.ok(last.importance >= 70);
});

test("an assist on the next row is credited on the basket", () => {
  n = 0;
  const events = [
    ev({ period: 2, clock: "05:00:00", action_type: "2pt", sub_type: "layup", score: "10-8" }),
    ev({ period: 2, clock: "05:00:00", action_type: "assist", sub_type: "", scoring: false, player_id: "p3", player_name: "J. Passer" }),
  ];
  const items = buildCommentary({ ...base, events });
  assert.match(items[0].text, /J\. Passer with the assist/);
});

test("season high is only claimed after enough earlier games and by passing the old best", () => {
  n = 0;
  const mk = (score: string) => ev({ period: 2, clock: "05:00:00", action_type: "2pt", sub_type: "layup", score });
  const events = Array.from({ length: 6 }, (_, i) => mk(`${(i + 1) * 2}-0`));
  const few = buildCommentary({ ...base, events, seasonBests: { p1: { games: 2, points: 8, threes: 0, rebounds: 0, assists: 0 } } });
  assert.ok(!few.some((i) => i.kind === "season-high"));
  const enough = buildCommentary({ ...base, events, seasonBests: { p1: { games: 5, points: 8, threes: 0, rebounds: 0, assists: 0 } } });
  const highs = enough.filter((i) => i.kind === "season-high");
  assert.equal(highs.length, 1); // announced once, as they pass it at 10 points
  assert.match(highs[0].text, /season high/);
  const notBeaten = buildCommentary({ ...base, events, seasonBests: { p1: { games: 5, points: 14, threes: 0, rebounds: 0, assists: 0 } } });
  assert.ok(!notBeaten.some((i) => i.kind === "season-high"));
});

test("same input gives the same lines", () => {
  n = 0;
  const events = [ev({}), ev({ clock: "00:10:00", score: "63-58" })];
  assert.deepEqual(buildCommentary({ ...base, events }), buildCommentary({ ...base, events }));
});

test("helpers", () => {
  assert.equal(clockSeconds("09:53:00"), 593);
  assert.ok(shotDistanceFt(32, 50) > 22); // a top-of-the-key three is beyond the arc
  assert.ok(shotDistanceFt(8, 50) < 4);   // at the rim
});
