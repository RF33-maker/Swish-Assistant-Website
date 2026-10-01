/**
 * Looks and wording for the collectible accolade cards (components/cards/
 * AccoladeCard), shared with their canvas download (generateAccoladeCard) so
 * the two always match.
 */
import type { Accolade, AccoladeTier } from "@/lib/accolades";
import { normalizeHex, shadeHex, tintHex } from "@/lib/colorContrast";

export interface AccoladeTierStyle {
  /** "Diamond" — shown on the card's set line. */
  name: string;
  /** Foil frame, drawn as a 135° gradient through these stops. */
  foil: string[];
  /** The art panel: radial gradient from the centre colour to the edge. */
  base: [string, string];
  /** Headline colour on the card body, for light and dark surfaces. */
  ink: { light: string; dark: string };
}

const TIERS: Record<Exclude<AccoladeTier, "star">, AccoladeTierStyle> = {
  diamond: {
    name: "Diamond",
    foil: ["#c9f7ff", "#6fd6f2", "#f1fdff", "#9bb7ff", "#bff3ff", "#5cc8e8"],
    base: ["#17586a", "#061a21"],
    ink: { light: "#0e7490", dark: "#67e8f9" },
  },
  platinum: {
    name: "Platinum",
    foil: ["#f5f8fa", "#aebcc6", "#ffffff", "#8a9ea9", "#e3e9ed", "#b7c4cc"],
    base: ["#4b5d68", "#141b20"],
    ink: { light: "#475569", dark: "#cbd5e1" },
  },
  gold: {
    name: "Gold",
    foil: ["#fff4c7", "#f2c23f", "#fffbe6", "#c99414", "#ffe38c", "#e0ac25"],
    base: ["#7a5400", "#1f1400"],
    ink: { light: "#a16207", dark: "#fcd34d" },
  },
  silver: {
    name: "Silver",
    foil: ["#f7f9fa", "#bcc4cb", "#ffffff", "#8e98a1", "#dde2e6", "#a9b2ba"],
    base: ["#55606a", "#16191c"],
    ink: { light: "#52525b", dark: "#d4d4d8" },
  },
  bronze: {
    name: "Bronze",
    foil: ["#f6d2ad", "#cf8f55", "#fbe3cb", "#9b5427", "#e8b27f", "#b86a36"],
    base: ["#6e3514", "#1f0e05"],
    ink: { light: "#9a3412", dark: "#fdba74" },
  },
};

/** The tier's look. "Career best" (star) cards take the team's colour. */
export function accoladeTierStyle(tier: AccoladeTier, teamColor: string, readableTeam: string): AccoladeTierStyle {
  if (tier !== "star") return TIERS[tier];
  const team = normalizeHex(teamColor);
  return {
    name: "Career best",
    foil: [tintHex(team, 0.55), team, tintHex(team, 0.75), shadeHex(team, 0.25), tintHex(team, 0.45), team],
    base: [team, shadeHex(team, 0.6)],
    ink: { light: readableTeam, dark: readableTeam },
  };
}

export interface AccoladeCardText {
  /** Small line above the headline, e.g. "All-time record". */
  kicker: string;
  /** The big number, e.g. "51" or "#1". */
  headline: string;
  /** Beside the number, e.g. "PTS". */
  unit: string;
  /** Under the number, e.g. "Single game · vs Essex Rebels". */
  sub: string;
  /** The stamp on the art, e.g. "Record holder". */
  stamp: string;
  /** Bottom-left of the card: the game's date for records, else the season. */
  footer: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fullDate = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const PLACES: Record<string, string> = { "#1": "1st", "#2": "2nd", "#3": "3rd" };

export function accoladeCardText(a: Accolade): AccoladeCardText {
  const game = a.opponent ? `vs ${a.opponent}` : "";
  switch (a.tier) {
    case "diamond":
    case "platinum":
      return {
        kicker: a.tier === "diamond" ? "All-time record" : "Season record",
        headline: a.value ?? "",
        unit: a.unit ?? "",
        sub: ["Single game", game].filter(Boolean).join(" · "),
        stamp: "Record holder",
        footer: fullDate(a.date) || a.seasonLabel || "",
      };
    case "gold":
    case "silver":
    case "bronze":
      return {
        kicker: a.label,
        headline: a.value ?? "",
        unit: "",
        sub: `League ranking${a.unit ? ` · ${a.unit}` : ""}`,
        stamp: `${PLACES[a.value ?? ""] ?? a.value ?? ""} place`,
        footer: a.seasonLabel ?? "",
      };
    default:
      return {
        kicker: "Best-ever season",
        headline: a.value ?? "",
        unit: a.unit ?? "",
        sub: "Season average",
        stamp: "Career best",
        footer: a.seasonLabel ?? "",
      };
  }
}

/** The competition line on the card: its name, or "All-time" records' own. */
export function accoladeSetLine(a: Accolade, competitionName?: string | null) {
  return {
    title: competitionName || (a.seasonLabel && a.seasonLabel !== "All-time" ? a.seasonLabel : "") || "Swish Assistant",
    tier: a.tier === "diamond" ? "Diamond · All-time" : a.tier === "star" ? "Career best" : TIERS[a.tier].name,
  };
}
