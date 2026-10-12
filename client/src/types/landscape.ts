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
