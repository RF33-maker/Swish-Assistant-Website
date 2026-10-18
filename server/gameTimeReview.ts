import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { assessGameTime, instantToWallClock, roundToFiveMinutes, wallClockToStored, type TimeFindingKind } from "../shared/gameTime";

/**
 * Game time review (admin).
 *
 * Looks at recent games and flags the ones whose stored time disagrees with
 * what the scorers' feed did (see shared/gameTime.ts for the rules and for why
 * a stored time is UK wall-clock). An admin can correct a time, which is logged
 * to game_time_changes, or dismiss a flag as "the time is right".
 *
 * Nothing here changes a game on its own: findings are only ever read, and a
 * time changes only when an admin applies one.
 *
 * Needs supabase/migrations/20261017_game_time_review.sql. Until it is applied
 * the review still lists findings (it reports needsMigration) but cannot
 * dismiss, apply or show the change log.
 */

type AdminGuard = (req: Request, res: Response) => Promise<string | null>;

const LOOKBACK_DAYS = 10;
/** Games listed this far ahead are only checked if they are already live or final (dated wrongly). */
const AHEAD_HOURS = 36;
const EVENT_CHUNK = 40;
const GAME_KEY = /^[A-Za-z0-9_-]{1,80}$/;

const KIND_ORDER: Record<TimeFindingKind, number> = { start_mismatch: 0, future_dated: 1, stuck_live: 2, never_started: 3 };

interface ScheduleRow {
  game_key: string;
  hometeam: string | null;
  awayteam: string | null;
  competitionname: string | null;
  matchtime: string;
  status: string | null;
}

/** live_events.created_at has no timezone; it is UTC. */
const asUtc = (s: string) => (/[zZ]|[+-]\d\d(:?\d\d)?$/.test(s) ? s : `${s}Z`);

const missingTable = (err: { code?: string; message?: string } | null) =>
  !!err && (err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST202" || /does not exist|could not find the (table|function)/i.test(err.message ?? ""));

const NEEDS_MIGRATION = "The game-time tables aren't set up yet. Apply supabase/migrations/20261017_game_time_review.sql first.";

async function loadCandidates(): Promise<ScheduleRow[]> {
  const now = Date.now();
  const since = new Date(now - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const until = new Date(now + AHEAD_HOURS * 3600 * 1000).toISOString();
  const cols = "game_key, hometeam, awayteam, competitionname, matchtime, status";

  const [recent, ahead] = await Promise.all([
    supabaseAdmin.from("game_schedule").select(cols).gte("matchtime", since).lte("matchtime", until).order("matchtime", { ascending: false }).limit(2000),
    supabaseAdmin.from("game_schedule").select(cols).in("status", ["live", "final"]).gt("matchtime", until).order("matchtime", { ascending: true }).limit(200),
  ]);
  if (recent.error) throw new Error(recent.error.message);
  if (ahead.error) throw new Error(ahead.error.message);
  const seen = new Set<string>();
  return [...(recent.data ?? []), ...(ahead.data ?? [])].filter((r: any) => r.matchtime && !seen.has(r.game_key) && seen.add(r.game_key)) as ScheduleRow[];
}

interface FeedSignals {
  observedStart: string | null;
  captureSpanMinutes: number;
  lastFeedActivity: string | null;
}

/** What the feed's period events say about each game: when period 1 began, how spread out they are, and the latest. */
async function loadFeedSignals(gameKeys: string[]): Promise<Map<string, FeedSignals>> {
  const out = new Map<string, FeedSignals>();
  for (let i = 0; i < gameKeys.length; i += EVENT_CHUNK) {
    const chunk = gameKeys.slice(i, i + EVENT_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("live_events")
      .select("game_key, sub_type, period, created_at")
      .eq("action_type", "period")
      .in("game_key", chunk)
      .limit(5000);
    if (error) throw new Error(error.message);
    const byGame = new Map<string, { sub_type: string | null; period: number | null; at: number }[]>();
    for (const e of (data ?? []) as any[]) {
      const at = Date.parse(asUtc(e.created_at));
      if (!Number.isFinite(at)) continue;
      const list = byGame.get(e.game_key) ?? [];
      list.push({ sub_type: e.sub_type, period: e.period, at });
      byGame.set(e.game_key, list);
    }
    byGame.forEach((events, key) => {
      const starts = events.filter((e) => e.sub_type === "start" && e.period === 1).map((e) => e.at);
      const all = events.map((e) => e.at);
      out.set(key, {
        observedStart: starts.length ? new Date(Math.min(...starts)).toISOString() : null,
        captureSpanMinutes: (Math.max(...all) - Math.min(...all)) / 60000,
        lastFeedActivity: new Date(Math.max(...all)).toISOString(),
      });
    });
  }
  return out;
}

export function registerGameTimeReviewRoutes(app: Express, { requireAdmin }: { requireAdmin: AdminGuard }) {
  // GET /api/admin/game-times/review — games whose stored time looks wrong
  app.get("/api/admin/game-times/review", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const games = await loadCandidates();
      const signals = await loadFeedSignals(games.map((g) => g.game_key));
      const now = new Date();

      const flagged = games.flatMap((g) => {
        const s = signals.get(g.game_key);
        const finding = assessGameTime(
          { status: g.status, matchtime: g.matchtime, observedStart: s?.observedStart, captureSpanMinutes: s?.captureSpanMinutes, lastFeedActivity: s?.lastFeedActivity },
          now,
        );
        return finding ? [{ game: g, finding, observedStart: s?.observedStart ?? null }] : [];
      });

      // Games an admin has already said are fine, until their time changes.
      let needsMigration = false;
      const dismissed = new Map<string, number>();
      if (flagged.length) {
        const { data, error } = await supabaseAdmin
          .from("game_time_dismissals")
          .select("game_key, matchtime_at_dismissal")
          .in("game_key", flagged.map((f) => f.game.game_key));
        if (error) {
          if (!missingTable(error)) throw new Error(error.message);
          needsMigration = true;
        }
        for (const d of (data ?? []) as any[]) dismissed.set(d.game_key, Date.parse(d.matchtime_at_dismissal));
      }

      const findings = flagged
        .filter((f) => dismissed.get(f.game.game_key) !== Date.parse(f.game.matchtime))
        .sort((a, b) => KIND_ORDER[a.finding.kind] - KIND_ORDER[b.finding.kind] || Date.parse(b.game.matchtime) - Date.parse(a.game.matchtime))
        .map(({ game, finding, observedStart }) => ({
          gameKey: game.game_key,
          homeTeam: game.hometeam,
          awayTeam: game.awayteam,
          competition: game.competitionname,
          status: game.status,
          // Stored times are already UK wall-clock labelled +00, so the first 16 characters are the time as listed.
          listedWallClock: String(game.matchtime).replace(" ", "T").slice(0, 16),
          kind: finding.kind,
          reason: finding.reason,
          suggestedWallClock: finding.suggested,
          observedWallClock: observedStart ? instantToWallClock(roundToFiveMinutes(new Date(observedStart))) : null,
        }));

      res.json({ findings, checked: games.length, needsMigration });
    } catch (err: any) {
      console.error("[GameTimes] review failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't check the game times." });
    }
  });

  // POST /api/admin/game-times/:gameKey/apply { wallClock: "YYYY-MM-DDTHH:mm", note? }
  app.post("/api/admin/game-times/:gameKey/apply", async (req: Request, res: Response) => {
    try {
      const adminId = await requireAdmin(req, res);
      if (!adminId) return;
      const gameKey = String(req.params.gameKey);
      if (!GAME_KEY.test(gameKey)) return res.status(400).json({ error: "That isn't a game key." });
      const stored = wallClockToStored(req.body?.wallClock);
      if (!stored) return res.status(400).json({ error: "Enter the time as a date and time, like 2026-10-17T19:30." });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) || null : null;

      const { data, error } = await supabaseAdmin.rpc("apply_game_time_change", { p_game_key: gameKey, p_matchtime: stored, p_admin: adminId, p_note: note });
      if (error) {
        if (missingTable(error)) return res.status(409).json({ error: NEEDS_MIGRATION });
        if (error.code === "P0002") return res.status(404).json({ error: "No game with that key." });
        throw new Error(error.message);
      }
      const change = Array.isArray(data) ? data[0] : data;
      console.log("[GameTimes] applied", gameKey, JSON.stringify(change), "by", adminId);
      res.json({ ok: true, change: change ?? null });
    } catch (err: any) {
      console.error("[GameTimes] apply failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't change that game's time." });
    }
  });

  // POST /api/admin/game-times/:gameKey/dismiss { note? } — "the time is right"
  app.post("/api/admin/game-times/:gameKey/dismiss", async (req: Request, res: Response) => {
    try {
      const adminId = await requireAdmin(req, res);
      if (!adminId) return;
      const gameKey = String(req.params.gameKey);
      if (!GAME_KEY.test(gameKey)) return res.status(400).json({ error: "That isn't a game key." });
      const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 300) || null : null;

      const { data: game, error: readErr } = await supabaseAdmin.from("game_schedule").select("matchtime").eq("game_key", gameKey).maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!game) return res.status(404).json({ error: "No game with that key." });

      const { error } = await supabaseAdmin
        .from("game_time_dismissals")
        .upsert({ game_key: gameKey, matchtime_at_dismissal: (game as any).matchtime, dismissed_by: adminId, note, dismissed_at: new Date().toISOString() }, { onConflict: "game_key" });
      if (error) {
        if (missingTable(error)) return res.status(409).json({ error: NEEDS_MIGRATION });
        throw new Error(error.message);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[GameTimes] dismiss failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't dismiss that." });
    }
  });

  // GET /api/admin/game-times/changes?limit=100 — the change log, newest first
  app.get("/api/admin/game-times/changes", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 300);
      const { data, error } = await supabaseAdmin
        .from("game_time_changes")
        .select("id, game_key, old_matchtime, new_matchtime, source, changed_by, note, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (missingTable(error)) return res.json({ changes: [], needsMigration: true });
        throw new Error(error.message);
      }
      const rows = (data ?? []) as any[];

      const keys = Array.from(new Set(rows.map((r) => r.game_key)));
      const games = new Map<string, any>();
      if (keys.length) {
        const { data: g } = await supabaseAdmin.from("game_schedule").select("game_key, hometeam, awayteam, competitionname").in("game_key", keys);
        for (const row of (g ?? []) as any[]) games.set(row.game_key, row);
      }
      const adminIds = Array.from(new Set(rows.map((r) => r.changed_by).filter(Boolean))) as string[];
      const emails = new Map<string, string>();
      for (const id of adminIds.slice(0, 20)) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
        if (u?.user?.email) emails.set(id, u.user.email);
      }

      res.json({
        needsMigration: false,
        changes: rows.map((r) => ({
          id: r.id,
          gameKey: r.game_key,
          homeTeam: games.get(r.game_key)?.hometeam ?? null,
          awayTeam: games.get(r.game_key)?.awayteam ?? null,
          competition: games.get(r.game_key)?.competitionname ?? null,
          oldMatchtime: r.old_matchtime,
          newMatchtime: r.new_matchtime,
          source: r.source,
          changedBy: r.changed_by ? emails.get(r.changed_by) ?? r.changed_by : null,
          note: r.note,
          createdAt: r.created_at,
        })),
      });
    } catch (err: any) {
      console.error("[GameTimes] changes failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't load the change log." });
    }
  });
}
