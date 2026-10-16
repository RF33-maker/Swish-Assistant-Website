import { useEffect, useRef, useState } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { shiftSeason } from '@shared/season';
import { printPlaybook } from '@/lib/printPlaybook';
import { getTeamLogoCached } from '@/utils/teamLogoCache';
import { createPlaybook, pbBlankPlaybook, type PlaybookHandle, type PlaybookSaveError } from '@/lib/playbook/engine';
import '@/lib/playbook/playbook.css';

/**
 * Playbook tab: draw plays on a half court, step through them, and watch them
 * run. The drawing, editing and animation live in a framework-free engine
 * (lib/playbook/engine.js, shared with the standalone playbook page); this
 * component loads the playbook from /api/playbook, mounts the engine, and saves
 * back. A coach's playbook is shared by every coach on their team, and there is
 * one per season: the picker switches between them, and a season with nothing
 * saved can start from a copy of an earlier one.
 */

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function downloadFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type SeasonRow = { season: string; title: string; updatedAt: string };
type SeasonInfo = { season: string; currentSeason: string; seasons: SeasonRow[]; saved: boolean };

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'signedOut' } | { kind: 'error'; message: string };

export default function Playbook({ teamName, leagueId = null, brandColor = null, secondaryColor = null }: {
  teamName?: string | null;
  /** The competition the hub is showing, to find the club's crest for the PDF. */
  leagueId?: string | null;
  /** The club's own colours for the PDF (the hub's accent is adjusted for the screen). */
  brandColor?: string | null;
  secondaryColor?: string | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<PlaybookHandle | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // The season to open; null lets the server pick the current one.
  const [wanted, setWanted] = useState<string | null>(null);
  const [info, setInfo] = useState<SeasonInfo | null>(null);
  const [copyFrom, setCopyFrom] = useState('');
  const [copyState, setCopyState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const [pdfError, setPdfError] = useState<string | null>(null);
  // The club's crest as the hub shows it (the team logos table, then storage), fetched ahead so the PDF button can use it without waiting.
  const [crestUrl, setCrestUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setCrestUrl(null);
    if (leagueId && teamName) {
      getTeamLogoCached({ leagueId, teamName }).catch(() => null).then((url) => { if (!cancelled) setCrestUrl(url); });
    }
    return () => { cancelled = true; };
  }, [leagueId, teamName]);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    (async () => {
      try {
        const headers = await authHeaders();
        if (!headers.Authorization) return setLoad({ kind: 'signedOut' });
        const res = await fetch(`/api/playbook${wanted ? `?season=${encodeURIComponent(wanted)}` : ''}`, { headers });
        if (res.status === 401) return setLoad({ kind: 'signedOut' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `The playbook didn't load (${res.status}).`);
        if (cancelled || !host.current) return;

        // The version this copy was built on; the server refuses a save over a newer one.
        let base: string | null = json.updatedAt ?? null;
        const season: string = json.season;
        setInfo({ season, currentSeason: json.currentSeason, seasons: json.seasons ?? [], saved: !!json.playbook });
        setCopyFrom((json.seasons ?? []).find((r: SeasonRow) => r.season !== season)?.season ?? '');
        setCopyState({ busy: false });
        engine.current = createPlaybook(host.current, {
          initial: json.playbook ?? pbBlankPlaybook(teamName ? `${teamName} Playbook` : 'Team Playbook'),
          barMode: 'sticky',
          draftKey: `swish-playbook:${json.ownerKey}:${season}`,
          idleStatus: json.shared ? "Shared with your team's coaches. Tap Edit to change a play." : 'Tap Edit to change a play.',
          download: downloadFile,
          save: async (data) => {
            const r = await fetch('/api/playbook', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
              body: JSON.stringify({ data, baseUpdatedAt: base, season }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.status === 409) throw { code: 'conflict', message: j.error } satisfies PlaybookSaveError;
            if (r.status === 401 || r.status === 403) throw { code: 'readonly', message: j.error || 'Sign in again to save.' } satisfies PlaybookSaveError;
            if (!r.ok) throw { message: j.error || "Couldn't save. Check your connection and tap Save again." } satisfies PlaybookSaveError;
            base = j.updatedAt;
            setInfo((prev) => prev && prev.season === season ? {
              ...prev,
              saved: true,
              seasons: prev.seasons.some((r) => r.season === season)
                ? prev.seasons.map((r) => r.season === season ? { ...r, title: data.title, updatedAt: j.updatedAt } : r)
                : [{ season, title: data.title, updatedAt: j.updatedAt }, ...prev.seasons],
            } : prev);
          },
        });
        setLoad({ kind: 'ready' });
      } catch (err) {
        if (!cancelled) setLoad({ kind: 'error', message: err instanceof Error ? err.message : "The playbook didn't load." });
      }
    })();
    return () => {
      cancelled = true;
      engine.current?.destroy();
      engine.current = null;
    };
  }, [teamName, attempt, wanted]);

  // Leaving the page with unsaved plays: let the browser ask first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (engine.current?.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  // Print the playbook as it is on screen (unsaved edits included) as a PDF.
  function downloadPdf() {
    const state = engine.current?.getState();
    if (!state) return;
    const accent = host.current ? getComputedStyle(host.current).getPropertyValue('--ch-accent').trim() : '';
    const opened = printPlaybook(state, {
      teamName,
      season: info?.season ?? null,
      brandColor: brandColor || accent,
      secondaryColor,
      crestUrl,
    });
    setPdfError(opened ? null : 'Your browser blocked the PDF window. Allow pop-ups for this site and try again.');
  }

  function switchSeason(next: string) {
    if (!info || next === info.season) return;
    if (engine.current?.isDirty() && !window.confirm('You have unsaved changes in this playbook. Switch season and lose them?')) return;
    setWanted(next);
  }

  // Start this season from an earlier one: copy its plays across and reopen.
  async function copySeason() {
    if (!info || !copyFrom) return;
    setCopyState({ busy: true });
    try {
      const headers = await authHeaders();
      const src = await fetch(`/api/playbook?season=${encodeURIComponent(copyFrom)}`, { headers });
      const srcJson = await src.json().catch(() => ({}));
      if (!src.ok || !srcJson.playbook) throw new Error(srcJson.error || `Couldn't read the ${copyFrom} playbook.`);
      const put = await fetch('/api/playbook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ data: srcJson.playbook, baseUpdatedAt: null, season: info.season }),
      });
      const putJson = await put.json().catch(() => ({}));
      if (!put.ok) throw new Error(putJson.error || "Couldn't copy the plays across. Try again.");
      setAttempt((n) => n + 1);
    } catch (err) {
      setCopyState({ busy: false, error: err instanceof Error ? err.message : "Couldn't copy the plays across." });
    }
  }

  const seasonOptions = info
    ? Array.from(new Set([...info.seasons.map((r) => r.season), info.currentSeason, shiftSeason(info.currentSeason, 1)])).sort().reverse()
    : [];
  const earlier = info ? info.seasons.filter((r) => r.season !== info.season) : [];

  return (
    <div className="pb-host">
      {load.kind === 'loading' && (
        <div className="ch-card p-8 text-center text-[13px] text-[color:var(--ch-text-2)]">Opening your playbook…</div>
      )}
      {load.kind === 'signedOut' && (
        <div className="ch-card p-8 text-center">
          <Lock className="w-5 h-5 mx-auto mb-3 text-[color:var(--ch-text-2)]" />
          <p className="text-sm text-[color:var(--ch-text-2)]">Sign in to open your team's playbook.</p>
        </div>
      )}
      {load.kind === 'error' && (
        <div className="ch-card p-8 text-center">
          <AlertTriangle className="w-5 h-5 mx-auto mb-3 text-[color:var(--ch-loss)]" />
          <p className="text-sm text-[color:var(--ch-text)] mb-4">{load.message}</p>
          <button type="button" className="ch-btn ch-btn-primary h-9 px-4" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      )}
      {load.kind === 'ready' && info && (
        <div className="ch-card p-3 mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <label htmlFor="pb-season" className="ch-eyebrow">Season</label>
          <select
            id="pb-season"
            className="ch-input h-9 px-3 text-[13px]"
            value={info.season}
            onChange={(e) => switchSeason(e.target.value)}
          >
            {seasonOptions.map((s) => (
              <option key={s} value={s}>
                {s}{s === info.currentSeason ? ' (current)' : ''}{info.seasons.some((r) => r.season === s) ? '' : ' · not started'}
              </option>
            ))}
          </select>
          {!info.saved && earlier.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-[color:var(--ch-text-2)]">
              <span>Nothing saved for {info.season} yet.</span>
              <select className="ch-input h-9 px-3 text-[13px]" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} aria-label="Season to copy from">
                {earlier.map((r) => <option key={r.season} value={r.season}>{r.season}</option>)}
              </select>
              <button type="button" className="ch-btn ch-btn-primary h-9 px-4" disabled={copyState.busy || !copyFrom} onClick={copySeason}>
                {copyState.busy ? 'Copying…' : 'Copy these plays'}
              </button>
            </div>
          )}
          <button type="button" className="ch-btn h-9 px-4 ml-auto" onClick={downloadPdf}>Download PDF</button>
          {copyState.error && <p className="w-full text-[13px] text-[color:var(--ch-loss)]">{copyState.error}</p>}
          {pdfError && <p className="w-full text-[13px] text-[color:var(--ch-loss)]">{pdfError}</p>}
        </div>
      )}
      <div ref={host} hidden={load.kind !== 'ready'} />
    </div>
  );
}
