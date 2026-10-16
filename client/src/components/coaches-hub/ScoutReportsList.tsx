import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, ClipboardList, Download, RefreshCw, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { downloadScout, shareScout, type ExportablePlan } from '@/lib/scoutPlanExport';

/**
 * Every scout generated for this competition that the signed-in user can open:
 * the game plans built for their team (automatically ahead of fixtures, or on
 * demand) and the free looks they asked for. Each row opens the full report,
 * downloads as a PDF, or shares.
 */

interface ScoutRow {
  id: string | null;
  tier: 'full' | 'preview';
  status: 'ready' | 'building';
  opponentName: string;
  forTeamName: string | null;
  matchTime: string | null;
  generatedAt: string | null;
  updatedAt: string | null;
  plan: (ExportablePlan & { headline?: string }) | null;
}

interface Props {
  leagueId: string;
  brandColor: string;
  onOpen: (opponentName: string, forTeamName: string | null) => void;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function formatDay(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
}

export default function ScoutReportsList({ leagueId, brandColor, onOpen }: Props) {
  const [rows, setRows] = useState<ScoutRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const polls = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/scout-agent/list?${new URLSearchParams({ leagueId })}`, { headers: await authHeaders() });
      if (res.status === 401) { setRows([]); setError('Sign in to see your scouting reports.'); return; }
      if (!res.ok) throw new Error(`list returned ${res.status}`);
      const json = await res.json();
      setRows(json.reports ?? []);
      setError(null);
    } catch (err) {
      console.error('Scouting reports unavailable:', err);
      setError('Could not load your scouting reports.');
      setRows((prev) => prev ?? []);
    }
  }, [leagueId]);

  useEffect(() => { setRows(null); polls.current = 0; load(); }, [load]);

  // A build takes a minute or two; keep the list moving while one is running.
  const building = !!rows?.some((r) => r.status === 'building');
  useEffect(() => {
    if (!building) return;
    const t = setInterval(() => {
      polls.current += 1;
      if (polls.current > 40) { clearInterval(t); return; }
      load();
    }, 8000);
    return () => clearInterval(t);
  }, [building, load]);

  const asExportable = (r: ScoutRow) => r.plan && ({
    opponentName: r.opponentName,
    forTeamName: r.tier === 'full' ? r.forTeamName : null,
    matchTime: r.matchTime,
    generatedAt: r.generatedAt,
    plan: r.plan,
  });

  const download = async (r: ScoutRow) => {
    const doc = asExportable(r);
    if (!doc) return;
    const result = await downloadScout(doc);
    if (result === 'failed') setNotice('Could not create this PDF. Try again.');
    else return;
    setTimeout(() => setNotice(null), 3000);
  };

  const share = async (r: ScoutRow) => {
    const doc = asExportable(r);
    if (!doc) return;
    const result = await shareScout(doc);
    if (result === 'copied') setNotice('Copied the scout to your clipboard.');
    else if (result === 'failed') setNotice('Could not share this scout.');
    else return;
    setTimeout(() => setNotice(null), 3000);
  };

  if (rows === null) {
    return <div className="p-5 md:p-6"><div className="h-24 rounded-lg bg-gray-100 dark:bg-neutral-800 animate-pulse" aria-label="Loading scouting reports" /></div>;
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 md:p-12 text-center">
        <ClipboardList className="w-8 h-8 mx-auto mb-3 text-[color:var(--ch-muted)]" />
        <p className="text-sm font-semibold text-[color:var(--ch-text)]">{error ?? 'No scouting reports yet'}</p>
        {!error && (
          <p className="text-sm text-[color:var(--ch-text-2)] mt-1 max-w-md mx-auto">
            Open your next opponent from the Overview and generate a scout. It will be saved here, ready to open, download and share.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      {notice && <p className="px-5 md:px-6 pt-3 text-xs text-[color:var(--ch-text-2)]" role="status">{notice}</p>}
      <ul className="divide-y divide-[color:var(--ch-border)]">
        {rows.map((r) => {
          const ready = r.status === 'ready' && !!r.plan;
          const day = formatDay(r.matchTime) || formatDay(r.generatedAt);
          return (
            <li key={r.id ?? `${r.opponentName}-${r.forTeamName}`} className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-3">
              <button
                onClick={() => ready && onOpen(r.opponentName, r.tier === 'full' ? r.forTeamName : null)}
                disabled={!ready}
                className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-md px-2 py-1 hover:bg-[color:var(--ch-hover,rgba(0,0,0,0.04))] disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: brandColor }}>
                  {ready ? <ClipboardList className="w-4 h-4" /> : <RefreshCw className="w-4 h-4 animate-spin" />}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-[color:var(--ch-text)] truncate">
                      {r.tier === 'full' && r.forTeamName ? `${r.forTeamName} vs ${r.opponentName}` : r.opponentName}
                    </span>
                    <span className="text-[10.5px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300">
                      {r.tier === 'full' ? 'Game plan' : 'Free look'}
                    </span>
                  </span>
                  <span className="block text-[12.5px] text-[color:var(--ch-text-2)] truncate">
                    {ready ? (r.plan?.headline || 'Scouting report') : 'Building. This takes a minute or two.'}
                  </span>
                  {day && <span className="block text-[11.5px] text-[color:var(--ch-muted)]">{r.matchTime ? `Game ${day}` : `Built ${day}`}</span>}
                </span>
                {ready && <ChevronRight className="w-4 h-4 ml-auto shrink-0 text-[color:var(--ch-muted)]" />}
              </button>
              {ready && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => download(r)}
                    className="ch-btn ch-btn-ghost h-8 w-8 p-0 justify-center"
                    aria-label={`Download ${r.opponentName} scout as PDF`}
                    title="Download PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => share(r)}
                    className="ch-btn ch-btn-ghost h-8 w-8 p-0 justify-center"
                    aria-label={`Share ${r.opponentName} scout`}
                    title="Share"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
