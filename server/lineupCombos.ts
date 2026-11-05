/**
 * Swish+ lineups: every five-man unit, three-man group and pair a team has used, with ratings and
 * the four factors for and against. Built from the same stints as the free "Best lineups" panel
 * (player_on_court_stints, for who was on) plus lineup_stints (the box numbers of each stint, for
 * both teams). Kept free of I/O so it can be tested on its own.
 */

import type { StintGroup, UnitMember } from "./lineups";

export type ComboSize = 2 | 3 | 5;

/** The box numbers of one stint from lineup_stints. Opponent columns are missing on a few old rows. */
export type StintBox = {
  id: string;
  fg2_made: number | null;
  fg2_attempted: number | null;
  fg3_made: number | null;
  fg3_attempted: number | null;
  ft_made: number | null;
  ft_attempted: number | null;
  oreb: number | null;
  dreb: number | null;
  turnovers: number | null;
  opp_fg2_made: number | null;
  opp_fg2_attempted: number | null;
  opp_fg3_made: number | null;
  opp_fg3_attempted: number | null;
  opp_ft_made: number | null;
  opp_ft_attempted: number | null;
  opp_oreb: number | null;
  opp_dreb: number | null;
  opp_turnovers: number | null;
};

export const STINT_BOX_COLS =
  "id,fg2_made,fg2_attempted,fg3_made,fg3_attempted,ft_made,ft_attempted,oreb,dreb,turnovers," +
  "opp_fg2_made,opp_fg2_attempted,opp_fg3_made,opp_fg3_attempted,opp_ft_made,opp_ft_attempted,opp_oreb,opp_dreb,opp_turnovers";

type Side = { fgm: number; fga: number; fg3m: number; ftm: number; fta: number; oreb: number; dreb: number; tov: number };
const emptySide = (): Side => ({ fgm: 0, fga: 0, fg3m: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, tov: 0 });
const n = (v: number | null | undefined) => Number(v) || 0;

export type Combo = {
  team_id: string;
  /** Name keys of the people in it, sorted. */
  keys: string[];
  secs: number;
  pf: number;
  pa: number;
  posf: number;
  posa: number;
  games: Set<string>;
  own: Side;
  opp: Side;
  members: UnitMember[];
};

export type ComboMetrics = {
  minutes: number;
  games: number;
  pf: number;
  pa: number;
  plusMinus: number;
  ortg: number | null;
  drtg: number | null;
  net: number | null;
  /** The four factors, for (this group on the floor) and against (their opponents). */
  efg: number | null;
  tovPct: number | null;
  orebPct: number | null;
  ftRate: number | null;
  oppEfg: number | null;
  oppTovPct: number | null;
  oppOrebPct: number | null;
  oppFtRate: number | null;
};

/** Every k-sized subset of a sorted list, in order. */
export function subsets<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number) => {
    if (pick.length === k) {
      out.push(pick.slice());
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

/**
 * Adds every stint into each group of `size` people who were on the floor for it. Only stints with
 * exactly five people count, as for the free panel. A pair's numbers are everything that happened
 * while both were on, whoever the other three were.
 */
export function buildCombos(stints: Iterable<StintGroup>, box: Map<string, StintBox>, size: ComboSize): Combo[] {
  const combos = new Map<string, Combo>();
  for (const s of Array.from(stints)) {
    if (s.members.size !== 5 || s.secs <= 0) continue;
    const b = box.get(String(s.id));
    const keys = Array.from(s.members.keys()).sort();
    for (const group of subsets(keys, size)) {
      const id = `${s.team_id}|${group.join("|")}`;
      let c = combos.get(id);
      if (!c) {
        c = {
          team_id: s.team_id,
          keys: group,
          secs: 0, pf: 0, pa: 0, posf: 0, posa: 0,
          games: new Set(),
          own: emptySide(),
          opp: emptySide(),
          members: group.map((k) => ({ key: k, ids: new Map(), names: new Map() })),
        };
        combos.set(id, c);
      }
      c.secs += s.secs;
      c.pf += s.pf;
      c.pa += s.pa;
      c.posf += s.posf;
      c.posa += s.posa;
      c.games.add(s.game_key);
      if (b) {
        c.own.fgm += n(b.fg2_made) + n(b.fg3_made);
        c.own.fga += n(b.fg2_attempted) + n(b.fg3_attempted);
        c.own.fg3m += n(b.fg3_made);
        c.own.ftm += n(b.ft_made);
        c.own.fta += n(b.ft_attempted);
        c.own.oreb += n(b.oreb);
        c.own.dreb += n(b.dreb);
        c.own.tov += n(b.turnovers);
        c.opp.fgm += n(b.opp_fg2_made) + n(b.opp_fg3_made);
        c.opp.fga += n(b.opp_fg2_attempted) + n(b.opp_fg3_attempted);
        c.opp.fg3m += n(b.opp_fg3_made);
        c.opp.ftm += n(b.opp_ft_made);
        c.opp.fta += n(b.opp_ft_attempted);
        c.opp.oreb += n(b.opp_oreb);
        c.opp.dreb += n(b.opp_dreb);
        c.opp.tov += n(b.opp_turnovers);
      }
      for (const um of c.members) {
        const sm = s.members.get(um.key)!;
        sm.ids.forEach((v, pid) => um.ids.set(pid, (um.ids.get(pid) || 0) + v));
        sm.names.forEach((v, name) => um.names.set(name, (um.names.get(name) || 0) + v));
      }
    }
  }
  return Array.from(combos.values());
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function comboMetrics(c: Combo): ComboMetrics {
  const ortg = c.posf > 0 ? (100 * c.pf) / c.posf : null;
  const drtg = c.posa > 0 ? (100 * c.pa) / c.posa : null;
  const efg = (s: Side) => ratio(s.fgm + 0.5 * s.fg3m, s.fga);
  const tov = (s: Side) => ratio(s.tov, s.fga + 0.44 * s.fta + s.tov);
  return {
    minutes: c.secs / 60,
    games: c.games.size,
    pf: c.pf,
    pa: c.pa,
    plusMinus: c.pf - c.pa,
    ortg,
    drtg,
    net: ortg != null && drtg != null ? ortg - drtg : null,
    efg: efg(c.own),
    tovPct: tov(c.own),
    orebPct: ratio(c.own.oreb, c.own.oreb + c.opp.dreb),
    ftRate: ratio(c.own.ftm, c.own.fga),
    oppEfg: efg(c.opp),
    oppTovPct: tov(c.opp),
    oppOrebPct: ratio(c.opp.oreb, c.opp.oreb + c.own.dreb),
    oppFtRate: ratio(c.opp.ftm, c.opp.fga),
  };
}

/**
 * Groups that have played enough together, best net rating first. Same sense check as the free
 * panel: enough possessions, and a plausible number of them for the minutes.
 */
export function rankCombos(combos: Combo[], minMinutes: number): { combo: Combo; m: ComboMetrics }[] {
  return combos
    .map((combo) => ({ combo, m: comboMetrics(combo) }))
    .filter(({ combo, m }) => {
      const possessions = combo.posf + combo.posa;
      return m.minutes >= minMinutes && possessions >= 12 && possessions / m.minutes >= 1.2;
    })
    .sort((a, b) => (b.m.net ?? -Infinity) - (a.m.net ?? -Infinity) || b.m.minutes - a.m.minutes);
}
