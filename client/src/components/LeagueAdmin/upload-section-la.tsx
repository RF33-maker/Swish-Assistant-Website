import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const UploadSectionLA = ({ leagues }: any) => {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [lastFilePath, setLastFilePath] = useState<string | null>(null);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string>("");

  const backfillParentLeagueId = async (
    parentLeagueId: string,
    snapshot: { ok: true; ids: Set<string> } | { ok: false },
    explicitChildIds?: string[],
  ) => {
    if (!user?.id) return;

    try {
      // Preferred path: an explicit list of newly-created child league IDs.
      if (explicitChildIds && explicitChildIds.length > 0) {
        const targets = explicitChildIds.filter((id) => id && id !== parentLeagueId);
        if (targets.length === 0) return;
        const { error } = await supabase
          .from("competitions")
          .update({ parent_league_id: parentLeagueId })
          .in("league_id", targets)
          .eq("user_id", user.id)
          .is("parent_league_id", null);
        if (error) {
          console.error("❌ parent_league_id backfill (explicit) failed:", error.message);
        }
        return;
      }

      // Fallback path: snapshot diff. Only safe if the pre-parse snapshot succeeded.
      if (!snapshot.ok) {
        console.warn(
          "⚠️ Skipping parent_league_id backfill — pre-parse snapshot was unavailable, " +
            "so we cannot safely identify which rows were newly created by this upload.",
        );
        setStatusMessage(
          "✅ Parsing complete! ⚠️ Could not auto-link new child leagues to this parent — please set parent_league_id manually if needed.",
        );
        return;
      }

      const preExistingLeagueIds = snapshot.ids;
      const { data: candidates, error: fetchErr } = await supabase
        .from("competitions")
        .select("league_id")
        .eq("user_id", user.id)
        .is("parent_league_id", null);

      if (fetchErr) {
        console.error("❌ parent_league_id backfill query failed:", fetchErr.message);
        return;
      }

      const newChildIds = (candidates || [])
        .map((row: any) => row.league_id as string)
        .filter((id) => id && id !== parentLeagueId && !preExistingLeagueIds.has(id));

      if (newChildIds.length === 0) return;

      const { error: updateErr } = await supabase
        .from("competitions")
        .update({ parent_league_id: parentLeagueId })
        .in("league_id", newChildIds)
        .eq("user_id", user.id)
        .is("parent_league_id", null);

      if (updateErr) {
        console.error("❌ parent_league_id backfill update failed:", updateErr.message);
      }
    } catch (err) {
      console.error("❌ parent_league_id backfill threw:", err);
    }
  };

  const triggerParse = async (filePath: string | null) => {
    if (!filePath || !selectedLeagueId || !user?.id) {
      setStatusMessage("❌ file_path, user_id, and league_id are required");
      return;
    }

    // Snapshot existing leagues for this user so we can detect newly-created children.
    // Snapshot failure must NOT silently fall through to a "treat everything as new" update.
    let snapshot: { ok: true; ids: Set<string> } | { ok: false } = { ok: false };
    try {
      const { data: existing, error: snapErr } = await supabase
        .from("competitions")
        .select("league_id")
        .eq("user_id", user.id);
      if (snapErr) {
        console.error("⚠️ Could not snapshot existing leagues:", snapErr.message);
      } else {
        const ids = new Set<string>();
        (existing || []).forEach((row: any) => {
          if (row?.league_id) ids.add(row.league_id);
        });
        snapshot = { ok: true, ids };
      }
    } catch (err) {
      console.error("⚠️ Snapshot failed:", err);
    }

    try {
      setStatusMessage("🔄 Parsing file...");
      // In dev: use the Express proxy (/api/parse) to avoid CORS.
      // In production: call the Python backend directly so Vercel serverless
      // functions aren't involved (they crash on long-running upstream calls).
      const backendUrl = import.meta.env.VITE_BACKEND_URL as string | undefined;
      const parseUrl = (import.meta.env.DEV || !backendUrl)
        ? `/api/parse`
        : `${backendUrl.replace(/\/$/, "")}/api/parse`;
      const resp = await fetch(
        parseUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            league_id: selectedLeagueId,
            parent_league_id: selectedLeagueId,
            file_path: `XLSX Uploads/${filePath}`, // adjust bucket name
          }),
        }
      );

      const text = await resp.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("❌ Non-JSON response from /api/parse:", text);
        setStatusMessage(
          `❌ Parsing failed: server returned HTTP ${resp.status} with a non-JSON response — ${text}`
        );
        return;
      }

      if (resp.ok) {
        const explicitIds: string[] | undefined = Array.isArray(data?.created_league_ids)
          ? data.created_league_ids
          : undefined;
        const rowsWritten: number = data?.rows_written ?? 0;
        const rowLabel = rowsWritten === 1 ? "record" : "records";
        setStatusMessage(
          rowsWritten > 0
            ? `✅ Parsing complete! ${rowsWritten} player stat ${rowLabel} written to database.`
            : "✅ Parsing complete! (0 records written — check that the file has recognisable player data)"
        );
        await backfillParentLeagueId(selectedLeagueId, snapshot, explicitIds);
      } else {
        setStatusMessage(`❌ Parsing failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("❌ Error calling parse:", err);
      setStatusMessage("❌ Parsing failed — check console");
    }
  };

  const getContentType = (file: File): string => {
    if (file.name.toLowerCase().endsWith(".pdf")) {
      return "application/pdf";
    }
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles?.length) return;

    const file = acceptedFiles[0];
    const filePath = `${file.name}`;
    const isPdf = file.name.toLowerCase().endsWith(".pdf");
    setIsUploading(true);
    setStatusMessage(`📂 Uploading ${isPdf ? "PDF" : "Excel"} file...`);

    const { error } = await supabase.storage
      .from("XLSX Uploads")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: getContentType(file),
      });

    if (error) {
      console.error("❌ Upload failed:", error.message);
      setStatusMessage(`❌ Upload failed: ${error.message}`);
      setIsUploading(false);
      return;
    }

    setLastFilePath(filePath);
    setStatusMessage("✅ Upload successful, starting parse...");

    await triggerParse(filePath);

    setIsUploading(false);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/pdf": [".pdf"],
    },
    multiple: false,
  });

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-4">
        {/* League Dropdown */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Select League
          </label>
          <select
            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm"
            value={selectedLeagueId}
            onChange={(e) => setSelectedLeagueId(e.target.value)}
            data-testid="select-league"
          >
            <option value="">-- Choose a League --</option>
            {leagues?.map((league: any) => (
              <option key={league.league_id} value={league.league_id}>
                {league.name}
              </option>
            ))}
          </select>
        </div>

        {/* File Upload */}
        <div
          {...getRootProps()}
          className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
            isDragActive
              ? "border-orange-500 bg-orange-50"
              : "border-gray-300 bg-gray-50 hover:bg-gray-100"
          }`}
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p className="text-orange-600 font-medium">
              Drop the file here...
            </p>
          ) : (
            <p className="text-gray-600">
              Drag and drop a file here, or{" "}
              <span className="font-semibold text-orange-600">click to select</span>{" "}
              a <strong>.xlsx</strong> or <strong>.pdf</strong> file
            </p>
          )}
        </div>

        {/* Status Messages */}
        {isUploading && (
          <p className="text-sm text-blue-600 font-medium">⏳ Uploading...</p>
        )}
        {statusMessage && (
          <p className="text-sm font-medium">{statusMessage}</p>
        )}

        {/* Manual Re-Parse Button */}
        {lastFilePath && (
          <Button
            onClick={() => triggerParse(lastFilePath)}
            className="mt-4 bg-orange-500 hover:bg-orange-600"
            disabled={!selectedLeagueId}
          >
            🔄 Re-Parse Latest File
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default UploadSectionLA;
