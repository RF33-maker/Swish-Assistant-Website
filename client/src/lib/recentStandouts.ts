import { isCupCompetition, shortCompetition, type Storyline } from "@/lib/gameStorylines";

/**
 * "Last game" storylines for an upcoming game: a player who just had a big night.
 *
 * Unlike the ranking storylines these need no season of stats, so they work in
 * knockout cups, where most clubs don't record stats and a ranking would be
 * unfair. A player's last game can come from any competition (a league night
 * before a cup tie), and each storyline says which.
 */

export interface RecentGame {
  playerId: string;
  name: string;
  side: "home" | "away";
  /** The competition the game was played in. */
  leagueId: string;
  competition: string;
  /** ISO timestamp of the game. */
  date: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
}

interface Highlight {
  priority: number;
  /** "grabbed 18 rebounds" */
  phrase: string;
  /** "stl" etc. so the detail line can lead with the headline stat. */
  lead: "pts" | "reb" | "ast" | "stl" | "blk" | "dd" | "td";
}

const DAY_MS = 86_400_000;
/** A game older than this is no longer "last time out". */
export const RECENT_WINDOW_DAYS = 28;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** What, if anything, makes a stat line worth a storyline. */
export function highlightOf(g: Pick<RecentGame, "pts" | "reb" | "ast" | "stl" | "blk">): Highlight | null {
  const candidates: Highlight[] = [];
  const tens = [
    { key: "pts", n: g.pts, label: "points" },
    { key: "reb", n: g.reb, label: "rebounds" },
    { key: "ast", n: g.ast, label: "assists" },
    { key: "stl", n: g.stl, label: "steals" },
    { key: "blk", n: g.blk, label: "blocks" },
  ].filter((c) => c.n >= 10);
  if (tens.length >= 3) {
    const top = [...tens].sort((a, b) => b.n - a.n).slice(0, 3);
    candidates.push({ priority: 92, lead: "td", phrase: `posted a triple-double (${top.map((c) => `${c.n} ${c.label === "points" ? "pts" : c.label === "rebounds" ? "reb" : c.label === "assists" ? "ast" : c.label === "steals" ? "stl" : "blk"}`).join(", ")})` });
  } else if (tens.length === 2) {
    const top = [...tens].sort((a, b) => b.n - a.n);
    candidates.push({ priority: 72, lead: "dd", phrase: `posted a double-double (${top.map((c) => `${c.n} ${c.label}`).join(", ")})` });
  }
  const single = (lead: Highlight["lead"], n: number, tiers: [number, number][], verb: string, noun: string) => {
    const tier = tiers.find(([min]) => n >= min);
    if (tier) candidates.push({ priority: tier[1], lead, phrase: `${verb} ${plural(n, noun)}` });
  };
  single("pts", g.pts, [[30, 84], [25, 78], [20, 66]], "scored", "point");
  single("reb", g.reb, [[16, 82], [13, 74], [10, 60]], "grabbed", "rebound");
  single("ast", g.ast, [[12, 80], [9, 68], [7, 54]], "dished out", "assist");
  single("stl", g.stl, [[5, 72], [4, 62]], "picked up", "steal");
  single("blk", g.blk, [[5, 74], [4, 64]], "blocked", "shot");
  return candidates.sort((a, b) => b.priority - a.priority)[0] ?? null;
}

/** "Sat 17 Oct" for an ISO timestamp, read as the UK wall-clock digits the site stores. */
export function shortDate(iso: string): string {
  const day = iso.slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/**
 * A storyline for each player whose last game, or last game in this game's own competition,
 * was a standout from the last four weeks.
 */
export function recentStandouts(
  games: RecentGame[],
  opts: { gameTime: Date; currentLeagueId: string; currentCompetition?: string | null },
): Storyline[] {
  // A player's games can sit under several ids (re-imports, a competition's own record), so
  // they're grouped by name within a side.
  const byPlayer = new Map<string, RecentGame[]>();
  for (const g of games) {
    const key = `${g.side}:${g.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const list = byPlayer.get(key) ?? [];
    list.push(g);
    byPlayer.set(key, list);
  }
  const cutoff = opts.gameTime.getTime() - RECENT_WINDOW_DAYS * DAY_MS;
  const out: Storyline[] = [];

  byPlayer.forEach((list) => {
    const recent = list.filter((g) => Date.parse(g.date) >= cutoff && Date.parse(g.date) < opts.gameTime.getTime()).sort((a, b) => b.date.localeCompare(a.date));
    if (!recent.length) return;
    const last = recent[0];
    const lastHere = recent.find((g) => g.leagueId === opts.currentLeagueId);
    const picks: { game: RecentGame; inThisCompetition: boolean }[] = [{ game: last, inThisCompetition: false }];
    if (lastHere && lastHere !== last) picks.push({ game: lastHere, inThisCompetition: true });

    let best: { story: Storyline; priority: number } | null = null;
    for (const { game, inThisCompetition } of picks) {
      const h = highlightOf(game);
      if (!h) continue;
      const days = Math.max(0, (opts.gameTime.getTime() - Date.parse(game.date)) / DAY_MS);
      // A big night in the competition being played is the more relevant of two close ones.
      const priority = h.priority - days * 0.4 + (inThisCompetition ? 3 : 0);
      if (best && best.priority >= priority) continue;
      const comp = shortCompetition(game.competition) || game.competition;
      const cup = isCupCompetition(game.competition);
      const stats = [`${game.pts} PTS`, `${game.reb} REB`, `${game.ast} AST`];
      if (game.stl >= 3) stats.push(`${game.stl} STL`);
      if (game.blk >= 3) stats.push(`${game.blk} BLK`);
      best = {
        priority,
        story: {
          id: `recent-${game.side}-${game.name.toLowerCase().replace(/\s+/g, "-")}`,
          kind: "recent",
          side: game.side,
          eyebrow: inThisCompetition ? (cup ? "Last cup game" : `Last game in the ${comp}`) : "Last game",
          headline: inThisCompetition ? `${game.name} ${h.phrase} in the ${cup ? "cup" : comp}` : `${game.name} ${h.phrase} last time out`,
          detail: stats.join(" · "),
          scope: `${game.competition} · ${shortDate(game.date)}`,
          player: { name: game.name, playerIds: Array.from(new Set(list.map((g) => g.playerId))) },
          priority,
        },
      };
    }
    if (best) out.push(best.story);
  });
  return out;
}
