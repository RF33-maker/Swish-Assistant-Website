/**
 * NBL National Cup bracket results.
 *
 * The bracket itself (who plays whom, round by round) is saved in `cup_bracket_games`. This
 * reads Basketball England's public fixtures and results page and writes each game's date,
 * time and score onto its bracket game. Scores only: the early rounds are played at clubs
 * without stats, and nothing here creates teams, players or game pages. Games that do have
 * LiveStats are linked on the page by team names from the schedule, not from here.
 * See shared/nationalCup.ts for how the pages are read.
 */

import { timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import {
  findGameForFixture,
  parseCupDates,
  parseCupFixtures,
  resolveBracket,
  updateFromFixture,
  type CupFixture,
  type CupGameRow,
} from "../shared/nationalCup";

// The bare domain answers 503/508 under load; www is the site's real home.
const SITE = "https://www.basketballengland.co.uk";
const PAGE = `${SITE}/leagues/nbl/fixtures-and-results`;
const USER_AGENT = "SwishAssistantScores/1.0 (+https://swishassistant.com)";
const REQUEST_TIMEOUT_MS = 15_000;

/** Cups we keep a bracket for: our competition and Basketball England's id for the same division. */
export const NATIONAL_CUPS = [
  {
    key: "men",
    name: "Men's National Cup",
    leagueId: "5bfc6142-fc92-4142-bf54-ab2c3728b139",
    gradeId: "34e8c612-cdc2-4eb2-9331-8cf1e8ed906c",
  },
] as const;

type Deps = { requireAdmin: (req: Request, res: Response) => Promise<string | null> };

export type CupRefreshResult = {
  cup: string;
  matchDays: number;
  fixturesSeen: number;
  gamesUpdated: number;
  /** Fixtures on the site that didn't line up with a bracket game, so someone can look. */
  unmatched: string[];
};

const ATTEMPTS = 4;

/** The shared host answers 429/5xx (503, 507, 508) when it is busy; wait a little and ask again rather than fail the run. */
async function fetchPatiently(url: string, init: RequestInit): Promise<globalThis.Response> {
  let last: globalThis.Response | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (last.status !== 429 && last.status < 500) return last;
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 8000 * attempt));
  }
  return last!;
}

/**
 * The results endpoints only answer a visitor who has loaded the page (it hands out a session
 * cookie). The page redirects from www to the bare domain, which starts a second session; the
 * ajax calls go to www, so the cookie we want is the one from the first response, not the last.
 */
async function openSession(): Promise<string> {
  const res = await fetchPatiently(PAGE, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "manual" });
  if (res.status >= 400) throw new Error(`Basketball England answered ${res.status} for the fixtures page`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!cookie) throw new Error("Basketball England didn't start a session.");
  return cookie;
}

async function post(path: string, cookie: string, body: Record<string, string>): Promise<string> {
  const res = await fetchPatiently(`${SITE}${path}`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html",
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      Referer: PAGE,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams(body),
    // The ajax endpoints answer with a 301 *and* the data in the body (www redirects to the bare
    // domain, PHP prints regardless). Following it would re-ask as a GET and lose the answer.
    redirect: "manual",
  });
  if (res.status >= 400) throw new Error(`Basketball England answered ${res.status} for ${path}`);
  return res.text();
}

/** Today's date in the UK, which is where the games are played. */
function todayInUk(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

function daysAgo(today: string, days: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function loadRows(leagueId: string): Promise<CupGameRow[]> {
  const { data, error } = await supabaseAdmin.from("cup_bracket_games").select("*").eq("league_id", leagueId).order("game_no");
  if (error) throw new Error(`Couldn't read the bracket: ${error.message}`);
  return (data ?? []) as CupGameRow[];
}

/**
 * Reads the cup's fixtures from `today - lookbackDays` onwards (so upcoming times are picked
 * up too) and saves them onto the bracket. `lookbackDays: null` reads the whole season.
 */
export async function refreshNationalCup(cup: (typeof NATIONAL_CUPS)[number], lookbackDays: number | null = 4): Promise<CupRefreshResult> {
  const cookie = await openSession();
  const today = todayInUk();
  const earliest = lookbackDays === null ? "0000-00-00" : daysAgo(today, lookbackDays);

  // The site's own page sends auto_select_closest too; without it the list can come back empty.
  // A busy host can answer "No dates available" with a 200, so an empty list is retried, and
  // still empty is an error: a cup always has match days, and a quiet success would hide the problem.
  let allDates: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS && allDates.length === 0; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, 6000 * attempt));
    allDates = parseCupDates(await post("/php/ajax/getDateOptions.php", cookie, { grade_id: cup.gradeId, auto_select_closest: "true", league_id: "" }));
  }
  if (allDates.length === 0) throw new Error(`Basketball England listed no match days for the ${cup.name}.`);
  const dates = allDates.filter((d) => d >= earliest);

  let rows = await loadRows(cup.leagueId);
  const unmatched: string[] = [];
  let fixturesSeen = 0;
  let gamesUpdated = 0;
  const scrapedAt = new Date().toISOString();

  // One day at a time: a day's results can decide who plays on a later day.
  for (const date of dates) {
    const html = await post("/php/ajax/filterResults.php", cookie, { grade_id: cup.gradeId, date, league_id: "" });
    const fixtures: CupFixture[] = parseCupFixtures(html, date);
    fixturesSeen += fixtures.length;
    const games = resolveBracket(rows);
    for (const fx of fixtures) {
      const game = findGameForFixture(games, fx);
      if (!game) {
        unmatched.push(`${date} ${fx.homeTeam} v ${fx.awayTeam}`);
        continue;
      }
      const { error } = await supabaseAdmin
        .from("cup_bracket_games")
        .update({ ...updateFromFixture(game, fx), report_id: fx.reportId, scraped_at: scrapedAt })
        .eq("league_id", cup.leagueId)
        .eq("game_no", game.gameNo);
      if (error) throw new Error(`Couldn't save game ${game.gameNo}: ${error.message}`);
      gamesUpdated++;
    }
    if (fixtures.length > 0) rows = await loadRows(cup.leagueId);
  }
  return { cup: cup.name, matchDays: dates.length, fixturesSeen, gamesUpdated, unmatched };
}

async function refreshAll(lookbackDays: number | null): Promise<CupRefreshResult[]> {
  const out: CupRefreshResult[] = [];
  for (const cup of NATIONAL_CUPS) out.push(await refreshNationalCup(cup, lookbackDays));
  return out;
}

function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(String(req.headers.authorization ?? ""));
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** days: a whole number of days to look back, or "all" for the season. */
function lookback(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return 4;
  if (value === "all") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 400 ? n : undefined;
}

export function registerNationalCupRoutes(app: Express, { requireAdmin }: Deps) {
  // POST /api/admin/national-cup/refresh { days? | "all" } — read Basketball England now
  app.post("/api/admin/national-cup/refresh", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdmin(req, res))) return;
      const days = lookback(req.body?.days);
      if (days === undefined) return res.status(400).json({ error: 'days must be a whole number up to 400, or "all".' });
      res.json({ results: await refreshAll(days) });
    } catch (err: any) {
      console.error("[NationalCup] admin refresh failed", err?.message);
      res.status(502).json({ error: err?.message || "Couldn't read the cup results." });
    }
  });

  // GET /api/cron/national-cup — the daily run. Vercel sends CRON_SECRET as a bearer token.
  app.get("/api/cron/national-cup", async (req: Request, res: Response) => {
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: "CRON_SECRET isn't set." });
    if (!cronAuthorised(req)) return res.status(401).json({ error: "Unauthorised" });
    try {
      const results = await refreshAll(4);
      console.log("[NationalCup] cron", JSON.stringify(results));
      res.json({ results });
    } catch (err: any) {
      console.error("[NationalCup] cron failed", err?.message);
      res.status(502).json({ error: err?.message || "Couldn't read the cup results." });
    }
  });
}
