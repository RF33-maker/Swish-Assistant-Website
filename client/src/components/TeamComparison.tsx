import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { TeamLogo } from "@/components/TeamLogo";
import ShareableCard from "@/components/ShareableCard";
import { normalizeTeamName } from "@/lib/teamUtils";
import { getTeamLogoCached } from "@/utils/teamLogoCache";
import { aggregateTeamStats, getTeamComparisonRows } from "@/lib/teamStatsAggregate";
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
  shortTeamName,
  Suggestions,
  VIEW_OPTIONS,
  writeCompareParams,
  type CompareCategory,
  type CompareView,
  type Suggestion,
} from "@/components/compare/compareUi";

interface TeamComparisonProps {
  leagueId: string;
  allTeams: any[];
  brandColor?: string;
  scopedLeagueIds?: string[];
  /** The league table, best first, for the "top of the table" suggestion. */
  standings?: { team: string }[];
  /** A team to start with on the left (from "Compare" on a team's page). */
  preselectTeam?: string | null;
}

export function TeamComparison({ leagueId, allTeams, brandColor, scopedLeagueIds, standings, preselectTeam }: TeamComparisonProps) {
  const [team1Name, setTeam1Name] = useState<string>("");
  const [team2Name, setTeam2Name] = useState<string>("");
  const [team1Stats, setTeam1Stats] = useState<any>(null);
  const [team2Stats, setTeam2Stats] = useState<any>(null);
  const [team1Raw, setTeam1Raw] = useState<any[]>([]);
  const [team2Raw, setTeam2Raw] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // The category and view can arrive in the page's address, with the two teams (see the effects below).
  const [comparisonCategory, setComparisonCategory] = useState<CompareCategory>(
    () => CATEGORY_OPTIONS.find((c) => c.value.toLowerCase() === readCompareParam('cat'))?.value ?? 'Traditional',
  );
  const [view, setView] = useState<CompareView>(() => (readCompareParam('view') === 'h2h' ? 'h2h' : 'season'));
  const [team1LogoUrl, setTeam1LogoUrl] = useState<string | null>(null);
  const [team2LogoUrl, setTeam2LogoUrl] = useState<string | null>(null);

  // Resolve team-logo URLs for the share-card header band whenever the
  // selected teams change. Uses the same cached lookup as in-page <TeamLogo>.
  useEffect(() => {
    let cancelled = false;
    setTeam1LogoUrl(null);
    if (!team1Stats?.name || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName: team1Stats.name }).then((url) => {
      if (!cancelled) setTeam1LogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [team1Stats?.name, leagueId]);
  useEffect(() => {
    let cancelled = false;
    setTeam2LogoUrl(null);
    if (!team2Stats?.name || !leagueId) return;
    void getTeamLogoCached({ leagueId, teamName: team2Stats.name }).then((url) => {
      if (!cancelled) setTeam2LogoUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [team2Stats?.name, leagueId]);

  const [search1, setSearch1] = useState("");
  const [search2, setSearch2] = useState("");
  const fetchAllTeamStats = async (): Promise<any[]> => {
    const ids = scopedLeagueIds && scopedLeagueIds.length > 0 ? scopedLeagueIds : [leagueId];
    let query = supabase.from("team_stats").select("*");
    query = ids.length > 1 ? query.in("league_id", ids) : query.eq("league_id", ids[0]);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  };

  const handleCompare = async () => {
    if (!team1Name || !team2Name) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const allStats = await fetchAllTeamStats();
      const norm1 = normalizeTeamName(team1Name);
      const norm2 = normalizeTeamName(team2Name);
      const t1Raw = allStats.filter((s: any) => normalizeTeamName(s.name) === norm1);
      const t2Raw = allStats.filter((s: any) => normalizeTeamName(s.name) === norm2);
      setTeam1Raw(t1Raw);
      setTeam2Raw(t2Raw);
      setTeam1Stats(aggregateTeamStats(t1Raw, team1Name));
      setTeam2Stats(aggregateTeamStats(t2Raw, team2Name));
    } catch (error) {
      console.error("Error comparing teams:", error);
      setFetchError("We couldn't load the comparison data. Please try again.");
      setTeam1Raw([]);
      setTeam2Raw([]);
      setTeam1Stats(null);
      setTeam2Stats(null);
    } finally {
      setIsLoading(false);
    }
  };

  const scopedIdsKey = (scopedLeagueIds && scopedLeagueIds.length > 0 ? scopedLeagueIds : [leagueId]).slice().sort().join(',');
  useEffect(() => {
    if (team1Name && team2Name) {
      handleCompare();
    } else {
      setFetchError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team1Name, team2Name, scopedIdsKey]);

  const optionsFor = (search: string, selectedName: string) => {
    const text = search.toLowerCase().trim();
    // With a team already in the box, the list offers the others rather than only that name.
    const matches = !text || selectedName.toLowerCase() === text
      ? allTeams
      : allTeams.filter((team) => team.teamName?.toLowerCase().includes(text));
    return matches.slice(0, 12).map((team) => ({
      key: String(team.teamName),
      title: shortTeamName(team.teamName) || team.teamName,
      sub: [team.age_group, team.ppg ? `${team.ppg} PPG` : null].filter(Boolean).join(' · ') || undefined,
    }));
  };

  // A comparison can be opened from a link (?t1=…&t2=…) or from a team's page; each side waits
  // here until its team turns up in the list.
  const pendingRef = useRef<{ first: string | null; second: string | null }>({
    first: preselectTeam ?? readCompareParam('t1'),
    second: preselectTeam ? null : readCompareParam('t2'),
  });

  const selectTeam1 = (teamName: string) => {
    pendingRef.current.first = null;
    setTeam1Name(teamName);
    setSearch1(shortTeamName(teamName) || teamName);
  };

  const selectTeam2 = (teamName: string) => {
    pendingRef.current.second = null;
    setTeam2Name(teamName);
    setSearch2(shortTeamName(teamName) || teamName);
  };

  useEffect(() => {
    const known = (name: string | null) => {
      if (!name) return null;
      const norm = normalizeTeamName(name);
      return allTeams.find((t) => t.teamName === name || normalizeTeamName(t.teamName) === norm)?.teamName ?? null;
    };
    const first = known(pendingRef.current.first);
    const second = known(pendingRef.current.second);
    if (first) selectTeam1(first);
    if (second) selectTeam2(second);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTeams]);

  // Keep the page's address in step, so the comparison on show can be copied as a link.
  useEffect(() => {
    writeCompareParams({
      section: 'comparison',
      compare: 'team',
      t1: team1Name || pendingRef.current.first,
      t2: team2Name || pendingRef.current.second,
      cat: comparisonCategory === 'Traditional' ? null : comparisonCategory.toLowerCase(),
      view: view === 'season' ? null : view,
    });
  }, [team1Name, team2Name, comparisonCategory, view]);
  useEffect(() => () => writeCompareParams({ t1: null, t2: null, cat: null, view: null }), []);

  // One-tap matchups for the empty state.
  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = [];
    const pair = (label: string, a: any, b: any) => {
      if (!a || !b || a.teamName === b.teamName) return;
      if (out.some((s) => (s.first === a.teamName && s.second === b.teamName) || (s.first === b.teamName && s.second === a.teamName))) return;
      out.push({ label, detail: `${shortTeamName(a.teamName)} vs ${shortTeamName(b.teamName)}`, first: a.teamName, second: b.teamName });
    };
    const inTable = (standings || [])
      .map((row) => allTeams.find((t) => normalizeTeamName(t.teamName) === normalizeTeamName(row.team)))
      .filter(Boolean);
    pair('Top of the table', inTable[0], inTable[1]);
    const byScoring = allTeams.slice().sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg));
    pair('Top two scoring teams', byScoring[0], byScoring[1]);
    const defended = allTeams.filter((t) => parseFloat(t.avgOppPoints) > 0).sort((a, b) => parseFloat(a.avgOppPoints) - parseFloat(b.avgOppPoints));
    pair('Best attack vs best defence', byScoring[0], defended[0]?.teamName === byScoring[0]?.teamName ? defended[1] : defended[0]);
    return out;
  }, [allTeams, standings]);

  // Build head-to-head data from the two raw arrays
  type TeamH2HGame = {
    game_key: string;
    date: string | null;
    homeIsTeam1: boolean;
    score1: number;
    score2: number;
    winner: string | null;
  };
  type TeamH2H = {
    games: TeamH2HGame[];
    team1Wins: number;
    team2Wins: number;
    team1Stats: ReturnType<typeof aggregateTeamStats>;
    team2Stats: ReturnType<typeof aggregateTeamStats>;
  };
  const h2h = useMemo<TeamH2H>(() => {
    if (!team1Raw.length || !team2Raw.length) {
      return { games: [], team1Wins: 0, team2Wins: 0, team1Stats: null, team2Stats: null };
    }
    const team2ByGame = new Map<string, any>();
    team2Raw.forEach((s: any) => { if (s.game_key) team2ByGame.set(s.game_key, s); });

    const sharedT1: any[] = [];
    const sharedT2: any[] = [];
    const games: TeamH2HGame[] = [];
    let team1Wins = 0;
    let team2Wins = 0;

    team1Raw.forEach((s1: any) => {
      if (!s1.game_key) return;
      const s2 = team2ByGame.get(s1.game_key);
      if (!s2) return;
      sharedT1.push(s1);
      sharedT2.push(s2);
      const score1 = s1.tot_spoints ?? 0;
      const score2 = s2.tot_spoints ?? 0;
      let winner: string | null = null;
      if (score1 > score2) { team1Wins++; winner = team1Name; }
      else if (score2 > score1) { team2Wins++; winner = team2Name; }

      const homeIsTeam1 = s1.side === '1' || s1.side === 1;
      const dateRaw = s1.game_date || s1.created_at || s2.game_date || s2.created_at || null;
      games.push({
        game_key: s1.game_key,
        date: dateRaw,
        homeIsTeam1,
        score1,
        score2,
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
      team1Wins,
      team2Wins,
      team1Stats: aggregateTeamStats(sharedT1, team1Name),
      team2Stats: aggregateTeamStats(sharedT2, team2Name),
    };
  }, [team1Raw, team2Raw, team1Name, team2Name]);

  const crest = (name: string, logoUrl: string | null) =>
    logoUrl ? <img src={logoUrl} alt={`${name} logo`} className="h-[78%] w-[78%] object-contain" /> : undefined;

  const renderHeaderRow = (s1: any, s2: any, caption?: string) => (
    <CompareHeader
      caption={caption}
      accent={brandColor}
      left={{ name: shortTeamName(s1.name) || s1.name, games: s1.games, media: crest(s1.name, team1LogoUrl) }}
      right={{ name: shortTeamName(s2.name) || s2.name, games: s2.games, media: crest(s2.name, team2LogoUrl) }}
    />
  );

  const renderStatsTable = (s1: any, s2: any) => (
    <CompareRows
      rows={getTeamComparisonRows(comparisonCategory, s1, s2)}
      leftName={shortTeamName(s1.name) || s1.name}
      rightName={shortTeamName(s2.name) || s2.name}
      accent={brandColor}
    />
  );

  const formatDate = (raw: string | null) => {
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Share-card layout — sized for the wide (1080px) social-friendly capture
  // surface in ShareableCard. Uses generous logos, full-text team names that
  // wrap rather than truncate, and a tall stats table so the export reads
  // cleanly when shared on Instagram / X.
  const renderShareVsTeam = (s: any, accent: 'orange' | 'slate') => (
    <div className="flex flex-col items-center gap-3 min-w-0">
      <div
        className={`rounded-full bg-white shadow flex items-center justify-center overflow-hidden ${
          accent === 'orange' ? 'border-4 border-orange-300' : 'border-4 border-slate-300'
        }`}
        style={{ width: 140, height: 140, padding: 6 }}
      >
        <TeamLogo
          teamName={s.name}
          leagueId={leagueId}
          size={124}
          className="!w-[124px] !h-[124px]"
          crossOrigin="anonymous"
        />
      </div>
      <div className="text-center w-full px-1">
        <div
          className="font-black text-slate-800"
          style={{
            fontSize: 26,
            lineHeight: 1.15,
            wordBreak: 'break-word',
            hyphens: 'auto',
          }}
        >
          {s.name}
        </div>
        <div className="text-slate-500 mt-1 font-medium" style={{ fontSize: 15 }}>
          {s.games} game{s.games !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );

  const renderShareVsHeader = (s1: any, s2: any) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-5">
      {renderShareVsTeam(s1, 'orange')}
      <div
        className="font-black text-orange-500 tracking-widest self-center"
        style={{ fontSize: 48 }}
      >
        VS
      </div>
      {renderShareVsTeam(s2, 'slate')}
    </div>
  );

  const renderShareTable = (s1: any, s2: any, captionText?: string) => {
    const rows = getTeamComparisonRows(comparisonCategory, s1, s2);
    return (
      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {captionText && (
          <div
            className="text-center font-bold uppercase tracking-widest text-orange-700 bg-orange-50 border-b border-orange-100"
            style={{ fontSize: 14, padding: '10px 12px', letterSpacing: '0.18em' }}
          >
            {captionText}
          </div>
        )}
        <table className="w-full" style={{ fontSize: 18 }}>
          <thead className="bg-slate-50">
            <tr>
              <th
                className="text-right font-black text-slate-800 align-bottom"
                style={{ padding: '14px 16px', width: '38%', wordBreak: 'break-word', lineHeight: 1.15, fontSize: 18 }}
              >
                {s1.name}
              </th>
              <th
                className="text-center font-bold text-slate-500 uppercase tracking-wider align-bottom"
                style={{ padding: '14px 8px', fontSize: 12, letterSpacing: '0.16em' }}
              >
                Stat
              </th>
              <th
                className="text-left font-black text-slate-800 align-bottom"
                style={{ padding: '14px 16px', width: '38%', wordBreak: 'break-word', lineHeight: 1.15, fontSize: 18 }}
              >
                {s2.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const num1 = parseFloat(String(row.value1));
              const num2 = parseFloat(String(row.value2));
              const t1Better = row.lowerIsBetter ? num1 < num2 : num1 > num2;
              const t2Better = row.lowerIsBetter ? num2 < num1 : num2 > num1;
              return (
                <tr
                  key={i}
                  className={`border-t border-slate-100 ${i % 2 === 1 ? 'bg-slate-50/60' : ''}`}
                >
                  <td
                    className={`text-right tabular-nums font-bold ${t1Better ? 'text-orange-600' : 'text-slate-700'}`}
                    style={{ padding: '8px 16px', fontSize: 20 }}
                  >
                    {row.value1}
                  </td>
                  <td
                    className="text-center font-semibold text-slate-600 uppercase tracking-wider"
                    style={{ padding: '8px 8px', fontSize: 12, letterSpacing: '0.16em' }}
                  >
                    {row.label}
                  </td>
                  <td
                    className={`text-left tabular-nums font-bold ${t2Better ? 'text-orange-600' : 'text-slate-700'}`}
                    style={{ padding: '8px 16px', fontSize: 20 }}
                  >
                    {row.value2}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderShareContent = () => {
    if (!team1Stats || !team2Stats) return null;
    // Body fills the 4:5 frame: roughly 1080w × 982h after header/footer.
    const bodyMinHeight = 980;
    if (view === 'season') {
      return (
        <div className="flex flex-col gap-7" style={{ minHeight: bodyMinHeight }}>
          {renderShareVsHeader(team1Stats, team2Stats)}
          {renderShareTable(team1Stats, team2Stats, `${comparisonCategory} • Season Averages`)}
        </div>
      );
    }
    // Head-to-Head
    if (h2h.games.length === 0) {
      return (
        <div className="flex flex-col gap-7" style={{ minHeight: bodyMinHeight }}>
          {renderShareVsHeader(team1Stats, team2Stats)}
          <div className="rounded-xl bg-slate-50 border border-slate-200 text-center" style={{ padding: 32 }}>
            <p className="font-bold text-slate-700" style={{ fontSize: 22 }}>
              No head-to-head matchups yet
            </p>
            <p className="text-slate-500 mt-2" style={{ fontSize: 16 }}>
              {team1Stats.name} and {team2Stats.name} haven't played each other.
            </p>
          </div>
        </div>
      );
    }
    const recordText = h2h.team1Wins > h2h.team2Wins
      ? `${team1Stats.name} leads ${h2h.team1Wins}-${h2h.team2Wins}`
      : h2h.team2Wins > h2h.team1Wins
        ? `${team2Stats.name} leads ${h2h.team2Wins}-${h2h.team1Wins}`
        : `Series tied ${h2h.team1Wins}-${h2h.team2Wins}`;
    const recentGames = h2h.games.slice(0, 6);
    return (
      <div className="flex flex-col gap-6" style={{ minHeight: bodyMinHeight }}>
        {renderShareVsHeader(team1Stats, team2Stats)}
        <div
          className="text-center rounded-xl bg-orange-50 border border-orange-200"
          style={{ padding: '18px 24px' }}
        >
          <div
            className="uppercase tracking-widest text-slate-500 font-bold"
            style={{ fontSize: 13, letterSpacing: '0.2em' }}
          >
            Series Record
          </div>
          <div className="font-black text-slate-800 mt-1.5" style={{ fontSize: 30, lineHeight: 1.15, wordBreak: 'break-word' }}>
            {recordText}
          </div>
          <div className="text-slate-500 mt-1" style={{ fontSize: 14 }}>
            {h2h.games.length} game{h2h.games.length !== 1 ? 's' : ''} played
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
          <div
            className="text-center font-bold uppercase tracking-widest text-orange-700 bg-orange-50 border-b border-orange-100"
            style={{ fontSize: 13, padding: '10px 12px', letterSpacing: '0.18em' }}
          >
            Recent Matchups
          </div>
          <table className="w-full" style={{ fontSize: 16 }}>
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left font-bold text-slate-600" style={{ padding: '10px 14px' }}>Date</th>
                <th className="text-center font-bold text-slate-600" style={{ padding: '10px 14px' }}>Score</th>
                <th className="text-left font-bold text-slate-600" style={{ padding: '10px 14px' }}>Winner</th>
              </tr>
            </thead>
            <tbody>
              {recentGames.map((g, idx) => {
                const scoreText = g.homeIsTeam1
                  ? `${g.score1} - ${g.score2}`
                  : `${g.score2} - ${g.score1}`;
                return (
                  <tr key={g.game_key || idx} className={`border-t border-slate-100 ${idx % 2 === 1 ? 'bg-slate-50/60' : ''}`}>
                    <td className="text-slate-700 whitespace-nowrap" style={{ padding: '10px 14px' }}>{formatDate(g.date)}</td>
                    <td className="text-center font-bold tabular-nums text-slate-800" style={{ padding: '10px 14px', fontSize: 18 }}>{scoreText}</td>
                    <td className="font-semibold text-orange-600" style={{ padding: '10px 14px', wordBreak: 'break-word' }}>{g.winner ?? 'Tie'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {h2h.games.length > recentGames.length && (
            <div className="text-center text-slate-500 bg-slate-50" style={{ fontSize: 13, padding: '8px 12px' }}>
              +{h2h.games.length - recentGames.length} more game{h2h.games.length - recentGames.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        {h2h.team1Stats && h2h.team2Stats && (
          renderShareTable(h2h.team1Stats, h2h.team2Stats, `${comparisonCategory} • H2H Only`)
        )}
      </div>
    );
  };

  const clearTeam1 = () => {
    setTeam1Name("");
    setTeam1Stats(null);
    setTeam1Raw([]);
  };
  const clearTeam2 = () => {
    setTeam2Name("");
    setTeam2Stats(null);
    setTeam2Raw([]);
  };
  const cell = "py-2 px-3";
  const short = (name: string) => shortTeamName(name) || name;

  return (
    <div className="ch-card p-4 md:p-6" data-testid="team-comparison">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">Team comparison</h2>
        {team1Stats && team2Stats && <CopyLinkButton testId="button-team-compare-link" />}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <ComparePicker
          label="Team 1"
          search={search1}
          onSearch={setSearch1}
          options={optionsFor(search1, short(team1Name))}
          onSelect={selectTeam1}
          onClear={clearTeam1}
          placeholder="Search for a team..."
          testId="team1"
        />
        <ComparePicker
          label="Team 2"
          search={search2}
          onSearch={setSearch2}
          options={optionsFor(search2, short(team2Name))}
          onSelect={selectTeam2}
          onClear={clearTeam2}
          placeholder="Search for a team..."
          testId="team2"
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <ChipRow label="View" options={VIEW_OPTIONS} value={view} onChange={setView} testIdPrefix="tab-team" />
        <ChipRow label="Stat category" options={CATEGORY_OPTIONS} value={comparisonCategory} onChange={setComparisonCategory} testIdPrefix="category-team" />
      </div>

      {isLoading ? (
        <CompareLoading />
      ) : fetchError ? (
        <CompareError message={fetchError} onRetry={team1Name && team2Name ? () => handleCompare() : undefined} testId="error-team-compare" />
      ) : team1Stats && team2Stats ? (
        <ShareableCard
          title={view === 'season' ? 'Season Averages' : 'Head-to-Head'}
          fileSlug={`team-compare-${view}-${comparisonCategory.toLowerCase()}`}
          player={{
            name: `${team1Stats.name} vs ${team2Stats.name}`,
            team: 'Team Comparison',
            primaryColor: brandColor,
          }}
          shareCaption={comparisonCategory.toUpperCase()}
          shareContent={renderShareContent()}
          teamLogos={[
            { name: team1Stats.name, logoUrl: team1LogoUrl },
            { name: team2Stats.name, logoUrl: team2LogoUrl },
          ]}
          wide
        >
        <div className="mx-auto max-w-4xl pt-6">
          {view === 'season' ? (
            <>
              {renderHeaderRow(team1Stats, team2Stats)}
              {renderStatsTable(team1Stats, team2Stats)}
            </>
          ) : (
            <div data-testid="content-team-h2h">
              {h2h.games.length === 0 ? (
                <CompareEmpty title="No head-to-head matchups yet">
                  {short(team1Stats.name)} and {short(team2Stats.name)} haven't played each other in this league.
                </CompareEmpty>
              ) : (
                <>
                  <div className="mb-5 text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--ch-muted)]">Series record</p>
                    <p className="mt-1 text-2xl font-black text-[color:var(--ch-text)] md:text-3xl" data-testid="text-team-h2h-record">
                      {h2h.team1Wins > h2h.team2Wins ? (
                        <>{short(team1Stats.name)} leads {h2h.team1Wins}-{h2h.team2Wins}</>
                      ) : h2h.team2Wins > h2h.team1Wins ? (
                        <>{short(team2Stats.name)} leads {h2h.team2Wins}-{h2h.team1Wins}</>
                      ) : (
                        <>Series tied {h2h.team1Wins}-{h2h.team2Wins}</>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--ch-muted)]">
                      {h2h.games.length} game{h2h.games.length !== 1 ? 's' : ''} played
                    </p>
                  </div>

                  <div className="mb-7 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--ch-border-strong)] text-xs text-[color:var(--ch-text-2)]">
                          <th className={`${cell} text-left font-semibold`}>Date</th>
                          <th className={`${cell} text-left font-semibold`}>Matchup</th>
                          <th className={`${cell} text-center font-semibold`}>Score</th>
                          <th className={`${cell} text-left font-semibold`}>Winner</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h2h.games.map((g, idx) => {
                          const matchupText = g.homeIsTeam1
                            ? `${short(team1Stats.name)} (H) vs ${short(team2Stats.name)} (A)`
                            : `${short(team2Stats.name)} (H) vs ${short(team1Stats.name)} (A)`;
                          const scoreText = g.homeIsTeam1
                            ? `${g.score1} - ${g.score2}`
                            : `${g.score2} - ${g.score1}`;
                          return (
                            <tr key={g.game_key || idx} className="border-b border-[color:var(--ch-border)]" data-testid={`row-team-h2h-game-${idx}`}>
                              <td className={`${cell} whitespace-nowrap text-[color:var(--ch-text-2)]`}>{formatDate(g.date)}</td>
                              <td className={`${cell} text-[color:var(--ch-text-2)]`}>{matchupText}</td>
                              <td className={`${cell} ch-num text-center font-semibold text-[color:var(--ch-text)]`}>{scoreText}</td>
                              <td className={`${cell} font-medium text-[color:var(--ch-text)]`}>{g.winner ? short(g.winner) : 'Tie'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {h2h.team1Stats && h2h.team2Stats && (
                    <>
                      {renderHeaderRow(h2h.team1Stats, h2h.team2Stats, 'In head-to-head games only')}
                      {renderStatsTable(h2h.team1Stats, h2h.team2Stats)}
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
          loading={allTeams.length === 0}
          intro={
            team1Name || team2Name
              ? "Pick a second team to see the comparison."
              : "Pick two teams above, or start with one of these."
          }
          suggestions={team1Name || team2Name ? [] : suggestions}
          onPick={(s) => {
            selectTeam1(s.first);
            selectTeam2(s.second);
          }}
        />
      )}
    </div>
  );
}
