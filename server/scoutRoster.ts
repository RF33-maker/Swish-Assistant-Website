import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { isSameTeam } from "./teamIdentityService";
import { BOX_SCORE_COLUMNS, buildScoutRoster, type BoxScoreRow } from "@shared/scoutRoster";

/**
 * The scouting report's roster table and league-percentile profiles.
 *
 * GET /api/scout-agent/roster?leagueId=&opponent=&forTeam=
 *
 * Built from public box-score rows (player_stats), so it needs no login and
 * shows nothing the league pages don't already. It sits under /scout-agent
 * because it only exists to fill the scouting report. The numbers come from
 * shared/scoutRoster.ts, which the tests check against real league data.
 */

const PAGE = 1000;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; rows: BoxScoreRow[] }>();

async function leagueRows(leagueIds: string[]): Promise<BoxScoreRow[]> {
  const key = [...leagueIds].sort().join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows;
  const rows: BoxScoreRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("player_stats")
      .select(BOX_SCORE_COLUMNS)
      .in("league_id", leagueIds)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as unknown as BoxScoreRow[]));
    if (!data || data.length < PAGE) break;
    if (from > 200_000) break; // hard stop
  }
  cache.set(key, { at: Date.now(), rows });
  return rows;
}

export function registerScoutRosterRoutes(
  app: Express,
  deps: { filterLeagueIdsForPublicScope: (ids: string[]) => Promise<string[]> },
) {
  app.get("/api/scout-agent/roster", async (req: Request, res: Response) => {
    try {
      const leagueId = String(req.query.leagueId || "");
      const opponent = String(req.query.opponent || "");
      const forTeam = String(req.query.forTeam || "");
      if (!leagueId || !opponent) return res.status(400).json({ error: "leagueId and opponent are required" });

      // The competition plus the private feed competitions that display under it.
      const { data: children } = await supabaseAdmin.from("competitions").select("league_id").eq("parent_league_id", leagueId);
      const candidates = Array.from(new Set([leagueId, ...((children || []).map((c: any) => c.league_id as string))]));
      const ids = await deps.filterLeagueIdsForPublicScope(candidates);
      if (ids.length === 0) return res.status(404).json({ error: "Competition not found" });

      const [rows, { data: comp }, { data: teams }] = await Promise.all([
        leagueRows(ids),
        supabaseAdmin.from("competitions").select("name").eq("league_id", leagueId).maybeSingle(),
        supabaseAdmin.from("teams").select("name, logo_url").in("league_id", ids),
      ]);

      const result = buildScoutRoster(rows, (name) => isSameTeam(name, opponent));
      const logoOf = (name: string) => (teams || []).find((t: any) => t.logo_url && isSameTeam(t.name || "", name))?.logo_url ?? null;

      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return res.json({
        leagueName: comp?.name ?? null,
        ...result,
        logos: { opponent: logoOf(opponent), forTeam: forTeam ? logoOf(forTeam) : null },
      });
    } catch (err: any) {
      console.error("[scout-roster] failed:", err?.message);
      return res.status(500).json({ error: "Failed to load the roster" });
    }
  });
}
