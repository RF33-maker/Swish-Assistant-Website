import type { PlayerPerformanceV1Data } from "@/types/socialCards";

type Props = { data: PlayerPerformanceV1Data };

// Calculate font size based on name length - longer names get smaller text
function getNameFontSize(name: string): number {
  const len = name.length;
  if (len <= 12) return 52;
  if (len <= 16) return 46;
  if (len <= 20) return 40;
  if (len <= 24) return 36;
  return 32; // Very long names
}

export function PlayerPerformanceCardV1({ data }: Props) {
  const nameFontSize = getNameFontSize(data.player_name);
  
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
      {/* === Player photo clipped into the angled frame === */}
      <div
        className="
          absolute
          left-[95px] top-[45px]
          w-[640px] h-[770px]
          overflow-hidden
          rounded-[46px]
        "
        style={{
          // rough match to your trapezoid
          clipPath: "polygon(0% 1%, 73% 1%, 100% 82%, 0% 100%)",
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

      {/* === Big stacked numbers on the right (individually positioned) === */}
      <div
        className="absolute right-0 top-0"
        style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
      >
        {/* Top Number */}
        <span
          className="absolute right-[310px] top-[70px] text-[170px] leading-[0.9] font-black italic text-[#e85a24]"
          data-testid="text-points-top"
        >
          {data.points}
        </span>
        {/* Top Label - Points */}
        <span className="absolute right-[180px] top-[180px] text-[28px] uppercase tracking-[0.2em] text-white">
          Points
        </span>

        {/* Middle Number */}
        <span
          className="absolute right-[270px] top-[260px] text-[170px] leading-[0.9] font-black italic text-[#e85a24]"
          data-testid="text-points-middle"
        >
          {data.rebounds}
        </span>
        {/* Middle Label - Rebounds */}
        <span className="absolute right-[100px] top-[370px] text-[28px] uppercase tracking-[0.2em] text-white">
          Rebounds
        </span>

        {/* Bottom Number */}
        <span
          className="absolute right-[230px] top-[450px] text-[170px] leading-[0.9] font-black italic text-[#e85a24]"
          data-testid="text-points-bottom"
        >
          {data.assists}
        </span>
        {/* Bottom Label - Assists */}
        <span className="absolute right-[80px] top-[560px] text-[28px] uppercase tracking-[0.2em] text-white">
          Assists
        </span>
      </div>


      {/* === Player name along the slanted base of the photo === */}
      <div
        className="
          absolute
          left-[105px] top-[800px]
          w-[640px]
          origin-left
          [transform:rotate(-12deg)]
          flex justify-center
        "
      >
        <span
          className="
            font-black
            uppercase
            tracking-[0.1em]
            text-white
            text-center
            whitespace-nowrap
          "
          style={{ 
            fontFamily: "Impact, Arial Black, sans-serif",
            fontSize: `${nameFontSize}px`
          }}
          data-testid="text-player-name"
        >
          {data.player_name}
        </span>
      </div>

      {/* === Main stat numbers row (MIN / PTS / REB / AST / STL / BLK) === */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[870px] flex text-center font-semibold">
        <div className="w-[125px]" data-testid="text-minutes">
          <div className="text-[46px] text-white">{data.minutes}</div>
          <div className="text-[22px] uppercase tracking-[0.15em] text-[#e85a24]">MIN</div>
        </div>
        <div className="w-[125px]" data-testid="text-points">
          <div className="text-[46px] text-white">{data.points}</div>
          <div className="text-[22px] uppercase tracking-[0.15em] text-[#e85a24]">PTS</div>
        </div>
        <div className="w-[125px]" data-testid="text-rebounds">
          <div className="text-[46px] text-white">{data.rebounds}</div>
          <div className="text-[22px] uppercase tracking-[0.15em] text-[#e85a24]">REB</div>
        </div>
        <div className="w-[125px]" data-testid="text-assists">
          <div className="text-[46px] text-white">{data.assists}</div>
          <div className="text-[22px] uppercase tracking-[0.15em] text-[#e85a24]">AST</div>
        </div>
        <div className="w-[125px]" data-testid="text-steals">
          <div className="text-[46px] text-white">{data.steals}</div>
          <div className="text-[22px] uppercase tracking-[0.15em] text-[#e85a24]">STL</div>
        </div>
        <div className="w-[125px]" data-testid="text-blocks">
          <div className="text-[46px] text-white">{data.blocks}</div>
          <div className="text-[22px] uppercase tracking-[0.15em] text-[#e85a24]">BLK</div>
        </div>
      </div>

      {/* === Shooting / advanced stat numbers row (FG / 3PT / FT / TO / TS% / +/-) === */}
      <div className="absolute left-1/2 -translate-x-1/2 top-[990px] flex text-center font-semibold">
        <div className="w-[115px]" data-testid="text-fg">
          <div className="text-[40px] text-white">{data.fg}</div>
          <div className="text-[18px] uppercase tracking-[0.15em] text-[#e85a24]">FG</div>
        </div>
        <div className="w-[115px]" data-testid="text-three-pt">
          <div className="text-[40px] text-white">{data.three_pt}</div>
          <div className="text-[18px] uppercase tracking-[0.15em] text-[#e85a24]">3PT</div>
        </div>
        <div className="w-[115px]" data-testid="text-ft">
          <div className="text-[40px] text-white">{data.ft}</div>
          <div className="text-[18px] uppercase tracking-[0.15em] text-[#e85a24]">FT</div>
        </div>
        <div className="w-[115px]" data-testid="text-turnovers">
          <div className="text-[40px] text-white">{data.turnovers}</div>
          <div className="text-[18px] uppercase tracking-[0.15em] text-[#e85a24]">TO</div>
        </div>
        <div className="w-[115px]" data-testid="text-ts-percent">
          <div className="text-[40px] text-white">{data.ts_percent}</div>
          <div className="text-[18px] uppercase tracking-[0.15em] text-[#e85a24]">TS%</div>
        </div>
        <div className="w-[115px]" data-testid="text-plus-minus">
          <div className={`text-[40px] ${data.plus_minus.startsWith('-') ? 'text-[#ff5c5c]' : 'text-[#41ff41]'}`}>{data.plus_minus}</div>
          <div className="text-[18px] uppercase tracking-[0.15em] text-[#e85a24]">+/-</div>
        </div>
      </div>

      {/* === Score + team logos at the bottom === */}
      <div
        className="
          absolute
          left-1/2 -translate-x-1/2 top-[1130px]
          flex items-center justify-center gap-6
        "
      >
        {data.home_logo_url && (
          <img
            src={data.home_logo_url}
            alt={data.team_name}
            className="w-[90px] h-[90px] object-contain"
            data-testid="img-home-logo"
          />
        )}

        <span
          className={`
            text-[56px]
            font-black
            tracking-[0.15em]
            ${data.didWin ? 'text-[#90ff5c]' : 'text-[#ff5c5c]'}
          `}
          style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
          data-testid="text-score"
        >
          {data.home_score} - {data.away_score}
        </span>

        {data.away_logo_url && (
          <img
            src={data.away_logo_url}
            alt={data.opponent_name}
            className="w-[90px] h-[90px] object-contain"
            data-testid="img-away-logo"
          />
        )}
      </div>
    </div>
  );
}
