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
  
  // Remove "!" characters
  normalized = normalized.replace(/!/g, '');
  
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
