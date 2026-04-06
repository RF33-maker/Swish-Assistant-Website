import { useState, useEffect } from 'react';
import { extractTeamColors, extractColorsFromImage, TeamColors } from '@/lib/colorExtractor';
import { supabase } from '@/lib/supabase';

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

async function getLeagueLogoUrl(leagueId: string): Promise<string | null> {
  if (leagueLogoCache.has(leagueId)) {
    return leagueLogoCache.get(leagueId)!;
  }

  if (leagueLogoFetching.has(leagueId)) {
    return leagueLogoFetching.get(leagueId)!;
  }

  const fetchPromise = (async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('leagues')
        .select('logo_url, parent_league_id')
        .eq('league_id', leagueId)
        .single();

      if (error || !data) {
        leagueLogoCache.set(leagueId, null);
        return null;
      }

      if (data.logo_url) {
        leagueLogoCache.set(leagueId, data.logo_url);
        return data.logo_url;
      }

      if (data.parent_league_id) {
        const { data: parentData } = await supabase
          .from('leagues')
          .select('logo_url')
          .eq('league_id', data.parent_league_id)
          .single();

        const parentLogo = parentData?.logo_url || null;
        leagueLogoCache.set(leagueId, parentLogo);
        return parentLogo;
      }

      leagueLogoCache.set(leagueId, null);
      return null;
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

        setColors(null);
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
