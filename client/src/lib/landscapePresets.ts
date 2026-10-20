/**
 * The charts the team landscape card comes in. Each plots one team number against
 * another, with the wording for its axes and its four corners written to suit.
 */

import type { LandscapeMetricKey } from "@/types/landscape";

/** One side of a chart. The better (or simply higher) end is always drawn to the right, or at the top. */
export type LandscapeAxis = {
  metric: LandscapeMetricKey;
  /** In the hover details, e.g. "Offensive rating". */
  label: string;
  /** Beside a value where space is short, e.g. "OFF". */
  short: string;
  /** Along the axis, e.g. "POINTS SCORED PER 100". */
  title: string;
  /** The caption at the left (or bottom) end of the axis, and at the right (or top) end. */
  ends: [string, string];
  /** A lower number is the better one (points allowed, turnovers), so the axis runs backwards. */
  lowerIsBetter?: boolean;
  /** Neither end is the good one (pace, how many threes a team takes): no end is picked out. */
  neutral?: boolean;
  unit?: "%";
  signed?: boolean;
};

/** The four corners of a chart, as they sit on the card. */
export type QuadrantLabels = { topLeft: string; topRight: string; bottomLeft: string; bottomRight: string };

export type LandscapePreset = {
  id: string;
  /** In the studio's menu. */
  label: string;
  /** What the chart shows, under the menu. */
  hint: string;
  /** The card's headline. */
  title: string;
  x: LandscapeAxis;
  y: LandscapeAxis;
  quadrants: QuadrantLabels;
  /** Whether top right is the place to be, and is picked out in the card's colour. */
  bestTopRight: boolean;
  /** Both axes are in the same unit and share one league average, so they share one scale. */
  sharedScale?: boolean;
  /** Added to a highlighted team's name instead of its two values. */
  highlightMetric?: { metric: LandscapeMetricKey; short: string };
  /** Small print in the footer. */
  footnote: string;
};

export const LANDSCAPE_PRESETS: LandscapePreset[] = [
  {
    id: "efficiency",
    label: "Efficiency",
    hint: "Points scored against points allowed, per 100 possessions.",
    title: "EFFICIENCY LANDSCAPE",
    x: { metric: "ortg", label: "Offensive rating", short: "OFF", title: "POINTS SCORED PER 100", ends: ["WORSE OFFENCE", "BETTER OFFENCE"] },
    y: { metric: "drtg", label: "Defensive rating", short: "DEF", title: "POINTS ALLOWED PER 100", ends: ["WORSE DEFENCE", "BETTER DEFENCE"], lowerIsBetter: true },
    quadrants: { topLeft: "DEFENSIVE GRIND", topRight: "ELITE", bottomLeft: "WORK TO DO", bottomRight: "OFFENCE HEAVY" },
    bestTopRight: true,
    sharedScale: true,
    highlightMetric: { metric: "net", short: "NET" },
    footnote: "Points per 100 possessions",
  },
  {
    id: "style",
    label: "Style of play",
    hint: "How fast a team plays against how much of its shooting is from three.",
    title: "STYLE OF PLAY",
    x: { metric: "pace", label: "Possessions per game", short: "PACE", title: "POSSESSIONS PER GAME", ends: ["SLOWER", "FASTER"], neutral: true },
    y: { metric: "threeRate", label: "Shots from three", short: "3PA RATE", title: "SHARE OF SHOTS FROM THREE", ends: ["FEWER THREES", "MORE THREES"], neutral: true, unit: "%" },
    quadrants: { topLeft: "PATIENT SHOOTERS", topRight: "RUN & GUN", bottomLeft: "GRIND IT OUT", bottomRight: "ATTACK THE RIM" },
    bestTopRight: false,
    footnote: "Pace (possessions per 40 minutes, so overtime doesn't count extra) against three-point attempt rate",
  },
  {
    id: "shooting",
    label: "Shot making",
    hint: "How well a team shoots against how well its opponents do.",
    title: "SHOT MAKING",
    x: { metric: "efg", label: "Effective FG%", short: "EFG", title: "EFFECTIVE FG%", ends: ["WORSE SHOOTING", "BETTER SHOOTING"], unit: "%" },
    y: { metric: "oppEfg", label: "Opponent effective FG%", short: "OPP EFG", title: "OPPONENT EFFECTIVE FG%", ends: ["WORSE DEFENCE", "BETTER DEFENCE"], lowerIsBetter: true, unit: "%" },
    quadrants: { topLeft: "STOPPERS", topRight: "SHARP AT BOTH ENDS", bottomLeft: "COLD & LEAKY", bottomRight: "SHOOTERS" },
    bestTopRight: true,
    footnote: "Effective FG% counts a three as one and a half baskets",
  },
  {
    id: "turnovers",
    label: "Ball security",
    hint: "How often a team gives the ball away against how often it takes it.",
    title: "BALL SECURITY",
    x: { metric: "tovPct", label: "Turnover rate", short: "TOV", title: "OWN TURNOVER RATE", ends: ["CARELESS", "CAREFUL"], lowerIsBetter: true, unit: "%" },
    y: { metric: "forcedTovPct", label: "Turnovers forced", short: "FORCED", title: "OPPONENT TURNOVER RATE", ends: ["FEWER FORCED", "MORE FORCED"], unit: "%" },
    quadrants: { topLeft: "CHAOS", topRight: "BALL HAWKS", bottomLeft: "GIVING IT AWAY", bottomRight: "SAFE HANDS" },
    bestTopRight: true,
    footnote: "Turnovers as a share of possessions",
  },
  {
    id: "rebounding",
    label: "Rebounding",
    hint: "The share of rebounds a team wins at each end.",
    title: "BATTLE OF THE BOARDS",
    x: { metric: "orebPct", label: "Offensive rebound %", short: "OREB", title: "OFFENSIVE REBOUND %", ends: ["WEAKER", "STRONGER"], unit: "%" },
    y: { metric: "drebPct", label: "Defensive rebound %", short: "DREB", title: "DEFENSIVE REBOUND %", ends: ["WEAKER", "STRONGER"], unit: "%" },
    quadrants: { topLeft: "DEFENSIVE GLASS", topRight: "OWN THE BOARDS", bottomLeft: "OUT-REBOUNDED", bottomRight: "CRASH THE GLASS" },
    bestTopRight: true,
    footnote: "Share of available rebounds won at each end",
  },
  {
    id: "scoring",
    label: "How they score",
    hint: "Points in the paint against three-pointers made.",
    title: "HOW THEY SCORE",
    x: { metric: "paintPpg", label: "Points in the paint", short: "PAINT", title: "POINTS IN THE PAINT PER GAME", ends: ["FEWER", "MORE"] },
    y: { metric: "threeMadePg", label: "3-pointers made", short: "3PM", title: "THREES MADE PER GAME", ends: ["FEWER", "MORE"] },
    quadrants: { topLeft: "LIVE BY THE THREE", topRight: "INSIDE & OUT", bottomLeft: "HARD TO COME BY", bottomRight: "PAINT BULLIES" },
    bestTopRight: true,
    footnote: "Per game",
  },
  {
    id: "depth",
    label: "Depth",
    hint: "Bench points against the average winning margin.",
    title: "BENCH IMPACT",
    x: { metric: "benchPpg", label: "Bench points", short: "BENCH", title: "BENCH POINTS PER GAME", ends: ["THINNER BENCH", "DEEPER BENCH"] },
    y: { metric: "margin", label: "Average margin", short: "MARGIN", title: "AVERAGE MARGIN", ends: ["LOSING", "WINNING"], signed: true },
    quadrants: { topLeft: "STARTERS CARRY", topRight: "DEEP & WINNING", bottomLeft: "SHORT-HANDED", bottomRight: "BUSY BENCH" },
    bestTopRight: true,
    footnote: "Per game",
  },
  {
    id: "transition",
    label: "Transition",
    hint: "Fast-break points against points off turnovers.",
    title: "TRANSITION GAME",
    x: { metric: "fastbreakPpg", label: "Fast-break points", short: "FAST BREAK", title: "FAST-BREAK POINTS PER GAME", ends: ["FEWER", "MORE"] },
    y: { metric: "offTovPpg", label: "Points off turnovers", short: "OFF TOV", title: "POINTS OFF TURNOVERS PER GAME", ends: ["FEWER", "MORE"] },
    quadrants: { topLeft: "PUNISH MISTAKES", topRight: "TRANSITION KINGS", bottomLeft: "HALF-COURT TEAMS", bottomRight: "OFF TO THE RACES" },
    bestTopRight: true,
    footnote: "Per game",
  },
  {
    id: "threes",
    label: "Three-point shooting",
    hint: "How many threes a team takes against how many it makes.",
    title: "THREE-POINT PROFILE",
    x: { metric: "threeAttPg", label: "3-point attempts", short: "3PA", title: "THREES ATTEMPTED PER GAME", ends: ["FEWER ATTEMPTS", "MORE ATTEMPTS"], neutral: true },
    y: { metric: "threePct", label: "3-point %", short: "3P%", title: "3-POINT %", ends: ["COLDER", "HOTTER"], unit: "%" },
    quadrants: { topLeft: "SHOOT MORE", topRight: "LET IT FLY", bottomLeft: "STAY INSIDE", bottomRight: "COOL IT" },
    bestTopRight: true,
    footnote: "Volume against accuracy",
  },
];

export function formatMetric(value: number | null, axis: Pick<LandscapeAxis, "unit" | "signed">): string {
  if (value == null) return "—";
  return `${axis.signed && value > 0 ? "+" : ""}${value.toFixed(1)}${axis.unit ?? ""}`;
}
