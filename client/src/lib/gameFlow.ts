// Game flow / biggest runs / lead changes, derived from the same `live_events`
// play-by-play rows InlineGameDetail.tsx and GamePage.tsx already fetch for
// their "Feed" tab — no new query, just a different read of data already in
// hand. team_no=1 is always the home team, team_no=2 always away (verified
// against real final scores: summing made-basket points by team_no=1 across
// a whole season matched every home team's actual final score exactly).

export interface RawGameEvent {
  action_number: number | null;
  period: number | null;
  clock: string | null;
  team_no: number | null;
  player_name: string | null;
  action_type: string | null;
  sub_type: string | null;
  success: boolean | null;
  scoring: boolean | null;
  score: string | null;
}

export interface FlowPoint {
  /** Chronological index, not wall-clock time — robust to OT periods of
      different lengths and missing clock data, and all a line chart needs
      is a monotonic x-axis. */
  index: number;
  period: number;
  clock: string | null;
  homeScore: number;
  awayScore: number;
  margin: number; // home - away
  scoringTeamNo: 1 | 2;
  playerName: string | null;
}

export interface Run {
  teamNo: 1 | 2;
  points: number;
  startIndex: number;
  endIndex: number;
  startPeriod: number;
  endPeriod: number;
  startClock: string | null;
  endClock: string | null;
  marginBefore: number;
  marginAfter: number;
}

export interface LeadChangeSummary {
  changes: number;
  timesTied: number;
  biggestLead: { margin: number; teamNo: 1 | 2; period: number; clock: string | null } | null;
}

/** Chronological, made-basket-only events with the running score parsed out. */
export function parseGameFlow(rawEvents: RawGameEvent[]): FlowPoint[] {
  const made = rawEvents
    .filter(e => e.scoring && e.success && e.score && (e.team_no === 1 || e.team_no === 2))
    .sort((a, b) => (a.action_number ?? 0) - (b.action_number ?? 0));

  const points: FlowPoint[] = [];
  made.forEach((e, i) => {
    const parts = (e.score ?? '').split('-').map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) return;
    const [homeScore, awayScore] = parts;
    points.push({
      index: i,
      period: e.period ?? 1,
      clock: e.clock,
      homeScore,
      awayScore,
      margin: homeScore - awayScore,
      scoringTeamNo: e.team_no as 1 | 2,
      playerName: e.player_name,
    });
  });
  return points;
}

export interface OvertimeScore {
  /** Continuous numbering: 5 is the first overtime, 6 the second. */
  period: number;
  home: number;
  away: number;
}

/**
 * Points each team scored in each overtime.
 *
 * Only quarters 1-4 are stored per team, so overtime has to come from the
 * play-by-play: the running score at the end of an overtime, less the running
 * score at the end of the period before it. Expects events whose periods are
 * already continuous (overtime from 5). Returns [] if the scores don't add up
 * (a score going backwards), so callers can fall back to something coarser.
 */
export function overtimeScores(rawEvents: RawGameEvent[]): OvertimeScore[] {
  // Running score at the end of each period that had any scoring, in order.
  const ends: { period: number; home: number; away: number }[] = [];
  for (const p of parseGameFlow(rawEvents)) {
    const last = ends[ends.length - 1];
    if (last && last.period === p.period) { last.home = p.homeScore; last.away = p.awayScore; }
    else ends.push({ period: p.period, home: p.homeScore, away: p.awayScore });
  }

  const byPeriod = new Map<number, OvertimeScore>();
  for (let i = 0; i < ends.length; i++) {
    if (ends[i].period <= 4) continue;
    const prev = ends[i - 1];
    const home = ends[i].home - (prev?.home ?? 0);
    const away = ends[i].away - (prev?.away ?? 0);
    if (home < 0 || away < 0) return [];
    byPeriod.set(ends[i].period, { period: ends[i].period, home, away });
  }
  if (byPeriod.size === 0) return [];

  // A scoreless overtime has no scoring plays to find, but it still happened: one
  // that has just started in a live game, or an empty one in between. Count any
  // overtime the events mention, scoring or not.
  const out: OvertimeScore[] = [];
  const lastOt = Math.max(
    ...Array.from(byPeriod.keys()),
    ...rawEvents.map((e) => e.period ?? 0),
  );
  for (let p = 5; p <= lastOt; p++) out.push(byPeriod.get(p) ?? { period: p, home: 0, away: 0 });
  return out;
}

/**
 * A "run" is points scored by one team uninterrupted by the other team
 * scoring — the standard broadcast definition. Returns the top `topN` by
 * point total, biggest first.
 */
export function computeBiggestRuns(flow: FlowPoint[], topN = 3, minPoints = 6): Run[] {
  if (flow.length === 0) return [];

  const runs: Run[] = [];
  let current: Run | null = null;
  let prevHome = 0;
  let prevAway = 0;

  for (const point of flow) {
    const gained = point.scoringTeamNo === 1 ? point.homeScore - prevHome : point.awayScore - prevAway;
    if (current && current.teamNo === point.scoringTeamNo) {
      current.points += gained;
      current.endIndex = point.index;
      current.endPeriod = point.period;
      current.endClock = point.clock;
      current.marginAfter = point.margin;
    } else {
      if (current) runs.push(current);
      current = {
        teamNo: point.scoringTeamNo,
        points: gained,
        startIndex: point.index,
        endIndex: point.index,
        startPeriod: point.period,
        endPeriod: point.period,
        startClock: point.clock,
        endClock: point.clock,
        marginBefore: point.margin - gained * (point.scoringTeamNo === 1 ? 1 : -1),
        marginAfter: point.margin,
      };
    }
    prevHome = point.homeScore;
    prevAway = point.awayScore;
  }
  if (current) runs.push(current);

  return runs
    .filter(r => r.points >= minPoints)
    .sort((a, b) => b.points - a.points)
    .slice(0, topN);
}

export function computeLeadChanges(flow: FlowPoint[]): LeadChangeSummary {
  let changes = 0;
  let timesTied = 0;
  let leadingTeamNo: 1 | 2 | 0 = 0; // 0 = tied/no lead yet
  let biggestLead: LeadChangeSummary['biggestLead'] = null;

  for (const point of flow) {
    const side: 1 | 2 | 0 = point.margin > 0 ? 1 : point.margin < 0 ? 2 : 0;
    if (side === 0 && leadingTeamNo !== 0) {
      timesTied++;
    } else if (side !== 0 && leadingTeamNo !== 0 && side !== leadingTeamNo) {
      changes++;
    }
    if (side !== 0) leadingTeamNo = side;

    const absMargin = Math.abs(point.margin);
    if (!biggestLead || absMargin > biggestLead.margin) {
      biggestLead = { margin: absMargin, teamNo: point.margin > 0 ? 1 : 2, period: point.period, clock: point.clock };
    }
  }

  return { changes, timesTied, biggestLead };
}

/** "9:53" from a "09:53:00" / "9:53:00" clock string. */
export function formatClock(clock: string | null): string {
  if (!clock) return '';
  const parts = clock.split(':');
  if (parts.length < 2) return clock;
  const min = parseInt(parts[0], 10);
  const sec = parts[1];
  return `${min}:${sec}`;
}
