import { useEffect, useRef } from "react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { useIsDarkMode } from "@/hooks/useReadableColor";
import { prefersReducedMotion } from "@/components/home/motion";
import { drawBall, makeShadowSprite, makeSphereSprite, qAxisAngle, qMul, qRandom, type Quat } from "@/components/home/story/ballKit";

/**
 * The homepage's scroll story — a fixed layer behind the page, the hoop on a
 * layer of its own above that, and a canvas in front of the page for the
 * basketballs. Scrolling back up plays it all in reverse:
 *
 *   0. On arrival a handful of basketballs drop onto the top of the search
 *      bar, bounce and come to rest along it. The moment the visitor
 *      scrolls, they tip off one by one and fall away, shrinking and fading
 *      — and the bar carries straight on into the hoop.
 *   A. The search bar morphs into a hoop. A ghost of the bar (drawn to match
 *      it exactly) takes over as the real bar fades, shrinks into an orange
 *      rim and the Swish logo's net drops from it.
 *   B. The hoop eases to a stop and hangs while the scores and performance
 *      cards slide over it, and fades out behind them.
 *   C. The background warms into an orange gradient.
 *   D. A FIBA half court draws itself, line by line.
 *   E. The camera zooms into the rim.
 *   F. The rim tilts from an overhead circle into the logo's rim ellipse, the
 *      logo's net drops in, and the Swish logo holds to the end of the page.
 *
 * Scenes are anchored to the page's sections (data-story="…" wrappers), not
 * to fixed pixel offsets, so the story stays in step with the content at any
 * screen size and as sections load in.
 *
 * Keeping it smooth, on phones especially:
 *   - Scenes follow an eased copy of the scroll position, so a flick or a
 *     mouse-wheel notch plays out as a glide instead of a jump cut.
 *   - What sits on the page scrolls with it natively, the way the page itself
 *     does: the balls' canvas is part of the page, and the hoop is sticky —
 *     the browser carries it with the page and then hangs it. Script only
 *     softens the stop and adds the drift, so nothing visibly chases the
 *     scroll.
 *   - The balls tip off as the scroll passes them but fall in their own time,
 *     and are only redrawn while they're moving.
 *   - Values are written only when they change, and the long stretches (the
 *     hoop hanging and fading, the gradient coming in) are transform and
 *     opacity changes on layers of their own, with nothing to repaint.
 *   - The fixed layer is sized to the large viewport, so a phone's toolbar
 *     sliding in and out doesn't resize or re-time the story mid-scroll.
 * Nothing is drawn under prefers-reduced-motion.
 */

// Measured from the 1024px logo PNG: the rim's centre, its centre-line
// horizontal radius, the ellipse's height ratio, and the ring thickness.
const LOGO = { size: 1024, rimCx: 509, rimCy: 226.5, rimRx: 290, ryRatio: 52.5 / 290, ringRatio: 36 / 290 };

// FIBA half court in court units (1 unit = 2.5cm): 15m × 14m, baseline at
// the top (y = 0), rim centre 1.575m out from the baseline.
const COURT = { w: 600, h: 560, rimX: 300, rimY: 63, rimR: 9 };
const COURT_PATHS = [
  "M 0 0 H 600 V 560 H 0 Z", // boundary
  "M 202 0 V 232 H 398 V 0", // key
  "M 228 232 A 72 72 0 0 0 372 232 A 72 72 0 0 0 228 232", // free-throw circle
  "M 36 0 V 119.6 A 270 270 0 0 0 564 119.6 V 0", // three-point line
  "M 250 63 A 50 50 0 0 0 350 63", // restricted area
  "M 264 48 H 336", // backboard
  "M 0 560 H 600 M 228 560 A 72 72 0 0 1 372 560", // half-court line + centre circle
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ramp = (v: number, a: number, b: number) => (b <= a ? (v >= b ? 1 : 0) : clamp01((v - a) / (b - a)));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// How far behind the scroll the scenes run (seconds): enough to turn a flick
// or a wheel notch into a glide, little enough to still feel attached.
const SMOOTHING = 0.12;
// The hanging hoop's speed relative to the page — a slow parallax drift.
const HANG_DRIFT = 0.12;

interface Rect { left: number; top: number; width: number; height: number }

/**
 * An element's position in the document from its layout offsets — unlike
 * getBoundingClientRect this ignores CSS transforms, so the search bar's
 * entrance animation (a small slide-up) doesn't throw the measurement off.
 */
function layoutRect(el: HTMLElement | null): Rect | null {
  if (!el) return null;
  let top = 0;
  let left = 0;
  let node: HTMLElement | null = el;
  while (node) {
    top += node.offsetTop;
    left += node.offsetLeft;
    node = node.offsetParent as HTMLElement | null;
  }
  return { left: left - window.scrollX, top, width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * How far up the screen the hoop has moved after `y` px of scroll. It rides
 * with the page until it nears `hangAt`, then slows over the `ease` px either
 * side of it to the hang's drift — rather than stopping dead. (Its speed
 * falls from 1 to HANG_DRIFT along a smoothstep; this is that curve's
 * integral, so it ends up exactly where a sudden stop would have put it.)
 */
function hoopTravel(y: number, hangAt: number, ease: number): number {
  if (ease <= 0) return y <= hangAt ? y : hangAt + HANG_DRIFT * (y - hangAt);
  const from = hangAt - ease;
  if (y <= from) return y;
  const span = 2 * ease;
  const u = Math.min(1, (y - from) / span);
  const eased = from + span * (u - (1 - HANG_DRIFT) * (u * u * u - (u * u * u * u) / 2));
  return eased + HANG_DRIFT * Math.max(0, y - from - span);
}

// ── The balls that rest on the search bar ──
const BALL_GRAVITY = 2600; // px/s²
const BALL_RESTITUTION = 0.42;
const FALL_SECONDS = 0.45; // tipping off the bar and falling away
const RETURN_SECONDS = 0.4; // hopping back on when scrolled back to the top
const FALL_STAGGER = 0.07; // s between balls when one flick tips several at once
// Scrolling hurries the balls along — at this speed (px/s) they go twice as
// fast, up to 4× — so a flick shakes them off within the flick, while a slow
// scroll lets them go at their own pace.
const PACE_SPEED = 700;

interface RackBall {
  fx: number; // centre, as a fraction of the bar's width
  r: number;
  q: Quat; // resting orientation
  spinAxis: [number, number, number];
  spin: number; // radians turned during the drop
  delay: number; // seconds after the intro starts
  fallAt: number; // scroll position (px) where it tips off
  drift: number; // sideways drift while falling (px)
  fallAxis: [number, number, number];
  p: number; // 0 resting on the bar → 1 fallen away
  target: number; // where p is heading: 0 or 1
  wait: number; // s (at normal pace) before it sets off towards it
}

const randomAxis = (): [number, number, number] => {
  const v: [number, number, number] = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Where each ball rests along the bar, when it drops, and when it falls. */
function buildRack(barW: number, small: boolean): RackBall[] {
  const n = small ? 4 : barW < 640 ? 5 : 7;
  const base = small ? 13 : 19;
  const radii = Array.from({ length: n }, () => base * (0.9 + Math.random() * 0.2));
  const fx: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    fx.push(0.07 + 0.86 * t + (Math.random() - 0.5) * (0.45 / n));
  }
  fx.sort((a, b) => a - b);
  for (let i = 1; i < n; i++) {
    const minGap = (radii[i] + radii[i - 1] + 4) / barW;
    if (fx[i] - fx[i - 1] < minGap) fx[i] = fx[i - 1] + minGap;
  }
  const dropOrder = shuffled(n);
  const fallOrder = shuffled(n);
  const fallStep = small ? 14 : 10;
  return fx.map((f, i) => ({
    fx: f,
    r: radii[i],
    q: qRandom(),
    spinAxis: randomAxis(),
    spin: 2 + Math.random() * 4,
    delay: dropOrder[i] * 0.085 + Math.random() * 0.04,
    fallAt: 4 + fallOrder[i] * fallStep,
    drift: (Math.random() - 0.5) * 44,
    fallAxis: randomAxis(),
    p: 0,
    target: 0,
    wait: 0,
  }));
}

/**
 * One dropped ball's height above its resting spot `t` seconds after its
 * release from `H` px up: a free fall and a few decaying bounces, worked out
 * exactly rather than simulated, so it's the same on every device. Also
 * returns how squashed it is from its latest landing.
 */
function dropAt(t: number, H: number): { above: number; squash: number } {
  if (t <= 0) return { above: H, squash: 0 };
  const g = BALL_GRAVITY;
  const t0 = Math.sqrt((2 * H) / g);
  if (t < t0) return { above: H - 0.5 * g * t * t, squash: 0 };
  let tt = t - t0;
  const v0 = g * t0;
  let v = v0;
  let impact = 1; // strength of the most recent landing, 0–1
  for (let k = 0; k < 4; k++) {
    v *= BALL_RESTITUTION;
    if (v < 40) break;
    const arc = (2 * v) / g;
    if (tt < arc) {
      return { above: v * tt - 0.5 * g * tt * tt, squash: impact * Math.exp(-tt / 0.045) };
    }
    tt -= arc;
    impact = v / v0;
  }
  return { above: 0, squash: impact * Math.exp(-tt / 0.045) };
}

interface Layout {
  vw: number;
  vh: number;
  dpr: number;
  contentLeft: number;
  contentW: number;
  wide: boolean;
  small: boolean;
  bar: Rect | null; // document coordinates
  hostLeft: number; // the page's left edge: x = 0 in the hoop's layer
  stageTop: number; // top of the "Today" bar, in document coordinates
  barRadius: number;
  rxT: number; // the hoop's rim radius
  hoopPad: number; // room above the bar in the hoop's layer, for the logo
  ease: number; // px of scroll either side of the hang over which the hoop slows
  balls: Rect | null; // the balls' canvas, document coordinates
  fallDepth: number; // how far below the bar a ball falls before it's gone
  t: {
    aStart: number; aEnd: number;
    bStart: number; bEnd: number;
    cStart: number; cEnd: number;
    dStart: number; dEnd: number;
    eStart: number; eEnd: number;
    fStart: number; fEnd: number;
  };
}

function docRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top + window.scrollY, width: r.width, height: r.height };
}

export default function ScrollStory() {
  const isDark = useIsDarkMode();
  const reduced = prefersReducedMotion();

  const layerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ambientRef = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);
  // Scene A/B
  const trackRef = useRef<HTMLDivElement>(null);
  const hoopRef = useRef<HTMLDivElement>(null);
  const hoopSvgRef = useRef<SVGSVGElement>(null);
  const ghostBaseRef = useRef<SVGRectElement>(null);
  const ghostRimRef = useRef<SVGRectElement>(null);
  const ghostContentRef = useRef<SVGGElement>(null);
  const ghostIconRef = useRef<SVGGElement>(null);
  const ghostTextRef = useRef<SVGTextElement>(null);
  const ghostButtonRef = useRef<SVGGElement>(null);
  const ghostButtonRectRef = useRef<SVGRectElement>(null);
  const ghostButtonTextRef = useRef<SVGTextElement>(null);
  const hoopLogoRef = useRef<SVGImageElement>(null);
  const hoopClipRef = useRef<SVGRectElement>(null);
  // Scenes D–F
  const courtRef = useRef<SVGGElement>(null);
  const courtPathRefs = useRef<(SVGPathElement | null)[]>([]);
  const rimCourtRef = useRef<SVGEllipseElement>(null);
  const rimOrangeRef = useRef<SVGEllipseElement>(null);
  const finalLogoRef = useRef<SVGImageElement>(null);
  const finalClipRef = useRef<SVGRectElement>(null);
  // Scene 0
  const ballCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (reduced) return;
    let layout: Layout | null = null;
    let raf = 0;
    let lastFrame = 0;
    // The eased scroll position the scenes follow.
    let easedY = Math.max(0, window.scrollY);
    let formEl: HTMLElement | null = null;
    let inputEl: HTMLInputElement | null = null;
    let glowPaused = false;

    // Scene 0: the balls. Built once the bar has been measured; rebuilt only
    // if the bar's width changes a lot (their random layout stays put).
    const ballCanvas = ballCanvasRef.current;
    const bctx = ballCanvas?.getContext("2d") ?? null;
    const sphere = makeSphereSprite(160);
    const shadow = makeShadowSprite(96);
    let rack: RackBall[] | null = null;
    let byFall: RackBall[] = [];
    let byFallReversed: RackBall[] = [];
    let rackWidth = 0;
    let canvasSize = "";
    let ballsDirty = true;
    let ballY = easedY; // scroll position at the last ball step
    let ballSpeed = 0; // px/s, eased
    let flipDir = 0;
    let queued = 0; // s until the last ball to tip (or hop back) sets off
    // After the search bar has swept into place (ch-search-in), so the balls
    // land on a bar that's already settled.
    const introStart = performance.now() + 750;
    const INTRO_SECONDS = 2.4;

    // Every value goes through here and is only written when it changes, so
    // a frame where a scene is at rest touches nothing.
    const written = new Map<Element, Record<string, string>>();
    const fmt = (v: string | number) => (typeof v === "number" ? String(Math.round(v * 1000) / 1000) : v);
    const set = (el: Element | null | undefined, attrs: Record<string, string | number>) => {
      if (!el) return;
      let prev = written.get(el);
      if (!prev) written.set(el, (prev = {}));
      for (const k in attrs) {
        const v = fmt(attrs[k]);
        if (prev[k] !== v) {
          prev[k] = v;
          el.setAttribute(k, v);
        }
      }
    };
    const css = (el: HTMLElement | null | undefined, props: Record<string, string | number>) => {
      if (!el) return;
      let prev = written.get(el);
      if (!prev) written.set(el, (prev = {}));
      for (const k in props) {
        const v = fmt(props[k]);
        if (prev[`style:${k}`] !== v) {
          prev[`style:${k}`] = v;
          el.style.setProperty(k, v);
        }
      }
    };

    /** Scenes A–F at scroll position `y`, with transitions at the eased `sy`. */
    const render = (y: number, sy: number) => {
      const L = layout;
      if (!L) return;
      const { vh, t } = L;

      // ── A/B: search bar → hoop, then hang and fade behind the cards ──
      const eA = easeInOut(ramp(sy, t.aStart, t.aEnd));
      if (formEl) {
        // The real bar fades as its ghost takes over. Kept solid while in use.
        const inUse = formEl.contains(document.activeElement) || !!inputEl?.value;
        const shown = inUse ? 1 : 1 - ramp(sy, 6, 60);
        css(formEl, { opacity: shown });
        // Its travelling glow repaints every frame — pause it while unseen.
        if ((shown === 0) !== glowPaused) {
          glowPaused = shown === 0;
          formEl.classList.toggle("is-story-hidden", glowPaused);
        }
      }
      // Hidden at the very top: the real bar is there, and its entrance
      // animation would otherwise let the ghost's edge peek out.
      const hoopShown = ramp(sy, 1, 8) * (1 - ramp(sy, t.bStart, t.bEnd));
      css(hoopRef.current, { opacity: hoopShown });
      if (L.bar && hoopShown > 0) {
        const { width: bw, height: bh } = L.bar;
        const bx = L.bar.left - L.hostLeft;
        // Being sticky carries the hoop with the page and then hangs it; this
        // nudge only turns the stop into a slow-down and adds the drift.
        const nudge = Math.min(y, t.aEnd) - hoopTravel(y, t.aEnd, L.ease);
        css(hoopRef.current, { transform: `translate3d(0,${fmt(Math.round(nudge * L.dpr) / L.dpr)}px,0)` });

        // The hoop's own layer: the bar's top edge sits `hoopPad` down it.
        const cx = bx + bw / 2;
        const cy = L.hoopPad + bh / 2;
        const rxT = L.rxT;
        const ryT = rxT * LOGO.ryRatio;
        const ring = rxT * LOGO.ringRatio;
        const w = lerp(bw, rxT * 2, eA);
        const h = lerp(bh, ryT * 2, eA);
        const geo = {
          x: cx - w / 2, y: cy - h / 2, width: w, height: h,
          rx: lerp(L.barRadius, rxT, eA), ry: lerp(L.barRadius, ryT, eA),
        };
        set(ghostBaseRef.current, { ...geo, "fill-opacity": 1 - ramp(eA, 0, 0.45), "stroke-opacity": 1 - ramp(eA, 0, 0.35) });
        set(ghostRimRef.current, {
          ...geo,
          "stroke-width": lerp(1.5, ring, eA),
          "stroke-opacity": ramp(eA, 0.04, 0.4) * (1 - ramp(eA, 0.88, 1)),
        });
        set(ghostContentRef.current, { transform: `translate(${fmt(bx)} ${fmt(L.hoopPad)})`, opacity: 1 - ramp(eA, 0, 0.22) });

        const s = rxT / LOGO.rimRx;
        const size = LOGO.size * s;
        const ix = cx - LOGO.rimCx * s;
        const iy = cy - LOGO.rimCy * s;
        set(hoopLogoRef.current, { x: ix, y: iy, width: size, height: size, opacity: ramp(eA, 0.55, 0.85) });
        set(hoopClipRef.current, { x: ix, y: iy, width: size, height: size * ramp(eA, 0.6, 1) });
      }

      // ── C: orange gradient ──
      const g = easeInOut(ramp(sy, t.cStart, t.cEnd));
      css(gradientRef.current, { opacity: g });
      css(ambientRef.current, { opacity: 1 - g });

      // ── D/E: court draws in, then the camera zooms to the rim ──
      const k = Math.min((L.contentW * 0.94) / COURT.w, (vh * 0.92) / COURT.h);
      const courtCx = L.contentLeft + L.contentW / 2;
      const rim0x = courtCx;
      const rim0y = vh * 0.05 + COURT.rimY * k;
      const pD = ramp(sy, t.dStart, t.dEnd);
      const pE = ramp(sy, t.eStart, t.eEnd);
      const zoomR = Math.min(L.contentW * 0.22, vh * 0.28, 260);
      const sMax = zoomR / (COURT.rimR * k);
      const S = lerp(1, sMax, easeIn(pE));
      const move = easeInOut(pE);
      const rimX = lerp(rim0x, courtCx, move);
      const rimY = lerp(rim0y, vh * 0.46, move);
      const sc = k * S;
      set(courtRef.current, {
        transform: `translate(${fmt(rimX)} ${fmt(rimY)}) scale(${fmt(sc)}) translate(${-COURT.rimX} ${-COURT.rimY})`,
        "stroke-width": 2 / sc,
        opacity: ramp(pD, 0, 0.04) * (1 - ramp(pE, 0.65, 1)),
      });
      const n = COURT_PATHS.length;
      courtPathRefs.current.forEach((p, i) => {
        const start = (i / n) * 0.7;
        set(p, { "stroke-dashoffset": 1 - easeOut(ramp(pD, start, start + 0.35)) });
      });

      // ── F: the rim tilts into the logo's rim, and the logo holds ──
      const eF = easeInOut(ramp(sy, t.fStart, t.fEnd));
      const logoCx = L.wide ? L.contentLeft + L.contentW * 0.74 : L.contentLeft + L.contentW / 2;
      const logoCy = vh * (L.wide ? 0.4 : 0.34);
      const RL = L.wide ? Math.min(L.contentW * 0.15, 190) : Math.min(L.contentW * 0.28, 120);
      const rimR = COURT.rimR * sc;
      const ex = lerp(rimX, logoCx, eF);
      const ey = lerp(rimY, logoCy, eF);
      const erx = lerp(rimR, RL, eF);
      const ery = lerp(rimR, RL * LOGO.ryRatio, eF);
      const rimDrawn = ramp(pD, 0.72, 0.95);
      set(rimCourtRef.current, {
        cx: ex, cy: ey, rx: erx, ry: ery,
        "stroke-width": lerp(2, RL * LOGO.ringRatio, eF),
        opacity: rimDrawn * (1 - ramp(eF, 0, 0.5)),
      });
      set(rimOrangeRef.current, {
        cx: ex, cy: ey, rx: erx, ry: ery,
        "stroke-width": lerp(2, RL * LOGO.ringRatio, eF),
        opacity: ramp(eF, 0.1, 0.5) * (1 - ramp(eF, 0.88, 1)),
      });
      const s = RL / LOGO.rimRx;
      const size = LOGO.size * s;
      const lx = logoCx - LOGO.rimCx * s;
      const ly = logoCy - LOGO.rimCy * s;
      const hold = L.wide ? 1 : 0.45; // quieter behind text on phones
      set(finalLogoRef.current, { x: lx, y: ly, width: size, height: size, opacity: ramp(eF, 0.55, 0.85) * hold });
      set(finalClipRef.current, { x: lx, y: ly, width: size, height: size * ramp(eF, 0.6, 1) });
    };

    // ── 0: the balls on the bar ──
    const drawBalls = (t: number) => {
      const L = layout;
      if (!bctx || !L?.bar || !L.balls || !rack) return;
      const { bar, balls } = L;
      bctx.clearRect(balls.left, balls.top, balls.width, balls.height);
      if (t <= 0) return;
      // The drop happens inside the "Today" stage: balls enter from its top
      // edge, which is where the canvas starts.
      const dropH = Math.max(60, bar.top - L.stageTop);

      const shown = rack.map((b) => {
        const d = dropAt(t - b.delay, dropH);
        const f = b.p * b.p; // like gravity taking over: slow to tip, quick to drop
        const r = b.r * (1 - 0.4 * f);
        const x = bar.left + bar.width * b.fx + b.drift * b.p;
        const cy = bar.top - b.r - d.above + f * L.fallDepth;
        const enter = ramp(t - b.delay, 0, 0.08);
        const alpha = enter * (1 - ramp(f, 0.3, 1));
        const spun = qAxisAngle(b.spinAxis[0], b.spinAxis[1], b.spinAxis[2], b.spin * (1 - Math.exp(-Math.max(0, t - b.delay) * 3)));
        const tipped = qAxisAngle(b.fallAxis[0], b.fallAxis[1], b.fallAxis[2], b.p * 2.4);
        const q = qMul(tipped, qMul(spun, b.q));
        return { b, d, f, r, x, cy, alpha, q };
      });

      // Contact shadows on the bar's top edge while the balls sit on it.
      for (const s of shown) {
        const near = 1 - Math.min(1, s.d.above / 120);
        const a = s.alpha * 0.34 * near * (1 - ramp(s.f, 0, 0.25));
        if (a <= 0.01) continue;
        const w = s.b.r * (2.3 - 0.7 * (1 - near));
        bctx.globalAlpha = a;
        bctx.drawImage(shadow, s.x - w / 2, bar.top - w * 0.13, w, w * 0.26);
      }
      bctx.globalAlpha = 1;
      for (const s of shown) {
        drawBall(bctx, sphere, s.x, s.cy, s.r, s.q, s.alpha, s.b.p > 0 ? 0 : s.d.squash);
      }
    };

    /**
     * Each ball tips off once the scroll passes its spot, then falls in its
     * own time; scrolling back above it hops it back onto the bar. Returns
     * whether anything is still moving.
     */
    const stepBalls = (y: number, now: number, dt: number): boolean => {
      const L = layout;
      if (!rack || !L?.balls || !bctx) return false;
      const t = (now - introStart) / 1000;
      const dropping = t < INTRO_SECONDS;
      ballSpeed += (Math.abs(y - ballY) / dt - ballSpeed) * (1 - Math.exp(-dt / 0.08));
      const go = dt * Math.min(4, 1 + ballSpeed / PACE_SPEED);
      queued = Math.max(0, queued - go);
      let moving = false;
      // One flick can pass every ball's spot in a single frame; the flips are
      // spaced out so they still peel off (or hop back) one after another.
      for (const b of y >= ballY ? byFall : byFallReversed) {
        const want = y >= b.fallAt ? 1 : 0;
        if (want !== b.target) {
          if (want !== flipDir) {
            flipDir = want;
            queued = 0;
          }
          b.target = want;
          b.wait = queued;
          queued += FALL_STAGGER;
        }
        if (b.p === b.target) continue;
        moving = true;
        const waited = Math.min(b.wait, go);
        b.wait -= waited;
        if (go === waited) continue;
        b.p = b.target ? Math.min(1, b.p + (go - waited) / FALL_SECONDS) : Math.max(0, b.p - (go - waited) / RETURN_SECONDS);
        ballsDirty = true;
      }
      ballY = y;
      if (dropping && t > 0) ballsDirty = true;
      // The canvas scrolls with the page, so scrolling alone never needs a
      // redraw — only movement does, and only while it's on screen.
      if (ballsDirty && y < L.balls.top + L.balls.height) {
        drawBalls(t);
        ballsDirty = false;
      }
      return moving || dropping;
    };

    // One loop drives everything; it runs while the eased scroll is still
    // catching up or a ball is moving, then stops until the next scroll.
    const frame = (now: number) => {
      raf = 0;
      const L = layout;
      if (!L) return;
      const dt = lastFrame ? Math.min(0.1, Math.max(0.001, (now - lastFrame) / 1000)) : 1 / 60;
      lastFrame = now;
      const y = Math.max(0, window.scrollY);
      // A jump of more than a screen (an anchor link, scroll restoration) is
      // taken at once rather than played through.
      if (Math.abs(y - easedY) > L.vh * 1.2) easedY = y;
      else easedY += (y - easedY) * (1 - Math.exp(-dt / SMOOTHING));
      if (Math.abs(y - easedY) < 0.3) easedY = y;
      render(y, easedY);
      const ballsMoving = stepBalls(y, now, dt);
      if (easedY !== y || ballsMoving) raf = requestAnimationFrame(frame);
      else lastFrame = 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const measure = () => {
      const layer = layerRef.current;
      if (!layer) return;
      // The fixed layer is 100lvh tall, so this doesn't change as a phone's
      // toolbar comes and goes.
      const vw = layer.clientWidth || window.innerWidth;
      const vh = layer.clientHeight || window.innerHeight;
      const wide = window.innerWidth >= 1024;
      const small = window.innerWidth < 640;
      const contentLeft = wide ? 240 : 0; // SITE_RAIL_OFFSET (lg:pl-60)
      const contentW = vw - contentLeft;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);

      formEl = document.querySelector<HTMLElement>("[data-story-search] form");
      inputEl = formEl?.querySelector("input") ?? null;
      const bar = layoutRect(formEl);
      const stageTop = layoutRect(document.querySelector<HTMLElement>('[data-story="top"]'))?.top ?? (bar ? bar.top - 160 : 0);
      // The page wrapper the hoop's track and the balls' canvas are placed in.
      const host = layoutRect(trackRef.current?.offsetParent as HTMLElement | null);
      const hostLeft = host?.left ?? 0;
      const hostTop = host?.top ?? 0;
      const hostW = host?.width ?? vw;
      const hostBottom = host ? host.top + host.height : maxScroll + vh;
      const anchor = (name: string) => docRect(document.querySelector(`[data-story="${name}"]`));
      const scores = anchor("scores");
      const leagues = anchor("leagues");
      const news = anchor("news");
      const media = anchor("media");
      const brand = anchor("brand");

      const barTop = bar?.top ?? 300;
      const scoresBottom = scores ? scores.top + scores.height : barTop + 900;
      const leaguesTop = leagues?.top ?? scoresBottom + 100;
      const newsBottom = news ? news.top + news.height : leaguesTop + 1400;
      const mediaTop = media?.top ?? newsBottom;
      const mediaBottom = media ? media.top + media.height : mediaTop + 1500;
      const brandTop = brand?.top ?? mediaBottom;

      const t = {
        aStart: 8,
        aEnd: Math.min(Math.max(barTop - 70, 150), 360),
        bStart: 0, bEnd: 0,
        cStart: leaguesTop - vh * 1.0,
        cEnd: leaguesTop - vh * 0.35,
        dStart: leaguesTop - vh * 0.55,
        dEnd: 0,
        eStart: 0, eEnd: 0,
        fStart: 0, fEnd: 0,
      };
      t.bStart = t.aEnd + vh * 0.2;
      t.bEnd = Math.max(t.bStart + 200, scoresBottom - vh * 0.35);
      t.dEnd = Math.max(t.dStart + vh * 0.8, newsBottom - vh * 0.8);
      t.eStart = Math.max(t.dEnd, mediaTop - vh * 0.6);
      t.eEnd = Math.max(t.eStart + vh * 0.9, mediaBottom - vh * 0.9);
      t.fStart = Math.max(t.eEnd, brandTop - vh * 1.0);
      t.fEnd = Math.max(t.fStart + vh * 0.4, brandTop - vh * 0.35);
      // The logo has to finish before the page runs out; squeeze the last
      // scenes back towards the top if the page is short.
      const cap = maxScroll - 10;
      const order: (keyof typeof t)[] = ["fEnd", "fStart", "eEnd", "eStart", "dEnd"];
      let ceiling = cap;
      for (const key of order) {
        if (t[key] > ceiling) t[key] = ceiling;
        ceiling = t[key] - 60;
      }
      if (t.dStart >= t.dEnd) t.dStart = t.dEnd - 200;

      const barRadius = formEl ? parseFloat(getComputedStyle(formEl).borderTopLeftRadius) || 16 : 16;
      const dpr = window.devicePixelRatio || 1;

      // A/B: the hoop's rim, and its layer — from the top of the logo above
      // the rim down to the foot of the net, with the bar's top edge
      // `hoopPad` down from the top.
      const bh = bar?.height ?? 0;
      const rxT = Math.max(70, Math.min((bar?.width ?? 0) * (wide ? 0.21 : 0.3), 170));
      const ls = rxT / LOGO.rimRx;
      const hoopPad = Math.ceil(Math.max(0, LOGO.rimCy * ls - bh / 2)) + 8;
      const hoopH = Math.ceil(hoopPad + bh / 2 + (LOGO.size - LOGO.rimCy) * ls) + 8;
      // The slow-down into the hang starts only once the real bar has faded
      // (by 60px), so until then the ghost stays exactly where the bar is.
      const ease = Math.max(0, Math.min((t.aEnd - t.aStart) * 0.4, 140, t.aEnd - 70));

      const track = trackRef.current;
      const hoop = hoopRef.current;
      if (track && hoop && bar) {
        // The hoop's track starts at the bar and runs to a screen past the end
        // of scene B; the hoop sticks at the top of the screen where the bar
        // reaches it at the end of scene A.
        const top = bar.top - hoopPad;
        const len = Math.max(hoopH, Math.min(t.bEnd + vh - t.aEnd + hoopH, hostBottom - top));
        track.style.top = `${top - hostTop}px`;
        track.style.height = `${len}px`;
        hoop.style.top = `${top - t.aEnd}px`;
        hoop.style.height = `${hoopH}px`;
        hoopSvgRef.current?.setAttribute("viewBox", `0 0 ${hostW} ${hoopH}`);
      }

      // 0: the balls' canvas covers the bar, the drop above it and the fall
      // below it.
      const fallDepth = small ? 150 : 190;
      let balls: Rect | null = null;
      if (ballCanvas && bctx && bar) {
        const left = Math.max(hostLeft, bar.left - 64);
        const right = Math.min(hostLeft + hostW, bar.left + bar.width + 64);
        const bottom = bar.top + bar.height + fallDepth + 48;
        balls = { left, top: stageTop, width: Math.round(right - left), height: Math.round(bottom - stageTop) };
        ballCanvas.style.left = `${left - hostLeft}px`;
        ballCanvas.style.top = `${stageTop - hostTop}px`;
        ballCanvas.style.width = `${balls.width}px`;
        ballCanvas.style.height = `${balls.height}px`;
        const cdpr = Math.min(dpr, 2);
        const size = `${balls.width}x${balls.height}x${cdpr}`;
        if (size !== canvasSize) {
          canvasSize = size;
          ballCanvas.width = Math.round(balls.width * cdpr);
          ballCanvas.height = Math.round(balls.height * cdpr);
        }
        // Drawn in document coordinates.
        bctx.setTransform(cdpr, 0, 0, cdpr, -left * cdpr, -stageTop * cdpr);
      }
      if (bar && (!rack || Math.abs(bar.width - rackWidth) > 40)) {
        rack = buildRack(bar.width, small);
        rackWidth = bar.width;
        byFall = [...rack].sort((a, b) => a.fallAt - b.fallAt);
        byFallReversed = [...byFall].reverse();
        // Arriving part-way down the page: those balls have already gone.
        const y = Math.max(0, window.scrollY);
        for (const b of rack) b.p = b.target = y >= b.fallAt ? 1 : 0;
      }

      layout = {
        vw, vh, dpr, contentLeft, contentW, wide, small,
        bar, hostLeft, stageTop, barRadius,
        rxT, hoopPad, ease, balls, fallDepth,
        t,
      };
      svgRef.current?.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
      render(Math.max(0, window.scrollY), easedY);
      // Redrawn straight away: resizing the canvas has just cleared it, and
      // this runs before the frame is painted.
      drawBalls((performance.now() - introStart) / 1000);
      ballsDirty = false;
      kick();
    };

    // Re-measure as soon as the page changes shape (sections growing as their
    // data arrives), so what rides on the page never trails it; window
    // resizes settle first. A phone's toolbar moving changes neither.
    let measureTimer = 0;
    const scheduleMeasure = () => {
      window.clearTimeout(measureTimer);
      measureTimer = window.setTimeout(measure, 120);
    };
    const ro = new ResizeObserver(() => measure());
    ro.observe(document.body);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    document.addEventListener("focusin", kick);
    document.addEventListener("focusout", kick);
    measure();
    const early = [300, 1200, 3000].map((ms) => window.setTimeout(measure, ms));

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(measureTimer);
      early.forEach((id) => window.clearTimeout(id));
      ro.disconnect();
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", scheduleMeasure);
      document.removeEventListener("focusin", kick);
      document.removeEventListener("focusout", kick);
      if (formEl) {
        formEl.style.opacity = "";
        formEl.classList.remove("is-story-hidden");
      }
    };
  }, [reduced]);

  if (reduced) return null;

  const courtLine = isDark ? "rgba(255,255,255,0.3)" : "rgba(124,45,18,0.32)";

  return (
    <>
    <div ref={layerRef} aria-hidden="true" className="ch-story-layer pointer-events-none z-0 overflow-hidden">
      {/* Before the gradient: a faint warm glow so the top isn't flat */}
      <div
        ref={ambientRef}
        className="absolute inset-0"
        style={{ background: "radial-gradient(60% 45% at 70% 10%, rgba(249,115,22,0.10) 0%, transparent 70%)", willChange: "opacity" }}
      />
      <div ref={gradientRef} className="absolute inset-0" style={{ opacity: 0, willChange: "opacity" }}>
        <div
          className="absolute inset-0 dark:hidden"
          style={{ background: "radial-gradient(120% 90% at 50% 18%, rgba(251,146,60,0.55) 0%, rgba(253,186,116,0.42) 38%, rgba(255,237,213,0.92) 75%, #fff7ed 100%)" }}
        />
        <div
          className="absolute inset-0 hidden dark:block"
          style={{ background: "radial-gradient(120% 90% at 50% 18%, rgba(249,115,22,0.55) 0%, rgba(194,65,12,0.36) 36%, rgba(67,20,7,0.6) 72%, #0d0604 100%)" }}
        />
      </div>

      <svg ref={svgRef} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <clipPath id="storyLogoClip" clipPathUnits="userSpaceOnUse">
            <rect ref={finalClipRef} x="0" y="0" width="0" height="0" />
          </clipPath>
        </defs>

        {/* D/E: the court */}
        <g ref={courtRef} fill="none" stroke={courtLine} strokeLinejoin="round" opacity="0">
          {COURT_PATHS.map((d, i) => (
            <path
              key={i}
              ref={(el) => { courtPathRefs.current[i] = el; }}
              d={d}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset="1"
            />
          ))}
        </g>

        {/* E/F: the rim — court-coloured while overhead, orange as it tilts */}
        <ellipse ref={rimCourtRef} fill="none" stroke={courtLine} opacity="0" />
        <ellipse ref={rimOrangeRef} fill="none" stroke="#f97316" opacity="0" />
        <image ref={finalLogoRef} href={SwishLogo} clipPath="url(#storyLogoClip)" opacity="0" preserveAspectRatio="xMidYMid meet" />
      </svg>
    </div>
    {/* A/B: the search bar's ghost and the hoop it becomes. Its track starts
        at the bar and runs down the page; the hoop is sticky inside it, so
        the browser carries it with the page and then hangs it, in step with
        the scroll. Drawn over the court, under the page. */}
    <div ref={trackRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-0 h-0 w-full">
      <div ref={hoopRef} className="sticky" style={{ opacity: 0, willChange: "transform, opacity" }}>
        <svg ref={hoopSvgRef} className="block h-full w-full" preserveAspectRatio="none">
          <defs>
            <clipPath id="storyHoopClip" clipPathUnits="userSpaceOnUse">
              <rect ref={hoopClipRef} x="0" y="0" width="0" height="0" />
            </clipPath>
          </defs>
          <rect ref={ghostBaseRef} fill="var(--ch-surface)" stroke="var(--ch-border-strong)" strokeWidth="1" />
          <g ref={ghostContentRef}>
            <GhostContent
              iconRef={ghostIconRef}
              textRef={ghostTextRef}
              buttonRef={ghostButtonRef}
              buttonRectRef={ghostButtonRectRef}
              buttonTextRef={ghostButtonTextRef}
            />
          </g>
          <rect ref={ghostRimRef} fill="none" stroke="#f97316" />
          <image ref={hoopLogoRef} href={SwishLogo} clipPath="url(#storyHoopClip)" opacity="0" preserveAspectRatio="xMidYMid meet" />
        </svg>
      </div>
    </div>
    <GhostLayout
      iconRef={ghostIconRef}
      textRef={ghostTextRef}
      buttonRef={ghostButtonRef}
      buttonRectRef={ghostButtonRectRef}
      buttonTextRef={ghostButtonTextRef}
    />
    {/* Scene 0's balls sit on the search bar, so they're drawn in front of
        the page rather than behind it — still pointer-events-free. The canvas
        is part of the page, so it scrolls with the bar. */}
    <canvas ref={ballCanvasRef} aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-[2] h-0 w-0" />
    </>
  );
}

type GhostRefs = {
  iconRef: React.RefObject<SVGGElement>;
  textRef: React.RefObject<SVGTextElement>;
  buttonRef: React.RefObject<SVGGElement>;
  buttonRectRef: React.RefObject<SVGRectElement>;
  buttonTextRef: React.RefObject<SVGTextElement>;
};

/** The ghost bar's insides: magnifier, placeholder and Search button. */
function GhostContent({ iconRef, textRef, buttonRef, buttonRectRef, buttonTextRef }: GhostRefs) {
  return (
    <>
      <g ref={iconRef} fill="none" stroke="var(--ch-muted)" strokeWidth="2" strokeLinecap="round">
        <circle cx="9" cy="9" r="6.5" />
        <path d="M 14 14 L 18.5 18.5" />
      </g>
      <text ref={textRef} fill="var(--ch-muted)" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
        Search any player, team or league
      </text>
      <g ref={buttonRef}>
        <rect ref={buttonRectRef} rx="12" fill="#f97316" />
        <text
          ref={buttonTextRef}
          fill="#ffffff"
          textAnchor="middle"
          style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontSize: "14px", fontWeight: 600 }}
        >
          Search
        </text>
      </g>
    </>
  );
}

/**
 * Positions the ghost bar's insides to match the real search bar — measured
 * once per layout change rather than every frame.
 */
function GhostLayout({ iconRef, textRef, buttonRef, buttonRectRef, buttonTextRef }: GhostRefs) {
  useEffect(() => {
    const place = () => {
      const form = document.querySelector("[data-story-search] form");
      if (!form) return;
      const box = form.getBoundingClientRect();
      const icon = form.querySelector("svg")?.getBoundingClientRect();
      const input = form.querySelector("input");
      const inputBox = input?.getBoundingClientRect();
      const button = form.querySelector("button[type=submit]")?.getBoundingClientRect();
      if (icon && iconRef.current) {
        const s = icon.width / 24;
        iconRef.current.setAttribute(
          "transform",
          `translate(${icon.left - box.left + 3 * s} ${icon.top - box.top + 3 * s}) scale(${s})`,
        );
      }
      if (inputBox && textRef.current && input) {
        const fs = parseFloat(getComputedStyle(input).fontSize) || 16;
        textRef.current.setAttribute("x", String(inputBox.left - box.left));
        textRef.current.setAttribute("y", String(box.height / 2 + fs * 0.36));
        textRef.current.style.fontSize = `${fs}px`;
      }
      if (buttonRef.current) {
        const visible = !!button && button.width > 0;
        buttonRef.current.setAttribute("opacity", visible ? "1" : "0");
        if (visible && button && buttonRectRef.current && buttonTextRef.current) {
          const bx = button.left - box.left;
          const by = button.top - box.top;
          buttonRectRef.current.setAttribute("x", String(bx));
          buttonRectRef.current.setAttribute("y", String(by));
          buttonRectRef.current.setAttribute("width", String(button.width));
          buttonRectRef.current.setAttribute("height", String(button.height));
          buttonTextRef.current.setAttribute("x", String(bx + button.width / 2));
          buttonTextRef.current.setAttribute("y", String(by + button.height / 2 + 5));
        }
      }
    };
    place();
    const ro = new ResizeObserver(place);
    const form = document.querySelector("[data-story-search] form");
    if (form) ro.observe(form);
    window.addEventListener("resize", place);
    // Again once the bar's entrance (ch-search-in: .12s + .8s) has finished
    // scaling it, since the measurements above include that transform.
    const again = window.setTimeout(place, 1000);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.clearTimeout(again);
    };
  }, [iconRef, textRef, buttonRef, buttonRectRef, buttonTextRef]);
  return null;
}
