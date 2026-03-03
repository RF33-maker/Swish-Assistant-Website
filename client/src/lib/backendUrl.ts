export function getPythonBackendUrl(): string {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/$/, '');
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8000`;
}
