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

  home_logo_url?: string;
  away_logo_url?: string;
  photo_url?: string;
};

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
