export type PlayerPerformanceV1Data = {
  player_name: string;
  team_name: string;
  opponent_name: string;

  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;

  fg: string;
  three_pt: string;
  ft: string;
  turnovers: number;
  ts_percent: string;
  plus_minus: string;

  home_score: number;
  away_score: number;
  didWin: boolean;

  home_logo_url?: string;
  away_logo_url?: string;
  photo_url?: string;
  background_photo_url?: string;
  photo_focus_y?: number;
  photo_zoom?: number;
  photo_position_x?: number;
  photo_position_y?: number;
  league_name?: string;
  league_logo_url?: string;
  sponsor_logo_urls?: string[];
  /** Background-removed photo, when the player has one; the canvas styles stand it in front of the type. */
  cutout_photo_url?: string;
  /** "photo" uses the game photo even when a cut-out exists. */
  photo_mode?: "auto" | "photo";
  /** Accent colour of the canvas styles (#rrggbb); Swish orange when unset. */
  accent_hex?: string;
  game_date?: string;
  /** Where this game's points rank among the competition's games this season, for the Ranked style. */
  points_rank?: PerformanceRank;
};

/** One of the competition's best scoring games this season. */
export type PerformanceRankEntry = { rank: number; name: string; points: number; self: boolean };
export type PerformanceRank = { ordinal: number; top: PerformanceRankEntry[] };

export type SocialCardBase<T = unknown> = {
  id: string;
  template: string;
  card_type: string;
  data: T;
  image_url?: string | null;
  caption?: string | null;
};

export type PlayerPerformanceCard = SocialCardBase<PlayerPerformanceV1Data> & {
  card_type: "player_performance_v1";
};

export type SocialCard = PlayerPerformanceCard;

export type SocialCardRow = {
  id: string;
  league_id: string | null;
  template: string;
  data: any;
  image_url: string | null;
  caption: string | null;
  ready_to_post: boolean;
  posted: boolean;
  created_at: string;
};
