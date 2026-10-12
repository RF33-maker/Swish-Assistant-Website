import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeTeamName } from "@/lib/teamUtils";
import ShareableCard from "@/components/ShareableCard";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { PlayerHeadshot } from "@/components/PlayerHeadshot";
import { generateComparisonCardBlob } from "@/lib/generateComparisonCard";
import { extractTeamColors } from "@/lib/colorExtractor";
import {
  CATEGORY_OPTIONS,
  ChipRow,
  CompareEmpty,
  CompareError,
  CompareHeader,
  CompareLoading,
  ComparePicker,
  CompareRows,
  CopyLinkButton,
  readCompareParam,
  scoreRows,
  shortTeamName,
  Suggestions,
  VIEW_OPTIONS,
  writeCompareParams,
  type CompareCategory,
  type CompareView,
  type Suggestion,
} from "@/components/compare/compareUi";

interface PlayerComparisonProps {
  leagueId: string;
  allPlayers: any[];
  brandColor?: string;
  /** A player to start with on the left, by their page slug (from "Compare" on a player's page). */
  preselectSlug?: string | null;
  /** For the downloadable card. */
  leagueName?: string;
  leagueLogoUrl?: string | null;
}

const areSimilarNames = (name1: string, name2: string): boolean => {
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  if (n1 === n2) return true;
  const maxLength = Math.max(n1.length, n2.length);
  if (Math.abs(n1.length - n2.length) <= 2 && maxLength > 5) {
    let differences = 0;
    for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
      if (n1[i] !== n2[i]) differences++;
      if (differences > 2) return false;
    }
    return true;
  }
  return false;
};

const getStatName = (stat: any): string =>
  (stat.name || stat.full_name || `${stat.firstname || ''} ${stat.familyname || ''}`.trim()).toLowerCase().trim();

function aggregatePlayerStats(stats: any[], displayName: string, teamName: string) {
  const games = stats.length;
  if (games === 0) return null;

  let totalPoints = 0, totalRebounds = 0, totalAssists = 0, totalSteals = 0;
  let totalBlocks = 0, totalTurnovers = 0, totalFGM = 0, totalFGA = 0;
  let total3PM = 0, total3PA = 0, total2PM = 0, total2PA = 0;
  let totalFTM = 0, totalFTA = 0, totalMinutes = 0, totalPersonalFouls = 0;
  let totalOReb = 0, totalDReb = 0, totalPlusMinus = 0;



  stats.forEach((stat: any) => {
    totalPoints += stat.spoints || 0;
    totalRebounds += stat.sreboundstotal || 0;
    totalAssists += stat.sassists || 0;
    totalSteals += stat.ssteals || 0;
    totalBlocks += stat.sblocks || 0;
    totalTurnovers += stat.sturnovers || 0;
    totalFGM += stat.sfieldgoalsmade || 0;
    totalFGA += stat.sfieldgoalsattempted || 0;
    total3PM += stat.sthreepointersmade || 0;
    total3PA += stat.sthreepointersattempted || 0;
    total2PM += stat.stwopointersmade || 0;
    total2PA += stat.stwopointersattempted || 0;
    totalFTM += stat.sfreethrowsmade || 0;
    totalFTA += stat.sfreethrowsattempted || 0;
    totalPersonalFouls += stat.sfoulspersonal || 0;
    totalOReb += stat.sreboundsoffensive || 0;
    totalDReb += stat.sreboundsdefensive || 0;
    totalPlusMinus += stat.splusminus || 0;

    const minutesParts = stat.sminutes?.split(':');
    if (minutesParts && minutesParts.length === 2) {
      const minutes = parseInt(minutesParts[0]) + parseInt(minutesParts[1]) / 60;
      totalMinutes += minutes;
    }


  });

  // The advanced figures are stored per game and are missing for some games; average only the
  // games that have one, rather than counting a missing game as a zero.
  const avg = (column: string, decimals = 1): string => {
    const values = stats.map((row: any) => row[column]).filter((v: any) => v != null && Number.isFinite(Number(v))).map(Number);
    return (values.length ? values.reduce((sum: number, v: number) => sum + v, 0) / values.length : 0).toFixed(decimals);
  };

  return {
    name: displayName,
    team: teamName,
    games,
    ppg: (totalPoints / games).toFixed(1),
    rpg: (totalRebounds / games).toFixed(1),
    apg: (totalAssists / games).toFixed(1),
    spg: (totalSteals / games).toFixed(1),
    bpg: (totalBlocks / games).toFixed(1),
    tpg: (totalTurnovers / games).toFixed(1),
    mpg: (totalMinutes / games).toFixed(1),
    fpg: (totalPersonalFouls / games).toFixed(1),
    orpg: (totalOReb / games).toFixed(1),
    drpg: (totalDReb / games).toFixed(1),
    plusMinus: (totalPlusMinus / games).toFixed(1),
    fgPercentage: totalFGA > 0 ? ((totalFGM / totalFGA) * 100).toFixed(1) : '0.0',
    twoPercentage: total2PA > 0 ? ((total2PM / total2PA) * 100).toFixed(1) : '0.0',
    threePercentage: total3PA > 0 ? ((total3PM / total3PA) * 100).toFixed(1) : '0.0',
    ftPercentage: totalFTA > 0 ? ((totalFTM / totalFTA) * 100).toFixed(1) : '0.0',
    efgPercent: avg('efg_percent'),
    tsPercent: avg('ts_percent'),
    threePtRate: avg('three_point_rate'),
    astPercent: avg('ast_percent'),
    astToRatio: avg('ast_to_ratio', 2),
    orebPercent: avg('oreb_percent'),
    drebPercent: avg('dreb_percent'),
    rebPercent: avg('reb_percent'),
    tovPercent: avg('tov_percent'),
    usagePercent: avg('usage_percent'),
    pie: avg('pie'),
    offRating: avg('off_rating'),
    defRating: avg('def_rating'),
    netRating: avg('net_rating'),
    pts2ptPercent: avg('pts_percent_2pt'),
    pts3ptPercent: avg('pts_percent_3pt'),
    ptsFtPercent: avg('pts_percent_ft'),
    ptsMidrangePercent: avg('pts_percent_midrange'),
    ptsPitpPercent: avg('pts_percent_pitp'),
    ptsFbPercent: avg('pts_percent_fastbreak'),
    pts2ndChPercent: avg('pts_percent_second_chance'),
    ptsOffToPercent: avg('pts_percent_off_turnovers'),
  };
}

function getPlayerComparisonRows(
  category: 'Traditional' | 'Advanced' | 'Scoring' | 'Misc',
  player1Stats: any,
  player2Stats: any
) {
  if (!player1Stats || !player2Stats) return [];
  switch (category) {
    case 'Traditional':
      return [
        { label: 'PPG', value1: player1Stats.ppg, value2: player2Stats.ppg },
        { label: 'RPG', value1: player1Stats.rpg, value2: player2Stats.rpg },
        { label: 'ORPG', value1: player1Stats.orpg, value2: player2Stats.orpg },
        { label: 'DRPG', value1: player1Stats.drpg, value2: player2Stats.drpg },
        { label: 'APG', value1: player1Stats.apg, value2: player2Stats.apg },
        { label: 'SPG', value1: player1Stats.spg, value2: player2Stats.spg },
        { label: 'BPG', value1: player1Stats.bpg, value2: player2Stats.bpg },
        { label: 'TPG', value1: player1Stats.tpg, value2: player2Stats.tpg, lowerIsBetter: true },
        { label: 'FPG', value1: player1Stats.fpg, value2: player2Stats.fpg, lowerIsBetter: true },
        { label: '+/-', value1: player1Stats.plusMinus, value2: player2Stats.plusMinus },
        { label: 'MPG', value1: player1Stats.mpg, value2: player2Stats.mpg },
        { label: 'FG%', value1: `${player1Stats.fgPercentage}%`, value2: `${player2Stats.fgPercentage}%` },
        { label: '2P%', value1: `${player1Stats.twoPercentage}%`, value2: `${player2Stats.twoPercentage}%` },
        { label: '3P%', value1: `${player1Stats.threePercentage}%`, value2: `${player2Stats.threePercentage}%` },
        { label: 'FT%', value1: `${player1Stats.ftPercentage}%`, value2: `${player2Stats.ftPercentage}%` },
      ];
    case 'Advanced':
      return [
        { label: 'eFG%', value1: `${player1Stats.efgPercent}%`, value2: `${player2Stats.efgPercent}%` },
        { label: 'TS%', value1: `${player1Stats.tsPercent}%`, value2: `${player2Stats.tsPercent}%` },
        { label: '3PT Rate', value1: `${player1Stats.threePtRate}%`, value2: `${player2Stats.threePtRate}%` },
        { label: 'AST%', value1: `${player1Stats.astPercent}%`, value2: `${player2Stats.astPercent}%` },
        { label: 'AST/TO', value1: player1Stats.astToRatio, value2: player2Stats.astToRatio },
        { label: 'OREB%', value1: `${player1Stats.orebPercent}%`, value2: `${player2Stats.orebPercent}%` },
        { label: 'DREB%', value1: `${player1Stats.drebPercent}%`, value2: `${player2Stats.drebPercent}%` },
        { label: 'REB%', value1: `${player1Stats.rebPercent}%`, value2: `${player2Stats.rebPercent}%` },
        { label: 'TOV%', value1: `${player1Stats.tovPercent}%`, value2: `${player2Stats.tovPercent}%`, lowerIsBetter: true },
        { label: 'USG%', value1: `${player1Stats.usagePercent}%`, value2: `${player2Stats.usagePercent}%` },
        { label: 'PIE', value1: `${player1Stats.pie}%`, value2: `${player2Stats.pie}%` },
        { label: 'OFF RTG', value1: player1Stats.offRating, value2: player2Stats.offRating },
        { label: 'DEF RTG', value1: player1Stats.defRating, value2: player2Stats.defRating, lowerIsBetter: true },
        { label: 'NET RTG', value1: player1Stats.netRating, value2: player2Stats.netRating },
      ];
    case 'Scoring':
      return [
        { label: 'PPG', value1: player1Stats.ppg, value2: player2Stats.ppg },
        { label: '%PTS 2PT', value1: `${player1Stats.pts2ptPercent}%`, value2: `${player2Stats.pts2ptPercent}%` },
        { label: '%PTS 3PT', value1: `${player1Stats.pts3ptPercent}%`, value2: `${player2Stats.pts3ptPercent}%` },
        { label: '%PTS FT', value1: `${player1Stats.ptsFtPercent}%`, value2: `${player2Stats.ptsFtPercent}%` },
        { label: '%PTS Midrange', value1: `${player1Stats.ptsMidrangePercent}%`, value2: `${player2Stats.ptsMidrangePercent}%` },
        { label: '%PTS PITP', value1: `${player1Stats.ptsPitpPercent}%`, value2: `${player2Stats.ptsPitpPercent}%` },
        { label: '%PTS FB', value1: `${player1Stats.ptsFbPercent}%`, value2: `${player2Stats.ptsFbPercent}%` },
        { label: '%PTS 2nd Ch', value1: `${player1Stats.pts2ndChPercent}%`, value2: `${player2Stats.pts2ndChPercent}%` },
        { label: '%PTS Off TO', value1: `${player1Stats.ptsOffToPercent}%`, value2: `${player2Stats.ptsOffToPercent}%` },
      ];
    case 'Misc':
      return [
        { label: 'PPG', value1: player1Stats.ppg, value2: player2Stats.ppg },
        { label: 'RPG', value1: player1Stats.rpg, value2: player2Stats.rpg },
        { label: 'APG', value1: player1Stats.apg, value2: player2Stats.apg },
        { label: 'MPG', value1: player1Stats.mpg, value2: player2Stats.mpg },
        { label: '+/-', value1: player1Stats.plusMinus, value2: player2Stats.plusMinus },
        { label: 'FPG', value1: player1Stats.fpg, value2: player2Stats.fpg, lowerIsBetter: true },
        { label: 'TPG', value1: player1Stats.tpg, value2: player2Stats.tpg, lowerIsBetter: true },
      ];
    default:
      return [];
  }
}

/** A club's colour for the card, taken from its crest as elsewhere on the site; null when there is no crest. */
async function clubColour(teamName: string | null | undefined, leagueId: string): Promise<string | null> {
  if (!teamName || !leagueId) return null;
  const colours = await extractTeamColors(teamName, leagueId).catch(() => null);
  if (!colours) return null;
  const { r, g, b } = colours.primaryRgb;
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

export function PlayerComparison({ leagueId, allPlayers, brandColor, preselectSlug, leagueName, leagueLogoUrl }: PlayerComparisonProps) {
  const [player1Id, setPlayer1Id] = useState<string>("");
  const [player2Id, setPlayer2Id] = useState<string>("");
  const [player1Stats, setPlayer1Stats] = useState<any>(null);
  const [player2Stats, setPlayer2Stats] = useState<any>(null);
  const [player1Raw, setPlayer1Raw] = useState<any[]>([]);
  const [player2Raw, setPlayer2Raw] = useState<any[]>([]);
  const [player1Display, setPlayer1Display] = useState<string>("");
  const [player2Display, setPlayer2Display] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // The category and view can arrive in the page's address, with the two players (see the effects below).
  const [comparisonCategory, setComparisonCategory] = useState<CompareCategory>(
    () => CATEGORY_OPTIONS.find((c) => c.value.toLowerCase() === readCompareParam('cat'))?.value ?? 'Traditional',
  );
  const [view, setView] = useState<CompareView>(() => (readCompareParam('view') === 'h2h' ? 'h2h' : 'season'));

  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const [player1PhotoUrl, setPlayer1PhotoUrl] = useState<string | null>(null);
  const [player2PhotoUrl, setPlayer2PhotoUrl] = useState<string | null>(null);
  const [player1TeamLogoUrl, setPlayer1TeamLogoUrl] = useState<string | null>(null);
  const [player2TeamLogoUrl, setPlayer2TeamLogoUrl] = useState<string | null>(null);
  const [teamGameScores, setTeamGameScores] = useState<Map<string, Map<string, number>>>(new Map());

  // Resolve each player's team logo for the share-card header band.
  useEffect(() => {
    let cancelled = false;
    setPlayer1TeamLogoUrl(null);
    const teamName = player1Stats?.team;
    if (!teamName || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName }).then((url) => {
      if (!cancelled) setPlayer1TeamLogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [player1Stats?.team, leagueId]);
  useEffect(() => {
    let cancelled = false;
    setPlayer2TeamLogoUrl(null);
    const teamName = player2Stats?.team;
    if (!teamName || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName }).then((url) => {
      if (!cancelled) setPlayer2TeamLogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [player2Stats?.team, leagueId]);

  const fetchAllPlayerStats = async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from("player_stats")
      .select("*")
      .eq("league_id", leagueId);
    if (error) throw error;
    return data || [];
  };

  const filterStatsByPlayer = (allStats: any[], playerId: string): { raw: any[]; displayName: string; teamName: string } => {
    const selectedPlayer = allPlayers.find(p => p.playerKey === playerId);
    if (!selectedPlayer) return { raw: [], displayName: '', teamName: '' };
    const playerName = selectedPlayer.name.toLowerCase().trim();
    const stats = allStats.filter((stat: any) =>
      areSimilarNames(playerName, getStatName(stat))
    );
    return {
      raw: stats,
      displayName: selectedPlayer.name,
      teamName: stats[0]?.team || stats[0]?.team_name || '',
    };
  };

  const handleCompare = async () => {
    if (!player1Id || !player2Id) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const allStats = await fetchAllPlayerStats();
      const p1 = filterStatsByPlayer(allStats, player1Id);
      const p2 = filterStatsByPlayer(allStats, player2Id);
      setPlayer1Raw(p1.raw);
      setPlayer2Raw(p2.raw);
      setPlayer1Display(p1.displayName);
      setPlayer2Display(p2.displayName);
      setPlayer1Stats(aggregatePlayerStats(p1.raw, p1.displayName, p1.teamName));
      setPlayer2Stats(aggregatePlayerStats(p2.raw, p2.displayName, p2.teamName));

      // Build team-points-per-game map so we can determine head-to-head winners.
      const scoresByGame = new Map<string, Map<string, number>>();
      allStats.forEach((row: any) => {
        const gid = row.game_id ?? row.game_key ?? null;
        const teamId = row.team_id ?? row.team_name ?? row.team ?? null;
        const pts = Number(row.spoints) || 0;
        if (gid == null || teamId == null) return;
        const gKey = String(gid);
        const tKey = String(teamId);
        let teamMap = scoresByGame.get(gKey);
        if (!teamMap) {
          teamMap = new Map<string, number>();
          scoresByGame.set(gKey, teamMap);
        }
        teamMap.set(tKey, (teamMap.get(tKey) || 0) + pts);
      });
      setTeamGameScores(scoresByGame);
    } catch (error) {
      console.error("Error comparing players:", error);
      setFetchError("We couldn't load the comparison data. Please try again.");
      setPlayer1Raw([]);
      setPlayer2Raw([]);
      setPlayer1Stats(null);
      setPlayer2Stats(null);
      setTeamGameScores(new Map());
    } finally {
      setIsLoading(false);
    }
  };

  // Resolve player photos (where available) for the share card.
  useEffect(() => {
    let cancelled = false;
    const fetchPhoto = async (playerId: string): Promise<string | null> => {
      if (!playerId || playerId.startsWith('name_')) return null;
      try {
        const { data, error } = await supabase
          .from('players')
          .select('photo_path, photo_path_bg_removed')
          .eq('id', playerId)
          .maybeSingle();
        if (error || !data) return null;
        const path = data.photo_path_bg_removed || data.photo_path;
        if (!path) return null;
        const { data: pub } = supabase.storage.from('player-photos').getPublicUrl(path);
        return pub?.publicUrl || null;
      } catch {
        return null;
      }
    };
    if (player1Id) {
      fetchPhoto(player1Id).then((url) => { if (!cancelled) setPlayer1PhotoUrl(url); });
    } else {
      setPlayer1PhotoUrl(null);
    }
    if (player2Id) {
      fetchPhoto(player2Id).then((url) => { if (!cancelled) setPlayer2PhotoUrl(url); });
    } else {
      setPlayer2PhotoUrl(null);
    }
    return () => { cancelled = true; };
  }, [player1Id, player2Id]);

  useEffect(() => {
    if (player1Id && player2Id) {
      handleCompare();
    } else {
      setFetchError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player1Id, player2Id]);

  // Best scorers first, so an untouched search box opens on names worth picking.
  const rankedPlayers = useMemo(
    () => allPlayers.slice().sort((a, b) => parseFloat(b.avgPoints) - parseFloat(a.avgPoints)),
    [allPlayers],
  );
  const optionsFor = (search: string, selectedId: string) => {
    const text = search.toLowerCase().trim();
    const chosen = selectedId ? allPlayers.find((p) => p.playerKey === selectedId) : null;
    // With a player already in the box, the list offers others rather than only that name.
    const matches = !text || chosen?.name?.toLowerCase() === text
      ? rankedPlayers
      : rankedPlayers.filter((p) => p.name?.toLowerCase().includes(text) || p.team?.toLowerCase().includes(text));
    return matches.slice(0, 10).map((p) => ({
      key: String(p.playerKey),
      title: p.name,
      sub: [shortTeamName(p.team), `${p.avgPoints} PPG`].filter(Boolean).join(' · '),
    }));
  };

  // A comparison can be opened from a link (?p1=…&p2=…) or from a player's page. The player list
  // arrives in stages, so each side waits here until its player turns up in it.
  const pendingRef = useRef<{ first: string | null; second: string | null; slug: string | null }>({
    first: preselectSlug ? null : readCompareParam('p1'),
    second: preselectSlug ? null : readCompareParam('p2'),
    slug: preselectSlug ?? null,
  });

  const pickPlayer = (side: 1 | 2, player: any) => {
    if (side === 1) {
      pendingRef.current.first = null;
      pendingRef.current.slug = null;
      setPlayer1Id(player.playerKey);
      setSearch1(player.name);
    } else {
      pendingRef.current.second = null;
      setPlayer2Id(player.playerKey);
      setSearch2(player.name);
    }
  };
  const selectPlayer1 = (playerKey: string) => {
    const player = allPlayers.find((p) => String(p.playerKey) === playerKey);
    if (player) pickPlayer(1, player);
  };
  const selectPlayer2 = (playerKey: string) => {
    const player = allPlayers.find((p) => String(p.playerKey) === playerKey);
    if (player) pickPlayer(2, player);
  };

  useEffect(() => {
    const pending = pendingRef.current;
    if (pending.slug) {
      const player = allPlayers.find((p) => p.slug === pending.slug);
      if (player) pickPlayer(1, player);
    }
    if (pending.first) selectPlayer1(pending.first);
    if (pending.second) selectPlayer2(pending.second);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers]);

  // Keep the page's address in step, so the comparison on show can be copied as a link.
  useEffect(() => {
    writeCompareParams({
      section: 'comparison',
      compare: 'player',
      p1: player1Id || pendingRef.current.first,
      p2: player2Id || pendingRef.current.second,
      cat: comparisonCategory === 'Traditional' ? null : comparisonCategory.toLowerCase(),
      view: view === 'season' ? null : view,
    });
  }, [player1Id, player2Id, comparisonCategory, view]);
  useEffect(() => () => writeCompareParams({ p1: null, p2: null, cat: null, view: null }), []);

  // One-tap matchups for the empty state: the top two in the headline categories.
  const suggestions = useMemo<Suggestion[]>(() => {
    const mostGames = Math.max(0, ...allPlayers.map((p) => Number(p.games) || 0));
    const regulars = allPlayers.filter((p) => (Number(p.games) || 0) >= Math.max(1, Math.ceil(mostGames / 2)));
    const topTwo = (label: string, field: string): Suggestion | null => {
      const [a, b] = regulars.slice().sort((x, y) => parseFloat(y[field]) - parseFloat(x[field]));
      return a && b ? { label, detail: `${a.name} vs ${b.name}`, first: String(a.playerKey), second: String(b.playerKey) } : null;
    };
    return [topTwo('Top two scorers', 'avgPoints'), topTwo('Top two rebounders', 'avgRebounds'), topTwo('Top two playmakers', 'avgAssists')]
      .filter((x): x is Suggestion => !!x);
  }, [allPlayers]);

  // Build head-to-head data
  type PlayerH2HLine = { pts: number; reb: number; ast: number; min: string };
  type PlayerH2HGame = {
    game_id: string;
    date: string | null;
    team1Name: string;
    team2Name: string;
    p1Line: PlayerH2HLine;
    p2Line: PlayerH2HLine;
    p1TeamScore: number | null;
    p2TeamScore: number | null;
    winner: 'p1' | 'p2' | 'tie' | null;
  };
  type PlayerH2H = {
    games: PlayerH2HGame[];
    p1Stats: ReturnType<typeof aggregatePlayerStats>;
    p2Stats: ReturnType<typeof aggregatePlayerStats>;
    p1Wins: number;
    p2Wins: number;
  };
  const h2h = useMemo<PlayerH2H>(() => {
    if (!player1Raw.length || !player2Raw.length) {
      return { games: [], p1Stats: null, p2Stats: null, p1Wins: 0, p2Wins: 0 };
    }
    // Index player2's rows by game_id (fallback to game_key)
    const gameIdOf = (s: any) => s.game_id ?? s.game_key ?? null;
    const p2ByGame = new Map<string, any>();
    player2Raw.forEach((s: any) => {
      const gid = gameIdOf(s);
      if (gid != null) p2ByGame.set(String(gid), s);
    });

    const sharedP1: any[] = [];
    const sharedP2: any[] = [];
    const games: PlayerH2HGame[] = [];

    player1Raw.forEach((s1: any) => {
      const gid = gameIdOf(s1);
      if (gid == null) return;
      const s2 = p2ByGame.get(String(gid));
      if (!s2) return;

      // Require opposing teams
      const team1Id = s1.team_id ?? null;
      const team2Id = s2.team_id ?? null;
      if (team1Id != null && team2Id != null) {
        if (team1Id === team2Id) return;
      } else {
        const team1Norm = normalizeTeamName(s1.team_name || s1.team || '').toLowerCase();
        const team2Norm = normalizeTeamName(s2.team_name || s2.team || '').toLowerCase();
        if (!team1Norm || !team2Norm || team1Norm === team2Norm) return;
      }

      sharedP1.push(s1);
      sharedP2.push(s2);

      const minutesToStr = (raw: any): string => {
        if (typeof raw === 'string') return raw;
        if (typeof raw === 'number') return raw.toFixed(1);
        return '—';
      };

      const teamScoreMap = teamGameScores.get(String(gid));
      const teamKey1 = String(s1.team_id ?? s1.team_name ?? s1.team ?? '');
      const teamKey2 = String(s2.team_id ?? s2.team_name ?? s2.team ?? '');
      const p1TeamScore = teamScoreMap?.get(teamKey1) ?? null;
      const p2TeamScore = teamScoreMap?.get(teamKey2) ?? null;
      let winner: 'p1' | 'p2' | 'tie' | null = null;
      if (p1TeamScore != null && p2TeamScore != null) {
        if (p1TeamScore > p2TeamScore) winner = 'p1';
        else if (p2TeamScore > p1TeamScore) winner = 'p2';
        else winner = 'tie';
      }

      games.push({
        game_id: gid,
        date: s1.game_date || s2.game_date || s1.created_at || s2.created_at || null,
        team1Name: s1.team_name || s1.team || '—',
        team2Name: s2.team_name || s2.team || '—',
        p1Line: {
          pts: s1.spoints ?? 0,
          reb: s1.sreboundstotal ?? 0,
          ast: s1.sassists ?? 0,
          min: minutesToStr(s1.sminutes),
        },
        p2Line: {
          pts: s2.spoints ?? 0,
          reb: s2.sreboundstotal ?? 0,
          ast: s2.sassists ?? 0,
          min: minutesToStr(s2.sminutes),
        },
        p1TeamScore,
        p2TeamScore,
        winner,
      });
    });

    games.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

    return {
      games,
      p1Stats: aggregatePlayerStats(sharedP1, player1Display, sharedP1[0]?.team_name || sharedP1[0]?.team || ''),
      p2Stats: aggregatePlayerStats(sharedP2, player2Display, sharedP2[0]?.team_name || sharedP2[0]?.team || ''),
      p1Wins: games.filter((g) => g.winner === 'p1').length,
      p2Wins: games.filter((g) => g.winner === 'p2').length,
    };
  }, [player1Raw, player2Raw, player1Display, player2Display, teamGameScores]);

  const headshot = (name: string, photoUrl: string | null) =>
    photoUrl ? (
      <PlayerHeadshot src={photoUrl} alt={name} className="h-full w-full object-cover" fallbackClassName="object-top" />
    ) : undefined;

  const renderHeaderRow = (s1: any, s2: any, caption?: string) => (
    <CompareHeader
      caption={caption}
      accent={brandColor}
      left={{ name: s1.name, sub: shortTeamName(s1.team), games: s1.games, media: headshot(s1.name, player1PhotoUrl) }}
      right={{ name: s2.name, sub: shortTeamName(s2.team), games: s2.games, media: headshot(s2.name, player2PhotoUrl) }}
    />
  );

  const renderStatsTable = (s1: any, s2: any) => (
    <CompareRows rows={getPlayerComparisonRows(comparisonCategory, s1, s2)} leftName={s1.name} rightName={s2.name} accent={brandColor} />
  );

  const formatDate = (raw: string | null) => {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // The downloadable card: drawn on a canvas in the Swish Social look, from whichever view is on show.
  const generateCardBlob = async () => {
    const inH2H = view === 'h2h' && h2h.p1Stats && h2h.p2Stats;
    const s1 = inH2H ? h2h.p1Stats : player1Stats;
    const s2 = inH2H ? h2h.p2Stats : player2Stats;
    // Each half of the card in that player's club colour.
    const [leftColour, rightColour] = await Promise.all([clubColour(s1.team, leagueId), clubColour(s2.team, leagueId)]);
    const side = (s: any, photoUrl: string | null, logoUrl: string | null) => ({
      name: s.name, sub: shortTeamName(s.team), games: s.games, photoUrl, logoUrl,
    });
    return generateComparisonCardBlob({
      split: { left: leftColour, right: rightColour },
      kind: 'player',
      left: side(s1, player1PhotoUrl, player1TeamLogoUrl),
      right: side(s2, player2PhotoUrl, player2TeamLogoUrl),
      rows: scoreRows(getPlayerComparisonRows(comparisonCategory, s1, s2)).map((r) => ({ ...r, value1: String(r.value1), value2: String(r.value2) })),
      banner: `${inH2H ? 'Head-to-head only' : 'Season averages'} · ${comparisonCategory}`,
      results: inH2H
        ? h2h.games.map((g) => `${formatDate(g.date)} · ${g.p1Line.pts}p ${g.p1Line.reb}r ${g.p1Line.ast}a  v  ${g.p2Line.pts}p ${g.p2Line.reb}r ${g.p2Line.ast}a`)
        : undefined,
      leagueName: leagueName || '',
      leagueLogoUrl,
      primaryHex: brandColor || '#f97316',
    });
  };

  const clearPlayer1 = () => {
    setPlayer1Id("");
    setPlayer1Stats(null);
    setPlayer1Raw([]);
  };
  const clearPlayer2 = () => {
    setPlayer2Id("");
    setPlayer2Stats(null);
    setPlayer2Raw([]);
  };
  const cell = "py-2 px-3";

  return (
    <div className="ch-card p-4 md:p-6" data-testid="player-comparison">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">Player comparison</h2>
        {player1Stats && player2Stats && <CopyLinkButton testId="button-player-compare-link" />}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <ComparePicker
          label="Player 1"
          search={search1}
          onSearch={setSearch1}
          options={optionsFor(search1, player1Id)}
          onSelect={selectPlayer1}
          onClear={clearPlayer1}
          placeholder="Search for a player..."
          testId="player1"
        />
        <ComparePicker
          label="Player 2"
          search={search2}
          onSearch={setSearch2}
          options={optionsFor(search2, player2Id)}
          onSelect={selectPlayer2}
          onClear={clearPlayer2}
          placeholder="Search for a player..."
          testId="player2"
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <ChipRow label="View" options={VIEW_OPTIONS} value={view} onChange={setView} testIdPrefix="tab-player" />
        <ChipRow label="Stat category" options={CATEGORY_OPTIONS} value={comparisonCategory} onChange={setComparisonCategory} testIdPrefix="category-player" />
      </div>

      {isLoading ? (
        <CompareLoading />
      ) : fetchError ? (
        <CompareError message={fetchError} onRetry={player1Id && player2Id ? () => handleCompare() : undefined} testId="error-player-compare" />
      ) : player1Stats && player2Stats ? (
        <ShareableCard
          title={view === 'season' ? 'Season Averages' : 'Head-to-Head'}
          fileSlug={`player-compare-${view}-${comparisonCategory.toLowerCase()}`}
          player={{
            name: `${player1Stats.name} vs ${player2Stats.name}`,
            team: 'Player Comparison',
            primaryColor: brandColor,
          }}
          shareCaption={comparisonCategory.toUpperCase()}
          generateCardBlob={generateCardBlob}
          // The image is drawn by generateCardBlob, so the hidden capture layout isn't needed.
          shareContent={<></>}
          teamLogos={[
            { name: player1Stats.team || player1Stats.name, logoUrl: player1TeamLogoUrl },
            { name: player2Stats.team || player2Stats.name, logoUrl: player2TeamLogoUrl },
          ]}
          wide
        >
        <div className="mx-auto max-w-4xl pt-6">
          {view === 'season' ? (
            <>
              {renderHeaderRow(player1Stats, player2Stats)}
              {renderStatsTable(player1Stats, player2Stats)}
            </>
          ) : (
            <div data-testid="content-player-h2h">
              {h2h.games.length === 0 ? (
                <CompareEmpty title="No head-to-head matchups yet">
                  {player1Stats.name} and {player2Stats.name} haven't faced each other on opposing teams in this league.
                </CompareEmpty>
              ) : (
                <>
                  <div className="mb-5 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ch-muted)]">Times faced off</p>
                    <p className="ch-num mt-1 text-2xl font-black text-[color:var(--ch-text)] md:text-3xl" data-testid="text-player-h2h-count">
                      {h2h.games.length} game{h2h.games.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  <div className="mb-7 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--ch-border-strong)] text-xs text-[color:var(--ch-text-2)]">
                          <th className={`${cell} text-left font-semibold`}>Date</th>
                          <th className={`${cell} text-left font-semibold`}>Matchup</th>
                          <th className={`${cell} text-center font-semibold`}>{player1Stats.name}</th>
                          <th className={`${cell} text-center font-semibold`}>{player2Stats.name}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h2h.games.map((g, idx) => (
                          <tr key={`${g.game_id}-${idx}`} className="border-b border-[color:var(--ch-border)]" data-testid={`row-player-h2h-game-${idx}`}>
                            <td className={`${cell} whitespace-nowrap text-[color:var(--ch-text-2)]`}>{formatDate(g.date)}</td>
                            <td className={`${cell} text-[color:var(--ch-text-2)]`}>
                              {shortTeamName(g.team1Name)} <span className="text-[color:var(--ch-muted)]">vs</span> {shortTeamName(g.team2Name)}
                            </td>
                            <td className={`${cell} ch-num text-center text-[color:var(--ch-text)]`}>
                              <span className="font-semibold">{g.p1Line.pts}</span>p / {g.p1Line.reb}r / {g.p1Line.ast}a
                              <div className="text-xs text-[color:var(--ch-muted)]">{g.p1Line.min} min</div>
                            </td>
                            <td className={`${cell} ch-num text-center text-[color:var(--ch-text)]`}>
                              <span className="font-semibold">{g.p2Line.pts}</span>p / {g.p2Line.reb}r / {g.p2Line.ast}a
                              <div className="text-xs text-[color:var(--ch-muted)]">{g.p2Line.min} min</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {h2h.p1Stats && h2h.p2Stats && (
                    <>
                      {renderHeaderRow(h2h.p1Stats, h2h.p2Stats, 'In head-to-head games only')}
                      {renderStatsTable(h2h.p1Stats, h2h.p2Stats)}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        </ShareableCard>
      ) : (
        <Suggestions
          loading={allPlayers.length === 0}
          intro={
            player1Id || player2Id
              ? "Pick a second player to see the comparison."
              : "Pick two players above, or start with one of these."
          }
          suggestions={player1Id || player2Id ? [] : suggestions}
          onPick={(s) => {
            selectPlayer1(s.first);
            selectPlayer2(s.second);
          }}
        />
      )}
    </div>
  );
}
