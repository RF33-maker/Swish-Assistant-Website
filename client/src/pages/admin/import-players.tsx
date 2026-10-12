import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Loader2, Upload, CheckCircle, AlertCircle, Info } from "lucide-react";
import AdminPageShell, { AdminPageNotice } from "@/components/layout/AdminPageShell";
import { BTN_PRIMARY, Panel, TALL } from "@/components/layout/proUi";

// This page is only reachable through AdminRoute in App.tsx, which already
// blocks non-admin users. The isAdmin check here is a defence-in-depth guard.

interface ImportSummary {
  updated: number;
  created: number;
  skipped: number;
  errors: string[];
}

export default function ImportPlayersPage() {
  const { user, isAdmin, isLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <AdminPageShell title="Import players" width="max-w-2xl">
        <AdminPageNotice>
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[color:var(--ch-accent)]" />
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  // Defence-in-depth: AdminRoute already prevents non-admins from reaching
  // this component, but we keep the check here as an extra layer.
  if (!user || !isAdmin) {
    return (
      <AdminPageShell title="Import players" width="max-w-2xl">
        <AdminPageNotice>
          <p className="font-semibold text-[color:var(--ch-text)]">Access Denied</p>
          <p className="mt-1">This page is restricted to owner accounts.</p>
        </AdminPageNotice>
      </AdminPageShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setUploadError(null);
    setSummary(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/import-players", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error || "Import failed");
      } else {
        setSummary(json);
      }
    } catch (err: any) {
      setUploadError(err.message || "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  const code = "rounded bg-[color:var(--ch-surface-3)] px-1 font-mono text-xs text-[color:var(--ch-text)]";
  const count = "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold";

  return (
    <AdminPageShell
      title="Import players"
      description="Upload a CSV to enrich player profiles with current team, previous teams and Instagram handle."
      width="max-w-2xl"
    >
      <div className="space-y-5">
        <Panel
          title="CSV format"
          description={
            <>
              Required column: <code className={code}>full_name</code>.
              Optional columns: <code className={code}>current_team</code>,{" "}
              <code className={code}>previous_teams</code> (semicolon-separated),{" "}
              <code className={code}>instagram_handle</code>,{" "}
              <code className={code}>position</code>,{" "}
              <code className={code}>height_cm</code>,{" "}
              <code className={code}>date_of_birth</code>.
            </>
          }
        >
          <div className="overflow-x-auto rounded-[10px] bg-[color:var(--ch-surface-3)] p-3 font-mono text-xs text-[color:var(--ch-text)]">
            full_name,current_team,previous_teams,instagram_handle<br />
            John Smith,Raptors,Lakers;Bulls,johnsmith_bball<br />
            Jane Doe,Lynx,,janedoe
          </div>
        </Panel>

        <Panel title="Upload CSV">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div
              className="cursor-pointer rounded-xl border-2 border-dashed border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface-2)] p-6 text-center transition-colors hover:bg-[color:var(--ch-surface-3)]"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mx-auto mb-2 h-8 w-8 text-[color:var(--ch-muted)]" />
              {file ? (
                <p className="text-sm font-medium text-[color:var(--ch-text)]">{file.name}</p>
              ) : (
                <p className="text-sm text-[color:var(--ch-text-2)]">Click to select a CSV file</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setSummary(null);
                  setUploadError(null);
                }}
              />
            </div>

            <button type="submit" disabled={!file || submitting} className={`${BTN_PRIMARY} ${TALL} w-full`}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Importing…" : "Import Players"}
            </button>
          </form>
        </Panel>

        {uploadError && (
          <div className="flex items-start gap-2 rounded-[14px] border border-red-500/30 bg-red-500/10 p-4 text-red-700 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{uploadError}</p>
          </div>
        )}

        {summary && (
          <Panel title="Import complete" icon={CheckCircle} bodyClassName="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className={`${count} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`}>Updated: {summary.updated}</span>
              <span className={`${count} bg-sky-500/15 text-sky-700 dark:text-sky-300`}>Created: {summary.created}</span>
              <span className={`${count} bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)]`}>Skipped: {summary.skipped}</span>
            </div>

            {summary.errors.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Info className="h-4 w-4" />
                  <span className="text-xs font-medium">Warnings / Errors ({summary.errors.length})</span>
                </div>
                <div className="ch-tile max-h-48 space-y-1 overflow-y-auto p-3">
                  {summary.errors.map((err, i) => (
                    <p key={i} className="text-xs text-[color:var(--ch-text-2)]">{err}</p>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        )}
      </div>
    </AdminPageShell>
  );
}
