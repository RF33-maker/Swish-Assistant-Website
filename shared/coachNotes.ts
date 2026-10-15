/**
 * A coach's own context on an opponent, and the game windows a scouting report
 * can be read over. Shared by the site, its API and the PDF so the labels match.
 *
 * Notes are for what the numbers can't know: a shooter in a cold spell, a
 * player back from injury, a team that has changed how it plays. The scouting
 * agent is told to take them as true and to say where it has leaned on one.
 */

export const NOTE_KINDS = [
  { key: "stronger", label: "Better than the numbers show", hint: "e.g. normally a 40% shooter, cold start" },
  { key: "weaker", label: "Worse than the numbers show", hint: "e.g. one big night is flattering the average" },
  { key: "out", label: "Injured or not playing", hint: "plan without them" },
  { key: "changed", label: "New role or just joined", hint: "the games so far don't describe them" },
  { key: "other", label: "Other context", hint: "anything the data can't see" },
] as const;

export type NoteKind = (typeof NOTE_KINDS)[number]["key"];

export const NOTE_MAX = 600;

export function isNoteKind(value: unknown): value is NoteKind {
  return NOTE_KINDS.some((k) => k.key === value);
}

export function noteKindLabel(kind: NoteKind | null | undefined): string {
  return NOTE_KINDS.find((k) => k.key === kind)?.label ?? "Coach note";
}

export interface CoachNote {
  id: string;
  scope: "team" | "player";
  playerName: string | null;
  kind: NoteKind | null;
  note: string;
  updatedAt: string;
}

/** Trim, collapse stray whitespace and cap the length. Empty means "no note". */
export function cleanNote(text: unknown): string {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);
}

// ---------- windows ----------

export type ScoutWindow = "season" | "last5" | "last3";

export const WINDOWS: Array<{ key: ScoutWindow; label: string; games: number | null }> = [
  { key: "last3", label: "Last 3", games: 3 },
  { key: "last5", label: "Last 5", games: 5 },
  { key: "season", label: "Season", games: null },
];

export function parseWindow(value: unknown): ScoutWindow {
  return value === "last3" || value === "last5" ? value : "season";
}

/** How many of a club's newest games the window takes, or null for the whole season. */
export function windowGames(window: ScoutWindow): number | null {
  return WINDOWS.find((w) => w.key === window)?.games ?? null;
}

export function windowLabel(window: ScoutWindow): string {
  return window === "last3" ? "last 3 games" : window === "last5" ? "last 5 games" : "this season";
}
