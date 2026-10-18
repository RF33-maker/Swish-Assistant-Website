// Run with: npx tsx --test scripts/previewStorylines.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildGameStorylines, finalizeStorylines, isCupCompetition, shortCompetition, type StorylineTeamRow } from "../client/src/lib/gameStorylines";
import { highlightOf, recentStandouts, shortDate, type RecentGame } from "../client/src/lib/recentStandouts";
import type { PlayerSeasonAverage } from "../client/src/lib/playerRankings";

test("competition names read short in a headline", () => {
  assert.equal(shortCompetition("NBL Division One 2026-27"), "NBL Division One");
  assert.equal(shortCompetition("WEABL 2026/27"), "WEABL");
  assert.equal(shortCompetition("NBL Mens National Cup 26-27"), "NBL Mens National Cup");
  assert.equal(shortCompetition("Super League 2026"), "Super League");
  assert.equal(shortCompetition(null), "");
});

test("cups are told apart from leagues", () => {
  assert.ok(isCupCompetition("NBL Mens National Cup 26-27"));
  assert.ok(isCupCompetition("EABL Trophy"));
  assert.ok(!isCupCompetition("NBL Division One 2026-27"));
});

function player(over: Partial<PlayerSeasonAverage>): PlayerSeasonAverage {
  return {
    player_name: "Conroy Hayden", team_id: "t1", team_name: "Birmingham City University Senior Men", league_id: "L", player_ids: ["p1"],
    games_played: 3, avg_pts: 0, avg_ast: 0, avg_reb: 10.3, avg_stl: 0, avg_blk: 0, avg_tov: 0,
    total_pts: 19, total_ast: 9, total_reb: 31, total_stl: 0, total_blk: 0, total_tov: 0,
    ...over,
  } as PlayerSeasonAverage;
}

test("a ranking names the competition and flags a thin sample", () => {
  const players = [player({}), player({ player_name: "Other", player_ids: ["p2"], team_id: "t2", team_name: "Leicester Warriors Senior Men", avg_reb: 4 })];
  const stories = buildGameStorylines({
    homeTeam: "Leicester Warriors Senior Men", awayTeam: "Birmingham City University Senior Men", homeId: "t2", awayId: "t1",
    teamRows: [], players, competitionName: "NBL Division One 2026-27",
  });
  const lead = stories.find((s) => s.id.startsWith("player-avg_reb-p1"))!;
  assert.equal(lead.headline, "Conroy Hayden leads NBL Division One in rebounding");
  assert.equal(lead.scope, "NBL Division One 2026-27 · 3 games");
  assert.equal(lead.limited, "Only 3 games played");
});

test("a bigger sample isn't flagged, low team coverage is", () => {
  const players = [player({ games_played: 9 })];
  const base = { homeTeam: "A", awayTeam: "Birmingham City University Senior Men", homeId: null, awayId: "t1", teamRows: [], players, competitionName: "NBL Division One 2026-27" };
  const full = buildGameStorylines({ ...base, coverage: { withStats: 12, total: 12 } }).find((s) => s.kind === "player")!;
  assert.equal(full.limited, undefined);
  const thin = buildGameStorylines({ ...base, coverage: { withStats: 5, total: 12 } }).find((s) => s.kind === "player")!;
  assert.equal(thin.limited, "Stats recorded for 5 of 12 teams");
});

test("without a competition name the headline still reads", () => {
  const s = buildGameStorylines({ homeTeam: "A", awayTeam: "Birmingham City University Senior Men", homeId: null, awayId: "t1", teamRows: [], players: [player({ games_played: 9 })] }).find((x) => x.kind === "player")!;
  assert.equal(s.headline, "Conroy Hayden leads the league in rebounding");
});

const NOW = new Date("2026-10-18T12:00:00Z");
function game(over: Partial<RecentGame>): RecentGame {
  return { playerId: "p1", name: "Conroy Hayden", side: "home", leagueId: "D1", competition: "NBL Division One 2026-27", date: "2026-10-17T14:59:00Z", pts: 7, reb: 14, ast: 2, stl: 0, blk: 0, ...over };
}

test("which stat lines are worth a storyline", () => {
  assert.equal(highlightOf({ pts: 8, reb: 18, ast: 0, stl: 0, blk: 0 })?.phrase, "grabbed 18 rebounds");
  assert.equal(highlightOf({ pts: 31, reb: 4, ast: 2, stl: 0, blk: 0 })?.phrase, "scored 31 points");
  assert.match(highlightOf({ pts: 14, reb: 11, ast: 3, stl: 0, blk: 0 })!.phrase, /double-double/);
  assert.match(highlightOf({ pts: 14, reb: 11, ast: 10, stl: 0, blk: 0 })!.phrase, /triple-double/);
  assert.equal(highlightOf({ pts: 8, reb: 5, ast: 3, stl: 1, blk: 0 }), null);
  assert.equal(highlightOf({ pts: 6, reb: 3, ast: 7, stl: 0, blk: 0 })?.phrase, "dished out 7 assists");
});

test("a big last game becomes a storyline that names the competition and date", () => {
  const [s] = recentStandouts([game({})], { gameTime: NOW, currentLeagueId: "CUP" });
  assert.equal(s.kind, "recent");
  assert.equal(s.headline, "Conroy Hayden grabbed 14 rebounds last time out");
  assert.equal(s.eyebrow, "Last game");
  assert.equal(s.scope, "NBL Division One 2026-27 · Sat 17 Oct");
  assert.equal(s.detail, "7 PTS · 14 REB · 2 AST");
  assert.equal(s.side, "home");
  assert.deepEqual(s.player, { name: "Conroy Hayden", playerIds: ["p1"] });
});

test("a bigger night in this competition beats a smaller last game", () => {
  const stories = recentStandouts(
    [
      game({ date: "2026-10-17T14:59:00Z", reb: 10 }),
      game({ leagueId: "CUP", competition: "NBL Mens National Cup 26-27", date: "2026-09-27T20:38:00Z", reb: 18 }),
    ],
    { gameTime: NOW, currentLeagueId: "CUP" },
  );
  assert.equal(stories.length, 1);
  assert.equal(stories[0].headline, "Conroy Hayden grabbed 18 rebounds in the cup");
  assert.equal(stories[0].eyebrow, "Last cup game");
});

test("a player whose games sit under two ids is one storyline, with both ids to link by", () => {
  const stories = recentStandouts(
    [
      game({ playerId: "d1-id", reb: 14 }),
      game({ playerId: "cup-id", leagueId: "CUP", competition: "NBL Mens National Cup 26-27", date: "2026-09-27T20:38:00Z", reb: 18 }),
    ],
    { gameTime: NOW, currentLeagueId: "CUP" },
  );
  assert.equal(stories.length, 1);
  assert.deepEqual(stories[0].player!.playerIds.sort(), ["cup-id", "d1-id"]);
});

test("games that are too old, in the future, or ordinary give nothing", () => {
  assert.equal(recentStandouts([game({ date: "2026-08-01T14:00:00Z" })], { gameTime: NOW, currentLeagueId: "X" }).length, 0);
  assert.equal(recentStandouts([game({ date: "2026-10-19T14:00:00Z" })], { gameTime: NOW, currentLeagueId: "X" }).length, 0);
  assert.equal(recentStandouts([game({ pts: 6, reb: 4, ast: 2 })], { gameTime: NOW, currentLeagueId: "X" }).length, 0);
});

test("only a player's latest game counts, so an old big game doesn't show over a quiet one", () => {
  const stories = recentStandouts([game({ date: "2026-10-10T14:00:00Z", reb: 18 }), game({ date: "2026-10-17T14:00:00Z", reb: 3, pts: 4 })], { gameTime: NOW, currentLeagueId: "X" });
  assert.equal(stories.length, 0);
});

test("storylines are one per player, strongest first, and capped", () => {
  const s = (id: string, priority: number, playerId?: string) => ({ id, kind: "recent" as const, side: "home" as const, eyebrow: "", headline: "", detail: "", priority, player: playerId ? { name: id, playerIds: [playerId] } : undefined });
  const out = finalizeStorylines([s("a", 10, "p1"), s("b", 90, "p1"), s("c", 50), s("d", 70, "p2")], 3);
  assert.deepEqual(out.map((x) => x.id), ["b", "d", "c"]);
});

test("dates read as a short day", () => {
  assert.equal(shortDate("2026-10-17T14:59:00Z"), "Sat 17 Oct");
});

test("team rankings also name the competition", () => {
  const row = (team: string, game: string, pts: number): StorylineTeamRow => ({ team_id: team, name: team, game_key: game, numeric_id: game, tot_spoints: pts });
  const rows = ["A", "B", "C", "D"].flatMap((t, i) => [row(t, `g${i}`, 90 - i * 5), row(["B", "C", "D", "A"][i], `g${i}`, 70)]);
  const stories = buildGameStorylines({ homeTeam: "A", awayTeam: "B", homeId: "A", awayId: "B", teamRows: rows, players: [], competitionName: "NBL Division One 2026-27" });
  const team = stories.find((x) => x.kind === "team");
  if (team) {
    assert.match(team.headline, /in NBL Division One$/);
    assert.match(team.scope!, /^NBL Division One 2026-27 · \d+ games?$/);
  }
});

test("one game isn't enough for a ranking storyline", () => {
  const stories = buildGameStorylines({
    homeTeam: "A", awayTeam: "Birmingham City University Senior Men", homeId: null, awayId: "t1", teamRows: [],
    players: [player({ games_played: 1 })], competitionName: "NBL Division One 2026-27",
  });
  assert.equal(stories.filter((s) => s.kind === "player").length, 0);
});
