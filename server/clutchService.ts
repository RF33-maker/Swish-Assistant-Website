import { supabaseAdmin } from "./supabaseServiceClient";
import { playerNameKey, reliableTeamGames, type BoxRow, type StintRow, type TeamPointsRow } from "./lineups";
import { bySurname, CACHE_TTL_MS, findClub, memberDescriber, readAll, round1 } from "./lineupsService";
import {
  computeClutchStats,
  playByPlayPoints,
  teamClutchMetrics,
  type ClutchEvent,
  type ClutchMember,
  type ClutchResult,
  type ClutchStint,
  type Trust,
} from "./clutch";

/**
 * Swish+ clutch numbers for a competition: reads the play-by-play and lineup stints once, works out
 * which team-games can be trusted, and keeps the result briefly (each team page asks for the same
 * competition).
 */

const EVENT_COLS = "id,game_key,team_id,action_number,period,period_type,clock,shirt_number,player_name,action_type,sub_type,success,score,team_no";
const MEMBER_COLS =
  "id,stint_id,game_key,team_id,player_id,player_name,shirt_number,seconds_played,points_for,points_against,possessions_for,possessions_against";

type Loaded = {
  result: ClutchResult;
  trust: Trust;
  /** Every team-game with play-by-play ("gameKey|teamId"). */
  teamGames: Set<string>;
  stintTeamIds: string[];
  /** For the data check: each stint's recorded points. */
  stintRecorded: Map<string, number>;
};

const cache = new Map<string, { at: number; value: Promise<Loaded> }>();

async function load(leagueIds: string[]): Promise<Loaded> {
  // One read at a time: these are the biggest tables, and reading them together can hit the
  // database's statement timeout.
  const events = await readAll<ClutchEvent>("live_events", EVENT_COLS, leagueIds, 400000);
  const stints = await readAll<ClutchStint & { points_for: number | null }>("lineup_stints", "id,game_key,team_id,start_action,end_action,points_for", leagueIds, 60000);
  const members = await readAll<ClutchMember & StintRow>("player_on_court_stints", MEMBER_COLS, leagueIds, 300000);
  const box = await readAll<BoxRow & { full_name: string | null; spoints: number | null }>("player_stats", "id,game_key,team_id,sminutes,full_name,spoints", leagueIds, 80000);
  const points = await readAll<TeamPointsRow>("team_stats", "id,game_key,team_id,tot_spoints", leagueIds, 20000);

  // Lineups: the same rule as the lineup panels.
  const lineups = reliableTeamGames(members, box, points).reliable;

  // Team totals and per-player credit against the box score, players matched by name key.
  const pbp = playByPlayPoints(events);
  const finalPoints = new Map(points.map((p) => [`${p.game_key}|${p.team_id}`, Number(p.tot_spoints) || 0]));
  const boxByName = new Map<string, Map<string, number>>();
  for (const b of box) {
    const who = playerNameKey(b.full_name);
    if (!who) continue;
    const k = `${b.game_key}|${b.team_id}`;
    const m = boxByName.get(k) ?? new Map<string, number>();
    m.set(who, (m.get(who) || 0) + (Number(b.spoints) || 0));
    boxByName.set(k, m);
  }
  const teamGames = new Set<string>();
  for (const e of events) if (e.team_id) teamGames.add(`${e.game_key}|${e.team_id}`);
  const teamTotals = new Set<string>();
  const credit = new Set<string>();
  teamGames.forEach((k) => {
    const mine = pbp.get(k) ?? new Map<string, number>();
    const sum = Array.from(mine.values()).reduce((a, b) => a + b, 0);
    const final = finalPoints.get(k);
    if (final == null || sum !== final) return;
    teamTotals.add(k);
    const boxed = boxByName.get(k);
    if (!boxed) return;
    const people = new Set([...Array.from(mine.keys()), ...Array.from(boxed.keys())]);
    if (Array.from(people).every((who) => (mine.get(who) || 0) === (boxed.get(who) || 0))) credit.add(k);
  });

  const trust: Trust = { teamTotals, lineups, credit };
  const result = computeClutchStats(events, stints, members, trust);

  // Win or loss from the box score's final score (the play-by-play can stop short).
  const byGame = new Map<string, { team_id: string; pts: number }[]>();
  for (const p of points) byGame.set(p.game_key, [...(byGame.get(p.game_key) ?? []), { team_id: p.team_id, pts: Number(p.tot_spoints) || 0 }]);
  result.teams.forEach((t) => {
    let wins = 0;
    let losses = 0;
    t.games.forEach((g) => {
      const rows = byGame.get(g) ?? [];
      const mine = rows.find((r) => r.team_id === t.team_id);
      const theirs = rows.find((r) => r.team_id !== t.team_id);
      if (!mine || !theirs) return;
      if (mine.pts > theirs.pts) wins += 1;
      else if (mine.pts < theirs.pts) losses += 1;
    });
    t.wins = wins;
    t.losses = losses;
  });
  return {
    result,
    trust,
    teamGames,
    stintTeamIds: Array.from(new Set(stints.map((s) => s.team_id))),
    stintRecorded: new Map(stints.map((s) => [String(s.id), Number(s.points_for) || 0])),
  };
}

export function cachedClutch(leagueIds: string[]): Promise<Loaded> {
  const key = Array.from(leagueIds).sort().join(",");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;
  const value = load(leagueIds);
  cache.set(key, { at: now, value });
  value.catch(() => cache.delete(key));
  if (cache.size > 12) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return value;
}

/**
 * A teammate told apart by shirt (two players share an initial and surname): the roster lookup by
 * name key can't say which one, so use the fullest name the feed gave them and their own id.
 */
function sharedKeyPlayer(p: { key: string; names: Map<string, number>; ids: Map<string, number> }, formatName: (n: string) => string) {
  const isInitial = (n: string) => (n.trim().split(/\s+/)[0] || "").replace(".", "").length <= 1;
  const names = Array.from(p.names.entries()).sort((a, b) => (isInitial(a[0]) ? 1 : 0) - (isInitial(b[0]) ? 1 : 0) || b[1] - a[1]);
  const name = names[0]?.[0] ?? p.key.split("#")[0];
  const id = Array.from(p.ids.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? p.key;
  return { key: p.key, id, name: formatName(name.replace(/\s+/g, " ").trim()), photoUrl: null as string | null, photoFocusY: 50 };
}

const pct = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 10);

/** Clutch numbers for one team, its players, and where it ranks in the competition. */
export async function computeTeamClutch(o: { leagueIds: string[]; leagueName: string; rootLeagueId: string; teamName: string; formatName: (n: string) => string }) {
  const { result, trust, teamGames, stintTeamIds } = await cachedClutch(o.leagueIds);
  const eventTeamIds = Array.from(new Set(Array.from(teamGames).map((k) => k.split("|")[1])));
  const clubRows = await findClub(o.leagueIds, Array.from(new Set([...stintTeamIds, ...eventTeamIds])), o.teamName);
  const clubIds = new Set(clubRows.map((t) => t.team_id));

  // The whole competition, for ranks.
  const ids = Array.from(result.teams.keys());
  const { data: nameRows } = ids.length ? await supabaseAdmin.from("teams").select("team_id, name").in("team_id", ids) : { data: [] };
  const names = new Map(((nameRows || []) as { team_id: string; name: string }[]).map((t) => [t.team_id, t.name]));
  const league = ids
    .map((id) => {
      const m = teamClutchMetrics(result.teams.get(id)!);
      return { team_id: id, name: names.get(id) || "Unknown", games: m.games, wins: m.wins, losses: m.losses, minutes: round1(m.minutes), plusMinus: m.plusMinus, net: round1(m.net) };
    })
    .filter((t) => t.games > 0)
    .sort((a, b) => (b.net ?? -Infinity) - (a.net ?? -Infinity));

  const teamId = clubRows.find((t) => result.teams.has(t.team_id))?.team_id ?? clubRows[0]?.team_id ?? null;
  const t = teamId ? result.teams.get(teamId) : undefined;
  const m = t ? teamClutchMetrics(t) : null;

  // Coverage: of this team's games with play-by-play, how many add up for both teams (the only
  // games clutch uses), and of those, how many also have trusted lineups and player credit.
  const teamsInGame = new Map<string, string[]>();
  teamGames.forEach((k) => {
    const [g, tid] = k.split("|");
    teamsInGame.set(g, [...(teamsInGame.get(g) ?? []), tid]);
  });
  const myGames = Array.from(teamGames).filter((k) => clubIds.has(k.split("|")[1]));
  const counted = myGames.filter((k) => (teamsInGame.get(k.split("|")[0]) ?? []).every((tid) => trust.teamTotals.has(`${k.split("|")[0]}|${tid}`)));

  const describe = teamId ? await memberDescriber(teamId, o.formatName) : null;
  const players = Array.from(result.players.values())
    .filter((p) => clubIds.has(p.team_id) && (p.secs > 0 || p.boxGames.size > 0))
    .map((p) => {
      const who = p.key.includes("#") ? sharedKeyPlayer(p, o.formatName) : describe ? describe(p) : { key: p.key, id: p.key, name: p.key, photoUrl: null, photoFocusY: 50 };
      return {
        key: p.key,
        id: who.id,
        name: who.name,
        photoUrl: who.photoUrl,
        games: p.games.size,
        minutes: round1(p.secs / 60),
        onPlusMinus: p.onPf - p.onPa,
        boxGames: p.boxGames.size,
        pts: p.pts,
        fgm: p.fgm,
        fga: p.fga,
        fg3m: p.fg3m,
        fg3a: p.fg3a,
        ftm: p.ftm,
        fta: p.fta,
        ast: p.ast,
        reb: p.reb,
        tov: p.tov,
        stl: p.stl,
        blk: p.blk,
      };
    })
    .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0) || b.pts - a.pts || bySurname(a, b));

  const rank = teamId ? league.findIndex((r) => r.team_id === teamId) + 1 : 0;
  return {
    league: { name: o.leagueName, league_id: o.rootLeagueId, teams: league },
    team: teamId ? { team_id: teamId, name: clubRows.find((c) => c.team_id === teamId)?.name || o.teamName } : null,
    rank: rank > 0 ? rank : null,
    coverage: {
      games: myGames.length,
      teamTotals: counted.length,
      lineups: counted.filter((k) => trust.lineups.has(k) && !result.leftOut.lineups.has(k)).length,
      credit: counted.filter((k) => trust.credit.has(k) && !result.leftOut.credit.has(k)).length,
    },
    summary: m && {
      games: m.games,
      wins: m.wins,
      losses: m.losses,
      minutes: round1(m.minutes),
      pf: m.pf,
      pa: m.pa,
      plusMinus: m.plusMinus,
      ortg: round1(m.ortg),
      drtg: round1(m.drtg),
      net: round1(m.net),
      efg: pct(m.efg),
      oppEfg: pct(m.oppEfg),
      tovPct: pct(m.tovPct),
      oppTovPct: pct(m.oppTovPct),
      orebPct: pct(m.orebPct),
      ftRate: pct(m.ftRate),
    },
    players,
  };
}
