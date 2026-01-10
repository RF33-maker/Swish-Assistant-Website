/**
 * Pre-renders a player photo with the polygon mask and rounded corners onto a canvas.
 * This creates a processed image that html2canvas can capture correctly.
 */

const PHOTO_WIDTH = 640;
const PHOTO_HEIGHT = 770;
const CORNER_RADIUS = 46;

// Original polygon: polygon(0% 1%, 73% 1%, 100% 82%, 0% 100%)
// Converted to pixel coordinates for 640x770:
// - Top left: (0, 7.7)
// - Top right: (467.2, 7.7)
// - Bottom right: (640, 631.4)
// - Bottom left: (0, 770)
const POLYGON_POINTS = [
  { x: 0, y: 7.7 },
  { x: 467.2, y: 7.7 },
  { x: 640, y: 631.4 },
  { x: 0, y: 770 },
];

/**
 * Creates a Path2D with the polygon shape and rounded corners
 */
function createPolygonPath(): Path2D {
  const path = new Path2D();
  const p = POLYGON_POINTS;
  const r = CORNER_RADIUS;
  
  // Start near the first corner (top-left)
  path.moveTo(p[0].x, p[0].y + r);
  
  // Top-left corner with arc
  path.arcTo(p[0].x, p[0].y, p[0].x + r, p[0].y, r);
  
  // Line to top-right area
  path.lineTo(p[1].x - r, p[1].y);
  
  // Top-right corner with arc
  path.arcTo(p[1].x, p[1].y, p[1].x + (p[2].x - p[1].x) * 0.1, p[1].y + (p[2].y - p[1].y) * 0.1, r);
  
  // Line to bottom-right
  path.lineTo(p[2].x - r * 0.3, p[2].y - r * 0.5);
  
  // Bottom-right corner with arc
  path.arcTo(p[2].x, p[2].y, p[2].x - (p[2].x - p[3].x) * 0.1, p[2].y + (p[3].y - p[2].y) * 0.1, r);
  
  // Line to bottom-left
  path.lineTo(p[3].x, p[3].y - r);
  
  // Bottom-left corner with arc
  path.arcTo(p[3].x, p[3].y, p[3].x + r, p[3].y, r);
  
  // Close path back to start
  path.lineTo(p[0].x, p[0].y + r);
  
  path.closePath();
  return path;
}

/**
 * Loads an image with CORS enabled
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
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
    return canvas.toDataURL("image/png");
  } catch (error) {
    console.error("Failed to generate masked photo:", error);
    // Return original URL as fallback
    return photoUrl;
  }
}
