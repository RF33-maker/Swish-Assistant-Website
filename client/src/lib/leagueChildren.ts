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
  stop_name: string | null;
  gender: string | null;
  season: string | null;
};

// "Stop 2 · Bristol" when the stop has a name, "Stop 2" otherwise.
export function stopLabel(stop: number | string, stopName?: string | null): string {
  return stopName ? `Stop ${stop} · ${stopName}` : `Stop ${stop}`;
}

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

type GroupLabelSource = { name?: string | null; age_group?: string | null; gender?: string | null };

// True when the children are split by gender (more than one gender among them).
// Children that all share one gender (every REBA stop is "Men") are split by age instead.
export function childrenSplitByGender(children: GroupLabelSource[]): boolean {
  const genders = new Set(children.map((c) => (c.gender || "").trim()).filter(Boolean));
  return genders.size > 1 && children.every((c) => !!(c.gender || "").trim());
}

// The pill label for a child competition: gender when the children differ by
// gender, otherwise the age group, then gender, then the name minus the parent's.
export function childGroupLabeller(children: GroupLabelSource[], parentName?: string | null) {
  const byGender = childrenSplitByGender(children);
  return (c: GroupLabelSource): string =>
    (byGender && c.gender) ||
    c.age_group ||
    c.gender ||
    (parentName ? (c.name || "").replace(parentName, "").trim() || c.name || "" : c.name || "");
}
