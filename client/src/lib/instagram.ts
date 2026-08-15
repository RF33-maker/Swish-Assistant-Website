export function normalizeInstagramHandle(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("instagram.com")) {
      return url.pathname.replace(/^\//, "").replace(/\/$/, "");
    }
  } catch {
  }
  return trimmed.replace(/^@/, "");
}
