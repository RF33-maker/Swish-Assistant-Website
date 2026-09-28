import { supabaseAdmin } from "./supabaseServiceClient";
import { isSameTeam } from "./teamIdentityService";

// Every competition one club has played in, with its record and game-level
// team totals in each. Each competition gives the club its own team_id (and
// often a different name, e.g. "... Senior Men I" in NBL), so this matches
// on club identity instead — the team profile uses it to switch between a
// club's competitions and to build accolades that don't depend on which
// competition the profile was opened from.

export type TeamCompetitionGame = {
  game_key: string;
  date: string;
  opponent: string;
  isHome: boolean;
  totalPoints: number;
  opponentScore?: number;
  isWin?: boolean;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
};

export type TeamCompetitionRecordMaxes = {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
};

export type TeamCompetition = {
  league_id: string;
  name: string;
  slug: string;
  season: string | null;
  teamName: string;
  wins: number;
  losses: number;
  lastPlayed: string;
  games: TeamCompetitionGame[];
  recordMaxes: TeamCompetitionRecordMaxes;
};

const TEAM_STAT_COLUMNS =
  "name, side, league_id, game_key, created_at, tot_spoints, tot_sreboundstotal, tot_sassists, tot_ssteals, tot_sblocks, tot_sthreepointersmade";

// The shared part of every variant of a club's name, used to narrow the
// ilike search before the exact identity check.
function searchCore(name: string): string {
  return name
    .replace(/\s+Senior\s+(Men|Women)\b.*$/i, "")
    .replace(/\s+I$/i, "")
    .replace(/[%_]/g, "")
    .trim();
}

const num = (value: unknown) => Number(value) || 0;

export async function getTeamCompetitions(teamName: string): Promise<TeamCompetition[]> {
  const core = searchCore(teamName);
  if (core.length < 3) return [];

  // Only rows already public at row level (the same rule anon RLS applies),
  // so a private competition shows up only for data its owner has published.
  const { data: ownRows, error } = await supabaseAdmin
    .from("team_stats")
    .select(TEAM_STAT_COLUMNS)
    .ilike("name", `%${core}%`)
    .eq("is_public", true)
    .not("game_key", "is", null)
    .limit(2000);
  if (error) throw new Error(error.message);

  const matched = (ownRows || []).filter((row: any) => isSameTeam(row.name || "", teamName));
  if (matched.length === 0) return [];

  const gameKeys = Array.from(new Set(matched.map((row: any) => row.game_key)));
  const leagueIds = Array.from(new Set(matched.map((row: any) => row.league_id).filter(Boolean))) as string[];

  const [{ data: gameRows }, { data: competitions }, { data: schedule }] = await Promise.all([
    supabaseAdmin.from("team_stats").select("name, side, league_id, game_key, tot_spoints").in("game_key", gameKeys),
    supabaseAdmin.from("competitions").select("league_id, name, slug, season").in("league_id", leagueIds),
    supabaseAdmin.from("game_schedule").select("game_key, league_id, matchtime").in("game_key", gameKeys),
  ]);

  const matchtimeByGame = new Map<string, string>();
  (schedule || []).forEach((row: any) => {
    if (row.matchtime) matchtimeByGame.set(`${row.league_id}:${row.game_key}`, row.matchtime);
  });

  const byCompetition = new Map<string, { teamName: string; games: TeamCompetitionGame[] }>();
  const seen = new Set<string>();
  for (const row of matched as any[]) {
    const id = `${row.league_id}:${row.game_key}`;
    if (!row.league_id || seen.has(id)) continue;
    seen.add(id);
    const opponentRow = (gameRows || []).find((other: any) =>
      other.game_key === row.game_key && other.league_id === row.league_id && String(other.side) !== String(row.side)
    );
    const totalPoints = num(row.tot_spoints);
    const opponentScore = opponentRow?.tot_spoints == null ? undefined : num(opponentRow.tot_spoints);
    const game: TeamCompetitionGame = {
      game_key: row.game_key,
      date: matchtimeByGame.get(id) || row.created_at,
      opponent: opponentRow?.name || "Unknown Opponent",
      isHome: String(row.side) === "1",
      totalPoints,
      opponentScore,
      isWin: opponentScore === undefined ? undefined : totalPoints > opponentScore,
      reb: num(row.tot_sreboundstotal),
      ast: num(row.tot_sassists),
      stl: num(row.tot_ssteals),
      blk: num(row.tot_sblocks),
      tpm: num(row.tot_sthreepointersmade),
    };
    if (!byCompetition.has(row.league_id)) byCompetition.set(row.league_id, { teamName: row.name, games: [] });
    byCompetition.get(row.league_id)!.games.push(game);
  }

  const competitionById = new Map((competitions || []).map((c: any) => [c.league_id, c]));
  const results = await Promise.all(Array.from(byCompetition.entries()).map(async ([leagueId, entry]) => {
    const competition: any = competitionById.get(leagueId);
    if (!competition?.slug) return null;
    const { data: maxes } = await supabaseAdmin.rpc("get_team_record_maxes", { target_league_ids: [leagueId] });
    const max = maxes?.[0] || {};
    const games = entry.games.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return {
      league_id: leagueId,
      name: competition.name,
      slug: competition.slug,
      season: competition.season ?? null,
      teamName: entry.teamName,
      wins: games.filter(g => g.isWin === true).length,
      losses: games.filter(g => g.isWin === false).length,
      lastPlayed: games[games.length - 1]?.date || "",
      games,
      recordMaxes: {
        pts: num(max.pts), reb: num(max.reb), ast: num(max.ast),
        stl: num(max.stl), blk: num(max.blk), tpm: num(max.tpm),
      },
    } satisfies TeamCompetition;
  }));

  return results
    .filter((c): c is TeamCompetition => c !== null)
    .sort((a, b) => new Date(b.lastPlayed).getTime() - new Date(a.lastPlayed).getTime());
}
