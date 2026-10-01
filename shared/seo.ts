import { clubSlug } from "./teamIdentity";

/**
 * Titles, descriptions and indexing rules for public pages, shared by the
 * server-rendered HTML (server/publicSeo.ts) and the React app (Helmet).
 *
 * Google indexes the page after JavaScript runs, so the React app's head has
 * to be as specific as the server's; building both from here keeps them the
 * same string instead of the server saying one thing and React another.
 */

export const SITE_NAME = "Swish Assistant";
export const SITE_BASE = "https://swishassistant.com";

/**
 * Team names that are import placeholders rather than real clubs ("Team 3",
 * "18U Team", "19+ Team 1", "Coach:"). Pages built around them have nothing a
 * searcher would look for, so they stay out of the sitemap and are noindexed.
 */
const COLOURS = "black|white|red|blue|green|gold|diamond|silver|orange|purple|yellow|grey|gray|navy|pink";
const PLACEHOLDER_TEAM = new RegExp(
  // "Team", "Team 3", "14U Team", "18+ Team 2", "U16 Team", "Team A", "17+ Team Gold"
  `^((u\\s?\\d{1,2}|\\d{1,2}\\s?u|\\d{1,2}\\+)\\s+)?team(\\s+(\\d+|[a-z]|${COLOURS}))?$`,
  "i",
);

export function isPlaceholderTeamName(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim();
  if (n.length < 2 || /^\d+$/.test(n)) return true;
  // Labels the PDF parser picked up as names: "Coach:", "Coach: Sam Gilbert", "Quarter Starters:"
  if (/^(head\s+)?coach\b/i.test(n) || n.endsWith(":")) return true;
  if (/^(tbd|tba|unknown|home|away|opponent)$/i.test(n)) return true;
  // Pickup sides named only by a colour: "Gold", "black"
  if (new RegExp(`^(${COLOURS})$`, "i").test(n)) return true;
  return PLACEHOLDER_TEAM.test(n);
}

const one = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "0.0");

export interface PlayerSeoInput {
  name: string;
  team?: string | null;
  competition?: string | null;
  games?: number;
  ppg?: number;
  rpg?: number;
  apg?: number;
}

export function playerSeoTitle({ name, team }: PlayerSeoInput): string {
  const club = team && !isPlaceholderTeamName(team) ? ` – ${team}` : "";
  return `${name} Stats & Game Log${club} | ${SITE_NAME}`;
}

export function playerSeoDescription({ name, team, competition, games = 0, ppg = 0, rpg = 0, apg = 0 }: PlayerSeoInput): string {
  const club = team && !isPlaceholderTeamName(team) ? team : null;
  const where = [club && `plays for ${club}`, competition && `in ${competition}`].filter(Boolean).join(" ");
  const lead = where ? `${name} ${where}.` : `${name} basketball stats.`;
  if (!games) return `${lead} Profile, teams and competitions on ${SITE_NAME}.`;
  return `${lead} ${one(ppg)} points, ${one(rpg)} rebounds and ${one(apg)} assists per game across ${games} game${games === 1 ? "" : "s"}. Full game log, season averages and career highs.`;
}

export function teamSeoTitle(team: string, competition?: string | null): string {
  return `${team} Roster, Stats & Results${competition ? ` | ${competition}` : ""} | ${SITE_NAME}`;
}

export function teamSeoDescription(team: string, competition?: string | null): string {
  return `${team} roster, player stats, results and game history${competition ? ` in ${competition}` : ""}. Box scores and season leaders on ${SITE_NAME}.`;
}

export function competitionSeoTitle(name: string): string {
  return `${name} Stats, Standings, Teams & Players | ${SITE_NAME}`;
}

export function competitionSeoDescription(name: string, description?: string | null): string {
  return description?.trim() || `${name} standings, results, team stats, player stats and league leaders on ${SITE_NAME}.`;
}

// ── Canonical URLs ─────────────────────────────────────────────────────────
// Links built with these point straight at a page's canonical URL (no
// redirect hop), which is what search engines credit.

const slugifyName = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** A player's permanent page: their slug, or "name--<id>" when they have none. */
export function playerPath(player: { slug?: string | null; full_name?: string | null; name?: string | null; id?: string | null }): string | null {
  if (player.slug) return `/player/${encodeURIComponent(player.slug)}`;
  if (!player.id) return null;
  return `/player/${encodeURIComponent(`${slugifyName(player.full_name || player.name || "player") || "player"}--${player.id}`)}`;
}

/**
 * A team side's permanent page ("/team/bristol-flyers-ii"); pass the
 * competition to open it on that season. The canonical is always the bare URL.
 */
export function teamPath(teamName: string, competitionSlug?: string | null): string | null {
  const slug = clubSlug(teamName || "");
  if (!slug || isPlaceholderTeamName(teamName)) return null;
  return `/team/${slug}${competitionSlug ? `?competition=${encodeURIComponent(competitionSlug)}` : ""}`;
}

export function gamePath(competitionSlug: string | null | undefined, gameKey: string): string {
  return competitionSlug
    ? `/competition/${encodeURIComponent(competitionSlug)}/game/${encodeURIComponent(gameKey)}`
    : `/game/${encodeURIComponent(gameKey)}`;
}
