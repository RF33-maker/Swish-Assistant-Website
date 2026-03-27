import { useState, useEffect } from 'react';
import { extractColorsFromImage, TeamColors } from '@/lib/colorExtractor';

const CACHE_KEY = 'league_branding_cache';
const CACHE_VERSION = '1';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

interface UseLeagueBrandingOptions {
  slug: string | undefined;
  bannerUrl: string | undefined | null;
  logoUrl: string | undefined | null;
  enabled?: boolean;
}

interface UseLeagueBrandingResult {
  colors: TeamColors | null;
  isLoading: boolean;
}

export function useLeagueBranding({
  slug,
  bannerUrl,
  logoUrl,
  enabled = true,
}: UseLeagueBrandingOptions): UseLeagueBrandingResult {
  const [colors, setColors] = useState<TeamColors | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !slug) {
      setColors(null);
      setIsLoading(false);
      return;
    }

    const imageUrl = bannerUrl || logoUrl;
    if (!imageUrl) {
      setColors(null);
      setIsLoading(false);
      return;
    }

    setColors(null);
    setIsLoading(false);
    let cancelled = false;

    const extract = async () => {
      const cacheKey = `${slug}`;
      let cache: Record<string, { colors: TeamColors; timestamp: number; version: string; sourceUrl: string }> = {};
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          cache = JSON.parse(cached);
        }
      } catch {}

      const entry = cache[cacheKey];
      if (
        entry &&
        entry.version === CACHE_VERSION &&
        entry.sourceUrl === imageUrl &&
        Date.now() - entry.timestamp < CACHE_DURATION
      ) {
        if (!cancelled) setColors(entry.colors);
        return;
      }

      setIsLoading(true);
      try {
        const extracted = await extractColorsFromImage(imageUrl);
        if (cancelled) return;

        if (extracted) {
          setColors(extracted);
          cache[cacheKey] = {
            colors: extracted,
            timestamp: Date.now(),
            version: CACHE_VERSION,
            sourceUrl: imageUrl,
          };
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
          } catch {}
        } else {
          setColors(null);
        }
      } catch {
        if (!cancelled) setColors(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    extract();
    return () => { cancelled = true; };
  }, [slug, bannerUrl, logoUrl, enabled]);

  return { colors, isLoading };
}
