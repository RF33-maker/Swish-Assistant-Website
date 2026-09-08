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