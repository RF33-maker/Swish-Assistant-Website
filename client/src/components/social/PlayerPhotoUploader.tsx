import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload, User, Loader2, Search } from "lucide-react";

type PlayerOption = {
  id: string;
  name: string;
  team: string | null;
  photo_path: string | null;
};

export function PlayerPhotoUploader() {
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerOption | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadPlayers = async () => {
      setLoadingPlayers(true);
      
      // Fetch all players using pagination to bypass the 1000 row limit
      let allPlayers: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("players")
          .select("*")
          .order("full_name", { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) {
          console.error("Error loading players:", error);
          break;
        }
        
        if (data && data.length > 0) {
          allPlayers = [...allPlayers, ...data];
          hasMore = data.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      // Deduplicate by full_name - keep the first occurrence (which has photo_path if any)
      const seenNames = new Map<string, any>();
      allPlayers.forEach((row: any) => {
        const name = (row.full_name || row.name || "").toLowerCase().trim();
        if (name && !seenNames.has(name)) {
          seenNames.set(name, row);
        } else if (name && seenNames.has(name)) {
          // If existing entry has no photo but this one does, use this one
          const existing = seenNames.get(name);
          if (!existing.photo_path && row.photo_path) {
            seenNames.set(name, row);
          }
        }
      });
      
      const uniquePlayers = Array.from(seenNames.values());
      const mapped = uniquePlayers.map((row: any) => ({
        id: row.id,
        name: row.full_name || row.name || "Unknown",
        team: row.team_name || row.team || null,
        photo_path: row.photo_path || null,
      }));
      
      // Sort by name
      mapped.sort((a, b) => a.name.localeCompare(b.name));
      
      setPlayers(mapped);
      setLoadingPlayers(false);
    };

    loadPlayers();
  }, []);

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return players.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.team && p.team.toLowerCase().includes(query))
    ).slice(0, 20);
  }, [players, searchQuery]);

  const handleSelectPlayer = async (player: PlayerOption) => {
    setSelectedPlayer(player);
    setSearchQuery(player.name);
    
    // If player has a photo_path stored, use it directly
    if (player.photo_path) {
      const { data } = supabase.storage
        .from("player-photos")
        .getPublicUrl(player.photo_path);
      setCurrentPhotoUrl(data.publicUrl);
    } else {
      // Fallback: check storage directly
      const { data: existingPhoto } = await supabase.storage
        .from("player-photos")
        .list(player.id);
      
      if (existingPhoto && existingPhoto.length > 0) {
        const { data } = supabase.storage
          .from("player-photos")
          .getPublicUrl(`${player.id}/${existingPhoto[0].name}`);
        setCurrentPhotoUrl(data.publicUrl);
      } else {
        setCurrentPhotoUrl(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedPlayer || !file) {
      setMessage({ type: "error", text: "Select a player and a file first." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filePath = `${selectedPlayer.id}/primary.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("player-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Update the player's photo_path in the database
      const { error: updateError } = await supabase
        .from("players")
        .update({ photo_path: filePath })
        .eq("id", selectedPlayer.id);

      if (updateError) {
        console.error("Failed to update photo_path:", updateError);
        throw updateError;
      }

      setMessage({ type: "success", text: "Photo uploaded and linked!" });

      const { data } = supabase.storage
        .from("player-photos")
        .getPublicUrl(filePath);
      setCurrentPhotoUrl(data.publicUrl);
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
        ) : players.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            No players found in database
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Search Player ({players.length} available)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Type player name..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedPlayer && e.target.value !== selectedPlayer.name) {
                      setSelectedPlayer(null);
                      setCurrentPhotoUrl(null);
                    }
                  }}
                  className="pl-10 border-gray-200 dark:border-gray-600"
                  data-testid="input-player-search"
                />
              </div>
              
              {searchQuery && !selectedPlayer && filteredPlayers.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-600 rounded-md max-h-48 overflow-y-auto bg-white dark:bg-gray-800">
                  {filteredPlayers.map((p, idx) => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPlayer(p)}
                      className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                      data-testid={`option-player-${idx}`}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{p.name}</div>
                      {p.team && <div className="text-xs text-gray-500 dark:text-gray-400">{p.team}</div>}
                    </button>
                  ))}
                </div>
              )}
              
              {searchQuery && !selectedPlayer && filteredPlayers.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No players found</p>
              )}
              
              {selectedPlayer && (
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-md px-3 py-2">
                  <div className="font-medium text-orange-900 dark:text-orange-300">{selectedPlayer.name}</div>
                  {selectedPlayer.team && <div className="text-xs text-orange-700 dark:text-orange-400">{selectedPlayer.team}</div>}
                </div>
              )}
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
              disabled={loading || !selectedPlayer || !file}
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
                  onError={(e) => {
                    console.error("[PlayerPhotoUploader] Image failed to load:", currentPhotoUrl);
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <p className="text-xs text-gray-400 break-all">{currentPhotoUrl}</p>
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
