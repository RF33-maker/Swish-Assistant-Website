const FALLBACK_NAVY = "#0f1f33";

export const LIGHT_SURFACE = "#ffffff";
export const DARK_SURFACE = "#171717";

export function normalizeHex(input: string | null | undefined): string {
  if (!input) return FALLBACK_NAVY;
  const trimmed = input.trim();
  if (trimmed.startsWith("#")) {
    const h = trimmed.slice(1);
    if (/^[0-9a-f]{6}$/i.test(h)) return `#${h.toLowerCase()}`;
    if (/^[0-9a-f]{3}$/i.test(h)) {
      return `#${h
        .split("")
        .map((c) => (c + c).toLowerCase())
        .join("")}`;
    }
  }
  const rgbMatch = trimmed.match(
    /^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i,
  );
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)));
    const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)));
    const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)));
    return `#${[r, g, b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")}`;
  }
  return FALLBACK_NAVY;
}

export function shadeHex(input: string, amount: number): string {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const factor = 1 - amount;
  const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((num & 0xff) * factor)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function withAlpha(input: string, alpha: number): string {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function tintHex(input: string, amount: number): string {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const r = Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * amount);
  const g = Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * amount);
  const b = Math.round((num & 0xff) + (255 - (num & 0xff)) * amount);
  return `#${[r, g, b]
    .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function relativeLuminance(input: string): number {
  const hex = normalizeHex(input);
  const num = parseInt(hex.slice(1), 16);
  const channels = [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff].map(
    (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    },
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

export function ensureContrast(
  color: string,
  bg: string,
  minRatio = 4.5,
): string {
  const start = normalizeHex(color);
  if (contrastRatio(start, bg) >= minRatio) return start;
  const bgIsLight = relativeLuminance(bg) > 0.5;
  let result = start;
  for (let amount = 0.08; amount <= 0.92; amount += 0.06) {
    const candidate = bgIsLight ? shadeHex(start, amount) : tintHex(start, amount);
    if (contrastRatio(candidate, bg) >= minRatio) return candidate;
    result = candidate;
  }
  return result;
}
