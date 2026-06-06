/**
 * Returns the base URL for the Python backend.
 *
 * Priority:
 * 1. If running in a Replit dev environment (*.replit.dev hostname), always
 *    use window.location.origin so the Express proxy (/api/parse, /api/ai-analysis,
 *    /api/chat/league, /chat, /start, /health) routes to the local Python backend.
 *    This prevents VITE_BACKEND_URL (which points to the production Render server)
 *    from breaking local dev when Render is unreachable.
 * 2. VITE_BACKEND_URL env var (if set in Vercel dashboard or .env)
 * 3. If running on swishassistant.com (or any subdomain), use the known Render URL
 * 4. Otherwise fall back to window.location.origin
 *
 * No explicit port number is ever included in the returned URL.
 */
export function getPythonBackendUrl(): string {
  const hostname = window.location.hostname;

  // In any Replit dev environment, always proxy through local Express
  // regardless of what VITE_BACKEND_URL is set to.
  if (hostname.endsWith('.replit.dev')) {
    return window.location.origin;
  }

  if (import.meta.env.VITE_BACKEND_URL) {
    return (import.meta.env.VITE_BACKEND_URL as string).replace(/\/$/, '');
  }

  if (hostname === 'swishassistant.com' || hostname.endsWith('.swishassistant.com')) {
    return 'https://sab-backend.onrender.com';
  }

  return window.location.origin;
}

export const pythonBackendUrl = getPythonBackendUrl();
