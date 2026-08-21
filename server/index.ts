import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { config } from "dotenv";

// Load environment variables
config();

// Validate required secrets at startup (fail loudly rather than silently)
if (!process.env.SESSION_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[startup] SESSION_SECRET environment variable is required in production. " +
      "Set it in your deployment environment."
    );
  } else {
    console.warn(
      "[startup] WARNING: SESSION_SECRET is not set. " +
      "A random value will be used for this session only — all sessions will be invalidated on restart. " +
      "Set SESSION_SECRET in your .env file."
    );
    // Use a per-process random value in dev rather than a predictable string
    process.env.SESSION_SECRET = require("crypto").randomBytes(32).toString("hex");
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Allow widget and embed-guide routes to be framed on any origin.
// We explicitly set frame-ancestors:* and ensure X-Frame-Options is not DENY,
// without affecting headers on the rest of the application.
app.use((req, res, next) => {
  const p = req.path || "";
  const isWidget = p.startsWith("/widget/") || p === "/widget" || p === "/embed" || p.startsWith("/embed/");
  if (isWidget) {
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.removeHeader("X-Frame-Options");
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
