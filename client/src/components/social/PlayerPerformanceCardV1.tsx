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
          left-[55px] top-[38px]
          w-[520px] h-[680px]
          overflow-hidden
        "
        style={{
          clipPath: "polygon(8% 0%, 100% 5%, 100% 100%, 0% 93%)",
        }}
      >
        {data.photo_url && (
          <img
            src={data.photo_url}
            alt={data.player_name}
            className="w-full h-full object-cover"
            data-testid="img-player-photo"
          />
        )}
      </div>

      {/* Score + team logos */}
      <div className="absolute left-[200px] top-[780px] flex items-center gap-6">
        {data.home_logo_url && (
          <img
            src={data.home_logo_url}
            alt={data.team_name}
            className="w-[80px] h-[80px] object-contain"
            data-testid="img-home-logo"
          />
        )}

        <span className="text-4xl font-bold tracking-[0.15em]" data-testid="text-score">
          {data.home_score} - {data.away_score}
        </span>

        {data.away_logo_url && (
          <img
            src={data.away_logo_url}
            alt={data.opponent_name}
            className="w-[80px] h-[80px] object-contain"
            data-testid="img-away-logo"
          />
        )}
      </div>

      {/* Main stats values row (above PTS / REB / AST / STL / BLK labels on template) */}
      <div className="absolute left-[62px] bottom-[255px] flex gap-[72px] text-center font-bold">
        <div className="w-[85px] text-[36px]" data-testid="text-points">{data.points}</div>
        <div className="w-[85px] text-[36px]" data-testid="text-rebounds">{data.rebounds}</div>
        <div className="w-[85px] text-[36px]" data-testid="text-assists">{data.assists}</div>
        <div className="w-[85px] text-[36px]" data-testid="text-steals">{data.steals}</div>
        <div className="w-[85px] text-[36px]" data-testid="text-blocks">{data.blocks}</div>
      </div>

      {/* Shooting stats values row (above FG / 3PT / FT / TO / TS% / +/- labels on template) */}
      <div className="absolute left-[62px] bottom-[135px] flex gap-[52px] text-center font-semibold">
        <div className="w-[75px] text-[28px]" data-testid="text-fg">{data.fg}</div>
        <div className="w-[75px] text-[28px]" data-testid="text-three-pt">{data.three_pt}</div>
        <div className="w-[75px] text-[28px]" data-testid="text-ft">{data.ft}</div>
        <div className="w-[75px] text-[28px]" data-testid="text-turnovers">{data.turnovers}</div>
        <div className="w-[75px] text-[28px]" data-testid="text-ts-percent">{data.ts_percent}</div>
        <div className="w-[75px] text-[28px] text-[#41ff41]" data-testid="text-plus-minus">{data.plus_minus}</div>
      </div>
    </div>
  );
}
