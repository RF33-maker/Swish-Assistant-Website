import { supabase } from "@/lib/supabase";
import { namesMatch, strictNamesMatch, getMostCompleteName } from "@/lib/fuzzyMatch";
import { normalizeTeamName } from "@/lib/teamUtils";
import {
  makeAdvancedAggregator,
  accumulateAdvancedRow,
  mergeAdvancedInto,
  averageAdvanced,
  type AdvancedAggregatorPart,
  type AdvancedAverages,
} from "@/lib/advancedStats";

/**
 * League-wide player season averages with duplicate player identities merged.
 * Moved out of CoachesHub so the game preview's storylines rank players the
 * same way the Coaches Hub and League Leaders do.
 */

export interface PlayerSeasonAverage {
  player_name: string;
  team_id: string;
  team_name: string;
  league_id: string;
  /** Every raw player_stats.player_id merged into this row — a coach's
      player can be split across a few ids (re-imports, name typos), so the
      deep-dive game log / shot chart need the full set to query by. */
  player_ids: string[];
  games_played: number;
  avg_pts: number;
  avg_ast: number;
  avg_reb: number;
  avg_stl: number;
  avg_blk: number;
  avg_tov: number;
  total_pts: number;
  total_ast: number;
  total_reb: number;
  total_stl: number;
  total_blk: number;
  total_tov: number;
  total_fgm: number;
  total_fga: number;
  season_fg_pct: number | null;
  total_tpm: number;
  total_tpa: number;
  season_tp_pct: number | null;
  total_ftm: number;
  total_fta: number;
  season_ft_pct: number | null;
  advanced: AdvancedAverages;
}

interface RawPlayerAgg {
  playerIds: Set<string>;
  name: string;
  teamId: string;
  teamName: string;
  // player_stats has no date column, so this never actually advances past 0 —
  // kept only so a merged cross-team player's displayed team is deterministic
  // (first-seen wins), matching the same limitation the reference page has.
  latestGameTs: number;
  gamesPlayed: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  adv: AdvancedAggregatorPart;
}

function accumulateRawInto(target: RawPlayerAgg, source: RawPlayerAgg) {
  target.gamesPlayed += source.gamesPlayed;
  target.pts += source.pts;
  target.reb += source.reb;
  target.ast += source.ast;
  target.stl += source.stl;
  target.blk += source.blk;
  target.tov += source.tov;
  target.fgm += source.fgm;
  target.fga += source.fga;
  target.tpm += source.tpm;
  target.tpa += source.tpa;
  target.ftm += source.ftm;
  target.fta += source.fta;
  mergeAdvancedInto(target.adv, source.adv);
  target.name = getMostCompleteName([target.name, source.name]);
  source.playerIds.forEach(id => target.playerIds.add(id));
  if (source.latestGameTs > target.latestGameTs) {
    target.latestGameTs = source.latestGameTs;
    target.teamId = source.teamId;
    target.teamName = source.teamName;
  }
}

// Player identity in `player_stats` isn't always one row per real human — the same
// player can end up under multiple `player_id`s (re-imports, name typos across
// games). The pre-aggregated `v_player_season_averages` view has no way to dedupe
// that, so it was showing the same coach's player twice under slightly different
// names. This fetches raw per-game rows and applies the same two-pass fuzzy-name
// merge (same-team, then cross-team for mid-season team switches) already proven
// out on the public League Leaders page (`client/src/pages/pages/league-leaders/[slug].tsx`),
// rather than inventing a second dedupe strategy.
export async function fetchAndMergePlayerRankings(leagueId: string): Promise<PlayerSeasonAverage[]> {
  let allRows: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from('player_stats')
      .select('player_id, id, full_name, firstname, familyname, team_id, team_name, game_key, spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted, efg_percent, ts_percent, three_point_rate, ast_percent, oreb_percent, dreb_percent, reb_percent, tov_percent, usage_percent, pie, off_rating, def_rating, net_rating, pts_percent_2pt, pts_percent_3pt, pts_percent_ft, pts_percent_midrange, pts_percent_pitp, pts_percent_fastbreak, pts_percent_second_chance, pts_percent_off_turnovers')
      .eq('league_id', leagueId)
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) { hasMore = false; break; }
    allRows = allRows.concat(data);
    hasMore = data.length === pageSize;
    page++;
  }

  // Pass 0: group by raw player_id (or row id if unresolved) — one bucket per
  // distinct database identity, exactly mirroring the source rows.
  const byId = new Map<string, RawPlayerAgg>();
  for (const row of allRows) {
    const key = row.player_id || row.id;
    const name = row.full_name || `${row.firstname || ''} ${row.familyname || ''}`.trim() || 'Unknown Player';
    let agg = byId.get(key);
    if (!agg) {
      agg = {
        playerIds: new Set([key]),
        name,
        teamId: row.team_id,
        teamName: row.team_name || 'Unknown Team',
        latestGameTs: 0,
        gamesPlayed: 0,
        pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
        adv: makeAdvancedAggregator(),
      };
      byId.set(key, agg);
    }
    agg.gamesPlayed += 1;
    agg.pts += row.spoints || 0;
    agg.reb += row.sreboundstotal || 0;
    agg.ast += row.sassists || 0;
    agg.stl += row.ssteals || 0;
    agg.blk += row.sblocks || 0;
    agg.tov += row.sturnovers || 0;
    agg.fgm += row.sfieldgoalsmade || 0;
    agg.fga += row.sfieldgoalsattempted || 0;
    agg.tpm += row.sthreepointersmade || 0;
    agg.tpa += row.sthreepointersattempted || 0;
    agg.ftm += row.sfreethrowsmade || 0;
    agg.fta += row.sfreethrowsattempted || 0;
    accumulateAdvancedRow(agg.adv, row);
  }

  // Pass 1: merge fuzzy-name duplicates within the same team.
  const sameTeamMerged: RawPlayerAgg[] = [];
  Array.from(byId.values()).forEach(player => {
    const playerTeamNormalized = normalizeTeamName(player.teamName);
    const existing = sameTeamMerged.find(p =>
      normalizeTeamName(p.teamName) === playerTeamNormalized && namesMatch(player.name, p.name)
    );
    if (existing) {
      accumulateRawInto(existing, player);
    } else {
      sameTeamMerged.push({ ...player, playerIds: new Set(player.playerIds) });
    }
  });

  // Pass 2: merge strict-name duplicates across different teams (mid-season
  // team switchers), guarded so overlapping player_ids never double-count.
  const crossTeamMerged: RawPlayerAgg[] = [];
  sameTeamMerged.forEach(player => {
    const existing = crossTeamMerged.find(p => {
      let overlaps = false;
      player.playerIds.forEach(id => { if (p.playerIds.has(id)) overlaps = true; });
      return !overlaps && strictNamesMatch(player.name, p.name);
    });
    if (existing) {
      accumulateRawInto(existing, player);
    } else {
      crossTeamMerged.push({ ...player, playerIds: new Set(player.playerIds) });
    }
  });

  return crossTeamMerged.map((p): PlayerSeasonAverage => ({
    player_name: p.name,
    team_id: p.teamId,
    team_name: p.teamName,
    league_id: leagueId,
    player_ids: Array.from(p.playerIds),
    games_played: p.gamesPlayed,
    avg_pts: p.gamesPlayed ? p.pts / p.gamesPlayed : 0,
    avg_ast: p.gamesPlayed ? p.ast / p.gamesPlayed : 0,
    avg_reb: p.gamesPlayed ? p.reb / p.gamesPlayed : 0,
    avg_stl: p.gamesPlayed ? p.stl / p.gamesPlayed : 0,
    avg_blk: p.gamesPlayed ? p.blk / p.gamesPlayed : 0,
    avg_tov: p.gamesPlayed ? p.tov / p.gamesPlayed : 0,
    total_pts: p.pts,
    total_ast: p.ast,
    total_reb: p.reb,
    total_stl: p.stl,
    total_blk: p.blk,
    total_tov: p.tov,
    total_fgm: p.fgm,
    total_fga: p.fga,
    season_fg_pct: p.fga > 0 ? (p.fgm / p.fga) * 100 : null,
    total_tpm: p.tpm,
    total_tpa: p.tpa,
    season_tp_pct: p.tpa > 0 ? (p.tpm / p.tpa) * 100 : null,
    total_ftm: p.ftm,
    total_fta: p.fta,
    season_ft_pct: p.fta > 0 ? (p.ftm / p.fta) * 100 : null,
    advanced: averageAdvanced(p.adv),
  }));
}
