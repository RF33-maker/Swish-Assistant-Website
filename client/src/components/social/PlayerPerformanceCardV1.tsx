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
      {/* === Player photo clipped into the angled frame === */}
      <div
        className="
          absolute
          left-[70px] top-[70px]
          w-[520px] h-[700px]
          overflow-hidden
          rounded-[46px]
        "
        style={{
          // rough match to your trapezoid
          clipPath: "polygon(7% 0%, 100% 6%, 100% 100%, 0% 94%)",
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

      {/* === Big stacked points numbers on the right (individually positioned) === */}
      <div
        className="absolute right-0 top-0"
        style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
      >
        {/* Top Number */}
        <span
          className="
            absolute
            right-[350px] top-[70px]
            text-[170px]
            leading-[0.9]
            font-black
            italic
            text-[#e85a24]
          "
          data-testid="text-points-top"
        >
          {data.points}
        </span>

        {/* Middle Number */}
        <span
          className="
            absolute
            right-[290px] top-[260px]
            text-[170px]
            leading-[0.9]
            font-black
            italic
            text-[#e85a24]
          "
          data-testid="text-points-middle"
        >
          {data.points}
        </span>

        {/* Bottom Number */}
        <span
          className="
            absolute
            right-[230px] top-[450px]
            text-[170px]
            leading-[0.9]
            font-black
            italic
            text-[#e85a24]
          "
          data-testid="text-points-bottom"
        >
          {data.points}
        </span>
      </div>


      {/* === Score + team logos along the slanted base of the photo === */}
      <div
        className="
          absolute
          left-[410px] top-[730px]
          flex items-center gap-5
          origin-center
          [transform:rotate(-11deg)]
        "
      >
        {data.home_logo_url && (
          <img
            src={data.home_logo_url}
            alt={data.team_name}
            className="w-[70px] h-[70px] object-contain"
            data-testid="img-home-logo"
          />
        )}

        <span
          className="
            text-[44px]
            font-black
            text-[#90ff5c]
            tracking-[0.2em]
          "
          style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
          data-testid="text-score"
        >
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

      {/* === Main stat numbers row (above PTS / REB / AST / STL / BLK labels) === */}
      {/* Labels are baked into the PNG; we just align the numbers on top */}
      <div className="absolute left-[100px] top-[950px] flex text-center font-semibold">
        <div className="w-[100px] text-[46px]" data-testid="text-points">
          {data.points}
        </div>
        <div className="w-[100px] text-[46px]" data-testid="text-rebounds">
          {data.rebounds}
        </div>
        <div className="w-[100px] text-[46px]" data-testid="text-assists">
          {data.assists}
        </div>
        <div className="w-[100px] text-[46px]" data-testid="text-steals">
          {data.steals}
        </div>
        <div className="w-[100px] text-[46px]" data-testid="text-blocks">
          {data.blocks}
        </div>
      </div>

      {/* === Shooting / advanced stat numbers row (above FG / 3PT / FT / TO / TS% / +/-) === */}
      <div className="absolute left-[120px] top-[1070px] flex text-center font-semibold text-[#e85a24]">
        <div className="w-[115px] text-[40px]" data-testid="text-fg">
          {data.fg}
        </div>
        <div className="w-[115px] text-[40px]" data-testid="text-three-pt">
          {data.three_pt}
        </div>
        <div className="w-[115px] text-[40px]" data-testid="text-ft">
          {data.ft}
        </div>
        <div className="w-[115px] text-[40px]" data-testid="text-turnovers">
          {data.turnovers}
        </div>
        <div className="w-[115px] text-[40px]" data-testid="text-ts-percent">
          {data.ts_percent}
        </div>
        <div
          className="w-[115px] text-[40px] text-[#41ff41]"
          data-testid="text-plus-minus"
        >
          {data.plus_minus}
        </div>
      </div>
    </div>
  );
}
