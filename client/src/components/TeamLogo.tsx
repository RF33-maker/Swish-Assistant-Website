import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { normalizeTeamNameForFile } from "@/lib/teamUtils";

interface TeamLogoProps {
  teamName: string;
  leagueId: string;
  size?: "sm" | "md" | "lg" | "xl" | number;
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8",
  md: "w-12 h-12", 
  lg: "w-16 h-16",
  xl: "w-24 h-24"
};

/**
 * TeamLogo component that displays the team logo if available, or a fallback placeholder.
 * Automatically fetches and caches team logos for the league.
 * 
 * @param props.teamName - The name of the team
 * @param props.leagueId - The ID of the league
 * @param props.size - Size variant (sm, md, lg, xl)
 * @param props.className - Additional CSS classes
 */
export function TeamLogo({ teamName, leagueId, size = "md", className = "" }: TeamLogoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const fetchTeamLogo = async () => {
      try {
        setIsLoading(true);
        setHasError(false);
        
        console.log(`[TeamLogo] Fetching logo for team: "${teamName}" in league: ${leagueId}`);
        
        // Try common file extensions for team logos
        const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        let foundLogo = false;
        
        // Try two filename strategies:
        // 1. Normalized name (for new uploads and teams with variations like "Team I" -> "Team")
        // 2. Original name with underscores (for existing uploads with full names)
        const normalizedFileName = normalizeTeamNameForFile(teamName);
        const originalFileName = teamName.replace(/\s+/g, '_');
        const filenamesToTry = [normalizedFileName];
        
        // Only add original if different from normalized
        if (originalFileName !== normalizedFileName) {
          filenamesToTry.push(originalFileName);
        }
        
        console.log(`[TeamLogo] Trying filenames:`, filenamesToTry);
        
        for (const baseFileName of filenamesToTry) {
          for (const ext of extensions) {
            const fileName = `${leagueId}_${baseFileName}.${ext}`;
            
            // Get public URL from Supabase storage
            const { data } = supabase.storage
              .from('team-logos')
              .getPublicUrl(fileName);
            
            try {
              // Check if the file exists by attempting to fetch it
              const response = await fetch(data.publicUrl, { method: 'HEAD' });
              if (response.ok) {
                console.log(`[TeamLogo] ✓ Found logo: ${fileName} → ${data.publicUrl}`);
                setLogoUrl(data.publicUrl);
                foundLogo = true;
                break;
              }
            } catch (error) {
              // Continue to next extension
            }
          }
          
          if (foundLogo) break;
        }
        
        if (!foundLogo) {
          console.log(`[TeamLogo] ✗ No logo found for "${teamName}"`);
          setLogoUrl(null);
        }
      } catch (error) {
        console.error('Error fetching team logo:', error);
        setHasError(true);
        setLogoUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (leagueId && teamName) {
      fetchTeamLogo();
    }
  }, [leagueId, teamName]);

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
          className="w-full h-full object-cover"
          onError={handleImageError}
        />
      </div>
    );
  }

  // Fallback placeholder
  return (
    <div className={`${baseClasses} bg-orange-500 text-white font-bold border-2 border-orange-600`}>
      <div className="text-center">
        <div className={`font-bold ${size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-lg'}`}>
          {teamName.charAt(0).toUpperCase()}
        </div>
        {size !== 'sm' && (
          <div className="text-xs opacity-75 leading-none">TEAM</div>
        )}
      </div>
    </div>
  );
}