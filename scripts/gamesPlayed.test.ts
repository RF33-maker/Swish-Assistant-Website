// Run with: npx tsx --test scripts/gamesPlayed.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseMinutesPlayed, playedInGame } from "../client/src/lib/gamesPlayed";

test("minutes read from a clock, a number, or nothing", () => {
  assert.equal(parseMinutesPlayed({ sminutes: "12:30" }), 12.5);
  assert.equal(parseMinutesPlayed({ sminutes: 18 }), 18);
  assert.equal(parseMinutesPlayed({ minutes_played: "9.5" }), 9.5);
  assert.equal(parseMinutesPlayed({ sminutes: null }), 0);
});

test("a player who sat the whole game has not played", () => {
  assert.equal(playedInGame({ sminutes: "0:00", spoints: 0, sreboundstotal: 0 }), false);
  assert.equal(playedInGame({ sminutes: null }), false);
});

test("under a minute on the floor still counts", () => {
  assert.equal(playedInGame({ sminutes: "0:18", spoints: 0 }), true);
});

test("real stats count when the clock came through as 0:00", () => {
  assert.equal(playedInGame({ sminutes: "0:00", spoints: 12, sfieldgoalsattempted: 6 }), true);
  assert.equal(playedInGame({ sminutes: "0:00", sfoulspersonal: 1 }), true);
});
