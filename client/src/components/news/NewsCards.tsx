import type { ReactNode } from "react";
import { Link } from "wouter";
import type { NewsArticle } from "@shared/schema";
import { Newspaper, ExternalLink, ArrowRight } from "lucide-react";

/**
 * News story building blocks shared by the homepage's news section and the
 * /news page: the image-led lead story, headline rows and grid cards.
 */

export const NEWS_COLUMNS =
  "id, title, summary, image_url, source_url, league, published_at, is_published";

export const formatNewsDate = (s: string | Date | null) => {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
};

/** External stories open the source in a new tab; our own go to /news/:slug. */
export function ArticleLink({ article, className, children }: { article: NewsArticle; className?: string; children: ReactNode }) {
  return article.source_url ? (
    <a
      href={article.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-testid={`link-news-external-${article.id}`}
    >
      {children}
    </a>
  ) : (
    <Link
      href={`/news/${(article as any).slug || article.id}`}
      className={className}
      data-testid={`link-news-detail-${article.id}`}
    >
      {children}
    </Link>
  );
}

export function LeagueTag({ league, onImage = false }: { league: string; onImage?: boolean }) {
  return (
    <span
      className={`inline-flex items-center h-5 px-1.5 rounded text-[10px] font-bold uppercase tracking-[0.08em] truncate max-w-full ${
        onImage ? "bg-orange-500 text-white" : "text-[color:var(--ch-accent)]"
      }`}
    >
      {league}
    </span>
  );
}

/**
 * Lead story: a large image with the headline in a solid panel beneath it.
 * Not laid over the image — most story images are graphics with their own
 * text, which an overlaid headline would collide with.
 */
export function FeatureStory({ article }: { article: NewsArticle }) {
  return (
    <ArticleLink article={article} className="group block h-full">
      <article className="ch-card h-full overflow-hidden flex flex-col">
        <div className="relative aspect-[16/9] overflow-hidden bg-[color:var(--ch-surface-3)]">
          {article.image_url ? (
            <img
              src={article.image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
              <Newspaper className="h-14 w-14 text-white/70" />
            </div>
          )}
        </div>
        <div className="flex-1 p-5 md:p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-2">
            {article.league && <LeagueTag league={article.league} onImage />}
            <span className="text-[11px] font-medium text-[color:var(--ch-muted)]">{formatNewsDate(article.published_at)}</span>
          </div>
          <h3 className="ch-display uppercase font-bold tracking-tight leading-[0.98] text-[1.6rem] sm:text-[2rem] md:text-[2.25rem] text-[color:var(--ch-text)] line-clamp-3 group-hover:underline decoration-2 underline-offset-4">
            {article.title}
          </h3>
          {article.summary && (
            <p className="mt-2.5 text-sm md:text-[15px] text-[color:var(--ch-text-2)] line-clamp-2">{article.summary}</p>
          )}
          <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ch-accent)]">
            {article.source_url ? <>Read more <ExternalLink className="h-3.5 w-3.5" /></> : <>Read article <ArrowRight className="h-4 w-4" /></>}
          </span>
        </div>
      </article>
    </ArticleLink>
  );
}

/** Headline row for the side list: thumbnail, league, title. */
export function HeadlineRow({ article }: { article: NewsArticle }) {
  return (
    <ArticleLink article={article} className="group flex gap-3.5 p-3 -mx-3 rounded-xl hover:bg-[color:var(--ch-surface-2)] transition-colors">
      <span className="h-[68px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-[color:var(--ch-surface-3)]">
        {article.image_url ? (
          <img src={article.image_url} alt="" loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <span className="h-full w-full flex items-center justify-center bg-gradient-to-br from-orange-400 to-amber-400">
            <Newspaper className="h-5 w-5 text-white/80" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {article.league && <LeagueTag league={article.league} />}
          <span className="text-[10.5px] text-[color:var(--ch-muted)] whitespace-nowrap">{formatNewsDate(article.published_at)}</span>
        </span>
        <span className="mt-0.5 block text-[14px] font-semibold leading-snug text-[color:var(--ch-text)] line-clamp-2 group-hover:underline underline-offset-2">
          {article.title}
        </span>
      </span>
    </ArticleLink>
  );
}

/** A story in a grid: image on top, then league, date, headline and summary. */
export function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <ArticleLink article={article} className="group block h-full">
      <article className="ch-card ch-hover h-full overflow-hidden flex flex-col">
        <div className="relative aspect-[16/9] overflow-hidden bg-[color:var(--ch-surface-3)]">
          {article.image_url ? (
            <img
              src={article.image_url}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-700"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
              <Newspaper className="h-10 w-10 text-white/70" />
            </div>
          )}
        </div>
        <div className="flex-1 p-4 md:p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-1.5 min-w-0">
            {article.league && <LeagueTag league={article.league} />}
            <span className="text-[11px] font-medium text-[color:var(--ch-muted)] whitespace-nowrap">{formatNewsDate(article.published_at)}</span>
          </div>
          <h3 className="text-[16px] font-semibold leading-snug text-[color:var(--ch-text)] line-clamp-2 group-hover:underline underline-offset-2">
            {article.title}
          </h3>
          {article.summary && (
            <p className="mt-1.5 text-sm text-[color:var(--ch-text-2)] line-clamp-3">{article.summary}</p>
          )}
          <span className="mt-auto pt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ch-accent)]">
            {article.source_url ? <>Read more <ExternalLink className="h-3.5 w-3.5" /></> : <>Read article <ArrowRight className="h-4 w-4" /></>}
          </span>
        </div>
      </article>
    </ArticleLink>
  );
}
