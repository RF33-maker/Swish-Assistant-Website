import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { loadLeagueResults } from "@/lib/leagueTables";
import { withoutSeason } from "@/lib/leagueKeys";
import { parseScheduleTime } from "@/lib/scheduleTime";
import { CREATOR_KEY, type CompInfo, type CreatorTeam } from "@/lib/creatorSpace";
import { clubDisplayName, isSameTeam } from "@shared/teamIdentity";
import { gamePath, teamPath } from "@shared/seo";

/**
 * Content ideas about one team a creator works with: its players' numbers,
 * the team's own, and what's going on in the league it plays in. All of it is
 * read from the season's box scores, so every idea is a stat that can be
 * checked on the page it links to. Each is a fact and an angle; the caption
 * stays the creator's.
 */

export interface StatIdea {
  key: string;
  label: string;
  /** The number, short enough to sit on a graphic. */
  stat: string;
  /** The sentence behind it. */
  detail: string;
  /** What to make with it. */
  make: string;
  /** Where the numbers live on Swish. */
  href: string;
}

export interface TeamIdeas {
  /** The team as the league spells it. */
  team: string;
  /** The competition these numbers come from. */
  competition: { id: string; name: string; slug: string };
  record: { w: number; l: number; place: number | null; of: number; pool: string | null } | null;
  players: StatIdea[];
  teamIdeas: StatIdea[];
  league: StatIdea[];
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
const n1 = (v: number) => v.toFixed(1);
const num = (v: unknown) => Number(v ?? 0);
const short = clubDisplayName;
const isCup = (name: string) => /\b(cup|trophy|play-?offs?)\b/i.test(name);
const dayMonth = (iso: string) => parseScheduleTime(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" });
const QUARTER = ["first", "second", "third", "fourth"];

/** Every row of a query, a page at a time (the API caps each at 1,000). */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, maxPages = 4): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * 1000, i * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

interface LogRow {
  game_key: string; team_name: string; game_date: string; hometeam: string; awayteam: string;
  pts: number | null; tpm: number | null; bench_pts: number | null; pitp: number | null; fastbreak_pts: number | null;
  reb: number | null; ast: number | null; stl: number | null;
  p1_score: number | null; p2_score: number | null; p3_score: number | null; p4_score: number | null;
}
interface AvgRow {
  player_name: string; team_name: string; games_played: number;
  avg_pts: number | null; avg_reb: number | null; avg_ast: number | null; avg_stl: number | null; avg_blk: number | null;
  total_pts: number | null; total_tpm: number | null; total_tpa: number | null; season_tp_pct: number | null; avg_plus_minus: number | null;
}
interface BoxRow {
  game_key: string; player_id: string | null; full_name: string; team_name: string;
  spoints: number | null; sreboundstotal: number | null; sassists: number | null;
}
interface Game { key: string; date: string; opponent: string; home: boolean; own: LogRow; opp: LogRow; won: boolean; margin: number }

/**
 * The competition to read a team's numbers from: its league this season (the
 * one it has played most in lately), not a cup run. Falls back to the
 * competition the creator picked the team from.
 */
async function mainCompetition(team: Pick<CreatorTeam, "team_name" | "league_id">, comps: Map<string, CompInfo>): Promise<string | null> {
  if (!team.league_id) return null;
  const picked = comps.get(team.league_id);
  const core = short(team.team_name).replace(/\s+Women$/i, "");
  const { data: rows } = await supabase.from("teams").select("name, league_id").ilike("name", `${core}%`).limit(200);
  const ids = Array.from(
    new Set(
      (rows ?? [])
        .filter((r) => {
          const c = comps.get(r.league_id);
          return c && isSameTeam(r.name, team.team_name) && (!picked || c.women === picked.women);
        })
        .map((r) => r.league_id as string),
    ),
  );
  if (!ids.length) return team.league_id;
  const since = new Date(Date.now() - 75 * 86400e3).toISOString();
  const { data: games } = await supabase.from("game_schedule").select("league_id, hometeam, awayteam").in("league_id", ids).eq("status", "final").gte("matchtime", since).limit(1000);
  const played = new Map<string, number>();
  for (const g of games ?? []) {
    if (isSameTeam(g.hometeam, team.team_name) || isSameTeam(g.awayteam, team.team_name)) played.set(g.league_id, (played.get(g.league_id) ?? 0) + 1);
  }
  const ranked = ids
    .filter((id) => (played.get(id) ?? 0) > 0)
    .sort((a, b) => Number(isCup(comps.get(a)!.name)) - Number(isCup(comps.get(b)!.name)) || (played.get(b) ?? 0) - (played.get(a) ?? 0));
  return ranked[0] ?? team.league_id;
}

/** Place in a list ranked high to low (ties share the higher place). */
const placeOf = <T,>(rows: T[], value: (r: T) => number, mine: T, lowIsBest = false) =>
  1 + rows.filter((r) => (lowIsBest ? value(r) < value(mine) : value(r) > value(mine))).length;

async function loadTeamIdeas(team: Pick<CreatorTeam, "team_name" | "league_id">, comps: Map<string, CompInfo>): Promise<TeamIdeas | null> {
  const leagueId = await mainCompetition(team, comps);
  const comp = leagueId ? comps.get(leagueId) : undefined;
  if (!leagueId || !comp) return null;
  const league = withoutSeason(comp.name);

  const [log, averages, results, highs, upcoming] = await Promise.all([
    allRows<LogRow>((a, b) =>
      supabase
        .from("v_team_game_log")
        .select("game_key, team_name, game_date, hometeam, awayteam, pts, tpm, bench_pts, pitp, fastbreak_pts, reb, ast, stl, p1_score, p2_score, p3_score, p4_score")
        .eq("league_id", leagueId)
        .order("game_date")
        .order("id")
        .range(a, b)),
    allRows<AvgRow>((a, b) =>
      supabase
        .from("v_player_season_averages")
        .select("player_name, team_name, games_played, avg_pts, avg_reb, avg_ast, avg_stl, avg_blk, total_pts, total_tpm, total_tpa, season_tp_pct, avg_plus_minus")
        .eq("league_id", leagueId)
        .order("avg_pts", { ascending: false })
        .range(a, b)),
    loadLeagueResults([leagueId]),
    supabase.from("player_stats").select("game_key, full_name, team_name, spoints").eq("league_id", leagueId).not("spoints", "is", null).order("spoints", { ascending: false }).limit(3),
    supabase.from("game_schedule").select("game_key, matchtime, hometeam, awayteam").eq("league_id", leagueId).eq("status", "scheduled").gte("matchtime", new Date().toISOString()).order("matchtime").limit(200),
  ]);

  // Pair each game's two sides.
  const byGame = new Map<string, LogRow[]>();
  for (const r of log) if (r.pts != null) (byGame.get(r.game_key) ?? byGame.set(r.game_key, []).get(r.game_key)!).push(r);
  const ours = (name: string) => isSameTeam(name, team.team_name);
  const gamesOf = (isTeam: (name: string) => boolean): Game[] => {
    const out: Game[] = [];
    byGame.forEach((pair, key) => {
      if (pair.length !== 2 || pair[0].pts === pair[1].pts) return;
      const own = pair.find((p) => isTeam(p.team_name));
      const opp = pair.find((p) => p !== own);
      if (!own || !opp) return;
      out.push({ key, date: own.game_date, opponent: opp.team_name, home: isSameTeam(own.hometeam, own.team_name), own, opp, won: num(own.pts) > num(opp.pts), margin: num(own.pts) - num(opp.pts) });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  };
  const games = gamesOf(ours);
  if (!games.length) return { team: team.team_name, competition: { id: leagueId, name: comp.name, slug: comp.slug }, record: null, players: [], teamIdeas: [], league: [] };
  const teamName = games[games.length - 1].own.team_name;
  const us = short(teamName);
  const teamHref = teamPath(teamName, comp.slug) ?? `/competition/${comp.slug}`;
  const leagueHref = `/competition/${comp.slug}`;
  const gameHref = (key: string) => gamePath(comp.slug, key);

  // Every team's season in this competition, for ranks.
  const names = Array.from(new Set(log.map((r) => r.team_name)));
  const clubs: string[] = [];
  for (const n of names) if (!clubs.some((c) => isSameTeam(c, n))) clubs.push(n);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const seasons = clubs
    .map((club) => {
      const gs = gamesOf((n) => isSameTeam(n, club));
      return {
        club,
        games: gs.length,
        ppg: avg(gs.map((g) => num(g.own.pts))),
        oppg: avg(gs.map((g) => num(g.opp.pts))),
        tpm: avg(gs.map((g) => num(g.own.tpm))),
        bench: avg(gs.map((g) => num(g.own.bench_pts))),
        paint: avg(gs.map((g) => num(g.own.pitp))),
        fastbreak: avg(gs.map((g) => num(g.own.fastbreak_pts))),
        reb: avg(gs.map((g) => num(g.own.reb))),
        ast: avg(gs.map((g) => num(g.own.ast))),
        stl: avg(gs.map((g) => num(g.own.stl))),
      };
    })
    .filter((s) => s.games >= 2);
  const mine = seasons.find((s) => isSameTeam(s.club, teamName));

  // The table (its own pool's, when the league is split into pools).
  const table = results.tables.find((t) => t.rows.some((r) => isSameTeam(r.team, teamName)));
  const at = table ? table.rows.findIndex((r) => isSameTeam(r.team, teamName)) : -1;
  const row = at >= 0 ? table!.rows[at] : null;
  const where = table?.pool ? `${table.pool} of ${league}` : league;
  const record = row ? { w: row.w, l: row.l, place: at + 1, of: table!.rows.length, pool: table!.pool } : { w: games.filter((g) => g.won).length, l: games.filter((g) => !g.won).length, place: null, of: 0, pool: null };

  // ── The players ─────────────────────────────────────────────────────────
  const { data: boxRows } = await supabase
    .from("player_stats")
    .select("game_key, player_id, full_name, team_name, spoints, sreboundstotal, sassists")
    .eq("league_id", leagueId)
    .in("team_name", Array.from(new Set(games.map((g) => g.own.team_name))))
    .limit(2000);
  const box = ((boxRows ?? []) as BoxRow[]).filter((b) => games.some((g) => g.key === b.game_key));
  const idOf = new Map<string, string>();
  for (const b of box) if (b.player_id && !idOf.has(b.full_name)) idOf.set(b.full_name, b.player_id);
  const playerHref = (name: string) => (idOf.has(name) ? `/player/${idOf.get(name)}` : teamHref);

  const maxGp = Math.max(...averages.map((a) => a.games_played), 1);
  const qualified = averages.filter((a) => a.games_played >= Math.max(2, Math.ceil(maxGp / 2)));
  const squad = averages.filter((a) => ours(a.team_name) && a.games_played >= Math.max(2, Math.ceil(games.length / 2)));
  const rankIn = (a: AvgRow, value: (r: AvgRow) => number) => (qualified.includes(a) ? placeOf(qualified, value, a) : null);
  const rankText = (rank: number | null) => (rank && rank <= 10 ? `, ${rank === 1 ? "the best" : ordinal(rank)} in ${league}` : "");

  const players: Array<StatIdea & { weight: number }> = [];
  const addPlayer = (id: string, label: string, name: string, stat: string, detail: string, make: string, weight: number, href = playerHref(name)) =>
    players.push({ key: `p:${id}:${name}`, label, stat, detail, make, href, weight });

  const leaderOf = (value: (r: AvgRow) => number) => [...squad].sort((a, b) => value(b) - value(a))[0];
  const scorer = leaderOf((r) => num(r.avg_pts));
  if (scorer && num(scorer.avg_pts) > 0) {
    const rank = rankIn(scorer, (r) => num(r.avg_pts));
    addPlayer("pts", "Top scorer", scorer.player_name, `${scorer.player_name}: ${n1(num(scorer.avg_pts))} points a game`,
      `Leads ${us} in scoring over ${scorer.games_played} games${rankText(rank)}.`,
      "A season stat card: your best frame of them with the average across it.", 9 + (rank && rank <= 5 ? 2 : 0));
  }
  const rebounder = leaderOf((r) => num(r.avg_reb));
  if (rebounder && num(rebounder.avg_reb) >= 5) {
    const rank = rankIn(rebounder, (r) => num(r.avg_reb));
    addPlayer("reb", "On the glass", rebounder.player_name, `${rebounder.player_name}: ${n1(num(rebounder.avg_reb))} rebounds a game`,
      `Leads ${us} in rebounding${rankText(rank)}.`,
      "A frame of them above the rim or boxing out, with the number.", 6 + (rank && rank <= 5 ? 2 : 0));
  }
  const creator = leaderOf((r) => num(r.avg_ast));
  if (creator && num(creator.avg_ast) >= 3) {
    const rank = rankIn(creator, (r) => num(r.avg_ast));
    addPlayer("ast", "Playmaker", creator.player_name, `${creator.player_name}: ${n1(num(creator.avg_ast))} assists a game`,
      `Sets the table for ${us}${rankText(rank)}.`,
      "A passing sequence: the look, the pass, the finish, with the assists number on the last frame.", 6 + (rank && rank <= 5 ? 2 : 0));
  }
  for (const [id, label, value, unit] of [["stl", "Defence", (r: AvgRow) => num(r.avg_stl), "steals"], ["blk", "Rim protection", (r: AvgRow) => num(r.avg_blk), "blocks"]] as const) {
    const best = leaderOf(value);
    const rank = best ? rankIn(best, value) : null;
    if (best && rank && rank <= 5 && value(best) >= 1) {
      addPlayer(id, label, best.player_name, `${best.player_name}: ${n1(value(best))} ${unit} a game`, `${rank === 1 ? "The most" : `${ordinal(rank)} most`} in ${league}.`,
        "Defence rarely gets the graphic. A frame of the stop, with the number.", 6);
    }
  }
  const shooter = squad
    .filter((r) => num(r.total_tpa) >= Math.max(10, 2 * r.games_played) && num(r.season_tp_pct) >= 35)
    .sort((a, b) => num(b.season_tp_pct) - num(a.season_tp_pct))[0];
  if (shooter) {
    addPlayer("tp", "Shooter", shooter.player_name, `${shooter.player_name} is shooting ${Math.round(num(shooter.season_tp_pct))}% from three`,
      `${num(shooter.total_tpm)} of ${num(shooter.total_tpa)} this season, the best mark on the team.`,
      "Freeze the release: a shooting-form frame with the percentage.", 7);
  }
  const impact = [...squad].sort((a, b) => num(b.avg_plus_minus) - num(a.avg_plus_minus))[0];
  if (impact && num(impact.avg_plus_minus) >= 4) {
    addPlayer("pm", "Impact", impact.player_name, `${impact.player_name}: +${n1(num(impact.avg_plus_minus))} a game`,
      `The best plus-minus on the team: ${us} outscore opponents by that much with them on the floor.`,
      "The stat behind the eye test. Put it over a frame of them directing traffic.", 5);
  }
  // A round number coming up, close enough to land in the next game.
  for (const r of squad) {
    const total = num(r.total_pts);
    const next = Math.ceil((total + 1) / 100) * 100;
    if (total >= 60 && next - total <= Math.max(6, num(r.avg_pts) * 1.1)) {
      addPlayer("milestone", "Milestone watch", r.player_name, `${r.player_name} is ${next - total} points from ${next}`,
        `${total} points so far this season at ${n1(num(r.avg_pts))} a game, so it could come next time out.`,
        "Be ready for it: the basket that gets them there, then a graphic with the number.", 8);
    }
  }
  // From the box scores: the season high, the last game, double-doubles, and anyone who scores every night.
  const gameByKey = new Map(games.map((g) => [g.key, g]));
  const high = [...box].sort((a, b) => num(b.spoints) - num(a.spoints))[0];
  if (high && num(high.spoints) >= 15) {
    const g = gameByKey.get(high.game_key)!;
    addPlayer("high", "Season high", high.full_name, `${high.full_name}: ${num(high.spoints)} v ${short(g.opponent)}`,
      `The most points by a ${us} player in a game this season, on ${dayMonth(g.date)}.`,
      "A throwback to the night: your best frame from that game with the points across it.", 7, gameHref(g.key));
  }
  const last = games[games.length - 1];
  const lastTop = box.filter((b) => b.game_key === last.key).sort((a, b) => num(b.spoints) - num(a.spoints))[0];
  if (lastTop && num(lastTop.spoints) >= 10) {
    const line = [`${num(lastTop.spoints)} PTS`, num(lastTop.sreboundstotal) >= 5 ? `${num(lastTop.sreboundstotal)} REB` : null, num(lastTop.sassists) >= 5 ? `${num(lastTop.sassists)} AST` : null].filter(Boolean).join(" · ");
    addPlayer("last", "Last time out", lastTop.full_name, `${lastTop.full_name}: ${line}`,
      `Led ${us} in the ${num(last.own.pts)}–${num(last.opp.pts)} ${last.won ? "win over" : "loss to"} ${short(last.opponent)} on ${dayMonth(last.date)}.`,
      "Player of the game: one image with the stat line.", 10, gameHref(last.key));
  }
  const byPlayer = new Map<string, BoxRow[]>();
  for (const b of box) (byPlayer.get(b.full_name) ?? byPlayer.set(b.full_name, []).get(b.full_name)!).push(b);
  byPlayer.forEach((rows, name) => {
    const doubles = rows.filter((b) => [num(b.spoints), num(b.sreboundstotal), num(b.sassists)].filter((v) => v >= 10).length >= 2).length;
    if (doubles >= 2) {
      addPlayer("dd", "Double-doubles", name, `${name}: ${doubles} double-doubles in ${rows.length} games`, `Nobody on the team fills the box score like it.`,
        "A two-stat graphic: points and rebounds (or assists) side by side, game by game.", 6);
    }
    if (rows.length >= 4 && rows.length >= games.length - 1 && rows.every((b) => num(b.spoints) >= 10) && name !== scorer?.player_name) {
      addPlayer("every", "Every night", name, `${name} has scored 10+ in all ${rows.length} games`, `Double figures every time they've played this season.`,
        "A grid: one frame per game with the points on each.", 5);
    }
  });

  // ── The team ────────────────────────────────────────────────────────────
  const teamIdeas: Array<StatIdea & { weight: number }> = [];
  const addTeam = (id: string, label: string, stat: string, detail: string, make: string, weight: number, href = teamHref) =>
    teamIdeas.push({ key: `t:${id}`, label, stat, detail, make, href, weight });

  const form = games.slice(-5).map((g) => (g.won ? "W" : "L")).join(" ");
  addTeam("record", "The season so far", `${us} are ${record.w}–${record.l}`,
    `${record.place ? `${ordinal(record.place)} of ${record.of} in ${where}. ` : ""}Last ${Math.min(5, games.length)}: ${form}.`,
    "A standings-style graphic: the record big, the form guide underneath.", 10);
  {
    const q4 = last.own.p4_score != null && last.opp.p4_score != null ? ` They ${num(last.own.p4_score) >= num(last.opp.p4_score) ? "won" : "lost"} the fourth quarter ${num(last.own.p4_score)}–${num(last.opp.p4_score)}.` : "";
    addTeam("latest", "Latest result", `${us} ${num(last.own.pts)}–${num(last.opp.pts)} ${short(last.opponent)}`,
      `${last.won ? `A ${last.margin}-point win` : `A ${-last.margin}-point loss`} ${last.home ? "at home" : "on the road"} on ${dayMonth(last.date)}.${q4}`,
      "A result graphic: the final score over your best frame of the night, quarter scores underneath.", 9.5, gameHref(last.key));
  }
  let run = 0;
  for (let i = games.length - 1; i >= 0 && games[i].won; i--) run++;
  if (run >= 3) {
    addTeam("streak", "Win streak", `${run} wins in a row`, `${us} haven't lost since ${run < games.length ? dayMonth(games[games.length - run - 1].date) : "the season started"}.`,
      "One frame from each win, in order, ending on the number.", 9);
  }
  if (mine && seasons.length >= 4) {
    const of = seasons.length;
    const scoring = placeOf(seasons, (s) => s.ppg, mine);
    addTeam("ppg", "Scoring", `${n1(mine.ppg)} points a game`, `${scoring === 1 ? "The highest-scoring team" : `The ${ordinal(scoring)}-highest scoring team`} in ${league} (of ${of}).`,
      "Pair the number with a fast-break or bench-celebration frame.", scoring <= 3 ? 8 : 4);
    const defence = placeOf(seasons, (s) => s.oppg, mine, true);
    if (defence <= Math.ceil(of / 2)) {
      addTeam("oppg", "Defence", `${n1(mine.oppg)} points allowed a game`, `${defence === 1 ? "The best defence" : `The ${ordinal(defence)}-best defence`} in ${league}.`,
        "A defensive-stance or contested-shot frame with the number.", defence <= 3 ? 8 : 4);
    }
    // What they do better than almost anyone.
    const strengths: Array<[string, string, (s: NonNullable<typeof mine>) => number, string, string]> = [
      ["tpm", "From deep", (s) => s.tpm, "threes a game", "A shooter's frame: the release, the ball in the air."],
      ["bench", "The bench", (s) => s.bench, "bench points a game", "The second unit together, with the number. They rarely get the post."],
      ["paint", "In the paint", (s) => s.paint, "points in the paint a game", "A finish at the rim with the number."],
      ["fastbreak", "On the break", (s) => s.fastbreak, "fast-break points a game", "A sequence from steal to finish."],
      ["reb", "On the glass", (s) => s.reb, "rebounds a game", "A crowd under the rim, one of yours coming down with it."],
      ["ast", "Ball movement", (s) => s.ast, "assists a game", "The extra pass: a two-frame post, pass then shot."],
      ["stl", "Pressure", (s) => s.stl, "steals a game", "Hands in the passing lane, with the number."],
    ];
    for (const [id, label, value, unit, make] of strengths) {
      const rank = placeOf(seasons, value, mine);
      if (rank <= 3 && value(mine) > 0) addTeam(id, label, `${n1(value(mine))} ${unit}`, `${rank === 1 ? "The most" : `The ${ordinal(rank)} most`} in ${league}.`, make, rank === 1 ? 7 : 5);
    }
  }
  const biggest = [...games].filter((g) => g.won).sort((a, b) => b.margin - a.margin)[0];
  if (biggest && biggest.margin >= 10) {
    addTeam("biggest", "Biggest win", `${biggest.margin}-point win over ${short(biggest.opponent)}`, `${num(biggest.own.pts)}–${num(biggest.opp.pts)} on ${dayMonth(biggest.date)}, the widest margin of the season.`,
      "A result graphic from that night: the score over your best frame.", 5, gameHref(biggest.key));
  }
  const top = [...games].sort((a, b) => num(b.own.pts) - num(a.own.pts))[0];
  if (top && num(top.own.pts) >= 95 && top !== biggest) {
    addTeam("high", "Season high", `${num(top.own.pts)} points v ${short(top.opponent)}`, `The most ${us} have scored in a game this season, on ${dayMonth(top.date)}.`,
      "The scoreboard frame, if you have it, or the bench reaction.", 5, gameHref(top.key));
  }
  const quarters = ([1, 2, 3, 4] as const).map((q) => {
    const withQ = games.filter((g) => g.own[`p${q}_score`] != null && g.opp[`p${q}_score`] != null);
    return { q, n: withQ.length, own: avg(withQ.map((g) => num(g.own[`p${q}_score`]))), opp: avg(withQ.map((g) => num(g.opp[`p${q}_score`]))) };
  });
  const bestQ = quarters.filter((x) => x.n >= 3).sort((a, b) => b.own - b.opp - (a.own - a.opp))[0];
  if (bestQ && bestQ.own - bestQ.opp >= 2) {
    addTeam("quarter", "Their quarter", `${QUARTER[bestQ.q - 1][0].toUpperCase()}${QUARTER[bestQ.q - 1].slice(1)} quarters: +${n1(bestQ.own - bestQ.opp)} a game`,
      `${us} win the ${QUARTER[bestQ.q - 1]} quarter ${n1(bestQ.own)}–${n1(bestQ.opp)} on average across ${bestQ.n} games.`,
      bestQ.q === 4 ? "Closers: late-game frames, the clock in shot if you can." : "A quarter-by-quarter bar graphic with theirs picked out.", 6);
  }
  const home = games.filter((g) => g.home);
  if (home.length >= 3 && home.filter((g) => g.won).length / home.length >= 0.75) {
    addTeam("home", "At home", `${home.filter((g) => g.won).length}–${home.filter((g) => !g.won).length} at home`, `${us} have made their own floor hard to win on.`,
      "The crowd, the bench, the building: a home-court post.", 5);
  }

  // ── Around the league ───────────────────────────────────────────────────
  const leagueIdeas: Array<StatIdea & { weight: number }> = [];
  const addLeague = (id: string, label: string, stat: string, detail: string, make: string, weight: number, href = leagueHref) =>
    leagueIdeas.push({ key: `l:${id}`, label, stat, detail, make, href, weight });

  const nextGame = (upcoming.data ?? []).find((g) => ours(g.hometeam) || ours(g.awayteam));
  if (nextGame) {
    const opp = ours(nextGame.hometeam) ? nextGame.awayteam : nextGame.hometeam;
    const oppRow = table?.rows.find((r) => isSameTeam(r.team, opp));
    const oppPlace = oppRow ? table!.rows.indexOf(oppRow) + 1 : null;
    const oppStar = averages.filter((a) => isSameTeam(a.team_name, opp) && a.games_played >= 2)[0];
    const oppSeason = seasons.find((s) => isSameTeam(s.club, opp));
    addLeague("next", "Next up", `${short(opp)}${oppRow ? ` (${oppRow.w}–${oppRow.l}${oppPlace ? `, ${ordinal(oppPlace)}` : ""})` : ""}`,
      [
        `${ours(nextGame.hometeam) ? "At home" : "Away"} on ${dayMonth(nextGame.matchtime)}.`,
        oppStar ? `Their top scorer is ${oppStar.player_name} at ${n1(num(oppStar.avg_pts))} a game.` : "",
        mine && oppSeason ? `${us} score ${n1(mine.ppg)} a game to their ${n1(oppSeason.ppg)}.` : "",
      ].filter(Boolean).join(" "),
      "A gameday graphic: both badges, tip-off time, each record underneath. Or a head-to-head of the two top scorers.", 10, gameHref(nextGame.game_key));
  }
  if (table && row) {
    const leader = table.rows[0];
    if (at === 0) {
      const second = table.rows[1];
      addLeague("top", "Top of the table", `${us} lead ${where}`, second ? `${short(second.team)} are next at ${second.w}–${second.l}.` : "", "A top-of-the-table graphic. Earned, so post it.", 9);
    } else {
      addLeague("top", "Top of the table", `${short(leader.team)} lead at ${leader.w}–${leader.l}`, `${us} are ${row.w - leader.w === 0 ? "level on wins" : `${leader.w - row.w} ${leader.w - row.w === 1 ? "win" : "wins"} back`} in ${ordinal(at + 1)}.`,
        "A table graphic with your team picked out.", 6);
    }
    const above = at > 0 ? table.rows[at - 1] : null;
    const below = at < table.rows.length - 1 ? table.rows[at + 1] : null;
    if (above || below) {
      addLeague("race", "The race", [above ? `${short(above.team)} ${above.w}–${above.l}` : null, `${us} ${row.w}–${row.l}`, below ? `${short(below.team)} ${below.w}–${below.l}` : null].filter(Boolean).join(" · "),
        `${[above ? `${short(above.team)} sit just above` : null, below ? `${short(below.team)} just below` : null].filter(Boolean).join(", ")} in ${where}.`,
        "A three-row slice of the table: who they're chasing and who's chasing them.", 5);
    }
  }
  const board = (label: string, id: string, value: (r: AvgRow) => number, unit: string) => {
    const ranked = [...qualified].sort((a, b) => value(b) - value(a));
    const first = ranked[0];
    if (!first || value(first) <= 0) return;
    const ourBest = ranked.findIndex((r) => ours(r.team_name));
    const theirs = ourBest >= 0 && ourBest < 10 ? ` ${ranked[ourBest].player_name} is ${ourBest === 0 ? "top" : ordinal(ourBest + 1)} for ${us}.` : "";
    addLeague(id, label, `${first.player_name}: ${n1(value(first))} ${unit}`,
      `${ours(first.team_name) ? `One of yours leads ${league}` : `The ${short(first.team_name)} player tops ${league}`}${ranked[1] ? `, ahead of ${ranked[1].player_name} (${n1(value(ranked[1]))})` : ""}.${ourBest > 0 ? theirs : ""}`,
      "A leaderboard graphic: the top five, with your player's place marked.", ourBest >= 0 && ourBest < 5 ? 8 : 5, `${leagueHref}?tab=stats`);
  };
  board("Scoring race", "lead-pts", (r) => num(r.avg_pts), "points a game");
  board("Rebounding race", "lead-reb", (r) => num(r.avg_reb), "rebounds a game");
  board("Assist race", "lead-ast", (r) => num(r.avg_ast), "assists a game");
  const leagueHigh = (highs.data ?? [])[0];
  if (leagueHigh && num(leagueHigh.spoints) >= 25) {
    addLeague("high", "League high", `${leagueHigh.full_name}: ${num(leagueHigh.spoints)} points`,
      `The most by anyone in a ${league} game this season, for ${short(leagueHigh.team_name)}.${high && !ours(leagueHigh.team_name) ? ` The best for ${us} is ${high.full_name}'s ${num(high.spoints)}.` : ""}`,
      ours(leagueHigh.team_name) ? "Your player owns the league's best night. That's a post on its own." : "A 'the number to beat' post ahead of your next game.", ours(leagueHigh.team_name) ? 9 : 4, gameHref(leagueHigh.game_key));
  }
  const bestAttack = [...seasons].sort((a, b) => b.ppg - a.ppg)[0];
  if (bestAttack && !isSameTeam(bestAttack.club, teamName) && seasons.length >= 4) {
    addLeague("attack", "League landscape", `${short(bestAttack.club)}: ${n1(bestAttack.ppg)} points a game`, `The highest-scoring team in ${league}.${mine ? ` ${us} are at ${n1(mine.ppg)}.` : ""}`,
      "A scoring chart of the league with your team's bar picked out.", 3);
  }

  const strip = (xs: Array<StatIdea & { weight: number }>, max: number): StatIdea[] =>
    [...xs].sort((a, b) => b.weight - a.weight).slice(0, max).map(({ weight: _w, ...idea }) => idea);
  return {
    team: teamName,
    competition: { id: leagueId, name: comp.name, slug: comp.slug },
    record,
    players: strip(players, 10),
    teamIdeas: strip(teamIdeas, 9),
    league: strip(leagueIdeas, 8),
  };
}

/** This season's content ideas for one of a creator's teams. */
export function useTeamIdeas(team: Pick<CreatorTeam, "team_name" | "league_id"> | undefined, comps: Map<string, CompInfo> | undefined) {
  return useQuery({
    queryKey: [...CREATOR_KEY, "team-ideas", team?.team_name, team?.league_id],
    enabled: !!team && !!comps,
    staleTime: 10 * 60 * 1000,
    queryFn: () => loadTeamIdeas(team!, comps!),
  });
}
