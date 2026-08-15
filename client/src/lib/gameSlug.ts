export function generateGameSlug(hometeam: string, awayteam: string, matchtime: string): string {
  const slugify = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const date = new Date(matchtime);
  const dateStr = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

  return `${slugify(hometeam)}-vs-${slugify(awayteam)}-${dateStr}`;
}

export function parseGameSlug(slug: string): { home: string; away: string; date: string } | null {
  const vsIndex = slug.indexOf('-vs-');
  if (vsIndex === -1) return null;

  const home = slug.substring(0, vsIndex);
  const rest = slug.substring(vsIndex + 4);

  const dateMatch = rest.match(/(\d{4}-\d{2}-\d{2})$/);
  if (!dateMatch) return null;

  const date = dateMatch[1];
  const away = rest.substring(0, rest.length - date.length - 1);

  return { home, away, date };
}

export function isGameSlug(value: string): boolean {
  const parsed = parseGameSlug(value);
  if (!parsed) return false;
  return parsed.home.length > 0 && parsed.away.length > 0;
}
