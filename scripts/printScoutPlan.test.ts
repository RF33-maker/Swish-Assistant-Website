// Run with: npx tsx --test scripts/printScoutPlan.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildPlanHtml, type PrintablePlan } from "../client/src/lib/printScoutPlan";

const plan: PrintablePlan = {
  headline: "Shooters who <b>fade</b> late",
  summary: "Haukar are 1-2.",
  howTheyPlay: "Slow and patient.",
  defendingThem: { summary: "Shrink the floor.", keys: [{ call: "Pack the paint", why: "Guinn is 0 of 7 from three." }] },
  attackingThem: { summary: "Attack the rim.", keys: [{ call: "Drive", why: "37.7% of shots at the rim." }] },
  playersToStop: [{ name: "Sigrún Björg Ólafsdóttir", threat: "Rebounds 10.3 a game.", plan: "Box out." }],
  lineupsAndRotation: { summary: "Same five starts.", watchFor: ["When Rósa sits, push the pace."] },
  lateGame: "They fade in the fourth.",
  gamePlan: [{ call: "Box out every shot", why: "36.6% offensive rebound rate.", target: "Under 10 second-chance points" }],
  confidence: "medium",
  confidenceReason: "Three games.",
};

test("every section is in the printable report", () => {
  const html = buildPlanHtml(plan, { opponentName: "Haukar", forTeamName: "Valur", competitionName: "Icelandic Women's Premier League 2026-27", gamesAnalysed: 3 });
  for (const part of ["Valur v Haukar", "Game plan", "Box out every shot", "Under 10 second-chance points", "How Haukar play", "Defending them", "Attacking them", "Players to stop", "Sigrún Björg Ólafsdóttir", "Lineups and rotation", "Late game", "Confidence: medium"]) {
    assert.ok(html.includes(part), `missing: ${part}`);
  }
});

test("text from the plan is escaped", () => {
  const html = buildPlanHtml(plan, { opponentName: "Hauk<script>x</script>", forTeamName: null });
  assert.ok(!html.includes("<b>fade</b>"), "plan markup must not pass through");
  assert.ok(html.includes("&lt;b&gt;fade&lt;/b&gt;"));
  assert.ok(!html.includes("<script>x</script>"), "opponent name must be escaped");
});

test("brand colour only accepts a plain hex colour", () => {
  assert.ok(buildPlanHtml(plan, { opponentName: "A", brandColor: "#12427f" }).includes("--brand:#12427f"));
  assert.ok(buildPlanHtml(plan, { opponentName: "A", brandColor: "red;} body{display:none" }).includes("--brand:#0b3c78"));
});

test("without a team the title is the opponent", () => {
  assert.ok(buildPlanHtml(plan, { opponentName: "Haukar" }).includes("<title>Scouting report: Haukar</title>"));
});
