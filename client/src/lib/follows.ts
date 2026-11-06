import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

/**
 * The players and teams a signed-in user follows (public.user_follows,
 * supabase/migrations/20261104_user_follows.sql). They build the app's home
 * page, and later decide who gets which notifications.
 */

export type FollowKind = "player" | "team" | "league";

export interface Follow {
  id: string;
  kind: FollowKind;
  /** /player/<key> or /team/<key>; a league's is "league:<brand>", "league:<brand>:women" or "competition:<slug>" (lib/leagueKeys.ts). */
  key: string;
  label: string;
  subtitle: string | null;
  image_url: string | null;
  /** The competition it was followed from, for a team's logo. */
  league_id: string | null;
  player_ids: string[];
  created_at: string;
}

export type NewFollow = Omit<Follow, "id" | "created_at">;

export const followHref = (f: Pick<Follow, "kind" | "key">) => {
  if (f.kind === "league") {
    // "league:<brand>", "league:<brand>:women" or "competition:<slug>"
    const [type, slug] = f.key.split(":");
    return `/${type}/${slug}`;
  }
  return `/${f.kind}/${encodeURIComponent(f.key)}`;
};

const followsKey = (userId: string | undefined) => ["user-follows", userId] as const;

export function useFollows() {
  const { user } = useAuth();
  return useQuery({
    queryKey: followsKey(user?.id),
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Follow[]> => {
      const { data, error } = await supabase
        .from("user_follows")
        .select("id, kind, key, label, subtitle, image_url, league_id, player_ids, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Follow[];
    },
  });
}

/**
 * The follow that covers this player, team or league. A person has a record
 * per competition, and pages for them can have different keys, so a player
 * follow also counts when it shares any of their record ids.
 */
export function findFollow(list: Follow[] | undefined, kind: FollowKind, key: string | null | undefined, playerIds: string[] = []): Follow | undefined {
  if (!list || !key) return undefined;
  return (
    list.find((f) => f.kind === kind && f.key === key) ??
    (kind === "player" && playerIds.length ? list.find((f) => f.kind === "player" && f.player_ids?.some((id) => playerIds.includes(id))) : undefined)
  );
}

export function useExistingFollow(kind: FollowKind, key: string | null | undefined, playerIds: string[] = []) {
  const { data } = useFollows();
  return findFollow(data, kind, key, playerIds);
}

export function useIsFollowing(kind: FollowKind, key: string | null | undefined, playerIds: string[] = []) {
  return !!useExistingFollow(kind, key, playerIds);
}

/** Follows or unfollows, updating the list straight away and undoing that if the save fails. */
export function useToggleFollow() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = followsKey(user?.id);

  return useMutation({
    mutationFn: async ({ follow, following }: { follow: NewFollow; following: boolean }) => {
      if (!user) throw new Error("Sign in to follow");
      if (following) {
        const { error } = await supabase
          .from("user_follows")
          .delete()
          .match({ user_id: user.id, kind: follow.kind, key: follow.key });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_follows").insert({ ...follow, user_id: user.id });
        if (error) throw error;
      }
    },
    onMutate: async ({ follow, following }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Follow[]>(key);
      queryClient.setQueryData<Follow[]>(key, (list = []) =>
        following
          ? list.filter((f) => !(f.kind === follow.kind && f.key === follow.key))
          : [...list, { ...follow, id: `pending-${follow.kind}-${follow.key}`, created_at: new Date().toISOString() }],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(key, context?.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["follower-count"] });
    },
  });
}

/**
 * How many accounts follow this player, team or league
 * (public.follower_counts, supabase/migrations/20261106_follower_counts.sql).
 */
export function useFollowerCount(kind: FollowKind, key: string | null | undefined) {
  return useQuery({
    queryKey: ["follower-count", kind, key],
    enabled: !!key,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("follower_counts", { p_kind: kind, p_keys: [key] });
      if (error) throw error;
      return Number((data as Array<{ followers: number }> | null)?.[0]?.followers ?? 0);
    },
  });
}

export const followersLabel = (n: number) => `${n.toLocaleString("en-GB")} ${n === 1 ? "follower" : "followers"}`;
