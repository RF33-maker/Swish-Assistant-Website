/**
 * Shot-distribution analysis for the shot chart.
 *
 * The chart already shows efficiency per zone (points per shot). This adds
 * the other half of the picture — *volume*: what share of a team's shooting
 * comes from each part of the floor — and turns both into plain sentences,
 * so a coach gets the read without decoding seven numbers.
 *
 * Every claim here is guarded by a minimum sample. A 1-for-1 corner three is
 * not "their best area", and saying so would be worse than saying nothing.
 */

export interface ZoneTotals {
  made: number;
  total: number;
  points: number;
}

export interface ZoneSummary {
  key: string;
  label: string;
  made: number;
  attempts: number;
  /** Share of all attempts, 0-100. */
  share: number;
  fgPct: number | null;
  pointsPerShot: number | null;
}

export interface ShotGroup {
  key: 'rim' | 'paint' | 'mid' | 'three';
  label: string;
  attempts: number;
  made: number;
  share: number;
  fgPct: number | null;
  pointsPerShot: number | null;
  color: string;
}

export interface DistributionAnalysis {
  totalAttempts: number;
  zones: ZoneSummary[];
  groups: ShotGroup[];
  /** Highest points-per-shot zone that clears the minimum sample. */
  bestZone: ZoneSummary | null;
  /** Lowest points-per-shot zone that clears the minimum sample. */
  weakestZone: ZoneSummary | null;
  /** Most-attempted zone, regardless of efficiency. */
  mostUsedZone: ZoneSummary | null;
  /** Attempts a zone needed to be eligible for best/weakest this sample. */
  rankFloor: number;
  /** Plain-English sentences describing the distribution. */
  explanation: string[];
}

/**
 * Absolute floor of attempts before a zone can be called best or weakest.
 */
export const MIN_ZONE_ATTEMPTS = 8;

/**
 * A zone must also carry this share of total attempts to be ranked.
 *
 * The absolute floor alone is not enough at volume: across 446 shots a
 * 16-attempt corner three at 1.13 points per shot would outrank 177 attempts
 * at the rim at 1.12, which is a rounding-level gap on a twentieth of the
 * sample. Scaling with the sample keeps "best area" meaning an area the team
 * actually lives in.
 */
export const MIN_ZONE_SHARE = 0.05;

const GROUP_OF: Record<string, ShotGroup['key']> = {
  ra: 'rim',
  paint: 'paint',
  mid: 'mid',
  lw3: 'three',
  rw3: 'three',
  lc3: 'three',
  rc3: 'three',
};

/**
 * Names that read correctly mid-sentence. Lowercasing the chart labels gives
 * "l corner 3" and "restricted", which is not English.
 */
const SENTENCE_LABEL: Record<string, string> = {
  ra: 'the restricted area',
  paint: 'the paint outside the restricted area',
  mid: 'mid-range',
  lw3: 'the left wing three',
  rw3: 'the right wing three',
  lc3: 'the left corner three',
  rc3: 'the right corner three',
};

const phrase = (z: { key: string; label: string }) => SENTENCE_LABEL[z.key] ?? z.label.toLowerCase();

/**
 * Below this many shots in total, the mix itself is noise — a seven-shot
 * sample being 43% mid-range says nothing about how a team plays.
 */
export const MIN_PROFILE_ATTEMPTS = 20;

const GROUP_META: Array<{ key: ShotGroup['key']; label: string; color: string }> = [
  { key: 'rim', label: 'At the rim', color: '#f59e3b' },
  { key: 'paint', label: 'Paint', color: '#e07a4a' },
  { key: 'mid', label: 'Mid-range', color: '#7a8b9c' },
  { key: 'three', label: 'Three', color: '#5b9fbf' },
];

function pct(made: number, total: number): number | null {
  return total > 0 ? (made / total) * 100 : null;
}

function pps(points: number, total: number): number | null {
  return total > 0 ? points / total : null;
}

export function analyseDistribution(
  zoneStats: Record<string, ZoneTotals>,
  zoneLabels: Array<{ key: string; label: string }>
): DistributionAnalysis {
  const totalAttempts = Object.values(zoneStats).reduce((sum, z) => sum + z.total, 0);

  const zones: ZoneSummary[] = zoneLabels.map(({ key, label }) => {
    const z = zoneStats[key] ?? { made: 0, total: 0, points: 0 };
    return {
      key,
      label,
      made: z.made,
      attempts: z.total,
      share: totalAttempts > 0 ? (z.total / totalAttempts) * 100 : 0,
      fgPct: pct(z.made, z.total),
      pointsPerShot: pps(z.points, z.total),
    };
  });

  const groupTotals = new Map<ShotGroup['key'], ZoneTotals>();
  GROUP_META.forEach((g) => groupTotals.set(g.key, { made: 0, total: 0, points: 0 }));
  Object.entries(zoneStats).forEach(([key, z]) => {
    const groupKey = GROUP_OF[key];
    if (!groupKey) return;
    const g = groupTotals.get(groupKey)!;
    g.made += z.made;
    g.total += z.total;
    g.points += z.points;
  });

  const groups: ShotGroup[] = GROUP_META.map((meta) => {
    const g = groupTotals.get(meta.key)!;
    return {
      ...meta,
      attempts: g.total,
      made: g.made,
      share: totalAttempts > 0 ? (g.total / totalAttempts) * 100 : 0,
      fgPct: pct(g.made, g.total),
      pointsPerShot: pps(g.points, g.total),
    };
  });

  const rankFloor = Math.max(MIN_ZONE_ATTEMPTS, Math.ceil(totalAttempts * MIN_ZONE_SHARE));
  const qualified = zones.filter((z) => z.attempts >= rankFloor && z.pointsPerShot != null);
  const byEfficiency = [...qualified].sort((a, b) => (b.pointsPerShot ?? 0) - (a.pointsPerShot ?? 0));
  const bestZone = byEfficiency[0] ?? null;
  const weakestZone = byEfficiency.length > 1 ? byEfficiency[byEfficiency.length - 1] : null;
  const mostUsedZone =
    totalAttempts > 0 ? [...zones].sort((a, b) => b.attempts - a.attempts)[0] ?? null : null;

  return {
    totalAttempts,
    zones,
    groups,
    bestZone,
    weakestZone,
    mostUsedZone,
    rankFloor,
    explanation: buildExplanation({ totalAttempts, zones, groups, bestZone, weakestZone, mostUsedZone, rankFloor }),
  };
}

function buildExplanation(a: Omit<DistributionAnalysis, 'explanation'>): string[] {
  if (a.totalAttempts === 0) return [];

  const lines: string[] = [];
  const rim = a.groups.find((g) => g.key === 'rim')!;
  const three = a.groups.find((g) => g.key === 'three')!;
  const mid = a.groups.find((g) => g.key === 'mid')!;
  const paint = a.groups.find((g) => g.key === 'paint')!;
  const inside = rim.share + paint.share;

  // 1. Shot profile — the shape of the diet, not a single zone.
  if (a.totalAttempts < MIN_PROFILE_ATTEMPTS) {
    lines.push(
      `Only ${a.totalAttempts} located shot${a.totalAttempts === 1 ? '' : 's'} here — too few to describe a shot profile from.`
    );
  } else if (inside >= 55) {
    lines.push(
      `This is an inside-first shot profile: ${Math.round(inside)}% of attempts come from the paint or the rim, and only ${Math.round(three.share)}% from three.`
    );
  } else if (three.share >= 45) {
    lines.push(
      `This is a three-heavy shot profile: ${Math.round(three.share)}% of attempts are from behind the arc, against ${Math.round(inside)}% at the rim or in the paint.`
    );
  } else if (mid.share >= 30) {
    lines.push(
      `An unusually mid-range-reliant profile — ${Math.round(mid.share)}% of attempts are two-point jumpers, the least efficient shot on the floor by points per shot.`
    );
  } else {
    lines.push(
      `A balanced shot profile: ${Math.round(inside)}% at the rim or in the paint, ${Math.round(three.share)}% from three, ${Math.round(mid.share)}% from mid-range.`
    );
  }

  // 2. Volume.
  if (a.mostUsedZone && a.mostUsedZone.attempts > 0) {
    const z = a.mostUsedZone;
    lines.push(
      `The single busiest area is ${phrase(z)} — ${z.attempts} of ${a.totalAttempts} attempts (${Math.round(z.share)}%)${
        z.fgPct != null ? `, converted at ${z.fgPct.toFixed(0)}%` : ''
      }.`
    );
  }

  // 3. Efficiency, only where the sample supports it.
  if (a.bestZone) {
    lines.push(
      `Most productive area is ${phrase(a.bestZone)} at ${a.bestZone.pointsPerShot!.toFixed(2)} points per shot (${a.bestZone.made} of ${a.bestZone.attempts}, ${a.bestZone.fgPct!.toFixed(0)}%).`
    );
  }
  if (a.weakestZone && a.weakestZone.key !== a.bestZone?.key) {
    lines.push(
      `Least productive is ${phrase(a.weakestZone)} at ${a.weakestZone.pointsPerShot!.toFixed(2)} points per shot (${a.weakestZone.made} of ${a.weakestZone.attempts}, ${a.weakestZone.fgPct!.toFixed(0)}%).`
    );
  }
  if (!a.bestZone) {
    lines.push(
      `No area has reached ${a.rankFloor} attempts yet, so per-area percentages are too small a sample to rank.`
    );
  }

  // 4. A genuine tension worth naming: heavy volume from a cold area.
  if (a.mostUsedZone && a.weakestZone && a.mostUsedZone.key === a.weakestZone.key) {
    lines.push(
      `Worth noting: the busiest area is also the least productive one — that is where shot selection is costing the most.`
    );
  }

  return lines;
}
