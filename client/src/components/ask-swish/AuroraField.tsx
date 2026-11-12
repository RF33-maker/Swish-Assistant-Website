import { useEffect, useRef, useState } from "react";

/**
 * The Ask page's living background: curtains of orange aurora light that
 * sway slowly behind the conversation, in the same family as the aurora in
 * the app Home's Ask switch. While an answer is coming (`busy`) the curtains
 * speed up, swing wider and glow brighter; once a conversation is under way
 * (`dim`) they fade back so the text stays easy to read.
 *
 * It replaced MetaballField (the orange "metal ball"), which is kept as it
 * was: AskSwishPanel's ASK_BACKGROUND picks between them.
 *
 * Our own shader: three wavy bands with rising rays, mixed over the panel's
 * background in light mode and added as light in dark mode, plus film grain.
 * It renders at half resolution, pauses when the page is hidden, draws a
 * single still frame for reduced motion, and falls back to a soft gradient
 * without WebGL.
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// highp where the GPU has it: phones run mediump at half precision, which
// turns the noise behind the rays blocky.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform float u_fade;
uniform float u_dark;
uniform vec3 u_bg;

float hash(vec2 q) {
  return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 q) {
  vec2 i = floor(q);
  vec2 f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 q) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(q);
    q *= 2.03;
    a *= 0.5;
  }
  return v;
}

// One curtain: a folding band with a bright, crisp lower edge and light that
// streams upwards from it in fine rays, the way an aurora hangs in the sky.
float curtain(vec2 p, float base, float amp, float freq, float speed, float width, float seed, float t) {
  float x = p.x * freq + seed;
  float sway = (fbm(vec2(x * 0.6 + t * speed, seed)) - 0.5) * 2.0;
  float y = base + amp * (1.0 + 0.45 * u_energy) * sway + 0.04 * sin(x * 1.4 + t * speed * 2.5);
  float d = p.y - y;
  float body = d > 0.0 ? exp(-d / (width * 2.4)) : exp(-(d * d) / (width * width * 0.12));
  float haze = exp(-(d * d) / (width * width * 6.0)) * 0.3;
  // Rays: tall thin streaks that ride the fold and drift slowly sideways.
  float r = noise(vec2((p.x + sway * 0.06) * 26.0 + seed * 7.0 + t * 0.08, p.y * 0.9 - t * 0.05 + seed));
  float rays = 0.3 + 0.7 * smoothstep(0.2, 0.9, r);
  return body * rays + haze;
}

void main() {
  float s = min(u_res.x, u_res.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / s;
  // A slight tilt, so the light runs across the screen rather than level.
  p.y += 0.16 * p.x;
  float t = u_time;

  // Up in the "sky", above the question box, so the small print and the
  // suggestions underneath sit on calm background.
  float c1 = curtain(p, 0.24, 0.13, 1.5, 0.050, 0.08, 1.7, t);
  float c2 = curtain(p, 0.46, 0.11, 2.0, 0.065, 0.06, 4.3, t * 1.1);
  float c3 = 0.4 * curtain(p, -0.42, 0.14, 1.2, 0.040, 0.10, 8.9, t * 0.9);

  vec3 orange = vec3(0.976, 0.451, 0.086);
  vec3 amber = vec3(1.0, 0.72, 0.28);
  vec3 ember = vec3(0.90, 0.30, 0.08);
  vec3 rose = vec3(0.98, 0.45, 0.50);

  float total = c1 + c2 + c3;
  vec3 light = orange * c1 + amber * c2 + mix(ember, rose, 0.3) * c3;
  float glow = (1.0 + 0.3 * u_energy) * u_fade;

  vec3 col;
  if (u_dark > 0.5) {
    // Added as light, rolled off so the brightest folds glow rather than
    // blow out behind the greeting's grey text.
    vec3 l = light * glow * 1.15;
    col = u_bg + l / (1.0 + 0.45 * l);
  } else {
    vec3 hue = light / max(total, 0.001);
    col = mix(u_bg, hue, clamp(total * glow, 0.0, 0.6));
  }
  // Where curtains cross, a warm cream core (barely, in dark mode).
  col = mix(col, vec3(1.0, 0.94, 0.86), smoothstep(1.1, 1.7, total) * (u_dark > 0.5 ? 0.1 : 0.35) * u_fade);

  // Moving film grain, as on the rest of the Ask page.
  float n = hash(gl_FragCoord.xy + fract(t * 3.7) * 91.0);
  col += (n - 0.5) * (0.02 + 0.04 * clamp(total, 0.0, 1.0) * u_fade);

  gl_FragColor = vec4(col, 1.0);
}
`;

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;

// The panel's own backgrounds (slate-50 / #0a0a0f), so the canvas edge never shows.
const BG = { dark: hex("#0a0a0f"), light: hex("#f8fafc") };

function isDark() {
  return document.documentElement.classList.contains("dark");
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function AuroraField({ busy, dim }: { busy: boolean; dim: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ busy, dim });
  live.current = { busy, dim };
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return setFailed(true);

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return setFailed(true);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return setFailed(true);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("u_res"), uTime = u("u_time"), uEnergy = u("u_energy"), uFade = u("u_fade"), uDark = u("u_dark"), uBg = u("u_bg");

    let dark = isDark();
    const applyTheme = () => {
      gl.uniform3fv(uBg, dark ? BG.dark : BG.light);
      gl.uniform1f(uDark, dark ? 1 : 0);
    };
    applyTheme();

    // Half resolution: the light is soft, so nobody sees the difference, and phones stay cool.
    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw();
    });
    ro.observe(canvas);

    const themeObserver = new MutationObserver(() => {
      const next = isDark();
      if (next === dark) return;
      dark = next;
      applyTheme();
      if (still) draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let time = 11.4; // start mid-sway so the first frame already looks settled
    let energy = 0;
    let fade = live.current.dim ? 0.3 : 0.7;
    let last = performance.now();
    let raf = 0;

    const draw = () => {
      gl.uniform1f(uTime, time);
      gl.uniform1f(uEnergy, energy);
      gl.uniform1f(uFade, fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // An opaque canvas is black until its first frame, so it stays hidden till then.
      canvas.style.opacity = "1";
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { busy: b, dim: d } = live.current;
      // Ease towards the target so changes feel like breathing, not switching.
      energy += ((b ? 1 : 0) - energy) * Math.min(1, dt * 2);
      fade += ((!d ? 0.7 : b ? 0.55 : 0.3) - fade) * Math.min(1, dt * 1.5);
      time += dt * (0.8 + 2.6 * energy);
      draw();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (still || raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    if (still) draw();
    else start();

    return () => {
      stop();
      ro.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  if (failed) {
    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${dim ? "opacity-40" : ""} bg-[radial-gradient(120%_60%_at_30%_75%,rgba(249,115,22,0.22),transparent_70%),radial-gradient(90%_45%_at_80%_55%,rgba(251,191,36,0.18),transparent_70%)]`}
      />
    );
  }

  return <canvas ref={canvasRef} aria-hidden="true" style={{ opacity: 0 }} className="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500" />;
}
