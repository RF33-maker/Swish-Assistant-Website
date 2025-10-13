import type { Express } from "express";
import { createServer, type Server } from "http";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { supabase } from "../client/src/lib/supabase";
import multer from 'multer';

// Configure multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  // Test endpoint to verify routes are working
  app.get("/api/test", (req, res) => {
    res.json({ message: "API routes are working!", timestamp: new Date().toISOString() });
  });

  // Team logo upload endpoint - Get upload URL
  app.post("/api/team-logos/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getTeamLogoUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting team logo upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Team logo save endpoint - Save logo association after upload
  app.post("/api/team-logos", async (req, res) => {
    try {
      const { leagueId, teamName, logoUrl } = req.body;

      if (!leagueId || !teamName || !logoUrl) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const objectStorageService = new ObjectStorageService();
      const logoPath = objectStorageService.normalizeTeamLogoPath(logoUrl);

      // Insert or update team logo in database
      const { data: logoData, error: logoError } = await supabase
        .from("team_logos")
        .upsert({
          league_id: leagueId,
          team_name: teamName,
          logo_url: logoPath,
          uploaded_by: "system", // In real app, this would be the authenticated user ID
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'league_id,team_name',
        })
        .select()
        .single();

      if (logoError) {
        console.error("Database error:", logoError);
        return res.status(500).json({ error: "Failed to save team logo" });
      }

      // Update the teams table with the logo_id
      const { error: teamError } = await supabase
        .from("teams")
        .upsert({
          league_id: leagueId,
          name: teamName,
          logo_id: logoData.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'league_id,name',
        });

      if (teamError) {
        console.error("Error updating team with logo_id:", teamError);
        // Don't fail the request, logo is still saved
      }

      res.json({
        success: true,
        logoPath,
        teamLogo: logoData,
      });
    } catch (error) {
      console.error("Error saving team logo:", error);
      res.status(500).json({ error: "Failed to save team logo" });
    }
  });

  // Team logo serving endpoint
  app.get("/team-logos/:logoPath(*)", async (req, res) => {
    try {
      const logoPath = `/team-logos/${req.params.logoPath}`;
      const objectStorageService = new ObjectStorageService();
      const logoFile = await objectStorageService.getTeamLogoFile(logoPath);
      objectStorageService.downloadObject(logoFile, res);
    } catch (error) {
      console.error("Error serving team logo:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Logo not found" });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Direct upload endpoint to bypass RLS policies
  app.post("/api/team-logos/upload-direct", upload.single('file'), async (req, res) => {
    try {
      console.log("Direct upload request received");
      
      const file = req.file;
      const { fileName, leagueId, teamName } = req.body;
      
      if (!fileName || !file || !leagueId || !teamName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      console.log("Uploading:", fileName, "Size:", file.size);

      // Use service role client to upload (bypasses RLS)
      const { data, error } = await supabase.storage
        .from('team-logos')
        .upload(fileName, file.buffer, {
          upsert: true,
          contentType: file.mimetype
        });

      if (error) {
        console.error("Storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('team-logos')
        .getPublicUrl(fileName);

      console.log("Upload successful, public URL:", publicUrl);

      res.json({
        success: true,
        publicUrl,
        fileName
      });
    } catch (error) {
      console.error("Direct upload error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  // API endpoint for TeamLogo component to get team logos for a league
  app.get("/api/leagues/:leagueId/team-logos", async (req, res) => {
    try {
      const { leagueId } = req.params;
      
      // Get all teams for this league from player_stats
      const { data: playerStats, error: teamsError } = await supabase
        .from('player_stats')
        .select('team')
        .eq('league_id', leagueId);

      if (teamsError) {
        console.error("Error fetching teams:", teamsError);
        return res.status(500).json({ error: "Failed to fetch teams" });
      }

      // Get unique team names
      const teams = Array.from(new Set(
        playerStats?.map((stat: any) => stat.team).filter(Boolean) || []
      ));

      // Check for existing logo files for each team using direct storage access
      const teamLogos: Record<string, string> = {};
      
      for (const teamName of teams) {
        try {
          const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
          let found = false;
          
          for (const ext of extensions) {
            const fileName = `${leagueId}_${teamName.replace(/\s+/g, '_')}.${ext}`;
            
            const { data } = supabase.storage
              .from('team-logos')
              .getPublicUrl(fileName);
            
            // Check if file exists by trying to fetch it
            try {
              const response = await fetch(data.publicUrl, { method: 'HEAD' });
              if (response.ok) {
                teamLogos[teamName] = data.publicUrl;
                found = true;
                break;
              }
            } catch (error) {
              // Continue to next extension
            }
          }
        } catch (error) {
          // Continue to next team
        }
      }

      res.json(teamLogos);
    } catch (error) {
      console.error("Error fetching team logos API:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Dynamic sitemap generation logic (shared by both endpoints)
  const generateSitemap = async () => {
    console.log("🗺️ Generating dynamic sitemap...");

    // Get current date for lastmod
    const today = new Date().toISOString().split('T')[0];

    // Fetch all public leagues
    const { data: leagues, error: leaguesError } = await supabase
      .from("leagues")
      .select("slug, name, created_at")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    if (leaguesError) {
      console.error("Error fetching leagues for sitemap:", leaguesError);
    }

    // Fetch all distinct teams (from player_stats to get active teams)
    const { data: teamStats, error: teamsError } = await supabase
      .from("player_stats")
      .select("team_name, team, league_id");

    if (teamsError) {
      console.error("Error fetching teams for sitemap:", teamsError);
    }

    // Get unique teams
    const teamsMap = new Map();
    teamStats?.forEach(stat => {
      const teamName = stat.team_name || stat.team;
      if (teamName) {
        const key = `${teamName}-${stat.league_id}`;
        if (!teamsMap.has(key)) {
          teamsMap.set(key, { name: teamName, league_id: stat.league_id });
        }
      }
    });
    const teams = Array.from(teamsMap.values());

    // Fetch all distinct players
    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, full_name");

    if (playersError) {
      console.error("Error fetching players for sitemap:", playersError);
    }

    console.log(`📊 Sitemap stats: ${leagues?.length || 0} leagues, ${teams.length} teams, ${players?.length || 0} players`);

    // Build XML sitemap
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Add homepage
    xml += '  <url>\n';
    xml += '    <loc>https://www.swishassistant.com/</loc>\n';
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += '    <changefreq>daily</changefreq>\n';
    xml += '    <priority>1.0</priority>\n';
    xml += '  </url>\n';

    // Add static pages
    const staticPages = [
      { path: '/coaches-hub', changefreq: 'weekly', priority: '0.8' },
      { path: '/teams-list', changefreq: 'weekly', priority: '0.7' },
      { path: '/players-list', changefreq: 'weekly', priority: '0.7' },
      { path: '/privacy', changefreq: 'monthly', priority: '0.3' },
      { path: '/terms', changefreq: 'monthly', priority: '0.3' },
      { path: '/cookies', changefreq: 'monthly', priority: '0.3' },
    ];

    staticPages.forEach(page => {
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com${page.path}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    });

    // Add league pages
    leagues?.forEach(league => {
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/league/${league.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.9</priority>\n';
      xml += '  </url>\n';

      // Add league leaders page
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/league-leaders/${league.slug}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>daily</changefreq>\n';
      xml += '    <priority>0.8</priority>\n';
      xml += '  </url>\n';

      // Add league teams page
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/league/${league.slug}/teams</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.7</priority>\n';
      xml += '  </url>\n';
    });

    // Add team pages
    teams.forEach(team => {
      // URL-encode team names for safety
      const encodedTeamName = encodeURIComponent(team.name.toLowerCase().replace(/\s+/g, '-'));
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/team/${encodedTeamName}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.6</priority>\n';
      xml += '  </url>\n';
    });

    // Add player pages
    players?.forEach(player => {
      xml += '  <url>\n';
      xml += `    <loc>https://www.swishassistant.com/player/${player.id}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '    <priority>0.5</priority>\n';
      xml += '  </url>\n';
    });

    xml += '</urlset>';
    
    console.log("✅ Sitemap generated successfully");
    return xml;
  };

  // Serve sitemap at /sitemap.xml (for robots.txt compatibility)
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const xml = await generateSitemap();
      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap</error>');
    }
  });

  // Also serve at /api/sitemap for programmatic access
  app.get("/api/sitemap", async (req, res) => {
    try {
      const xml = await generateSitemap();
      res.header('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap</error>');
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}