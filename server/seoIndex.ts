import type { Express, Request, Response } from "express";
import { supabaseAdmin } from "./supabaseServiceClient";
import { SITE_BASE, isPlaceholderTeamName } from "@shared/seo";
import { clubDisplayName, clubSlug, teamClubKey } from "@shared/teamIdentity";
import { isUnder18, isYouthCompetition } from "@shared/youth";

/**
 * Everything on the site worth a search result, built once from the database
 * and cached: public competitions, the team sides and players that actually
 * have games, and the games themselves.
 *
 * The sitemap, the server-rendered pages and the noindex rules in
 * publicSeo.ts all read from (or mirror) these rules, so the sitemap only
 * lists URLs that answer 200 with real, indexable content:
 * - players and teams come from box scores (no empty pages, no placeholder
 *   teams like "Team 3"), using the spelling the page canonicalises to;
 * - each team side gets one permanent page (/team/<slug>) across seasons;
 * - youth competitions, and their players, teams and games, are flagged so
 *   they stay out of search (shared/youth.ts).
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
  youth: boolean;
}
/** A team as it appears in one competition. */
export interface IndexTeam {
  competitionSlug: string;
  /** The spelling the box scores use most (what this competition calls the side). */
  name: string;
  lastmod: string | null;
  rows: number;
  youth: boolean;
  /** The permanent /team/<slug> page this belongs to. */
  clubSlug: string;
}
export interface IndexClubCompetition {
  competitionSlug: string;
  competitionName: string;
  teamName: string;
  lastmod: string | null;
  youth: boolean;
  /** Where its data lives: the competition itself, then private children that display under it. */
  leagueIds: string[];
}
/** One team side across every competition it has played in. */
export interface IndexClub {
  slug: string;
  name: string;
  clubKey: string;
  variants: string[];
  /** Most recent first. */
  competitions: IndexClubCompetition[];
  lastmod: string | null;
  /** Only ever played in youth competitions. */
  youth: boolean;
  rows: number;
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
  /** Has played in a youth competition, or is under 18 by date of birth. */
  youth: boolean;
}
export interface IndexGame {
  gameKey: string;
  competitionSlug: string;
  home: string;
  away: string;
  date: string | null;
  youth: boolean;
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
  clubs: IndexClub[];
  clubBySlug: Map<string, IndexClub>;
  /** Other slugs a club has been reached by ("mk-breakers") → its canonical slug. */
  clubAlias: Map<string, string>;
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

/** League ids whose competitions can include under-18s (their own age, or a youth parent's). */
export function youthLeagueIds(competitions: Array<{ league_id: string; name?: string | null; age_group?: string | null; parent_league_id?: string | null }>): Set<string> {
  const youth = new Set(competitions.filter((c) => isYouthCompetition(c)).map((c) => c.league_id));
  for (const c of competitions) {
    if (c.parent_league_id && youth.has(c.parent_league_id)) youth.add(c.league_id);
  }
  return youth;
}

async function buildSeoIndex(): Promise<SeoIndex> {
  const now = Date.now();
  const today = day(now)!;

  const [competitionRows, gameRows, statRows, playerRows, articleRows] = await Promise.all([
    supabaseAdmin.from("competitions").select("league_id, name, slug, is_public, parent_league_id, age_group").then(({ data, error }) => {
      if (error) throw error;
      return data || [];
    }),
    fetchAll<any>("game_schedule", "game_key, league_id, matchtime, hometeam, awayteam", "game_key"),
    fetchAll<any>("player_stats", "id, player_id, league_id, team_name, game_key, created_at", "id"),
    fetchAll<any>("players", "id, slug, full_name, league_id, date_of_birth", "id"),
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
  const youthLeagues = youthLeagueIds(competitionRows as any[]);
  const leagueIdsBySlug = new Map<string, string[]>();
  publicSlugOf.forEach((slug, leagueId) => {
    const own = byLeague.get(leagueId)?.slug === slug;
    const list = leagueIdsBySlug.get(slug) || [];
    leagueIdsBySlug.set(slug, own ? [leagueId, ...list] : [...list, leagueId]);
  });
  const competitionNameBySlug = new Map<string, string>();
  for (const c of competitionRows as any[]) if (c.is_public && c.slug) competitionNameBySlug.set(c.slug, c.name || c.slug);

  const gameDate = new Map<string, string | null>();
  for (const g of gameRows) gameDate.set(g.game_key, g.matchtime || null);
  const gamesWithStats = new Set<string>();

  // Teams and players come from the box scores, so every URL has games behind it.
  const teams = new Map<string, Omit<IndexTeam, "clubSlug"> & { spellings: Array<{ team_name: string; created_at: string }> }>();
  const playerStats = new Map<string, { games: Set<string>; lastmod: string | null; team: string | null; latestCreated: string; slug: string; slugs: Set<string>; youth: boolean }>();
  for (const s of statRows) {
    const slug = publicSlugOf.get(s.league_id);
    if (!slug) continue;
    const youth = youthLeagues.has(s.league_id);
    if (s.game_key) gamesWithStats.add(s.game_key);
    const date = day(gameDate.get(s.game_key) || s.created_at);
    const created = String(s.created_at || "");
    const teamName = String(s.team_name || "").trim();
    if (teamName && !isPlaceholderTeamName(teamName)) {
      const key = `${slug}|${slugifyName(teamName)}`;
      const t = teams.get(key) || { competitionSlug: slug, name: teamName, lastmod: null, rows: 0, youth: false, spellings: [] };
      t.lastmod = later(t.lastmod, date);
      t.rows += 1;
      t.youth = t.youth || youth;
      t.spellings.push({ team_name: teamName, created_at: created });
      teams.set(key, t);
    }
    if (s.player_id) {
      const p = playerStats.get(s.player_id) || { games: new Set<string>(), lastmod: null, team: null, latestCreated: "", slug, slugs: new Set<string>(), youth: false };
      p.games.add(s.game_key || s.id);
      p.slugs.add(slug);
      p.youth = p.youth || youth;
      p.lastmod = later(p.lastmod, date);
      if (created >= p.latestCreated) { p.latestCreated = created; p.team = teamName || p.team; p.slug = slug; }
      playerStats.set(s.player_id, p);
    }
  }

  const teamList = Array.from(teams.values()).map(({ spellings, ...t }) => ({ ...t, name: pickTeamSpelling(spellings) || t.name }));

  // ── One permanent page per team side ──────────────────────────────────
  const groups = new Map<string, typeof teamList>();
  for (const t of teamList) {
    const key = teamClubKey(t.name);
    groups.set(key, [...(groups.get(key) || []), t]);
  }
  const draftClubs = Array.from(groups.entries()).map(([clubKey, members]) => {
    const adult = members.filter((m) => !m.youth);
    const pool = adult.length ? adult : members;
    // The most-used name across the side's competitions, without NBL's suffixes.
    const best = [...pool].sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name))[0];
    return {
      clubKey,
      name: clubDisplayName(best.name),
      variants: Array.from(new Set(members.map((m) => m.name))),
      competitions: members
        .map((m) => ({
          competitionSlug: m.competitionSlug,
          competitionName: competitionNameBySlug.get(m.competitionSlug) || m.competitionSlug,
          teamName: m.name,
          lastmod: m.lastmod,
          youth: m.youth,
          leagueIds: leagueIdsBySlug.get(m.competitionSlug) || [],
        }))
        .sort((a, b) => String(b.lastmod || "").localeCompare(String(a.lastmod || ""))),
      lastmod: pool.reduce<string | null>((acc, m) => later(acc, m.lastmod), null),
      youth: adult.length === 0,
      rows: members.reduce((n, m) => n + m.rows, 0),
    };
  });
  // Bigger, adult sides claim a contested slug first; later ones get "-2", "-3".
  draftClubs.sort((a, b) => Number(a.youth) - Number(b.youth) || b.rows - a.rows || a.name.localeCompare(b.name));
  const clubBySlug = new Map<string, IndexClub>();
  const clubByKey = new Map<string, IndexClub>();
  for (const d of draftClubs) {
    const base = clubSlug(d.name) || "team";
    let slug = base;
    for (let n = 2; clubBySlug.has(slug); n++) slug = `${base}-${n}`;
    const club: IndexClub = { slug, ...d };
    clubBySlug.set(slug, club);
    clubByKey.set(d.clubKey, club);
  }
  const clubAlias = new Map<string, string>();
  clubBySlug.forEach((club) => {
    for (const variant of club.variants) {
      const alias = clubSlug(variant);
      if (alias && alias !== club.slug && !clubBySlug.has(alias) && !clubAlias.has(alias)) clubAlias.set(alias, club.slug);
    }
  });
  const indexTeams: IndexTeam[] = teamList
    .map((t) => ({ ...t, clubSlug: clubByKey.get(teamClubKey(t.name))!.slug }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // ── Players ────────────────────────────────────────────────────────────
  const players = new Map<string, IndexPlayer>();
  for (const row of playerRows) {
    const stats = playerStats.get(row.id);
    if (!stats || !row.id) continue;
    const segment = playerSegment(row);
    const youth = stats.youth || isUnder18(row.date_of_birth);
    const existing = players.get(segment);
    if (existing) {
      // Several rows can share one slug; the page merges them, so does the index.
      existing.games += stats.games.size;
      existing.lastmod = later(existing.lastmod, stats.lastmod);
      existing.youth = existing.youth || youth;
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
      youth,
    });
  }

  // ── Games and competitions ─────────────────────────────────────────────
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
    games.push({ gameKey: g.game_key, competitionSlug: slug, home: g.hometeam, away: g.awayteam, date: g.matchtime || null, youth: youthLeagues.has(g.league_id) });
  }

  const competitions: IndexCompetition[] = [];
  const hasTeams = new Set(indexTeams.map((t) => t.competitionSlug));
  const hasPlayers = new Set(Array.from(players.values()).flatMap((p) => p.competitionSlugs));
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
      youth: youthLeagues.has(c.league_id),
    });
  }

  const articles: IndexArticle[] = (articleRows as any[])
    .filter((a) => a.slug || a.id)
    .map((a) => ({ segment: String(a.slug || a.id), title: a.title || "", lastmod: day(a.published_at) }));

  return {
    builtAt: now,
    competitions: competitions.sort((a, b) => a.name.localeCompare(b.name)),
    teams: indexTeams,
    clubs: Array.from(clubBySlug.values()).sort((a, b) => a.name.localeCompare(b.name)),
    clubBySlug,
    clubAlias,
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

/** A team page key — its slug, an old slug, or a team name — to its permanent page. */
export function resolveClub(index: SeoIndex, key: string): IndexClub | null {
  const raw = (key || "").trim();
  const candidates = [raw.toLowerCase(), clubSlug(raw), slugifyName(raw)];
  for (const c of candidates) {
    if (!c) continue;
    const direct = index.clubBySlug.get(c);
    if (direct) return direct;
    const alias = index.clubAlias.get(c);
    if (alias) return index.clubBySlug.get(alias) || null;
  }
  return null;
}

// ── Sitemap and the team-page lookup ───────────────────────────────────────

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
  const adultComps = index.competitions.filter((c) => !c.youth);
  const latest = adultComps.reduce<string | null>((acc, c) => later(acc, c.lastmod), null);
  const latestNews = index.articles.reduce<string | null>((acc, a) => later(acc, a.lastmod), null);

  add("/", latest);
  add("/news", latestNews);
  add("/teams", latest);
  add("/players", latest);
  add("/scores", latest);
  for (const a of index.articles) add(`/news/${encodeURIComponent(a.segment)}`, a.lastmod);
  for (const c of adultComps) add(`/competition/${encodeURIComponent(c.slug)}`, c.lastmod);
  // One permanent page per team side (not one per season).
  for (const club of index.clubs) if (!club.youth) add(`/team/${club.slug}`, club.lastmod);
  for (const p of index.players) if (!p.youth) add(`/player/${encodeURIComponent(p.segment)}`, p.lastmod);
  for (const g of index.games) if (!g.youth) add(`/competition/${encodeURIComponent(g.competitionSlug)}/game/${encodeURIComponent(g.gameKey)}`, g.date ? g.date.split("T")[0] : null);
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

export function registerSeoRoutes(app: Express) {
  const sendXml = (res: Response, xml: string) => {
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400");
    res.send(xml);
  };

  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const index = await getSeoIndex(req.query.refresh === "1");
      const docs = sitemapDocuments(index);
      if (docs.length === 1) return sendXml(res, docs[0]);
      const lastmod = new Date(index.builtAt).toISOString().split("T")[0];
      sendXml(res, `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${docs
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
      sendXml(res, doc);
    } catch (err: any) {
      console.error("Sitemap page generation error:", err?.message || err);
      res.status(500).send("Failed to generate sitemap");
    }
  });

  // Resolves /team/<slug> (or an old slug or team name) for the team page:
  // the side's canonical slug, display name and every competition it has
  // played in, most recent first.
  app.get("/api/public/team-page/:key", async (req: Request, res: Response) => {
    try {
      const club = resolveClub(await getSeoIndex(), decodeURIComponent(req.params.key));
      if (!club) return res.status(404).json({ error: "Team not found" });
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=86400");
      res.json({
        slug: club.slug,
        name: club.name,
        youth: club.youth,
        competitions: club.competitions.map((c) => ({
          slug: c.competitionSlug,
          name: c.competitionName,
          teamName: c.teamName,
          lastPlayed: c.lastmod,
          youth: c.youth,
          leagueIds: c.leagueIds,
        })),
      });
    } catch (err: any) {
      console.error("Team page lookup failed:", err?.message || err);
      res.status(500).json({ error: "Team lookup failed" });
    }
  });
}
