import { Link } from "wouter";
import { Check, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "@/hooks/use-toast";
import { followersLabel, useExistingFollow, useFollowerCount, useToggleFollow, type NewFollow } from "@/lib/follows";

type Tone = "page" | "photo";

const buttonClass = (on: boolean, tone: Tone = "page") =>
  `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
    !on
      ? "bg-orange-500 text-white hover:bg-orange-600"
      : tone === "photo"
        ? "border border-white/40 bg-white/10 text-white backdrop-blur"
        : "border border-[color:var(--ch-border)] text-[color:var(--ch-text)]"
  }`;

/**
 * Follow / Following for a player, team or league page, with how many
 * accounts follow it. Signed out, it leads to registration.
 */
/** `show` splits the two, for a page that puts the button and the count in different places. */
export default function FollowButton({ follow, tone = "page", show = "both" }: { follow: NewFollow; tone?: Tone; show?: "both" | "button" | "count" }) {
  const { data: count = 0 } = useFollowerCount(follow.kind, follow.key);
  if (show === "button") return <Toggle follow={follow} tone={tone} />;
  if (show === "count") {
    return count > 0 ? <span className="font-sans text-[13px] font-medium normal-case tracking-normal tabular-nums">{followersLabel(count)}</span> : null;
  }
  return (
    <span className="inline-flex items-center gap-3">
      <Toggle follow={follow} tone={tone} />
      {/* Nothing until someone follows: "0 followers" reads as a dead page. */}
      {count > 0 && <span className="font-sans text-sm font-medium normal-case tracking-normal opacity-80 tabular-nums">{followersLabel(count)}</span>}
    </span>
  );
}

function Toggle({ follow, tone }: { follow: NewFollow; tone: Tone }) {
  const { user } = useAuth();
  // The follow may have been made from another of this person's pages.
  const existing = useExistingFollow(follow.kind, follow.key, follow.player_ids);
  const following = !!existing;
  const toggle = useToggleFollow();

  if (!user) {
    return (
      <Link href="/auth?tab=register" className={buttonClass(false, tone)}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Follow
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={following}
      className={buttonClass(following, tone)}
      onClick={() =>
        toggle.mutate(
          { follow: existing ?? follow, following },
          { onError: () => toast({ title: "Couldn't update who you follow", description: "Check your connection and try again." }) },
        )
      }
    >
      {following ? <Check className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      {following ? "Following" : "Follow"}
    </button>
  );
}
