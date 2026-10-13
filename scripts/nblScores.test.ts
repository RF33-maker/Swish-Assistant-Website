// Run with: npx tsx --test scripts/nblScores.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { datesInWindow, parseDateOptions, parseGrades, parseResults, parseSeason, upgradeLogoUrl } from "../shared/nblScores";

const LOGO = "https://res.cloudinary.com/playhq/image/upload/h_64,w_64/v1/euprod/be/19f8698f/1747790094939/logo.jpg?_a=BAMAMifg0";

const row = (opts: { href?: string; home: string; away: string; hs?: number; as?: number; time?: string }) => `
  <tr class="cursor-pointer hover:bg-gray-50 js-row-link"${opts.href ? ` data-href="${opts.href}"` : ""}>
    <td class="col1"><div>
      <span class="club-name">${opts.home}</span>
      ${opts.hs === undefined ? "" : `<span class="score font-bold">${opts.hs}</span>`}
      <img src="${LOGO}" alt="${opts.home}" class="club-logo">
    </div></td>
    <td class="col2"><div>
      <span class="date mobile:hidden">Sat 10 Oct</span>
      <span class="time text-sm text-gray-600">${opts.time ?? "15:00"}</span>
    </div></td>
    <td class="col3"><div>
      <img src="${LOGO}" alt="${opts.away}" class="club-logo">
      ${opts.as === undefined ? "" : `<span class="score font-bold">${opts.as}</span>`}
      <span class="club-name">${opts.away}</span>
    </div></td>
  </tr>`;

test("a finished game gives teams, scores, time, report id and a bigger logo", () => {
  const html = `<table><tbody>${row({
    href: "/leagues/nbl/fixtures-and-results/report/a7fc603a-eed0-4c5e-af0c-666692f90ae2",
    home: "Manchester Giants Senior Men",
    away: "Nottingham Hoods Senior Men",
    hs: 87,
    as: 59,
  })}</tbody></table>`;
  assert.deepEqual(parseResults(html, "2026-10-10"), [
    {
      gameDate: "2026-10-10",
      tipTime: "15:00",
      homeTeam: "Manchester Giants Senior Men",
      awayTeam: "Nottingham Hoods Senior Men",
      homeScore: 87,
      awayScore: 59,
      homeLogoUrl: LOGO.replace("h_64,w_64", "c_fit,h_256,w_256"),
      awayLogoUrl: LOGO.replace("h_64,w_64", "c_fit,h_256,w_256"),
      reportId: "a7fc603a-eed0-4c5e-af0c-666692f90ae2",
    },
  ]);
});

test("upcoming games, and rows with only one score, are skipped", () => {
  const html = row({ home: "A", away: "B" }) + row({ home: "C", away: "D", hs: 70 });
  assert.deepEqual(parseResults(html, "2026-10-17"), []);
});

test("a nil score is a score", () => {
  const [game] = parseResults(row({ home: "A", away: "B", hs: 20, as: 0 }), "2026-10-11");
  assert.equal(game.awayScore, 0);
});

test("team names are tidied: entities decoded, spaces collapsed", () => {
  const [game] = parseResults(row({ home: "Hull &amp; East  Riding", away: "O&#039;Neill Lions", hs: 1, as: 2 }), "2026-10-11");
  assert.equal(game.homeTeam, "Hull & East Riding");
  assert.equal(game.awayTeam, "O'Neill Lions");
});

test("a row with no time still reads", () => {
  const html = row({ home: "A", away: "B", hs: 5, as: 4 }).replace(/<span class="time[^<]*<\/span>/, "");
  assert.equal(parseResults(html, "2026-10-11")[0].tipTime, null);
});

const PAGE = `
  <select id="season" name="season"><option value="s1" selected>2026/27</option><option value="s0">2025/26</option></select>
  <select class="w-full" id="grade" name="grade">
    <option value="">Select</option>
    <option value="g1">Division One Men - Pool A</option>
    <option value="g2">Division Two Men - Pool A</option>
    <option value="g3">Division Two Women - Pool C</option>
    <option value="g4">Division Three Men - Pool A</option>
    <option value="g5">Division Two Men - Pool B</option>
    <option value="g6">Under 16 Division Two Boys</option>
  </select>`;

test("only the Division Two pools are picked, with their ids", () => {
  assert.deepEqual(parseGrades(PAGE), [
    { id: "g2", name: "Division Two Men - Pool A" },
    { id: "g3", name: "Division Two Women - Pool C" },
    { id: "g5", name: "Division Two Men - Pool B" },
  ]);
});

test("no division picker means no pools", () => {
  assert.deepEqual(parseGrades("<html>redesigned</html>"), []);
});

test("the season is the selected option, else the first", () => {
  assert.equal(parseSeason(PAGE), "2026/27");
  assert.equal(parseSeason(PAGE.replace(" selected", "")), "2026/27");
  assert.equal(parseSeason("<p>nothing</p>"), null);
});

test("match days are read from the date options and trimmed to the lookback window", () => {
  const options = `<option value="2026-09-19" >Sat</option><option value="2026-10-04" >Sun</option><option value="2026-10-10" >Sat</option><option value="2026-10-11" selected>Sun</option><option value="2026-10-17" >Sat</option>`;
  const dates = parseDateOptions(options);
  assert.equal(dates.length, 5);
  assert.deepEqual(datesInWindow(dates, "2026-10-12", 4), ["2026-10-10", "2026-10-11"]);
  assert.deepEqual(datesInWindow(dates, "2026-10-12", 10), ["2026-10-04", "2026-10-10", "2026-10-11"]);
  assert.deepEqual(datesInWindow(dates, "2026-10-11", 0), ["2026-10-11"]);
});

test("logos without the resize part, or missing, are left alone", () => {
  assert.equal(upgradeLogoUrl(null), null);
  assert.equal(upgradeLogoUrl("https://example.com/a.png"), "https://example.com/a.png");
});

import { chunk, divisionOf, formatDateRange, poolOf, weekendKey } from "../shared/nblScores";

test("pool names split into division and pool", () => {
  assert.equal(divisionOf("Division Two Men - Pool A"), "Division Two Men");
  assert.equal(poolOf("Division Two Men - Pool A"), "Pool A");
  assert.equal(divisionOf("Division Two Women - Pool C"), "Division Two Women");
  assert.equal(poolOf("Division Two Women"), "");
});

test("Friday to Sunday share a weekend; midweek games stand alone", () => {
  assert.equal(weekendKey("2026-10-09"), "2026-10-09"); // Fri
  assert.equal(weekendKey("2026-10-10"), "2026-10-09"); // Sat
  assert.equal(weekendKey("2026-10-11"), "2026-10-09"); // Sun
  assert.equal(weekendKey("2026-10-14"), "2026-10-14"); // Wed
  assert.equal(weekendKey("2026-11-01"), "2026-10-30"); // Sun across a month end
});

test("date ranges read like a score graphic header", () => {
  assert.equal(formatDateRange("2026-10-10", "2026-10-11"), "SAT 10 – SUN 11 OCT");
  assert.equal(formatDateRange("2026-10-31", "2026-11-01"), "SAT 31 OCT – SUN 1 NOV");
  assert.equal(formatDateRange("2026-10-14", "2026-10-14"), "WED 14 OCT");
});

test("chunk keeps order and the last card may be short", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 6), []);
});
