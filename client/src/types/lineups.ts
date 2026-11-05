export type LineupPlayer = {
  key: string;
  id: string;
  name: string;
  photoUrl: string | null;
  photoFocusY: number | null;
};

export type LineupUnit = {
  rank: number;
  minutes: number | null;
  games: number;
  pf: number;
  pa: number;
  plusMinus: number;
  ortg: number | null;
  drtg: number | null;
  net: number | null;
  players: LineupPlayer[];
};

export type LineupMetric = "net" | "plusminus" | "minutes";

export type LineupsResponse = {
  league: { name: string; league_id: string };
  metric: LineupMetric;
  minMinutes: number;
  stintsUsed: number;
  stintsSkipped: number;
  reliability: { teamGames: number; reliable: number; onlyReliable: boolean };
  coverage: { games: number; used: number };
  teams: { team_id: string; name: string; units: number }[];
  team: { team_id: string; name: string } | null;
  units: LineupUnit[];
};

/** Swish+ lineup explorer: /api/league/:slug/lineups/explore */
export type ComboSize = 2 | 3 | 5;

export type LineupCombo = {
  /** Name keys of the people in it; look them up in `players`. */
  keys: string[];
  minutes: number | null;
  games: number;
  pf: number;
  pa: number;
  plusMinus: number;
  ortg: number | null;
  drtg: number | null;
  net: number | null;
  /** Four factors as percentages (eFG%, TOV%, OREB%, FT/FGA), for and against. */
  efg: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
  oppEfg: number | null;
  oppTovPct: number | null;
  oppOrebPct: number | null;
  oppFtRate: number | null;
};

export type LineupExploreResponse = {
  league: { name: string; league_id: string };
  team: { team_id: string; name: string } | null;
  size: ComboSize;
  minMinutes: number;
  coverage: { games: number; used: number };
  players: LineupPlayer[];
  units: LineupCombo[];
};
