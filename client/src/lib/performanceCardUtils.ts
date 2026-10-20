import { computeSwishScore } from "@shared/swishScore";

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

/** Swish Score for one game (see shared/swishScore.ts). `won` adds the win bonus when known. */
export function computeSwishScoreFor(stat: GameStatForCard, won?: boolean | null): number {
  return computeSwishScore({
    pts: stat.spoints ?? stat.points,
    reb: stat.sreboundstotal ?? stat.rebounds_total,
    ast: stat.sassists ?? stat.assists,
    stl: stat.ssteals,
    blk: stat.sblocks,
    tov: stat.sturnovers ?? stat.turnovers,
    fga: stat.sfieldgoalsattempted,
    fta: stat.sfreethrowsattempted,
    won,
  });
}
