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

  const triggerParse = async (filePath: string | null) => {
    if (!filePath || !selectedLeagueId || !user?.id) {
      setStatusMessage("❌ file_path, user_id, and league_id are required");
      return;
    }

    try {
      setStatusMessage("🔄 Parsing file...");
      const resp = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/api/parse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            league_id: selectedLeagueId,
            file_path: `XLSX Uploads/${filePath}`, // adjust bucket name
          }),
        }
      );

      const data = await resp.json();
      if (resp.ok) {
        setStatusMessage("✅ Parsing complete!");
      } else {
        setStatusMessage(`❌ Parsing failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("❌ Error calling parse:", err);
      setStatusMessage("❌ Parsing failed — check console");
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles?.length) return;

    const file = acceptedFiles[0];
    const filePath = `${file.name}`;
    setIsUploading(true);
    setStatusMessage("📂 Uploading file...");

    const { error } = await supabase.storage
      .from("XLSX Uploads") // 👈 must match bucket name exactly
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [],
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
              Drop the Excel file here...
            </p>
          ) : (
            <p className="text-gray-600">
              Drag and drop an Excel file here, or{" "}
              <span className="font-semibold text-orange-600">click to select</span>{" "}
              a <strong>.xlsx</strong> file
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
            🔄 Re-Parse Latest Excel
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default UploadSectionLA;
