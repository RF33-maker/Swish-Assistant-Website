/**
 * Returns the base URL for the Python backend.
 *
 * In production (Vercel), set VITE_BACKEND_URL to the Render public URL,
 * e.g. https://swish-backend.onrender.com
 *
 * In local development this falls back to window.location.origin so that
 * the existing Vite dev-server proxy routes (/api/parse, /api/ai-analysis,
 * /api/chat/league, /chat, /start, /health) continue to work transparently.
 *
 * No explicit port number is ever included in the returned URL.
 */
export function getPythonBackendUrl(): string {
  return (import.meta.env.VITE_BACKEND_URL || window.location.origin).replace(/\/$/, '');
}

export const pythonBackendUrl = getPythonBackendUrl();
