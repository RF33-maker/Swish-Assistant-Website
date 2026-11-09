export type WeeklyAward = {
  rank: number;
  player_id: string;
  league_id: string;
  slug: string | null;
  full_name: string;
  team_name: string | null;
  game_key: string | null;
  game_date: string | null;
  pts: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  tov: number | null;
  fgm: number | null;
  fga: number | null;
  tpm: number | null;
  tpa: number | null;
  ftm: number | null;
  fta: number | null;
  minutes: string | number | null;
  plus_minus: number | null;
  ts_pct: number | null;
  game_score: number | null;
  photoUrl: string | null;
  photoFocusY: number | null;
  /** A background-removed photo, when the player (or a same-name record) has one. */
  cutoutUrl: string | null;
  shirt: string | null;
  opponent_name: string | null;
  game_result: string | null;
  /** The player's season in this competition, for the stacked card's ladders. */
  season: WeeklySeasonLine | null;
};

export type WeeklySeasonLine = {
  games: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  total_pts: number;
  /** Where this game's Swish Score ranks among the player's games this season (1 = best). */
  score_rank: number;
};

export type WeeklyAwardsResponse = {
  league: { name: string };
  weekStart: string | null;
  weeks: string[];
  awards: WeeklyAward[];
};

export type WeeklyCardBrand = {
  leagueName: string;
  leagueLogoUrl?: string | null;
  primaryHex: string;
};
