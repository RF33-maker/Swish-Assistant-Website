import { createContext, useContext, useState, type CSSProperties, type ElementType } from 'react';
import { Pencil } from 'lucide-react';
import { EDIT_MAX } from '@shared/coachNotes';

/**
 * Lets a coach change the wording of the AI's plan in place: a target that is
 * too ambitious, a call phrased the way their staff would say it. The edited
 * text is shown on screen and in the PDF, and the AI's original can be put back
 * from the same box. Edits belong to the plan they were made on (see
 * server/scoutAgentRoutes.ts), so a rebuilt plan starts clean.
 */

export interface EditApi {
  canEdit: boolean;
  isEdited: (path: string) => boolean;
  /** What the AI wrote at this path. */
  original: (path: string) => string;
  /** Empty text puts the AI's wording back. */
  save: (path: string, text: string) => Promise<void>;
}

const EditContext = createContext<EditApi | null>(null);
export const EditProvider = EditContext.Provider;

export function Ed({
  path, value, className, style, as: Tag = 'span', color,
}: { path: string; value: string; className?: string; style?: CSSProperties; as?: ElementType; color?: string }) {
  const api = useContext(EditContext);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!api?.canEdit) return <Tag className={className} style={style}>{value}</Tag>;
  const edited = api.isEdited(path);

  const commit = async (next: string) => {
    setSaving(true);
    setFailed(null);
    try {
      await api.save(path, next);
      setEditing(false);
    } catch (err: any) {
      setFailed(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span className="block w-full min-w-[min(100%,300px)] rounded-lg bg-[color:var(--ch-surface-2)] p-2.5 my-1 font-normal not-italic">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, EDIT_MAX))}
          rows={Math.min(8, Math.max(2, Math.ceil(text.length / 70)))}
          autoFocus
          aria-label="Edit this text"
          className="w-full rounded-md border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] px-2.5 py-2 text-[14px] leading-snug text-slate-900 dark:text-white"
        />
        <span className="flex flex-wrap items-center gap-2 mt-2">
          <button
            type="button"
            disabled={saving || !text.trim() || text.trim() === value}
            onClick={() => commit(text)}
            className="text-[13px] font-semibold px-3 py-1.5 rounded-md disabled:opacity-40"
            style={{ backgroundColor: `var(--sr-brand, ${color || '#0b3c78'})`, color: 'var(--sr-on, #fff)' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => { setEditing(false); setFailed(null); }} className="text-[13px] font-medium text-[color:var(--ch-text-2)] px-2 py-1.5">Cancel</button>
          {edited && (
            <button type="button" disabled={saving} onClick={() => commit('')} className="text-[13px] font-medium text-[color:var(--ch-loss)] px-2 py-1.5 ml-auto" title={api.original(path)}>
              Put the AI's wording back
            </button>
          )}
        </span>
        {failed && <span className="block text-[12.5px] text-[color:var(--ch-loss)] mt-1.5">{failed}</span>}
      </span>
    );
  }

  return (
    <Tag className={`${className ?? ''} group/ed`} style={style}>
      {value}
      <button
        type="button"
        onClick={() => { setText(value); setEditing(true); }}
        aria-label="Edit this text"
        title={edited ? 'Edited by you. Click to change it or put the AI wording back.' : 'Edit this text'}
        className="inline-flex align-middle ml-1.5 p-0.5 rounded text-[color:var(--ch-muted)] opacity-40 hover:opacity-100 focus-visible:opacity-100 group-hover/ed:opacity-90 transition-opacity print:hidden"
      >
        <Pencil className="w-3 h-3" />
      </button>
      {edited && <span className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-muted)]">Edited</span>}
    </Tag>
  );
}
