// Swish+ clutch maths. Run: npx tsx --test scripts/clutch.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clockSeconds, computeClutchStats, parseScore, teamClutchMetrics, timeline, type ClutchEvent, type ClutchMember, type ClutchStint, type Trust } from "../server/clutch";

const G = "G1";
const H = "home";
const A = "away";
let n = 0;
const ev = (o: Partial<ClutchEvent>): ClutchEvent => ({
  game_key: G, team_id: null, action_number: ++n, period: 4, period_type: "REGULAR", clock: "05:00:00",
  shirt_number: null, player_name: null, action_type: null, sub_type: null, success: null, score: null, team_no: null, ...o,
});
const shot = (team: string, shirt: string, name: string, type: "2pt" | "3pt" | "freethrow", made: boolean, clock: string, score: string, period = 4, period_type = "REGULAR") =>
  ev({ team_id: team, team_no: team === H ? 1 : 2, shirt_number: shirt, player_name: name, action_type: type, success: made, clock, score, period, period_type });

const all = (keys: string[]) => new Set(keys);
const everything: Trust = { teamTotals: all([`${G}|${H}`, `${G}|${A}`]), lineups: all([`${G}|${H}`, `${G}|${A}`]), credit: all([`${G}|${H}`, `${G}|${A}`]) };

function game() {
  n = 0;
  const events: ClutchEvent[] = [
    ev({ period: 1, clock: "10:00:00", action_type: "period", sub_type: "start" }),
    shot(H, "1", "A. One", "2pt", true, "09:00:00", "2-0", 1),
    ev({ period: 4, clock: "10:00:00", action_type: "period", sub_type: "start", score: "70-68" }),
    shot(A, "11", "K. Eleven", "3pt", true, "06:00:00", "70-71"), // not clutch: more than 5 minutes left
    shot(H, "2", "B. Two", "2pt", true, "04:30:00", "72-71"), // clutch: within 5 before (-1)
    ev({ team_id: H, team_no: 1, action_type: "substitution", sub_type: "out", shirt_number: "2", player_name: "B. Two", clock: "04:00:00", score: "72-71" }),
    ev({ team_id: H, team_no: 1, action_type: "substitution", sub_type: "in", shirt_number: "6", player_name: "F. Six", clock: "04:00:00", score: "72-71" }),
    shot(H, "6", "F. Six", "3pt", true, "03:00:00", "75-71"), // clutch, F. Six on court
    shot(A, "11", "K. Eleven", "2pt", false, "02:00:00", "75-71"),
    ev({ team_id: H, team_no: 1, shirt_number: "1", player_name: "A. One", action_type: "rebound", sub_type: "defensive", clock: "01:58:00", score: "75-71" }),
    shot(H, "1", "A. One", "2pt", true, "01:00:00", "77-71"), // clutch: margin 4 before
    shot(A, "12", "L. Twelve", "3pt", true, "00:30:00", "77-74"), // not clutch: margin 6 before
    ev({ period: 4, clock: "00:00:00", action_type: "period", sub_type: "end", score: "77-74" }),
  ];
  // Home lineups: stint 1 to the substitution (action 7 = "in"), stint 2 after.
  const subOut = events.find((e) => e.action_type === "substitution" && e.sub_type === "in")!.action_number;
  const last = events[events.length - 1].action_number;
  const stints: ClutchStint[] = [
    { id: "h1", game_key: G, team_id: H, start_action: 1, end_action: subOut },
    { id: "h2", game_key: G, team_id: H, start_action: subOut, end_action: last },
    { id: "a1", game_key: G, team_id: A, start_action: 1, end_action: last },
  ];
  const mem = (stint: string, shirts: string[], names: string[]): ClutchMember[] =>
    shirts.map((s, i) => ({ stint_id: stint, shirt_number: s, player_name: names[i], player_id: `${stint}-${s}` }));
  const members = [
    ...mem("h1", ["1", "2", "3", "4", "5"], ["Al One", "Bo Two", "Cy Three", "Di Four", "Ed Five"]),
    ...mem("h2", ["1", "6", "3", "4", "5"], ["Al One", "Fi Six", "Cy Three", "Di Four", "Ed Five"]),
    ...mem("a1", ["11", "12", "13", "14", "15"], ["Ka Eleven", "Lu Twelve", "Mo Thirteen", "Ni Fourteen", "Ol Fifteen"]),
  ];
  return { events, stints, members };
}

test("clock and score parsing", () => {
  assert.equal(clockSeconds("04:30:50"), 270.5);
  assert.equal(clockSeconds("10:00"), 600);
  assert.equal(clockSeconds(""), null);
  assert.deepEqual(parseScore("61-57"), [61, 57]);
  assert.equal(parseScore(null), null);
});

test("only the last five minutes with the score within five count", () => {
  const { events, stints, members } = game();
  const r = computeClutchStats(events, stints, members, everything);
  const home = teamClutchMetrics(r.teams.get(H)!);
  const away = teamClutchMetrics(r.teams.get(A)!);
  // Home clutch points: 2 (4:30) + 3 (3:00) + 2 (1:00) = 7. Away: none (the 0:30 three came at 6 down).
  assert.equal(home.pf, 7);
  assert.equal(home.pa, 0);
  assert.equal(away.pf, 0);
  assert.equal(home.wins, 1);
  assert.equal(away.losses, 1);
  // Clutch time runs from 5:00 until the lead reached 6 at 1:00 (240s), then again from the 0:30
  // three, which brought it back within five, to the buzzer (30s).
  assert.equal(Math.round(home.minutes * 60), 270);
  assert.equal(Math.round(away.minutes * 60), 270);
});

test("on-court minutes and +/- follow the substitution", () => {
  const { events, stints, members } = game();
  const r = computeClutchStats(events, stints, members, everything);
  const p = (key: string) => r.players.get(`${H}|${key}`);
  // Two: on from 5:00 to 4:00 = 60s, +2. Six: 4:00 to 1:00 and 0:30 to 0:00 = 210s, +5. One: all 270s, +7.
  assert.equal(Math.round(p("b two")!.secs), 60);
  assert.equal(p("b two")!.onPf, 2);
  assert.equal(Math.round(p("f six")!.secs), 210);
  assert.equal(p("f six")!.onPf, 5);
  assert.equal(Math.round(p("a one")!.secs), 270);
  assert.equal(p("a one")!.onPf, 7);
  // Five on the floor all the time: the team's seconds times five.
  const homeSecs = Array.from(r.players.values()).filter((x) => x.team_id === H).reduce((a, x) => a + x.secs, 0);
  assert.equal(Math.round(homeSecs), 5 * 270);
});

test("a player's own clutch line", () => {
  const { events, stints, members } = game();
  const r = computeClutchStats(events, stints, members, everything);
  const one = r.players.get(`${H}|a one`)!;
  assert.equal(one.pts, 2); // the 9:00 first-quarter basket doesn't count
  assert.equal(one.fga, 1);
  assert.equal(one.reb, 1);
  const eleven = r.players.get(`${A}|k eleven`)!;
  assert.equal(eleven.fga, 1); // the 2:00 miss; the 6:00 three wasn't clutch
  assert.equal(eleven.fgm, 0);
});

test("untrusted games are left out of the parts they can't support", () => {
  const { events, stints, members } = game();
  const none = new Set<string>();
  const r = computeClutchStats(events, stints, members, { teamTotals: everything.teamTotals, lineups: none, credit: none });
  assert.equal(teamClutchMetrics(r.teams.get(H)!).pf, 7);
  assert.ok(Array.from(r.players.values()).every((p) => p.secs === 0 && p.pts === 0));
});

test("every basket lands in the stint that was on the floor", () => {
  const { events, stints, members } = game();
  const r = computeClutchStats(events, stints, members, everything);
  // h1: 2 (Q1) + 2 (4:30) = 4; h2: 3 + 2 = 5; a1: 3 + 3 = 6.
  assert.equal(r.stintPoints.get("h1"), 4);
  assert.equal(r.stintPoints.get("h2"), 5);
  assert.equal(r.stintPoints.get("a1"), 6);
});

test("overtime counts in full when close", () => {
  n = 0;
  const events: ClutchEvent[] = [
    ev({ period: 4, clock: "00:00:00", action_type: "period", sub_type: "end", score: "80-80" }),
    shot(H, "1", "A. One", "2pt", true, "04:59:00", "82-80", 1, "OVERTIME"),
    shot(A, "11", "K. Eleven", "2pt", true, "00:10:00", "82-82", 1, "OVERTIME"),
  ];
  const r = computeClutchStats(events, [], [], everything);
  assert.equal(teamClutchMetrics(r.teams.get(H)!).pf, 2);
  assert.equal(teamClutchMetrics(r.teams.get(A)!).pf, 2);
});

test("overtime that restarts at period 1 with no type is still overtime, and sorts last", () => {
  n = 0;
  const start = (period: number, clock: string) => ev({ period, period_type: null, clock, action_type: "period", sub_type: "start" });
  const events: ClutchEvent[] = [
    start(1, "10:00:00"),
    shot(H, "1", "A. One", "2pt", true, "09:00:00", "2-0", 1, null as unknown as string),
    start(4, "10:00:00"),
    shot(A, "11", "K. Eleven", "2pt", true, "00:05:00", "70-70", 4, null as unknown as string),
    start(1, "05:00:00"), // overtime, numbered 1 again
    shot(H, "1", "A. One", "3pt", true, "04:00:00", "73-70", 1, null as unknown as string),
  ];
  const t = timeline(events);
  const ot = events[events.length - 1];
  assert.ok(t.isOvertime(t.seg(ot)));
  assert.equal(t.evs[t.evs.length - 1], ot);
  assert.equal(t.seg(events[1]), 1); // the first-quarter basket stays in the first quarter
  const r = computeClutchStats(events, [], [], everything);
  // Both the 0:05 Q4 basket and the overtime three count.
  assert.equal(teamClutchMetrics(r.teams.get(H)!).pf, 3);
  assert.equal(teamClutchMetrics(r.teams.get(A)!).pf, 2);
});

test("two teammates sharing an initial and surname are told apart by full name", () => {
  const { events, stints, members } = game();
  // Home's 3 and 4 become sisters: "Sayomi Same" and "Solomi Same" (both "s same").
  for (const m of members) {
    if (m.stint_id.startsWith("h") && m.shirt_number === "3") m.player_name = "Sayomi Same";
    if (m.stint_id.startsWith("h") && m.shirt_number === "4") m.player_name = "Solomi Same";
  }
  const r = computeClutchStats(events, stints, members, everything);
  const sisters = Array.from(r.players.values()).filter((p) => p.team_id === H && p.key.startsWith("s same"));
  assert.equal(sisters.length, 2);
  // Each was on for all 270 clutch seconds; neither gets the other's time.
  for (const p of sisters) assert.equal(Math.round(p.secs), 270);
  assert.equal(r.leftOut.lineups.size, 0);
});

test("a shared name given only as an initial leaves that team-game's lineups out, not half-counted", () => {
  const { events, stints, members } = game();
  for (const m of members) {
    if (m.stint_id === "h1" && m.shirt_number === "3") m.player_name = "Sayomi Same";
    if (m.stint_id === "h1" && m.shirt_number === "4") m.player_name = "Solomi Same";
    if (m.stint_id === "h2" && m.shirt_number === "3") {
      m.player_name = "S. Same"; // and no shirt, so it can't be matched within the game either
      m.shirt_number = null;
    }
    if (m.stint_id === "h2" && m.shirt_number === "4") m.player_name = "Solomi Same";
  }
  const r = computeClutchStats(events, stints, members, everything);
  assert.ok(r.leftOut.lineups.has(`${G}|${H}`));
  const homeSecs = Array.from(r.players.values()).filter((p) => p.team_id === H).reduce((a, p) => a + p.secs, 0);
  assert.equal(homeSecs, 0);
  // The team's own clutch numbers don't depend on lineups.
  assert.equal(teamClutchMetrics(r.teams.get(H)!).pf, 7);
});

test("one player entered twice in a stint counts once", () => {
  const { events, stints, members } = game();
  members.push({ stint_id: "h1", shirt_number: null, player_name: "A. One", player_id: "stub" });
  members.push({ stint_id: "h2", shirt_number: null, player_name: "A. One", player_id: "stub" });
  const r = computeClutchStats(events, stints, members, everything);
  const one = r.players.get(`${H}|a one`)!;
  assert.equal(Math.round(one.secs), 270);
  assert.equal(one.onPf, 7);
  assert.equal(r.leftOut.lineups.size, 0);
});

test("an initial-only row with a shirt takes the full name worn with that shirt in the same game", () => {
  const { events, stints, members } = game();
  for (const m of members) {
    if (m.stint_id === "h1" && m.shirt_number === "3") m.player_name = "Sayomi Same";
    if (m.stint_id === "h1" && m.shirt_number === "4") m.player_name = "Solomi Same";
    if (m.stint_id === "h2" && m.shirt_number === "3") m.player_name = "S. Same"; // shirt 3 = Sayomi in this game
    if (m.stint_id === "h2" && m.shirt_number === "4") m.player_name = "Solomi Same";
  }
  const r = computeClutchStats(events, stints, members, everything);
  assert.equal(r.leftOut.lineups.size, 0);
  assert.equal(Math.round(r.players.get(`${H}|s same#sayomi same`)!.secs), 270);
  assert.equal(Math.round(r.players.get(`${H}|s same#solomi same`)!.secs), 270);
});
