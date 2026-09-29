import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { isSameTeam } from "./teamIdentityService";

/**
 * Site-side API for the scouting agent (supabase/functions/scout-agent).
 *
 * The agent writes finished reports to public.scout_agent_reports, which has
 * RLS on and no policies, so the only way a browser sees a report is through
 * here. That is where the paywall lives:
 *
 *   - everyone gets the teaser (headline, one free insight, key numbers);
 *   - coach accounts, admins and the competition's owner get the full game
 *     plan and fact pack, and can ask for a fresh build.
 *
 * Reports are keyed by the exact team names the agent was given, but the
 * schedule and the box scores don't always spell a club the same way
 * ("Tees Valley Mohawks Senior Men I" vs "Tees Valley Mohawks"), so lookups
 * match on club identity instead of string equality.
 */

const FUNCTION_URL = `${process.env.VITE_SUPABASE_URL}/functions/v1/scout-agent`;
const REBUILD_COOLDOWN_MIN = 30;

type Access = { userId: string | null; full: boolean };

async function resolveAccess(req: Request, leagueId: string): Promise<Access> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return { userId: null, full: false };
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return { userId: null, full: false };
  const user = data.user;
  const role = user.app_metadata?.role;
  if (role === "admin" || role === "coach") return { userId: user.id, full: true };
  const { data: comp } = await supabaseAdmin
    .from("competitions").select("user_id, created_by").eq("league_id", leagueId).maybeSingle();
  const owner = !!comp && (comp.user_id === user.id || comp.created_by === user.id);
  return { userId: user.id, full: owner };
}

async function agentSecret(): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc("scout_agent_secret", { p_name: "scout_agent_cron_secret" });
  if (error) {
    console.error("[scout-agent] secret lookup failed:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

async function findReport(leagueId: string, opponent: string, forTeam: string) {
  const { data, error } = await supabaseAdmin
    .from("scout_agent_reports")
    .select("id, league_id, opponent_name, for_team_name, game_key, match_time, status, teaser, plan, facts, model, error, games_analysed, data_through, generated_at, updated_at")
    .eq("league_id", leagueId)
    .limit(500);
  if (error) throw new Error(error.message);
  const sameOpp = (data || []).filter((r: any) => isSameTeam(r.opponent_name, opponent));
  const exact = forTeam ? sameOpp.find((r: any) => r.for_team_name && isSameTeam(r.for_team_name, forTeam)) : undefined;
  // A report written for a different coach still has a valid teaser (it only
  // describes the opponent), but its game plan talks to that other team.
  const other = sameOpp
    .filter((r: any) => r.status === "ready")
    .sort((a: any, b: any) => String(b.generated_at).localeCompare(String(a.generated_at)))[0];
  return { exact, other };
}

function shape(row: any, full: boolean) {
  if (!row) return null;
  return {
    status: row.status,
    opponentName: row.opponent_name,
    forTeamName: row.for_team_name || null,
    matchTime: row.match_time,
    generatedAt: row.generated_at,
    updatedAt: row.updated_at,
    gamesAnalysed: row.games_analysed,
    dataThrough: row.data_through,
    teaser: row.teaser,
    plan: full ? row.plan : null,
    facts: full ? row.facts : null,
    error: full && row.status === "failed" ? row.error : null,
  };
}

export function registerScoutAgentRoutes(app: Express) {
  // GET /api/scout-agent/report?leagueId=&opponent=&forTeam=
  app.get("/api/scout-agent/report", async (req: Request, res: Response) => {
    try {
      const leagueId = String(req.query.leagueId || "");
      const opponent = String(req.query.opponent || "");
      const forTeam = String(req.query.forTeam || "");
      if (!leagueId || !opponent) return res.status(400).json({ error: "leagueId and opponent are required" });

      const access = await resolveAccess(req, leagueId);
      const { exact, other } = await findReport(leagueId, opponent, forTeam);
      const row = exact ?? other ?? null;
      return res.json({
        access: access.full ? "full" : "teaser",
        canBuild: access.full,
        report: shape(row, access.full && !!exact),
        // Tells the UI the full plan exists but was written for another team.
        perspectiveMismatch: !exact && !!other,
      });
    } catch (err: any) {
      console.error("[scout-agent] report lookup failed:", err?.message);
      return res.status(500).json({ error: "Failed to load scouting report" });
    }
  });

  // POST /api/scout-agent/build { leagueId, opponent, forTeam, gameKey?, matchTime?, force? }
  app.post("/api/scout-agent/build", async (req: Request, res: Response) => {
    try {
      const { leagueId, opponent, forTeam, gameKey, matchTime, force } = req.body || {};
      if (!leagueId || !opponent) return res.status(400).json({ error: "leagueId and opponent are required" });
      const access = await resolveAccess(req, leagueId);
      if (!access.userId) return res.status(401).json({ error: "Sign in to build a scouting report" });
      if (!access.full) return res.status(403).json({ error: "Full scouting reports are part of the coach plan" });

      // Don't let repeated clicks burn model calls: a fresh or in-flight report is returned as is.
      const { exact } = await findReport(leagueId, opponent, forTeam || "");
      if (exact && !force) {
        const age = (Date.now() - new Date(exact.updated_at).getTime()) / 60000;
        if (exact.status === "building" && age < 15) return res.status(202).json({ status: "building" });
        if (exact.status === "ready" && age < REBUILD_COOLDOWN_MIN) return res.json({ status: "ready" });
      }

      const secret = await agentSecret();
      if (!secret) return res.status(503).json({ error: "Scouting agent is not configured" });

      const r = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-scout-secret": secret },
        body: JSON.stringify({
          action: "build",
          leagueId,
          // Reuse the stored spelling so the agent updates the same row.
          opponentName: exact?.opponent_name ?? opponent,
          forTeamName: exact?.for_team_name ?? forTeam ?? null,
          gameKey: gameKey ?? null,
          matchTime: matchTime ?? null,
          requestedBy: access.userId,
          force: Boolean(force),
        }),
      });
      if (!r.ok && r.status !== 202) {
        console.error("[scout-agent] build dispatch failed:", r.status, await r.text());
        return res.status(502).json({ error: "Scouting agent unavailable" });
      }
      return res.status(202).json({ status: "building" });
    } catch (err: any) {
      console.error("[scout-agent] build failed:", err?.message);
      return res.status(500).json({ error: "Failed to start scouting report" });
    }
  });
}
