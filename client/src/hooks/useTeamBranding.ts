import { useState, useEffect } from 'react';
import { extractTeamColors, TeamColors } from '@/lib/colorExtractor';

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

    const extractColors = async () => {
      setIsLoading(true);
      try {
        const extracted = await extractTeamColors(teamName, leagueId);
        setColors(extracted);
      } catch (error) {
        console.error('Failed to extract team colors:', error);
        setColors(null);
      } finally {
        setIsLoading(false);
      }
    };

    extractColors();
  }, [teamName, leagueId, enabled]);

  return {
    colors,
    isLoading,
    primaryColor: colors?.primary || DEFAULT_PRIMARY,
    secondaryColor: colors?.secondary || DEFAULT_SECONDARY,
  };
}
