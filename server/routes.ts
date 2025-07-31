import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { generatePlayerAnalysis } from "./ai-analysis";

export async function registerRoutes(app: Express): Promise<Server> {
  // sets up /api/register, /api/login, /api/logout, /api/user
  setupAuth(app);

  // AI Analysis endpoint
  app.post("/api/ai-analysis", async (req, res) => {
    try {
      const playerData = req.body;
      
      // Validate required fields
      if (!playerData.name || typeof playerData.games_played !== 'number') {
        return res.status(400).json({ error: "Invalid player data" });
      }

      const analysis = await generatePlayerAnalysis(playerData);
      res.json({ analysis });
    } catch (error) {
      console.error("AI Analysis API Error:", error);
      res.status(500).json({ 
        error: "Failed to generate analysis",
        analysis: "Dynamic player with strong fundamentals and competitive drive."
      });
    }
  });

  // Add additional API routes here if needed
  
  const httpServer = createServer(app);

  return httpServer;
}
