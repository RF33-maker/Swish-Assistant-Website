import { Link } from "wouter";
import { CalendarDays, Layers, Shield, Trophy, UserRound, type LucideIcon } from "lucide-react";
import { articleTagHref, type ArticleTag, type ArticleTagKind } from "@shared/newsArticle";

export const TAG_KIND_ICON: Record<ArticleTagKind, LucideIcon> = {
  league: Trophy,
  competition: Layers,
  game: CalendarDays,
  team: Shield,
  player: UserRound,
};

export const TAG_KIND_LABEL: Record<ArticleTagKind, string> = {
  league: "League",
  competition: "Competition",
  game: "Game",
  team: "Team",
  player: "Player",
};

/** The pages an article is about, as links: its league, teams, players and games. */
export default function ArticleTagChips({ tags, linked = true }: { tags: ArticleTag[]; linked?: boolean }) {
  if (!tags.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" data-testid="article-tags">
      {tags.map((tag) => {
        const Icon = TAG_KIND_ICON[tag.kind];
        const chip = (
          <>
            <Icon className="h-3.5 w-3.5 shrink-0 text-[color:var(--ch-muted)]" />
            <span className="truncate">{tag.label}</span>
          </>
        );
        const className = "ch-chip inline-flex items-center gap-1.5 h-8 max-w-full px-3 text-[13px]";
        return (
          <li key={`${tag.kind}:${tag.key}`} className="max-w-full">
            {linked ? (
              <Link href={articleTagHref(tag)} className={className}>
                {chip}
              </Link>
            ) : (
              <span className={className}>{chip}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
