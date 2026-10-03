import type { NextFunction, Request, Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "./supabaseServiceClient";
import { isSameTeam } from "./teamIdentityService";
import { getSeoIndex, isIndexableGame, playerSegment, resolveClub, slugifyName, type IndexClub, type SeoIndex } from "./seoIndex";
import { gameRecap, playerBio, teamSeasonSummary } from "@shared/recaps";
import { clubSlug, teamClubKey } from "@shared/teamIdentity";
import { articleDocToHtml, articleTagHref, type ArticleDoc, type ArticleTag } from "@shared/newsArticle";
import { isUnder18, isYouthCompetition } from "@shared/youth";
import {
  SITE_BASE,
  SITE_NAME,
  competitionSeoDescription,
  competitionSeoTitle,
  isPlaceholderTeamName,
  playerSeoDescription,
  playerSeoTitle,
  teamPath as sharedTeamPath,
  teamSeoDescription,
  teamSeoTitle,
} from "@shared/seo";

/**
 * Server-rendered HTML for public pages, so search engines (and link
 * previews) get a real title, description, canonical URL, structured data and
 * crawlable content without running the React app.
 *
 * Head tags carry data-rh so react-helmet-async takes them over once the app
 * loads (no duplicate titles/descriptions/canonicals in the rendered page —
 * which is what Google indexes); the client builds the same strings from
 * @shared/seo. The robots meta and JSON-LD stay as served.
 */

const GAME_PAGE_SIZE = 25;
const MAX_GAME_LOG_PAGES = 10;
const MAX_STAT_ROWS = 500;
const NOINDEX = "noindex, follow";

type Crumb = { name: string; path: string };
type SeoPage = {
  title: string;
  description: string;
  canonicalPath: string;
  body: string;
  jsonLd: Record<string, unknown> | Array<Record<string, unknown>>;
  image?: string | null;
  /** e.g. "noindex, follow" for pages with nothing to rank (no games yet). */
  robots?: string;
  breadcrumbs?: Crumb[];
  ogType?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function playerIdFromSegment(segment: string): string | null {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return segment;
  const match = segment.match(/--([0-9a-f]{8}-[0-9a-f-]{27,})$/i);
  return match?.[1] || null;
}

function canonicalUrl(canonicalPath: string): string {
  return `${SITE_BASE}${canonicalPath}`;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: unknown): string {
  if (!value) return "Date unavailable";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const one = (v: number) => v.toFixed(1);
const competitionPath = (slug: string) => `/competition/${encodeURIComponent(slug)}`;
const gamePathFor = (slug: string, gameKey: string) => `/competition/${encodeURIComponent(slug)}/game/${encodeURIComponent(gameKey)}`;
const link = (href: string, text: string) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;

/** A team side's permanent page (/team/<slug>), via the index when it's available. */
function clubHref(index: SeoIndex | null, name: string | null | undefined): string | null {
  if (!name || isPlaceholderTeamName(name)) return null;
  const club = index ? resolveClub(index, name) : null;
  return club ? `/team/${club.slug}` : sharedTeamPath(name);
}

function statLine(stat: any): string {
  return `${number(stat.spoints)} points, ${number(stat.sreboundstotal)} rebounds, ${number(stat.sassists)} assists`;
}

function breadcrumbNav(crumbs: Crumb[]): string {
  return `<nav aria-label="Breadcrumb">${crumbs
    .map((c, i) => (i === crumbs.length - 1 ? escapeHtml(c.name) : link(c.path, c.name)))
    .join(" › ")}</nav>`;
}

async function loadShell(): Promise<string> {
  // On Vercel the built shell is renamed to app.html so "/" reaches this
  // function instead of being served as a static file (see vercel.json).
  const candidates = process.env.NODE_ENV === "production"
    ? ["dist/app.html", "dist/index.html", "client/index.html"]
    : ["client/index.html", "dist/app.html", "dist/index.html"];
  for (const candidate of candidates) {
    try {
      return await readFile(path.resolve(process.cwd(), candidate), "utf8");
    } catch {
      // Try the next deployment layout.
    }
  }
  throw new Error("Unable to load the client HTML shell");
}

function withDevPreamble(html: string): string {
  if (process.env.NODE_ENV === "production" || !html.includes("/src/main.tsx")) return html;
  const reactRefreshPreamble = `<script type="module">
      import RefreshRuntime from "/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>`;
  return html.replace("</head>", `${reactRefreshPreamble}\n</head>`);
}

function stripHeadDefaults(shell: string): string {
  return shell
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "");
}

function injectSeo(shell: string, page: SeoPage): string {
  const url = canonicalUrl(page.canonicalPath);
  const image = page.image && /^https?:\/\//i.test(page.image) ? page.image : `${SITE_BASE}/og-image.png`;
  const rh = `data-rh="true"`;

  const graph = Array.isArray(page.jsonLd) ? page.jsonLd : [page.jsonLd];
  const nodes = graph.flatMap((node: any) => (node["@graph"] ? node["@graph"] : [node])).map((node: any) => {
    const { "@context": _context, ...rest } = node;
    return rest;
  });
  if (page.breadcrumbs && page.breadcrumbs.length > 1) {
    nodes.push({
      "@type": "BreadcrumbList",
      itemListElement: page.breadcrumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        item: canonicalUrl(c.path),
      })),
    });
  }
  const jsonLd = { "@context": "https://schema.org", "@graph": nodes };

  const metadata = `
    <title ${rh}>${escapeHtml(page.title)}</title>
    <meta ${rh} name="description" content="${escapeHtml(page.description)}" />
    ${page.robots ? `<meta name="robots" content="${escapeHtml(page.robots)}" />` : ""}
    <link ${rh} rel="canonical" href="${escapeHtml(url)}" />
    <meta ${rh} property="og:title" content="${escapeHtml(page.title)}" />
    <meta ${rh} property="og:description" content="${escapeHtml(page.description)}" />
    <meta ${rh} property="og:type" content="${escapeHtml(page.ogType || "website")}" />
    <meta ${rh} property="og:url" content="${escapeHtml(url)}" />
    <meta ${rh} property="og:image" content="${escapeHtml(image)}" />
    <meta ${rh} property="og:site_name" content="${SITE_NAME}" />
    <meta ${rh} name="twitter:card" content="summary_large_image" />
    <meta ${rh} name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta ${rh} name="twitter:description" content="${escapeHtml(page.description)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;

  let html = withDevPreamble(stripHeadDefaults(shell).replace("</head>", `${metadata}\n</head>`));
  const seoBody = `<div id="root">
    <main id="crawlable-content" style="max-width:1100px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;color:#172033">
      ${page.body}
    </main>
  </div>`;
  html = html.replace(/<div\s+id=["']root["']\s*><\/div>/i, seoBody);
  return html;
}

/** The app shell with a 404 status and noindex, so people still get the app's own not-found page. */
async function sendNotFound(res: Response) {
  try {
    const shell = withDevPreamble(stripHeadDefaults(await loadShell()))
      .replace("</head>", `<title>Page not found | ${SITE_NAME}</title>\n<meta name="robots" content="noindex" />\n</head>`);
    return res.status(404).type("html").set("Cache-Control", "public, max-age=60").send(shell);
  } catch {
    return res.status(404).type("html").send(`<!doctype html><html><head><title>Page not found</title><meta name="robots" content="noindex"></head><body><h1>Page not found</h1></body></html>`);
  }
}

async function getIdentityPlayerIds(playerId: string): Promise<string[]> {
  const { data: member } = await supabaseAdmin
    .from("player_identity_members")
    .select("identity_id")
    .eq("player_id", playerId)
    .maybeSingle();
  if (!member?.identity_id) return [playerId];
  const { data: members } = await supabaseAdmin
    .from("player_identity_members")
    .select("player_id")
    .eq("identity_id", member.identity_id);
  return Array.from(new Set([playerId, ...(members || []).map((row: any) => row.player_id).filter(Boolean)]));
}

async function resolvePublicCompetition(leagueId: string | null | undefined): Promise<any | undefined> {
  if (!leagueId) return undefined;
  const { data: competition } = await supabaseAdmin
    .from("competitions")
    .select("league_id, name, slug, season, is_public, parent_league_id")
    .eq("league_id", leagueId)
    .maybeSingle();
  if (!competition) return undefined;
  if (competition.is_public) return competition;
  if (!competition.parent_league_id) return undefined;
  const { data: parent } = await supabaseAdmin
    .from("competitions")
    .select("league_id, name, slug, season, is_public")
    .eq("league_id", competition.parent_league_id)
    .eq("is_public", true)
    .maybeSingle();
  return parent || undefined;
}

/** The other side of a game from a player's/team's point of view. */
function opponentOf(teamName: string, schedule: any): string {
  if (!schedule) return "Opponent unavailable";
  const team = String(teamName || "").toLowerCase();
  if (String(schedule.hometeam || "").toLowerCase() === team) return schedule.awayteam || "Opponent unavailable";
  if (String(schedule.awayteam || "").toLowerCase() === team) return schedule.hometeam || "Opponent unavailable";
  return isSameTeam(schedule.hometeam || "", teamName) ? schedule.awayteam : schedule.hometeam;
}

async function tryIndex(): Promise<SeoIndex | null> {
  try {
    return await getSeoIndex();
  } catch (error) {
    console.error("SEO index unavailable:", error);
    return null;
  }
}

// ── Players ──────────────────────────────────────────────────────────────

async function renderPlayer(slugOrId: string, pageNumber: number): Promise<{ page?: SeoPage; redirect?: string; notFound?: boolean }> {
  const lookupId = playerIdFromSegment(slugOrId);
  let query = supabaseAdmin
    .from("players")
    .select("id, slug, full_name, team_name, position, league_id, photo_path, photo_path_bg_removed, date_of_birth");
  query = lookupId ? query.eq("id", lookupId) : query.eq("slug", slugOrId);
  const { data: resolvedPlayers } = await query.limit(20);
  const player = resolvedPlayers?.[0];
  if (!player) return {};

  const identityPlayerIds = await getIdentityPlayerIds(player.id);
  const relatedIds = Array.from(new Set([
    ...identityPlayerIds,
    ...(resolvedPlayers || []).map((row: any) => row.id),
  ].filter(Boolean)));
  const { data: identityPlayers } = relatedIds.length
    ? await supabaseAdmin.from("players").select("id, slug, full_name").in("id", relatedIds)
    : { data: [] as any[] };
  const canonicalIdentityPlayer = (identityPlayers || []).find((row: any) => row.slug) || player;
  const canonicalSlug = playerSegment(canonicalIdentityPlayer);
  if (slugOrId !== canonicalSlug) {
    return { redirect: `/player/${encodeURIComponent(canonicalSlug)}${pageNumber > 1 ? `/games/page/${pageNumber}` : ""}` };
  }

  const statResults = await Promise.all(
    relatedIds.map((id) =>
      supabaseAdmin
        .from("player_stats")
        .select("player_id, league_id, team_name, created_at, game_key, spoints, sreboundstotal, sassists, ssteals, sblocks, sminutes")
        .eq("player_id", id)
        .order("created_at", { ascending: false })
        .limit(MAX_STAT_ROWS),
    ),
  );
  const allStats = statResults.flatMap((result) => result.data || [])
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const leagueIds = Array.from(new Set([player.league_id, ...allStats.map((row: any) => row.league_id)].filter(Boolean))) as string[];
  const { data: leagues } = leagueIds.length
    ? await supabaseAdmin.from("competitions").select("league_id, name, slug, season, is_public, parent_league_id, age_group").in("league_id", leagueIds)
    : { data: [] as any[] };
  const parentIds = Array.from(new Set((leagues || []).filter((row: any) => row.parent_league_id).map((row: any) => row.parent_league_id))) as string[];
  const { data: parentLeagues } = parentIds.length
    ? await supabaseAdmin.from("competitions").select("league_id, name, slug, season, is_public, age_group").in("league_id", parentIds)
    : { data: [] as any[] };
  const parentMap = new Map((parentLeagues || []).map((row: any) => [row.league_id, row]));
  const leagueMap = new Map((leagues || []).flatMap((row: any) => {
    const display = row.is_public ? row : parentMap.get(row.parent_league_id);
    return display?.is_public ? [[row.league_id, display] as [string, any]] : [];
  }));

  // Merged identities can carry the same game twice; count each game once.
  const seenGames = new Set<string>();
  const publicStats = allStats.filter((row: any) => {
    if (!leagueMap.has(row.league_id)) return false;
    if (!row.game_key) return true;
    if (seenGames.has(row.game_key)) return false;
    seenGames.add(row.game_key);
    return true;
  });
  const offset = (pageNumber - 1) * GAME_PAGE_SIZE;
  const stats = publicStats.slice(offset, offset + GAME_PAGE_SIZE);
  if (pageNumber > 1 && stats.length === 0) return { notFound: true };
  const hasNextPage = pageNumber < MAX_GAME_LOG_PAGES && publicStats.length > offset + GAME_PAGE_SIZE;

  const currentLeague: any = leagueMap.get(publicStats[0]?.league_id || player.league_id);
  if (!currentLeague?.is_public) return {};
  // Youth players stay out of search: any game in a competition that can
  // include under-18s, or a date of birth under 18 (shared/youth.ts).
  const youthLeague = (leagueId: string) => {
    const row = (leagues || []).find((l: any) => l.league_id === leagueId);
    const parent = row?.parent_league_id ? parentMap.get(row.parent_league_id) : null;
    return !!row && (isYouthCompetition(row) || (!!parent && isYouthCompetition(parent)));
  };
  const youth = isUnder18(player.date_of_birth) || allStats.some((row: any) => youthLeague(row.league_id));
  const index = await tryIndex();
  const displayName = player.full_name || "Basketball player";
  const teamName: string = publicStats[0]?.team_name || player.team_name || "";
  const realTeam = teamName && !isPlaceholderTeamName(teamName) ? teamName : "";
  const competitionName = currentLeague?.name || "";
  const games = publicStats.length;

  // Career highs, and the games they came in.
  const highOf = (key: string) => publicStats.reduce((best: any, row: any) => (number(row[key]) > number(best?.[key]) ? row : best), null as any);
  const highs = [
    { key: "spoints", label: "points" },
    { key: "sreboundstotal", label: "rebounds" },
    { key: "sassists", label: "assists" },
  ].map((h) => ({ ...h, row: highOf(h.key) })).filter((h) => h.row && number(h.row[h.key]) > 0);

  const gameKeys = Array.from(new Set([...stats, ...highs.map((h) => h.row)].map((row: any) => row?.game_key).filter(Boolean))) as string[];
  const { data: schedules } = gameKeys.length
    ? await supabaseAdmin.from("game_schedule").select("game_key, matchtime, hometeam, awayteam, league_id").in("game_key", gameKeys)
    : { data: [] as any[] };
  const scheduleMap = new Map((schedules || []).map((row: any) => [row.game_key, row]));
  const gameHref = (stat: any) => {
    const league: any = leagueMap.get(stat.league_id);
    return league?.slug && stat.game_key ? gamePathFor(league.slug, stat.game_key) : stat.game_key ? `/game/${encodeURIComponent(stat.game_key)}` : "";
  };

  const totals = publicStats.reduce((acc: any, s: any) => ({
    pts: acc.pts + number(s.spoints), reb: acc.reb + number(s.sreboundstotal), ast: acc.ast + number(s.sassists),
  }), { pts: 0, reb: 0, ast: 0 });
  const avg = (v: number) => (games ? v / games : 0);

  // Season-by-season averages, most recent competition first.
  const seasons = new Map<string, { comp: any; team: string; gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; high: number }>();
  for (const s of publicStats as any[]) {
    const comp: any = leagueMap.get(s.league_id);
    const season = seasons.get(comp.league_id) || { comp, team: s.team_name || "", gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, high: 0 };
    season.gp += 1;
    season.pts += number(s.spoints);
    season.reb += number(s.sreboundstotal);
    season.ast += number(s.sassists);
    season.stl += number(s.ssteals);
    season.blk += number(s.sblocks);
    season.high = Math.max(season.high, number(s.spoints));
    seasons.set(comp.league_id, season);
  }

  const teamPath = realTeam ? clubHref(index, realTeam) || "" : "";
  const playerPath = `/player/${encodeURIComponent(canonicalSlug)}`;
  const canonicalPath = pageNumber > 1 ? `${playerPath}/games/page/${pageNumber}` : playerPath;
  const crumbs: Crumb[] = [
    { name: SITE_NAME, path: "/" },
    ...(currentLeague?.slug ? [{ name: competitionName, path: competitionPath(currentLeague.slug) }] : []),
    ...(teamPath ? [{ name: realTeam, path: teamPath }] : []),
    { name: displayName, path: playerPath },
  ];

  // Earlier clubs, so "<name> <old club>" searches match this page too.
  const formerTeams = Array.from(new Set(Array.from(seasons.values()).map((s) => s.team)))
    .filter((t) => t && t !== realTeam && !isPlaceholderTeamName(t));
  // The same opening sentence the React page shows (shared/recaps.ts).
  const bio = playerBio({ name: displayName, position: player.position, team: realTeam || null, competition: competitionName || null, games, ppg: avg(totals.pts), rpg: avg(totals.reb), apg: avg(totals.ast) });
  const summary = `${escapeHtml(bio)}${games && highs[0]?.key === "spoints" ? ` Career high: ${number(highs[0].row.spoints)} points.` : ""}${formerTeams.length ? ` Also played for ${formerTeams.map((t) => { const href = clubHref(index, t); return href ? link(href, t) : escapeHtml(t); }).join(", ")}.` : ""}${realTeam && teamPath ? ` See the ${link(teamPath, `${realTeam} team page`)}.` : ""}`;

  const seasonRows = Array.from(seasons.values()).map((s) => `<tr>
      <td>${s.comp.slug ? link(competitionPath(s.comp.slug), s.comp.name) : escapeHtml(s.comp.name)}</td>
      <td>${(() => { const href = clubHref(index, s.team); return href ? link(href, s.team) : escapeHtml(s.team); })()}</td>
      <td>${s.gp}</td><td>${one(s.pts / s.gp)}</td><td>${one(s.reb / s.gp)}</td><td>${one(s.ast / s.gp)}</td><td>${one(s.stl / s.gp)}</td><td>${one(s.blk / s.gp)}</td><td>${s.high}</td>
    </tr>`).join("");

  const highItems = highs.map((h) => {
    const schedule: any = scheduleMap.get(h.row.game_key);
    const href = gameHref(h.row);
    const text = `${number(h.row[h.key])} ${h.label} vs ${opponentOf(h.row.team_name, schedule)}`;
    return `<li>${href ? link(href, text) : escapeHtml(text)} — ${escapeHtml(formatDate(schedule?.matchtime || h.row.created_at))}</li>`;
  }).join("");

  const gameRows = stats.map((stat: any) => {
    const schedule: any = scheduleMap.get(stat.game_key);
    const href = gameHref(stat);
    const label = `${stat.team_name || teamName} vs ${opponentOf(stat.team_name, schedule)}`;
    return `<li>${href ? `<a href="${escapeHtml(href)}"><strong>${escapeHtml(label)}</strong></a>` : `<strong>${escapeHtml(label)}</strong>`} — ${escapeHtml(formatDate(schedule?.matchtime || stat.created_at))}: ${escapeHtml(statLine(stat))}</li>`;
  }).join("\n");

  const previousPath = pageNumber === 2 ? playerPath : `${playerPath}/games/page/${pageNumber - 1}`;
  const nextPath = `${playerPath}/games/page/${pageNumber + 1}`;
  const seoInput = { name: displayName, team: realTeam || null, competition: competitionName || null, games, ppg: avg(totals.pts), rpg: avg(totals.reb), apg: avg(totals.ast) };

  const body = `
    ${breadcrumbNav(crumbs)}
    <article>
      <h1>${escapeHtml(displayName)} Stats &amp; Game Log</h1>
      <p>${summary}</p>
      ${player.position ? `<p>Position: ${escapeHtml(player.position)}</p>` : ""}
      ${seasonRows ? `<section aria-labelledby="season-averages"><h2 id="season-averages">${escapeHtml(displayName)} season averages</h2>
        <table><thead><tr><th>Competition</th><th>Team</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>SPG</th><th>BPG</th><th>High</th></tr></thead><tbody>${seasonRows}</tbody></table>
      </section>` : ""}
      ${highItems ? `<section aria-labelledby="career-highs"><h2 id="career-highs">Career highs</h2><ul>${highItems}</ul></section>` : ""}
      <section id="game-log" aria-labelledby="game-log-heading"><h2 id="game-log-heading">${escapeHtml(displayName)} game log${pageNumber > 1 ? ` (page ${pageNumber})` : ""}</h2>
        ${gameRows ? `<ol>${gameRows}</ol>` : "<p>No public game log is available yet.</p>"}
        <nav aria-label="Game log pages">${pageNumber > 1 ? `<a rel="prev" href="${previousPath}">Newer games</a>` : ""}${pageNumber > 1 && hasNextPage ? " · " : ""}${hasNextPage ? `<a rel="next" href="${nextPath}">Older games</a>` : ""}</nav>
      </section>
    </article>`;

  const personUrl = canonicalUrl(playerPath);
  const photo = [player.photo_path_bg_removed, player.photo_path].find((p: any) => typeof p === "string" && /^https?:\/\//i.test(p));
  return {
    page: {
      title: pageNumber > 1 ? `${displayName} Game Log – Page ${pageNumber} | ${SITE_NAME}` : playerSeoTitle(seoInput),
      description: pageNumber > 1
        ? `Older games for ${displayName}${realTeam ? ` (${realTeam})` : ""}: page ${pageNumber} of the game-by-game log.`
        : playerSeoDescription(seoInput),
      canonicalPath,
      image: photo,
      robots: games && !youth ? undefined : NOINDEX,
      breadcrumbs: crumbs,
      ogType: "profile",
      body,
      jsonLd: [
        {
          "@type": "ProfilePage",
          "@id": canonicalUrl(canonicalPath),
          url: canonicalUrl(canonicalPath),
          name: `${displayName} Stats & Game Log`,
          mainEntity: { "@id": `${personUrl}#person` },
        },
        {
          "@type": "Person",
          "@id": `${personUrl}#person`,
          name: displayName,
          url: personUrl,
          jobTitle: player.position || undefined,
          image: photo || undefined,
          memberOf: realTeam
            ? { "@type": "SportsTeam", name: realTeam, sport: "Basketball", url: teamPath ? canonicalUrl(teamPath) : undefined }
            : undefined,
        },
      ],
    },
  };
}

// ── Competitions ─────────────────────────────────────────────────────────

async function renderCompetition(slug: string): Promise<SeoPage | undefined> {
  const { data: competition } = await supabaseAdmin
    .from("competitions")
    .select("league_id, name, slug, season, description, logo_url, parent_league_id")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (!competition) return undefined;

  const [index, { data: parent }] = await Promise.all([
    tryIndex(),
    competition.parent_league_id
      ? supabaseAdmin.from("competitions").select("name, slug, is_public").eq("league_id", competition.parent_league_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);
  const teams = (index?.teams || []).filter((t) => t.competitionSlug === slug);
  const players = (index?.players || []).filter((p) => p.competitionSlugs.includes(slug));
  const games = (index?.games || []).filter((g) => g.competitionSlug === slug)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const empty = !!index && !teams.length && !players.length && !games.length;
  const youth = !!index?.competitions.find((c) => c.slug === slug)?.youth;

  const crumbs: Crumb[] = [
    { name: SITE_NAME, path: "/" },
    ...(parent?.is_public && parent.slug ? [{ name: parent.name, path: competitionPath(parent.slug) }] : []),
    { name: competition.name, path: competitionPath(slug) },
  ];
  const description = competitionSeoDescription(competition.name, competition.description);
  const shownGames = games.slice(0, 60);
  return {
    title: competitionSeoTitle(competition.name),
    description,
    canonicalPath: competitionPath(slug),
    image: competition.logo_url,
    robots: empty || youth ? NOINDEX : undefined,
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}<article><h1>${escapeHtml(competition.name)}</h1><p>${escapeHtml(description)}</p>
      <section><h2>${escapeHtml(competition.name)} teams</h2><ul>${teams.map((t) => `<li>${link(`/team/${t.clubSlug}`, t.name)}</li>`).join("") || "<li>No public teams available yet.</li>"}</ul></section>
      <section><h2>${escapeHtml(competition.name)} players</h2><ul>${players.map((p) => `<li>${link(`/player/${encodeURIComponent(p.segment)}`, p.name)}${p.team && !isPlaceholderTeamName(p.team) ? ` — ${escapeHtml(p.team)}` : ""}</li>`).join("") || "<li>No public players available yet.</li>"}</ul></section>
      <section><h2>Games and results</h2><ul>${shownGames.map((g) => `<li>${link(gamePathFor(slug, g.gameKey), `${g.home} vs ${g.away}`)} — ${escapeHtml(formatDate(g.date))}</li>`).join("") || "<li>No public games available yet.</li>"}</ul>
      ${games.length > shownGames.length ? `<p>${games.length - shownGames.length} earlier games are linked from each team's page.</p>` : ""}</section></article>`,
    jsonLd: {
      "@type": "CollectionPage",
      name: competition.name,
      url: canonicalUrl(competitionPath(slug)),
      description,
      about: { "@type": "SportsOrganization", name: competition.name, sport: "Basketball" },
    },
  };
}

// ── Home and hubs ────────────────────────────────────────────────────────

async function renderHome(): Promise<SeoPage> {
  const index = await tryIndex();
  const top = (index?.competitions || []).filter((c) => !c.parentLeagueId && !c.youth);
  const description = "Swish Assistant is a basketball stats and scouting platform for players, coaches, and leagues, covering NBL, WNBL, BCB, SLB Championship and more.";
  return {
    title: "Swish Assistant | The Home of Basketball Stats, Advanced Metrics & League Insights",
    description,
    canonicalPath: "/",
    body: `<nav><a href="/players">Players</a> · <a href="/teams">Teams</a> · <a href="/scores">Scores</a> · <a href="/news">News</a></nav>
      <article>
        <h1>Swish Assistant — Basketball Stats, League Insights &amp; AI-Powered Scouting</h1>
        <p>${escapeHtml(description)}</p>
        <section><h2>Leagues and competitions</h2><ul>${top.map((c) => `<li>${link(competitionPath(c.slug), c.name)}</li>`).join("") || "<li>No public competitions available yet.</li>"}</ul></section>
        <section><h2>Explore</h2><ul>
          <li><a href="/players">All players</a></li>
          <li><a href="/teams">All teams</a></li>
          <li><a href="/scores">Live scores and results</a></li>
          <li><a href="/news">Latest news</a></li>
        </ul></section>
      </article>`,
    jsonLd: [
      { "@type": "WebSite", "@id": `${SITE_BASE}/#website`, name: SITE_NAME, url: canonicalUrl("/"), description },
      { "@type": "Organization", "@id": `${SITE_BASE}/#organization`, name: SITE_NAME, url: canonicalUrl("/"), logo: `${SITE_BASE}/icon-512.png` },
    ],
  };
}

async function renderTeamsHub(): Promise<SeoPage> {
  const index = await tryIndex();
  // Every adult team side once, under the competition it played in most recently.
  const clubs = (index?.clubs || []).filter((c) => !c.youth);
  const byCompetition = new Map<string, IndexClub[]>();
  for (const club of clubs) {
    const latest = club.competitions.find((c) => !c.youth);
    if (latest) byCompetition.set(latest.competitionSlug, [...(byCompetition.get(latest.competitionSlug) || []), club]);
  }
  const sections = (index?.competitions || []).filter((c) => !c.youth).map((c) => {
    const sides = byCompetition.get(c.slug) || [];
    return sides.length
      ? `<section><h2>${link(competitionPath(c.slug), c.name)}</h2><ul>${sides.map((club) => `<li>${link(`/team/${club.slug}`, club.name)}</li>`).join("")}</ul></section>`
      : "";
  }).join("");
  const crumbs = [{ name: SITE_NAME, path: "/" }, { name: "Teams", path: "/teams" }];
  return {
    title: `Basketball Teams – Rosters, Stats & Results | ${SITE_NAME}`,
    description: "Every team on Swish Assistant by league: rosters, player stats, results and box scores across NBL, WNBL, BCB, SLB and more.",
    canonicalPath: "/teams",
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}<article><h1>Basketball teams</h1>${sections || "<p>No public teams available yet.</p>"}</article>`,
    jsonLd: { "@type": "CollectionPage", name: "Basketball teams", url: canonicalUrl("/teams") },
  };
}

async function renderPlayersHub(): Promise<SeoPage> {
  const index = await tryIndex();
  const players = (index?.players || []).filter((p) => !p.youth);
  const competitions = (index?.competitions || []).filter((c) => !c.youth).map((c) => ({ c, count: players.filter((p) => p.competitionSlugs.includes(c.slug)).length })).filter((x) => x.count);
  const mostGames = [...players].sort((a, b) => b.games - a.games).slice(0, 150);
  const crumbs = [{ name: SITE_NAME, path: "/" }, { name: "Players", path: "/players" }];
  return {
    title: `Basketball Players – Stats, Game Logs & Averages | ${SITE_NAME}`,
    description: `Search ${players.length.toLocaleString("en-GB")} basketball players' stats, game logs and season averages across NBL, WNBL, BCB, SLB and more.`,
    canonicalPath: "/players",
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}<article><h1>Basketball players</h1>
      <section><h2>Players by competition</h2><ul>${competitions.map(({ c, count }) => `<li>${link(competitionPath(c.slug), c.name)} — ${count} players</li>`).join("")}</ul></section>
      <section><h2>Most games played</h2><ul>${mostGames.map((p) => `<li>${link(`/player/${encodeURIComponent(p.segment)}`, p.name)}${p.team && !isPlaceholderTeamName(p.team) ? ` — ${escapeHtml(p.team)}` : ""} (${p.games} games)</li>`).join("")}</ul></section>
    </article>`,
    jsonLd: { "@type": "CollectionPage", name: "Basketball players", url: canonicalUrl("/players") },
  };
}

async function renderScores(): Promise<SeoPage> {
  const index = await tryIndex();
  const now = Date.now();
  const slugToName = new Map((index?.competitions || []).map((c) => [c.slug, c.name]));
  const dated = (index?.games || []).filter((g) => g.date && !g.youth);
  const results = dated.filter((g) => new Date(g.date!).getTime() <= now).sort((a, b) => b.date!.localeCompare(a.date!)).slice(0, 40);
  const fixtures = dated.filter((g) => new Date(g.date!).getTime() > now).sort((a, b) => a.date!.localeCompare(b.date!)).slice(0, 40);
  const item = (g: (typeof dated)[number]) =>
    `<li>${link(gamePathFor(g.competitionSlug, g.gameKey), `${g.home} vs ${g.away}`)} — ${escapeHtml(formatDate(g.date))}${slugToName.get(g.competitionSlug) ? ` · ${escapeHtml(slugToName.get(g.competitionSlug))}` : ""}</li>`;
  const crumbs = [{ name: SITE_NAME, path: "/" }, { name: "Scores", path: "/scores" }];
  return {
    // Same title and description as the React page (ScoresPage.tsx).
    title: `Live scores and results | ${SITE_NAME}`,
    description: "Live scores, upcoming fixtures and the latest results from British basketball, updated as games happen.",
    canonicalPath: "/scores",
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}<article><h1>Live scores and results</h1>
      <p>Live scores, upcoming fixtures and the latest results from British basketball, updated as games happen.</p>
      <section><h2>Latest results</h2><ul>${results.map(item).join("") || "<li>No results yet.</li>"}</ul></section>
      <section><h2>Upcoming fixtures</h2><ul>${fixtures.map(item).join("") || "<li>No fixtures scheduled.</li>"}</ul></section></article>`,
    jsonLd: { "@type": "CollectionPage", name: "Live scores and results", url: canonicalUrl("/scores") },
  };
}

// The legal pages are plain React pages; this gives their HTML the right
// title and canonical (titles match LegalPageShell's).
const LEGAL_PAGES: Record<string, { title: string; summary: string }> = {
  "/privacy": {
    title: "Privacy Policy",
    summary: "How Swish Assistant, operated by Automated Athlete, collects, uses and protects personal data, how long it is kept, and the rights you have under UK data protection law.",
  },
  "/terms": {
    title: "Terms of Service",
    summary: "The terms for using Swish Assistant, operated by Automated Athlete: accounts, acceptable use, the stats and content on the site, and the limits of the service.",
  },
  "/cookies": {
    title: "Cookie Policy",
    summary: "Which cookies and similar technologies Swish Assistant uses, what each one is for, and how to manage or turn them off in your browser.",
  },
};

function renderLegal(path: string): SeoPage | undefined {
  const page = LEGAL_PAGES[path];
  if (!page) return undefined;
  const crumbs = [{ name: SITE_NAME, path: "/" }, { name: page.title, path }];
  return {
    title: `${page.title} | ${SITE_NAME}`,
    description: page.summary,
    canonicalPath: path,
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}<article><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.summary)}</p></article>`,
    jsonLd: { "@type": "WebPage", name: page.title, url: canonicalUrl(path) },
  };
}

// ── News ─────────────────────────────────────────────────────────────────

async function renderNewsIndex(): Promise<SeoPage> {
  const { data: articles } = await supabaseAdmin
    .from("news_articles")
    .select("id, slug, title, summary, published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(100);
  const crumbs = [{ name: SITE_NAME, path: "/" }, { name: "News", path: "/news" }];
  return {
    title: `Latest Basketball News | ${SITE_NAME}`,
    description: "The latest basketball news, results round-ups and features from the leagues on Swish Assistant.",
    canonicalPath: "/news",
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}<article><h1>Latest news</h1><ul>${(articles || []).map((a: any) =>
      `<li>${link(`/news/${encodeURIComponent(a.slug || a.id)}`, a.title)} — ${escapeHtml(formatDate(a.published_at))}${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ""}</li>`).join("") || "<li>No news yet.</li>"}</ul></article>`,
    jsonLd: { "@type": "CollectionPage", name: "Latest news", url: canonicalUrl("/news") },
  };
}

async function renderNewsArticle(segment: string): Promise<{ page?: SeoPage; redirect?: string }> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);
  const { data: article } = await supabaseAdmin
    .from("news_articles")
    .select("id, slug, title, summary, body, content, image_url, image_alt, league, published_at, updated_at, is_published")
    .eq(isUuid ? "id" : "slug", segment)
    .eq("is_published", true)
    .maybeSingle();
  if (!article) return {};
  const canonicalSegment = article.slug || article.id;
  if (canonicalSegment !== segment) return { redirect: `/news/${encodeURIComponent(canonicalSegment)}` };
  const canonicalPath = `/news/${encodeURIComponent(canonicalSegment)}`;
  const description = article.summary || String(article.body || "").replace(/\s+/g, " ").slice(0, 155);
  // Articles from the editor have a structured body; older ones are plain text.
  const doc = article.content as ArticleDoc | null;
  const bodyHtml = doc?.content?.length
    ? articleDocToHtml(doc)
    : String(article.body || "").split(/\n{2,}|\r?\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`).join("");
  // The pages the article is tagged with, as links a crawler can follow.
  const { data: tags } = await supabaseAdmin
    .from("news_article_tags")
    .select("kind, key, label, context")
    .eq("article_id", article.id)
    .order("sort_order", { ascending: true });
  const tagLinks = ((tags as ArticleTag[] | null) || []).map((tag) => `<li>${link(articleTagHref(tag), tag.label)}</li>`).join("");
  const cover = article.image_url ? `<img src="${escapeHtml(article.image_url)}" alt="${escapeHtml(article.image_alt || article.title)}" />` : "";
  const crumbs = [{ name: SITE_NAME, path: "/" }, { name: "News", path: "/news" }, { name: article.title, path: canonicalPath }];
  return {
    page: {
      title: `${article.title} | ${SITE_NAME}`,
      description,
      canonicalPath,
      image: article.image_url,
      ogType: "article",
      breadcrumbs: crumbs,
      body: `${breadcrumbNav(crumbs)}<article><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(formatDate(article.published_at))}</p>${article.summary ? `<p><strong>${escapeHtml(article.summary)}</strong></p>` : ""}${cover}${bodyHtml}${tagLinks ? `<h2>In this story</h2><ul>${tagLinks}</ul>` : ""}</article>`,
      jsonLd: {
        "@type": "NewsArticle",
        headline: article.title,
        description,
        datePublished: article.published_at || undefined,
        dateModified: article.updated_at || article.published_at || undefined,
        articleSection: article.league || undefined,
        image: article.image_url ? [article.image_url] : undefined,
        mainEntityOfPage: canonicalUrl(canonicalPath),
        author: { "@type": "Organization", name: SITE_NAME, url: SITE_BASE },
        publisher: { "@type": "Organization", name: SITE_NAME, logo: { "@type": "ImageObject", url: `${SITE_BASE}/icon-512.png` } },
      },
    },
  };
}

// ── Teams ────────────────────────────────────────────────────────────────

/** The part of a team name every competition's spelling shares, for an ilike pre-filter. */
function searchCore(name: string): string {
  return name.replace(/\s+Senior\s+(Men|Women)\b.*$/i, "").replace(/\s+I$/i, "").replace(/[%_]/g, "").trim();
}

/**
 * A team side's permanent page: /team/<slug>, covering every competition it
 * has played in. It opens on the most recent (or ?competition=<slug>), but
 * its canonical is always the bare URL, so links and authority build up on
 * one page across seasons instead of a new URL each season.
 */
async function renderClubTeam(club: IndexClub, competitionParam: string | null, index: SeoIndex): Promise<SeoPage> {
  const comps = club.youth ? club.competitions : club.competitions.filter((c) => !c.youth);
  const selected = comps.find((c) => c.competitionSlug === competitionParam) || comps[0];

  // Each competition's league ids: itself, plus private children that display
  // under it (the same scoping the index uses).
  const { data: allCompetitions } = await supabaseAdmin.from("competitions").select("league_id, slug, is_public, parent_league_id");
  const slugByLeague = new Map((allCompetitions || []).filter((c: any) => c.is_public && c.slug).map((c: any) => [c.league_id, c.slug]));
  const leagueIdsFor = (slug: string) => (allCompetitions || [])
    .filter((c: any) => c.slug === slug || (!c.is_public && slugByLeague.get(c.parent_league_id) === slug))
    .map((c: any) => c.league_id as string);
  const leagueIds = leagueIdsFor(selected.competitionSlug);
  const compSlugOfLeague = new Map<string, string>();
  for (const c of comps) for (const id of leagueIdsFor(c.competitionSlug)) compSlugOfLeague.set(id, c.competitionSlug);

  const [{ data: rawStats }, { data: teamRows }] = await Promise.all([
    leagueIds.length
      ? supabaseAdmin
          .from("player_stats")
          .select("player_id, league_id, team_name, full_name, spoints, sreboundstotal, sassists, game_key, created_at")
          .in("league_id", leagueIds)
          .ilike("team_name", `%${searchCore(selected.teamName)}%`)
          .order("created_at", { ascending: false })
          .limit(1500)
      : Promise.resolve({ data: [] as any[] }),
    // Every competition's team rows, for records and results (both sides of each game).
    compSlugOfLeague.size
      ? supabaseAdmin.from("team_stats").select("league_id, name, game_key, tot_spoints").in("league_id", Array.from(compSlugOfLeague.keys())).limit(10000)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const stats = (rawStats || []).filter((row: any) => teamClubKey(row.team_name || "") === club.clubKey);

  // Results per competition: this side's row and the other side's in each game.
  const byGame = new Map<string, any[]>();
  for (const row of teamRows || []) if (row.game_key) byGame.set(row.game_key, [...(byGame.get(row.game_key) || []), row]);
  const ownGames = Array.from(byGame.entries()).flatMap(([gameKey, rows]) => {
    const own = rows.find((r) => teamClubKey(r.name || "") === club.clubKey);
    const opp = rows.find((r) => r !== own);
    if (!own || !opp) return [];
    const pts = number(own.tot_spoints), oppPts = number(opp.tot_spoints);
    return [{ gameKey, competitionSlug: compSlugOfLeague.get(own.league_id) || "", opponent: opp.name as string, pts, oppPts, win: pts > oppPts }];
  });
  const gameKeys = ownGames.filter((g) => g.competitionSlug === selected.competitionSlug).map((g) => g.gameKey);
  const { data: schedules } = gameKeys.length
    ? await supabaseAdmin.from("game_schedule").select("game_key, matchtime, hometeam").in("game_key", gameKeys)
    : { data: [] as any[] };
  const scheduleMap = new Map((schedules || []).map((row: any) => [row.game_key, row]));
  const recordFor = (slug: string) => {
    const list = ownGames.filter((g) => g.competitionSlug === slug);
    return list.length ? { wins: list.filter((g) => g.win).length, losses: list.filter((g) => !g.win).length } : null;
  };
  const record = recordFor(selected.competitionSlug);

  // Roster for the selected competition, best scorers first.
  const roster = Array.from(stats.reduce((acc: Map<string, any>, row: any) => {
    const key = row.player_id || row.full_name;
    const entry = acc.get(key) || { id: row.player_id, name: row.full_name, gp: 0, pts: 0, reb: 0, ast: 0 };
    entry.gp += 1; entry.pts += number(row.spoints); entry.reb += number(row.sreboundstotal); entry.ast += number(row.sassists);
    acc.set(key, entry);
    return acc;
  }, new Map<string, any>()).values()).sort((a: any, b: any) => b.pts / b.gp - a.pts / a.gp);
  const playerIds = roster.map((r: any) => r.id).filter(Boolean);
  const { data: playerRows } = playerIds.length
    ? await supabaseAdmin.from("players").select("id, slug, full_name, position").in("id", playerIds)
    : { data: [] as any[] };
  const playerMap = new Map((playerRows || []).map((row: any) => [row.id, row]));
  const rosterRows = roster.map((r: any) => {
    const canonical: any = playerMap.get(r.id);
    const name = canonical?.full_name || r.name || "Player";
    const cell = canonical ? link(`/player/${encodeURIComponent(playerSegment(canonical))}`, name) : escapeHtml(name);
    return `<tr><td>${cell}</td><td>${escapeHtml(canonical?.position || "")}</td><td>${r.gp}</td><td>${one(r.pts / r.gp)}</td><td>${one(r.reb / r.gp)}</td><td>${one(r.ast / r.gp)}</td></tr>`;
  }).join("");

  const games = ownGames
    .filter((g) => g.competitionSlug === selected.competitionSlug)
    .map((g) => ({ ...g, date: (scheduleMap.get(g.gameKey) as any)?.matchtime || null, home: teamClubKey((scheduleMap.get(g.gameKey) as any)?.hometeam || "") === club.clubKey }))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const ppg = games.length ? games.reduce((n, g) => n + g.pts, 0) / games.length : null;
  const oppPpg = games.length ? games.reduce((n, g) => n + g.oppPts, 0) / games.length : null;
  const top = roster[0] as any;
  const summary = teamSeasonSummary({
    team: club.name,
    competition: selected.competitionName,
    wins: record?.wins || 0,
    losses: record?.losses || 0,
    ppg,
    oppPpg,
    topScorer: top && top.gp ? { name: playerMap.get(top.id)?.full_name || top.name, ppg: top.pts / top.gp } : null,
  });

  const resultItems = games.slice(0, 20).map((g) => {
    const opp = clubHref(index, g.opponent);
    return `<li>${g.win ? "W" : "L"} ${g.pts}–${g.oppPts} ${g.home ? "vs" : "at"} ${opp ? link(opp, g.opponent) : escapeHtml(g.opponent)} — ${link(gamePathFor(selected.competitionSlug, g.gameKey), formatDate(g.date))}</li>`;
  }).join("");
  const now = Date.now();
  const fixtures = index.games
    .filter((g) => g.competitionSlug === selected.competitionSlug && g.date && new Date(g.date).getTime() > now)
    .filter((g) => teamClubKey(g.home) === club.clubKey || teamClubKey(g.away) === club.clubKey)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, 6)
    .map((g) => {
      const home = teamClubKey(g.home) === club.clubKey;
      const opponent = home ? g.away : g.home;
      const opp = clubHref(index, opponent);
      return `<li>${home ? "vs" : "at"} ${opp ? link(opp, opponent) : escapeHtml(opponent)} — ${link(gamePathFor(g.competitionSlug, g.gameKey), formatDate(g.date))}</li>`;
    }).join("");

  const seasonRows = comps.map((c) => {
    const r = recordFor(c.competitionSlug);
    return `<tr><td>${link(competitionPath(c.competitionSlug), c.competitionName)}</td><td>${r ? `${r.wins}-${r.losses}` : "—"}</td><td>${escapeHtml(c.teamName)}</td></tr>`;
  }).join("");

  const canonicalPath = `/team/${club.slug}`;
  const crumbs: Crumb[] = [
    { name: SITE_NAME, path: "/" },
    { name: "Teams", path: "/teams" },
    { name: club.name, path: canonicalPath },
  ];
  const alternateNames = club.variants.filter((v) => v !== club.name);
  return {
    title: teamSeoTitle(club.name),
    description: summary ? `${summary} Roster, results and box scores.` : teamSeoDescription(club.name, selected.competitionName),
    canonicalPath,
    robots: club.youth ? NOINDEX : undefined,
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}
      <article><h1>${escapeHtml(club.name)} Roster &amp; Stats</h1>
      <p>${escapeHtml(summary)}</p>
      ${alternateNames.length ? `<p>Also listed as ${escapeHtml(alternateNames.join(", "))}.</p>` : ""}
      <section><h2>${escapeHtml(club.name)} roster — ${escapeHtml(selected.competitionName)}</h2><table><thead><tr><th>Player</th><th>Position</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th></tr></thead><tbody>${rosterRows}</tbody></table></section>
      <section><h2>${escapeHtml(club.name)} results</h2><ul>${resultItems || "<li>No results yet.</li>"}</ul></section>
      ${fixtures ? `<section><h2>Upcoming games</h2><ul>${fixtures}</ul></section>` : ""}
      <section><h2>Seasons and competitions</h2><table><thead><tr><th>Competition</th><th>Record</th><th>Listed as</th></tr></thead><tbody>${seasonRows}</tbody></table></section></article>`,
    jsonLd: {
      "@type": "SportsTeam",
      name: club.name,
      alternateName: alternateNames.length ? alternateNames : undefined,
      url: canonicalUrl(canonicalPath),
      sport: "Basketball",
      memberOf: { "@type": "SportsOrganization", name: selected.competitionName, url: canonicalUrl(competitionPath(selected.competitionSlug)) },
      athlete: (playerRows || []).slice(0, 50).map((row: any) => ({
        "@type": "Person",
        name: row.full_name,
        url: canonicalUrl(`/player/${encodeURIComponent(playerSegment(row))}`),
      })),
    },
  };
}

// ── Games ────────────────────────────────────────────────────────────────

async function renderGame(gameKey: string, competitionSlug?: string): Promise<SeoPage | undefined> {
  const [{ data: schedule }, { data: playerStats }, { data: teamStats }] = await Promise.all([
    supabaseAdmin.from("game_schedule").select("game_key, matchtime, hometeam, awayteam, league_id").eq("game_key", gameKey).maybeSingle(),
    supabaseAdmin.from("player_stats").select("player_id, league_id, full_name, team_name, spoints, sreboundstotal, sassists").eq("game_key", gameKey).order("spoints", { ascending: false }),
    // tot_spoints: this used to ask for "tot_sPoints", which doesn't exist, so
    // every server-rendered game page went out without its score.
    supabaseAdmin.from("team_stats").select("name, tot_spoints, side, p1_score, p2_score, p3_score, p4_score").eq("game_key", gameKey),
  ]);
  if (!schedule && !(playerStats || []).length) return undefined;
  const publicCompetition = await resolvePublicCompetition(schedule?.league_id || playerStats?.[0]?.league_id);
  if (!publicCompetition) return undefined;
  let competition: any = publicCompetition;
  if (competitionSlug) {
    const { data } = await supabaseAdmin.from("competitions").select("name, slug").eq("slug", competitionSlug).maybeSingle();
    if (!data || data.slug !== publicCompetition.slug) return undefined;
    competition = { ...publicCompetition, ...data };
  }
  const ids = Array.from(new Set((playerStats || []).map((row: any) => row.player_id).filter(Boolean))) as string[];
  const { data: players } = ids.length
    ? await supabaseAdmin.from("players").select("id, slug, full_name").in("id", ids)
    : { data: [] as any[] };
  const playerMap = new Map((players || []).map((row: any) => [row.id, row]));
  const home = schedule?.hometeam || teamStats?.find((row: any) => String(row.side) === "1")?.name || "Home team";
  const away = schedule?.awayteam || teamStats?.find((row: any) => String(row.side) === "2")?.name || "Away team";
  const scoreByTeam = new Map((teamStats || []).map((row: any) => [row.name, number(row.tot_spoints)]));
  const hasStats = (playerStats || []).length > 0;
  const { data: leagueRow } = schedule?.league_id
    ? await supabaseAdmin.from("competitions").select("name, age_group, parent_league_id").eq("league_id", schedule.league_id).maybeSingle()
    : { data: null as any };
  const youth = !!leagueRow && (isYouthCompetition(leagueRow) || isYouthCompetition(publicCompetition));
  const indexable = !youth && isIndexableGame({ home: schedule?.hometeam, away: schedule?.awayteam, date: schedule?.matchtime, hasStats });
  const index = await tryIndex();
  const teamLink = (name: string) => {
    const href = clubHref(index, name);
    return href ? link(href, name) : escapeHtml(name);
  };
  const boxScore = (playerStats || []).map((row: any) => {
    const player: any = playerMap.get(row.player_id);
    const name = player?.full_name || row.full_name || "Player";
    return `<tr><td>${player ? link(`/player/${encodeURIComponent(playerSegment(player))}`, name) : escapeHtml(name)}</td><td>${escapeHtml(row.team_name)}</td><td>${number(row.spoints)}</td><td>${number(row.sreboundstotal)}</td><td>${number(row.sassists)}</td></tr>`;
  }).join("");
  const canonicalPath = competition?.slug ? gamePathFor(competition.slug, gameKey) : `/game/${encodeURIComponent(gameKey)}`;
  const titleText = `${home} vs ${away}`;
  const homeScore = scoreByTeam.get(home);
  const awayScore = scoreByTeam.get(away);
  const scoreline = hasStats && homeScore != null && awayScore != null ? ` ${homeScore}–${awayScore}` : "";
  const description = hasStats
    ? `${titleText}${scoreline} box score from ${formatDate(schedule?.matchtime)}${competition?.name ? ` in ${competition.name}` : ""}, with every player's points, rebounds and assists.`
    : `${titleText}${competition?.name ? ` in ${competition.name}` : ""} on ${formatDate(schedule?.matchtime)}: preview, team form and season stats.`;
  const crumbs: Crumb[] = [
    { name: SITE_NAME, path: "/" },
    ...(competition?.slug ? [{ name: competition.name, path: competitionPath(competition.slug) }] : []),
    { name: titleText, path: canonicalPath },
  ];
  const teamNode = (name: string) => {
    const href = clubHref(index, name);
    return { "@type": "SportsTeam", name, url: href ? canonicalUrl(href) : undefined };
  };
  // A written recap from the box score (shared/recaps.ts), like the React page shows.
  const rowFor = (name: string) => (teamStats || []).find((row: any) => row.name === name);
  const quarters = ([1, 2, 3, 4] as const).map((q) => ({ home: number(rowFor(home)?.[`p${q}_score`]), away: number(rowFor(away)?.[`p${q}_score`]) }));
  const topFor = (team: string) => {
    const row: any = (playerStats || []).find((r: any) => r.team_name === team);
    if (!row) return null;
    const name = (playerMap.get(row.player_id) as any)?.full_name || row.full_name;
    return name ? { name, pts: number(row.spoints), reb: number(row.sreboundstotal), ast: number(row.sassists) } : null;
  };
  const recap = hasStats && homeScore != null && awayScore != null
    ? gameRecap({ home, away, homeScore, awayScore, competition: competition?.name, date: schedule?.matchtime, quarters, topHome: topFor(home), topAway: topFor(away) })
    : [];
  return {
    title: `${titleText}${scoreline} ${hasStats ? "Box Score" : "Preview"}${competition?.name ? ` | ${competition.name}` : ""} | ${SITE_NAME}`,
    description,
    canonicalPath,
    robots: indexable ? undefined : NOINDEX,
    breadcrumbs: crumbs,
    body: `${breadcrumbNav(crumbs)}
      <article><h1>${escapeHtml(titleText)}</h1><p>${escapeHtml(formatDate(schedule?.matchtime))}</p>
      ${hasStats ? `<p><strong>${teamLink(home)} ${homeScore ?? ""} – ${awayScore ?? ""} ${teamLink(away)}</strong></p>` : `<p>${teamLink(home)} vs ${teamLink(away)}</p>`}
      ${recap.length ? `<section><h2>Game recap</h2><p>${escapeHtml(recap.join(" "))}</p></section>` : ""}
      ${boxScore ? `<section><h2>Player box score</h2><table><thead><tr><th>Player</th><th>Team</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>${boxScore}</tbody></table></section>` : ""}</article>`,
    jsonLd: {
      "@type": "SportsEvent",
      name: titleText,
      url: canonicalUrl(canonicalPath),
      startDate: schedule?.matchtime || undefined,
      eventStatus: "https://schema.org/EventScheduled",
      sport: "Basketball",
      homeTeam: teamNode(home),
      awayTeam: teamNode(away),
      competitor: [teamNode(home), teamNode(away)],
      superEvent: competition?.name ? { "@type": "SportsEvent", name: competition.name, url: competition.slug ? canonicalUrl(competitionPath(competition.slug)) : undefined } : undefined,
    },
  };
}

// ── Routing ──────────────────────────────────────────────────────────────

const CACHE_CONTROL = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400";

export async function servePublicSeo(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const pathname = req.path.replace(/\/+$/, "") || "/";
  const homeMatch = pathname === "/";
  const teamsHubMatch = pathname === "/teams";
  const playersHubMatch = pathname === "/players";
  const newsIndexMatch = pathname === "/news";
  const scoresMatch = pathname === "/scores";
  const legalMatch = pathname in LEGAL_PAGES;
  const newsArticleMatch = pathname.match(/^\/news\/([^/]+)$/i);
  const playerMatch = pathname.match(/^\/player\/([^/]+)(?:\/games\/page\/(\d+))?$/i);
  const competitionGameMatch = pathname.match(/^\/competition\/([^/]+)\/game\/([^/]+)$/i);
  const competitionPlayerMatch = pathname.match(/^\/competition\/([^/]+)\/player\/([^/]+)$/i);
  const competitionLeadersMatch = pathname.match(/^\/competition-leaders\/([^/]+)$/i);
  const competitionTeamsMatch = pathname.match(/^\/(?:competition|league)\/([^/]+)\/teams$/i);
  const directGameMatch = pathname.match(/^\/game\/([^/]+)$/i);
  const competitionTeamMatch = pathname.match(/^\/competition\/([^/]+)\/team\/([^/]+)$/i);
  const teamMatch = pathname.match(/^\/team\/([^/]+)$/i);
  const competitionMatch = pathname.match(/^\/competition\/([^/]+)$/i);
  if (!homeMatch && !teamsHubMatch && !playersHubMatch && !newsIndexMatch && !scoresMatch && !legalMatch && !newsArticleMatch && !playerMatch && !competitionGameMatch && !competitionPlayerMatch && !competitionLeadersMatch && !competitionTeamsMatch && !directGameMatch && !competitionTeamMatch && !teamMatch && !competitionMatch) return next();

  try {
    if (req.path.length > 1 && req.path.endsWith("/")) {
      return res.redirect(301, pathname);
    }
    if (competitionPlayerMatch) return res.redirect(301, `/player/${encodeURIComponent(decodeURIComponent(competitionPlayerMatch[2]))}`);
    if (competitionLeadersMatch) {
      const slug = decodeURIComponent(competitionLeadersMatch[1]);
      return res.redirect(301, `/competition/${encodeURIComponent(slug)}?section=leaders`);
    }
    // The old per-competition teams page is now the league page's Teams tab.
    if (competitionTeamsMatch) {
      const slug = decodeURIComponent(competitionTeamsMatch[1]);
      return res.redirect(301, `/competition/${encodeURIComponent(slug)}?section=teams`);
    }
    let page: SeoPage | undefined;
    if (homeMatch) {
      page = await renderHome();
    } else if (teamsHubMatch) {
      page = await renderTeamsHub();
    } else if (playersHubMatch) {
      page = await renderPlayersHub();
    } else if (newsIndexMatch) {
      page = await renderNewsIndex();
    } else if (scoresMatch) {
      page = await renderScores();
    } else if (legalMatch) {
      page = renderLegal(pathname);
    } else if (newsArticleMatch) {
      const result = await renderNewsArticle(decodeURIComponent(newsArticleMatch[1]));
      if (result.redirect) return res.redirect(301, result.redirect);
      page = result.page;
    } else if (playerMatch) {
      const requestedPage = Number(playerMatch[2] || 1);
      if (playerMatch[2] && requestedPage === 1) return res.redirect(301, `/player/${encodeURIComponent(decodeURIComponent(playerMatch[1]))}`);
      if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > MAX_GAME_LOG_PAGES) return sendNotFound(res);
      const result = await renderPlayer(decodeURIComponent(playerMatch[1]), requestedPage);
      if (result.redirect) return res.redirect(301, result.redirect);
      if (result.notFound) return sendNotFound(res);
      page = result.page;
    } else if (competitionGameMatch) {
      const gameKey = decodeURIComponent(competitionGameMatch[2]);
      page = await renderGame(gameKey, decodeURIComponent(competitionGameMatch[1]));
      if (!page) {
        // Under another slug (e.g. a private child competition whose games
        // display under its public parent): send it to the canonical URL.
        const canonical = await renderGame(gameKey);
        if (canonical) return res.redirect(301, canonical.canonicalPath);
      }
    } else if (directGameMatch) {
      page = await renderGame(decodeURIComponent(directGameMatch[1]));
      if (page && page.canonicalPath !== pathname) return res.redirect(301, page.canonicalPath);
    } else if (competitionTeamMatch) {
      // Season-specific team URLs now open the team's permanent page on that
      // competition, so every season's links count towards one page.
      const competitionSlug = decodeURIComponent(competitionTeamMatch[1]);
      const name = decodeURIComponent(competitionTeamMatch[2]);
      const index = await tryIndex();
      if (!index) throw new Error("SEO index unavailable");
      const team = index.teams.find((t) => t.competitionSlug === competitionSlug
        && (slugifyName(t.name) === slugifyName(name.replace(/-/g, " ")) || clubSlug(t.name) === clubSlug(name)));
      const club = team ? index.clubBySlug.get(team.clubSlug) : resolveClub(index, name);
      if (!club) return sendNotFound(res);
      return res.redirect(301, `/team/${club.slug}${team ? `?competition=${encodeURIComponent(competitionSlug)}` : ""}`);
    } else if (teamMatch) {
      const key = decodeURIComponent(teamMatch[1]);
      const index = await tryIndex();
      if (!index) throw new Error("SEO index unavailable");
      const club = resolveClub(index, key);
      if (!club) return sendNotFound(res);
      const competitionParam = typeof req.query.competition === "string" ? req.query.competition : null;
      // One URL per team: other spellings and old name-based URLs redirect to it.
      if (club.slug !== key) {
        return res.redirect(301, `/team/${club.slug}${competitionParam ? `?competition=${encodeURIComponent(competitionParam)}` : ""}`);
      }
      page = await renderClubTeam(club, competitionParam, index);
    } else if (competitionMatch) {
      const slug = decodeURIComponent(competitionMatch[1]);
      page = await renderCompetition(slug);
      if (!page) {
        // A private child competition shows under its public parent.
        const { data: child } = await supabaseAdmin.from("competitions").select("league_id, is_public").eq("slug", slug).maybeSingle();
        const parent = child && !child.is_public ? await resolvePublicCompetition(child.league_id) : null;
        if (parent?.slug && parent.slug !== slug) return res.redirect(301, competitionPath(parent.slug));
      }
    }
    if (!page) return sendNotFound(res);
    const html = injectSeo(await loadShell(), page);
    res.status(200).type("html").set("Cache-Control", CACHE_CONTROL).send(html);
  } catch (error) {
    // This path matched a real client-side page, so a failure here should
    // still show the working React app rather than a bare error — which is
    // what used to happen for a game whose SEO render threw on a data-shape
    // surprise (Vercel served Express's "Cannot GET" instead of the app).
    console.error("Public SEO rendering failed, falling back to plain shell:", error);
    try {
      const shell = withDevPreamble(stripHeadDefaults(await loadShell()));
      return res.status(200).type("html").set("Cache-Control", "no-store").send(shell);
    } catch (shellError) {
      console.error("Falling back to the client shell also failed:", shellError);
      next();
    }
  }
}

// Last-resort fallback for any GET/HEAD page request that isn't an API call
// and wasn't handled above (either it didn't match one of the SEO patterns,
// or SEO rendering AND the plain-shell fallback both failed). Without this,
// a request that reaches here in the Vercel serverless function — which,
// unlike the full dev/prod server, has no static-file or catch-all handler
// of its own — falls through to Express's bare "Cannot GET" response
// instead of the actual app. Register this last, after API routes, so it
// only ever catches page-shaped requests nothing else claimed.
export async function serveSpaShellFallback(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (req.path.startsWith("/api/")) return next();
  try {
    const shell = withDevPreamble(await loadShell());
    res.status(200).type("html").send(shell);
  } catch (error) {
    console.error("SPA shell fallback failed:", error);
    next();
  }
}
