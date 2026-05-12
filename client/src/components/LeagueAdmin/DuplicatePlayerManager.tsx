import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";

interface DuplicatePair {
  canonicalId: string;
  canonicalName: string;
  canonicalSlug?: string;
  duplicateId: string;
  duplicateName: string;
  duplicateSlug?: string;
  statsToRepoint: number;
}

interface Player {
  id: string;
  full_name: string;
  slug?: string;
  league_id: string;
}

interface PlayerStatPreview {
  gp: number;
  ppg: number;
  rpg: number;
  apg: number;
  loading: boolean;
  error: boolean;
}

interface Props {
  leagueId: string;
}

interface PlayerStatRow {
  spoints: number | null;
  sreboundstotal: number | null;
  sassists: number | null;
  game_key: string | null;
}

async function fetchPlayerStatPreview(
  playerId: string,
  leagueId: string
): Promise<PlayerStatPreview> {
  const { data, error } = await supabase
    .from("player_stats")
    .select("spoints, sreboundstotal, sassists, game_key")
    .eq("player_id", playerId);

  if (error || !data) {
    return { gp: 0, ppg: 0, rpg: 0, apg: 0, loading: false, error: true };
  }

  const rows = data as PlayerStatRow[];
  const uniqueGames = new Set(rows.map((r) => r.game_key).filter((k): k is string => !!k)).size;
  const gp = uniqueGames || rows.length;
  if (gp === 0) {
    return { gp: 0, ppg: 0, rpg: 0, apg: 0, loading: false, error: false };
  }

  const totPts = rows.reduce((s, r) => s + (r.spoints ?? 0), 0);
  const totReb = rows.reduce((s, r) => s + (r.sreboundstotal ?? 0), 0);
  const totAst = rows.reduce((s, r) => s + (r.sassists ?? 0), 0);

  return {
    gp,
    ppg: totPts / gp,
    rpg: totReb / gp,
    apg: totAst / gp,
    loading: false,
    error: false,
  };
}

function StatCard({
  name,
  badge,
  badgeColor,
  stats,
}: {
  name: string;
  badge: string;
  badgeColor: "green" | "red";
  stats: PlayerStatPreview;
}) {
  const badgeClasses =
    badgeColor === "green"
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-700";

  return (
    <div
      className={`rounded-lg border p-3 ${
        badgeColor === "green" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-gray-800 text-sm truncate">{name}</span>
        <span className={`px-1.5 py-0.5 text-xs rounded font-medium flex-shrink-0 ${badgeClasses}`}>
          {badge}
        </span>
      </div>
      {stats.loading ? (
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <div className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
          Loading stats…
        </div>
      ) : stats.error ? (
        <p className="text-xs text-gray-400 italic">Stats unavailable</p>
      ) : stats.gp === 0 ? (
        <p className="text-xs text-gray-400 italic">No stats recorded</p>
      ) : (
        <div className="grid grid-cols-4 gap-1 text-center">
          {[
            { label: "GP", value: stats.gp.toString() },
            { label: "PPG", value: stats.ppg.toFixed(1) },
            { label: "RPG", value: stats.rpg.toFixed(1) },
            { label: "APG", value: stats.apg.toFixed(1) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-base font-bold text-gray-800">{value}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DuplicatePlayerManager({ leagueId }: Props) {
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [confirmPair, setConfirmPair] = useState<DuplicatePair | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Preview stats for confirmation modals: keyed by player id
  const [previewStats, setPreviewStats] = useState<Record<string, PlayerStatPreview>>({});

  // Manual merge state
  const [manualSearch1, setManualSearch1] = useState("");
  const [manualSearch2, setManualSearch2] = useState("");
  const [manualPlayer1, setManualPlayer1] = useState<Player | null>(null);
  const [manualPlayer2, setManualPlayer2] = useState<Player | null>(null);
  const [showDropdown1, setShowDropdown1] = useState(false);
  const [showDropdown2, setShowDropdown2] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const dropdown1Ref = useRef<HTMLDivElement>(null);
  const dropdown2Ref = useRef<HTMLDivElement>(null);

  const getDisplayName = (p: Player) => p.full_name || "(unnamed)";

  const filteredPlayers1 = players.filter(
    (p) =>
      manualSearch1.length >= 2 &&
      getDisplayName(p).toLowerCase().includes(manualSearch1.toLowerCase()) &&
      p.id !== manualPlayer2?.id
  );
  const filteredPlayers2 = players.filter(
    (p) =>
      manualSearch2.length >= 2 &&
      getDisplayName(p).toLowerCase().includes(manualSearch2.toLowerCase()) &&
      p.id !== manualPlayer1?.id
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdown1Ref.current && !dropdown1Ref.current.contains(e.target as Node)) {
        setShowDropdown1(false);
      }
      if (dropdown2Ref.current && !dropdown2Ref.current.contains(e.target as Node)) {
        setShowDropdown2(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Clear preview cache when leagueId changes to avoid cross-league stale stats
  useEffect(() => {
    setPreviewStats({});
  }, [leagueId]);

  // Fetch preview stats whenever a confirmation modal opens.
  // Cache key uses leagueId:playerId to avoid cross-league stale data.
  // Errored entries are not cached so reopening the modal retries the fetch.
  useEffect(() => {
    if (!confirmPair) return;
    const ids = [confirmPair.canonicalId, confirmPair.duplicateId];
    ids.forEach((id) => {
      const cacheKey = `${leagueId}:${id}`;
      const cached = previewStats[cacheKey];
      if (cached && !cached.error) return;
      setPreviewStats((prev) => ({ ...prev, [cacheKey]: { gp: 0, ppg: 0, rpg: 0, apg: 0, loading: true, error: false } }));
      fetchPlayerStatPreview(id, leagueId).then((stats) =>
        setPreviewStats((prev) => ({ ...prev, [cacheKey]: stats }))
      );
    });
  }, [confirmPair, leagueId]);

  useEffect(() => {
    if (!confirmManual || !manualPlayer1 || !manualPlayer2) return;
    const ids = [manualPlayer1.id, manualPlayer2.id];
    ids.forEach((id) => {
      const cacheKey = `${leagueId}:${id}`;
      const cached = previewStats[cacheKey];
      if (cached && !cached.error) return;
      setPreviewStats((prev) => ({ ...prev, [cacheKey]: { gp: 0, ppg: 0, rpg: 0, apg: 0, loading: true, error: false } }));
      fetchPlayerStatPreview(id, leagueId).then((stats) =>
        setPreviewStats((prev) => ({ ...prev, [cacheKey]: stats }))
      );
    });
  }, [confirmManual, leagueId, manualPlayer1, manualPlayer2]);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  };

  const loadDuplicates = async () => {
    setLoadingPairs(true);
    setErrorMsg(null);
    try {
      const token = await getToken();
      if (!token) { setErrorMsg("Not authenticated"); return; }
      const res = await fetch(`/api/leagues/${leagueId}/duplicate-players`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "Failed to load duplicates"); return; }
      setPairs(data.pairs || []);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setLoadingPairs(false);
    }
  };

  const loadPlayers = async () => {
    setLoadingPlayers(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/leagues/${leagueId}/players`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setPlayers(data.players || []);
    } catch (e) {
    } finally {
      setLoadingPlayers(false);
    }
  };

  const handleExpand = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      loadDuplicates();
      loadPlayers();
    } else {
      setIsExpanded(false);
    }
  };

  const executeMerge = async (pair: DuplicatePair) => {
    setMergingId(pair.duplicateId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = await getToken();
      if (!token) { setErrorMsg("Not authenticated"); return; }
      const res = await fetch(`/api/leagues/${leagueId}/merge-players`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ canonicalId: pair.canonicalId, duplicateId: pair.duplicateId }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "Merge failed"); return; }
      setSuccessMsg(`Merged "${data.duplicateName}" into "${data.canonicalName}"`);
      setPairs((prev) => prev.filter((p) => p.duplicateId !== pair.duplicateId));
      setPlayers((prev) => prev.filter((p) => p.id !== pair.duplicateId));
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setMergingId(null);
      setConfirmPair(null);
    }
  };

  const executeManualMerge = async () => {
    if (!manualPlayer1 || !manualPlayer2) return;
    setMergingId("manual");
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = await getToken();
      if (!token) { setErrorMsg("Not authenticated"); return; }
      const res = await fetch(`/api/leagues/${leagueId}/merge-players`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ canonicalId: manualPlayer1.id, duplicateId: manualPlayer2.id }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "Merge failed"); return; }
      setSuccessMsg(`Merged "${getDisplayName(manualPlayer2)}" into "${getDisplayName(manualPlayer1)}"`);
      setManualPlayer1(null);
      setManualPlayer2(null);
      setManualSearch1("");
      setManualSearch2("");
      setConfirmManual(false);
      setPairs((prev) => prev.filter((p) => p.duplicateId !== manualPlayer2.id));
      setPlayers((prev) => prev.filter((p) => p.id !== manualPlayer2.id));
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setMergingId(null);
    }
  };

  const loadingPlaceholder: PlayerStatPreview = { gp: 0, ppg: 0, rpg: 0, apg: 0, loading: true, error: false };

  return (
    <div className="md:col-span-2 bg-white rounded-xl shadow p-4 md:p-6">
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold text-gray-800">Duplicate Players</h2>
            <p className="text-xs md:text-sm text-gray-600">Find and merge duplicate player records in your league</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-6 space-y-6">
          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {successMsg}
              <button onClick={() => setSuccessMsg(null)} className="ml-auto text-green-500 hover:text-green-700">×</button>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {errorMsg}
              <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
            </div>
          )}

          {/* Auto-detected duplicates */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Auto-detected Duplicates</h3>
              <button
                onClick={loadDuplicates}
                disabled={loadingPairs}
                className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1 disabled:opacity-50"
              >
                {loadingPairs ? (
                  <>
                    <div className="w-3 h-3 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </>
                )}
              </button>
            </div>

            {loadingPairs ? (
              <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2" />
                Scanning for duplicate names…
              </div>
            ) : pairs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm font-medium">No duplicates detected</p>
                <p className="text-xs text-gray-400 mt-1">All player records appear to be unique.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-3">
                  {pairs.length} potential duplicate pair{pairs.length !== 1 ? "s" : ""} found. Review each and click Merge to consolidate records.
                </p>
                {pairs.map((pair) => (
                  <div key={pair.duplicateId} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-gray-800 truncate">{pair.canonicalName}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded font-medium flex-shrink-0">keep</span>
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <span className="font-medium text-gray-600 truncate">{pair.duplicateName}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded font-medium flex-shrink-0">merge</span>
                      </div>
                      {pair.statsToRepoint > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {pair.statsToRepoint} stat row{pair.statsToRepoint !== 1 ? "s" : ""} will be re-pointed
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmPair(pair)}
                      disabled={mergingId === pair.duplicateId}
                      className="sm:flex-shrink-0 w-full sm:w-auto px-3 py-1.5 text-sm bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {mergingId === pair.duplicateId ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : null}
                      Merge
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual merge */}
          <div className="border-t pt-6">
            <h3 className="font-semibold text-gray-800 mb-1">Manual Merge</h3>
            <p className="text-xs text-gray-500 mb-4">Force-merge any two players the algorithm may have missed.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Player 1 (canonical / keep) */}
              <div ref={dropdown1Ref} className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Player to keep <span className="text-green-600">(canonical)</span>
                </label>
                {manualPlayer1 ? (
                  <div className="flex items-center gap-2 p-2 border border-green-300 bg-green-50 rounded-lg text-sm">
                    <span className="flex-1 font-medium text-gray-800 truncate">{getDisplayName(manualPlayer1)}</span>
                    <button onClick={() => { setManualPlayer1(null); setManualSearch1(""); }} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search player name…"
                      value={manualSearch1}
                      onChange={(e) => { setManualSearch1(e.target.value); setShowDropdown1(true); }}
                      onFocus={() => setShowDropdown1(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {showDropdown1 && filteredPlayers1.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredPlayers1.slice(0, 20).map((p) => (
                          <button
                            key={p.id}
                            onMouseDown={() => { setManualPlayer1(p); setManualSearch1(""); setShowDropdown1(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 text-gray-800"
                          >
                            {getDisplayName(p)}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Player 2 (duplicate / merge) */}
              <div ref={dropdown2Ref} className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Player to remove <span className="text-red-600">(duplicate)</span>
                </label>
                {manualPlayer2 ? (
                  <div className="flex items-center gap-2 p-2 border border-red-300 bg-red-50 rounded-lg text-sm">
                    <span className="flex-1 font-medium text-gray-800 truncate">{getDisplayName(manualPlayer2)}</span>
                    <button onClick={() => { setManualPlayer2(null); setManualSearch2(""); }} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search player name…"
                      value={manualSearch2}
                      onChange={(e) => { setManualSearch2(e.target.value); setShowDropdown2(true); }}
                      onFocus={() => setShowDropdown2(true)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    {showDropdown2 && filteredPlayers2.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredPlayers2.slice(0, 20).map((p) => (
                          <button
                            key={p.id}
                            onMouseDown={() => { setManualPlayer2(p); setManualSearch2(""); setShowDropdown2(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 text-gray-800"
                          >
                            {getDisplayName(p)}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {loadingPlayers && (
              <p className="text-xs text-gray-400 mt-2">Loading player list…</p>
            )}

            {manualPlayer1 && manualPlayer2 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  All stats from <strong>{getDisplayName(manualPlayer2)}</strong> will be moved to{" "}
                  <strong>{getDisplayName(manualPlayer1)}</strong>, then the duplicate record will be deleted.
                </p>
                <button
                  onClick={() => setConfirmManual(true)}
                  disabled={mergingId === "manual"}
                  className="mt-3 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  Merge Players
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation modal for auto-detected pair */}
      {confirmPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Confirm Merge</h3>
            <p className="text-sm text-gray-500 mb-4">
              Verify these are the same person before merging. Stats will be permanently combined.
            </p>

            {/* Stats preview */}
            <div className="space-y-2 mb-4">
              <StatCard
                name={confirmPair.canonicalName}
                badge="keep"
                badgeColor="green"
                stats={previewStats[`${leagueId}:${confirmPair.canonicalId}`] ?? loadingPlaceholder}
              />
              <StatCard
                name={confirmPair.duplicateName}
                badge="merge"
                badgeColor="red"
                stats={previewStats[`${leagueId}:${confirmPair.duplicateId}`] ?? loadingPlaceholder}
              />
            </div>

            <p className="text-xs text-gray-500 mb-1">
              {confirmPair.statsToRepoint > 0 && (
                <>{confirmPair.statsToRepoint} stat row{confirmPair.statsToRepoint !== 1 ? "s" : ""} will be re-pointed. </>
              )}
            </p>
            <p className="text-xs text-red-600 font-medium mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPair(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => executeMerge(confirmPair)}
                disabled={!!mergingId}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {mergingId ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                Merge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal for manual merge */}
      {confirmManual && manualPlayer1 && manualPlayer2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Confirm Manual Merge</h3>
            <p className="text-sm text-gray-500 mb-4">
              Verify these are the same person before merging. Stats will be permanently combined.
            </p>

            {/* Stats preview */}
            <div className="space-y-2 mb-4">
              <StatCard
                name={getDisplayName(manualPlayer1)}
                badge="keep"
                badgeColor="green"
                stats={previewStats[`${leagueId}:${manualPlayer1.id}`] ?? loadingPlaceholder}
              />
              <StatCard
                name={getDisplayName(manualPlayer2)}
                badge="merge"
                badgeColor="red"
                stats={previewStats[`${leagueId}:${manualPlayer2.id}`] ?? loadingPlaceholder}
              />
            </div>

            <p className="text-xs text-red-600 font-medium mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmManual(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={executeManualMerge}
                disabled={mergingId === "manual"}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {mergingId === "manual" ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
