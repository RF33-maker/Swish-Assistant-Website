import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Lock, RefreshCw, Sparkles, Shield, Swords, Target, Users, Timer, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * The scouting agent's game plan, shown at the top of the opponent scout report.
 *
 * The plan is built ahead of time by the scout-agent edge function (hourly,
 * for every fixture in the next few days) or on demand from here. Everything
 * else on the scout report still renders without it.
 */

interface Call { call: string; why: string }
interface GamePlan {
  headline: string;
  summary: string;
  freeInsight: string;
  howTheyPlay: string;
  defendingThem: { summary: string; keys: Call[] };
  attackingThem: { summary: string; keys: Call[] };
  playersToStop: Array<{ name: string; threat: string; plan: string }>;
  lineupsAndRotation: { summary: string; watchFor: string[] };
  lateGame: string;
  gamePlan: Array<Call & { target: string }>;
  confidence: 'high' | 'medium' | 'low';
  confidenceReason: string;
}
interface Teaser {
  headline: string | null;
  freeInsight: string | null;
  record: string;
  gamesAnalysed: number;
  dataThrough: string | null;
  keyNumbers: Array<{ key: string; value: number | null; rank: number | null; of: number | null }>;
  topScorers: Array<{ name: string; ppg: number; mpg: number | null }>;
  confidence: string | null;
}
interface Report {
  status: 'pending' | 'building' | 'ready' | 'failed' | 'no_data';
  generatedAt: string | null;
  updatedAt: string | null;
  gamesAnalysed: number | null;
  dataThrough: string | null;
  teaser: Teaser | null;
  plan: GamePlan | null;
  error: string | null;
}
interface ApiResponse {
  access: 'full' | 'teaser';
  canBuild: boolean;
  report: Report | null;
  perspectiveMismatch: boolean;
}

const KEY_LABELS: Record<string, string> = {
  pace: 'Pace', offRating: 'Off. rating', defRating: 'Def. rating', efgPct: 'eFG%', tovPct: 'TOV%', threeRate: '3PA rate',
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function Card({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color }}>{icon}</span>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-700 dark:text-neutral-200">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function CallList({ calls }: { calls: Call[] }) {
  return (
    <ul className="space-y-3">
      {calls.map((c, i) => (
        <li key={i}>
          <p className="text-sm font-semibold text-slate-800 dark:text-white">{c.call}</p>
          <p className="text-sm text-gray-600 dark:text-neutral-400">{c.why}</p>
        </li>
      ))}
    </ul>
  );
}

export default function AgentGamePlan({
  leagueId, opponentName, myTeamName, color,
}: { leagueId: string; opponentName: string; myTeamName: string; color: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const polls = useRef(0);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ leagueId, opponent: opponentName, forTeam: myTeamName || '' });
      const res = await fetch(`/api/scout-agent/report?${qs}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error(`report returned ${res.status}`);
      setData(await res.json());
    } catch (err) {
      console.error('Scouting agent report unavailable:', err);
    } finally {
      setLoading(false);
    }
  }, [leagueId, opponentName, myTeamName]);

  useEffect(() => { setLoading(true); polls.current = 0; load(); }, [load]);

  // Poll while a build is running (a build takes a minute or two).
  const building = data?.report?.status === 'building' || requesting;
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => {
      polls.current += 1;
      if (polls.current > 40) { clearInterval(t); return; }
      load();
    }, 8000);
    return () => clearInterval(t);
  }, [building, load]);
  useEffect(() => { if (data?.report?.status && data.report.status !== 'building') setRequesting(false); }, [data?.report?.status]);

  const build = async (force = false) => {
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await fetch('/api/scout-agent/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ leagueId, opponent: opponentName, forTeam: myTeamName || null, force }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 202) throw new Error(json.error || `build returned ${res.status}`);
      polls.current = 0;
      setTimeout(load, 1500);
    } catch (err: any) {
      setRequesting(false);
      setRequestError(err?.message || 'Could not start the build');
    }
  };

  if (loading) {
    return <div className="h-32 rounded-lg bg-gray-100 dark:bg-neutral-800 animate-pulse" aria-label="Loading game plan" />;
  }
  if (!data) return null;

  const report = data.report;
  const plan = report?.plan ?? null;
  const teaser = report?.teaser ?? null;
  const full = data.access === 'full';

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4" style={{ color }} />
        <h3 className="text-base md:text-lg font-semibold text-slate-800 dark:text-white">Game plan</h3>
        {plan && (
          <span className="text-[11px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300">
            {plan.confidence} confidence
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-neutral-400">
        {report?.generatedAt && (
          <span>
            Built {timeAgo(report.generatedAt)}
            {report.gamesAnalysed ? ` · ${report.gamesAnalysed} games` : ''}
            {report.dataThrough ? ` through ${new Date(report.dataThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
          </span>
        )}
        {full && data.canBuild && report?.status === 'ready' && !building && (
          <button onClick={() => build(true)} className="flex items-center gap-1 font-medium hover:text-gray-800 dark:hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" /> Rebuild
          </button>
        )}
      </div>
    </div>
  );

  // ----- nothing built yet -----
  if (!report || (report.status !== 'ready' && !plan)) {
    const failed = report?.status === 'failed';
    const noData = report?.status === 'no_data';
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
        {header}
        {building ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Analysing {opponentName}'s recent games, lineups and shot charts. This takes a minute or two.
          </p>
        ) : noData ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300">There aren't enough recorded games for {opponentName} to build a game plan yet.</p>
        ) : data.canBuild ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-neutral-300">
              {failed ? 'The last build did not finish.' : 'No game plan for this matchup yet.'} The scouting agent reads their play-by-play, lineups and shot charts and turns them into calls for your staff.
            </p>
            <button onClick={() => build(failed)} className="text-sm font-semibold text-white px-4 py-2 rounded-md" style={{ backgroundColor: color }}>
              Build game plan
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-neutral-300">Game plans are built automatically before each fixture.</p>
        )}
        {requestError && <p className="text-sm text-red-600 mt-2">{requestError}</p>}
      </div>
    );
  }

  // ----- teaser (free) -----
  if (!full || !plan) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6 space-y-4">
        {header}
        {teaser?.headline && <p className="text-lg font-semibold text-slate-800 dark:text-white">{teaser.headline}</p>}
        {teaser?.freeInsight && <p className="text-sm text-gray-700 dark:text-neutral-300">{teaser.freeInsight}</p>}
        {!!teaser?.keyNumbers?.length && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {teaser.keyNumbers.map((k) => (
              <div key={k.key} className="rounded-md bg-gray-50 dark:bg-neutral-800 p-2">
                <div className="text-[11px] text-gray-500 dark:text-neutral-400">{KEY_LABELS[k.key] ?? k.key}</div>
                <div className="text-base font-semibold text-slate-800 dark:text-white tabular-nums">{k.value}</div>
                {k.rank != null && k.of != null && <div className="text-[11px] text-gray-500 dark:text-neutral-400">{k.rank} of {k.of}</div>}
              </div>
            ))}
          </div>
        )}
        <div className="relative rounded-lg border border-dashed border-gray-300 dark:border-neutral-700 p-4">
          <div className="space-y-2 blur-sm select-none pointer-events-none" aria-hidden>
            <div className="h-3 w-3/4 bg-gray-200 dark:bg-neutral-700 rounded" />
            <div className="h-3 w-2/3 bg-gray-200 dark:bg-neutral-700 rounded" />
            <div className="h-3 w-5/6 bg-gray-200 dark:bg-neutral-700 rounded" />
            <div className="h-3 w-1/2 bg-gray-200 dark:bg-neutral-700 rounded" />
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 px-4">
            <Lock className="w-5 h-5 text-gray-500" />
            <p className="text-sm font-medium text-slate-800 dark:text-white">
              {data.perspectiveMismatch && full
                ? `This plan was written for another team. Build one for ${myTeamName}.`
                : 'The full game plan, defensive and offensive keys, players to stop and lineup triggers are part of the coach plan.'}
            </p>
            {data.perspectiveMismatch && full ? (
              <button onClick={() => build(false)} className="text-sm font-semibold text-white px-4 py-2 rounded-md" style={{ backgroundColor: color }}>
                Build game plan
              </button>
            ) : (
              <Link href="/contact-sales" className="text-sm font-semibold text-white px-4 py-2 rounded-md" style={{ backgroundColor: color }}>
                Unlock full scouting reports
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ----- full plan -----
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm border border-gray-200 dark:border-neutral-800 p-4 md:p-6">
        {header}
        <p className="text-lg md:text-xl font-semibold text-slate-800 dark:text-white">{plan.headline}</p>
        <p className="text-sm text-gray-700 dark:text-neutral-300 mt-2">{plan.summary}</p>

        <ol className="mt-4 space-y-3">
          {plan.gamePlan.map((g, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-none w-7 h-7 rounded-full text-white text-sm font-bold flex items-center justify-center" style={{ backgroundColor: color }}>{i + 1}</span>
              <div className="min-w-0">
                <p className="text-sm md:text-base font-semibold text-slate-800 dark:text-white">{g.call}</p>
                <p className="text-sm text-gray-600 dark:text-neutral-400">{g.why}</p>
                <p className="text-xs font-medium mt-1 inline-flex items-center gap-1 text-slate-700 dark:text-neutral-300">
                  <Target className="w-3.5 h-3.5" /> Bench target: {g.target}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {plan.confidence !== 'high' && (
          <p className="text-xs text-gray-500 dark:text-neutral-400 mt-4 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-none" /> {plan.confidenceReason}
          </p>
        )}
      </div>

      <Card icon={<Sparkles className="w-4 h-4" />} title="How they play" color={color}>
        <p className="text-sm text-gray-700 dark:text-neutral-300">{plan.howTheyPlay}</p>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card icon={<Shield className="w-4 h-4" />} title="Defending them" color={color}>
          <p className="text-sm text-gray-700 dark:text-neutral-300 mb-3">{plan.defendingThem.summary}</p>
          <CallList calls={plan.defendingThem.keys} />
        </Card>
        <Card icon={<Swords className="w-4 h-4" />} title="Attacking them" color={color}>
          <p className="text-sm text-gray-700 dark:text-neutral-300 mb-3">{plan.attackingThem.summary}</p>
          <CallList calls={plan.attackingThem.keys} />
        </Card>
      </div>

      <Card icon={<Target className="w-4 h-4" />} title="Players to stop" color={color}>
        <div className="grid md:grid-cols-2 gap-3">
          {plan.playersToStop.map((p) => (
            <div key={p.name} className="rounded-md bg-gray-50 dark:bg-neutral-800 p-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-white">{p.name}</p>
              <p className="text-sm text-gray-600 dark:text-neutral-400 mt-1">{p.threat}</p>
              <p className="text-sm text-slate-800 dark:text-neutral-200 mt-2"><span className="font-medium">Plan: </span>{p.plan}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card icon={<Users className="w-4 h-4" />} title="Lineups and rotation" color={color}>
          <p className="text-sm text-gray-700 dark:text-neutral-300">{plan.lineupsAndRotation.summary}</p>
          {plan.lineupsAndRotation.watchFor.length > 0 && (
            <ul className="mt-3 space-y-1.5 list-disc pl-5 text-sm text-gray-700 dark:text-neutral-300">
              {plan.lineupsAndRotation.watchFor.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </Card>
        <Card icon={<Timer className="w-4 h-4" />} title="Late game" color={color}>
          <p className="text-sm text-gray-700 dark:text-neutral-300">{plan.lateGame}</p>
        </Card>
      </div>
    </div>
  );
}
