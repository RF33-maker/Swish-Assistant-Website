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

import { readFileSync } from "node:fs";
import { buildScoutRoster, type BoxScoreRow } from "../shared/scoutRoster";

const rows = JSON.parse(readFileSync(new URL("./fixtures/iceland-womens-2026-27-box-scores.json", import.meta.url), "utf8")) as BoxScoreRow[];
const haukar = buildScoutRoster(rows, (t) => t === "Haukar");
const roster = { ...haukar, leagueName: "Icelandic Women's Premier League 2026-27", logos: { opponent: "https://example.com/haukar.jpg", forTeam: "https://example.com/valur.png" } };

test("the printable report carries the roster, profiles, percentile bars and crests", () => {
  const html = buildPlanHtml(plan, { opponentName: "Haukar", forTeamName: "Valur", roster });
  for (const part of ["<span>Roster</span>Haukar", "Strengths and weaknesses", "How to read this", "Strengths", "Weaknesses", "percentile", "Ahead of", "Jadakiss Nashi Guinn", "https://example.com/haukar.jpg", "https://example.com/valur.png", "Valur scouting report"]) {
    assert.ok(html.includes(part), `missing: ${part}`);
  }
  assert.equal((html.match(/class="pro"/g) || []).length, haukar.profiles.length);
  assert.equal((html.match(/<tr class=/g) || []).length, haukar.roster.length);
});

test("the guide's pool numbers come from the data", () => {
  const html = buildPlanHtml(plan, { opponentName: "Haukar", forTeamName: "Valur", roster });
  assert.ok(html.includes(`In a pool of ${haukar.poolSize}`));
  assert.ok(html.includes(`of the other ${haukar.poolSize - 1}`));
});

test("only http(s) crest links are used", () => {
  const html = buildPlanHtml(plan, { opponentName: "Haukar", forTeamName: "Valur", roster: { ...roster, logos: { opponent: "javascript:alert(1)", forTeam: "data:text/html,x" } } });
  assert.ok(!html.includes("javascript:alert"));
  assert.ok(!html.includes("data:text/html"));
  assert.ok(!html.includes("<img"));
});

test("without a roster the printout still builds", () => {
  const html = buildPlanHtml(plan, { opponentName: "Haukar", forTeamName: "Valur", roster: null });
  assert.ok(html.includes("Game plan"));
  assert.ok(!html.includes("Strengths and weaknesses"));
});

test("the cover shows both crests and the at-a-glance numbers", () => {
  const html = buildPlanHtml(plan, {
    opponentName: "Haukar", forTeamName: "Valur", roster,
    teaser: { record: "1-2", gamesAnalysed: 3, keyNumbers: [{ key: "pace", value: 71.2, rank: 2, of: 10 }] },
  });
  assert.ok(html.includes("Haukar at a glance"));
  assert.ok(html.includes("1-2") && html.includes("71.2") && html.includes("2nd of 10"));
  assert.equal((html.match(/class="crest"/g) || []).length, 2);
});

test("headshots use the face-framed thumbnail with the original as fallback, and unsafe links are dropped", () => {
  const url = "https://x.supabase.co/storage/v1/object/public/player-photos/abc/cut.png";
  const first = roster.roster[0];
  const withPhoto = { ...roster, roster: [{ ...first, photo: { url, focusY: 20 } }, ...roster.roster.slice(1)] };
  const html = buildPlanHtml(plan, { opponentName: "Haukar", roster: withPhoto });
  assert.ok(html.includes("abc/cut.thumb.webp"));
  assert.ok(html.includes(`data-o="${url}"`));
  const bad = { ...roster, roster: [{ ...first, photo: { url: "javascript:alert(1)", focusY: null } }, ...roster.roster.slice(1)] };
  assert.ok(!buildPlanHtml(plan, { opponentName: "Haukar", roster: bad }).includes("javascript:alert"));
});

test("a title with quotes or braces cannot break out of the footer's CSS", () => {
  const html = buildPlanHtml(plan, { opponentName: 'Evil";}</style><script>x</script>{', forTeamName: null });
  assert.ok(!html.includes("</style><script>"));
});

test("the season note names every competition counted", () => {
  const season = { label: "2026-27", wholeSeason: true, games: 5, competitions: [{ name: "BCB League", games: 1 }, { name: "BCB Trophy", games: 4 }] };
  const html = buildPlanHtml(plan, { opponentName: "Haukar", roster: { ...roster, season } });
  assert.ok(html.includes("5 games this season") && html.includes("BCB Trophy 4") && html.includes("5 games analysed"));
});
