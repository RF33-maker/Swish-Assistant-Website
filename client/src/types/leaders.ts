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
  /** What's behind the value, where it's built from others: "6.1 AST · 1.2 BAD PASSES". */
  detail?: string | null;
  photoUrl: string | null;
  photoFocusY: number | null;
};

export type LeadersResponse = {
  league: { name: string };
  kind: "player" | "team";
  category: LeaderCategory;
  categories: LeaderCategory[];
  minGames: number;
  /** Player percentage categories: the attempts needed to qualify (null otherwise). */
  minAttempts: number | null;
  maxGames: number;
  gamesCounted: number;
  leaders: Leader[];
};
