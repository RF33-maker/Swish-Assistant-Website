import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ShotChart, { type ShotData } from '@/components/ShotChart';
import { ComparisonBarRow, NarrativeSummary, SectionNarrative, StackedShare } from './reportVisuals';
import { useReportNarrative } from '@/hooks/useReportNarrative';
import { useTeamBranding } from '@/hooks/useTeamBranding';
import { useReadableTeamColor } from '@/hooks/useReadableColor';
import {
  METRICS,
  MIN_GROUP_ATTEMPTS,
  TEAM_STAT_SELECT,
  buildWindow,
  formatMetric,
  metricGroup,
  matchupGaps,
  sameStatGaps,
  toStatLine,
  zoneGaps,
  zoneProfile,
  type FormGame,
  type Gap,
  type ZoneProfile,
} from '@/lib/formComparison';
import type { GameResultRow, StandingRow } from '@/pages/CoachesHub';

interface Props {
  leagueId: string;
  myTeamId: string;
  myTeamName: string;
  standings: StandingRow[];
  gameResults: GameResultRow[];
  /** Opponent in the coach's next scheduled game, when there is one. */
  nextOpponentName: string | null;
  brandColor: string;
}

const OPP_COLOR = '#94a3b8';
const SHOT_COLUMNS = 'id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key';

interface TeamForm {
  games: FormGame[];
  /** Shots this team took, tagged by game_key. */
  shots: ShotData[];
  /** Shots opponents took against this team. */
  allowed: ShotData[];
}

async function loadTeamForm(
  leagueId: string,
  teamId: string,
  teamName: string,
  dateByGame: Map<string, string>,
): Promise<TeamForm> {
  // By team_id, plus the name: the feed sometimes lists one club under a
  // second name and id within a competition — usually a sponsor prefix
  // ("Signs Express Falkirk Fury"). A name that merely *starts* with the club
  // name is a different side ("Bristol Flyers II"), so only an exact match or
  // a prefixed one counts.
  const safeName = teamName.replace(/["%_,()]/g, '');
  const { data: ownRows, error } = await supabase
    .from('team_stats')
    .select(TEAM_STAT_SELECT)
    .eq('league_id', leagueId)
    .or(`team_id.eq.${teamId},name.ilike."%${safeName}"`);
  if (error) throw error;
  const isThisClub = (row: any) =>
    row.team_id === teamId ||
    String(row.name || '').toLowerCase() === teamName.toLowerCase() ||
    String(row.name || '').toLowerCase().endsWith(` ${teamName.toLowerCase()}`);

  const dated = ((ownRows || []) as any[])
    .filter(isThisClub)
    .map((row: any) => ({ row, date: dateByGame.get(row.game_key) || row.created_at || '' }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const seen = new Set<string>();
  const latest = dated.filter(({ row }) => (seen.has(row.game_key) ? false : (seen.add(row.game_key), true))).slice(0, 5);
  const gameKeys = latest.map(({ row }) => row.game_key);
  if (gameKeys.length === 0) return { games: [], shots: [], allowed: [] };

  const [{ data: allRows }, { data: shotRows }] = await Promise.all([
    supabase.from('team_stats').select(TEAM_STAT_SELECT).eq('league_id', leagueId).in('game_key', gameKeys),
    supabase.from('shot_chart').select(SHOT_COLUMNS).in('game_key', gameKeys),
  ]);

  const sideByGame = new Map<string, number>();
  const games: FormGame[] = [];
  latest.forEach(({ row, date }) => {
    const side = Number(row.side) === 2 ? 2 : 1;
    const oppRow = ((allRows || []) as any[]).find((r: any) => r.game_key === row.game_key && Number(r.side) !== side);
    if (!oppRow) return;
    sideByGame.set(row.game_key, side);
    games.push({
      gameKey: row.game_key,
      date,
      opponent: oppRow.name,
      side: side as 1 | 2,
      own: toStatLine(row),
      opp: toStatLine(oppRow),
    });
  });

  const shots: ShotData[] = [];
  const allowed: ShotData[] = [];
  ((shotRows || []) as unknown as ShotData[]).forEach((shot) => {
    const side = shot.game_key ? sideByGame.get(shot.game_key) : undefined;
    if (side == null || shot.team_no == null) return;
    (shot.team_no === side ? shots : allowed).push(shot);
  });
  return { games, shots, allowed };
}

function Section({ n, title, subtitle, color, children, narrative }: {
  n: string; title: string; subtitle?: string; color: string; children: React.ReactNode; narrative?: string;
}) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[11px] font-mono font-semibold tracking-widest" style={{ color }}>{n}</span>
        <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
      <SectionNarrative body={narrative} />
    </div>
  );
}

function GapCard({ gap, youColor, themName }: { gap: Gap; youColor: string; themName: string }) {
  const tag = gap.favours === 'you' ? 'Your edge' : gap.favours === 'them' ? 'Their edge' : 'Style difference';
  const tagColor = gap.favours === 'you' ? youColor : gap.favours === 'them' ? '#64748b' : '#a78bfa';
  return (
    <div className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/60 p-3 md:p-4">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: tagColor }}>
          {tag}
        </span>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{gap.title}</h4>
      </div>
      <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed">{gap.body}</p>
      <ul className="mt-2 space-y-0.5">
        {gap.evidence.map((line) => (
          <li key={line} className="text-[11px] text-gray-500 dark:text-neutral-400 tabular-nums">· {line}</li>
        ))}
      </ul>
    </div>
  );
}

function FormStrip({ name, games, size, color }: { name: string; games: FormGame[]; size: number; color: string }) {
  const slice = games.slice(0, size);
  const wins = slice.filter((g) => g.own.pts > g.opp.pts).length;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</span>
        <span className="text-sm font-bold tabular-nums" style={{ color }}>{wins}-{slice.length - wins}</span>
      </div>
      {slice.length === 0 ? (
        <p className="text-xs italic text-gray-500 dark:text-neutral-400">No completed games yet.</p>
      ) : (
        <div className="space-y-1.5">
          {slice.map((g) => {
            const won = g.own.pts > g.opp.pts;
            return (
              <div key={g.gameKey} className="flex items-center gap-2 text-xs">
                <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${won ? 'bg-green-500' : 'bg-red-500'}`}>
                  {won ? 'W' : 'L'}
                </span>
                <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{g.own.pts}–{g.opp.pts}</span>
                <span className="truncate text-gray-500 dark:text-neutral-400">{g.side === 1 ? 'vs' : '@'} {g.opponent}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ZoneTable({ profile, color }: { profile: ZoneProfile; color: string }) {
  return (
    <div className="space-y-3">
      <StackedShare
        segments={profile.groups.map((g) => ({ label: g.label, value: g.attempts, color: g.color }))}
        emptyLabel="No located shots in these games."
      />
      {profile.attempts > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 dark:text-neutral-400">
              <th className="text-left font-medium py-1">Area</th>
              <th className="text-right font-medium">Share</th>
              <th className="text-right font-medium">FG</th>
              <th className="text-right font-medium">Pts/shot</th>
            </tr>
          </thead>
          <tbody>
            {profile.groups.map((g) => {
              const thin = g.attempts < MIN_GROUP_ATTEMPTS;
              return (
                <tr key={g.key} className="border-t border-gray-100 dark:border-neutral-800">
                  <td className="py-1.5 text-gray-800 dark:text-neutral-200">
                    <span className="inline-block w-2 h-2 rounded-sm mr-1.5" style={{ backgroundColor: g.color }} />
                    {g.label}
                  </td>
                  <td className="text-right tabular-nums text-gray-700 dark:text-neutral-300">{Math.round(g.share)}%</td>
                  <td className="text-right tabular-nums text-gray-700 dark:text-neutral-300">
                    {g.made}/{g.attempts}{g.fgPct != null && !thin ? ` · ${g.fgPct.toFixed(0)}%` : ''}
                  </td>
                  <td className="text-right tabular-nums font-semibold" style={thin ? undefined : { color }}>
                    {g.pointsPerShot != null && !thin ? g.pointsPerShot.toFixed(2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function FormComparison({
  leagueId, myTeamId, myTeamName, standings, gameResults, nextOpponentName, brandColor: leagueColor,
}: Props) {
  // Branded to the coach's own team, like the match and scout reports.
  const { primaryColor, isLoading: brandLoading } = useTeamBranding({ teamName: myTeamName, leagueId });
  const teamColor = brandLoading || !primaryColor ? leagueColor : primaryColor;
  const brandColor = useReadableTeamColor(teamColor).body;

  const opponents = useMemo(
    () => standings.filter((s) => s.teamId !== myTeamId && s.teamName !== myTeamName),
    [standings, myTeamId, myTeamName],
  );
  // Default to the next scheduled opponent; otherwise the nearest side in the
  // table, which is the most useful comparison when nothing is scheduled.
  const defaultOpponent = useMemo(() => {
    const scheduled = nextOpponentName ? opponents.find((o) => o.teamName === nextOpponentName) : undefined;
    if (scheduled) return scheduled.teamName;
    const mine = standings.find((s) => s.teamId === myTeamId || s.teamName === myTeamName);
    const nearest = [...opponents].sort((a, b) => Math.abs(a.rank - (mine?.rank ?? 0)) - Math.abs(b.rank - (mine?.rank ?? 0)))[0];
    return nearest?.teamName ?? '';
  }, [opponents, nextOpponentName, standings, myTeamId, myTeamName]);

  const [opponentName, setOpponentName] = useState('');
  const [windowSize, setWindowSize] = useState<3 | 5>(3);
  const [shotView, setShotView] = useState<'taken' | 'allowed'>('taken');
  const [mine, setMine] = useState<TeamForm | null>(null);
  const [theirs, setTheirs] = useState<TeamForm | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedOpponent = opponentName || defaultOpponent;
  const opponent = opponents.find((o) => o.teamName === selectedOpponent);
  const isNextOpponent = !!nextOpponentName && selectedOpponent === nextOpponentName;

  const dateByGame = useMemo(() => {
    const map = new Map<string, string>();
    gameResults.forEach((g) => { if (g.match_time) map.set(g.game_key, g.match_time); });
    return map;
  }, [gameResults]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTeamForm(leagueId, myTeamId, myTeamName, dateByGame)
      .then((form) => { if (!cancelled) setMine(form); })
      .catch((err) => { console.error('FormComparison (your team):', err); if (!cancelled) setMine({ games: [], shots: [], allowed: [] }); });
    return () => { cancelled = true; };
  }, [leagueId, myTeamId, myTeamName, dateByGame]);

  useEffect(() => {
    if (!opponent) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    loadTeamForm(leagueId, opponent.teamId, opponent.teamName, dateByGame)
      .then((form) => { if (!cancelled) setTheirs(form); })
      .catch((err) => { console.error('FormComparison (opponent):', err); if (!cancelled) setTheirs({ games: [], shots: [], allowed: [] }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [leagueId, opponent?.teamId, opponent?.teamName, dateByGame]);

  const otherSize = windowSize === 3 ? 5 : 3;
  const analysis = useMemo(() => {
    if (!mine || !theirs || mine.games.length === 0 || theirs.games.length === 0) return null;
    const themName = opponent?.teamName || 'Opponent';
    const you = { window: buildWindow(mine.games, windowSize), other: buildWindow(mine.games, otherSize) };
    const them = { window: buildWindow(theirs.games, windowSize), other: buildWindow(theirs.games, otherSize) };

    const keysIn = (form: TeamForm) => new Set(form.games.slice(0, windowSize).map((g) => g.gameKey));
    const myKeys = keysIn(mine);
    const theirKeys = keysIn(theirs);
    const inWindow = (shots: ShotData[], keys: Set<string>) => shots.filter((s) => s.game_key && keys.has(s.game_key));
    const zones = {
      yourShots: zoneProfile(inWindow(mine.shots, myKeys)),
      yourAllowed: zoneProfile(inWindow(mine.allowed, myKeys)),
      theirShots: zoneProfile(inWindow(theirs.shots, theirKeys)),
      theirAllowed: zoneProfile(inWindow(theirs.allowed, theirKeys)),
    };
    const sides = { youName: 'You', themName, you, them };
    const matchups = matchupGaps(sides);
    const zoneMatchups = zoneGaps({ youName: 'You', themName, ...zones });
    const sameStat = sameStatGaps(sides);
    // Matchups first — they are the game-plan reads — then the biggest
    // like-for-like differences, skipping stats a matchup already covered.
    // Both halves of a matchup count as covered (e.g. your eFG% and their
    // opponent eFG%), so the like-for-like list doesn't repeat the point.
    const MATCHUP_PARTNER: Record<string, string> = { efg: 'oppEfg', tovPct: 'forcedTovPct', orebPct: 'drebPct', ftRate: 'oppFtRate' };
    const covered = new Set(matchups.flatMap((g) => { const k = g.key.split('-')[1]; return [k, MATCHUP_PARTNER[k]]; }));
    // Headline results (points, ratings, margin) are the outcome rather than
    // the cause, so at most two of them make the list.
    let resultsShown = 0;
    const likeForLike = sameStat.filter((g) => {
      if (covered.has(g.key)) return false;
      if (metricGroup(g.key) !== 'Results') return true;
      return resultsShown++ < 2;
    });
    const talkingPoints = [...matchups, ...zoneMatchups, ...likeForLike].slice(0, 8);
    return {
      you, them, zones, talkingPoints,
      yourShotsInWindow: inWindow(mine.shots, myKeys),
      theirShotsInWindow: inWindow(theirs.shots, theirKeys),
    };
  }, [mine, theirs, windowSize, otherSize, opponent?.teamName]);

  const facts = useMemo(() => {
    if (!analysis || !opponent) return null;
    const metricsFor = (w: typeof analysis.you.window) =>
      Object.fromEntries(METRICS.map((m) => [m.label, w.metrics[m.key] == null ? null : Number(w.metrics[m.key]!.toFixed(1))]));
    const zonesFor = (p: ZoneProfile) =>
      p.groups.map((g) => ({ area: g.label, sharePct: Math.round(g.share), made: g.made, attempts: g.attempts, pointsPerShot: g.pointsPerShot == null ? null : Number(g.pointsPerShot.toFixed(2)) }));
    return {
      yourTeam: myTeamName,
      opponent: opponent.teamName,
      opponentIsNextScheduledGame: isNextOpponent,
      window: `last ${windowSize} games`,
      yourForm: { games: analysis.you.window.games, wins: analysis.you.window.wins, losses: analysis.you.window.losses, metrics: metricsFor(analysis.you.window) },
      theirForm: { games: analysis.them.window.games, wins: analysis.them.window.wins, losses: analysis.them.window.losses, metrics: metricsFor(analysis.them.window) },
      gapsIdentified: analysis.talkingPoints.map((g) => ({ title: g.title, favours: g.favours, detail: g.body })),
      yourShotZones: zonesFor(analysis.zones.yourShots),
      yourShotZonesAllowed: zonesFor(analysis.zones.yourAllowed),
      theirShotZones: zonesFor(analysis.zones.theirShots),
      theirShotZonesAllowed: zonesFor(analysis.zones.theirAllowed),
    };
  }, [analysis, opponent, myTeamName, isNextOpponent, windowSize]);

  const SECTION_KEYS = ['gaps', 'numbers', 'shots'];
  const { narrative, status, bodyFor } = useReportNarrative('compare', facts, SECTION_KEYS, !loading && !!facts);

  const themName = opponent?.teamName || 'Opponent';
  const groups = Array.from(new Set(METRICS.map((m) => m.group)));

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header + controls */}
      <div className="rounded-lg p-4 md:p-6 text-white" style={{ backgroundColor: teamColor }}>
        <div className="text-[11px] md:text-xs font-semibold uppercase tracking-wide text-white/70 mb-1">Form comparison</div>
        <h2 className="text-xl md:text-3xl font-bold leading-tight">
          {myTeamName} <span className="text-white/60 font-medium">vs</span> {themName}
        </h2>
        <p className="text-sm text-white/80 mt-1">
          {isNextOpponent
            ? 'Your next opponent.'
            : nextOpponentName
              ? `Your next game is against ${nextOpponentName}.`
              : 'No upcoming game scheduled — pick any side to compare against.'}
        </p>
        <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={selectedOpponent}
            onChange={(e) => setOpponentName(e.target.value)}
            className="w-full sm:w-72 rounded-md bg-white/95 text-slate-900 text-sm px-3 py-2 border border-white/40"
            aria-label="Opponent"
            data-testid="compare-opponent"
          >
            {opponents.map((o) => (
              <option key={o.teamId || o.teamName} value={o.teamName}>
                {o.teamName} ({o.wins}-{o.losses}){o.teamName === nextOpponentName ? ' · next game' : ''}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-md bg-white/15 p-0.5" role="group" aria-label="Games to compare">
            {([3, 5] as const).map((size) => (
              <button
                key={size}
                onClick={() => setWindowSize(size)}
                className={`px-3 py-1.5 text-sm font-semibold rounded ${windowSize === size ? 'bg-white text-slate-900' : 'text-white/85 hover:text-white'}`}
                data-testid={`compare-last-${size}`}
              >
                Last {size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!opponent ? (
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
          No other teams in this competition to compare against yet.
        </div>
      ) : loading || !mine || !theirs ? (
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
          Loading recent games…
        </div>
      ) : !analysis ? (
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
          {mine.games.length === 0 ? 'Your team has' : `${themName} have`} no completed games with box scores in this competition yet.
        </div>
      ) : (
        <>
          <NarrativeSummary headline={narrative?.headline} overview={narrative?.overview} takeaways={narrative?.takeaways} status={status} color={brandColor} />

          <Section
            n="01"
            title={`Last ${windowSize} games`}
            subtitle={
              analysis.you.window.games < windowSize || analysis.them.window.games < windowSize
                ? `Newest first. Fewer than ${windowSize} completed games for ${[
                    analysis.you.window.games < windowSize ? 'you' : null,
                    analysis.them.window.games < windowSize ? themName : null,
                  ].filter(Boolean).join(' or ')}, so the window uses what has been played.`
                : 'Newest first. A handful of games is form, not a verdict — the gaps below say how far apart the numbers are, not how certain they are.'
            }
            color={brandColor}
          >
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-8">
              <FormStrip name={myTeamName} games={mine.games} size={windowSize} color={brandColor} />
              <FormStrip name={themName} games={theirs.games} size={windowSize} color={OPP_COLOR} />
            </div>
          </Section>

          <Section
            n="02"
            title="The gaps that matter"
            subtitle="Your attack against what they concede, their attack against what you concede, then the widest like-for-like differences. A gap is listed only when it clears a threshold that means something on the floor, so evenly matched sides produce a short list."
            color={brandColor}
            narrative={bodyFor('gaps')}
          >
            {analysis.talkingPoints.length === 0 ? (
              <p className="text-sm italic text-gray-500 dark:text-neutral-400">
                Over the last {windowSize} the two sides are closely matched — no gap is wide enough to plan around.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {analysis.talkingPoints.map((gap) => (
                  <GapCard key={gap.key} gap={gap} youColor={brandColor} themName={themName} />
                ))}
              </div>
            )}
          </Section>

          <Section
            n="03"
            title="Side by side"
            subtitle={`${myTeamName} on the left, ${themName} on the right; the figure under each label is yours minus theirs (percentages in points). Rates are built from totals across the window, so one big shooting night can't outweigh the rest.`}
            color={brandColor}
            narrative={bodyFor('numbers')}
          >
            <div className="grid gap-x-8 md:grid-cols-2">
              {groups.map((group) => (
                <div key={group} className="mb-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400 mt-2">{group}</h4>
                  {METRICS.filter((m) => m.group === group && m.key !== 'margin').map((m) => (
                    <ComparisonBarRow
                      key={m.key}
                      row={{
                        label: m.label,
                        mine: analysis.you.window.metrics[m.key],
                        theirs: analysis.them.window.metrics[m.key],
                        unit: m.unit,
                        decimals: m.decimals,
                        lowerIsBetter: m.lowerIsBetter,
                        neutral: m.neutral,
                      }}
                      myColor={brandColor}
                      theirColor={OPP_COLOR}
                      myLabel={myTeamName}
                      theirLabel={themName}
                      showDifference
                    />
                  ))}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-2">
              Average margin: {myTeamName} {formatMetric(METRICS.find((m) => m.key === 'margin')!, analysis.you.window.metrics.margin)},{' '}
              {themName} {formatMetric(METRICS.find((m) => m.key === 'margin')!, analysis.them.window.metrics.margin)}.
            </p>
          </Section>

          <Section
            n="04"
            title="Shot distribution"
            subtitle={`Where each side's shots come from over the last ${windowSize}, and how many points each shot is worth there. Switch to "Shots allowed" to see where each defence gives shots up. Areas with fewer than ${MIN_GROUP_ATTEMPTS} attempts don't show a percentage.`}
            color={brandColor}
            narrative={bodyFor('shots')}
          >
            <div className="inline-flex rounded-md border border-gray-200 dark:border-neutral-700 p-0.5 mb-4" role="group" aria-label="Shot view">
              {(['taken', 'allowed'] as const).map((view) => (
                <button
                  key={view}
                  onClick={() => setShotView(view)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded ${shotView === view ? 'text-white' : 'text-gray-600 dark:text-neutral-300'}`}
                  style={shotView === view ? { backgroundColor: brandColor } : undefined}
                >
                  {view === 'taken' ? 'Shots taken' : 'Shots allowed'}
                </button>
              ))}
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  {myTeamName} <span className="font-normal text-gray-500 dark:text-neutral-400">· {shotView === 'taken' ? `${analysis.zones.yourShots.attempts} shots` : `${analysis.zones.yourAllowed.attempts} shots against`}</span>
                </h4>
                <ZoneTable profile={shotView === 'taken' ? analysis.zones.yourShots : analysis.zones.yourAllowed} color={brandColor} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  {themName} <span className="font-normal text-gray-500 dark:text-neutral-400">· {shotView === 'taken' ? `${analysis.zones.theirShots.attempts} shots` : `${analysis.zones.theirAllowed.attempts} shots against`}</span>
                </h4>
                <ZoneTable profile={shotView === 'taken' ? analysis.zones.theirShots : analysis.zones.theirAllowed} color={OPP_COLOR} />
              </div>
            </div>
            {shotView === 'taken' && (
              <div className="grid gap-6 md:grid-cols-2 mt-6">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{myTeamName} — zone map</h4>
                  <ShotChart shots={analysis.yourShotsInWindow} compact emptyMessage="No located shots for these games." filters={{ showZoneFilter: true, showResultFilter: true }} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{themName} — zone map</h4>
                  <ShotChart shots={analysis.theirShotsInWindow} compact emptyMessage="No located shots for these games." filters={{ showZoneFilter: true, showResultFilter: true }} />
                </div>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
