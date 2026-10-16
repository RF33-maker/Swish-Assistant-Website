import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crosshair, Shield, Swords, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTeamBranding } from '@/hooks/useTeamBranding';
import ShotChart, { type ShotData } from '@/components/ShotChart';
import { ComparisonBarRow, NarrativeSummary, RankTrack, SectionNarrative } from './reportVisuals';
import { useReportNarrative } from '@/hooks/useReportNarrative';
import AgentGamePlan from './AgentGamePlan';
import ScoutRoster from './ScoutRoster';
import CoachNotesPanel from './CoachNotes';
import WindowToggle from './WindowToggle';
import ScopePicker from './ScopePicker';
import { TeamLogo } from '@/components/TeamLogo';
import { useScoutRoster } from '@/hooks/useScoutRoster';
import { useScoutScope } from '@/hooks/useScoutScope';
import { useCoachNotes } from '@/hooks/useCoachNotes';
import { useAuth } from '@/hooks/use-auth';
import type { ScoutWindow } from '@shared/coachNotes';
import { DEFAULT_SCOPE, type ScoutScope } from '@shared/scoutScope';
import { brandVars } from '@/lib/brandColor';
import { num, ordinal, toPlayerLine, type PlayerGameRow, type PlayerLine } from '@/lib/gameReport';
import type { PlayerSeasonAverage, StandingRow, TeamSeasonAverage } from '@/pages/CoachesHub';

interface Props {
  opponentName: string;
  leagueId: string;
  myTeamName: string;
  standings: StandingRow[];
  teamSeasonAverages: TeamSeasonAverage[];
  playerSeasonAverages: PlayerSeasonAverage[];
  brandColor: string;
  onBack: () => void;
  backLabel?: string;
  /** Open on a particular view, for a scout picked from the list. */
  initialWindow?: ScoutWindow;
  initialScope?: ScoutScope;
}

const OPP_COLOR = '#94a3b8';

interface RecentGame {
  gameKey: string;
  score: number | null;
  oppScore: number | null;
  oppName: string;
  efg: number | null;
  tov: number | null;
}

/** A club crest on a white tile, so any logo reads on the team-coloured banner. */
function Crest({ teamName, leagueId }: { teamName: string; leagueId: string }) {
  return (
    <span className="shrink-0 w-[60px] h-[60px] md:w-[84px] md:h-[84px] rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.55)] flex items-center justify-center p-2 overflow-hidden">
      <TeamLogo teamName={teamName} leagueId={leagueId} size="lg" className="!w-full !h-full object-contain" />
    </span>
  );
}

/** One side of the matchup on the banner: crest, then whose side it is, then the name. */
function MatchSide({ teamName, leagueId, role }: { teamName: string; leagueId: string; role: string }) {
  return (
    <div className="relative flex flex-col items-center text-center min-w-0">
      <Crest teamName={teamName} leagueId={leagueId} />
      <span className="mt-3 text-[10px] md:text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-75">{role}</span>
      <h2 className="ch-display uppercase font-bold tracking-tight leading-[0.95] mt-1 max-w-full break-words text-[1.45rem] sm:text-[2rem] md:text-[2.75rem]">{teamName}</h2>
    </div>
  );
}

/** The quiet sign-off under the report. */
function PreparedBy() {
  return (
    <footer className="flex items-center gap-3 pt-2 pb-1 text-[12px] text-[color:var(--ch-muted)]">
      <span className="h-px flex-1 bg-[color:var(--ch-border)]" />
      <img src="/icon-512.png" alt="" className="w-6 h-6" />
      <span>Prepared by <span className="font-semibold text-[color:var(--ch-text)]">Swish Assistant</span></span>
      <span className="h-px flex-1 bg-[color:var(--ch-border)]" />
    </footer>
  );
}

function Section({ n, title, subtitle, color, children, narrative }: {
  n: string; title: string; subtitle?: string; color: string; children: React.ReactNode; narrative?: string;
}) {
  return (
    <div className="ch-card p-4 md:p-6">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="ch-kicker-n" style={{ color: `var(--sr-ink, ${color})` }}>{n}</span>
        <h3 className="text-[15px] md:text-base font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h3>
      </div>
      {subtitle && <p className="text-xs text-gray-500 dark:text-neutral-400 mb-3">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-3'}>{children}</div>
      <SectionNarrative body={narrative} />
    </div>
  );
}

/** Rank a team within the competition for one stat. */
function rankOf(
  teams: TeamSeasonAverage[],
  teamName: string,
  pick: (t: TeamSeasonAverage) => number | null | undefined,
  lowerIsBetter = false
): { rank: number; of: number } | null {
  const scored = teams
    .map((t) => ({ name: t.team_name, value: Number(pick(t) ?? NaN) }))
    .filter((r) => !Number.isNaN(r.value))
    .sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value));
  const index = scored.findIndex((r) => r.name === teamName);
  return index >= 0 ? { rank: index + 1, of: scored.length } : null;
}

export default function OpponentScoutReport({
  opponentName, leagueId, myTeamName, standings, teamSeasonAverages, playerSeasonAverages, brandColor, onBack, backLabel = 'Back to overview', initialWindow = 'season', initialScope = DEFAULT_SCOPE,
}: Props) {
  const [recent, setRecent] = useState<RecentGame[]>([]);
  const [shots, setShots] = useState<ShotData[]>([]);
  // See MatchReport: a league-level probe separates "competition has no shot
  // data" from "these three games happen to have none".
  const [leagueHasShots, setLeagueHasShots] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  // Branded to the coach's own team, not the opponent -- this is their document.
  const { colors, primaryColor, secondaryColor, isLoading: brandLoading } = useTeamBranding({ teamName: myTeamName, leagueId });
  // The opponent's roster and league-percentile profiles (public box-score data).
  // Which of the opponent's games the plan, roster and percentiles are read over.
  const [scoutWindow, setScoutWindow] = useState<ScoutWindow>(initialWindow);
  // Which season and competitions count; coaches and admins can change it.
  const [scope, setScope] = useState<ScoutScope>(initialScope);
  const { isCoach, isRealAdmin } = useAuth();
  const scopeOptions = useScoutScope(leagueId, opponentName, isCoach || isRealAdmin).data ?? null;
  // The roster and percentiles are read from the season in progress, so a past season has none to show.
  const pastSeason = !!scope.season;
  const { data: rosterData } = useScoutRoster(leagueId, opponentName, myTeamName, scoutWindow, scope.exclude);
  // The coach's own notes on this opponent: for coach accounts and admins, never other visitors.
  const notes = useCoachNotes(leagueId, opponentName, myTeamName, isCoach || isRealAdmin);
  const brand = brandLoading || !primaryColor ? brandColor : primaryColor;
  // The hook falls back to a stock blue when a club has no colours of its own, so only a loaded second colour counts.
  const secondBrand = !brandLoading && colors ? secondaryColor : null;
  const brandStyle = useMemo(() => brandVars(brand, secondBrand) as React.CSSProperties, [brand, secondBrand]);

  // The feed lists some clubs under two names in one competition (sponsor
  // prefixes and abbreviations), which would make the rank denominator here
  // disagree with the standings on the page behind it. Collapse on team_id
  // first, keeping the name with the most games.
  const rankableTeams = useMemo(() => {
    const best = new Map<string, TeamSeasonAverage>();
    teamSeasonAverages.forEach((t) => {
      const key = t.team_id || t.team_name;
      const current = best.get(key);
      if (!current || (t.games_played || 0) > (current.games_played || 0)) best.set(key, t);
    });
    return Array.from(best.values());
  }, [teamSeasonAverages]);

  const opponent = useMemo(
    () => teamSeasonAverages.find((t) => t.team_name === opponentName),
    [teamSeasonAverages, opponentName]
  );
  const mine = useMemo(
    () => teamSeasonAverages.find((t) => t.team_name === myTeamName),
    [teamSeasonAverages, myTeamName]
  );
  const oppStanding = useMemo(() => standings.find((s) => s.teamName === opponentName), [standings, opponentName]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Their last three completed games, most recent first.
      const { data: theirRows, error } = await supabase
        .from('team_stats')
        .select('game_key, name, score, efg_percent, tov_percent, created_at')
        .eq('league_id', leagueId)
        .eq('name', opponentName)
        .order('created_at', { ascending: false })
        .limit(3);
      if (cancelled) return;
      if (error) console.error('ScoutReport team_stats:', error.message);

      const gameKeys = (theirRows || []).map((r: any) => r.game_key).filter(Boolean);
      let opponents: any[] = [];
      if (gameKeys.length > 0) {
        const { data: others } = await supabase
          .from('team_stats')
          .select('game_key, name, score')
          .in('game_key', gameKeys);
        opponents = others || [];
      }

      const games: RecentGame[] = (theirRows || []).map((r: any) => {
        const other = opponents.find((o) => o.game_key === r.game_key && o.name !== opponentName);
        return {
          gameKey: r.game_key,
          score: num(r.score),
          oppScore: other ? num(other.score) : null,
          oppName: other?.name || 'Unknown',
          efg: num(r.efg_percent),
          tov: num(r.tov_percent),
        };
      });

      // Shot locations across those games, to show where they score from.
      let shotRows: ShotData[] = [];
      if (gameKeys.length > 0) {
        const { data: sc } = await supabase
          .from('shot_chart')
          .select('id, x, y, success, player_name, player_id, period, team_no, shot_type, sub_type, game_key')
          .in('game_key', gameKeys);
        shotRows = (sc || []) as unknown as ShotData[];
      }
      const { data: probe, error: probeErr } = await supabase
        .from('shot_chart').select('id').eq('league_id', leagueId).limit(1);

      if (cancelled) return;
      setRecent(games);
      setShots(shotRows);
      setLeagueHasShots(!probeErr && (probe || []).length > 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [leagueId, opponentName]);

  const theirPlayers: PlayerLine[] = useMemo(() => {
    return playerSeasonAverages
      .filter((p) => p.team_name === opponentName)
      .map((p) =>
        toPlayerLine({
          full_name: p.player_name,
          team_name: p.team_name,
          spoints: p.avg_pts,
          sreboundstotal: p.avg_reb,
          sassists: p.avg_ast,
          ssteals: p.avg_stl,
          sblocks: p.avg_blk,
          sminutes: p.games_played,
        } as PlayerGameRow)
      )
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
      .slice(0, 4);
  }, [playerSeasonAverages, opponentName]);

  const ranks = useMemo(() => {
    if (!opponent) return null;
    return {
      pts: rankOf(rankableTeams, opponentName, (t) => t.avg_pts),
      reb: rankOf(rankableTeams, opponentName, (t) => t.avg_reb),
      ast: rankOf(rankableTeams, opponentName, (t) => t.avg_ast),
      fg: rankOf(rankableTeams, opponentName, (t) => t.season_fg_pct),
      tov: rankOf(rankableTeams, opponentName, (t) => t.avg_tov, true),
    };
  }, [opponent, rankableTeams, opponentName]);

  /**
   * Turn the ranks into things to actually do. Only extremes are called out —
   * a team sitting mid-table in everything genuinely has no headline, and
   * saying so is more useful than inventing one.
   */
  const keys = useMemo(() => {
    if (!opponent || !ranks) return [];
    const out: Array<{ icon: typeof Swords; text: string }> = [];
    const total = ranks.pts?.of ?? rankableTeams.length;
    const topThird = Math.max(1, Math.ceil(total / 3));
    const bottomThird = total - topThird;

    if (ranks.pts && ranks.pts.rank <= topThird) {
      out.push({ icon: Swords, text: `They score ${Number(opponent.avg_pts ?? 0).toFixed(1)} a game — ${ordinal(ranks.pts.rank)} of ${ranks.pts.of} in this competition. Getting back in transition matters.` });
    }
    if (ranks.fg && ranks.fg.rank <= topThird) {
      out.push({ icon: Crosshair, text: `Efficient shooting team at ${Number(opponent.season_fg_pct ?? 0).toFixed(1)}% from the field (${ordinal(ranks.fg.rank)} of ${ranks.fg.of}). Contest early.` });
    }
    if (ranks.reb && ranks.reb.rank <= topThird) {
      out.push({ icon: Shield, text: `Strong on the glass at ${Number(opponent.avg_reb ?? 0).toFixed(1)} rebounds a game (${ordinal(ranks.reb.rank)} of ${ranks.reb.of}). Box out.` });
    }
    if (ranks.reb && ranks.reb.rank > bottomThird) {
      out.push({ icon: Shield, text: `Weak rebounding side — ${ordinal(ranks.reb.rank)} of ${ranks.reb.of}. Offensive glass is there to be attacked.` });
    }
    if (ranks.tov && ranks.tov.rank > bottomThird) {
      out.push({ icon: AlertTriangle, text: `They give the ball away — ${Number(opponent.avg_tov ?? 0).toFixed(1)} turnovers a game, ${ordinal(ranks.tov.rank)} of ${ranks.tov.of}. Pressure should pay.` });
    }
    if (ranks.fg && ranks.fg.rank > bottomThird) {
      out.push({ icon: Crosshair, text: `Poor shooting team at ${Number(opponent.season_fg_pct ?? 0).toFixed(1)}% (${ordinal(ranks.fg.rank)} of ${ranks.fg.of}). Make them shoot over a set defence.` });
    }
    return out;
  }, [opponent, ranks, rankableTeams.length]);

  const headToHead = useMemo(() => {
    if (!opponent || !mine) return [];
    return [
      { label: 'Points per game', mine: Number(mine.avg_pts ?? 0), theirs: Number(opponent.avg_pts ?? 0), decimals: 1 },
      { label: 'Rebounds per game', mine: Number(mine.avg_reb ?? 0), theirs: Number(opponent.avg_reb ?? 0), decimals: 1 },
      { label: 'Assists per game', mine: Number(mine.avg_ast ?? 0), theirs: Number(opponent.avg_ast ?? 0), decimals: 1 },
      {
        label: 'Field goal %',
        mine: mine.season_fg_pct != null ? Number(mine.season_fg_pct) : null,
        theirs: opponent.season_fg_pct != null ? Number(opponent.season_fg_pct) : null,
        unit: '%',
        decimals: 1,
      },
      { label: 'Turnovers per game', mine: Number(mine.avg_tov ?? 0), theirs: Number(opponent.avg_tov ?? 0), decimals: 1, lowerIsBetter: true },
    ];
  }, [mine, opponent]);

  const facts = useMemo(() => {
    if (!opponent) return null;
    return {
      yourTeam: myTeamName,
      opponent: opponentName,
      theirRecord: oppStanding
        ? { wins: oppStanding.wins, losses: oppStanding.losses, leaguePosition: oppStanding.rank, teamsInLeague: standings.length }
        : null,
      theirSeasonAverages: {
        pointsPerGame: Number(opponent.avg_pts ?? 0),
        reboundsPerGame: Number(opponent.avg_reb ?? 0),
        assistsPerGame: Number(opponent.avg_ast ?? 0),
        fieldGoalPct: opponent.season_fg_pct != null ? Number(opponent.season_fg_pct) : null,
        turnoversPerGame: Number(opponent.avg_tov ?? 0),
        gamesPlayed: opponent.games_played ?? null,
      },
      theirRanks: ranks,
      headToHeadAverages: headToHead.map((r) => ({ stat: r.label, you: r.mine, them: r.theirs })),
      theirLastThree: recent.map((g) => ({
        result: g.score != null && g.oppScore != null ? (g.score > g.oppScore ? 'W' : 'L') : null,
        scored: g.score, conceded: g.oppScore, against: g.oppName,
        effectiveFgPct: g.efg, turnoverRate: g.tov,
      })),
      theirLeadingPlayers: theirPlayers.map((p) => ({
        name: p.name, pointsPerGame: p.points, reboundsPerGame: p.rebounds, assistsPerGame: p.assists,
      })),
    };
  }, [opponent, myTeamName, opponentName, oppStanding, standings.length, ranks, headToHead, recent, theirPlayers]);

  const SECTION_KEYS = ['keys', 'profile', 'matchup', 'form', 'players'];
  const { narrative, status, bodyFor } = useReportNarrative('scout', facts, SECTION_KEYS, !loading && !!facts);

  if (!opponent) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="ch-btn ch-btn-ghost h-8 px-2.5 text-[12.5px]">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="ch-card p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
          No season data for {opponentName} in this competition yet.
        </div>
      </div>
    );
  }

  const bannerFacts = [
    oppStanding ? { label: 'Their record', value: `${oppStanding.wins}-${oppStanding.losses}` } : null,
    oppStanding ? { label: 'Standing', value: `${ordinal(oppStanding.rank)} of ${standings.length}` } : null,
    opponent.games_played ? { label: 'Games', value: String(opponent.games_played) } : null,
  ].filter((f): f is { label: string; value: string } => !!f);

  return (
    <div className="sr-brand space-y-4 md:space-y-6" style={brandStyle}>
      <button onClick={onBack} className="ch-btn ch-btn-ghost h-8 px-2.5 text-[12.5px]">
        <ArrowLeft className="w-4 h-4" /> {backLabel}
      </button>

      {/* Solid colours rather than gradients: useTeamBranding resolves some
          teams to an rgb() string, and brandVars turns both into hex. The
          coach's own colours carry the banner, the second sits as a base line. */}
      <div className="ch-hero" style={{ backgroundColor: 'var(--sr-brand)', color: 'var(--sr-on)' }}>
        <div className="px-5 pt-5 md:px-8 md:pt-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10.5px] md:text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
            <span>{myTeamName ? `${myTeamName} scouting report` : 'Pre-game scout report'}</span>
            {rosterData?.leagueName && <span>{rosterData.leagueName}</span>}
          </div>
          {myTeamName ? (
            <div className="relative grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 md:gap-6 py-6 md:py-8">
              <i className="sr-court" aria-hidden="true" />
              <MatchSide teamName={myTeamName} leagueId={leagueId} role="Prepared for" />
              <span
                className="relative w-9 h-9 md:w-12 md:h-12 rounded-full flex items-center justify-center ch-display uppercase text-lg md:text-2xl font-semibold"
                style={{ backgroundColor: 'var(--sr-brand)', boxShadow: '0 0 0 1.5px color-mix(in srgb, var(--sr-on) 32%, transparent)' }}
              >
                v
              </span>
              <MatchSide teamName={opponentName} leagueId={leagueId} role="Opponent" />
            </div>
          ) : (
            <div className="py-6 md:py-8"><MatchSide teamName={opponentName} leagueId={leagueId} role="Opponent" /></div>
          )}
        </div>
        <dl className="grid grid-cols-3 px-5 md:px-8 py-3" style={{ backgroundColor: 'var(--sr-band)' }}>
          {bannerFacts.length === 0 ? (
            <div className="col-span-3 text-[13px] opacity-80">Record unavailable</div>
          ) : bannerFacts.map((f, i) => (
            <div key={f.label} className={`min-w-0 ${i > 0 ? 'pl-3 md:pl-5 border-l' : ''}`} style={{ borderColor: 'color-mix(in srgb, var(--sr-on) 22%, transparent)' }}>
              <dt className="text-[9.5px] md:text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">{f.label}</dt>
              <dd className="text-[14px] md:text-[15px] font-semibold tabular-nums mt-0.5">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="h-1.5" style={{ backgroundColor: 'var(--sr-accent)' }} />
      </div>

      <WindowToggle value={scoutWindow} onChange={setScoutWindow} color={brand} games={rosterData?.season.wholeSeason ? rosterData.season.games : null} />

      {scopeOptions && (isCoach || isRealAdmin) && <ScopePicker options={scopeOptions} value={scope} onChange={setScope} color={brand} />}

      <AgentGamePlan
        leagueId={leagueId} opponentName={opponentName} myTeamName={myTeamName} color={brand} secondaryColor={secondBrand}
        roster={pastSeason ? null : rosterData ?? null} window={scoutWindow} scope={scope} notes={notes.canEdit ? notes.notes : null} notesUpdatedAt={notes.canEdit ? notes.updatedAt : null}
      />

      {notes.canEdit && (
        <CoachNotesPanel api={notes} opponentName={opponentName} players={(rosterData?.roster ?? []).map((r) => r.name)} color={brand} />
      )}

      {pastSeason && <p className="text-[13px] text-[color:var(--ch-muted)]">The roster and player percentiles describe the season in progress, so they are not shown for a {scope.season} scout.</p>}

      {rosterData && !pastSeason && <ScoutRoster data={rosterData} opponentName={opponentName} color={brand} notes={notes.canEdit ? notes : null} />}

      <NarrativeSummary
        headline={narrative?.headline}
        overview={narrative?.overview}
        takeaways={narrative?.takeaways}
        status={status}
        color={brand}
      />

      {/* Keys to the game */}
      <Section
        n="01"
        title="Keys to the game"
        subtitle="Derived from where they sit in this competition — only top-third and bottom-third finishes are listed, so a side with no real outlier correctly produces nothing to plan around rather than filler."
        color={brand}
        narrative={bodyFor('keys')}
      >
        {keys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 italic">
            They sit mid-table across the board — no obvious statistical weakness to target or threat to plan around.
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map((k, i) => (
              <div key={i} className="flex items-start gap-2.5 ch-tile p-3">
                <k.icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--sr-ink)' }} />
                <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed">{k.text}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Their profile */}
      {ranks && (
        <Section
          n="02"
          title="Their season profile"
          subtitle="Where they rank across the competition. The bar is their position rather than the raw number, so a full bar means best in the league and an empty one means last — read the shape, not the length."
          color={brand}
          narrative={bodyFor('profile')}
        >
          <RankTrack label="Points per game" value={Number(opponent.avg_pts ?? 0)} rank={ranks.pts?.rank ?? null} of={ranks.pts?.of ?? null} color={brand} />
          <RankTrack label="Rebounds per game" value={Number(opponent.avg_reb ?? 0)} rank={ranks.reb?.rank ?? null} of={ranks.reb?.of ?? null} color={brand} />
          <RankTrack label="Assists per game" value={Number(opponent.avg_ast ?? 0)} rank={ranks.ast?.rank ?? null} of={ranks.ast?.of ?? null} color={brand} />
          <RankTrack label="Field goal %" value={opponent.season_fg_pct != null ? Number(opponent.season_fg_pct) : null} unit="%" rank={ranks.fg?.rank ?? null} of={ranks.fg?.of ?? null} color={brand} />
          <RankTrack label="Turnovers per game (fewest is best)" value={Number(opponent.avg_tov ?? 0)} rank={ranks.tov?.rank ?? null} of={ranks.tov?.of ?? null} color={brand} />
        </Section>
      )}

      {/* Head to head */}
      {headToHead.length > 0 && (
        <Section
          n="03"
          title="How you match up"
          subtitle={`${myTeamName} on the left against ${opponentName} on the right, season averages. These are full-season numbers, so weigh them against the recent form below rather than on their own.`}
          color={brand}
          narrative={bodyFor('matchup')}
        >
          {headToHead.map((row) => (
            <ComparisonBarRow key={row.label} row={row} myColor={brand} theirColor={OPP_COLOR} myLabel={myTeamName} theirLabel={opponentName} />
          ))}
        </Section>
      )}

      {/* Recent form */}
      <Section
        n="04"
        title="Last 3 games"
        subtitle="Their most recent results, newest first, with shooting efficiency and turnover rate for each. Three games is a small sample — treat it as form, not evidence of a change in quality."
        color={brand}
        narrative={bodyFor('form')}
      >
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">Loading recent games…</p>
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 italic">No completed games recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((g) => {
              const won = g.score != null && g.oppScore != null && g.score > g.oppScore;
              return (
                <div key={g.gameKey} className="flex items-center justify-between gap-3 ch-tile p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${won ? 'bg-green-500' : 'bg-red-500'}`}>
                      {won ? 'W' : 'L'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                        {g.score ?? '—'}–{g.oppScore ?? '—'}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-neutral-400 truncate">vs {g.oppName}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-gray-500 dark:text-neutral-400">
                      {g.efg != null ? `${g.efg.toFixed(1)}% eFG` : '—'}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-neutral-400">
                      {g.tov != null ? `${g.tov.toFixed(1)}% TOV` : '—'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Standout players */}
      <Section
        n="05"
        title="Standout players"
        subtitle="Their leading scorers by season average. Where scoring is concentrated in one or two players, taking them out of the game is usually worth more than defending evenly across the roster."
        color={brand}
        narrative={bodyFor('players')}
      >
        {theirPlayers.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 italic">No player data for this team yet.</p>
        ) : (
          <div className="space-y-2">
            {theirPlayers.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-neutral-800 last:border-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={i === 0 ? { backgroundColor: 'var(--sr-brand)', color: 'var(--sr-on)' } : { backgroundColor: OPP_COLOR, color: '#fff' }}>
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  <div>
                    <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--sr-ink)' }}>{p.points?.toFixed(1) ?? '—'}</div>
                    <div className="text-[10px] text-gray-400 dark:text-neutral-500">PPG</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-neutral-300">{p.rebounds?.toFixed(1) ?? '—'}</div>
                    <div className="text-[10px] text-gray-400 dark:text-neutral-500">RPG</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold tabular-nums text-gray-700 dark:text-neutral-300">{p.assists?.toFixed(1) ?? '—'}</div>
                    <div className="text-[10px] text-gray-400 dark:text-neutral-500">APG</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Where they shoot from */}
      <Section
        n="06"
        title="Where they score from"
        subtitle="Every located shot across their last three games. Filter by area to see which parts of the floor they live in."
        color={brand}
      >
        {leagueHasShots === false ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400 italic">
            Shot location data isn't available for this competition yet.
          </p>
        ) : loading ? (
          <p className="text-sm text-gray-500 dark:text-neutral-400">Loading shot data…</p>
        ) : (
          <ShotChart
            shots={shots}
            emptyMessage="No located shots for these games."
            filters={{
              showPlayerFilter: true,
              showShotTypeFilter: true,
              showZoneFilter: true,
              showResultFilter: true,
            }}
          />
        )}
      </Section>

      <PreparedBy />
    </div>
  );
}
