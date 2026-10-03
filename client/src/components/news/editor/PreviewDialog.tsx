import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ArticleViewData } from "@/components/news/ArticleView";
import type { ArticleTag } from "@shared/newsArticle";

export const NEWS_PREVIEW_STORAGE_KEY = "swish:news-preview";

export interface NewsPreviewPayload {
  article: ArticleViewData;
  tags: ArticleTag[];
}

/**
 * Shows the article as readers will see it. The preview is the real article
 * layout loaded in a frame (pages/NewsPreviewPage), so at phone width the
 * page's phone styles apply exactly as they do on a phone, which a narrow
 * column inside this wide window couldn't do.
 */
export default function PreviewDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: NewsPreviewPayload;
}) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [ready, setReady] = useState(false);

  // Hand the unsaved article to the frame before it loads.
  useEffect(() => {
    if (!open) return setReady(false);
    try {
      sessionStorage.setItem(NEWS_PREVIEW_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage unavailable: the frame shows its own "nothing to preview" message.
    }
    setReady(true);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sa-pro flex h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 bg-[color:var(--ch-bg)] text-[color:var(--ch-text)] border-[color:var(--ch-border)]">
        <div className="flex items-center gap-3 border-b border-[color:var(--ch-border)] bg-[color:var(--ch-surface)] py-2.5 pl-4 pr-12">
          <DialogTitle className="text-[15px] font-semibold">Preview</DialogTitle>
          <DialogDescription className="sr-only">The article as readers will see it.</DialogDescription>
          <div className="ch-seg ml-auto">
            <button type="button" data-active={device === "desktop"} onClick={() => setDevice("desktop")} className="flex h-8 items-center gap-1.5 px-3 text-[13px]">
              <Monitor className="h-3.5 w-3.5" /> Desktop
            </button>
            <button type="button" data-active={device === "phone"} onClick={() => setDevice("phone")} className="flex h-8 items-center gap-1.5 px-3 text-[13px]">
              <Smartphone className="h-3.5 w-3.5" /> Phone
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden">
          {ready && (
            <iframe
              title="Article preview"
              src="/news-manager/preview"
              className={`h-full bg-[color:var(--ch-bg)] ${device === "phone" ? "w-[390px] max-w-full border-x border-[color:var(--ch-border-strong)]" : "w-full"}`}
              data-testid="iframe-article-preview"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
