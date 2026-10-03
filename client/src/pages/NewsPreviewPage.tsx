import { useState } from "react";
import { Helmet } from "react-helmet-async";
import ArticleView from "@/components/news/ArticleView";
import { NEWS_PREVIEW_STORAGE_KEY, type NewsPreviewPayload } from "@/components/news/editor/PreviewDialog";

function readPayload(): NewsPreviewPayload | null {
  try {
    const raw = sessionStorage.getItem(NEWS_PREVIEW_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NewsPreviewPayload) : null;
  } catch {
    return null;
  }
}

/**
 * The page inside the editor's preview frame: the unsaved article the editor
 * left in session storage, in the public article layout. Links are shown but
 * don't navigate, so a click can't leave the preview.
 */
export default function NewsPreviewPage() {
  const [payload] = useState(readPayload);

  return (
    <div className="sa-pro min-h-screen">
      <Helmet>
        <title>Article preview | Swish Assistant</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <main className="pb-16">
        <article className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-8" data-testid="news-article-preview">
          {payload ? (
            <ArticleView article={payload.article} tags={payload.tags} preview />
          ) : (
            <p className="py-16 text-center text-sm text-[color:var(--ch-text-2)]">Open the preview from the article editor.</p>
          )}
        </article>
      </main>
    </div>
  );
}
