/**
 * Returns the base URL for the Python backend (hosted on Render).
 *
 * Always uses VITE_BACKEND_URL. If the env var is not set, an error is
 * logged and an empty string is returned so callers fail visibly rather
 * than silently hitting the wrong origin.
 */
export function getPythonBackendUrl(): string {
  const url = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (!url) {
    console.error(
      '[backendUrl] VITE_BACKEND_URL is not set. ' +
      'Python backend features (PDF upload, coaching chat, AI analysis) will not work.'
    );
    return '';
  }
  return url.replace(/\/$/, '');
}

export const pythonBackendUrl = getPythonBackendUrl();
