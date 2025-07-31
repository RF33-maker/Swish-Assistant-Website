import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { generatePlayerAnalysis } from "./ai-analysis";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("=== REGISTERING ROUTES ===");
  
  // sets up /api/register, /api/login, /api/logout, /api/user
  setupAuth(app);
  console.log("Auth routes registered");

  // Add API prefix test endpoint
  app.get("/api/test", (req, res) => {
    console.log("Test endpoint hit");
    res.json({ message: "API routes are working!" });
  });
  console.log("Test route registered at /api/test");

  // AI Analysis endpoint
  app.post("/api/ai-analysis", async (req, res) => {
    console.log("AI Analysis endpoint hit with data:", req.body);
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
  console.log("AI Analysis route registered at /api/ai-analysis");
  
  // Debug: List all registered routes
  console.log("All routes registered:");
  app._router.stack.forEach((middleware, index) => {
    if (middleware.route) {
      console.log(`${index}: ${middleware.route.methods} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      console.log(`${index}: Router middleware`);
    } else {
      console.log(`${index}: ${middleware.name} middleware`);
    }
  });

  // Add additional API routes here if needed
  
  const httpServer = createServer(app);

  return httpServer;
}
