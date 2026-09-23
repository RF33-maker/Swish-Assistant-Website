import { supabase } from '@/lib/supabase';

// Shared per-game lookups for the Coaches Hub deep-dive views (PlayerDetail /
// TeamDetail game logs). `team_stats` already carries each team's own
// `score`/`opp_points` per `game_key` — no need to sum anything — but it has
// no date, so `game_schedule.matchtime` fills that in. Two small queries,
// reused by both detail views instead of two separate ad-hoc joins.

export interface GameScheduleInfo {
  date: string | null;
  hometeam: string;
  awayteam: string;
}

export interface TeamGameScore {
  team_id: string | null;
  name: string;
  score: number | null;
  opp_points: number | null;
}

export async function fetchGameSchedule(gameKeys: string[]): Promise<Map<string, GameScheduleInfo>> {
  const map = new Map<string, GameScheduleInfo>();
  if (gameKeys.length === 0) return map;
  const { data, error } = await supabase
    .from('game_schedule')
    .select('game_key, matchtime, hometeam, awayteam')
    .in('game_key', gameKeys);
  if (error) { console.error('fetchGameSchedule error:', error); return map; }
  for (const row of data || []) {
    if (!row.game_key) continue;
    map.set(row.game_key, { date: row.matchtime ?? null, hometeam: row.hometeam, awayteam: row.awayteam });
  }
  return map;
}

/** game_key -> that game's team_stats rows (one per team that played it). */
export async function fetchTeamScoresByGame(gameKeys: string[]): Promise<Map<string, TeamGameScore[]>> {
  const map = new Map<string, TeamGameScore[]>();
  if (gameKeys.length === 0) return map;
  const { data, error } = await supabase
    .from('team_stats')
    .select('game_key, team_id, name, score, opp_points')
    .in('game_key', gameKeys);
  if (error) { console.error('fetchTeamScoresByGame error:', error); return map; }
  for (const row of data || []) {
    if (!row.game_key) continue;
    const list = map.get(row.game_key) ?? [];
    list.push({ team_id: row.team_id, name: row.name, score: row.score, opp_points: row.opp_points });
    map.set(row.game_key, list);
  }
  return map;
}
