import { useState, useEffect } from 'react';
import { useLeagueBranding } from './useLeagueBranding';

interface LeagueBrandingData {
  league_id: string;
  name: string;
  slug: string;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  banner_url: string | null;
  logo_url: string | null;
}

const brandingCache = new Map<string, LeagueBrandingData | null>();

interface UsePublicLeagueBrandingBySlugOptions {
  slug: string | undefined;
  fallbackLeague?: {
    banner_url?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
  } | null;
  enabled?: boolean;
}

export function usePublicLeagueBrandingBySlug({
  slug,
  fallbackLeague,
  enabled = true,
}: UsePublicLeagueBrandingBySlugOptions) {
  const [brandingData, setBrandingData] = useState<LeagueBrandingData | null>(null);
  const [isLoadingBranding, setIsLoadingBranding] = useState(false);

  const hasSufficientFallback = !!(fallbackLeague && (
    (fallbackLeague.primary_color && fallbackLeague.secondary_color) ||
    (fallbackLeague.banner_url || fallbackLeague.logo_url)
  ));

  useEffect(() => {
    if (!enabled || !slug || hasSufficientFallback) {
      setBrandingData(null);
      setIsLoadingBranding(false);
      return;
    }

    const cacheKey = `slug:${slug}`;
    if (brandingCache.has(cacheKey)) {
      setBrandingData(brandingCache.get(cacheKey)!);
      setIsLoadingBranding(false);
      return;
    }

    let cancelled = false;
    setIsLoadingBranding(true);

    fetch(`/api/public/league-branding/${encodeURIComponent(slug)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        brandingCache.set(cacheKey, data);
        setBrandingData(data);
      })
      .catch(() => {
        if (!cancelled) setBrandingData(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBranding(false);
      });

    return () => { cancelled = true; };
  }, [slug, enabled, hasSufficientFallback]);

  const source = brandingData || fallbackLeague;

  const { colors, isLoading: isExtractingColors } = useLeagueBranding({
    slug,
    bannerUrl: source?.banner_url,
    logoUrl: source?.logo_url,
    manualPrimaryColor: source?.primary_color,
    manualSecondaryColor: source?.secondary_color,
    manualAccentColor: source?.accent_color,
    enabled: !!source,
  });

  return {
    colors,
    isLoading: isLoadingBranding || isExtractingColors,
    brandingData,
  };
}

interface UsePublicLeagueBrandingByIdOptions {
  leagueId: string | undefined;
  fallbackLeague?: {
    slug?: string | null;
    banner_url?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
  } | null;
  enabled?: boolean;
}

export function usePublicLeagueBrandingById({
  leagueId,
  fallbackLeague,
  enabled = true,
}: UsePublicLeagueBrandingByIdOptions) {
  const [brandingData, setBrandingData] = useState<LeagueBrandingData | null>(null);
  const [isLoadingBranding, setIsLoadingBranding] = useState(false);

  const hasSufficientFallback = !!(fallbackLeague && (
    (fallbackLeague.primary_color && fallbackLeague.secondary_color) ||
    (fallbackLeague.banner_url || fallbackLeague.logo_url)
  ));

  useEffect(() => {
    if (!enabled || !leagueId || hasSufficientFallback) {
      setBrandingData(null);
      setIsLoadingBranding(false);
      return;
    }

    const cacheKey = `id:${leagueId}`;
    if (brandingCache.has(cacheKey)) {
      setBrandingData(brandingCache.get(cacheKey)!);
      setIsLoadingBranding(false);
      return;
    }

    let cancelled = false;
    setIsLoadingBranding(true);

    fetch(`/api/public/league-branding-by-id/${encodeURIComponent(leagueId)}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        brandingCache.set(cacheKey, data);
        setBrandingData(data);
      })
      .catch(() => {
        if (!cancelled) setBrandingData(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingBranding(false);
      });

    return () => { cancelled = true; };
  }, [leagueId, enabled, hasSufficientFallback]);

  const source = brandingData || fallbackLeague;
  const slug = brandingData?.slug || fallbackLeague?.slug || undefined;

  const { colors, isLoading: isExtractingColors } = useLeagueBranding({
    slug,
    bannerUrl: source?.banner_url,
    logoUrl: source?.logo_url,
    manualPrimaryColor: source?.primary_color,
    manualSecondaryColor: source?.secondary_color,
    manualAccentColor: source?.accent_color,
    enabled: !!source,
  });

  return {
    colors,
    isLoading: isLoadingBranding || isExtractingColors,
    brandingData,
  };
}
