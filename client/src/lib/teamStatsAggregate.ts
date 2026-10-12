export function aggregateTeamStats(filteredStats: any[], teamName: string) {
  const games = filteredStats.length;
  if (games === 0) return null;

  let totalPoints = 0, totalFGM = 0, totalFGA = 0, total3PM = 0, total3PA = 0;
  let total2PM = 0, total2PA = 0, totalFTM = 0, totalFTA = 0;
  let totalRebounds = 0, totalOReb = 0, totalDReb = 0;
  let totalAssists = 0, totalSteals = 0, totalBlocks = 0, totalTurnovers = 0;
  let totalPlusMinus = 0, totalPF = 0;
  let totalPitp = 0, totalFastbreak = 0, totalSecondChance = 0;



  filteredStats.forEach((stat: any) => {
    totalPoints += stat.tot_spoints || 0;
    totalFGM += stat.tot_sfieldgoalsmade || 0;
    totalFGA += stat.tot_sfieldgoalsattempted || 0;
    total3PM += stat.tot_sthreepointersmade || 0;
    total3PA += stat.tot_sthreepointersattempted || 0;
    total2PM += stat.tot_stwopointersmade || 0;
    total2PA += stat.tot_stwopointersattempted || 0;
    totalFTM += stat.tot_sfreethrowsmade || 0;
    totalFTA += stat.tot_sfreethrowsattempted || 0;
    totalRebounds += stat.tot_sreboundstotal || 0;
    totalOReb += stat.tot_sreboundsoffensive || 0;
    totalDReb += stat.tot_sreboundsdefensive || 0;
    totalAssists += stat.tot_sassists || 0;
    totalSteals += stat.tot_ssteals || 0;
    totalBlocks += stat.tot_sblocks || 0;
    totalTurnovers += stat.tot_sturnovers || 0;
    totalPlusMinus += stat.tot_splusminuspoints || 0;
    totalPF += stat.tot_sfoulspersonal || 0;
    totalPitp += stat.tot_spointsinthepaint || 0;
    totalFastbreak += stat.tot_spointsfastbreak || 0;
    totalSecondChance += stat.tot_spointssecondchance || 0;


  });

  // The advanced figures are stored per game and are missing for some games; average only the
  // games that have one, rather than counting a missing game as a zero.
  const avg = (column: string, decimals = 1): string => {
    const values = filteredStats.map((row: any) => row[column]).filter((v: any) => v != null && Number.isFinite(Number(v))).map(Number);
    return (values.length ? values.reduce((sum: number, v: number) => sum + v, 0) / values.length : 0).toFixed(decimals);
  };

  return {
    name: teamName,
    games,
    ppg: (totalPoints / games).toFixed(1),
    rpg: (totalRebounds / games).toFixed(1),
    orpg: (totalOReb / games).toFixed(1),
    drpg: (totalDReb / games).toFixed(1),
    apg: (totalAssists / games).toFixed(1),
    spg: (totalSteals / games).toFixed(1),
    bpg: (totalBlocks / games).toFixed(1),
    tpg: (totalTurnovers / games).toFixed(1),
    fpg: (totalPF / games).toFixed(1),
    plusMinus: (totalPlusMinus / games).toFixed(1),
    pitpPg: (totalPitp / games).toFixed(1),
    fbPg: (totalFastbreak / games).toFixed(1),
    secondChPg: (totalSecondChance / games).toFixed(1),
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
    pace: avg('pace'),
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

export function getTeamComparisonRows(
  category: 'Traditional' | 'Advanced' | 'Scoring' | 'Misc',
  team1Stats: any,
  team2Stats: any
) {
  if (!team1Stats || !team2Stats) return [];
  switch (category) {
    case 'Traditional':
      return [
        { label: 'PPG', value1: team1Stats.ppg, value2: team2Stats.ppg },
        { label: 'RPG', value1: team1Stats.rpg, value2: team2Stats.rpg },
        { label: 'ORPG', value1: team1Stats.orpg, value2: team2Stats.orpg },
        { label: 'DRPG', value1: team1Stats.drpg, value2: team2Stats.drpg },
        { label: 'APG', value1: team1Stats.apg, value2: team2Stats.apg },
        { label: 'SPG', value1: team1Stats.spg, value2: team2Stats.spg },
        { label: 'BPG', value1: team1Stats.bpg, value2: team2Stats.bpg },
        { label: 'TPG', value1: team1Stats.tpg, value2: team2Stats.tpg, lowerIsBetter: true },
        { label: 'FPG', value1: team1Stats.fpg, value2: team2Stats.fpg, lowerIsBetter: true },
        { label: 'FG%', value1: `${team1Stats.fgPercentage}%`, value2: `${team2Stats.fgPercentage}%` },
        { label: '2P%', value1: `${team1Stats.twoPercentage}%`, value2: `${team2Stats.twoPercentage}%` },
        { label: '3P%', value1: `${team1Stats.threePercentage}%`, value2: `${team2Stats.threePercentage}%` },
        { label: 'FT%', value1: `${team1Stats.ftPercentage}%`, value2: `${team2Stats.ftPercentage}%` },
        { label: 'PITP', value1: team1Stats.pitpPg, value2: team2Stats.pitpPg },
        { label: 'FB PTS', value1: team1Stats.fbPg, value2: team2Stats.fbPg },
        { label: '2ND CH', value1: team1Stats.secondChPg, value2: team2Stats.secondChPg },
      ];
    case 'Advanced':
      return [
        { label: 'eFG%', value1: `${team1Stats.efgPercent}%`, value2: `${team2Stats.efgPercent}%` },
        { label: 'TS%', value1: `${team1Stats.tsPercent}%`, value2: `${team2Stats.tsPercent}%` },
        { label: '3PT Rate', value1: `${team1Stats.threePtRate}%`, value2: `${team2Stats.threePtRate}%` },
        { label: 'AST%', value1: `${team1Stats.astPercent}%`, value2: `${team2Stats.astPercent}%` },
        { label: 'AST/TO', value1: team1Stats.astToRatio, value2: team2Stats.astToRatio },
        { label: 'OREB%', value1: `${team1Stats.orebPercent}%`, value2: `${team2Stats.orebPercent}%` },
        { label: 'DREB%', value1: `${team1Stats.drebPercent}%`, value2: `${team2Stats.drebPercent}%` },
        { label: 'REB%', value1: `${team1Stats.rebPercent}%`, value2: `${team2Stats.rebPercent}%` },
        { label: 'TOV%', value1: `${team1Stats.tovPercent}%`, value2: `${team2Stats.tovPercent}%`, lowerIsBetter: true },
        { label: 'PACE', value1: team1Stats.pace, value2: team2Stats.pace },
        { label: 'OFF RTG', value1: team1Stats.offRating, value2: team2Stats.offRating },
        { label: 'DEF RTG', value1: team1Stats.defRating, value2: team2Stats.defRating, lowerIsBetter: true },
        { label: 'NET RTG', value1: team1Stats.netRating, value2: team2Stats.netRating },
      ];
    case 'Scoring':
      return [
        { label: 'PPG', value1: team1Stats.ppg, value2: team2Stats.ppg },
        { label: '%PTS 2PT', value1: `${team1Stats.pts2ptPercent}%`, value2: `${team2Stats.pts2ptPercent}%` },
        { label: '%PTS 3PT', value1: `${team1Stats.pts3ptPercent}%`, value2: `${team2Stats.pts3ptPercent}%` },
        { label: '%PTS FT', value1: `${team1Stats.ptsFtPercent}%`, value2: `${team2Stats.ptsFtPercent}%` },
        { label: '%PTS Midrange', value1: `${team1Stats.ptsMidrangePercent}%`, value2: `${team2Stats.ptsMidrangePercent}%` },
        { label: '%PTS PITP', value1: `${team1Stats.ptsPitpPercent}%`, value2: `${team2Stats.ptsPitpPercent}%` },
        { label: '%PTS FB', value1: `${team1Stats.ptsFbPercent}%`, value2: `${team2Stats.ptsFbPercent}%` },
        { label: '%PTS 2nd Ch', value1: `${team1Stats.pts2ndChPercent}%`, value2: `${team2Stats.pts2ndChPercent}%` },
        { label: '%PTS Off TO', value1: `${team1Stats.ptsOffToPercent}%`, value2: `${team2Stats.ptsOffToPercent}%` },
      ];
    case 'Misc':
      return [
        { label: 'PPG', value1: team1Stats.ppg, value2: team2Stats.ppg },
        { label: 'RPG', value1: team1Stats.rpg, value2: team2Stats.rpg },
        { label: 'APG', value1: team1Stats.apg, value2: team2Stats.apg },
        { label: 'FPG', value1: team1Stats.fpg, value2: team2Stats.fpg, lowerIsBetter: true },
        { label: 'TPG', value1: team1Stats.tpg, value2: team2Stats.tpg, lowerIsBetter: true },
        { label: 'PITP', value1: team1Stats.pitpPg, value2: team2Stats.pitpPg },
        { label: 'FB PTS', value1: team1Stats.fbPg, value2: team2Stats.fbPg },
        { label: '2ND CH', value1: team1Stats.secondChPg, value2: team2Stats.secondChPg },
      ];
    default:
      return [];
  }
}
