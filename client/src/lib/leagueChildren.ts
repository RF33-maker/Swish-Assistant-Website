import { supabase } from "@/lib/supabase";

export type LeagueChild = {
  league_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  age_group: string | null;
  stop: number | null;
};

const cache = new Map<string, Promise<LeagueChild[]>>();

export async function fetchLeagueChildren(parentId: string): Promise<LeagueChild[]> {
  if (!parentId) return [];
  if (cache.has(parentId)) return cache.get(parentId)!;
  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from("leagues")
        .select("league_id, name, slug, logo_url, age_group, stop")
        .eq("parent_league_id", parentId);
      if (error) return [];
      return (data || []) as LeagueChild[];
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
