import { useEffect, useState } from 'react';
import { MessageSquareText, Pencil, Plus, Lock } from 'lucide-react';
import { NOTE_KINDS, NOTE_MAX, noteKindLabel, type CoachNote, type NoteKind } from '@shared/coachNotes';
import type { useCoachNotes } from '@/hooks/useCoachNotes';
import { useAuth } from '@/hooks/use-auth';

/**
 * A coach's own context on the opponent: what the numbers can't know. Shown
 * only to the coach (or an admin previewing their team); the scouting agent
 * reads these notes the next time it builds that coach's plan and says where a
 * call rests on one.
 */

export type CoachNotesApi = ReturnType<typeof useCoachNotes>;

const toneOf = (kind: NoteKind | null) =>
  kind === 'stronger' ? 'var(--ch-win)' : kind === 'weaker' || kind === 'out' ? 'var(--ch-loss)' : 'var(--ch-muted)';

function Editor({
  api, scope, playerName, aspect, existing, color, onDone,
}: {
  api: CoachNotesApi; scope: 'team' | 'player' | 'aspect'; playerName?: string;
  /** For scope "aspect": the strength or weakness this note is about. */
  aspect?: { key: string; label: string };
  existing: CoachNote | null; color: string; onDone: () => void;
}) {
  const [text, setText] = useState(existing?.note ?? '');
  const [kind, setKind] = useState<NoteKind>(existing?.kind ?? 'stronger');
  const [failed, setFailed] = useState<string | null>(null);

  const submit = async (note: string) => {
    setFailed(null);
    try {
      await api.save({ scope, playerName: playerName ?? null, aspect: aspect?.key ?? null, aspectLabel: aspect?.label ?? null, kind: scope === 'player' ? kind : null, note });
      onDone();
    } catch (err: any) {
      setFailed(err?.message || 'Could not save the note');
    }
  };

  return (
    <div className="space-y-2.5">
      {scope === 'player' && (
        <div role="radiogroup" aria-label="What kind of note" className="flex flex-wrap gap-1.5">
          {NOTE_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              onClick={() => setKind(k.key)}
              title={k.hint}
              className={`text-[12px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                kind === k.key ? 'border-transparent' : 'border-[color:var(--ch-border)] text-[color:var(--ch-text-2)] hover:bg-[color:var(--ch-surface-2)]'
              }`}
              style={kind === k.key ? { backgroundColor: `var(--sr-brand, ${color})`, color: 'var(--sr-on, #fff)' } : undefined}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, NOTE_MAX))}
        rows={3}
        autoFocus
        aria-label={scope === 'team' ? 'Note about the team' : scope === 'aspect' ? `Context on ${playerName}'s ${aspect?.label}` : `Note about ${playerName}`}
        placeholder={
          scope === 'team'
            ? 'e.g. Their point guard is out for the month, so the second unit now starts the fourth quarter.'
            : scope === 'aspect'
              ? `Context on ${aspect?.label?.toLowerCase()}, e.g. normally shoots 40%, this is a cold start.`
              : NOTE_KINDS.find((k) => k.key === kind)?.hint ?? 'What should the plan know?'
        }
        className="w-full rounded-lg border border-[color:var(--ch-border)] bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-white"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={api.saving || !text.trim()}
          onClick={() => submit(text)}
          className="text-[13px] font-semibold px-3.5 py-1.5 rounded-md disabled:opacity-40"
          style={{ backgroundColor: `var(--sr-brand, ${color})`, color: 'var(--sr-on, #fff)' }}
        >
          {api.saving ? 'Saving…' : 'Save note'}
        </button>
        <button type="button" onClick={onDone} className="text-[13px] font-medium text-[color:var(--ch-text-2)] px-2 py-1.5">Cancel</button>
        {existing && (
          <button type="button" disabled={api.saving} onClick={() => submit('')} className="text-[13px] font-medium text-[color:var(--ch-loss)] px-2 py-1.5 ml-auto">
            Remove
          </button>
        )}
        <span className="text-[11.5px] text-[color:var(--ch-muted)] tabular-nums ml-auto">{text.length}/{NOTE_MAX}</span>
      </div>
      {failed && <p className="text-[13px] text-[color:var(--ch-loss)]">{failed}</p>}
    </div>
  );
}

function NoteBody({ note }: { note: CoachNote }) {
  const tone = toneOf(note.kind);
  return (
    <div className="text-[13px] leading-snug">
      {note.scope === 'player' && (
        <span className="inline-block text-[11px] font-semibold uppercase tracking-wide mr-1.5" style={{ color: tone }}>{noteKindLabel(note.kind)}</span>
      )}
      <span className="text-slate-900 dark:text-white">{note.note}</span>
    </div>
  );
}

/** A note on one player: shows it, or offers to add one. Used on each profile card. */
export function PlayerNote({ api, playerName, color }: { api: CoachNotesApi; playerName: string; color: string }) {
  const [editing, setEditing] = useState(false);
  const note = api.noteFor(playerName);
  if (!api.canEdit && !note) return null;

  if (editing && api.canEdit) {
    return (
      <div className="rounded-lg bg-[color:var(--ch-surface-2)] p-3">
        <Editor api={api} scope="player" playerName={playerName} existing={note} color={color} onDone={() => setEditing(false)} />
      </div>
    );
  }
  if (note) {
    return (
      <div className="rounded-lg bg-[color:var(--ch-surface-2)] p-3 flex items-start gap-2.5" style={{ borderLeft: `3px solid ${toneOf(note.kind)}` }}>
        <MessageSquareText className="w-4 h-4 mt-0.5 shrink-0" style={{ color: toneOf(note.kind) }} />
        <div className="min-w-0 flex-1">
          <p className="ch-eyebrow mb-0.5">Your note</p>
          <NoteBody note={note} />
        </div>
        {api.canEdit && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit your note on ${playerName}`} className="p-1 text-[color:var(--ch-muted)] hover:text-slate-900 dark:hover:text-white">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="self-start inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[color:var(--ch-text-2)] hover:text-slate-900 dark:hover:text-white">
      <Plus className="w-3.5 h-3.5" /> Add a note on {playerName.split(/\s+/)[0]}
    </button>
  );
}

/** The team-wide note, and a way to add a note on any player on the roster. */
export default function CoachNotesPanel({
  api, opponentName, players, color,
}: { api: CoachNotesApi; opponentName: string; players: string[]; color: string }) {
  const { isRealAdmin, viewingAsTeamId } = useAuth();
  const [editingTeam, setEditingTeam] = useState(false);
  const [adding, setAdding] = useState<string>('');
  useEffect(() => { setAdding(''); setEditingTeam(false); }, [opponentName]);

  if (!api.canEdit) return null;
  const playerNotes = (api.notes || []).filter((n) => n.scope === 'player');
  const rest = players.filter((p) => !api.noteFor(p));

  return (
    <section className="ch-card p-4 md:p-6 space-y-4" aria-label={`Your notes on ${opponentName}`}>
      <div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 mb-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--sr-tint, var(--ch-surface-3))', color: `var(--sr-ink, ${color})` }}>
            <MessageSquareText className="w-4 h-4" />
          </span>
          <h3 className="text-[15px] md:text-base font-semibold tracking-tight text-slate-900 dark:text-white">Your notes on {opponentName}</h3>
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-[color:var(--ch-surface-3)] text-[color:var(--ch-muted)]"><Lock className="w-3 h-3" /> Private to your club</span>
        </div>
        <p className="text-[13px] text-[color:var(--ch-text-2)]">
          The numbers can't tell a cold spell from a bad shooter, or know who is injured. Add what you know and your next game plan treats it as true and says where it leaned on it. Notes are used the next time you rebuild the plan.
        </p>
        {isRealAdmin && viewingAsTeamId && (
          <p className="text-[12px] text-[color:var(--ch-muted)] mt-1">Admin preview: notes are saved to this team's account, so its coach will see them.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <h4 className="ch-eyebrow">About the team</h4>
        {editingTeam ? (
          <div className="rounded-lg bg-[color:var(--ch-surface-2)] p-3">
            <Editor api={api} scope="team" existing={api.teamNote} color={color} onDone={() => setEditingTeam(false)} />
          </div>
        ) : api.teamNote ? (
          <div className="rounded-lg bg-[color:var(--ch-surface-2)] p-3 flex items-start gap-2.5">
            <div className="min-w-0 flex-1"><NoteBody note={api.teamNote} /></div>
            <button type="button" onClick={() => setEditingTeam(true)} aria-label="Edit the team note" className="p-1 text-[color:var(--ch-muted)] hover:text-slate-900 dark:hover:text-white"><Pencil className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditingTeam(true)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--ch-text-2)] hover:text-slate-900 dark:hover:text-white">
            <Plus className="w-3.5 h-3.5" /> Add a note about the team
          </button>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="ch-eyebrow">About players</h4>
        {playerNotes.length > 0 && (
          <ul className="space-y-2">
            {playerNotes.map((n) => (
              <li key={n.id} className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white mb-1">{n.playerName}</p>
                <PlayerNote api={api} playerName={n.playerName || ''} color={color} />
              </li>
            ))}
          </ul>
        )}
        {rest.length > 0 && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px] text-[color:var(--ch-text-2)]">
              <span className="shrink-0">Add a note on</span>
              <select
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                className="min-w-0 flex-1 h-9 rounded-lg border border-[color:var(--ch-border)] bg-transparent px-2 text-sm text-slate-900 dark:text-white"
              >
                <option value="">Choose a player…</option>
                {rest.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            {adding && (
              <div className="rounded-lg bg-[color:var(--ch-surface-2)] p-3">
                <Editor api={api} scope="player" playerName={adding} existing={null} color={color} onDone={() => setAdding('')} />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}


/** Context on one strength or weakness of one player, shown under its bar on the report and in the PDF. */
export function AspectNote({ api, playerName, aspect, color }: { api: CoachNotesApi; playerName: string; aspect: { key: string; label: string }; color: string }) {
  const [editing, setEditing] = useState(false);
  const note = api.aspectNoteFor(playerName, aspect.key);
  if (!api.canEdit && !note) return null;
  if (editing && api.canEdit) {
    return (
      <div className="mt-2 rounded-lg bg-[color:var(--ch-surface-2)] p-2.5">
        <Editor api={api} scope="aspect" playerName={playerName} aspect={aspect} existing={note} color={color} onDone={() => setEditing(false)} />
      </div>
    );
  }
  if (note) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-md bg-[color:var(--ch-surface-2)] px-2.5 py-2 text-[12.5px] leading-snug">
        <MessageSquareText className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[color:var(--ch-muted)]" />
        <span className="min-w-0 flex-1 text-slate-900 dark:text-white"><b className="font-semibold">Your context: </b>{note.note}</span>
        {api.canEdit && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit your context on ${aspect.label}`} className="shrink-0 text-[color:var(--ch-muted)] hover:text-slate-900 dark:hover:text-white">
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[color:var(--ch-muted)] hover:text-slate-900 dark:hover:text-white">
      <Plus className="w-3 h-3" /> Add context
    </button>
  );
}
