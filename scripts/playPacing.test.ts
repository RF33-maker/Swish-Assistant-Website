// Run with: npx tsx --test scripts/playPacing.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_REVEAL, PACE, clockSeconds, ingest, revealGapMs, revealNext, type RevealState } from "../client/src/lib/playPacing";

const empty = EMPTY_REVEAL as RevealState<number>;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const seeded = (ids: number[]) => ingest(empty, ids, true);
const at = (clock: string, period = 1) => ({ period, clock });

test("clockSeconds reads the feed's clock", () => {
  assert.equal(clockSeconds("07:43:00"), 463);
  assert.equal(clockSeconds("00:05:10"), 5);
  assert.equal(clockSeconds(null), 0);
});

test("the first list shows at once", () => {
  const s = seeded(range(1, 300));
  assert.equal(s.shown.size, 300);
  assert.deepEqual(s.queue, []);
});

test("new plays queue oldest first and stay hidden", () => {
  const s = ingest(seeded(range(1, 10)), range(1, 13), true);
  assert.deepEqual(s.queue, [11, 12, 13]);
  assert.equal(s.shown.has(11), false);
});

test("plays come out one at a time, in order", () => {
  let s = ingest(seeded(range(1, 10)), range(1, 12), true);
  s = revealNext(s);
  assert.equal(s.shown.has(11), true);
  assert.equal(s.shown.has(12), false);
  assert.deepEqual(s.queue, [12]);
});

test("a later burst joins the back of the queue", () => {
  let s = ingest(seeded(range(1, 10)), range(1, 12), true);
  s = ingest(s, range(1, 14), true);
  assert.deepEqual(s.queue, [11, 12, 13, 14]);
});

test("nothing new returns the same state, so nothing re-renders", () => {
  const s = ingest(seeded(range(1, 10)), range(1, 12), true);
  assert.equal(ingest(s, range(1, 12), true), s);
  const settled = seeded(range(1, 10));
  assert.equal(ingest(settled, range(1, 10), false), settled);
  assert.equal(ingest(empty, [], true), empty);
});

test("a queued play the scorer removes is dropped", () => {
  const s = ingest(seeded(range(1, 10)), range(1, 12), true);
  assert.deepEqual(ingest(s, [...range(1, 10), 12], true).queue, [12]);
});

test("a big backlog catches up and flows only the newest few", () => {
  const s = ingest(seeded(range(1, 10)), range(1, 111), true);
  assert.equal(s.queue.length, PACE.keepWhenCatchingUp);
  assert.equal(s.queue[0], 104);
  assert.equal(s.shown.has(103), true);
});

test("a full queue is still paced, one over it catches up", () => {
  assert.equal(ingest(seeded(range(1, 10)), range(1, 10 + PACE.maxQueue), true).queue.length, PACE.maxQueue);
  assert.equal(ingest(seeded(range(1, 10)), range(1, 11 + PACE.maxQueue), true).queue.length, PACE.keepWhenCatchingUp);
});

test("unpaced shows everything, including what was queued", () => {
  const s = ingest(seeded(range(1, 10)), range(1, 12), true);
  const flushed = ingest(s, range(1, 13), false);
  assert.deepEqual(flushed.queue, []);
  assert.equal(flushed.shown.size, 13);
});

test("emptying the list starts over, so the next game loads at once", () => {
  const cleared = ingest(seeded(range(1, 10)), [], true);
  assert.equal(cleared.seeded, false);
  assert.deepEqual(ingest(cleared, range(50, 90), true).queue, []);
});

test("the first play of a burst isn't held", () => {
  assert.equal(revealGapMs(null, at("07:00:00"), 3), PACE.firstGapMs);
});

test("gaps follow the game clock", () => {
  assert.equal(revealGapMs(at("07:40:00"), at("07:38:00"), 3), 2_000);
});

test("no gap on the clock still leaves time to read", () => {
  assert.equal(revealGapMs(at("07:40:00"), at("07:40:00"), 3), PACE.floorMs);
});

test("a long gap on the clock is capped", () => {
  assert.equal(revealGapMs(at("07:40:00"), at("07:10:00"), 1), PACE.maxGapMs);
});

test("a long queue tightens the pace", () => {
  assert.equal(revealGapMs(at("07:40:00"), at("07:40:00"), 20), 600);
  assert.equal(revealGapMs(at("07:40:00"), at("07:10:00"), 20), 900);
});

test("a new period falls back to the even pace", () => {
  assert.equal(revealGapMs(at("00:00:00", 1), at("10:00:00", 2), 4), 3_000);
});

// Plays a burst through the gaps the hook would wait, and returns the total.
const runBurst = (burst: ReturnType<typeof at>[]) => {
  let elapsed = revealGapMs(null, burst[0], burst.length);
  for (let i = 1; i < burst.length; i++) {
    elapsed += revealGapMs(burst[i - 1], burst[i], burst.length - i, PACE.windowMs - elapsed);
  }
  return elapsed;
};

test("a typical burst clears well before the next one lands", () => {
  // Miss, rebound, then the next possession's shot: the worker's median burst.
  const took = runBurst([at("07:40:00"), at("07:38:00"), at("07:24:00")]);
  assert.ok(took < 8_000, `took ${took}ms`);
});

test("the biggest paced burst still clears before the next one lands", () => {
  const seconds = (s: number) => `0${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}:00`;
  const burst = range(0, PACE.maxQueue - 1).map((i) => at(seconds(500 - i * 8)));
  const took = runBurst(burst);
  assert.ok(took < 15_000, `took ${took}ms`);
});

test("out of time, plays still come one at a time", () => {
  assert.equal(revealGapMs(at("07:40:00"), at("07:40:00"), 5, 0), PACE.minGapMs);
  assert.equal(revealGapMs(at("07:40:00"), at("07:10:00"), 5, -2_000), PACE.minGapMs);
});
