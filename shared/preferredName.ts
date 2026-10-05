// Rules for a player's preferred name, shared by the server (which enforces
// them) and the profile form (which shows the problem before submitting).

export const PREFERRED_NAME_MAX = 120;

// Built with the constructor: the project's TS target predates the /u flag, though browsers and Node have it.
const NAME_CHARS = new RegExp("^[\\p{L}][\\p{L}\\p{M}.'’\\- ]*$", "u");

export type PreferredNameCheck = { ok: true; name: string } | { ok: false; error: string };

/** "  milo   wallace " -> "milo wallace". */
export function tidyName(value: string): string {
  return (value || "").replace(/\s+/g, " ").trim();
}

/**
 * A real first name (or initial) and a surname: letters, spaces and . ' ’ -
 * only, so a name can't be a link, a number or a sentence.
 */
export function checkPreferredName(raw: string): PreferredNameCheck {
  const name = tidyName(raw);
  if (!name) return { ok: false, error: "Enter a name." };
  if (name.length > PREFERRED_NAME_MAX) return { ok: false, error: `Use ${PREFERRED_NAME_MAX} characters or fewer.` };
  if (!NAME_CHARS.test(name)) {
    return { ok: false, error: "Names can only contain letters, spaces, full stops, apostrophes and hyphens." };
  }
  const parts = name.split(" ");
  if (parts.length < 2) return { ok: false, error: "Enter a first name and a surname." };
  if (parts.length > 6) return { ok: false, error: "That's too many words for a name." };
  const surname = parts[parts.length - 1].replace(/[.'’-]/g, "");
  if (surname.length < 2) return { ok: false, error: "Enter a full surname." };
  return { ok: true, name };
}

/** "Milo Wallace" -> first "Milo", family "Wallace"; the family name is the last word. */
export function splitName(name: string): { firstname: string; familyname: string } {
  const parts = tidyName(name).split(" ");
  return { firstname: parts.slice(0, -1).join(" "), familyname: parts[parts.length - 1] };
}

export const sameName = (a: string, b: string) => tidyName(a).toLowerCase() === tidyName(b).toLowerCase();
