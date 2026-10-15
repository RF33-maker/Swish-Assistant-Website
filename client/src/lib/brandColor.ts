/**
 * Colour helpers for reports branded with a club's colours. A club's colour
 * can be anything from near-white yellow to near-black navy, so text is never
 * set on it or in it without checking it reads: these pick the text colour for
 * a filled surface, and a darker or lighter version of the colour for ink.
 */

/** The colour as #rrggbb, or null when it is not a plain hex or rgb() colour. */
export function parseHexColor(value: string | null | undefined): string | null {
  const v = (value || "").trim();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return `#${h.toLowerCase()}`;
  }
  const rgb = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

/** The team colour as #rrggbb. Accepts hex or rgb(); anything else falls back to navy. */
export function toHexColor(value: string | undefined): string {
  return parseHexColor(value) ?? "#0b3c78";
}

const channels = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export function luminance(hex: string): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * White or near-black text for the colour. White, as clubs usually letter
 * their colours, while it still reads at display size (3:1); past that the
 * one with more contrast, so an orange or yellow club gets dark text.
 */
export function readableOn(hex: string): string {
  const white = contrastRatio(hex, "#ffffff");
  return white >= 3 || white >= contrastRatio(hex, "#101623") ? "#ffffff" : "#101623";
}

/** `hex` moved `amount` (0 to 1) of the way towards `to`. */
export function mixHex(hex: string, to: string, amount: number): string {
  const a = channels(hex);
  const b = channels(to);
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * amount).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The club colour as ink on a background: itself when it already reads, else
 * darkened (on a light page) or lightened (on a dark one) until it does. A
 * yellow club still gets a yellow-family accent, just one you can read.
 */
export function inkOn(hex: string, background: string, min = 4.5): string {
  const towards = luminance(background) > 0.4 ? "#000000" : "#ffffff";
  for (let step = 0; step <= 10; step++) {
    const c = mixHex(hex, towards, step / 10);
    if (contrastRatio(c, background) >= min) return c;
  }
  return towards;
}

/**
 * The second club colour to pair with the first, or null when there isn't a
 * usable one: missing, or too close to the first to tell apart.
 */
export function secondColor(primary: string, secondary: string | null | undefined): string | null {
  const s = parseHexColor(secondary);
  if (!s) return null;
  const [a, b] = [channels(primary), channels(s)];
  const distance = Math.sqrt(a.reduce((sum, c, i) => sum + (c - b[i]) ** 2, 0));
  return distance < 60 ? null : s;
}

/** Ink in the club's colours on a background: the first colour when it reads, else the second, else the first adjusted. */
export function brandInk(primary: string, second: string | null, background: string): string {
  if (contrastRatio(primary, background) >= 4.5) return primary;
  if (second && contrastRatio(second, background) >= 4.5) return second;
  return inkOn(primary, background);
}

/**
 * CSS custom properties for a page branded to a club, set on its wrapper:
 * --sr-brand and --sr-on for filled surfaces, --sr-band for a strip on the
 * brand fill, --sr-accent for the second colour, and the light and dark theme
 * inks (index.css picks one as --sr-ink). The printed report uses the same mix.
 */
export function brandVars(primaryColor: string, secondaryColor?: string | null): Record<string, string> {
  const brand = toHexColor(primaryColor);
  const second = secondColor(brand, secondaryColor);
  // A colour lettered in dark text is a light one: its band and fallback accent go lighter and darker to match.
  const light = readableOn(brand) !== "#ffffff";
  return {
    "--sr-brand": brand,
    "--sr-band": light ? mixHex(brand, "#ffffff", 0.24) : mixHex(brand, "#000000", 0.2),
    "--sr-on": readableOn(brand),
    "--sr-accent": second ?? mixHex(brand, light ? "#000000" : "#ffffff", light ? 0.3 : 0.45),
    "--sr-ink-l": brandInk(brand, second, "#ffffff"),
    "--sr-ink-d": brandInk(brand, second, "#111317"),
  };
}
