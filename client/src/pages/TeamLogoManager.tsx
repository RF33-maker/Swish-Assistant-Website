import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { supabase } from "@/lib/supabase";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { TeamLogoUploader } from "@/components/TeamLogoUploader";
import { TeamLogo } from "@/components/TeamLogo";
import React from "react";

interface League {
  league_id: string;
  name: string;
  slug: string;
  user_id: string;
}

interface Team {
  name: string;
  hasLogo: boolean;
}

export default function TeamLogoManager() {
  const { slug } = useParams();
  const [location, navigate] = useLocation();
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const fetchLeagueAndTeams = async () => {
      if (!slug) return;
      
      setLoading(true);
      try {
        // Fetch league info
        const { data: leagueData, error: leagueError } = await supabase
          .from("leagues")
          .select("*")
          .eq("slug", slug)
          .single();

        if (leagueError) {
          console.error("Error fetching league:", leagueError);
          return;
        }

        setLeague(leagueData);
        setIsOwner(currentUser?.id === leagueData.user_id);

        // Fetch teams from multiple sources to ensure we get ALL teams
        const allTeamNames = new Set<string>();
        
        // 1. Get teams from teams table (source of truth)
        const { data: teamsData, error: teamsError } = await supabase
          .from("teams")
          .select("name")
          .eq("league_id", leagueData.league_id);

        if (teamsData && !teamsError) {
          teamsData.forEach(team => {
            if (team.name) allTeamNames.add(team.name);
          });
        }

        // 2. Get teams from team_stats (teams with live stats)
        const { data: teamStats, error: statsError } = await supabase
          .from("team_stats")
          .select("*")  // Select all fields including tot_s* stats
          .eq("league_id", leagueData.league_id);

        if (teamStats && !statsError) {
          teamStats.forEach(stat => {
            if (stat.name) allTeamNames.add(stat.name);
          });
        }

        // 3. Get teams from game_schedule (all teams that played, even without live stats)
        const { data: scheduleData, error: scheduleError } = await supabase
          .from("game_schedule")
          .select("hometeam, awayteam")
          .eq("league_id", leagueData.league_id);

        if (scheduleData && !scheduleError) {
          scheduleData.forEach(game => {
            if (game.hometeam) allTeamNames.add(game.hometeam);
            if (game.awayteam) allTeamNames.add(game.awayteam);
          });
        }

        console.log("Fetching teams for league:", leagueData.league_id);
        console.log("Team query result:", { error: teamsError || statsError || scheduleError, data: Array.from(allTeamNames) });
        
        const uniqueTeams = Array.from(allTeamNames).sort();
        console.log("Unique teams extracted:", uniqueTeams);
        
        // Fetch existing team logos from the team_logos table (authoritative source)
        const { data: storedLogos, error: logoError } = await supabase
          .from("team_logos")
          .select("team_name, logo_url")
          .eq("league_id", leagueData.league_id);

        const logoMap: Record<string, string> = {};
        
        if (!logoError && storedLogos) {
          storedLogos.forEach((logo: any) => {
            logoMap[logo.team_name] = logo.logo_url;
          });
          console.log("Team logos from database:", logoMap);
        }
        
        // For teams not in the database, check storage directly with all extensions
        console.log("Checking storage for teams without database entries...");
        const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        
        for (const teamName of uniqueTeams) {
          if (logoMap[teamName]) {
            console.log(`${teamName} already has logo from database`);
            continue; // Skip if already found in database
          }
          
          const baseFileName = teamName.replace(/\s+/g, '_');
          let foundLogo = false;
          
          for (const ext of extensions) {
            const fileName = `${leagueData.league_id}_${baseFileName}.${ext}`;
            console.log(`Checking for logo: ${fileName}`);
            
            const { data } = supabase.storage
              .from('team-logos')
              .getPublicUrl(fileName);
            
            try {
              const response = await fetch(data.publicUrl, { method: 'HEAD' });
              if (response.ok) {
                logoMap[teamName] = data.publicUrl;
                console.log(`Found logo for ${teamName}: ${data.publicUrl}`);
                foundLogo = true;
                break;
              }
            } catch (error) {
              // Continue to next extension
            }
          }
          
          if (!foundLogo) {
            console.log(`No logo found for ${teamName}`);
          }
        }
        
        console.log("Team logos loaded:", logoMap);
        setTeamLogos(logoMap);

        const teamsWithLogos = uniqueTeams.map(teamName => ({
          name: teamName,
          hasLogo: !!logoMap[teamName]
        }));

        setTeams(teamsWithLogos);
      } catch (error) {
        console.error("Error fetching league and teams:", error);
      } finally {
        setLoading(false);
      }
    };

    if (currentUser !== undefined) {
      fetchLeagueAndTeams();
    }
  }, [slug, currentUser]);

  const handleLogoUploadComplete = (teamName: string) => {
    // Refresh the page to show updated logos
    window.location.reload();
  };

  const handleRemoveLogo = async (teamName: string) => {
    if (!league) return;

    try {
      // Remove from team_logos database table
      const { error } = await supabase
        .from("team_logos")
        .delete()
        .eq("league_id", league.league_id)
        .eq("team_name", teamName);

      if (error) {
        console.error("Error removing logo from database:", error);
      }

      // Try to remove from Supabase storage (try multiple extensions)
      const baseFileName = `${league.league_id}_${teamName.replace(/\s+/g, '_')}`;
      const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
      
      for (const ext of extensions) {
        const fileName = `${baseFileName}.${ext}`;
        await supabase.storage.from('team-logos').remove([fileName]);
      }

      // Update local state
      setTeamLogos(prev => {
        const updated = { ...prev };
        delete updated[teamName];
        return updated;
      });

      setTeams(prev => prev.map(team => 
        team.name === teamName ? { ...team, hasLogo: false } : team
      ));
    } catch (error) {
      console.error("Error removing logo:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf1] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading team management...</p>
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-[#fffaf1] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">League Not Found</h1>
          <p className="text-slate-600 mb-4">The league you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate("/")}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-[#fffaf1] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-4">Only league owners can manage team logos.</p>
          <button
            onClick={() => navigate(`/league/${slug}`)}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-lg"
          >
            Back to League
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fffaf1]">
      <header className="bg-white shadow-sm sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={SwishLogo}
            alt="Swish Assistant"
            className="h-9 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>

        <div className="flex gap-4 text-sm">
          <button
            onClick={() => navigate("/")}
            className="text-slate-600 hover:text-orange-500"
          >
            Home
          </button>
          <button
            onClick={() => navigate(`/league/${slug}`)}
            className="text-slate-600 hover:text-orange-500"
          >
            Back to League
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Team Logo Management</h1>
          <p className="text-slate-600">
            Upload and manage team logos for <span className="font-semibold">{league.name}</span>
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Team logos will appear across all league features including scoreboards, standings, and team profiles.
          </p>
        </div>

        {/* Teams Grid */}
        {teams.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => (
              <div key={team.name} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Team Header */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-4 text-white">
                  <div className="flex items-center gap-3">
                    <TeamLogo 
                      teamName={team.name} 
                      leagueId={league.league_id}
                      size="md"
                      className="border-2 border-white/30"
                    />
                    <div>
                      <h3 className="font-bold text-lg">{team.name}</h3>
                      <p className="text-sm opacity-90">
                        {team.hasLogo ? "Has Logo" : "No Logo"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Team Actions */}
                <div className="p-4 space-y-3">
                  {/* Current Logo Preview */}
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700 mb-2">Current Logo:</p>
                    <TeamLogo 
                      teamName={team.name} 
                      leagueId={league.league_id}
                      size="xl"
                      className="mx-auto"
                    />
                  </div>

                  {/* Upload/Replace Button */}
                  <TeamLogoUploader
                    leagueId={league.league_id}
                    teamName={team.name}
                    onUploadComplete={() => handleLogoUploadComplete(team.name)}
                    buttonClassName={`w-full ${team.hasLogo ? 'bg-blue-500 hover:bg-blue-600' : 'bg-orange-500 hover:bg-orange-600'} text-white font-medium py-2 px-4 rounded-lg transition-colors`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      {team.hasLogo ? 'Replace Logo' : 'Upload Logo'}
                    </div>
                  </TeamLogoUploader>

                  {/* Remove Logo Button */}
                  {team.hasLogo && (
                    <button
                      onClick={() => handleRemoveLogo(team.name)}
                      className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Remove Logo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-2xl font-medium text-gray-900 mb-2">No Teams Found</h3>
            <p className="text-gray-600">Teams will appear here once player data is available for this league.</p>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-2">📋 Logo Guidelines</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Logos should be square (1:1 aspect ratio) for best results</li>
            <li>• Recommended size: 512x512 pixels or larger</li>
            <li>• Supported formats: JPG, PNG, GIF, WebP</li>
            <li>• Maximum file size: 5MB</li>
            <li>• Logos will automatically appear in scoreboards, standings, and team profiles</li>
          </ul>
        </div>
      </main>
    </div>
  );
}