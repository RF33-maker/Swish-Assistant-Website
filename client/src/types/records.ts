export type RecordCategory = {
  key: string;
  label: string;
  /** Card headline, e.g. "Most Points in a Game". */
  title: string;
  /** Unit tag, e.g. "PTS". */
  short: string;
};

/** One player's total in one game. */
export type GameRecord = {
  /** 1 for everyone who shares the record. */
  rank: number;
  id: string;
  name: string;
  team_name: string | null;
  team_id: string | null;
  league_id: string;
  game_key: string;
  game_date: string | null;
  opponent_name: string | null;
  /** "W 84-71" from the record holder's side. */
  game_result: string | null;
  value: number;
  photoUrl: string | null;
  photoFocusY: number | null;
};

export type RecordsResponse = {
  league: { name: string };
  category: RecordCategory;
  categories: RecordCategory[];
  gamesCounted: number;
  /** How many performances share the top total. */
  tiedForRecord: number;
  records: GameRecord[];
};
