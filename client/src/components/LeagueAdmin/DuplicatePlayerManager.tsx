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
  /** 0-1 from the server matcher. Pairs arrive sorted strongest first. */
  confidence?: number;
  reason?: string;
  /** Matches more than one player, or the squad numbers disagree. */
  ambiguous?: boolean;
  warning?: string;
}

const REASON_LABELS: Record<string, string> = {
  exact: "same name",
  "middle-name": "extra middle name",
  initial: "initial vs full name",
  nickname: "nickname",
  typo: "likely typo",
  hyphenated: "double-barrelled surname",
  "surname-only": "surname only",
};

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
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "bg-red-500/15 text-red-700 dark:text-red-300";

  return (
    <div
      className={`rounded-lg border p-3 ${
        badgeColor === "green" ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-[color:var(--ch-text)] text-sm truncate">{name}</span>
        <span className={`px-1.5 py-0.5 text-xs rounded font-medium flex-shrink-0 ${badgeClasses}`}>
          {badge}
        </span>
      </div>
      {stats.loading ? (
        <div className="flex items-center gap-1.5 text-xs text-[color:var(--ch-muted)]">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[color:var(--ch-muted)] border-t-transparent" />
          Loading stats…
        </div>
      ) : stats.error ? (
        <p className="text-xs text-[color:var(--ch-muted)] italic">Stats unavailable</p>
      ) : stats.gp === 0 ? (
        <p className="text-xs text-[color:var(--ch-muted)] italic">No stats recorded</p>
      ) : (
        <div className="grid grid-cols-4 gap-1 text-center">
          {[
            { label: "GP", value: stats.gp.toString() },
            { label: "PPG", value: stats.ppg.toFixed(1) },
            { label: "RPG", value: stats.rpg.toFixed(1) },
            { label: "APG", value: stats.apg.toFixed(1) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-base font-bold text-[color:var(--ch-text)]">{value}</div>
              <div className="text-[10px] text-[color:var(--ch-text-2)] uppercase tracking-wide">{label}</div>
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
  const [nameSearch, setNameSearch] = useState("");
  const [namePlayer, setNamePlayer] = useState<Player | null>(null);
  const [correctedName, setCorrectedName] = useState("");
  const [savingName, setSavingName] = useState(false);

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
  const filteredNamePlayers = players.filter(
    (p) =>
      nameSearch.length >= 2 &&
      getDisplayName(p).toLowerCase().includes(nameSearch.toLowerCase())
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

  const saveCorrectedName = async () => {
    if (!namePlayer || !correctedName.trim()) return;
    setSavingName(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const token = await getToken();
      if (!token) { setErrorMsg("Not authenticated"); return; }
      const res = await fetch(`/api/leagues/${leagueId}/players/${namePlayer.id}/name`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fullName: correctedName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error || "Failed to update player name"); return; }

      const updatedPlayer = data.player as Player;
      setPlayers((prev) => prev.map((p) => p.id === updatedPlayer.id ? { ...p, ...updatedPlayer } : p));
      setPairs((prev) => prev.map((pair) => ({
        ...pair,
        canonicalName: pair.canonicalId === updatedPlayer.id ? updatedPlayer.full_name : pair.canonicalName,
        duplicateName: pair.duplicateId === updatedPlayer.id ? updatedPlayer.full_name : pair.duplicateName,
      })));
      setNamePlayer(updatedPlayer);
      setCorrectedName(updatedPlayer.full_name);
      setNameSearch("");
      setSuccessMsg(`Player name updated to "${updatedPlayer.full_name}". The league page will now use this name.`);
    } catch (e: any) {
      setErrorMsg(e.message);
    } finally {
      setSavingName(false);
    }
  };

  const loadingPlaceholder: PlayerStatPreview = { gp: 0, ppg: 0, rpg: 0, apg: 0, loading: true, error: false };

  return (
    <div className="ch-card md:col-span-2 p-4 sm:p-5">
      <button
        onClick={handleExpand}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[color:var(--ch-accent-soft)]">
            <svg className="w-5 h-5 text-[color:var(--ch-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <h2 className="ch-display text-[1.4rem] font-bold uppercase leading-none tracking-tight text-[color:var(--ch-text)]">Player Names & Duplicates</h2>
            <p className="mt-1.5 text-[13px] text-[color:var(--ch-text-2)]">Correct displayed names and merge duplicate player records</p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-[color:var(--ch-muted)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-6 space-y-6">
          {successMsg && (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-700 dark:text-emerald-300 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {successMsg}
              <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-600 dark:text-emerald-400 hover:opacity-80">×</button>
            </div>
          )}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-700 dark:text-red-300 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {errorMsg}
              <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-600 dark:text-red-400 hover:opacity-80">×</button>
            </div>
          )}

          <div>
            <h3 className="font-semibold text-[color:var(--ch-text)] mb-1">Correct a Player Name</h3>
            <p className="text-xs text-[color:var(--ch-text-2)] mb-4">
              This is the one place to correct the name shown across the league page. A first initial is allowed, for example J. Smith.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
              <div className="relative">
                <label className="block text-xs font-medium text-[color:var(--ch-text-2)] mb-1">Find player</label>
                <input
                  type="text"
                  placeholder="Search current name…"
                  value={namePlayer ? getDisplayName(namePlayer) : nameSearch}
                  onChange={(e) => {
                    setNamePlayer(null);
                    setCorrectedName("");
                    setNameSearch(e.target.value);
                  }}
                  className="ch-input h-10 w-full px-3 text-sm"
                />
                {!namePlayer && filteredNamePlayers.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-[10px] border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] shadow-[var(--ch-shadow-lg)]">
                    {filteredNamePlayers.slice(0, 20).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => {
                          setNamePlayer(p);
                          setCorrectedName(getDisplayName(p));
                          setNameSearch("");
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text)]"
                      >
                        {getDisplayName(p)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[color:var(--ch-text-2)] mb-1">Correct display name</label>
                <input
                  type="text"
                  placeholder="First name or initial + surname"
                  value={correctedName}
                  onChange={(e) => setCorrectedName(e.target.value)}
                  disabled={!namePlayer}
                  className="ch-input h-10 w-full px-3 text-sm disabled:opacity-60"
                />
              </div>

              <button
                type="button"
                onClick={saveCorrectedName}
                disabled={!namePlayer || !correctedName.trim() || savingName}
                className="ch-btn ch-btn-primary justify-center disabled:pointer-events-none disabled:opacity-50 !h-10 w-full sm:w-auto"
              >
                {savingName && <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                Save Name
              </button>
            </div>
          </div>

          {/* Auto-detected duplicates */}
          <div className="border-t border-[color:var(--ch-border)] pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[color:var(--ch-text)]">Auto-detected Duplicates</h3>
              <button
                onClick={loadDuplicates}
                disabled={loadingPairs}
                className="flex items-center gap-1 text-sm font-medium text-[color:var(--ch-accent)] hover:opacity-80 disabled:opacity-50"
              >
                {loadingPairs ? (
                  <>
                    <div className="w-3 h-3 border-2 border-[color:var(--ch-accent)] border-t-transparent rounded-full animate-spin" />
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
              <div className="flex items-center justify-center py-8 text-[color:var(--ch-text-2)] text-sm">
                <div className="w-5 h-5 border-2 border-[color:var(--ch-accent)] border-t-transparent rounded-full animate-spin mr-2" />
                Scanning for duplicate names…
              </div>
            ) : pairs.length === 0 ? (
              <div className="text-center py-8 text-[color:var(--ch-text-2)]">
                <svg className="w-10 h-10 mx-auto mb-2 text-[color:var(--ch-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm font-medium">No duplicates detected</p>
                <p className="text-xs text-[color:var(--ch-muted)] mt-1">All player records appear to be unique.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[color:var(--ch-text-2)] mb-3">
                  {pairs.length} potential duplicate pair{pairs.length !== 1 ? "s" : ""} found, strongest match first.
                  Review each and click Merge to consolidate records.
                  {pairs.some((p) => p.ambiguous) && (
                    <> Pairs marked <span className="font-medium text-amber-700 dark:text-amber-300">check carefully</span> matched on weak
                    evidence — confirm they are the same person before merging.</>
                  )}
                </p>
                {pairs.map((pair) => (
                  <div key={pair.duplicateId} className="ch-tile flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium text-[color:var(--ch-text)] truncate">{pair.canonicalName}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded font-medium flex-shrink-0">keep</span>
                        <svg className="w-4 h-4 text-[color:var(--ch-muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <span className="font-medium text-[color:var(--ch-text-2)] truncate">{pair.duplicateName}</span>
                        <span className="px-1.5 py-0.5 text-xs bg-red-500/15 text-red-700 dark:text-red-300 rounded font-medium flex-shrink-0">merge</span>
                        {pair.reason && (
                          <span className="px-1.5 py-0.5 text-xs bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text-2)] rounded flex-shrink-0">
                            {REASON_LABELS[pair.reason] || pair.reason}
                          </span>
                        )}
                        {pair.ambiguous && (
                          <span className="px-1.5 py-0.5 text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 dark:text-amber-300 rounded font-medium flex-shrink-0">
                            check carefully
                          </span>
                        )}
                      </div>
                      {pair.warning && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{pair.warning}</p>
                      )}
                      {pair.statsToRepoint > 0 && (
                        <p className="text-xs text-[color:var(--ch-muted)] mt-0.5">
                          {pair.statsToRepoint} stat row{pair.statsToRepoint !== 1 ? "s" : ""} will be re-pointed
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmPair(pair)}
                      disabled={mergingId === pair.duplicateId}
                      className="ch-btn ch-btn-primary justify-center disabled:pointer-events-none disabled:opacity-50 w-full sm:w-auto sm:flex-shrink-0"
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
          <div className="border-t border-[color:var(--ch-border)] pt-6">
            <h3 className="font-semibold text-[color:var(--ch-text)] mb-1">Manual Merge</h3>
            <p className="text-xs text-[color:var(--ch-text-2)] mb-4">Force-merge any two players the algorithm may have missed.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Player 1 (canonical / keep) */}
              <div ref={dropdown1Ref} className="relative">
                <label className="block text-xs font-medium text-[color:var(--ch-text-2)] mb-1">
                  Player to keep <span className="text-emerald-600 dark:text-emerald-400">(canonical)</span>
                </label>
                {manualPlayer1 ? (
                  <div className="flex items-center gap-2 p-2 border border-emerald-500/30 bg-emerald-500/10 rounded-lg text-sm">
                    <span className="flex-1 font-medium text-[color:var(--ch-text)] truncate">{getDisplayName(manualPlayer1)}</span>
                    <button onClick={() => { setManualPlayer1(null); setManualSearch1(""); }} className="text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)] flex-shrink-0">
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
                      className="ch-input h-10 w-full px-3 text-sm"
                    />
                    {showDropdown1 && filteredPlayers1.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-[10px] border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] shadow-[var(--ch-shadow-lg)]">
                        {filteredPlayers1.slice(0, 20).map((p) => (
                          <button
                            key={p.id}
                            onMouseDown={() => { setManualPlayer1(p); setManualSearch1(""); setShowDropdown1(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text)]"
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
                <label className="block text-xs font-medium text-[color:var(--ch-text-2)] mb-1">
                  Player to remove <span className="text-red-600 dark:text-red-400">(duplicate)</span>
                </label>
                {manualPlayer2 ? (
                  <div className="flex items-center gap-2 p-2 border border-red-500/30 bg-red-500/10 rounded-lg text-sm">
                    <span className="flex-1 font-medium text-[color:var(--ch-text)] truncate">{getDisplayName(manualPlayer2)}</span>
                    <button onClick={() => { setManualPlayer2(null); setManualSearch2(""); }} className="text-[color:var(--ch-muted)] hover:text-[color:var(--ch-text)] flex-shrink-0">
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
                      className="ch-input h-10 w-full px-3 text-sm"
                    />
                    {showDropdown2 && filteredPlayers2.length > 0 && (
                      <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-[10px] border border-[color:var(--ch-border-strong)] bg-[color:var(--ch-surface)] shadow-[var(--ch-shadow-lg)]">
                        {filteredPlayers2.slice(0, 20).map((p) => (
                          <button
                            key={p.id}
                            onMouseDown={() => { setManualPlayer2(p); setManualSearch2(""); setShowDropdown2(false); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-[color:var(--ch-surface-3)] text-[color:var(--ch-text)]"
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
              <p className="text-xs text-[color:var(--ch-muted)] mt-2">Loading player list…</p>
            )}

            {manualPlayer1 && manualPlayer2 && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm text-amber-700 dark:text-amber-300 dark:text-amber-300">
                  All stats from <strong>{getDisplayName(manualPlayer2)}</strong> will be moved to{" "}
                  <strong>{getDisplayName(manualPlayer1)}</strong>, then the duplicate record will be deleted.
                </p>
                <button
                  onClick={() => setConfirmManual(true)}
                  disabled={mergingId === "manual"}
                  className="ch-btn ch-btn-primary justify-center disabled:pointer-events-none disabled:opacity-50 mt-3"
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
          <div className="w-full max-w-md rounded-[14px] border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-6 shadow-[var(--ch-shadow-lg)]">
            <h3 className="text-lg font-semibold text-[color:var(--ch-text)] mb-1">Confirm Merge</h3>
            <p className="text-sm text-[color:var(--ch-text-2)] mb-4">
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

            <p className="text-xs text-[color:var(--ch-text-2)] mb-1">
              {confirmPair.statsToRepoint > 0 && (
                <>{confirmPair.statsToRepoint} stat row{confirmPair.statsToRepoint !== 1 ? "s" : ""} will be re-pointed. </>
              )}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmPair(null)}
                className="ch-btn ch-btn-ghost justify-center disabled:pointer-events-none disabled:opacity-50 !h-10 flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => executeMerge(confirmPair)}
                disabled={!!mergingId}
                className="ch-btn ch-btn-primary justify-center disabled:pointer-events-none disabled:opacity-50 !h-10 flex-1"
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
          <div className="w-full max-w-md rounded-[14px] border border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] p-6 shadow-[var(--ch-shadow-lg)]">
            <h3 className="text-lg font-semibold text-[color:var(--ch-text)] mb-1">Confirm Manual Merge</h3>
            <p className="text-sm text-[color:var(--ch-text-2)] mb-4">
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

            <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmManual(false)}
                className="ch-btn ch-btn-ghost justify-center disabled:pointer-events-none disabled:opacity-50 !h-10 flex-1"
              >
                Cancel
              </button>
              <button
                onClick={executeManualMerge}
                disabled={mergingId === "manual"}
                className="ch-btn ch-btn-primary justify-center disabled:pointer-events-none disabled:opacity-50 !h-10 flex-1"
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
