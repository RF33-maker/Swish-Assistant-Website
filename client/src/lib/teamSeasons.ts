export type TeamSeasonCompetition = {
  league_id: string;
  name?: string | null;
  season?: string | null;
  slug?: string | null;
};

export type TeamSeasonOption = {
  key: string;
  label: string;
  leagueIds: string[];
};

/** "2026/27" for a competition, read from its season field and name ("Trophy 2026/27", "... 2026-2027"). */
export function competitionSeasonLabel(competition: TeamSeasonCompetition): string {
  return seasonLabel(competition);
}

/** A competition's name without the season on the end: "BCB Trophy 2026-2027" reads "BCB Trophy". */
export function competitionShortName(name: string | null | undefined): string {
  const full = (name || "").trim();
  // "2026-2027", "2026/27" and the short "26-27" on the end.
  const short = full.replace(/[\s,(-]*(?:(?:19|20)\d{2}|\d{2})\s*[-/]\s*(?:19|20)?\d{2}\)?\s*$/, "").trim();
  return short || full;
}

function seasonLabel(competition: TeamSeasonCompetition): string {
  const source = `${competition.season || ""} ${competition.name || ""}`.trim();
  const range = source.match(/((?:19|20)\d{2})\s*[-/]\s*((?:19|20)?\d{2})/);
  if (range) {
    const end = range[2].length === 4 ? range[2].slice(2) : range[2];
    return `${range[1]}/${end}`;
  }

  const singleYear = source.match(/((?:19|20)\d{2})(?!.*(?:19|20)\d{2})/);
  if (singleYear) {
    const endYear = Number(singleYear[1]);
    return `${endYear - 1}/${String(endYear).slice(2)}`;
  }

  return competition.season || competition.name || "Current season";
}

export function buildTeamSeasonOptions(competitions: TeamSeasonCompetition[]): TeamSeasonOption[] {
  const grouped = new Map<string, Set<string>>();
  for (const competition of competitions) {
    if (!competition.league_id) continue;
    const label = seasonLabel(competition);
    if (!grouped.has(label)) grouped.set(label, new Set());
    grouped.get(label)!.add(competition.league_id);
  }

  return Array.from(grouped, ([label, ids]) => ({
    key: label,
    label,
    leagueIds: Array.from(ids),
  })).sort((a, b) => {
    const aYear = Number(a.label.match(/(?:19|20)\d{2}/)?.[0] || 0);
    const bYear = Number(b.label.match(/(?:19|20)\d{2}/)?.[0] || 0);
    return bYear - aYear || b.label.localeCompare(a.label);
  });
}