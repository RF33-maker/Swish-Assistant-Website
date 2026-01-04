import type { PlayerPerformanceV1Data } from "@/types/socialCards";

type Props = { data: PlayerPerformanceV1Data };

export function PlayerPerformanceCardV1({ data }: Props) {
  return (
    <div
      className="
        relative
        w-[1080px] h-[1350px]
        text-white
        overflow-hidden
      "
      style={{
        backgroundImage: "url('/card-templates/player-performance-v1.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
      data-testid="card-player-performance-v1"
    >
      {/* Player photo clipped into the angled shape */}
      <div
        className="
          absolute
          left-[80px] top-[120px]
          w-[420px] h-[520px]
          overflow-hidden
          rounded-[40px]
          [transform:skewY(-6deg)]
          [clip-path:polygon(0%_5%,100%_0%,100%_95%,0%_100%)]
        "
      >
        {data.photo_url && (
          <img
            src={data.photo_url}
            alt={data.player_name}
            className="w-full h-full object-cover [transform:skewY(6deg)]"
            data-testid="img-player-photo"
          />
        )}
      </div>

      {/* Big stacked points numbers */}
      <div className="absolute right-[210px] top-[260px] flex flex-col gap-10 text-[120px] font-extrabold leading-none tracking-tight">
        <span data-testid="text-points-stack-1">{data.points}</span>
        <span data-testid="text-points-stack-2">{data.points}</span>
        <span data-testid="text-points-stack-3">{data.points}</span>
      </div>

      {/* Score + team logos under the image */}
      <div className="absolute left-[330px] top-[680px] flex items-center gap-4">
        {data.home_logo_url && (
          <img
            src={data.home_logo_url}
            alt={data.team_name}
            className="w-[70px] h-[70px] object-contain"
            data-testid="img-home-logo"
          />
        )}

        <span className="text-3xl font-semibold tracking-[0.2em]" data-testid="text-score">
          {data.home_score} - {data.away_score}
        </span>

        {data.away_logo_url && (
          <img
            src={data.away_logo_url}
            alt={data.opponent_name}
            className="w-[70px] h-[70px] object-contain"
            data-testid="img-away-logo"
          />
        )}
      </div>

      {/* Stat labels row: PTS / REB / AST / STL / BLK */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[250px] flex gap-20 text-center text-[22px] font-semibold">
        <div>
          <div className="text-[28px] mb-1" data-testid="text-points">{data.points}</div>
          <div className="text-[16px] uppercase tracking-[0.2em]">PTS</div>
        </div>
        <div>
          <div className="text-[28px] mb-1" data-testid="text-rebounds">{data.rebounds}</div>
          <div className="text-[16px] uppercase tracking-[0.2em]">REB</div>
        </div>
        <div>
          <div className="text-[28px] mb-1" data-testid="text-assists">{data.assists}</div>
          <div className="text-[16px] uppercase tracking-[0.2em]">AST</div>
        </div>
        <div>
          <div className="text-[28px] mb-1" data-testid="text-steals">{data.steals}</div>
          <div className="text-[16px] uppercase tracking-[0.2em]">STL</div>
        </div>
        <div>
          <div className="text-[28px] mb-1" data-testid="text-blocks">{data.blocks}</div>
          <div className="text-[16px] uppercase tracking-[0.2em]">BLK</div>
        </div>
      </div>

      {/* Shooting + advanced stats row: FG / 3PT / FT / TO / TS% / +/- */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[170px] flex gap-16 text-center text-[20px] font-semibold">
        <div>
          <div className="text-[26px] mb-1" data-testid="text-fg">{data.fg}</div>
          <div className="text-[14px] uppercase tracking-[0.2em]">FG</div>
        </div>
        <div>
          <div className="text-[26px] mb-1" data-testid="text-three-pt">{data.three_pt}</div>
          <div className="text-[14px] uppercase tracking-[0.2em]">3PT</div>
        </div>
        <div>
          <div className="text-[26px] mb-1" data-testid="text-ft">{data.ft}</div>
          <div className="text-[14px] uppercase tracking-[0.2em]">FT</div>
        </div>
        <div>
          <div className="text-[26px] mb-1" data-testid="text-turnovers">{data.turnovers}</div>
          <div className="text-[14px] uppercase tracking-[0.2em]">TO</div>
        </div>
        <div>
          <div className="text-[26px] mb-1" data-testid="text-ts-percent">{data.ts_percent}</div>
          <div className="text-[14px] uppercase tracking-[0.2em]">TS%</div>
        </div>
        <div>
          <div className="text-[26px] mb-1 text-[#41ff41]" data-testid="text-plus-minus">
            {data.plus_minus}
          </div>
          <div className="text-[14px] uppercase tracking-[0.2em]">+/-</div>
        </div>
      </div>
    </div>
  );
};
