import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, User, Loader2 } from "lucide-react";

type Player = {
  id: string;
  name: string;
  photo_path: string | null;
};

export function PlayerPhotoUploader() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadPlayers = async () => {
      setLoadingPlayers(true);
      const { data, error } = await supabase
        .from("players")
        .select("id, name, photo_path")
        .order("name", { ascending: true });

      if (!error && data) {
        setPlayers(data as Player[]);
      }
      setLoadingPlayers(false);
    };

    loadPlayers();
  }, []);

  useEffect(() => {
    const player = players.find((p) => p.id === selectedPlayerId);
    if (player?.photo_path) {
      const { data } = supabase.storage
        .from("player-photos")
        .getPublicUrl(player.photo_path);
      setCurrentPhotoUrl(data.publicUrl);
    } else {
      setCurrentPhotoUrl(null);
    }
  }, [selectedPlayerId, players]);

  const handleUpload = async () => {
    if (!selectedPlayerId || !file) {
      setMessage({ type: "error", text: "Select a player and a file first." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${selectedPlayerId}/primary.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("player-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("players")
        .update({ photo_path: filePath })
        .eq("id", selectedPlayerId);

      if (updateError) throw updateError;

      setMessage({ type: "success", text: "Photo uploaded and linked!" });

      const { data } = supabase.storage
        .from("player-photos")
        .getPublicUrl(filePath);
      setCurrentPhotoUrl(data.publicUrl);

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === selectedPlayerId ? { ...p, photo_path: filePath } : p
        )
      );
    } catch (err: any) {
      console.error(err);
      setMessage({ type: "error", text: `Upload failed: ${err.message ?? "unknown error"}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
          <User className="h-5 w-5" />
          Assign Player Photo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingPlayers ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Player
              </label>
              <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                <SelectTrigger 
                  className="w-full border-gray-200 dark:border-gray-600"
                  data-testid="select-player-photo"
                >
                  <SelectValue placeholder="Choose a player..." />
                </SelectTrigger>
                <SelectContent>
                  {players.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Photo File
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 dark:text-gray-300
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-orange-100 file:text-orange-700
                  dark:file:bg-orange-900/30 dark:file:text-orange-400
                  hover:file:bg-orange-200 dark:hover:file:bg-orange-900/50
                  cursor-pointer"
                data-testid="input-player-photo"
              />
            </div>

            <Button
              onClick={handleUpload}
              disabled={loading || !selectedPlayerId || !file}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
              data-testid="button-upload-photo"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload & Link
                </>
              )}
            </Button>

            {currentPhotoUrl && (
              <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Current Photo:
                </p>
                <img
                  src={currentPhotoUrl}
                  alt="Current player"
                  className="h-32 w-32 rounded-lg object-cover border border-gray-200 dark:border-gray-600"
                  data-testid="img-current-photo"
                />
              </div>
            )}

            {message && (
              <p
                className={`text-sm ${
                  message.type === "success"
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
                data-testid="text-upload-message"
              >
                {message.text}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
