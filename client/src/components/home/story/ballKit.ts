/**
 * Drawing kit for the homepage's 3D basketballs: quaternion maths for their
 * orientation, the seam curves on the sphere, and pre-rendered sprites for
 * the matte shading and the soft contact shadow. Matte orange with thin dark
 * seams, studio-lit from the top left — the look of the brief's reference.
 */

export type Quat = [number, number, number, number]; // w, x, y, z

export const qMul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

export const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

export const qAxisAngle = (x: number, y: number, z: number, angle: number): Quat => {
  const l = Math.hypot(x, y, z) || 1;
  const s = Math.sin(angle / 2) / l;
  return [Math.cos(angle / 2), x * s, y * s, z * s];
};

export const qRandom = (): Quat =>
  qNorm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);

// Seams on the unit sphere (x right, y up, z towards the viewer): two great
// circles and the two curved side seams, as closed loops of points.
const SEAM_POINTS = 44;
const SIDE = 0.62;
const SIDE_R = Math.sqrt(1 - SIDE * SIDE);
const SEAMS: [number, number, number][][] = [
  (t: number) => [Math.cos(t), 0, Math.sin(t)],
  (t: number) => [0, Math.cos(t), Math.sin(t)],
  (t: number) => [SIDE, SIDE_R * Math.cos(t), SIDE_R * Math.sin(t)],
  (t: number) => [-SIDE, SIDE_R * Math.cos(t), SIDE_R * Math.sin(t)],
].map((f) =>
  Array.from({ length: SEAM_POINTS + 1 }, (_, i) => f((i / SEAM_POINTS) * Math.PI * 2) as [number, number, number]),
);

/** A shaded matte sphere, rendered once and scaled per ball. */
export function makeSphereSprite(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const base = g.createRadialGradient(r * 0.72, r * 0.62, r * 0.05, r, r, r);
  base.addColorStop(0, "rgb(247,168,126)");
  base.addColorStop(0.42, "rgb(233,121,76)");
  base.addColorStop(0.85, "rgb(200,92,52)");
  base.addColorStop(1, "rgb(170,72,38)");
  g.fillStyle = base;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  const limb = g.createRadialGradient(r, r, r * 0.62, r, r, r);
  limb.addColorStop(0, "rgba(90,35,15,0)");
  limb.addColorStop(1, "rgba(90,35,15,0.35)");
  g.fillStyle = limb;
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** A soft elliptical contact shadow. */
export function makeShadowSprite(size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.55, "rgba(0,0,0,0.22)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/**
 * Draws one ball centred at (x, y) with radius r. `squash` (0–1) flattens
 * it against the surface it's landing on, anchored at its base.
 */
export function drawBall(
  ctx: CanvasRenderingContext2D,
  sphere: HTMLCanvasElement,
  x: number,
  y: number,
  r: number,
  q: Quat,
  alpha: number,
  squash = 0,
) {
  if (alpha <= 0 || r <= 0.5) return;
  const sx = 1 + 0.14 * squash;
  const sy = 1 - 0.2 * squash;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Squash about the contact point at the bottom of the ball.
  ctx.translate(x, y + r);
  ctx.scale(sx, sy);
  ctx.translate(-x, -(y + r));
  ctx.drawImage(sphere, x - r, y - r, r * 2, r * 2);

  const [w, qx, qy, qz] = q;
  const m00 = 1 - 2 * (qy * qy + qz * qz), m01 = 2 * (qx * qy - w * qz), m02 = 2 * (qx * qz + w * qy);
  const m10 = 2 * (qx * qy + w * qz), m11 = 1 - 2 * (qx * qx + qz * qz), m12 = 2 * (qy * qz - w * qx);
  const m20 = 2 * (qx * qz - w * qy), m21 = 2 * (qy * qz + w * qx), m22 = 1 - 2 * (qx * qx + qy * qy);
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = "rgba(26,14,10,0.92)";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const seam of SEAMS) {
    let px = 0, py = 0, pz = -1;
    for (let i = 0; i < seam.length; i++) {
      const [sx0, sy0, sz0] = seam[i];
      const X = m00 * sx0 + m01 * sy0 + m02 * sz0;
      const Y = m10 * sx0 + m11 * sy0 + m12 * sz0;
      const Z = m20 * sx0 + m21 * sy0 + m22 * sz0;
      const cx = x + X * r * 0.985;
      const cy = y - Y * r * 0.985;
      if (i > 0 && Z > 0.04 && pz > 0.04) {
        ctx.moveTo(px, py);
        ctx.lineTo(cx, cy);
      }
      px = cx; py = cy; pz = Z;
    }
  }
  ctx.stroke();
  ctx.restore();
}
