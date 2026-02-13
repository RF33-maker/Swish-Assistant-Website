/**
 * Pre-renders a player photo with the polygon mask and rounded corners onto a canvas.
 * This creates a processed image that html2canvas can capture correctly.
 */

const PHOTO_WIDTH = 640;
const PHOTO_HEIGHT = 770;
const CORNER_RADIUS = 46;

// Original polygon: polygon(0% 1%, 73% 1%, 100% 82%, 0% 100%)
// Converted to pixel coordinates for 640x770:
// - P0 (top-left): (0, 7.7)
// - P1 (top-right): (467.2, 7.7)
// - P2 (bottom-right): (640, 631.4)
// - P3 (bottom-left): (0, 770)
const POLYGON_POINTS = [
  { x: 0, y: 7.7 },
  { x: 467.2, y: 7.7 },
  { x: 640, y: 631.4 },
  { x: 0, y: 770 },
];

interface Point { x: number; y: number; }

/**
 * Normalizes a vector to unit length
 */
function normalize(v: Point): Point {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}

/**
 * Calculates the offset point for a corner with given radius.
 * Returns the point where the arc should start/end along the edge.
 */
function offsetAlongEdge(corner: Point, nextOrPrev: Point, radius: number): Point {
  const dir = normalize({ x: nextOrPrev.x - corner.x, y: nextOrPrev.y - corner.y });
  return { x: corner.x + dir.x * radius, y: corner.y + dir.y * radius };
}

/**
 * Creates a Path2D with the polygon shape and rounded corners using proper vector math.
 * For each corner, we offset along both adjacent edges by the radius,
 * then draw an arc between those offset points.
 */
function createPolygonPath(): Path2D {
  const path = new Path2D();
  const p = POLYGON_POINTS;
  const r = CORNER_RADIUS;
  const n = p.length;
  
  // For each corner, calculate where the arc starts and ends
  for (let i = 0; i < n; i++) {
    const prev = p[(i - 1 + n) % n];
    const curr = p[i];
    const next = p[(i + 1) % n];
    
    // Point where arc ends (going toward next vertex)
    const arcEnd = offsetAlongEdge(curr, next, r);
    // Point where arc starts (coming from previous vertex)  
    const arcStart = offsetAlongEdge(curr, prev, r);
    
    if (i === 0) {
      // Move to the start of the first arc
      path.moveTo(arcEnd.x, arcEnd.y);
    } else {
      // Line from previous arc end to this arc start
      path.lineTo(arcStart.x, arcStart.y);
      // Arc through the corner to arcEnd
      path.arcTo(curr.x, curr.y, arcEnd.x, arcEnd.y, r);
    }
  }
  
  // Close: line to first corner's arc start, then arc through corner
  const firstPrev = p[n - 1];
  const firstCurr = p[0];
  const firstNext = p[1];
  const firstArcStart = offsetAlongEdge(firstCurr, firstPrev, r);
  const firstArcEnd = offsetAlongEdge(firstCurr, firstNext, r);
  
  path.lineTo(firstArcStart.x, firstArcStart.y);
  path.arcTo(firstCurr.x, firstCurr.y, firstArcEnd.x, firstArcEnd.y, r);
  
  path.closePath();
  return path;
}

/**
 * Loads an image via fetch + Blob to bypass CORS canvas tainting issues.
 * Supabase public URLs don't have proper CORS headers, so we need to
 * fetch the image data first and create an object URL.
 */
async function loadImage(src: string): Promise<HTMLImageElement> {
  // First, try to fetch the image as a blob to bypass CORS tainting
  try {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Clean up object URL after image loads
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      };
      img.src = objectUrl;
    });
  } catch (fetchError) {
    console.warn("[PhotoMasking] Fetch failed, trying direct load:", fetchError);
    // Fallback to direct image load (may still work for same-origin images)
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }
}

/**
 * Generates a masked photo data URL with the polygon clip and rounded corners.
 * Supports focal point positioning (0-100 where 0=top, 50=center, 100=bottom).
 */
export async function generateMaskedPhoto(
  photoUrl: string,
  focusY: number = 50
): Promise<string> {
  try {
    const img = await loadImage(photoUrl);
    
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_WIDTH;
    canvas.height = PHOTO_HEIGHT;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }
    
    // Calculate scaling to cover the container (object-fit: cover behavior)
    const imgAspect = img.width / img.height;
    const containerAspect = PHOTO_WIDTH / PHOTO_HEIGHT;
    
    let drawWidth: number;
    let drawHeight: number;
    let drawX: number;
    let drawY: number;
    
    if (imgAspect > containerAspect) {
      // Image is wider - fit height, crop width
      drawHeight = PHOTO_HEIGHT;
      drawWidth = img.width * (PHOTO_HEIGHT / img.height);
      drawX = -(drawWidth - PHOTO_WIDTH) / 2; // Center horizontally
      drawY = 0;
    } else {
      // Image is taller - fit width, crop height based on focusY
      drawWidth = PHOTO_WIDTH;
      drawHeight = img.height * (PHOTO_WIDTH / img.width);
      drawX = 0;
      
      // Calculate Y offset based on focal point (0-100)
      // focusY=0: show top (drawY=0)
      // focusY=50: show center (drawY = -(overflow/2))
      // focusY=100: show bottom (drawY = -overflow)
      const overflow = drawHeight - PHOTO_HEIGHT;
      const normalizedFocus = Math.max(0, Math.min(100, focusY)) / 100;
      drawY = -overflow * normalizedFocus;
    }
    
    // Apply the polygon clip path
    const clipPath = createPolygonPath();
    ctx.clip(clipPath);
    
    // Draw the image with focal point offset
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    
    // Return as data URL
    const dataUrl = canvas.toDataURL("image/png");
    return dataUrl;
  } catch (error) {
    console.error("[PhotoMasking] Failed to generate masked photo:", error);
    // Return original URL as fallback
    return photoUrl;
  }
}
