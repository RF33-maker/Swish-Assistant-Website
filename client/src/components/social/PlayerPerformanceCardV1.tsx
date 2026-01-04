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

      {/* === Big stacked numbers on the right (individually positioned) === */}
      <div
        className="absolute right-0 top-0"
        style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
      >
        {/* Top Number - Points */}
        <div className="absolute right-[350px] top-[70px] text-right">
          <span
            className="text-[170px] leading-[0.9] font-black italic text-[#e85a24]"
            data-testid="text-points-top"
          >
            {data.points}
          </span>
          <div className="text-[28px] uppercase tracking-[0.2em] text-white mt-1">Points</div>
        </div>

        {/* Middle Number - Rebounds */}
        <div className="absolute right-[290px] top-[260px] text-right">
          <span
            className="text-[170px] leading-[0.9] font-black italic text-[#e85a24]"
            data-testid="text-points-middle"
          >
            {data.rebounds}
          </span>
          <div className="text-[28px] uppercase tracking-[0.2em] text-white mt-1">Rebounds</div>
        </div>

        {/* Bottom Number - Assists */}
        <div className="absolute right-[230px] top-[450px] text-right">
          <span
            className="text-[170px] leading-[0.9] font-black italic text-[#e85a24]"
            data-testid="text-points-bottom"
          >
            {data.assists}
          </span>
          <div className="text-[28px] uppercase tracking-[0.2em] text-white mt-1">Assists</div>
        </div>
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

      {/* === Main stat numbers row (PTS / REB / AST / STL / BLK) === */}
      <div className="absolute left-[100px] top-[950px] flex text-center font-semibold">
        <div className="w-[125px]" data-testid="text-points">
          <div className="text-[46px]">{data.points}</div>
          <div className="text-[22px] uppercase tracking-[0.15em]">PTS</div>
        </div>
        <div className="w-[125px]" data-testid="text-rebounds">
          <div className="text-[46px]">{data.rebounds}</div>
          <div className="text-[22px] uppercase tracking-[0.15em]">REB</div>
        </div>
        <div className="w-[125px]" data-testid="text-assists">
          <div className="text-[46px]">{data.assists}</div>
          <div className="text-[22px] uppercase tracking-[0.15em]">AST</div>
        </div>
        <div className="w-[125px]" data-testid="text-steals">
          <div className="text-[46px]">{data.steals}</div>
          <div className="text-[22px] uppercase tracking-[0.15em]">STL</div>
        </div>
        <div className="w-[125px]" data-testid="text-blocks">
          <div className="text-[46px]">{data.blocks}</div>
          <div className="text-[22px] uppercase tracking-[0.15em]">BLK</div>
        </div>
      </div>

      {/* === Shooting / advanced stat numbers row (FG / 3PT / FT / TO / TS% / +/-) === */}
      <div className="absolute left-[130px] top-[1070px] flex text-center font-semibold text-[#e85a24]">
        <div className="w-[115px]" data-testid="text-fg">
          <div className="text-[40px]">{data.fg}</div>
          <div className="text-[18px] uppercase tracking-[0.15em]">FG</div>
        </div>
        <div className="w-[115px]" data-testid="text-three-pt">
          <div className="text-[40px]">{data.three_pt}</div>
          <div className="text-[18px] uppercase tracking-[0.15em]">3PT</div>
        </div>
        <div className="w-[115px]" data-testid="text-ft">
          <div className="text-[40px]">{data.ft}</div>
          <div className="text-[18px] uppercase tracking-[0.15em]">FT</div>
        </div>
        <div className="w-[115px]" data-testid="text-turnovers">
          <div className="text-[40px]">{data.turnovers}</div>
          <div className="text-[18px] uppercase tracking-[0.15em]">TO</div>
        </div>
        <div className="w-[115px]" data-testid="text-ts-percent">
          <div className="text-[40px]">{data.ts_percent}</div>
          <div className="text-[18px] uppercase tracking-[0.15em]">TS%</div>
        </div>
        <div className="w-[115px]" data-testid="text-plus-minus">
          <div className="text-[40px] text-[#41ff41]">{data.plus_minus}</div>
          <div className="text-[18px] uppercase tracking-[0.15em]">+/-</div>
        </div>
      </div>
    </div>
  );
}
