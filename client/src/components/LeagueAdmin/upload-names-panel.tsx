import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { stopLabel } from "@/lib/leagueChildren";
import { BTN_PRIMARY, ERROR, FIELD, HINT, Panel, TALL } from "@/components/layout/proUi";

// The PDF titles a competition accepts on upload (competition_upload_names).
// The parser looks a PDF's title up here first, so a title that doesn't match
// the competition's own name still lands in the right place. A season can hand
// titles to the competitions under it: REBA SL lists one title per stop on both
// age-group competitions, and the age group in the team names picks between them.

type Target = { league_id: string; name: string; age_group?: string | null; stop?: number | null; stop_name?: string | null };
type UploadName = { id: string; league_id: string; name: string };

export default function UploadNamesPanel({ league }: { league: Target }) {
  const { user } = useAuth();
  const [children, setChildren] = useState<Target[]>([]);
  const [names, setNames] = useState<UploadName[]>([]);
  const [targetId, setTargetId] = useState(league.league_id);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(() => [league, ...children], [league, children]);
  const targetName = (t: Target) => {
    const parts = [t.name];
    if (t.age_group) parts.push(t.age_group);
    if (t.stop != null) parts.push(stopLabel(t.stop, t.stop_name));
    return t.league_id === league.league_id ? `${t.name} (this competition)` : parts.join(" · ");
  };

  const load = async () => {
    setLoading(true);
    const { data: kids } = await supabase
      .from("competitions")
      .select("league_id, name, age_group, stop, stop_name")
      .eq("parent_league_id", league.league_id)
      .order("name");
    const kidRows = (kids || []) as Target[];
    setChildren(kidRows);
    const { data, error: loadError } = await supabase
      .from("competition_upload_names")
      .select("id, league_id, name")
      .in("league_id", [league.league_id, ...kidRows.map((k) => k.league_id)])
      .order("name");
    if (loadError) setError(loadError.message);
    setNames((data || []) as UploadName[]);
    setLoading(false);
  };

  useEffect(() => {
    setTargetId(league.league_id);
    load();
  }, [league.league_id]);

  const add = async () => {
    const name = title.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase
      .from("competition_upload_names")
      .insert({ league_id: targetId, name, added_by: user?.id ?? null });
    setSaving(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "That title is already listed for this competition." : insertError.message);
      return;
    }
    setTitle("");
    load();
  };

  const remove = async (id: string) => {
    setError(null);
    const { error: deleteError } = await supabase.from("competition_upload_names").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setNames((current) => current.filter((n) => n.id !== id));
  };

  const byTarget = targets
    .map((t) => ({ target: t, titles: names.filter((n) => n.league_id === t.league_id) }))
    .filter((g) => g.titles.length > 0);

  return (
    <Panel
      title="PDF titles"
      icon={FileText}
      description="Box score PDFs whose title matches one of these go into that competition, even when the title differs from its name."
      className="md:col-span-2"
    >
      <div className="space-y-4">
        {loading ? (
          <p className={HINT}><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Loading titles…</p>
        ) : byTarget.length === 0 ? (
          <p className={HINT}>No titles linked yet. Uploads are matched on the competition's own name.</p>
        ) : (
          <ul className="space-y-2">
            {byTarget.map(({ target, titles }) => (
              <li key={target.league_id} className="ch-tile p-3">
                <div className="mb-2 text-[13px] font-medium text-[color:var(--ch-text)]">{targetName(target)}</div>
                <div className="flex flex-wrap gap-2">
                  {titles.map((n) => (
                    <span key={n.id} className="ch-chip inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
                      {n.name}
                      <button type="button" onClick={() => remove(n.id)} aria-label={`Remove ${n.name}`} className="opacity-70 hover:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2.5 md:flex-row">
          {children.length > 0 && (
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={`${FIELD} !h-11 md:max-w-xs`} aria-label="Competition">
              {targets.map((t) => (
                <option key={t.league_id} value={t.league_id}>{targetName(t)}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Title as it appears on the PDF, e.g. REBA SL Bristol stop FIBA"
            className={`${FIELD} !h-11`}
          />
          <button type="button" onClick={add} disabled={saving || !title.trim()} className={`${BTN_PRIMARY} ${TALL} flex-none`}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Add title
          </button>
        </div>
        <p className={HINT}>
          Leave off the report name ("Box Score", "Play by Play"). When several competitions share a title, the age group in the
          team names (e.g. "Team Gold 15U") decides. A new title uploaded to a season run as stops gets its own competition per age group.
        </p>
        {error && <p className={ERROR}>{error}</p>}
      </div>
    </Panel>
  );
}
