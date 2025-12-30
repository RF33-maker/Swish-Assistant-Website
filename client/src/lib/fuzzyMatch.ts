/**
 * Fuzzy matching utility for player names
 * Handles name variations, typos, and initial-based names
 */

// Common basketball player nickname mappings
const NICKNAME_MAP: Record<string, string[]> = {
  'chuck': ['chukwuma', 'charles'],
  'chukwuma': ['chuck'],
  'charles': ['chuck', 'charlie'],
  'charlie': ['charles'],
  'mike': ['michael'],
  'michael': ['mike'],
  'chris': ['christopher'],
  'christopher': ['chris'],
  'nick': ['nicholas', 'nicolas'],
  'nicholas': ['nick'],
  'nicolas': ['nick'],
  'will': ['william', 'wilfrid'],
  'william': ['will', 'bill', 'billy'],
  'wilfrid': ['will'],
  'bill': ['william'],
  'billy': ['william', 'bill'],
  'alex': ['alexander', 'alejandro'],
  'alexander': ['alex'],
  'alejandro': ['alex'],
  'dan': ['daniel'],
  'daniel': ['dan', 'danny'],
  'danny': ['daniel'],
  'joe': ['joseph', 'jose'],
  'joseph': ['joe', 'joey'],
  'jose': ['joe'],
  'joey': ['joseph'],
  'matt': ['matthew', 'mathew'],
  'matthew': ['matt'],
  'mathew': ['matt'],
  'ben': ['benjamin'],
  'benjamin': ['ben', 'benny'],
  'benny': ['benjamin'],
  'rob': ['robert', 'roberto'],
  'robert': ['rob', 'bob', 'bobby'],
  'roberto': ['rob'],
  'bob': ['robert'],
  'bobby': ['robert', 'bob'],
  'ed': ['edward', 'eduardo'],
  'edward': ['ed', 'eddie'],
  'eduardo': ['ed'],
  'eddie': ['edward'],
  'tom': ['thomas', 'tommy'],
  'thomas': ['tom', 'tommy'],
  'tommy': ['thomas', 'tom'],
  'jim': ['james', 'jimmy'],
  'james': ['jim', 'jimmy', 'jamie'],
  'jimmy': ['james', 'jim'],
  'jamie': ['james'],
  'dave': ['david'],
  'david': ['dave'],
  'steve': ['steven', 'stephen'],
  'steven': ['steve'],
  'stephen': ['steve'],
  'tony': ['anthony', 'antonio'],
  'anthony': ['tony'],
  'antonio': ['tony'],
  'sam': ['samuel', 'sammy'],
  'samuel': ['sam', 'sammy'],
  'sammy': ['sam', 'samuel'],
  'max': ['maxwell', 'maximilian'],
  'maxwell': ['max'],
  'maximilian': ['max'],
  'josh': ['joshua'],
  'joshua': ['josh'],
  'jack': ['jackson', 'john'],
  'jackson': ['jack'],
  'john': ['jack', 'johnny', 'jon'],
  'johnny': ['john'],
  'jon': ['john', 'jonathan'],
  'jonathan': ['jon'],
  'pete': ['peter'],
  'peter': ['pete'],
  'andy': ['andrew', 'andre'],
  'andrew': ['andy', 'drew'],
  'andre': ['andy'],
  'drew': ['andrew'],
  'zach': ['zachary', 'zachariah', 'zakariah'],
  'zachary': ['zach'],
  'zachariah': ['zach'],
  'zakariah': ['zach'],
};

/**
 * Check if two first names are nickname variants of each other
 */
function areNicknameVariants(name1: string, name2: string): boolean {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  
  if (n1 === n2) return true;
  
  // Check if n1 is a nickname for n2 or vice versa
  const n1Variants = NICKNAME_MAP[n1] || [];
  const n2Variants = NICKNAME_MAP[n2] || [];
  
  return n1Variants.includes(n2) || n2Variants.includes(n1);
}

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
 * - "7 Temilola" matches "Isaac Temilola" (jersey number stripped, last name match)
 * - "H Omitowotjo" matches "Henry Omitowotjo" (initial match)
 */
export function namesMatch(name1: string, name2: string, threshold: number = 0.85): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  // Exact match
  if (n1 === n2) return true;

  // Check for initial matches (e.g., "R Farrell" vs "Rhys Farrell")
  const parts1 = n1.split(' ').filter(p => p.length > 0);
  const parts2 = n2.split(' ').filter(p => p.length > 0);

  // Handle case where one name is just a last name (e.g., "temilola" vs "isaac temilola")
  // This happens when jersey numbers are stripped (e.g., "7 Temilola" -> "temilola")
  if (parts1.length === 1 && parts2.length >= 2) {
    const lastName2 = parts2[parts2.length - 1];
    if (jaroWinklerSimilarity(parts1[0], lastName2) >= 0.9) return true;
  }
  if (parts2.length === 1 && parts1.length >= 2) {
    const lastName1 = parts1[parts1.length - 1];
    if (jaroWinklerSimilarity(parts2[0], lastName1) >= 0.9) return true;
  }

  if (parts1.length === parts2.length) {
    let allMatch = true;
    for (let i = 0; i < parts1.length; i++) {
      const p1 = parts1[i];
      const p2 = parts2[i];

      // Either exact match, one is an initial of the other, or nickname variants
      const isMatch = 
        p1 === p2 || 
        (p1.length === 1 && p2.startsWith(p1)) ||
        (p2.length === 1 && p1.startsWith(p2)) ||
        areNicknameVariants(p1, p2);

      if (!isMatch) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  // Handle different part counts with initial matching (e.g., "H Omitowotjo" vs "Henry Omitowotjo")
  if (parts1.length !== parts2.length && parts1.length >= 1 && parts2.length >= 1) {
    const shorter = parts1.length < parts2.length ? parts1 : parts2;
    const longer = parts1.length < parts2.length ? parts2 : parts1;
    
    // Check if last names match closely and first part is initial or similar
    const shortLast = shorter[shorter.length - 1];
    const longLast = longer[longer.length - 1];
    
    // More lenient last name matching (0.85 instead of 0.9) for typo tolerance
    if (jaroWinklerSimilarity(shortLast, longLast) >= 0.85) {
      // Last names match, check if first parts are compatible
      const shortFirst = shorter[0];
      const longFirst = longer[0];
      
      // Initial match (e.g., "H" matches "Henry")
      if (shortFirst.length === 1 && longFirst.startsWith(shortFirst)) return true;
      if (longFirst.length === 1 && shortFirst.startsWith(longFirst)) return true;
      
      // Nickname matching (e.g., "Chuck" matches "Chukwuma")
      if (areNicknameVariants(shortFirst, longFirst)) return true;
      
      // High first name similarity (0.8 threshold to reduce false positives)
      if (jaroWinklerSimilarity(shortFirst, longFirst) >= 0.8) return true;
    }
  }
  
  // Same part count but with potential typos (e.g., "H Omitowotjo" vs "H Omitowoju")
  if (parts1.length === parts2.length && parts1.length >= 2) {
    const last1 = parts1[parts1.length - 1];
    const last2 = parts2[parts2.length - 1];
    const first1 = parts1[0];
    const first2 = parts2[0];
    
    // If first parts match (including initials or nicknames) and last names are similar
    // Use high threshold (0.9) for first names to prevent false merges like "Mahamud" vs "Hamza"
    const firstMatch = first1 === first2 || 
      (first1.length === 1 && first2.startsWith(first1)) ||
      (first2.length === 1 && first1.startsWith(first2)) ||
      areNicknameVariants(first1, first2) ||
      jaroWinklerSimilarity(first1, first2) >= 0.9;
    
    if (firstMatch && jaroWinklerSimilarity(last1, last2) >= 0.85) {
      return true;
    }
  }

  // Fuzzy match using Jaro-Winkler - ONLY for single-word names
  // For multi-word names, we require the structured checks above to pass
  // This prevents false positives like "Mahamud Ibrahim" matching "Hamza Ibrahim"
  // when they share the same common last name but are different people
  if (parts1.length <= 1 && parts2.length <= 1) {
    const similarity = jaroWinklerSimilarity(n1, n2);
    return similarity >= threshold;
  }
  
  return false;
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
