import { normalizeTeamName } from "@/lib/teamUtils";
import { aggregateTeamStats } from "@/lib/teamStatsAggregate";
import type { PlayerSeasonAverage } from "@/lib/playerRankings";

/**
 * "Storylines" for an upcoming game: the league-wide accolades in play — the
 * league's top scorer, the No.1 offence meeting the No.1 defence, a winning
 * streak on the line — ranked so the most compelling few lead the preview.
 *
 * Player ranks use the same rule as the League Leaders page (anyone with a
 * game, ranked by per-game average) so "leads the league" always agrees with it.
 */

export type StorylineSide = "home" | "away" | "both";
export type StorylineKind = "player" | "team" | "matchup" | "standings" | "form" | "h2h";

export interface Storyline {
  id: string;
  kind: StorylineKind;
  side: StorylineSide;
  /** 1–3 earns a medal chip. */
  rank?: number;
  eyebrow: string;
  headline: string;
  detail: string;
  /** The player to link to, for player storylines. */
  player?: { name: string; playerIds: string[] };
  priority: number;
}

export interface StorylineTeamRow {
  team_id: string;
  name?: string | null;
  numeric_id?: string | null;
  game_key?: string | null;
  tot_spoints: number | null;
  [key: string]: unknown;
}

interface Input {
  homeTeam: string;
  awayTeam: string;
  homeId?: string | null;
  awayId?: string | null;
  /** Every team's per-game rows in the competition (team_stats). */
  teamRows: StorylineTeamRow[];
  /** League-wide player season averages (merged). */
  players: PlayerSeasonAverage[];
  /** "this season" / "last season" — the data the ranks come from. */
  seasonLabel: string;
  max?: number;
}

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const ordinal = (n: number) => ORDINAL[n] ?? `${n}th`;
const fmt = (v: number, d = 1) => v.toFixed(d);
const gamesNote = (n: number) => ` · ${n} game${n === 1 ? "" : "s"}`;

const PLAYER_CATEGORIES = [
  { key: "avg_pts", stat: "Points", unit: "PPG", verb: "scoring" },
  { key: "avg_reb", stat: "Rebounds", unit: "RPG", verb: "rebounding" },
  { key: "avg_ast", stat: "Assists", unit: "APG", verb: "assists" },
  { key: "avg_stl", stat: "Steals", unit: "SPG", verb: "steals" },
  { key: "avg_blk", stat: "Blocks", unit: "BPG", verb: "blocks" },
] as const;

interface TeamSeason {
  id: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  ppg: number;
  oppPpg: number;
  rpg: number;
  threePct: number;
  pace: number;
  offRating: number;
  defRating: number;
  netRating: number;
  /** Most recent first. */
  form: boolean[];
}

function buildTeamSeasons(rows: StorylineTeamRow[]): Map<string, TeamSeason> {
  const byTeam = new Map<string, StorylineTeamRow[]>();
  rows.forEach((r) => {
    if (!r.team_id) return;
    byTeam.set(r.team_id, [...(byTeam.get(r.team_id) || []), r]);
  });
  // The opponent's row in the same game, matched on game_key (or numeric_id).
  const gameOf = (r: StorylineTeamRow) => String(r.game_key || r.numeric_id || "");
  const byGame = new Map<string, StorylineTeamRow[]>();
  rows.forEach((r) => {
    const g = gameOf(r);
    if (g) byGame.set(g, [...(byGame.get(g) || []), r]);
  });

  const out = new Map<string, TeamSeason>();
  byTeam.forEach((teamRows, id) => {
    const name = String(teamRows[0]?.name || "");
    const agg = aggregateTeamStats(teamRows, name);
    if (!agg) return;
    const results = teamRows
      .map((r) => {
        const opp = (byGame.get(gameOf(r)) || []).find((o) => o.team_id !== id);
        if (!opp) return null;
        return { key: String(r.numeric_id || r.game_key || ""), pts: Number(r.tot_spoints || 0), opp: Number(opp.tot_spoints || 0) };
      })
      .filter((x): x is { key: string; pts: number; opp: number } => !!x)
      .sort((a, b) => b.key.localeCompare(a.key));
    out.set(id, {
      id,
      name,
      games: agg.games,
      wins: results.filter((r) => r.pts > r.opp).length,
      losses: results.filter((r) => r.pts < r.opp).length,
      ppg: Number(agg.ppg),
      oppPpg: results.length ? results.reduce((s, r) => s + r.opp, 0) / results.length : 0,
      rpg: Number(agg.rpg),
      threePct: Number(agg.threePercentage),
      pace: Number(agg.pace),
      offRating: Number(agg.offRating),
      defRating: Number(agg.defRating),
      netRating: Number(agg.netRating),
      form: results.map((r) => r.pts > r.opp),
    });
  });
  return out;
}

/** 1-based rank of `id` among `teams` by `value` (ties share the better rank). */
function rankOf(teams: TeamSeason[], id: string, value: (t: TeamSeason) => number, lowerIsBetter = false): number | null {
  const me = teams.find((t) => t.id === id);
  if (!me) return null;
  const mine = value(me);
  const better = teams.filter((t) => (lowerIsBetter ? value(t) < mine : value(t) > mine)).length;
  return better + 1;
}

function streakOf(form: boolean[]): { won: boolean; count: number } | null {
  if (!form.length) return null;
  let count = 0;
  while (count < form.length && form[count] === form[0]) count++;
  return { won: form[0], count };
}

export function buildGameStorylines({
  homeTeam, awayTeam, homeId, awayId, teamRows, players, seasonLabel, max = 6,
}: Input): Storyline[] {
  const stories: Storyline[] = [];
  const nameOf = { home: homeTeam, away: awayTeam } as const;
  const inSeason = seasonLabel === "this season" ? "" : ` (${seasonLabel})`;

  // ── Players ────────────────────────────────────────────────────────────
  const homeNorm = normalizeTeamName(homeTeam);
  const awayNorm = normalizeTeamName(awayTeam);
  const sideOfPlayer = (p: PlayerSeasonAverage): "home" | "away" | null => {
    if (homeId && p.team_id === homeId) return "home";
    if (awayId && p.team_id === awayId) return "away";
    const n = normalizeTeamName(p.team_name || "");
    if (n && n === homeNorm) return "home";
    if (n && n === awayNorm) return "away";
    return null;
  };
  const eligible = players.filter((p) => p.games_played >= 1);
  const topScorerBySide: Partial<Record<"home" | "away", { p: PlayerSeasonAverage; rank: number }>> = {};

  for (const cat of PLAYER_CATEGORIES) {
    const sorted = [...eligible].sort((a, b) => (b[cat.key] || 0) - (a[cat.key] || 0));
    sorted.slice(0, 5).forEach((p, i) => {
      const value = p[cat.key] || 0;
      if (value <= 0) return;
      // Ties share a rank, so two players on 20.0 PPG are both "No.1".
      const rank = sorted.findIndex((q) => (q[cat.key] || 0) === value) + 1;
      const side = sideOfPlayer(p);
      if (!side) return;
      if (cat.key === "avg_pts" && !topScorerBySide[side]) topScorerBySide[side] = { p, rank };
      if (rank > 3) return;
      const avg = `${fmt(value)} ${cat.unit}`;
      stories.push({
        id: `player-${cat.key}-${p.player_ids[0] || p.player_name}`,
        kind: "player",
        side,
        rank,
        eyebrow: rank === 1 ? `League leader · ${cat.stat}` : cat.stat,
        headline: rank === 1
          ? `${p.player_name} leads the league in ${cat.verb}`
          : `${p.player_name} ranks ${ordinal(rank)} in the league in ${cat.verb}`,
        detail: `${avg} for ${nameOf[side]}${gamesNote(p.games_played)}${inSeason}`,
        player: { name: p.player_name, playerIds: p.player_ids },
        priority: (rank === 1 ? 100 : rank === 2 ? 70 : 60) + (cat.key === "avg_pts" ? 5 : 0) - i * 0.01,
      });
    });
  }

  // Both sides bring a top-five scorer: a scoring duel.
  const hs = topScorerBySide.home;
  const as = topScorerBySide.away;
  if (hs && as && hs.rank <= 5 && as.rank <= 5) {
    stories.push({
      id: "matchup-scoring-duel",
      kind: "matchup",
      side: "both",
      eyebrow: "Scoring duel",
      headline: `${hs.p.player_name} vs ${as.p.player_name}`,
      detail: `${ordinal(hs.rank)} and ${ordinal(as.rank)} in the league in scoring: ${fmt(hs.p.avg_pts)} vs ${fmt(as.p.avg_pts)} PPG${inSeason}`,
      priority: 88,
    });
  }

  // ── Teams ──────────────────────────────────────────────────────────────
  const seasons = buildTeamSeasons(teamRows);
  const teams = Array.from(seasons.values()).filter((t) => t.games > 0);
  const resolveId = (id: string | null | undefined, name: string) =>
    (id && seasons.has(id) ? id : null) ??
    teams.find((t) => normalizeTeamName(t.name) === normalizeTeamName(name))?.id ?? null;
  const ids = { home: resolveId(homeId, homeTeam), away: resolveId(awayId, awayTeam) };

  if (teams.length >= 4) {
    // Ratings only when every team has them; otherwise points for / against.
    const hasRatings = teams.every((t) => t.offRating > 0 && t.defRating > 0);
    const offence = hasRatings
      ? { value: (t: TeamSeason) => t.offRating, show: (t: TeamSeason) => `${fmt(t.offRating)} offensive rating` }
      : { value: (t: TeamSeason) => t.ppg, show: (t: TeamSeason) => `${fmt(t.ppg)} points per game` };
    const defence = hasRatings
      ? { value: (t: TeamSeason) => t.defRating, show: (t: TeamSeason) => `${fmt(t.defRating)} defensive rating` }
      : { value: (t: TeamSeason) => t.oppPpg, show: (t: TeamSeason) => `${fmt(t.oppPpg)} points allowed per game` };

    const teamCats: {
      key: string; label: string; value: (t: TeamSeason) => number; show: (t: TeamSeason) => string;
      lower?: boolean; maxRank: number; headline: (team: string, rank: number) => string; base: number;
    }[] = [
      { key: "off", label: "Offence", ...offence, maxRank: 3, base: 80,
        headline: (team, r) => r === 1 ? `${team} have the league's best offence` : `${team} have the league's ${ordinal(r)}-best offence` },
      { key: "def", label: "Defence", ...defence, lower: true, maxRank: 3, base: 80,
        headline: (team, r) => r === 1 ? `${team} have the league's best defence` : `${team} have the league's ${ordinal(r)}-best defence` },
      ...(hasRatings ? [{ key: "net", label: "Net rating", value: (t: TeamSeason) => t.netRating, show: (t: TeamSeason) => `${t.netRating > 0 ? "+" : ""}${fmt(t.netRating)} net rating`, maxRank: 1, base: 76,
        headline: (team: string) => `${team} own the league's best net rating` }] : []),
      ...(teams.every((t) => t.pace > 0) ? [{ key: "pace", label: "Pace", value: (t: TeamSeason) => t.pace, show: (t: TeamSeason) => `${fmt(t.pace)} possessions per game`, maxRank: 1, base: 62,
        headline: (team: string) => `${team} play at the league's fastest pace` }] : []),
      { key: "3p", label: "Three-point shooting", value: (t) => t.threePct, show: (t) => `${fmt(t.threePct)}% from three`, maxRank: 1, base: 64,
        headline: (team) => `${team} are the league's best three-point shooting team` },
      { key: "reb", label: "Rebounding", value: (t) => t.rpg, show: (t) => `${fmt(t.rpg)} rebounds per game`, maxRank: 1, base: 60,
        headline: (team) => `${team} rule the glass` },
    ];

    const ranks: Record<string, Partial<Record<"home" | "away", number>>> = {};
    for (const cat of teamCats) {
      ranks[cat.key] = {};
      (["home", "away"] as const).forEach((side) => {
        const id = ids[side];
        if (!id) return;
        const rank = rankOf(teams, id, cat.value, cat.lower);
        if (!rank) return;
        ranks[cat.key][side] = rank;
        if (rank > cat.maxRank) return;
        const t = seasons.get(id)!;
        // A shared value isn't a distinction ("joint-best" of a tied league).
        if (teams.filter((o) => cat.value(o) === cat.value(t)).length > 1) return;
        stories.push({
          id: `team-${cat.key}-${side}`,
          kind: "team",
          side,
          rank,
          eyebrow: cat.label,
          headline: cat.headline(nameOf[side], rank),
          detail: `${cat.show(t)}${gamesNote(t.games)}${inSeason}`,
          priority: cat.base - (rank - 1) * 12,
        });
      });
    }

    // Strength on strength: a top-three offence against a top-three defence.
    (["home", "away"] as const).forEach((side) => {
      const other = side === "home" ? "away" : "home";
      const off = ranks.off?.[side];
      const def = ranks.def?.[other];
      if (off && def && off <= 3 && def <= 3) {
        const both1 = off === 1 && def === 1;
        stories.push({
          id: `matchup-off-def-${side}`,
          kind: "matchup",
          side: "both",
          eyebrow: both1 ? "Unstoppable force vs immovable object" : "Strength on strength",
          headline: `${both1 ? "No.1" : ordinal(off)} offence meets ${both1 ? "No.1" : ordinal(def)} defence`,
          detail: `${nameOf[side]}'s attack against ${nameOf[other]}'s defence${inSeason}`,
          priority: both1 ? 96 : 84 - (off + def),
        });
      }
    });

    // Standings: rank by win %, then wins.
    const table = [...teams].sort((a, b) => {
      const pa = a.wins / Math.max(1, a.wins + a.losses);
      const pb = b.wins / Math.max(1, b.wins + b.losses);
      return pb - pa || b.wins - a.wins;
    });
    const pos = (id: string | null) => (id ? table.findIndex((t) => t.id === id) + 1 : 0);
    const hp = pos(ids.home);
    const ap = pos(ids.away);
    if (hp && ap && Math.max(hp, ap) <= 4) {
      const [first, second] = hp < ap ? (["home", "away"] as const) : (["away", "home"] as const);
      stories.push({
        id: "standings-clash",
        kind: "standings",
        side: "both",
        eyebrow: Math.max(hp, ap) <= 2 ? "Top-of-the-table clash" : "Top-four clash",
        headline: `${ordinal(Math.min(hp, ap))} vs ${ordinal(Math.max(hp, ap))}`,
        detail: `${nameOf[first]} (${seasons.get(ids[first]!)!.wins}-${seasons.get(ids[first]!)!.losses}) take on ${nameOf[second]} (${seasons.get(ids[second]!)!.wins}-${seasons.get(ids[second]!)!.losses})${inSeason}`,
        priority: Math.max(hp, ap) <= 2 ? 92 : 78,
      });
    }
  }

  // ── Form ───────────────────────────────────────────────────────────────
  (["home", "away"] as const).forEach((side) => {
    const id = ids[side];
    const t = id ? seasons.get(id) : null;
    if (!t) return;
    const streak = streakOf(t.form);
    if (t.wins >= 3 && t.losses === 0) {
      stories.push({
        id: `form-unbeaten-${side}`, kind: "form", side,
        eyebrow: "Unbeaten",
        headline: `${nameOf[side]} are still perfect`,
        detail: `${t.wins}-0${inSeason}. Can anyone stop them?`,
        priority: 82,
      });
    } else if (streak && streak.won && streak.count >= 3) {
      stories.push({
        id: `form-streak-${side}`, kind: "form", side,
        eyebrow: `W${streak.count}`,
        headline: `${nameOf[side]} have won ${streak.count} straight`,
        detail: `Riding a ${streak.count}-game winning streak${inSeason}`,
        priority: 58 + streak.count * 3,
      });
    } else if (streak && !streak.won && streak.count >= 3) {
      stories.push({
        id: `form-skid-${side}`, kind: "form", side,
        eyebrow: `L${streak.count}`,
        headline: `${nameOf[side]} look to snap a ${streak.count}-game skid`,
        detail: `Without a win in their last ${streak.count}${inSeason}`,
        priority: 42 + streak.count,
      });
    }
  });

  // ── Last meeting ───────────────────────────────────────────────────────
  if (ids.home && ids.away) {
    const games = new Map<string, { home?: number; away?: number; key: string }>();
    teamRows.forEach((r) => {
      const g = String(r.game_key || r.numeric_id || "");
      if (!g || (r.team_id !== ids.home && r.team_id !== ids.away)) return;
      const entry = games.get(g) || { key: String(r.numeric_id || r.game_key || "") };
      if (r.team_id === ids.home) entry.home = Number(r.tot_spoints || 0);
      else entry.away = Number(r.tot_spoints || 0);
      games.set(g, entry);
    });
    const last = Array.from(games.values())
      .filter((g) => g.home != null && g.away != null)
      .sort((a, b) => b.key.localeCompare(a.key))[0];
    if (last) {
      const homeWon = (last.home as number) > (last.away as number);
      const winner = homeWon ? "home" : "away";
      const margin = Math.abs((last.home as number) - (last.away as number));
      stories.push({
        id: "h2h-last",
        kind: "h2h",
        side: winner,
        eyebrow: "Last meeting",
        headline: margin <= 5 ? `Last time it went down to the wire` : `${nameOf[winner]} won the last meeting`,
        detail: `${homeTeam} ${last.home} – ${last.away} ${awayTeam}${inSeason}`,
        priority: margin <= 5 ? 66 : 48,
      });
    }
  }

  // "No.1 offence meets No.1 defence" already tells the offence and defence
  // stories, so drop those two when it appears.
  (["home", "away"] as const).forEach((side) => {
    if (!stories.some((s) => s.id === `matchup-off-def-${side}`)) return;
    const other = side === "home" ? "away" : "home";
    for (let i = stories.length - 1; i >= 0; i--) {
      if (stories[i].id === `team-off-${side}` || stories[i].id === `team-def-${other}`) stories.splice(i, 1);
    }
  });

  // One storyline per player at most (their best), strongest first.
  const seenPlayer = new Set<string>();
  return stories
    .sort((a, b) => b.priority - a.priority)
    .filter((s) => {
      if (!s.player) return true;
      const key = s.player.playerIds[0] || s.player.name;
      if (seenPlayer.has(key)) return false;
      seenPlayer.add(key);
      return true;
    })
    .slice(0, max);
}
