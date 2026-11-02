/**
 * Ask Swish — the protocol between the site and the assistant.
 *
 * The browser sends a conversation plus a scope (what page the user is on),
 * the server streams back Server-Sent Events: status lines while tools run,
 * cards as each tool returns, text as the model writes, then follow-ups and
 * navigation buttons. Everything here is plain JSON so both sides, and the
 * tests, share one definition.
 */

/** What the user is looking at when they ask. Pages set this; it steers the tools. */
export interface AskScope {
  /** The competition in view (a league page, a game's competition, the Coaches Hub pick). */
  leagueId?: string | null;
  leagueName?: string | null;
  leagueSlug?: string | null;
  /** A game page: lets "who's on court?" and "what happened in Q3?" resolve without naming it. */
  gameKey?: string | null;
  gameLabel?: string | null;
  /** A team or player page. */
  teamName?: string | null;
  playerName?: string | null;
  playerId?: string | null;
}

/** Where the panel is mounted. The Coaches Hub unlocks play-by-play and lineup tools. */
export type AskSurface = "site" | "coaches-hub" | "page";

export interface AskChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AskRequest {
  messages: AskChatMessage[];
  scope?: AskScope;
  surface?: AskSurface;
}

// ---------- cards ----------

export interface TableCard {
  kind: "table";
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number | null)[][];
  /** Column index to emphasise (the stat the question was about). */
  highlightCol?: number;
}

export interface StandingsCard {
  kind: "standings";
  title: string;
  rows: Array<{ rank: number; team: string; wins: number; losses: number; pct: string; pf?: number; pa?: number; last5?: string }>;
}

export interface LeaderboardCard {
  kind: "leaderboard";
  title: string;
  unit: string;
  rows: Array<{ rank: number; name: string; sub?: string; value: string }>;
}

export interface PlayerCard {
  kind: "playerCard";
  name: string;
  team: string;
  competition?: string;
  gamesPlayed: number;
  totals: Array<{ label: string; value: string }>;
  shooting: Array<{ label: string; made: number; attempted: number; pct: string }>;
}

export interface CompareCard {
  kind: "compare";
  title?: string;
  a: string;
  b: string;
  rows: Array<{ label: string; a: string; b: string; better?: "a" | "b" | null }>;
  footer?: string;
}

export interface ScoreGameRow {
  gameKey: string;
  leagueName?: string | null;
  leagueSlug?: string | null;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  /** "final" | "live" | "upcoming" */
  state: "final" | "live" | "upcoming";
  /** ISO tip-off. */
  matchTime: string | null;
  statusLabel?: string | null;
}

export interface ScoresCard {
  kind: "scores";
  title: string;
  games: ScoreGameRow[];
}

export interface GameCard {
  kind: "game";
  title: string;
  gameKey: string;
  leagueSlug?: string | null;
  home: { name: string; score: number | null; quarters: (number | null)[] };
  away: { name: string; score: number | null; quarters: (number | null)[] };
  state: "final" | "live" | "upcoming";
  matchTime: string | null;
  factors?: Array<{ label: string; home: string; away: string }>;
  leaders?: Array<{ team: string; name: string; line: string }>;
}

export type AskCard = TableCard | StandingsCard | LeaderboardCard | PlayerCard | CompareCard | ScoresCard | GameCard;

export interface AskNavButton {
  label: string;
  href: string;
  kind: "player" | "team" | "game" | "competition";
}

// ---------- stream events ----------

export type AskEvent =
  | { type: "status"; text: string }
  | { type: "card"; card: AskCard }
  | { type: "text"; delta: string }
  | { type: "nav"; buttons: AskNavButton[] }
  | { type: "followups"; questions: string[] }
  | { type: "done"; model: string; tier: "free" | "pro"; usage?: AskUsage; quota?: AskQuota }
  | { type: "error"; message: string; code?: "unauthenticated" | "rate_limited" | "unavailable" | "failed"; quota?: AskQuota };

/** How much of an account's allowance is used, and which window ran out. */
export interface AskQuota {
  tier: "free" | "pro";
  hour: { used: number; max: number };
  week: { used: number; max: number };
  month: { used: number; max: number };
  /** The window that is full, if any. */
  exhausted: "hour" | "week" | "month" | null;
  /** ISO time the exhausted window frees a slot. */
  resetAt: string | null;
}

/** Tokens over every model round of one answer, for cost tracking. */
export interface AskUsage {
  rounds: number;
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

/** Suggested questions for an empty panel, grouped so the UI can label them. */
export interface AskSuggestionGroup {
  label: string;
  questions: string[];
}
