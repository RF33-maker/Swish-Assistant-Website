/**
 * A light seasonal layer for the Top performances cards: a cobweb strung across the
 * top-right corner and a few bats drifting out of it, with a faint pumpkin-orange
 * glow behind. It is drawn as one inline SVG over the card (inline SVG captures
 * reliably with html2canvas) and stays out of the way of the photo, numbers and logos.
 */

const W = 1080;

/** The cobweb: spokes fanning from the corner, joined by strands that sag back towards it. */
function cobwebPath(cx: number, cy: number, reach: number, from: number, to: number): string {
  const spokes = 6;
  const rings = [0.2, 0.38, 0.58, 0.8];
  const angle = (i: number) => from + ((to - from) * i) / (spokes - 1);
  const pt = (a: number, r: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  let d = "";
  for (let i = 0; i < spokes; i += 1) d += `M${cx} ${cy}L${pt(angle(i), reach)}`;
  rings.forEach((k) => {
    const r = reach * k;
    for (let i = 0; i < spokes - 1; i += 1) {
      const a = angle(i);
      const b = angle(i + 1);
      d += `M${pt(a, r)}Q${pt((a + b) / 2, r * 0.82)} ${pt(b, r)}`;
    }
  });
  return d;
}

// One bat, wingtip to wingtip about 2 units wide, centred on the origin.
const WING = "M0.08 -0.18Q0.5 -0.7 1 -0.42Q0.84 -0.26 0.8 0.06Q0.64 -0.08 0.46 0.1Q0.3 -0.02 0.12 0.26Z";
const BODY = "M-0.11 -0.16L-0.1 -0.36L-0.03 -0.22L0.03 -0.22L0.1 -0.36L0.11 -0.16Z";

function Bat({ x, y, size, tilt }: { x: number; y: number; size: number; tilt: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${size})`} fill="#0a0612" stroke="rgba(251,146,60,0.85)" strokeWidth={0.035}>
      <path d={WING} />
      <path d={WING} transform="scale(-1 1)" />
      <ellipse cx={0} cy={0.04} rx={0.13} ry={0.26} />
      <path d={BODY} />
    </g>
  );
}

export function HalloweenCardOverlay({ height }: { height: number }) {
  return (
    <svg
      aria-hidden="true"
      data-testid="halloween-overlay"
      width={W}
      height={height}
      viewBox={`0 0 ${W} ${height}`}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}
    >
      <defs>
        <radialGradient id="hw-glow-top" cx="1" cy="0" r="1">
          <stop offset="0" stopColor="#f97316" stopOpacity="0.34" />
          <stop offset="1" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="hw-glow-bottom" cx="0" cy="1" r="1">
          <stop offset="0" stopColor="#f97316" stopOpacity="0.18" />
          <stop offset="1" stopColor="#f97316" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={W - 420} y={0} width={420} height={360} fill="url(#hw-glow-top)" />
      <rect x={0} y={height - 300} width={440} height={300} fill="url(#hw-glow-bottom)" />
      <path d={cobwebPath(W, 0, 190, Math.PI / 2, Math.PI)} fill="none" stroke="rgba(251,146,60,0.7)" strokeWidth={2} strokeLinecap="round" />
      {/* A spider dropping on its thread. */}
      <line x1={W - 118} y1={0} x2={W - 118} y2={232} stroke="rgba(251,146,60,0.6)" strokeWidth={1.4} />
      <g transform={`translate(${W - 118} 240)`} fill="#0a0612" stroke="rgba(251,146,60,0.6)" strokeWidth={1}>
        <path d="M-7 -4L-15 -11M-7 0L-17 -1M-7 4L-15 11M7 -4L15 -11M7 0L17 -1M7 4L15 11" fill="none" stroke="#0a0612" strokeWidth={2.4} strokeLinecap="round" />
        <circle r={8} />
        <circle cy={-9} r={5} />
      </g>
      <Bat x={W - 230} y={34} size={28} tilt={-8} />
      <Bat x={W - 50} y={305} size={18} tilt={14} />
    </svg>
  );
}
