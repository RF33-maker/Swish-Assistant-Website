import { getTeamLogoCached, normalizeTeamName } from '@/utils/teamLogoCache';

export interface TeamColors {
  primary: string;
  secondary: string;
  accent: string;
  primaryRgb: { r: number; g: number; b: number };
  secondaryRgb: { r: number; g: number; b: number };
  textContrast: string;
  textSecondaryContrast: string;
}

export const DEFAULT_COLORS: TeamColors = {
  primary: 'rgb(100, 100, 100)',
  secondary: 'rgb(70, 70, 70)',
  accent: 'rgba(100, 100, 100, 0.1)',
  primaryRgb: { r: 100, g: 100, b: 100 },
  secondaryRgb: { r: 70, g: 70, b: 70 },
  textContrast: '#ffffff',
  textSecondaryContrast: '#ffffff',
};

export async function extractColorsFromImage(imageUrl: string): Promise<TeamColors | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    const timeout = setTimeout(() => {
      console.warn("Color extraction timeout for:", imageUrl);
      resolve(null);
    }, 5000);
    
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        
        if (!ctx) {
          console.error("Failed to get canvas context");
          resolve(null);
          return;
        }
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        let imageData;
        try {
          imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        } catch (err) {
          console.warn("CORS error getting image data, falling back to Supabase brand colour:", imageUrl);
          resolve(null);
          return;
        }
        
        const pixels = imageData.data;
        const colorMap = new Map<string, { count: number; r: number; g: number; b: number }>();
        
        for (let i = 0; i < pixels.length; i += 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];
          
          if (a < 128) continue;
          
          const brightness = (r + g + b) / 3;
          if (brightness > 240 || brightness < 20) continue;
          
          const saturation = Math.max(r, g, b) - Math.min(r, g, b);
          if (saturation < 30) continue;
          
          const key = `${Math.floor(r / 15)},${Math.floor(g / 15)},${Math.floor(b / 15)}`;
          const existing = colorMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            colorMap.set(key, { count: 1, r, g, b });
          }
        }
        
        if (colorMap.size === 0) {
          console.warn("No qualifying colors found in image, falling back to Supabase brand colour:", imageUrl);
          resolve(null);
          return;
        }
        
        // Rank by hue *family*, not by exact shade. Counting fine RGB
        // buckets alone let a flat fill (e.g. an orange basketball) beat a
        // team's real colour whenever that colour is drawn with shading or
        // anti-aliasing and so spreads across many buckets — Bristol
        // Hurricanes' crest is ~75% navy but came out orange. Each hue bin is
        // scored with its neighbours so a colour straddling a bin edge isn't
        // split in two.
        const HUE_BINS = 12; // 30° each
        const hueOf = (r: number, g: number, b: number) => {
          const max = Math.max(r, g, b);
          const d = max - Math.min(r, g, b);
          let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
          h = (h * 60 + 360) % 360;
          return h;
        };
        const buckets = Array.from(colorMap.values()).map(c => ({
          ...c,
          bin: Math.floor(hueOf(c.r, c.g, c.b) / (360 / HUE_BINS)) % HUE_BINS,
        }));
        const binCounts = new Array(HUE_BINS).fill(0);
        buckets.forEach(c => { binCounts[c.bin] += c.count; });
        const windowScore = (bin: number) =>
          binCounts[bin] + binCounts[(bin + 1) % HUE_BINS] + binCounts[(bin + HUE_BINS - 1) % HUE_BINS];
        const binDistance = (a: number, b: number) => {
          const d = Math.abs(a - b) % HUE_BINS;
          return Math.min(d, HUE_BINS - d);
        };
        const totalCount = binCounts.reduce((sum, n) => sum + n, 0);
        const rankedBins = binCounts
          .map((_, bin) => ({ bin, score: windowScore(bin) }))
          .sort((a, b) => b.score - a.score);

        // The most common exact shade within ±1 bin of the winning hue.
        const representative = (centre: number) =>
          buckets
            .filter(c => binDistance(c.bin, centre) <= 1)
            .sort((a, b) => b.count - a.count)[0];

        const primaryBin = rankedBins[0].bin;
        const primaryColor = representative(primaryBin);
        // Secondary: the strongest hue family clearly distinct from the
        // primary (≥ 60° away) that still makes up a real share of the logo.
        const secondaryBin = rankedBins.find(
          b => binDistance(b.bin, primaryBin) >= 2 && b.score >= totalCount * 0.08
        )?.bin;
        const secondaryColor = (secondaryBin != null && representative(secondaryBin)) || primaryColor;

        const primaryRgb = { r: primaryColor.r, g: primaryColor.g, b: primaryColor.b };
        const secondaryRgb = { r: secondaryColor.r, g: secondaryColor.g, b: secondaryColor.b };
        
        resolve({
          primary: `rgb(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b})`,
          secondary: `rgb(${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b})`,
          accent: `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.1)`,
          primaryRgb,
          secondaryRgb,
          textContrast: getContrastColor(primaryRgb),
          textSecondaryContrast: getContrastColor(secondaryRgb),
        });
      } catch (error) {
        console.error("Error extracting colors:", error);
        resolve(null);
      }
    };
    
    img.onerror = (err) => {
      clearTimeout(timeout);
      resolve(null);
    };
    
    img.src = imageUrl;
  });
}

export function getContrastColor(rgb: { r: number; g: number; b: number }): string {
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#ffffff";
}

export function adjustOpacity(rgb: { r: number; g: number; b: number }, opacity: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
}

export async function extractTeamColors(teamName: string, leagueId: string, extraLeagueIds?: string[]): Promise<TeamColors | null> {
  const CACHE_KEY = 'team_colors_cache';
  const CACHE_VERSION = '5'; // bumped: hue-family ranking changed extracted colours
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

  // Resolve the exact same logo URL that TeamLogo renders. This includes logos
  // stored outside teams.logo_url plus parent/child competition fallbacks, and
  // (via extraLeagueIds) sibling seasons of the same team when the current
  // season's own teams row hasn't been populated yet.
  const logoUrl = await getTeamLogoCached({ teamName, leagueId, extraLeagueIds });
  if (!logoUrl) return null;

  // Try to load from cache
  let cache: Record<string, { colors: TeamColors; logoUrl: string; timestamp: number; version: string }> = {};
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      cache = JSON.parse(cached);
    }
  } catch (err) {
    console.warn("Failed to load color cache:", err);
  }

  const cacheKey = `${leagueId}_${normalizeTeamName(teamName)}`;
  const cachedEntry = cache[cacheKey];
  
  // Return cached color if valid
  if (cachedEntry && 
      cachedEntry.version === CACHE_VERSION &&
      cachedEntry.logoUrl === logoUrl &&
      Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
    return cachedEntry.colors;
  }

  const extractedColors = await extractColorsFromImage(logoUrl);
  if (extractedColors) {
    cache[cacheKey] = {
      colors: extractedColors,
      logoUrl,
      timestamp: Date.now(),
      version: CACHE_VERSION,
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (err) {
      console.warn("Failed to cache colors:", err);
    }
    return extractedColors;
  }

  return null;
}
