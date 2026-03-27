import { useState, useEffect } from 'react';
import { extractColorsFromImage, TeamColors } from '@/lib/colorExtractor';

const CACHE_KEY = 'league_branding_cache';
const CACHE_VERSION = '2';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_BRAND_COLORS: TeamColors = {
  primary: 'rgb(100, 100, 100)',
  secondary: 'rgb(70, 70, 70)',
  accent: 'rgba(100, 100, 100, 0.1)',
  primaryRgb: { r: 100, g: 100, b: 100 },
  secondaryRgb: { r: 70, g: 70, b: 70 },
  textContrast: '#ffffff',
  textSecondaryContrast: '#ffffff',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return null;
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) };
}

function getContrastColor(rgb: { r: number; g: number; b: number }): string {
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
}

function buildColorsFromHex(primary: string, secondary: string, accent: string): TeamColors {
  const pRgb = hexToRgb(primary) || DEFAULT_BRAND_COLORS.primaryRgb;
  const sRgb = hexToRgb(secondary) || DEFAULT_BRAND_COLORS.secondaryRgb;
  const aRgb = hexToRgb(accent) || pRgb;
  return {
    primary: `rgb(${pRgb.r}, ${pRgb.g}, ${pRgb.b})`,
    secondary: `rgb(${sRgb.r}, ${sRgb.g}, ${sRgb.b})`,
    accent: `rgba(${aRgb.r}, ${aRgb.g}, ${aRgb.b}, 0.1)`,
    primaryRgb: pRgb,
    secondaryRgb: sRgb,
    textContrast: getContrastColor(pRgb),
    textSecondaryContrast: getContrastColor(sRgb),
  };
}

interface UseLeagueBrandingOptions {
  slug: string | undefined;
  bannerUrl: string | undefined | null;
  logoUrl: string | undefined | null;
  manualPrimaryColor?: string | null;
  manualSecondaryColor?: string | null;
  manualAccentColor?: string | null;
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
  manualPrimaryColor,
  manualSecondaryColor,
  manualAccentColor,
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

    if (manualPrimaryColor) {
      const manual = buildColorsFromHex(
        manualPrimaryColor,
        manualSecondaryColor || manualPrimaryColor,
        manualAccentColor || manualPrimaryColor,
      );
      setColors(manual);
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

        const result = extracted || DEFAULT_BRAND_COLORS;
        setColors(result);
        cache[cacheKey] = {
          colors: result,
          timestamp: Date.now(),
          version: CACHE_VERSION,
          sourceUrl: imageUrl,
        };
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch {}
      } catch {
        if (!cancelled) setColors(DEFAULT_BRAND_COLORS);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    extract();
    return () => { cancelled = true; };
  }, [slug, bannerUrl, logoUrl, manualPrimaryColor, manualSecondaryColor, manualAccentColor, enabled]);

  return { colors, isLoading };
}
