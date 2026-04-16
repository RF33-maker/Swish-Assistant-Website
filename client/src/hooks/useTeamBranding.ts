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

const leagueLogoCache = new Map<string, string | null>();
const leagueLogoFetching = new Map<string, Promise<string | null>>();

async function getLeagueLogoViaSupabase(leagueId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('leagues')
      .select('logo_url, parent_league_id')
      .eq('league_id', leagueId)
      .single();

    if (error || !data) return null;

    if (data.logo_url) return data.logo_url;

    if (data.parent_league_id) {
      const { data: parentData } = await supabase
        .from('leagues')
        .select('logo_url')
        .eq('league_id', data.parent_league_id)
        .single();
      return parentData?.logo_url || null;
    }

    return null;
  } catch {
    return null;
  }
}

async function getLeagueLogoUrl(leagueId: string): Promise<string | null> {
  if (leagueLogoCache.has(leagueId)) {
    return leagueLogoCache.get(leagueId)!;
  }

  if (leagueLogoFetching.has(leagueId)) {
    return leagueLogoFetching.get(leagueId)!;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    try {
      const res = await fetch(`/api/public/league-logo/${encodeURIComponent(leagueId)}`);
      if (res.ok) {
        const data = await res.json();
        const logoUrl = data?.logo_url || null;
        if (logoUrl) {
          leagueLogoCache.set(leagueId, logoUrl);
          return logoUrl;
        }
      }

      const supabaseLogo = await getLeagueLogoViaSupabase(leagueId);
      leagueLogoCache.set(leagueId, supabaseLogo);
      return supabaseLogo;
    } catch {
      leagueLogoCache.set(leagueId, null);
      return null;
    } finally {
      leagueLogoFetching.delete(leagueId);
    }
  })();

  leagueLogoFetching.set(leagueId, fetchPromise);
  return fetchPromise;
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

        const leagueLogoUrl = await getLeagueLogoUrl(leagueId);
        if (cancelled) return;

        if (leagueLogoUrl) {
          const fullUrl = leagueLogoUrl.startsWith('http')
            ? leagueLogoUrl
            : `${window.location.origin}${leagueLogoUrl}`;
          const leagueColors = await extractColorsFromImage(fullUrl);
          if (cancelled) return;

          if (leagueColors) {
            setColors(leagueColors);
            return;
          }
        }

        // Final fallback: check brand_primary_colour stored on the league record
        try {
          const { data: leagueData } = await supabase
            .from('leagues')
            .select('brand_primary_colour')
            .eq('league_id', leagueId)
            .single();

          if (!cancelled && leagueData?.brand_primary_colour) {
            const rgb = parseColorToRgb(leagueData.brand_primary_colour);
            if (rgb) {
              setColors({
                primary: leagueData.brand_primary_colour,
                secondary: leagueData.brand_primary_colour,
                accent: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
                primaryRgb: rgb,
                secondaryRgb: rgb,
                textContrast: getContrastColor(rgb),
                textSecondaryContrast: getContrastColor(rgb),
              });
              return;
            }
          }
        } catch {
          // ignore — fall through to null
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
