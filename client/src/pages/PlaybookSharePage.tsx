import { useEffect, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { createPlaybook, type PlaybookData, type PlaybookHandle } from '@/lib/playbook/engine';
import '@/lib/playbook/playbook.css';

/**
 * Read-only playbook for sharing with a team by link: /playbook/share/<code>.
 *
 * The plays ship with the page (lib/playbook/shared/*.json), so opening the
 * link needs no sign-in and never touches /api/playbook; the engine starts
 * view-only, with no edit bar, save or import. The code in the URL is the only
 * gate and the page is marked noindex, so treat the link as unlisted, not secret.
 * To share another playbook, add its JSON next to this one and list it here.
 */
const SHARED: Record<string, () => Promise<{ default: unknown }>> = {
  N7bHfZoSy2SF: () => import('@/lib/playbook/shared/stagger-horns.json'),
};

type State = { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' };

export default function PlaybookSharePage() {
  const [, params] = useRoute('/playbook/share/:code');
  const code = params?.code ?? '';
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let engine: PlaybookHandle | null = null;
    const load = Object.prototype.hasOwnProperty.call(SHARED, code) ? SHARED[code] : null;
    if (!load) {
      setState({ kind: 'missing' });
      return;
    }
    setState({ kind: 'loading' });
    load().then((mod) => {
      if (cancelled || !host.current) return;
      const data = mod.default as PlaybookData;
      document.title = `${data.title} | Swish Assistant`;
      engine = createPlaybook(host.current, { initial: data, editable: false, barMode: 'sticky' });
      setState({ kind: 'ready' });
    });
    return () => {
      cancelled = true;
      engine?.destroy();
    };
  }, [code]);

  return (
    <div className="coach-hub sa-pro min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-host">
        {state.kind === 'loading' && (
          <div className="ch-card p-8 text-center text-[13px] text-[color:var(--ch-text-2)]">Opening the playbook…</div>
        )}
        {state.kind === 'missing' && (
          <div className="ch-card p-8 text-center">
            <p className="text-sm text-[color:var(--ch-text)]">This playbook link isn't valid. Ask your coach for a fresh one.</p>
          </div>
        )}
        <div ref={host} hidden={state.kind !== 'ready'} />
      </div>
    </div>
  );
}
