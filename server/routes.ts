import type { Express } from "express";
import { createServer, type Server } from "http";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { supabase } from "../client/src/lib/supabase";

export async function registerRoutes(app: Express): Promise<Server> {
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
      const { data, error } = await supabase
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

      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: "Failed to save team logo" });
      }

      res.json({
        success: true,
        logoPath,
        teamLogo: data,
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

  // Get team logos for a league
  app.get("/api/leagues/:leagueId/team-logos", async (req, res) => {
    try {
      const { leagueId } = req.params;

      const { data, error } = await supabase
        .from("team_logos")
        .select("*")
        .eq("league_id", leagueId);

      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: "Failed to fetch team logos" });
      }

      // Convert database format to client format
      const teamLogos = data.reduce((acc: Record<string, string>, logo: any) => {
        acc[logo.team_name] = logo.logo_url;
        return acc;
      }, {});

      res.json(teamLogos);
    } catch (error) {
      console.error("Error fetching team logos:", error);
      res.status(500).json({ error: "Failed to fetch team logos" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}