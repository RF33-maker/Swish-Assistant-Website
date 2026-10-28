import { supabase } from "@/lib/supabase";

// Who can run a competition (upload games, edit details): the accounts in
// user_id / created_by, anyone added in competition_managers, and the same
// people for every stop or age group under it. App admins can run them all.
// See supabase/migrations/20261029_competition_managers.sql.

export type ManagedCompetition = {
  league_id: string;
  parent_league_id?: string | null;
  user_id?: string | null;
  created_at?: string;
  [key: string]: any;
};

// Every competition this account manages, newest first.
export async function fetchManagedCompetitions(): Promise<ManagedCompetition[]> {
  const { data, error } = await supabase
    .rpc("managed_competitions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching managed competitions:", error.message);
    throw error;
  }
  return (data || []) as ManagedCompetition[];
}

// The highest managed competition in each family: a season, not its stops.
export function topManagedCompetitions<T extends ManagedCompetition>(rows: T[]): T[] {
  const ids = new Set(rows.map((r) => r.league_id));
  return rows.filter((r) => !r.parent_league_id || !ids.has(r.parent_league_id));
}

export async function canManageCompetition(leagueId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_manage_competition", { p_league_id: leagueId });
  if (error) {
    console.error("Error checking competition access:", error.message);
    return false;
  }
  return data === true;
}
