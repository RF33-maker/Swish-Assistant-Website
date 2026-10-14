// Run with: npx tsx --test scripts/playerNameKey.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { playerNameKey, isInitialName, bestPlayerName, canonicalLineupKey } from "../shared/playerNameKey";

test("a full name and its abbreviation share one key", () => {
  assert.equal(playerNameKey("Dzana Crnac"), playerNameKey("D. Crnac"));
  assert.equal(playerNameKey("Alyssa Marie Cerino"), playerNameKey("A. Cerino"));
  assert.equal(playerNameKey("Ben Baker"), "b baker");
});

test("hyphens and generational suffixes are ignored", () => {
  assert.equal(playerNameKey("Raheem May-Thompson"), playerNameKey("R May Thompson"));
  assert.equal(playerNameKey("Rodney Glasgow Jr"), playerNameKey("R. Glasgow"));
});

test("Icelandic letters fold the way the feed spells them", () => {
  assert.equal(playerNameKey("Þóranna Kika Hodge-Carr"), playerNameKey("T. Hodge-Carr"));
  assert.equal(playerNameKey("Bergdís Anna Magnúsdóttir"), playerNameKey("B. Magnusdottir"));
  assert.equal(playerNameKey("Sara Líf Boama"), playerNameKey("S. Boama"));
  assert.equal(playerNameKey("Gígja Rut Gautadóttir"), playerNameKey("G. Gautadottir"));
  assert.equal(playerNameKey("Auður Ósk Þórðardóttir"), playerNameKey("A. Thordardottir"));
});

test("other accents and letters fold too", () => {
  assert.equal(playerNameKey("José Álvarez"), playerNameKey("J. Alvarez"));
  assert.equal(playerNameKey("Łukasz Kowalski"), playerNameKey("L. Kowalski"));
  assert.equal(playerNameKey("Søren Jensen"), playerNameKey("S. Jensen"));
});

test("different initials or surnames keep different keys", () => {
  assert.notEqual(playerNameKey("Marlee Ball"), playerNameKey("Dana Ball"));
  assert.notEqual(playerNameKey("Marlee Ball"), playerNameKey("Marlee Bell"));
});

test("empty names have no key", () => {
  assert.equal(playerNameKey(""), "");
  assert.equal(playerNameKey(null), "");
});

test("isInitialName spots placeholders", () => {
  assert.equal(isInitialName("D. Crnac"), true);
  assert.equal(isInitialName("D Crnac"), true);
  assert.equal(isInitialName("Dzana Crnac"), false);
});

test("bestPlayerName prefers a full name, then the longer one", () => {
  assert.equal(bestPlayerName(["D. Crnac", "Dzana Crnac"]), "Dzana Crnac");
  assert.equal(bestPlayerName(["Reshawna Stone", "Reshawna Rosie Stone"]), "Reshawna Rosie Stone");
  assert.equal(bestPlayerName([null, "", "A. Cerino"]), "A. Cerino");
  assert.equal(bestPlayerName([]), "");
});

test("a lineup has the same key whichever spellings it came in", () => {
  const abbreviated = ["T. Hodge-Carr", "R. Stone", "S. Boama", "B. Magnusdottir", "M. Ball"];
  const mixed = ["Þóranna Kika Hodge-Carr", "Reshawna Rosie Stone", "Sara Líf Boama", "Bergdís Anna Magnúsdóttir", "Marlee Ann Ball"];
  assert.equal(canonicalLineupKey("t1", abbreviated), canonicalLineupKey("t1", mixed));
  assert.equal(canonicalLineupKey("t1", abbreviated), canonicalLineupKey("t1", mixed.slice().reverse()));
  assert.notEqual(canonicalLineupKey("t1", abbreviated), canonicalLineupKey("t2", abbreviated));
});

test("a lineup that can't name five people returns null", () => {
  assert.equal(canonicalLineupKey("t1", null), null);
  assert.equal(canonicalLineupKey("t1", ["A. One", "B. Two", "C. Three", "D. Four"]), null);
  assert.equal(canonicalLineupKey("t1", ["A. One", "B. Two", "C. Three", "D. Four", ""]), null);
  assert.equal(canonicalLineupKey("t1", ["A. One", "Anna One", "C. Three", "D. Four", "E. Five"]), null, "one person twice");
});
