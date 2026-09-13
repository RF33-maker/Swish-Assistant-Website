import { supabase } from "@/lib/supabase";

// Single-game record thresholds for the Platinum/Diamond accolade tiers.
// Backed by get_player_record_maxes / get_team_record_maxes — Postgres
// functions that compute the max() server-side across every matching row,
// so this stays cheap (one row back) no matter how many games exist in the
// scoped league_id(s).

export interface RecordMaxes {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tpm: number;
}

const EMPTY_MAXES: RecordMaxes = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0 };

const toMaxes = (row: any): RecordMaxes => ({
  pts: row?.pts || 0,
  reb: row?.reb || 0,
  ast: row?.ast || 0,
  stl: row?.stl || 0,
  blk: row?.blk || 0,
  tpm: row?.tpm || 0,
});

export async function fetchPlayerRecordMaxes(leagueIds: string[]): Promise<RecordMaxes> {
  if (leagueIds.length === 0) return EMPTY_MAXES;
  const { data, error } = await supabase.rpc("get_player_record_maxes", { target_league_ids: leagueIds });
  if (error || !data || data.length === 0) return EMPTY_MAXES;
  return toMaxes(data[0]);
}

export async function fetchTeamRecordMaxes(leagueIds: string[]): Promise<RecordMaxes> {
  if (leagueIds.length === 0) return EMPTY_MAXES;
  const { data, error } = await supabase.rpc("get_team_record_maxes", { target_league_ids: leagueIds });
  if (error || !data || data.length === 0) return EMPTY_MAXES;
  return toMaxes(data[0]);
}
