// Minutes from a box-score row. The clock comes through as "12:34", a bare
// number, or not at all.
export function parseMinutesPlayed(stat: any): number {
  const minutes = stat.sminutes || stat.minutes_played;
  if (!minutes) return 0;
  if (typeof minutes === 'number') return minutes;
  if (typeof minutes === 'string') {
    const parts = minutes.split(':');
    if (parts.length === 2) return parseInt(parts[0]) + parseInt(parts[1]) / 60;
    return parseFloat(minutes) || 0;
  }
  return 0;
}

const COUNTING_STATS = [
  'spoints', 'sreboundstotal', 'sassists', 'ssteals', 'sblocks', 'sturnovers',
  'sfieldgoalsattempted', 'sfreethrowsattempted', 'sfoulspersonal',
];

// Everyone listed for a game gets a row, including players who sat the whole
// time, so a row alone is not a game played. Minutes decide it, except that a
// few games came through with every clock at 0:00 and real stats.
export function playedInGame(stat: any): boolean {
  return parseMinutesPlayed(stat) > 0 || COUNTING_STATS.some((field) => Number(stat[field]) > 0);
}
