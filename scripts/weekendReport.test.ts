// Run with: npx tsx --test scripts/weekendReport.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeekendReport,
  gameRecap,
  reconcileQuarters,
  formatWeekendRange,
  sanitizeWeekendReport,
  weekendContaining,
  weekendReportSummary,
  weekendReportTitle,
  weekendReportToHtml,
  weekendReportToPlainText,
  type GameRow,
  type PlayerLine,
} from "../shared/weekendReport";
import { articleDocToHtml, articleDocToPlainText, isCoverImageSrc, sanitizeArticleDoc } from "../shared/newsArticle";

const game = (key: string, home: string, away: string, hs: number | null, as: number | null, time = "2026-10-10T18:00:00Z"): GameRow => ({
  game_key: key, league_id: "L1", home_team: home, away_team: away, home_score: hs, away_score: as, match_time: time,
});

const line = (over: Partial<PlayerLine> & Pick<PlayerLine, "playerId" | "name" | "gameKey" | "team">): PlayerLine => ({
  slug: over.name.toLowerCase().replace(/ /g, "-"),
  pts: 10, reb: 5, ast: 3, stl: 1, blk: 0, tov: 2,
  fgm: 4, fga: 9, tpm: 1, tpa: 3, ftm: 1, fta: 2, tsPct: 0.55, gameScore: 20,
  photoPath: null, cutoutPath: null,
  ...over,
});

const games = [
  game("G1", "Knights", "Hawks", 82, 79),
  game("G2", "Bears", "Wolves", 101, 63, "2026-10-11T14:00:00Z"),
  game("G3", "Lions", "Foxes", 90, 88, "2026-10-11T16:00:00Z"),
  game("G4", "Owls", "Rams", null, null),
  game("G5", "Stags", "Bulls", 0, 0),
];
const lines = [
  line({ playerId: "p1", name: "Ada Lee", team: "Knights", gameKey: "G1", pts: 31, reb: 11, ast: 12, gameScore: 48 }),
  line({ playerId: "p1", name: "Ada Lee", team: "Knights", gameKey: "G2", pts: 8, gameScore: 5 }),
  line({ playerId: "p2", name: "Bo Chan", team: "Hawks", gameKey: "G1", pts: 22, gameScore: 30 }),
  line({ playerId: "p3", name: "Cy Dunn", team: "Bears", gameKey: "G2", pts: 40, gameScore: 41 }),
  line({ playerId: "p4", name: "No Score", team: "Lions", gameKey: "G3", gameScore: null }),
  line({ playerId: "p5", name: "Unplayed", team: "Owls", gameKey: "G4", pts: 99, gameScore: 99 }),
];

const report = () =>
  buildWeekendReport({
    competition: { name: "Test League", slug: "test-league" },
    from: "2026-10-09", to: "2026-10-11",
    games, lines, now: new Date("2026-10-12T07:00:00Z"),
  });

test("only games with a real final score are reported, in time order", () => {
  assert.deepEqual(report().games.map((g) => g.gameKey), ["G1", "G2", "G3"]);
});

test("top performances are one per player, best Game Score first, with the result from their side", () => {
  const { performances } = report();
  assert.deepEqual(performances.map((p) => p.name), ["Ada Lee", "Cy Dunn", "Bo Chan"]);
  assert.equal(performances[0].gameKey, "G1");
  assert.equal(performances[0].result, "W 82-79");
  assert.equal(performances[0].opponent, "Hawks");
  assert.equal(performances[2].result, "L 79-82");
});

test("lines from games that were left out never appear", () => {
  assert.ok(!report().performances.some((p) => p.name === "Unplayed"));
});

test("each game keeps its two best lines", () => {
  const g1 = report().games.find((g) => g.gameKey === "G1")!;
  assert.deepEqual(g1.stars.map((s) => s.name), ["Ada Lee", "Bo Chan"]);
});

test("callouts come from the numbers", () => {
  const texts = report().callouts.map((c) => c.text);
  assert.ok(texts.includes("Closest finish: Lions 90-88 Foxes, decided by 2 points."));
  assert.ok(texts.includes("Biggest margin: Bears 101-63 Wolves, a 38-point win."));
  assert.ok(texts.includes("Highest-scoring game: Lions 90-88 Foxes, 178 points between them."));
  assert.ok(texts.includes("Most points: Cy Dunn scored 40 for Bears against Wolves."));
  assert.ok(texts.includes("Triple-double: Ada Lee had 31 points, 11 rebounds and 12 assists."));
});

test("the lede counts games and close finishes", () => {
  assert.equal(
    report().lede,
    "3 games were played in Test League over the weekend of Fri 9 – Sun 11 Oct. 2 were decided by 5 points or fewer. 503 points were scored in all.",
  );
});

test("a weekend with no games says so and has no callouts", () => {
  const empty = buildWeekendReport({ competition: { name: "Test League", slug: "test-league" }, from: "2026-10-09", to: "2026-10-11", games: [], lines: [] });
  assert.equal(empty.games.length, 0);
  assert.equal(empty.callouts.length, 0);
  assert.match(empty.lede, /No Test League games/);
});

test("weekends run Friday to Sunday and a Monday looks back", () => {
  assert.deepEqual(weekendContaining("2026-10-12"), { from: "2026-10-09", to: "2026-10-11" }); // Mon
  assert.deepEqual(weekendContaining("2026-10-11"), { from: "2026-10-09", to: "2026-10-11" }); // Sun
  assert.deepEqual(weekendContaining("2026-10-10"), { from: "2026-10-09", to: "2026-10-11" }); // Sat
  assert.deepEqual(weekendContaining("2026-10-09"), { from: "2026-10-09", to: "2026-10-11" }); // Fri
  assert.deepEqual(weekendContaining("2026-10-15"), { from: "2026-10-09", to: "2026-10-11" }); // Thu
  assert.equal(formatWeekendRange("2026-10-30", "2026-11-01"), "Fri 30 Oct – Sun 1 Nov");
});

test("a stored report survives the sanitizer unchanged", () => {
  const built = report();
  assert.deepEqual(sanitizeWeekendReport(JSON.parse(JSON.stringify(built))), built);
});

test("the sanitizer rejects what isn't a report and strips what isn't allowed", () => {
  assert.equal(sanitizeWeekendReport(null), null);
  assert.equal(sanitizeWeekendReport({ version: 2 }), null);
  const dirty: any = JSON.parse(JSON.stringify(report()));
  dirty.performances[0].photoPath = "https://evil.example/x.png";
  dirty.performances[0].cutoutPath = "../secrets";
  dirty.performances[0].slug = "<script>";
  dirty.games[0].gameKey = "G1<x>";
  const clean = sanitizeWeekendReport(dirty)!;
  assert.equal(clean.performances[0].photoPath, null);
  assert.equal(clean.performances[0].cutoutPath, null);
  assert.equal(clean.performances[0].slug, null);
  assert.equal(clean.games[0].gameKey, "G1x");
});

test("text and HTML renderings link every game and escape names", () => {
  const data = report();
  data.games[0].home = "Knights <b>";
  const html = weekendReportToHtml(data);
  assert.match(html, /href="\/competition\/test-league\/game\/G1"/);
  assert.ok(!html.includes("<b>"));
  assert.match(weekendReportToPlainText(data), /Knights <b> 82-79 Hawks/);
});

test("an article document can hold a report, and the report block is sanitised with it", () => {
  const doc = sanitizeArticleDoc({
    type: "doc",
    content: [{ type: "weekendReport", attrs: { data: report() } }, { type: "weekendReport", attrs: { data: { nope: true } } }],
  })!;
  assert.equal(doc.content.length, 1);
  assert.equal(doc.content[0].type, "weekendReport");
  assert.match(articleDocToPlainText(doc), /Ada Lee/);
  assert.match(articleDocToHtml(doc), /<h2>Top performances<\/h2>/);
});

test("the summary and title read as sentences", () => {
  const data = report();
  assert.equal(
    weekendReportSummary(data),
    "3 games from the weekend. Closest finish: Lions 90-88 Foxes, decided by 2 points. Top performance: Ada Lee with 31 points, 11 rebounds and 12 assists.",
  );
  assert.equal(weekendReportTitle("Test League", "2026-10-09", "2026-10-11"), "Test League weekend round-up: Fri 9 – Sun 11 Oct");
});

const withQuarters = (key: string, home: string, away: string, h: number[], a: number[], hs?: number, as?: number): GameRow => ({
  ...game(key, home, away, hs ?? h.reduce((x, y) => x + y, 0), as ?? a.reduce((x, y) => x + y, 0)),
  home_q1: h[0], home_q2: h[1], home_q3: h[2], home_q4: h[3],
  away_q1: a[0], away_q2: a[1], away_q3: a[2], away_q4: a[3],
});
const recapFor = (row: GameRow, extra: PlayerLine[] = []) =>
  buildWeekendReport({ competition: { name: "T", slug: "t" }, from: "2026-10-09", to: "2026-10-11", games: [row], lines: extra }).games[0];

test("period scores are kept when they add up, with overtime as one extra period", () => {
  assert.deepEqual(reconcileQuarters(withQuarters("Q", "A", "B", [20, 20, 20, 22], [18, 20, 19, 20]), 82, 77), { home: [20, 20, 20, 22], away: [18, 20, 19, 20] });
  const ot = withQuarters("Q", "A", "B", [20, 20, 20, 20], [20, 20, 20, 20], 90, 88);
  assert.deepEqual(reconcileQuarters(ot, 90, 88), { home: [20, 20, 20, 20, 10], away: [20, 20, 20, 20, 8] });
  assert.equal(reconcileQuarters(withQuarters("Q", "A", "B", [20, 20, 20, 22], [18, 20, 19, 20], 90, 77), 90, 77), null);
  assert.equal(reconcileQuarters(game("Q", "A", "B", 80, 70), 80, 70), null);
});

test("a game's recap says who led at half and who came back", () => {
  const led = recapFor(withQuarters("G", "Knights", "Hawks", [25, 20, 20, 17], [15, 20, 18, 16]));
  assert.equal(led.recap, "Knights beat Hawks 82-69. Knights led 45-35 at half.");
  const comeback = recapFor(withQuarters("G", "Knights", "Hawks", [15, 20, 25, 22], [25, 20, 15, 15]));
  assert.equal(comeback.recap, "Knights beat Hawks 82-75. Hawks led 45-35 at half, but Knights outscored them 47-30 after the break.");
  const close = recapFor(withQuarters("G", "Knights", "Hawks", [20, 20, 20, 20], [20, 20, 20, 19]));
  assert.equal(close.recap, "Knights beat Hawks 80-79. It was decided by 1 point. It was level at 40-40 at half.");
});

test("an overtime game says so, and a game without period scores still gets a recap", () => {
  const ot = recapFor(withQuarters("G", "Knights", "Hawks", [20, 20, 20, 20], [20, 20, 20, 20], 90, 88));
  assert.match(ot.recap!, /It was level at 40-40 at half\. It went to overtime\./);
  assert.equal(recapFor(game("G", "Knights", "Hawks", 100, 70)).recap, "Knights beat Hawks 100-70. It was a 30-point win.");
  assert.equal(gameRecap({ ...recapFor(game("G", "Knights", "Hawks", 70, 70)), homeScore: 70, awayScore: 70 }), "Knights and Hawks finished level at 70.");
});

test("each game lists its team leaders, home side first", () => {
  const g = recapFor(game("G1", "Knights", "Hawks", 82, 79), [
    line({ playerId: "a", name: "Ada Lee", team: "Knights", gameKey: "G1", pts: 31, reb: 4, ast: 12 }),
    line({ playerId: "b", name: "Bo Chan", team: "Hawks", gameKey: "G1", pts: 22, reb: 9, ast: 2 }),
    line({ playerId: "c", name: "Cy Dunn", team: "Knights", gameKey: "G1", pts: 12, reb: 11, ast: 0 }),
  ]);
  assert.equal(g.leaders![0].team, "Knights");
  assert.deepEqual([g.leaders![0].pts?.name, g.leaders![0].reb?.name, g.leaders![0].ast?.name], ["Ada Lee", "Cy Dunn", "Ada Lee"]);
  assert.deepEqual([g.leaders![1].pts?.name, g.leaders![1].reb?.name, g.leaders![1].ast?.name], ["Bo Chan", "Bo Chan", "Bo Chan"]);
  assert.equal(g.leaders![0].ast?.value, 12);
});

test("recaps, period scores and leaders survive the sanitizer", () => {
  const built = buildWeekendReport({
    competition: { name: "T", slug: "t" }, from: "2026-10-09", to: "2026-10-11",
    games: [withQuarters("G1", "Knights", "Hawks", [25, 20, 20, 17], [15, 20, 18, 16])],
    lines: [line({ playerId: "a", name: "Ada Lee", team: "Knights", gameKey: "G1", pts: 31 })],
    now: new Date("2026-10-12T07:00:00Z"),
  });
  assert.deepEqual(sanitizeWeekendReport(JSON.parse(JSON.stringify(built))), built);
});

test("a competition banner is an allowed cover image; other hosts and buckets are not", () => {
  const base = "https://abc.supabase.co/storage/v1/object/public";
  assert.ok(isCoverImageSrc(`${base}/league-banners/1a38_1759.png`));
  assert.ok(isCoverImageSrc(`${base}/news-images/articles/x.jpg`));
  assert.ok(!isCoverImageSrc(`${base}/player-photos/x.png`));
  assert.ok(!isCoverImageSrc("https://evil.example/storage/v1/object/public/league-banners/x.png"));
  assert.ok(!isCoverImageSrc("http://abc.supabase.co/storage/v1/object/public/league-banners/x.png"));
});
