// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
import type {
  EventRow, LineupStintRow, PlayerStintRow, RosterRow, ScoutingBundle, ShotRow, TeamGameRow,
} from "./facts.ts";

/**
 * Pulls everything the fact engine needs for one opponent (and optionally the
 * coach's own team) out of Supabase.
 *
 * A club gets a separate team_id — and often a different name — in every
 * competition it enters, and early in a season its current league has only a
 * game or two. So the opponent is resolved to every same-club team row
 * (isSameTeam), and its most recent games are taken across all of them: the
 * season opener plus last spring's games and this autumn's cup ties. The
 * facts say how many came from elsewhere so the agent can weigh them.
 */

const TEAM_COLUMNS = [
  "game_key", "team_id", "league_id", "name", "created_at", "score", "tot_spoints",
  "p1_score", "p2_score", "p3_score", "p4_score", "pace", "off_rating", "def_rating", "net_rating",
  "efg_percent", "tov_percent", "oreb_percent", "dreb_percent", "ft_rate", "three_point_rate", "ast_percent",
  "opp_efg_percent", "opp_tov_percent", "opp_ft_rate", "opp_oreb_percent", "pts_percent_pitp", "pts_percent_fastbreak",
  "pts_percent_second_chance", "pts_percent_off_turnovers", "pts_percent_3pt", "pts_percent_ft",
  "tot_sbenchpoints", "possessions",
].join(", ");

const PAGE = 1000;

/** Supabase caps a select at 1000 rows; page until a short page comes back. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message || String(error));
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) break;
    if (from > 50_000) break; // hard stop; a scout never needs this much
  }
  return out;
}

function searchCore(name: string): string {
  return name
    .replace(/\s+Senior\s+(Men|Women)\b.*$/i, "")
    .replace(/\s+I$/i, "")
    .replace(/[%_,]/g, "")
    .trim();
}

export interface LoadOptions {
  db: SupabaseClient;
  isSameTeam: (a: string, b: string) => boolean;
  opponentName: string;
  leagueId: string;
  myTeamName?: string | null;
  maxGames?: number;
  /** Ignore games older than this many days (default ~13 months, i.e. last season and this one). */
  maxAgeDays?: number;
  /** Only games played before this instant — lets a report be rebuilt "as of" a past fixture. */
  before?: Date;
}

interface ClubGames {
  games: TeamGameRow[];
  opponentsInGames: Record<string, TeamGameRow>;
}

type CompMeta = { name: string; gender: string | null; is_public: boolean | null; parent: string | null };

async function competitionMeta(db: SupabaseClient, leagueIds: string[]): Promise<Map<string, CompMeta>> {
  if (!leagueIds.length) return new Map();
  const { data } = await db.from("competitions").select("league_id, name, gender, is_public, parent_league_id").in("league_id", leagueIds);
  return new Map<string, CompMeta>((data || []).map((c: any): [string, CompMeta] => [c.league_id, { name: c.name, gender: c.gender, is_public: c.is_public, parent: c.parent_league_id }]));
}

async function loadClubGames(o: LoadOptions, teamName: string, targetGender: string | null): Promise<ClubGames> {
  const { db, isSameTeam } = o;
  const core = searchCore(teamName);
  if (core.length < 3) return { games: [], opponentsInGames: {} };

  const { data: candidates, error } = await db.from("teams").select("team_id, league_id, name").ilike("name", `%${core}%`).limit(200);
  if (error) throw new Error(error.message);
  let club = (candidates || []).filter((t: any) => isSameTeam(t.name || "", teamName));

  // Don't let a club's women's side leak into a men's scout (or vice versa)
  // when the competitions say which is which.
  let meta = await competitionMeta(db, Array.from(new Set(club.map((t: any) => t.league_id))));
  if (targetGender) club = club.filter((t: any) => !meta.get(t.league_id)?.gender || meta.get(t.league_id)?.gender === targetGender);
  const teamIds = club.map((t: any) => t.team_id);
  if (!teamIds.length) return { games: [], opponentsInGames: {} };

  const since = new Date((o.before?.getTime() ?? Date.now()) - (o.maxAgeDays ?? 400) * 86_400_000).toISOString();
  const rows = await fetchAll<any>((from, to) =>
    db.from("team_stats").select(TEAM_COLUMNS).in("team_id", teamIds).not("game_key", "is", null).gte("created_at", since)
      // Only published data, plus the competition being scouted (its owner may be the one asking).
      .or(`is_public.eq.true,league_id.eq.${o.leagueId}`)
      .order("created_at", { ascending: false }).range(from, to)
  );

  // Box scores can sit under a competition the club's teams row doesn't; name those too.
  const missing = Array.from(new Set(rows.map((r) => r.league_id))).filter((id) => id && !meta.has(id));
  if (missing.length) meta = new Map([...meta, ...(await competitionMeta(db, missing))]);

  // Real tip-off times live on the schedule; team_stats.created_at is ingestion time.
  const keys = Array.from(new Set(rows.map((r) => r.game_key)));
  const when = new Map<string, string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await db.from("game_schedule").select("game_key, matchtime").in("game_key", keys.slice(i, i + 200));
    (data || []).forEach((g: any) => g.matchtime && when.set(g.game_key, g.matchtime));
  }
  const cutoff = o.before?.getTime() ?? Infinity;
  const seen = new Set<string>();
  const games: TeamGameRow[] = rows
    .map((r) => ({ ...r, played_at: when.get(r.game_key) || r.created_at, competition: meta.get(r.league_id)?.name ?? null }))
    .filter((r) => new Date(r.played_at).getTime() < cutoff)
    .sort((a, b) => b.played_at.localeCompare(a.played_at))
    .filter((r) => (seen.has(r.game_key) ? false : (seen.add(r.game_key), true)))
    .slice(0, o.maxGames ?? 10);

  const gameKeys = games.map((g) => g.game_key);
  const opponentsInGames: Record<string, TeamGameRow> = {};
  if (gameKeys.length) {
    const { data: others } = await db.from("team_stats").select(TEAM_COLUMNS).in("game_key", gameKeys);
    const ours = new Set(teamIds);
    (others || []).forEach((r: any) => {
      if (!ours.has(r.team_id) && !opponentsInGames[r.game_key]) opponentsInGames[r.game_key] = { ...r, played_at: r.created_at, competition: null };
    });
  }
  return { games, opponentsInGames };
}

/**
 * Rows the league ranks are measured against. Early in a season the scouted
 * competition may hold one game per team, which makes ranks noise; then the
 * baseline also takes in the competition most of the opponent's recent games
 * came from (normally last season of the same league).
 */
async function loadBaseline(db: SupabaseClient, leagueId: string, oppGames: TeamGameRow[]) {
  const shape = (rows: any[]) => rows.map((r) => ({ ...r, played_at: r.created_at, competition: null })) as TeamGameRow[];
  const target = await fetchAll<any>((f, t) => db.from("team_stats").select(TEAM_COLUMNS)
    .eq("league_id", leagueId).not("game_key", "is", null).order("id").range(f, t));
  const teams = new Set(target.map((r) => r.team_id)).size || 1;
  const perTeam = target.length / teams;
  if (perTeam >= 4) return { rows: shape(target), note: null };

  const counts = new Map<string, number>();
  oppGames.filter((g) => g.league_id !== leagueId).forEach((g) => counts.set(g.league_id, (counts.get(g.league_id) || 0) + 1));
  const extra = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!extra) return { rows: shape(target), note: `Ranks use only ${target.length} game rows so far in this competition.` };
  const more = await fetchAll<any>((f, t) => db.from("team_stats").select(TEAM_COLUMNS)
    .eq("league_id", extra).not("game_key", "is", null).order("id").range(f, t));
  const { data: c } = await db.from("competitions").select("name").eq("league_id", extra).maybeSingle();
  return {
    rows: shape([...target, ...more]),
    note: `Early season: ranks compare against this competition plus ${c?.name ?? "the previous competition"} (${target.length + more.length} team-games).`,
  };
}

export async function loadScoutingBundle(o: LoadOptions): Promise<ScoutingBundle> {
  const { db } = o;
  const targetMeta = (await competitionMeta(db, [o.leagueId])).get(o.leagueId);
  const targetGender = targetMeta?.gender ?? null;

  const [opp, mine] = await Promise.all([
    loadClubGames(o, o.opponentName, targetGender),
    o.myTeamName ? loadClubGames(o, o.myTeamName, targetGender) : Promise.resolve(null),
  ]);

  const gameKeys = opp.games.map((g) => g.game_key);
  const teamIds = Array.from(new Set(opp.games.map((g) => g.team_id)));

  const [events, shots, lineupStints, playerStints, rosters, leagueRows] = gameKeys.length
    ? await Promise.all([
        fetchAll<EventRow>((f, t) => db.from("live_events")
          .select("game_key, team_id, action_number, period, clock, player_name, action_type, sub_type, qualifiers, success, team_score, opp_score, previous_action")
          .in("game_key", gameKeys).order("game_key").order("action_number").range(f, t)),
        fetchAll<ShotRow>((f, t) => db.from("shot_chart")
          .select("game_key, action_number, player_name, x, y, shot_type, sub_type, success")
          .in("game_key", gameKeys).order("id").range(f, t)),
        fetchAll<LineupStintRow>((f, t) => db.from("lineup_stints")
          .select("game_key, team_id, lineup_key, lineup_names, period, start_game_secs, end_game_secs, seconds_played, points_for, points_against, possessions_for, possessions_against")
          .in("game_key", gameKeys).in("team_id", teamIds).eq("is_valid_lineup", true).order("id").range(f, t)),
        // Player minutes are derived from the (deduplicated) lineup stints in facts.ts.
        Promise.resolve([] as PlayerStintRow[]),
        fetchAll<RosterRow>((f, t) => db.from("game_rosters")
          .select("game_key, team_id, player_name, shirt_number, starter")
          .in("game_key", gameKeys).in("team_id", teamIds).order("id").range(f, t)),
        loadBaseline(db, o.leagueId, opp.games),
      ])
    : [[], [], [], [], [], { rows: [] as TeamGameRow[], note: null as string | null }];


  return {
    opponentName: o.opponentName,
    targetLeagueId: o.leagueId,
    targetLeagueName: targetMeta?.name ?? null,
    games: opp.games,
    opponentsInGames: opp.opponentsInGames,
    events,
    shots,
    lineupStints,
    playerStints,
    rosters,
    leagueRows: leagueRows.rows,
    baselineNote: leagueRows.note,
    myTeam: mine && o.myTeamName ? { name: o.myTeamName, ...mine } : null,
  };
}
