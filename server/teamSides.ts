import { supabaseAdmin } from "./supabaseServiceClient";
import { buildLeagueSides, type LeagueSides } from "@shared/leagueSides";

export type { LeagueSides };

const TTL_MS = 10 * 60 * 1000;

let cached: { at: number; sides: LeagueSides } | null = null;
let inFlight: Promise<LeagueSides> | null = null;

/** The competitions' genders, cached for ten minutes. A failed refresh serves the last good copy. */
export async function getLeagueSides(): Promise<LeagueSides> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.sides;
  if (!inFlight) {
    inFlight = (async () => {
      const { data, error } = await supabaseAdmin.from("competitions").select("league_id, gender, parent_league_id");
      if (error) throw new Error(error.message);
      const sides = buildLeagueSides((data || []) as any[]);
      cached = { at: Date.now(), sides };
      return sides;
    })().finally(() => { inFlight = null; });
  }
  try {
    return await inFlight;
  } catch {
    if (cached) return cached.sides;
    // Without genders every side keeps its plain name, as before this existed.
    return buildLeagueSides([]);
  }
}
