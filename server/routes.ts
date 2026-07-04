import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import * as https from "https";
import * as http from "http";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { supabaseAdmin } from "./supabaseServiceClient";
import { detectDuplicates } from "./playerMergeUtils";
import multer from 'multer';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// ── Photo fallback map ──────────────────────────────────────────────────────
// Keyed by normalised full name (lowercase, trimmed, collapsed whitespace,
// non-alpha stripped) → photo_path_bg_removed.  Used as a fallback when a
// player's specific ID has no photo set but another record for the same person
// (different league/season) does.
function normalisePlayerName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z\s]/g, '');
}

const PHOTO_FALLBACK_TTL_MS = 5 * 60 * 1000;
let photoFallbackCache: { map: Map<string, string>; at: number } | null = null;

async function fetchPhotoFallbackMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (photoFallbackCache && now - photoFallbackCache.at < PHOTO_FALLBACK_TTL_MS) {
    return photoFallbackCache.map;
  }
  const { data } = await supabaseAdmin
    .from('players')
    .select('full_name, photo_path_bg_removed')
    .not('photo_path_bg_removed', 'is', null)
    .neq('photo_path_bg_removed', '');
  const map = new Map<string, string>();
  for (const row of (data || []) as { full_name: string; photo_path_bg_removed: string }[]) {
    if (row.full_name && row.photo_path_bg_removed) {
      const key = normalisePlayerName(row.full_name);
      if (key && !map.has(key)) map.set(key, row.photo_path_bg_removed);
    }
  }
  photoFallbackCache = { map, at: now };
  return map;
}

function generatePlayerSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let field = "";
        i++;
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++;
            break;
          } else {
            field += line[i++];
          }
        }
        fields.push(field);
        if (line[i] === ",") i++;
      } else {
        let field = "";
        while (i < line.length && line[i] !== ",") field += line[i++];
        fields.push(field.trim());
        if (line[i] === ",") i++;
      }
    }
    return fields;
  };

  const headers = parseRow(nonEmpty[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < nonEmpty.length; r++) {
    const values = parseRow(nonEmpty[r]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

const upload = multer({ storage: multer.memoryStorage() });

async function authenticateSupabaseUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = await authenticateSupabaseUser(req);
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  const { data: adminUserData, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (adminUserError || !adminUserData?.user) { res.status(403).json({ error: 'Admin access required' }); return null; }
  if (adminUserData.user.app_metadata?.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return null; }
  return userId;
}

async function verifyLeagueOwnership(userId: string, leagueId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('competitions')
    .select('user_id, created_by')
    .eq('league_id', leagueId)
    .single();
  if (error || !data) return false;
  return data.user_id === userId || data.created_by === userId;
}

const RENDER_BACKEND_URL = (process.env.VITE_BACKEND_URL || '').replace(/\/$/, '');

function proxyToRender(req: Request, res: Response, urlPath: string): void {
  if (!RENDER_BACKEND_URL) {
    res.status(503).json({ error: 'VITE_BACKEND_URL is not configured on the server.' });
    return;
  }
  const targetUrl = `${RENDER_BACKEND_URL}${urlPath}`;
  console.log(`[proxy] → ${req.method} ${targetUrl}`);

  const body = JSON.stringify(req.body);
  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch {
    res.status(500).json({ error: `Invalid VITE_BACKEND_URL: ${RENDER_BACKEND_URL}` });
    return;
  }

  const options: http.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 55_000,
  };

  const transport = parsed.protocol === 'https:' ? https : http;
  const proxyReq = transport.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    proxyRes.on('end', () => {
      const ct = proxyRes.headers['content-type'] || '';
      console.log(`[proxy] ← ${proxyRes.statusCode} content-type="${ct}" body-start="${data.slice(0, 100)}"`);
      if (ct.includes('text/html')) {
        res.status(502).json({ error: `Backend returned HTML (${proxyRes.statusCode}) — may be sleeping. URL: ${targetUrl}` });
      } else {
        res.status(proxyRes.statusCode || 500).set('Content-Type', 'application/json').send(data);
      }
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.status(504).json({ error: 'Python backend timed out after 55 seconds.' });
  });

  proxyReq.on('error', (err: Error) => {
    console.error(`[proxy] error:`, err.message);
    res.status(502).json({ error: `Upstream error: ${err.message}` });
  });

  proxyReq.write(body);
  proxyReq.end();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Test endpoint to verify routes are working
  app.get("/api/test", (req, res) => {
    res.json({ message: "API routes are working!", timestamp: new Date().toISOString() });
  });

  // Proxy PDF/Excel parse to Render backend (server-side avoids CORS)
  app.post("/api/parse", (req, res) => proxyToRender(req, res, "/api/parse"));

  // League chatbot AI — handled directly in Express via OpenAI Node SDK
  // (avoids dependency on the Python backend process which can go offline)
  app.post("/api/chat/league", async (req: Request, res: Response) => {
    try {
      const { question, league_id, league_data } = req.body;
      if (!question) return res.status(400).json({ error: "question is required" });

      let systemPrompt: string;
      let userMessage: string;

      if (league_data) {
        systemPrompt = [
          "You are an expert basketball league analyst for a professional league app, similar to the NBA app's Ask NBA feature.",
          "",
          "IMPORTANT: The data you receive may include a FOCUS: directive and labelled sections (TEAM OVERVIEW, ROSTER, etc.).",
          "Always follow the FOCUS directive. If it says to describe a team's overall performance, lead with TEAM-LEVEL stats —",
          "do NOT make individual players the main subject. The ROSTER section is supplementary context only.",
          "",
          "RESPONSE FORMAT — follow this structure exactly:",
          "1. Open with ONE context sentence naming the subject (team or player) and what you are summarising.",
          "2. Use a bullet list for the key stats — bold the team/player name at the top, then stat lines beneath.",
          "   For team queries: summarise record, PPG, RPG, APG, FG% as bullet points. Mention top players briefly at the end.",
          "   For player queries: summarise PPG, RPG, APG, shooting splits as bullet points.",
          "3. Close with 1-2 sentences of insight — e.g. what makes this team/player stand out, a trend, a strength.",
          "4. Keep total response under 220 words. Be punchy and specific — no fluff.",
          "",
          "RULES:",
          "- Only use stats from the data provided. Never invent numbers.",
          "- Bold all player and team names.",
          "- Use plain English, not overly formal language.",
          "- Never start with 'As of this season' — vary your opening.",
          "",
          "At the very end of your response (after the insight), append exactly this line:",
          "SUGGESTIONS: <question 1> | <question 2> | <question 3>",
          "These should be 3 natural follow-up questions a fan would ask, specific to the players/teams you mentioned.",
          "",
          `CURRENT LEAGUE DATA:\n${league_data}`,
        ].join("\n");
        userMessage = question;
      } else {
        systemPrompt =
          "You are an expert basketball league analyst. Help with performance analysis, player statistics, team strategies, and league insights. " +
          "Be concise and data-driven. Bold all player and team names. " +
          "At the very end append: SUGGESTIONS: <q1> | <q2> | <q3>";
        userMessage = `Question about league ${league_id}: ${question}`;
      }

      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 700,
        temperature: 0.2,
      });

      const rawAnswer = completion.choices[0].message.content ?? "";

      let answer = rawAnswer;
      let suggestions: string[] = [];
      if (rawAnswer.includes("SUGGESTIONS:")) {
        const parts = rawAnswer.split("SUGGESTIONS:");
        answer = parts[0].trim();
        suggestions = parts[1].split("|").map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
      }
      if (!suggestions.length) {
        suggestions = ["Who are the top scorers?", "Show me recent game results", "Who is the most efficient player?"];
      }

      res.json({ response: answer, suggestions, status: "success" });
    } catch (err: any) {
      console.error("League chat error:", err.message);
      res.status(500).json({ error: err.message, status: "error" });
    }
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
      const userId = await authenticateSupabaseUser(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { leagueId, teamName, logoUrl } = req.body;

      if (!leagueId || !teamName || !logoUrl) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only league owners can save team logos" });
      }

      const objectStorageService = new ObjectStorageService();
      const logoPath = objectStorageService.normalizeTeamLogoPath(logoUrl);

      const { data: logoData, error: logoError } = await supabaseAdmin
        .from("team_logos")
        .upsert({
          league_id: leagueId,
          team_name: teamName,
          logo_url: logoPath,
          uploaded_by: "system",
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'league_id,team_name',
        })
        .select()
        .single();

      if (logoError) {
        const isTableMissing = logoError.code === '42P01';
        if (!isTableMissing) {
          console.error("Database error:", logoError);
          return res.status(500).json({ error: "Failed to save team logo" });
        }
        console.warn("team_logos table does not exist, skipping DB persist");
      }

      if (logoData) {
        const { error: teamError } = await supabaseAdmin
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
        }
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
      const userId = await authenticateSupabaseUser(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const file = req.file;
      const { fileName, leagueId, teamName } = req.body;
      
      if (!fileName || !file || !leagueId || !teamName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only league owners can upload team logos" });
      }

      console.log("Uploading:", fileName, "Size:", file.size);

      // Use service role client to upload (bypasses RLS)
      const { data, error } = await supabaseAdmin.storage
        .from('team-logos')
        .upload(fileName, file.buffer, {
          upsert: true,
          contentType: file.mimetype
        });

      if (error) {
        console.error("Storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('team-logos')
        .getPublicUrl(fileName);

      console.log("Upload successful, public URL:", publicUrl);

      // Update teams.logo_url for the matching team row(s)
      const { error: dbError } = await supabaseAdmin
        .from("teams")
        .update({ logo_url: publicUrl })
        .eq("league_id", leagueId)
        .eq("name", teamName);

      if (dbError) {
        console.error("Error updating teams.logo_url:", dbError);
      }

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

  // Delete team logo endpoint - uses service role to bypass RLS
  app.delete("/api/team-logos/delete", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { leagueId, teamName } = req.body;
      
      if (!leagueId || !teamName) {
        return res.status(400).json({ error: "Missing required fields: leagueId, teamName" });
      }

      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only league owners can delete team logos" });
      }

      console.log("Deleting logo for team:", teamName, "in league:", leagueId);

      const baseFileName = `${leagueId}_${teamName.replace(/\s+/g, '_')}`;
      const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
      let deletedFiles: string[] = [];
      let errors: string[] = [];

      // Try to delete files with all extensions
      for (const ext of extensions) {
        const fileName = `${baseFileName}.${ext}`;
        const { error } = await supabaseAdmin.storage
          .from('team-logos')
          .remove([fileName]);
        
        if (error) {
          console.log(`Could not delete ${fileName}:`, error.message);
          errors.push(`${fileName}: ${error.message}`);
        } else {
          console.log(`Deleted ${fileName}`);
          deletedFiles.push(fileName);
        }
      }

      // Clear logo_url on the teams row
      const { error: dbError } = await supabaseAdmin
        .from("teams")
        .update({ logo_url: null })
        .eq("league_id", leagueId)
        .eq("name", teamName);

      if (dbError) {
        console.error("Error clearing teams.logo_url:", dbError);
      }

      res.json({
        success: true,
        deletedFiles,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Delete logo error:", error);
      res.status(500).json({ error: "Failed to delete logo" });
    }
  });

  // API endpoint for TeamLogo component to get team logos for a league
  app.get("/api/leagues/:leagueId/team-logos", async (req, res) => {
    try {
      const { leagueId } = req.params;
      
      // Get all teams for this league from player_stats
      const { data: playerStats, error: teamsError } = await supabaseAdmin
        .from('player_stats')
        .select('team_name')
        .eq('league_id', leagueId);

      if (teamsError) {
        console.error("Error fetching teams:", teamsError);
        return res.status(500).json({ error: "Failed to fetch teams" });
      }

      // Get unique team names
      const teams = Array.from(new Set(
        playerStats?.map((stat: any) => stat.team_name).filter(Boolean) || []
      ));

      // Check for existing logo files for each team using direct storage access
      const teamLogos: Record<string, string> = {};
      
      for (const teamName of teams) {
        try {
          const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
          let found = false;
          
          for (const ext of extensions) {
            const fileName = `${leagueId}_${teamName.replace(/\s+/g, '_')}.${ext}`;
            
            const { data } = supabaseAdmin.storage
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

  app.post("/api/league-logos/upload", upload.single('file'), async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const file = req.file;
      const { leagueId } = req.body;

      if (!file || !leagueId) {
        return res.status(400).json({ error: "Missing required fields: file and leagueId" });
      }

      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only league owners can upload logos" });
      }

      const fileExt = file.originalname.split('.').pop();
      const fileName = `${leagueId}_${Date.now()}.${fileExt}`;

      const { data, error } = await supabaseAdmin.storage
        .from('league-banners')
        .upload(`logos/${fileName}`, file.buffer, {
          upsert: true,
          contentType: file.mimetype,
        });

      if (error) {
        console.error("Logo storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('league-banners')
        .getPublicUrl(`logos/${fileName}`);

      const { error: updateError } = await supabaseAdmin
        .from('competitions')
        .update({ logo_url: publicUrl })
        .eq('league_id', leagueId);

      if (updateError) {
        console.error("Error updating league logo_url:", updateError);
        return res.status(500).json({ error: updateError.message });
      }

      res.json({ success: true, publicUrl });
    } catch (error) {
      console.error("Logo upload error:", error);
      res.status(500).json({ error: "Logo upload failed" });
    }
  });

  app.post("/api/league-banners/upload", upload.single('file'), async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const file = req.file;
      const { leagueId, type } = req.body;
      const isLogo = type === 'logo';

      if (!file || !leagueId) {
        return res.status(400).json({ error: "Missing required fields: file and leagueId" });
      }

      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only league owners can upload assets" });
      }

      const fileExt = file.originalname.split('.').pop();
      const fileName = isLogo
        ? `logos/${leagueId}_${Date.now()}.${fileExt}`
        : `${leagueId}_${Date.now()}.${fileExt}`;

      const { error } = await supabaseAdmin.storage
        .from('league-banners')
        .upload(fileName, file.buffer, {
          upsert: true,
          contentType: file.mimetype,
        });

      if (error) {
        console.error("Asset storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('league-banners')
        .getPublicUrl(fileName);

      const updateField = isLogo ? { logo_url: publicUrl } : { banner_url: publicUrl };

      const { error: updateError } = await supabaseAdmin
        .from('competitions')
        .update(updateField)
        .eq('league_id', leagueId);

      if (updateError) {
        console.error("Error updating league asset:", updateError);
        return res.status(500).json({ error: updateError.message });
      }

      res.json({ success: true, publicUrl });
    } catch (error) {
      console.error("Asset upload error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  app.get("/api/league/:leagueId/competitions", async (req: Request, res: Response) => {
    try {
      const { leagueId } = req.params;
      if (!leagueId) return res.status(400).json({ error: "leagueId is required" });

      const { data, error } = await supabaseAdmin
        .from("competitions")
        .select("name, slug, season, gender")
        .eq("competition_id", leagueId)
        .order("season", { ascending: false });

      if (error) {
        console.error("league competitions error:", error);
        return res.status(500).json({ error: "Failed to fetch competitions" });
      }

      res.json(data || []);
    } catch (err: any) {
      console.error("Error fetching league competitions:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/league-branding/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      if (!slug) return res.status(400).json({ error: "slug is required" });

      // No is_public filter — parent leagues like REBA SL may have
      // is_public=false yet still have a public-facing page. Branding data
      // (name, colors, logo) is low-sensitivity so we expose it regardless.
      const { data, error } = await supabaseAdmin
        .from("competitions")
        .select("league_id, name, slug, brand_primary_colour, banner_url, logo_url")
        .eq("slug", slug)
        .single();

      if (error || !data) {
        console.error("league-branding error:", JSON.stringify(error), "slug:", slug);
        return res.status(404).json({ error: "League not found" });
      }

      const responseData = {
        ...data,
        primary_color: data.brand_primary_colour,
      };

      res.json(responseData);
    } catch (err: any) {
      console.error("Error fetching public league branding:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/league-branding-by-id/:leagueId", async (req: Request, res: Response) => {
    try {
      const { leagueId } = req.params;
      if (!leagueId) return res.status(400).json({ error: "leagueId is required" });

      // No is_public filter — same reasoning as the slug variant above.
      const { data, error } = await supabaseAdmin
        .from("competitions")
        .select("league_id, name, slug, brand_primary_colour, banner_url, logo_url")
        .eq("league_id", leagueId)
        .single();

      if (error || !data) {
        console.error("league-branding-by-id error:", JSON.stringify(error), "leagueId:", leagueId);
        return res.status(404).json({ error: "League not found" });
      }

      const responseData = {
        ...data,
        primary_color: data.brand_primary_colour,
      };

      res.json(responseData);
    } catch (err: any) {
      console.error("Error fetching public league branding by id:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Returns child league rows for a given parent_league_id, bypassing
  // RLS via the service-role client. Public parent league pages need
  // this to roll up data from children that have been marked
  // is_public=false (the anon-key client filters those rows out under
  // the existing RLS policy on `leagues`). The endpoint itself is
  // public-read because it only exposes basic competition metadata
  // (id/name/slug/logo/age_group/stop) that's already implied by the
  // parent league page.
  app.get("/api/public/league-children/:parentId", async (req: Request, res: Response) => {
    try {
      const { parentId } = req.params;
      if (!parentId) return res.status(400).json({ error: "parentId is required" });

      const { data, error } = await supabaseAdmin
        .from("competitions")
        .select("league_id, name, slug, logo_url, age_group, stop")
        .eq("parent_league_id", parentId);

      if (error) {
        console.error("Error fetching league children:", error);
        return res.status(500).json({ error: "Failed to fetch league children" });
      }

      res.json({ children: data || [] });
    } catch (err: any) {
      console.error("Error fetching league children:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Service-role-backed read endpoint that lets parent league pages roll up
  // data from private (is_public=false) child leagues. The anon-key Supabase
  // client gets filtered by RLS on `teams`, `team_stats`, and `players`, so
  // a public REBA SL parent page would otherwise show empty standings /
  // player stats / team stats whenever its sub-competitions have been hidden
  // from search via is_public=false.
  //
  // Access control:
  //   - Restricted to a known allow-list of tables and a fixed per-table
  //     column projection (no caller-controlled `select`).
  //   - Each requested league_id is validated server-side to be either
  //     itself public, or a child of a public parent league. League IDs
  //     that don't satisfy that scope are dropped silently before the
  //     data fetch — preventing arbitrary-id enumeration of fully
  //     private leagues that have no public parent.
  // Explicit per-table column projections (no caller-controlled select).
  // The team_stats list mirrors the columns the league page actually
  // reads in fetchTeamStats — keep this in sync with
  // client/src/pages/pages/league/[slug].tsx if new aggregations are
  // added there.
  const TEAM_STATS_COLS = [
    "name",
    "league_id",
    "tot_sminutes",
    "tot_spoints",
    "tot_sfieldgoalsmade",
    "tot_sfieldgoalsattempted",
    "tot_sthreepointersmade",
    "tot_sthreepointersattempted",
    "tot_stwopointersmade",
    "tot_stwopointersattempted",
    "tot_sfreethrowsmade",
    "tot_sfreethrowsattempted",
    "tot_sreboundstotal",
    "tot_sreboundsoffensive",
    "tot_sreboundsdefensive",
    "tot_sassists",
    "tot_ssteals",
    "tot_sblocks",
    "tot_sturnovers",
    "tot_sfoulspersonal",
    "tot_splusminuspoints",
    "tot_spointsinthepaint",
    "tot_spointsfastbreak",
    "tot_spointssecondchance",
    "tot_spointsfromturnovers",
    "tot_timesscoreslevel",
    "tot_leadchanges",
    "tot_timeleading",
    "tot_biggestscoringrun",
    "off_rating",
    "def_rating",
    "net_rating",
    "pace",
    "ast_percent",
    "ast_to_ratio",
    "oreb_percent",
    "dreb_percent",
    "reb_percent",
    "tov_percent",
    "efg_percent",
    "ts_percent",
    "ft_rate",
    "three_point_rate",
    "pie",
    "opp_efg_percent",
    "opp_ft_rate",
    "opp_tov_percent",
    "opp_oreb_percent",
    "opp_3pm",
    "opp_fgm",
    "opp_fga",
    "opp_points",
    "opp_turnovers",
    "opp_possessions",
    "fga_percent_2pt",
    "fga_percent_3pt",
    "fga_percent_midrange",
    "pts_percent_2pt",
    "pts_percent_3pt",
    "pts_percent_midrange",
    "pts_percent_pitp",
    "pts_percent_fastbreak",
    "pts_percent_second_chance",
    "pts_percent_off_turnovers",
    "pts_percent_ft",
  ].join(", ");

  const ALLOWED_LEAGUE_DATA_COLUMNS: Record<string, string> = {
    teams: "team_id, name, league_id",
    team_stats: TEAM_STATS_COLS,
    players: "id, full_name, slug, league_id",
  };

  async function filterLeagueIdsForPublicScope(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("competitions")
      .select("league_id, is_public, parent_league_id")
      .in("league_id", ids);
    if (error || !data) {
      console.error("filterLeagueIdsForPublicScope: leagues lookup failed:", error?.message);
      return [];
    }
    const directlyAllowed = new Set<string>();
    const parentIdsToCheck = new Set<string>();
    const idToParent = new Map<string, string | null>();
    for (const row of data as Array<{ league_id: string; is_public: boolean | null; parent_league_id: string | null }>) {
      if (row.is_public) {
        directlyAllowed.add(row.league_id);
      } else if (row.parent_league_id) {
        parentIdsToCheck.add(row.parent_league_id);
        idToParent.set(row.league_id, row.parent_league_id);
      }
    }
    const publicParents = new Set<string>();
    if (parentIdsToCheck.size > 0) {
      const { data: parents, error: parentErr } = await supabaseAdmin
        .from("competitions")
        .select("league_id, is_public")
        .in("league_id", Array.from(parentIdsToCheck));
      if (parentErr) {
        console.error("filterLeagueIdsForPublicScope: parent lookup failed:", parentErr.message);
      } else if (parents) {
        for (const p of parents as Array<{ league_id: string; is_public: boolean | null }>) {
          if (p.is_public) publicParents.add(p.league_id);
        }
      }
    }
    const allowed = new Set<string>(directlyAllowed);
    for (const [childId, parentId] of idToParent.entries()) {
      if (parentId && publicParents.has(parentId)) allowed.add(childId);
    }
    return ids.filter((id) => allowed.has(id));
  }

  app.post("/api/public/team-logos", async (req: Request, res: Response) => {
    try {
      const { leagueIds } = req.body || {};
      if (!Array.isArray(leagueIds) || leagueIds.length === 0) {
        return res.json({ rows: [] });
      }
      const ids = leagueIds.filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
      if (ids.length === 0) return res.json({ rows: [] });

      const { data, error } = await supabaseAdmin
        .from("team_logos")
        .select("team_name, logo_url, league_id")
        .in("league_id", ids);

      if (error) {
        return res.json({ rows: [] });
      }
      return res.json({ rows: data || [] });
    } catch {
      return res.json({ rows: [] });
    }
  });

  app.post("/api/public/league-data", async (req: Request, res: Response) => {
    try {
      const { table, leagueIds, parentLeagueId } = req.body || {};
      if (typeof table !== "string" || !(table in ALLOWED_LEAGUE_DATA_COLUMNS)) {
        return res.status(400).json({ error: "Invalid or unsupported table" });
      }
      if (!Array.isArray(leagueIds) || leagueIds.length === 0) {
        return res.status(400).json({ error: "leagueIds must be a non-empty array" });
      }
      const ids = leagueIds.filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
      if (ids.length === 0) {
        return res.status(400).json({ error: "leagueIds must contain at least one valid id" });
      }

      let allowedIds: string[];
      if (parentLeagueId && typeof parentLeagueId === "string") {
        // Caller supplies a parent league context — validate each id is a genuine
        // child of that parent OR is the parent itself. This bypasses the
        // is_public gate for parent leagues that have is_public=false (e.g. REBA SL).
        const { data: childRows } = await supabaseAdmin
          .from("competitions")
          .select("league_id")
          .in("league_id", ids)
          .eq("parent_league_id", parentLeagueId);
        const validatedIds = new Set((childRows || []).map((r: any) => r.league_id));
        // Allow the parent itself in case its own league_id is in the list.
        const { data: parentRow } = await supabaseAdmin
          .from("competitions")
          .select("league_id")
          .eq("league_id", parentLeagueId)
          .single();
        if (parentRow) validatedIds.add(parentLeagueId);
        allowedIds = ids.filter((id) => validatedIds.has(id));
      } else {
        allowedIds = await filterLeagueIdsForPublicScope(ids);
      }

      if (allowedIds.length === 0) {
        return res.json({ rows: [] });
      }

      const cols = ALLOWED_LEAGUE_DATA_COLUMNS[table];
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(cols)
        .in("league_id", allowedIds);

      if (error) {
        console.error(`Error fetching league-data for ${table}:`, error);
        return res.status(500).json({ error: "Failed to fetch league data" });
      }

      res.json({ rows: data || [] });
    } catch (err: any) {
      console.error("Error in /api/public/league-data:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Paginated player_stats fetch via service role — bypasses RLS so that
  // private child leagues (e.g. REBA SL age groups) are included.
  // Body: { leagueIds: string[], page: number, pageSize: number, parentLeagueId?: string }
  // If parentLeagueId is supplied we validate each id has that parent in the DB,
  // which allows parent leagues that are themselves is_public=false (REBA SL).
  // Response: { rows: any[] }
  app.post("/api/public/player-stats", async (req: Request, res: Response) => {
    try {
      const { leagueIds, page = 0, pageSize = 500, parentLeagueId } = req.body as {
        leagueIds?: string[];
        page?: number;
        pageSize?: number;
        parentLeagueId?: string;
      };
      if (!Array.isArray(leagueIds) || leagueIds.length === 0) {
        return res.status(400).json({ error: "leagueIds must be a non-empty array" });
      }
      const safePage = Math.max(0, Math.floor(Number(page) || 0));
      const safePageSize = Math.min(1000, Math.max(1, Math.floor(Number(pageSize) || 500)));

      let allowedIds: string[];
      if (parentLeagueId && typeof parentLeagueId === "string") {
        // Caller says all ids are children of parentLeagueId — validate in DB.
        // This handles parent leagues that have is_public=false (e.g. REBA SL):
        // the children are allowed as long as they genuinely belong to this parent.
        const { data: childRows } = await supabaseAdmin
          .from("competitions")
          .select("league_id")
          .in("league_id", leagueIds)
          .eq("parent_league_id", parentLeagueId);
        const validatedChildIds = new Set((childRows || []).map((r: any) => r.league_id));
        // Also allow the parent itself if it's in the list.
        const { data: parentRow } = await supabaseAdmin
          .from("competitions")
          .select("league_id")
          .eq("league_id", parentLeagueId)
          .single();
        if (parentRow) validatedChildIds.add(parentLeagueId);
        allowedIds = leagueIds.filter((id) => validatedChildIds.has(id));
      } else {
        allowedIds = await filterLeagueIdsForPublicScope(leagueIds);
      }

      if (allowedIds.length === 0) {
        return res.json({ rows: [] });
      }

      const from = safePage * safePageSize;
      const to = from + safePageSize - 1;

      const { data, error } = await supabaseAdmin
        .from("player_stats")
        .select("*")
        .in("league_id", allowedIds)
        .order("player_id", { ascending: true, nullsFirst: false })
        .range(from, to);

      if (error) {
        console.error("Error in /api/public/player-stats:", error.message);
        return res.status(500).json({ error: "Failed to fetch player stats" });
      }

      res.json({ rows: data || [] });
    } catch (err: any) {
      console.error("Error in /api/public/player-stats:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Batch league info lookup using service role — bypasses RLS so private
  // child leagues (e.g. REBA SL age groups) resolve names/parents correctly.
  // Body: { ids: string[] }
  // Response: { [leagueId]: { name, parent_league_id, age_group, stop } }
  app.post("/api/public/league-info", async (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids?: string[] };
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({});
      }
      const unique = Array.from(new Set(ids)).slice(0, 100);
      const { data, error } = await supabaseAdmin
        .from("competitions")
        .select("league_id, name, parent_league_id, age_group, stop")
        .in("league_id", unique);
      if (error) {
        console.error("Error in /api/public/league-info:", error.message);
        return res.status(500).json({ error: "Internal server error" });
      }
      const result: Record<string, { name: string; parent_league_id: string | null; age_group: string | null; stop: number | null }> = {};
      for (const row of data || []) {
        result[row.league_id] = {
          name: row.name,
          parent_league_id: row.parent_league_id || null,
          age_group: row.age_group || null,
          stop: row.stop ?? null,
        };
      }
      res.json(result);
    } catch (err: any) {
      console.error("Error in /api/public/league-info:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/league-logo/:leagueId", async (req: Request, res: Response) => {
    try {
      const { leagueId } = req.params;
      if (!leagueId) return res.status(400).json({ error: "leagueId is required" });

      // No is_public filter — private child leagues must still resolve branding
      // via their public parent so that player profiles display the right colour.
      const { data, error } = await supabaseAdmin
        .from("competitions")
        .select("logo_url, parent_league_id, brand_primary_colour, is_public")
        .eq("league_id", leagueId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "League not found" });
      }

      // If this league has its own logo, return it (plus its colour).
      if (data.logo_url) {
        return res.json({
          logo_url: data.logo_url,
          brand_primary_colour: data.brand_primary_colour || null,
        });
      }

      // No logo — try the parent league (private children inherit parent branding).
      if (data.parent_league_id) {
        const { data: parentData } = await supabaseAdmin
          .from("competitions")
          .select("logo_url, brand_primary_colour")
          .eq("league_id", data.parent_league_id)
          .single();

        return res.json({
          logo_url: parentData?.logo_url || null,
          brand_primary_colour:
            data.brand_primary_colour || parentData?.brand_primary_colour || null,
        });
      }

      res.json({ logo_url: null, brand_primary_colour: data.brand_primary_colour || null });
    } catch (err: any) {
      console.error("Error fetching public league logo:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ---- Player on/off impact (disk-cached + retried) ----
  // The Supabase `player_on_off` view is expensive to compute on a cold
  // plan cache and frequently exceeds the 30s statement timeout when the
  // browser hits it directly. This endpoint proxies the query through the
  // server, caches successful responses both in memory AND on disk (so
  // results survive workflow restarts and HMR), and retries on transient
  // timeout errors (Postgres SQLSTATE 57014). When all retries fail we
  // serve any previously-saved snapshot rather than 503-ing — the on/off
  // numbers don't change minute-to-minute, so an hours-old cache is still
  // far more useful than an empty card.
  type OnOffRow = Record<string, any>;
  type OnOffEntry = { at: number; rows: OnOffRow[] };
  const PLAYER_ON_OFF_TTL_MS = 60 * 60 * 1000;
  const PLAYER_ON_OFF_DISK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const byIdCache = new Map<string, OnOffEntry>();
  const byNamesCache = new Map<string, OnOffEntry>();
  const ON_OFF_CACHE_DIR = path.join(process.cwd(), '.cache', 'player_on_off');
  try { fs.mkdirSync(ON_OFF_CACHE_DIR, { recursive: true }); } catch {}

  function diskPathFor(playerId: string) {
    return path.join(ON_OFF_CACHE_DIR, `${playerId}.json`);
  }
  function readDiskCache(playerId: string): OnOffEntry | null {
    try {
      const fp = diskPathFor(playerId);
      if (!fs.existsSync(fp)) return null;
      const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
      if (!parsed || !Array.isArray(parsed.rows)) return null;
      return { at: Number(parsed.at) || 0, rows: parsed.rows as OnOffRow[] };
    } catch (err) {
      console.warn('player_on_off disk read failed for', playerId, (err as Error)?.message);
      return null;
    }
  }
  function writeDiskCache(playerId: string, entry: OnOffEntry) {
    try {
      fs.writeFileSync(diskPathFor(playerId), JSON.stringify(entry));
    } catch (err) {
      console.warn('player_on_off disk write failed for', playerId, (err as Error)?.message);
    }
  }

  async function fetchByIdOnce(playerId: string): Promise<OnOffRow[]> {
    const { data, error } = await supabaseAdmin
      .from('player_on_off')
      .select('*')
      .eq('player_id', playerId);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return (data || []) as OnOffRow[];
  }

  async function fetchByNamesOnce(names: string[]): Promise<OnOffRow[]> {
    if (names.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from('player_on_off')
      .select('*')
      .in('player_name', names);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return (data || []) as OnOffRow[];
  }

  async function withTimeoutRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        if (err?.code !== '57014') break;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  function dedupeRows(rows: OnOffRow[]): OnOffRow[] {
    const seen = new Set<string>();
    const out: OnOffRow[] = [];
    for (const r of rows) {
      const key = `${r.player_id || ''}::${r.game_key || ''}::${r.player_name || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }

  function evictOldest(map: Map<string, OnOffEntry>, max: number) {
    if (map.size <= max) return;
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }

  app.get('/api/player-on-off/:playerId', async (req: Request, res: Response) => {
    const playerId = req.params.playerId;
    if (!/^[0-9a-f-]{36}$/i.test(playerId)) {
      return res.status(400).json({ error: 'Invalid playerId' });
    }
    const now = Date.now();

    const namesParam = req.query.names;
    let names: string[] = [];
    if (typeof namesParam === 'string' && namesParam.length > 0) {
      names = namesParam
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 100);
      names = Array.from(new Set(names)).slice(0, 10);
    }
    const namesKey = names.length
      ? names.map((n) => n.toLowerCase()).sort().join('|')
      : '';

    let idCached = byIdCache.get(playerId);
    if (!idCached) {
      const fromDisk = readDiskCache(playerId);
      if (fromDisk) {
        byIdCache.set(playerId, fromDisk);
        idCached = fromDisk;
      }
    }
    const namesCached = namesKey ? byNamesCache.get(namesKey) : undefined;

    const idFresh = idCached && now - idCached.at < PLAYER_ON_OFF_TTL_MS;
    const namesFresh = !namesKey || (namesCached && now - namesCached.at < PLAYER_ON_OFF_TTL_MS);

    if (idFresh && namesFresh) {
      const merged = dedupeRows([
        ...(idCached?.rows || []),
        ...(namesCached?.rows || []),
      ]);
      return res.json({ rows: merged, cached: true });
    }

    type BranchResult =
      | { ok: true; rows: OnOffRow[]; fromCache: boolean }
      | { ok: false; err: any };

    const idPromise: Promise<BranchResult> = idFresh
      ? Promise.resolve({ ok: true, rows: idCached!.rows, fromCache: true })
      : withTimeoutRetry(() => fetchByIdOnce(playerId)).then(
          (rows): BranchResult => ({ ok: true, rows, fromCache: false }),
          (err): BranchResult => ({ ok: false, err })
        );

    const namesPromise: Promise<BranchResult> = namesFresh
      ? Promise.resolve({ ok: true, rows: namesCached?.rows || [], fromCache: true })
      : withTimeoutRetry(() => fetchByNamesOnce(names)).then(
          (rows): BranchResult => ({ ok: true, rows, fromCache: false }),
          (err): BranchResult => ({ ok: false, err })
        );

    const [idResult, namesResult] = await Promise.all([idPromise, namesPromise]);

    if (idResult.ok && !idResult.fromCache) {
      const entry = { at: now, rows: idResult.rows };
      byIdCache.set(playerId, entry);
      writeDiskCache(playerId, entry);
      evictOldest(byIdCache, 500);
    }
    if (namesResult.ok && !namesResult.fromCache && namesKey) {
      byNamesCache.set(namesKey, { at: now, rows: namesResult.rows });
      evictOldest(byNamesCache, 1000);
    }

    // Track cache *existence* (within disk TTL) separately from row
    // count: a successful cached snapshot of "no rows" is a valid
    // fallback and means the branch is NOT lost on a later live
    // failure. Without this distinction we'd misreport unavailable
    // for players who genuinely have no on/off rows.
    const idCacheUsable = !!(idCached && now - idCached.at < PLAYER_ON_OFF_DISK_TTL_MS);
    const namesCacheUsable = !!(namesCached && now - namesCached.at < PLAYER_ON_OFF_DISK_TTL_MS);

    const idRows = idResult.ok
      ? idResult.rows
      : (idCacheUsable ? idCached!.rows : []);
    const nameRows = namesResult.ok
      ? namesResult.rows
      : (namesCacheUsable ? namesCached!.rows : []);
    const merged = dedupeRows([...idRows, ...nameRows]);

    // A branch is "lost" when its live fetch failed AND no within-TTL
    // cache snapshot exists at all. An empty-but-fresh cache is a
    // valid snapshot and preserves the genuine "no data" path. The
    // names branch only counts when the caller actually supplied
    // names — without them, that branch cannot contribute or fail.
    const idLost = !idResult.ok && !idCacheUsable;
    const namesLost = namesKey !== '' && !namesResult.ok && !namesCacheUsable;

    if (merged.length === 0 && (idLost || namesLost)) {
      const errCode =
        (!idResult.ok ? idResult.err?.code : undefined) ??
        (!namesResult.ok ? namesResult.err?.code : undefined);
      console.error('player_on_off endpoint unavailable for', playerId, errCode);
      return res.json({ rows: [], unavailable: true, code: errCode });
    }

    const partial = !idResult.ok || (namesKey !== '' && !namesResult.ok);
    const stale =
      (!idResult.ok && idRows.length > 0) ||
      (namesKey !== '' && !namesResult.ok && nameRows.length > 0);
    res.json({
      rows: merged,
      cached: stale,
      ...(partial ? { partial: true } : {}),
      ...(stale ? { stale: true } : {}),
    });
  });

  // ---- Player Merge Routes ----

  // Helper: fetch all league IDs in scope (the league itself + its direct children)
  async function getScopedLeagueIds(leagueId: string): Promise<string[]> {
    const { data } = await supabaseAdmin
      .from('competitions')
      .select('league_id')
      .eq('parent_league_id', leagueId);
    const childIds = (data || []).map((r: any) => r.league_id);
    return [leagueId, ...childIds];
  }

  // List all players for a league + its children (for manual search)
  app.get("/api/leagues/:leagueId/players", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { leagueId } = req.params;
      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) return res.status(403).json({ error: "Only league owners can access this" });

      const allIds = await getScopedLeagueIds(leagueId);

      const { data, error } = await supabaseAdmin
        .from('players')
        .select('id, full_name, slug, league_id')
        .in('league_id', allIds)
        .order('full_name');

      if (error) return res.status(500).json({ error: error.message });
      res.json({ players: data || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Detect duplicate player pairs for a league + its children
  app.get("/api/leagues/:leagueId/duplicate-players", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { leagueId } = req.params;
      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) return res.status(403).json({ error: "Only league owners can access this" });

      const allIds = await getScopedLeagueIds(leagueId);

      // Fetch all players across the league and its children
      const PAGE = 1000;
      const players: any[] = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabaseAdmin
          .from('players')
          .select('id, full_name, league_id, slug')
          .in('league_id', allIds)
          .range(offset, offset + PAGE - 1);
        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) break;
        players.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }

      if (players.length === 0) return res.json({ pairs: [] });

      // Fetch stats counts
      const statsCounts = new Map<string, number>();
      const CHUNK = 200;
      for (let i = 0; i < players.length; i += CHUNK) {
        const chunk = players.slice(i, i + CHUNK).map((p: any) => p.id);
        const { data, error: statsError } = await supabaseAdmin
          .from('player_stats')
          .select('player_id')
          .in('player_id', chunk);
        if (statsError) {
          console.error('Error fetching stats counts for duplicate detection:', statsError.message);
        }
        for (const row of data || []) {
          statsCounts.set(row.player_id, (statsCounts.get(row.player_id) || 0) + 1);
        }
      }

      const pairs = detectDuplicates(players, statsCounts);
      res.json({ pairs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Merge a duplicate player into the canonical player
  app.post("/api/leagues/:leagueId/merge-players", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { leagueId } = req.params;
      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) return res.status(403).json({ error: "Only league owners can merge players" });

      const { canonicalId, duplicateId } = req.body;
      if (!canonicalId || !duplicateId) {
        return res.status(400).json({ error: "canonicalId and duplicateId are required" });
      }
      if (canonicalId === duplicateId) {
        return res.status(400).json({ error: "canonicalId and duplicateId must be different" });
      }

      // Fetch both player records
      const { data: playerCheck, error: checkError } = await supabaseAdmin
        .from('players')
        .select('id, league_id, full_name')
        .in('id', [canonicalId, duplicateId]);

      if (checkError) return res.status(500).json({ error: checkError.message });
      if (!playerCheck || playerCheck.length !== 2) {
        return res.status(404).json({ error: "One or both players not found" });
      }

      const canonical = playerCheck.find((p: any) => p.id === canonicalId);
      const duplicate = playerCheck.find((p: any) => p.id === duplicateId);

      if (!canonical || !duplicate) {
        return res.status(404).json({ error: "One or both players not found" });
      }

      // Both players must belong to the league or one of its children
      const allIds = await getScopedLeagueIds(leagueId);
      const allIdSet = new Set(allIds);
      if (!allIdSet.has(canonical.league_id) || !allIdSet.has(duplicate.league_id)) {
        return res.status(403).json({ error: "Players must belong to this league or one of its sub-leagues" });
      }

      // Re-point player_stats rows from duplicate → canonical
      const { error: updateError } = await supabaseAdmin
        .from('player_stats')
        .update({ player_id: canonicalId })
        .eq('player_id', duplicateId);

      if (updateError) return res.status(500).json({ error: `Failed to update stats: ${updateError.message}` });

      // Delete the duplicate player record
      const { error: deleteError } = await supabaseAdmin
        .from('players')
        .delete()
        .eq('id', duplicateId);

      if (deleteError) {
        // Attempt to roll back the stats repoint so we don't leave data in a partial state
        const { error: rollbackError } = await supabaseAdmin
          .from('player_stats')
          .update({ player_id: duplicateId })
          .eq('player_id', canonicalId);
        if (rollbackError) {
          console.error('Merge rollback failed — stats may be in partial state:', rollbackError.message);
        }
        return res.status(500).json({ error: `Merge failed and was rolled back: ${deleteError.message}` });
      }

      res.json({
        success: true,
        canonicalName: canonical.full_name || '',
        duplicateName: duplicate.full_name || '',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Player Identities API ────────────────────────────────────────────────
  // Links multiple players.id rows to a single canonical real-world person.
  // Tables required (run supabase/migrations/20260625_player_identities.sql):
  //   player_identities       (id, canonical_name, photo_path, photo_path_bg_removed, …)
  //   player_identity_members (id, identity_id, player_id UNIQUE, …)
  //
  // These endpoints are admin-only (authentication required).

  // GET /api/player-identities?name=<search>
  // Returns all identities, optionally filtered by canonical_name ilike.
  // Requires admin role.
  app.get('/api/player-identities', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const name = (req.query.name as string | undefined) || '';
      let q = supabaseAdmin
        .from('player_identities')
        .select('id, canonical_name, photo_path, photo_path_bg_removed, created_at')
        .order('canonical_name');
      if (name.trim()) q = q.ilike('canonical_name', `%${name.trim()}%`);
      const { data, error } = await q;
      if (error) {
        if ((error as any).code === '42P01') {
          return res.status(503).json({ error: 'player_identities table not yet created. Run the migration first.', migration: true });
        }
        return res.status(500).json({ error: error.message });
      }
      res.json({ identities: data || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/player-identities/:identityId/members
  // Returns all player_id rows linked to an identity. Requires admin role.
  app.get('/api/player-identities/:identityId/members', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const { identityId } = req.params;
      const { data, error } = await supabaseAdmin
        .from('player_identity_members')
        .select('id, player_id, created_at')
        .eq('identity_id', identityId)
        .order('created_at');
      if (error) return res.status(500).json({ error: error.message });

      const playerIds = (data || []).map((r: any) => r.player_id);
      if (playerIds.length === 0) return res.json({ members: [] });

      const { data: players, error: pErr } = await supabaseAdmin
        .from('players')
        .select('id, full_name, team_name, league_id, slug')
        .in('id', playerIds);
      if (pErr) return res.status(500).json({ error: pErr.message });

      const playerMap = new Map((players || []).map((p: any) => [p.id, p]));
      const members = (data || []).map((r: any) => ({
        memberId: r.id,
        playerId: r.player_id,
        player: playerMap.get(r.player_id) || null,
      }));
      res.json({ members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/player-identities/for-player/:playerId
  // Returns the identity group for a player (if any), including all sibling player_ids.
  app.get('/api/player-identities/for-player/:playerId', async (req: Request, res: Response) => {
    try {
      const { playerId } = req.params;
      const { data: membership, error: mErr } = await supabaseAdmin
        .from('player_identity_members')
        .select('identity_id')
        .eq('player_id', playerId)
        .maybeSingle();
      if (mErr) {
        if ((mErr as any).code === '42P01') return res.json({ identity: null });
        return res.status(500).json({ error: mErr.message });
      }
      if (!membership) return res.json({ identity: null });

      const identityId = membership.identity_id;
      const [idRes, membersRes] = await Promise.all([
        supabaseAdmin
          .from('player_identities')
          .select('id, canonical_name, photo_path, photo_path_bg_removed')
          .eq('id', identityId)
          .single(),
        supabaseAdmin
          .from('player_identity_members')
          .select('player_id')
          .eq('identity_id', identityId),
      ]);
      if (idRes.error) return res.status(500).json({ error: idRes.error.message });
      const playerIds = (membersRes.data || []).map((r: any) => r.player_id);
      res.json({ identity: { ...idRes.data, playerIds } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/player-identities
  // Creates a new identity group from an array of playerIds. Requires admin role.
  // Body: { canonicalName: string, playerIds: string[] }
  app.post('/api/player-identities', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const { canonicalName, playerIds } = req.body as { canonicalName?: string; playerIds?: string[] };
      if (!canonicalName || !playerIds || playerIds.length < 2) {
        return res.status(400).json({ error: 'canonicalName and at least two playerIds are required' });
      }

      // Check if any of these players are already in a different identity group
      const { data: existing } = await supabaseAdmin
        .from('player_identity_members')
        .select('player_id, identity_id')
        .in('player_id', playerIds);
      if (existing && existing.length > 0) {
        const alreadyLinked = (existing as any[]).map((r) => r.player_id);
        return res.status(409).json({
          error: 'Some players are already in an identity group. Unlink them first.',
          alreadyLinked,
        });
      }

      // Fetch best available photo from any of the player records
      const { data: playerRows } = await supabaseAdmin
        .from('players')
        .select('id, photo_path, photo_path_bg_removed')
        .in('id', playerIds);
      const withPhoto = (playerRows || []).find((p: any) => p.photo_path_bg_removed || p.photo_path);
      const canonicalPhoto = withPhoto?.photo_path || null;
      const canonicalPhotoBg = withPhoto?.photo_path_bg_removed || null;

      // Create identity record
      const { data: identity, error: idErr } = await supabaseAdmin
        .from('player_identities')
        .insert({ canonical_name: canonicalName, photo_path: canonicalPhoto, photo_path_bg_removed: canonicalPhotoBg })
        .select('id')
        .single();
      if (idErr) {
        if ((idErr as any).code === '42P01') {
          return res.status(503).json({ error: 'player_identities table not yet created. Run the migration first.', migration: true });
        }
        return res.status(500).json({ error: idErr.message });
      }

      // Insert members
      const memberRows = playerIds.map((pid: string) => ({ identity_id: identity.id, player_id: pid }));
      const { error: memErr } = await supabaseAdmin
        .from('player_identity_members')
        .insert(memberRows);
      if (memErr) {
        await supabaseAdmin.from('player_identities').delete().eq('id', identity.id);
        return res.status(500).json({ error: memErr.message });
      }

      // Propagate photo to all linked player records
      if (canonicalPhoto || canonicalPhotoBg) {
        const updatePayload: Record<string, string | null> = {};
        if (canonicalPhoto) updatePayload.photo_path = canonicalPhoto;
        if (canonicalPhotoBg) updatePayload.photo_path_bg_removed = canonicalPhotoBg;
        await supabaseAdmin.from('players').update(updatePayload).in('id', playerIds);
      }

      photoFallbackCache = null;
      res.json({ id: identity.id, canonicalName, playerIds });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/player-identities/:identityId/members
  // Adds a player to an existing identity group. Requires admin role.
  // Body: { playerId: string }
  app.post('/api/player-identities/:identityId/members', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const { identityId } = req.params;
      const { playerId } = req.body as { playerId?: string };
      if (!playerId) return res.status(400).json({ error: 'playerId is required' });

      // Verify identity exists
      const { data: identity, error: idErr } = await supabaseAdmin
        .from('player_identities')
        .select('id, photo_path, photo_path_bg_removed')
        .eq('id', identityId)
        .single();
      if (idErr || !identity) return res.status(404).json({ error: 'Identity not found' });

      // Check not already in another group
      const { data: existingMembership } = await supabaseAdmin
        .from('player_identity_members')
        .select('identity_id')
        .eq('player_id', playerId)
        .maybeSingle();
      if (existingMembership) {
        return res.status(409).json({ error: 'Player is already in an identity group. Unlink first.' });
      }

      const { error: memErr } = await supabaseAdmin
        .from('player_identity_members')
        .insert({ identity_id: identityId, player_id: playerId });
      if (memErr) return res.status(500).json({ error: memErr.message });

      // Propagate canonical photo to the newly added player
      if (identity.photo_path || identity.photo_path_bg_removed) {
        const updatePayload: Record<string, string | null> = {};
        if (identity.photo_path) updatePayload.photo_path = identity.photo_path;
        if (identity.photo_path_bg_removed) updatePayload.photo_path_bg_removed = identity.photo_path_bg_removed;
        await supabaseAdmin.from('players').update(updatePayload).eq('id', playerId);
      }

      photoFallbackCache = null;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/player-identities/:identityId/members/:playerId
  // Removes a player from an identity group (does not delete the player row).
  // Requires admin role. Returns { success, deleted } where deleted=true if the group was dissolved.
  app.delete('/api/player-identities/:identityId/members/:playerId', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const { identityId, playerId } = req.params;
      const { error } = await supabaseAdmin
        .from('player_identity_members')
        .delete()
        .eq('identity_id', identityId)
        .eq('player_id', playerId);
      if (error) return res.status(500).json({ error: error.message });

      // If group now has < 2 members, delete the identity entirely
      const { data: remaining } = await supabaseAdmin
        .from('player_identity_members')
        .select('player_id')
        .eq('identity_id', identityId);
      let deleted = false;
      if (!remaining || remaining.length < 2) {
        await supabaseAdmin.from('player_identities').delete().eq('id', identityId);
        deleted = true;
      }

      photoFallbackCache = null;
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/player-identities/:identityId
  // Deletes the entire identity group (cascade removes all members). Requires admin role.
  app.delete('/api/player-identities/:identityId', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const { identityId } = req.params;
      const { error } = await supabaseAdmin
        .from('player_identities')
        .delete()
        .eq('id', identityId);
      if (error) return res.status(500).json({ error: error.message });

      photoFallbackCache = null;
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/player-identities/:identityId/sync-photo
  // Propagates a photo uploaded to any member player to all other members + identity record.
  // Requires admin role. Body: { photoPath?: string, photoPathBgRemoved?: string }
  app.post('/api/player-identities/:identityId/sync-photo', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req, res);
      if (!userId) return;

      const { identityId } = req.params;
      const { photoPath, photoPathBgRemoved } = req.body as { photoPath?: string; photoPathBgRemoved?: string };
      if (!photoPath && !photoPathBgRemoved) {
        return res.status(400).json({ error: 'photoPath or photoPathBgRemoved is required' });
      }

      // Get all member player_ids
      const { data: members } = await supabaseAdmin
        .from('player_identity_members')
        .select('player_id')
        .eq('identity_id', identityId);
      const playerIds = (members || []).map((r: any) => r.player_id);

      const identityUpdate: Record<string, string> = {};
      const playerUpdate: Record<string, string> = {};
      if (photoPath) { identityUpdate.photo_path = photoPath; playerUpdate.photo_path = photoPath; }
      if (photoPathBgRemoved) { identityUpdate.photo_path_bg_removed = photoPathBgRemoved; playerUpdate.photo_path_bg_removed = photoPathBgRemoved; }

      await Promise.all([
        supabaseAdmin.from('player_identities').update(identityUpdate).eq('id', identityId),
        playerIds.length > 0
          ? supabaseAdmin.from('players').update(playerUpdate).in('id', playerIds)
          : Promise.resolve(),
      ]);

      photoFallbackCache = null;
      res.json({ success: true, syncedTo: playerIds.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- News Articles CRUD API ----
  // Routes through Express so slugs are always generated/validated server-side.

  function buildArticleSlug(title: string): string {
    return (title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100);
  }

  async function resolveUniqueSlug(base: string, excludeId?: string): Promise<string> {
    if (!base) base = "article";
    let slug = base;
    let suffix = 2;
    while (true) {
      let q = supabaseAdmin
        .from("news_articles")
        .select("id")
        .eq("slug", slug);
      if (excludeId) q = q.neq("id", excludeId);
      const { data } = await q;
      if (!data || data.length === 0) break;
      slug = `${base}-${suffix++}`;
    }
    return slug;
  }

  // Startup slug backfill — fire and forget; gracefully handles missing column
  (async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("news_articles")
        .select("id, title")
        .is("slug", null);
      if (error) {
        if ((error as any).code !== "42703") console.warn("Slug backfill: column may not exist yet —", error.message);
        return;
      }
      if (!data || data.length === 0) return;
      const { data: existing } = await supabaseAdmin
        .from("news_articles")
        .select("slug")
        .not("slug", "is", null);
      const taken = new Set<string>((existing || []).map((r: any) => r.slug).filter(Boolean));
      let count = 0;
      for (const a of data) {
        let base = buildArticleSlug(a.title);
        if (!base) base = a.id.slice(0, 8);
        let slug = base;
        let sfx = 2;
        while (taken.has(slug)) slug = `${base}-${sfx++}`;
        taken.add(slug);
        await supabaseAdmin.from("news_articles").update({ slug }).eq("id", a.id);
        count++;
      }
      if (count > 0) console.log(`[news] Backfilled slugs for ${count} article(s)`);
    } catch (err: any) {
      console.warn("[news] Slug backfill skipped:", err?.message);
    }
  })();

  // POST /api/news-articles — create article with server-enforced slug
  app.post("/api/news-articles", async (req: Request, res: Response) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { title, slug: requestedSlug, summary, body, league, source_url, image_url, is_published } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: "title is required" });

      const base = requestedSlug?.trim() || buildArticleSlug(title.trim());
      const slug = await resolveUniqueSlug(base);

      const { data, error } = await supabaseAdmin
        .from("news_articles")
        .insert({
          title: title.trim(),
          slug,
          summary: summary?.trim() || null,
          body: body?.trim() || null,
          league: league?.trim() || null,
          source_url: source_url?.trim() || null,
          image_url: image_url || null,
          is_published: !!is_published,
        })
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/news-articles/:id — update article with server-enforced slug
  app.patch("/api/news-articles/:id", async (req: Request, res: Response) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { id } = req.params;
      const { title, slug: requestedSlug, summary, body, league, source_url, image_url, is_published } = req.body;

      const base = requestedSlug?.trim() || (title ? buildArticleSlug(title.trim()) : undefined);
      const slug = base ? await resolveUniqueSlug(base, id) : undefined;

      const payload: Record<string, any> = {};
      if (title !== undefined) payload.title = title.trim();
      if (slug !== undefined) payload.slug = slug;
      if (summary !== undefined) payload.summary = summary?.trim() || null;
      if (body !== undefined) payload.body = body?.trim() || null;
      if (league !== undefined) payload.league = league?.trim() || null;
      if (source_url !== undefined) payload.source_url = source_url?.trim() || null;
      if (image_url !== undefined) payload.image_url = image_url || null;
      if (is_published !== undefined) payload.is_published = !!is_published;

      const { data, error } = await supabaseAdmin
        .from("news_articles")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- Dynamic sitemap ----
  // Served at /sitemap.xml — queries Supabase for live data so new articles,
  // leagues, teams and players are picked up on the next Google crawl without
  // any manual script run. Cached in memory for 1 hour to avoid hitting the
  // DB on every bot request.
  const SITEMAP_TTL_MS = 60 * 60 * 1000;
  const SITE_BASE = "https://www.swishassistant.com";
  let sitemapCache: { xml: string; at: number } | null = null;

  function xmlEscape(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function sitemapUrl(loc: string, lastmod: string, changefreq: string, priority: string) {
    return `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
  }

  async function buildSitemap(): Promise<string> {
    const today = new Date().toISOString().split("T")[0];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static pages
    xml += sitemapUrl(`${SITE_BASE}/`, today, "daily", "1.0");
    xml += sitemapUrl(`${SITE_BASE}/news`, today, "daily", "0.9");
    for (const p of [
      { path: "/coaches-hub", freq: "weekly", pri: "0.8" },
      { path: "/teams", freq: "weekly", pri: "0.7" },
      { path: "/players", freq: "weekly", pri: "0.7" },
      { path: "/privacy", freq: "monthly", pri: "0.3" },
      { path: "/terms", freq: "monthly", pri: "0.3" },
      { path: "/cookies", freq: "monthly", pri: "0.3" },
    ]) {
      xml += sitemapUrl(`${SITE_BASE}${p.path}`, today, p.freq, p.pri);
    }

    // Published news articles (slug-based URLs)
    try {
      const { data: articles } = await supabaseAdmin
        .from("news_articles")
        .select("id, slug, published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      for (const a of articles || []) {
        const articleSlug = a.slug || a.id;
        const lastmod = a.published_at
          ? new Date(a.published_at).toISOString().split("T")[0]
          : today;
        xml += sitemapUrl(`${SITE_BASE}/news/${xmlEscape(articleSlug)}`, lastmod, "weekly", "0.8");
      }
    } catch (err: any) {
      console.error("Sitemap: error fetching articles:", err.message);
    }

    // Public leagues
    try {
      const { data: leagues } = await supabaseAdmin
        .from("competitions")
        .select("slug, updated_at")
        .eq("is_public", true);
      for (const l of leagues || []) {
        const lastmod = l.updated_at
          ? new Date(l.updated_at).toISOString().split("T")[0]
          : today;
        xml += sitemapUrl(`${SITE_BASE}/competition/${xmlEscape(l.slug)}`, lastmod, "daily", "0.9");
        xml += sitemapUrl(`${SITE_BASE}/competition-leaders/${xmlEscape(l.slug)}`, lastmod, "daily", "0.8");
        xml += sitemapUrl(`${SITE_BASE}/competition/${xmlEscape(l.slug)}/teams`, lastmod, "weekly", "0.7");
      }
    } catch (err: any) {
      console.error("Sitemap: error fetching leagues:", err.message);
    }

    // Team detail pages
    try {
      const { data: teams } = await supabaseAdmin
        .from("teams")
        .select("name");
      const seenTeams = new Set<string>();
      for (const t of teams || []) {
        if (!t.name) continue;
        const encoded = encodeURIComponent(t.name.toLowerCase().replace(/\s+/g, "-"));
        if (seenTeams.has(encoded)) continue;
        seenTeams.add(encoded);
        xml += sitemapUrl(`${SITE_BASE}/team/${encoded}`, today, "weekly", "0.6");
      }
    } catch (err: any) {
      console.error("Sitemap: error fetching teams:", err.message);
    }

    // Players with slugs (batched)
    try {
      const BATCH = 1000;
      let offset = 0;
      while (true) {
        const { data: players } = await supabaseAdmin
          .from("players")
          .select("slug")
          .not("slug", "is", null)
          .range(offset, offset + BATCH - 1);
        if (!players || players.length === 0) break;
        for (const p of players) {
          if (p.slug) {
            xml += sitemapUrl(`${SITE_BASE}/player/${xmlEscape(p.slug)}`, today, "weekly", "0.5");
          }
        }
        if (players.length < BATCH) break;
        offset += BATCH;
      }
    } catch (err: any) {
      console.error("Sitemap: error fetching players:", err.message);
    }

    xml += "</urlset>";
    return xml;
  }

  // ── Trending Performances (home page card) ──────────────────────────────────
  // Queries vw_player_game_scores server-side so we can cache the result in
  // memory and avoid hammering Supabase with one query per user per page load.
  // The view is slow (57014 timeouts under load); a single background query
  // every TRENDING_TTL_MS serves all concurrent visitors from cache.
  // vw_player_game_scores columns (confirmed 2026-06-15):
  // league_id, game_key, game_date, week_start, player_id, full_name,
  // team_id, team_name, pts, reb, ast, stl, blk, tov, fga, fta,
  // ts_pct, box_impact, win_flag, ts_bonus_points, win_bonus_points,
  // game_score, game_rank
  interface TrendingPerfRow {
    league_id: string; game_date: string | null; game_key: string | null;
    player_id: string; full_name: string;
    team_id: string | null; team_name: string | null;
    pts: number | null; reb: number | null; ast: number | null;
    stl: number | null; blk: number | null; tov: number | null;
    fga: number | null; fta: number | null;
    fgm?: number | null; ftm?: number | null;
    game_score: number | null; ts_pct: number | null;
    opponent_name?: string | null;
    game_result?: string | null;
  }
  interface TrendingApiPayload {
    perfs: TrendingPerfRow[];
    leagueNames: Record<string, string>;
    playerMeta: Record<string, { slug: string | null; photo_path_bg_removed: string | null }>;
  }
  const TRENDING_TTL_MS = 5 * 60 * 1000;
  let trendingCache: { data: TrendingApiPayload; at: number } | null = null;
  let trendingInFlight: Promise<TrendingApiPayload> | null = null;

  async function fetchTrendingPerformances(): Promise<TrendingApiPayload> {
    const empty: TrendingApiPayload = { perfs: [], leagueNames: {}, playerMeta: {} };

    const { data: leagueRows, error: lErr } = await supabaseAdmin
      .from("competitions")
      .select("league_id, name, trending_position")
      .eq("is_public", true)
      .not("trending_position", "is", null)
      .order("trending_position", { ascending: true, nullsFirst: false })
      .limit(8);

    if (lErr || !leagueRows || leagueRows.length === 0) {
      console.error("[TrendingPerf] leagues error", lErr?.message);
      return empty;
    }

    // Exclude REBA SL and child leagues (same rule as the scores carousel)
    const filteredRows = (leagueRows as { league_id: string; name: string | null; trending_position: number | null }[])
      .filter((l) => !l.name?.toLowerCase().includes("reba"));

    if (filteredRows.length === 0) return empty;

    const leagueNames: Record<string, string> = {};
    for (const l of filteredRows) {
      if (l.name) leagueNames[l.league_id] = l.name;
    }

    const leagueIds = filteredRows.map((l) => l.league_id);
    console.log("[TrendingPerf] querying leagues:", leagueRows.map((l: any) => `${l.name} (pos ${l.trending_position})`));
    const perfs: TrendingPerfRow[] = [];

    // Query vw_player_game_scores (per-game view). For each league, first find the
    // most recent game_date, then fetch the top 2 performers scoped to that date.
    // This prevents leakage from older game dates when fewer than 2 rows exist
    // on the newest date. ts_pct is pre-computed in the view.
    const perLeague = await Promise.allSettled(
      leagueIds.map(async (lid) => {
        const name = leagueNames[lid] || lid;

        const { data: latestGame } = await supabaseAdmin
          .from("vw_player_game_scores")
          .select("game_date")
          .eq("league_id", lid)
          .order("game_date", { ascending: false, nullsFirst: false })
          .limit(1)
          .returns<{ game_date: string | null }[]>();

        const mostRecentGameDate = latestGame?.[0]?.game_date ?? null;

        let query = supabaseAdmin
          .from("vw_player_game_scores")
          .select("league_id,game_date,game_key,player_id,full_name,team_id,team_name,pts,reb,ast,stl,blk,tov,fga,fta,game_score,ts_pct")
          .eq("league_id", lid)
          .order("game_score", { ascending: false });

        if (mostRecentGameDate) {
          query = query.eq("game_date", mostRecentGameDate);
        }

        const { data: rows, error } = await query
          .limit(2)
          .returns<TrendingPerfRow[]>();

        if (error) {
          console.error("[TrendingPerf] league query error", name, error.message);
          return [] as TrendingPerfRow[];
        }
        console.log(`[TrendingPerf] ${name}: ${rows?.length ?? 0} rows (most recent game_date: ${mostRecentGameDate ?? "none"})`);
        return rows || [];
      })
    );

    for (const result of perLeague) {
      if (result.status === "fulfilled") {
        for (const r of result.value) {
          if (r?.league_id) perfs.push(r);
        }
      }
    }

    perfs.sort((a, b) => {
      const aw = a.game_date || "";
      const bw = b.game_date || "";
      if (aw !== bw) return aw < bw ? 1 : -1;
      return (b.game_score ?? 0) - (a.game_score ?? 0);
    });

    const playerMeta: Record<string, { slug: string | null; photo_path_bg_removed: string | null }> = {};
    const playerIds = [...new Set(perfs.map((p) => p.player_id))];
    if (playerIds.length > 0) {
      const { data: metaRows, error: pErr } = await supabaseAdmin
        .from("players")
        .select("id, slug, photo_path_bg_removed")
        .in("id", playerIds);
      if (!pErr) {
        for (const p of (metaRows || []) as { id: string; slug: string | null; photo_path_bg_removed: string | null }[]) {
          playerMeta[p.id] = { slug: p.slug, photo_path_bg_removed: p.photo_path_bg_removed };
        }
      }
      // Fallback: fill missing photos by normalised name across all leagues
      const fallbackMap = await fetchPhotoFallbackMap();
      for (const perf of perfs) {
        const meta = playerMeta[perf.player_id];
        if (!meta?.photo_path_bg_removed && perf.full_name) {
          const key = normalisePlayerName(perf.full_name);
          const fallback = fallbackMap.get(key);
          if (fallback) {
            playerMeta[perf.player_id] = { slug: meta?.slug ?? null, photo_path_bg_removed: fallback };
          }
        }
      }
    }

    // Fetch FGM/FTM from player_stats so the card can show "makes/attempts" (e.g. 8/12).
    const gameKeys = [...new Set(perfs.filter(p => p.game_key).map(p => p.game_key!))];
    if (gameKeys.length > 0 && playerIds.length > 0) {
      const { data: shootingRows } = await supabaseAdmin
        .from("player_stats")
        .select("game_key,player_id,sfieldgoalsmade,sfreethrowsmade")
        .in("game_key", gameKeys)
        .in("player_id", playerIds);
      const shootingMap: Record<string, { fgm: number | null; ftm: number | null }> = {};
      for (const row of (shootingRows || []) as { game_key: string; player_id: string; sfieldgoalsmade: number | null; sfreethrowsmade: number | null }[]) {
        shootingMap[`${row.game_key}_${row.player_id}`] = { fgm: row.sfieldgoalsmade, ftm: row.sfreethrowsmade };
      }
      for (const perf of perfs) {
        const s = shootingMap[`${perf.game_key}_${perf.player_id}`];
        if (s) { perf.fgm = s.fgm; perf.ftm = s.ftm; }
      }
    }

    // Fetch opponent name + game result from v_game_results.
    if (gameKeys.length > 0) {
      const { data: gameRows } = await supabaseAdmin
        .from("v_game_results")
        .select("game_key,home_team,away_team,home_score,away_score")
        .in("game_key", gameKeys)
        .returns<{ game_key: string; home_team: string | null; away_team: string | null; home_score: number | null; away_score: number | null }[]>();
      const gameMap: Record<string, { home_team: string | null; away_team: string | null; home_score: number | null; away_score: number | null }> = {};
      for (const g of (gameRows || [])) {
        gameMap[g.game_key] = { home_team: g.home_team, away_team: g.away_team, home_score: g.home_score, away_score: g.away_score };
      }
      for (const perf of perfs) {
        if (!perf.game_key) continue;
        const g = gameMap[perf.game_key];
        if (!g) continue;
        const isHome = g.home_team && perf.team_name && g.home_team.toLowerCase() === perf.team_name.toLowerCase();
        const myScore = isHome ? g.home_score : g.away_score;
        const oppScore = isHome ? g.away_score : g.home_score;
        perf.opponent_name = isHome ? g.away_team : g.home_team;
        if (myScore !== null && oppScore !== null) {
          const wl = myScore > oppScore ? "W" : myScore < oppScore ? "L" : "T";
          perf.game_result = `${wl} ${myScore}-${oppScore}`;
        }
      }
    }

    return { perfs, leagueNames, playerMeta };
  }

  // ─── Helpers for player-leaders name deduplication (mirrors fuzzyMatch.ts) ────
  function plNormalizeName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z\s]/g, '');
  }
  function plNormalizeTeam(name: string): string {
    if (!name) return '';
    return name.trim()
      .replace(/\s+Senior\s+Men\s*/gi, ' ')
      .replace(/!/g, '')
      .replace(/\s+I(?![IVX])\s*$/i, '')
      .replace(/\s+/g, ' ').trim();
  }
  function plJaro(s1: string, s2: string): number {
    const l1 = s1.length, l2 = s2.length;
    if (!l1 && !l2) return 1; if (!l1 || !l2) return 0;
    const win = Math.floor(Math.max(l1, l2) / 2) - 1;
    const m1 = new Array(l1).fill(false), m2 = new Array(l2).fill(false);
    let matches = 0, t = 0;
    for (let i = 0; i < l1; i++) {
      const lo = Math.max(0, i - win), hi = Math.min(i + win + 1, l2);
      for (let j = lo; j < hi; j++) {
        if (m2[j] || s1[i] !== s2[j]) continue;
        m1[i] = m2[j] = true; matches++; break;
      }
    }
    if (!matches) return 0;
    let k = 0;
    for (let i = 0; i < l1; i++) {
      if (!m1[i]) continue; while (!m2[k]) k++;
      if (s1[i] !== s2[k]) t++; k++;
    }
    const jaro = (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3;
    let pLen = 0;
    for (let i = 0; i < Math.min(4, l1, l2); i++) { if (s1[i] === s2[i]) pLen++; else break; }
    return jaro + pLen * 0.1 * (1 - jaro);
  }
  function plNamesMatch(a: string, b: string): boolean {
    const n1 = plNormalizeName(a), n2 = plNormalizeName(b);
    if (n1 === n2) return true;
    const p1 = n1.split(' ').filter(Boolean), p2 = n2.split(' ').filter(Boolean);
    if (p1.length === p2.length && p1.length >= 2) {
      const firstMatch = p1[0] === p2[0] ||
        (p1[0].length === 1 && p2[0].startsWith(p1[0])) ||
        (p2[0].length === 1 && p1[0].startsWith(p2[0])) ||
        plJaro(p1[0], p2[0]) >= 0.82;
      if (firstMatch && plJaro(p1[p1.length-1], p2[p2.length-1]) >= 0.85) return true;
    }
    if (p1.length !== p2.length && p1.length >= 1 && p2.length >= 1) {
      const sh = p1.length < p2.length ? p1 : p2, lo = p1.length < p2.length ? p2 : p1;
      if (plJaro(sh[sh.length-1], lo[lo.length-1]) >= 0.85) {
        const sf = sh[0], lf = lo[0];
        if ((sf.length === 1 && lf.startsWith(sf)) || (lf.length === 1 && sf.startsWith(lf))) return true;
        if (plJaro(sf, lf) >= 0.8) return true;
      }
    }
    return false;
  }

  // ─── Home page: player leaders (same raw aggregation as league page) ──────────
  const playerLeadersCache = new Map<string, { data: any; at: number }>();
  const PLAYER_LEADERS_TTL = 5 * 60 * 1000;

  app.get("/api/home/player-leaders/:leagueId", async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const now = Date.now();
    const cached = playerLeadersCache.get(leagueId);
    if (cached && now - cached.at < PLAYER_LEADERS_TTL) return res.json(cached.data);

    try {
      // Verify the league is public
      const allowed = await filterLeagueIdsForPublicScope([leagueId]);
      if (!allowed.includes(leagueId)) return res.status(403).json({ error: "Forbidden" });

      // Resolve the effective league IDs to query — for parent leagues, player_stats
      // rows live under the child competition IDs, not the parent's own ID.
      // This mirrors the league page's psIds = isParentFetch ? parentChildIds : [statsLeagueId]
      const { data: children } = await supabaseAdmin
        .from("competitions")
        .select("league_id")
        .eq("parent_league_id", leagueId);
      const childIds: string[] = (children || []).map((c: any) => c.league_id);
      const queryIds: string[] = childIds.length > 0 ? childIds : [leagueId];
      console.log(`[PlayerLeaders] ${leagueId}: querying ids=${JSON.stringify(queryIds)}`);

      // Fetch ALL raw game-by-game stats — paginate to avoid the default 1 000-row
      // PostgREST cap (same approach as /api/public/player-stats).
      const SELECT_COLS =
        "player_id, full_name, firstname, familyname, team_name, " +
        "spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, " +
        "sfieldgoalsattempted, sfreethrowsattempted, sminutes";
      const PAGE_SIZE = 1000;
      const allStats: any[] = [];
      let offset = 0;
      while (true) {
        const q = supabaseAdmin
          .from("player_stats")
          .select(SELECT_COLS)
          .range(offset, offset + PAGE_SIZE - 1);
        const { data: page, error: pageErr } = await (
          queryIds.length === 1
            ? q.eq("league_id", queryIds[0])
            : q.in("league_id", queryIds)
        );
        if (pageErr) {
          console.error("[PlayerLeaders] page error", pageErr.message);
          return res.status(500).json({ error: pageErr.message });
        }
        if (!page || page.length === 0) break;
        allStats.push(...page);
        if (page.length < PAGE_SIZE) break; // last page
        offset += PAGE_SIZE;
      }

      if (allStats.length === 0) {
        return res.json({ scoring: [], rebounding: [], assists: [],
          scoring_total: [], rebounding_total: [], assists_total: [] });
      }
      console.log(`[PlayerLeaders] ${leagueId}: ${allStats.length} rows fetched`);

      // Aggregate by player_id — mirrors aggregatePlayerStats on the league page
      const byPlayerId = new Map<string, {
        name: string; team: string; player_id: string;
        games: number; totalPoints: number; totalRebounds: number; totalAssists: number;
      }>();

      for (const stat of allStats) {
        if (!stat.player_id) continue;
        const name = (stat.full_name ||
          `${stat.firstname || ""} ${stat.familyname || ""}`.trim() ||
          "Unknown").trim();
        const team = stat.team_name || "";

        const hasAnyStats =
          (stat.spoints || 0) > 0 || (stat.sreboundstotal || 0) > 0 ||
          (stat.sassists || 0) > 0 || (stat.ssteals || 0) > 0 ||
          (stat.sblocks || 0) > 0 || (stat.sfieldgoalsattempted || 0) > 0 ||
          (stat.sfreethrowsattempted || 0) > 0 || (stat.sturnovers || 0) > 0;

        const mins = stat.sminutes;
        let minutesPlayed = 0;
        if (typeof mins === "number") minutesPlayed = mins;
        else if (typeof mins === "string") {
          const parts = mins.split(":");
          minutesPlayed = parts.length === 2
            ? parseInt(parts[0]) + parseInt(parts[1]) / 60
            : parseFloat(mins) || 0;
        }
        if (!minutesPlayed && !hasAnyStats) continue; // DNP — skip

        if (!byPlayerId.has(stat.player_id)) {
          byPlayerId.set(stat.player_id, {
            name, team, player_id: stat.player_id,
            games: 0, totalPoints: 0, totalRebounds: 0, totalAssists: 0,
          });
        }
        const agg = byPlayerId.get(stat.player_id)!;
        agg.games += 1;
        agg.totalPoints += stat.spoints || 0;
        agg.totalRebounds += stat.sreboundstotal || 0;
        agg.totalAssists += stat.sassists || 0;
      }

      // Second pass: merge same-team entries whose names fuzzy-match
      // (mirrors aggregatePlayerStats cross-player-id merge on the league page)
      const mergedPlayers: Array<{ name: string; team: string; player_id: string;
        games: number; totalPoints: number; totalRebounds: number; totalAssists: number }> = [];
      const processedIds = new Set<string>();

      for (const [pid, player] of byPlayerId.entries()) {
        if (processedIds.has(pid)) continue;
        const normTeam = plNormalizeTeam(player.team);
        for (const [otherId, other] of byPlayerId.entries()) {
          if (otherId === pid || processedIds.has(otherId)) continue;
          if (plNormalizeTeam(other.team) === normTeam && plNamesMatch(player.name, other.name)) {
            player.games += other.games;
            player.totalPoints += other.totalPoints;
            player.totalRebounds += other.totalRebounds;
            player.totalAssists += other.totalAssists;
            // prefer the longer/more-complete name
            if (other.name.length > player.name.length) player.name = other.name;
            processedIds.add(otherId);
          }
        }
        processedIds.add(pid);
        mergedPlayers.push(player);
      }

      // Enrich with slug + photo from players table
      const playerIds = mergedPlayers.map(p => p.player_id).slice(0, 1000);
      const metaById = new Map<string, { slug: string | null; photo_path_bg_removed: string | null }>();
      if (playerIds.length > 0) {
        const { data: playerRows } = await supabaseAdmin
          .from("players")
          .select("id, slug, photo_path_bg_removed")
          .in("id", playerIds);
        (playerRows || []).forEach((p: any) => {
          metaById.set(p.id, { slug: p.slug ?? null, photo_path_bg_removed: p.photo_path_bg_removed ?? null });
        });
        // Fallback: fill missing photos by normalised name across all leagues
        const fallbackMap = await fetchPhotoFallbackMap();
        for (const player of mergedPlayers) {
          const meta = metaById.get(player.player_id);
          if (!meta?.photo_path_bg_removed && player.name) {
            const key = normalisePlayerName(player.name);
            const fallback = fallbackMap.get(key);
            if (fallback) {
              metaById.set(player.player_id, { slug: meta?.slug ?? null, photo_path_bg_removed: fallback });
            }
          }
        }
      }

      const allRows = mergedPlayers.map((p) => {
        const gp = p.games || 1;
        const meta = metaById.get(p.player_id);
        return {
          player_id: p.player_id,
          full_name: p.name,
          team: p.team,
          slug: meta?.slug ?? null,
          photo_path_bg_removed: meta?.photo_path_bg_removed ?? null,
          games: p.games,
          total_pts: p.totalPoints,
          total_reb: p.totalRebounds,
          total_ast: p.totalAssists,
          ppg: Math.round((p.totalPoints / gp) * 10) / 10,
          rpg: Math.round((p.totalRebounds / gp) * 10) / 10,
          apg: Math.round((p.totalAssists / gp) * 10) / 10,
        };
      });

      // Adaptive min-games qualifier — mirrors the league page's leadersQualifier logic.
      // Averages leaderboards only; totals lists are unfiltered.
      const maxGamesAny = allRows.reduce((m, p) => Math.max(m, p.games || 0), 0);
      const minGames = maxGamesAny < 3
        ? 1
        : Math.max(1, Math.ceil(maxGamesAny * 0.4));
      const qualified = allRows.filter((p) => (p.games || 0) >= minGames);
      // Fall back to unfiltered if qualifier produces an empty list
      const avgPool = qualified.length > 0 ? qualified : allRows;
      console.log(`[PlayerLeaders] ${leagueId}: maxGames=${maxGamesAny} minGames=${minGames} qualified=${qualified.length}/${allRows.length}`);

      const result = {
        scoring:          [...avgPool].sort((a, b) => b.ppg       - a.ppg).slice(0, 5),
        rebounding:       [...avgPool].sort((a, b) => b.rpg       - a.rpg).slice(0, 5),
        assists:          [...avgPool].sort((a, b) => b.apg       - a.apg).slice(0, 5),
        scoring_total:    [...allRows].sort((a, b) => b.total_pts - a.total_pts).slice(0, 5),
        rebounding_total: [...allRows].sort((a, b) => b.total_reb - a.total_reb).slice(0, 5),
        assists_total:    [...allRows].sort((a, b) => b.total_ast - a.total_ast).slice(0, 5),
      };

      playerLeadersCache.set(leagueId, { data: result, at: Date.now() });
      return res.json(result);
    } catch (err: any) {
      console.error("[PlayerLeaders] error", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ─── GameSwitcherBar server proxy ───────────────────────────────────────────
  // Proxies game_schedule / team_stats / live_events queries server-side so
  // they never hit Supabase directly from the browser (avoids CORS issues on
  // custom domains like swishassistant.com).
  app.get("/api/game-switcher/:leagueId", async (req: Request, res: Response) => {
    const { leagueId } = req.params;
    const schema = (req.query.schema as string) === "test" ? "test" : "public";
    const db = schema === "test" ? supabaseAdmin.schema("test") : supabaseAdmin;

    const now = new Date();
    const sevenDaysAgo = new Date(now); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysFromNow = new Date(now); sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    try {
      const [liveResp, rangeResp] = await Promise.all([
        db.from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime, status")
          .eq("league_id", leagueId)
          .or("status.ilike.%live%,status.eq.in_progress"),
        db.from("game_schedule")
          .select("game_key, hometeam, awayteam, matchtime, status")
          .eq("league_id", leagueId)
          .gte("matchtime", sevenDaysAgo.toISOString())
          .lte("matchtime", sevenDaysFromNow.toISOString())
          .order("matchtime", { ascending: true }),
      ]);

      const combined = [...(liveResp.data || []), ...(rangeResp.data || [])];
      const unique = combined.filter((g, i, arr) => i === arr.findIndex(x => x.game_key === g.game_key));

      let teamStats: any[] = [];
      let liveEvents: any[] = [];

      if (unique.length > 0) {
        const gameKeys = unique.map(g => g.game_key);
        const [tsResp, leResp] = await Promise.all([
          db.from("team_stats").select("game_key, name, tot_spoints").in("game_key", gameKeys),
          db.from("live_events").select("game_key, period, clock, created_at")
            .in("game_key", gameKeys).order("created_at", { ascending: false }),
        ]);
        teamStats = tsResp.data || [];
        liveEvents = leResp.data || [];
      }

      return res.json({ games: unique, teamStats, liveEvents });
    } catch (err: any) {
      console.error("[GameSwitcher] error", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Per-slug cache for league-scoped trending performances (keyed by slug).
  const leagueTrendingCache = new Map<string, { data: TrendingApiPayload; at: number }>();
  const leagueTrendingInFlight = new Map<string, Promise<TrendingApiPayload>>();

  async function fetchLeagueTrendingPerformances(slug: string): Promise<TrendingApiPayload> {
    const empty: TrendingApiPayload = { perfs: [], leagueNames: {}, playerMeta: {} };

    // Resolve the league_id from the slug (could be a URL slug string or a UUID).
    // Enforce is_public=true so private leagues cannot be accessed by unauthenticated callers.
    // Only include league_id in the OR filter when the slug looks like a UUID to avoid
    // PostgreSQL parse errors (league_id is a uuid column, not a text column).
    // competition_id and league_id are both uuid columns — only include them in
    // the OR filter when the slug param is itself a valid UUID, otherwise
    // PostgreSQL will throw "invalid input syntax for type uuid".
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUuid = UUID_RE.test(slug);

    let leagueQuery = supabaseAdmin
      .from("competitions")
      .select("league_id, name, is_public")
      .eq("is_public", true);

    if (isUuid) {
      leagueQuery = leagueQuery.or(`slug.eq.${slug},competition_id.eq.${slug},league_id.eq.${slug}`);
    } else {
      leagueQuery = leagueQuery.eq("slug", slug);
    }

    const { data: leagueRow, error: lErr } = await leagueQuery.maybeSingle();

    if (lErr || !leagueRow) {
      console.error("[LeagueTrendingPerf] league lookup error (not found or not public)", slug, lErr?.message);
      return empty;
    }

    const { league_id, name } = leagueRow as { league_id: string; name: string | null; is_public: boolean };
    const leagueNames: Record<string, string> = { [league_id]: name || slug };

    // First find the most recent game_date for this league so we only show
    // performances from the latest game date, not spill from prior dates.
    const { data: latestGame } = await supabaseAdmin
      .from("vw_player_game_scores")
      .select("game_date")
      .eq("league_id", league_id)
      .order("game_date", { ascending: false, nullsFirst: false })
      .limit(1)
      .returns<{ game_date: string | null }[]>();

    const mostRecentGameDate = latestGame?.[0]?.game_date ?? null;

    let query = supabaseAdmin
      .from("vw_player_game_scores")
      .select("league_id,game_date,game_key,player_id,full_name,team_id,team_name,pts,reb,ast,stl,blk,tov,fga,fta,game_score,ts_pct")
      .eq("league_id", league_id)
      .order("game_score", { ascending: false });

    if (mostRecentGameDate) {
      query = query.eq("game_date", mostRecentGameDate);
    }

    const { data: rows, error } = await query
      .limit(5)
      .returns<TrendingPerfRow[]>();

    if (error) {
      console.error("[LeagueTrendingPerf] query error", slug, error.message);
      return empty;
    }

    // ts_pct is pre-computed in vw_player_game_scores, no calculation needed.
    const perfs: TrendingPerfRow[] = rows || [];

    const playerMeta: Record<string, { slug: string | null; photo_path_bg_removed: string | null }> = {};
    const playerIds = [...new Set(perfs.map((p) => p.player_id))];
    if (playerIds.length > 0) {
      const { data: metaRows, error: pErr } = await supabaseAdmin
        .from("players")
        .select("id, slug, photo_path_bg_removed")
        .in("id", playerIds);
      if (!pErr) {
        for (const p of (metaRows || []) as { id: string; slug: string | null; photo_path_bg_removed: string | null }[]) {
          playerMeta[p.id] = { slug: p.slug, photo_path_bg_removed: p.photo_path_bg_removed };
        }
      }
      // Fallback: fill missing photos by normalised name across all leagues
      const fallbackMap = await fetchPhotoFallbackMap();
      for (const perf of perfs) {
        const meta = playerMeta[perf.player_id];
        if (!meta?.photo_path_bg_removed && perf.full_name) {
          const key = normalisePlayerName(perf.full_name);
          const fallback = fallbackMap.get(key);
          if (fallback) {
            playerMeta[perf.player_id] = { slug: meta?.slug ?? null, photo_path_bg_removed: fallback };
          }
        }
      }
    }

    // Fetch FGM/FTM from player_stats so the card can show "makes/attempts" (e.g. 8/12).
    const gameKeys = [...new Set(perfs.filter(p => p.game_key).map(p => p.game_key!))];
    if (gameKeys.length > 0 && playerIds.length > 0) {
      const { data: shootingRows } = await supabaseAdmin
        .from("player_stats")
        .select("game_key,player_id,sfieldgoalsmade,sfreethrowsmade")
        .in("game_key", gameKeys)
        .in("player_id", playerIds);
      const shootingMap: Record<string, { fgm: number | null; ftm: number | null }> = {};
      for (const row of (shootingRows || []) as { game_key: string; player_id: string; sfieldgoalsmade: number | null; sfreethrowsmade: number | null }[]) {
        shootingMap[`${row.game_key}_${row.player_id}`] = { fgm: row.sfieldgoalsmade, ftm: row.sfreethrowsmade };
      }
      for (const perf of perfs) {
        const s = shootingMap[`${perf.game_key}_${perf.player_id}`];
        if (s) { perf.fgm = s.fgm; perf.ftm = s.ftm; }
      }
    }

    // Fetch opponent name + game result from v_game_results.
    if (gameKeys.length > 0) {
      const { data: gameRows } = await supabaseAdmin
        .from("v_game_results")
        .select("game_key,home_team,away_team,home_score,away_score")
        .in("game_key", gameKeys)
        .returns<{ game_key: string; home_team: string | null; away_team: string | null; home_score: number | null; away_score: number | null }[]>();
      const gameMap: Record<string, { home_team: string | null; away_team: string | null; home_score: number | null; away_score: number | null }> = {};
      for (const g of (gameRows || [])) {
        gameMap[g.game_key] = { home_team: g.home_team, away_team: g.away_team, home_score: g.home_score, away_score: g.away_score };
      }
      for (const perf of perfs) {
        if (!perf.game_key) continue;
        const g = gameMap[perf.game_key];
        if (!g) continue;
        const isHome = g.home_team && perf.team_name && g.home_team.toLowerCase() === perf.team_name.toLowerCase();
        const myScore = isHome ? g.home_score : g.away_score;
        const oppScore = isHome ? g.away_score : g.home_score;
        perf.opponent_name = isHome ? g.away_team : g.home_team;
        if (myScore !== null && oppScore !== null) {
          const wl = myScore > oppScore ? "W" : myScore < oppScore ? "L" : "T";
          perf.game_result = `${wl} ${myScore}-${oppScore}`;
        }
      }
    }

    console.log(`[LeagueTrendingPerf] ${slug}: ${perfs.length} rows`);
    return { perfs, leagueNames, playerMeta };
  }

  app.get("/api/league/:slug/trending-performances", async (req: Request, res: Response) => {
    const { slug } = req.params;
    const now = Date.now();
    const cached = leagueTrendingCache.get(slug);
    if (cached && now - cached.at < TRENDING_TTL_MS) {
      // Serve cached result — if it has no leagueNames the league wasn't found/public.
      if (Object.keys(cached.data.leagueNames).length === 0) {
        return res.status(404).json({ error: "League not found or not public" });
      }
      return res.json(cached.data);
    }
    if (!leagueTrendingInFlight.has(slug)) {
      const p = fetchLeagueTrendingPerformances(slug).finally(() => {
        leagueTrendingInFlight.delete(slug);
      });
      leagueTrendingInFlight.set(slug, p);
    }
    try {
      const data = await leagueTrendingInFlight.get(slug)!;
      // Only cache successful league lookups (leagueNames populated = public league found).
      // Don't persist "not found" results so a later publish/add can succeed without a restart.
      if (Object.keys(data.leagueNames).length > 0) {
        leagueTrendingCache.set(slug, { data, at: Date.now() });
        return res.json(data);
      }
      return res.status(404).json({ error: "League not found or not public" });
    } catch (err: any) {
      console.error("[LeagueTrendingPerf] fetch error", slug, err.message);
      if (cached) return res.json(cached.data);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/home/trending-performances", async (req: Request, res: Response) => {
    const now = Date.now();
    if (trendingCache && now - trendingCache.at < TRENDING_TTL_MS) {
      return res.json(trendingCache.data);
    }
    // Deduplicate concurrent requests — only one in-flight fetch at a time.
    if (!trendingInFlight) {
      trendingInFlight = fetchTrendingPerformances().finally(() => {
        trendingInFlight = null;
      });
    }
    try {
      const data = await trendingInFlight;
      trendingCache = { data, at: Date.now() };
      return res.json(data);
    } catch (err: any) {
      console.error("[TrendingPerf] fetch error", err.message);
      if (trendingCache) return res.json(trendingCache.data);
      return res.json({ perfs: [], leagueNames: {}, playerMeta: {} });
    }
  });

  // ─── Player CSV import endpoint ─────────────────────────────────────────────
  app.post("/api/admin/import-players", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      // Verify the caller has the admin role in their Supabase app_metadata.
      const { data: adminUserData, error: adminUserError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (adminUserError || !adminUserData?.user) {
        return res.status(403).json({ error: "Admin access required" });
      }
      if (adminUserData.user.app_metadata?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const file = req.file;
      if (!file) return res.status(400).json({ error: "No CSV file uploaded" });

      const csvText = file.buffer.toString("utf-8");
      const rows = parseCSV(csvText);

      if (rows.length === 0) return res.status(400).json({ error: "CSV is empty or has no data rows" });

      const { data: existingPlayers, error: playersError } = await supabaseAdmin
        .from("players")
        .select("id, full_name, slug");

      if (playersError || !existingPlayers) {
        return res.status(500).json({ error: "Failed to fetch existing players" });
      }

      const normalize = (s: string) =>
        s.toLowerCase().replace(/\s+/g, " ").trim();

      const playerByName = new Map<string, { id: string; slug: string }>();
      for (const p of existingPlayers) {
        if (p.full_name) playerByName.set(normalize(p.full_name), { id: p.id, slug: p.slug });
      }

      const existingSlugs = new Set(existingPlayers.map((p: any) => p.slug).filter(Boolean));

      let updated = 0;
      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const rawName = (row["full_name"] || "").trim();
        if (!rawName) { skipped++; continue; }

        const previousTeamsRaw = (row["previous_teams"] || "").trim();
        const previousTeams = previousTeamsRaw
          ? previousTeamsRaw.split(";").map((t: string) => t.trim()).filter(Boolean)
          : null;

        // Enrichment fields — the only fields updated on existing matched players.
        const enrichmentOnly: Record<string, any> = {};
        if (row["current_team"] !== undefined && row["current_team"] !== "")
          enrichmentOnly.current_team = row["current_team"].trim();
        if (previousTeams !== null && previousTeams.length > 0)
          enrichmentOnly.previous_teams = previousTeams;
        if (row["instagram_handle"] !== undefined && row["instagram_handle"] !== "")
          enrichmentOnly.instagram_handle = row["instagram_handle"].replace(/^@/, "").trim();

        // Additional fields allowed only for new inserts (do not overwrite stats-sourced data).
        const insertExtras: Record<string, any> = {};
        if (row["position"] !== undefined && row["position"] !== "")
          insertExtras.position = row["position"].trim();
        if (row["height_cm"] !== undefined && row["height_cm"] !== "") {
          const h = parseFloat(row["height_cm"]);
          if (!isNaN(h)) insertExtras.height_cm = h;
        }
        if (row["date_of_birth"] !== undefined && row["date_of_birth"] !== "")
          insertExtras.date_of_birth = row["date_of_birth"].trim();

        const normName = normalize(rawName);
        const existing = playerByName.get(normName);

        if (existing) {
          if (Object.keys(enrichmentOnly).length === 0) { skipped++; continue; }
          const { error: updateError } = await supabaseAdmin
            .from("players")
            .update(enrichmentOnly)
            .eq("id", existing.id);

          if (updateError) {
            errors.push(`Row "${rawName}": ${updateError.message}`);
          } else {
            updated++;
          }
        } else {
          const baseSlug = generatePlayerSlug(rawName);
          let slug = baseSlug;
          let counter = 1;
          while (existingSlugs.has(slug)) {
            slug = `${baseSlug}-${counter++}`;
          }
          existingSlugs.add(slug);

          const newRow: Record<string, any> = {
            full_name: rawName,
            slug,
            ...enrichmentOnly,
            ...insertExtras,
          };

          const { error: insertError } = await supabaseAdmin
            .from("players")
            .insert(newRow);

          if (insertError) {
            errors.push(`Row "${rawName}" (new): ${insertError.message}`);
          } else {
            created++;
            playerByName.set(normName, { id: "", slug });
          }
        }
      }

      return res.json({ updated, created, skipped, errors });
    } catch (err: any) {
      console.error("[import-players] error:", err.message);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    const now = Date.now();
    const forceRefresh = req.query.refresh === "1";
    if (!forceRefresh && sitemapCache && now - sitemapCache.at < SITEMAP_TTL_MS) {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.send(sitemapCache.xml);
    }
    try {
      const xml = await buildSitemap();
      sitemapCache = { xml, at: now };
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (err: any) {
      console.error("Sitemap generation error:", err.message);
      if (sitemapCache) {
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        return res.send(sitemapCache.xml);
      }
      res.status(500).send("Failed to generate sitemap");
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}