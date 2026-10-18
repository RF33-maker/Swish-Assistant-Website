import { supabase } from "@/lib/supabase";
import { identityKey, sideName } from "@shared/teamIdentity";
import { RECENT_WINDOW_DAYS, type RecentGame } from "@/lib/recentStandouts";

/**
 * The recent games of the players on both sides of an upcoming game, from any competition.
 *
 * A club plays under a different team id (and often a slightly different name) in each
 * competition, so players are found by club identity rather than by the game's team ids.
 * Used for the "last game" storylines, which don't need a season of stats.
 */

/** The search word(s) that find a club's rows whatever the competition spells: "Birmingham City University Senior Men" -> "Birmingham City". */
function searchTerm(teamName: string): string {
  const base = teamName.replace(/\s+Senior\s+(Men|Women).*$/i, "").replace(/[%_,()*]/g, " ").trim();
  return base.split(/\s+/).slice(0, 2).join(" ");
}

type Row = {
  player_id: string | null;
  full_name: string | null;
  firstname: string | null;
  familyname: string | null;
  team_name: string | null;
  league_id: string;
  created_at: string;
  spoints: number | null;
  sreboundstotal: number | null;
  sassists: number | null;
  ssteals: number | null;
  sblocks: number | null;
};

export async function fetchRecentGames(opts: {
  homeTeam: string;
  awayTeam: string;
  /** The competition of the upcoming game, for the gender its team names are read with. */
  gameLeagueId: string;
  gameTime: Date;
}): Promise<RecentGame[]> {
  const since = new Date(opts.gameTime.getTime() - RECENT_WINDOW_DAYS * 86_400_000).toISOString();
  const sides = [
    { side: "home" as const, team: opts.homeTeam },
    { side: "away" as const, team: opts.awayTeam },
  ];

  const found = await Promise.all(
    sides.map(async ({ side, team }) => {
      const term = searchTerm(team);
      if (!term) return { side, team, rows: [] as Row[] };
      const { data } = await supabase
        .from("player_stats")
        .select("player_id,full_name,firstname,familyname,team_name,league_id,created_at,spoints,sreboundstotal,sassists,ssteals,sblocks")
        .ilike("team_name", `%${term}%`)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(400)
        .returns<Row[]>();
      return { side, team, rows: data ?? [] };
    }),
  );

  const leagueIds = Array.from(new Set([opts.gameLeagueId, ...found.flatMap((f) => f.rows.map((r) => r.league_id))]));
  const { data: comps } = await supabase.from("competitions").select("league_id,name,gender").in("league_id", leagueIds);
  const compById = new Map((comps ?? []).map((c: any) => [c.league_id as string, c as { name: string; gender: string | null }]));
  const gameGender = compById.get(opts.gameLeagueId)?.gender ?? null;

  const out: RecentGame[] = [];
  for (const { side, team, rows } of found) {
    const wanted = identityKey(sideName(team, gameGender));
    for (const r of rows) {
      if (!r.player_id || !r.team_name) continue;
      const comp = compById.get(r.league_id);
      if (!comp) continue;
      if (identityKey(sideName(r.team_name, comp.gender)) !== wanted) continue;
      const name = r.full_name || `${r.firstname ?? ""} ${r.familyname ?? ""}`.trim();
      if (!name) continue;
      out.push({
        playerId: r.player_id,
        name,
        side,
        leagueId: r.league_id,
        competition: comp.name,
        date: r.created_at,
        pts: Number(r.spoints || 0),
        reb: Number(r.sreboundstotal || 0),
        ast: Number(r.sassists || 0),
        stl: Number(r.ssteals || 0),
        blk: Number(r.sblocks || 0),
      });
    }
  }
  return out;
}

/** How many of a competition's teams have recorded stats, so thin rankings can be flagged. */
export async function fetchStatsCoverage(leagueId: string, teamsWithStats: number): Promise<{ withStats: number; total: number } | null> {
  const { data } = await supabase.from("game_schedule").select("hometeam,awayteam").eq("league_id", leagueId).limit(2000);
  const teams = new Set<string>();
  (data ?? []).forEach((g: any) => {
    if (g.hometeam) teams.add(identityKey(g.hometeam));
    if (g.awayteam) teams.add(identityKey(g.awayteam));
  });
  if (!teams.size) return null;
  return { withStats: Math.min(teamsWithStats, teams.size), total: teams.size };
}
