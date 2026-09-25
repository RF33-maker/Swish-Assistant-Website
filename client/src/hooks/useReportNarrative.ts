import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ReportNarrative {
  headline: string;
  overview: string;
  sections: Array<{ key: string; body: string }>;
  takeaways: string[];
}

type Status = 'idle' | 'loading' | 'ready' | 'unavailable';

/**
 * Fetches the written analysis that sits on top of a report's numbers.
 *
 * The report renders fully without this. Nothing here throws and nothing
 * blocks: if the model is not configured, the request fails, or it is simply
 * slow, the hook settles on 'unavailable' and the caller shows the numbers
 * alone. `enabled` lets a report wait until its own data has loaded, so the
 * facts sent are complete.
 */
export function useReportNarrative(
  kind: 'match' | 'scout',
  facts: unknown,
  sectionKeys: string[],
  enabled: boolean
) {
  const [narrative, setNarrative] = useState<ReportNarrative | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  // Facts are rebuilt on every render by the caller's memos, so key the effect
  // on their serialized form rather than identity to avoid a request loop.
  const factsKey = enabled ? JSON.stringify(facts) : '';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setStatus('loading');

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/reports/narrative', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ kind, facts, sectionKeys }),
        });
        if (!res.ok) throw new Error(`narrative returned ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.narrative) {
          setNarrative(json.narrative as ReportNarrative);
          setStatus('ready');
        } else {
          setStatus('unavailable');
        }
      } catch (err) {
        console.error('Report narrative unavailable:', err);
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, factsKey, enabled]);

  const bodyFor = (key: string) => narrative?.sections.find((s) => s.key === key)?.body;

  return { narrative, status, bodyFor };
}
