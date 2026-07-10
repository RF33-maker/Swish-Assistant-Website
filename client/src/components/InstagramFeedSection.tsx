import { useState, useCallback } from "react";
import { Instagram, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";

// Converts any instagram.com URL to its /embed variant.
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

// Extract an @handle from a profile URL; returns null for post/reel URLs.
function extractHandleFromUrl(url: string): string | null {
  const cleanUrl = url.split("?")[0];
  if (/instagram\.com\/(p|reel|reels)\//.test(cleanUrl)) return null;
  const match = cleanUrl.match(/(?:instagram\.com\/)([A-Za-z0-9._]+)(?:\/)?$/);
  return match ? match[1] : null;
}

// Human-readable relative time from an ISO/date string.
function formatRelativeTime(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "1 month ago";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

const CARD_HEIGHT = 340;
const IFRAME_HEIGHT = 760;

// Single scrollable card tile — renders the Instagram embed iframe cropped to
// CARD_HEIGHT, with a semi-transparent handle + optional timestamp overlay.
function InstagramCard({
  url,
  handle,
  timestamp,
}: {
  url: string;
  handle?: string;
  timestamp?: string | null;
}) {
  const embedUrl = getInstagramEmbedUrl(url);
  if (!embedUrl) return null;
  const relativeTime = formatRelativeTime(timestamp);
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
      {(handle || relativeTime) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-3 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <Instagram className="h-3 w-3 text-white/80 flex-shrink-0" />
            {handle && (
              <span className="text-white text-xs font-medium truncate">@{handle}</span>
            )}
            {relativeTime && (
              <span className="text-white/60 text-xs ml-auto whitespace-nowrap">
                {relativeTime}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface InstagramFeedSectionProps {
  /** Instagram post / reel / profile URLs to render as scrollable cards. */
  urls?: string[];
  /** Explicit @handle for the profile row and card overlays. When absent the
   *  component tries to derive it from the first profile-style URL in `urls`. */
  handle?: string;
  /** Optional brand accent colour (hex string). */
  brandColor?: string;
  /** Section heading. Defaults to "STAY CONNECTED". Pass `""` to hide. */
  title?: string;
  /** Per-URL publish timestamps (ISO strings). Shown as "2 weeks ago" in card
   *  overlays when available. Array must align with `urls` by index. */
  timestamps?: Array<string | null | undefined>;
}

export function InstagramFeedSection({
  urls = [],
  handle,
  brandColor,
  title = "STAY CONNECTED",
  timestamps,
}: InstagramFeedSectionProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [avatarError, setAvatarError] = useState(false);

  // Derive handle from the first profile-style URL when not explicitly provided.
  const effectiveHandle =
    handle ||
    urls.map((u) => extractHandleFromUrl(u)).find((h) => h !== null) ||
    null;

  // Separate post/reel URLs from any profile-style URL.
  const postUrls = urls.filter((u) =>
    /instagram\.com\/(p|reel|reels)\//.test(u.split("?")[0])
  );

  const hasPostUrls = postUrls.length > 0;
  const hasHandle = !!effectiveHandle;

  // Hooks must be called unconditionally — keep these above any early return.
  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  // Nothing to render.
  if (!hasPostUrls && !hasHandle) return null;

  const accentColor = brandColor || "#f97316";
  const avatarUrl = effectiveHandle
    ? `https://unavatar.io/instagram/${effectiveHandle}`
    : null;

  // Align timestamps with post URL positions.
  const cardTimestamps: Array<string | null | undefined> = postUrls.map((url) => {
    const idx = urls.indexOf(url);
    return timestamps?.[idx] ?? null;
  });

  const showArrows = postUrls.length > 1;

  return (
    <div className="w-full py-2">
      {/* Section title — suppressed when caller passes title="" */}
      {title && (
        <div className="text-center mb-4">
          <span
            className="text-xs font-extrabold uppercase tracking-[0.22em]"
            style={{ color: brandColor ? accentColor + "bb" : undefined }}
            // Falls back to muted text colour via Tailwind when no brandColor.
            data-brand-accent={!!brandColor}
          >
            <span className={brandColor ? "" : "text-slate-400 dark:text-slate-500"}>
              {title}
            </span>
          </span>
        </div>
      )}

      {/* Profile row — shown whenever an @handle is available. */}
      {hasHandle && (
        <div className="flex items-center gap-3 mb-4 px-1">
          {/* Avatar via unavatar.io with Instagram-gradient fallback. */}
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

          {/* "Follow us" — always dark pill so it reads on any background. */}
          <a
            href={`https://www.instagram.com/${effectiveHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white hover:opacity-80 transition-opacity whitespace-nowrap flex-shrink-0"
            style={{ backgroundColor: "#0f172a" }}
          >
            <Instagram className="h-3 w-3" />
            Follow us
          </a>
        </div>
      )}

      {hasPostUrls ? (
        /* Multi-post mode: horizontal scrollable carousel of iframe cards. */
        <div className="relative">
          <Carousel setApi={setApi} opts={{ align: "start", loop: false }}>
            <CarouselContent className="-ml-3">
              {postUrls.map((url, i) => (
                <CarouselItem key={i} className="pl-3 shrink-0 basis-[230px]">
                  <InstagramCard
                    url={url}
                    handle={effectiveHandle || undefined}
                    timestamp={cardTimestamps[i]}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {showArrows && (
            <>
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
            </>
          )}
        </div>
      ) : (
        /* Handle-only mode: Instagram profile iframes are blocked by X-Frame-Options,
           so we show a rich CTA card that always renders and links out instead. */
        hasHandle && (
          <a
            href={`https://www.instagram.com/${effectiveHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-gray-100 dark:border-neutral-700 p-6 sm:p-8 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors group"
          >
            {/* Large Instagram gradient icon */}
            <div
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:scale-105 transition-transform"
              style={{
                background:
                  "linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
              }}
            >
              <Instagram className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
            </div>

            {/* Text block */}
            <div className="text-center sm:text-left flex-1">
              <p className="font-bold text-slate-800 dark:text-white text-lg">
                @{effectiveHandle}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Follow us on Instagram for highlights, scores &amp; behind-the-scenes content.
              </p>
            </div>

            {/* CTA button */}
            <span
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white flex-shrink-0 transition-opacity group-hover:opacity-90"
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
