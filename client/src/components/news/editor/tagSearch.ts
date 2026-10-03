import { supabase } from "@/lib/supabase";
import { areSamePlayer } from "@/hooks/useGlobalSearch";
import { clubDisplayName, clubSlug } from "@shared/teamIdentity";
import { isPlaceholderTeamName } from "@shared/seo";
import type { ArticleTag } from "@shared/newsArticle";

/**
 * Finding things to tag an article with, and games to embed in it. Everything
 * is read with the visitor's own access, so only publicly visible leagues,
 * teams, players and games can be picked.
 */

export interface PickedGame {
  gameKey: string;
  home: string;
  away: string;
  matchtime: string;
  status: string | null;
  competitionName: string;
  competitionSlug: string;
  /** The league brand the competition belongs to, when it has one. */
  league: { slug: string; name: string } | null;
}

/** A tag candidate plus a line of context for the results list ("Reading Rockets · BCB 2025-26"). */
export interface TagCandidate {
  tag: ArticleTag;
  detail?: string;
  /** Set for game results, so picking one can tag its competition and teams too. */
  game?: PickedGame;
}

// PostgREST reads commas, brackets and wildcards in a filter as syntax.
const cleanTerm = (query: string) => query.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatGameDate(matchtime: string): string {
  // Tip-off times are stored as UK clock time labelled UTC, so read them back in UTC.
  return new Date(matchtime).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const isUpcoming = (game: PickedGame) => new Date(game.matchtime).getTime() > Date.now();

/**
 * Games matching a team name, nearest to today first. With no search term,
 * the games around now: the last ten days of results and the coming week.
 */
export async function searchGames(query: string): Promise<PickedGame[]> {
  const term = cleanTerm(query);
  const now = Date.now();
  let q = supabase
    .from("game_schedule")
    .select("game_key, league_id, matchtime, hometeam, awayteam, status, competitionname")
    .not("matchtime", "is", null)
    .not("league_id", "is", null);
  if (term) {
    q = q.or(`hometeam.ilike."%${term}%",awayteam.ilike."%${term}%"`).lte("matchtime", new Date(now + 60 * DAY_MS).toISOString());
  } else {
    q = q.gte("matchtime", new Date(now - 10 * DAY_MS).toISOString()).lte("matchtime", new Date(now + 7 * DAY_MS).toISOString());
  }
  const { data: games, error } = await q.order("matchtime", { ascending: false }).limit(80);
  if (error) throw error;
  if (!games?.length) return [];

  // The schedule is readable for every competition; competitions only for
  // public ones, which is what filters private games out here.
  const leagueIds = Array.from(new Set(games.map((g) => g.league_id as string)));
  const { data: competitions } = await supabase
    .from("competitions")
    .select("league_id, slug, name, leagues:competition_id(slug, name)")
    .in("league_id", leagueIds);
  const byId = new Map((competitions ?? []).map((c: any) => [c.league_id as string, c]));

  return games
    .flatMap((g): PickedGame[] => {
      const competition = byId.get(g.league_id as string);
      if (!competition?.slug || isPlaceholderTeamName(g.hometeam) || isPlaceholderTeamName(g.awayteam)) return [];
      const league = Array.isArray(competition.leagues) ? competition.leagues[0] : competition.leagues;
      return [
        {
          gameKey: g.game_key,
          home: g.hometeam,
          away: g.awayteam,
          matchtime: g.matchtime,
          status: g.status,
          competitionName: competition.name || g.competitionname || "",
          competitionSlug: competition.slug,
          league: league?.slug ? { slug: league.slug, name: league.name } : null,
        },
      ];
    })
    .sort((a, b) => Math.abs(new Date(a.matchtime).getTime() - now) - Math.abs(new Date(b.matchtime).getTime() - now))
    .slice(0, 30);
}

export function gameTag(game: PickedGame): ArticleTag {
  return {
    kind: "game",
    key: game.gameKey,
    label: `${clubDisplayName(game.home)} v ${clubDisplayName(game.away)}`,
    context: { competition_slug: game.competitionSlug, matchtime: game.matchtime },
  };
}

function teamTag(name: string, competitionSlug?: string): ArticleTag {
  return {
    kind: "team",
    key: clubSlug(name),
    label: clubDisplayName(name),
    context: competitionSlug ? { competition_slug: competitionSlug } : null,
  };
}

/** Everything a game is about: the game itself, its league and competition, and both teams. */
export function tagsForGame(game: PickedGame): ArticleTag[] {
  return [
    ...(game.league ? [{ kind: "league", key: game.league.slug, label: game.league.name } satisfies ArticleTag] : []),
    { kind: "competition", key: game.competitionSlug, label: game.competitionName },
    gameTag(game),
    teamTag(game.home, game.competitionSlug),
    teamTag(game.away, game.competitionSlug),
  ];
}

/** Adds tags that aren't already there, keeping the existing order. */
export function mergeTags(existing: ArticleTag[], added: ArticleTag[]): ArticleTag[] {
  const seen = new Set(existing.map((t) => `${t.kind}:${t.key}`));
  return [...existing, ...added.filter((t) => t.key && !seen.has(`${t.kind}:${t.key}`) && seen.add(`${t.kind}:${t.key}`))];
}

export async function searchTagCandidates(query: string): Promise<TagCandidate[]> {
  const term = cleanTerm(query);
  if (term.length < 2) return [];
  const like = `%${term}%`;

  const [leagues, competitions, teams, players, games] = await Promise.all([
    supabase.from("leagues").select("name, slug").ilike("name", like).limit(5),
    supabase.from("competitions").select("name, slug").ilike("name", like).eq("is_public", true).order("created_at", { ascending: false }).limit(6),
    supabase.from("teams").select("name, competitions:league_id(name, is_public)").ilike("name", like).limit(40),
    supabase.from("players").select("id, full_name, slug, team_name").ilike("full_name", like).limit(40),
    searchGames(term).catch(() => [] as PickedGame[]),
  ]);

  const candidates: TagCandidate[] = [];
  for (const l of (leagues.data as any[]) ?? []) {
    if (l.slug) candidates.push({ tag: { kind: "league", key: l.slug, label: l.name } });
  }
  for (const c of (competitions.data as any[]) ?? []) {
    if (c.slug) candidates.push({ tag: { kind: "competition", key: c.slug, label: c.name } });
  }

  // A club has one row per competition: show it once, at its permanent page.
  const clubs = new Map<string, TagCandidate>();
  for (const t of (teams.data as any[]) ?? []) {
    const competition = Array.isArray(t.competitions) ? t.competitions[0] : t.competitions;
    if (competition?.is_public === false || isPlaceholderTeamName(t.name)) continue;
    const tag = teamTag(t.name);
    if (tag.key && !clubs.has(tag.key)) clubs.set(tag.key, { tag });
  }
  candidates.push(...Array.from(clubs.values()).slice(0, 6));

  // The same goes for players: one result per person, preferring a row with a slug.
  const people: Array<{ id: string; full_name: string; slug: string | null; team_name: string | null }> = [];
  for (const p of ((players.data as any[]) ?? []).sort((a, b) => Number(!!b.slug) - Number(!!a.slug))) {
    const same = people.find((x) => (p.slug && x.slug === p.slug) || areSamePlayer(x.full_name, p.full_name));
    if (!same) people.push(p);
  }
  for (const p of people.slice(0, 6)) {
    candidates.push({
      tag: { kind: "player", key: p.slug || String(p.id), label: p.full_name },
      detail: p.team_name ? clubDisplayName(p.team_name) : undefined,
    });
  }

  for (const game of games.slice(0, 6)) {
    candidates.push({ tag: gameTag(game), detail: `${formatGameDate(game.matchtime)} · ${game.competitionName}`, game });
  }
  return candidates;
}
