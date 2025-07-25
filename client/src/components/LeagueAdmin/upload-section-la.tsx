import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

type League = {
  league_id: string;
  name: string;
  user_id: string;
};

const BASE = import.meta.env.VITE_BACKEND_URL;
console.log("🔍 Backend URL:", BASE); // Add this line

export default function UploadSection() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");

  useEffect(() => {
    if (user) {
      supabase
        .from("leagues")
        .select("league_id, name, user_id")
        .eq("user_id", user.id)
        .then(({ data, error }) => {
          console.log("Returned leagues:", data);
          console.log("Error:", error);
          console.log("Current user ID:", user?.id);
          setLeagues(data || []);
        });
    }
  }, [user]);


  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file || !user || !selectedLeagueId) return;

      setUploading(true);
      setMessage("Uploading...");

      const safeName = file.name
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_.-]/g, "");

      const filePath = `${user.id}/${safeName}`;

      const { error } = await supabase.storage
        .from("user-uploads")
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: "application/pdf",
        });

      if (error) {
        setMessage("Upload failed: " + error.message);
        setUploading(false);
        return;
      }

      setMessage("Upload successful. Starting parse...");
      setUploadedFile(file.name);

      try {
        const res = await fetch(`${BASE}/api/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            league_id: selectedLeagueId,
            file_path: filePath,
          }),
        });

        if (res.ok) {
          setMessage("Parsing complete! ✅");
        } else {
          try {
            const errorData = await res.json();
            setMessage(`Parsing failed ❌: ${JSON.stringify(errorData)}`);
          } catch {
            setMessage(`Parsing failed ❌ and could not read error message.`);
          }
        }
      } catch (fetchErr) {
        setMessage(`Parsing failed ❌: ${String(fetchErr)}`);
      }

      setUploading(false);
    },
    [user, selectedLeagueId]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [] },
    multiple: false,
  });

  return (
    <section className="p-6 bg-gray-50 border-t border-b text-center">
      <h2 className="text-xl font-semibold mb-2">Upload Game PDF</h2>
      <p className="text-gray-600 mb-6">Upload below to get the chatbot going ⚡</p>

      <div className="mb-4">
        <label className="block text-sm font-semibold text-slate-800 mb-1">Select League</label>
        <select
          className="w-full rounded border p-2"
          value={selectedLeagueId}
          onChange={(e) => setSelectedLeagueId(e.target.value)}
        >
          <option value="">-- Choose League --</option>
          {leagues.map((league) => (
            <option key={league.league_id} value={league.league_id}>
              {league.name}
            </option>
          ))}
        </select>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer duration-200 ${
          isDragActive
            ? "border-orange-400 bg-orange-100"
            : "border-gray-300 bg-white hover:bg-orange-50"
        }`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-orange-500 font-medium">Drop the PDF here...</p>
        ) : (
          <p className="text-gray-500">
            Drag & drop a PDF here, or <span className="text-swish-dark underline">click to browse</span>
          </p>
        )}
      </div>

      {uploading && <p className="mt-4 text-sm text-gray-600">Uploading...</p>}
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
      {uploadedFile && (
        <div className="mt-4 text-sm text-green-700 font-medium">
          Uploaded: {uploadedFile} ✅
        </div>
      )}
    </section>
  );
}



