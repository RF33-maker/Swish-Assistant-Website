import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { playerPhotoUrl, usePlayerPhotoChange } from "@/lib/playerPhotos";
import { PlayerPhotoControl } from "./PlayerPhotoControl";
import { FIELD, Field, HINT, Panel } from "./studioUi";

type PlayerOption = {
  id: string;
  name: string;
  team: string | null;
  allTeams: string[];
  photo_path: string | null;
  // Every record sharing this name, so a photo added from a card (which
  // names one record) is recognised here too.
  recordIds: string[];
};

/**
 * Give any player a photo without going through a card: find them by name or
 * club, then add, replace or pick from what is already on file. The photo
 * links to all of their records and every open studio redraws with it.
 */
export function PlayerPhotoUploader() {
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerOption | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState(true);

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
          .select("id, full_name, team_name, photo_path, created_at")
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

      // One entry per name, showing the newest record's team. Every team the
      // name has played for stays searchable, so a mover is found by their new club.
      const groups = new Map<string, any[]>();
      allPlayers.forEach((row: any) => {
        const name = (row.full_name || row.name || "").toLowerCase().trim();
        if (!name) return;
        const group = groups.get(name);
        if (group) group.push(row);
        else groups.set(name, [row]);
      });

      const mapped: PlayerOption[] = Array.from(groups.values()).map((rows) => {
        const newestFirst = [...rows].sort((a, b) =>
          String(b.created_at || "").localeCompare(String(a.created_at || ""))
        );
        const newest = newestFirst[0];
        const withPhoto = newestFirst.find((r) => r.photo_path);
        const teams = Array.from(
          new Set(newestFirst.map((r) => r.team_name || r.team).filter(Boolean))
        ) as string[];
        return {
          id: (withPhoto || newest).id,
          name: newest.full_name || newest.name || "Unknown",
          team: teams[0] || null,
          allTeams: teams,
          photo_path: withPhoto?.photo_path || null,
          recordIds: rows.map((r) => r.id as string),
        };
      });

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
        p.allTeams.some((t) => t.toLowerCase().includes(query))
    ).slice(0, 20);
  }, [players, searchQuery]);

  const handleSelectPlayer = (player: PlayerOption) => {
    setSelectedPlayer(player);
    setSearchQuery(player.name);
  };

  const clearSelection = () => {
    setSelectedPlayer(null);
    setSearchQuery("");
  };

  // Wherever the photo was changed (here, or on a card in one of the studios), keep this list in step.
  usePlayerPhotoChange((change) => {
    const reached = (p: PlayerOption) => p.recordIds.some((id) => change.playerIds.includes(id));
    setPlayers((prev) => prev.map((p) => (reached(p) ? { ...p, photo_path: change.path } : p)));
    setSelectedPlayer((prev) => (prev && reached(prev) ? { ...prev, photo_path: change.path } : prev));
  });

  return (
    <Panel
      title="Player photos"
      icon={ImagePlus}
      description="Find any player and add, replace or switch their photo. It links to all of their records, and cards you have open redraw by themselves."
      bodyClassName="space-y-4"
    >
      {loadingPlayers ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
        </div>
      ) : players.length === 0 ? (
        <p className="py-4 text-center text-sm text-[color:var(--ch-text-2)]">No players found in database</p>
      ) : (
        <>
          <Field label={`Search player (${players.length.toLocaleString()} available)`}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]" />
              <input
                type="text"
                placeholder="Type a player or club name..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (selectedPlayer && e.target.value !== selectedPlayer.name) setSelectedPlayer(null);
                }}
                className={`${FIELD} pl-9 ${searchQuery ? "pr-9" : ""}`}
                data-testid="input-player-search"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {searchQuery && !selectedPlayer && filteredPlayers.length > 0 && (
              <div className="ch-tile max-h-64 divide-y divide-[color:var(--ch-border)] overflow-y-auto">
                {filteredPlayers.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectPlayer(p)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[color:var(--ch-surface-3)]"
                    data-testid={`option-player-${idx}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--ch-text)]">{p.name}</span>
                      {p.team && (
                        <span className="block truncate text-xs text-[color:var(--ch-muted)]">
                          {p.team}
                          {p.allTeams.length > 1 && ` · also ${p.allTeams.slice(1).join(", ")}`}
                        </span>
                      )}
                    </span>
                    {!p.photo_path && (
                      <span className="flex-none rounded-full bg-[color:var(--ch-surface-3)] px-2 py-0.5 text-[10.5px] font-semibold text-[color:var(--ch-text-2)]">
                        No photo
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchQuery && !selectedPlayer && filteredPlayers.length === 0 && (
              <p className={HINT}>No players found</p>
            )}
          </Field>

          {selectedPlayer ? (
            <div className="space-y-2">
              {selectedPlayer.team && (
                <p className={HINT}>
                  {selectedPlayer.team}
                  {selectedPlayer.allTeams.length > 1 && ` · also ${selectedPlayer.allTeams.slice(1).join(", ")}`}
                </p>
              )}
              <PlayerPhotoControl
                key={selectedPlayer.id}
                playerId={selectedPlayer.id}
                playerName={selectedPlayer.name}
                photoUrl={selectedPlayer.photo_path ? playerPhotoUrl(selectedPlayer.photo_path) : null}
                showAllOnFile
              />
            </div>
          ) : (
            !searchQuery && (
              <p className={HINT}>
                Making a card? You can also add a photo right under its preview, without coming here.
              </p>
            )
          )}
        </>
      )}
    </Panel>
  );
}
