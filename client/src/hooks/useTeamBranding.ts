import { useState, useEffect } from 'react';
import { extractTeamColors, extractColorsFromImage, TeamColors, getContrastColor } from '@/lib/colorExtractor';
import { supabase } from '@/lib/supabase';

function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
  const hex = color.trim();
  if (hex.startsWith('#')) {
    const h = hex.slice(1);
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
      };
    }
  }
  const rgbMatch = hex.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }
  return null;
}

interface UseTeamBrandingOptions {
  teamName: string;
  leagueId: string;
  enabled?: boolean;
}

interface UseTeamBrandingResult {
  colors: TeamColors | null;
  isLoading: boolean;
  primaryColor: string;
  secondaryColor: string;
}

const DEFAULT_PRIMARY = 'rgb(251, 146, 60)';
const DEFAULT_SECONDARY = 'rgb(59, 130, 246)';

interface LeagueLogoData {
  logoUrl: string | null;
  brandPrimaryColour: string | null;
}

const leagueLogoCache = new Map<string, LeagueLogoData>();
const leagueLogoFetching = new Map<string, Promise<LeagueLogoData>>();

async function getLeagueLogoViaSupabase(leagueId: string): Promise<LeagueLogoData> {
  try {
    const { data, error } = await supabase
      .from('competitions')
      .select('logo_url, parent_league_id, brand_primary_colour')
      .eq('league_id', leagueId)
      .single();

    if (error || !data) {
      if (error) console.warn('useTeamBranding: Supabase league fetch failed for', leagueId, error.message);
      return { logoUrl: null, brandPrimaryColour: null };
    }

    const brandPrimaryColour = data.brand_primary_colour || null;

    if (data.logo_url) return { logoUrl: data.logo_url, brandPrimaryColour };

    if (data.parent_league_id) {
      const { data: parentData } = await supabase
        .from('competitions')
        .select('logo_url, brand_primary_colour')
        .eq('league_id', data.parent_league_id)
        .single();
      return {
        logoUrl: parentData?.logo_url || null,
        brandPrimaryColour: brandPrimaryColour || parentData?.brand_primary_colour || null,
      };
    }

    return { logoUrl: null, brandPrimaryColour };
  } catch (err) {
    console.warn('useTeamBranding: unexpected error fetching league data for', leagueId, err);
    return { logoUrl: null, brandPrimaryColour: null };
  }
}

async function getLeagueLogoData(leagueId: string): Promise<LeagueLogoData> {
  if (leagueLogoCache.has(leagueId)) {
    return leagueLogoCache.get(leagueId)!;
  }

  if (leagueLogoFetching.has(leagueId)) {
    return leagueLogoFetching.get(leagueId)!;
  }

  const fetchPromise = (async (): Promise<LeagueLogoData> => {
    try {
      const res = await fetch(`/api/public/league-logo/${encodeURIComponent(leagueId)}`);
      if (res.ok) {
        const apiData = await res.json();
        const logoUrl: string | null = apiData?.logo_url || null;
        const brandPrimaryColour: string | null = apiData?.brand_primary_colour || null;

        // If the API gave us either a logo or a colour, use them directly —
        // this works for both public and private child leagues (the endpoint
        // follows parent_league_id server-side via the service-role client).
        if (logoUrl || brandPrimaryColour) {
          const result: LeagueLogoData = { logoUrl, brandPrimaryColour };
          leagueLogoCache.set(leagueId, result);
          return result;
        }
      }

      // Fall back to anon Supabase for public leagues that the API couldn't find.
      const supabaseData = await getLeagueLogoViaSupabase(leagueId);
      leagueLogoCache.set(leagueId, supabaseData);
      return supabaseData;
    } catch {
      const empty: LeagueLogoData = { logoUrl: null, brandPrimaryColour: null };
      leagueLogoCache.set(leagueId, empty);
      return empty;
    } finally {
      leagueLogoFetching.delete(leagueId);
    }
  })();

  leagueLogoFetching.set(leagueId, fetchPromise);
  return fetchPromise;
}

function buildColorsFromBrandColour(brandColour: string): TeamColors | null {
  const rgb = parseColorToRgb(brandColour);
  if (!rgb) {
    console.error('useTeamBranding: brand_primary_colour is in an unrecognised format:', brandColour);
    return null;
  }
  return {
    primary: brandColour,
    secondary: brandColour,
    accent: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
    primaryRgb: rgb,
    secondaryRgb: rgb,
    textContrast: getContrastColor(rgb),
    textSecondaryContrast: getContrastColor(rgb),
  };
}

export function useTeamBranding({ 
  teamName, 
  leagueId, 
  enabled = true 
}: UseTeamBrandingOptions): UseTeamBrandingResult {
  const [colors, setColors] = useState<TeamColors | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !teamName || !leagueId) {
      setColors(null);
      return;
    }

    let cancelled = false;

    const extractColors = async () => {
      setIsLoading(true);
      try {
        const extracted = await extractTeamColors(teamName, leagueId);
        if (cancelled) return;

        if (extracted) {
          setColors(extracted);
          return;
        }

        const leagueData = await getLeagueLogoData(leagueId);
        if (cancelled) return;

        if (leagueData.logoUrl) {
          const fullUrl = leagueData.logoUrl.startsWith('http')
            ? leagueData.logoUrl
            : `${window.location.origin}${leagueData.logoUrl}`;
          const leagueColors = await extractColorsFromImage(fullUrl);
          if (cancelled) return;

          if (leagueColors) {
            setColors(leagueColors);
            return;
          }
        }

        // Image extraction failed — use brand_primary_colour fetched alongside the logo
        if (leagueData.brandPrimaryColour) {
          console.warn('useTeamBranding: image color extraction unavailable, using Supabase brand_primary_colour for league', leagueId);
          const brandColors = buildColorsFromBrandColour(leagueData.brandPrimaryColour);
          if (!cancelled) {
            setColors(brandColors);
          }
          return;
        }

        if (!cancelled) setColors(null);
      } catch (error) {
        console.error('Failed to extract team colors:', error);
        if (!cancelled) setColors(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    extractColors();
    return () => { cancelled = true; };
  }, [teamName, leagueId, enabled]);

  return {
    colors,
    isLoading,
    primaryColor: colors?.primary || DEFAULT_PRIMARY,
    secondaryColor: colors?.secondary || DEFAULT_SECONDARY,
  };
}
