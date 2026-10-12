import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { playerPhotoUrl } from "@/lib/playerPhotos";
import { BTN_GHOST, BTN_PRIMARY, FIELD, Field, HINT, Panel, TALL } from "./studioUi";
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

  const results = "ch-tile divide-y divide-[color:var(--ch-border)] overflow-y-auto";
  const resultRow = "block w-full px-3 py-2 text-left hover:bg-[color:var(--ch-surface-3)] disabled:cursor-not-allowed disabled:opacity-40";
  const searchIcon = "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ch-muted)]";
  const iconBtn = "flex h-8 w-8 flex-none items-center justify-center rounded-md text-[color:var(--ch-muted)] transition hover:bg-[color:var(--ch-surface-3)] hover:text-[color:var(--ch-loss)] disabled:opacity-50";

  if (migrationNeeded) {
    return (
      <Panel title="Player identities" icon={Link2}>
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-2 break-words text-sm text-amber-800 dark:text-amber-300">
            <p className="font-semibold">Database migration required</p>
            <p>Run the SQL in <code className="break-all rounded bg-amber-500/15 px-1 font-mono text-xs">supabase/migrations/20260625_player_identities.sql</code> in your Supabase dashboard (SQL Editor) to create the <code className="break-all rounded bg-amber-500/15 px-1 font-mono text-xs">player_identities</code> and <code className="break-all rounded bg-amber-500/15 px-1 font-mono text-xs">player_identity_members</code> tables.</p>
            <p>After running the migration, refresh this page.</p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Player identities"
      icon={Link2}
      description="Link the same real-world player across multiple leagues. Once linked, photos and profile stats sync automatically."
      bodyClassName="space-y-5"
    >
      {msg && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
            msg.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}
        >
          {msg.type === "success"
            ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
          {msg.text}
        </div>
      )}

      {/* ── Create new identity group ── */}
      <div className="space-y-3 rounded-xl border border-dashed border-[color:var(--ch-border-strong)] p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[color:var(--ch-text)]">
          <Plus className="h-4 w-4 text-[color:var(--ch-accent)]" />
          Create new identity group
        </p>

        <div className="relative">
          <Search className={searchIcon} />
          <input
            placeholder="Search players to link…"
            value={playerSearch}
            onChange={e => setPlayerSearch(e.target.value)}
            className={`${FIELD} pl-9`}
          />
        </div>

        {(searchingPlayers || playerResults.length > 0) && (
          <div className={`${results} max-h-40`}>
            {searchingPlayers && (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-[color:var(--ch-accent)]" />
              </div>
            )}
            {!searchingPlayers && playerResults.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToPending(p)}
                disabled={!!pendingPlayers.find(x => x.id === p.id)}
                className={resultRow}
              >
                <div className="text-sm font-medium text-[color:var(--ch-text)]">{p.full_name}</div>
                <div className="text-xs text-[color:var(--ch-muted)]">{p.team_name || "–"} · {p.league_id?.slice(0, 8)}</div>
              </button>
            ))}
          </div>
        )}

        {pendingPlayers.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[color:var(--ch-text-2)]">Players to link:</p>
              <div className="flex flex-wrap gap-2">
                {pendingPlayers.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ch-accent-soft)] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[color:var(--ch-text)]"
                  >
                    {p.full_name}
                    <button
                      type="button"
                      onClick={() => removePending(p.id)}
                      aria-label={`Remove ${p.full_name}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full hover:text-[color:var(--ch-loss)]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <Field label="Canonical name">
              <input
                value={canonicalName}
                onChange={e => setCanonicalName(e.target.value)}
                placeholder="Best display name for this person"
                className={FIELD}
              />
            </Field>

            <button
              type="button"
              onClick={createIdentity}
              disabled={creating || pendingPlayers.length < 2 || !canonicalName.trim()}
              className={`${BTN_PRIMARY} ${TALL} w-full`}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Link {pendingPlayers.length} players as one identity
            </button>
          </div>
        )}
      </div>

      {/* ── Existing identity groups ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className={searchIcon} />
            <input
              placeholder="Search identities…"
              value={identitySearch}
              onChange={e => { setIdentitySearch(e.target.value); fetchIdentities(e.target.value || undefined); }}
              className={`${FIELD} pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={() => fetchIdentities(identitySearch || undefined)}
            aria-label="Search identities"
            className={`${BTN_GHOST} !h-10 !w-10 flex-none !px-0`}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        {loadingIdentities ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--ch-accent)]" />
          </div>
        ) : identities.length === 0 ? (
          <p className="py-4 text-center text-sm text-[color:var(--ch-text-2)]">
            No identity groups yet. Create one above.
          </p>
        ) : (
          <div className="space-y-2">
            {identities.map(identity => (
              <div key={identity.id} className="ch-tile overflow-hidden">
                <div className="flex items-center gap-1 pr-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(identity.id)}
                    aria-expanded={expandedId === identity.id}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-[color:var(--ch-surface-3)]"
                  >
                    {(identity.photo_path_bg_removed || identity.photo_path) ? (
                      <img
                        src={playerPhotoUrl((identity.photo_path_bg_removed || identity.photo_path)!)}
                        alt={identity.canonical_name}
                        className="h-8 w-8 flex-none rounded-full border border-[color:var(--ch-border)] object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[color:var(--ch-accent-soft)] text-xs font-bold text-[color:var(--ch-accent)]">
                        {identity.canonical_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--ch-text)]">{identity.canonical_name}</span>
                    {expandedId === identity.id
                      ? <ChevronUp className="h-4 w-4 flex-none text-[color:var(--ch-muted)]" />
                      : <ChevronDown className="h-4 w-4 flex-none text-[color:var(--ch-muted)]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteIdentity(identity.id, identity.canonical_name)}
                    disabled={deletingId === identity.id}
                    className={iconBtn}
                    title="Delete identity group"
                    aria-label={`Delete the ${identity.canonical_name} identity group`}
                  >
                    {deletingId === identity.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>

                {expandedId === identity.id && (
                  <div className="space-y-3 border-t border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] px-3 py-3">
                    {loadingMembersFor === identity.id ? (
                      <div className="flex justify-center py-2">
                        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--ch-accent)]" />
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-[color:var(--ch-text-2)]">Linked player records:</p>
                        {(membersMap[identity.id] || []).length === 0 ? (
                          <p className={HINT}>No members loaded.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {(membersMap[identity.id] || []).map(m => (
                              <div
                                key={m.playerId}
                                className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--ch-border)] bg-[color:var(--ch-surface-2)] px-3 py-2"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-[color:var(--ch-text)]">
                                    {m.player?.full_name || m.playerId}
                                  </div>
                                  <div className="truncate text-xs text-[color:var(--ch-muted)]">
                                    {m.player?.team_name || "–"} · {m.player?.league_id?.slice(0, 8)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeMember(identity.id, m.playerId)}
                                  disabled={removing === m.playerId}
                                  className={iconBtn}
                                  title="Unlink this player"
                                  aria-label={`Unlink ${m.player?.full_name || "this player"}`}
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
                              <Search className={searchIcon} />
                              <input
                                placeholder="Search player to add…"
                                value={addPlayerSearch}
                                onChange={e => setAddPlayerSearch(e.target.value)}
                                className={`${FIELD} pl-9`}
                                autoFocus
                              />
                            </div>
                            {(searchingAdd || addPlayerResults.length > 0) && (
                              <div className={`${results} max-h-36`}>
                                {searchingAdd ? (
                                  <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-[color:var(--ch-accent)]" /></div>
                                ) : addPlayerResults.map(p => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => addMemberToGroup(identity.id, p)}
                                    className={resultRow}
                                  >
                                    <div className="text-sm font-medium text-[color:var(--ch-text)]">{p.full_name}</div>
                                    <div className="text-xs text-[color:var(--ch-muted)]">{p.team_name || "–"}</div>
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => { setAddingToId(null); setAddPlayerSearch(""); setAddPlayerResults([]); }}
                              className={BTN_GHOST}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setAddingToId(identity.id)} className={BTN_GHOST}>
                            <Plus className="h-3.5 w-3.5" />
                            Add player to this group
                          </button>
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
    </Panel>
  );
}
