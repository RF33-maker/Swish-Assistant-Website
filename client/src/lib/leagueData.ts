import { supabase } from "@/lib/supabase";

export type LeagueDataTable = "teams" | "team_stats" | "players";

const TABLE_COLUMNS: Record<LeagueDataTable, string> = {
  teams: "*",
  team_stats: "*",
  players: "id, full_name, slug",
};

export async function fetchLeagueData<T = any>(
  table: LeagueDataTable,
  leagueIds: string[],
  _parentLeagueId?: string,
): Promise<{ data: T[] | null; error: Error | null }> {
  const ids = (leagueIds || []).filter((v) => typeof v === "string" && v.length > 0);
  if (ids.length === 0) return { data: [], error: null };
  try {
    const cols = TABLE_COLUMNS[table] || "*";
    let query = supabase.from(table).select(cols) as any;
    if (ids.length === 1) {
      query = query.eq("league_id", ids[0]);
    } else {
      query = query.in("league_id", ids);
    }
    const { data, error } = await query;
    if (error) return { data: null, error: new Error(error.message) };
    return { data: (data || []) as T[], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
