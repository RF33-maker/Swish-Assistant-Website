export interface GameStatForCard {
  id: string;
  player_id?: string;
  game_key?: string;
  game_date?: string;
  created_at?: string;
  team_name?: string;
  team?: string;
  opponent?: string;
  spoints?: number;
  points?: number;
  sreboundstotal?: number;
  rebounds_total?: number;
  sassists?: number;
  assists?: number;
  ssteals?: number;
  sblocks?: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sminutes?: string;
  sturnovers?: number;
  turnovers?: number;
  splusminuspoints?: number;
  league_id?: string;
}

export function computeGmSc(stat: GameStatForCard): number {
  const pts = stat.spoints ?? stat.points ?? 0;
  const fgm = stat.sfieldgoalsmade ?? 0;
  const fga = stat.sfieldgoalsattempted ?? 0;
  const ftm = stat.sfreethrowsmade ?? 0;
  const fta = stat.sfreethrowsattempted ?? 0;
  const reb = stat.sreboundstotal ?? stat.rebounds_total ?? 0;
  const ast = stat.sassists ?? stat.assists ?? 0;
  const stl = stat.ssteals ?? 0;
  const blk = stat.sblocks ?? 0;
  const to  = stat.sturnovers ?? stat.turnovers ?? 0;
  return pts + 0.4 * fgm - 0.7 * fga - 0.4 * (fta - ftm) + 0.7 * reb + stl + 0.7 * ast + 0.7 * blk - to;
}
