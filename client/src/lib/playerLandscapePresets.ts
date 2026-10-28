/**
 * The charts the player landscape comes in: each plots one per-game number against
 * another for every regular in the league, with wording for its axes and corners.
 */

import type { LandscapePreset } from "@/lib/landscapePresets";
import type { PlayerLandscapeMetricKey } from "@/types/landscape";

export const PLAYER_LANDSCAPE_PRESETS: LandscapePreset<PlayerLandscapeMetricKey>[] = [
  {
    id: "scoring",
    label: "Scoring",
    hint: "Points a game against how efficiently they come.",
    title: "SCORING LANDSCAPE",
    x: { metric: "ppg", label: "Points", short: "PTS", title: "POINTS PER GAME", ends: ["FEWER POINTS", "MORE POINTS"] },
    y: { metric: "tsPct", label: "True shooting %", short: "TS%", title: "TRUE SHOOTING %", ends: ["LESS EFFICIENT", "MORE EFFICIENT"], unit: "%" },
    quadrants: { topLeft: "PICK THEIR SPOTS", topRight: "ELITE SCORERS", bottomLeft: "OTHER JOBS", bottomRight: "VOLUME SHOOTERS" },
    bestTopRight: true,
    footnote: "True shooting counts threes and free throws; players with under two shots a game are left off",
  },
  {
    id: "creators",
    label: "Scorers & creators",
    hint: "Points a game against assists a game.",
    title: "SCORE OR CREATE",
    x: { metric: "ppg", label: "Points", short: "PTS", title: "POINTS PER GAME", ends: ["FEWER POINTS", "MORE POINTS"] },
    y: { metric: "apg", label: "Assists", short: "AST", title: "ASSISTS PER GAME", ends: ["FEWER ASSISTS", "MORE ASSISTS"] },
    quadrants: { topLeft: "PASS FIRST", topRight: "DO IT ALL", bottomLeft: "ROLE PLAYERS", bottomRight: "SCORE FIRST" },
    bestTopRight: true,
    footnote: "Per game",
  },
  {
    id: "playmaking",
    label: "Playmaking",
    hint: "Assists a game against assists per turnover.",
    title: "PLAYMAKING",
    x: { metric: "apg", label: "Assists", short: "AST", title: "ASSISTS PER GAME", ends: ["FEWER ASSISTS", "MORE ASSISTS"] },
    y: { metric: "astTo", label: "Assists per turnover", short: "AST/TO", title: "ASSISTS PER TURNOVER", ends: ["LOOSER", "SAFER"] },
    quadrants: { topLeft: "SAFE HANDS", topRight: "FLOOR GENERALS", bottomLeft: "OFF THE BALL", bottomRight: "HIGH RISK, HIGH REWARD" },
    bestTopRight: true,
    footnote: "Assists per game against assists per turnover",
  },
  {
    id: "rebounding",
    label: "Rebounding",
    hint: "Rebounds a game at each end.",
    title: "BATTLE OF THE BOARDS",
    x: { metric: "orebPg", label: "Offensive rebounds", short: "OREB", title: "OFFENSIVE REBOUNDS PER GAME", ends: ["FEWER", "MORE"] },
    y: { metric: "drebPg", label: "Defensive rebounds", short: "DREB", title: "DEFENSIVE REBOUNDS PER GAME", ends: ["FEWER", "MORE"] },
    quadrants: { topLeft: "CLEAN THE GLASS", topRight: "OWN THE BOARDS", bottomLeft: "PERIMETER", bottomRight: "CRASH THE GLASS" },
    bestTopRight: true,
    footnote: "Per game",
  },
  {
    id: "defence",
    label: "Defence",
    hint: "Steals a game against blocks a game.",
    title: "DEFENSIVE PLAYMAKERS",
    x: { metric: "spg", label: "Steals", short: "STL", title: "STEALS PER GAME", ends: ["FEWER STEALS", "MORE STEALS"] },
    y: { metric: "bpg", label: "Blocks", short: "BLK", title: "BLOCKS PER GAME", ends: ["FEWER BLOCKS", "MORE BLOCKS"] },
    quadrants: { topLeft: "RIM PROTECTORS", topRight: "DISRUPTORS", bottomLeft: "QUIET HANDS", bottomRight: "PICKPOCKETS" },
    bestTopRight: true,
    footnote: "Per game",
  },
  {
    id: "threes",
    label: "Three-point shooting",
    hint: "Threes taken a game against how many go in.",
    title: "THREE-POINT PROFILE",
    x: { metric: "threeAttPg", label: "3-point attempts", short: "3PA", title: "THREES ATTEMPTED PER GAME", ends: ["FEWER ATTEMPTS", "MORE ATTEMPTS"], neutral: true },
    y: { metric: "threePct", label: "3-point %", short: "3P%", title: "3-POINT %", ends: ["COLDER", "HOTTER"], unit: "%" },
    quadrants: { topLeft: "SHOOT MORE", topRight: "LET IT FLY", bottomLeft: "STAY INSIDE", bottomRight: "COOL IT" },
    bestTopRight: true,
    footnote: "Players taking at least one three a game",
  },
];
