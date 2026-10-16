import { useEffect, useRef, useState } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createPlaybook, pbBlankPlaybook, type PlaybookHandle, type PlaybookSaveError } from '@/lib/playbook/engine';
import '@/lib/playbook/playbook.css';

/**
 * Playbook tab: draw plays on a half court, step through them, and watch them
 * run. The drawing, editing and animation live in a framework-free engine
 * (lib/playbook/engine.js, shared with the standalone playbook page); this
 * component loads the playbook from /api/playbook, mounts the engine, and saves
 * back. A coach's playbook is shared by every coach on their team.
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

type LoadState = { kind: 'loading' } | { kind: 'ready' } | { kind: 'signedOut' } | { kind: 'error'; message: string };

export default function Playbook({ teamName }: { teamName?: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<PlaybookHandle | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ kind: 'loading' });
    (async () => {
      try {
        const headers = await authHeaders();
        if (!headers.Authorization) return setLoad({ kind: 'signedOut' });
        const res = await fetch('/api/playbook', { headers });
        if (res.status === 401) return setLoad({ kind: 'signedOut' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `The playbook didn't load (${res.status}).`);
        if (cancelled || !host.current) return;

        // The version this copy was built on; the server refuses a save over a newer one.
        let base: string | null = json.updatedAt ?? null;
        engine.current = createPlaybook(host.current, {
          initial: json.playbook ?? pbBlankPlaybook(teamName ? `${teamName} Playbook` : 'Team Playbook'),
          barMode: 'sticky',
          draftKey: `swish-playbook:${json.ownerKey}`,
          idleStatus: json.shared ? "Shared with your team's coaches. Tap Edit to change a play." : 'Tap Edit to change a play.',
          download: downloadFile,
          save: async (data) => {
            const r = await fetch('/api/playbook', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
              body: JSON.stringify({ data, baseUpdatedAt: base }),
            });
            const j = await r.json().catch(() => ({}));
            if (r.status === 409) throw { code: 'conflict', message: j.error } satisfies PlaybookSaveError;
            if (r.status === 401 || r.status === 403) throw { code: 'readonly', message: j.error || 'Sign in again to save.' } satisfies PlaybookSaveError;
            if (!r.ok) throw { message: j.error || "Couldn't save. Check your connection and tap Save again." } satisfies PlaybookSaveError;
            base = j.updatedAt;
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
  }, [teamName, attempt]);

  // Leaving the page with unsaved plays: let the browser ask first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (engine.current?.isDirty()) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

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
      <div ref={host} hidden={load.kind !== 'ready'} />
    </div>
  );
}
