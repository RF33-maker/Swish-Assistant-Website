// Run with: npx tsx --test scripts/coachNotes.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { coachNotesBlock } from "../supabase/functions/scout-agent/facts";
import { pickGames } from "../supabase/functions/scout-agent/load";
import { applyWindow } from "../shared/scoutRoster";
import { applyEdits, cleanEdit, cleanNote, EDIT_MAX, isEditablePath, isNoteKind, NOTE_MAX, parseWindow, windowGames, windowLabel, type PlanEdits } from "../shared/coachNotes";
import { buildPlanHtml, type PrintablePlan } from "../client/src/lib/printScoutPlan";

test("windows parse safely and map to a game count", () => {
  assert.equal(parseWindow("last5"), "last5");
  assert.equal(parseWindow("last3"), "last3");
  for (const bad of [undefined, null, "", "last10", "season; drop table", 5]) assert.equal(parseWindow(bad), "season");
  assert.equal(windowGames("last3"), 3);
  assert.equal(windowGames("last5"), 5);
  assert.equal(windowGames("season"), null);
  assert.equal(windowLabel("last5"), "last 5 games");
});

test("notes are cleaned, capped and typed", () => {
  assert.equal(cleanNote("  Normally   a 40%\n shooter  "), "Normally a 40% shooter");
  assert.equal(cleanNote("x".repeat(NOTE_MAX + 50)).length, NOTE_MAX);
  assert.equal(cleanNote(null), "");
  assert.ok(isNoteKind("stronger") && isNoteKind("out"));
  assert.ok(!isNoteKind("hacker"));
});

const cards = [
  { name: "Jadakiss Nashi Guinn", gp: 3, mpg: 30.5, onRecentRoster: true },
  { name: "Tinna Guðrún Alexandersdóttir", gp: 3, mpg: 28.8, onRecentRoster: true },
];

test("notes reach the fact pack tied to the player's numbers, and say they are to be believed", () => {
  const block = coachNotesBlock(
    { general: "Their point guard is out for a month.", updatedAt: null, players: [
      { name: "J. Guinn", kind: "stronger", note: "Normally shoots 40% from three; this is a cold start." },
      { name: "Someone New", kind: "changed", note: "Signed last week." },
    ] },
    cards,
  )!;
  assert.match(block.note, /treat it as true/);
  assert.equal(block.aboutTheOpponent, "Their point guard is out for a month.");
  const guinn = block.aboutPlayers.find((p) => p.coachNote.includes("cold start"))!;
  assert.equal(guinn.name, "Jadakiss Nashi Guinn", "uses the fact pack's spelling");
  assert.equal(guinn.gamesInSample, 3);
  assert.match(guinn.meaning, /better than the numbers show/);
  const unknown = block.aboutPlayers.find((p) => p.name === "Someone New")!;
  assert.equal(unknown.onRecentRoster, false);
  assert.equal(unknown.gamesInSample, null);
});

test("no notes means no block", () => {
  assert.equal(coachNotesBlock(null, cards), null);
  assert.equal(coachNotesBlock({ general: null, players: [], updatedAt: null }, cards), null);
});

test("last-N takes the newest N of this season, and falls back when the season is empty", () => {
  const g = (d: string) => ({ played_at: d });
  const games = ["2026-10-10", "2026-10-01", "2026-09-20", "2026-09-05", "2026-04-01"].map(g);
  assert.deepEqual(pickGames(games, new Date("2026-10-15"), 20, 4, 3).map((x) => x.played_at), ["2026-10-10", "2026-10-01", "2026-09-20"]);
  // Only two this season: the window gives those two, not last spring's game.
  assert.equal(pickGames(games.slice(0, 2).concat(g("2026-04-01")), new Date("2026-10-15"), 20, 4, 5).length, 2);
  // Nothing yet this season: the newest N overall.
  assert.equal(pickGames([g("2026-04-01"), g("2026-03-01"), g("2026-02-01")], new Date("2026-10-15"), 20, 4, 2).length, 2);
});

test("a roster window keeps each club's own newest games, across competitions", () => {
  const rows = [
    { game_key: "a1", club: "A" }, { game_key: "a2", club: "A" }, { game_key: "a3", club: "A" },
    { game_key: "b1", club: "B" }, { game_key: "a3", club: "B" },
  ];
  const when: Record<string, string> = { a1: "2026-09-01", a2: "2026-09-10", a3: "2026-09-20", b1: "2026-09-02" };
  const kept = applyWindow(rows, (r) => r.club, (k) => when[k], 2);
  assert.deepEqual(kept.filter((r) => r.club === "A").map((r) => r.game_key), ["a2", "a3"]);
  assert.deepEqual(kept.filter((r) => r.club === "B").map((r) => r.game_key).sort(), ["a3", "b1"], "B has only two games, both kept, one shared with A");
  assert.equal(applyWindow(rows, (r) => r.club, (k) => when[k], null).length, rows.length);
});

const plan: PrintablePlan = {
  headline: "h", summary: "s", howTheyPlay: "x",
  defendingThem: { summary: "d", keys: [] }, attackingThem: { summary: "a", keys: [] },
  playersToStop: [], lineupsAndRotation: { summary: "l", watchFor: [] }, lateGame: "l",
  gamePlan: [], confidence: "medium", confidenceReason: "r",
};

test("the printed report shows the window and the notes, escaped", () => {
  const html = buildPlanHtml(plan, {
    opponentName: "Haukar", forTeamName: "Valur", windowLabel: "last 5 games",
    coachNotes: [
      { id: "1", scope: "team", playerName: null, aspect: null, aspectLabel: null, kind: null, note: "Point guard out <script>x</script>", updatedAt: "2026-10-15" },
      { id: "2", scope: "player", playerName: "J. Guinn", aspect: null, aspectLabel: null, kind: "stronger", note: "Normally a 40% shooter", updatedAt: "2026-10-15" },
    ],
  });
  assert.ok(html.includes("Last 5 games"));
  assert.ok(html.includes("Better than the numbers show") && html.includes("Normally a 40% shooter"));
  assert.ok(!html.includes("<script>x</script>"));
  assert.ok(html.includes("Point guard out &lt;script&gt;"));
});

// ---------- editing the plan's wording ----------

test("only wording the plan really has can be edited", () => {
  for (const ok of ["headline", "summary", "howTheyPlay", "lateGame", "gamePlan.0.target", "gamePlan.4.why", "defendingThem.keys.2.call", "attackingThem.summary", "playersToStop.1.plan", "lineupsAndRotation.watchFor.0"]) {
    assert.ok(isEditablePath(ok), ok);
  }
  for (const bad of ["confidence", "facts", "__proto__.polluted", "gamePlan.0.__proto__", "gamePlan.x.target", "gamePlan.0", "constructor.prototype.x", "playersToStop.0.name", "", null, 5]) {
    assert.ok(!isEditablePath(bad), String(bad));
  }
});

const basePlan = {
  headline: "AI headline", summary: "s", howTheyPlay: "h", lateGame: "l",
  gamePlan: [{ call: "c0", why: "w0", target: "Under 10 second-chance points" }],
  defendingThem: { summary: "d", keys: [{ call: "k0", why: "y0" }] },
  attackingThem: { summary: "a", keys: [] },
  playersToStop: [{ name: "P", threat: "t0", plan: "p0" }],
  lineupsAndRotation: { summary: "r", watchFor: ["w"] },
  confidence: "medium",
};

test("edits are laid over the AI's wording and the original is untouched", () => {
  const edits: PlanEdits = { basedOn: "2026-10-15T10:00:00Z", fields: {
    "gamePlan.0.target": "Under 14 second-chance points", "headline": "Our headline", "lineupsAndRotation.watchFor.0": "Watch the bench",
    "gamePlan.9.target": "no such call", "confidence": "high", "playersToStop.0.name": "Hacked",
  } };
  const out = applyEdits(basePlan, edits);
  assert.equal(out.gamePlan[0].target, "Under 14 second-chance points");
  assert.equal(out.headline, "Our headline");
  assert.equal(out.lineupsAndRotation.watchFor[0], "Watch the bench");
  assert.equal(out.confidence, "medium", "non-editable fields are never overwritten");
  assert.equal(out.playersToStop[0].name, "P");
  assert.equal(out.gamePlan.length, 1, "a path that is not in this plan adds nothing");
  assert.equal(basePlan.headline, "AI headline");
  assert.equal(applyEdits(basePlan, null), basePlan);
});

test("an edit cannot pollute prototypes or smuggle markup limits", () => {
  const out = applyEdits(basePlan, { basedOn: "x", fields: { "__proto__.polluted": "yes", "constructor.prototype.polluted": "yes" } as any });
  assert.equal(({} as any).polluted, undefined);
  assert.deepEqual(out, basePlan);
  assert.equal(cleanEdit("  one   two\n three ".repeat(1)), "one two three");
  assert.equal(cleanEdit("x".repeat(EDIT_MAX + 20)).length, EDIT_MAX);
});

test("context on a strength or weakness reaches the fact pack and the PDF", () => {
  const block = coachNotesBlock({ general: null, players: [], updatedAt: null, areas: [{ name: "J. Guinn", area: "Three-point shooting", note: "Normally shoots 40%." }] }, cards)!;
  assert.equal(block.aboutPlayerAreas[0].name, "Jadakiss Nashi Guinn");
  assert.equal(block.aboutPlayerAreas[0].area, "Three-point shooting");
  assert.equal(block.aboutPlayerAreas[0].coachNote, "Normally shoots 40%.");
});
