/**
 * Returns the base URL for the Python backend.
 *
 * Priority:
 * 1. VITE_BACKEND_URL env var (if set in Vercel dashboard or .env)
 * 2. If running on swishassistant.com (or any subdomain), use the known Render URL
 * 3. Otherwise (local dev, Replit preview) fall back to window.location.origin so
 *    the Vite dev-server proxy (/api/parse, /api/ai-analysis, /api/chat/league,
 *    /chat, /start, /health) continues to work transparently.
 *
 * No explicit port number is ever included in the returned URL.
 */
export function getPythonBackendUrl(): string {
  if (import.meta.env.VITE_BACKEND_URL) {
    return (import.meta.env.VITE_BACKEND_URL as string).replace(/\/$/, '');
  }

  const hostname = window.location.hostname;
  if (hostname === 'swishassistant.com' || hostname.endsWith('.swishassistant.com')) {
    return 'https://sab-backend.onrender.com';
  }

  return window.location.origin;
}

export const pythonBackendUrl = getPythonBackendUrl();
