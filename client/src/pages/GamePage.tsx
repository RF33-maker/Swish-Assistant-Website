import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import { ArrowLeft, Clock, MapPin, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface GameSchedule {
  game_key: string;
  league_id: string;
  matchtime: string;
  hometeam: string;
  awayteam: string;
  status: string | null;
  competitionname: string | null;
}

interface PlayerStat {
  firstname: string;
  familyname: string;
  team: string;
  spoints: number;
  sreboundstotal: number;
  sassists: number;
  ssteals: number;
  sblocks: number;
  sturnovers: number;
  sfieldgoalsmade: number;
  sfieldgoalsattempted: number;
  sthreepointersmade: number;
  sthreepointersattempted: number;
  sfreethrowsmade: number;
  sfreethrowsattempted: number;
  sminutes: string;
}

interface TeamStat {
  name: string;
  tot_spoints: number;
  tot_sreboundstotal: number;
  tot_sassists: number;
  tot_ssteals: number;
  tot_sblocks: number;
  tot_sturnovers: number;
  tot_sfieldgoalsmade: number;
  tot_sfieldgoalsattempted: number;
  tot_sthreepointersmade: number;
  tot_sthreepointersattempted: number;
  tot_sfreethrowsmade: number;
  tot_sfreethrowsattempted: number;
  is_home: boolean;
}

function formatMatchTime(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London'
  });
}

function formatDate(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London'
  });
}

function formatTime(matchtime: string): string {
  const date = new Date(matchtime);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London'
  });
}

function getStatusBadge(status: string | null, matchtime: string) {
  const normalizedStatus = status?.toLowerCase() || '';
  const now = new Date();
  const gameTime = new Date(matchtime);
  
  if (normalizedStatus === 'final' || normalizedStatus === 'finished') {
    return <span className="px-3 py-1 bg-gray-600 text-white text-sm font-semibold rounded-full">FINAL</span>;
  }
  if (normalizedStatus === 'live' || normalizedStatus === 'in_progress') {
    return <span className="px-3 py-1 bg-red-600 text-white text-sm font-semibold rounded-full animate-pulse">LIVE</span>;
  }
  if (gameTime > now) {
    return <span className="px-3 py-1 bg-orange-500 text-white text-sm font-semibold rounded-full">SCHEDULED</span>;
  }
  return <span className="px-3 py-1 bg-gray-500 text-white text-sm font-semibold rounded-full">PENDING</span>;
}

function parseMinutes(minutesStr: string | null | undefined): string {
  if (!minutesStr) return '0:00';
  if (minutesStr.includes(':')) return minutesStr;
  const mins = parseFloat(minutesStr);
  const wholeMins = Math.floor(mins);
  const secs = Math.round((mins - wholeMins) * 60);
  return `${wholeMins}:${secs.toString().padStart(2, '0')}`;
}

export default function GamePage() {
  const params = useParams<{ gameKey: string }>();
  const gameKey = params.gameKey ? decodeURIComponent(params.gameKey) : '';

  const { data: gameData, isLoading: gameLoading, error: gameError } = useQuery({
    queryKey: ['game-schedule', gameKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_schedule')
        .select('game_key, league_id, matchtime, hometeam, awayteam, status, competitionname')
        .eq('game_key', gameKey)
        .single();
      
      if (error) throw error;
      return data as GameSchedule;
    },
    enabled: !!gameKey
  });

  const { data: playerStats, isLoading: statsLoading } = useQuery({
    queryKey: ['game-player-stats', gameKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_stats')
        .select('*')
        .eq('game_key', gameKey);
      
      if (error) throw error;
      return data as PlayerStat[];
    },
    enabled: !!gameKey && !!gameData
  });

  const { data: teamStats } = useQuery({
    queryKey: ['game-team-stats', gameKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_stats')
        .select('*')
        .eq('game_key', gameKey);
      
      if (error) throw error;
      return data as TeamStat[];
    },
    enabled: !!gameKey && !!gameData
  });

  if (gameLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <Skeleton className="h-8 w-32 mb-6 bg-gray-700" />
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-8">
              <Skeleton className="h-24 w-24 rounded-full bg-gray-700" />
              <Skeleton className="h-12 w-24 bg-gray-700" />
              <Skeleton className="h-24 w-24 rounded-full bg-gray-700" />
            </div>
            <Skeleton className="h-64 w-full bg-gray-700" />
          </div>
        </div>
      </div>
    );
  }

  if (gameError || !gameData) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Game Not Found</h1>
          <p className="text-gray-400 mb-6">The game you're looking for doesn't exist or has been removed.</p>
          <Link href="/" className="text-orange-500 hover:text-orange-400 flex items-center justify-center gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const isGamePlayed = gameData.status?.toLowerCase() === 'final' || 
                       gameData.status?.toLowerCase() === 'finished' ||
                       gameData.status?.toLowerCase() === 'live';
  
  const homeTeamStats = teamStats?.find(t => t.is_home === true);
  const awayTeamStats = teamStats?.find(t => t.is_home === false);
  
  const homeScore = homeTeamStats?.tot_spoints ?? null;
  const awayScore = awayTeamStats?.tot_spoints ?? null;

  const homePlayerStats = playerStats?.filter(p => 
    p.team?.toLowerCase().includes(gameData.hometeam?.toLowerCase().split(' ')[0]) ||
    gameData.hometeam?.toLowerCase().includes(p.team?.toLowerCase().split(' ')[0])
  ).sort((a, b) => (b.spoints || 0) - (a.spoints || 0)).slice(0, 10) || [];

  const awayPlayerStats = playerStats?.filter(p => 
    p.team?.toLowerCase().includes(gameData.awayteam?.toLowerCase().split(' ')[0]) ||
    gameData.awayteam?.toLowerCase().includes(p.team?.toLowerCase().split(' ')[0])
  ).sort((a, b) => (b.spoints || 0) - (a.spoints || 0)).slice(0, 10) || [];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link href={`/league/${gameData.league_id}`} className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to League
        </Link>

        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 p-6 md:p-8">
            <div className="flex justify-center mb-4">
              {getStatusBadge(gameData.status, gameData.matchtime)}
            </div>

            <div className="flex items-center justify-between gap-4 md:gap-8">
              <div className="flex-1 text-center">
                <div className="flex justify-center mb-3">
                  <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="lg" />
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white truncate">{gameData.awayteam}</h2>
                <span className="text-xs text-gray-400">AWAY</span>
              </div>

              <div className="flex flex-col items-center">
                {isGamePlayed && homeScore !== null && awayScore !== null ? (
                  <div className="flex items-center gap-4">
                    <span className="text-4xl md:text-6xl font-bold text-white">{awayScore}</span>
                    <span className="text-2xl text-gray-500">-</span>
                    <span className="text-4xl md:text-6xl font-bold text-white">{homeScore}</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-2xl md:text-3xl font-bold text-gray-500">VS</div>
                  </div>
                )}
              </div>

              <div className="flex-1 text-center">
                <div className="flex justify-center mb-3">
                  <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="lg" />
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white truncate">{gameData.hometeam}</h2>
                <span className="text-xs text-gray-400">HOME</span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-4 mt-6 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(gameData.matchtime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{formatTime(gameData.matchtime)}</span>
              </div>
              {gameData.competitionname && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{gameData.competitionname}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 md:p-6">
            {!isGamePlayed ? (
              <div className="bg-gray-700/50 rounded-lg p-6 text-center">
                <h3 className="text-xl font-semibold mb-2">Match Preview</h3>
                <p className="text-gray-400 mb-4">
                  Tip-off: {formatMatchTime(gameData.matchtime)}
                </p>
                {gameData.competitionname && (
                  <p className="text-gray-500 text-sm mb-4">
                    Competition: {gameData.competitionname}
                  </p>
                )}
                <p className="text-gray-500 text-sm italic">
                  Live stats and play-by-play data will appear when the game starts.
                </p>
              </div>
            ) : (
              <Tabs defaultValue="boxscore" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-gray-700 mb-4">
                  <TabsTrigger value="boxscore" className="data-[state=active]:bg-orange-600">Box Score</TabsTrigger>
                  <TabsTrigger value="teamstats" className="data-[state=active]:bg-orange-600">Team Stats</TabsTrigger>
                  <TabsTrigger value="playbyplay" className="data-[state=active]:bg-orange-600">Play-by-Play</TabsTrigger>
                </TabsList>

                <TabsContent value="boxscore" className="space-y-6">
                  {statsLoading ? (
                    <div className="space-y-4">
                      <Skeleton className="h-48 w-full bg-gray-700" />
                      <Skeleton className="h-48 w-full bg-gray-700" />
                    </div>
                  ) : (
                    <>
                      <div className="bg-gray-700/50 rounded-lg overflow-hidden">
                        <div className="bg-gray-700 px-4 py-3 flex items-center gap-3">
                          <TeamLogo teamName={gameData.awayteam} leagueId={gameData.league_id} size="sm" />
                          <h4 className="font-semibold">{gameData.awayteam}</h4>
                          {awayScore !== null && <span className="ml-auto text-2xl font-bold">{awayScore}</span>}
                        </div>
                        {awayPlayerStats.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-800/50 text-gray-400">
                                <tr>
                                  <th className="text-left py-2 px-3 sticky left-0 bg-gray-800/50">Player</th>
                                  <th className="text-center py-2 px-2">MIN</th>
                                  <th className="text-center py-2 px-2">PTS</th>
                                  <th className="text-center py-2 px-2">REB</th>
                                  <th className="text-center py-2 px-2">AST</th>
                                  <th className="text-center py-2 px-2">STL</th>
                                  <th className="text-center py-2 px-2">BLK</th>
                                  <th className="text-center py-2 px-2">TO</th>
                                  <th className="text-center py-2 px-2">FG</th>
                                  <th className="text-center py-2 px-2">3PT</th>
                                  <th className="text-center py-2 px-2">FT</th>
                                </tr>
                              </thead>
                              <tbody>
                                {awayPlayerStats.map((player, idx) => (
                                  <tr key={idx} className="border-t border-gray-700/50 hover:bg-gray-700/30">
                                    <td className="py-2 px-3 sticky left-0 bg-gray-800/80 font-medium whitespace-nowrap">
                                      {player.firstname} {player.familyname}
                                    </td>
                                    <td className="text-center py-2 px-2 text-gray-400">{parseMinutes(player.sminutes)}</td>
                                    <td className="text-center py-2 px-2 font-semibold text-orange-400">{player.spoints || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sreboundstotal || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sassists || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400">{player.ssteals || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400">{player.sblocks || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400">{player.sturnovers || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400 whitespace-nowrap">
                                      {player.sfieldgoalsmade || 0}/{player.sfieldgoalsattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-gray-400 whitespace-nowrap">
                                      {player.sthreepointersmade || 0}/{player.sthreepointersattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-gray-400 whitespace-nowrap">
                                      {player.sfreethrowsmade || 0}/{player.sfreethrowsattempted || 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="p-4 text-gray-500 text-center italic">No player stats available</p>
                        )}
                      </div>

                      <div className="bg-gray-700/50 rounded-lg overflow-hidden">
                        <div className="bg-gray-700 px-4 py-3 flex items-center gap-3">
                          <TeamLogo teamName={gameData.hometeam} leagueId={gameData.league_id} size="sm" />
                          <h4 className="font-semibold">{gameData.hometeam}</h4>
                          {homeScore !== null && <span className="ml-auto text-2xl font-bold">{homeScore}</span>}
                        </div>
                        {homePlayerStats.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-800/50 text-gray-400">
                                <tr>
                                  <th className="text-left py-2 px-3 sticky left-0 bg-gray-800/50">Player</th>
                                  <th className="text-center py-2 px-2">MIN</th>
                                  <th className="text-center py-2 px-2">PTS</th>
                                  <th className="text-center py-2 px-2">REB</th>
                                  <th className="text-center py-2 px-2">AST</th>
                                  <th className="text-center py-2 px-2">STL</th>
                                  <th className="text-center py-2 px-2">BLK</th>
                                  <th className="text-center py-2 px-2">TO</th>
                                  <th className="text-center py-2 px-2">FG</th>
                                  <th className="text-center py-2 px-2">3PT</th>
                                  <th className="text-center py-2 px-2">FT</th>
                                </tr>
                              </thead>
                              <tbody>
                                {homePlayerStats.map((player, idx) => (
                                  <tr key={idx} className="border-t border-gray-700/50 hover:bg-gray-700/30">
                                    <td className="py-2 px-3 sticky left-0 bg-gray-800/80 font-medium whitespace-nowrap">
                                      {player.firstname} {player.familyname}
                                    </td>
                                    <td className="text-center py-2 px-2 text-gray-400">{parseMinutes(player.sminutes)}</td>
                                    <td className="text-center py-2 px-2 font-semibold text-orange-400">{player.spoints || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sreboundstotal || 0}</td>
                                    <td className="text-center py-2 px-2">{player.sassists || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400">{player.ssteals || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400">{player.sblocks || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400">{player.sturnovers || 0}</td>
                                    <td className="text-center py-2 px-2 text-gray-400 whitespace-nowrap">
                                      {player.sfieldgoalsmade || 0}/{player.sfieldgoalsattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-gray-400 whitespace-nowrap">
                                      {player.sthreepointersmade || 0}/{player.sthreepointersattempted || 0}
                                    </td>
                                    <td className="text-center py-2 px-2 text-gray-400 whitespace-nowrap">
                                      {player.sfreethrowsmade || 0}/{player.sfreethrowsattempted || 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="p-4 text-gray-500 text-center italic">No player stats available</p>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="teamstats">
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    {teamStats && teamStats.length >= 2 ? (
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div className="font-semibold text-gray-400">
                          {gameData.awayteam?.split(' ').slice(-1)[0]}
                        </div>
                        <div className="text-gray-500">Stat</div>
                        <div className="font-semibold text-gray-400">
                          {gameData.hometeam?.split(' ').slice(-1)[0]}
                        </div>

                        <div className="text-2xl font-bold">{awayTeamStats?.tot_spoints || 0}</div>
                        <div className="text-gray-500">Points</div>
                        <div className="text-2xl font-bold">{homeTeamStats?.tot_spoints || 0}</div>

                        <div>{awayTeamStats?.tot_sreboundstotal || 0}</div>
                        <div className="text-gray-500">Rebounds</div>
                        <div>{homeTeamStats?.tot_sreboundstotal || 0}</div>

                        <div>{awayTeamStats?.tot_sassists || 0}</div>
                        <div className="text-gray-500">Assists</div>
                        <div>{homeTeamStats?.tot_sassists || 0}</div>

                        <div>{awayTeamStats?.tot_ssteals || 0}</div>
                        <div className="text-gray-500">Steals</div>
                        <div>{homeTeamStats?.tot_ssteals || 0}</div>

                        <div>{awayTeamStats?.tot_sblocks || 0}</div>
                        <div className="text-gray-500">Blocks</div>
                        <div>{homeTeamStats?.tot_sblocks || 0}</div>

                        <div>{awayTeamStats?.tot_sturnovers || 0}</div>
                        <div className="text-gray-500">Turnovers</div>
                        <div>{homeTeamStats?.tot_sturnovers || 0}</div>

                        <div className="whitespace-nowrap">
                          {awayTeamStats?.tot_sfieldgoalsmade || 0}/{awayTeamStats?.tot_sfieldgoalsattempted || 0}
                        </div>
                        <div className="text-gray-500">FG</div>
                        <div className="whitespace-nowrap">
                          {homeTeamStats?.tot_sfieldgoalsmade || 0}/{homeTeamStats?.tot_sfieldgoalsattempted || 0}
                        </div>

                        <div className="whitespace-nowrap">
                          {awayTeamStats?.tot_sthreepointersmade || 0}/{awayTeamStats?.tot_sthreepointersattempted || 0}
                        </div>
                        <div className="text-gray-500">3PT</div>
                        <div className="whitespace-nowrap">
                          {homeTeamStats?.tot_sthreepointersmade || 0}/{homeTeamStats?.tot_sthreepointersattempted || 0}
                        </div>

                        <div className="whitespace-nowrap">
                          {awayTeamStats?.tot_sfreethrowsmade || 0}/{awayTeamStats?.tot_sfreethrowsattempted || 0}
                        </div>
                        <div className="text-gray-500">FT</div>
                        <div className="whitespace-nowrap">
                          {homeTeamStats?.tot_sfreethrowsmade || 0}/{homeTeamStats?.tot_sfreethrowsattempted || 0}
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center italic">Team stats will appear when available</p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="playbyplay">
                  <div className="bg-gray-700/50 rounded-lg p-6 text-center">
                    <p className="text-gray-500 italic">Play-by-play data coming soon</p>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
