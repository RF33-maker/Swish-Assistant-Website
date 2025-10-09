import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

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
        
        // Query team_logos table for this team's logo
        const { data, error } = await supabase
          .from('team_logos')
          .select('logo_url')
          .eq('league_id', leagueId)
          .eq('team_name', teamName)
          .maybeSingle();
        
        console.log('🖼️ TeamLogo fetch:', { leagueId, teamName, data, error });
        
        if (error) {
          console.error('Error fetching team logo from database:', error);
          setLogoUrl(null);
        } else if (data?.logo_url) {
          // Remove the /team-logos/ prefix from the path if present
          const logoPath = data.logo_url.startsWith('/team-logos/') 
            ? data.logo_url.slice('/team-logos/'.length)
            : data.logo_url;
          
          console.log('🖼️ Logo path:', { original: data.logo_url, processed: logoPath });
          
          // Convert the logo path to a public URL
          const { data: urlData } = supabase.storage
            .from('team-logos')
            .getPublicUrl(logoPath);
          
          console.log('🖼️ Public URL:', urlData.publicUrl);
          setLogoUrl(urlData.publicUrl);
        } else {
          console.log('🖼️ No logo found for team');
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