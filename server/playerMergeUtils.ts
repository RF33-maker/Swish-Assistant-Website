/**
 * Fuzzy matching and duplicate-detection utilities for the player merge feature.
 * Ported from scripts/merge-duplicate-players.ts so the logic can run server-side.
 */

const NICKNAME_MAP: Record<string, string[]> = {
  chuck: ['chukwuma', 'charles'],
  chukwuma: ['chuck'],
  charles: ['chuck', 'charlie'],
  charlie: ['charles'],
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
  matthew: ['matt'],
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
};

function areNicknameVariants(a: string, b: string): boolean {
  const n1 = a.toLowerCase().trim();
  const n2 = b.toLowerCase().trim();
  if (n1 === n2) return true;
  return (NICKNAME_MAP[n1] || []).includes(n2) || (NICKNAME_MAP[n2] || []).includes(n1);
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z\s]/g, '');
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

function namesMatch(name1: string, name2: string, threshold = 0.85): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2) return true;

  const p1 = n1.split(' ').filter(Boolean);
  const p2 = n2.split(' ').filter(Boolean);

  if (p1.length === 1 && p2.length >= 2) {
    if (jaroWinkler(p1[0], p2[p2.length - 1]) >= 0.9) return true;
  }
  if (p2.length === 1 && p1.length >= 2) {
    if (jaroWinkler(p2[0], p1[p1.length - 1]) >= 0.9) return true;
  }

  if (p1.length === p2.length) {
    let allMatch = true;
    for (let i = 0; i < p1.length; i++) {
      const a = p1[i];
      const b = p2[i];
      if (
        a !== b &&
        !(a.length === 1 && b.startsWith(a)) &&
        !(b.length === 1 && a.startsWith(b)) &&
        !areNicknameVariants(a, b)
      ) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  if (p1.length !== p2.length && p1.length >= 1 && p2.length >= 1) {
    const shorter = p1.length < p2.length ? p1 : p2;
    const longer = p1.length < p2.length ? p2 : p1;
    const sLast = shorter[shorter.length - 1];
    const lLast = longer[longer.length - 1];
    if (jaroWinkler(sLast, lLast) >= 0.85) {
      const sf = shorter[0];
      const lf = longer[0];
      if ((sf.length === 1 && lf.startsWith(sf)) || (lf.length === 1 && sf.startsWith(lf))) return true;
      if (areNicknameVariants(sf, lf)) return true;
      if (jaroWinkler(sf, lf) >= 0.8) return true;
    }
  }

  if (p1.length === p2.length && p1.length >= 2) {
    const last1 = p1[p1.length - 1];
    const last2 = p2[p2.length - 1];
    const first1 = p1[0];
    const first2 = p2[0];
    const firstMatch =
      first1 === first2 ||
      (first1.length === 1 && first2.startsWith(first1)) ||
      (first2.length === 1 && first1.startsWith(first2)) ||
      areNicknameVariants(first1, first2) ||
      jaroWinkler(first1, first2) >= 0.82;
    if (firstMatch && jaroWinkler(last1, last2) >= 0.85) return true;
  }

  if (p1.length <= 1 && p2.length <= 1) {
    return jaroWinkler(n1, n2) >= threshold;
  }

  return false;
}

export interface PlayerRow {
  id: string;
  full_name: string;
  league_id: string;
  slug?: string;
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
}

export function detectDuplicates(
  players: PlayerRow[],
  statsCounts: Map<string, number>
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const mergedIds = new Set<string>();

  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (mergedIds.has(a.id)) continue;

    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (mergedIds.has(b.id)) continue;

      const aName = a.full_name || '';
      const bName = b.full_name || '';

      if (!aName || !bName) continue;
      if (!namesMatch(aName, bName)) continue;

      const aFullWords = aName.split(' ').filter((p: string) => p.length > 1).length;
      const bFullWords = bName.split(' ').filter((p: string) => p.length > 1).length;
      const aStats = statsCounts.get(a.id) || 0;
      const bStats = statsCounts.get(b.id) || 0;

      let aIsCanonical: boolean;
      if (aFullWords !== bFullWords) {
        aIsCanonical = aFullWords > bFullWords;
      } else if (aStats !== bStats) {
        aIsCanonical = aStats > bStats;
      } else {
        aIsCanonical = aName.length >= bName.length;
      }

      const canonical = aIsCanonical ? a : b;
      const duplicate = aIsCanonical ? b : a;

      mergedIds.add(duplicate.id);

      pairs.push({
        canonicalId: canonical.id,
        canonicalName: canonical.full_name || '',
        canonicalSlug: canonical.slug,
        duplicateId: duplicate.id,
        duplicateName: duplicate.full_name || '',
        duplicateSlug: duplicate.slug,
        statsToRepoint: statsCounts.get(duplicate.id) || 0,
      });
    }
  }

  return pairs;
}
