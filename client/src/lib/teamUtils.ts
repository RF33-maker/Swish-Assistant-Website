/**
 * Normalizes team names to handle variations that should be treated as the same team.
 * 
 * This function strips:
 * - "Senior Men" suffix (case-insensitive)
 * - "!" characters
 * - Roman numeral "I" at the end (but NOT II, III, IV which are separate teams)
 * - Extra whitespace
 * 
 * Examples:
 * - "Worcester Wolves Senior Men I" → "Worcester Wolves"
 * - "Worcester Wolves Senior Men" → "Worcester Wolves"
 * - "Solent Kestrels Senior Men I" → "Solent Kestrels"
 * - "Worcester Wolves II" → "Worcester Wolves II" (kept separate)
 * - "Team Name!" → "Team Name"
 */
export function normalizeTeamName(name: string): string {
  if (!name) return '';
  
  let normalized = name.trim();
  
  // Remove "Senior Men" (case-insensitive)
  normalized = normalized.replace(/\s+Senior\s+Men\s*/gi, ' ');
  
  // Remove "!" characters and leading "#" characters
  normalized = normalized.replace(/!/g, '').replace(/^#+/, '');
  
  // Remove Roman numeral "I" at the end (but NOT II, III, IV, etc.)
  // This regex matches " I" at the end of the string, ensuring it's not followed by another "I" or "V"
  // Negative lookahead (?![IV]) ensures we don't match "II", "III", "IV", etc.
  normalized = normalized.replace(/\s+I(?![IVX])\s*$/i, '');
  
  // Normalize whitespace (replace multiple spaces with single space)
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

/**
 * Normalizes a team name for use in file paths (replaces spaces with underscores).
 */
export function normalizeTeamNameForFile(name: string): string {
  const normalized = normalizeTeamName(name);
  return normalized.replace(/\s+/g, '_');
}

/**
 * Computes Jaro-Winkler similarity between two strings.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  const len1 = s1.length;
  const len2 = s2.length;
  const matchWindow = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  const prefixLimit = Math.min(4, Math.min(len1, len2));
  for (let i = 0; i < prefixLimit; i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Strips punctuation and spaces from a team name for fuzzy comparison.
 * E.g. "Just-Us" and "Just Us" both become "justus".
 */
function fuzzyKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.,'"()&!]/g, '');
}

/**
 * Bounded Levenshtein distance. Returns maxDist+1 if the true distance exceeds maxDist.
 */
function levenshtein(a: string, b: string, maxDist: number): number {
  if (Math.abs(a.length - b.length) > maxDist) return maxDist + 1;
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[b.length];
}

/**
 * Given a list of raw team names, returns a Map<variant, canonical> where names
 * that differ only by minor spelling, spacing, or punctuation are clustered together.
 *
 * Clustering criteria (applied to punctuation-stripped, lowercased keys):
 *   - Exact match after stripping punctuation/spaces
 *   - Jaro-Winkler similarity ≥ 0.90
 *   - Levenshtein distance ≤ 2 (for names whose stripped key is ≤ 20 chars)
 *
 * The canonical for each cluster is the most-frequent name; ties broken alphabetically.
 *
 * @param names       Raw team name strings (may contain duplicates)
 * @param frequencies Optional name → occurrence-count map to prefer the most-common form
 */
export function buildFuzzyTeamAliasMap(
  names: string[],
  frequencies?: Map<string, number>
): Map<string, string> {
  const unique = Array.from(new Set(names.filter(Boolean)));
  if (unique.length < 2) return new Map();

  // Union-Find
  const parent: Record<string, string> = {};
  unique.forEach(n => (parent[n] = n));
  function find(x: string): string {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }
  function union(a: string, b: string) {
    parent[find(a)] = find(b);
  }

  // Compare all pairs
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const a = unique[i];
      const b = unique[j];
      const ak = fuzzyKey(a);
      const bk = fuzzyKey(b);
      if (ak === bk) { union(a, b); continue; }
      if (jaroWinkler(ak, bk) >= 0.90) { union(a, b); continue; }
      if (Math.max(ak.length, bk.length) <= 20 && levenshtein(ak, bk, 2) <= 2) {
        union(a, b);
      }
    }
  }

  // Group by cluster root
  const clusters: Record<string, string[]> = {};
  unique.forEach(n => {
    const root = find(n);
    if (!clusters[root]) clusters[root] = [];
    clusters[root].push(n);
  });

  // Pick canonical: most-frequent first, then alphabetically first
  const result = new Map<string, string>();
  Object.values(clusters).forEach(members => {
    if (members.length < 2) return; // singleton — no alias needed
    const canonical = [...members].sort((a, b) => {
      const freqDiff = (frequencies?.get(b) ?? 0) - (frequencies?.get(a) ?? 0);
      return freqDiff !== 0 ? freqDiff : a.localeCompare(b);
    })[0];
    members.forEach(m => {
      if (m !== canonical) result.set(m, canonical);
    });
  });

  return result;
}
