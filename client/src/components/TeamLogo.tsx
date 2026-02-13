import { useState, useEffect } from "react";
import { getTeamLogoCached, invalidateLogoCacheEntry } from "@/utils/teamLogoCache";
import { debugLog } from "@/utils/debug";

interface TeamLogoProps {
  teamName: string;
  leagueId: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | number;
  className?: string;
  logoUrl?: string;
}

export const LOGO_CACHE_INVALIDATE_EVENT = 'teamLogoCacheInvalidate';

export function invalidateLogoCache(teamName?: string, leagueId?: string) {
  if (teamName && leagueId) {
    invalidateLogoCacheEntry(leagueId, teamName);
  }
  window.dispatchEvent(new CustomEvent(LOGO_CACHE_INVALIDATE_EVENT, { 
    detail: { teamName, leagueId } 
  }));
}

const sizeClasses = {
  xs: "w-5 h-5",
  sm: "w-8 h-8",
  md: "w-12 h-12", 
  lg: "w-16 h-16",
  xl: "w-24 h-24"
};

export function TeamLogo({ teamName, leagueId, size = "md", className = "", logoUrl: providedLogoUrl }: TeamLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(providedLogoUrl || null);
  const [isLoading, setIsLoading] = useState(!providedLogoUrl);
  const [hasError, setHasError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const handleInvalidate = (event: CustomEvent<{ teamName?: string; leagueId?: string }>) => {
      const { teamName: eventTeam, leagueId: eventLeague } = event.detail || {};
      if (!eventTeam || eventTeam === teamName) {
        if (!eventLeague || eventLeague === leagueId) {
          debugLog(`[TeamLogo] Cache invalidated for ${teamName}, refetching...`);
          setLogoUrl(null);
          setHasError(false);
          setRefreshKey(prev => prev + 1);
        }
      }
    };

    window.addEventListener(LOGO_CACHE_INVALIDATE_EVENT, handleInvalidate as EventListener);
    return () => {
      window.removeEventListener(LOGO_CACHE_INVALIDATE_EVENT, handleInvalidate as EventListener);
    };
  }, [teamName, leagueId]);

  useEffect(() => {
    if (providedLogoUrl) {
      setLogoUrl(providedLogoUrl);
      setIsLoading(false);
      return;
    }

    if (!leagueId || !teamName) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchLogo = async () => {
      setIsLoading(true);
      setHasError(false);

      try {
        const url = await getTeamLogoCached({ leagueId, teamName });
        if (!cancelled) {
          setLogoUrl(url);
        }
      } catch {
        if (!cancelled) {
          setHasError(true);
          setLogoUrl(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchLogo();

    return () => {
      cancelled = true;
    };
  }, [leagueId, teamName, refreshKey, providedLogoUrl]);

  const handleImageError = () => {
    setHasError(true);
    setLogoUrl(null);
  };

  const getSizeClasses = () => {
    if (typeof size === 'number') {
      return `w-${Math.max(1, Math.floor(size/4))} h-${Math.max(1, Math.floor(size/4))}`;
    }
    return sizeClasses[size as keyof typeof sizeClasses];
  };

  const baseClasses = `${getSizeClasses()} rounded-lg flex items-center justify-center ${className}`;

  if (isLoading) {
    return (
      <div className={`${baseClasses} bg-gray-200 animate-pulse`}>
        <div className="text-gray-400 text-xs">...</div>
      </div>
    );
  }

  if (logoUrl && !hasError) {
    return (
      <div className={`${baseClasses} overflow-hidden`}>
        <img
          src={logoUrl}
          alt={`${teamName} logo`}
          className="max-w-full max-h-full object-contain"
          onError={handleImageError}
        />
      </div>
    );
  }

  return (
    <div className={`${baseClasses} bg-orange-500 text-white font-bold border-2 border-orange-600`}>
      <div className="text-center">
        <div className={`font-bold ${size === 'xs' ? 'text-[8px]' : size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-lg'}`}>
          {teamName.charAt(0).toUpperCase()}
        </div>
        {size !== 'xs' && size !== 'sm' && (
          <div className="text-xs opacity-75 leading-none">TEAM</div>
        )}
      </div>
    </div>
  );
}
