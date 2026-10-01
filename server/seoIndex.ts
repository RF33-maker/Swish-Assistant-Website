import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { SITE_BASE, isPlaceholderTeamName } from "@shared/seo";

/**
 * Everything on the site worth a search result, built once from the database
 * and cached: public competitions, the teams and players that actually have
 * games in them, and the games themselves.
 *
 * The sitemap, the server-rendered competition and hub pages, and the noindex
 * rules in publicSeo.ts all read from (or mirror) these rules, so the sitemap
 * only lists URLs that answer 200 with real content. Before, it listed ~2,200
 * players with no games, placeholder teams that 404 ("Team 3", "Coach:") and
 * team URLs spelt differently from the page's own canonical.
 */

const INDEX_TTL_MS = 60 * 60 * 1000;
const BATCH = 1000;
/** A game this long past tip-off with no box score is treated as not played. */
export const UNPLAYED_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

export interface IndexCompetition {
  leagueId: string;
  slug: string;
  name: string;
  parentLeagueId: string | null;
  lastmod: string | null;
  games: number;
}
export interface IndexTeam {
  competitionSlug: string;
  /** The spelling the team page uses as its canonical (most recent in the stats). */
  name: string;
  lastmod: string | null;
}
export interface IndexPlayer {
  segment: string;
  name: string;
  team: string | null;
  /** Where they played most recently. */
  competitionSlug: string;
  /** Every public competition they have games in. */
  competitionSlugs: string[];
  games: number;
  lastmod: string | null;
}
export interface IndexGame {
  gameKey: string;
  competitionSlug: string;
  home: string;
  away: string;
  date: string | null;
}
export interface IndexArticle {
  segment: string;
  title: string;
  lastmod: string | null;
}
export interface SeoIndex {
  builtAt: number;
  competitions: IndexCompetition[];
  teams: IndexTeam[];
  players: IndexPlayer[];
  games: IndexGame[];
  articles: IndexArticle[];
}

export function slugifyName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function playerSegment(player: { slug?: string | null; full_name?: string | null; id: string }): string {
  return player.slug || `${slugifyName(player.full_name || "player") || "player"}--${player.id}`;
}

/**
 * One spelling per team when the box scores disagree ("Gloucester City KIngs"
 * vs "…Kings"): the most used, then the most recent, then alphabetical. The
 * team page canonicalises with this too, so the sitemap URL is the canonical.
 */
export function pickTeamSpelling(rows: Array<{ team_name?: string | null; created_at?: string | null }>): string | null {
  const tally = new Map<string, { count: number; latest: string }>();
  for (const row of rows) {
    const name = String(row.team_name || "").trim();
    if (!name) continue;
    const t = tally.get(name) || { count: 0, latest: "" };
    t.count += 1;
    const created = String(row.created_at || "");
    if (created > t.latest) t.latest = created;
    tally.set(name, t);
  }
  let best: [string, { count: number; latest: string }] | null = null;
  tally.forEach((t, name) => {
    if (!best) { best = [name, t]; return; }
    const [bName, b] = best;
    if (t.count > b.count || (t.count === b.count && (t.latest > b.latest || (t.latest === b.latest && name < bName)))) best = [name, t];
  });
  return best ? (best as [string, unknown])[0] : null;
}

/** A past game with no box score, or one between placeholder sides, has nothing to index. */
export function isIndexableGame(game: { home?: string | null; away?: string | null; date?: string | null; hasStats: boolean }, now = Date.now()): boolean {
  if (!game.home || !game.away || isPlaceholderTeamName(game.home) || isPlaceholderTeamName(game.away)) return false;
  if (game.hasStats) return true;
  const t = game.date ? new Date(game.date).getTime() : NaN;
  return Number.isFinite(t) && t > now - UNPLAYED_GRACE_MS;
}

const day = (value: unknown): string | null => {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
};
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Every row of a table, paged on a unique column so pages never overlap. */
async function fetchAll<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
  const { count, error } = await supabaseAdmin.from(table).select(orderBy, { count: "exact", head: true });
  if (error) throw error;
  const pages = Math.ceil((count || 0) / BATCH);
  const out: T[] = [];
  // A few pages at a time: player_stats is ~25 pages.
  for (let start = 0; start < pages; start += 6) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(6, pages - start) }, (_, i) => {
        const from = (start + i) * BATCH;
        return supabaseAdmin.from(table).select(columns).order(orderBy).range(from, from + BATCH - 1);
      }),
    );
    for (const { data, error: e } of batch) {
      if (e) throw e;
      out.push(...((data || []) as T[]));
    }
  }
  return out;
}

async function buildSeoIndex(): Promise<SeoIndex> {
  const now = Date.now();
  const today = day(now)!;

  const [competitionRows, gameRows, statRows, playerRows, articleRows] = await Promise.all([
    supabaseAdmin.from("competitions").select("league_id, name, slug, is_public, parent_league_id").then(({ data, error }) => {
      if (error) throw error;
      return data || [];
    }),
    fetchAll<any>("game_schedule", "game_key, league_id, matchtime, hometeam, awayteam", "game_key"),
    fetchAll<any>("player_stats", "id, player_id, league_id, team_name, game_key, created_at", "id"),
    fetchAll<any>("players", "id, slug, full_name, league_id", "id"),
    supabaseAdmin.from("news_articles").select("id, slug, title, published_at").eq("is_published", true).then(({ data }) => data || []),
  ]);

  // Public competitions, and private children that display under a public parent.
  const byLeague = new Map<string, any>(competitionRows.map((c: any) => [c.league_id, c]));
  const publicSlugOf = new Map<string, string>();
  for (const c of competitionRows as any[]) {
    if (c.is_public && c.slug) publicSlugOf.set(c.league_id, c.slug);
  }
  for (const c of competitionRows as any[]) {
    if (publicSlugOf.has(c.league_id) || !c.parent_league_id) continue;
    const parentSlug = publicSlugOf.get(c.parent_league_id);
    if (parentSlug) publicSlugOf.set(c.league_id, parentSlug);
  }

  const gameDate = new Map<string, string | null>();
  for (const g of gameRows) gameDate.set(g.game_key, g.matchtime || null);
  const gamesWithStats = new Set<string>();

  // Teams and players come from the box scores, so every URL has games behind it
  // and uses the same team spelling the team page canonicalises to.
  const teams = new Map<string, IndexTeam & { rows: Array<{ team_name: string; created_at: string }> }>();
  const playerStats = new Map<string, { games: Set<string>; lastmod: string | null; team: string | null; latestCreated: string; slug: string; slugs: Set<string> }>();
  for (const s of statRows) {
    const slug = publicSlugOf.get(s.league_id);
    if (!slug) continue;
    if (s.game_key) gamesWithStats.add(s.game_key);
    const date = day(gameDate.get(s.game_key) || s.created_at);
    const created = String(s.created_at || "");
    const teamName = String(s.team_name || "").trim();
    if (teamName && !isPlaceholderTeamName(teamName)) {
      const key = `${slug}|${slugifyName(teamName)}`;
      const t = teams.get(key) || { competitionSlug: slug, name: teamName, lastmod: null, rows: [] };
      t.lastmod = later(t.lastmod, date);
      t.rows.push({ team_name: teamName, created_at: created });
      teams.set(key, t);
    }
    if (s.player_id) {
      const p = playerStats.get(s.player_id) || { games: new Set<string>(), lastmod: null, team: null, latestCreated: "", slug, slugs: new Set<string>() };
      p.games.add(s.game_key || s.id);
      p.slugs.add(slug);
      p.lastmod = later(p.lastmod, date);
      if (created >= p.latestCreated) { p.latestCreated = created; p.team = teamName || p.team; p.slug = slug; }
      playerStats.set(s.player_id, p);
    }
  }

  const players = new Map<string, IndexPlayer>();
  for (const row of playerRows) {
    const stats = playerStats.get(row.id);
    if (!stats || !row.id) continue;
    const segment = playerSegment(row);
    const existing = players.get(segment);
    if (existing) {
      // Several rows can share one slug; the page merges them, so does the index.
      existing.games += stats.games.size;
      existing.lastmod = later(existing.lastmod, stats.lastmod);
      stats.slugs.forEach((slug) => { if (!existing.competitionSlugs.includes(slug)) existing.competitionSlugs.push(slug); });
      continue;
    }
    players.set(segment, {
      segment,
      name: row.full_name || "Player",
      team: stats.team,
      competitionSlug: stats.slug,
      competitionSlugs: Array.from(stats.slugs),
      games: stats.games.size,
      lastmod: stats.lastmod,
    });
  }

  const games: IndexGame[] = [];
  const compLastmod = new Map<string, string | null>();
  const compGames = new Map<string, number>();
  for (const g of gameRows) {
    const slug = publicSlugOf.get(g.league_id);
    if (!slug || !g.game_key) continue;
    const date = day(g.matchtime);
    const hasStats = gamesWithStats.has(g.game_key);
    if (hasStats || (date && date <= today)) compLastmod.set(slug, later(compLastmod.get(slug) ?? null, date && date <= today ? date : null));
    if (!isIndexableGame({ home: g.hometeam, away: g.awayteam, date: g.matchtime, hasStats }, now)) continue;
    compGames.set(slug, (compGames.get(slug) || 0) + 1);
    games.push({ gameKey: g.game_key, competitionSlug: slug, home: g.hometeam, away: g.awayteam, date: g.matchtime || null });
  }

  const competitions: IndexCompetition[] = [];
  const hasTeams = new Set(Array.from(teams.values()).map((t) => t.competitionSlug));
  const hasPlayers = new Set(Array.from(players.values()).map((p) => p.competitionSlug));
  for (const c of competitionRows as any[]) {
    if (!c.is_public || !c.slug) continue;
    const slug = c.slug;
    if (!hasTeams.has(slug) && !hasPlayers.has(slug) && !compGames.get(slug)) continue;
    competitions.push({
      leagueId: c.league_id,
      slug,
      name: c.name || slug,
      parentLeagueId: c.parent_league_id && byLeague.get(c.parent_league_id)?.is_public ? c.parent_league_id : null,
      lastmod: compLastmod.get(slug) ?? null,
      games: compGames.get(slug) || 0,
    });
  }

  const articles: IndexArticle[] = (articleRows as any[])
    .filter((a) => a.slug || a.id)
    .map((a) => ({ segment: String(a.slug || a.id), title: a.title || "", lastmod: day(a.published_at) }));

  return {
    builtAt: now,
    competitions: competitions.sort((a, b) => a.name.localeCompare(b.name)),
    teams: Array.from(teams.values())
      .map(({ rows, ...t }) => ({ ...t, name: pickTeamSpelling(rows) || t.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    players: Array.from(players.values()).sort((a, b) => a.name.localeCompare(b.name)),
    games,
    articles,
  };
}

let cached: SeoIndex | null = null;
let inFlight: Promise<SeoIndex> | null = null;

export async function getSeoIndex(forceRefresh = false): Promise<SeoIndex> {
  if (!forceRefresh && cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached;
  if (!inFlight) {
    inFlight = buildSeoIndex()
      .then((index) => { cached = index; return index; })
      .finally(() => { inFlight = null; });
  }
  try {
    return await inFlight;
  } catch (error) {
    // Serve the last good index rather than nothing if a rebuild fails.
    if (cached) return cached;
    throw error;
  }
}

// ── Sitemap ────────────────────────────────────────────────────────────────

const SITEMAP_URL_LIMIT = 40_000; // Below the protocol's 50,000.

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function sitemapEntries(index: SeoIndex): Array<{ path: string; lastmod: string | null }> {
  const entries: Array<{ path: string; lastmod: string | null }> = [];
  const seen = new Set<string>();
  const add = (path: string, lastmod: string | null) => {
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({ path, lastmod });
  };
  const latest = index.competitions.reduce<string | null>((acc, c) => later(acc, c.lastmod), null);
  const latestNews = index.articles.reduce<string | null>((acc, a) => later(acc, a.lastmod), null);

  add("/", latest);
  add("/news", latestNews);
  add("/teams", latest);
  add("/players", latest);
  add("/scores", latest);
  for (const a of index.articles) add(`/news/${encodeURIComponent(a.segment)}`, a.lastmod);
  for (const c of index.competitions) add(`/competition/${encodeURIComponent(c.slug)}`, c.lastmod);
  for (const t of index.teams) add(`/competition/${encodeURIComponent(t.competitionSlug)}/team/${encodeURIComponent(t.name)}`, t.lastmod);
  for (const p of index.players) add(`/player/${encodeURIComponent(p.segment)}`, p.lastmod);
  for (const g of index.games) add(`/competition/${encodeURIComponent(g.competitionSlug)}/game/${encodeURIComponent(g.gameKey)}`, g.date ? g.date.split("T")[0] : null);
  // Legal pages: indexable, but no meaningful last-modified date to give.
  for (const p of ["/privacy", "/terms", "/cookies"]) add(p, null);
  return entries;
}

function sitemapDocuments(index: SeoIndex): string[] {
  const entries = sitemapEntries(index);
  const docs: string[] = [];
  for (let start = 0; start < entries.length; start += SITEMAP_URL_LIMIT) {
    const urls = entries.slice(start, start + SITEMAP_URL_LIMIT)
      .map((e) => `  <url>\n    <loc>${xmlEscape(SITE_BASE + e.path)}</loc>\n${e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : ""}  </url>\n`)
      .join("");
    docs.push(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>`);
  }
  return docs;
}

export function registerSitemapRoutes(app: Express) {
  const send = (res: Response, xml: string) => {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
    res.send(xml);
  };

  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const index = await getSeoIndex(req.query.refresh === "1");
      const docs = sitemapDocuments(index);
      if (docs.length === 1) return send(res, docs[0]);
      const lastmod = new Date(index.builtAt).toISOString().split("T")[0];
      send(res, `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${docs
        .map((_, i) => `  <sitemap>\n    <loc>${SITE_BASE}/sitemap/${i + 1}.xml</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>\n`)
        .join("")}</sitemapindex>`);
    } catch (err: any) {
      console.error("Sitemap generation error:", err?.message || err);
      res.status(500).send("Failed to generate sitemap");
    }
  });

  app.get(/^\/sitemap\/(\d+)\.xml$/, async (req: Request, res: Response) => {
    try {
      const docs = sitemapDocuments(await getSeoIndex());
      const doc = docs[Number(req.params[0]) - 1];
      if (!doc) return res.status(404).send("Sitemap not found");
      send(res, doc);
    } catch (err: any) {
      console.error("Sitemap page generation error:", err?.message || err);
      res.status(500).send("Failed to generate sitemap");
    }
  });
}
