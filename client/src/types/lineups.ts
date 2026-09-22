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
