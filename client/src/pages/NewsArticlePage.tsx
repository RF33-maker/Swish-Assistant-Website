import { useEffect } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/lib/supabase";
import type { NewsArticle } from "@shared/schema";
import type { ArticleTag } from "@shared/newsArticle";
import { ArrowLeft, Newspaper } from "lucide-react";
import SiteHeader, { SITE_RAIL_OFFSET } from "@/components/layout/SiteHeader";
import ArticleView from "@/components/news/ArticleView";
import { NewsCard, NEWS_COLUMNS } from "@/components/news/NewsCards";
import { NEWS_QUERY_KEY, fetchArticleTags } from "@/lib/newsArticles";

const ARTICLE_COLUMNS =
  "id, title, slug, summary, body, content, article_type, image_url, image_alt, image_credit, source_url, league, published_at, updated_at, is_published";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SITE_URL = "https://swishassistant.com";
const PUBLISHER_LOGO = `${SITE_URL}/icon-192.png`;

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${SITE_RAIL_OFFSET} sa-pro min-h-screen`}>
      <SiteHeader />
      <main className="pb-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-8">
          <Link
            href="/news"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--ch-text-2)] hover:text-[color:var(--ch-text)] transition-colors"
            data-testid="link-home"
          >
            <ArrowLeft className="h-4 w-4" /> All news
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-10" data-testid="news-not-found">
      <div className="ch-card p-10 text-center">
        <Newspaper className="h-9 w-9 mx-auto text-[color:var(--ch-muted)] mb-3" />
        <h1 className="ch-display uppercase font-bold tracking-tight leading-[0.95] text-[2rem] text-[color:var(--ch-text)]">
          Article not found
        </h1>
        <p className="mt-2 text-sm text-[color:var(--ch-text-2)]">{message}</p>
        <Link href="/news" className="ch-btn ch-btn-primary h-10 px-5 mt-6">Back to news</Link>
      </div>
    </div>
  );
}

/** Other published stories that share this article's league (or first tag), newest first. */
function RelatedStories({ articleId, tag }: { articleId: string; tag: ArticleTag }) {
  const { data: related = [] } = useQuery<NewsArticle[]>({
    queryKey: [...NEWS_QUERY_KEY, "related", tag.kind, tag.key, articleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("news_article_tags")
        .select(`news_articles!inner(${NEWS_COLUMNS})`)
        .eq("kind", tag.kind)
        .eq("key", tag.key)
        .eq("news_articles.is_published", true)
        .neq("article_id", articleId)
        .limit(24);
      if (error) return [];
      return ((data || []) as any[])
        .map((row) => row.news_articles as NewsArticle)
        .filter(Boolean)
        .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
        .slice(0, 3);
    },
  });

  if (!related.length) return null;
  return (
    <section className="max-w-5xl mx-auto px-4 md:px-6 mt-14" data-testid="news-related">
      <h2 className="ch-display uppercase font-bold tracking-tight text-[1.6rem] text-[color:var(--ch-text)]">More from {tag.label}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {related.map((a) => (
          <NewsCard key={a.id} article={a} />
        ))}
      </div>
    </section>
  );
}

export default function NewsArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";
  const [, navigate] = useLocation();

  const isUUID = UUID_REGEX.test(slug);

  const { data, isLoading, isError } = useQuery<{ article: NewsArticle; tags: ArticleTag[] } | null>({
    queryKey: [...NEWS_QUERY_KEY, "detail", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data: article, error } = await supabase
        .from("news_articles")
        .select(ARTICLE_COLUMNS)
        .eq(isUUID ? "id" : "slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      if (!article) return null;
      const tags = await fetchArticleTags((article as any).id).catch(() => []);
      return { article: article as unknown as NewsArticle, tags };
    },
  });
  const article = data?.article;
  const tags = data?.tags ?? [];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  // Old links use the article's id; the address bar should show its slug.
  useEffect(() => {
    if (isUUID && article?.slug) navigate(`/news/${article.slug}`, { replace: true });
  }, [isUUID, article?.slug]);

  if (!slug) {
    return (
      <PageShell>
        <NotFound message="The article you're looking for doesn't exist or is no longer available." />
      </PageShell>
    );
  }

  if (isLoading) {
    return (
      <PageShell>
        <article className="max-w-3xl mx-auto px-4 md:px-6 pt-6">
          <div className="ch-skel h-4 w-24 mb-4" />
          <div className="ch-skel h-10 w-full mb-3" />
          <div className="ch-skel h-10 w-3/4 mb-6" />
          <div className="ch-skel h-72 w-full rounded-[14px] mb-8" />
          <div className="space-y-3">
            <div className="ch-skel h-4 w-full" />
            <div className="ch-skel h-4 w-full" />
            <div className="ch-skel h-4 w-5/6" />
            <div className="ch-skel h-4 w-4/5" />
          </div>
        </article>
      </PageShell>
    );
  }

  if (isError || !article) {
    return (
      <PageShell>
        <NotFound message="This story may have been unpublished or removed." />
      </PageShell>
    );
  }

  const description =
    (article.summary && article.summary.trim()) ||
    (article.body
      ? article.body.replace(/\s+/g, " ").trim().slice(0, 160)
      : `${article.title} — read the full story on Swish Assistant.`);

  const canonical = `${SITE_URL}/news/${article.slug || article.id}`;
  const relatedTag = tags.find((t) => t.kind === "league") ?? tags.find((t) => t.kind === "competition") ?? tags[0];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description,
    url: canonical,
    ...(article.published_at && { datePublished: new Date(article.published_at).toISOString() }),
    ...((article.updated_at || article.published_at) && {
      dateModified: new Date(article.updated_at || article.published_at).toISOString(),
    }),
    ...(article.image_url && { image: article.image_url }),
    ...(article.league && { articleSection: article.league }),
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

      <article className="max-w-3xl mx-auto px-4 md:px-6 pt-6 ch-rise" data-testid="news-article">
        <ArticleView article={article} tags={tags} />

        <div className="mt-10">
          <Link href="/news" className="ch-btn ch-btn-ghost h-10 px-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to all news
          </Link>
        </div>
      </article>

      {relatedTag && <RelatedStories articleId={article.id} tag={relatedTag} />}
    </PageShell>
  );
}
