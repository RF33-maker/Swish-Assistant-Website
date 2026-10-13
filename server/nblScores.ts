/**
 * NBL Division Two scores for Swish Social.
 *
 * Copies final scores from Basketball England's public fixtures and results page into
 * `nbl_scores`, where the "Division Two results" card reads them. Scores only: the site
 * publishes no stats for these games, and nothing here creates competitions, teams or
 * players. See shared/nblScores.ts for how the pages are read.
 */

import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { datesInWindow, parseDateOptions, parseGrades, parseResults, parseSeason, type NblGrade, type NblScoreRow } from "../shared/nblScores";

const SITE = "https://basketballengland.co.uk";
const PAGE = `${SITE}/leagues/nbl/fixtures-and-results`;
const USER_AGENT = "SwishAssistantScores/1.0 (+https://swishassistant.com)";
const REQUEST_TIMEOUT_MS = 15_000;
/** Pools are fetched this many at a time, so a run is a handful of quick requests and never a burst. */
const POOLS_AT_ONCE = 2;

/** The scheduled run only looks back over the last few days; an admin can ask for more to fill in a season. */
export const DEFAULT_LOOKBACK_DAYS = 4;
export const MAX_LOOKBACK_DAYS = 240;

type Deps = { requireAdmin: (req: Request, res: Response) => Promise<string | null> };

export type RefreshResult = {
  season: string | null;
  pools: number;
  matchDays: number;
  scoresFound: number;
  /** Pools whose results couldn't be read; the rest still saved. */
  failedPools: string[];
};

async function request(url: string, body?: Record<string, string>): Promise<string> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? new URLSearchParams(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Basketball England answered ${res.status} for ${url.replace(SITE, "")}`);
  return res.text();
}

/** Today's date in the UK, which is where the games are played. */
function todayInUk(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

async function poolResults(grade: NblGrade, lookbackDays: number, today: string): Promise<{ days: number; rows: NblScoreRow[] }> {
  const dates = datesInWindow(parseDateOptions(await request(`${SITE}/php/ajax/getDateOptions.php`, { grade_id: grade.id, league_id: "" })), today, lookbackDays);
  const rows: NblScoreRow[] = [];
  for (const date of dates) {
    rows.push(...parseResults(await request(`${SITE}/php/ajax/filterResults.php`, { grade_id: grade.id, date, league_id: "" }), date));
  }
  return { days: dates.length, rows };
}

let running: Promise<RefreshResult> | null = null;

/** Reads the last `lookbackDays` of Division Two results and saves them. One run at a time. */
export function refreshNblScores(lookbackDays: number = DEFAULT_LOOKBACK_DAYS): Promise<RefreshResult> {
  if (!running) {
    running = doRefresh(lookbackDays).finally(() => {
      running = null;
    });
  }
  return running;
}

async function doRefresh(lookbackDays: number): Promise<RefreshResult> {
  const page = await request(PAGE);
  const grades = parseGrades(page);
  // The site has changed shape if its division picker no longer lists any Division Two pools:
  // fail loudly rather than quietly saving nothing for weeks.
  if (grades.length === 0) throw new Error("Couldn't find any Division Two pools on the Basketball England page. Has the page changed?");
  const season = parseSeason(page);
  const today = todayInUk();

  const failedPools: string[] = [];
  let matchDays = 0;
  const saved: Record<string, unknown>[] = [];
  const scrapedAt = new Date().toISOString();

  await mapLimit(grades, POOLS_AT_ONCE, async (grade) => {
    try {
      const { days, rows } = await poolResults(grade, lookbackDays, today);
      matchDays += days;
      for (const r of rows) {
        saved.push({
          grade_id: grade.id,
          grade_name: grade.name,
          season: season ?? "",
          game_date: r.gameDate,
          tip_time: r.tipTime,
          home_team: r.homeTeam,
          away_team: r.awayTeam,
          home_score: r.homeScore,
          away_score: r.awayScore,
          home_logo_url: r.homeLogoUrl,
          away_logo_url: r.awayLogoUrl,
          report_id: r.reportId,
          scraped_at: scrapedAt,
        });
      }
    } catch (err: any) {
      console.error(`[NblScores] ${grade.name} failed:`, err?.message);
      failedPools.push(grade.name);
    }
  });

  if (failedPools.length === grades.length) throw new Error("Couldn't read results for any Division Two pool.");

  if (saved.length > 0) {
    const { error } = await supabaseAdmin.from("nbl_scores").upsert(saved, { onConflict: "grade_id,game_date,home_team,away_team" });
    if (error) throw new Error(`Couldn't save the scores: ${error.message}`);
  }
  return { season, pools: grades.length, matchDays, scoresFound: saved.length, failedPools };
}

function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(String(req.headers.authorization ?? ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function lookback(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return DEFAULT_LOOKBACK_DAYS;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= MAX_LOOKBACK_DAYS ? n : null;
}

export function registerNblScoreRoutes(app: Express, { requireAdmin }: Deps) {
  // GET /api/admin/nbl-scores?days=60 — saved scores from the last `days` days, newest first
  app.get("/api/admin/nbl-scores", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const days = Number(req.query.days ?? 60);
      if (!Number.isInteger(days) || days < 1 || days > 400) return res.status(400).json({ error: "days must be between 1 and 400." });
      const since = new Date(`${todayInUk()}T00:00:00Z`);
      since.setUTCDate(since.getUTCDate() - days);
      const { data, error } = await supabaseAdmin
        .from("nbl_scores")
        .select("id, grade_id, grade_name, season, game_date, tip_time, home_team, away_team, home_score, away_score, home_logo_url, away_logo_url, scraped_at")
        .gte("game_date", since.toISOString().slice(0, 10))
        .order("game_date", { ascending: false })
        .order("tip_time", { ascending: true })
        .limit(2000);
      if (error) throw new Error(error.message);
      res.json({ scores: data ?? [], scrapedAt: (data ?? []).reduce<string | null>((m, r: any) => (!m || r.scraped_at > m ? r.scraped_at : m), null) });
    } catch (err: any) {
      console.error("[NblScores] read failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't load the scores." });
    }
  });

  // POST /api/admin/nbl-scores/refresh { days? } — read Basketball England now
  app.post("/api/admin/nbl-scores/refresh", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const days = lookback(req.body?.days);
      if (days === null) return res.status(400).json({ error: `days must be a whole number up to ${MAX_LOOKBACK_DAYS}.` });
      res.json(await refreshNblScores(days));
    } catch (err: any) {
      console.error("[NblScores] admin refresh failed", err?.message);
      res.status(502).json({ error: err?.message || "Couldn't read the scores." });
    }
  });

  // GET /api/cron/nbl-scores — the weekend run. Vercel sends CRON_SECRET as a bearer token.
  app.get("/api/cron/nbl-scores", async (req: Request, res: Response) => {
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET isn't set." });
    if (!cronAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });
    try {
      const out = await refreshNblScores();
      console.log("[NblScores] cron", JSON.stringify(out));
      res.json(out);
    } catch (err: any) {
      console.error("[NblScores] cron run failed", err?.message);
      res.status(500).json({ error: err?.message || "Couldn't read the scores." });
    }
  });
}
