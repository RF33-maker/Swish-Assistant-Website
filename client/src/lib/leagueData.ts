// Helpers that route reads against RLS-blocked tables (`teams`,
// `team_stats`, `players`) through the server's service-role endpoint
// so private (is_public=false) child leagues still roll up under their
// public parent on the league page. The anon-key Supabase client gets
// filtered by RLS on these tables and would otherwise return 0 rows
// for private league_ids — see task #125.
//
// The server enforces the column projection per table (see the
// `ALLOWED_LEAGUE_DATA_COLUMNS` allow-list in server/routes.ts) and
// only returns rows whose league_id is itself public or a child of a
// public parent. There is no caller-controlled column selection.

export type LeagueDataTable = "teams" | "team_stats" | "players";

export async function fetchLeagueData<T = any>(
  table: LeagueDataTable,
  leagueIds: string[],
  parentLeagueId?: string,
): Promise<{ data: T[] | null; error: Error | null }> {
  const ids = (leagueIds || []).filter((v) => typeof v === "string" && v.length > 0);
  if (ids.length === 0) return { data: [], error: null };
  try {
    const res = await fetch("/api/public/league-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, leagueIds: ids, ...(parentLeagueId ? { parentLeagueId } : {}) }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: null, error: new Error(`league-data ${table} ${res.status}: ${body}`) };
    }
    const json = await res.json();
    return { data: Array.isArray(json?.rows) ? (json.rows as T[]) : [], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
