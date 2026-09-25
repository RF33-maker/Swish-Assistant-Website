/**
 * Fuzzy matching and duplicate-detection utilities for the player merge feature.
 * Ported from scripts/merge-duplicate-players.ts so the logic can run server-side.
 */

const NICKNAME_MAP: Record<string, string[]> = {
  chuck: ['chukwuma', 'charles'],
  chukwuma: ['chuck'],
  charles: ['chuck', 'charlie'],
  mike: ['michael'],
  michael: ['mike'],
  chris: ['christopher'],
  christopher: ['chris'],
  nick: ['nicholas', 'nicolas'],
  nicholas: ['nick'],
  nicolas: ['nick'],
  will: ['william', 'wilfrid'],
  william: ['will', 'bill', 'billy'],
  wilfrid: ['will'],
  bill: ['william'],
  billy: ['william', 'bill'],
  alex: ['alexander', 'alejandro'],
  alexander: ['alex'],
  alejandro: ['alex'],
  dan: ['daniel'],
  daniel: ['dan', 'danny'],
  danny: ['daniel'],
  joe: ['joseph', 'jose'],
  joseph: ['joe', 'joey'],
  jose: ['joe'],
  joey: ['joseph'],
  matt: ['matthew', 'mathew'],
  matthew: ['matt', 'matty'],
  mathew: ['matt'],
  ben: ['benjamin'],
  benjamin: ['ben', 'benny'],
  benny: ['benjamin'],
  rob: ['robert', 'roberto'],
  robert: ['rob', 'bob', 'bobby'],
  roberto: ['rob'],
  bob: ['robert'],
  bobby: ['robert', 'bob'],
  ed: ['edward', 'eduardo'],
  edward: ['ed', 'eddie'],
  eduardo: ['ed'],
  eddie: ['edward'],
  tom: ['thomas', 'tommy'],
  thomas: ['tom', 'tommy'],
  tommy: ['thomas', 'tom'],
  jim: ['james', 'jimmy'],
  james: ['jim', 'jimmy', 'jamie'],
  jimmy: ['james', 'jim'],
  jamie: ['james'],
  dave: ['david'],
  david: ['dave'],
  steve: ['steven', 'stephen'],
  steven: ['steve'],
  stephen: ['steve'],
  tony: ['anthony', 'antonio'],
  anthony: ['tony'],
  antonio: ['tony'],
  sam: ['samuel', 'sammy'],
  samuel: ['sam', 'sammy'],
  sammy: ['sam', 'samuel'],
  max: ['maxwell', 'maximilian'],
  maxwell: ['max'],
  maximilian: ['max'],
  josh: ['joshua'],
  joshua: ['josh'],
  jack: ['jackson', 'john'],
  jackson: ['jack'],
  john: ['jack', 'johnny', 'jon'],
  johnny: ['john'],
  jon: ['john', 'jonathan'],
  jonathan: ['jon'],
  pete: ['peter'],
  peter: ['pete'],
  andy: ['andrew', 'andre'],
  andrew: ['andy', 'drew'],
  andre: ['andy'],
  drew: ['andrew'],
  zach: ['zachary', 'zachariah', 'zakariah'],
  zachary: ['zach'],
  zachariah: ['zach'],
  zakariah: ['zach'],
  matty: ['matthew', 'matt'],
  finn: ['finlay', 'finley', 'finnegan'],
  finlay: ['finn'],
  finley: ['finn'],
  finnegan: ['finn'],
  gabe: ['gabriel'],
  gabriel: ['gabe'],
  nate: ['nathan', 'nathaniel'],
  nathan: ['nate'],
  nathaniel: ['nate', 'nathan'],
  ollie: ['oliver'],
  oliver: ['ollie'],
  charlie: ['charles', 'charlton'],
  freddie: ['frederick', 'fred'],
  fred: ['frederick', 'freddie'],
  frederick: ['fred', 'freddie'],
  isaac: ['issac'],
  issac: ['isaac'],
};

function areNicknameVariants(a: string, b: string): boolean {
  const n1 = a.toLowerCase().trim();
  const n2 = b.toLowerCase().trim();
  if (n1 === n2) return true;
  return (NICKNAME_MAP[n1] || []).includes(n2) || (NICKNAME_MAP[n2] || []).includes(n1);
}

// Generational suffixes carry no identity information for matching, and the
// feed is inconsistent about them ("John Smith" one game, "John Smith Jr" the
// next). Stripped before comparison, never from the stored name.
const NAME_SUFFIXES = new Set(['jr', 'jnr', 'sr', 'snr', 'ii', 'iii', 'iv']);

/**
 * Lowercase, strip accents, and drop everything that isn't a letter or space.
 *
 * The accent fold matters: without it "José" and "Jose" normalize to "jos" and
 * "jose" and never match. Punctuation is removed rather than split on, so
 * "El-Bakry" stays one token ("elbakry") and word counts remain stable —
 * several rules below key off how many words a name has. Bracketed nicknames
 * fall out naturally: "Eliaz (Zain) Poorman" -> "eliaz zain poorman".
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameParts(name: string): string[] {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  // Only strip a trailing suffix when something remains that still looks like
  // a full name, so a player genuinely recorded as "Ii" isn't erased.
  if (parts.length > 2 && NAME_SUFFIXES.has(parts[parts.length - 1])) {
    return parts.slice(0, -1);
  }
  return parts;
}

/**
 * Placeholder rows the feed emits during setup ("s s", "a a", "ssss ss").
 * These fuzzy-match each other and everything else, so they generate noise
 * that buries the real suggestions.
 */
function isJunkName(parts: string[]): boolean {
  if (parts.length === 0) return true;
  const joined = parts.join('');
  if (joined.length < 3) return true;
  if (new Set(joined.split('')).size === 1) return true;
  return false;
}

/** Does every word of `shorter` appear in `longer`, in order? */
function isOrderedSubsequence(shorter: string[], longer: string[]): boolean {
  let i = 0;
  for (const word of longer) {
    if (i < shorter.length && word === shorter[i]) i++;
  }
  return i === shorter.length;
}

function jaroWinkler(s1: string, s2: string): number {
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 && l2 === 0) return 1;
  if (l1 === 0 || l2 === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const m1 = new Array(l1).fill(false);
  const m2 = new Array(l2).fill(false);
  let matches = 0;

  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, l2);
    for (let j = start; j < end; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = true;
      m2[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let t = 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }

  const jaro = (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, l1, l2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

export type MatchReason =
  | 'exact'
  | 'middle-name'
  | 'initial'
  | 'nickname'
  | 'typo'
  | 'hyphenated'
  | 'surname-only';

export interface NameMatch {
  matched: boolean;
  /** 0-1. Drives ordering in the review UI; it is not an auto-merge threshold. */
  confidence: number;
  reason?: MatchReason;
}

const NO_MATCH: NameMatch = { matched: false, confidence: 0 };

function firstNamesAgree(a: string, b: string): { ok: boolean; reason: MatchReason } | null {
  if (a === b) return { ok: true, reason: 'exact' };
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) {
    return { ok: true, reason: 'initial' };
  }
  if (areNicknameVariants(a, b)) return { ok: true, reason: 'nickname' };
  // Shortened forms the nickname table will never cover exhaustively:
  // "Abo" for "Abobakar". Three characters minimum, so "Jo" does not open
  // the door to every J-name sharing a surname.
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length >= 3 && short !== long && long.startsWith(short)) {
    return { ok: true, reason: 'nickname' };
  }
  return null;
}

/**
 * Decide whether two recorded names refer to the same player, and say why.
 *
 * Tuned for recall on the ways this feed actually varies -- an added middle
 * name, an initial, a nickname, a typo -- while refusing the shapes that look
 * similar but routinely are not the same person. In particular two names of
 * the same length whose first names simply differ ("Mohamed Ali" vs
 * "Ali Ali") are never matched on surname alone.
 */
export function matchNames(name1: string, name2: string): NameMatch {
  const p1 = nameParts(name1);
  const p2 = nameParts(name2);
  // Checked on the raw strings: normalization joins "Spence-Mussington" into
  // one token, and only a name that really was hyphenated may match on a
  // surname prefix. Without this gate "Smith" would match "Smithson".
  const hyphenated = /-/.test(name1) || /-/.test(name2);

  if (isJunkName(p1) || isJunkName(p2)) return NO_MATCH;

  if (p1.join(' ') === p2.join(' ')) return { matched: true, confidence: 1, reason: 'exact' };
  // Same letters, different word breaks: "Sufyan El Bakry" / "Sufyan El-Bakry".
  if (p1.join('') === p2.join('')) return { matched: true, confidence: 0.97, reason: 'exact' };

  const shorter = p1.length <= p2.length ? p1 : p2;
  const longer = p1.length <= p2.length ? p2 : p1;
  const sLast = shorter[shorter.length - 1];
  const lLast = longer[longer.length - 1];

  // Extra middle name(s): "Zain Poorman" vs "Elias Zain Poorman".
  // Requires the shorter name to be a real two-part name and to appear in
  // order inside the longer one, which is what keeps "Ali Ali" away from
  // "Mohamed Ali" (same length, so this rule never fires).
  if (
    shorter.length !== longer.length &&
    shorter.length >= 2 &&
    sLast === lLast
  ) {
    if (isOrderedSubsequence(shorter, longer)) {
      return { matched: true, confidence: 0.92, reason: 'middle-name' };
    }
    // Same surname and extra middle names, but the first name is misspelled:
    // "Esosa Arthur" vs "Eseosa Lurkyns Arthur". Everything after the first
    // word must still line up, so this cannot absorb a different person.
    // Everything after the first word must still line up, so neither of
    // these can absorb a different person. A two-letter short form ("Ty" for
    // "Tychique") is allowed here, but nowhere else, because the exact
    // surname and the aligned middle names carry the identification.
    if (isOrderedSubsequence(shorter.slice(1), longer.slice(1))) {
      const sFirst = shorter[0];
      const lFirst = longer[0];
      if (jaroWinkler(sFirst, lFirst) >= 0.9) {
        return { matched: true, confidence: 0.78, reason: 'typo' };
      }
      const shortFirst = sFirst.length <= lFirst.length ? sFirst : lFirst;
      const longFirst = sFirst.length <= lFirst.length ? lFirst : sFirst;
      if (shortFirst.length >= 2 && longFirst.startsWith(shortFirst)) {
        return { matched: true, confidence: 0.78, reason: 'nickname' };
      }
    }
  }

  // Same shape: compare first and last, allow initials/nicknames/typos.
  if (p1.length === p2.length && p1.length >= 2) {
    const agree = firstNamesAgree(p1[0], p2[0]);
    const lastSim = jaroWinkler(p1[p1.length - 1], p2[p2.length - 1]);

    // Middle names must not actively disagree (both spelled out and different).
    let middlesOk = true;
    for (let i = 1; i < p1.length - 1; i++) {
      const a = p1[i];
      const b = p2[i];
      if (a === b) continue;
      if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) continue;
      if (areNicknameVariants(a, b)) continue;
      middlesOk = false;
      break;
    }

    // Double-barrelled surname recorded both ways: "Kizzy Spence" and
    // "Kizzy Spence-Mussington". The first names must agree outright.
    if (middlesOk && agree && hyphenated) {
      const a = p1[p1.length - 1];
      const b = p2[p2.length - 1];
      const sSur = a.length <= b.length ? a : b;
      const lSur = a.length <= b.length ? b : a;
      if (sSur.length >= 4 && sSur !== lSur && lSur.startsWith(sSur)) {
        return { matched: true, confidence: 0.8, reason: 'hyphenated' };
      }
    }

    // Jaro-Winkler rewards a shared prefix heavily, so "Smith"/"Smithson"
    // scores 0.95 despite being two different surnames. A surname that is a
    // strict prefix of the other with real length left over only counts when
    // the longer one was actually hyphenated, which the rule above handles.
    const lastA = p1[p1.length - 1];
    const lastB = p2[p2.length - 1];
    const sSurname = lastA.length <= lastB.length ? lastA : lastB;
    const lSurname = lastA.length <= lastB.length ? lastB : lastA;
    const truncatedSurname =
      sSurname !== lSurname &&
      lSurname.startsWith(sSurname) &&
      lSurname.length - sSurname.length >= 3;

    if (middlesOk && agree && lastSim >= 0.88 && !truncatedSurname) {
      // An inexact surname is the weakest part of any of these pairs, so it
      // caps the score regardless of how cleanly the first names agreed.
      const base = agree.reason === 'exact' ? 0.95 : agree.reason === 'initial' ? 0.88 : 0.85;
      const confidence = lastSim >= 0.99 ? base : Math.min(base, 0.7);
      return { matched: true, confidence, reason: agree.reason === 'exact' ? 'typo' : agree.reason };
    }

    // Both names spelled out, surnames equal, first names merely similar:
    // a typo ("Jonathon"/"Jonathan"), not a different person. Deliberately
    // stricter than the surname check above.
    // When the surname is character-for-character identical it is doing the
    // identifying work, so a transposed first name still clears the bar:
    // "Mergin Sokoli" / "Megrim Sokoli" scores 0.86, which a flat 0.88 cut
    // would have thrown away.
    const firstSim = jaroWinkler(p1[0], p2[0]);
    // Only for first names long enough to carry a transposition: "Jo" scores
    // 0.85 against "John" purely on its prefix, which is not evidence.
    const bothFirstNamesSubstantial = p1[0].length >= 4 && p2[0].length >= 4;
    const firstNameBar = lastSim >= 0.99 && bothFirstNamesSubstantial ? 0.84 : 0.88;
    if (middlesOk && !agree && !truncatedSurname && lastSim >= 0.95 && firstSim >= firstNameBar) {
      return { matched: true, confidence: 0.75, reason: 'typo' };
    }

    return NO_MATCH;
  }

  // Differing shapes that aren't a clean middle-name insert: require the
  // surname to line up and the first names to agree properly.
  if (shorter.length >= 2 && longer.length > shorter.length) {
    if (jaroWinkler(sLast, lLast) >= 0.88) {
      const agree = firstNamesAgree(shorter[0], longer[0]);
      if (agree) {
        return {
          matched: true,
          confidence: agree.reason === 'exact' ? 0.9 : 0.82,
          reason: agree.reason === 'exact' ? 'middle-name' : agree.reason,
        };
      }
    }
    return NO_MATCH;
  }

  // One side is a lone word. Only an exact surname hit counts, and it stays
  // low confidence -- "Smith" fits every Smith in the league, so the
  // ambiguity pass below is what stops it being acted on blindly.
  if (shorter.length === 1 && longer.length >= 2) {
    if (shorter[0] === lLast) {
      return { matched: true, confidence: 0.4, reason: 'surname-only' };
    }
    return NO_MATCH;
  }

  return NO_MATCH;
}

/** Retained for callers that only need a boolean. */
export function namesMatch(name1: string, name2: string): boolean {
  return matchNames(name1, name2).matched;
}

export interface PlayerRow {
  id: string;
  full_name: string;
  league_id: string;
  slug?: string;
  team_id?: string | null;
  shirtNumber?: number | null;
  statsCount?: number;
}

export interface DuplicatePair {
  canonicalId: string;
  canonicalName: string;
  canonicalSlug?: string;
  duplicateId: string;
  duplicateName: string;
  duplicateSlug?: string;
  statsToRepoint: number;
  /** 0-1, for ordering the review list. Not an auto-merge threshold. */
  confidence: number;
  reason: MatchReason;
  /**
   * One of these two players also matches someone else, or the pair carries
   * conflicting squad numbers. Still shown, but it needs a human to look.
   */
  ambiguous: boolean;
  /** Plain-English reason the pair was flagged ambiguous. */
  warning?: string;
}

export function detectDuplicates(
  players: PlayerRow[],
  statsCounts: Map<string, number>
): DuplicatePair[] {
  const usable = players.filter((p) => p.full_name && !isJunkName(nameParts(p.full_name)));

  // Pass 1: every match, so ambiguity is known before anything is paired off.
  type Edge = { a: PlayerRow; b: PlayerRow; match: NameMatch };
  const edges: Edge[] = [];
  const partners = new Map<string, Set<string>>();

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i];
      const b = usable[j];
      const match = matchNames(a.full_name, b.full_name);
      if (!match.matched) continue;
      edges.push({ a, b, match });
      if (!partners.has(a.id)) partners.set(a.id, new Set());
      if (!partners.has(b.id)) partners.set(b.id, new Set());
      partners.get(a.id)!.add(b.id);
      partners.get(b.id)!.add(a.id);
    }
  }

  // Strongest first, so a confident pair claims its players before a weak one.
  edges.sort((x, y) => y.match.confidence - x.match.confidence);

  const pairs: DuplicatePair[] = [];
  const claimed = new Set<string>();

  for (const { a, b, match } of edges) {
    if (claimed.has(a.id) || claimed.has(b.id)) continue;

    const aWords = nameParts(a.full_name).filter((p) => p.length > 1).length;
    const bWords = nameParts(b.full_name).filter((p) => p.length > 1).length;
    const aStats = statsCounts.get(a.id) || 0;
    const bStats = statsCounts.get(b.id) || 0;

    let aIsCanonical: boolean;
    if (aWords !== bWords) aIsCanonical = aWords > bWords;
    else if (aStats !== bStats) aIsCanonical = aStats > bStats;
    else aIsCanonical = (a.full_name || '').length >= (b.full_name || '').length;

    const canonical = aIsCanonical ? a : b;
    const duplicate = aIsCanonical ? b : a;

    const warnings: string[] = [];
    if ((partners.get(a.id)?.size || 0) > 1 || (partners.get(b.id)?.size || 0) > 1) {
      warnings.push('one of these names also matches another player in this league');
    }
    // Same squad, different numbers is real evidence of two different people,
    // so it demotes the pair rather than being ignored.
    const sameTeam = a.team_id && b.team_id && a.team_id === b.team_id;
    if (
      sameTeam &&
      a.shirtNumber != null &&
      b.shirtNumber != null &&
      a.shirtNumber !== b.shirtNumber
    ) {
      warnings.push(`different squad numbers (#${a.shirtNumber} and #${b.shirtNumber})`);
    }
    if (match.reason === 'surname-only') {
      warnings.push('matched on surname alone');
    }
    // An initial carries almost no information, so when the surname is only
    // approximate too the pair rests on very little: "A. Shaw" fits both
    // "Alexandra Shaw" and "Annika Shah". Worth showing, not worth trusting.
    if (match.reason === 'initial' && match.confidence < 0.88) {
      warnings.push('an initial plus an inexact surname is weak evidence');
    }

    claimed.add(duplicate.id);

    pairs.push({
      canonicalId: canonical.id,
      canonicalName: canonical.full_name || '',
      canonicalSlug: canonical.slug,
      duplicateId: duplicate.id,
      duplicateName: duplicate.full_name || '',
      duplicateSlug: duplicate.slug,
      statsToRepoint: statsCounts.get(duplicate.id) || 0,
      confidence: warnings.length > 0 ? Math.min(match.confidence, 0.5) : match.confidence,
      reason: match.reason || 'typo',
      ambiguous: warnings.length > 0,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
    });
  }

  return pairs.sort((a, b) => b.confidence - a.confidence);
}
