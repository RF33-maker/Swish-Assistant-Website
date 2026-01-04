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

      {/* Big stacked points numbers on the right */}
      <div 
        className="absolute right-[130px] top-[80px] flex flex-col items-end font-extrabold italic text-[#e85a24]"
        style={{ fontFamily: "Impact, sans-serif" }}
      >
        <span className="text-[140px] leading-[1.1]" data-testid="text-points-stack-1">{data.points}</span>
        <span className="text-[140px] leading-[1.1]" data-testid="text-points-stack-2">{data.points}</span>
        <span className="text-[140px] leading-[1.1]" data-testid="text-points-stack-3">{data.points}</span>
      </div>

      {/* Score + team logos below the photo */}
      <div className="absolute left-[130px] top-[740px] flex items-center gap-4">
        {data.home_logo_url && (
          <img
            src={data.home_logo_url}
            alt={data.team_name}
            className="w-[70px] h-[70px] object-contain"
            data-testid="img-home-logo"
          />
        )}

        <span 
          className="text-[40px] font-bold text-[#e85a24] tracking-wide"
          style={{ fontFamily: "Impact, sans-serif" }}
          data-testid="text-score"
        >
          {data.home_score} -{data.away_score}
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

      {/* Main stats values row (PTS / REB / AST / STL / BLK) */}
      <div className="absolute left-[75px] top-[880px] flex gap-[85px] text-center font-bold">
        <div className="w-[80px] text-[44px]" data-testid="text-points">{data.points}</div>
        <div className="w-[80px] text-[44px]" data-testid="text-rebounds">{data.rebounds}</div>
        <div className="w-[80px] text-[44px]" data-testid="text-assists">{data.assists}</div>
        <div className="w-[80px] text-[44px]" data-testid="text-steals">{data.steals}</div>
        <div className="w-[80px] text-[44px]" data-testid="text-blocks">{data.blocks}</div>
      </div>

      {/* Shooting stats values row (FG / 3PT / FT / TO / TS% / +/-) - orange color */}
      <div className="absolute left-[75px] top-[1040px] flex gap-[60px] text-center font-bold text-[#e85a24]">
        <div className="w-[80px] text-[38px]" data-testid="text-fg">{data.fg}</div>
        <div className="w-[80px] text-[38px]" data-testid="text-three-pt">{data.three_pt}</div>
        <div className="w-[80px] text-[38px]" data-testid="text-ft">{data.ft}</div>
        <div className="w-[80px] text-[38px]" data-testid="text-turnovers">{data.turnovers}</div>
        <div className="w-[80px] text-[38px]" data-testid="text-ts-percent">{data.ts_percent}</div>
        <div className="w-[80px] text-[38px] text-[#41ff41]" data-testid="text-plus-minus">{data.plus_minus}</div>
      </div>
    </div>
  );
}
