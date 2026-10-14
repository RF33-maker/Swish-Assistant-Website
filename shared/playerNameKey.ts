/**
 * One key per person, however the feed spelled them. Genius lists the same player as "Dzana Crnac"
 * in the box score and "D. Crnac" in the play-by-play, and the importer keeps a record for each
 * spelling, so anything that groups by player id sees two people. Grouping by this key instead
 * counts them once.
 *
 * Shared so the server's lineups and the Coaches Hub fold names the same way.
 */

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

// Letters that don't decompose into a base letter plus an accent.
const LETTER_FOLDS: Record<string, string> = {
  "þ": "th",
  "ð": "d",
  "æ": "ae",
  "œ": "oe",
  "ø": "o",
  "ł": "l",
  "đ": "d",
  "ß": "ss",
  "ı": "i",
};

/** "Þóranna" → "thoranna", "Magnúsdóttir" → "magnusdottir", "Łukasz" → "lukasz". */
export function foldName(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[þðæœøłđßı]/g, (c) => LETTER_FOLDS[c])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * "Ben Baker" / "B. Baker" / "Benedict Baker" all become "b baker", so a player who has more than
 * one record (a roster placeholder next to the full-name row) is counted once in a unit. Hyphens
 * and generational suffixes are ignored, so "Raheem May-Thompson" matches "R May Thompson" and
 * "Rodney Glasgow Jr" matches "R. Glasgow". Accents and Icelandic letters are folded first, so
 * "Þóranna Kika Hodge-Carr" matches "T. Hodge-Carr".
 */
export function playerNameKey(name: string | null | undefined): string {
  const parts = foldName(name)
    .replace(/[^a-z\s'-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  if (parts.length === 0) return "";
  return `${parts[0][0]} ${parts[parts.length - 1]}`;
}

/** True for roster placeholders like "D. Crnac" that are less complete than a full name. */
export function isInitialName(name: string | null | undefined): boolean {
  const first = (name || "").trim().split(/\s+/)[0]?.replace(/\./g, "") ?? "";
  return first.length <= 1;
}

/** The most complete spelling of one person: a full name over an initial, then the longer one. */
export function bestPlayerName(names: Iterable<string | null | undefined>): string {
  let best = "";
  for (const raw of Array.from(names)) {
    const name = (raw || "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const better =
      !best ||
      (isInitialName(best) && !isInitialName(name)) ||
      (isInitialName(best) === isInitialName(name) && name.length > best.length);
    if (better) best = name;
  }
  return best;
}

/**
 * One key for a five-man lineup, the same whichever spellings its players came in. Null when the
 * names can't identify five distinct people, so the caller keeps its own key for that row.
 */
export function canonicalLineupKey(teamId: string | null | undefined, names: readonly (string | null | undefined)[] | null | undefined): string | null {
  if (!names || names.length !== 5) return null;
  const keys = names.map((n) => playerNameKey(n));
  if (keys.some((k) => !k) || new Set(keys).size !== 5) return null;
  return `${teamId ?? ""}|${keys.slice().sort().join("|")}`;
}
