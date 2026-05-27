import { useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabase";
import type { NewsArticle } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Newspaper, CalendarDays } from "lucide-react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";

const ARTICLE_COLUMNS =
  "id, title, slug, summary, body, image_url, source_url, league, published_at, is_published";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL = "https://www.swishassistant.com";
const PUBLISHER_LOGO = `${SITE_URL}/icon-192.png`;

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50/40 to-white dark:from-neutral-950 dark:to-neutral-950 flex flex-col">
      <header className="bg-white dark:bg-neutral-900 border-b border-orange-100 dark:border-neutral-800">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src={SwishLogo} alt="Swish Assistant" className="h-8" />
            <span className="font-bold text-lg text-orange-600">
              Swish Assistant
            </span>
          </Link>
          <Link
            href="/news"
            className="text-sm font-medium text-slate-600 hover:text-orange-600 dark:text-slate-300 dark:hover:text-orange-400 inline-flex items-center gap-1"
            data-testid="link-home"
          >
            <ArrowLeft className="h-4 w-4" /> All News
          </Link>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-orange-100 dark:border-neutral-800 mt-12 py-6">
        <div className="max-w-5xl mx-auto px-6 text-xs text-slate-500 dark:text-slate-400 text-center">
          &copy; {new Date().getFullYear()} Swish Assistant. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

export default function NewsArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";
  const [, setLocation] = useLocation();

  const isUUID = UUID_REGEX.test(slug);

  const {
    data: article,
    isLoading,
    isError,
  } = useQuery<NewsArticle | null>({
    queryKey: ["supabase", "news_articles", "detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      if (isUUID) {
        const { data, error } = await supabase
          .from("news_articles")
          .select(ARTICLE_COLUMNS)
          .eq("id", slug)
          .eq("is_published", true)
          .maybeSingle();
        if (error) throw error;
        return (data as NewsArticle | null) ?? null;
      }
      const { data, error } = await supabase
        .from("news_articles")
        .select(ARTICLE_COLUMNS)
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return (data as NewsArticle | null) ?? null;
    },
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  useEffect(() => {
    if (article && isUUID && article.slug) {
      setLocation(`/news/${article.slug}`, { replace: true });
    }
  }, [article, isUUID, setLocation]);

  if (!slug) {
    return (
      <PageShell>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center" data-testid="news-not-found">
          <Newspaper className="h-10 w-10 mx-auto text-orange-400 mb-3" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Article not found
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            The article you're looking for doesn't exist or is no longer available.
          </p>
          <Button
            className="mt-6 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setLocation("/news")}
          >
            Back to news
          </Button>
        </div>
      </PageShell>
    );
  }

  if (isLoading || (isUUID && article?.slug)) {
    return (
      <PageShell>
        <article className="max-w-3xl mx-auto px-6 py-10">
          <Skeleton className="h-4 w-24 mb-4" />
          <Skeleton className="h-9 w-full mb-3" />
          <Skeleton className="h-9 w-3/4 mb-6" />
          <Skeleton className="h-4 w-40 mb-8" />
          <Skeleton className="h-72 w-full rounded-2xl mb-8" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </article>
      </PageShell>
    );
  }

  if (isError || !article) {
    return (
      <PageShell>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center" data-testid="news-not-found">
          <Newspaper className="h-10 w-10 mx-auto text-orange-400 mb-3" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Article not found
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            This story may have been unpublished or removed.
          </p>
          <Button
            className="mt-6 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setLocation("/news")}
          >
            Back to news
          </Button>
        </div>
      </PageShell>
    );
  }

  const description =
    (article.summary && article.summary.trim()) ||
    (article.body
      ? article.body.replace(/\s+/g, " ").trim().slice(0, 160)
      : `${article.title} — read the full story on Swish Assistant.`);

  const canonicalSlug = article.slug || article.id;
  const canonical = `${SITE_URL}/news/${canonicalSlug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description,
    url: canonical,
    ...(article.published_at && {
      datePublished: new Date(article.published_at).toISOString(),
      dateModified: new Date(article.published_at).toISOString(),
    }),
    ...(article.image_url && { image: article.image_url }),
    publisher: {
      "@type": "Organization",
      name: "Swish Assistant",
      logo: {
        "@type": "ImageObject",
        url: PUBLISHER_LOGO,
      },
    },
  };

  return (
    <PageShell>
      <Helmet>
        <title>{`${article.title} | Swish Assistant`}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={`${article.title} | Swish Assistant`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        {article.image_url && (
          <meta property="og:image" content={article.image_url} />
        )}
        {article.published_at && (
          <meta
            property="article:published_time"
            content={new Date(article.published_at).toISOString()}
          />
        )}
        <meta name="twitter:card" content={article.image_url ? "summary_large_image" : "summary"} />
        <meta name="twitter:title" content={`${article.title} | Swish Assistant`} />
        <meta name="twitter:description" content={description} />
        {article.image_url && (
          <meta name="twitter:image" content={article.image_url} />
        )}
        <link rel="canonical" href={canonical} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <article className="max-w-3xl mx-auto px-6 py-10" data-testid="news-article">
        <div className="mb-5 flex flex-wrap items-center gap-3 text-xs">
          {article.league && (
            <span
              className="font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 px-2.5 py-1 rounded-full uppercase tracking-wide"
              data-testid="text-league-badge"
            >
              {article.league}
            </span>
          )}
          {article.published_at && (
            <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 font-medium">
              <CalendarDays className="h-3.5 w-3.5" />
              <time dateTime={new Date(article.published_at).toISOString()}>
                {formatDate(article.published_at)}
              </time>
            </span>
          )}
        </div>

        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white leading-tight"
          data-testid="text-article-title"
        >
          {article.title}
        </h1>

        {article.summary && (
          <p
            className="mt-4 text-lg text-slate-600 dark:text-slate-300 leading-relaxed"
            data-testid="text-article-summary"
          >
            {article.summary}
          </p>
        )}

        {article.image_url && (
          <div className="mt-8 rounded-2xl overflow-hidden bg-orange-50 dark:bg-neutral-800 border border-orange-100 dark:border-neutral-800">
            <img
              src={article.image_url}
              alt={article.title}
              className="w-full h-auto object-cover"
              loading="eager"
              data-testid="img-article-cover"
            />
          </div>
        )}

        {article.body ? (
          <div
            className="mt-8 text-slate-800 dark:text-slate-200 text-base md:text-lg leading-relaxed whitespace-pre-wrap [&>p]:mb-4"
            data-testid="text-article-body"
          >
            {article.body}
          </div>
        ) : (
          <p className="mt-8 text-slate-500 dark:text-slate-400 italic">
            No article body provided.
          </p>
        )}

        {article.source_url && (
          <div className="mt-10 pt-6 border-t border-orange-100 dark:border-neutral-800">
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
              data-testid="link-source"
            >
              Read the original source <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}

        <div className="mt-10">
          <Button
            variant="ghost"
            onClick={() => setLocation("/news")}
            className="text-slate-600 hover:text-orange-600 dark:text-slate-300 dark:hover:text-orange-400"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to all news
          </Button>
        </div>
      </article>
    </PageShell>
  );
}
