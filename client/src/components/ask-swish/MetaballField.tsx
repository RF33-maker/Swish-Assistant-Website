import { useEffect, useRef, useState } from "react";

/**
 * The Ask page's living background: soft orange metaballs that drift and
 * merge behind the conversation, so Swish feels present. While an answer is
 * coming (`busy`) the blobs speed up and pulse; once a conversation is under
 * way (`dim`) they fade back so the text stays easy to read.
 *
 * Our own shader: one metaball cluster with a cream core, amber-to-ember rim
 * and film grain, wandering round the screen. It renders at
 * half resolution, pauses when the page is hidden, draws a single still frame
 * for reduced motion, and falls back to the old radial glow without WebGL.
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform float u_fade;
uniform float u_dark;
uniform vec3 u_bg;

const int N = 4;

float hash(vec2 q) {
  return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  float s = min(u_res.x, u_res.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / s;
  vec2 half_ = 0.5 * u_res / s;
  float t = u_time;

  // The whole blob wanders slowly round the screen...
  vec2 centre = vec2(
    sin(t * 0.24) * half_.x * 0.55,
    cos(t * 0.17 + 1.3) * half_.y * 0.45 + 0.05 * half_.y
  );

  // ...while its lobes circle each other closely enough to stay one shape.
  float field = 0.0;
  for (int i = 0; i < N; i++) {
    float fi = float(i);
    float a = t * (0.42 + 0.11 * fi) + fi * 1.9;
    vec2 o = vec2(cos(a), sin(a * 1.27 + fi)) * (0.062 + 0.022 * fi);
    float r = 0.112 * (0.8 + 0.2 * sin(t * 0.8 + fi * 2.1));
    r *= 1.0 + 0.12 * u_energy * sin(t * 3.1 + fi * 1.7);
    vec2 d = p - centre - o;
    field += (r * r) / (dot(d, d) + 0.0004);
  }

  // Colour ramp from the outside in: ember haze, orange, amber rim, cream core.
  vec3 ember = vec3(0.72, 0.16, 0.02);
  vec3 orange = vec3(0.976, 0.451, 0.086);
  vec3 amber = vec3(1.0, 0.74, 0.34);
  vec3 cream = vec3(1.0, 0.95, 0.88);

  vec3 col = u_bg;
  col = mix(col, ember, smoothstep(0.16, 0.75, field) * (0.75 + 0.25 * u_dark));
  col = mix(col, orange, smoothstep(0.5, 0.9, field));
  col = mix(col, amber, smoothstep(0.84, 0.97, field));
  col = mix(col, cream, smoothstep(0.95, 1.06, field) * (0.5 + 0.3 * u_dark));
  col = mix(u_bg, col, u_fade);

  // Moving film grain, like the reference.
  float n = hash(gl_FragCoord.xy + fract(t * 3.7) * 91.0);
  col += (n - 0.5) * (0.02 + 0.06 * smoothstep(0.3, 1.0, field) * u_fade);

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

export default function MetaballField({ busy, dim }: { busy: boolean; dim: boolean }) {
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

    // Half resolution: the field is smooth, so nobody sees the difference, and phones stay cool.
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
    let time = 7.3; // start mid-drift so the first frame already looks settled
    let energy = 0;
    let fade = live.current.dim ? 0.25 : 0.62;
    let last = performance.now();
    let raf = 0;

    const draw = () => {
      gl.uniform1f(uTime, time);
      gl.uniform1f(uEnergy, energy);
      gl.uniform1f(uFade, fade);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { busy: b, dim: d } = live.current;
      // Ease towards the target so changes feel like breathing, not switching.
      energy += ((b ? 1 : 0) - energy) * Math.min(1, dt * 2.5);
      fade += ((!d ? 0.62 : b ? 0.42 : 0.25) - fade) * Math.min(1, dt * 1.5);
      time += dt * (0.6 + 1.4 * energy);
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
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 flex justify-center transition-all duration-700 ${dim ? "opacity-30 top-[55%]" : "top-[12%]"}`}>
        <div className="ask-glow w-[150%] max-w-[900px] shrink-0 aspect-square rounded-full bg-[radial-gradient(closest-side,rgba(249,115,22,0.20),rgba(249,115,22,0.07)_55%,transparent)] dark:bg-[radial-gradient(closest-side,rgba(249,115,22,0.30),rgba(249,115,22,0.09)_55%,transparent)]" />
      </div>
    );
  }

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
