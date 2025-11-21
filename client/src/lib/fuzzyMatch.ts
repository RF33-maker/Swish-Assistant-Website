/**
 * Fuzzy matching utility for player names
 * Handles name variations, typos, and initial-based names
 */

/**
 * Normalize a player name for matching
 * - Converts to lowercase
 * - Removes extra whitespace
 * - Handles common variations
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z\s]/g, '');
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 * Returns a value between 0 (no match) and 1 (perfect match)
 */
function jaroWinklerSimilarity(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 && len2 === 0) return 1;
  if (len1 === 0 || len2 === 0) return 0;

  const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matches
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

  // Find transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Apply Winkler bonus for matching prefixes
  let prefixLength = 0;
  for (let i = 0; i < Math.min(4, len1, len2); i++) {
    if (s1[i] === s2[i]) prefixLength++;
    else break;
  }

  return jaro + prefixLength * 0.1 * (1 - jaro);
}

/**
 * Check if names match, handling initial variations
 * Examples:
 * - "Rhys Farrell" matches "R Farrell" (initial match)
 * - "R Farrell" matches "R Farell" (typo, high similarity)
 */
export function namesMatch(name1: string, name2: string, threshold: number = 0.85): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Exact match
  if (n1 === n2) return true;

  // Check for initial matches (e.g., "R Farrell" vs "Rhys Farrell")
  const parts1 = n1.split(' ');
  const parts2 = n2.split(' ');

  if (parts1.length === parts2.length) {
    let allMatch = true;
    for (let i = 0; i < parts1.length; i++) {
      const p1 = parts1[i];
      const p2 = parts2[i];

      // Either exact match, or one is an initial of the other
      const isMatch = 
        p1 === p2 || 
        (p1.length === 1 && p2.startsWith(p1)) ||
        (p2.length === 1 && p1.startsWith(p2));

      if (!isMatch) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  // Fuzzy match using Jaro-Winkler
  const similarity = jaroWinklerSimilarity(n1, n2);
  return similarity >= threshold;
}

/**
 * Find all player records that match a given player
 * Uses fuzzy name matching + team validation
 */
export interface PlayerMatch {
  id: string;
  name: string;
  full_name: string;
  team: string;
  league_id: string;
  position?: string;
  number?: number;
  slug?: string;
  matchScore: number;
}

/**
 * Get the most complete name from variations
 * Prefers full names over initials
 */
export function getMostCompleteName(names: string[]): string {
  return names.reduce((best, current) => {
    const currentParts = current.split(' ');
    const bestParts = best.split(' ');
    
    // Prefer names with more full words (not initials)
    const currentFullWords = currentParts.filter(p => p.length > 1).length;
    const bestFullWords = bestParts.filter(p => p.length > 1).length;
    
    if (currentFullWords > bestFullWords) return current;
    if (currentFullWords < bestFullWords) return best;
    
    // If same number of full words, prefer longer total length
    return current.length > best.length ? current : best;
  });
}

/**
 * Convert a slug back to a searchable name
 * Examples:
 * - "j-thames" → "J Thames"
 * - "john-doe" → "John Doe"
 * - "r-farrell-1" → "R Farrell" (strips numeric suffix)
 */
export function slugToName(slug: string): string {
  return slug
    .replace(/-\d+$/, '') // Remove numeric suffix like "-1", "-2"
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
