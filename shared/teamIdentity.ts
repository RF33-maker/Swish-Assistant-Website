/**
 * Which imported team names are the same club side, and the one readable URL
 * slug that side's permanent team page lives at.
 *
 * Moved from server/teamIdentityService.ts (which re-exports these) so the
 * React app builds team links with exactly the same rules the server uses to
 * group a club's competitions and canonicalise its page.
 */

const ALIASES: Record<string, string> = {
  mkbreakers: "miltonkeynesbreakers",
  bath: "bathbasketball",
  diawysctempo: "diawysc",
};

/**
 * Old names of today's clubs, as the feed spelt them in those seasons. The stored rows keep the
 * old name (a 2019 box score still reads "Glasgow Rocks"), but the club's page, records and
 * history group them under today's side. Matched on the whole name, not the normalised key,
 * so "Sheffield Sharks" (the BBL side in 2015-16) joins B. Braun Sheffield Sharks while NBL's
 * "Sheffield Sharks Senior Men" stays its own side; and a women's competition's side is named
 * "... Women" (sideName), so none of these reach the women's teams.
 */
const FORMER_NAMES: Array<[stored: string, today: string]> = [
  ["Glasgow Rocks", "caledoniagladiators"],
  ["Radisson Red Glasgow Rocks", "caledoniagladiators"],
  ["Glen Luss Glasgow Rocks", "caledoniagladiators"],
  ["Surrey Scorchers", "surrey89ers"],
  ["Manchester Giants", "manchesterbasketball"],
  ["Esh Group Eagles Newcastle", "newcastleeagles"],
  ["Seriös Group Newcastle Eagles", "newcastleeagles"],
  ["DBL Sharks Sheffield", "bbraunsheffieldsharks"],
  ["Sheffield Sharks", "bbraunsheffieldsharks"],
  ["Plymouth University Raiders", "plymouthraiders"],
];

function formerNameKey(name: string): string {
  return (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const FORMER_KEY = new Map(FORMER_NAMES.map(([stored, today]) => [formerNameKey(stored), today]));

/** True for a club's old name (see FORMER_NAMES): grouped with today's side, never its page title. */
export function isFormerName(name: string): boolean {
  return FORMER_KEY.has(formerNameKey(name));
}

/** The old names that group with this club side, spelt as stored ("Glasgow Rocks" for Caledonia Gladiators). */
export function formerNamesOf(name: string): string[] {
  const key = identityKey(name);
  return FORMER_NAMES.filter(([, today]) => today === key).map(([stored]) => stored);
}

export function identityKey(name: string): string {
  const former = FORMER_KEY.get(formerNameKey(name));
  if (former) return former;
  const normalized = (name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+Senior\s+(Men|Women)\s*/gi, " ")
    .replace(/!/g, "")
    .replace(/^#+/, "")
    .replace(/\s+I(?![IVX])\s*$/i, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return ALIASES[normalized] || normalized;
}

export function teamLevel(name: string): string {
  const value = (name || "").toLowerCase();
  const age = value.match(/\b(u(?:nder)?\s*\d{2}|\d{2}u)\b/)?.[0]?.replace(/\s+/g, "") || "";
  const reserve = value.match(/\b(ii|iii|iv|2|3|reserves?|development)\b/)?.[0] || "";
  const gender = value.match(/\b(women|women's|ladies|men|men's)\b/)?.[0] || "";
  return `${age}|${reserve}|${gender}`;
}

/**
 * A women's competition's team, named the way the NBL's women's sides already are
 * ("Barking Abbey Senior Women"): with "Women" in the name. Plain feeds ("London Lions" in
 * both the men's and the women's SLB) otherwise read as one club, and the men's and women's
 * games land on one team page. `gender` is the competition's gender, "Women" for those.
 *
 * Only identity rules should see this name — grouping, slugs, the page title. Queries against
 * the stored rows keep using the name as the feed spells it.
 */
export function sideName(name: string, gender?: string | null): string {
  const base = (name || "").trim();
  if (!base || !/^women/i.test((gender || "").trim())) return base;
  return /\b(women|women's|ladies)\b/i.test(base) ? base : `${base} Women`;
}

/** A club's name as the feed spells it: "London Lions Women" back to "London Lions". */
export function feedName(sided: string): string {
  return (sided || "").replace(/\s+Women$/i, "").trim() || sided;
}

// One key per club side, so names can be grouped rather than compared in
// pairs: teamClubKey(a) === teamClubKey(b) exactly when isSameTeam(a, b).
export function teamClubKey(name: string): string {
  return `${identityKey(name)}|${teamLevel((name || "").replace(/\s+Senior\s+Men\b/gi, " "))}`;
}

// True when two imported names are the same club side across competitions,
// e.g. NBL's "Gloucester City Kings Senior Men I" and BCB's "Gloucester City
// Kings". "Senior Men" is the default side, so it is dropped before comparing
// levels — otherwise its "men" reads as a gender and splits the club — while
// "Women", age groups and reserve sides (II, III) still stay separate.
export function isSameTeam(a: string, b: string): boolean {
  return teamClubKey(a) === teamClubKey(b);
}

/**
 * The name people search for: NBL/WNBL import suffixes dropped ("Gloucester
 * City Kings Senior Men I" → "Gloucester City Kings", "London Cavaliers Senior
 * Women I" → "London Cavaliers Women"), everything else as imported.
 */
export function clubDisplayName(name: string): string {
  return (name || "")
    .trim()
    .replace(/^#+\s*/, "")
    .replace(/\s+Senior\s+Men(\s+I)?$/i, "")
    .replace(/\s+Senior\s+Women(\s+I)?$/i, " Women")
    .replace(/\s+I$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Readable URL slug for a team side: "Bristol Flyers II" → "bristol-flyers-ii". */
export function clubSlug(name: string): string {
  return clubDisplayName(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
