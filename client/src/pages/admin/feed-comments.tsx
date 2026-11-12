import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_GHOST, BTN_PRIMARY, ERROR, FIELD, HINT, Panel } from "@/components/layout/proUi";
import { useModerate, useModerationQueue, type ModerationComment } from "@/lib/feedComments";

const TITLE = "Comment moderation";

const WHY: Record<string, string> = {
  filter: "Banned words",
  ai: "Automatic check",
  reports: "Reported 3+ times",
  unchecked: "Check couldn't run",
};

const LABEL: Record<string, string> = {
  hate: "Hate",
  harassment: "Harassment",
  threat: "Threat",
  sexual: "Sexual",
  self_harm: "Self-harm",
  personal_info: "Personal info",
  about_a_player_personally: "Personal about a player",
  spam: "Spam",
  banned_words: "Banned words",
  other: "Other",
};

const when = (at: string) =>
  new Date(at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Row({ c, onReview, onMute, busy }: { c: ModerationComment; onReview: (a: "approve" | "remove") => void; onMute: (days: number | null) => void; busy: boolean }) {
  const m = c.moderation ?? {};
  const tags = (m.categories ?? []).map((k) => LABEL[k] ?? k);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
        <span className="font-semibold text-[color:var(--ch-text)]">{c.author_name}</span>
        <span className={HINT}>{when(c.created_at)}</span>
        <span className={HINT}>· {c.post_key}</span>
      </div>
      <p className="mt-1 whitespace-pre-line text-[15px] leading-snug text-[color:var(--ch-text)] [overflow-wrap:anywhere]">{c.body}</p>
      <p className={`mt-1 ${HINT}`}>
        {[
          c.status === "visible" ? `Reported ${c.report_count}×` : WHY[m.source ?? ""] ?? m.source,
          tags.join(", "),
          m.note,
          m.posted_after_prompt ? "Posted anyway after the rethink prompt" : null,
        ].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {c.status === "held" ? (
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => onReview("approve")}>Approve</button>
        ) : (
          <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => onReview("approve")}>Keep it up</button>
        )}
        <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => onReview("remove")}>Remove</button>
        <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => onMute(1)}>Mute 1 day</button>
        <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => onMute(7)}>Mute 7 days</button>
        <button type="button" className={BTN_GHOST} disabled={busy} onClick={() => onMute(null)}>Ban from comments</button>
      </div>
    </li>
  );
}

/**
 * The comment queue: what the checks held back, what readers reported, who's
 * muted, and the banned-words list.
 */
export default function FeedCommentsAdminPage() {
  const { isAdmin, isLoading } = useAuth();
  const { data, isLoading: loading, error } = useModerationQueue(isAdmin);
  const { review, mute, unmute, addTerm, removeTerm } = useModerate();
  const [term, setTerm] = useState("");
  const busy = review.isPending || mute.isPending;
  const failure = [review.error, mute.error, unmute.error, addTerm.error, removeTerm.error].find(Boolean) as Error | undefined;

  if (isLoading) return <AdminPageShell title={TITLE} width="max-w-4xl"><AdminPageNotice><Loader2 className="mx-auto h-7 w-7 animate-spin text-[color:var(--ch-accent)]" /></AdminPageNotice></AdminPageShell>;
  if (!isAdmin) return <AdminPageShell title={TITLE} width="max-w-4xl"><AdminPageNotice><p className="font-semibold text-[color:var(--ch-text)]">Access Denied</p></AdminPageNotice></AdminPageShell>;

  const list = (rows: ModerationComment[], empty: string) =>
    rows.length ? (
      <ul className="divide-y divide-[color:var(--ch-border)]">
        {rows.map((c) => (
          <Row
            key={c.id}
            c={c}
            busy={busy}
            onReview={(action) => review.mutate({ id: c.id, action })}
            onMute={(days) => mute.mutate({ userId: c.user_id, days })}
          />
        ))}
      </ul>
    ) : (
      <p className={`py-3 ${HINT}`}>{empty}</p>
    );

  return (
    <AdminPageShell
      title={TITLE}
      description="Feed comments the checks held back or readers reported. Held comments are seen only by their author until you approve them."
      width="max-w-4xl"
    >
      {loading && <Loader2 className="mx-auto h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />}
      {error && <p className={ERROR}>{(error as Error).message}</p>}
      {failure && <p className={`mb-3 ${ERROR}`}>{failure.message}</p>}
      {data && (
        <div className="space-y-8">
          <Panel title={`Waiting for review (${data.held.length})`}>{list(data.held, "Nothing waiting.")}</Panel>
          <Panel title={`Reported but still showing (${data.reported.length})`}>{list(data.reported, "No reports.")}</Panel>

          <Panel title="Muted accounts">
            {data.mutes.length ? (
              <ul className="divide-y divide-[color:var(--ch-border)]">
                {data.mutes.map((m) => (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[14px]">
                    <span className="font-semibold text-[color:var(--ch-text)]">{m.name ?? m.user_id}</span>
                    <span className={HINT}>{m.until ? (Date.parse(m.until) > Date.now() ? `until ${when(m.until)}` : "expired") : "for good"}{m.reason ? ` · ${m.reason}` : ""}</span>
                    <button type="button" className={`ml-auto ${BTN_GHOST}`} disabled={unmute.isPending} onClick={() => unmute.mutate(m.user_id)}>Lift</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`py-3 ${HINT}`}>Nobody is muted.</p>
            )}
          </Panel>

          <Panel title={`Banned words (${data.terms.length})`} description="A comment with any of these, however it's spelt or spaced, is held. Whole words only, so add compounds as their own entry.">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (term.trim()) addTerm.mutate(term.trim(), { onSuccess: () => setTerm("") });
              }}
            >
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Add a word or phrase" aria-label="Word or phrase to ban" className={FIELD} />
              <button type="submit" className={BTN_PRIMARY} disabled={addTerm.isPending || !term.trim()}>Add</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.terms.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => removeTerm.mutate(t)}
                  aria-label={`Remove ${t}`}
                  className="rounded-full border border-[color:var(--ch-border)] px-2.5 py-0.5 text-[12px] text-[color:var(--ch-text-2)]"
                >
                  {t} ×
                </button>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </AdminPageShell>
  );
}
