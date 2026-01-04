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
        className="absolute left-[55px] top-[38px] w-[520px] h-[680px] overflow-hidden"
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

      {/* Big stacked points numbers on the right - 3 rows */}
      <div 
        className="absolute right-[95px] top-[55px] flex flex-col items-end"
        style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
      >
        <span 
          className="text-[160px] leading-[0.95] font-black italic text-[#e85a24]"
          style={{ fontStyle: "italic" }}
          data-testid="text-points-stack-1"
        >
          {data.points}
        </span>
        <span 
          className="text-[160px] leading-[0.95] font-black italic text-[#e85a24]"
          style={{ fontStyle: "italic" }}
          data-testid="text-points-stack-2"
        >
          {data.points}
        </span>
        <span 
          className="text-[160px] leading-[0.95] font-black italic text-[#e85a24]"
          style={{ fontStyle: "italic" }}
          data-testid="text-points-stack-3"
        >
          {data.points}
        </span>
      </div>

      {/* Score + team logos - centered below photo */}
      <div className="absolute left-[115px] top-[730px] flex items-center gap-3">
        {data.home_logo_url ? (
          <img
            src={data.home_logo_url}
            alt={data.team_name}
            className="w-[65px] h-[65px] object-contain"
            data-testid="img-home-logo"
          />
        ) : (
          <div className="w-[65px] h-[65px]" />
        )}

        <span 
          className="text-[44px] font-black text-[#e85a24] tracking-wide"
          style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
          data-testid="text-score"
        >
          {data.home_score} -{data.away_score}
        </span>

        {data.away_logo_url ? (
          <img
            src={data.away_logo_url}
            alt={data.opponent_name}
            className="w-[65px] h-[65px] object-contain"
            data-testid="img-away-logo"
          />
        ) : (
          <div className="w-[65px] h-[65px]" />
        )}
      </div>

      {/* Main stats values row - above PTS/REB/AST/STL/BLK labels */}
      <div className="absolute left-[72px] top-[868px] flex text-center font-bold">
        <div className="w-[112px] text-[50px]" data-testid="text-points">{data.points}</div>
        <div className="w-[112px] text-[50px]" data-testid="text-rebounds">{data.rebounds}</div>
        <div className="w-[112px] text-[50px]" data-testid="text-assists">{data.assists}</div>
        <div className="w-[112px] text-[50px]" data-testid="text-steals">{data.steals}</div>
        <div className="w-[112px] text-[50px]" data-testid="text-blocks">{data.blocks}</div>
      </div>

      {/* Shooting stats values row - above FG/3PT/FT/TO/TS%/+/- labels - orange */}
      <div className="absolute left-[72px] top-[1048px] flex text-center font-bold text-[#e85a24]">
        <div className="w-[97px] text-[42px]" data-testid="text-fg">{data.fg}</div>
        <div className="w-[97px] text-[42px]" data-testid="text-three-pt">{data.three_pt}</div>
        <div className="w-[97px] text-[42px]" data-testid="text-ft">{data.ft}</div>
        <div className="w-[97px] text-[42px]" data-testid="text-turnovers">{data.turnovers}</div>
        <div className="w-[97px] text-[42px]" data-testid="text-ts-percent">{data.ts_percent}</div>
        <div className="w-[97px] text-[42px] text-[#41ff41]" data-testid="text-plus-minus">{data.plus_minus}</div>
      </div>
    </div>
  );
}
