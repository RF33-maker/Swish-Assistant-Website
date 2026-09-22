import { supabaseAdmin } from "./supabaseServiceClient";
import { buildUnits, normalizeClubName, playerNameKey, rankUnits, reliableTeamGames, type BoxRow, type LineupMetric, type StintRow, type TeamPointsRow, type Unit } from "./lineups";

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
};

// Reading every stint takes a few seconds, and each team page asks for the same competition, so the
// grouped units are kept briefly. Access to private competitions is checked by the route before this.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 24;
const loadedCache = new Map<string, { at: number; value: Promise<Loaded> }>();

async function readAll<T>(table: string, cols: string, leagueIds: string[], cap: number): Promise<T[]> {
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
  return { units, stintsUsed, stintsSkipped, checkedKeys: Array.from(check.all), reliableKeys: check.reliable };
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

/** Best five-man units for one team in a competition, with names and photos ready for a card. */
export async function computeLineups(o: Options) {
  const onlyReliable = o.onlyReliable !== false;
  const { units, stintsUsed, stintsSkipped, checkedKeys, reliableKeys } = await cachedUnits(o.leagueIds, onlyReliable);
  const checked = checkedKeys.length;
  const reliableCount = reliableKeys.size;

  const ranked = rankUnits(units, o.metric, o.minMinutes);
  const unitTeamIds = Array.from(new Set(ranked.map((r) => r.unit.team_id)));

  // A team page names its club, which may not have a qualifying unit yet.
  let clubRows: { team_id: string; name: string }[] = [];
  if (o.teamName) {
    const want = normalizeClubName(o.teamName);
    const { data } = await supabaseAdmin.from("teams").select("team_id, name").in("league_id", o.leagueIds);
    clubRows = ((data || []) as { team_id: string; name: string }[]).filter((t) => normalizeClubName(t.name) === want);
  }

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

  // Stints often carry roster placeholders ("C. Samuels"), so name and photograph each person from
  // the team's full-name record, borrowing another record's photo of the same name if needed.
  type PlayerRow = { id: string; full_name: string; photo_path: string | null; photo_focus_y: number | null };
  const keyRow = new Map<string, PlayerRow>();
  const borrowed = new Map<string, { photo_path: string; photo_focus_y: number | null }>();
  if (teamId && picked.length > 0) {
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
  }

  const photoUrl = (path: string | null | undefined) =>
    path ? supabaseAdmin.storage.from("player-photos").getPublicUrl(path).data.publicUrl : null;
  const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

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
      .map((mem) => {
        const row = keyRow.get(mem.key);
        const typed = Array.from(mem.names.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? mem.key;
        const fullName = row?.full_name || typed;
        const borrow = row && !row.photo_path ? borrowed.get(row.full_name.toLowerCase()) : undefined;
        return {
          key: mem.key,
          id: row?.id ?? Array.from(mem.ids.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? mem.key,
          name: o.formatName(fullName.replace(/\s+/g, " ").trim()),
          photoUrl: photoUrl(row?.photo_path || borrow?.photo_path),
          photoFocusY: row?.photo_path ? row.photo_focus_y ?? 50 : borrow?.photo_focus_y ?? 50,
        };
      })
      .sort((a, b) => a.name.split(" ").slice(-1)[0].localeCompare(b.name.split(" ").slice(-1)[0])),
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
