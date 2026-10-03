/**
 * Youth content is kept out of search engines: competitions that can include
 * under-18s, and every player, team and game in them, are noindexed and left
 * out of the sitemap and hub pages. The pages still work for visitors.
 *
 * Deliberately cautious — an open-age "16+" or "17+" event can include
 * 16- and 17-year-olds, so it counts as youth; "18+"/"19+" do not.
 */

/** "13U", "U16", "under 18" → 13/16/18; "16+" → 16 (minimum age); null if neither. */
function ageBound(text: string): { max?: number; min?: number } | null {
  const t = text.toLowerCase();
  const under = t.match(/\bu(?:nder)?\s?-?(\d{1,2})\b/) || t.match(/\b(\d{1,2})\s?u\b/);
  if (under) return { max: Number(under[1]) };
  const plus = t.match(/\b(\d{1,2})\s?\+/);
  if (plus) return { min: Number(plus[1]) };
  return null;
}

const YOUTH_WORDS = /\b(youth|junior|juniors|cadet|cadets|academy league|schools?|eabl|weabl|jnbl|u-?\d{2}s)\b/i;

export function isYouthCompetition(c: { name?: string | null; age_group?: string | null }): boolean {
  for (const text of [c.age_group, c.name]) {
    if (!text) continue;
    const bound = ageBound(text);
    if (bound?.max != null && bound.max <= 18) return true;
    if (bound?.min != null && bound.min < 18) return true;
    if (bound) return false; // an explicit adult bound ("18+", "19+") settles it
  }
  return YOUTH_WORDS.test(String(c.name || ""));
}

/** Under 18 today, from a date of birth (unverified counts: err towards hiding). */
export function isUnder18(dateOfBirth: string | null | undefined, now = new Date()): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;
  const eighteenth = new Date(dob);
  eighteenth.setFullYear(dob.getFullYear() + 18);
  return eighteenth > now;
}
