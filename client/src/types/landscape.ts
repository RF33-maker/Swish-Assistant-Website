export type LandscapeMetricKey =
  | "ortg" | "drtg" | "net" | "pace" | "margin"
  | "efg" | "oppEfg" | "tovPct" | "forcedTovPct" | "orebPct" | "drebPct"
  | "threeRate" | "threePct" | "threeAttPg" | "threeMadePg"
  | "paintPpg" | "fastbreakPpg" | "offTovPpg" | "benchPpg";

/** A value is null when the competition's feed doesn't record that stat. */
export type LandscapeMetrics = Record<LandscapeMetricKey, number | null>;

export type LandscapeTeam = {
  id: string;
  name: string;
  team_id: string | null;
  league_id: string;
  games: number;
  metrics: LandscapeMetrics;
};

export type LandscapeResponse = {
  league: { name: string };
  /** The league's own figure for each metric: the middle of each axis. */
  averages: LandscapeMetrics;
  minGames: number;
  maxGames: number;
  gamesCounted: number;
  /** Pools / conferences entered as child competitions; empty when there is only one. */
  groups: { id: string; name: string }[];
  teams: LandscapeTeam[];
};

export type PlayerLandscapeMetricKey =
  | "ppg" | "rpg" | "orebPg" | "drebPg" | "apg" | "spg" | "bpg" | "tovPg" | "mpg"
  | "tsPct" | "efgPct" | "threePct" | "threeAttPg" | "astTo";

export type PlayerLandscapePlayer = {
  id: string;
  name: string;
  /** The player's profile address within the competition; null when there's no profile. */
  slug: string | null;
  team_id: string | null;
  team_name: string;
  league_id: string;
  games: number;
  /** A percentage is null when the player hasn't taken enough shots for it to mean anything. */
  metrics: Record<PlayerLandscapeMetricKey, number | null>;
};

export type PlayerLandscapeResponse = {
  league: { name: string };
  minGames: number;
  maxGames: number;
  /** Minutes a game a player needs to be plotted; null when the feed doesn't record minutes. */
  minMinutes: number | null;
  gamesCounted: number;
  players: PlayerLandscapePlayer[];
};
