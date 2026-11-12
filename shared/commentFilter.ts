/**
 * The first, instant check on a Feed comment, before the AI check: banned
 * words (from the database, so admins can add to them), links, and personal
 * contact details. Pure, so it can be tested without a server.
 *
 * Words are matched after undoing the usual disguises: capitals, accents,
 * l33t (sh1t), spacing or dots between letters (s h i t, s.h.i.t) and
 * stretched letters (shiiiit). Terms match whole words (with an -s, -ed,
 * -ing or -er ending), never inside other words, so "closer" and place names
 * that happen to contain a term aren't caught; compounds go in as terms of
 * their own, and the AI check sees what the list doesn't. A term that is
 * only emoji (the monkey and banana emoji sent to Black players, say)
 * matches anywhere, in any skin tone.
 */

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i", "€": "e", "£": "l" };

/** Lower-case, accents off, l33t undone, spaced-out letters joined, stretched letters cut to one. */
export function normaliseForFilter(text: string): string {
  return singleLetters(normaliseKeepingRuns(text));
}

/** As normaliseForFilter, but "Woog" stays "woog": repeated letters are left for the term patterns to judge. */
function normaliseKeepingRuns(text: string): string {
  let s = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  // Look-alikes count only beside a letter (sh1t, a$$), and ! or | only before
  // one (sh!t), so "shit!" stays "shit" and a score stays a score.
  s = s.replace(/[!|](?=[a-z])|[0134578@$€£](?=[a-z0134578@$€£]*[a-z])|(?<=[a-z][0134578@$€£]*)[0134578@$€£]/g, (c) => LEET[c] ?? c);
  // "s h i t", "s.h.i.t", "s-h-i-t": single letters split by one separator become one word.
  s = s.replace(/\b(?:[a-z][\s.\-_*]){2,}[a-z]\b/g, (m) => m.replace(/[\s.\-_*]/g, ""));
  s = s.replace(/[^a-z\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

const singleLetters = (s: string) => s.replace(/([a-z])\1+/g, "$1");

/**
 * A term as a pattern that allows stretching: each letter may repeat ("shiiit"),
 * but a double letter in the term must stay at least double, so "coon" never
 * matches "con" or "Conner", and "wog" is the only clash left with a real name
 * (Ben Woog), which is why it isn't on the list. Whole words only, with the
 * usual endings.
 */
const ENDING = "(?:s+|e+s+|e*d+|i+n+g+|e*r+s*|y+)?";
const termPatterns = new Map<string, RegExp | null>();
function termPattern(raw: string): RegExp | null {
  if (termPatterns.has(raw)) return termPatterns.get(raw)!;
  const term = normaliseKeepingRuns(raw);
  const body = term.replace(/([a-z])\1*|\s+/g, (run) => (run.trim() === "" ? " " : run.length > 1 ? `${run[0]}{2,}` : `${run}+`));
  const re = singleLetters(term).replace(/\s/g, "").length < 2 ? null : new RegExp(` ${body}${ENDING} `);
  termPatterns.set(raw, re);
  return re;
}

/** Skin tones, the emoji presentation selector and joiners off, so 🐒🏿 matches 🐒. */
const stripEmojiModifiers = (s: string) => s.replace(/\uD83C[\uDFFB-\uDFFF]|[\uFE0E\uFE0F\u200D]/g, "");

/** No letters or digits: an emoji term. */
export const isEmojiTerm = (s: string) => !/[a-z0-9\u00C0-\u024F]/i.test(s);

export type FilterResult = { ok: true } | { ok: false; reason: string; category: "banned_words" | "link" | "contact_details" };

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.uk|uk|net|org|io|me|ly|gg|tv|xyz|app|link|info|biz|shop)\b)/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Eleven or more digits with at most spaces, dots or brackets between: a phone
// number. Dashes don't join, so a run of scores (102-94 86-83) isn't one.
const PHONE = /(?:\+?\d[\s.()]?){10,}\d/;

/**
 * `wordsOnly` skips the link and contact-detail checks, for the creator space,
 * where members share their own work, kit links and how to reach them.
 */
export function filterComment(text: string, bannedTerms: string[], opts: { wordsOnly?: boolean } = {}): FilterResult {
  if (!opts.wordsOnly) {
    if (LINK.test(text)) return { ok: false, reason: "Links aren't allowed in comments.", category: "link" };
    if (EMAIL.test(text) || PHONE.test(text)) return { ok: false, reason: "Please don't share email addresses or phone numbers.", category: "contact_details" };
  }

  const padded = ` ${normaliseKeepingRuns(text)} `;
  const emojiText = stripEmojiModifiers(text);
  for (const raw of bannedTerms) {
    // A term with no letters or digits is an emoji (or emoji run): matched
    // anywhere in the comment, whatever skin tone it's sent in.
    if (isEmojiTerm(raw)) {
      const emoji = stripEmojiModifiers(raw).trim();
      if (emoji && emojiText.includes(emoji)) return { ok: false, reason: "That comment uses language that isn't allowed here.", category: "banned_words" };
      continue;
    }
    const re = termPattern(raw);
    if (re?.test(padded)) return { ok: false, reason: "That comment uses language that isn't allowed here.", category: "banned_words" };
  }
  return { ok: true };
}

/** Post kinds about one player, which get the stricter check (some players in senior leagues are under 18). */
export function isPlayerPost(postKey: string): boolean {
  return /^(perf|hot|onoff):/.test(postKey);
}
