// Structured, typed shapes for League Assistant answers that are naturally
// tabular — rendered as real components instead of markdown text. See
// LeaderboardTable / StandingsTable / PlayerStatCard / TeamComparisonCard.

export interface LeaderboardRow {
  rank: number;
  name: string;
  sub?: string;
  value: string;
}

export interface LeaderboardContent {
  kind: 'leaderboard';
  title: string;
  unit: string;
  rows: LeaderboardRow[];
}

export interface StandingsRow {
  rank: number;
  team: string;
  wins: number;
  losses: number;
  pct: string;
}

export interface StandingsContent {
  kind: 'standings';
  title: string;
  rows: StandingsRow[];
}

export interface PlayerStatLine {
  label: string;
  value: string;
}

export interface PlayerShootingLine {
  label: string;
  made: number;
  attempted: number;
  pct: string;
}

export interface PlayerCardContent {
  kind: 'playerCard';
  name: string;
  team: string;
  gamesPlayed: number;
  totals: PlayerStatLine[];
  shooting: PlayerShootingLine[];
}

export interface ComparisonRow {
  label: string;
  a: string;
  b: string;
}

export interface ComparisonContent {
  kind: 'comparison';
  teamA: string;
  teamB: string;
  rows: ComparisonRow[];
  h2h?: (ComparisonRow & { winner?: string })[];
}

export interface GameLogRow {
  date: string;
  opponent: string;
  isHome?: boolean;
  pts: number;
  reb: number;
  ast: number;
  shootingLine?: string;
}

export interface GameLogContent {
  kind: 'gameLog';
  title: string;
  rows: GameLogRow[];
}

export type StructuredContent = LeaderboardContent | StandingsContent | PlayerCardContent | ComparisonContent | GameLogContent;
