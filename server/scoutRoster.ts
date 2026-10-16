import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { isSameTeam } from "./teamIdentityService";
import { getLeagueSides } from "./teamSides";
import { teamClubKey } from "@shared/teamIdentity";
import { bestPlayerName, playerNameKey } from "@shared/playerNameKey";
import { seasonLabel, seasonStart } from "@shared/season";
import { parseWindow, windowGames, windowLabel } from "@shared/coachNotes";
import { parseScope } from "@shared/scoutScope";
import { applyWindow, BOX_SCORE_COLUMNS, buildScoutRoster, type BoxScoreRow, type Headshot, type ScoutRoster } from "@shared/scoutRoster";

/**
 * The scouting report's roster table and league-percentile profiles.
 *
 * GET /api/scout-agent/roster?leagueId=&opponent=&forTeam=&window=season|last5|last3&exclude=<league ids>
 *
 * Built from public box-score rows (player_stats), so it needs no login and
 * shows nothing the league pages don't already. The numbers come from
 * shared/scoutRoster.ts, which the tests check against real league data.
 *
 * It looks at the whole season, not one competition. A club plays in several
 * (British Championship and its Trophy, the NBL and its Cup) and early on only
 * a game or two have come in any one of them, so every game since the season
 * began is counted, whichever competition it was in, and a player's games are
 * joined up across competitions. The percentiles are measured against every
 * player from the clubs in the competition being scouted, counted the same way.
 */

const PAGE = 1000;
const CACHE_MS = 5 * 60 * 1000;

type Comp = { league_id: string; name: string | null; is_public: boolean | null; parent_league_id: string | null };
type SeasonRows = { at: number; since: string; rows: BoxScoreRow[]; names: Map<string, string>; playedAt: Map<string, string> };
let seasonCache: SeasonRows | null = null;
let seasonInFlight: Promise<SeasonRows> | null = null;

async function all<T>(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message || String(error));
    out.push(...((data || []) as T[]));
    if (!data || data.length < PAGE) break;
    if (from > 200_000) break; // hard stop
  }
  return out;
}

/** Every public competition's box scores for games played since the season began. */
async function loadSeason(): Promise<SeasonRows> {
  const now = new Date();
  const since = seasonStart(now);
  const comps = await all<Comp>((f, t) => supabaseAdmin.from("competitions").select("league_id, name, is_public, parent_league_id").order("league_id").range(f, t));
  const byId = new Map(comps.map((c) => [c.league_id, c]));
  const inScope = (id: string) => {
    const c = byId.get(id);
    if (!c) return false;
    if (c.is_public) return true;
    const parent = c.parent_league_id ? byId.get(c.parent_league_id) : null;
    return !!parent?.is_public;
  };

  const schedule = await all<{ league_id: string; game_key: string; matchtime: string | null }>((f, t) =>
    supabaseAdmin.from("game_schedule").select("league_id, game_key, matchtime")
      .gte("matchtime", since.toISOString()).lte("matchtime", now.toISOString()).order("game_key").range(f, t));
  const gamesByLeague = new Map<string, Set<string>>();
  const playedAt = new Map<string, string>();
  for (const g of schedule) {
    if (g.game_key && g.matchtime) playedAt.set(g.game_key, g.matchtime);
    if (!g.league_id || !g.game_key || !inScope(g.league_id)) continue;
    if (!gamesByLeague.has(g.league_id)) gamesByLeague.set(g.league_id, new Set());
    gamesByLeague.get(g.league_id)!.add(g.game_key);
  }

  const rows: BoxScoreRow[] = [];
  for (const [leagueId, games] of Array.from(gamesByLeague.entries())) {
    const leagueRows = await all<BoxScoreRow>((f, t) =>
      supabaseAdmin.from("player_stats").select(BOX_SCORE_COLUMNS).eq("league_id", leagueId).order("id").range(f, t) as any);
    for (const r of leagueRows) if (r.game_key && games.has(r.game_key)) rows.push(r);
  }
  return { at: Date.now(), since: since.toISOString(), rows, names: new Map(comps.map((c) => [c.league_id, c.name || ""])), playedAt };
}

async function season(): Promise<SeasonRows> {
  if (seasonCache && Date.now() - seasonCache.at < CACHE_MS) return seasonCache;
  if (!seasonInFlight) {
    seasonInFlight = loadSeason().then((s) => { seasonCache = s; return s; }).finally(() => { seasonInFlight = null; });
  }
  try {
    return await seasonInFlight;
  } catch (err) {
    if (seasonCache) return seasonCache; // serve the last good copy
    throw err;
  }
}

/** A competition's own rows only: used when it has no games this season (a past season being looked at). */
async function leagueRowsOnly(leagueIds: string[]): Promise<BoxScoreRow[]> {
  return all<BoxScoreRow>((f, t) => supabaseAdmin.from("player_stats").select(BOX_SCORE_COLUMNS).in("league_id", leagueIds).order("id").range(f, t) as any);
}

/** Headshots from the players' own records: the cutout when there is one, else the photo. Nothing is invented. */
async function headshotsFor(playerIds: string[]): Promise<Map<string, Headshot>> {
  const out = new Map<string, Headshot>();
  const ids = Array.from(new Set(playerIds.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabaseAdmin.from("players").select("id, photo_path, photo_path_bg_removed, photo_focus_y").in("id", ids.slice(i, i + 100));
    for (const p of (data || []) as any[]) {
      const path = p.photo_path_bg_removed || p.photo_path;
      if (!path) continue;
      const url = supabaseAdmin.storage.from("player-photos").getPublicUrl(path).data.publicUrl;
      if (url) out.set(p.id, { url, focusY: p.photo_focus_y ?? null });
    }
  }
  return out;
}

function attachHeadshots(result: ScoutRoster, shots: Map<string, Headshot>) {
  const pick = (ids: string[]) => {
    const found = ids.map((id) => shots.get(id)).filter(Boolean) as Headshot[];
    return found.find((h) => /\.png(\?|$)/i.test(h.url)) ?? found[0] ?? null; // a background-removed cutout reads best
  };
  for (const r of result.roster) r.photo = pick(r.playerIds);
  for (const p of result.profiles) p.photo = pick(p.playerIds);
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
      const window = parseWindow(req.query.window);
      // Competitions the coach has left out of this scout. Only the opponent's games in them are dropped;
      // the percentile pool is every other club's games, as before. (Past seasons are not served here.)
      const excluded = new Set(parseScope({ exclude: req.query.exclude }).exclude);
      if (!leagueId || !opponent) return res.status(400).json({ error: "leagueId and opponent are required" });

      // The competition plus the private feed competitions that display under it.
      const { data: children } = await supabaseAdmin.from("competitions").select("league_id").eq("parent_league_id", leagueId);
      const candidates = Array.from(new Set([leagueId, ...((children || []).map((c: any) => c.league_id as string))]));
      const ids = await deps.filterLeagueIdsForPublicScope(candidates);
      if (ids.length === 0) return res.status(404).json({ error: "Competition not found" });

      const [{ data: comp }, { data: teams }, sides, seasonData] = await Promise.all([
        supabaseAdmin.from("competitions").select("name").eq("league_id", leagueId).maybeSingle(),
        supabaseAdmin.from("teams").select("name, logo_url").in("league_id", ids),
        getLeagueSides(),
        season(),
      ]);

      // The women's side of a plain-named club is its own club (see teamSides).
      const clubOf = (r: BoxScoreRow) => teamClubKey(sides.name(r.team_name, r.league_id));
      const oppClub = teamClubKey(sides.name(opponent, leagueId));
      const inLeague = (r: BoxScoreRow) => !!r.league_id && ids.includes(r.league_id);

      let rows = excluded.size ? seasonData.rows.filter((r) => !(r.league_id && excluded.has(r.league_id) && clubOf(r) === oppClub)) : seasonData.rows;
      let wholeSeason = rows.some(inLeague);
      if (!wholeSeason) rows = await leagueRowsOnly(ids); // a past season: just its own competition
      // "Last 5" is each club's newest five games this season, across competitions. A past season has no window.
      if (wholeSeason) rows = applyWindow(rows, clubOf, (key) => seasonData.playedAt.get(key), windowGames(window));
      const leagueClubs = new Set(rows.filter(inLeague).map(clubOf));

      const result = wholeSeason
        ? buildScoutRoster(rows, (club) => club === oppClub, {
            personKey: (r) => {
              const key = playerNameKey(r.full_name);
              return key ? `${clubOf(r)}|${key}` : r.player_id || `${r.team_name}|${r.full_name}`;
            },
            clubOf,
            displayName: bestPlayerName,
            inPool: (club) => leagueClubs.has(club),
          })
        : buildScoutRoster(rows, (name) => isSameTeam(name, opponent));

      attachHeadshots(result, await headshotsFor([...result.roster, ...result.profiles].flatMap((p) => p.playerIds)));

      // Where the club's games this season came from, so the report can say so.
      const perCompetition = new Map<string, Set<string>>();
      if (wholeSeason) {
        for (const r of rows) {
          if (clubOf(r) !== oppClub || !r.league_id || !r.game_key) continue;
          if (!perCompetition.has(r.league_id)) perCompetition.set(r.league_id, new Set());
          perCompetition.get(r.league_id)!.add(r.game_key);
        }
      }
      const competitions = Array.from(perCompetition.entries())
        .map(([id, games]) => ({ name: seasonData.names.get(id) || "Competition", games: games.size }))
        .sort((a, b) => b.games - a.games);
      const logoOf = (name: string) => (teams || []).find((t: any) => t.logo_url && isSameTeam(t.name || "", name))?.logo_url ?? null;

      res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
      return res.json({
        leagueName: comp?.name ?? null,
        ...result,
        season: {
          label: seasonLabel(),
          window: wholeSeason ? window : "season",
          windowLabel: windowLabel(wholeSeason ? window : "season"),
          since: seasonData.since,
          wholeSeason,
          games: competitions.reduce((n, c) => n + c.games, 0),
          competitions,
        },
        logos: { opponent: logoOf(opponent), forTeam: forTeam ? logoOf(forTeam) : null },
      });
    } catch (err: any) {
      console.error("[scout-roster] failed:", err?.message);
      return res.status(500).json({ error: "Failed to load the roster" });
    }
  });
}
