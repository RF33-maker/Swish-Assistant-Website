// Some competitions' logos are wide wordmarks that shrink to an unreadable strip
// in a small square slot (a 20px nav icon, a badge on a card). Those competitions
// also have a compact mark, used wherever the logo is drawn small; wide spots such
// as banners and share-card headers keep the full wordmark.
const STORAGE_LOGOS = "https://omkwqpcgttrgvbhcxgqf.supabase.co/storage/v1/object/public/league-banners/logos";

// Wordmark path (matched on the end of the URL, so relative and absolute forms
// both work) → compact mark.
const COMPACT_MARKS: Record<string, string> = {
  "/logos/REBA-SL.png": `${STORAGE_LOGOS}/reba-sl-mark.png`,
};

export function compactLogoUrl<T extends string | null | undefined>(url: T): T | string {
  if (!url) return url;
  const path = url.split(/[?#]/)[0];
  for (const [wordmark, mark] of Object.entries(COMPACT_MARKS)) {
    if (path.endsWith(wordmark)) return mark;
  }
  return url;
}
