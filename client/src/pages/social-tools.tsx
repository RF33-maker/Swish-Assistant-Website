import { useLocation } from "wouter";
import { ArrowLeft, Download, Trophy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PlayerPerformanceCardV1 } from "@/components/social/PlayerPerformanceCardV1";
import { PlayerPhotoUploader } from "@/components/social/PlayerPhotoUploader";
import type { PlayerPerformanceV1Data } from "@/types/socialCards";
import { useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabase";
import { ScrollArea } from "@/components/ui/scroll-area";
import { normalizeTeamName, normalizeTeamNameForFile } from "@/lib/teamUtils";

async function getTeamLogoUrl(teamName: string, leagueId: string): Promise<string> {
  const extensions = ['png', 'jpg', 'jpeg'];
  const normalizedFileName = normalizeTeamNameForFile(teamName);
  const originalFileName = teamName.replace(/\s+/g, '_');
  
  const filenamesToTry = [
    normalizedFileName,
    originalFileName,
    `${normalizedFileName}_Senior_Men`,
    `${normalizedFileName}_Senior_Men_I`,
  ];
  
  const uniqueFilenames = Array.from(new Set(filenamesToTry));
  
  for (const baseFileName of uniqueFilenames) {
    for (const ext of extensions) {
      const fileName = `${leagueId}_${baseFileName}.${ext}`;
      const { data } = supabase.storage.from('team-logos').getPublicUrl(fileName);
      
      try {
        const response = await fetch(data.publicUrl, { method: 'HEAD' });
        if (response.ok) {
          return data.publicUrl;
        }
      } catch {
        continue;
      }
    }
  }
  return '';
}

interface TopPerformance {
  id: string;
  player_name: string;
  team: string;
  opponent: string;
  sminutes?: string;
  spoints: number;
  sreboundstotal: number;
  sassists: number;
  ssteals?: number;
  sblocks?: number;
  sfieldgoalsmade?: number;
  sfieldgoalsattempted?: number;
  sthreepointersmade?: number;
  sthreepointersattempted?: number;
  sfreethrowsmade?: number;
  sfreethrowsattempted?: number;
  sturnovers?: number;
  splusminuspoints?: number;
  game_key?: string;
  numeric_id?: string;
  player_team_score: number;
  opponent_score: number;
  league_id?: string;
}

const defaultData: PlayerPerformanceV1Data = {
  player_name: "Select a Performance",
  team_name: "Team Name",
  opponent_name: "Opponent",
  minutes: 0,
  points: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  fg: "0/0",
  three_pt: "0/0",
  ft: "0/0",
  turnovers: 0,
  ts_percent: "0.0",
  plus_minus: "0",
  home_score: 0,
  away_score: 0,
  didWin: false,
  home_logo_url: "",
  away_logo_url: "",
  photo_url: "",
};

export default function SocialToolsPage() {
  const [, navigate] = useLocation();
  const cardRef = useRef<HTMLDivElement>(null);
  const hiddenCardRef = useRef<HTMLDivElement>(null);
  const [performances, setPerformances] = useState<TopPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedData, setSelectedData] = useState<PlayerPerformanceV1Data>(defaultData);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    fetchTopPerformances();
  }, []);

  const fetchTopPerformances = async () => {
    setLoading(true);
    try {
      const { data: playerStats, error: playerError } = await supabase
        .from("player_stats")
        .select("*, players:player_id(full_name)")
        .order("spoints", { ascending: false })
        .limit(50);

      if (playerError) {
        console.error("Error fetching performances:", playerError);
        return;
      }

      const numericIds = Array.from(new Set((playerStats || []).map((s: any) => s.numeric_id).filter(Boolean)));
      const gameKeys = Array.from(new Set((playerStats || []).map((s: any) => s.game_key).filter(Boolean)));
      
      console.log('[SocialTools] numericIds:', numericIds.slice(0, 5));
      console.log('[SocialTools] gameKeys:', gameKeys.slice(0, 5));
      
      let teamStatsMap: Record<string, any[]> = {};
      
      if (numericIds.length > 0) {
        const { data: teamStats, error: teamError } = await supabase
          .from("team_stats")
          .select("numeric_id, game_key, name, tot_spoints, league_id")
          .in("numeric_id", numericIds);
        console.log('[SocialTools] teamStats by numericId:', teamStats?.length, 'error:', teamError);
        
        (teamStats || []).forEach((ts: any) => {
          if (ts.numeric_id) {
            if (!teamStatsMap[ts.numeric_id]) {
              teamStatsMap[ts.numeric_id] = [];
            }
            teamStatsMap[ts.numeric_id].push(ts);
          }
          if (ts.game_key) {
            if (!teamStatsMap[ts.game_key]) {
              teamStatsMap[ts.game_key] = [];
            }
            teamStatsMap[ts.game_key].push(ts);
          }
        });
      }
      
      if (gameKeys.length > 0) {
        const { data: teamStats } = await supabase
          .from("team_stats")
          .select("numeric_id, game_key, name, tot_spoints, league_id")
          .in("game_key", gameKeys);
        
        (teamStats || []).forEach((ts: any) => {
          if (ts.game_key && !teamStatsMap[ts.game_key]) {
            teamStatsMap[ts.game_key] = [];
          }
          if (ts.game_key) {
            const exists = teamStatsMap[ts.game_key].some((existing: any) => existing.name === ts.name);
            if (!exists) {
              teamStatsMap[ts.game_key].push(ts);
            }
          }
        });
      }

      const mapped: TopPerformance[] = (playerStats || []).map((stat: any) => {
        const gameTeams = teamStatsMap[stat.numeric_id] || teamStatsMap[stat.game_key] || [];
        const playerTeamName = stat.team_name || stat.team || '';
        const normalizedPlayerTeam = normalizeTeamName(playerTeamName);
        
        const playerTeamStats = gameTeams.find((t: any) => 
          normalizeTeamName(t.name || '') === normalizedPlayerTeam
        );
        
        const opponentStats = gameTeams.find((t: any) => {
          const normalizedName = normalizeTeamName(t.name || '');
          return normalizedName !== normalizedPlayerTeam && normalizedName !== '';
        });
        
        const opponentName = opponentStats?.name || 
          (gameTeams.length === 2 ? gameTeams.find((t: any) => t !== playerTeamStats)?.name : null) || 
          'Unknown';
        
        console.log(`[SocialTools] Player: ${stat.players?.full_name}, Team: ${playerTeamName}, GameTeams:`, gameTeams.map((t: any) => t.name), 'Opponent:', opponentName);
        
        return {
          id: stat.id,
          player_name: stat.players?.full_name || `${stat.firstname || ''} ${stat.familyname || ''}`.trim() || 'Unknown',
          team: playerTeamName || 'Unknown',
          opponent: opponentName,
          sminutes: stat.sminutes,
          spoints: stat.spoints || 0,
          sreboundstotal: stat.sreboundstotal || 0,
          sassists: stat.sassists || 0,
          ssteals: stat.ssteals || 0,
          sblocks: stat.sblocks || 0,
          sfieldgoalsmade: stat.sfieldgoalsmade,
          sfieldgoalsattempted: stat.sfieldgoalsattempted,
          sthreepointersmade: stat.sthreepointersmade,
          sthreepointersattempted: stat.sthreepointersattempted,
          sfreethrowsmade: stat.sfreethrowsmade,
          sfreethrowsattempted: stat.sfreethrowsattempted,
          sturnovers: stat.sturnovers,
          splusminuspoints: stat.splusminuspoints,
          game_key: stat.game_key,
          numeric_id: stat.numeric_id,
          player_team_score: playerTeamStats?.tot_spoints ?? opponentStats?.tot_spoints ?? 0,
          opponent_score: opponentStats?.tot_spoints ?? 0,
          league_id: stat.league_id || playerTeamStats?.league_id || opponentStats?.league_id,
        };
      });

      setPerformances(mapped);
    } catch (err) {
      console.error("Failed to fetch performances:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPerformance = async (perf: TopPerformance) => {
    setSelectedId(perf.id);
    
    const fgMade = perf.sfieldgoalsmade ?? 0;
    const fgAtt = perf.sfieldgoalsattempted ?? 0;
    const threeMade = perf.sthreepointersmade ?? 0;
    const threeAtt = perf.sthreepointersattempted ?? 0;
    const ftMade = perf.sfreethrowsmade ?? 0;
    const ftAtt = perf.sfreethrowsattempted ?? 0;
    
    const tsa = fgAtt + 0.44 * ftAtt;
    const tsPercent = tsa > 0 ? ((perf.spoints / (2 * tsa)) * 100).toFixed(1) : "0.0";
    
    const plusMinus = perf.splusminuspoints !== undefined && perf.splusminuspoints !== null
      ? (perf.splusminuspoints >= 0 ? `+${perf.splusminuspoints}` : `${perf.splusminuspoints}`)
      : "0";

    const minutes = perf.sminutes ? parseInt(perf.sminutes.split(':')[0]) || 0 : 0;

    const leagueId = perf.league_id || '';
    const [playerTeamLogo, opponentLogo] = await Promise.all([
      getTeamLogoUrl(perf.team, leagueId),
      getTeamLogoUrl(perf.opponent, leagueId),
    ]);

    // Try to get player photo from storage (organized by player name)
    let playerPhotoUrl = "";
    const encodedName = encodeURIComponent(perf.player_name);
    const { data: photoList } = await supabase.storage
      .from("player-photos")
      .list(encodedName);
    
    if (photoList && photoList.length > 0) {
      const { data: photoData } = supabase.storage
        .from("player-photos")
        .getPublicUrl(`${encodedName}/${photoList[0].name}`);
      playerPhotoUrl = photoData.publicUrl;
    }

    setSelectedData({
      player_name: perf.player_name,
      team_name: perf.team,
      opponent_name: perf.opponent,
      minutes: minutes,
      points: perf.spoints,
      rebounds: perf.sreboundstotal,
      assists: perf.sassists,
      steals: perf.ssteals ?? 0,
      blocks: perf.sblocks ?? 0,
      fg: `${fgMade}/${fgAtt}`,
      three_pt: `${threeMade}/${threeAtt}`,
      ft: `${ftMade}/${ftAtt}`,
      turnovers: perf.sturnovers ?? 0,
      ts_percent: tsPercent,
      plus_minus: plusMinus,
      home_score: perf.player_team_score,
      away_score: perf.opponent_score,
      didWin: perf.player_team_score > perf.opponent_score,
      home_logo_url: playerTeamLogo,
      away_logo_url: opponentLogo,
      photo_url: playerPhotoUrl,
    });
  };

  const handleDownload = async () => {
    if (!hiddenCardRef.current) return;
    
    try {
      // Wait for images to load in the hidden card
      const images = hiddenCardRef.current.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete) {
                resolve(true);
              } else {
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
              }
            })
        )
      );
      
      // Small delay to ensure rendering is complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      const canvas = await html2canvas(hiddenCardRef.current, {
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        width: 1080,
        height: 1350,
      });
      
      const link = document.createElement("a");
      link.download = `${selectedData.player_name.replace(/\s+/g, '-')}-performance.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (error) {
      console.error("Failed to generate image:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="mx-auto max-w-[1600px] px-6">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 hover:border-orange-300 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Swish Social Tool
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Select a top performance to generate a social media graphic
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left side - Performance selector */}
          <div className="lg:col-span-3">
            <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Top Performances
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                  </div>
                ) : (
                  <ScrollArea className="h-[600px]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-4">
                      {performances.map((perf) => (
                        <div
                          key={perf.id}
                          onClick={() => handleSelectPerformance(perf)}
                          className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                            selectedId === perf.id
                              ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                              : "border-gray-200 dark:border-gray-600 hover:border-orange-300 dark:hover:border-orange-600"
                          }`}
                          data-testid={`card-performance-${perf.id}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                                {perf.player_name}
                              </h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {perf.team}
                              </p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                vs {perf.opponent} ({perf.player_team_score}-{perf.opponent_score})
                              </p>
                            </div>
                            <div className="text-right ml-3">
                              <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                {perf.spoints}
                              </span>
                              <p className="text-xs text-gray-500 dark:text-gray-400">PTS</p>
                            </div>
                          </div>
                          <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-300">
                            <span>{perf.sreboundstotal} REB</span>
                            <span>{perf.sassists} AST</span>
                            {perf.ssteals ? <span>{perf.ssteals} STL</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right side - Card preview and Photo uploader */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-orange-900 dark:text-orange-400">
                  Card Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                    disabled={selectedId === null}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download as PNG
                  </Button>
                </div>
                
                <div className="bg-gray-200 dark:bg-gray-700 p-3 rounded-lg overflow-hidden">
                  <div 
                    className="origin-top-left"
                    style={{ 
                      transform: "scale(0.35)", 
                      transformOrigin: "top left",
                      width: "1080px",
                      height: "472px"
                    }}
                  >
                    <div ref={cardRef}>
                      <PlayerPerformanceCardV1 data={selectedData} />
                    </div>
                  </div>
                </div>
                
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                  Card size: 1080×1350px (Instagram portrait)
                </p>
              </CardContent>
            </Card>
            
            <PlayerPhotoUploader />
          </div>
        </div>
      </div>
      
      {/* Hidden full-size card for download rendering */}
      <div 
        style={{ 
          position: "fixed", 
          left: "-9999px", 
          top: 0,
          width: "1080px",
          height: "1350px",
        }}
      >
        <div ref={hiddenCardRef}>
          <PlayerPerformanceCardV1 data={selectedData} />
        </div>
      </div>
    </div>
  );
}
