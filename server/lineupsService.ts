import { supabaseAdmin } from "./supabaseServiceClient";
import { buildUnits, groupStints, normalizeClubName, playerNameKey, rankUnits, reliableTeamGames, type BoxRow, type LineupMetric, type StintGroup, type StintRow, type TeamPointsRow, type Unit, type UnitMember } from "./lineups";
import { buildCombos, rankCombos, STINT_BOX_COLS, type ComboSize, type StintBox } from "./lineupCombos";

type Options = {
  leagueIds: string[];
  leagueName: string;
  rootLeagueId: string;
  metric: LineupMetric;
  minMinutes: number;
  limit: number;
  /** Team to show; falls back to the team with the best-ranked unit. */
  teamId: string;
  /**
   * A club's name as shown on its team page. When given, only that club is returned (with no units
   * if it hasn't played enough together yet) instead of falling back to the best team.
   */
  teamName?: string;
  formatName: (name: string) => string;
  /** Only use games whose lineup tracking reconciles with the box score (default true). */
  onlyReliable?: boolean;
};

const STINT_COLS =
  "stint_id,game_key,team_id,player_id,player_name,seconds_played,points_for,points_against,possessions_for,possessions_against";

type Loaded = {
  units: Unit[];
  stintsUsed: number;
  stintsSkipped: number;
  /** Every team-game with stints, and the ones that reconcile with the box score ("gameKey|teamId"). */
  checkedKeys: string[];
  reliableKeys: Set<string>;
  /** The stints behind the units, for the Swish+ lineup explorer. */
  stints: Map<string, StintGroup>;
};

// Reading every stint takes a few seconds, and each team page asks for the same competition, so the
// grouped units are kept briefly. Access to private competitions is checked by the route before this.
export const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 24;
const loadedCache = new Map<string, { at: number; value: Promise<Loaded> }>();

export async function readAll<T>(table: string, cols: string, leagueIds: string[], cap: number): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(cols)
      .in("league_id", leagueIds)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as unknown as T[]));
    if ((data?.length || 0) < 1000) break;
  }
  return out;
}

async function loadUnits(leagueIds: string[], onlyReliable: boolean): Promise<Loaded> {
  const rows = await readAll<StintRow>("player_on_court_stints", STINT_COLS, leagueIds, 120000);
  // Games are only trusted when the lineup tracking adds up against the feed's own box score.
  const [box, points] = await Promise.all([
    readAll<BoxRow>("player_stats", "game_key,team_id,sminutes", leagueIds, 60000),
    readAll<TeamPointsRow>("team_stats", "game_key,team_id,tot_spoints", leagueIds, 20000),
  ]);
  const check = reliableTeamGames(rows, box, points);
  const usable = onlyReliable ? rows.filter((r) => check.reliable.has(`${r.game_key}|${r.team_id}`)) : rows;
  const { units, stintsUsed, stintsSkipped } = buildUnits(usable);
  return { units, stintsUsed, stintsSkipped, checkedKeys: Array.from(check.all), reliableKeys: check.reliable, stints: groupStints(usable) };
}

function cachedUnits(leagueIds: string[], onlyReliable: boolean): Promise<Loaded> {
  const key = `${Array.from(leagueIds).sort().join(",")}|${onlyReliable}`;
  const now = Date.now();
  const hit = loadedCache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;
  const value = loadUnits(leagueIds, onlyReliable);
  loadedCache.set(key, { at: now, value });
  value.catch(() => loadedCache.delete(key));
  if (loadedCache.size > CACHE_MAX) {
    const oldest = Array.from(loadedCache.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) loadedCache.delete(oldest[0]);
  }
  return value;
}

const photoUrl = (path: string | null | undefined) =>
  path ? supabaseAdmin.storage.from("player-photos").getPublicUrl(path).data.publicUrl : null;
export const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
export const bySurname = (a: { name: string }, b: { name: string }) => a.name.split(" ").slice(-1)[0].localeCompare(b.name.split(" ").slice(-1)[0]);

export type DescribedPlayer = { key: string; id: string; name: string; photoUrl: string | null; photoFocusY: number };

/**
 * Names and photographs the people in a team's units. Stints often carry roster placeholders
 * ("C. Samuels"), so each person comes from the team's full-name record, borrowing another
 * record's photo of the same name if needed.
 */
export async function memberDescriber(teamId: string, formatName: (name: string) => string): Promise<(mem: UnitMember) => DescribedPlayer> {
  type PlayerRow = { id: string; full_name: string; photo_path: string | null; photo_focus_y: number | null };
  const keyRow = new Map<string, PlayerRow>();
  const borrowed = new Map<string, { photo_path: string; photo_focus_y: number | null }>();
  const { data: playerRows } = await supabaseAdmin
    .from("players")
    .select("id, full_name, photo_path, photo_focus_y")
    .eq("team_id", teamId);
  const isInitial = (n: string) => (n.trim().split(" ")[0] || "").replace(".", "").length <= 1;
  const score = (p: PlayerRow) => (isInitial(p.full_name) ? 0 : 4) + (p.photo_path ? 2 : 0) + p.full_name.length / 100;
  for (const p of (playerRows || []) as PlayerRow[]) {
    const key = playerNameKey(p.full_name);
    const current = keyRow.get(key);
    if (key && (!current || score(p) > score(current))) keyRow.set(key, p);
  }
  const needPhoto = Array.from(keyRow.values()).filter((p) => !p.photo_path).map((p) => p.full_name);
  if (needPhoto.length > 0) {
    const { data: sameName } = await supabaseAdmin
      .from("players")
      .select("full_name, photo_path, photo_focus_y")
      .in("full_name", needPhoto)
      .not("photo_path", "is", null);
    for (const p of (sameName || []) as { full_name: string; photo_path: string; photo_focus_y: number | null }[]) {
      const k = p.full_name.toLowerCase();
      if (p.photo_path && !borrowed.has(k)) borrowed.set(k, p);
    }
  }
  return (mem) => {
    const row = keyRow.get(mem.key);
    const typed = Array.from(mem.names.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? mem.key;
    const fullName = row?.full_name || typed;
    const borrow = row && !row.photo_path ? borrowed.get(row.full_name.toLowerCase()) : undefined;
    return {
      key: mem.key,
      id: row?.id ?? Array.from(mem.ids.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? mem.key,
      name: formatName(fullName.replace(/\s+/g, " ").trim()),
      photoUrl: photoUrl(row?.photo_path || borrow?.photo_path),
      photoFocusY: row?.photo_path ? row.photo_focus_y ?? 50 : borrow?.photo_focus_y ?? 50,
    };
  };
}

/**
 * The team ids a club name stands for in a competition. Team rows carry the latest season's
 * league_id, so an older season's teams are found through the ids its stints use as well.
 */
export async function findClub(leagueIds: string[], stintTeamIds: string[], teamName: string): Promise<{ team_id: string; name: string }[]> {
  const want = normalizeClubName(teamName);
  const [byLeague, byId] = await Promise.all([
    supabaseAdmin.from("teams").select("team_id, name").in("league_id", leagueIds),
    stintTeamIds.length
      ? supabaseAdmin.from("teams").select("team_id, name").in("team_id", stintTeamIds)
      : Promise.resolve({ data: [] as { team_id: string; name: string }[] }),
  ]);
  const all = new Map<string, { team_id: string; name: string }>();
  for (const t of [...((byLeague.data || []) as { team_id: string; name: string }[]), ...((byId.data || []) as { team_id: string; name: string }[])]) {
    all.set(t.team_id, t);
  }
  return Array.from(all.values()).filter((t) => normalizeClubName(t.name) === want);
}

/** Best five-man units for one team in a competition, with names and photos ready for a card. */
export async function computeLineups(o: Options) {
  const onlyReliable = o.onlyReliable !== false;
  const { units, stintsUsed, stintsSkipped, checkedKeys, reliableKeys, stints } = await cachedUnits(o.leagueIds, onlyReliable);
  const checked = checkedKeys.length;
  const reliableCount = reliableKeys.size;

  const ranked = rankUnits(units, o.metric, o.minMinutes);
  const unitTeamIds = Array.from(new Set(ranked.map((r) => r.unit.team_id)));

  // A team page names its club, which may not have a qualifying unit yet.
  const stintTeamIds = Array.from(new Set(Array.from(stints.values()).map((st) => st.team_id)));
  const clubRows = o.teamName ? await findClub(o.leagueIds, stintTeamIds, o.teamName) : [];

  const lookupIds = Array.from(new Set([...unitTeamIds, ...clubRows.map((t) => t.team_id)]));
  const { data: teamRows } = lookupIds.length
    ? await supabaseAdmin.from("teams").select("team_id, name").in("team_id", lookupIds)
    : { data: [] as { team_id: string; name: string }[] };
  const teamName = new Map((teamRows || []).map((t) => [t.team_id, t.name]));

  const teams = unitTeamIds
    .map((id) => ({ team_id: id, name: teamName.get(id) || "Unknown", units: ranked.filter((r) => r.unit.team_id === id).length }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const teamId = o.teamName
    ? (clubRows.find((t) => unitTeamIds.includes(t.team_id)) ?? clubRows[0])?.team_id ?? null
    : unitTeamIds.includes(o.teamId) ? o.teamId : ranked[0]?.unit.team_id ?? null;
  const picked = ranked.filter((r) => r.unit.team_id === teamId).slice(0, o.limit);

  const describe = teamId && picked.length > 0 ? await memberDescriber(teamId, o.formatName) : null;

  const out = picked.map(({ unit, m }, i) => ({
    rank: i + 1,
    minutes: round1(m.minutes),
    games: m.games,
    pf: m.pf,
    pa: m.pa,
    plusMinus: m.plusMinus,
    ortg: round1(m.ortg),
    drtg: round1(m.drtg),
    net: round1(m.net),
    players: unit.members
      .map((mem) => describe!(mem))
      .sort(bySurname),
  }));

  return {
    league: { name: o.leagueName, league_id: o.rootLeagueId },
    metric: o.metric,
    minMinutes: o.minMinutes,
    stintsUsed,
    stintsSkipped,
    reliability: { teamGames: checked, reliable: reliableCount, onlyReliable },
    // For the chosen team: how many of its games had lineup data, and how many of those were used.
    coverage: (() => {
      if (!teamId) return { games: 0, used: 0 };
      const mine = checkedKeys.filter((k) => k.endsWith(`|${teamId}`));
      return { games: mine.length, used: onlyReliable ? mine.filter((k) => reliableKeys.has(k)).length : mine.length };
    })(),
    teams,
    team: teamId ? { team_id: teamId, name: teamName.get(teamId) || "Unknown" } : null,
    units: out,
  };
}

// The box numbers of every stint, for the Swish+ explorer only, so the free panel never waits on them.
const boxCache = new Map<string, { at: number; value: Promise<Map<string, StintBox>> }>();

function cachedStintBox(leagueIds: string[]): Promise<Map<string, StintBox>> {
  const key = Array.from(leagueIds).sort().join(",");
  const now = Date.now();
  const hit = boxCache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;
  const value = readAll<StintBox>("lineup_stints", STINT_BOX_COLS, leagueIds, 40000).then(
    (rows) => new Map(rows.map((r) => [String(r.id), r])),
  );
  boxCache.set(key, { at: now, value });
  value.catch(() => boxCache.delete(key));
  if (boxCache.size > CACHE_MAX) {
    const oldest = Array.from(boxCache.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) boxCache.delete(oldest[0]);
  }
  return value;
}

type ComboOptions = {
  leagueIds: string[];
  leagueName: string;
  rootLeagueId: string;
  teamName: string;
  size: ComboSize;
  minMinutes: number;
  formatName: (name: string) => string;
};

/** Most groups a response carries; a deep bench gives a few hundred threes at most. */
const COMBO_LIMIT = 400;

/**
 * Swish+: every five-man unit, three-man group or pair one team has used, with ratings and the four
 * factors for and against. Uses the same trusted games as the free panel.
 */
export async function computeLineupCombos(o: ComboOptions) {
  const [{ stints, checkedKeys, reliableKeys }, box] = await Promise.all([
    cachedUnits(o.leagueIds, true),
    cachedStintBox(o.leagueIds),
  ]);

  const stintTeamIds = Array.from(new Set(Array.from(stints.values()).map((st) => st.team_id)));
  const clubRows = await findClub(o.leagueIds, stintTeamIds, o.teamName);
  const clubIds = new Set(clubRows.map((t) => t.team_id));

  // A club can have more than one team id in a competition family; use all of them.
  const mine = Array.from(stints.values()).filter((s) => clubIds.has(s.team_id));
  const ranked = rankCombos(buildCombos(mine, box, o.size), o.minMinutes).slice(0, COMBO_LIMIT);

  const teamId = mine[0]?.team_id ?? clubRows[0]?.team_id ?? null;
  const describe = teamId ? await memberDescriber(teamId, o.formatName) : null;
  const players = new Map<string, DescribedPlayer>();
  const pct = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 10);

  const units = ranked.map(({ combo, m }) => {
    for (const mem of combo.members) if (!players.has(mem.key) && describe) players.set(mem.key, describe(mem));
    return {
      keys: combo.keys,
      minutes: round1(m.minutes),
      games: m.games,
      pf: m.pf,
      pa: m.pa,
      plusMinus: m.plusMinus,
      ortg: round1(m.ortg),
      drtg: round1(m.drtg),
      net: round1(m.net),
      efg: pct(m.efg),
      tovPct: pct(m.tovPct),
      orebPct: pct(m.orebPct),
      ftRate: pct(m.ftRate),
      oppEfg: pct(m.oppEfg),
      oppTovPct: pct(m.oppTovPct),
      oppOrebPct: pct(m.oppOrebPct),
      oppFtRate: pct(m.oppFtRate),
    };
  });

  const teamGames = checkedKeys.filter((k) => clubIds.has(k.split("|")[1]));
  return {
    league: { name: o.leagueName, league_id: o.rootLeagueId },
    team: teamId ? { team_id: teamId, name: clubRows.find((t) => t.team_id === teamId)?.name || o.teamName } : null,
    size: o.size,
    minMinutes: o.minMinutes,
    coverage: { games: teamGames.length, used: teamGames.filter((k) => reliableKeys.has(k)).length },
    players: Array.from(players.values()).sort(bySurname),
    units,
  };
}
