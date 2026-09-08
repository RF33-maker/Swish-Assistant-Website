import type { NextFunction, Request, Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "./supabaseServiceClient";

const SITE_BASE = "https://www.swishassistant.com";
const GAME_PAGE_SIZE = 25;
const MAX_GAME_LOG_PAGES = 10;

type SeoPage = {
  title: string;
  description: string;
  canonicalPath: string;
  body: string;
  jsonLd: Record<string, unknown> | Array<Record<string, unknown>>;
  image?: string | null;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function slugifyTeam(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function slugifyPlayer(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
}

function generatedPlayerSegment(name: string, id: string): string {
  return `${slugifyPlayer(name)}--${id}`;
}

function playerIdFromSegment(segment: string): string | null {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return segment;
  const match = segment.match(/--([0-9a-f]{8}-[0-9a-f-]{27,})$/i);
  return match?.[1] || null;
}

function canonicalPlayerSegment(player: any): string {
  return player.slug || generatedPlayerSegment(player.full_name || "player", player.id);
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

function statLine(stat: any): string {
  return `${number(stat.spoints)} points, ${number(stat.sreboundstotal)} rebounds, ${number(stat.sassists)} assists`;
}

async function loadShell(): Promise<string> {
  const candidates = process.env.NODE_ENV === "production"
    ? [path.resolve(process.cwd(), "dist/index.html"), path.resolve(process.cwd(), "client/index.html")]
    : [path.resolve(process.cwd(), "client/index.html"), path.resolve(process.cwd(), "dist/index.html")];
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Try the next deployment layout.
    }
  }
  throw new Error("Unable to load the client HTML shell");
}

function injectSeo(shell: string, page: SeoPage): string {
  const url = canonicalUrl(page.canonicalPath);
  const image = page.image && /^https?:\/\//i.test(page.image) ? page.image : `${SITE_BASE}/og-image.png`;
  const metadata = `
    <title>${escapeHtml(page.title)}</title>
    <meta name="description" content="${escapeHtml(page.description)}" />
    <link rel="canonical" href="${escapeHtml(url)}" />
    <meta property="og:title" content="${escapeHtml(page.title)}" />
    <meta property="og:description" content="${escapeHtml(page.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(page.title)}" />
    <meta name="twitter:description" content="${escapeHtml(page.description)}" />
    <script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, "\\u003c")}</script>`;

  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, "")
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, "")
    .replace("</head>", `${metadata}\n</head>`);

  if (process.env.NODE_ENV !== "production" && html.includes("/src/main.tsx")) {
    const reactRefreshPreamble = `<script type="module">
      import RefreshRuntime from "/@react-refresh";
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>`;
    html = html.replace("</head>", `${reactRefreshPreamble}\n</head>`);
  }

  const seoBody = `<div id="root">
    <main id="crawlable-content" style="max-width:1100px;margin:0 auto;padding:32px 20px;font-family:system-ui,sans-serif;color:#172033">
      ${page.body}
    </main>
  </div>`;
  html = html.replace(/<div\s+id=["']root["']\s*><\/div>/i, seoBody);
  return html;
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

async function renderPlayer(slugOrId: string, pageNumber: number): Promise<{ page?: SeoPage; redirect?: string; notFound?: boolean }> {
  const lookupId = playerIdFromSegment(slugOrId);
  let query = supabaseAdmin
    .from("players")
    .select("id, slug, full_name, team_name, position, league_id, photo_path, photo_path_bg_removed");
  query = lookupId
    ? query.eq("id", lookupId)
    : query.eq("slug", slugOrId);
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
  const canonicalSlug = canonicalPlayerSegment(canonicalIdentityPlayer);
  if (slugOrId !== canonicalSlug) {
    return { redirect: `/player/${encodeURIComponent(canonicalSlug)}` };
  }
  const playerIds = Array.from(new Set([
    ...relatedIds,
  ].filter(Boolean)));
  const fetchLimit = Math.min(pageNumber * GAME_PAGE_SIZE + 1, MAX_GAME_LOG_PAGES * GAME_PAGE_SIZE + 1);
  const statResults = await Promise.all(
    playerIds.map((id) =>
      supabaseAdmin
        .from("player_stats")
        .select("player_id, league_id, team_name, created_at, game_key, spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sminutes")
        .eq("player_id", id)
        .order("created_at", { ascending: false })
        .limit(fetchLimit),
    ),
  );
  const allStats = statResults.flatMap((result) => result.data || [])
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  const leagueIds = Array.from(new Set([player.league_id, ...allStats.map((row: any) => row.league_id)].filter(Boolean))) as string[];
  const { data: leagues } = leagueIds.length
    ? await supabaseAdmin.from("competitions").select("league_id, name, slug, season, is_public, parent_league_id").in("league_id", leagueIds)
    : { data: [] as any[] };
  const parentIds = Array.from(new Set((leagues || []).filter((row: any) => !row.is_public && row.parent_league_id).map((row: any) => row.parent_league_id))) as string[];
  const { data: parentLeagues } = parentIds.length
    ? await supabaseAdmin.from("competitions").select("league_id, name, slug, season, is_public").in("league_id", parentIds)
    : { data: [] as any[] };
  const parentMap = new Map((parentLeagues || []).map((row: any) => [row.league_id, row]));
  const leagueMap = new Map((leagues || []).flatMap((row: any) => {
    const display = row.is_public ? row : parentMap.get(row.parent_league_id);
    return display?.is_public ? [[row.league_id, display] as [string, any]] : [];
  }));
  const publicStats = allStats.filter((row: any) => leagueMap.has(row.league_id));
  const offset = (pageNumber - 1) * GAME_PAGE_SIZE;
  const stats = publicStats.slice(offset, offset + GAME_PAGE_SIZE);
  if (pageNumber > 1 && stats.length === 0) return { notFound: true };
  const hasNextPage = pageNumber < MAX_GAME_LOG_PAGES && publicStats.length > offset + GAME_PAGE_SIZE;
  const gameKeys = Array.from(new Set(stats.map((row: any) => row.game_key).filter(Boolean))) as string[];
  const { data: schedules } = gameKeys.length
    ? await supabaseAdmin.from("game_schedule").select("game_key, matchtime, hometeam, awayteam, league_id").in("game_key", gameKeys)
    : { data: [] as any[] };
  const scheduleMap = new Map((schedules || []).map((row: any) => [row.game_key, row]));
  const currentLeague: any = leagueMap.get(stats[0]?.league_id || player.league_id);
  if (!currentLeague?.is_public) return {};
  const displayName = player.full_name || "Basketball player";
  const teamName = stats[0]?.team_name || player.team_name || "";
  const competitionName = currentLeague?.name || (stats[0] ? leagueMap.get(stats[0].league_id)?.name : "") || "";
  const canonicalPath = pageNumber > 1
    ? `/player/${encodeURIComponent(canonicalSlug)}/games/page/${pageNumber}`
    : `/player/${encodeURIComponent(canonicalSlug)}`;
  const gameRows = stats.map((stat: any) => {
    const schedule: any = scheduleMap.get(stat.game_key);
    const league: any = leagueMap.get(stat.league_id);
    const opponent = schedule
      ? (String(schedule.hometeam || "").toLowerCase() === String(stat.team_name || "").toLowerCase()
          ? schedule.awayteam
          : schedule.hometeam)
      : "Opponent unavailable";
    const gamePath = league?.slug && stat.game_key
      ? `/competition/${encodeURIComponent(league.slug)}/game/${encodeURIComponent(stat.game_key)}`
      : stat.game_key ? `/game/${encodeURIComponent(stat.game_key)}` : "";
    return `<li>
      ${gamePath ? `<a href="${gamePath}"><strong>${escapeHtml(stat.team_name || teamName)} vs ${escapeHtml(opponent)}</strong></a>` : `<strong>${escapeHtml(stat.team_name || teamName)} vs ${escapeHtml(opponent)}</strong>`}
      — ${escapeHtml(formatDate(schedule?.matchtime || stat.created_at))}: ${escapeHtml(statLine(stat))}
    </li>`;
  }).join("\n");
  const totals = stats.reduce((acc: any, stat: any) => ({
    points: acc.points + number(stat.spoints),
    rebounds: acc.rebounds + number(stat.sreboundstotal),
    assists: acc.assists + number(stat.sassists),
  }), { points: 0, rebounds: 0, assists: 0 });
  const games = stats.length;
  const avg = (value: number) => games ? (value / games).toFixed(1) : "0.0";
  const competitionLink = currentLeague?.slug
    ? `<a href="/competition/${encodeURIComponent(currentLeague.slug)}">${escapeHtml(competitionName)}</a>`
    : escapeHtml(competitionName);
  const teamPath = currentLeague?.slug && teamName
    ? `/competition/${encodeURIComponent(currentLeague.slug)}/team/${encodeURIComponent(teamName)}`
    : teamName ? `/team/${encodeURIComponent(teamName)}` : "";
  const previousPath = pageNumber === 2
    ? `/player/${encodeURIComponent(canonicalSlug)}`
    : `/player/${encodeURIComponent(canonicalSlug)}/games/page/${pageNumber - 1}`;
  const nextPath = `/player/${encodeURIComponent(canonicalSlug)}/games/page/${pageNumber + 1}`;
  const description = `${displayName} basketball statistics${competitionName ? ` for ${competitionName}` : ""}, including a game-by-game log, points, rebounds and assists.`;
  const body = `
    <nav><a href="/">Swish Assistant</a>${competitionName ? ` › ${competitionLink}` : ""}</nav>
    <article>
      <h1>${escapeHtml(displayName)} Stats &amp; Game Log</h1>
      <p>${teamPath ? `Team: <a href="${teamPath}">${escapeHtml(teamName)}</a>. ` : ""}${player.position ? `Position: ${escapeHtml(player.position)}. ` : ""}${competitionName ? `Competition: ${competitionLink}.` : ""}</p>
      <section aria-labelledby="player-summary"><h2 id="player-summary">Player statistics</h2>
        <p>${games} games on this page · ${avg(totals.points)} points · ${avg(totals.rebounds)} rebounds · ${avg(totals.assists)} assists per game.</p>
      </section>
      <section id="game-log" aria-labelledby="game-log-heading"><h2 id="game-log-heading">Historical game log</h2>
        ${gameRows ? `<ol>${gameRows}</ol>` : "<p>No public game log is available yet.</p>"}
        <nav aria-label="Game log pages">${pageNumber > 1 ? `<a rel="prev" href="${previousPath}">Newer games</a>` : ""}${pageNumber > 1 && hasNextPage ? " · " : ""}${hasNextPage ? `<a rel="next" href="${nextPath}">Older games</a>` : ""}</nav>
      </section>
    </article>`;
  const personUrl = canonicalUrl(`/player/${encodeURIComponent(canonicalSlug)}`);
  return {
    page: {
      title: `${displayName} Stats & Game Log${competitionName ? ` | ${competitionName}` : ""} | Swish Assistant`,
      description,
      canonicalPath,
      image: player.photo_path || player.photo_path_bg_removed,
      body,
      jsonLd: {
        "@context": "https://schema.org",
        "@graph": [
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
            affiliation: teamName ? { "@type": "SportsTeam", name: teamName } : undefined,
          },
        ],
      },
    },
  };
}

async function renderCompetition(slug: string): Promise<SeoPage | undefined> {
  const { data: competition } = await supabaseAdmin
    .from("competitions")
    .select("league_id, name, slug, season, description, logo_url, parent_league_id")
    .eq("slug", slug)
    .eq("is_public", true)
    .maybeSingle();
  if (!competition) return undefined;
  const { data: children } = await supabaseAdmin
    .from("competitions")
    .select("league_id")
    .eq("parent_league_id", competition.league_id);
  const leagueIds = Array.from(new Set([competition.league_id, ...(children || []).map((row: any) => row.league_id)]));
  const [{ data: participantStats }, { data: teams }, { data: games }] = await Promise.all([
    supabaseAdmin.from("player_stats").select("player_id, full_name, team_name, created_at").in("league_id", leagueIds).order("created_at", { ascending: false }).limit(1500),
    supabaseAdmin.from("teams").select("name").in("league_id", leagueIds).order("name").limit(100),
    supabaseAdmin.from("game_schedule").select("game_key, matchtime, hometeam, awayteam").in("league_id", leagueIds).order("matchtime", { ascending: false }).limit(30),
  ]);
  const participantIds = Array.from(new Set((participantStats || []).map((row: any) => row.player_id).filter(Boolean))) as string[];
  const { data: canonicalPlayers } = participantIds.length
    ? await supabaseAdmin.from("players").select("id, slug, full_name, team_name").in("id", participantIds)
    : { data: [] as any[] };
  const canonicalById = new Map((canonicalPlayers || []).map((row: any) => [row.id, row]));
  const players = (participantStats || []).map((stat: any) => canonicalById.get(stat.player_id) || {
    id: stat.player_id,
    slug: null,
    full_name: stat.full_name,
    team_name: stat.team_name,
  });
  const playerLinks = Array.from(new Map(players.map((p: any) => [canonicalPlayerSegment(p), p])).entries())
    .map(([segment, p]: [string, any]) => `<li><a href="/player/${encodeURIComponent(segment)}">${escapeHtml(p.full_name)}</a>${p.team_name ? ` — ${escapeHtml(p.team_name)}` : ""}</li>`).join("");
  const teamLinks = Array.from(new Set((teams || []).map((t: any) => t.name).filter(Boolean)))
    .map((name) => `<li><a href="/competition/${encodeURIComponent(slug)}/team/${encodeURIComponent(String(name))}">${escapeHtml(name)}</a></li>`).join("");
  const gameLinks = (games || []).filter((game: any) => game.game_key)
    .map((game: any) => `<li><a href="/competition/${encodeURIComponent(slug)}/game/${encodeURIComponent(game.game_key)}">${escapeHtml(game.hometeam)} vs ${escapeHtml(game.awayteam)}</a> — ${escapeHtml(formatDate(game.matchtime))}</li>`).join("");
  const description = competition.description || `Explore ${competition.name} teams, player statistics, results and public game logs.`;
  return {
    title: `${competition.name} Stats, Teams & Players | Swish Assistant`,
    description,
    canonicalPath: `/competition/${encodeURIComponent(slug)}`,
    image: competition.logo_url,
    body: `<nav><a href="/">Swish Assistant</a></nav><main><h1>${escapeHtml(competition.name)}</h1><p>${escapeHtml(description)}</p>
      <section><h2>Teams</h2><ul>${teamLinks || "<li>No public teams available yet.</li>"}</ul></section>
      <section><h2>Players</h2><ul>${playerLinks || "<li>No public players available yet.</li>"}</ul></section>
      <section><h2>Games and results</h2><ul>${gameLinks || "<li>No public games available yet.</li>"}</ul></section></main>`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: competition.name,
      url: canonicalUrl(`/competition/${encodeURIComponent(slug)}`),
      description,
    },
  };
}

async function renderTeam(teamSegment: string, competitionSlug?: string): Promise<SeoPage | undefined> {
  const decoded = decodeURIComponent(teamSegment).replace(/-/g, " ").trim();
  let leagueIds: string[] = [];
  let competition: any = null;
  if (competitionSlug) {
    const { data } = await supabaseAdmin
      .from("competitions")
      .select("league_id, name, slug")
      .eq("slug", competitionSlug)
      .eq("is_public", true)
      .maybeSingle();
    competition = data;
    if (!competition) return undefined;
    const { data: children } = await supabaseAdmin.from("competitions").select("league_id").eq("parent_league_id", competition.league_id);
    leagueIds = [competition.league_id, ...(children || []).map((row: any) => row.league_id)];
  } else {
    const { data: candidates } = await supabaseAdmin
      .from("teams")
      .select("name, league_id")
      .ilike("name", `%${decoded}%`)
      .limit(50);
    for (const candidate of (candidates || []).filter((row: any) => slugifyTeam(row.name || "") === slugifyTeam(decoded))) {
      const resolved = await resolvePublicCompetition(candidate.league_id);
      if (resolved) {
        competition = resolved;
        const { data: children } = await supabaseAdmin.from("competitions").select("league_id").eq("parent_league_id", resolved.league_id);
        leagueIds = [resolved.league_id, ...(children || []).map((row: any) => row.league_id)];
        break;
      }
    }
    if (!competition || !leagueIds.length) return undefined;
  }
  let statQuery = supabaseAdmin
    .from("player_stats")
    .select("player_id, league_id, team_name, full_name, spoints, sreboundstotal, sassists, game_key, created_at")
    .ilike("team_name", `%${decoded}%`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (leagueIds.length) statQuery = statQuery.in("league_id", leagueIds);
  const { data: rawStats } = await statQuery;
  const stats = (rawStats || []).filter((row: any) => slugifyTeam(row.team_name || "") === slugifyTeam(decoded));
  if (!stats.length) return undefined;
  const teamName = stats[0].team_name;
  const playerIds = Array.from(new Set(stats.map((row: any) => row.player_id).filter(Boolean))) as string[];
  const [{ data: playerRows }, { data: leagueRows }] = await Promise.all([
    playerIds.length ? supabaseAdmin.from("players").select("id, slug, full_name, position").in("id", playerIds) : Promise.resolve({ data: [] as any[] }),
    Promise.resolve({ data: null as any }),
  ]);
  if (!competition) competition = leagueRows;
  const playerMap = new Map((playerRows || []).map((row: any) => [row.id, row]));
  const roster = Array.from(new Set(stats.map((row: any) => row.player_id))).map((id: any) => {
    const canonical: any = playerMap.get(id);
    const imported = stats.find((row: any) => row.player_id === id);
    const name = canonical?.full_name || imported?.full_name || "Player";
    return canonical
      ? `<li><a href="/player/${encodeURIComponent(canonicalPlayerSegment(canonical))}">${escapeHtml(name)}</a>${canonical.position ? ` — ${escapeHtml(canonical.position)}` : ""}</li>`
      : `<li>${escapeHtml(name)}</li>`;
  }).join("");
  const games = Array.from(new Map(stats.filter((row: any) => row.game_key).map((row: any) => [row.game_key, row])).values()).slice(0, 20);
  const gameLinks = games.map((row: any) => {
    const href = competition?.slug
      ? `/competition/${encodeURIComponent(competition.slug)}/game/${encodeURIComponent(row.game_key)}`
      : `/game/${encodeURIComponent(row.game_key)}`;
    return `<li><a href="${href}">Game on ${escapeHtml(formatDate(row.created_at))}</a></li>`;
  }).join("");
  const canonicalPath = competition?.slug
    ? `/competition/${encodeURIComponent(competition.slug)}/team/${encodeURIComponent(teamName)}`
    : `/team/${encodeURIComponent(teamName)}`;
  const description = `${teamName} roster, player statistics, results and game history${competition?.name ? ` in ${competition.name}` : ""}.`;
  return {
    title: `${teamName} Roster & Stats${competition?.name ? ` | ${competition.name}` : ""} | Swish Assistant`,
    description,
    canonicalPath,
    body: `<nav><a href="/">Swish Assistant</a>${competition?.slug ? ` › <a href="/competition/${encodeURIComponent(competition.slug)}">${escapeHtml(competition.name)}</a>` : ""}</nav>
      <main><h1>${escapeHtml(teamName)} Roster &amp; Stats</h1><p>${escapeHtml(description)}</p>
      <section><h2>Team roster</h2><ul>${roster}</ul></section><section><h2>Games</h2><ul>${gameLinks || "<li>No public games available yet.</li>"}</ul></section></main>`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SportsTeam",
      name: teamName,
      url: canonicalUrl(canonicalPath),
      sport: "Basketball",
      member: (playerRows || []).slice(0, 50).map((row: any) => ({
        "@type": "Person",
        name: row.full_name,
        url: canonicalUrl(`/player/${encodeURIComponent(canonicalPlayerSegment(row))}`),
      })),
    },
  };
}

async function renderGame(gameKey: string, competitionSlug?: string): Promise<SeoPage | undefined> {
  const [{ data: schedule }, { data: playerStats }, { data: teamStats }] = await Promise.all([
    supabaseAdmin.from("game_schedule").select("game_key, matchtime, hometeam, awayteam, league_id").eq("game_key", gameKey).maybeSingle(),
    supabaseAdmin.from("player_stats").select("player_id, league_id, full_name, team_name, spoints, sreboundstotal, sassists").eq("game_key", gameKey).order("spoints", { ascending: false }),
    supabaseAdmin.from("team_stats").select("name, tot_sPoints, side").eq("game_key", gameKey),
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
  const [{ data: players }] = await Promise.all([
    ids.length
    ? await supabaseAdmin.from("players").select("id, slug, full_name").in("id", ids)
    : Promise.resolve({ data: [] as any[] }),
  ]);
  const playerMap = new Map((players || []).map((row: any) => [row.id, row]));
  const home = schedule?.hometeam || teamStats?.find((row: any) => String(row.side) === "1")?.name || "Home team";
  const away = schedule?.awayteam || teamStats?.find((row: any) => String(row.side) === "2")?.name || "Away team";
  const scoreByTeam = new Map((teamStats || []).map((row: any) => [row.name, number(row.tot_sPoints)]));
  const boxScore = (playerStats || []).map((row: any) => {
    const player: any = playerMap.get(row.player_id);
    const name = player?.full_name || row.full_name || "Player";
    return `<tr><td>${player ? `<a href="/player/${encodeURIComponent(canonicalPlayerSegment(player))}">${escapeHtml(name)}</a>` : escapeHtml(name)}</td><td>${escapeHtml(row.team_name)}</td><td>${number(row.spoints)}</td><td>${number(row.sreboundstotal)}</td><td>${number(row.sassists)}</td></tr>`;
  }).join("");
  const canonicalPath = competition?.slug
    ? `/competition/${encodeURIComponent(competition.slug)}/game/${encodeURIComponent(gameKey)}`
    : `/game/${encodeURIComponent(gameKey)}`;
  const titleText = `${home} vs ${away}`;
  const description = `${titleText} basketball box score on ${formatDate(schedule?.matchtime)}, with player points, rebounds and assists.`;
  return {
    title: `${titleText} Box Score${competition?.name ? ` | ${competition.name}` : ""} | Swish Assistant`,
    description,
    canonicalPath,
    body: `<nav><a href="/">Swish Assistant</a>${competition?.slug ? ` › <a href="/competition/${encodeURIComponent(competition.slug)}">${escapeHtml(competition.name)}</a>` : ""}</nav>
      <main><h1>${escapeHtml(titleText)}</h1><p>${escapeHtml(formatDate(schedule?.matchtime))}</p>
      <p><strong>${escapeHtml(home)} ${scoreByTeam.get(home) ?? ""} – ${scoreByTeam.get(away) ?? ""} ${escapeHtml(away)}</strong></p>
      <section><h2>Player box score</h2><table><thead><tr><th>Player</th><th>Team</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead><tbody>${boxScore}</tbody></table></section></main>`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: titleText,
      url: canonicalUrl(canonicalPath),
      startDate: schedule?.matchtime || undefined,
      sport: "Basketball",
      homeTeam: { "@type": "SportsTeam", name: home },
      awayTeam: { "@type": "SportsTeam", name: away },
    },
  };
}

export async function servePublicSeo(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const pathname = req.path.replace(/\/+$/, "") || "/";
  const playerMatch = pathname.match(/^\/player\/([^/]+)(?:\/games\/page\/(\d+))?$/i);
  const competitionGameMatch = pathname.match(/^\/competition\/([^/]+)\/game\/([^/]+)$/i);
  const competitionPlayerMatch = pathname.match(/^\/competition\/([^/]+)\/player\/([^/]+)$/i);
  const competitionLeadersMatch = pathname.match(/^\/competition-leaders\/([^/]+)$/i);
  const directGameMatch = pathname.match(/^\/game\/([^/]+)$/i);
  const competitionTeamMatch = pathname.match(/^\/competition\/([^/]+)\/team\/([^/]+)$/i);
  const teamMatch = pathname.match(/^\/team\/([^/]+)$/i);
  const competitionMatch = pathname.match(/^\/competition\/([^/]+)$/i);
  if (!playerMatch && !competitionGameMatch && !competitionPlayerMatch && !competitionLeadersMatch && !directGameMatch && !competitionTeamMatch && !teamMatch && !competitionMatch) return next();

  try {
    if (req.path.length > 1 && req.path.endsWith("/")) {
      return res.redirect(301, pathname);
    }
    if (competitionPlayerMatch) return res.redirect(301, `/player/${encodeURIComponent(decodeURIComponent(competitionPlayerMatch[2]))}`);
    if (competitionLeadersMatch) {
      const slug = decodeURIComponent(competitionLeadersMatch[1]);
      return res.redirect(301, `/competition/${encodeURIComponent(slug)}`);
    }
    let page: SeoPage | undefined;
    if (playerMatch) {
      const requestedPage = Number(playerMatch[2] || 1);
      if (playerMatch[2] && requestedPage === 1) return res.redirect(301, `/player/${encodeURIComponent(decodeURIComponent(playerMatch[1]))}`);
      if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > MAX_GAME_LOG_PAGES) return res.status(404).send("Player game-log page not found");
      const result = await renderPlayer(decodeURIComponent(playerMatch[1]), requestedPage);
      if (result.redirect) return res.redirect(301, result.redirect);
      if (result.notFound) return res.status(404).send("Player game-log page not found");
      page = result.page;
    } else if (competitionGameMatch) {
      page = await renderGame(decodeURIComponent(competitionGameMatch[2]), decodeURIComponent(competitionGameMatch[1]));
    } else if (directGameMatch) {
      page = await renderGame(decodeURIComponent(directGameMatch[1]));
      if (page && page.canonicalPath !== pathname) return res.redirect(301, page.canonicalPath);
    } else if (competitionTeamMatch) {
      page = await renderTeam(decodeURIComponent(competitionTeamMatch[2]), decodeURIComponent(competitionTeamMatch[1]));
    } else if (teamMatch) {
      page = await renderTeam(decodeURIComponent(teamMatch[1]));
      if (page && page.canonicalPath !== pathname) return res.redirect(301, page.canonicalPath);
    } else if (competitionMatch) {
      page = await renderCompetition(decodeURIComponent(competitionMatch[1]));
    }
    if (!page) return res.status(404).type("html").send("<!doctype html><html><head><title>Page not found</title><meta name=\"robots\" content=\"noindex\"></head><body><h1>Page not found</h1></body></html>");
    const html = injectSeo(await loadShell(), page);
    res.status(200).type("html").set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600").send(html);
  } catch (error) {
    console.error("Public SEO rendering failed:", error);
    next();
  }
}