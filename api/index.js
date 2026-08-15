// api/_source.ts
import express from "express";

// server/routes.ts
import { createServer } from "http";
import * as https from "https";
import * as http from "http";

// server/objectStorage.ts
import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
var REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
var objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token"
      }
    },
    universe_domain: "googleapis.com"
  },
  projectId: ""
});
var ObjectNotFoundError = class _ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, _ObjectNotFoundError.prototype);
  }
};
var ObjectStorageService = class {
  constructor() {
  }
  // Gets the public object search paths.
  getPublicObjectSearchPaths() {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr.split(",").map((path2) => path2.trim()).filter((path2) => path2.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }
  // Gets the private object directory.
  getPrivateObjectDir() {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }
  // Search for a public object from the search paths.
  async searchPublicObject(filePath) {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }
  // Downloads an object to the response.
  async downloadObject(file, res, cacheTtlSec = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
  // Gets the upload URL for a team logo.
  async getTeamLogoUploadURL() {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    const logoId = randomUUID();
    const fullPath = `${privateObjectDir}/team-logos/${logoId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900
    });
  }
  // Gets the team logo file from the object path.
  async getTeamLogoFile(logoPath) {
    if (!logoPath.startsWith("/team-logos/")) {
      throw new ObjectNotFoundError();
    }
    const parts = logoPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const logoId = parts.slice(1).join("/");
    let logoDir = this.getPrivateObjectDir();
    if (!logoDir.endsWith("/")) {
      logoDir = `${logoDir}/`;
    }
    const logoObjectPath = `${logoDir}${logoPath.slice(1)}`;
    const { bucketName, objectName } = parseObjectPath(logoObjectPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const logoFile = bucket.file(objectName);
    const [exists] = await logoFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return logoFile;
  }
  normalizeTeamLogoPath(rawPath) {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let logoDir = this.getPrivateObjectDir();
    if (!logoDir.endsWith("/")) {
      logoDir = `${logoDir}/`;
    }
    if (!rawObjectPath.startsWith(logoDir)) {
      return rawObjectPath;
    }
    const logoId = rawObjectPath.slice(logoDir.length);
    return `/team-logos/${logoId}`;
  }
};
function parseObjectPath(path2) {
  if (!path2.startsWith("/")) {
    path2 = `/${path2}`;
  }
  const pathParts = path2.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return {
    bucketName,
    objectName
  };
}
async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec
}) {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1e3).toISOString()
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`
    );
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

// server/supabaseServiceClient.ts
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = process.env.VITE_SUPABASE_URL || "https://omkwqpcgttrgvbhcxgqf.supabase.co";
var serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.error(
    "[supabaseServiceClient] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. Server-side privileged routes (uploads, admin, trending, team logos, etc.) will fail. Set this variable in your Vercel/deployment environment."
  );
}
var supabaseAdmin = createClient(supabaseUrl, serviceRoleKey || "missing-key", {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// server/playerMergeUtils.ts
var NICKNAME_MAP = {
  chuck: ["chukwuma", "charles"],
  chukwuma: ["chuck"],
  charles: ["chuck", "charlie"],
  charlie: ["charles"],
  mike: ["michael"],
  michael: ["mike"],
  chris: ["christopher"],
  christopher: ["chris"],
  nick: ["nicholas", "nicolas"],
  nicholas: ["nick"],
  nicolas: ["nick"],
  will: ["william", "wilfrid"],
  william: ["will", "bill", "billy"],
  wilfrid: ["will"],
  bill: ["william"],
  billy: ["william", "bill"],
  alex: ["alexander", "alejandro"],
  alexander: ["alex"],
  alejandro: ["alex"],
  dan: ["daniel"],
  daniel: ["dan", "danny"],
  danny: ["daniel"],
  joe: ["joseph", "jose"],
  joseph: ["joe", "joey"],
  jose: ["joe"],
  joey: ["joseph"],
  matt: ["matthew", "mathew"],
  matthew: ["matt"],
  mathew: ["matt"],
  ben: ["benjamin"],
  benjamin: ["ben", "benny"],
  benny: ["benjamin"],
  rob: ["robert", "roberto"],
  robert: ["rob", "bob", "bobby"],
  roberto: ["rob"],
  bob: ["robert"],
  bobby: ["robert", "bob"],
  ed: ["edward", "eduardo"],
  edward: ["ed", "eddie"],
  eduardo: ["ed"],
  eddie: ["edward"],
  tom: ["thomas", "tommy"],
  thomas: ["tom", "tommy"],
  tommy: ["thomas", "tom"],
  jim: ["james", "jimmy"],
  james: ["jim", "jimmy", "jamie"],
  jimmy: ["james", "jim"],
  jamie: ["james"],
  dave: ["david"],
  david: ["dave"],
  steve: ["steven", "stephen"],
  steven: ["steve"],
  stephen: ["steve"],
  tony: ["anthony", "antonio"],
  anthony: ["tony"],
  antonio: ["tony"],
  sam: ["samuel", "sammy"],
  samuel: ["sam", "sammy"],
  sammy: ["sam", "samuel"],
  max: ["maxwell", "maximilian"],
  maxwell: ["max"],
  maximilian: ["max"],
  josh: ["joshua"],
  joshua: ["josh"],
  jack: ["jackson", "john"],
  jackson: ["jack"],
  john: ["jack", "johnny", "jon"],
  johnny: ["john"],
  jon: ["john", "jonathan"],
  jonathan: ["jon"],
  pete: ["peter"],
  peter: ["pete"],
  andy: ["andrew", "andre"],
  andrew: ["andy", "drew"],
  andre: ["andy"],
  drew: ["andrew"],
  zach: ["zachary", "zachariah", "zakariah"],
  zachary: ["zach"],
  zachariah: ["zach"],
  zakariah: ["zach"]
};
function areNicknameVariants(a, b) {
  const n1 = a.toLowerCase().trim();
  const n2 = b.toLowerCase().trim();
  if (n1 === n2) return true;
  return (NICKNAME_MAP[n1] || []).includes(n2) || (NICKNAME_MAP[n2] || []).includes(n1);
}
function normalizeName(name) {
  return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^a-z\s]/g, "");
}
function jaroWinkler(s1, s2) {
  const l1 = s1.length;
  const l2 = s2.length;
  if (l1 === 0 && l2 === 0) return 1;
  if (l1 === 0 || l2 === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(l1, l2) / 2) - 1);
  const m1 = new Array(l1).fill(false);
  const m2 = new Array(l2).fill(false);
  let matches = 0;
  for (let i = 0; i < l1; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, l2);
    for (let j = start; j < end; j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = true;
      m2[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < l1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  const jaro = (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, l1, l2); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}
function namesMatch(name1, name2, threshold = 0.85) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (n1 === n2) return true;
  const p1 = n1.split(" ").filter(Boolean);
  const p2 = n2.split(" ").filter(Boolean);
  if (p1.length === 1 && p2.length >= 2) {
    if (jaroWinkler(p1[0], p2[p2.length - 1]) >= 0.9) return true;
  }
  if (p2.length === 1 && p1.length >= 2) {
    if (jaroWinkler(p2[0], p1[p1.length - 1]) >= 0.9) return true;
  }
  if (p1.length === p2.length) {
    let allMatch = true;
    for (let i = 0; i < p1.length; i++) {
      const a = p1[i];
      const b = p2[i];
      if (a !== b && !(a.length === 1 && b.startsWith(a)) && !(b.length === 1 && a.startsWith(b)) && !areNicknameVariants(a, b)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }
  if (p1.length !== p2.length && p1.length >= 1 && p2.length >= 1) {
    const shorter = p1.length < p2.length ? p1 : p2;
    const longer = p1.length < p2.length ? p2 : p1;
    const sLast = shorter[shorter.length - 1];
    const lLast = longer[longer.length - 1];
    if (jaroWinkler(sLast, lLast) >= 0.85) {
      const sf = shorter[0];
      const lf = longer[0];
      if (sf.length === 1 && lf.startsWith(sf) || lf.length === 1 && sf.startsWith(lf)) return true;
      if (areNicknameVariants(sf, lf)) return true;
      if (jaroWinkler(sf, lf) >= 0.8) return true;
    }
  }
  if (p1.length === p2.length && p1.length >= 2) {
    const last1 = p1[p1.length - 1];
    const last2 = p2[p2.length - 1];
    const first1 = p1[0];
    const first2 = p2[0];
    const firstMatch = first1 === first2 || first1.length === 1 && first2.startsWith(first1) || first2.length === 1 && first1.startsWith(first2) || areNicknameVariants(first1, first2) || jaroWinkler(first1, first2) >= 0.82;
    if (firstMatch && jaroWinkler(last1, last2) >= 0.85) return true;
  }
  if (p1.length <= 1 && p2.length <= 1) {
    return jaroWinkler(n1, n2) >= threshold;
  }
  return false;
}
function detectDuplicates(players, statsCounts) {
  const pairs = [];
  const mergedIds = /* @__PURE__ */ new Set();
  for (let i = 0; i < players.length; i++) {
    const a = players[i];
    if (mergedIds.has(a.id)) continue;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j];
      if (mergedIds.has(b.id)) continue;
      const aName = a.full_name || "";
      const bName = b.full_name || "";
      if (!aName || !bName) continue;
      if (!namesMatch(aName, bName)) continue;
      const aFullWords = aName.split(" ").filter((p) => p.length > 1).length;
      const bFullWords = bName.split(" ").filter((p) => p.length > 1).length;
      const aStats = statsCounts.get(a.id) || 0;
      const bStats = statsCounts.get(b.id) || 0;
      let aIsCanonical;
      if (aFullWords !== bFullWords) {
        aIsCanonical = aFullWords > bFullWords;
      } else if (aStats !== bStats) {
        aIsCanonical = aStats > bStats;
      } else {
        aIsCanonical = aName.length >= bName.length;
      }
      const canonical = aIsCanonical ? a : b;
      const duplicate = aIsCanonical ? b : a;
      mergedIds.add(duplicate.id);
      pairs.push({
        canonicalId: canonical.id,
        canonicalName: canonical.full_name || "",
        canonicalSlug: canonical.slug,
        duplicateId: duplicate.id,
        duplicateName: duplicate.full_name || "",
        duplicateSlug: duplicate.slug,
        statsToRepoint: statsCounts.get(duplicate.id) || 0
      });
    }
  }
  return pairs;
}

// server/routes.ts
import multer from "multer";
import OpenAI from "openai";
import * as fs from "fs";
import * as path from "path";
var _openai = null;
function getOpenAI() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}
function generatePlayerSlug(name) {
  return name.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 2) return [];
  const parseRow = (line) => {
    const fields = [];
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
  const rows = [];
  for (let r = 1; r < nonEmpty.length; r++) {
    const values = parseRow(nonEmpty[r]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}
var upload = multer({ storage: multer.memoryStorage() });
async function authenticateSupabaseUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
async function verifyLeagueOwnership(userId, leagueId) {
  const { data, error } = await supabaseAdmin.from("competitions").select("user_id, created_by").eq("league_id", leagueId).single();
  if (error || !data) return false;
  return data.user_id === userId || data.created_by === userId;
}
var RENDER_BACKEND_URL = (process.env.VITE_BACKEND_URL || "").replace(/\/$/, "");
function proxyToRender(req, res, urlPath) {
  if (!RENDER_BACKEND_URL) {
    res.status(503).json({ error: "VITE_BACKEND_URL is not configured on the server." });
    return;
  }
  const targetUrl = `${RENDER_BACKEND_URL}${urlPath}`;
  console.log(`[proxy] \u2192 ${req.method} ${targetUrl}`);
  const body = JSON.stringify(req.body);
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    res.status(500).json({ error: `Invalid VITE_BACKEND_URL: ${RENDER_BACKEND_URL}` });
    return;
  }
  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === "https:" ? "443" : "80"),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    timeout: 55e3
  };
  const transport = parsed.protocol === "https:" ? https : http;
  const proxyReq = transport.request(options, (proxyRes) => {
    let data = "";
    proxyRes.on("data", (chunk) => {
      data += chunk.toString();
    });
    proxyRes.on("end", () => {
      const ct = proxyRes.headers["content-type"] || "";
      console.log(`[proxy] \u2190 ${proxyRes.statusCode} content-type="${ct}" body-start="${data.slice(0, 100)}"`);
      if (ct.includes("text/html")) {
        res.status(502).json({ error: `Backend returned HTML (${proxyRes.statusCode}) \u2014 may be sleeping. URL: ${targetUrl}` });
      } else {
        res.status(proxyRes.statusCode || 500).set("Content-Type", "application/json").send(data);
      }
    });
  });
  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    res.status(504).json({ error: "Python backend timed out after 55 seconds." });
  });
  proxyReq.on("error", (err) => {
    console.error(`[proxy] error:`, err.message);
    res.status(502).json({ error: `Upstream error: ${err.message}` });
  });
  proxyReq.write(body);
  proxyReq.end();
}
async function registerRoutes(app2) {
  app2.get("/api/test", (req, res) => {
    res.json({ message: "API routes are working!", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app2.post("/api/parse", (req, res) => proxyToRender(req, res, "/api/parse"));
  app2.post("/api/chat/league", async (req, res) => {
    try {
      const { question, league_id, league_data } = req.body;
      if (!question) return res.status(400).json({ error: "question is required" });
      let systemPrompt;
      let userMessage;
      if (league_data) {
        systemPrompt = [
          "You are an expert basketball league analyst for a professional league app, similar to the NBA app's Ask NBA feature.",
          "",
          "IMPORTANT: The data you receive may include a FOCUS: directive and labelled sections (TEAM OVERVIEW, ROSTER, etc.).",
          "Always follow the FOCUS directive. If it says to describe a team's overall performance, lead with TEAM-LEVEL stats \u2014",
          "do NOT make individual players the main subject. The ROSTER section is supplementary context only.",
          "",
          "RESPONSE FORMAT \u2014 follow this structure exactly:",
          "1. Open with ONE context sentence naming the subject (team or player) and what you are summarising.",
          "2. Use a bullet list for the key stats \u2014 bold the team/player name at the top, then stat lines beneath.",
          "   For team queries: summarise record, PPG, RPG, APG, FG% as bullet points. Mention top players briefly at the end.",
          "   For player queries: summarise PPG, RPG, APG, shooting splits as bullet points.",
          "3. Close with 1-2 sentences of insight \u2014 e.g. what makes this team/player stand out, a trend, a strength.",
          "4. Keep total response under 220 words. Be punchy and specific \u2014 no fluff.",
          "",
          "RULES:",
          "- Only use stats from the data provided. Never invent numbers.",
          "- Bold all player and team names.",
          "- Use plain English, not overly formal language.",
          "- Never start with 'As of this season' \u2014 vary your opening.",
          "",
          "At the very end of your response (after the insight), append exactly this line:",
          "SUGGESTIONS: <question 1> | <question 2> | <question 3>",
          "These should be 3 natural follow-up questions a fan would ask, specific to the players/teams you mentioned.",
          "",
          `CURRENT LEAGUE DATA:
${league_data}`
        ].join("\n");
        userMessage = question;
      } else {
        systemPrompt = "You are an expert basketball league analyst. Help with performance analysis, player statistics, team strategies, and league insights. Be concise and data-driven. Bold all player and team names. At the very end append: SUGGESTIONS: <q1> | <q2> | <q3>";
        userMessage = `Question about league ${league_id}: ${question}`;
      }
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        max_tokens: 700,
        temperature: 0.2
      });
      const rawAnswer = completion.choices[0].message.content ?? "";
      let answer = rawAnswer;
      let suggestions = [];
      if (rawAnswer.includes("SUGGESTIONS:")) {
        const parts = rawAnswer.split("SUGGESTIONS:");
        answer = parts[0].trim();
        suggestions = parts[1].split("|").map((s) => s.trim()).filter(Boolean).slice(0, 3);
      }
      if (!suggestions.length) {
        suggestions = ["Who are the top scorers?", "Show me recent game results", "Who is the most efficient player?"];
      }
      res.json({ response: answer, suggestions, status: "success" });
    } catch (err) {
      console.error("League chat error:", err.message);
      res.status(500).json({ error: err.message, status: "error" });
    }
  });
  app2.post("/api/team-logos/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getTeamLogoUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting team logo upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });
  app2.post("/api/team-logos", async (req, res) => {
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
      const { data: logoData, error: logoError } = await supabaseAdmin.from("team_logos").upsert({
        league_id: leagueId,
        team_name: teamName,
        logo_url: logoPath,
        uploaded_by: "system",
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, {
        onConflict: "league_id,team_name"
      }).select().single();
      if (logoError) {
        const isTableMissing = logoError.code === "42P01";
        if (!isTableMissing) {
          console.error("Database error:", logoError);
          return res.status(500).json({ error: "Failed to save team logo" });
        }
        console.warn("team_logos table does not exist, skipping DB persist");
      }
      if (logoData) {
        const { error: teamError } = await supabaseAdmin.from("teams").upsert({
          league_id: leagueId,
          name: teamName,
          logo_id: logoData.id,
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        }, {
          onConflict: "league_id,name"
        });
        if (teamError) {
          console.error("Error updating team with logo_id:", teamError);
        }
      }
      res.json({
        success: true,
        logoPath,
        teamLogo: logoData
      });
    } catch (error) {
      console.error("Error saving team logo:", error);
      res.status(500).json({ error: "Failed to save team logo" });
    }
  });
  app2.get("/team-logos/:logoPath(*)", async (req, res) => {
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
  app2.post("/api/team-logos/upload-direct", upload.single("file"), async (req, res) => {
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
      const { data, error } = await supabaseAdmin.storage.from("team-logos").upload(fileName, file.buffer, {
        upsert: true,
        contentType: file.mimetype
      });
      if (error) {
        console.error("Storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from("team-logos").getPublicUrl(fileName);
      console.log("Upload successful, public URL:", publicUrl);
      const { error: dbError } = await supabaseAdmin.from("teams").update({ logo_url: publicUrl }).eq("league_id", leagueId).eq("name", teamName);
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
  app2.delete("/api/team-logos/delete", async (req, res) => {
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
      const baseFileName = `${leagueId}_${teamName.replace(/\s+/g, "_")}`;
      const extensions = ["png", "jpg", "jpeg", "gif", "webp"];
      let deletedFiles = [];
      let errors = [];
      for (const ext of extensions) {
        const fileName = `${baseFileName}.${ext}`;
        const { error } = await supabaseAdmin.storage.from("team-logos").remove([fileName]);
        if (error) {
          console.log(`Could not delete ${fileName}:`, error.message);
          errors.push(`${fileName}: ${error.message}`);
        } else {
          console.log(`Deleted ${fileName}`);
          deletedFiles.push(fileName);
        }
      }
      const { error: dbError } = await supabaseAdmin.from("teams").update({ logo_url: null }).eq("league_id", leagueId).eq("name", teamName);
      if (dbError) {
        console.error("Error clearing teams.logo_url:", dbError);
      }
      res.json({
        success: true,
        deletedFiles,
        errors: errors.length > 0 ? errors : void 0
      });
    } catch (error) {
      console.error("Delete logo error:", error);
      res.status(500).json({ error: "Failed to delete logo" });
    }
  });
  app2.get("/api/leagues/:leagueId/team-logos", async (req, res) => {
    try {
      const { leagueId } = req.params;
      const { data: playerStats, error: teamsError } = await supabaseAdmin.from("player_stats").select("team_name").eq("league_id", leagueId);
      if (teamsError) {
        console.error("Error fetching teams:", teamsError);
        return res.status(500).json({ error: "Failed to fetch teams" });
      }
      const teams = Array.from(new Set(
        playerStats?.map((stat) => stat.team_name).filter(Boolean) || []
      ));
      const teamLogos = {};
      for (const teamName of teams) {
        try {
          const extensions = ["png", "jpg", "jpeg", "gif", "webp"];
          let found = false;
          for (const ext of extensions) {
            const fileName = `${leagueId}_${teamName.replace(/\s+/g, "_")}.${ext}`;
            const { data } = supabaseAdmin.storage.from("team-logos").getPublicUrl(fileName);
            try {
              const response = await fetch(data.publicUrl, { method: "HEAD" });
              if (response.ok) {
                teamLogos[teamName] = data.publicUrl;
                found = true;
                break;
              }
            } catch (error) {
            }
          }
        } catch (error) {
        }
      }
      res.json(teamLogos);
    } catch (error) {
      console.error("Error fetching team logos API:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/league-logos/upload", upload.single("file"), async (req, res) => {
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
      const fileExt = file.originalname.split(".").pop();
      const fileName = `${leagueId}_${Date.now()}.${fileExt}`;
      const { data, error } = await supabaseAdmin.storage.from("league-banners").upload(`logos/${fileName}`, file.buffer, {
        upsert: true,
        contentType: file.mimetype
      });
      if (error) {
        console.error("Logo storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from("league-banners").getPublicUrl(`logos/${fileName}`);
      const { error: updateError } = await supabaseAdmin.from("competitions").update({ logo_url: publicUrl }).eq("league_id", leagueId);
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
  app2.post("/api/league-banners/upload", upload.single("file"), async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const file = req.file;
      const { leagueId, type } = req.body;
      const isLogo = type === "logo";
      if (!file || !leagueId) {
        return res.status(400).json({ error: "Missing required fields: file and leagueId" });
      }
      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) {
        return res.status(403).json({ error: "Only league owners can upload assets" });
      }
      const fileExt = file.originalname.split(".").pop();
      const fileName = isLogo ? `logos/${leagueId}_${Date.now()}.${fileExt}` : `${leagueId}_${Date.now()}.${fileExt}`;
      const { error } = await supabaseAdmin.storage.from("league-banners").upload(fileName, file.buffer, {
        upsert: true,
        contentType: file.mimetype
      });
      if (error) {
        console.error("Asset storage upload error:", error);
        return res.status(500).json({ error: error.message });
      }
      const { data: { publicUrl } } = supabaseAdmin.storage.from("league-banners").getPublicUrl(fileName);
      const updateField = isLogo ? { logo_url: publicUrl } : { banner_url: publicUrl };
      const { error: updateError } = await supabaseAdmin.from("competitions").update(updateField).eq("league_id", leagueId);
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
  app2.get("/api/league/:leagueId/competitions", async (req, res) => {
    try {
      const { leagueId } = req.params;
      if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
      const { data, error } = await supabaseAdmin.from("competitions").select("name, slug, season, gender").eq("competition_id", leagueId).order("season", { ascending: false });
      if (error) {
        console.error("league competitions error:", error);
        return res.status(500).json({ error: "Failed to fetch competitions" });
      }
      res.json(data || []);
    } catch (err) {
      console.error("Error fetching league competitions:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/public/league-branding/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      if (!slug) return res.status(400).json({ error: "slug is required" });
      const { data, error } = await supabaseAdmin.from("competitions").select("league_id, name, slug, brand_primary_colour, banner_url, logo_url").eq("slug", slug).single();
      if (error || !data) {
        console.error("league-branding error:", JSON.stringify(error), "slug:", slug);
        return res.status(404).json({ error: "League not found" });
      }
      const responseData = {
        ...data,
        primary_color: data.brand_primary_colour
      };
      res.json(responseData);
    } catch (err) {
      console.error("Error fetching public league branding:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/public/league-branding-by-id/:leagueId", async (req, res) => {
    try {
      const { leagueId } = req.params;
      if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
      const { data, error } = await supabaseAdmin.from("competitions").select("league_id, name, slug, brand_primary_colour, banner_url, logo_url").eq("league_id", leagueId).single();
      if (error || !data) {
        console.error("league-branding-by-id error:", JSON.stringify(error), "leagueId:", leagueId);
        return res.status(404).json({ error: "League not found" });
      }
      const responseData = {
        ...data,
        primary_color: data.brand_primary_colour
      };
      res.json(responseData);
    } catch (err) {
      console.error("Error fetching public league branding by id:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/public/league-children/:parentId", async (req, res) => {
    try {
      const { parentId } = req.params;
      if (!parentId) return res.status(400).json({ error: "parentId is required" });
      const { data, error } = await supabaseAdmin.from("competitions").select("league_id, name, slug, logo_url, age_group, stop").eq("parent_league_id", parentId);
      if (error) {
        console.error("Error fetching league children:", error);
        return res.status(500).json({ error: "Failed to fetch league children" });
      }
      res.json({ children: data || [] });
    } catch (err) {
      console.error("Error fetching league children:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
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
    "pts_percent_ft"
  ].join(", ");
  const ALLOWED_LEAGUE_DATA_COLUMNS = {
    teams: "team_id, name, league_id",
    team_stats: TEAM_STATS_COLS,
    players: "id, full_name, slug, league_id"
  };
  async function filterLeagueIdsForPublicScope(ids) {
    if (ids.length === 0) return [];
    const { data, error } = await supabaseAdmin.from("competitions").select("league_id, is_public, parent_league_id").in("league_id", ids);
    if (error || !data) {
      console.error("filterLeagueIdsForPublicScope: leagues lookup failed:", error?.message);
      return [];
    }
    const directlyAllowed = /* @__PURE__ */ new Set();
    const parentIdsToCheck = /* @__PURE__ */ new Set();
    const idToParent = /* @__PURE__ */ new Map();
    for (const row of data) {
      if (row.is_public) {
        directlyAllowed.add(row.league_id);
      } else if (row.parent_league_id) {
        parentIdsToCheck.add(row.parent_league_id);
        idToParent.set(row.league_id, row.parent_league_id);
      }
    }
    const publicParents = /* @__PURE__ */ new Set();
    if (parentIdsToCheck.size > 0) {
      const { data: parents, error: parentErr } = await supabaseAdmin.from("competitions").select("league_id, is_public").in("league_id", Array.from(parentIdsToCheck));
      if (parentErr) {
        console.error("filterLeagueIdsForPublicScope: parent lookup failed:", parentErr.message);
      } else if (parents) {
        for (const p of parents) {
          if (p.is_public) publicParents.add(p.league_id);
        }
      }
    }
    const allowed = new Set(directlyAllowed);
    for (const [childId, parentId] of idToParent.entries()) {
      if (parentId && publicParents.has(parentId)) allowed.add(childId);
    }
    return ids.filter((id) => allowed.has(id));
  }
  app2.post("/api/public/team-logos", async (req, res) => {
    try {
      const { leagueIds } = req.body || {};
      if (!Array.isArray(leagueIds) || leagueIds.length === 0) {
        return res.json({ rows: [] });
      }
      const ids = leagueIds.filter((v) => typeof v === "string" && v.length > 0);
      if (ids.length === 0) return res.json({ rows: [] });
      const { data, error } = await supabaseAdmin.from("team_logos").select("team_name, logo_url, league_id").in("league_id", ids);
      if (error) {
        return res.json({ rows: [] });
      }
      return res.json({ rows: data || [] });
    } catch {
      return res.json({ rows: [] });
    }
  });
  app2.post("/api/public/league-data", async (req, res) => {
    try {
      const { table, leagueIds, parentLeagueId } = req.body || {};
      if (typeof table !== "string" || !(table in ALLOWED_LEAGUE_DATA_COLUMNS)) {
        return res.status(400).json({ error: "Invalid or unsupported table" });
      }
      if (!Array.isArray(leagueIds) || leagueIds.length === 0) {
        return res.status(400).json({ error: "leagueIds must be a non-empty array" });
      }
      const ids = leagueIds.filter((v) => typeof v === "string" && v.length > 0);
      if (ids.length === 0) {
        return res.status(400).json({ error: "leagueIds must contain at least one valid id" });
      }
      let allowedIds;
      if (parentLeagueId && typeof parentLeagueId === "string") {
        const { data: childRows } = await supabaseAdmin.from("competitions").select("league_id").in("league_id", ids).eq("parent_league_id", parentLeagueId);
        const validatedIds = new Set((childRows || []).map((r) => r.league_id));
        const { data: parentRow } = await supabaseAdmin.from("competitions").select("league_id").eq("league_id", parentLeagueId).single();
        if (parentRow) validatedIds.add(parentLeagueId);
        allowedIds = ids.filter((id) => validatedIds.has(id));
      } else {
        allowedIds = await filterLeagueIdsForPublicScope(ids);
      }
      if (allowedIds.length === 0) {
        return res.json({ rows: [] });
      }
      const cols = ALLOWED_LEAGUE_DATA_COLUMNS[table];
      const { data, error } = await supabaseAdmin.from(table).select(cols).in("league_id", allowedIds);
      if (error) {
        console.error(`Error fetching league-data for ${table}:`, error);
        return res.status(500).json({ error: "Failed to fetch league data" });
      }
      res.json({ rows: data || [] });
    } catch (err) {
      console.error("Error in /api/public/league-data:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/public/player-stats", async (req, res) => {
    try {
      const { leagueIds, page = 0, pageSize = 500, parentLeagueId } = req.body;
      if (!Array.isArray(leagueIds) || leagueIds.length === 0) {
        return res.status(400).json({ error: "leagueIds must be a non-empty array" });
      }
      const safePage = Math.max(0, Math.floor(Number(page) || 0));
      const safePageSize = Math.min(1e3, Math.max(1, Math.floor(Number(pageSize) || 500)));
      let allowedIds;
      if (parentLeagueId && typeof parentLeagueId === "string") {
        const { data: childRows } = await supabaseAdmin.from("competitions").select("league_id").in("league_id", leagueIds).eq("parent_league_id", parentLeagueId);
        const validatedChildIds = new Set((childRows || []).map((r) => r.league_id));
        const { data: parentRow } = await supabaseAdmin.from("competitions").select("league_id").eq("league_id", parentLeagueId).single();
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
      const { data, error } = await supabaseAdmin.from("player_stats").select("*").in("league_id", allowedIds).order("player_id", { ascending: true, nullsFirst: false }).range(from, to);
      if (error) {
        console.error("Error in /api/public/player-stats:", error.message);
        return res.status(500).json({ error: "Failed to fetch player stats" });
      }
      res.json({ rows: data || [] });
    } catch (err) {
      console.error("Error in /api/public/player-stats:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.post("/api/public/league-info", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({});
      }
      const unique = Array.from(new Set(ids)).slice(0, 100);
      const { data, error } = await supabaseAdmin.from("competitions").select("league_id, name, parent_league_id, age_group, stop").in("league_id", unique);
      if (error) {
        console.error("Error in /api/public/league-info:", error.message);
        return res.status(500).json({ error: "Internal server error" });
      }
      const result = {};
      for (const row of data || []) {
        result[row.league_id] = {
          name: row.name,
          parent_league_id: row.parent_league_id || null,
          age_group: row.age_group || null,
          stop: row.stop ?? null
        };
      }
      res.json(result);
    } catch (err) {
      console.error("Error in /api/public/league-info:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/public/league-logo/:leagueId", async (req, res) => {
    try {
      const { leagueId } = req.params;
      if (!leagueId) return res.status(400).json({ error: "leagueId is required" });
      const { data, error } = await supabaseAdmin.from("competitions").select("logo_url, parent_league_id, brand_primary_colour, is_public").eq("league_id", leagueId).single();
      if (error || !data) {
        return res.status(404).json({ error: "League not found" });
      }
      if (data.logo_url) {
        return res.json({
          logo_url: data.logo_url,
          brand_primary_colour: data.brand_primary_colour || null
        });
      }
      if (data.parent_league_id) {
        const { data: parentData } = await supabaseAdmin.from("competitions").select("logo_url, brand_primary_colour").eq("league_id", data.parent_league_id).single();
        return res.json({
          logo_url: parentData?.logo_url || null,
          brand_primary_colour: data.brand_primary_colour || parentData?.brand_primary_colour || null
        });
      }
      res.json({ logo_url: null, brand_primary_colour: data.brand_primary_colour || null });
    } catch (err) {
      console.error("Error fetching public league logo:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  const PLAYER_ON_OFF_TTL_MS = 60 * 60 * 1e3;
  const PLAYER_ON_OFF_DISK_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
  const byIdCache = /* @__PURE__ */ new Map();
  const byNamesCache = /* @__PURE__ */ new Map();
  const ON_OFF_CACHE_DIR = path.join(process.cwd(), ".cache", "player_on_off");
  try {
    fs.mkdirSync(ON_OFF_CACHE_DIR, { recursive: true });
  } catch {
  }
  function diskPathFor(playerId) {
    return path.join(ON_OFF_CACHE_DIR, `${playerId}.json`);
  }
  function readDiskCache(playerId) {
    try {
      const fp = diskPathFor(playerId);
      if (!fs.existsSync(fp)) return null;
      const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (!parsed || !Array.isArray(parsed.rows)) return null;
      return { at: Number(parsed.at) || 0, rows: parsed.rows };
    } catch (err) {
      console.warn("player_on_off disk read failed for", playerId, err?.message);
      return null;
    }
  }
  function writeDiskCache(playerId, entry) {
    try {
      fs.writeFileSync(diskPathFor(playerId), JSON.stringify(entry));
    } catch (err) {
      console.warn("player_on_off disk write failed for", playerId, err?.message);
    }
  }
  async function fetchByIdOnce(playerId) {
    const { data, error } = await supabaseAdmin.from("player_on_off").select("*").eq("player_id", playerId);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data || [];
  }
  async function fetchByNamesOnce(names) {
    if (names.length === 0) return [];
    const { data, error } = await supabaseAdmin.from("player_on_off").select("*").in("player_name", names);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data || [];
  }
  async function withTimeoutRetry(fn) {
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (err?.code !== "57014") break;
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      }
    }
    throw lastErr;
  }
  function dedupeRows(rows) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const r of rows) {
      const key = `${r.player_id || ""}::${r.game_key || ""}::${r.player_name || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }
  function evictOldest(map, max) {
    if (map.size <= max) return;
    const oldestKey = map.keys().next().value;
    if (oldestKey) map.delete(oldestKey);
  }
  app2.get("/api/player-on-off/:playerId", async (req, res) => {
    const playerId = req.params.playerId;
    if (!/^[0-9a-f-]{36}$/i.test(playerId)) {
      return res.status(400).json({ error: "Invalid playerId" });
    }
    const now = Date.now();
    const namesParam = req.query.names;
    let names = [];
    if (typeof namesParam === "string" && namesParam.length > 0) {
      names = namesParam.split("|").map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 100);
      names = Array.from(new Set(names)).slice(0, 10);
    }
    const namesKey = names.length ? names.map((n) => n.toLowerCase()).sort().join("|") : "";
    let idCached = byIdCache.get(playerId);
    if (!idCached) {
      const fromDisk = readDiskCache(playerId);
      if (fromDisk) {
        byIdCache.set(playerId, fromDisk);
        idCached = fromDisk;
      }
    }
    const namesCached = namesKey ? byNamesCache.get(namesKey) : void 0;
    const idFresh = idCached && now - idCached.at < PLAYER_ON_OFF_TTL_MS;
    const namesFresh = !namesKey || namesCached && now - namesCached.at < PLAYER_ON_OFF_TTL_MS;
    if (idFresh && namesFresh) {
      const merged2 = dedupeRows([
        ...idCached?.rows || [],
        ...namesCached?.rows || []
      ]);
      return res.json({ rows: merged2, cached: true });
    }
    const idPromise = idFresh ? Promise.resolve({ ok: true, rows: idCached.rows, fromCache: true }) : withTimeoutRetry(() => fetchByIdOnce(playerId)).then(
      (rows) => ({ ok: true, rows, fromCache: false }),
      (err) => ({ ok: false, err })
    );
    const namesPromise = namesFresh ? Promise.resolve({ ok: true, rows: namesCached?.rows || [], fromCache: true }) : withTimeoutRetry(() => fetchByNamesOnce(names)).then(
      (rows) => ({ ok: true, rows, fromCache: false }),
      (err) => ({ ok: false, err })
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
      evictOldest(byNamesCache, 1e3);
    }
    const idCacheUsable = !!(idCached && now - idCached.at < PLAYER_ON_OFF_DISK_TTL_MS);
    const namesCacheUsable = !!(namesCached && now - namesCached.at < PLAYER_ON_OFF_DISK_TTL_MS);
    const idRows = idResult.ok ? idResult.rows : idCacheUsable ? idCached.rows : [];
    const nameRows = namesResult.ok ? namesResult.rows : namesCacheUsable ? namesCached.rows : [];
    const merged = dedupeRows([...idRows, ...nameRows]);
    const idLost = !idResult.ok && !idCacheUsable;
    const namesLost = namesKey !== "" && !namesResult.ok && !namesCacheUsable;
    if (merged.length === 0 && (idLost || namesLost)) {
      const errCode = (!idResult.ok ? idResult.err?.code : void 0) ?? (!namesResult.ok ? namesResult.err?.code : void 0);
      console.error("player_on_off endpoint unavailable for", playerId, errCode);
      return res.json({ rows: [], unavailable: true, code: errCode });
    }
    const partial = !idResult.ok || namesKey !== "" && !namesResult.ok;
    const stale = !idResult.ok && idRows.length > 0 || namesKey !== "" && !namesResult.ok && nameRows.length > 0;
    res.json({
      rows: merged,
      cached: stale,
      ...partial ? { partial: true } : {},
      ...stale ? { stale: true } : {}
    });
  });
  async function getScopedLeagueIds(leagueId) {
    const { data } = await supabaseAdmin.from("competitions").select("league_id").eq("parent_league_id", leagueId);
    const childIds = (data || []).map((r) => r.league_id);
    return [leagueId, ...childIds];
  }
  app2.get("/api/leagues/:leagueId/players", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const { leagueId } = req.params;
      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) return res.status(403).json({ error: "Only league owners can access this" });
      const allIds = await getScopedLeagueIds(leagueId);
      const { data, error } = await supabaseAdmin.from("players").select("id, full_name, slug, league_id").in("league_id", allIds).order("full_name");
      if (error) return res.status(500).json({ error: error.message });
      res.json({ players: data || [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.get("/api/leagues/:leagueId/duplicate-players", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const { leagueId } = req.params;
      const isOwner = await verifyLeagueOwnership(userId, leagueId);
      if (!isOwner) return res.status(403).json({ error: "Only league owners can access this" });
      const allIds = await getScopedLeagueIds(leagueId);
      const PAGE = 1e3;
      const players = [];
      let offset = 0;
      while (true) {
        const { data, error } = await supabaseAdmin.from("players").select("id, full_name, league_id, slug").in("league_id", allIds).range(offset, offset + PAGE - 1);
        if (error) return res.status(500).json({ error: error.message });
        if (!data || data.length === 0) break;
        players.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      if (players.length === 0) return res.json({ pairs: [] });
      const statsCounts = /* @__PURE__ */ new Map();
      const CHUNK = 200;
      for (let i = 0; i < players.length; i += CHUNK) {
        const chunk = players.slice(i, i + CHUNK).map((p) => p.id);
        const { data, error: statsError } = await supabaseAdmin.from("player_stats").select("player_id").in("player_id", chunk);
        if (statsError) {
          console.error("Error fetching stats counts for duplicate detection:", statsError.message);
        }
        for (const row of data || []) {
          statsCounts.set(row.player_id, (statsCounts.get(row.player_id) || 0) + 1);
        }
      }
      const pairs = detectDuplicates(players, statsCounts);
      res.json({ pairs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.post("/api/leagues/:leagueId/merge-players", async (req, res) => {
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
      const { data: playerCheck, error: checkError } = await supabaseAdmin.from("players").select("id, league_id, full_name").in("id", [canonicalId, duplicateId]);
      if (checkError) return res.status(500).json({ error: checkError.message });
      if (!playerCheck || playerCheck.length !== 2) {
        return res.status(404).json({ error: "One or both players not found" });
      }
      const canonical = playerCheck.find((p) => p.id === canonicalId);
      const duplicate = playerCheck.find((p) => p.id === duplicateId);
      if (!canonical || !duplicate) {
        return res.status(404).json({ error: "One or both players not found" });
      }
      const allIds = await getScopedLeagueIds(leagueId);
      const allIdSet = new Set(allIds);
      if (!allIdSet.has(canonical.league_id) || !allIdSet.has(duplicate.league_id)) {
        return res.status(403).json({ error: "Players must belong to this league or one of its sub-leagues" });
      }
      const { error: updateError } = await supabaseAdmin.from("player_stats").update({ player_id: canonicalId }).eq("player_id", duplicateId);
      if (updateError) return res.status(500).json({ error: `Failed to update stats: ${updateError.message}` });
      const { error: deleteError } = await supabaseAdmin.from("players").delete().eq("id", duplicateId);
      if (deleteError) {
        const { error: rollbackError } = await supabaseAdmin.from("player_stats").update({ player_id: duplicateId }).eq("player_id", canonicalId);
        if (rollbackError) {
          console.error("Merge rollback failed \u2014 stats may be in partial state:", rollbackError.message);
        }
        return res.status(500).json({ error: `Merge failed and was rolled back: ${deleteError.message}` });
      }
      res.json({
        success: true,
        canonicalName: canonical.full_name || "",
        duplicateName: duplicate.full_name || ""
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  function buildArticleSlug(title) {
    return (title || "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  }
  async function resolveUniqueSlug(base, excludeId) {
    if (!base) base = "article";
    let slug = base;
    let suffix = 2;
    while (true) {
      let q = supabaseAdmin.from("news_articles").select("id").eq("slug", slug);
      if (excludeId) q = q.neq("id", excludeId);
      const { data } = await q;
      if (!data || data.length === 0) break;
      slug = `${base}-${suffix++}`;
    }
    return slug;
  }
  (async () => {
    try {
      const { data, error } = await supabaseAdmin.from("news_articles").select("id, title").is("slug", null);
      if (error) {
        if (error.code !== "42703") console.warn("Slug backfill: column may not exist yet \u2014", error.message);
        return;
      }
      if (!data || data.length === 0) return;
      const { data: existing } = await supabaseAdmin.from("news_articles").select("slug").not("slug", "is", null);
      const taken = new Set((existing || []).map((r) => r.slug).filter(Boolean));
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
    } catch (err) {
      console.warn("[news] Slug backfill skipped:", err?.message);
    }
  })();
  app2.post("/api/news-articles", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const { title, slug: requestedSlug, summary, body, league, source_url, image_url, is_published } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: "title is required" });
      const base = requestedSlug?.trim() || buildArticleSlug(title.trim());
      const slug = await resolveUniqueSlug(base);
      const { data, error } = await supabaseAdmin.from("news_articles").insert({
        title: title.trim(),
        slug,
        summary: summary?.trim() || null,
        body: body?.trim() || null,
        league: league?.trim() || null,
        source_url: source_url?.trim() || null,
        image_url: image_url || null,
        is_published: !!is_published
      }).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app2.patch("/api/news-articles/:id", async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
      const { id } = req.params;
      const { title, slug: requestedSlug, summary, body, league, source_url, image_url, is_published } = req.body;
      const base = requestedSlug?.trim() || (title ? buildArticleSlug(title.trim()) : void 0);
      const slug = base ? await resolveUniqueSlug(base, id) : void 0;
      const payload = {};
      if (title !== void 0) payload.title = title.trim();
      if (slug !== void 0) payload.slug = slug;
      if (summary !== void 0) payload.summary = summary?.trim() || null;
      if (body !== void 0) payload.body = body?.trim() || null;
      if (league !== void 0) payload.league = league?.trim() || null;
      if (source_url !== void 0) payload.source_url = source_url?.trim() || null;
      if (image_url !== void 0) payload.image_url = image_url || null;
      if (is_published !== void 0) payload.is_published = !!is_published;
      const { data, error } = await supabaseAdmin.from("news_articles").update(payload).eq("id", id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  const SITEMAP_TTL_MS = 60 * 60 * 1e3;
  const SITE_BASE = "https://www.swishassistant.com";
  let sitemapCache = null;
  function xmlEscape(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function sitemapUrl(loc, lastmod, changefreq, priority) {
    return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>
`;
  }
  async function buildSitemap() {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += sitemapUrl(`${SITE_BASE}/`, today, "daily", "1.0");
    xml += sitemapUrl(`${SITE_BASE}/news`, today, "daily", "0.9");
    for (const p of [
      { path: "/coaches-hub", freq: "weekly", pri: "0.8" },
      { path: "/teams", freq: "weekly", pri: "0.7" },
      { path: "/players", freq: "weekly", pri: "0.7" },
      { path: "/privacy", freq: "monthly", pri: "0.3" },
      { path: "/terms", freq: "monthly", pri: "0.3" },
      { path: "/cookies", freq: "monthly", pri: "0.3" }
    ]) {
      xml += sitemapUrl(`${SITE_BASE}${p.path}`, today, p.freq, p.pri);
    }
    try {
      const { data: articles } = await supabaseAdmin.from("news_articles").select("id, slug, published_at").eq("is_published", true).order("published_at", { ascending: false });
      for (const a of articles || []) {
        const articleSlug = a.slug || a.id;
        const lastmod = a.published_at ? new Date(a.published_at).toISOString().split("T")[0] : today;
        xml += sitemapUrl(`${SITE_BASE}/news/${xmlEscape(articleSlug)}`, lastmod, "weekly", "0.8");
      }
    } catch (err) {
      console.error("Sitemap: error fetching articles:", err.message);
    }
    try {
      const { data: leagues } = await supabaseAdmin.from("competitions").select("slug, updated_at").eq("is_public", true);
      for (const l of leagues || []) {
        const lastmod = l.updated_at ? new Date(l.updated_at).toISOString().split("T")[0] : today;
        xml += sitemapUrl(`${SITE_BASE}/competition/${xmlEscape(l.slug)}`, lastmod, "daily", "0.9");
        xml += sitemapUrl(`${SITE_BASE}/competition-leaders/${xmlEscape(l.slug)}`, lastmod, "daily", "0.8");
        xml += sitemapUrl(`${SITE_BASE}/competition/${xmlEscape(l.slug)}/teams`, lastmod, "weekly", "0.7");
      }
    } catch (err) {
      console.error("Sitemap: error fetching leagues:", err.message);
    }
    try {
      const { data: teams } = await supabaseAdmin.from("teams").select("name");
      const seenTeams = /* @__PURE__ */ new Set();
      for (const t of teams || []) {
        if (!t.name) continue;
        const encoded = encodeURIComponent(t.name.toLowerCase().replace(/\s+/g, "-"));
        if (seenTeams.has(encoded)) continue;
        seenTeams.add(encoded);
        xml += sitemapUrl(`${SITE_BASE}/team/${encoded}`, today, "weekly", "0.6");
      }
    } catch (err) {
      console.error("Sitemap: error fetching teams:", err.message);
    }
    try {
      const BATCH = 1e3;
      let offset = 0;
      while (true) {
        const { data: players } = await supabaseAdmin.from("players").select("slug").not("slug", "is", null).range(offset, offset + BATCH - 1);
        if (!players || players.length === 0) break;
        for (const p of players) {
          if (p.slug) {
            xml += sitemapUrl(`${SITE_BASE}/player/${xmlEscape(p.slug)}`, today, "weekly", "0.5");
          }
        }
        if (players.length < BATCH) break;
        offset += BATCH;
      }
    } catch (err) {
      console.error("Sitemap: error fetching players:", err.message);
    }
    xml += "</urlset>";
    return xml;
  }
  const TRENDING_TTL_MS = 5 * 60 * 1e3;
  let trendingCache = null;
  let trendingInFlight = null;
  async function fetchTrendingPerformances() {
    const empty = { perfs: [], leagueNames: {}, playerMeta: {} };
    const { data: leagueRows, error: lErr } = await supabaseAdmin.from("competitions").select("league_id, name, trending_position").eq("is_public", true).not("trending_position", "is", null).order("trending_position", { ascending: true, nullsFirst: false }).limit(8);
    if (lErr || !leagueRows || leagueRows.length === 0) {
      console.error("[TrendingPerf] leagues error", lErr?.message);
      return empty;
    }
    const filteredRows = leagueRows.filter((l) => !l.name?.toLowerCase().includes("reba"));
    if (filteredRows.length === 0) return empty;
    const leagueNames = {};
    for (const l of filteredRows) {
      if (l.name) leagueNames[l.league_id] = l.name;
    }
    const leagueIds = filteredRows.map((l) => l.league_id);
    console.log("[TrendingPerf] querying leagues:", leagueRows.map((l) => `${l.name} (pos ${l.trending_position})`));
    const perfs = [];
    const perLeague = await Promise.allSettled(
      leagueIds.map(async (lid) => {
        const name = leagueNames[lid] || lid;
        const { data: rows, error } = await supabaseAdmin.from("vw_weekly_player_scores").select("league_id,week_start,week_end,player_id,full_name,team_id,team_name,pts,reb,ast,stl,blk,tov,fga,fta,weekly_score").eq("league_id", lid).order("week_start", { ascending: false, nullsFirst: false }).order("weekly_score", { ascending: false }).limit(2).returns();
        if (error) {
          console.error("[TrendingPerf] league query error", name, error.message);
          return [];
        }
        console.log(`[TrendingPerf] ${name}: ${rows?.length ?? 0} rows (most recent week_start: ${rows?.[0]?.week_start ?? "none"})`);
        return (rows || []).slice(0, 2).map((r) => {
          const pts = r.pts ?? 0;
          const fga = r.fga ?? 0;
          const fta = r.fta ?? 0;
          const denom = 2 * (fga + 0.44 * fta);
          const ts_pct = denom > 0 ? pts / denom : null;
          return { ...r, ts_pct };
        });
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
      const aw = a.week_start || "";
      const bw = b.week_start || "";
      if (aw !== bw) return aw < bw ? 1 : -1;
      return (b.weekly_score ?? 0) - (a.weekly_score ?? 0);
    });
    const playerMeta = {};
    const playerIds = [...new Set(perfs.map((p) => p.player_id))];
    if (playerIds.length > 0) {
      const { data: metaRows, error: pErr } = await supabaseAdmin.from("players").select("id, slug, photo_path_bg_removed").in("id", playerIds);
      if (!pErr) {
        for (const p of metaRows || []) {
          playerMeta[p.id] = { slug: p.slug, photo_path_bg_removed: p.photo_path_bg_removed };
        }
      }
    }
    return { perfs, leagueNames, playerMeta };
  }
  function plNormalizeName(name) {
    return name.toLowerCase().trim().replace(/\s+/g, " ").replace(/[^a-z\s]/g, "");
  }
  function plNormalizeTeam(name) {
    if (!name) return "";
    return name.trim().replace(/\s+Senior\s+Men\s*/gi, " ").replace(/!/g, "").replace(/\s+I(?![IVX])\s*$/i, "").replace(/\s+/g, " ").trim();
  }
  function plJaro(s1, s2) {
    const l1 = s1.length, l2 = s2.length;
    if (!l1 && !l2) return 1;
    if (!l1 || !l2) return 0;
    const win = Math.floor(Math.max(l1, l2) / 2) - 1;
    const m1 = new Array(l1).fill(false), m2 = new Array(l2).fill(false);
    let matches = 0, t = 0;
    for (let i = 0; i < l1; i++) {
      const lo = Math.max(0, i - win), hi = Math.min(i + win + 1, l2);
      for (let j = lo; j < hi; j++) {
        if (m2[j] || s1[i] !== s2[j]) continue;
        m1[i] = m2[j] = true;
        matches++;
        break;
      }
    }
    if (!matches) return 0;
    let k = 0;
    for (let i = 0; i < l1; i++) {
      if (!m1[i]) continue;
      while (!m2[k]) k++;
      if (s1[i] !== s2[k]) t++;
      k++;
    }
    const jaro = (matches / l1 + matches / l2 + (matches - t / 2) / matches) / 3;
    let pLen = 0;
    for (let i = 0; i < Math.min(4, l1, l2); i++) {
      if (s1[i] === s2[i]) pLen++;
      else break;
    }
    return jaro + pLen * 0.1 * (1 - jaro);
  }
  function plNamesMatch(a, b) {
    const n1 = plNormalizeName(a), n2 = plNormalizeName(b);
    if (n1 === n2) return true;
    const p1 = n1.split(" ").filter(Boolean), p2 = n2.split(" ").filter(Boolean);
    if (p1.length === p2.length && p1.length >= 2) {
      const firstMatch = p1[0] === p2[0] || p1[0].length === 1 && p2[0].startsWith(p1[0]) || p2[0].length === 1 && p1[0].startsWith(p2[0]) || plJaro(p1[0], p2[0]) >= 0.82;
      if (firstMatch && plJaro(p1[p1.length - 1], p2[p2.length - 1]) >= 0.85) return true;
    }
    if (p1.length !== p2.length && p1.length >= 1 && p2.length >= 1) {
      const sh = p1.length < p2.length ? p1 : p2, lo = p1.length < p2.length ? p2 : p1;
      if (plJaro(sh[sh.length - 1], lo[lo.length - 1]) >= 0.85) {
        const sf = sh[0], lf = lo[0];
        if (sf.length === 1 && lf.startsWith(sf) || lf.length === 1 && sf.startsWith(lf)) return true;
        if (plJaro(sf, lf) >= 0.8) return true;
      }
    }
    return false;
  }
  const playerLeadersCache = /* @__PURE__ */ new Map();
  const PLAYER_LEADERS_TTL = 5 * 60 * 1e3;
  app2.get("/api/home/player-leaders/:leagueId", async (req, res) => {
    const { leagueId } = req.params;
    const now = Date.now();
    const cached = playerLeadersCache.get(leagueId);
    if (cached && now - cached.at < PLAYER_LEADERS_TTL) return res.json(cached.data);
    try {
      const allowed = await filterLeagueIdsForPublicScope([leagueId]);
      if (!allowed.includes(leagueId)) return res.status(403).json({ error: "Forbidden" });
      const { data: children } = await supabaseAdmin.from("competitions").select("league_id").eq("parent_league_id", leagueId);
      const childIds = (children || []).map((c) => c.league_id);
      const queryIds = childIds.length > 0 ? childIds : [leagueId];
      console.log(`[PlayerLeaders] ${leagueId}: querying ids=${JSON.stringify(queryIds)}`);
      const SELECT_COLS = "player_id, full_name, firstname, familyname, team_name, spoints, sreboundstotal, sassists, ssteals, sblocks, sturnovers, sfieldgoalsattempted, sfreethrowsattempted, sminutes";
      const PAGE_SIZE = 1e3;
      const allStats = [];
      let offset = 0;
      while (true) {
        const q = supabaseAdmin.from("player_stats").select(SELECT_COLS).range(offset, offset + PAGE_SIZE - 1);
        const { data: page, error: pageErr } = await (queryIds.length === 1 ? q.eq("league_id", queryIds[0]) : q.in("league_id", queryIds));
        if (pageErr) {
          console.error("[PlayerLeaders] page error", pageErr.message);
          return res.status(500).json({ error: pageErr.message });
        }
        if (!page || page.length === 0) break;
        allStats.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      if (allStats.length === 0) {
        return res.json({
          scoring: [],
          rebounding: [],
          assists: [],
          scoring_total: [],
          rebounding_total: [],
          assists_total: []
        });
      }
      console.log(`[PlayerLeaders] ${leagueId}: ${allStats.length} rows fetched`);
      const byPlayerId = /* @__PURE__ */ new Map();
      for (const stat of allStats) {
        if (!stat.player_id) continue;
        const name = (stat.full_name || `${stat.firstname || ""} ${stat.familyname || ""}`.trim() || "Unknown").trim();
        const team = stat.team_name || "";
        const hasAnyStats = (stat.spoints || 0) > 0 || (stat.sreboundstotal || 0) > 0 || (stat.sassists || 0) > 0 || (stat.ssteals || 0) > 0 || (stat.sblocks || 0) > 0 || (stat.sfieldgoalsattempted || 0) > 0 || (stat.sfreethrowsattempted || 0) > 0 || (stat.sturnovers || 0) > 0;
        const mins = stat.sminutes;
        let minutesPlayed = 0;
        if (typeof mins === "number") minutesPlayed = mins;
        else if (typeof mins === "string") {
          const parts = mins.split(":");
          minutesPlayed = parts.length === 2 ? parseInt(parts[0]) + parseInt(parts[1]) / 60 : parseFloat(mins) || 0;
        }
        if (!minutesPlayed && !hasAnyStats) continue;
        if (!byPlayerId.has(stat.player_id)) {
          byPlayerId.set(stat.player_id, {
            name,
            team,
            player_id: stat.player_id,
            games: 0,
            totalPoints: 0,
            totalRebounds: 0,
            totalAssists: 0
          });
        }
        const agg = byPlayerId.get(stat.player_id);
        agg.games += 1;
        agg.totalPoints += stat.spoints || 0;
        agg.totalRebounds += stat.sreboundstotal || 0;
        agg.totalAssists += stat.sassists || 0;
      }
      const mergedPlayers = [];
      const processedIds = /* @__PURE__ */ new Set();
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
            if (other.name.length > player.name.length) player.name = other.name;
            processedIds.add(otherId);
          }
        }
        processedIds.add(pid);
        mergedPlayers.push(player);
      }
      const playerIds = mergedPlayers.map((p) => p.player_id).slice(0, 1e3);
      const metaById = /* @__PURE__ */ new Map();
      if (playerIds.length > 0) {
        const { data: playerRows } = await supabaseAdmin.from("players").select("id, slug, photo_path_bg_removed").in("id", playerIds);
        (playerRows || []).forEach((p) => {
          metaById.set(p.id, { slug: p.slug ?? null, photo_path_bg_removed: p.photo_path_bg_removed ?? null });
        });
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
          ppg: Math.round(p.totalPoints / gp * 10) / 10,
          rpg: Math.round(p.totalRebounds / gp * 10) / 10,
          apg: Math.round(p.totalAssists / gp * 10) / 10
        };
      });
      const maxGamesAny = allRows.reduce((m, p) => Math.max(m, p.games || 0), 0);
      const minGames = maxGamesAny < 3 ? 1 : Math.max(3, Math.ceil(maxGamesAny * 0.4));
      const qualified = allRows.filter((p) => (p.games || 0) >= minGames);
      const avgPool = qualified.length > 0 ? qualified : allRows;
      console.log(`[PlayerLeaders] ${leagueId}: maxGames=${maxGamesAny} minGames=${minGames} qualified=${qualified.length}/${allRows.length}`);
      const result = {
        scoring: [...avgPool].sort((a, b) => b.ppg - a.ppg).slice(0, 5),
        rebounding: [...avgPool].sort((a, b) => b.rpg - a.rpg).slice(0, 5),
        assists: [...avgPool].sort((a, b) => b.apg - a.apg).slice(0, 5),
        scoring_total: [...allRows].sort((a, b) => b.total_pts - a.total_pts).slice(0, 5),
        rebounding_total: [...allRows].sort((a, b) => b.total_reb - a.total_reb).slice(0, 5),
        assists_total: [...allRows].sort((a, b) => b.total_ast - a.total_ast).slice(0, 5)
      };
      playerLeadersCache.set(leagueId, { data: result, at: Date.now() });
      return res.json(result);
    } catch (err) {
      console.error("[PlayerLeaders] error", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/game-switcher/:leagueId", async (req, res) => {
    const { leagueId } = req.params;
    const schema = req.query.schema === "test" ? "test" : "public";
    const db = schema === "test" ? supabaseAdmin.schema("test") : supabaseAdmin;
    const now = /* @__PURE__ */ new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysFromNow = new Date(now);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    try {
      const [liveResp, rangeResp] = await Promise.all([
        db.from("game_schedule").select("game_key, hometeam, awayteam, matchtime, status").eq("league_id", leagueId).or("status.ilike.%live%,status.eq.in_progress"),
        db.from("game_schedule").select("game_key, hometeam, awayteam, matchtime, status").eq("league_id", leagueId).gte("matchtime", sevenDaysAgo.toISOString()).lte("matchtime", sevenDaysFromNow.toISOString()).order("matchtime", { ascending: true })
      ]);
      const combined = [...liveResp.data || [], ...rangeResp.data || []];
      const unique = combined.filter((g, i, arr) => i === arr.findIndex((x) => x.game_key === g.game_key));
      let teamStats = [];
      let liveEvents = [];
      if (unique.length > 0) {
        const gameKeys = unique.map((g) => g.game_key);
        const [tsResp, leResp] = await Promise.all([
          db.from("team_stats").select("game_key, name, tot_spoints").in("game_key", gameKeys),
          db.from("live_events").select("game_key, period, clock, created_at").in("game_key", gameKeys).order("created_at", { ascending: false })
        ]);
        teamStats = tsResp.data || [];
        liveEvents = leResp.data || [];
      }
      return res.json({ games: unique, teamStats, liveEvents });
    } catch (err) {
      console.error("[GameSwitcher] error", err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  app2.get("/api/home/trending-performances", async (req, res) => {
    const now = Date.now();
    if (trendingCache && now - trendingCache.at < TRENDING_TTL_MS) {
      return res.json(trendingCache.data);
    }
    if (!trendingInFlight) {
      trendingInFlight = fetchTrendingPerformances().finally(() => {
        trendingInFlight = null;
      });
    }
    try {
      const data = await trendingInFlight;
      trendingCache = { data, at: Date.now() };
      return res.json(data);
    } catch (err) {
      console.error("[TrendingPerf] fetch error", err.message);
      if (trendingCache) return res.json(trendingCache.data);
      return res.json({ perfs: [], leagueNames: {}, playerMeta: {} });
    }
  });
  app2.post("/api/admin/import-players", upload.single("file"), async (req, res) => {
    try {
      const userId = await authenticateSupabaseUser(req);
      if (!userId) return res.status(401).json({ error: "Authentication required" });
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
      const { data: existingPlayers, error: playersError } = await supabaseAdmin.from("players").select("id, full_name, slug");
      if (playersError || !existingPlayers) {
        return res.status(500).json({ error: "Failed to fetch existing players" });
      }
      const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const playerByName = /* @__PURE__ */ new Map();
      for (const p of existingPlayers) {
        if (p.full_name) playerByName.set(normalize(p.full_name), { id: p.id, slug: p.slug });
      }
      const existingSlugs = new Set(existingPlayers.map((p) => p.slug).filter(Boolean));
      let updated = 0;
      let created = 0;
      let skipped = 0;
      const errors = [];
      for (const row of rows) {
        const rawName = (row["full_name"] || "").trim();
        if (!rawName) {
          skipped++;
          continue;
        }
        const previousTeamsRaw = (row["previous_teams"] || "").trim();
        const previousTeams = previousTeamsRaw ? previousTeamsRaw.split(";").map((t) => t.trim()).filter(Boolean) : null;
        const enrichmentOnly = {};
        if (row["current_team"] !== void 0 && row["current_team"] !== "")
          enrichmentOnly.current_team = row["current_team"].trim();
        if (previousTeams !== null && previousTeams.length > 0)
          enrichmentOnly.previous_teams = previousTeams;
        if (row["instagram_handle"] !== void 0 && row["instagram_handle"] !== "")
          enrichmentOnly.instagram_handle = row["instagram_handle"].replace(/^@/, "").trim();
        const insertExtras = {};
        if (row["position"] !== void 0 && row["position"] !== "")
          insertExtras.position = row["position"].trim();
        if (row["height_cm"] !== void 0 && row["height_cm"] !== "") {
          const h = parseFloat(row["height_cm"]);
          if (!isNaN(h)) insertExtras.height_cm = h;
        }
        if (row["date_of_birth"] !== void 0 && row["date_of_birth"] !== "")
          insertExtras.date_of_birth = row["date_of_birth"].trim();
        const normName = normalize(rawName);
        const existing = playerByName.get(normName);
        if (existing) {
          if (Object.keys(enrichmentOnly).length === 0) {
            skipped++;
            continue;
          }
          const { error: updateError } = await supabaseAdmin.from("players").update(enrichmentOnly).eq("id", existing.id);
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
          const newRow = {
            full_name: rawName,
            slug,
            ...enrichmentOnly,
            ...insertExtras
          };
          const { error: insertError } = await supabaseAdmin.from("players").insert(newRow);
          if (insertError) {
            errors.push(`Row "${rawName}" (new): ${insertError.message}`);
          } else {
            created++;
            playerByName.set(normName, { id: "", slug });
          }
        }
      }
      return res.json({ updated, created, skipped, errors });
    } catch (err) {
      console.error("[import-players] error:", err.message);
      return res.status(500).json({ error: err.message || "Internal server error" });
    }
  });
  app2.get("/sitemap.xml", async (req, res) => {
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
    } catch (err) {
      console.error("Sitemap generation error:", err.message);
      if (sitemapCache) {
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        return res.send(sitemapCache.xml);
      }
      res.status(500).send("Failed to generate sitemap");
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// api/_source.ts
import { config } from "dotenv";
config();
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "keyboard_cat";
var app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const p = req.path || "";
  const isWidget = p.startsWith("/widget/") || p === "/widget" || p === "/embed" || p.startsWith("/embed/");
  if (isWidget) {
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.removeHeader("X-Frame-Options");
  }
  next();
});
var initPromise = null;
function ensureInitialized() {
  if (!initPromise) {
    initPromise = (async () => {
      await registerRoutes(app);
      app.use((err, _req, res, _next) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        res.status(status).json({ message });
      });
    })();
  }
  return initPromise;
}
ensureInitialized().catch(console.error);
async function handler(req, res) {
  await ensureInitialized();
  return new Promise((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
    app(req, res);
  });
}
export {
  handler as default
};
