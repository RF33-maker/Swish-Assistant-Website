import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Link2, Unlink, Trash2, Plus, Loader2, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, X
} from "lucide-react";

type PlayerOption = {
  id: string;
  full_name: string;
  team_name: string | null;
  league_id: string;
  slug: string | null;
};

type IdentityGroup = {
  id: string;
  canonical_name: string;
  photo_path: string | null;
  photo_path_bg_removed: string | null;
};

type IdentityMember = {
  memberId: string;
  playerId: string;
  player: PlayerOption | null;
};

type Msg = { type: "success" | "error"; text: string };

export function PlayerIdentityManager() {
  const [identities, setIdentities] = useState<IdentityGroup[]>([]);
  const [identitySearch, setIdentitySearch] = useState("");
  const [loadingIdentities, setLoadingIdentities] = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [membersMap, setMembersMap] = useState<Record<string, IdentityMember[]>>({});
  const [loadingMembersFor, setLoadingMembersFor] = useState<string | null>(null);

  const [playerSearch, setPlayerSearch] = useState("");
  const [playerResults, setPlayerResults] = useState<PlayerOption[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);

  const [pendingPlayers, setPendingPlayers] = useState<PlayerOption[]>([]);
  const [canonicalName, setCanonicalName] = useState("");
  const [creating, setCreating] = useState(false);

  const [addingToId, setAddingToId] = useState<string | null>(null);
  const [addPlayerSearch, setAddPlayerSearch] = useState("");
  const [addPlayerResults, setAddPlayerResults] = useState<PlayerOption[]>([]);
  const [searchingAdd, setSearchingAdd] = useState(false);

  const [msg, setMsg] = useState<Msg | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token
      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json" };
  }, []);

  const fetchIdentities = useCallback(async (name?: string) => {
    setLoadingIdentities(true);
    setMsg(null);
    try {
      const headers = await authHeaders();
      const url = name?.trim()
        ? `/api/player-identities?name=${encodeURIComponent(name.trim())}`
        : `/api/player-identities`;
      const res = await fetch(url, { headers });
      const json = await res.json();
      if (json.migration) { setMigrationNeeded(true); setIdentities([]); return; }
      if (!res.ok) { setMsg({ type: "error", text: json.error || "Failed to load identities" }); return; }
      setIdentities(json.identities || []);
    } finally {
      setLoadingIdentities(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchIdentities(); }, [fetchIdentities]);

  const fetchMembers = async (identityId: string) => {
    if (membersMap[identityId]) return;
    setLoadingMembersFor(identityId);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/player-identities/${identityId}/members`, { headers });
      const json = await res.json();
      if (res.ok) setMembersMap(prev => ({ ...prev, [identityId]: json.members || [] }));
    } finally {
      setLoadingMembersFor(null);
    }
  };

  const toggleExpand = async (identityId: string) => {
    if (expandedId === identityId) { setExpandedId(null); return; }
    setExpandedId(identityId);
    await fetchMembers(identityId);
  };

  const searchPlayers = useCallback(async (query: string) => {
    if (!query.trim()) { setPlayerResults([]); return; }
    setSearchingPlayers(true);
    try {
      const { data } = await supabase
        .from("players")
        .select("id, full_name, team_name, league_id, slug")
        .ilike("full_name", `%${query.trim()}%`)
        .limit(15);
      setPlayerResults(data || []);
    } finally {
      setSearchingPlayers(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchPlayers(playerSearch), 300);
    return () => clearTimeout(t);
  }, [playerSearch, searchPlayers]);

  const searchAddPlayers = useCallback(async (query: string) => {
    if (!query.trim()) { setAddPlayerResults([]); return; }
    setSearchingAdd(true);
    try {
      const { data } = await supabase
        .from("players")
        .select("id, full_name, team_name, league_id, slug")
        .ilike("full_name", `%${query.trim()}%`)
        .limit(15);
      setAddPlayerResults(data || []);
    } finally {
      setSearchingAdd(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchAddPlayers(addPlayerSearch), 300);
    return () => clearTimeout(t);
  }, [addPlayerSearch, searchAddPlayers]);

  const addToPending = (player: PlayerOption) => {
    if (pendingPlayers.find(p => p.id === player.id)) return;
    setPendingPlayers(prev => [...prev, player]);
    if (!canonicalName) setCanonicalName(player.full_name);
    setPlayerSearch("");
    setPlayerResults([]);
  };

  const removePending = (id: string) => {
    setPendingPlayers(prev => {
      const next = prev.filter(p => p.id !== id);
      if (next.length === 0) setCanonicalName("");
      return next;
    });
  };

  const createIdentity = async () => {
    if (pendingPlayers.length < 2 || !canonicalName.trim()) return;
    setCreating(true);
    setMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/player-identities", {
        method: "POST",
        headers,
        body: JSON.stringify({
          canonicalName: canonicalName.trim(),
          playerIds: pendingPlayers.map(p => p.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: json.error || "Failed to create identity" });
        return;
      }
      setMsg({ type: "success", text: `Identity group "${canonicalName.trim()}" created with ${pendingPlayers.length} players.` });
      setPendingPlayers([]);
      setCanonicalName("");
      await fetchIdentities(identitySearch || undefined);
    } finally {
      setCreating(false);
    }
  };

  const removeMember = async (identityId: string, playerId: string) => {
    setRemoving(playerId);
    setMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/player-identities/${identityId}/members/${playerId}`, {
        method: "DELETE",
        headers,
      });
      const json = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: json.error || "Failed to remove member" }); return; }
      setMembersMap(prev => {
        const updated = (prev[identityId] || []).filter(m => m.playerId !== playerId);
        return { ...prev, [identityId]: updated };
      });
      if (json.deleted) {
        setIdentities(prev => prev.filter(i => i.id !== identityId));
        setExpandedId(null);
        setMsg({ type: "success", text: "Member removed. Identity group dissolved (fewer than 2 members remain)." });
      } else {
        setMsg({ type: "success", text: "Player unlinked from identity group." });
      }
    } finally {
      setRemoving(null);
    }
  };

  const deleteIdentity = async (identityId: string, name: string) => {
    setDeletingId(identityId);
    setMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/player-identities/${identityId}`, {
        method: "DELETE",
        headers,
      });
      const json = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: json.error || "Failed to delete" }); return; }
      setIdentities(prev => prev.filter(i => i.id !== identityId));
      setExpandedId(null);
      setMsg({ type: "success", text: `Identity group "${name}" deleted.` });
    } finally {
      setDeletingId(null);
    }
  };

  const addMemberToGroup = async (identityId: string, player: PlayerOption) => {
    setMsg(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/player-identities/${identityId}/members`, {
        method: "POST",
        headers,
        body: JSON.stringify({ playerId: player.id }),
      });
      const json = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: json.error || "Failed to add member" }); return; }
      setMembersMap(prev => {
        const updated = [...(prev[identityId] || []), { memberId: "", playerId: player.id, player }];
        return { ...prev, [identityId]: updated };
      });
      setAddingToId(null);
      setAddPlayerSearch("");
      setAddPlayerResults([]);
      setMsg({ type: "success", text: `${player.full_name} added to identity group.` });
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    }
  };

  if (migrationNeeded) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Player Identity Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 dark:text-amber-300 space-y-2">
              <p className="font-semibold">Database migration required</p>
              <p>Run the SQL in <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/migrations/20260625_player_identities.sql</code> in your Supabase dashboard (SQL Editor) to create the <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">player_identities</code> and <code className="font-mono text-xs bg-amber-100 dark:bg-amber-900 px-1 rounded">player_identity_members</code> tables.</p>
              <p>After running the migration, refresh this page.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-orange-200 dark:border-orange-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-orange-900 dark:text-orange-400 flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Player Identity Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Link the same real-world player across multiple leagues. Once linked, photos and profile stats sync automatically.
        </p>

        {msg && (
          <div className={`flex items-center gap-2 p-3 rounded-md text-sm ${
            msg.type === "success"
              ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700"
              : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700"
          }`}>
            {msg.type === "success"
              ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* ── Create new identity group ── */}
        <div className="space-y-3 border border-dashed border-orange-200 dark:border-orange-700 rounded-lg p-4">
          <p className="text-sm font-semibold text-orange-900 dark:text-orange-400 flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create new identity group
          </p>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search players to link…"
              value={playerSearch}
              onChange={e => setPlayerSearch(e.target.value)}
              className="pl-10 border-gray-200 dark:border-gray-600 text-sm"
            />
          </div>

          {(searchingPlayers || playerResults.length > 0) && (
            <div className="border border-gray-200 dark:border-gray-600 rounded-md max-h-40 overflow-y-auto bg-white dark:bg-gray-800">
              {searchingPlayers && (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                </div>
              )}
              {!searchingPlayers && playerResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => addToPending(p)}
                  disabled={!!pendingPlayers.find(x => x.id === p.id)}
                  className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="font-medium text-gray-900 dark:text-white text-sm">{p.full_name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{p.team_name || "–"} · {p.league_id?.slice(0, 8)}</div>
                </button>
              ))}
            </div>
          )}

          {pendingPlayers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Players to link:</p>
              <div className="flex flex-wrap gap-2">
                {pendingPlayers.map(p => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="flex items-center gap-1 pr-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300"
                  >
                    {p.full_name}
                    <button onClick={() => removePending(p.id)} className="ml-1 hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Canonical name</label>
                <Input
                  value={canonicalName}
                  onChange={e => setCanonicalName(e.target.value)}
                  placeholder="Best display name for this person"
                  className="text-sm border-gray-200 dark:border-gray-600"
                />
              </div>

              <Button
                onClick={createIdentity}
                disabled={creating || pendingPlayers.length < 2 || !canonicalName.trim()}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white text-sm"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                Link {pendingPlayers.length} players as one identity
              </Button>
            </div>
          )}
        </div>

        {/* ── Existing identity groups ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search identities…"
                value={identitySearch}
                onChange={e => { setIdentitySearch(e.target.value); fetchIdentities(e.target.value || undefined); }}
                className="pl-10 border-gray-200 dark:border-gray-600 text-sm"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchIdentities(identitySearch || undefined)}
              className="border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-400"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {loadingIdentities ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : identities.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No identity groups yet. Create one above.
            </p>
          ) : (
            <div className="space-y-2">
              {identities.map(identity => (
                <div key={identity.id} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleExpand(identity.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
                  >
                    <div className="flex items-center gap-3">
                      {(identity.photo_path_bg_removed || identity.photo_path) ? (
                        <img
                          src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/player-photos/${identity.photo_path_bg_removed || identity.photo_path}`}
                          alt={identity.canonical_name}
                          className="h-8 w-8 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 text-xs font-bold">
                          {identity.canonical_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{identity.canonical_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); deleteIdentity(identity.id, identity.canonical_name); }}
                        disabled={deletingId === identity.id}
                        className="p-1 text-red-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete identity group"
                      >
                        {deletingId === identity.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                      {expandedId === identity.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </div>
                  </button>

                  {expandedId === identity.id && (
                    <div className="border-t border-gray-200 dark:border-gray-600 px-4 py-3 space-y-3 bg-gray-50 dark:bg-gray-700/30">
                      {loadingMembersFor === identity.id ? (
                        <div className="flex justify-center py-2">
                          <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                        </div>
                      ) : (
                        <>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Linked player records:</p>
                          {(membersMap[identity.id] || []).length === 0 ? (
                            <p className="text-xs text-gray-400">No members loaded.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {(membersMap[identity.id] || []).map(m => (
                                <div
                                  key={m.playerId}
                                  className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-md px-3 py-2 border border-gray-100 dark:border-gray-600"
                                >
                                  <div>
                                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                                      {m.player?.full_name || m.playerId}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                      {m.player?.team_name || "–"} · {m.player?.league_id?.slice(0, 8)}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => removeMember(identity.id, m.playerId)}
                                    disabled={removing === m.playerId}
                                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                                    title="Unlink this player"
                                  >
                                    {removing === m.playerId
                                      ? <Loader2 className="h-4 w-4 animate-spin" />
                                      : <Unlink className="h-4 w-4" />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {addingToId === identity.id ? (
                            <div className="space-y-2 pt-1">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                                <Input
                                  placeholder="Search player to add…"
                                  value={addPlayerSearch}
                                  onChange={e => setAddPlayerSearch(e.target.value)}
                                  className="pl-10 text-sm border-gray-200 dark:border-gray-600"
                                  autoFocus
                                />
                              </div>
                              {(searchingAdd || addPlayerResults.length > 0) && (
                                <div className="border border-gray-200 dark:border-gray-600 rounded-md max-h-36 overflow-y-auto bg-white dark:bg-gray-800">
                                  {searchingAdd ? (
                                    <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-orange-500" /></div>
                                  ) : addPlayerResults.map(p => (
                                    <button
                                      key={p.id}
                                      onClick={() => addMemberToGroup(identity.id, p)}
                                      className="w-full text-left px-3 py-2 hover:bg-orange-50 dark:hover:bg-orange-900/20 border-b border-gray-100 dark:border-gray-700 last:border-b-0 text-sm"
                                    >
                                      <div className="font-medium text-gray-900 dark:text-white">{p.full_name}</div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400">{p.team_name || "–"}</div>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setAddingToId(null); setAddPlayerSearch(""); setAddPlayerResults([]); }}
                                className="text-xs"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setAddingToId(identity.id)}
                              className="text-xs border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-400"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add player to this group
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
