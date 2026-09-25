import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTeamBranding } from '@/hooks/useTeamBranding';
import ShotChart, { type ShotData } from '@/components/ShotChart';
import { ComparisonBarRow, NarrativeSummary, QuarterFlowChart, SectionNarrative } from './reportVisuals';
import { useReportNarrative } from '@/hooks/useReportNarrative';
import {
  buildStorylines,
  fourFactors,
  num,
  quarterFlow,
  scoringMix,
  topPerformers,
  type PlayerGameRow,
  type PlayerLine,
  type TeamGameRow,
} from '@/lib/gameReport';

interface Props {
  gameKey: string;
  leagueId: string;
  teamName: string;
  brandColor: string;
  onBack: () => void;
}

const OPP_COLOR = '#94a3b8';

const TEAM_COLUMNS =
  'name, team_id, game_key, score, p1_score, p2_score, p3_score, p4_score, tot_biggestscoringrun, ' +
  'tot_leadchanges, tot_timesscoreslevel, tot_sbiggestlead, tot_timeleading, efg_percent, ts_percent, ' +
  'tov_percent, oreb_percent, dreb_percent, ft_rate, off_rating, def_rating, pace, possessions, ' +
  'tot_spointsinthepaint, tot_spointsfastbreak, tot_spointssecondchance, tot_spointsfromturnovers, ' +
  'tot_sbenchpoints, tot_sfieldgoalsmade, tot_sfieldgoalsattempted, tot_sthreepointersmade, ' +
  'tot_sthreepointersattempted, tot_sfreethrowsmade, tot_sfreethrowsattempted, tot_sreboundstotal, ' +
  'tot_sreboundsoffensive, tot_sassists, tot_sturnovers, tot_ssteals, tot_sblocks';

const PLAYER_COLUMNS =
  'full_name, team_name, spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sminutes, ' +
  'sfieldgoalsmade, sfieldgoalsattempted, sthreepointersmade, sthreepointersattempted, ' +
  'sfreethrowsmade, sfreethrowsattempted, splusminuspoints, ts_percent, usage_percent';

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

function PlayerRow({ player, color }: { player: PlayerLine; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{player.name}</div>
        <div className="text-[11px] text-gray-500 dark:text-neutral-400">
          {[
            player.fg ? `${player.fg} FG` : null,
            player.tp && player.tp !== '0/0' ? `${player.tp} 3PT` : null,
            player.minutes != null ? `${player.minutes.toFixed(0)} min` : null,
          ].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-right">
        <div>
          <div className="text-base font-bold tabular-nums" style={{ color }}>{player.points ?? '—'}</div>
          <div className="text-[10px] text-gray-400 dark:text-neutral-500">PTS</div>
        </div>
        <div>
          <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-neutral-300">{player.rebounds ?? '—'}</div>
          <div className="text-[10px] text-gray-400 dark:text-neutral-500">REB</div>
        </div>
        <div>
          <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-neutral-300">{player.assists ?? '—'}</div>
          <div className="text-[10px] text-gray-400 dark:text-neutral-500">AST</div>
        </div>
        {player.plusMinus != null && (
          <div>
            <div className={`text-sm font-semibold tabular-nums ${player.plusMinus > 0 ? 'text-green-600 dark:text-green-400' : player.plusMinus < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'}`}>
              {player.plusMinus > 0 ? '+' : ''}{player.plusMinus}
            </div>
            <div className="text-[10px] text-gray-400 dark:text-neutral-500">+/-</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MatchReport({ gameKey, leagueId, teamName, brandColor, onBack }: Props) {
  // Same resolution the banner uses, so the report reads as the team's own
  // document rather than a generic one.
  const { primaryColor, isLoading: brandLoading } = useTeamBranding({ teamName, leagueId });
  const brand = brandLoading || !primaryColor ? brandColor : primaryColor;
  const [teamRows, setTeamRows] = useState<TeamGameRow[]>([]);
  const [playerRows, setPlayerRows] = useState<PlayerGameRow[]>([]);
  const [shots, setShots] = useState<ShotData[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguish "this competition has no shot data" from "this particular
  // game has none" -- 182 of 188 BCB games carry shots, so blaming the
  // competition when one game is missing them is simply wrong.
  const [leagueHasShots, setLeagueHasShots] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [teams, players, shotRows, leagueProbe] = await Promise.all([
        supabase.from('team_stats').select(TEAM_COLUMNS).eq('game_key', gameKey),
        supabase.from('player_stats').select(PLAYER_COLUMNS).eq('game_key', gameKey),
        supabase
          .from('shot_chart')
          .select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
          .eq('game_key', gameKey),
        supabase.from('shot_chart').select('id').eq('league_id', leagueId).limit(1),
      ]);
      if (cancelled) return;
      if (teams.error) console.error('MatchReport team_stats:', teams.error.message);
      if (players.error) console.error('MatchReport player_stats:', players.error.message);
      setTeamRows((teams.data || []) as unknown as TeamGameRow[]);
      setPlayerRows((players.data || []) as unknown as PlayerGameRow[]);
      setShots((shotRows.data || []) as unknown as ShotData[]);
      // Rows for a competition kept private beneath a public parent are
      // filtered out by RLS rather than erroring, so a league-level probe is
      // the only way to tell an unavailable competition from a sparse game.
      setLeagueHasShots(!leagueProbe.error && (leagueProbe.data || []).length > 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [gameKey, leagueId]);

  const mine = useMemo(() => teamRows.find((r) => r.name === teamName), [teamRows, teamName]);
  const theirs = useMemo(() => teamRows.find((r) => r.name !== teamName), [teamRows, teamName]);

  const storylines = useMemo(() => (mine && theirs ? buildStorylines(mine, theirs) : []), [mine, theirs]);
  const factors = useMemo(() => (mine && theirs ? fourFactors(mine, theirs) : []), [mine, theirs]);
  const mix = useMemo(() => (mine && theirs ? scoringMix(mine, theirs) : []), [mine, theirs]);
  const quarters = useMemo(() => (mine && theirs ? quarterFlow(mine, theirs) : []), [mine, theirs]);

  const myPlayers = useMemo(
    () => topPerformers(playerRows.filter((p) => p.team_name === teamName)),
    [playerRows, teamName]
  );
  const theirPlayers = useMemo(
    () => topPerformers(playerRows.filter((p) => p.team_name && p.team_name !== teamName)),
    [playerRows, teamName]
  );

  // Shot chart is stored with team_no 1/2 rather than a name, so map it via
  // the side the box score puts this team on.
  const myShots = useMemo(() => {
    if (shots.length === 0 || !mine) return [];
    const mineIsFirst = teamRows[0]?.name === teamName;
    const myTeamNo = mineIsFirst ? 1 : 2;
    const tagged = shots.filter((s) => s.team_no === myTeamNo);
    return tagged.length > 0 ? tagged : shots;
  }, [shots, mine, teamRows, teamName]);

  // Pre-computed facts only -- the model interprets numbers the report has
  // already derived, so it cannot introduce one the coach can't see.
  const facts = useMemo(() => {
    if (!mine || !theirs) return null;
    return {
      yourTeam: teamName,
      opponent: theirs.name,
      finalScore: { you: num(mine.score), them: num(theirs.score) },
      ratings: {
        offensive: num(mine.off_rating),
        defensive: num(mine.def_rating),
        pace: num(mine.pace),
      },
      gameShape: {
        minutesYouLed: num(mine.tot_timeleading),
        yourBiggestLead: num(mine.tot_sbiggestlead),
        theirBiggestLead: num(theirs.tot_sbiggestlead),
        leadChanges: num(mine.tot_leadchanges),
        timesTied: num(mine.tot_timesscoreslevel),
        yourBestRun: num(mine.tot_biggestscoringrun),
        theirBestRun: num(theirs.tot_biggestscoringrun),
      },
      decided: storylines.map((s) => ({ point: s.title, detail: s.detail, wentYourWay: s.tone === 'good' })),
      fourFactors: factors.map((f) => ({ stat: f.label, you: f.mine, them: f.theirs, lowerIsBetter: !!f.lowerIsBetter })),
      byQuarter: quarters.map((q) => ({ quarter: q.label, you: q.mine, them: q.theirs, runningMargin: q.cumulativeMargin })),
      scoringMix: mix.map((m) => ({ category: m.label, you: m.mine, them: m.theirs })),
      yourTopPerformers: myPlayers.map((p) => ({
        name: p.name, points: p.points, rebounds: p.rebounds, assists: p.assists,
        fieldGoals: p.fg, threes: p.tp, plusMinus: p.plusMinus, minutes: p.minutes,
      })),
      theirTopPerformers: theirPlayers.map((p) => ({
        name: p.name, points: p.points, rebounds: p.rebounds, assists: p.assists,
        fieldGoals: p.fg, threes: p.tp, plusMinus: p.plusMinus, minutes: p.minutes,
      })),
    };
  }, [mine, theirs, teamName, storylines, factors, quarters, mix, myPlayers, theirPlayers]);

  const SECTION_KEYS = ['decided', 'fourFactors', 'byQuarter', 'scoringMix', 'performers'];
  const { narrative, status, bodyFor } = useReportNarrative('match', facts, SECTION_KEYS, !loading && !!facts);

  if (loading) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
          Building match report…
        </div>
      </div>
    );
  }

  if (!mine || !theirs) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-300 dark:text-neutral-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-neutral-400">
            This game doesn't have a full box score yet, so there's nothing to report on.
          </p>
        </div>
      </div>
    );
  }

  const myScore = num(mine.score);
  const theirScore = num(theirs.score);
  const won = myScore != null && theirScore != null && myScore > theirScore;
  const margin = myScore != null && theirScore != null ? Math.abs(myScore - theirScore) : null;

  const offRating = num(mine.off_rating);
  const defRating = num(mine.def_rating);
  const paceValue = num(mine.pace);

  return (
    <div className="space-y-4 md:space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to overview
      </button>

      {/* Headline */}
      <div className="rounded-lg p-4 md:p-6 text-white" /* Solid rather than a gradient: useTeamBranding resolves some teams to
             an rgb() string, and appending an alpha suffix to that produces
             invalid CSS, which silently drops the whole background. */
          style={{ backgroundColor: brand }}>
        <div className="text-[11px] md:text-xs font-semibold uppercase tracking-wide text-white/70 mb-1">Match report</div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="px-2 py-0.5 rounded text-xs font-bold bg-white/20">{won ? 'WIN' : 'LOSS'}</span>
          <h2 className="text-xl md:text-3xl font-bold tabular-nums">{myScore ?? '—'}–{theirScore ?? '—'}</h2>
          <span className="text-sm md:text-base text-white/90">
            {teamName} vs {theirs.name}
          </span>
        </div>
        {margin != null && (
          <p className="text-sm text-white/80 mt-1">
            {won ? 'Won' : 'Lost'} by {margin}
            {offRating != null && defRating != null && (
              <> · {offRating.toFixed(1)} points scored and {defRating.toFixed(1)} conceded per 100 possessions</>
            )}
            {paceValue != null && <> at a pace of {paceValue.toFixed(1)}</>}
          </p>
        )}
      </div>

      <NarrativeSummary
        headline={narrative?.headline}
        overview={narrative?.overview}
        takeaways={narrative?.takeaways}
        status={status}
        color={brand}
      />

      {/* What decided it */}
      <Section
        n="01"
        title="What decided it"
        subtitle="The numbers with the biggest gap between the two teams. Each one is only listed when the gap is wide enough to have plausibly affected the result, so a close game shows fewer of these — and an even one shows none."
        color={brand}
        narrative={bodyFor('decided')}
      >
        {storylines.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 italic">
            No single area separated the teams by a decisive margin — this one came down to fine margins.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {storylines.map((s) => {
              const Icon = s.tone === 'good' ? TrendingUp : s.tone === 'bad' ? TrendingDown : Minus;
              const tone =
                s.tone === 'good'
                  ? 'text-green-600 dark:text-green-400'
                  : s.tone === 'bad'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-neutral-400';
              return (
                <div key={s.title} className="bg-gray-50 dark:bg-neutral-800/60 rounded-lg border border-gray-200 dark:border-neutral-700 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${tone}`} />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{s.title}</h4>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-neutral-400 leading-relaxed">{s.detail}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Four factors */}
      {factors.length > 0 && (
        <Section
          n="02"
          title="The four factors"
          subtitle={`Shooting efficiency, ball security, offensive rebounding and getting to the line — between them these four explain most of what separates two teams. ${teamName} on the left, ${theirs.name} on the right; the bar shows the split between you.`}
          color={brand}
          narrative={bodyFor('fourFactors')}
        >
          {factors.map((row) => (
            <ComparisonBarRow key={row.label} row={row} myColor={brand} theirColor={OPP_COLOR} myLabel={teamName} theirLabel={theirs.name} />
          ))}
        </Section>
      )}

      {/* Quarter flow */}
      {quarters.length > 0 && (
        <Section
          n="03"
          title="How it unfolded"
          subtitle="Scoring by quarter, with the running margin underneath. The margin track is what shows when the game actually turned — a heavy final score can still come from one bad ten minutes."
          color={brand}
          narrative={bodyFor('byQuarter')}
        >
          <QuarterFlowChart quarters={quarters} myColor={brand} theirColor={OPP_COLOR} myLabel={teamName} theirLabel={theirs.name} />
        </Section>
      )}

      {/* Where the points came from */}
      {mix.length > 0 && (
        <Section
          n="04"
          title="Where the points came from"
          subtitle="Points totals by how they were created. Two teams can score similarly and have generated it in completely different ways, which is usually where the gameplan shows up."
          color={brand}
          narrative={bodyFor('scoringMix')}
        >
          {mix.map((row) => (
            <ComparisonBarRow key={row.label} row={row} myColor={brand} theirColor={OPP_COLOR} myLabel={teamName} theirLabel={theirs.name} />
          ))}
        </Section>
      )}

      {/* Performers */}
      <Section
        n="05"
        title="Who did the damage"
        subtitle="Leading scorers on both sides, with shooting splits and plus-minus. Plus-minus is the team's net points while that player was on court, so it can disagree sharply with a points total."
        color={brand}
        narrative={bodyFor('performers')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: brand }}>{teamName}</h4>
            {myPlayers.length > 0
              ? myPlayers.map((p) => <PlayerRow key={p.name} player={p} color={brand} />)
              : <p className="text-sm text-gray-400 italic">No player data.</p>}
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-400 mb-1">{theirs.name}</h4>
            {theirPlayers.length > 0
              ? theirPlayers.map((p) => <PlayerRow key={p.name} player={p} color={OPP_COLOR} />)
              : <p className="text-sm text-gray-400 italic">No player data.</p>}
          </div>
        </div>
      </Section>

      {/* Shot chart */}
      <Section
        n="06"
        title="Shot distribution"
        subtitle={`Every located shot ${teamName} took in this game. Filter by area or shot type to see where the scoring came from.`}
        color={brand}
      >
        {leagueHasShots === false ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 italic">
            Shot location data isn't available for this competition yet.
          </p>
        ) : myShots.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 italic">
            No shot locations were recorded for this game.
          </p>
        ) : (
          <ShotChart
            shots={myShots}
            emptyMessage="No located shots for this game."
            filters={{
              showPlayerFilter: true,
              showShotTypeFilter: true,
              showZoneFilter: true,
              showResultFilter: true,
              showQuarterFilter: true,
            }}
          />
        )}
      </Section>
    </div>
  );
}
