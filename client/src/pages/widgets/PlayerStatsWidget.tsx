import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type WidgetParams, isLightColor } from "@/lib/widgetUtils";
import WidgetLayout from "./WidgetLayout";

interface PlayerData {
  name: string;
  team: string;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  spg: number;
  bpg: number;
  fgPct: number;
  threePct: number;
  ftPct: number;
}

interface StatAccumulator {
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
}

interface PlayerStatRow {
  spoints: number | null;
  sreboundstotal: number | null;
  sassists: number | null;
  ssteals: number | null;
  sblocks: number | null;
  sfieldgoalsmade: number | null;
  sfieldgoalsattempted: number | null;
  sthreepointersmade: number | null;
  sthreepointersattempted: number | null;
  sfreethrowsmade: number | null;
  sfreethrowsattempted: number | null;
}

export default function PlayerStatsWidget({ params }: { params: WidgetParams }) {
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlayerStats = async () => {
      const playerId = params.playerId;
      if (!playerId) {
        setError("No player specified");
        setLoading(false);
        return;
      }

      try {
        const { data: playerInfo, error: lookupError } = await supabase
          .from("players")
          .select("id, full_name, slug")
          .or(`id.eq.${playerId},slug.eq.${playerId}`)
          .limit(1)
          .single();

        if (lookupError || !playerInfo) {
          setError("Player not found");
          setLoading(false);
          return;
        }

        const canonicalId = playerInfo.id;

        const leagueId = params.leagueId;
        const leagueSlug = params.leagueSlug;

        let resolvedLeagueId = leagueId;
        if (!resolvedLeagueId && leagueSlug) {
          const { data: slugLeague } = await supabase
            .from("leagues")
            .select("league_id")
            .eq("slug", leagueSlug)
            .eq("is_public", true)
            .single();
          resolvedLeagueId = slugLeague?.league_id || "";
        }

        if (!resolvedLeagueId) {
          const { data: firstStat } = await supabase
            .from("player_stats")
            .select("league_id")
            .eq("player_id", canonicalId)
            .limit(1)
            .single();
          resolvedLeagueId = firstStat?.league_id || "";
        }

        if (!resolvedLeagueId) {
          setError("Could not determine league for this player");
          setLoading(false);
          return;
        }

        const { data: leagueCheck } = await supabase
          .from("leagues")
          .select("league_id")
          .eq("league_id", resolvedLeagueId)
          .eq("is_public", true)
          .single();

        if (!leagueCheck) {
          setError("Player data is not publicly available");
          setLoading(false);
          return;
        }

        const { data: stats, error: statsError } = await supabase
          .from("player_stats")
          .select("spoints, sreboundstotal, sassists, ssteals, sblocks, sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, sfreethrowsmade, sfreethrowsattempted, team_name, firstname, familyname")
          .eq("player_id", canonicalId)
          .eq("league_id", resolvedLeagueId);

        if (statsError || !stats || stats.length === 0) {
          setError("No stats found for this player");
          setLoading(false);
          return;
        }

        const playerName = playerInfo.full_name || "Unknown";
        const teamName = stats[0]?.team_name || "";
        const gp = stats.length;
        const totals = (stats as PlayerStatRow[]).reduce<StatAccumulator>(
          (acc, s) => ({
            points: acc.points + (s.spoints || 0),
            rebounds: acc.rebounds + (s.sreboundstotal || 0),
            assists: acc.assists + (s.sassists || 0),
            steals: acc.steals + (s.ssteals || 0),
            blocks: acc.blocks + (s.sblocks || 0),
            fgm: acc.fgm + (s.sfieldgoalsmade || 0),
            fga: acc.fga + (s.sfieldgoalsattempted || 0),
            tpm: acc.tpm + (s.sthreepointersmade || 0),
            tpa: acc.tpa + (s.sthreepointersattempted || 0),
            ftm: acc.ftm + (s.sfreethrowsmade || 0),
            fta: acc.fta + (s.sfreethrowsattempted || 0),
          }),
          { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 }
        );

        setPlayer({
          name: playerName,
          team: teamName,
          gamesPlayed: gp,
          ppg: gp > 0 ? totals.points / gp : 0,
          rpg: gp > 0 ? totals.rebounds / gp : 0,
          apg: gp > 0 ? totals.assists / gp : 0,
          spg: gp > 0 ? totals.steals / gp : 0,
          bpg: gp > 0 ? totals.blocks / gp : 0,
          fgPct: totals.fga > 0 ? (totals.fgm / totals.fga) * 100 : 0,
          threePct: totals.tpa > 0 ? (totals.tpm / totals.tpa) * 100 : 0,
          ftPct: totals.fta > 0 ? (totals.ftm / totals.fta) * 100 : 0,
        });
      } catch (err) {
        setError("Failed to load player stats");
      } finally {
        setLoading(false);
      }
    };

    fetchPlayerStats();
  }, [params.playerId]);

  const primaryColor = params.primaryColor || '#ea580c';
  const accentColor = params.accentColor || '#f97316';
  const bgColor = params.bgColor || '#ffffff';
  const light = isLightColor(bgColor);
  const subtextColor = light ? '#64748b' : '#94a3b8';
  const cardBg = light ? `${accentColor}08` : '#1e293b';

  const isCompact = params.layout === 'compact';
  const isWide = params.layout === 'wide';
  const statFontSize = isCompact ? '15px' : isWide ? '20px' : '18px';
  const statLabelSize = isCompact ? '9px' : '10px';
  const statPad = isCompact ? '7px 6px' : isWide ? '12px 10px' : '10px 8px';
  const nameFontSize = isCompact ? '14px' : isWide ? '18px' : '16px';
  const avatarSize = isCompact ? 36 : isWide ? 56 : 48;

  const StatBox = ({ label, value }: { label: string; value: string }) => (
    <div
      style={{
        backgroundColor: cardBg,
        borderRadius: `${(params.borderRadius ?? 12) / 2}px`,
        padding: statPad,
        textAlign: 'center',
        flex: '1 1 0',
        minWidth: '60px',
      }}
    >
      <div style={{ fontSize: statFontSize, fontWeight: 700, color: primaryColor }}>{value}</div>
      <div style={{ fontSize: statLabelSize, fontWeight: 600, color: subtextColor, textTransform: 'uppercase', marginTop: '2px' }}>{label}</div>
    </div>
  );

  return (
    <WidgetLayout params={params} loading={loading} error={error}>
      {player && (
        <div className="flex flex-col h-full">
          <div className="text-center mb-4">
            <div
              className="inline-flex items-center justify-center rounded-full mb-2"
              style={{ width: avatarSize, height: avatarSize, backgroundColor: `${primaryColor}20`, color: primaryColor, fontSize: `${avatarSize * 0.4}px`, fontWeight: 700 }}
            >
              {player.name.charAt(0)}
            </div>
            <h3 style={{ fontSize: nameFontSize, fontWeight: 700 }}>{player.name}</h3>
            {player.team && <p style={{ fontSize: isCompact ? '11px' : '12px', color: subtextColor, marginTop: '2px' }}>{player.team}</p>}
            <p style={{ fontSize: isCompact ? '10px' : '11px', color: subtextColor }}>{player.gamesPlayed} Games Played</p>
          </div>

          <div className="flex gap-2 mb-3">
            <StatBox label="PPG" value={player.ppg.toFixed(1)} />
            <StatBox label="RPG" value={player.rpg.toFixed(1)} />
            <StatBox label="APG" value={player.apg.toFixed(1)} />
          </div>

          <div className="flex gap-2 mb-3">
            <StatBox label="SPG" value={player.spg.toFixed(1)} />
            <StatBox label="BPG" value={player.bpg.toFixed(1)} />
          </div>

          <div style={{ fontSize: '11px', fontWeight: 600, color: primaryColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', marginTop: '4px' }}>
            Shooting Splits
          </div>
          <div className="flex gap-2">
            <StatBox label="FG%" value={`${player.fgPct.toFixed(1)}%`} />
            <StatBox label="3P%" value={`${player.threePct.toFixed(1)}%`} />
            <StatBox label="FT%" value={`${player.ftPct.toFixed(1)}%`} />
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '10px', textAlign: 'center', fontSize: '10px', color: subtextColor, opacity: 0.7 }}>
            Powered by Swish Assistant
          </div>
        </div>
      )}
    </WidgetLayout>
  );
}
