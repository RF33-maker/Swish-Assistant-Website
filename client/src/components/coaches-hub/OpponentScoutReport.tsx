import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Crosshair, Shield, Swords, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTeamBranding } from '@/hooks/useTeamBranding';
import ShotChart, { type ShotData } from '@/components/ShotChart';
import { ComparisonBarRow, NarrativeSummary, RankTrack, SectionNarrative } from './reportVisuals';
import { useReportNarrative } from '@/hooks/useReportNarrative';
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
  opponentName, leagueId, myTeamName, standings, teamSeasonAverages, playerSeasonAverages, brandColor, onBack,
}: Props) {
  const [recent, setRecent] = useState<RecentGame[]>([]);
  const [shots, setShots] = useState<ShotData[]>([]);
  // See MatchReport: a league-level probe separates "competition has no shot
  // data" from "these three games happen to have none".
  const [leagueHasShots, setLeagueHasShots] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  // Branded to the coach's own team, not the opponent -- this is their document.
  const { primaryColor, isLoading: brandLoading } = useTeamBranding({ teamName: myTeamName, leagueId });
  const brand = brandLoading || !primaryColor ? brandColor : primaryColor;

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
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-8 text-center text-sm text-gray-500 dark:text-neutral-400">
          No season data for {opponentName} in this competition yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-neutral-400 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft className="w-4 h-4" /> Back to overview
      </button>

      <div className="rounded-lg p-4 md:p-6 text-white" /* Solid rather than a gradient: useTeamBranding resolves some teams to
             an rgb() string, and appending an alpha suffix to that produces
             invalid CSS, which silently drops the whole background. */
          style={{ backgroundColor: brand }}>
        <div className="text-[11px] md:text-xs font-semibold uppercase tracking-wide text-white/70 mb-1">Pre-game scout report</div>
        <h2 className="text-xl md:text-3xl font-bold">{opponentName}</h2>
        <p className="text-sm text-white/80 mt-1">
          {oppStanding ? `${oppStanding.wins}-${oppStanding.losses}, ${ordinal(oppStanding.rank)} of ${standings.length}` : 'Record unavailable'}
          {opponent.games_played ? ` · ${opponent.games_played} games played` : ''}
        </p>
      </div>

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
              <div key={i} className="flex items-start gap-2.5 bg-gray-50 dark:bg-neutral-800/60 rounded-lg border border-gray-200 dark:border-neutral-700 p-3">
                <k.icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: brand }} />
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
                <div key={g.gameKey} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-neutral-800/60 rounded-lg border border-gray-200 dark:border-neutral-700 p-3">
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
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ backgroundColor: i === 0 ? brand : OPP_COLOR }}>
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-right">
                  <div>
                    <div className="text-sm font-bold tabular-nums" style={{ color: brand }}>{p.points?.toFixed(1) ?? '—'}</div>
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
    </div>
  );
}
