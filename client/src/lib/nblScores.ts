import { supabase } from "@/lib/supabase";
import type { SavedNblScore } from "@shared/nblScores";

export type NblScoresResponse = { scores: SavedNblScore[]; scrapedAt: string | null };
export type NblRefreshResult = { season: string | null; pools: number; matchDays: number; scoresFound: number; failedPools: string[] };

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || fallback);
  return json as T;
}

/** The saved Division Two scores from the last `days` days. */
export async function fetchNblScores(days = 120): Promise<NblScoresResponse> {
  return readJson(await fetch(`/api/admin/nbl-scores?days=${days}`, { headers: await authHeaders() }), "Couldn't load the scores.");
}

/** Reads Basketball England now and saves what it finds. */
export async function refreshNblScores(days?: number): Promise<NblRefreshResult> {
  return readJson(
    await fetch("/api/admin/nbl-scores/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(days ? { days } : {}),
    }),
    "Couldn't read the scores from Basketball England.",
  );
}
