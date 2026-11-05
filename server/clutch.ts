/**
 * Swish+ clutch numbers: the last five minutes of the final quarter and any overtime, while the score
 * is within five (the usual definition). Built from the play-by-play (live_events) for the score,
 * clock and box events, and from lineup stints for who was on the floor. Free of I/O so it can be
 * tested on its own.
 *
 * Trust, per team-game (decided by the caller and passed in):
 *   - team numbers need the play-by-play's points to add up to the team's final score;
 *   - on-court numbers (minutes, +/- with a player on) need the lineup tracking to match the box
 *     score, the same rule as the lineups;
 *   - a player's own scoring and shooting need every player's play-by-play points to match the box
 *     score, because scorer corrections don't always reach the play-by-play.
 */

import { playerNameKey } from "@shared/playerNameKey";

export const CLUTCH_SECONDS = 300;
export const CLUTCH_MARGIN = 5;

export type ClutchEvent = {
  game_key: string;
  team_id: string | null;
  action_number: number;
  period: number;
  period_type: string | null;
  clock: string | null;
  shirt_number: string | null;
  player_name: string | null;
  action_type: string | null;
  sub_type: string | null;
  success: boolean | null;
  score: string | null;
  team_no: number | null;
};

export type ClutchStint = {
  id: string;
  game_key: string;
  team_id: string;
  start_action: number;
  end_action: number;
};

/** One person on the floor in a stint (player_on_court_stints). */
export type ClutchMember = { stint_id: string; shirt_number: string | null; player_name: string | null; player_id: string | null };

export type Trust = {
  /** "gameKey|teamId": the play-by-play's points add up to the final score. */
  teamTotals: Set<string>;
  /** "gameKey|teamId": lineup tracking matches the box score. */
  lineups: Set<string>;
  /** "gameKey|teamId": every player's play-by-play points match the box score. */
  credit: Set<string>;
};

export type Side = { pts: number; fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number; oreb: number; dreb: number; tov: number };
const emptySide = (): Side => ({ pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0 });

export type TeamClutch = {
  team_id: string;
  games: Set<string>;
  wins: number;
  losses: number;
  secs: number;
  own: Side;
  opp: Side;
};

export type PlayerClutch = {
  team_id: string;
  key: string;
  names: Map<string, number>;
  ids: Map<string, number>;
  /** On the floor in clutch time (trusted lineup games). */
  games: Set<string>;
  secs: number;
  onPf: number;
  onPa: number;
  /** Their own box numbers in clutch time (trusted credit games). */
  boxGames: Set<string>;
  pts: number;
  fgm: number;
  fga: number;
  fg3m: number;
  fg3a: number;
  ftm: number;
  fta: number;
  ast: number;
  reb: number;
  tov: number;
  stl: number;
  blk: number;
};

/** "07:32:50" or "07:32" -> seconds left in the period. */
export function clockSeconds(clock: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(clock ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(m[3]) / 100 : 0);
}

/** "61-57" -> [61, 57] (home, away). */
export function parseScore(score: string | null | undefined): [number, number] | null {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(score ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const shotPoints = (e: ClutchEvent) =>
  !e.success ? 0 : e.action_type === "3pt" ? 3 : e.action_type === "2pt" ? 2 : e.action_type === "freethrow" ? 1 : 0;

/**
 * Points each player scored in a game's play-by-play, per team, for the trust checks, keyed by name
 * ("m john"): older seasons' feeds carry no shirt numbers. Baskets logged with no name sit under ""
 * so they still count toward the team's total (and, since no box-score player has that key, mark
 * the game's credit as unreliable).
 */
export function playByPlayPoints(events: ClutchEvent[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (!e.team_id) continue;
    const pts = shotPoints(e);
    const who = playerNameKey(e.player_name);
    if (pts === 0 && !who) continue;
    const k = `${e.game_key}|${e.team_id}`;
    let m = out.get(k);
    if (!m) out.set(k, (m = new Map()));
    m.set(who, (m.get(who) || 0) + pts);
  }
  return out;
}

type Lineup = { stint: ClutchStint; members: { key: string; shirt: string | null; name: string | null; id: string | null }[] };

/**
 * A game's events in time order, with each one's segment (1 = first period, then on through any
 * overtime) and which segments are overtime.
 *
 * - The feed's action numbers aren't always in time order: substitutions are often logged after the
 *   plays that followed them. So events go in segment order, then clock counting down, then action
 *   number, and stints are placed by where their boundary actions fall in that order.
 * - Some feeds mark overtime (period_type "OVERTIME", period 1, 2...); others leave the type blank
 *   and either carry on (period 5) or restart at period 1. Segments follow the feed's own "period
 *   start" events in order, and a segment no longer than five minutes is overtime.
 */
export function timeline(events: ClutchEvent[]) {
  const byNumber = events.slice().sort((a, b) => a.action_number - b.action_number);
  const starts: { action: number; period: number; ot: boolean; seg: number }[] = [];
  for (const e of byNumber) {
    if (e.action_type === "period" && e.sub_type === "start") {
      starts.push({ action: e.action_number, period: e.period, ot: e.period_type === "OVERTIME", seg: starts.length + 1 });
    }
  }
  const segOf = new Map<ClutchEvent, number>();
  for (const e of byNumber) {
    const ot = e.period_type === "OVERTIME";
    const fits = (st: { period: number; ot: boolean }) => st.period === e.period && (st.ot === ot || e.period_type == null);
    let seg: number | null = null;
    const prevIdx = starts.findIndex((st) => st.action > e.action_number) - 1;
    const prev = prevIdx >= 0 ? starts[prevIdx] : prevIdx === -2 ? starts[starts.length - 1] : undefined;
    const next = prevIdx >= -1 ? starts[prevIdx + 1] : undefined;
    if (prev && fits(prev)) seg = prev.seg;
    // Logged just before its period's start (substitutions, a technical at the restart).
    else if (next && fits(next)) seg = next.seg;
    else {
      // Logged late, after a later period started: the latest earlier start of its own period.
      for (const st of starts) {
        if (st.action > e.action_number) break;
        if (fits(st)) seg = st.seg;
      }
    }
    if (seg == null) seg = starts.find(fits)?.seg ?? null;
    if (seg == null) seg = ot ? 100 + e.period : e.period;
    segOf.set(e, seg);
  }
  const maxClock = new Map<number, number>();
  for (const e of byNumber) {
    const seg = segOf.get(e)!;
    maxClock.set(seg, Math.max(maxClock.get(seg) ?? 0, clockSeconds(e.clock) ?? 0));
  }
  const otSegs = new Set<number>();
  segOf.forEach((seg, e) => {
    if (e.period_type === "OVERTIME" || (seg > 1 && (maxClock.get(seg) ?? 0) <= 300 && (maxClock.get(seg) ?? 0) > 0)) otSegs.add(seg);
  });
  const regular = Array.from(maxClock.keys()).filter((seg) => !otSegs.has(seg));
  const lastRegular = regular.length ? Math.max(...regular) : 0;
  const seg = (e: ClutchEvent) => segOf.get(e) ?? e.period;
  const evs = byNumber.slice().sort((a, b) => seg(a) - seg(b) || (clockSeconds(b.clock) ?? 0) - (clockSeconds(a.clock) ?? 0) || a.action_number - b.action_number);
  return { evs, seg, isOvertime: (s: number) => otSegs.has(s), lastRegular };
}

/**
 * The lineup on the floor for an event (start < position <= end), and the lineup after it
 * (start <= position < end): a substitution ends one stint and starts the next on the same action.
 */
function makeFinder(lineups: Lineup[], posOf: (action: number) => number) {
  const placed = lineups
    .map((l) => ({ l, start: posOf(l.stint.start_action), end: posOf(l.stint.end_action) }))
    .sort((a, b) => a.start - b.start);
  return {
    during(p: number): Lineup | null {
      for (const x of placed) if (x.start < p && p <= x.end) return x.l;
      return placed.find((x) => x.start === p)?.l ?? null;
    },
    after(p: number): Lineup | null {
      for (const x of placed) if (x.start <= p && p < x.end) return x.l;
      const last = placed[placed.length - 1];
      return last && last.end === p ? last.l : null;
    },
  };
}

function addShot(side: Side, e: ClutchEvent) {
  const t = e.action_type;
  if (t === "2pt" || t === "3pt") {
    side.fga += 1;
    if (t === "3pt") side.fg3a += 1;
    if (e.success) {
      side.fgm += 1;
      if (t === "3pt") side.fg3m += 1;
    }
  } else if (t === "freethrow") {
    side.fta += 1;
    if (e.success) side.ftm += 1;
  } else if (t === "rebound") {
    if (e.sub_type === "offensive") side.oreb += 1;
    else if (e.sub_type === "defensive") side.dreb += 1;
  } else if (t === "turnover") {
    side.tov += 1;
  }
  side.pts += shotPoints(e);
}

export type ClutchResult = {
  teams: Map<string, TeamClutch>;
  players: Map<string, PlayerClutch>;
  /** Per stint id: points scored by its team in that stint by this module's reckoning (for checks). */
  stintPoints: Map<string, number>;
  /** "gameKey|teamId" left out because two teammates share a name the feed gives only as an initial. */
  leftOut: { lineups: Set<string>; credit: Set<string> };
};

/**
 * Walks every game's play-by-play once. `events` may hold many games in any order; `stints` and
 * `members` are the lineup stints for the same games.
 */
export function computeClutchStats(events: ClutchEvent[], stints: ClutchStint[], members: ClutchMember[], trust: Trust): ClutchResult {
  const teams = new Map<string, TeamClutch>();
  const players = new Map<string, PlayerClutch>();
  const stintPoints = new Map<string, number>();

  const membersByStint = new Map<string, ClutchMember[]>();
  for (const m of members) {
    const id = String(m.stint_id);
    const list = membersByStint.get(id) ?? [];
    list.push(m);
    membersByStint.set(id, list);
  }
  // Teammates who share an initial and surname (two sisters, both "S. Laditan-Adebiyi") share a
  // name key. Where two of them are ever on the floor together, that team tells them apart by full
  // name (shirt numbers change from game to game). A team-game where one of them appears only as
  // an initial can't be split, so its lineups (or its player credit) are left out.
  // ("A. Gayle" and "Andre Gayle" in one stint is one player entered twice, not two.)
  const isInitial = (n: string) => (n.trim().split(/\s+/)[0] || "").replace(".", "").length <= 1;
  const fullName = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();
  const teamOfStint = new Map(stints.map((s) => [String(s.id), s.team_id]));
  const shared = new Set<string>(); // "teamId|key"
  membersByStint.forEach((list, stintId) => {
    const full = new Map<string, Set<string>>();
    for (const m of list) {
      const key = playerNameKey(m.player_name);
      if (!key || !m.player_name || isInitial(m.player_name)) continue;
      full.set(key, (full.get(key) ?? new Set()).add(fullName(m.player_name)));
    }
    full.forEach((names, key) => {
      if (names.size > 1) shared.add(`${teamOfStint.get(stintId)}|${key}`);
    });
  });
  /** The player's key; "" when it's a shared key and the name is only an initial. */
  const memberKey = (teamId: string, name: string | null) => {
    const key = playerNameKey(name);
    if (!key || !shared.has(`${teamId}|${key}`)) return key;
    return name && !isInitial(name) ? `${key}#${fullName(name)}` : "";
  };
  // Within one game a shirt is one player, so an initial-only row with a shirt takes the full name
  // worn with that shirt elsewhere in the same game.
  const gameShirt = new Map<string, string>(); // "gameKey|teamId|shirt" -> key
  for (const st of stints) {
    for (const m of membersByStint.get(String(st.id)) ?? []) {
      const key = memberKey(st.team_id, m.player_name);
      if (key.includes("#") && m.shirt_number) gameShirt.set(`${st.game_key}|${st.team_id}|${m.shirt_number}`, key);
    }
  }
  const resolvedKey = (gameKey: string, teamId: string, name: string | null, shirt: string | number | null) =>
    memberKey(teamId, name) || (shirt && playerNameKey(name) ? gameShirt.get(`${gameKey}|${teamId}|${shirt}`) ?? "" : "");
  const unsplit = new Set<string>(); // "gameKey|teamId" whose lineups have an unsplittable name
  const creditLeftOut = new Set<string>();

  const lineupsByTeamGame = new Map<string, Lineup[]>();
  for (const s of stints) {
    const k = `${s.game_key}|${s.team_id}`;
    const list = lineupsByTeamGame.get(k) ?? [];
    const people = (membersByStint.get(String(s.id)) ?? [])
      .map((m) => ({ key: resolvedKey(s.game_key, s.team_id, m.player_name, m.shirt_number), shirt: m.shirt_number, name: m.player_name, id: m.player_id }))
      .filter((m, i, all) => {
        if (!m.key && playerNameKey(m.name)) unsplit.add(k);
        // One person entered twice in a stint counts once.
        return !!m.key && all.findIndex((o) => o.key === m.key) === i;
      });
    list.push({ stint: s, members: people });
    lineupsByTeamGame.set(k, list);
  }

  const byGame = new Map<string, ClutchEvent[]>();
  for (const e of events) {
    const list = byGame.get(e.game_key) ?? [];
    list.push(e);
    byGame.set(e.game_key, list);
  }

  const team = (id: string) => {
    let t = teams.get(id);
    if (!t) teams.set(id, (t = { team_id: id, games: new Set(), wins: 0, losses: 0, secs: 0, own: emptySide(), opp: emptySide() }));
    return t;
  };
  const player = (teamId: string, key: string) => {
    const id = `${teamId}|${key}`;
    let p = players.get(id);
    if (!p) {
      p = { team_id: teamId, key, names: new Map(), ids: new Map(), games: new Set(), secs: 0, onPf: 0, onPa: 0, boxGames: new Set(), pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, ast: 0, reb: 0, tov: 0, stl: 0, blk: 0 };
      players.set(id, p);
    }
    return p;
  };
  const note = (p: PlayerClutch, m: { name: string | null; id: string | null }) => {
    if (m.name) p.names.set(m.name, (p.names.get(m.name) || 0) + 1);
    if (m.id) p.ids.set(m.id, (p.ids.get(m.id) || 0) + 1);
  };

  // Free throws belong to the lineup on the floor when the foul was called, even when
  // substitutes come in before the shots (the stints count them that way too).
  const lineupPos = (evs: ClutchEvent[], i: number, seg: (e: ClutchEvent) => number): number => {
    const e = evs[i];
    if (e.action_type !== "freethrow") return i;
    // Walk back over what the feed logs between a foul and its shots (substitutions, timeouts, the
    // fouled-player entry, earlier shots of the set, the team rebound between them, and the odd
    // assist or turnover). The clock on the shots can be a few seconds after the foul's, so the
    // walk only stops at 30 seconds, another kind of play, or the period's edge.
    const between = new Set(["substitution", "timeout", "foulon", "freethrow", "rebound", "assist", "turnover"]);
    const at = clockSeconds(e.clock) ?? 0;
    for (let j = i - 1; j >= 0; j--) {
      const f = evs[j];
      if (seg(f) !== seg(e)) break;
      if ((clockSeconds(f.clock) ?? 0) - at > 30) break;
      if (f.action_type === "foul") return j;
      if (!between.has(f.action_type ?? "")) break;
    }
    return i;
  };

  byGame.forEach((list, gameKey) => {
    const { evs, seg, isOvertime, lastRegular } = timeline(list);
    // Position in time order of each action; a stint boundary missing from the play-by-play falls
    // just after the last action numbered before it.
    const pos = new Map(evs.map((e, i) => [e.action_number, i]));
    const byNumber = evs.map((e, i) => [e.action_number, i] as const).sort((a, b) => a[0] - b[0]);
    const posOf = (action: number) => {
      const exact = pos.get(action);
      if (exact != null) return exact;
      let best = -1;
      for (const [n, i] of byNumber) {
        if (n > action) break;
        best = i;
      }
      return best + 0.5;
    };
    // Which team is home (first number of the score) and which away.
    const sideOf = new Map<string, 0 | 1>();
    for (const e of evs) if (e.team_id && (e.team_no === 1 || e.team_no === 2)) sideOf.set(e.team_id, e.team_no === 1 ? 0 : 1);
    const teamIds = Array.from(sideOf.keys());
    if (teamIds.length !== 2) return;
    const other = (id: string) => teamIds.find((t) => t !== id)!;
    const finders = new Map(teamIds.map((id) => [id, makeFinder(lineupsByTeamGame.get(`${gameKey}|${id}`) ?? [], posOf)]));
    const trusted = (set: Set<string>, id: string) => set.has(`${gameKey}|${id}`) && (set !== trust.lineups || !unsplit.has(`${gameKey}|${id}`));
    // Clutch numbers only use games whose play-by-play adds up to the final score for both teams,
    // so a player's clutch line always sits inside their team's (never more minutes or games).
    const counted = teamIds.every((id) => trusted(trust.teamTotals, id));
    const shirtKeys = new Map<string, string>();
    for (const id of teamIds) {
      for (const l of lineupsByTeamGame.get(`${gameKey}|${id}`) ?? []) {
        for (const m of l.members) if (m.shirt) shirtKeys.set(`${id}|${m.shirt}`, m.key);
      }
    }
    // The player behind an event: their key, or for a shared key their full name, or the shirt
    // worn in this game. "" when it can't be told.
    const ownKey = (teamId: string, e: ClutchEvent) => {
      const byName = memberKey(teamId, e.player_name);
      if (byName) return byName;
      if (playerNameKey(e.player_name) && !shared.has(`${teamId}|${playerNameKey(e.player_name)}`)) return "";
      return (e.shirt_number ? shirtKeys.get(`${teamId}|${e.shirt_number}`) : "") || "";
    };
    // Teams whose clutch-relevant events include a shared name that can't be split: their own
    // lines are left out of this game rather than given to the wrong sister.
    const creditUnsplit = new Set<string>();
    for (const e of evs) {
      if (!e.team_id || !e.player_name) continue;
      const key = playerNameKey(e.player_name);
      if (key && shared.has(`${e.team_id}|${key}`) && !ownKey(e.team_id, e)) creditUnsplit.add(e.team_id);
    }
    creditUnsplit.forEach((id) => creditLeftOut.add(`${gameKey}|${id}`));

    let margin = 0; // home minus away, after the last scored event
    let final: [number, number] | null = null;
    const hadClutch = new Set<string>();

    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      const clock = clockSeconds(e.clock);
      const inWindow = clock != null && (isOvertime(seg(e)) || seg(e) === lastRegular);
      const before = margin;
      const s = parseScore(e.score);
      if (s) {
        margin = s[0] - s[1];
        final = s;
      }

      // Box events in clutch: the score was within five before the play.
      if (counted && inWindow && clock! <= CLUTCH_SECONDS && Math.abs(before) <= CLUTCH_MARGIN && e.team_id && sideOf.has(e.team_id)) {
        const own = e.team_id;
        const opp = other(own);
        addShot(team(own).own, e);
        addShot(team(opp).opp, e);
        hadClutch.add(own);
        hadClutch.add(opp);
        const pts = shotPoints(e);
        // On-court +/- for both lineups.
        if (pts > 0) {
          for (const [tid, sign] of [[own, 1], [opp, -1]] as const) {
            if (!trusted(trust.lineups, tid)) continue;
            const l = finders.get(tid)!.during(lineupPos(evs, i, seg));
            if (!l) continue;
            for (const m of l.members) {
              const p = player(tid, m.key);
              if (sign > 0) p.onPf += pts;
              else p.onPa += pts;
            }
          }
        }
        // The player's own line, matched by shirt to the lineup on the floor.
        if (trusted(trust.credit, own)) {
          // Same key as the lineups ("m john"); the shirt finds it when the event has no name.
          const key = ownKey(own, e);
          if (key && !creditUnsplit.has(own)) {
            const p = player(own, key);
            note(p, { name: e.player_name, id: null });
            p.boxGames.add(gameKey);
            p.pts += pts;
            const t = e.action_type;
            if (t === "2pt" || t === "3pt") {
              p.fga += 1;
              if (t === "3pt") p.fg3a += 1;
              if (e.success) {
                p.fgm += 1;
                if (t === "3pt") p.fg3m += 1;
              }
            } else if (t === "freethrow") {
              p.fta += 1;
              if (e.success) p.ftm += 1;
            } else if (t === "assist") p.ast += 1;
            else if (t === "rebound" && (e.sub_type === "offensive" || e.sub_type === "defensive")) p.reb += 1;
            else if (t === "turnover") p.tov += 1;
            else if (t === "steal") p.stl += 1;
            else if (t === "block") p.blk += 1;
          }
        }
      }

      // Every scored event, clutch or not, for the stint-points check.
      if (e.team_id && sideOf.has(e.team_id)) {
        const pts = shotPoints(e);
        if (pts > 0) {
          const l = finders.get(e.team_id)!.during(lineupPos(evs, i, seg));
          if (l) stintPoints.set(String(l.stint.id), (stintPoints.get(String(l.stint.id)) || 0) + pts);
        }
      }

      // Time until the next event in the same period, while the score is within five.
      const next = evs[i + 1];
      if (counted && inWindow && next && seg(next) === seg(e) && Math.abs(margin) <= CLUTCH_MARGIN) {
        const nextClock = clockSeconds(next.clock);
        if (nextClock != null && nextClock < CLUTCH_SECONDS) {
          const secs = Math.max(0, Math.min(clock!, CLUTCH_SECONDS) - nextClock);
          if (secs > 0) {
            for (const tid of teamIds) {
              team(tid).secs += secs;
              hadClutch.add(tid);
              if (!trusted(trust.lineups, tid)) continue;
              const l = finders.get(tid)!.after(i);
              if (!l) continue;
              for (const m of l.members) {
                const p = player(tid, m.key);
                note(p, m);
                p.secs += secs;
                p.games.add(gameKey);
              }
            }
          }
        }
      }
    }

    // Clutch record: games that had clutch time, won or lost.
    if (final) {
      for (const tid of Array.from(hadClutch)) {
        const t = team(tid);
        t.games.add(gameKey);
        const mine = final[sideOf.get(tid)!];
        const theirs = final[1 - sideOf.get(tid)!];
        if (mine > theirs) t.wins += 1;
        else if (mine < theirs) t.losses += 1;
      }
    }
  });

  return { teams, players, stintPoints, leftOut: { lineups: unsplit, credit: creditLeftOut } };
}

/** Possessions from box numbers: FGA + 0.44 FTA - OREB + TOV. */
export const possessions = (s: Side) => s.fga + 0.44 * s.fta - s.oreb + s.tov;

export function teamClutchMetrics(t: TeamClutch) {
  const posf = possessions(t.own);
  const posa = possessions(t.opp);
  const ortg = posf > 0 ? (100 * t.own.pts) / posf : null;
  const drtg = posa > 0 ? (100 * t.opp.pts) / posa : null;
  const r = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    games: t.games.size,
    wins: t.wins,
    losses: t.losses,
    minutes: t.secs / 60,
    pf: t.own.pts,
    pa: t.opp.pts,
    plusMinus: t.own.pts - t.opp.pts,
    ortg,
    drtg,
    net: ortg != null && drtg != null ? ortg - drtg : null,
    efg: r(t.own.fgm + 0.5 * t.own.fg3m, t.own.fga),
    oppEfg: r(t.opp.fgm + 0.5 * t.opp.fg3m, t.opp.fga),
    tovPct: r(t.own.tov, t.own.fga + 0.44 * t.own.fta + t.own.tov),
    oppTovPct: r(t.opp.tov, t.opp.fga + 0.44 * t.opp.fta + t.opp.tov),
    orebPct: r(t.own.oreb, t.own.oreb + t.opp.dreb),
    ftRate: r(t.own.ftm, t.own.fga),
  };
}
