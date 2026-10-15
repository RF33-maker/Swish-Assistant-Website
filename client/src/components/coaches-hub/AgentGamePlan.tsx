import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Lock, RefreshCw, Sparkles, Shield, Swords, Target, Users, Timer, AlertTriangle, Download, ChevronRight, Crosshair } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { printScoutPlan } from '@/lib/printScoutPlan';
import type { ScoutRosterResponse } from '@/hooks/useScoutRoster';
import { applyEdits, windowLabel, type CoachNote, type PlanEdits, type ScoutWindow } from '@shared/coachNotes';
import { ordinalOf, type RosterEntry } from '@shared/scoutRoster';
import { playerNameKey } from '@shared/playerNameKey';
import { Avatar } from './ScoutRoster';
import { Ed, EditProvider, type EditApi } from './EditableText';

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
  tier?: 'full' | 'preview';
  status: 'pending' | 'building' | 'ready' | 'failed' | 'no_data';
  generatedAt: string | null;
  updatedAt: string | null;
  gamesAnalysed: number | null;
  dataThrough: string | null;
  teaser: Teaser | null;
  plan: GamePlan | null;
  /** The coach's own wording over the AI's, for this plan only. */
  edits?: PlanEdits | null;
  /** Only the coach's own report carries the fact pack; here, just to see whether notes went into it. */
  facts?: { coachNotes?: unknown } | null;
  error: string | null;
}
interface ApiResponse {
  access: 'full' | 'teaser';
  canBuild: boolean;
  canPreview: boolean;
  /** The paid plan for the caller's own team (coach accounts only). */
  report: Report | null;
  /** The shared free look: headline, summary and two priorities (Sonnet). */
  preview: Report | null;
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

// The club colour as ink and fill. OpponentScoutReport sets these (index.css,
// .sr-brand) so they read on either theme; the passed colour is the fallback.
const ink = (color: string) => `var(--sr-ink, ${color})`;
const fill = (color: string): React.CSSProperties => ({ backgroundColor: `var(--sr-brand, ${color})`, color: 'var(--sr-on, #fff)' });

/** What sits at a plan path like "gamePlan.0.target". */
function textAt(plan: unknown, path: string): string {
  let node: any = plan;
  for (const part of path.split('.')) node = node?.[part];
  return typeof node === 'string' ? node : '';
}

function Card({ icon, title, color, children, className = '' }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`ch-card p-5 md:p-6 ${className}`}>
      <header className="flex items-center gap-2.5 mb-4">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--sr-tint, var(--ch-surface-3))', color: ink(color) }}>
          {icon}
        </span>
        <h4 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h4>
      </header>
      {children}
    </section>
  );
}

function CallList({ calls, color, path }: { calls: Call[]; color: string; path: string }) {
  return (
    <ol className="border-t border-[color:var(--ch-border)]">
      {calls.map((c, i) => (
        <li key={i} className="grid grid-cols-[22px_1fr] gap-2 py-3 border-b border-[color:var(--ch-border)] last:border-b-0 last:pb-0">
          <span className="ch-display text-[17px] font-bold leading-[1.25] tabular-nums" style={{ color: ink(color) }}>{i + 1}</span>
          <div className="min-w-0">
            <Ed as="p" path={`${path}.${i}.call`} value={c.call} color={color} className="text-[14px] font-semibold leading-snug text-slate-900 dark:text-white" />
            <Ed as="p" path={`${path}.${i}.why`} value={c.why} color={color} className="text-[13.5px] leading-relaxed text-[color:var(--ch-text-2)] mt-0.5" />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** How sure the agent is, as three bars and a word. */
function ConfidenceChip({ level }: { level: string }) {
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-1 rounded-full bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]">
      <span className="flex items-end gap-[2px]" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="w-[3px] rounded-sm" style={{ height: 5 + i * 2.5, backgroundColor: i < filled ? 'currentColor' : 'var(--ch-border-strong)' }} />
        ))}
      </span>
      {level} confidence
    </span>
  );
}

/** The opponent's headline numbers: a ruled strip, rank coloured where a rank is good or bad. */
function KeyNumbers({ teaser, opponentName }: { teaser: Teaser; opponentName: string }) {
  const numbers = (teaser.keyNumbers ?? []).filter((k) => k.value != null);
  if (!numbers.length && !teaser.record) return null;
  const cells = [
    ...(teaser.record ? [{ key: 'record', value: teaser.record, label: 'Record', sub: teaser.gamesAnalysed ? `${teaser.gamesAnalysed} games` : '', tone: '' }] : []),
    ...numbers.slice(0, teaser.record ? 5 : 6).map((k) => {
      const ofN = k.of ?? 0;
      // Pace and three-point rate are styles, not strengths, so they stay neutral.
      const judged = !!k.rank && !!ofN && k.key !== 'pace' && k.key !== 'threeRate';
      const third = Math.ceil(ofN / 3);
      const tone = !judged ? '' : k.rank! <= third ? 'var(--ch-win)' : k.rank! > ofN - third ? 'var(--ch-loss)' : '';
      return { key: k.key, value: String(k.value), label: KEY_LABELS[k.key] ?? k.key, sub: k.rank && ofN ? `${ordinalOf(k.rank)} of ${ofN}` : '', tone };
    }),
  ];
  return (
    <div>
      <p className="ch-eyebrow mb-2">{opponentName} at a glance</p>
      <dl className="grid grid-cols-3 md:grid-cols-6 gap-px bg-[color:var(--ch-border)] border-t-2 border-b border-t-[color:var(--ch-text)] border-b-[color:var(--ch-border)]">
        {cells.map((c) => (
          <div key={c.key} className="bg-[color:var(--ch-surface)] px-2.5 md:px-3 py-3 min-w-0">
            <dd className="ch-display text-[26px] md:text-[30px] font-bold leading-none tabular-nums text-slate-900 dark:text-white">{c.value}</dd>
            <dt className="mt-1.5 text-[10px] md:text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[color:var(--ch-muted)] truncate">{c.label}</dt>
            {c.sub && <p className="text-[11.5px] font-semibold mt-0.5 tabular-nums" style={{ color: c.tone || 'var(--ch-text-2)' }}>{c.sub}</p>}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** One of the numbered calls, with its bench target set apart so it reads from the sideline. */
function PlanCall({ n, call, color, path }: { n: number; call: Call & { target?: string }; color: string; path?: string }) {
  const at = (field: string) => (path ? `${path}.${field}` : '');
  return (
    <li className="grid grid-cols-[34px_1fr] md:grid-cols-[48px_1fr] gap-x-2 py-4 border-b border-[color:var(--ch-border)] last:border-b-0 last:pb-0">
      <span className="ch-display text-[30px] md:text-[36px] font-bold leading-[0.85] tabular-nums" style={{ color: ink(color) }}>{n}</span>
      <div className="min-w-0">
        {path
          ? <Ed as="p" path={at('call')} value={call.call} color={color} className="text-[15px] md:text-[16px] font-semibold tracking-tight leading-snug text-slate-900 dark:text-white" />
          : <p className="text-[15px] md:text-[16px] font-semibold tracking-tight leading-snug text-slate-900 dark:text-white">{call.call}</p>}
        {path
          ? <Ed as="p" path={at('why')} value={call.why} color={color} className="text-[14px] leading-relaxed text-[color:var(--ch-text-2)] mt-1" />
          : <p className="text-[14px] leading-relaxed text-[color:var(--ch-text-2)] mt-1">{call.why}</p>}
        {call.target && (
          <div
            className="mt-3 flex items-start gap-2.5 rounded-r-lg pl-3 pr-3.5 py-2 w-fit max-w-full"
            style={{ backgroundColor: 'var(--sr-tint, var(--ch-surface-2))', borderLeft: `3px solid ${ink(color)}` }}
          >
            <Crosshair className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ink(color) }} aria-hidden="true" />
            <p className="text-[13.5px] leading-snug min-w-0">
              <span className="block sm:inline text-[10.5px] font-bold uppercase tracking-[0.12em] sm:mr-2" style={{ color: ink(color) }}>Bench target</span>
              {path
                ? <Ed path={at('target')} value={call.target} color={color} className="font-semibold text-slate-900 dark:text-white" />
                : <span className="font-semibold text-slate-900 dark:text-white">{call.target}</span>}
            </p>
          </div>
        )}
      </div>
    </li>
  );
}

export default function AgentGamePlan({
  leagueId, opponentName, myTeamName, color, secondaryColor = null, roster, window: scoutWindow = 'season', notes = null, notesUpdatedAt = null,
}: {
  leagueId: string; opponentName: string; myTeamName: string; color: string; roster?: ScoutRosterResponse | null;
  /** The club's second colour, for the printed report. */
  secondaryColor?: string | null;
  /** The games the plan is built on: the whole season, or the last 5 or 3. */
  window?: ScoutWindow;
  /** The coach's notes on this opponent, for the printed report and the "rebuild to apply" prompt. */
  notes?: CoachNote[] | null;
  notesUpdatedAt?: string | null;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const polls = useRef(0);
  // Admin-only while the report is tested: a printable copy to save as a PDF.
  const { isRealAdmin } = useAuth();

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ leagueId, opponent: opponentName, forTeam: myTeamName || '' });
      if (scoutWindow !== 'season') qs.set('window', scoutWindow);
      const res = await fetch(`/api/scout-agent/report?${qs}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error(`report returned ${res.status}`);
      setData(await res.json());
    } catch (err) {
      console.error('Scouting agent report unavailable:', err);
    } finally {
      setLoading(false);
    }
  }, [leagueId, opponentName, myTeamName, scoutWindow]);

  useEffect(() => { setLoading(true); setRequesting(false); setRequestError(null); polls.current = 0; load(); }, [load]);

  // Poll while a build is running (a build takes a minute or two).
  const building = data?.report?.status === 'building' || data?.preview?.status === 'building' || requesting;
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => {
      polls.current += 1;
      if (polls.current > 40) { clearInterval(t); return; }
      load();
    }, 8000);
    return () => clearInterval(t);
  }, [building, load]);
  useEffect(() => {
    const s = data?.access === 'full' ? data?.report?.status : data?.preview?.status;
    if (s && s !== 'building') setRequesting(false);
  }, [data?.access, data?.report?.status, data?.preview?.status]);

  const build = async (force = false, kind: 'build' | 'preview' = 'build') => {
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await fetch(`/api/scout-agent/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ leagueId, opponent: opponentName, forTeam: myTeamName || null, force, window: scoutWindow }),
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

  // Saves one edit (or, with empty text, puts the AI's wording back) and shows the result straight away.
  const saveEdit = async (path: string, text: string) => {
    const res = await fetch('/api/scout-agent/edits', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ leagueId, opponent: opponentName, forTeam: myTeamName || null, window: scoutWindow, fields: { [path]: text } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `save returned ${res.status}`);
    setData((d) => (d?.report ? { ...d, report: { ...d.report, edits: json.edits ?? null } } : d));
  };

  if (loading) {
    return <div className="h-32 rounded-lg bg-gray-100 dark:bg-neutral-800 animate-pulse" aria-label="Loading game plan" />;
  }
  if (!data) return null;

  const full = data.access === 'full';
  const report = full ? data.report : data.preview;
  const aiPlan = report?.plan ?? null;
  // The coach's own wording over the AI's; the PDF prints this version too.
  const edits = full ? report?.edits ?? null : null;
  const plan = aiPlan && edits ? applyEdits(aiPlan, edits) : aiPlan;
  const editCount = Object.keys(edits?.fields ?? {}).length;
  const editApi: EditApi = {
    canEdit: full && data.canBuild && report?.status === 'ready' && !!aiPlan && !building,
    isEdited: (path) => !!edits?.fields?.[path],
    original: (path) => textAt(aiPlan, path),
    save: saveEdit,
  };
  // A rebuild writes a new plan, so wording edited on the old one does not carry over (notes do).
  const rebuild = () => {
    if (editCount > 0 && !window.confirm(`Rebuilding writes a new plan, so your ${editCount} edit${editCount === 1 ? '' : 's'} to the wording will not carry over. Your notes are kept and used. Rebuild?`)) return;
    build(true);
  };
  const teaser = report?.teaser ?? null;
  // Notes saved after the plan was built haven't reached it yet.
  const notesStale = full && !!notesUpdatedAt && !!report?.generatedAt && new Date(notesUpdatedAt).getTime() > new Date(report.generatedAt).getTime();

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 mb-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset ring-[color:var(--ch-border)]" style={fill(color)}>
          <Sparkles className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="ch-eyebrow leading-none">{full ? `For ${myTeamName || 'your team'}` : 'Scouting agent'}</p>
          <h3 className="text-[17px] md:text-[18px] font-semibold tracking-tight text-slate-900 dark:text-white mt-1">Game plan</h3>
        </div>
        {plan && <ConfidenceChip level={plan.confidence} />}
        {full && scoutWindow !== 'season' && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] px-2 py-1 rounded-full ring-1 ring-inset ring-[color:var(--ch-border)]" style={fill(color)}>
            {windowLabel(scoutWindow)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[color:var(--ch-muted)]">
        {report?.generatedAt && (
          <span className="tabular-nums">
            Built {timeAgo(report.generatedAt)}
            {report.gamesAnalysed ? ` · ${report.gamesAnalysed} games` : ''}
            {report.dataThrough ? ` through ${new Date(report.dataThrough).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
            {editCount > 0 ? ` · ${editCount} edited by you` : ''}
          </span>
        )}
        {isRealAdmin && full && plan && (
          <button
            onClick={() => {
              const ok = printScoutPlan(plan, {
                opponentName,
                forTeamName: myTeamName || null,
                gamesAnalysed: report?.gamesAnalysed ?? null,
                dataThrough: report?.dataThrough ?? null,
                generatedAt: report?.generatedAt ?? null,
                brandColor: color,
                secondaryColor,
                competitionName: roster?.leagueName ?? null,
                roster: roster ?? null,
                teaser: report?.teaser ?? null,
                windowLabel: scoutWindow === 'season' ? null : windowLabel(scoutWindow),
                coachNotes: notes ?? null,
              });
              if (!ok) setRequestError('Allow pop-ups for this site to download the report.');
            }}
            className="ch-btn ch-btn-ghost h-8 px-2.5 text-[12.5px]"
            title="Admin only: opens a printable copy. Choose Save as PDF in the print dialog."
          >
            <Download className="w-3.5 h-3.5" /> Download PDF
          </button>
        )}
        {full && data.canBuild && report?.status === 'ready' && !building && (
          <button onClick={rebuild} className="flex items-center gap-1 font-medium hover:text-slate-900 dark:hover:text-white">
            <RefreshCw className="w-3.5 h-3.5" /> Rebuild
          </button>
        )}
      </div>
    </div>
  );

  const locked = (
    <div className="relative min-h-[168px] rounded-xl border border-dashed border-[color:var(--ch-border-strong)] p-4">
      <div className="space-y-2 blur-sm select-none pointer-events-none" aria-hidden>
        <div className="h-3 w-3/4 bg-gray-200 dark:bg-neutral-700 rounded" />
        <div className="h-3 w-2/3 bg-gray-200 dark:bg-neutral-700 rounded" />
        <div className="h-3 w-5/6 bg-gray-200 dark:bg-neutral-700 rounded" />
        <div className="h-3 w-1/2 bg-gray-200 dark:bg-neutral-700 rounded" />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center gap-2 px-4">
        <Lock className="w-5 h-5 text-gray-500" />
        <p className="text-sm font-medium text-slate-800 dark:text-white">
          The full game plan (defensive and offensive keys, players to stop, lineup triggers and late-game calls, written for your team) is part of the coach plan.
        </p>
        <Link href="/contact-sales" className="text-sm font-semibold px-4 py-2 rounded-md" style={fill(color)}>
          Unlock full scouting reports
        </Link>
      </div>
    </div>
  );

  // ----- free look (non-paying visitors) -----
  if (!full) {
    const ready = report?.status === 'ready' && plan;
    return (
      <div className="ch-card p-5 md:p-7 space-y-5">
        {header}
        {ready ? (
          <>
            <div>
              <p className="ch-display text-[24px] md:text-[30px] font-semibold leading-[1.08] text-slate-900 dark:text-white">{plan!.headline}</p>
              <p className="mt-2.5 text-[15px] leading-relaxed text-[color:var(--ch-text-2)] max-w-[72ch]">{plan!.summary}</p>
            </div>
            <ol className="border-t-2 border-[color:var(--ch-text)]">
              {plan!.gamePlan.slice(0, 2).map((g, i) => <PlanCall key={i} n={i + 1} call={{ call: g.call, why: g.why }} color={color} />)}
            </ol>
          </>
        ) : building ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Reading {opponentName}'s recent games. This takes under a minute.
          </p>
        ) : report?.status === 'no_data' ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300">There aren't enough recorded games for {opponentName} yet.</p>
        ) : data.canPreview ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-neutral-300">Get a free AI read on {opponentName}: how they play and the two things that decide the game.</p>
            <button onClick={() => build(false, 'preview')} className="text-sm font-semibold px-4 py-2 rounded-md" style={fill(color)}>
              Get a free look
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-neutral-300">
            <Link href="/auth" className="font-semibold underline">Sign in</Link> to get a free AI read on {opponentName}.
          </p>
        )}
        {teaser && <KeyNumbers teaser={teaser} opponentName={opponentName} />}
        {requestError && <p className="text-sm text-red-600">{requestError}</p>}
        {locked}
      </div>
    );
  }

  // ----- coach: nothing built yet -----
  if (!report || (report.status !== 'ready' && !plan)) {
    const failed = report?.status === 'failed';
    const noData = report?.status === 'no_data';
    return (
      <div className="ch-card p-5 md:p-7">
        {header}
        {building ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" /> Analysing {opponentName}'s recent games, lineups and shot charts. This takes a minute or two.
          </p>
        ) : noData ? (
          <p className="text-sm text-gray-600 dark:text-neutral-300">There aren't enough recorded games for {opponentName} to build a game plan yet.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 dark:text-neutral-300">
              {failed
                ? 'The last build did not finish.'
                : scoutWindow === 'season'
                  ? 'No game plan for this matchup yet.'
                  : `No game plan on ${opponentName}'s ${windowLabel(scoutWindow)} yet.`}{' '}
              {scoutWindow === 'season'
                ? 'Plans for your fixtures are built automatically a few days out; you can also build one now.'
                : 'Build one to read their recent form on its own.'}
            </p>
            <button onClick={() => build(failed)} className="text-sm font-semibold px-4 py-2 rounded-md" style={fill(color)}>
              Build game plan
            </button>
          </div>
        )}
        {requestError && <p className="text-sm text-red-600 mt-2">{requestError}</p>}
      </div>
    );
  }

  if (!plan) return null;

  // The roster's photos and numbers, to put a face on "players to stop".
  const rosterByKey = new Map<string, RosterEntry>();
  for (const r of roster?.roster ?? []) rosterByKey.set(playerNameKey(r.name), r);

  // ----- full plan -----
  return (
    <EditProvider value={editApi}>
    <div className="space-y-4">
      <section className="ch-card overflow-hidden">
        <div className="flex h-1" aria-hidden="true">
          <span className="flex-[3]" style={{ backgroundColor: `var(--sr-brand, ${color})` }} />
          <span className="flex-1" style={{ backgroundColor: `var(--sr-accent, ${color})` }} />
        </div>
        <div className="p-5 md:p-7">
          {header}
          {notesStale && !building && (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 text-[13px] bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <span>You've added notes since this plan was built, so it doesn't reflect them yet.</span>
              <button onClick={rebuild} className="font-semibold underline underline-offset-2">Rebuild with my notes</button>
            </div>
          )}
          {!notesStale && !!report?.facts?.coachNotes && (
            <p className="mb-4 text-[12.5px] text-[color:var(--ch-muted)]">This plan takes your notes into account.</p>
          )}

          <div className="pl-4 md:pl-5" style={{ borderLeft: `3px solid ${ink(color)}` }}>
            <Ed as="p" path="headline" value={plan.headline} color={color} className="ch-display text-[26px] md:text-[34px] font-semibold leading-[1.06] text-slate-900 dark:text-white" />
            <Ed as="p" path="summary" value={plan.summary} color={color} className="mt-3 text-[15px] leading-relaxed text-[color:var(--ch-text-2)] max-w-[72ch]" />
          </div>

          {teaser && <div className="mt-7"><KeyNumbers teaser={teaser} opponentName={opponentName} /></div>}

          <div className="mt-7">
            <p className="ch-eyebrow mb-2">The calls</p>
            <ol className="border-t-2 border-[color:var(--ch-text)]">
              {plan.gamePlan.map((g, i) => <PlanCall key={i} n={i + 1} call={g} color={color} path={`gamePlan.${i}`} />)}
            </ol>
          </div>
          {plan.confidence !== 'high' && (
            <p className="text-[12.5px] text-[color:var(--ch-muted)] mt-5 pt-4 border-t border-[color:var(--ch-border)] flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-none" /> {plan.confidenceReason}
            </p>
          )}
        </div>
      </section>

      <Card icon={<Sparkles className="w-4 h-4" />} title={`How ${opponentName} play`} color={color}>
        <Ed as="p" path="howTheyPlay" value={plan.howTheyPlay} color={color} className="text-[15px] leading-relaxed text-[color:var(--ch-text-2)]" />
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card icon={<Shield className="w-4 h-4" />} title="Defending them" color={color}>
          <Ed as="p" path="defendingThem.summary" value={plan.defendingThem.summary} color={color} className="text-[14px] leading-relaxed text-[color:var(--ch-text-2)] mb-4" />
          <CallList calls={plan.defendingThem.keys} color={color} path="defendingThem.keys" />
        </Card>
        <Card icon={<Swords className="w-4 h-4" />} title="Attacking them" color={color}>
          <Ed as="p" path="attackingThem.summary" value={plan.attackingThem.summary} color={color} className="text-[14px] leading-relaxed text-[color:var(--ch-text-2)] mb-4" />
          <CallList calls={plan.attackingThem.keys} color={color} path="attackingThem.keys" />
        </Card>
      </div>

      <Card icon={<Target className="w-4 h-4" />} title="Players to stop" color={color}>
        <div className="grid md:grid-cols-2 gap-3">
          {plan.playersToStop.map((p, pi) => {
            const r = rosterByKey.get(playerNameKey(p.name));
            return (
              <article key={p.name} className="ch-tile p-4 min-w-0">
                <header className="flex items-center gap-3 pb-3 mb-3 border-b border-[color:var(--ch-border)]">
                  <Avatar photo={r?.photo} shirt={r?.shirt ?? null} name={p.name} color={color} size={52} />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold tracking-tight leading-snug text-slate-900 dark:text-white">{p.name}</p>
                    {r && <p className="text-[12.5px] text-[color:var(--ch-text-2)] tabular-nums">{r.pts} pts · {r.reb} reb · {r.ast} ast · {r.mpg} min</p>}
                  </div>
                </header>
                <dl className="grid grid-cols-[50px_1fr] gap-x-2 gap-y-2.5 text-[13.5px] leading-relaxed">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--ch-muted)] pt-[3px]">Threat</dt>
                  <Ed as="dd" path={`playersToStop.${pi}.threat`} value={p.threat} color={color} className="text-[color:var(--ch-text-2)]" />
                  <dt className="text-[10px] font-bold uppercase tracking-[0.12em] pt-[3px]" style={{ color: ink(color) }}>Plan</dt>
                  <Ed as="dd" path={`playersToStop.${pi}.plan`} value={p.plan} color={color} className="font-medium text-slate-900 dark:text-white" />
                </dl>
              </article>
            );
          })}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card icon={<Users className="w-4 h-4" />} title="Lineups and rotation" color={color}>
          <Ed as="p" path="lineupsAndRotation.summary" value={plan.lineupsAndRotation.summary} color={color} className="text-[14px] leading-relaxed text-[color:var(--ch-text-2)]" />
          {plan.lineupsAndRotation.watchFor.length > 0 && (
            <>
              <p className="ch-eyebrow mt-4 mb-1">Watch for</p>
              <ul className="border-t border-[color:var(--ch-border)]">
                {plan.lineupsAndRotation.watchFor.map((w, i) => (
                  <li key={i} className="flex gap-2 py-2.5 border-b border-[color:var(--ch-border)] last:border-b-0 last:pb-0 text-[14px] leading-relaxed text-slate-800 dark:text-neutral-200">
                    <ChevronRight className="w-4 h-4 mt-[3px] shrink-0" style={{ color: ink(color) }} aria-hidden="true" />
                    <Ed path={`lineupsAndRotation.watchFor.${i}`} value={w} color={color} className="min-w-0 flex-1" />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card icon={<Timer className="w-4 h-4" />} title="Late game" color={color}>
          <Ed as="p" path="lateGame" value={plan.lateGame} color={color} className="block text-[14px] leading-relaxed text-slate-800 dark:text-neutral-200 rounded-lg p-4" style={{ backgroundColor: 'var(--sr-tint, var(--ch-surface-2))' }} />
        </Card>
      </div>
    </div>
    </EditProvider>
  );
}
