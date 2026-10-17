// Run with: npx tsx --test scripts/gameTime.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { assessGameTime, instantToWallClock, roundToFiveMinutes, storedToInstant, wallClockToStored } from "../shared/gameTime";

const at = (iso: string) => new Date(iso);

test("a stored time is UK wall-clock: an hour earlier in UTC during BST, the same in winter", () => {
  assert.equal(storedToInstant("2026-10-17 19:30:00+00")?.toISOString(), "2026-10-17T18:30:00.000Z");
  assert.equal(storedToInstant("2026-12-12T19:30:00+00:00")?.toISOString(), "2026-12-12T19:30:00.000Z");
  assert.equal(storedToInstant("nonsense"), null);
});

test("instants turn back into the wall-clock string the schedule stores", () => {
  assert.equal(instantToWallClock(at("2026-10-17T18:30:00Z")), "2026-10-17T19:30");
  assert.equal(instantToWallClock(at("2026-12-12T19:30:00Z")), "2026-12-12T19:30");
  assert.equal(instantToWallClock(storedToInstant("2026-10-17 19:30:00+00")!), "2026-10-17T19:30");
});

test("entries are checked and stored as wall-clock labelled +00", () => {
  assert.equal(wallClockToStored("2026-10-17T19:30"), "2026-10-17T19:30:00+00:00");
  for (const bad of ["", "2026-10-17", "2026-10-17 19:30", "2026-13-01T10:00", "2026-02-30T10:00", "2026-10-17T24:00", "1999-01-01T10:00", null, 5]) {
    assert.equal(wallClockToStored(bad), null, String(bad));
  }
});

test("rounds to the nearest five minutes", () => {
  assert.equal(roundToFiveMinutes(at("2026-10-17T18:33:36Z")).toISOString(), "2026-10-17T18:35:00.000Z");
  assert.equal(roundToFiveMinutes(at("2026-10-17T18:32:00Z")).toISOString(), "2026-10-17T18:30:00.000Z");
});

test("a game that started when the sheet said it would is not flagged, BST offset included", () => {
  // London Cavaliers v Loughborough: listed 19:30 (BST), feed first showed Q1 at 18:33 UTC.
  const f = assessGameTime({ status: "final", matchtime: "2026-10-17 19:30:00+00", observedStart: "2026-10-17T18:33:36Z", captureSpanMinutes: 100 }, at("2026-10-17T21:00:00Z"));
  assert.equal(f, null);
});

test("a game that was played far from its listed time is flagged, with the feed's time as the suggestion", () => {
  // Worthing v Nottingham: listed 18 Oct 15:00, actually played 17 Oct evening.
  const f = assessGameTime({ status: "final", matchtime: "2026-10-18 15:00:00+00", observedStart: "2026-10-17T18:41:24Z", captureSpanMinutes: 70 }, at("2026-10-17T21:00:00Z"));
  assert.equal(f?.kind, "start_mismatch");
  assert.equal(f?.suggested, "2026-10-17T19:40");
  assert.match(f!.reason, /before its listed time/);
});

test("a started-late game within the allowance is left alone", () => {
  const f = assessGameTime({ status: "final", matchtime: "2026-10-17 15:00:00+00", observedStart: "2026-10-17T14:35:00Z", captureSpanMinutes: 90 }, at("2026-10-17T20:00:00Z"));
  assert.equal(f, null);
});

test("a back-filled game's timestamps are not treated as when it started", () => {
  const f = assessGameTime({ status: "final", matchtime: "2026-10-10 15:00:00+00", observedStart: "2026-10-12T09:00:00Z", captureSpanMinutes: 0 }, at("2026-10-17T20:00:00Z"));
  assert.equal(f, null);
});

test("a played game dated in the future is flagged even without a live capture", () => {
  const f = assessGameTime({ status: "final", matchtime: "2026-10-18 15:00:00+00" }, at("2026-10-17T21:00:00Z"));
  assert.equal(f?.kind, "future_dated");
  assert.equal(f?.suggested, null);
});

test("a live game whose feed has gone quiet is flagged as stuck", () => {
  // London Elite v London Stars: listed 18:15, feed stopped in Q1 at 17:50 UTC.
  const game = { status: "live", matchtime: "2026-10-17 18:15:00+00", lastFeedActivity: "2026-10-17T17:50:00Z" };
  assert.equal(assessGameTime(game, at("2026-10-17T20:40:00Z"))?.kind, "stuck_live");
  // Mid-game, with a period event a little while ago, it is simply live.
  assert.equal(assessGameTime({ ...game, lastFeedActivity: "2026-10-17T18:30:00Z" }, at("2026-10-17T19:20:00Z")), null);
});

test("a live game with no feed data at all is only flagged once it is far past tip-off", () => {
  const game = { status: "live", matchtime: "2026-10-17 18:15:00+00" };
  assert.equal(assessGameTime(game, at("2026-10-17T20:40:00Z")), null);
  assert.equal(assessGameTime(game, at("2026-10-18T00:30:00Z"))?.kind, "stuck_live");
});

test("a game still scheduled hours after tip-off is flagged as never started", () => {
  // Oaklands v Richmond: listed 19:00 (18:00 UTC), nothing in the feed.
  const f = assessGameTime({ status: "scheduled", matchtime: "2026-10-17 19:00:00+00" }, at("2026-10-17T21:30:00Z"));
  assert.equal(f?.kind, "never_started");
  assert.equal(assessGameTime({ status: "scheduled", matchtime: "2026-10-17 19:00:00+00" }, at("2026-10-17T19:30:00Z")), null);
});

test("upcoming games and ordinary finished games are not flagged", () => {
  assert.equal(assessGameTime({ status: "scheduled", matchtime: "2026-10-18 15:15:00+00" }, at("2026-10-17T21:00:00Z")), null);
  assert.equal(assessGameTime({ status: "final", matchtime: "2026-10-17 15:00:00+00" }, at("2026-10-17T21:00:00Z")), null);
});
