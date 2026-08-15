import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Redirect } from "wouter";
import { Loader2, Upload, CheckCircle, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ImportSummary {
  updated: number;
  created: number;
  skipped: number;
  errors: string[];
}

export default function ImportPlayersPage() {
  const { user, isLoading } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) return <Redirect to="/auth" />;

  const isAdmin = (user as any)?.app_metadata?.role === "admin";
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">Access Denied</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">This page is restricted to admin users.</p>
        </div>
      </div>
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Import Players</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">
            Upload a CSV to enrich player profiles with current team, previous teams and Instagram handle.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CSV Format</CardTitle>
            <CardDescription>
              Required column: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">full_name</code>.
              Optional columns: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">current_team</code>,{" "}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">previous_teams</code> (semicolon-separated),{" "}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">instagram_handle</code>,{" "}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">position</code>,{" "}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">height_cm</code>,{" "}
              <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-xs">date_of_birth</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-md p-3 font-mono text-xs overflow-x-auto">
              full_name,current_team,previous_teams,instagram_handle<br />
              John Smith,Raptors,Lakers;Bulls,johnsmith_bball<br />
              Jane Doe,Lynx,,janedoe
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-6 text-center cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{file.name}</p>
                ) : (
                  <p className="text-sm text-slate-500">Click to select a CSV file</p>
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

              <Button type="submit" disabled={!file || submitting} className="w-full">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  "Import Players"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {uploadError && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <p className="text-sm">{uploadError}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {summary && (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Import Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                    Updated: {summary.updated}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    Created: {summary.created}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Skipped: {summary.skipped}
                  </Badge>
                </div>
              </div>

              {summary.errors.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 mb-1.5">
                    <Info className="h-4 w-4" />
                    <span className="text-xs font-medium">Warnings / Errors ({summary.errors.length})</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 rounded-md p-3 space-y-1 max-h-48 overflow-y-auto">
                    {summary.errors.map((err, i) => (
                      <p key={i} className="text-xs text-slate-600 dark:text-slate-400">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
