// NOTE: intentionally uses the server-side /api/public/league-children endpoint
// (backed by the service-role Supabase client) rather than the anon client directly.
// Private child competitions (is_public=false) are filtered out by RLS when using
// the anon key, which causes stops/age-groups to disappear intermittently depending
// on whether the viewer happens to be authenticated as an owner.

export type LeagueChild = {
  league_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  age_group: string | null;
  stop: number | null;
  gender: string | null;
};

const cache = new Map<string, Promise<LeagueChild[]>>();

export async function fetchLeagueChildren(parentId: string): Promise<LeagueChild[]> {
  if (!parentId) return [];
  if (cache.has(parentId)) return cache.get(parentId)!;
  const p = (async () => {
    try {
      const res = await fetch(`/api/public/league-children/${encodeURIComponent(parentId)}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.children || []) as LeagueChild[];
    } catch {
      return [];
    }
  })();
  cache.set(parentId, p);
  const result = await p;
  if (result.length === 0) cache.delete(parentId);
  return result;
}

export function clearLeagueChildrenCache(parentId?: string) {
  if (parentId) cache.delete(parentId);
  else cache.clear();
}
