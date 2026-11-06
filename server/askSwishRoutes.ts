import type { Express, Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "./supabaseServiceClient";
import type { AskEvent, AskRequest, AskScope, AskSuggestionGroup, AskSurface } from "@shared/askSwish";
import { runAskSwish } from "./askSwish/agent";
import { anthropicClientOptions } from "./askSwish/anthropicClient";
import { quotaFor, recordQuestion, recordUsage, LIMITS, type Tier } from "./askSwish/quota";
import * as d from "./askSwish/data";
import { planFor } from "./billing/entitlements";

/**
 * Ask Swish — the HTTP side.
 *
 *   POST /api/ask             signed-in users; streams AskEvent JSON as SSE
 *   GET  /api/ask/suggestions chips for an empty panel, from live data, cached
 *
 * Who pays for what: every signed-in account can ask, on the everyday model
 * within a free allowance (see askSwish/quota.ts); Swish+ members get a
 * bigger allowance on the same model; coach and admin accounts get the
 * stronger model and the largest allowance. Both
 * models are env-overridable so the split can move without a deploy of code.
 */

const MODEL_FREE = process.env.ASK_SWISH_MODEL || "claude-sonnet-5-5";
const MODEL_PRO = process.env.ASK_SWISH_MODEL_PRO || "claude-opus-5-5";
const EFFORT = (process.env.ASK_SWISH_EFFORT as "low" | "medium" | "high") || "medium";

async function identify(req: Request): Promise<{ userId: string; tier: Tier } | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return null;
  const role = data.user.app_metadata?.role;
  if (role === "admin" || role === "coach") return { userId: data.user.id, tier: "pro" };
  // A paid coach row also counts as pro, even before the coach role has caught up.
  const plan = await planFor(data.user.id, role ?? null).catch(() => null);
  return { userId: data.user.id, tier: plan?.coach ? "pro" : plan?.plus ? "plus" : "free" };
}

const WINDOW_LABEL = { hour: "this hour", week: "this week", month: "this month" } as const;

function limitMessage(tier: Tier, window: "hour" | "week" | "month", resetAt: string | null): string {
  const max = LIMITS[tier][window];
  const when = resetAt ? new Date(resetAt).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit" }) : "later";
  return tier === "free"
    ? `You've used your ${max} free questions ${WINDOW_LABEL[window]}. The next one opens ${when}, or Swish+ gives you ${LIMITS.plus.month} a month.`
    : `You've reached ${max} questions ${WINDOW_LABEL[window]}. The next one opens ${when}.`;
}

function cleanScope(raw: unknown): AskScope {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof s[k] === "string" && (s[k] as string).length < 200 ? (s[k] as string) : null);
  return { leagueId: str("leagueId"), leagueName: str("leagueName"), leagueSlug: str("leagueSlug"), gameKey: str("gameKey"), gameLabel: str("gameLabel"), teamName: str("teamName"), playerName: str("playerName"), playerId: str("playerId") };
}

const SURFACES: AskSurface[] = ["site", "coaches-hub", "page"];

export function registerAskSwishRoutes(app: Express) {
  app.post("/api/ask", async (req: Request, res: Response) => {
    const who = await identify(req);
    const body = (req.body ?? {}) as AskRequest;
    const messages = Array.isArray(body.messages) ? body.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-20) : [];
    if (!messages.length || messages[messages.length - 1].role !== "user" || messages.some((m) => m.content.length > 2000)) {
      return res.status(400).json({ error: "Send a conversation ending with a user message under 2000 characters." });
    }

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders?.();
    const emit = (event: AskEvent) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`); };
    const end = () => { if (!res.writableEnded) res.end(); };

    if (!who) { emit({ type: "error", code: "unauthenticated", message: "Sign in to ask Swish." }); return end(); }
    const quota = await quotaFor(who.userId, who.tier);
    if (quota.exhausted) { emit({ type: "error", code: "rate_limited", message: limitMessage(who.tier, quota.exhausted, quota.resetAt), quota }); return end(); }
    const client = await anthropicClientOptions();
    if (!client) { emit({ type: "error", code: "unavailable", message: "Ask Swish isn't configured on this server yet." }); return end(); }

    const controller = new AbortController();
    req.on("close", () => controller.abort());
    const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, 15000);
    const model = who.tier === "pro" ? MODEL_PRO : MODEL_FREE;
    const surface: AskSurface = SURFACES.includes(body.surface as AskSurface) ? (body.surface as AskSurface) : "site";
    const rowId = await recordQuestion(who.userId, who.tier, model, surface);
    try {
      const usage = await runAskSwish({ client, model, effort: EFFORT, messages, scope: cleanScope(body.scope), surface, emit, signal: controller.signal });
      // One line per answer in the server log, so spend can be read off without a dashboard.
      console.log(`[ask-swish] ${who.tier} ${model} rounds=${usage.rounds} in=${usage.input} cacheW=${usage.cacheWrite} cacheR=${usage.cacheRead} out=${usage.output}`);
      await recordUsage(rowId, usage, "done");
      emit({ type: "done", model, tier: who.tier, usage, quota: await quotaFor(who.userId, who.tier) });
    } catch (err) {
      await recordUsage(rowId, null, "failed");
      if (!controller.signal.aborted) {
        if (err instanceof Anthropic.APIError) {
          console.error("[ask-swish] API error", err.status, err.message);
          const credit = err.status === 400 && /credit/i.test(err.message);
          emit({ type: "error", code: err.status === 401 || credit ? "unavailable" : "failed", message: credit || err.status === 401 ? "Ask Swish is temporarily unavailable." : err.status === 429 ? "Swish is busy right now — try again in a moment." : "Something went wrong answering that. Try again." });
        } else {
          console.error("[ask-swish] failed", err);
          emit({ type: "error", code: "failed", message: "Something went wrong answering that. Try again." });
        }
      }
    } finally {
      clearInterval(heartbeat);
      end();
    }
  });

  // The allowance for the signed-in account, shown in the panel before the first question.
  app.get("/api/ask/quota", async (req: Request, res: Response) => {
    const who = await identify(req);
    if (!who) return res.status(401).json({ error: "Sign in to ask Swish." });
    res.set("Cache-Control", "no-store");
    res.json({ quota: await quotaFor(who.userId, who.tier) });
  });

  const suggestionCache = new Map<string, { at: number; groups: AskSuggestionGroup[] }>();
  app.get("/api/ask/suggestions", async (req: Request, res: Response) => {
    const q = req.query as Record<string, string | undefined>;
    const surface: AskSurface = SURFACES.includes(q.surface as AskSurface) ? (q.surface as AskSurface) : "site";
    const key = `${q.leagueId ?? ""}|${q.gameKey ?? ""}|${q.teamName ?? ""}|${q.playerName ?? ""}|${surface}`;
    const hit = suggestionCache.get(key);
    if (hit && Date.now() - hit.at < 60e3) return res.json({ groups: hit.groups });
    try {
      const groups = await buildSuggestions({ leagueId: q.leagueId, gameKey: q.gameKey, teamName: q.teamName, playerName: q.playerName }, surface);
      suggestionCache.set(key, { at: Date.now(), groups });
      res.set("Cache-Control", "public, max-age=60");
      res.json({ groups });
    } catch (err) {
      console.error("[ask-swish] suggestions failed", err);
      res.json({ groups: genericSuggestions() });
    }
  });
}

function genericSuggestions(): AskSuggestionGroup[] {
  return [
    { label: "Scores and fixtures", questions: ["What's on today?", "Latest results across the leagues", "When are the next NBL D1 tip-offs?"] },
    { label: "Standings and leaders", questions: ["NBL Division One standings", "Who leads the SLB Championship in scoring?", "Best 3-point shooters in the WNBL"] },
    { label: "Deeper", questions: ["Which BCB team has the best net rating?", "Biggest single-game performance in the NBL this season", "Who has the biggest on/off impact in the SLB?"] },
  ];
}

async function buildSuggestions(scope: AskScope, surface: AskSurface): Promise<AskSuggestionGroup[]> {
  if (scope.gameKey) {
    const g = await d.gameDetail(scope.gameKey);
    if (g) {
      const live = g.game_status !== "Final" && d.gameState(g.game_status, g.match_time, g.home_score != null) === "live";
      const played = g.game_status === "Final" || live;
      const groups: AskSuggestionGroup[] = [
        { label: "This game", questions: played ? ["Who's been the best player so far?", `How did ${g.home_team} and ${g.away_team} shoot?`, live ? "What's the story of the game right now?" : "What decided this game?"] : [`How are ${g.home_team} and ${g.away_team} doing this season?`, `Compare ${g.home_team} and ${g.away_team}`, "When is tip-off?"] },
        { label: "The teams", questions: [`Compare ${g.home_team} and ${g.away_team}`, `${g.home_team}'s top scorers`, `Who has the better defence, ${g.home_team} or ${g.away_team}?`] },
      ];
      if (surface === "coaches-hub" && played) groups.push({ label: "Play-by-play", questions: ["What were the biggest scoring runs?", "Show me the clutch minutes", `Which ${g.home_team} lineups worked?`] });
      return groups;
    }
  }
  const comp = await d.competitionById(scope.leagueId);
  if (!comp) {
    if (scope.playerName) return [{ label: "This player", questions: [`How is ${scope.playerName} doing this season?`, `${scope.playerName}'s last five games`, `Where does ${scope.playerName} rank in scoring?`] }, ...genericSuggestions().slice(0, 1)];
    return genericSuggestions();
  }
  const ids = await d.leagueFamily(comp.league_id);
  const standings = d.computeStandings(await d.finalResults(ids, 600));
  const { data: scorers } = await supabaseAdmin.from("v_player_season_averages").select("player_name, team_name, avg_pts").in("league_id", ids).gte("games_played", 2).order("avg_pts", { ascending: false }).limit(2);
  const top = standings[0]?.team, second = standings[1]?.team;
  const s1 = scorers?.[0]?.player_name, s2 = scorers?.[1]?.player_name;
  const n = comp.name;
  if (scope.teamName) {
    return [
      { label: scope.teamName, questions: [`How are ${scope.teamName} doing in the ${n}?`, `${scope.teamName}'s top scorers`, `When do ${scope.teamName} play next?`] },
      { label: "Compare", questions: top && top !== scope.teamName ? [`Compare ${scope.teamName} and ${top}`, `Who has the biggest on/off impact for ${scope.teamName}?`] : [`Who has the biggest on/off impact for ${scope.teamName}?`] },
    ];
  }
  if (scope.playerName) {
    return [
      { label: scope.playerName, questions: [`How is ${scope.playerName} doing this season?`, `Where does ${scope.playerName} rank in the ${n}?`, s1 && s1 !== scope.playerName ? `Compare ${scope.playerName} and ${s1}` : `${scope.playerName}'s last five games`] },
      { label: n, questions: [`${n} standings`, `Top scorers in the ${n}`] },
    ];
  }
  const groups: AskSuggestionGroup[] = [
    { label: "Standings and form", questions: [`${n} standings`, top ? `How are ${top} doing?` : "Who is top of the table?", "Who's on the best run?"] },
    { label: "Leaders", questions: [`Top scorers in the ${n}`, "Best 3-point shooters (min 3 attempts a game)", "Who leads in net rating?"] },
    { label: "Compare", questions: [top && second ? `Compare ${top} and ${second}` : "Compare the top two teams", s1 && s2 ? `${s1} or ${s2} — who's having the better season?` : "Compare the top two scorers"] },
    { label: "Scores and fixtures", questions: [`Latest ${n} results`, `When are the next ${n} tip-offs?`, "What's on this weekend?"] },
    { label: "Deeper", questions: ["Who has the biggest on/off impact?", "Biggest single-game performance this season", "Which team has the best defence?"] },
  ];
  if (surface === "coaches-hub" && top) groups.push({ label: "Coaching", questions: [`Which ${top} lineups have worked?`, `What does ${top}'s offence look like?`, "Which teams turn the ball over most?"] });
  return groups;
}
