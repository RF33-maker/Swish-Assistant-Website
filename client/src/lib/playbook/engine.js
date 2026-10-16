/* Swish Assistant Playbook engine. Shared with the standalone playbook page; keep the two copies in step. Types: engine.d.ts */
/* Swish Assistant Playbook engine.
   createPlaybook(root, options) draws, edits and animates a basketball playbook
   inside `root`. It keeps no global state, so it can live in a standalone page
   or inside a React component (mount in an effect, call destroy() on cleanup).

   options:
     initial    playbook data ({title, intro, sections}); a blank playbook if omitted
     save       async (data) => void. Throw {code:"conflict"|"readonly", message} to report why it failed.
                Without it the Save button explains that saving isn't available.
     draftKey   localStorage key for unsaved edits on this device
     download   (filename, text) => void. Enables "Export file" when provided.
     barMode    "fixed" (pinned to the bottom of the window) or "sticky" (sticks inside the page)
     idleStatus text the bar shows when there is nothing to save
*/
var PB_COUNT = 0;
var PB_NS = "http://www.w3.org/2000/svg";

function pbBlankPlay(title) {
  return { tag: "", title: title || "New play", sub: "", check: false, reads: [], note: "",
    frames: [{ cap: "", pl: [[1, 120, 152, 1], [2, 216, 24, 0], [3, 24, 24, 0], [4, 62, 132, 0], [5, 120, 118, 0]], ac: [] }] };
}
function pbBlankPlaybook(title) {
  return {
    title: title || "Team Playbook",
    intro: "Tap Edit to draw plays, then Play to watch them run.",
    sections: [
      { id: "offence", title: "Offence", sub: "sets and series", plays: [pbBlankPlay("First play")] },
      { id: "blobs", title: "BLOBs", sub: "baseline out of bounds", tables: [{ cols: ["Call", "Action"], rows: [["", ""]] }] },
      { id: "defence", title: "Defence", sub: "calls", tables: [{ cols: ["Call", "Coverage"], rows: [["", ""]] }] },
    ],
  };
}

function createPlaybook(root, options) {
  var o = Object.assign({ initial: null, save: null, draftKey: "swish-playbook-draft", download: null, barMode: "fixed",
    idleStatus: "Tap Edit to change any play.", editable: true }, options || {});
  var editable = o.editable !== false;
  var uid = "pb" + (++PB_COUNT);
  var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
  var state = normalize(o.initial ? clone(o.initial) : pbBlankPlaybook());
  var editing = false, dirty = false, hist = [], readOnly = false, busy = false, destroyed = false;
  var toolOf = new WeakMap(), copyUI = new WeakMap(), running = new Set();
  var SW = { green: "#2e9b55", black: "#111", red: "#d33a2c", blue: "#2f6fd0", yellow: "#f2c230", white: "#fff", orange: "#f97316", purple: "#7b4bc4" };
  var TOOLS = [["move", "Move"], ["pass", "Pass"], ["run", "Off-ball"], ["cut", "Cut"], ["dribble", "Dribble"], ["screen", "Screen"], ["ball", "Ball"], ["erase", "Erase"]];
  var RANK = ["run", "cut", "dribble", "screen"];
  var AH = uid + "-ah", AHB = uid + "-ahb";

  function normalize(s) {
    s = s && typeof s === "object" ? s : {};
    s.title = s.title || "Team Playbook"; s.intro = s.intro || "";
    s.sections = Array.isArray(s.sections) ? s.sections : [];
    s.sections.forEach(function (sec, i) {
      sec.id = sec.id || "sec" + i + "-" + Math.random().toString(36).slice(2, 7);
      sec.title = sec.title || ""; sec.sub = sec.sub || "";
      if (sec.plays) sec.plays.forEach(function (p) {
        p.tag = p.tag || ""; p.title = p.title || ""; p.sub = p.sub || ""; p.reads = p.reads || []; p.note = p.note || "";
        p.frames = (p.frames && p.frames.length) ? p.frames : pbBlankPlay().frames;
        p.frames.forEach(function (f) { f.cap = f.cap || ""; f.pl = f.pl || []; f.ac = f.ac || []; });
      });
      if (sec.tables) sec.tables.forEach(function (t) { t.cols = t.cols || ["Call", "Action"]; t.rows = t.rows || []; });
    });
    return s;
  }

  /* ---------- shell ---------- */
  root.classList.add("pb");
  root.innerHTML =
    '<svg class="pb-defs" aria-hidden="true"><defs>' +
    '<marker id="' + AH + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--pb-ink)"/></marker>' +
    '<marker id="' + AHB + '" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--pb-ball)"/></marker>' +
    '</defs></svg>' +
    '<div class="pb-bar ' + (o.barMode === "sticky" ? "is-sticky" : "is-fixed") + '" role="toolbar" aria-label="Edit playbook"><div class="pb-bar-in">' +
    '<span class="pb-status" aria-live="polite"></span>' +
    '<button type="button" data-act="undo" hidden>Undo</button>' +
    '<button type="button" data-act="save" class="is-primary" hidden>Save</button>' +
    '<button type="button" data-act="edit">Edit</button></div></div>' +
    '<div class="pb-wrap"></div>';
  var bar = root.querySelector(".pb-bar");
  if (o.barMode !== "sticky") root.appendChild(bar);
  var app = root.querySelector(".pb-wrap");
  var statusEl = root.querySelector(".pb-status");
  var undoBtn = root.querySelector('[data-act="undo"]'), saveBtn = root.querySelector('[data-act="save"]'), editBtn = root.querySelector('[data-act="edit"]');
  var draftBanner = null;

  /* ---------- helpers ---------- */
  function h(tag, attrs) {
    var e = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    for (var k in attrs || {}) {
      if (k === "on") for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    kids.forEach(function (c) { if (c != null) e.append(c); });
    return e;
  }
  function el(n, a, parent) { var e = document.createElementNS(PB_NS, n); for (var k in a) e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; }
  function setStatus(t) { statusEl.textContent = t; }
  function pushHist() { hist.push(JSON.stringify(state)); if (hist.length > 80) hist.shift(); updBar(); }
  function changed() { dirty = true; try { localStorage.setItem(o.draftKey, JSON.stringify(state)); } catch (e) {} updBar(); }
  function struct(fn) { pushHist(); fn(); changed(); renderAll(); }
  function edt(tag, get, set, opt) {
    opt = opt || {};
    var e = h(tag, { class: opt.cls || null, "data-ph": opt.ph || "Type here" }); e.textContent = get() || "";
    if (editing) {
      e.setAttribute("contenteditable", "true"); e.spellcheck = true;
      var pushed = false;
      e.addEventListener("focus", function () { pushed = false; });
      e.addEventListener("input", function () { if (!pushed) { pushHist(); pushed = true; } set(e.textContent); changed(); });
      e.addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); e.blur(); } });
      e.addEventListener("paste", function (ev) { ev.preventDefault(); var t = (ev.clipboardData || window.clipboardData).getData("text"); document.execCommand("insertText", false, t.replace(/\s+/g, " ")); });
      if (opt.blur) e.addEventListener("blur", function () { opt.blur(e); });
    }
    return e;
  }
  function btn(label, cls, fn) { return h("button", { type: "button", class: "pb-mini " + (cls || ""), on: { click: fn } }, label); }
  function twoTap(label, fn) {
    var b = btn(label, "is-danger pb-edit-only", function () {
      if (b.classList.contains("is-armed")) fn();
      else { b.classList.add("is-armed"); b.textContent = "Tap again to delete"; setTimeout(function () { b.classList.remove("is-armed"); b.textContent = label; }, 3000); }
    });
    return b;
  }

  /* ---------- geometry: smooth routes through every waypoint ---------- */
  function segs(pts) {
    var n = pts.length, out = [];
    if (n < 2) return [[pts[0].slice(), pts[0].slice()]];
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)], s = [];
      for (var j = 0; j <= 12; j++) {
        var t = j / 12, t2 = t * t, t3 = t2 * t;
        s.push([0, 1].map(function (k) { return 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3); }));
      }
      out.push(s);
    }
    return out;
  }
  function sample(pts) { var out = []; segs(pts).forEach(function (s, i) { out.push.apply(out, i ? s.slice(1) : s); }); return out; }
  function segDist(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; var t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); }
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var md = 0, mi = 0;
    for (var i = 1; i < pts.length - 1; i++) { var d = segDist(pts[i], pts[0], pts[pts.length - 1]); if (d > md) { md = d; mi = i; } }
    if (md <= eps) return [pts[0], pts[pts.length - 1]];
    return rdp(pts.slice(0, mi + 1), eps).slice(0, -1).concat(rdp(pts.slice(mi), eps));
  }
  function trim(s, start, end) {
    function cut(arr, len) { var d = 0; while (arr.length > 2) { var a = arr[0], b = arr[1], seg = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d + seg > len) { var r = (len - d) / seg; arr[0] = [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]; break; } d += seg; arr.shift(); } return arr; }
    if (start) s = cut(s, start); if (end) s = cut(s.reverse(), end).reverse(); return s;
  }
  function toD(s) { return "M" + s.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L"); }
  function zig(s) {
    var out = [s[0]], acc = 0, k = 0;
    for (var i = 1; i < s.length; i++) {
      var a = s[i - 1], b = s[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; acc += seg;
      if (acc >= 5 && i < s.length - 3) { acc = 0; k++; var nx = -(b[1] - a[1]) / seg, ny = (b[0] - a[0]) / seg, off = k % 2 ? 4 : -4; out.push([b[0] + nx * off, b[1] + ny * off]); }
    }
    out.push(s[s.length - 1]); return out;
  }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function onPlayer(fr, q) { return fr.pl.some(function (s) { return dist([s[1], s[2]], q) < 4; }); }
  function wpIdx(fr, a) { return a.p.map(function (q, i) { return i; }).filter(function (i) { return !onPlayer(fr, a.p[i]); }); }

  /* ---------- court drawing ---------- */
  function court(svg) {
    var g = el("g", { fill: "none", style: "stroke:var(--pb-courtline)", "stroke-width": "1.2" }, svg);
    el("line", { x1: 4, y1: 8, x2: 236, y2: 8 }, g); el("rect", { x: 92, y: 8, width: 56, height: 90 }, g);
    el("path", { d: "M92,98 A28,28 0 0 0 148,98" }, g); el("path", { d: "M92,98 A28,28 0 0 1 148,98", "stroke-dasharray": "3 3" }, g);
    el("path", { d: "M18,8 L18,52 A104,104 0 0 0 222,52 L222,8" }, g);
    el("line", { x1: 108, y1: 20, x2: 132, y2: 20, "stroke-width": "2" }, g);
    el("circle", { cx: 120, cy: 27, r: 6, style: "stroke:var(--pb-ball)" }, g);
    el("line", { x1: 4, y1: 196, x2: 236, y2: 196 }, g);
  }
  function drawAction(svg, fr, a, opacity) {
    var spots = fr.pl.map(function (p) { return [p[1], p[2]]; });
    var near = function (q) { return spots.some(function (s) { return dist(s, q) < 4; }); };
    var s = sample(a.p), first = s[0], last = s[s.length - 1];
    s = trim(s, near(first) ? 11 : 0, a.t === "screen" ? 0 : (near(last) ? 12 : 2));
    if (s.length < 2) return;
    var stroke = a.t === "pass" ? "var(--pb-ball)" : "var(--pb-ink)", g = el("g", { opacity: opacity || 1 }, svg);
    if (a.t === "screen") {
      var b = s[s.length - 2], c = s[s.length - 1], L = dist(b, c) || 1, nx = -(c[1] - b[1]) / L * 7, ny = (c[0] - b[0]) / L * 7;
      el("path", { d: toD(s), fill: "none", style: "stroke:" + stroke, "stroke-width": "2" }, g);
      el("line", { x1: c[0] + nx, y1: c[1] + ny, x2: c[0] - nx, y2: c[1] - ny, style: "stroke:" + stroke, "stroke-width": "2.6", "stroke-linecap": "round" }, g);
    } else {
      el("path", { d: toD(a.t === "dribble" ? zig(s) : s), fill: "none", style: "stroke:" + stroke, "stroke-width": a.t === "run" ? "1.8" : "1.7",
        "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": a.t === "pass" ? "5 4" : a.t === "run" ? "0.5 4" : "none",
        "marker-end": "url(#" + (a.t === "pass" ? AHB : AH) + ")" }, g);
    }
  }
  function drawPlayers(svg, list) {
    list.forEach(function (q) {
      el("circle", { cx: q.x, cy: q.y, r: 9, style: q.ball ? "fill:var(--pb-ball-soft);stroke:var(--pb-ball)" : "fill:var(--pb-court);stroke:var(--pb-ink)", "stroke-width": "1.6" }, svg);
      var t = el("text", { x: q.x, y: q.y + 4, "text-anchor": "middle", "font-size": "11", "font-weight": "700", style: "fill:var(--pb-ink);font-family:var(--pb-body);pointer-events:none;user-select:none" }, svg);
      t.textContent = q.n;
    });
  }
  function drawFrame(fr, preview, thumb) {
    var svg = el("svg", { viewBox: "0 0 240 200", role: "img", "aria-label": fr.cap || "Court diagram" });
    court(svg);
    fr.ac.forEach(function (a) { drawAction(svg, fr, a); });
    if (preview) drawAction(svg, fr, preview, 0.6);
    if (!thumb && editing && (toolOf.get(fr) || "move") === "move") fr.ac.forEach(function (a) {
      wpIdx(fr, a).forEach(function (i) { el("circle", { cx: a.p[i][0], cy: a.p[i][1], r: 4.5, style: "fill:var(--pb-accent);stroke:var(--pb-court)", "stroke-width": "1.5" }, svg); });
      if (a.p.length === 2) { var s = sample(a.p), m = s[Math.floor(s.length / 2)]; el("circle", { cx: m[0], cy: m[1], r: 4, style: "fill:var(--pb-court);stroke:var(--pb-accent)", "stroke-width": "1.5" }, svg); }
    });
    drawPlayers(svg, fr.pl.map(function (q) { return { n: q[0], x: q[1], y: q[2], ball: q[3] }; }));
    return svg;
  }

  /* ---------- editing a step ---------- */
  function toSvg(svg, e) { var r = svg.getBoundingClientRect(); return [Math.max(4, Math.min(236, (e.clientX - r.left) / r.width * 240)), Math.max(4, Math.min(196, (e.clientY - r.top) / r.height * 200))]; }
  function hitPlayer(fr, p) { var best = -1, bd = 14; fr.pl.forEach(function (q, i) { var d = dist([q[1], q[2]], p); if (d < bd) { bd = d; best = i; } }); return best; }
  function hitWaypoint(fr, p) { var best = null; fr.ac.forEach(function (a, ai) { wpIdx(fr, a).forEach(function (i) { var d = dist(a.p[i], p); if (d < 10 && (!best || d < best.d)) best = { a: ai, i: i, d: d }; }); }); return best; }
  function nearestSeg(pts, p) { var bj = 0, bd = 1e9; segs(pts).forEach(function (s, j) { s.forEach(function (q) { var d = dist(q, p); if (d < bd) { bd = d; bj = j; } }); }); return bj; }
  function hitAction(fr, p) { var best = -1, bd = 10; fr.ac.forEach(function (a, i) { sample(a.p).forEach(function (s) { var d = dist(s, p); if (d < bd) { bd = d; best = i; } }); }); return best; }
  function snap(fr, p) { var i = hitPlayer(fr, p); return i >= 0 ? [fr.pl[i][1], fr.pl[i][2]] : p.map(Math.round); }
  function buildRoute(fr, t, raw, final) {
    if (raw.length < 2) return null;
    var eps = 3, pts = rdp(raw, eps);
    while (pts.length > 12) { eps *= 1.5; pts = rdp(raw, eps); }
    pts = pts.map(function (q) { return q.map(Math.round); });
    pts[0] = snap(fr, raw[0]); if (final) pts[pts.length - 1] = snap(fr, raw[raw.length - 1]);
    if (final && dist(pts[0], pts[pts.length - 1]) < 8 && pts.length < 3) return null;
    return { t: t, p: pts };
  }
  /* A player's off-ball run, cut or dribble also sets where they stand in the next step. */
  function carryToNext(play, fi, fr, a) {
    var next = play.frames[fi + 1];
    if (!next || ["run", "cut", "dribble"].indexOf(a.t) < 0) return false;
    var own = fr.pl.find(function (q) { return dist([q[1], q[2]], a.p[0]) < 4; }); if (!own) return false;
    var end = a.p[a.p.length - 1];
    if (fr.pl.some(function (q) { return q !== own && dist([q[1], q[2]], end) < 4; })) return false;
    var q = next.pl.find(function (q) { return q[0] === own[0]; }); if (!q) return false;
    var old = [q[1], q[2]]; if (dist(old, end) < 1) return false;
    q[1] = end[0]; q[2] = end[1];
    next.ac.forEach(function (b) { [0, b.p.length - 1].forEach(function (j) { if (dist(b.p[j], old) < 3) b.p[j] = end.slice(); }); });
    return true;
  }
  function frameFigure(play, fr, fi) {
    var holder = h("div", { class: "pb-court" });
    var redraw = function (prev) { holder.replaceChildren(drawFrame(fr, prev)); };
    redraw();
    var tools = h("div", { class: "pb-tools", role: "group", "aria-label": "Drawing tool" });
    var cur = function () { return toolOf.get(fr) || "move"; };
    TOOLS.forEach(function (tl) {
      var b = h("button", { type: "button", "aria-pressed": String(cur() === tl[0]) }, tl[1]);
      b.addEventListener("click", function () { toolOf.set(fr, tl[0]); Array.prototype.forEach.call(tools.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); }); redraw(); });
      tools.append(b);
    });
    var drag = null, lastTap = null;
    holder.addEventListener("pointerdown", function (e) {
      if (!editing) return;
      var p = toSvg(holder.querySelector("svg"), e), tool = cur();
      if (tool === "move") {
        var pi = hitPlayer(fr, p), hw = hitWaypoint(fr, p), dp = pi >= 0 ? dist([fr.pl[pi][1], fr.pl[pi][2]], p) : 1e9;
        if (hw && hw.d < dp) drag = { k: "wp", a: hw.a, i: hw.i };
        else if (pi >= 0) drag = { k: "pl", i: pi };
        else { var ai = hitAction(fr, p); if (ai >= 0) drag = { k: "ins", a: ai, j: nearestSeg(fr.ac[ai].p, p) }; }
      } else if (tool === "ball") {
        var bi = hitPlayer(fr, p);
        if (bi >= 0) { pushHist(); var had = fr.pl[bi][3]; fr.pl.forEach(function (q) { q[3] = 0; }); if (!had) fr.pl[bi][3] = 1; changed(); redraw(); }
      } else if (tool === "erase") {
        var ei = hitAction(fr, p); if (ei >= 0) { pushHist(); fr.ac.splice(ei, 1); changed(); redraw(); }
      } else drag = { k: "new", t: tool, raw: [p] };
      if (drag) { drag.moved = false; holder.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    holder.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = toSvg(holder.querySelector("svg"), e).map(Math.round);
      if (drag.k === "new") { if (dist(drag.raw[drag.raw.length - 1], p) >= 3) { drag.raw.push(p); redraw(buildRoute(fr, drag.t, drag.raw, false)); } return; }
      if (!drag.moved) pushHist(); drag.moved = true;
      if (drag.k === "ins") { fr.ac[drag.a].p.splice(drag.j + 1, 0, p); drag.k = "wp"; drag.i = drag.j + 1; }
      if (drag.k === "pl") {
        var q = fr.pl[drag.i], old = [q[1], q[2]]; q[1] = p[0]; q[2] = p[1];
        fr.ac.forEach(function (a) { [0, a.p.length - 1].forEach(function (j) { if (dist(a.p[j], old) < 3) a.p[j] = p.slice(); }); });
        redraw();
      } else if (drag.k === "wp") { fr.ac[drag.a].p[drag.i] = p; redraw(); }
    });
    function end() {
      if (!drag) return;
      if (drag.k === "new") {
        var a = buildRoute(fr, drag.t, drag.raw, true);
        if (a) { pushHist(); fr.ac.push(a); if (carryToNext(play, fi, fr, a)) { drag = null; changed(); renderAll(); return; } changed(); }
      } else if (drag.moved) {
        if (drag.k === "wp") {
          var r = fr.ac[drag.a], i = drag.i;
          if (i === 0 || i === r.p.length - 1) { r.p[i] = snap(fr, r.p[i]); if (i > 0 && carryToNext(play, fi, fr, r)) { changed(); drag = null; renderAll(); return; } }
          else if (segDist(r.p[i], r.p[i - 1], r.p[i + 1]) < 3) r.p.splice(i, 1);
        }
        changed();
      } else if (drag.k === "wp") {
        var now = Date.now(), w = fr.ac[drag.a];
        if (lastTap && lastTap.a === drag.a && lastTap.i === drag.i && now - lastTap.t < 450 && drag.i > 0 && drag.i < w.p.length - 1) { pushHist(); w.p.splice(drag.i, 1); changed(); lastTap = null; }
        else lastTap = { a: drag.a, i: drag.i, t: now };
      }
      drag = null; redraw();
    }
    holder.addEventListener("pointerup", end); holder.addEventListener("pointercancel", end);
    var cap = h("figcaption", null, play.frames.length > 1 ? h("b", null, String(fi + 1)) : null,
      edt("span", function () { return fr.cap; }, function (v) { fr.cap = v; }, { ph: "What happens in this step" }),
      btn("Duplicate", "pb-edit-only", function () { struct(function () { play.frames.splice(fi + 1, 0, clone(fr)); }); }),
      play.frames.length > 1 ? twoTap("Delete step", function () { struct(function () { play.frames.splice(fi, 1); }); }) : null);
    return h("figure", null, tools, holder, cap);
  }

  /* ---------- copying steps between plays ---------- */
  function isFresh(pl) { return pl.frames.length === 1 && !pl.frames[0].ac.length && !(pl.frames[0].cap || "").trim(); }
  function copyPanel(pl) {
    var ui = copyUI.get(pl), list = [];
    state.sections.forEach(function (sec) { (sec.plays || []).forEach(function (p) { if (p.frames.length) list.push({ sec: sec, p: p }); }); });
    if (!ui.src || !list.some(function (x) { return x.p === ui.src; })) {
      var first = list.find(function (x) { return x.p !== pl; }) || list[0];
      ui.src = first && first.p; ui.sel = new Set(ui.src ? ui.src.frames.map(function (f, i) { return i; }) : []);
    }
    var panel = h("div", { class: "pb-copy" });
    if (!ui.src) { panel.append(h("p", { class: "pb-sub" }, "There are no other plays with steps to copy yet.")); return panel; }
    var select = h("select", { "aria-label": "Copy steps from" }), curSec = null, group = null;
    list.forEach(function (x, i) {
      if (x.sec !== curSec) { curSec = x.sec; group = h("optgroup", { label: x.sec.title || "Section" }); select.append(group); }
      var n = x.p.frames.length;
      var label = (x.p.tag ? x.p.tag + ": " : "") + (x.p.title || "Untitled") + " (" + n + (n === 1 ? " step)" : " steps)") + (x.p === pl ? " (this play)" : "");
      var opt = h("option", { value: String(i) }, label); if (x.p === ui.src) opt.selected = true; group.append(opt);
    });
    select.addEventListener("change", function () { ui.src = list[+select.value].p; ui.sel = new Set(ui.src.frames.map(function (f, i) { return i; })); renderAll(); });
    var addBtn = h("button", { type: "button", class: "pb-mini is-primary" });
    var updAdd = function () { var n = ui.sel.size; addBtn.textContent = n ? "Add " + n + (n === 1 ? " step" : " steps") : "Pick at least one step"; addBtn.disabled = !n; };
    var grid = h("div", { class: "pb-steps" });
    ui.src.frames.forEach(function (fr, i) {
      var b = h("button", { type: "button", "aria-pressed": String(ui.sel.has(i)), title: fr.cap || "" }, drawFrame(fr, null, true), h("span", null, "Step " + (i + 1)));
      b.addEventListener("click", function () { if (ui.sel.has(i)) ui.sel.delete(i); else ui.sel.add(i); b.setAttribute("aria-pressed", String(ui.sel.has(i))); updAdd(); });
      grid.append(b);
    });
    var fresh = isFresh(pl), pos = h("div", { class: "pb-tools", role: "group", "aria-label": "Where to put them" });
    if (!fresh) [["start", "At the start"], ["end", "At the end"]].forEach(function (kl) {
      var b = h("button", { type: "button", "aria-pressed": String(ui.pos === kl[0]) }, kl[1]);
      b.addEventListener("click", function () { ui.pos = kl[0]; Array.prototype.forEach.call(pos.children, function (c) { c.setAttribute("aria-pressed", String(c === b)); }); });
      pos.append(b);
    });
    addBtn.addEventListener("click", function () {
      struct(function () {
        var copies = Array.from(ui.sel).sort(function (a, b) { return a - b; }).map(function (i) { return clone(ui.src.frames[i]); });
        if (isFresh(pl)) pl.frames = copies; else if (ui.pos === "start") pl.frames.unshift.apply(pl.frames, copies); else pl.frames.push.apply(pl.frames, copies);
        copyUI.delete(pl);
      });
    });
    updAdd();
    panel.append(h("div", { class: "pb-copy-row" }, h("strong", null, "Copy from"), select),
      h("p", { class: "pb-sub" }, "Tap a step to leave it out."), grid,
      fresh ? h("p", { class: "pb-sub" }, "They'll replace this play's empty step.") : h("div", { class: "pb-copy-row" }, h("strong", null, "Put them"), pos),
      h("div", { class: "pb-row" }, addBtn, btn("Cancel", "", function () { copyUI.delete(pl); renderAll(); })));
    return panel;
  }

  /* ---------- rendering ---------- */
  function renderTable(sec, tb) {
    var wrap = h("div", { class: "pb-tbl" }), t = h("table");
    t.append(h("thead", null, h("tr", null, tb.cols.map(function (c, ci) { return h("th", null, edt("span", function () { return c; }, function (v) { tb.cols[ci] = v; })); }).concat(editing ? [h("th", null)] : []).reduce(function (f, x) { f.append(x); return f; }, document.createDocumentFragment()))));
    var body = h("tbody");
    tb.rows.forEach(function (r, ri) {
      var tr = h("tr");
      r.forEach(function (c, ci) {
        var td = h("td", { class: ci === 0 ? "pb-call" : null });
        if (ci === 0) { var col = SW[(c || "").trim().split(/\s+/)[0].toLowerCase()]; if (col) td.append(h("span", { class: "pb-sw", style: "background:" + col })); }
        td.append(edt("span", function () { return c; }, function (v) { r[ci] = v; }, { ph: ci === 0 ? "Call" : "Action" }));
        tr.append(td);
      });
      if (editing) tr.append(h("td", null, btn("Remove", "is-danger", function () { struct(function () { tb.rows.splice(ri, 1); }); })));
      body.append(tr);
    });
    if (!tb.rows.length) body.append(h("tr", null, h("td", { class: "pb-empty-row", colspan: String(tb.cols.length) }, "Nothing here yet. Tap Edit, then Add row.")));
    t.append(body); wrap.append(t);
    return h("div", { style: "display:flex;flex-direction:column;gap:8px;min-width:0" }, wrap,
      h("div", { class: "pb-row pb-edit-only" }, btn("+ Add row", "", function () { struct(function () { tb.rows.push(tb.cols.map(function () { return ""; })); }); })));
  }
  function renderPlay(sec, pl, pi) {
    var art = h("article", { class: "pb-play" }), head = h("div", { class: "pb-play-head" });
    if (pl.tag || editing) head.append(edt("span", function () { return pl.tag; }, function (v) { pl.tag = v; }, { cls: "pb-tag", ph: "Label" }));
    head.append(edt("h3", function () { return pl.title; }, function (v) { pl.title = v; }, { ph: "Play name" }));
    if (pl.check) head.append(h("span", { class: "pb-check" }, "Check"));
    art.append(head);
    if (pl.sub || editing) art.append(edt("p", function () { return pl.sub; }, function (v) { pl.sub = v; }, { cls: "pb-sub", ph: "One-line summary" }));
    if (pl.reads.length || editing) {
      var ol = h("ol", { class: "pb-reads" });
      pl.reads.forEach(function (r, ri) { ol.append(h("li", null, edt("span", function () { return r; }, function (v) { pl.reads[ri] = v; }, { ph: "Read", blur: function (e) { if (!e.textContent.trim()) struct(function () { pl.reads.splice(ri, 1); }); } }))); });
      art.append(ol, h("div", { class: "pb-row pb-edit-only" }, btn("+ Add read", "", function () { struct(function () { pl.reads.push("New read"); }); })));
    }
    var frames = h("div", { class: "pb-frames" });
    pl.frames.forEach(function (fr, fi) { frames.append(frameFigure(pl, fr, fi)); });
    var viewer = h("div", { class: "pb-anim", hidden: "" });
    var playBtn = h("button", { type: "button", class: "pb-mini pb-play-btn" }, "▶ Play");
    playBtn.addEventListener("click", function () { animate(pl, viewer, playBtn); });
    art.append(h("div", { class: "pb-row" }, playBtn), viewer, frames);
    if (pl.note || editing) art.append(edt("p", function () { return pl.note; }, function (v) { pl.note = v; }, { cls: "pb-note", ph: "Coaching note (optional)" }));
    if (editing && copyUI.has(pl)) art.append(copyPanel(pl));
    art.append(h("div", { class: "pb-row pb-edit-only" },
      btn("Copy steps from another play", "", function () { if (copyUI.has(pl)) copyUI.delete(pl); else copyUI.set(pl, { pos: "start" }); renderAll(); }),
      btn("Duplicate play", "", function () { struct(function () { sec.plays.splice(pi + 1, 0, Object.assign(clone(pl), { title: pl.title + " (copy)" })); }); }),
      btn("+ Add step", "", function () { struct(function () { var last = pl.frames[pl.frames.length - 1]; pl.frames.push({ cap: "", pl: last ? clone(last.pl) : pbBlankPlay().frames[0].pl, ac: [] }); }); }),
      btn(pl.check ? "Mark as correct" : "Flag to check", "", function () { struct(function () { pl.check = !pl.check; }); }),
      twoTap("Delete play", function () { struct(function () { sec.plays.splice(pi, 1); }); })));
    return art;
  }
  function legend() {
    var L = h("div", { class: "pb-legend", "aria-label": "Diagram key" });
    L.innerHTML =
      '<span><svg width="34" height="10"><line x1="2" y1="5" x2="30" y2="5" style="stroke:var(--pb-ink)" stroke-width="1.6" marker-end="url(#' + AH + ')"/></svg>Cut</span>' +
      '<span><svg width="34" height="10"><line x1="2" y1="5" x2="30" y2="5" style="stroke:var(--pb-ink)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="0.5 4" marker-end="url(#' + AH + ')"/></svg>Off-ball run</span>' +
      '<span><svg width="34" height="10"><line x1="2" y1="5" x2="30" y2="5" style="stroke:var(--pb-ball)" stroke-width="1.6" stroke-dasharray="4 3" marker-end="url(#' + AHB + ')"/></svg>Pass</span>' +
      '<span><svg width="34" height="12"><path d="M2,6 l4,-4 l4,8 l4,-8 l4,8 l4,-4 L30,6" fill="none" style="stroke:var(--pb-ink)" stroke-width="1.5" marker-end="url(#' + AH + ')"/></svg>Dribble</span>' +
      '<span><svg width="34" height="14"><line x1="2" y1="7" x2="28" y2="7" style="stroke:var(--pb-ink)" stroke-width="2"/><line x1="28" y1="1" x2="28" y2="13" style="stroke:var(--pb-ink)" stroke-width="2.4"/></svg>Screen</span>' +
      '<span><svg width="20" height="20"><circle cx="10" cy="10" r="8" style="fill:var(--pb-ball-soft);stroke:var(--pb-ball)" stroke-width="1.6"/></svg>Has the ball</span>';
    return L;
  }
  function importFile() {
    var input = h("input", { type: "file", accept: "application/json,.json", style: "display:none" });
    input.addEventListener("change", function () {
      var f = input.files && input.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(String(rd.result));
          if (!d || !Array.isArray(d.sections)) throw new Error("not a playbook");
          struct(function () { state = normalize(d); });
          setStatus("Imported " + f.name + ". Tap Save to keep it.");
        } catch (e) { setStatus("That file isn't a playbook export."); }
      };
      rd.readAsText(f); input.remove();
    });
    root.append(input); input.click();
  }
  function renderAll() {
    if (destroyed) return;
    stopAll();
    root.classList.toggle("is-editing", editing);
    var header = h("header", { class: "pb-head" },
      edt("h1", function () { return state.title; }, function (v) { state.title = v; }, { ph: "Playbook name" }),
      (state.intro || editing) ? edt("p", function () { return state.intro; }, function (v) { state.intro = v; }, { ph: "Intro" }) : null);
    var nav = h("nav", { class: "pb-nav", "aria-label": "Playbook sections" });
    state.sections.forEach(function (s) {
      nav.append(h("button", { type: "button", on: { click: function () { var t = app.querySelector('[data-sec="' + s.id + '"]'); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); } } }, s.title || "Section"));
    });
    if (state.sections.length > 1) header.append(nav);
    var kids = [header];
    if (editing) {
      var hint = h("div", { class: "pb-hint" },
        h("span", null, "Pass, Off-ball, Cut, Dribble, Screen: draw the route with your finger, starting on the player. A player's off-ball run, cut or dribble also sets where they stand in the next step."),
        h("span", null, "Move: drag a player; drag a dot to reshape a route; drag anywhere on a line to add a bend; double-tap a dot to remove it. Ball: tap who has it. Erase: tap a line. Tap any text to retype it."));
      var fileRow = h("div", { class: "pb-row" }, btn("Import file", "", importFile));
      if (o.download) fileRow.append(btn("Export file", "", function () { o.download((state.title || "playbook").replace(/[^\w-]+/g, "-").toLowerCase() + ".json", JSON.stringify(state, null, 2)); }));
      hint.append(fileRow);
      kids.push(hint);
    }
    if (draftBanner) kids.push(draftBanner);
    kids.push(legend());
    state.sections.forEach(function (sec, si) {
      var s = h("section", { class: "pb-sec", "data-sec": sec.id });
      s.append(h("h2", null,
        edt("span", function () { return sec.title; }, function (v) { sec.title = v; }, { ph: "Section" }),
        edt("small", function () { return sec.sub; }, function (v) { sec.sub = v; }, { ph: "subtitle" }),
        twoTap("Delete section", function () { struct(function () { state.sections.splice(si, 1); }); })));
      if (sec.tables) {
        var w = h("div", { class: sec.tables.length > 1 ? "pb-two" : null });
        sec.tables.forEach(function (tb) { w.append(renderTable(sec, tb)); });
        s.append(w);
      }
      if (sec.plays) {
        sec.plays.forEach(function (pl, pi) { s.append(renderPlay(sec, pl, pi)); });
        if (!sec.plays.length && !editing) s.append(h("p", { class: "pb-sub" }, "No plays yet. Tap Edit to add one."));
        s.append(h("div", { class: "pb-row pb-edit-only" }, btn("+ Add play to " + (sec.title || "this section"), "", function () { struct(function () { sec.plays.push(pbBlankPlay()); }); })));
      }
      kids.push(s);
    });
    var newId = function () { return "sec-" + Math.random().toString(36).slice(2, 8); };
    kids.push(h("div", { class: "pb-row pb-edit-only" },
      btn("+ Add plays section", "", function () { struct(function () { state.sections.push({ id: newId(), title: "New section", sub: "", plays: [pbBlankPlay()] }); }); }),
      btn("+ Add calls table", "", function () { struct(function () { state.sections.push({ id: newId(), title: "Calls", sub: "", tables: [{ cols: ["Call", "Action"], rows: [["", ""]] }] }); }); })));
    app.replaceChildren.apply(app, kids);
    updBar();
  }

  /* ---------- animation ---------- */
  function pathLen(p) { var L = 0; for (var i = 1; i < p.length; i++) L += dist(p[i - 1], p[i]); return L; }
  function along(p, t) {
    if (p.length < 2) return p[0];
    var L = pathLen(p) * Math.max(0, Math.min(1, t)), d = 0;
    for (var i = 1; i < p.length; i++) { var s = dist(p[i - 1], p[i]); if (d + s >= L) { var r = s ? (L - d) / s : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * r, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * r]; } d += s; }
    return p[p.length - 1];
  }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function ownerMap(fr) { return fr.ac.map(function (a) { if (a.t === "pass") return -1; var b = -1, bd = 10; fr.pl.forEach(function (q, i) { var d = dist([q[1], q[2]], a.p[0]); if (d < bd) { bd = d; b = i; } }); return b; }); }
  function planStep(pl, k) {
    var fr = pl.frames[k], next = pl.frames[k + 1], own = ownerMap(fr), used = new Set();
    var movers = fr.pl.map(function (q0, pi) {
      var start = [q0[1], q0[2]], ai = -1;
      for (var r = 0; r < RANK.length && ai < 0; r++) ai = fr.ac.findIndex(function (a, i) { return own[i] === pi && a.t === RANK[r]; });
      var path = [start];
      for (var g = 0; ai >= 0 && g < 4; g++) {
        used.add(ai);
        var s = sample(fr.ac[ai].p.map(function (q) { return q.slice(); })); path = path.concat(s.slice(1)); var e = s[s.length - 1];
        ai = fr.ac.findIndex(function (a, i) { return !used.has(i) && own[i] === -1 && a.t !== "pass" && dist(a.p[0], e) < 10; });
      }
      var nq = next && next.pl.find(function (q) { return q[0] === q0[0]; });
      var endPt = nq ? [nq[1], nq[2]] : path[path.length - 1];
      if (dist(path[path.length - 1], endPt) > 1) path = path.concat([endPt]);
      return { n: q0[0], path: path };
    });
    return { fr: fr, movers: movers, passes: fr.ac.filter(function (a) { return a.t === "pass"; }).map(function (a) { return sample(a.p); }), holder0: (fr.pl.find(function (q) { return q[3]; }) || [])[0] };
  }
  function drawAnim(svg, st, t) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    court(svg);
    st.fr.ac.forEach(function (a) { drawAction(svg, st.fr, a, 0.28); });
    var pos = {}; st.movers.forEach(function (m) { pos[m.n] = along(m.path, ease(t)); });
    var np = st.passes.length, holder = st.holder0, ball = null;
    for (var j = 0; j < np; j++) {
      var a = 0.1 + 0.8 * j / np, b = a + 0.8 * 0.7 / np;
      if (t < a) break;
      if (t < b) { ball = along(st.passes[j], (t - a) / (b - a)); holder = null; break; }
      var e = st.passes[j][st.passes[j].length - 1], best = null, bd = 1e9;
      for (var n in pos) { var d = dist(pos[n], e); if (d < bd) { bd = d; best = +n; } }
      holder = best;
    }
    drawPlayers(svg, st.movers.map(function (m) { return { n: m.n, x: pos[m.n][0], y: pos[m.n][1], ball: holder === m.n && !ball }; }));
    if (ball) el("circle", { cx: ball[0], cy: ball[1], r: 5, style: "fill:var(--pb-ball);stroke:var(--pb-court)", "stroke-width": "1.5" }, svg);
  }
  function stopAll() { running.forEach(function (c) { c.stop(); }); running.clear(); }
  function animate(pl, viewer, playBtn) {
    var prev = Array.from(running).find(function (c) { return c.viewer === viewer; });
    if (prev) { prev.stop(); return; }
    if (!pl.frames.length) return;
    viewer.hidden = false;
    var svg = el("svg", { viewBox: "0 0 240 200", role: "img", "aria-label": "Animated play" });
    var cap = h("p", { class: "pb-anim-cap", "aria-live": "polite" });
    viewer.replaceChildren(h("div", { class: "pb-court" }, svg), cap);
    var STEP = 1900, HOLD = 600, n = pl.frames.length, k = 0, t0 = performance.now(), raf = 0;
    var setCap = function () { cap.textContent = (n > 1 ? "Step " + (k + 1) + " of " + n + ": " : "") + (pl.frames[k].cap || ""); };
    var st = planStep(pl, 0); setCap(); playBtn.textContent = "■ Stop";
    var ctl = { viewer: viewer, stop: function () { cancelAnimationFrame(raf); running.delete(ctl); viewer.hidden = true; viewer.replaceChildren(); playBtn.textContent = "▶ Play"; } };
    running.add(ctl);
    var tick = function (now) {
      var e = now - t0;
      drawAnim(svg, st, Math.min(1, e / STEP));
      if (e >= STEP + HOLD) {
        if (k < n - 1) { k++; st = planStep(pl, k); setCap(); t0 = now; }
        else { running.delete(ctl); playBtn.textContent = "↻ Replay"; cap.textContent += " (end)"; return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  /* ---------- bar, save, drafts ---------- */
  function updBar() {
    bar.hidden = !editable;
    editBtn.textContent = editing ? "Done" : "Edit";
    undoBtn.hidden = !editing; undoBtn.disabled = !hist.length;
    saveBtn.hidden = !dirty; saveBtn.disabled = readOnly || busy;
    if (!busy) {
      if (dirty && !readOnly) setStatus(o.save ? "Unsaved changes" : "Saving isn't available here. Your edits are kept on this device.");
      else if (!dirty && !statusEl.textContent) setStatus(o.idleStatus);
    }
  }
  editBtn.addEventListener("click", function () { editing = !editing; if (!editing && !dirty) setStatus(o.idleStatus); renderAll(); });
  undoBtn.addEventListener("click", function () { if (!hist.length) return; state = JSON.parse(hist.pop()); changed(); renderAll(); });
  saveBtn.addEventListener("click", function () {
    if (!o.save) { setStatus("Saving isn't available here. Your edits are kept on this device."); return; }
    busy = true; setStatus("Saving…"); updBar();
    Promise.resolve().then(function () { return o.save(clone(state)); }).then(function () {
      busy = false; dirty = false; try { localStorage.removeItem(o.draftKey); } catch (e) {} setStatus("Saved"); updBar();
    }, function (err) {
      busy = false;
      var c = err && err.code;
      if (c === "readonly") { readOnly = true; setStatus((err && err.message) || "This view is read-only. Your edits are kept on this device."); }
      else if (c === "conflict") setStatus((err && err.message) || "Someone else saved a newer version. Reload to see it.");
      else setStatus((err && err.message) || "Couldn't save. Check your connection and tap Save again.");
      updBar();
    });
  });
  function offerDraft() {
    var d = null; try { d = localStorage.getItem(o.draftKey); } catch (e) {}
    if (!d || d === JSON.stringify(state)) return;
    draftBanner = h("div", { class: "pb-banner" }, h("span", { style: "flex:1;min-width:180px" }, "You have unsaved edits on this device."),
      btn("Restore them", "", function () { pushHist(); try { state = normalize(JSON.parse(d)); } catch (e) {} draftBanner = null; dirty = true; renderAll(); }),
      btn("Discard", "is-danger", function () { try { localStorage.removeItem(o.draftKey); } catch (e) {} draftBanner = null; renderAll(); }));
  }

  if (editable) offerDraft();
  renderAll();
  setStatus(o.idleStatus);

  return {
    getState: function () { return clone(state); },
    isDirty: function () { return dirty; },
    setStatus: setStatus,
    /* View-only hides the edit bar; viewers can still read every play and press Play. */
    setEditable: function (v) { editable = !!v; if (!editable && editing) { editing = false; renderAll(); } updBar(); },
    destroy: function () { destroyed = true; stopAll(); root.replaceChildren(); root.classList.remove("pb", "is-editing"); },
  };
}

export { createPlaybook, pbBlankPlaybook, pbBlankPlay };
