export interface TeamColors {
  primary: string;
  secondary: string;
  accent: string;
  primaryRgb: { r: number; g: number; b: number };
  secondaryRgb: { r: number; g: number; b: number };
  textContrast: string;
  textSecondaryContrast: string;
}

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
          console.error("CORS error getting image data:", err);
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
          console.warn("No vibrant colors found in:", imageUrl);
          resolve(null);
          return;
        }
        
        const sortedColors = Array.from(colorMap.values())
          .sort((a, b) => b.count - a.count);
        
        const primaryColor = sortedColors[0];
        const secondaryColor = sortedColors.length > 1 ? sortedColors[1] : primaryColor;
        
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
      console.error("Image load error:", imageUrl, err);
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

export async function extractTeamColors(teamName: string, leagueId: string): Promise<TeamColors | null> {
  const CACHE_KEY = 'team_colors_cache';
  const CACHE_VERSION = '3';
  const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  // Try to load from cache
  let cache: Record<string, { colors: TeamColors; timestamp: number; version: string }> = {};
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      cache = JSON.parse(cached);
    }
  } catch (err) {
    console.warn("Failed to load color cache:", err);
  }
  
  const cacheKey = `${leagueId}_${teamName}`;
  const cachedEntry = cache[cacheKey];
  
  // Return cached color if valid
  if (cachedEntry && 
      cachedEntry.version === CACHE_VERSION && 
      Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
    console.log(`🎨 Using cached colors for ${teamName}`);
    return cachedEntry.colors;
  }
  
  // Extract fresh colors
  const normalizedTeamName = teamName.replace(/\s+/g, '_');
  const possibleFilenames = [
    `${leagueId}_${normalizedTeamName}.png`,
    `${leagueId}_${normalizedTeamName}.jpg`,
    `${leagueId}_${normalizedTeamName}.jpeg`,
    `${leagueId}_${normalizedTeamName}_Senior_Men.png`,
    `${leagueId}_${normalizedTeamName}_Senior_Men.jpg`,
    `${leagueId}_${normalizedTeamName}_Senior_Men.jpeg`,
    `${leagueId}_${normalizedTeamName}_Senior_Men_I.png`,
    `${leagueId}_${normalizedTeamName}_Senior_Men_I.jpg`,
    `${leagueId}_${normalizedTeamName}_Senior_Men_I.jpeg`,
  ];
  
  for (const filename of possibleFilenames) {
    const logoUrl = `https://omkwqpcgttrgvbhcxgqf.supabase.co/storage/v1/object/public/team-logos/${filename}`;
    const extractedColors = await extractColorsFromImage(logoUrl);
    
    if (extractedColors) {
      // Cache the result
      cache[cacheKey] = {
        colors: extractedColors,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      };
      
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (err) {
        console.warn("Failed to cache colors:", err);
      }
      
      console.log(`🎨 Extracted and cached colors for ${teamName}:`, extractedColors);
      return extractedColors;
    }
  }
  
  console.log(`🎨 No colors found for ${teamName}, will use defaults`);
  return null;
}
