import { createHash } from "crypto";
import { supabaseAdmin } from "./supabaseServiceClient";

type TeamRow = {
  team_id: string;
  league_id: string | null;
  name: string;
  logo_url?: string | null;
  description?: string | null;
  created_at?: string | null;
};

type CompetitionRow = {
  league_id: string;
  competition_id: string | null;
  parent_league_id: string | null;
  season: string | null;
  created_at: string | null;
};

type Candidate = TeamRow & {
  score: number;
  reason: "exact" | "fuzzy";
};

export type TeamIdentityDecision = {
  teamName: string;
  teamId?: string;
  sourceTeamId?: string;
  kind: "returning" | "new" | "existing" | "ambiguous";
  confidence: number;
  candidates?: Array<{ teamId: string; name: string; score: number }>;
};

export type TeamIdentitySyncResult = {
  leagueId: string;
  linkedGames: number;
  linkedPlayerStats: number;
  createdTeams: number;
  returningTeams: number;
  existingTeams: number;
  conflicts: string[];
  decisions: TeamIdentityDecision[];
};

function identityKey(name: string): string {
  const normalized = (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+Senior\s+(Men|Women)\s*/gi, " ")
    .replace(/!/g, "")
    .replace(/^#+/, "")
    .replace(/\s+I(?![IVX])\s*$/i, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  const aliases: Record<string, string> = {
    mkbreakers: "miltonkeynesbreakers",
    bath: "bathbasketball",
    diawysctempo: "diawysc",
  };
  return aliases[normalized] || normalized;
}

function teamLevel(name: string): string {
  const value = (name || "").toLowerCase();
  const age = value.match(/\b(u(?:nder)?\s*\d{2}|\d{2}u)\b/)?.[0]?.replace(/\s+/g, "") || "";
  const reserve = value.match(/\b(ii|iii|iv|2|3|reserves?|development)\b/)?.[0] || "";
  const gender = value.match(/\b(women|women's|ladies|men|men's)\b/)?.[0] || "";
  return `${age}|${reserve}|${gender}`;
}

function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(i + range + 1, b.length); j++) {
      if (!bm[j] && a[i] === b[j]) {
        am[i] = true;
        bm[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

function seasonRank(season: string | null): number {
  const year = Number(season?.match(/20\d{2}/)?.[0] || 0);
  const regularBonus = season && !/trophy/i.test(season) ? 1 : 0;
  return year * 10 + regularBonus;
}

function pickCandidate(teamName: string, teams: TeamRow[], competitionById: Map<string, CompetitionRow>): Candidate[] {
  const key = identityKey(teamName);
  const level = teamLevel(teamName);
  const scored = teams
    .filter((team) => teamLevel(team.name) === level)
    .map((team) => {
      const candidateKey = identityKey(team.name);
      const exact = candidateKey === key;
      const score = exact ? 1 : jaroWinkler(key, candidateKey);
      return { ...team, score, reason: exact ? "exact" as const : "fuzzy" as const };
    })
    .filter((team) => team.score >= 0.88);

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const logoDiff = Number(Boolean(b.logo_url)) - Number(Boolean(a.logo_url));
    if (logoDiff) return logoDiff;
    const seasonDiff =
      seasonRank(competitionById.get(b.league_id || "")?.season || null) -
      seasonRank(competitionById.get(a.league_id || "")?.season || null);
    if (seasonDiff) return seasonDiff;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
}

async function getCompetitionScope(leagueId: string): Promise<{
  target: CompetitionRow;
  competitions: CompetitionRow[];
}> {
  const { data: target, error } = await supabaseAdmin
    .from("competitions")
    .select("league_id, competition_id, parent_league_id, season, created_at")
    .eq("league_id", leagueId)
    .single();
  if (error || !target) throw new Error(error?.message || "Competition not found");

  let query = supabaseAdmin
    .from("competitions")
    .select("league_id, competition_id, parent_league_id, season, created_at");
  if (target.competition_id) {
    query = query.eq("competition_id", target.competition_id);
  } else if (target.parent_league_id) {
    query = query.or(`league_id.eq.${target.parent_league_id},parent_league_id.eq.${target.parent_league_id}`);
  } else {
    query = query.or(`league_id.eq.${leagueId},parent_league_id.eq.${leagueId}`);
  }
  const { data, error: scopeError } = await query;
  if (scopeError) throw new Error(scopeError.message);
  return { target, competitions: (data || []) as CompetitionRow[] };
}

export function stableNewTeamId(leagueId: string, name: string): string {
  const hex = createHash("sha256")
    .update(`${leagueId}:${identityKey(name)}:${teamLevel(name)}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function createTeam(leagueId: string, name: string): Promise<TeamRow> {
  const teamId = stableNewTeamId(leagueId, name);
  const row = { team_id: teamId, league_id: leagueId, name };
  const { error } = await supabaseAdmin
    .from("teams")
    .upsert(row, { onConflict: "team_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  const { data, error: readError } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("team_id", teamId)
    .single();
  if (readError || !data) throw new Error(readError?.message || `Could not create ${name}`);
  return data as TeamRow;
}

async function assignScheduleSide(
  leagueId: string,
  side: "home" | "away",
  name: string,
  teamId: string,
  force = false,
): Promise<{ updated: number; conflict?: string }> {
  const nameColumn = side === "home" ? "hometeam" : "awayteam";
  const idColumn = side === "home" ? "home_team_id" : "away_team_id";
  const { data: rows, error: readError } = await supabaseAdmin
    .from("game_schedule")
    .select(`game_key,${idColumn}`)
    .eq("league_id", leagueId)
    .eq(nameColumn, name);
  if (readError) throw new Error(readError.message);

  const conflicting = (rows || []).filter((row: any) => row[idColumn] && row[idColumn] !== teamId);
  if (conflicting.length && !force) {
    return {
      updated: 0,
      conflict: `${name} has ${conflicting.length} ${side} schedule row(s) assigned to a different team ID`,
    };
  }
  const targetKeys = (rows || [])
    .filter((row: any) => force ? row[idColumn] !== teamId : !row[idColumn])
    .map((row: any) => row.game_key);
  if (!targetKeys.length) return { updated: 0 };
  let update = supabaseAdmin
    .from("game_schedule")
    .update({ [idColumn]: teamId })
    .in("game_key", targetKeys)
    .eq("league_id", leagueId)
    .eq(nameColumn, name);
  if (!force) update = update.is(idColumn, null);
  const { error } = await update;
  if (error) throw new Error(error.message);
  return { updated: targetKeys.length };
}

async function assignPlayerStats(
  leagueId: string,
  name: string,
  teamId: string,
  force = false,
): Promise<{ updated: number; conflict?: string }> {
  const { data: rows, error: readError } = await supabaseAdmin
    .from("player_stats")
    .select("id, team_id")
    .eq("league_id", leagueId)
    .eq("team_name", name);
  if (readError) throw new Error(readError.message);
  const conflicting = (rows || []).filter((row: any) => row.team_id && row.team_id !== teamId);
  if (conflicting.length && !force) {
    return {
      updated: 0,
      conflict: `${name} has ${conflicting.length} player stat row(s) assigned to a different team ID`,
    };
  }
  const targetIds = (rows || [])
    .filter((row: any) => force ? row.team_id !== teamId : !row.team_id)
    .map((row: any) => row.id);
  if (!targetIds.length) return { updated: 0 };
  let update = supabaseAdmin
    .from("player_stats")
    .update({ team_id: teamId })
    .in("id", targetIds)
    .eq("league_id", leagueId)
    .eq("team_name", name);
  if (!force) update = update.is("team_id", null);
  const { error } = await update;
  if (error) throw new Error(error.message);
  return { updated: targetIds.length };
}

export async function syncTeamIdentitiesForLeague(
  leagueId: string,
  options: { dryRun?: boolean } = {},
): Promise<TeamIdentitySyncResult> {
  const { target, competitions } = await getCompetitionScope(leagueId);
  const scopeIds = competitions.map((competition) => competition.league_id);
  const competitionById = new Map(competitions.map((competition) => [competition.league_id, competition]));

  const [
    { data: schedule, error: scheduleError },
    { data: allTeams, error: teamsError },
    { data: statsTeams, error: statsError },
  ] = await Promise.all([
    supabaseAdmin
      .from("game_schedule")
      .select("hometeam, awayteam")
      .eq("league_id", leagueId),
    supabaseAdmin
      .from("teams")
      .select("*")
      .in("league_id", scopeIds),
    supabaseAdmin
      .from("player_stats")
      .select("team_name")
      .eq("league_id", leagueId)
      .not("team_name", "is", null),
  ]);
  if (scheduleError) throw new Error(scheduleError.message);
  if (teamsError) throw new Error(teamsError.message);
  if (statsError) throw new Error(statsError.message);

  const names = Array.from(new Set(
    [
      ...(schedule || []).flatMap((game: any) => [game.hometeam, game.awayteam]),
      ...(statsTeams || []).map((stat: any) => stat.team_name),
      ...(allTeams || []).filter((team: any) => team.league_id === leagueId).map((team: any) => team.name),
    ].filter(Boolean),
  )) as string[];
  const currentTeams = ((allTeams || []) as TeamRow[]).filter((team) => team.league_id === leagueId);
  const historicalTeams = ((allTeams || []) as TeamRow[]).filter((team) => team.league_id !== leagueId);
  const decisions: TeamIdentityDecision[] = [];
  const resolved = new Map<string, TeamRow>();
  let createdTeams = 0;

  for (const teamName of names) {
    const current = currentTeams.find((team) =>
      identityKey(team.name) === identityKey(teamName) && teamLevel(team.name) === teamLevel(teamName)
    );
    if (current) {
      resolved.set(teamName, current);
      decisions.push({ teamName, teamId: current.team_id, kind: "existing", confidence: 1 });
      continue;
    }

    const candidates = pickCandidate(teamName, historicalTeams, competitionById);
    const best = candidates[0];
    const runnerUp = candidates.find((candidate) => candidate.team_id !== best?.team_id);
    const exact = best?.score === 1;
    const clearFuzzy = Boolean(best && best.score >= 0.95 && (!runnerUp || best.score - runnerUp.score >= 0.08));

    if (best && (exact || clearFuzzy)) {
      resolved.set(teamName, best);
      decisions.push({
        teamName,
        teamId: best.team_id,
        sourceTeamId: best.team_id,
        kind: "returning",
        confidence: best.score,
      });
      continue;
    }

    if (best) {
      decisions.push({
        teamName,
        kind: "ambiguous",
        confidence: best.score,
        candidates: candidates.slice(0, 3).map((candidate) => ({
          teamId: candidate.team_id,
          name: candidate.name,
          score: candidate.score,
        })),
      });
      continue;
    }

    const created = options.dryRun
      ? { team_id: `new:${identityKey(teamName)}`, league_id: target.league_id, name: teamName }
      : await createTeam(target.league_id, teamName);
    if (!options.dryRun) createdTeams++;
    resolved.set(teamName, created);
    decisions.push({ teamName, teamId: created.team_id, kind: "new", confidence: 1 });
  }

  let linkedGames = 0;
  let linkedPlayerStats = 0;
  const conflicts: string[] = [];
  if (!options.dryRun) {
    for (const [name, team] of Array.from(resolved.entries())) {
      const [home, away, stats] = await Promise.all([
        assignScheduleSide(leagueId, "home", name, team.team_id),
        assignScheduleSide(leagueId, "away", name, team.team_id),
        assignPlayerStats(leagueId, name, team.team_id),
      ]);
      linkedGames += home.updated + away.updated;
      linkedPlayerStats += stats.updated;
      if (home.conflict) conflicts.push(home.conflict);
      if (away.conflict) conflicts.push(away.conflict);
      if (stats.conflict) conflicts.push(stats.conflict);
    }
  }

  return {
    leagueId,
    linkedGames,
    linkedPlayerStats,
    createdTeams,
    returningTeams: decisions.filter((decision) => decision.kind === "returning").length,
    existingTeams: decisions.filter((decision) => decision.kind === "existing").length,
    conflicts,
    decisions,
  };
}

export async function resolveAmbiguousTeam(
  leagueId: string,
  teamName: string,
  sourceTeamId?: string,
): Promise<TeamIdentitySyncResult> {
  let teamId: string;
  let kind: TeamIdentityDecision["kind"];
  if (sourceTeamId) {
    const { competitions } = await getCompetitionScope(leagueId);
    const allowedLeagueIds = new Set(competitions.map((competition) => competition.league_id));
    const { data: source, error } = await supabaseAdmin
      .from("teams")
      .select("team_id, league_id")
      .eq("team_id", sourceTeamId)
      .single();
    if (error || !source) throw new Error(error?.message || "Selected team does not exist");
    if (!source.league_id || !allowedLeagueIds.has(source.league_id)) {
      throw new Error("Selected team is outside this competition's identity scope");
    }
    teamId = sourceTeamId;
    kind = "returning";
  } else {
    const created = await createTeam(leagueId, teamName);
    teamId = created.team_id;
    kind = "new";
  }
  const [home, away, stats] = await Promise.all([
    assignScheduleSide(leagueId, "home", teamName, teamId, true),
    assignScheduleSide(leagueId, "away", teamName, teamId, true),
    assignPlayerStats(leagueId, teamName, teamId, true),
  ]);
  return {
    leagueId,
    linkedGames: home.updated + away.updated,
    linkedPlayerStats: stats.updated,
    createdTeams: kind === "new" ? 1 : 0,
    returningTeams: kind === "returning" ? 1 : 0,
    existingTeams: 0,
    conflicts: [],
    decisions: [{ teamName, teamId, sourceTeamId, kind, confidence: 1 }],
  };
}