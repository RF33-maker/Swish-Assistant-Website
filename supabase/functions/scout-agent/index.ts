import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeScoutingFacts, type ScoutingFacts } from "./facts.ts";
import { loadScoutingBundle } from "./load.ts";
import { isSameTeam } from "./teamIdentity.ts";
import { generateGamePlan, type GamePlan } from "./agent.ts";

/**
 * scout-agent — builds opponent scouting reports and game plans.
 *
 * Actions (POST JSON, header x-scout-secret required):
 *   { action: "build", leagueId, opponentName, forTeamName?, gameKey?, matchTime?, requestedBy?, force? }
 *       Queue one report and build it in the background. Returns 202 at once.
 *   { action: "sweep", days?, limit? }
 *       Called by pg_cron. Finds fixtures in the next few days, makes sure both
 *       sides have a fresh report, and starts up to `limit` builds.
 *   { action: "facts", leagueId, opponentName, forTeamName? }
 *       Returns the computed fact pack only (no model call). For checking numbers.
 *
 * Auth is a shared secret held in Vault (scout_agent_cron_secret) and read via
 * the service-role-only public.scout_agent_secret() function, so pg_cron and
 * the site's server can both call this without any dashboard configuration.
 */

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const MODEL = Deno.env.get("SCOUT_MODEL") || "claude-opus-5-5";
const STALE_HOURS = 72;
const BUILD_TIMEOUT_MIN = 15; // a "building" row older than this is presumed dead

const secretCache = new Map<string, string | null>();
async function secret(name: string): Promise<string | null> {
  if (secretCache.has(name)) return secretCache.get(name)!;
  const { data, error } = await db.rpc("scout_agent_secret", { p_name: name });
  if (error) console.error("secret lookup failed", name, error.message);
  const value = (data as string | null) ?? null;
  secretCache.set(name, value);
  return value;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ---------- building one report ----------

function buildTeaser(facts: ScoutingFacts, plan: GamePlan | null) {
  const id = facts.identity;
  const pick = (k: string) => (id as Record<string, { value: number | null; rank: number | null; of: number | null }>)[k];
  const keyNumbers = ["pace", "offRating", "defRating", "efgPct", "tovPct", "threeRate"]
    .map((k) => ({ key: k, ...pick(k) }))
    .filter((m) => m.value != null);
  const top = facts.players.filter((p) => p.onRecentRoster).slice(0, 3).map((p) => ({ name: p.name, ppg: p.ppg, mpg: p.mpg }));
  return {
    headline: plan?.headline ?? null,
    freeInsight: plan?.freeInsight ?? null,
    record: facts.opponent.record,
    gamesAnalysed: facts.opponent.gamesAnalysed,
    dataThrough: facts.opponent.dataThrough,
    keyNumbers,
    topScorers: top,
    confidence: plan?.confidence ?? null,
  };
}

interface BuildRequest {
  leagueId: string;
  opponentName: string;
  forTeamName?: string | null;
  gameKey?: string | null;
  matchTime?: string | null;
  requestedBy?: string | null;
}

async function computeFactsFor(r: BuildRequest) {
  const bundle = await loadScoutingBundle({
    db,
    isSameTeam,
    opponentName: r.opponentName,
    leagueId: r.leagueId,
    myTeamName: r.forTeamName || null,
    maxGames: 10,
  });
  return computeScoutingFacts(bundle, { isSameTeam });
}

async function build(r: BuildRequest) {
  const key = { league_id: r.leagueId, opponent_name: r.opponentName, for_team_name: r.forTeamName || "" };
  const started = Date.now();
  try {
    const facts = await computeFactsFor(r);
    if (facts.opponent.gamesAnalysed === 0) {
      await db.from("scout_agent_reports").update({
        status: "no_data", facts, plan: null, teaser: buildTeaser(facts, null), games_analysed: 0,
        error: null, updated_at: new Date().toISOString(), generated_at: new Date().toISOString(),
      }).match(key);
      return;
    }
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY") || (await secret("anthropic_api_key"));
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    const plan = await generateGamePlan(facts, { apiKey, model: MODEL });
    await db.from("scout_agent_reports").update({
      status: "ready", facts, plan, teaser: buildTeaser(facts, plan), model: MODEL, error: null,
      games_analysed: facts.opponent.gamesAnalysed, data_through: facts.opponent.dataThrough,
      updated_at: new Date().toISOString(), generated_at: new Date().toISOString(),
    }).match(key);
    console.log(`built ${r.opponentName} for ${r.forTeamName || "-"} in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("build failed", r.opponentName, message);
    await db.from("scout_agent_reports").update({ status: "failed", error: message.slice(0, 1000), updated_at: new Date().toISOString() }).match(key);
  }
}

/** Mark a row as building (creating it if needed). Returns false if another build is already in flight. */
async function claim(r: BuildRequest, force: boolean): Promise<boolean> {
  const key = { league_id: r.leagueId, opponent_name: r.opponentName, for_team_name: r.forTeamName || "" };
  const { data: existing } = await db.from("scout_agent_reports").select("id, status, updated_at, attempts").match(key).maybeSingle();
  const now = new Date();
  if (existing?.status === "building" && !force) {
    const age = (now.getTime() - new Date(existing.updated_at).getTime()) / 60000;
    if (age < BUILD_TIMEOUT_MIN) return false;
  }
  const row = {
    ...key,
    status: "building",
    game_key: r.gameKey ?? null,
    match_time: r.matchTime ?? null,
    requested_by: r.requestedBy ?? null,
    attempts: (existing?.attempts ?? 0) + 1,
    updated_at: now.toISOString(),
  };
  if (existing) {
    // Keep the old plan visible while the new one builds.
    const { game_key, match_time, ...rest } = row;
    await db.from("scout_agent_reports").update({ ...rest, ...(game_key ? { game_key } : {}), ...(match_time ? { match_time } : {}) }).eq("id", existing.id);
  } else {
    await db.from("scout_agent_reports").insert(row);
  }
  return true;
}

// ---------- sweep ----------

async function sweep(days: number, limit: number, selfUrl: string, scoutSecret: string) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86_400_000);
  const { data: fixtures, error } = await db.from("game_schedule")
    .select("game_key, league_id, hometeam, awayteam, matchtime")
    .gte("matchtime", now.toISOString()).lte("matchtime", until.toISOString())
    .not("league_id", "is", null).order("matchtime").limit(500);
  if (error) throw new Error(error.message);

  // Both perspectives for every fixture: home scouting away, away scouting home.
  const wanted: BuildRequest[] = [];
  for (const f of fixtures || []) {
    if (!f.hometeam || !f.awayteam) continue;
    wanted.push({ leagueId: f.league_id, opponentName: f.awayteam, forTeamName: f.hometeam, gameKey: f.game_key, matchTime: f.matchtime });
    wanted.push({ leagueId: f.league_id, opponentName: f.hometeam, forTeamName: f.awayteam, gameKey: f.game_key, matchTime: f.matchtime });
  }
  if (!wanted.length) return { fixtures: 0, queued: 0 };

  const leagueIds = Array.from(new Set(wanted.map((w) => w.leagueId)));
  const { data: rows } = await db.from("scout_agent_reports")
    .select("league_id, opponent_name, for_team_name, status, generated_at, updated_at, attempts")
    .in("league_id", leagueIds);
  const byKey = new Map((rows || []).map((r: any) => [`${r.league_id}|${r.opponent_name}|${r.for_team_name}`, r]));

  const staleBefore = now.getTime() - STALE_HOURS * 3_600_000;
  const needs = wanted.filter((w) => {
    const r: any = byKey.get(`${w.leagueId}|${w.opponentName}|${w.forTeamName}`);
    if (!r) return true;
    if (r.status === "building") return now.getTime() - new Date(r.updated_at).getTime() > BUILD_TIMEOUT_MIN * 60_000;
    if (r.status === "failed") return r.attempts < 4 && now.getTime() - new Date(r.updated_at).getTime() > 30 * 60_000;
    if (r.status === "no_data") return now.getTime() - new Date(r.updated_at).getTime() > 24 * 3_600_000;
    return !r.generated_at || new Date(r.generated_at).getTime() < staleBefore;
  }).slice(0, limit);

  // Each build runs in its own invocation so it gets its own time budget.
  await Promise.all(needs.map((w) =>
    fetch(selfUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-scout-secret": scoutSecret },
      body: JSON.stringify({ action: "build", ...w }),
    }).then((r) => r.text()).catch((e) => console.error("dispatch failed", e))
  ));
  return { fixtures: fixtures?.length ?? 0, candidates: wanted.length, queued: needs.length };
}

// ---------- entry ----------

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const expected = await secret("scout_agent_cron_secret");
  if (!expected || req.headers.get("x-scout-secret") !== expected) return json({ error: "unauthorised" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  if (body.action === "facts") {
    if (!body.leagueId || !body.opponentName) return json({ error: "leagueId and opponentName required" }, 400);
    const facts = await computeFactsFor(body);
    return json({ facts });
  }

  if (body.action === "build") {
    if (!body.leagueId || !body.opponentName) return json({ error: "leagueId and opponentName required" }, 400);
    const r: BuildRequest = {
      leagueId: body.leagueId, opponentName: body.opponentName, forTeamName: body.forTeamName || null,
      gameKey: body.gameKey || null, matchTime: body.matchTime || null, requestedBy: body.requestedBy || null,
    };
    const claimed = await claim(r, Boolean(body.force));
    if (!claimed) return json({ status: "building" }, 202);
    EdgeRuntime.waitUntil(build(r));
    return json({ status: "building" }, 202);
  }

  if (body.action === "sweep") {
    // Without a model key every build would fail and burn its retries.
    if (!Deno.env.get("ANTHROPIC_API_KEY") && !(await secret("anthropic_api_key"))) return json({ skipped: "ANTHROPIC_API_KEY not configured" });
    const selfUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/scout-agent`;
    const result = await sweep(Number(body.days) || 5, Math.min(Number(body.limit) || 6, 20), selfUrl, expected);
    return json(result);
  }

  return json({ error: "unknown action" }, 400);
});
