import { useState, useEffect } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamLogo } from "@/components/TeamLogo";
import type { TrendingCardOptions } from "@/lib/generateTrendingCard";
import { generateTrendingCardBlob } from "@/lib/generateTrendingCard";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { supabase } from "@/lib/supabase";
import type { GameStatForCard } from "@/lib/performanceCardUtils";
import { computeGmSc } from "@/lib/performanceCardUtils";

interface PerformanceCardDownloadProps {
  stat: GameStatForCard;
  playerName: string;
  playerPhotoPath?: string | null;
  photoFocusY?: number | null;
  label?: string;
}

function formatDate(s: string | null | undefined) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function computeTsPct(stat: GameStatForCard): string {
  const pts = stat.spoints ?? stat.points ?? 0;
  const fga = stat.sfieldgoalsattempted ?? 0;
  const fta = stat.sfreethrowsattempted ?? 0;
  const tsa = fga + 0.44 * fta;
  return tsa > 0 ? ((pts / (2 * tsa)) * 100).toFixed(1) : "—";
}

export function PerformanceCardDownload({
  stat,
  playerName,
  playerPhotoPath,
  label,
}: PerformanceCardDownloadProps) {
  const [teamLogoUrl, setTeamLogoUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [isDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  const teamName = stat.team_name || stat.team || "";
  const opponent = stat.opponent || "";
  const leagueId = stat.league_id || "";
  const gameDate = stat.game_date || stat.created_at || null;

  const pts = stat.spoints ?? stat.points ?? 0;
  const reb = stat.sreboundstotal ?? stat.rebounds_total ?? 0;
  const ast = stat.sassists ?? stat.assists ?? 0;
  const stl = stat.ssteals ?? 0;
  const blk = stat.sblocks ?? 0;
  const tov = stat.sturnovers ?? stat.turnovers ?? 0;
  const fgm = stat.sfieldgoalsmade ?? 0;
  const fga = stat.sfieldgoalsattempted ?? 0;
  const ftm = stat.sfreethrowsmade ?? 0;
  const fta = stat.sfreethrowsattempted ?? 0;
  const gmSc = parseFloat(computeGmSc(stat).toFixed(1));
  const tsPct = computeTsPct(stat);

  useEffect(() => {
    if (!teamName) return;
    let cancelled = false;
    getTeamLogoCached({ leagueId, teamName }).then((url) => {
      if (!cancelled) setTeamLogoUrl(url);
    });
    return () => { cancelled = true; };
  }, [teamName, leagueId]);

  useEffect(() => {
    if (!playerPhotoPath) return;
    const { data } = supabase.storage.from("player-photos").getPublicUrl(playerPhotoPath);
    if (data?.publicUrl) setPhotoUrl(data.publicUrl);
  }, [playerPhotoPath]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const opts: TrendingCardOptions = {
        playerName,
        teamName: teamName || null,
        gameDate,
        opponentName: opponent || null,
        gameResult: null,
        tsPct,
        gmSc,
        pts,
        reb,
        ast,
        stl,
        blk,
        tov,
        fgm,
        fga,
        ftm,
        fta,
        photoUrl,
        teamLogoUrl,
        leagueName: undefined,
        isDark,
        cardWidth: 560,
      };
      const blob = await generateTrendingCardBlob(opts);
      if (!blob) return;
      const link = document.createElement("a");
      link.download = `${playerName.replace(/\s+/g, "-")}-performance.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    } finally {
      setDownloading(false);
    }
  };

  const statCells = [
    { label: "GmSc", value: gmSc },
    { label: "PTS",  value: pts },
    { label: "REB",  value: reb },
    { label: "AST",  value: ast },
    { label: "STL",  value: stl },
    { label: "BLK",  value: blk },
    { label: "TOV",  value: tov },
    { label: "FG",   value: `${fgm}/${fga}` },
    { label: "FT",   value: `${ftm}/${fta}` },
    { label: "TS%",  value: tsPct },
  ];

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </span>
      )}

      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 shadow-sm p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-amber-100 dark:from-neutral-800 dark:to-neutral-800 flex items-center justify-center flex-shrink-0">
            {photoUrl ? (
              <img src={photoUrl} alt={playerName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-orange-600 dark:text-orange-300 font-bold text-sm">
                {playerName.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("")}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-900 dark:text-white truncate">{playerName}</div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
              {teamName && (
                <TeamLogo teamName={teamName} leagueId={leagueId} size="xs" className="!w-5 !h-5" />
              )}
              {opponent ? (
                <span>vs {opponent}</span>
              ) : (
                <span>{formatDate(gameDate)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-neutral-800 mb-3" />

        <div className="grid grid-cols-5 gap-y-3 gap-x-2">
          {statCells.map(({ label: lbl, value }) => (
            <div key={lbl} className="flex flex-col items-center min-w-0">
              <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                {value}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {lbl}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Button
        size="sm"
        onClick={handleDownload}
        disabled={downloading}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white gap-2"
      >
        {downloading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {downloading ? "Generating…" : "Download PNG"}
      </Button>
    </div>
  );
}
