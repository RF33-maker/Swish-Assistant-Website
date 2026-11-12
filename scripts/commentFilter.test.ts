/**
 * Checks for the Feed comment filter: disguised words are caught, ordinary
 * basketball talk (scores, place names, surnames) is not.
 * Run: npx tsx scripts/commentFilter.test.ts
 */
import assert from "node:assert/strict";
import { filterComment, isPlayerPost, normaliseForFilter } from "../shared/commentFilter";

// Stand-in terms; the real list lives in the database.
const TERMS = ["shit", "idiot", "loser"];
const blocked = (t: string) => !filterComment(t, TERMS).ok;

const cases: Array<[string, boolean]> = [
  ["What a game, Storm look unstoppable", false],
  ["Won 102-94 86-83 93-88 101-93, that run is mad", false],
  ["Scunthorpe lads were class tonight", false],
  ["He can't buy a three right now", false],
  ["Shit performance from the refs", true],
  ["sh1t", true],
  ["shit!", true],
  ["sh!t", true],
  ["lost 3 in a row, 7 to go", false],
  ["s h i t", true],
  ["s.h.i.t", true],
  ["shiiiiit", true],
  ["what an IDIOT", true],
  ["id10t", true],
  ["total l0s3r", true],
  ["closer to the playoffs", false],
  ["check www.example.com", true],
  ["follow me at bit.ly/abc", true],
  ["email me jo@example.com", true],
  ["call 07700 900123", true],
  ["+44 7700 900 123", true],
];
for (const [text, expect] of cases) assert.equal(blocked(text), expect, `${expect ? "should block" : "should allow"}: ${text}`);

assert.equal(normaliseForFilter("Ça VA, s.h.i.t!"), "ca va shit");

// A double letter in a term must stay double, so a term like "coot" can't
// catch "cot" or a surname like "Cotter" (the real list had "coon" vs "con").
const DOUBLE = ["coot"];
assert.ok(!filterComment("coooot", DOUBLE).ok && !filterComment("c00ts", DOUBLE).ok);
assert.ok(filterComment("asleep on a cot", DOUBLE).ok && filterComment("Cotter drives", DOUBLE).ok);
assert.ok(!filterComment("total idiots", TERMS).ok && !filterComment("shitty", TERMS).ok);

// Emoji terms match anywhere, in any skin tone; other emoji pass.
const EMOJI = ["🐒\uFE0F", "🍌"];
assert.ok(!filterComment("great game 🐒🐒", EMOJI).ok);
assert.ok(!filterComment("🍌", EMOJI).ok);
assert.ok(!filterComment("👋🏿🐒🏾", EMOJI).ok);
assert.ok(filterComment("what a dunk 🔥🐐", EMOJI).ok);
assert.ok(isPlayerPost("perf:G1:abc") && isPlayerPost("hot:p:g:pts") && isPlayerPost("onoff:l:2026-11-07"));
assert.ok(!isPlayerPost("final:G1") && !isPlayerPost("streak:l:team:g"));
console.log(`commentFilter: ${cases.length + 11} checks passed`);
