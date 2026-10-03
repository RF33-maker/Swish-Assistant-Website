/**
 * Plain-English facts for player, team and game pages, written from the
 * numbers (no AI, so nothing can be invented or wrong). Search engines rank a
 * page partly on whether it reads as being *about* the player or team; a
 * page of bare numbers doesn't, and every stats site shows the same numbers.
 *
 * Shared by the server-rendered HTML and the React pages so both say the same.
 */

const one = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : "0.0");

function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const POSITIONS: Record<string, string> = {
  g: "guard", pg: "point guard", sg: "shooting guard", f: "forward", sf: "small forward", pf: "power forward",
  c: "centre", "g/f": "guard/forward", "f/c": "forward/centre", "f/g": "forward/guard", "c/f": "centre/forward",
};

function positionWord(position: string | null | undefined): string | null {
  const p = String(position || "").trim();
  if (!p) return null;
  return POSITIONS[p.toLowerCase()] || p.toLowerCase();
}

const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;

export interface PlayerBioInput {
  name: string;
  position?: string | null;
  team?: string | null;
  competition?: string | null;
  games?: number;
  ppg?: number;
  rpg?: number;
  apg?: number;
}

/** "Wickens Simba is a forward for Bristol Flyers II in BCB Trophy 2025-2026, averaging 3.7 points, …" */
export function playerBio({ name, position, team, competition, games = 0, ppg = 0, rpg = 0, apg = 0 }: PlayerBioInput): string {
  const role = positionWord(position);
  const where = [team && `for ${team}`, competition && `in ${competition}`].filter(Boolean).join(" ");
  let lead: string;
  if (role) lead = `${name} is ${withArticle(role)}${where ? ` ${where}` : ""}`;
  else if (team) lead = `${name} plays for ${team}${competition ? ` in ${competition}` : ""}`;
  else if (competition) lead = `${name} plays in ${competition}`;
  else lead = `${name} is a basketball player`;
  if (!games) return `${lead}.`;
  return `${lead}, averaging ${one(ppg)} points, ${one(rpg)} rebounds and ${one(apg)} assists across ${games} game${games === 1 ? "" : "s"}.`;
}

export interface TeamSummaryInput {
  team: string;
  competition?: string | null;
  wins?: number;
  losses?: number;
  ppg?: number | null;
  oppPpg?: number | null;
  topScorer?: { name: string; ppg: number } | null;
}

/** "Bristol Flyers II have a 12-8 record in BCB 2025-26, averaging 81.3 points and allowing 77.9. …" */
export function teamSeasonSummary({ team, competition, wins = 0, losses = 0, ppg, oppPpg, topScorer }: TeamSummaryInput): string {
  const played = wins + losses;
  const parts: string[] = [];
  if (played) {
    let s = `${team} have a ${wins}-${losses} record${competition ? ` in ${competition}` : ""}`;
    if (ppg != null && ppg > 0) s += `, averaging ${one(ppg)} points${oppPpg != null && oppPpg > 0 ? ` and allowing ${one(oppPpg)}` : ""} per game`;
    parts.push(`${s}.`);
  } else if (competition) {
    parts.push(`${team} play in ${competition}.`);
  }
  if (topScorer && topScorer.ppg > 0) parts.push(`${topScorer.name} leads the team with ${one(topScorer.ppg)} points per game.`);
  return parts.join(" ");
}

export interface GameRecapInput {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  competition?: string | null;
  date?: string | null;
  /** Points per quarter, in order. */
  quarters?: Array<{ home: number; away: number }>;
  topHome?: { name: string; pts: number; reb?: number; ast?: number } | null;
  topAway?: { name: string; pts: number; reb?: number; ast?: number } | null;
}

const ORD = ["first", "second", "third", "fourth"];
const statLine = (p: { pts: number; reb?: number; ast?: number }) => {
  const extra = [p.reb ? `${p.reb} rebounds` : null, p.ast ? `${p.ast} assists` : null].filter(Boolean);
  return `${p.pts} points${extra.length ? `, ${extra.join(" and ")}` : ""}`;
};

/** A three-or-four sentence recap of a finished game. */
export function gameRecap(g: GameRecapInput): string[] {
  const { home, away, homeScore, awayScore } = g;
  if (!(homeScore > 0 || awayScore > 0)) return [];
  const on = formatDay(g.date);
  const tail = `${g.competition ? ` in ${g.competition}` : ""}${on ? ` on ${on}` : ""}`;
  if (homeScore === awayScore) return [`${home} and ${away} finished level at ${homeScore}–${awayScore}${tail}.`];

  const homeWon = homeScore > awayScore;
  const [winner, loser] = homeWon ? [home, away] : [away, home];
  const [ws, ls] = homeWon ? [homeScore, awayScore] : [awayScore, homeScore];
  const margin = ws - ls;
  const verb = margin <= 3 ? "edged" : margin >= 20 ? "cruised past" : "beat";
  const lines = [`${winner} ${verb} ${loser} ${ws}–${ls}${homeWon ? " at home" : " on the road"}${tail}.`];

  const q = (g.quarters || []).filter((x) => x.home > 0 || x.away > 0);
  if (q.length >= 3) {
    const sideOf = (x: { home: number; away: number }) => (homeWon ? [x.home, x.away] : [x.away, x.home]);
    // Did the winner trail going into the last quarter?
    let w = 0, l = 0;
    q.slice(0, q.length - 1).forEach((x) => { const [a, b] = sideOf(x); w += a; l += b; });
    if (w < l) {
      lines.push(`${winner} trailed ${l}–${w} going into the final quarter before coming back.`);
    } else {
      // Otherwise, the quarter where the game was won.
      let best = -1, bestDiff = 0;
      q.forEach((x, i) => { const [a, b] = sideOf(x); if (a - b > bestDiff) { bestDiff = a - b; best = i; } });
      if (best >= 0 && bestDiff >= 5) {
        const [a, b] = sideOf(q[best]);
        lines.push(`They took control in the ${ORD[best] || `${best + 1}th`} quarter, winning it ${a}–${b}.`);
      }
    }
  }

  const topW = homeWon ? g.topHome : g.topAway;
  const topL = homeWon ? g.topAway : g.topHome;
  if (topW && topW.pts > 0) lines.push(`${topW.name} led ${winner} with ${statLine(topW)}.`);
  if (topL && topL.pts > 0) lines.push(`${topL.name} top-scored for ${loser} with ${topL.pts} points.`);
  return lines;
}
