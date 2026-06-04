import { useState, useCallback } from "react";
import { Instagram, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

export function getInstagramEmbedUrl(url: string): string | null {
  if (!url) return null;
  const cleanUrl = url.split("?")[0];
  const profileRegex = /(?:instagram\.com\/)([A-Za-z0-9._]+)(?:\/)?$/;
  const profileMatch = cleanUrl.match(profileRegex);
  if (profileMatch) return `https://www.instagram.com/${profileMatch[1]}/embed`;
  const postRegex = /instagram\.com\/(p|reel|reels)\/([A-Za-z0-9_-]+)/;
  const postMatch = cleanUrl.match(postRegex);
  if (postMatch) {
    const type = postMatch[1];
    const id = postMatch[2];
    if (type === "reel" || type === "reels")
      return `https://www.instagram.com/reel/${id}/embed`;
    return `https://www.instagram.com/p/${id}/embed`;
  }
  return null;
}

function extractHandleFromUrl(url: string): string | null {
  const cleanUrl = url.split("?")[0];
  if (/instagram\.com\/(p|reel|reels)\//.test(cleanUrl)) return null;
  const match = cleanUrl.match(/(?:instagram\.com\/)([A-Za-z0-9._]+)(?:\/)?$/);
  return match ? match[1] : null;
}

const CARD_HEIGHT = 340;
const IFRAME_HEIGHT = 760;

function InstagramCard({ url, handle }: { url: string; handle?: string }) {
  const embedUrl = getInstagramEmbedUrl(url);
  if (!embedUrl) return null;
  return (
    <div
      className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-neutral-800"
      style={{ height: CARD_HEIGHT }}
    >
      <div className="relative w-full overflow-hidden" style={{ height: CARD_HEIGHT }}>
        <iframe
          src={embedUrl}
          width="100%"
          height={IFRAME_HEIGHT}
          className="border-0"
          style={{ position: "absolute", top: 0, left: 0 }}
          scrolling="no"
          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
        />
      </div>
      {handle && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-3 flex items-center gap-1.5 pointer-events-none">
          <Instagram className="h-3 w-3 text-white/80 flex-shrink-0" />
          <span className="text-white text-xs font-medium truncate">@{handle}</span>
        </div>
      )}
    </div>
  );
}

interface InstagramFeedSectionProps {
  urls?: string[];
  handle?: string;
  brandColor?: string;
  title?: string;
}

export function InstagramFeedSection({
  urls = [],
  handle,
  brandColor,
  title = "STAY CONNECTED",
}: InstagramFeedSectionProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [avatarError, setAvatarError] = useState(false);

  const effectiveHandle =
    handle ||
    urls.map((u) => extractHandleFromUrl(u)).find((h) => h !== null) ||
    null;

  const postUrls = urls.filter((u) =>
    /instagram\.com\/(p|reel|reels)\//.test(u.split("?")[0])
  );

  const hasPostUrls = postUrls.length > 0;
  const hasHandle = !!effectiveHandle;

  if (!hasPostUrls && !hasHandle) return null;

  const accentColor = brandColor || "#f97316";
  const avatarUrl = effectiveHandle
    ? `https://unavatar.io/instagram/${effectiveHandle}`
    : null;

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  return (
    <div className="w-full py-2">
      {title && (
        <div className="text-center mb-4">
          <span
            className="text-xs font-extrabold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500"
            style={brandColor ? { color: accentColor + "bb" } : {}}
          >
            {title}
          </span>
        </div>
      )}

      {hasHandle && (
        <div className="flex items-center gap-3 mb-4 px-1">
          <div
            className="h-11 w-11 rounded-full overflow-hidden flex-shrink-0 border-2"
            style={{ borderColor: accentColor + "55" }}
          >
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={effectiveHandle!}
                className="h-full w-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400">
                <Instagram className="h-5 w-5 text-white" />
              </div>
            )}
          </div>

          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
            @{effectiveHandle}
          </span>

          <a
            href={`https://www.instagram.com/${effectiveHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white dark:text-slate-900 hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0"
            style={{ backgroundColor: "#0f172a" }}
          >
            <Instagram className="h-3 w-3" />
            Follow us
          </a>
        </div>
      )}

      {hasPostUrls ? (
        <div className="relative">
          <Carousel setApi={setApi} opts={{ align: "start", loop: false }}>
            <CarouselContent className="-ml-3">
              {postUrls.map((url, i) => (
                <CarouselItem
                  key={i}
                  className="pl-3 basis-[230px] shrink-0"
                >
                  <InstagramCard url={url} handle={effectiveHandle || undefined} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          <button
            onClick={scrollPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 h-8 w-8 rounded-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 shadow-md flex items-center justify-center hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            aria-label="Previous posts"
          >
            <ChevronLeft className="h-4 w-4 text-slate-700 dark:text-slate-200" />
          </button>
          <button
            onClick={scrollNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 h-8 w-8 rounded-full bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-600 shadow-md flex items-center justify-center hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            aria-label="Next posts"
          >
            <ChevronRight className="h-4 w-4 text-slate-700 dark:text-slate-200" />
          </button>
        </div>
      ) : (
        hasHandle && (
          <a
            href={`https://www.instagram.com/${effectiveHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-4 rounded-xl border border-gray-100 dark:border-neutral-700 p-8 text-center hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors group"
          >
            <div className="h-16 w-16 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 shadow-lg group-hover:scale-105 transition-transform">
              <Instagram className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-800 dark:text-white text-base">@{effectiveHandle}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Follow us for highlights, scores &amp; updates
              </p>
            </div>
            <span
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold text-white transition-opacity group-hover:opacity-90"
              style={{ backgroundColor: accentColor }}
            >
              <Instagram className="h-4 w-4" />
              Follow on Instagram
            </span>
          </a>
        )
      )}
    </div>
  );
}
