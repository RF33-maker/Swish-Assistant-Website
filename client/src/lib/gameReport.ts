/**
 * Derivation layer for the automated match and scout reports.
 *
 * Pure functions over `team_stats` / `player_stats` rows so the narrative
 * logic can be reasoned about (and tested) without React. Everything here
 * is deliberately conservative: the feed leaves fields null on older or
 * partially-parsed games, and Supabase returns numerics as strings, so every
 * read goes through `num()` and every derived claim is dropped rather than
 * guessed when its inputs are missing. A report that silently invents a
 * number is worse than one that shows fewer sections.
 */

/** 1 -> "1st", 2 -> "2nd", 13 -> "13th". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Supabase returns numeric/decimal columns as strings. */
export function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface TeamGameRow {
  name: string;
  team_id?: string | null;
  game_key: string;
  score?: number | null;
  p1_score?: number | null;
  p2_score?: number | null;
  p3_score?: number | null;
  p4_score?: number | null;
  tot_biggestscoringrun?: unknown;
  tot_leadchanges?: unknown;
  tot_timesscoreslevel?: unknown;
  tot_sbiggestlead?: unknown;
  tot_timeleading?: unknown;
  efg_percent?: unknown;
  ts_percent?: unknown;
  tov_percent?: unknown;
  oreb_percent?: unknown;
  dreb_percent?: unknown;
  ft_rate?: unknown;
  off_rating?: unknown;
  def_rating?: unknown;
  pace?: unknown;
  possessions?: unknown;
  tot_spointsinthepaint?: unknown;
  tot_spointsfastbreak?: unknown;
  tot_spointssecondchance?: unknown;
  tot_spointsfromturnovers?: unknown;
  tot_sbenchpoints?: unknown;
  tot_sfieldgoalsmade?: unknown;
  tot_sfieldgoalsattempted?: unknown;
  tot_sthreepointersmade?: unknown;
  tot_sthreepointersattempted?: unknown;
  tot_sfreethrowsmade?: unknown;
  tot_sfreethrowsattempted?: unknown;
  tot_sreboundstotal?: unknown;
  tot_sreboundsoffensive?: unknown;
  tot_sassists?: unknown;
  tot_sturnovers?: unknown;
  tot_ssteals?: unknown;
  tot_sblocks?: unknown;
}

export interface PlayerGameRow {
  full_name?: string | null;
  team_name?: string | null;
  spoints?: unknown;
  sreboundstotal?: unknown;
  sassists?: unknown;
  ssteals?: unknown;
  sblocks?: unknown;
  sturnovers?: unknown;
  sminutes?: unknown;
  sfieldgoalsmade?: unknown;
  sfieldgoalsattempted?: unknown;
  sthreepointersmade?: unknown;
  sthreepointersattempted?: unknown;
  sfreethrowsmade?: unknown;
  sfreethrowsattempted?: unknown;
  splusminuspoints?: unknown;
  ts_percent?: unknown;
  usage_percent?: unknown;
  efficiency?: unknown;
}

/** A head-to-head row rendered as two numbers either side of a shared bar. */
export interface ComparisonRow {
  label: string;
  mine: number | null;
  theirs: number | null;
  /** Rendered suffix, e.g. "%" */
  unit?: string;
  decimals?: number;
  /** For most stats more is better; turnovers invert. */
  lowerIsBetter?: boolean;
  /** Short plain-English note shown under the bar when the gap is decisive. */
  note?: string;
}

const pct = (v: number | null) => (v == null ? null : v);

/**
 * The four factors, in the order Dean Oliver weights them. This is the
 * standard way to explain why a basketball game went the way it did, which
 * is exactly the question the match report is answering.
 */
export function fourFactors(mine: TeamGameRow, theirs: TeamGameRow): ComparisonRow[] {
  return [
    { label: 'Effective FG%', mine: pct(num(mine.efg_percent)), theirs: pct(num(theirs.efg_percent)), unit: '%', decimals: 1 },
    { label: 'Turnover rate', mine: pct(num(mine.tov_percent)), theirs: pct(num(theirs.tov_percent)), unit: '%', decimals: 1, lowerIsBetter: true },
    { label: 'Offensive rebound %', mine: pct(num(mine.oreb_percent)), theirs: pct(num(theirs.oreb_percent)), unit: '%', decimals: 1 },
    { label: 'Free throw rate', mine: pct(num(mine.ft_rate)), theirs: pct(num(theirs.ft_rate)), unit: '%', decimals: 1 },
  ].filter((r) => r.mine != null || r.theirs != null);
}

/** Where the points actually came from, as raw point totals. */
export function scoringMix(mine: TeamGameRow, theirs: TeamGameRow): ComparisonRow[] {
  return [
    { label: 'Points in the paint', mine: num(mine.tot_spointsinthepaint), theirs: num(theirs.tot_spointsinthepaint) },
    { label: 'Fast break points', mine: num(mine.tot_spointsfastbreak), theirs: num(theirs.tot_spointsfastbreak) },
    { label: 'Second chance points', mine: num(mine.tot_spointssecondchance), theirs: num(theirs.tot_spointssecondchance) },
    { label: 'Points off turnovers', mine: num(mine.tot_spointsfromturnovers), theirs: num(theirs.tot_spointsfromturnovers) },
    { label: 'Bench points', mine: num(mine.tot_sbenchpoints), theirs: num(theirs.tot_sbenchpoints) },
  ].filter((r) => r.mine != null || r.theirs != null);
}

export interface QuarterLine {
  label: string;
  mine: number | null;
  theirs: number | null;
  /** Running margin after this quarter, when every preceding quarter is known. */
  cumulativeMargin: number | null;
}

export function quarterFlow(mine: TeamGameRow, theirs: TeamGameRow): QuarterLine[] {
  const keys = ['p1_score', 'p2_score', 'p3_score', 'p4_score'] as const;
  let runningMine = 0;
  let runningTheirs = 0;
  let broken = false;
  const out: QuarterLine[] = [];
  keys.forEach((key, i) => {
    const m = num(mine[key]);
    const t = num(theirs[key]);
    if (m == null || t == null) broken = true;
    else {
      runningMine += m;
      runningTheirs += t;
    }
    out.push({
      label: `Q${i + 1}`,
      mine: m,
      theirs: t,
      cumulativeMargin: broken ? null : runningMine - runningTheirs,
    });
  });
  return out.some((q) => q.mine != null || q.theirs != null) ? out : [];
}

export interface Storyline {
  /** Short headline, e.g. "Shot-making decided it". */
  title: string;
  /** One sentence explaining the number in context. */
  detail: string;
  /** 'good' = worked in our favour. */
  tone: 'good' | 'bad' | 'neutral';
}

function fmt(v: number, decimals = 0) {
  return v.toFixed(decimals);
}

/**
 * Pick the handful of numbers that actually explain the result, rather than
 * listing everything. Each candidate declares the gap that makes it
 * noteworthy, and only gaps past that threshold are surfaced — so a close,
 * even game correctly produces a short report instead of manufactured drama.
 */
export function buildStorylines(mine: TeamGameRow, theirs: TeamGameRow): Storyline[] {
  const stories: Storyline[] = [];
  const myScore = num(mine.score);
  const theirScore = num(theirs.score);
  const won = myScore != null && theirScore != null ? myScore > theirScore : null;

  const efgMine = num(mine.efg_percent);
  const efgTheirs = num(theirs.efg_percent);
  if (efgMine != null && efgTheirs != null && Math.abs(efgMine - efgTheirs) >= 5) {
    const ahead = efgMine > efgTheirs;
    stories.push({
      title: ahead ? 'Shot-making was the edge' : 'Out-shot on the night',
      detail: `${fmt(efgMine, 1)}% effective field goal against ${fmt(efgTheirs, 1)}% — a ${fmt(Math.abs(efgMine - efgTheirs), 1)}-point gap in shooting efficiency.`,
      tone: ahead ? 'good' : 'bad',
    });
  }

  const paintMine = num(mine.tot_spointsinthepaint);
  const paintTheirs = num(theirs.tot_spointsinthepaint);
  if (paintMine != null && paintTheirs != null && Math.abs(paintMine - paintTheirs) >= 10) {
    const ahead = paintMine > paintTheirs;
    stories.push({
      title: ahead ? 'Owned the paint' : 'Lost the paint',
      detail: `${fmt(paintMine)} points in the paint to ${fmt(paintTheirs)}${ahead ? '' : ' — the interior went the other way'}.`,
      tone: ahead ? 'good' : 'bad',
    });
  }

  const potMine = num(mine.tot_spointsfromturnovers);
  const potTheirs = num(theirs.tot_spointsfromturnovers);
  if (potMine != null && potTheirs != null && Math.abs(potMine - potTheirs) >= 8) {
    const ahead = potMine > potTheirs;
    stories.push({
      title: ahead ? 'Punished turnovers' : 'Punished off turnovers',
      detail: `${fmt(potMine)} points off turnovers against ${fmt(potTheirs)}.`,
      tone: ahead ? 'good' : 'bad',
    });
  }

  const tovMine = num(mine.tov_percent);
  const tovTheirs = num(theirs.tov_percent);
  if (tovMine != null && tovTheirs != null && Math.abs(tovMine - tovTheirs) >= 4) {
    const ahead = tovMine < tovTheirs;
    stories.push({
      title: ahead ? 'Looked after the ball' : 'Gave the ball away',
      detail: `Turned it over on ${fmt(tovMine, 1)}% of possessions against their ${fmt(tovTheirs, 1)}%.`,
      tone: ahead ? 'good' : 'bad',
    });
  }

  const orebMine = num(mine.oreb_percent);
  const orebTheirs = num(theirs.oreb_percent);
  if (orebMine != null && orebTheirs != null && Math.abs(orebMine - orebTheirs) >= 8) {
    const ahead = orebMine > orebTheirs;
    stories.push({
      title: ahead ? 'Won the offensive glass' : 'Beaten on the glass',
      detail: `Rebounded ${fmt(orebMine, 1)}% of own misses to their ${fmt(orebTheirs, 1)}%.`,
      tone: ahead ? 'good' : 'bad',
    });
  }

  const leadTime = num(mine.tot_timeleading);
  if (leadTime != null && leadTime >= 30) {
    stories.push({
      title: 'Led throughout',
      detail: `In front for ${fmt(leadTime, 1)} of the 40 minutes.`,
      tone: 'good',
    });
  } else if (leadTime != null && leadTime > 0 && leadTime <= 8 && won === true) {
    stories.push({
      title: 'Won it late',
      detail: `Only led for ${fmt(leadTime, 1)} minutes — this one turned at the end.`,
      tone: 'neutral',
    });
  }

  const changes = num(mine.tot_leadchanges);
  const level = num(mine.tot_timesscoreslevel);
  if (changes != null && changes >= 8) {
    stories.push({
      title: 'A genuine back-and-forth',
      detail: `${fmt(changes)} lead changes${level != null ? ` and ${fmt(level)} ties` : ''}.`,
      tone: 'neutral',
    });
  }

  const run = num(mine.tot_biggestscoringrun);
  const oppRun = num(theirs.tot_biggestscoringrun);
  if (run != null && oppRun != null && run - oppRun >= 6) {
    stories.push({
      title: 'Landed the bigger punch',
      detail: `Best run of ${fmt(run)} unanswered against their ${fmt(oppRun)}.`,
      tone: 'good',
    });
  }

  // Lead with the factors that explain the result: on a loss the things that
  // went wrong are the story, on a win the things that went right. Neutral
  // colour ("back-and-forth", "won it late") sits last either way.
  const rank = (tone: Storyline['tone']) => {
    if (tone === 'neutral') return 2;
    if (won === null) return 1;
    return (won && tone === 'good') || (!won && tone === 'bad') ? 0 : 1;
  };
  return stories.sort((a, b) => rank(a.tone) - rank(b.tone));
}

export interface PlayerLine {
  name: string;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  stocks: number | null;
  plusMinus: number | null;
  fg: string | null;
  tp: string | null;
  ts: number | null;
  usage: number | null;
  minutes: number | null;
}

function shootingLine(made: unknown, att: unknown): string | null {
  const m = num(made);
  const a = num(att);
  if (m == null || a == null || a === 0) return null;
  return `${m}/${a}`;
}

export function toPlayerLine(row: PlayerGameRow): PlayerLine {
  const stl = num(row.ssteals);
  const blk = num(row.sblocks);
  return {
    name: row.full_name || 'Unknown',
    points: num(row.spoints),
    rebounds: num(row.sreboundstotal),
    assists: num(row.sassists),
    stocks: stl == null && blk == null ? null : (stl ?? 0) + (blk ?? 0),
    plusMinus: num(row.splusminuspoints),
    fg: shootingLine(row.sfieldgoalsmade, row.sfieldgoalsattempted),
    tp: shootingLine(row.sthreepointersmade, row.sthreepointersattempted),
    ts: num(row.ts_percent),
    usage: num(row.usage_percent),
    minutes: num(row.sminutes),
  };
}

/** Top performers by points, with anyone who didn't play filtered out. */
export function topPerformers(rows: PlayerGameRow[], limit = 3): PlayerLine[] {
  return rows
    .map(toPlayerLine)
    .filter((p) => (p.minutes ?? 0) > 0 || (p.points ?? 0) > 0)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, limit);
}
