import { useEffect, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { createPlaybook, type PlaybookData, type PlaybookHandle } from '@/lib/playbook/engine';
import { playbookPdf, type PrintablePlaybookMeta } from '@/lib/printPlaybook';
import { usePdfDownload } from '@/hooks/usePdfDownload';
import '@/lib/playbook/playbook.css';

/**
 * Read-only playbook for sharing with a team by link: /playbook/share/<code>.
 *
 * The plays ship with the page (lib/playbook/shared/*.json), so opening the
 * link needs no sign-in and never touches /api/playbook; the engine starts
 * view-only, with no edit bar, save or import. The code in the URL is the only
 * gate and the page is marked noindex, so treat the link as unlisted, not secret.
 * To share another playbook, add its JSON next to this one and list it here,
 * with the club's name, crest and colours for the PDF (the page has no sign-in,
 * so nothing is looked up: the crest is the club's teams.logo_url and the colour
 * the one the hub reads from that crest).
 */
type SharedPlaybook = {
  load: () => Promise<{ default: unknown }>;
  club: Pick<PrintablePlaybookMeta, 'teamName' | 'season' | 'brandColor' | 'secondaryColor' | 'crestUrl'>;
};
const SHARED: Record<string, SharedPlaybook> = {
  N7bHfZoSy2SF: {
    load: () => import('@/lib/playbook/shared/stagger-horns.json'),
    club: {
      teamName: 'Gloucester City Kings',
      season: '2026/27',
      brandColor: '#53d4c0',
      secondaryColor: null,
      crestUrl: 'https://omkwqpcgttrgvbhcxgqf.supabase.co/storage/v1/object/public/team-logos/7c9e58f4-1428-4839-a3fe-e37fab773893_Gloucester_City_Kings_Senior_Men.png',
    },
  },
};

type State = { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' };

export default function PlaybookSharePage() {
  const [, params] = useRoute('/playbook/share/:code');
  const code = params?.code ?? '';
  const host = useRef<HTMLDivElement>(null);
  const shared = useRef<PlaybookData | null>(null);
  const pdf = usePdfDownload();
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
    const entry = Object.prototype.hasOwnProperty.call(SHARED, code) ? SHARED[code] : null;
    if (!entry) {
      setState({ kind: 'missing' });
      return;
    }
    setState({ kind: 'loading' });
    entry.load().then((mod) => {
      if (cancelled || !host.current) return;
      const data = mod.default as PlaybookData;
      shared.current = data;
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
          <div className="py-8 text-center text-[13px] text-[color:var(--ch-text-2)]">Opening the playbook…</div>
        )}
        {state.kind === 'missing' && (
          <div className="py-8 text-center">
            <p className="text-sm text-[color:var(--ch-text)]">This playbook link isn't valid. Ask your coach for a fresh one.</p>
          </div>
        )}
        {state.kind === 'ready' && (
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              type="button"
              className="ch-btn ch-btn-primary h-9 px-4 disabled:opacity-70"
              disabled={pdf.busy}
              aria-live="polite"
              onClick={() => { const data = shared.current; if (data) pdf.start((onProgress) => playbookPdf(data, SHARED[code]?.club, onProgress)); }}
            >
              {pdf.label}
            </button>
            {pdf.message && <p className={`text-[13px] ${pdf.state === 'error' ? 'text-[color:var(--ch-loss)]' : 'text-[color:var(--ch-text-2)]'}`} role="status">{pdf.message}</p>}
          </div>
        )}
        <div ref={host} hidden={state.kind !== 'ready'} />
      </div>
    </div>
  );
}
