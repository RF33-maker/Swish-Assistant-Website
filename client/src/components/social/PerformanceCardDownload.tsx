import { useState, useEffect } from "react";
import { Download, Loader2, Lock, Bell, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { TeamLogo } from "@/components/TeamLogo";
import { useAuth } from "@/hooks/use-auth";
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
  const [authOpen, setAuthOpen] = useState(false);
  const [isDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
  const { user, isMember } = useAuth();

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
    if (!isMember) {
      setAuthOpen(true);
      return;
    }
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
    <>
    {/* Free-membership auth gate dialog */}
    <Dialog open={authOpen} onOpenChange={setAuthOpen}>
      <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl border-0 shadow-2xl">
        <DialogTitle className="sr-only">Free membership</DialogTitle>
        <DialogDescription className="sr-only">
          Create a free account to unlock card downloads and more.
        </DialogDescription>

        {/* Header gradient band */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 px-6 pt-6 pb-8 text-white text-center">
          <img
            src={SwishLogo}
            alt="Swish Assistant"
            className="h-12 w-12 rounded-full mx-auto mb-3 object-cover shadow-md ring-2 ring-white/30"
          />
          <div className="inline-flex items-center gap-1.5 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold mb-3 tracking-widest uppercase">
            ✦ Free membership
          </div>
          <h3 className="font-bold text-xl leading-tight">
            {user ? "Almost there — verify your email" : "Unlock your member benefits"}
          </h3>
          <p className="text-orange-100 text-sm mt-2">
            {user
              ? "One quick step to activate your free membership."
              : "Join free — no credit card, no catch."}
          </p>
        </div>

        {/* Benefits list */}
        <div className="px-6 pt-5 pb-3 flex flex-col gap-3.5 bg-white dark:bg-neutral-900">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0 border border-orange-100 dark:border-orange-900/60">
              <Download className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug">Download performance cards</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Save and share highlight stats to Instagram, X, and more.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0 border border-orange-100 dark:border-orange-900/60">
              <Bell className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug">Score &amp; stat updates</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Stay on top of the latest game results and player stats.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 flex items-center justify-center flex-shrink-0 border border-orange-100 dark:border-orange-900/60">
              <Sparkles className="h-4 w-4 text-orange-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug">First access to new features</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Be first in line for the AI chatbot and tools coming soon.</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 pt-3 flex flex-col gap-2 bg-white dark:bg-neutral-900">
          {user ? (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Check your inbox</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 leading-relaxed">
                Click the verification link we sent you to activate your free membership and unlock downloads.
              </p>
            </div>
          ) : (
            <>
              <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white w-full font-semibold rounded-xl h-11">
                <Link href="/auth?tab=register">Create free account</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm">
                <Link href="/auth">Already have an account? Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>

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
        title={isMember ? "Download PNG" : user ? "Verify your email to download" : "Sign in to download"}
      >
        {downloading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isMember ? (
          <Download className="h-3.5 w-3.5" />
        ) : (
          <Lock className="h-3.5 w-3.5" />
        )}
        {downloading ? "Generating…" : isMember ? "Download PNG" : "Sign in to download"}
      </Button>
    </div>
    </>
  );
}
