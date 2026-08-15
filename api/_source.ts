import express, { type Request, Response, NextFunction } from "express";
import type { IncomingMessage, ServerResponse } from "http";
import { registerRoutes } from "../server/routes";
import { config } from "dotenv";

config();

process.env.SESSION_SECRET = process.env.SESSION_SECRET || "keyboard_cat";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const p = req.path || "";
  const isWidget =
    p.startsWith("/widget/") ||
    p === "/widget" ||
    p === "/embed" ||
    p.startsWith("/embed/");
  if (isWidget) {
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.removeHeader("X-Frame-Options");
  }
  next();
});

let initPromise: Promise<void> | null = null;

function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await registerRoutes(app);
      app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
        const status = err.status || err.statusCode || 500;
        const message = err.message || "Internal Server Error";
        res.status(status).json({ message });
      });
    })();
  }
  return initPromise;
}

ensureInitialized().catch(console.error);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ensureInitialized();
  return new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
    app(req as Request, res as unknown as Response);
  });
}
