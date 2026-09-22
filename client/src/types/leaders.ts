export type LeaderCategory = {
  key: string;
  label: string;
  /** Card headline, e.g. "Points Per Game". */
  title: string;
  /** Unit tag, e.g. "PPG". */
  short: string;
  lowerIsBetter: boolean;
};

export type Leader = {
  rank: number;
  id: string;
  name: string;
  team_name: string | null;
  team_id: string | null;
  league_id: string;
  games: number;
  value: number;
  /** Formatted for the card: "27.4", "48.1%", "+12.3". */
  display: string;
  photoUrl: string | null;
  photoFocusY: number | null;
};

export type LeadersResponse = {
  league: { name: string };
  kind: "player" | "team";
  category: LeaderCategory;
  categories: LeaderCategory[];
  minGames: number;
  maxGames: number;
  gamesCounted: number;
  leaders: Leader[];
};
