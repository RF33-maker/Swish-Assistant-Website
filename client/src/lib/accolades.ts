import type { RecordMaxes } from "@/lib/recordMaxes";

export type AccoladeTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'star';

export interface Accolade {
  tier: AccoladeTier;
  label: string;
  detail?: string;       // short chip subtitle
  description: string;   // full sentence shown in the expanded detail view
  value?: string;        // headline stat value, formatted
  unit?: string;         // stat/category label
  opponent?: string;     // set when tied to a specific game
  date?: string;         // ISO date, set when tied to a specific game
  gameKey?: string | null; // set when tied to a specific game (enables "View Game")
  seasonLabel?: string;   // which season this accolade is scoped to, or "All-time" —
                          // shown on the badge itself so a rank/record earned in a
                          // past season is never mistaken for a current-season one
}

interface StatHighLike {
  label: string; // 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | '3PM'
  value: number;
  opponent: string;
  date: string;
  gameKey?: string | null;
}

interface PlayerRankingsLike {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
}

interface SeasonStatRow {
  leagueId: string;
  gp: number;
  pts: number;
  reb: number;
  ast: number;
}

const formatShortDate = (iso: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

const RANK_MEDAL: Record<number, AccoladeTier> = { 1: 'gold', 2: 'silver', 3: 'bronze' };
const RANK_STAT_LABELS: { key: keyof PlayerRankingsLike; label: string }[] = [
  { key: 'points', label: 'Points' },
  { key: 'rebounds', label: 'Rebounds' },
  { key: 'assists', label: 'Assists' },
  { key: 'steals', label: 'Steals' },
  { key: 'blocks', label: 'Blocks' },
];

// Maps a StatHigh's `label` (PTS/REB/AST/STL/BLK/3PM) to the matching key in
// a RecordMaxes row, so a player/team's single-game best can be checked
// against the league's season/all-time max for that same stat.
const RECORD_KEY_BY_STAT_LABEL: Record<string, keyof RecordMaxes> = {
  PTS: 'pts', REB: 'reb', AST: 'ast', STL: 'stl', BLK: 'blk', '3PM': 'tpm',
};

// `competitionHighs` must be the player's best single-game marks scoped to
// the SAME league_id set that `allTimeMaxes` was queried against — not their
// unscoped career high, which could come from a different competition
// entirely and would otherwise false-positive a Diamond/Platinum medal.
function recordMedals(
  competitionHighs: StatHighLike[],
  seasonHighs: StatHighLike[],
  seasonMaxes: RecordMaxes,
  allTimeMaxes: RecordMaxes,
  seasonLabel: string,
): Accolade[] {
  const accolades: Accolade[] = [];
  for (const high of competitionHighs) {
    const key = RECORD_KEY_BY_STAT_LABEL[high.label];
    if (!key) continue;
    const allTimeMax = allTimeMaxes[key];
    const seasonHigh = seasonHighs.find(s => s.label === high.label);
    const seasonMax = seasonMaxes[key];
    if (allTimeMax > 0 && high.value >= allTimeMax) {
      accolades.push({
        tier: 'diamond',
        label: `${high.label} Record`,
        detail: `${high.value} vs ${high.opponent}`,
        description: `All-time competition record — ${high.value} ${high.label} in a single game, set on ${formatShortDate(high.date)} vs ${high.opponent}.`,
        value: `${high.value}`,
        unit: high.label,
        opponent: high.opponent,
        date: high.date,
        gameKey: high.gameKey ?? null,
        seasonLabel: 'All-time',
      });
    } else if (seasonHigh && seasonMax > 0 && seasonHigh.value >= seasonMax) {
      accolades.push({
        tier: 'platinum',
        label: `${high.label} Record`,
        detail: `${seasonHigh.value} vs ${seasonHigh.opponent}`,
        description: `Season record${seasonLabel ? ` for ${seasonLabel}` : ''} — ${seasonHigh.value} ${high.label} in a single game, set on ${formatShortDate(seasonHigh.date)} vs ${seasonHigh.opponent}.`,
        value: `${seasonHigh.value}`,
        unit: high.label,
        opponent: seasonHigh.opponent,
        date: seasonHigh.date,
        gameKey: seasonHigh.gameKey ?? null,
        seasonLabel: seasonLabel || 'This season',
      });
    }
  }
  return accolades;
}

export function computePlayerAccolades(
  seasonHighs: StatHighLike[],
  competitionHighs: StatHighLike[],
  careerStats: SeasonStatRow[],
  currentSeasonLeagueId: string | null,
  currentSeasonLabel: string,
  playerRankings: PlayerRankingsLike | null,
  seasonMaxes: RecordMaxes,
  allTimeMaxes: RecordMaxes,
): Accolade[] {
  const accolades: Accolade[] = [];

  if (playerRankings) {
    for (const { key, label } of RANK_STAT_LABELS) {
      const rank = playerRankings[key];
      const tier = RANK_MEDAL[rank];
      if (tier) {
        accolades.push({
          tier,
          label: `${label} Leader`,
          detail: `#${rank} in ${label}`,
          description: `Ranked #${rank} in ${label}${currentSeasonLabel ? ` for ${currentSeasonLabel}` : ' this season'}.`,
          value: `#${rank}`,
          unit: label,
          seasonLabel: currentSeasonLabel || 'This season',
        });
      }
    }
  }

  accolades.push(...recordMedals(competitionHighs, seasonHighs, seasonMaxes, allTimeMaxes, currentSeasonLabel));

  if (careerStats.length > 1 && currentSeasonLeagueId) {
    const current = careerStats.find(s => s.leagueId === currentSeasonLeagueId);
    if (current && current.gp > 0) {
      const currentAvgs = { PPG: current.pts / current.gp, RPG: current.reb / current.gp, APG: current.ast / current.gp };
      for (const [label, avg] of Object.entries(currentAvgs)) {
        const isBest = careerStats.every(s => {
          if (s.leagueId === currentSeasonLeagueId || s.gp === 0) return true;
          const otherAvg = label === 'PPG' ? s.pts / s.gp : label === 'RPG' ? s.reb / s.gp : s.ast / s.gp;
          return avg >= otherAvg;
        });
        if (isBest && avg > 0) {
          accolades.push({
            tier: 'star',
            label: `Best-Ever Season: ${label}`,
            detail: `${avg.toFixed(1)} ${label}`,
            description: `Averaging ${avg.toFixed(1)} ${label}${currentSeasonLabel ? ` in ${currentSeasonLabel}` : ' this season'} — the best of your ${careerStats.length} seasons on record.`,
            value: avg.toFixed(1),
            unit: label,
            seasonLabel: currentSeasonLabel || 'This season',
          });
        }
      }
    }
  }

  return accolades;
}

interface TeamGameLike {
  totalPoints: number;
  opponentScore?: number;
  isWin?: boolean;
  date: string;
  opponent?: string;
  game_key?: string | null;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  tpm?: number;
}

export function computeTeamAccolades(
  games: TeamGameLike[],
  seasonMaxes: RecordMaxes,
  seasonLabel?: string,
): Accolade[] {
  const accolades: Accolade[] = [];
  if (games.length === 0) return accolades;

  // No cross-season "brand" grouping exists on the team page (unlike the
  // player page's competitionParentMap), so teams only get the Season Record
  // tier for now, not an all-time Diamond — see accolades plan for why.
  const pickBestGame = (label: string, getter: (g: TeamGameLike) => number) => {
    const best = games.reduce((a, b) => (getter(b) > getter(a) ? b : a));
    const value = getter(best);
    if (value <= 0) return null;
    return { label, value, game: best };
  };

  const teamHighs = [
    pickBestGame('PTS', g => g.totalPoints || 0),
    games.some(g => g.reb !== undefined) ? pickBestGame('REB', g => g.reb || 0) : null,
    games.some(g => g.ast !== undefined) ? pickBestGame('AST', g => g.ast || 0) : null,
    games.some(g => g.stl !== undefined) ? pickBestGame('STL', g => g.stl || 0) : null,
    games.some(g => g.blk !== undefined) ? pickBestGame('BLK', g => g.blk || 0) : null,
    games.some(g => g.tpm !== undefined) ? pickBestGame('3PM', g => g.tpm || 0) : null,
  ].filter((x): x is { label: string; value: number; game: TeamGameLike } => x !== null);

  for (const high of teamHighs) {
    const key = RECORD_KEY_BY_STAT_LABEL[high.label];
    if (!key) continue;
    const seasonMax = seasonMaxes[key];
    if (seasonMax > 0 && high.value >= seasonMax) {
      const opponent = high.game.opponent || 'opponent';
      accolades.push({
        tier: 'platinum',
        label: `${high.label} Record`,
        detail: `${high.value} vs ${opponent}`,
        description: `Season record${seasonLabel ? ` for ${seasonLabel}` : ''} — ${high.value} team ${high.label} in a single game, set on ${formatShortDate(high.game.date)} vs ${opponent}.`,
        value: `${high.value}`,
        unit: high.label,
        opponent: high.game.opponent,
        date: high.game.date,
        gameKey: high.game.game_key ?? null,
        seasonLabel: seasonLabel || 'This season',
      });
    }
  }

  // Current win streak — most recent game first is not guaranteed, so sort explicitly.
  const sorted = [...games].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let streak = 0;
  for (const g of sorted) {
    if (g.isWin) streak++; else break;
  }
  if (streak >= 3) {
    const streakGames = sorted.slice(0, streak);
    const streakStart = streakGames[streakGames.length - 1];
    const streakEnd = streakGames[0];
    accolades.push({
      tier: 'star',
      label: `${streak}-Game Win Streak`,
      detail: `Since ${formatShortDate(streakStart.date)}`,
      description: `Won ${streak} straight games, from ${formatShortDate(streakStart.date)} to ${formatShortDate(streakEnd.date)}.`,
      value: `${streak}`,
      unit: 'Games',
      date: streakEnd.date,
      seasonLabel: seasonLabel || 'This season',
    });
  }

  const bestScoreGame = games.reduce((a, b) => ((b.totalPoints || 0) > (a.totalPoints || 0) ? b : a));
  if ((bestScoreGame.totalPoints || 0) > 0) {
    accolades.push({
      tier: 'star',
      label: 'Season-High Score',
      detail: `${bestScoreGame.totalPoints} points`,
      description: `Season-high ${bestScoreGame.totalPoints} points, scored on ${formatShortDate(bestScoreGame.date)}${bestScoreGame.opponent ? ` vs ${bestScoreGame.opponent}` : ''}.`,
      value: `${bestScoreGame.totalPoints}`,
      unit: 'PTS',
      opponent: bestScoreGame.opponent,
      date: bestScoreGame.date,
      gameKey: bestScoreGame.game_key ?? null,
      seasonLabel: seasonLabel || 'This season',
    });
  }

  const winsWithMargin = games
    .filter(g => g.isWin && g.opponentScore !== undefined)
    .map(g => ({ game: g, margin: g.totalPoints - (g.opponentScore as number) }));
  if (winsWithMargin.length > 0) {
    const biggest = winsWithMargin.reduce((a, b) => (b.margin > a.margin ? b : a));
    if (biggest.margin > 0) {
      accolades.push({
        tier: 'star',
        label: 'Biggest Win Margin',
        detail: `+${biggest.margin}`,
        description: `Biggest win of the season — beat ${biggest.game.opponent || 'their opponent'} by ${biggest.margin} points on ${formatShortDate(biggest.game.date)}.`,
        value: `+${biggest.margin}`,
        unit: 'Margin',
        opponent: biggest.game.opponent,
        date: biggest.game.date,
        gameKey: biggest.game.game_key ?? null,
        seasonLabel: seasonLabel || 'This season',
      });
    }
  }

  return accolades;
}

const TIER_PRIORITY: Record<AccoladeTier, number> = {
  diamond: 0,
  platinum: 1,
  gold: 2,
  silver: 3,
  bronze: 4,
  star: 5,
};

// Highest-prestige accolades first, for a condensed "top N" preview strip
// (e.g. on an Overview tab) separate from the full badge list.
export function topAccolades(accolades: Accolade[], count = 3): Accolade[] {
  return [...accolades].sort((a, b) => TIER_PRIORITY[a.tier] - TIER_PRIORITY[b.tier]).slice(0, count);
}
