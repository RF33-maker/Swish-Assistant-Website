import { useEffect, useRef } from "react";
import SwishLogo from "@/assets/Swish Assistant Logo.png";
import { useIsDarkMode } from "@/hooks/useReadableColor";
import { prefersReducedMotion } from "@/components/home/motion";
import { drawBall, makeShadowSprite, makeSphereSprite, qAxisAngle, qMul, qRandom, type Quat } from "@/components/home/story/ballKit";

/**
 * The homepage's scroll story — one fixed layer behind the page (plus a
 * canvas in front of it for the basketballs), every frame a pure function of
 * scroll position, so scrolling back up plays it in reverse:
 *
 *   0. On arrival a handful of basketballs drop onto the top of the search
 *      bar, bounce and come to rest along it. The moment the visitor
 *      scrolls, they tip off one by one and fall away, shrinking and fading
 *      — and the bar carries straight on into the hoop.
 *   A. The search bar morphs into a hoop. A ghost of the bar (drawn to match
 *      it exactly) takes over as the real bar fades, shrinks into an orange
 *      rim and the Swish logo's net drops from it.
 *   B. The hoop hangs while the scores and performance cards slide over it,
 *      and fades out behind them.
 *   C. The background warms into an orange gradient.
 *   D. A FIBA half court draws itself, line by line.
 *   E. The camera zooms into the rim.
 *   F. The rim tilts from an overhead circle into the logo's rim ellipse, the
 *      logo's net drops in, and the Swish logo holds to the end of the page.
 *
 * Scenes are anchored to the page's sections (data-story="…" wrappers), not
 * to fixed pixel offsets, so the story stays in step with the content at any
 * screen size and as sections load in. Attributes are written straight to
 * the SVG from one rAF per scroll frame — no React renders while scrolling.
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

// ── The balls that rest on the search bar ──
const BALL_GRAVITY = 2600; // px/s²
const BALL_RESTITUTION = 0.42;
const FALL_SCROLL = 80; // px of scroll over which one ball falls away

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
  contentLeft: number;
  contentW: number;
  wide: boolean;
  bar: Rect | null; // document coordinates
  stageTop: number; // top of the "Today" bar, in document coordinates
  barRadius: number;
  icon: Rect | null; // relative to the bar
  input: Rect | null;
  button: Rect | null;
  inputFont: number;
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

function relRect(el: Element | null, to: DOMRect): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return null;
  return { left: r.left - to.left, top: r.top - to.top, width: r.width, height: r.height };
}

export default function ScrollStory() {
  const isDark = useIsDarkMode();
  const reduced = prefersReducedMotion();

  const svgRef = useRef<SVGSVGElement>(null);
  const ambientRef = useRef<HTMLDivElement>(null);
  const gradientRef = useRef<HTMLDivElement>(null);
  // Scene A/B
  const hoopRef = useRef<SVGGElement>(null);
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

    // Scene 0: the balls. Built once the bar has been measured; rebuilt only
    // if the bar's width changes a lot (their random layout stays put).
    const ballCanvas = ballCanvasRef.current;
    const bctx = ballCanvas?.getContext("2d") ?? null;
    const sphere = makeSphereSprite(160);
    const shadow = makeShadowSprite(96);
    let rack: RackBall[] | null = null;
    let rackWidth = 0;
    let canvasSize = "";
    // After the search bar has swept into place (ch-search-in), so the balls
    // land on a bar that's already settled.
    const introStart = performance.now() + 750;
    const INTRO_SECONDS = 2.4;
    let introRaf = 0;

    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const wide = vw >= 1024;
      const contentLeft = wide ? 240 : 0; // SITE_RAIL_OFFSET (lg:pl-60)
      const contentW = vw - contentLeft;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);

      const form = document.querySelector<HTMLElement>("[data-story-search] form");
      const formBox = form?.getBoundingClientRect() ?? null;
      const bar = layoutRect(form);
      const stageTop = layoutRect(document.querySelector<HTMLElement>('[data-story="top"]'))?.top ?? (bar ? bar.top - 160 : 0);
      const input = form?.querySelector("input") ?? null;
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

      if (ballCanvas && bctx) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const size = `${vw}x${vh}x${dpr}`;
        if (size !== canvasSize) {
          canvasSize = size;
          ballCanvas.width = Math.round(vw * dpr);
          ballCanvas.height = Math.round(vh * dpr);
          bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
      }
      if (bar && (!rack || Math.abs(bar.width - rackWidth) > 40)) {
        rack = buildRack(bar.width, vw < 640);
        rackWidth = bar.width;
      }

      layout = {
        vw, vh, contentLeft, contentW, wide,
        bar,
        stageTop,
        barRadius: form ? parseFloat(getComputedStyle(form).borderTopLeftRadius) || 16 : 16,
        icon: formBox ? relRect(form!.querySelector("svg"), formBox) : null,
        input: formBox ? relRect(input, formBox) : null,
        button: formBox ? relRect(form!.querySelector("button[type=submit]"), formBox) : null,
        inputFont: input ? parseFloat(getComputedStyle(input).fontSize) || 16 : 16,
        t,
      };
      svgRef.current?.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
      update();
    };

    const set = (el: Element | null | undefined, attrs: Record<string, string | number>) => {
      if (!el) return;
      for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    };

    const update = () => {
      const L = layout;
      if (!L) return;
      const y = window.scrollY;
      const { vw, vh, t } = L;

      // ── A/B: search bar → hoop, then hang and fade behind the cards ──
      const eA = easeInOut(ramp(y, t.aStart, t.aEnd));
      const form = document.querySelector<HTMLElement>("[data-story-search] form");
      if (form) {
        // The real bar fades as its ghost takes over. Kept solid while in use.
        const inUse = form.contains(document.activeElement) || !!form.querySelector("input")?.value;
        form.style.opacity = inUse ? "1" : String(1 - ramp(y, 6, 60));
      }
      if (L.bar) {
        const { left: bx, width: bw, height: bh } = L.bar;
        const follow = Math.min(y, t.aEnd);
        const hang = Math.max(0, y - t.aEnd);
        const barTop = L.bar.top - follow - hang * 0.12; // slow parallax once it hangs
        const cx = bx + bw / 2;
        const cy = barTop + bh / 2;
        const rxT = Math.max(70, Math.min(bw * (L.wide ? 0.21 : 0.3), 170));
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
        set(ghostContentRef.current, { transform: `translate(${bx} ${barTop})`, opacity: 1 - ramp(eA, 0, 0.22) });

        const s = rxT / LOGO.rimRx;
        const size = LOGO.size * s;
        const ix = cx - LOGO.rimCx * s;
        const iy = cy - LOGO.rimCy * s;
        set(hoopLogoRef.current, { x: ix, y: iy, width: size, height: size, opacity: ramp(eA, 0.55, 0.85) });
        set(hoopClipRef.current, { x: ix, y: iy, width: size, height: size * ramp(eA, 0.6, 1) });
      }
      // Hidden at the very top: the real bar is there, and its entrance
      // animation would otherwise let the ghost's edge peek out.
      set(hoopRef.current, { opacity: ramp(y, 1, 8) * (1 - ramp(y, t.bStart, t.bEnd)) });

      // ── C: orange gradient ──
      const g = easeInOut(ramp(y, t.cStart, t.cEnd));
      if (gradientRef.current) gradientRef.current.style.opacity = String(g);
      if (ambientRef.current) ambientRef.current.style.opacity = String(1 - g);

      // ── D/E: court draws in, then the camera zooms to the rim ──
      const k = Math.min((L.contentW * 0.94) / COURT.w, (vh * 0.92) / COURT.h);
      const courtCx = L.contentLeft + L.contentW / 2;
      const rim0x = courtCx;
      const rim0y = vh * 0.05 + COURT.rimY * k;
      const pD = ramp(y, t.dStart, t.dEnd);
      const pE = ramp(y, t.eStart, t.eEnd);
      const zoomR = Math.min(L.contentW * 0.22, vh * 0.28, 260);
      const sMax = zoomR / (COURT.rimR * k);
      const S = lerp(1, sMax, easeIn(pE));
      const move = easeInOut(pE);
      const rimX = lerp(rim0x, courtCx, move);
      const rimY = lerp(rim0y, vh * 0.46, move);
      const sc = k * S;
      set(courtRef.current, {
        transform: `translate(${rimX} ${rimY}) scale(${sc}) translate(${-COURT.rimX} ${-COURT.rimY})`,
        "stroke-width": 2 / sc,
        opacity: ramp(pD, 0, 0.04) * (1 - ramp(pE, 0.65, 1)),
      });
      const n = COURT_PATHS.length;
      courtPathRefs.current.forEach((p, i) => {
        if (!p) return;
        const start = (i / n) * 0.7;
        p.setAttribute("stroke-dashoffset", String(1 - easeOut(ramp(pD, start, start + 0.35))));
      });

      // ── F: the rim tilts into the logo's rim, and the logo holds ──
      const eF = easeInOut(ramp(y, t.fStart, t.fEnd));
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

      drawBalls(y);
      void vw;
    };

    // ── 0: the balls on the bar ──
    const drawBalls = (y: number) => {
      const L = layout;
      if (!bctx || !L) return;
      bctx.clearRect(0, 0, L.vw, L.vh);
      if (!L.bar || !rack) return;
      const t = (performance.now() - introStart) / 1000;
      if (t <= 0) return;
      const barTop = L.bar.top - y; // screen
      const restH = (b: RackBall) => Math.max(60, L.bar!.top - b.r - (L.stageTop - b.r)); // drop height

      bctx.save();
      // The drop happens inside the "Today" stage: balls enter from its top edge.
      bctx.beginPath();
      bctx.rect(0, L.stageTop - y, L.vw, L.vh);
      bctx.clip();

      const shown = rack.map((b) => {
        const d = dropAt(t - b.delay, restH(b));
        const fall = ramp(y, b.fallAt, b.fallAt + FALL_SCROLL);
        const f = fall * fall; // eases in, like gravity taking over
        const scale = 1 - 0.4 * f;
        const r = b.r * scale;
        const x = L.bar!.left + L.bar!.width * b.fx + b.drift * f;
        const cy = barTop - b.r - d.above + f * (L.vw < 640 ? 150 : 190);
        const enter = ramp(t - b.delay, 0, 0.08);
        const alpha = enter * (1 - ramp(f, 0.3, 1));
        const spun = qAxisAngle(b.spinAxis[0], b.spinAxis[1], b.spinAxis[2], b.spin * (1 - Math.exp(-Math.max(0, t - b.delay) * 3)));
        const tipped = qAxisAngle(b.fallAxis[0], b.fallAxis[1], b.fallAxis[2], f * 2.4);
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
        bctx.drawImage(shadow, s.x - w / 2, barTop - w * 0.13, w, w * 0.26);
      }
      bctx.globalAlpha = 1;
      for (const s of shown) {
        drawBall(bctx, sphere, s.x, s.cy, s.r, s.q, s.alpha, s.f > 0 ? 0 : s.d.squash);
      }
      bctx.restore();
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    // Re-measure when the page's shape changes: resizes, and sections
    // growing as their data arrives.
    let measureTimer = 0;
    const scheduleMeasure = () => {
      window.clearTimeout(measureTimer);
      measureTimer = window.setTimeout(measure, 120);
    };
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(document.body);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    const focusChange = () => update();
    document.addEventListener("focusin", focusChange);
    document.addEventListener("focusout", focusChange);
    measure();
    const early = [300, 1200, 3000].map((ms) => window.setTimeout(measure, ms));
    // The drop is time-based, so it gets its own frames until it settles;
    // after that, balls only redraw on scroll like the rest of the story.
    const introTick = () => {
      update();
      if (performance.now() < introStart + INTRO_SECONDS * 1000) introRaf = requestAnimationFrame(introTick);
    };
    introRaf = requestAnimationFrame(introTick);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(introRaf);
      window.clearTimeout(measureTimer);
      early.forEach((id) => window.clearTimeout(id));
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleMeasure);
      document.removeEventListener("focusin", focusChange);
      document.removeEventListener("focusout", focusChange);
      const form = document.querySelector<HTMLElement>("[data-story-search] form");
      if (form) form.style.opacity = "";
    };
  }, [reduced]);

  if (reduced) return null;

  const courtLine = isDark ? "rgba(255,255,255,0.3)" : "rgba(124,45,18,0.32)";

  return (
    <>
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Before the gradient: a faint warm glow so the top isn't flat */}
      <div
        ref={ambientRef}
        className="absolute inset-0"
        style={{ background: "radial-gradient(60% 45% at 70% 10%, rgba(249,115,22,0.10) 0%, transparent 70%)" }}
      />
      <div ref={gradientRef} className="absolute inset-0" style={{ opacity: 0 }}>
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
          <clipPath id="storyHoopClip" clipPathUnits="userSpaceOnUse">
            <rect ref={hoopClipRef} x="0" y="0" width="0" height="0" />
          </clipPath>
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

        {/* A/B: the search bar's ghost and the hoop it becomes */}
        <g ref={hoopRef} opacity="0">
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
        </g>
      </svg>
      <GhostLayout
        iconRef={ghostIconRef}
        textRef={ghostTextRef}
        buttonRef={ghostButtonRef}
        buttonRectRef={ghostButtonRectRef}
        buttonTextRef={ghostButtonTextRef}
      />
    </div>
    {/* Scene 0's balls sit on the search bar, so they're drawn in front of
        the page rather than behind it — still pointer-events-free. */}
    <canvas ref={ballCanvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[2] h-full w-full" />
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
    const again = window.setTimeout(place, 800);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.clearTimeout(again);
    };
  }, [iconRef, textRef, buttonRef, buttonRectRef, buttonTextRef]);
  return null;
}
