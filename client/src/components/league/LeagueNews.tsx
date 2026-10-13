import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Newspaper } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NEWS_QUERY_KEY } from "@/lib/newsArticles";
import { ArticleLink, formatNewsDate, NEWS_COLUMNS } from "@/components/news/NewsCards";
import { articleTypeLabel } from "@shared/newsArticle";
import type { NewsArticle } from "@shared/schema";

/**
 * Stories tagged to a competition, newest first: the automatic weekend match
 * reports and anything a writer has tagged to the competition. Renders
 * nothing until there is one, so a competition without news shows no gap.
 */
export default function LeagueNews({ competitionSlug, limit = 4 }: { competitionSlug: string; limit?: number }) {
  const { data: stories = [] } = useQuery<NewsArticle[]>({
    queryKey: [...NEWS_QUERY_KEY, "competition", competitionSlug, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_article_tags")
        .select(`news_articles!inner(${NEWS_COLUMNS})`)
        .in("kind", ["competition", "league"])
        .eq("key", competitionSlug)
        .eq("news_articles.is_published", true)
        .limit(40);
      if (error) return [];
      const seen = new Set<string>();
      return ((data || []) as any[])
        .map((row) => row.news_articles as NewsArticle)
        .filter((a) => a && !seen.has(a.id) && !!seen.add(a.id))
        .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
        .slice(0, limit);
    },
    staleTime: 60 * 1000,
  });

  if (!stories.length) return null;
  return (
    <section className="ch-card p-4 md:p-6" aria-labelledby="league-news-heading" data-testid="league-news">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="league-news-heading" className="flex items-center gap-2 text-[15px] md:text-base font-semibold tracking-tight text-[color:var(--ch-text)]">
          <Newspaper className="h-4 w-4 text-orange-500" aria-hidden="true" />
          Match reports and news
        </h2>
        <Link href="/news" className="inline-flex items-center gap-1 text-xs md:text-sm font-medium text-[color:var(--ch-accent)] hover:underline underline-offset-2">
          All news
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-[color:var(--ch-border)]" role="list">
        {stories.map((a) => (
          <ArticleLink key={a.id} article={a} className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <div role="listitem" className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ch-muted)]">
                {a.article_type && a.article_type !== "news" && <span className="text-orange-600 dark:text-orange-400">{articleTypeLabel(a.article_type)}</span>}
                <time>{formatNewsDate(a.published_at)}</time>
              </div>
              <div className="mt-0.5 text-[15px] font-semibold leading-snug text-[color:var(--ch-text)] group-hover:underline underline-offset-2">{a.title}</div>
              {a.summary && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-[color:var(--ch-text-2)]">{a.summary}</p>}
            </div>
          </ArticleLink>
        ))}
      </div>
    </section>
  );
}
