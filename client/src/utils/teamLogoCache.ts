import { supabase } from "@/lib/supabase";
import { fetchLeagueChildren } from "@/lib/leagueChildren";
import { DEBUG, debugLog } from "./debug";

const logoCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();
const dbLogosCache = new Map<string, Map<string, string>>();
const dbLogosFetching = new Map<string, Promise<Map<string, string>>>();
const parentLeagueCache = new Map<string, string | null>();
const parentLeagueFetching = new Map<string, Promise<string | null>>();
const childLeagueIdsCache = new Map<string, string[]>();
const childLeagueIdsFetching = new Map<string, Promise<string[]>>();
const serverLogoMapCache = new Map<string, Record<string, string>>();
const serverLogoMapFetching = new Map<string, Promise<Record<string, string>>>();

async function getParentLeagueId(leagueId: string): Promise<string | null> {
  if (parentLeagueCache.has(leagueId)) {
    return parentLeagueCache.get(leagueId)!;
  }
  if (parentLeagueFetching.has(leagueId)) {
    return parentLeagueFetching.get(leagueId)!;
  }
  const fetchPromise = (async () => {
    try {
      const { data } = await supabase
        .from('leagues')
        .select('parent_league_id')
        .eq('league_id', leagueId)
        .single();
      const parentId = data?.parent_league_id || null;
      parentLeagueCache.set(leagueId, parentId);
      parentLeagueFetching.delete(leagueId);
      return parentId;
    } catch {
      // fall through to null
    }
    parentLeagueCache.set(leagueId, null);
    parentLeagueFetching.delete(leagueId);
    return null;
  })();
  parentLeagueFetching.set(leagueId, fetchPromise);
  return fetchPromise;
}

async function getChildLeagueIds(leagueId: string): Promise<string[]> {
  if (childLeagueIdsCache.has(leagueId)) {
    return childLeagueIdsCache.get(leagueId)!;
  }
  if (childLeagueIdsFetching.has(leagueId)) {
    return childLeagueIdsFetching.get(leagueId)!;
  }
  const fetchPromise = (async () => {
    try {
      const data = await fetchLeagueChildren(leagueId);
      const ids = data.map((r) => r.league_id).filter(Boolean);
      childLeagueIdsCache.set(leagueId, ids);
      childLeagueIdsFetching.delete(leagueId);
      return ids;
    } catch {
      childLeagueIdsCache.set(leagueId, []);
      childLeagueIdsFetching.delete(leagueId);
      return [];
    }
  })();
  childLeagueIdsFetching.set(leagueId, fetchPromise);
  return fetchPromise;
}

export function normalizeTeamName(name: string): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "");
}

function normalizeTeamNameForFile(name: string): string {
  let normalized = name.trim();
  normalized = normalized.replace(/\s+Senior\s+Men\s*/gi, " ");
  normalized = normalized.replace(/!/g, "");
  normalized = normalized.replace(/\s+I(?![IVX])\s*$/i, "");
  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized.replace(/\s+/g, "_");
}

async function getDbLogosForLeague(leagueId: string): Promise<Map<string, string>> {
  if (dbLogosCache.has(leagueId)) {
    return dbLogosCache.get(leagueId)!;
  }

  if (dbLogosFetching.has(leagueId)) {
    return dbLogosFetching.get(leagueId)!;
  }

  const fetchPromise = (async () => {
    const map = new Map<string, string>();
    try {
      const { data } = await supabase
        .from('teams')
        .select('name, logo_url')
        .eq('league_id', leagueId)
        .not('logo_url', 'is', null);
      (data || []).forEach((row: { name: string; logo_url: string }) => {
        if (row.name && row.logo_url) {
          map.set(row.name, row.logo_url);
          map.set(normalizeTeamName(row.name), row.logo_url);
        }
      });
    } catch (err) {
      debugLog("[TeamLogoCache] Error fetching team logo_urls:", err);
    }
    dbLogosCache.set(leagueId, map);
    dbLogosFetching.delete(leagueId);
    return map;
  })();

  dbLogosFetching.set(leagueId, fetchPromise);
  return fetchPromise;
}

async function getServerLogoMap(leagueId: string): Promise<Record<string, string>> {
  if (serverLogoMapCache.has(leagueId)) {
    return serverLogoMapCache.get(leagueId)!;
  }
  if (serverLogoMapFetching.has(leagueId)) {
    return serverLogoMapFetching.get(leagueId)!;
  }
  const fetchPromise = (async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/team-logos`);
      if (res.ok) {
        const map: Record<string, string> = await res.json();
        serverLogoMapCache.set(leagueId, map);
        serverLogoMapFetching.delete(leagueId);
        return map;
      }
    } catch {
      // fall through
    }
    serverLogoMapCache.set(leagueId, {});
    serverLogoMapFetching.delete(leagueId);
    return {};
  })();
  serverLogoMapFetching.set(leagueId, fetchPromise);
  return fetchPromise;
}

function findInLogoMap(map: Record<string, string>, teamName: string): string | undefined {
  if (map[teamName]) return map[teamName];
  const lower = teamName.toLowerCase();
  const entry = Object.entries(map).find(([k]) => k.toLowerCase() === lower);
  return entry?.[1];
}

interface GetTeamLogoCachedArgs {
  leagueId: string;
  teamName: string;
  bucket?: string;
  extraLeagueIds?: string[];
}

export async function getTeamLogoCached(
  args: GetTeamLogoCachedArgs
): Promise<string | null> {
  const { leagueId, teamName, extraLeagueIds } = args;

  if (!leagueId || !teamName) {
    return null;
  }

  const cacheKey = `${leagueId}::${normalizeTeamName(teamName)}`;

  if (logoCache.has(cacheKey)) {
    return logoCache.get(cacheKey)!;
  }

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey)!;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    try {
      const parentId = await getParentLeagueId(leagueId);
      const childIds = await getChildLeagueIds(leagueId);

      const leagueIdsToTry: string[] = [];
      const seenLeagueIds = new Set<string>();
      const pushLeagueId = (id?: string | null) => {
        if (!id || seenLeagueIds.has(id)) return;
        seenLeagueIds.add(id);
        leagueIdsToTry.push(id);
      };
      pushLeagueId(leagueId);
      pushLeagueId(parentId);
      childIds.forEach(pushLeagueId);
      if (extraLeagueIds) extraLeagueIds.forEach(pushLeagueId);

      // Step 1: check team_logos DB table via server endpoint
      let dbUrl: string | undefined;
      for (const tryLeagueId of leagueIdsToTry) {
        const dbLogos = await getDbLogosForLeague(tryLeagueId);
        const found = dbLogos.get(teamName) || dbLogos.get(normalizeTeamName(teamName));
        if (found) {
          dbUrl = found;
          break;
        }
      }

      if (dbUrl) {
        debugLog(`[TeamLogoCache] Found logo in DB for "${teamName}"`);
        logoCache.set(cacheKey, dbUrl);
        inFlight.delete(cacheKey);
        return dbUrl;
      }

      // Step 2: use server-side storage probing (no browser HEAD requests)
      for (const tryLeagueId of leagueIdsToTry) {
        const serverMap = await getServerLogoMap(tryLeagueId);
        const url = findInLogoMap(serverMap, teamName);
        if (url) {
          debugLog(`[TeamLogoCache] Found logo via server map for "${teamName}" in league ${tryLeagueId}`);
          logoCache.set(cacheKey, url);
          inFlight.delete(cacheKey);
          return url;
        }
        // Also try normalised file-name variants against the server map keys
        const variants = [
          normalizeTeamNameForFile(teamName),
          teamName.replace(/\s+/g, "_"),
        ];
        for (const variant of variants) {
          const varEntry = findInLogoMap(serverMap, variant.replace(/_/g, " "));
          if (varEntry) {
            logoCache.set(cacheKey, varEntry);
            inFlight.delete(cacheKey);
            return varEntry;
          }
        }
      }

      logoCache.set(cacheKey, null);
      inFlight.delete(cacheKey);
      return null;
    } catch (error) {
      debugLog("[TeamLogoCache] Error fetching logo:", error);
      logoCache.set(cacheKey, null);
      inFlight.delete(cacheKey);
      return null;
    }
  })();

  inFlight.set(cacheKey, fetchPromise);
  return fetchPromise;
}

export function invalidateLogoCacheEntry(leagueId: string, teamName: string): void {
  const cacheKey = `${leagueId}::${normalizeTeamName(teamName)}`;
  logoCache.delete(cacheKey);
  inFlight.delete(cacheKey);
  dbLogosCache.delete(leagueId);
  serverLogoMapCache.delete(leagueId);
}

export function clearLogoCache(): void {
  logoCache.clear();
  inFlight.clear();
  dbLogosCache.clear();
  dbLogosFetching.clear();
  parentLeagueCache.clear();
  parentLeagueFetching.clear();
  childLeagueIdsCache.clear();
  childLeagueIdsFetching.clear();
  serverLogoMapCache.clear();
  serverLogoMapFetching.clear();
}
