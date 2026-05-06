import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { supabaseAdmin } from "./supabaseServiceClient";
import multer from 'multer';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const upload = multer({ storage: multer.memoryStorage() });

async function authenticateSupabaseUser(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function verifyLeagueOwnership(userId: string, leagueId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('leagues')
    .select('user_id, created_by')
    .eq('league_id', leagueId)
    .single();
  if (error || !data) return false;
  return data.user_id === userId || data.created_by === userId;
}

const PYTHON_BACKEND = "http://localhost:8000";

async function proxyToPython(req: Request, res: Response, path: string) {
  try {
    const url = `${PYTHON_BACKEND}${path}`;
    const isGet = req.method === "GET";
    const fetchRes = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: isGet ? undefined : JSON.stringify(req.body),
    });
    const data = await fetchRes.json();
    res.status(fetchRes.status).json(data);
  } catch (err: any) {
    console.error(`Error proxying to Python ${path}:`, err.message);
    res.status(502).json({ error: "Python backend unavailable", details: err.message });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Test endpoint to verify routes are working
  app.get("/api/test", (req, res) => {
    res.json({ message: "API routes are working!", timestamp: new Date().toISOString() });
  });

  // Python backend proxy routes
  app.get("/start", (req, res) => proxyToPython(req, res, "/start"));
  app.post("/chat", (req, res) => proxyToPython(req, res, "/chat"));
  app.post("/api/ai-analysis", (req, res) => proxyToPython(req, res, "/api/ai-analysis"));
  app.post("/api/parse", (req, res) => proxyToPython(req, res, "/api/parse"));

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

      const completion = await openai.chat.completions.create({
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

      const { error: dbError } = await supabaseAdmin
        .from("team_logos")
        .upsert({
          league_id: leagueId,
          team_name: teamName,
          logo_url: publicUrl,
          uploaded_by: "system",
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'league_id,team_name',
        });

      if (dbError && dbError.code !== '42P01') {
        console.error("Error persisting to team_logos:", dbError);
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

  app.post("/api/league-banners/upload", upload.single('file'), async (req, res) => {
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
        return res.status(403).json({ error: "Only league owners can upload banners" });
      }

      const fileExt = file.originalname.split('.').pop();
      const fileName = `${leagueId}_${Date.now()}.${fileExt}`;

      const { data, error } = await supabaseAdmin.storage
        .from('league-banners')
        .upload(fileName, file.buffer, {
          upsert: true,
          contentType: file.mimetype,
        });

      if (error) {
        console.error("Banner storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('league-banners')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabaseAdmin
        .from('leagues')
        .update({ banner_url: publicUrl })
        .eq('league_id', leagueId);

      if (updateError) {
        console.error("Error updating league banner_url:", updateError);
        return res.status(500).json({ error: updateError.message });
      }

      res.json({ success: true, publicUrl });
    } catch (error) {
      console.error("Banner upload error:", error);
      res.status(500).json({ error: "Banner upload failed" });
    }
  });

  app.get("/api/public/league-branding/:slug", async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      if (!slug) return res.status(400).json({ error: "slug is required" });

      const { data, error } = await supabaseAdmin
        .from("leagues")
        .select("league_id, name, slug, primary_color, secondary_color, accent_color, brand_primary_colour, banner_url, logo_url")
        .eq("slug", slug)
        .eq("is_public", true)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "League not found" });
      }

      const responseData = {
        ...data,
        primary_color: data.brand_primary_colour || data.primary_color,
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

      const { data, error } = await supabaseAdmin
        .from("leagues")
        .select("league_id, name, slug, primary_color, secondary_color, accent_color, brand_primary_colour, banner_url, logo_url")
        .eq("league_id", leagueId)
        .eq("is_public", true)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "League not found" });
      }

      const responseData = {
        ...data,
        primary_color: data.brand_primary_colour || data.primary_color,
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
        .from("leagues")
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

  app.get("/api/public/league-logo/:leagueId", async (req: Request, res: Response) => {
    try {
      const { leagueId } = req.params;
      if (!leagueId) return res.status(400).json({ error: "leagueId is required" });

      const { data, error } = await supabaseAdmin
        .from("leagues")
        .select("logo_url, parent_league_id, is_public")
        .eq("league_id", leagueId)
        .eq("is_public", true)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "League not found" });
      }

      if (data.logo_url) {
        return res.json({ logo_url: data.logo_url });
      }

      if (data.parent_league_id) {
        const { data: parentData } = await supabaseAdmin
          .from("leagues")
          .select("logo_url")
          .eq("league_id", data.parent_league_id)
          .eq("is_public", true)
          .single();

        return res.json({ logo_url: parentData?.logo_url || null });
      }

      res.json({ logo_url: null });
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

  const httpServer = createServer(app);
  return httpServer;
}