import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { isSameTeam } from "./teamIdentityService";
import { getLeagueSides } from "./teamSides";
import { cleanEdit, cleanNote, isEditablePath, isNoteKind, parseWindow, type CoachNote, type PlanEdits, type ScoutWindow } from "@shared/coachNotes";
import { playerNameKey } from "@shared/playerNameKey";

/**
 * Site-side API for the scouting agent (supabase/functions/scout-agent).
 *
 * The agent writes finished reports to public.scout_agent_reports, which has
 * RLS on and no policies, so the only way a browser sees a report is through
 * here. That is where the paywall lives:
 *
 *   - coach accounts, admins and the competition's owner get the full game
 *     plan (Opus, written for their own team) and can ask for a fresh build;
 *   - any signed-in visitor can ask for a "free look" (Sonnet, a headline,
 *     summary and two priorities), built once per opponent and shared;
 *   - signed-out visitors see the free look if one exists.
 *
 * Reports are keyed by the exact team names the agent was given, but the
 * schedule and the box scores don't always spell a club the same way
 * ("Tees Valley Mohawks Senior Men I" vs "Tees Valley Mohawks"), so lookups
 * match on club identity instead of string equality.
 *
 * A report is also keyed by its window (the whole season, the last 5 games or the
 * last 3), so each view keeps its own plan. A coach's notes on an opponent
 * (scout_coach_notes) are private to that coach's club and are read by the agent
 * when it builds their plan.
 */

const FUNCTION_URL = `${process.env.VITE_SUPABASE_URL}/functions/v1/scout-agent`;
const REBUILD_COOLDOWN_MIN = 30;
const PREVIEW_FRESH_HOURS = 72;

type Access = { userId: string | null; full: boolean };

/**
 * Who gets the full plan. Admins everywhere; a competition's owner in their
 * own competition; a coach account only for plans written for their own club
 * — otherwise any coach could read (and pay for builds of) every other
 * club's game plans.
 */
async function resolveAccess(req: Request, leagueId: string, forTeam: string | null = null): Promise<Access> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return { userId: null, full: false };
  const { data, error } = await supabaseAdmin.auth.getUser(header.slice(7));
  if (error || !data.user) return { userId: null, full: false };
  const user = data.user;
  const role = user.app_metadata?.role;
  if (role === "admin") return { userId: user.id, full: true };
  if (role === "coach") {
    const teamId = user.app_metadata?.team_id;
    if (!teamId || !forTeam) return { userId: user.id, full: false };
    const { data: team } = await supabaseAdmin.from("teams").select("name, league_id").eq("team_id", teamId).maybeSingle();
    // The coach's club and the plan's club can be in different competitions, so each name is
    // read in its own: a women's "London Lions" plan is not the men's coach's.
    const sides = await getLeagueSides();
    return { userId: user.id, full: !!team?.name && isSameTeam(sides.name(team.name, team.league_id), sides.name(forTeam, leagueId)) };
  }
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

async function findReport(leagueId: string, opponent: string, forTeam: string, window: ScoutWindow = "season") {
  const { data, error } = await supabaseAdmin
    .from("scout_agent_reports")
    .select("id, league_id, opponent_name, for_team_name, tier, window, edits, game_key, match_time, status, teaser, plan, facts, model, error, games_analysed, data_through, generated_at, updated_at")
    .eq("league_id", leagueId)
    .limit(500);
  if (error) throw new Error(error.message);
  const sameOpp = (data || []).filter((r: any) => isSameTeam(r.opponent_name, opponent));
  const full = sameOpp.filter((r: any) => r.tier !== "preview" && (r.window ?? "season") === window);
  const exact = forTeam ? full.find((r: any) => r.for_team_name && isSameTeam(r.for_team_name, forTeam)) : undefined;
  const preview = sameOpp.find((r: any) => r.tier === "preview" && (r.window ?? "season") === "season");
  return { exact, preview };
}

async function dispatch(body: Record<string, unknown>) {
  const secret = await agentSecret();
  if (!secret) return { ok: false, status: 503, error: "Scouting agent is not configured" };
  const r = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-scout-secret": secret },
    body: JSON.stringify(body),
  });
  if (!r.ok && r.status !== 202) {
    console.error("[scout-agent] dispatch failed:", r.status, await r.text());
    return { ok: false, status: 502, error: "Scouting agent unavailable" };
  }
  return { ok: true, status: 202, error: null };
}

const MAX_NOTES = 60;

function currentEdits(row: any): PlanEdits | null {
  const e = row?.edits;
  if (!e || !row.generated_at || typeof e.basedOn !== "string") return null;
  if (new Date(e.basedOn).getTime() !== new Date(row.generated_at).getTime()) return null;
  return Object.keys(e.fields || {}).length ? { basedOn: e.basedOn, fields: e.fields } : null;
}

/** Notes between one coach's club and one opponent, matched on club identity like the reports. */
async function notesFor(forTeam: string, opponent: string): Promise<any[]> {
  const core = forTeam.replace(/\s+Senior\s+(Men|Women)\b.*$/i, "").replace(/\s+I$/i, "").replace(/[%_,]/g, "").trim();
  if (core.length < 3) return [];
  const { data, error } = await supabaseAdmin
    .from("scout_coach_notes")
    .select("id, for_team_name, opponent_name, scope, player_name, player_key, kind, aspect_label, note, updated_at")
    .ilike("for_team_name", `%${core}%`)
    .limit(500);
  if (error) throw new Error(error.message);
  return (data || []).filter((r: any) => isSameTeam(r.for_team_name, forTeam) && isSameTeam(r.opponent_name, opponent));
}

function shapeNote(r: any): CoachNote {
  const aspect = r.scope === "aspect" ? String(r.player_key).split("#")[1] ?? null : null;
  return { id: r.id, scope: r.scope, playerName: r.player_name ?? null, aspect, aspectLabel: r.aspect_label ?? null, kind: r.kind ?? null, note: r.note, updatedAt: r.updated_at };
}

function shape(row: any, full: boolean) {
  if (!row) return null;
  return {
    tier: row.tier ?? "full",
    window: row.window ?? "season",
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
    // The coach's wording, only while it still belongs to this plan (a rebuild leaves it dormant).
    edits: full ? currentEdits(row) : null,
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
      const window = parseWindow(req.query.window);
      if (!leagueId || !opponent) return res.status(400).json({ error: "leagueId and opponent are required" });

      const access = await resolveAccess(req, leagueId, forTeam || null);
      const { exact, preview } = await findReport(leagueId, opponent, forTeam, window);
      return res.json({
        access: access.full ? "full" : "teaser",
        canBuild: access.full,
        canPreview: !!access.userId,
        // The paid plan, only ever for the caller's own team.
        report: access.full ? shape(exact, true) : null,
        // The shared free look: its plan holds a headline, summary and two priorities.
        preview: preview ? { ...shape(preview, true), facts: null } : null,
      });
    } catch (err: any) {
      console.error("[scout-agent] report lookup failed:", err?.message);
      return res.status(500).json({ error: "Failed to load scouting report" });
    }
  });

  // POST /api/scout-agent/preview { leagueId, opponent }
  // Any signed-in visitor. One shared Sonnet build per opponent, reused for
  // PREVIEW_FRESH_HOURS, so repeated clicks and many visitors cost one call.
  app.post("/api/scout-agent/preview", async (req: Request, res: Response) => {
    try {
      const { leagueId, opponent } = req.body || {};
      if (!leagueId || !opponent) return res.status(400).json({ error: "leagueId and opponent are required" });
      const access = await resolveAccess(req, leagueId);
      if (!access.userId) return res.status(401).json({ error: "Sign in for a free look" });

      const { preview } = await findReport(leagueId, opponent, "");
      if (preview) {
        const ageMin = (Date.now() - new Date(preview.updated_at).getTime()) / 60000;
        if (preview.status === "building" && ageMin < 15) return res.status(202).json({ status: "building" });
        if (preview.status === "ready" && ageMin < PREVIEW_FRESH_HOURS * 60) return res.json({ status: "ready" });
        if (preview.status === "no_data" && ageMin < 24 * 60) return res.json({ status: "no_data" });
      }
      const sent = await dispatch({
        action: "build",
        tier: "preview",
        leagueId,
        opponentName: preview?.opponent_name ?? opponent,
        requestedBy: access.userId,
      });
      if (!sent.ok) return res.status(sent.status).json({ error: sent.error });
      return res.status(202).json({ status: "building" });
    } catch (err: any) {
      console.error("[scout-agent] preview failed:", err?.message);
      return res.status(500).json({ error: "Failed to start free look" });
    }
  });

  // POST /api/scout-agent/build { leagueId, opponent, forTeam, gameKey?, matchTime?, force? }
  app.post("/api/scout-agent/build", async (req: Request, res: Response) => {
    try {
      const { leagueId, opponent, forTeam, gameKey, matchTime, force } = req.body || {};
      const window = parseWindow(req.body?.window);
      if (!leagueId || !opponent) return res.status(400).json({ error: "leagueId and opponent are required" });
      const access = await resolveAccess(req, leagueId, forTeam || null);
      if (!access.userId) return res.status(401).json({ error: "Sign in to build a scouting report" });
      if (!access.full) return res.status(403).json({ error: "Full scouting reports are part of the coach plan" });

      // Don't let repeated clicks burn model calls: a fresh or in-flight report is returned as is.
      const { exact } = await findReport(leagueId, opponent, forTeam || "", window);
      if (exact && !force) {
        const age = (Date.now() - new Date(exact.updated_at).getTime()) / 60000;
        if (exact.status === "building" && age < 15) return res.status(202).json({ status: "building" });
        if (exact.status === "ready" && age < REBUILD_COOLDOWN_MIN) return res.json({ status: "ready" });
      }

      const sent = await dispatch({
        action: "build",
        tier: "full",
        window,
        leagueId,
        // Reuse the stored spelling so the agent updates the same row.
        opponentName: exact?.opponent_name ?? opponent,
        forTeamName: exact?.for_team_name ?? forTeam ?? null,
        gameKey: gameKey ?? null,
        matchTime: matchTime ?? null,
        requestedBy: access.userId,
        force: Boolean(force),
      });
      if (!sent.ok) return res.status(sent.status).json({ error: sent.error });
      return res.status(202).json({ status: "building" });
    } catch (err: any) {
      console.error("[scout-agent] build failed:", err?.message);
      return res.status(500).json({ error: "Failed to start scouting report" });
    }
  });
  // ----- a coach's notes on an opponent -----

  // GET /api/scout-agent/notes?leagueId=&opponent=&forTeam=
  app.get("/api/scout-agent/notes", async (req: Request, res: Response) => {
    try {
      const leagueId = String(req.query.leagueId || "");
      const opponent = String(req.query.opponent || "");
      const forTeam = String(req.query.forTeam || "");
      if (!leagueId || !opponent || !forTeam) return res.status(400).json({ error: "leagueId, opponent and forTeam are required" });
      const access = await resolveAccess(req, leagueId, forTeam);
      if (!access.full) return res.status(403).json({ error: "Coach notes are part of the coach plan" });
      const rows = await notesFor(forTeam, opponent);
      return res.json({ notes: rows.map(shapeNote), canEdit: true });
    } catch (err: any) {
      console.error("[scout-agent] notes lookup failed:", err?.message);
      return res.status(500).json({ error: "Failed to load notes" });
    }
  });

  // PUT /api/scout-agent/notes { leagueId, opponent, forTeam, scope, playerName?, kind?, note }
  // One note per player (or one team-wide note) per opponent; an empty note removes it.
  app.put("/api/scout-agent/notes", async (req: Request, res: Response) => {
    try {
      const { leagueId, opponent, forTeam, scope, playerName, kind } = req.body || {};
      if (!leagueId || !opponent || !forTeam) return res.status(400).json({ error: "leagueId, opponent and forTeam are required" });
      if (scope !== "team" && scope !== "player" && scope !== "aspect") return res.status(400).json({ error: "scope must be team, player or aspect" });
      const aspect = scope === "aspect" ? String(req.body?.aspect || "") : "";
      if (scope === "aspect" && !/^[A-Za-z0-9_-]{1,40}$/.test(aspect)) return res.status(400).json({ error: "aspect is required for an aspect note" });
      const access = await resolveAccess(req, leagueId, forTeam);
      if (!access.userId) return res.status(401).json({ error: "Sign in to add notes" });
      if (!access.full) return res.status(403).json({ error: "Coach notes are part of the coach plan" });

      const nameKey = scope === "team" ? "" : playerNameKey(String(playerName || ""));
      if (scope !== "team" && !nameKey) return res.status(400).json({ error: "playerName is required for a player note" });
      const playerKey = scope === "aspect" ? `${nameKey}#${aspect}` : nameKey;
      const note = cleanNote(req.body?.note);

      const rows = await notesFor(forTeam, opponent);
      const existing = rows.find((r: any) => r.scope === scope && r.player_key === playerKey);
      if (!note) {
        if (existing) await supabaseAdmin.from("scout_coach_notes").delete().eq("id", existing.id);
        return res.json({ notes: rows.filter((r: any) => r.id !== existing?.id).map(shapeNote) });
      }
      if (!existing && rows.length >= MAX_NOTES) return res.status(400).json({ error: `That is the most notes (${MAX_NOTES}) for one opponent` });

      const values = {
        note,
        kind: scope === "player" && isNoteKind(kind) ? kind : null,
        aspect_label: scope === "aspect" ? String(req.body?.aspectLabel || "").slice(0, 80) || null : null,
        league_id: leagueId,
        updated_at: new Date().toISOString(),
      };
      const { error } = existing
        ? await supabaseAdmin.from("scout_coach_notes").update(values).eq("id", existing.id)
        : await supabaseAdmin.from("scout_coach_notes").insert({
            ...values,
            for_team_name: forTeam,
            opponent_name: opponent,
            scope,
            player_name: scope === "team" ? null : String(playerName).slice(0, 120),
            player_key: playerKey,
            created_by: access.userId,
          });
      if (error) throw new Error(error.message);
      return res.json({ notes: (await notesFor(forTeam, opponent)).map(shapeNote) });
    } catch (err: any) {
      console.error("[scout-agent] note save failed:", err?.message);
      return res.status(500).json({ error: "Failed to save the note" });
    }
  });
  // PUT /api/scout-agent/edits { leagueId, opponent, forTeam, window, fields: { path: text | null } }
  // The coach's wording over the AI's, kept with the plan it was written against. null or empty puts the AI's text back.
  app.put("/api/scout-agent/edits", async (req: Request, res: Response) => {
    try {
      const { leagueId, opponent, forTeam, fields } = req.body || {};
      const window = parseWindow(req.body?.window);
      if (!leagueId || !opponent || !forTeam || !fields || typeof fields !== "object") return res.status(400).json({ error: "leagueId, opponent, forTeam and fields are required" });
      const access = await resolveAccess(req, leagueId, forTeam);
      if (!access.userId) return res.status(401).json({ error: "Sign in to edit the report" });
      if (!access.full) return res.status(403).json({ error: "Editing is part of the coach plan" });

      const { exact } = await findReport(leagueId, opponent, forTeam, window);
      if (!exact || exact.status !== "ready" || !exact.generated_at) return res.status(409).json({ error: "There is no finished plan to edit yet" });

      const keep: Record<string, string> = currentEdits(exact)?.fields ?? {};
      const next = { ...keep };
      for (const [path, raw] of Object.entries(fields as Record<string, unknown>)) {
        if (!isEditablePath(path)) return res.status(400).json({ error: `${String(path).slice(0, 60)} cannot be edited` });
        const text = cleanEdit(raw);
        if (text) next[path] = text; else delete next[path];
      }
      if (Object.keys(next).length > 80) return res.status(400).json({ error: "Too many edits on one plan" });
      const edits: PlanEdits | null = Object.keys(next).length ? { basedOn: exact.generated_at, fields: next } : null;
      const { error } = await supabaseAdmin.from("scout_agent_reports").update({ edits }).eq("id", exact.id);
      if (error) throw new Error(error.message);
      return res.json({ edits });
    } catch (err: any) {
      console.error("[scout-agent] edit failed:", err?.message);
      return res.status(500).json({ error: "Failed to save your edit" });
    }
  });
}
