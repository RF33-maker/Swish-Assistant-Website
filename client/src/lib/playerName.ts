export type PlayerNameSource = {
  full_name?: string | null;
  firstname?: string | null;
  familyname?: string | null;
  name?: string | null;
};

function cleanNamePart(value: string | null | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * Keeps the entered spelling/capitalisation, while presenting a one-letter
 * first name as an initial (for example "J Smith" becomes "J. Smith").
 */
export function formatPlayerDisplayName(value: string | null | undefined): string {
  const cleaned = cleanNamePart(value);
  if (!cleaned) return "";

  const parts = cleaned.split(" ");
  if (parts.length > 1 && /^[A-Za-z]$/.test(parts[0])) {
    parts[0] = `${parts[0].toUpperCase()}.`;
  }
  return parts.join(" ");
}

export function getImportedPlayerName(source: PlayerNameSource | null | undefined): string {
  if (!source) return "";

  const fullName = formatPlayerDisplayName(source.full_name);
  if (fullName) return fullName;

  const firstName = cleanNamePart(source.firstname);
  const familyName = cleanNamePart(source.familyname);
  const splitName = formatPlayerDisplayName([firstName, familyName].filter(Boolean).join(" "));
  if (splitName) return splitName;

  return formatPlayerDisplayName(source.name);
}

export function resolvePlayerDisplayName(
  source: PlayerNameSource | null | undefined,
  canonicalName?: string | null,
): string {
  return formatPlayerDisplayName(canonicalName) || getImportedPlayerName(source) || "Unknown Player";
}

function getInitialSurnameKey(value: string): string | null {
  const parts = formatPlayerDisplayName(value).split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  const first = parts[0].replace(/\./g, "").toLowerCase();
  const surname = parts[parts.length - 1].replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!first || !surname) return null;
  return `${first[0]}:${surname}`;
}

/**
 * Expands initial-only roster names only when the team's player records contain
 * exactly one matching full first name. This avoids guessing between players
 * such as John Smith and Jane Smith.
 */
export function buildUnambiguousFullNameAliases(values: Array<string | null | undefined>): Map<string, string> {
  const candidates = new Map<string, Set<string>>();

  for (const value of values) {
    const formatted = formatPlayerDisplayName(value);
    const parts = formatted.split(" ").filter(Boolean);
    const first = parts[0]?.replace(/\./g, "") || "";
    if (parts.length < 2 || first.length <= 1) continue;
    const key = getInitialSurnameKey(formatted);
    if (!key) continue;
    if (!candidates.has(key)) candidates.set(key, new Set());
    candidates.get(key)!.add(formatted);
  }

  const aliases = new Map<string, string>();
  for (const [key, names] of candidates) {
    if (names.size === 1) aliases.set(key, Array.from(names)[0]);
  }
  return aliases;
}

export function expandUnambiguousPlayerName(value: string, aliases: Map<string, string>): string {
  const formatted = formatPlayerDisplayName(value);
  const key = getInitialSurnameKey(formatted);
  if (!key) return formatted;
  return aliases.get(key) || formatted;
}