/* Hydra Studio · studio.js
 * The "workshop" sections of the panel: Curve, Expressions, Timer, Morph and Glass.
 * This file is the shared core (panes, controls, the animation loop) plus the Curve pane.
 * The other panes live in studio-expr.js, studio-timer.js, studio-morph.js and studio-glass.js and register themselves here.
 * Everything here is written from scratch for Hydra; nothing is copied from other panels.
 */
(function () {
  "use strict";

  var E = null;                    // environment handed over by app.js
  var panes = {}, built = {}, cur = null, curId = "", running = false, lastTs = 0, root = null;

  // ------------------------------------------------------------------ small helpers
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined && html !== null) e.innerHTML = html; return e; }
  function sv(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag), k;
    for (k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function hexToRgb(hex) {
    var s = String(hex || "").replace(/^#/, "");
    if (s.length === 3) s = s.replace(/(.)/g, "$1$1");
    if (!/^[0-9a-f]{6}$/i.test(s)) return [255, 216, 0];
    return [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)];
  }
  function rgbToHex(c) {
    return "#" + c.map(function (v) { var x = clamp(Math.round(v), 0, 255).toString(16); return x.length < 2 ? "0" + x : x; }).join("").toUpperCase();
  }
  function rgba(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a + ")"; }
  function accent() { return hexToRgb(E && E.accent ? E.accent() : "#FFD800"); }
  function fixed(v, d) { var s = (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); return s; }
  function trimNum(v, d) { return String(round(v, d === undefined ? 3 : d)); }

  // ------------------------------------------------------------------ shared controls
  // a labelled slider row: label · track · value. opts: { label, min, max, step, value, fmt(v), onInput(v), onChange(v) }
  function slider(o) {
    var row = mk("label", "srow"), lab = mk("span", "sl", esc(o.label)), r = mk("input", "range"), val = mk("b", "sv");
    r.type = "range"; r.min = String(o.min); r.max = String(o.max); r.step = String(o.step || 1);
    row.appendChild(lab); row.appendChild(r); row.appendChild(val);
    var api = {
      el: row, input: r, label: lab,
      get: function () { return Number(r.value); },
      paint: function () {
        var v = Number(r.value), mn = Number(r.min), mx = Number(r.max);
        r.style.setProperty("--p", (mx > mn ? (v - mn) / (mx - mn) * 100 : 0) + "%");
        val.textContent = o.fmt ? o.fmt(v) : String(v);
      },
      set: function (v) { r.value = String(v); api.paint(); },
      range: function (mn, mx, step) { r.min = String(mn); r.max = String(mx); if (step) r.step = String(step); api.paint(); },
      setLabel: function (t) { lab.textContent = t; },
      setFmt: function (f) { o.fmt = f; api.paint(); },
      show: function (on) { row.style.display = on ? "" : "none"; }
    };
    r.value = String(o.value);
    r.addEventListener("input", function () { api.paint(); if (o.onInput) o.onInput(Number(r.value)); });
    r.addEventListener("change", function () { if (o.onChange) o.onChange(Number(r.value)); });
    r.addEventListener("dblclick", function () { if (o.def !== undefined) { api.set(o.def); if (o.onInput) o.onInput(o.def); if (o.onChange) o.onChange(o.def); } });
    api.paint();
    return api;
  }

  // a segmented control: options = [[value, label, title?]]
  function seg(options, value, onChange, cls) {
    var box = mk("div", "seg " + (cls || "")), btns = {};
    options.forEach(function (o) {
      var b = mk("button", o[0] === value ? "on" : "", esc(o[1]));
      b.type = "button";
      if (o[2]) b.title = o[2];
      b.addEventListener("click", function () { api.set(o[0]); onChange(o[0]); });
      btns[o[0]] = b; box.appendChild(b);
    });
    var api = {
      el: box,
      set: function (v) { Object.keys(btns).forEach(function (k) { btns[k].classList.toggle("on", String(k) === String(v)); }); },
      show: function (on) { box.style.display = on ? "" : "none"; }
    };
    return api;
  }

  function toggle(label, value, onChange) {
    var row = mk("div", "trow"), t = mk("span", "tl", esc(label)), sw = mk("button", "switch" + (value ? " on" : ""));
    sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-checked", value ? "true" : "false");
    row.appendChild(t); row.appendChild(sw);
    var api = {
      el: row, on: !!value,
      set: function (v) { api.on = !!v; sw.classList.toggle("on", api.on); sw.setAttribute("aria-checked", api.on ? "true" : "false"); },
      show: function (on) { row.style.display = on ? "" : "none"; }
    };
    sw.addEventListener("click", function () { api.set(!api.on); onChange(api.on); });
    row.addEventListener("click", function (e) { if (e.target !== sw) sw.click(); });
    return api;
  }

  function head(title, right) {
    var h = mk("div", "shead"), t = mk("span", "", esc(title));
    h.appendChild(t);
    if (right) h.appendChild(right);
    return h;
  }
  function ghostBtn(label, onClick, title) {
    var b = mk("button", "gbtn", label);
    b.type = "button"; if (title) b.title = title;
    b.addEventListener("click", onClick);
    return b;
  }
  function note(text) { return mk("p", "snote", esc(text)); }

  // swatches: list of hex strings, value hex, optional custom picker
  function swatches(list, value, onChange, custom) {
    var box = mk("div", "swrow"), items = [];
    function setVal(v) {
      items.forEach(function (it) { it.b.classList.toggle("on", it.hex.toUpperCase() === String(v).toUpperCase()); });
      if (cust) { var known = list.some(function (x) { return x.toUpperCase() === String(v).toUpperCase(); }); cust.classList.toggle("on", !known); cust.style.setProperty("--sw", v); }
    }
    list.forEach(function (hx) {
      var b = mk("button", "ssw"); b.type = "button"; b.style.background = hx; b.title = hx;
      b.addEventListener("click", function () { setVal(hx); onChange(hx); });
      items.push({ b: b, hex: hx }); box.appendChild(b);
    });
    var cust = null;
    if (custom) {
      cust = mk("label", "ssw custom"); cust.title = "Pick a color";
      var inp = mk("input"); inp.type = "color"; inp.value = (/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff");
      inp.addEventListener("input", function () { var v = rgbToHex(hexToRgb(inp.value)); setVal(v); onChange(v); });
      cust.appendChild(inp); box.appendChild(cust);
    }
    setVal(value);
    return { el: box, set: setVal };
  }

  // ------------------------------------------------------------------ canvases
  // keeps a canvas sharp on high-density screens; returns the css size
  function fit(cv) {
    var r = cv.getBoundingClientRect(), w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    var d = Math.min(2, window.devicePixelRatio || 1);
    if (cv.__w !== w || cv.__h !== h || cv.__d !== d) {
      cv.width = Math.round(w * d); cv.height = Math.round(h * d);
      cv.__w = w; cv.__h = h; cv.__d = d; cv.__dirty = true;
    }
    return { w: w, h: h, d: d, dirty: cv.__dirty };
  }
  function rrect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r);
    g.closePath();
  }

  // the dark preview stage every pane shares
  function stage(ratio) {
    var box = mk("div", "pstage"), cv = mk("canvas"), name = mk("span", "pstage-name"), tag = mk("span", "pstage-tag");
    box.style.paddingTop = (ratio || 56.25) + "%";
    box.appendChild(cv); box.appendChild(name); box.appendChild(tag);
    return { el: box, cv: cv, name: name, tag: tag };
  }

  // ------------------------------------------------------------------ cubic-bezier maths
  function bezX(b, t) { var u = 1 - t; return 3 * u * u * t * b[0] + 3 * u * t * t * b[2] + t * t * t; }
  function bezY(b, t) { var u = 1 - t; return 3 * u * u * t * b[1] + 3 * u * t * t * b[3] + t * t * t; }
  function dbezX(b, t) { var u = 1 - t; return 3 * u * u * b[0] + 6 * u * t * (b[2] - b[0]) + 3 * t * t * (1 - b[2]); }
  function dbezY(b, t) { var u = 1 - t; return 3 * u * u * b[1] + 6 * u * t * (b[3] - b[1]) + 3 * t * t * (1 - b[3]); }
  function solveT(b, x) {
    var t = x, i, e, d, lo = 0, hi = 1;
    for (i = 0; i < 6; i++) {
      e = bezX(b, t) - x;
      if (Math.abs(e) < 1e-6) return t;
      d = dbezX(b, t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
      if (t < 0 || t > 1) break;
    }
    t = x;
    for (i = 0; i < 30; i++) {
      e = bezX(b, t) - x;
      if (Math.abs(e) < 1e-6) return t;
      if (e > 0) hi = t; else lo = t;
      t = (lo + hi) / 2;
    }
    return t;
  }
  function ease(b, x) { x = clamp(x, 0, 1); return bezY(b, solveT(b, x)); }
  // speed (dy/dx) at x, 1 = the average speed
  function speedAt(b, x) {
    var t = solveT(b, clamp(x, 0, 1)), dx = dbezX(b, t);
    if (Math.abs(dx) < 1e-5) dx = dx < 0 ? -1e-5 : 1e-5;
    return dbezY(b, t) / dx;
  }

  // ------------------------------------------------------------------ pane registry + loop
  function register(id, def) { def.id = id; panes[id] = def; }

  function paneRoot(id) { return root.querySelector('.sp[data-sp="' + id + '"]'); }

  function ensureBuilt(id) {
    if (built[id]) return;
    built[id] = true;
    var def = panes[id], el = paneRoot(id);
    if (!def || !el) return;
    try { def.build(el); } catch (e) { el.appendChild(mk("p", "snote", "This section could not start: " + esc(e && e.message || e))); if (window.console) console.error(e); }
  }

  function frame(ts) {
    if (!running) return;
    if (cur && cur.frame && E.awake()) {
      if (ts - lastTs >= 28) {
        lastTs = ts;
        try { cur.frame(ts / 1000); } catch (e) { if (window.console) console.error(e); }
      }
      requestAnimationFrame(frame);
    } else {
      setTimeout(function () { if (running) requestAnimationFrame(frame); }, 350);
    }
  }
  function startLoop() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function stopLoop() { running = false; }

  function setMode(id) {
    if (!panes[id]) {
      if (cur && cur.hide) { try { cur.hide(); } catch (e) {} }
      cur = null; curId = ""; stopLoop(); return;
    }
    if (cur && cur !== panes[id] && cur.hide) { try { cur.hide(); } catch (e) {} }
    ensureBuilt(id);
    cur = panes[id]; curId = id;
    var els = root.querySelectorAll(".sp");
    Array.prototype.forEach.call(els, function (x) { x.classList.toggle("on", x.getAttribute("data-sp") === id); });
    if (cur.show) { try { cur.show(); } catch (e2) { if (window.console) console.error(e2); } }
    startLoop();
  }

  function init(env) {
    E = env;
    root = document.getElementById("studio");
    Object.keys(panes).forEach(function (id) {
      var el = mk("div", "sp"); el.setAttribute("data-sp", id);
      root.appendChild(el);
    });
    window.addEventListener("resize", function () { if (cur && cur.resize) { try { cur.resize(); } catch (e) {} } });
  }

  // saved state for a pane (kept inside the panel's settings file)
  function store(id, defaults) {
    var all = E.settings().studio;
    if (!all || typeof all !== "object") { all = {}; E.settings().studio = all; }
    var s = all[id];
    if (!s || typeof s !== "object") { s = {}; all[id] = s; }
    var k;
    for (k in defaults) if (defaults.hasOwnProperty(k) && s[k] === undefined) s[k] = JSON.parse(JSON.stringify(defaults[k]));
    return s;
  }

  var Studio = {
    register: register, init: init, setMode: setMode, panes: panes, store: store,
    ids: function () { return Object.keys(panes); },
    def: function (id) { return panes[id]; },
    dock: function () {
      if (!cur) return null;
      try { return cur.dock ? cur.dock() : null; } catch (e) { return null; }
    },
    apply: function () { return cur && cur.apply ? cur.apply() : Promise.resolve({ ok: false, msg: "Nothing to apply" }); },
    refresh: function () { if (cur && cur.refresh) { try { cur.refresh(); } catch (e) {} } },
    // helpers shared with the other studio files
    u: {
      mk: mk, sv: sv, clamp: clamp, lerp: lerp, round: round, esc: esc, hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgba: rgba, accent: accent, fixed: fixed, trimNum: trimNum,
      slider: slider, seg: seg, toggle: toggle, head: head, ghostBtn: ghostBtn, note: note, swatches: swatches, fit: fit, rrect: rrect, stage: stage,
      bezX: bezX, bezY: bezY, ease: ease, speedAt: speedAt, solveT: solveT, dbezX: dbezX, dbezY: dbezY,
      env: function () { return E; }
    }
  };
  window.Studio = Studio;

  // ==================================================================== CURVE
  // A cubic-bezier editor: drag the two handles on the curve, or switch to the speed graph and drag them the way
  // After Effects shows them (influence sideways, speed up and down). "Apply" writes the ease onto the selected keyframes.
  var PRESETS = [
    ["Linear", [0, 0, 1, 1]], ["Ease", [0.25, 0.1, 0.25, 1]], ["Ease In", [0.42, 0, 1, 1]], ["Ease Out", [0, 0, 0.58, 1]],
    ["Ease In-Out", [0.42, 0, 0.58, 1]], ["Smooth", [0.65, 0, 0.35, 1]], ["Sine", [0.37, 0, 0.63, 1]], ["iOS", [0.32, 0.72, 0, 1]],
    ["Snappy", [0.16, 1, 0.3, 1]], ["Expo In", [0.7, 0, 0.84, 0]], ["Expo In-Out", [0.87, 0, 0.13, 1]], ["Cinematic", [0.77, 0, 0.175, 1]],
    ["Hard Out", [0.05, 0.7, 0.1, 1]], ["Circ Out", [0, 0.55, 0.45, 1]], ["Back Out", [0.34, 1.56, 0.64, 1]], ["Back In", [0.36, 0, 0.66, -0.56]],
    ["Back In-Out", [0.68, -0.6, 0.32, 1.6]]
  ];

  (function () {
    var st, ui = {}, W = 320, H = 330, X0 = 30, X1 = 290, Y0 = 16, Y1 = 314, view = "curve", yr = [-0.6, 1.6], sr = [0, 3], tween = null, playT0 = 0, tracking = null, dragging = false;

    function sameB(a, b) { return Math.abs(a[0] - b[0]) < 0.004 && Math.abs(a[1] - b[1]) < 0.004 && Math.abs(a[2] - b[2]) < 0.004 && Math.abs(a[3] - b[3]) < 0.004; }
    function cssB(b) { return "cubic-bezier(" + b.map(function (v) { return trimNum(v, 2); }).join(", ") + ")"; }
    function nameOf(b) {
      var i;
      for (i = 0; i < PRESETS.length; i++) if (sameB(PRESETS[i][1], b)) return PRESETS[i][0];
      for (i = 0; i < st.mine.length; i++) if (sameB(st.mine[i].b, b)) return st.mine[i].n;
      return "Custom curve";
    }

    // data -> svg coordinates
    function gx(x) { return X0 + x * (X1 - X0); }
    function gy(y) { var r = view === "curve" ? yr : sr; return Y1 - (y - r[0]) / (r[1] - r[0]) * (Y1 - Y0); }
    function ux(px) { return (px - X0) / (X1 - X0); }
    function uy(py) { var r = view === "curve" ? yr : sr; return r[0] + (Y1 - py) / (Y1 - Y0) * (r[1] - r[0]); }

    function thumb(b, w, h) {
      var d = "", i, n = 28, x, y, ymin = Math.min(0, b[1], b[3]) - 0.05, ymax = Math.max(1, b[1], b[3]) + 0.05, pad = 4;
      for (i = 0; i <= n; i++) {
        x = i / n; y = ease(b, x);
        d += (i ? "L" : "M") + (pad + x * (w - pad * 2)).toFixed(1) + " " + (h - pad - (y - ymin) / (ymax - ymin) * (h - pad * 2)).toFixed(1);
      }
      return '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }

    function rescale() {
      var b = st.b, i, s, mn = 0, mx = 1.5, y0 = Math.min(0, b[1], b[3]), y1 = Math.max(1, b[1], b[3]);
      yr = [Math.floor((y0 - 0.15) * 4) / 4, Math.ceil((y1 + 0.15) * 4) / 4];
      if (yr[0] > -0.25) yr[0] = -0.25;
      if (yr[1] < 1.25) yr[1] = 1.25;
      for (i = 0; i <= 60; i++) { s = speedAt(b, i / 60); if (s > mx) mx = s; if (s < mn) mn = s; }
      sr = [mn < -0.01 ? Math.floor(mn * 1.2 * 2) / 2 : 0, Math.ceil(Math.min(mx, 12) * 1.12 * 2) / 2];
      if (sr[1] < 2) sr[1] = 2;
    }

    // the handle positions for the current view
    function handles() {
      var b = st.b, s0 = b[0] > 0.001 ? b[1] / b[0] : 0, s1 = b[2] < 0.999 ? (1 - b[3]) / (1 - b[2]) : 0;
      if (view === "curve") return [[b[0], b[1]], [b[2], b[3]]];
      return [[b[0], s0], [b[2], s1]];
    }

    function draw() {
      rescale();
      var b = st.b, i, d, pts = "", x, y, area, hs = handles(), g = ui.g;
      // grid
      var grid = "";
      for (i = 0; i <= 4; i++) grid += '<line x1="' + gx(i / 4).toFixed(1) + '" y1="' + Y0 + '" x2="' + gx(i / 4).toFixed(1) + '" y2="' + Y1 + '"/>';
      var r = view === "curve" ? yr : sr, step = view === "curve" ? 0.5 : (r[1] - r[0] > 6 ? 2 : 1), v;
      for (v = Math.ceil(r[0] / step) * step; v <= r[1] + 1e-6; v += step) grid += '<line x1="' + X0 + '" y1="' + gy(v).toFixed(1) + '" x2="' + X1 + '" y2="' + gy(v).toFixed(1) + '"' + (Math.abs(v) < 1e-6 || (view === "curve" && Math.abs(v - 1) < 1e-6) ? ' class="axis"' : "") + "/>";
      ui.grid.innerHTML = grid;
      // unit box
      if (view === "curve") { ui.box.setAttribute("x", gx(0)); ui.box.setAttribute("y", gy(1)); ui.box.setAttribute("width", X1 - X0); ui.box.setAttribute("height", gy(0) - gy(1)); ui.box.style.display = ""; }
      else ui.box.style.display = "none";
      // the line itself
      d = "";
      for (i = 0; i <= 72; i++) {
        x = i / 72;
        y = view === "curve" ? ease(b, x) : speedAt(b, x);
        d += (i ? "L" : "M") + gx(x).toFixed(1) + " " + gy(y).toFixed(1);
      }
      ui.curve.setAttribute("d", d);
      if (view === "speed") {
        area = d + "L" + gx(1).toFixed(1) + " " + gy(0).toFixed(1) + "L" + gx(0).toFixed(1) + " " + gy(0).toFixed(1) + "Z";
        ui.area.setAttribute("d", area); ui.area.style.display = "";
      } else ui.area.style.display = "none";
      // handles. curve view: from (0,0) to p1 and from (1,1) to p2. speed view: from the ends sideways (influence) to the handle
      var a1, a2;
      if (view === "curve") { a1 = [0, 0]; a2 = [1, 1]; } else { a1 = [0, hs[0][1]]; a2 = [1, hs[1][1]]; }
      ui.l1.setAttribute("x1", gx(a1[0])); ui.l1.setAttribute("y1", gy(a1[1])); ui.l1.setAttribute("x2", gx(hs[0][0])); ui.l1.setAttribute("y2", gy(hs[0][1]));
      ui.l2.setAttribute("x1", gx(a2[0])); ui.l2.setAttribute("y1", gy(a2[1])); ui.l2.setAttribute("x2", gx(hs[1][0])); ui.l2.setAttribute("y2", gy(hs[1][1]));
      ui.k1.setAttribute("cx", gx(hs[0][0])); ui.k1.setAttribute("cy", gy(hs[0][1])); ui.h1.setAttribute("cx", gx(hs[0][0])); ui.h1.setAttribute("cy", gy(hs[0][1]));
      ui.k2.setAttribute("cx", gx(hs[1][0])); ui.k2.setAttribute("cy", gy(hs[1][1])); ui.h2.setAttribute("cx", gx(hs[1][0])); ui.h2.setAttribute("cy", gy(hs[1][1]));
      ui.e0.setAttribute("cx", gx(a1[0])); ui.e0.setAttribute("cy", gy(a1[1]));
      ui.e1.setAttribute("cx", gx(a2[0])); ui.e1.setAttribute("cy", gy(a2[1]));
      // text
      ui.code.textContent = cssB(b);
      ui.name.textContent = nameOf(b);
      var f = ui.fields;
      for (i = 0; i < 4; i++) if (document.activeElement !== f[i]) f[i].value = trimNum(b[i], 2);
      ui.rl.textContent = view === "curve" ? "Progress" : "Speed";
      Array.prototype.forEach.call(ui.presetBox.children, function (c) { c.classList.toggle("on", sameB(PRESETS[+c.getAttribute("data-i")][1], b)); });
      Array.prototype.forEach.call(ui.mineBox.querySelectorAll(".chip"), function (c) { c.classList.toggle("on", sameB(st.mine[+c.getAttribute("data-i")].b, b)); });
    }

    function commit(quiet) { draw(); if (!quiet) E.save(); E.dockChanged(); }

    function setB(nb, animate) {
      nb = [clamp(nb[0], 0, 1), clamp(nb[1], -2, 3), clamp(nb[2], 0, 1), clamp(nb[3], -2, 3)];
      if (!animate) { st.b = nb; tween = null; commit(); return; }
      tween = { t0: performance.now(), from: st.b.slice(), to: nb };
    }

    function pointer(e) {
      var pt = ui.svg.createSVGPoint(), m = ui.svg.getScreenCTM();
      pt.x = e.clientX; pt.y = e.clientY;
      if (!m) return { x: 0, y: 0 };
      pt = pt.matrixTransform(m.inverse());
      return { x: ux(pt.x), y: uy(pt.y) };
    }
    function startDrag(which, e) {
      e.preventDefault();
      tween = null; dragging = true; ui.svg.classList.add("drag");
      function move(ev) {
        var p = pointer(ev), b = st.b.slice(), x = clamp(p.x, 0, 1), snap = ev.shiftKey ? 0.05 : 0.01, sx = Math.round(x / snap) * snap, sy;
        if (view === "curve") {
          sy = Math.round(clamp(p.y, -1.5, 2.5) / snap) * snap;
          if (which === 0) { b[0] = sx; b[1] = sy; } else { b[2] = sx; b[3] = sy; }
        } else {
          // speed graph: sideways = influence, up and down = speed
          var sp = Math.round(clamp(p.y, -6, 14) / (snap * 5)) * (snap * 5);
          if (which === 0) { sx = clamp(sx, 0.01, 1); b[0] = sx; b[1] = sp * sx; } else { sx = clamp(sx, 0, 0.99); b[2] = sx; b[3] = 1 - sp * (1 - sx); }
        }
        st.b = [clamp(b[0], 0, 1), clamp(b[1], -2, 3), clamp(b[2], 0, 1), clamp(b[3], -2, 3)].map(function (v) { return Math.round(v * 1000) / 1000; });
        draw(); E.dockChanged();
      }
      function up() {
        document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
        dragging = false; ui.svg.classList.remove("drag"); E.save();
      }
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
      move(e);
    }

    function build(el) {
      st = Studio.store("curve", { b: [0.42, 0, 0.58, 1], dur: 1, view: "curve", mine: [] });
      view = st.view === "speed" ? "speed" : "curve";
      if (!Array.isArray(st.b) || st.b.length !== 4) st.b = [0.42, 0, 0.58, 1];
      if (!Array.isArray(st.mine)) st.mine = [];

      // graph card
      var card = mk("div", "gcard"), top = mk("div", "gtop");
      ui.name = mk("b", "gname", "");
      ui.vseg = seg([["curve", "Curve"], ["speed", "Speed"]], view, function (v) { view = v; st.view = v; draw(); E.save(); }, "mini");
      top.appendChild(ui.name); top.appendChild(ui.vseg.el);
      card.appendChild(top);
      var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "graph", preserveAspectRatio: "xMidYMid meet" });
      svg.innerHTML = '<defs><linearGradient id="gArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".42"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient>' +
        '<filter id="gGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>' +
        '<rect class="g-bg" x="0" y="0" width="' + W + '" height="' + H + '" rx="22"/>';
      ui.svg = svg;
      ui.grid = sv("g", { class: "g-grid" });
      ui.box = sv("rect", { class: "g-box", rx: 4 });
      ui.area = sv("path", { class: "g-area", fill: "url(#gArea)" });
      ui.glow = sv("path", { class: "g-glow", filter: "url(#gGlow)" });
      ui.curve = sv("path", { class: "g-curve" });
      ui.l1 = sv("line", { class: "g-hl" }); ui.l2 = sv("line", { class: "g-hl" });
      ui.e0 = sv("circle", { class: "g-end", r: 4.5 }); ui.e1 = sv("circle", { class: "g-end", r: 4.5 });
      ui.k1 = sv("circle", { class: "g-knob", r: 8 }); ui.k2 = sv("circle", { class: "g-knob k2", r: 8 });
      ui.h1 = sv("circle", { class: "g-hit", r: 20 }); ui.h2 = sv("circle", { class: "g-hit", r: 20 });
      ui.play = sv("circle", { class: "g-play", r: 5.5 });
      ui.pline = sv("line", { class: "g-pline" });
      ui.rl = sv("text", { class: "g-lab", x: 8, y: 13 });
      [ui.grid, ui.box, ui.area, ui.glow, ui.curve, ui.pline, ui.l1, ui.l2, ui.e0, ui.e1, ui.play, ui.k1, ui.k2, ui.h1, ui.h2].forEach(function (n) { svg.appendChild(n); });
      ui.glow.setAttribute("d", "");
      card.appendChild(svg);
      ui.h1.addEventListener("mousedown", function (e) { startDrag(0, e); });
      ui.h2.addEventListener("mousedown", function (e) { startDrag(1, e); });

      // numbers + css text
      var nums = mk("div", "gnums"), labels = ["x1", "y1", "x2", "y2"];
      ui.fields = [];
      labels.forEach(function (l, i) {
        var w = mk("label", "gnum"), s = mk("span", "", l), inp = mk("input");
        inp.type = "number"; inp.step = "0.01"; inp.autocomplete = "off";
        inp.addEventListener("input", function () {
          var v = parseFloat(inp.value);
          if (!isFinite(v)) return;
          var b = st.b.slice(); b[i] = (i % 2 === 0) ? clamp(v, 0, 1) : clamp(v, -2, 3);
          st.b = b; tween = null; draw(); E.dockChanged();
        });
        inp.addEventListener("change", function () { E.save(); draw(); });
        w.appendChild(s); w.appendChild(inp); nums.appendChild(w); ui.fields.push(inp);
      });
      card.appendChild(nums);
      var meta = mk("div", "gmeta");
      ui.code = mk("code", "gcode", "");
      var copy = ghostBtn("Copy", function () {
        var t = cssB(st.b);
        try {
          var ta = mk("textarea"); ta.value = t; ta.style.cssText = "position:fixed;left:-999px;top:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
          E.toast("Copied " + t);
        } catch (e) { E.toast("Could not copy", true); }
      }, "Copy the cubic-bezier() text");
      meta.appendChild(ui.code); meta.appendChild(copy);
      card.appendChild(meta);
      el.appendChild(card);

      // live preview
      var pv = mk("div", "gprev"), cv = mk("canvas", "gprev-cv"), pr = mk("div", "gprev-row");
      ui.cv = cv;
      ui.dur = slider({ label: "Time", min: 0.2, max: 3, step: 0.05, value: st.dur, def: 1, fmt: function (v) { return v.toFixed(2) + " s"; }, onInput: function (v) { st.dur = v; playT0 = performance.now(); }, onChange: function () { E.save(); } });
      pv.appendChild(cv); pv.appendChild(ui.dur.el);
      el.appendChild(pv);

      // actions
      var act = mk("div", "gacts");
      ui.read = ghostBtn("Get from After Effects", function () { readFromAE(); }, "Reads the ease of the first two selected keyframes into the graph");
      act.appendChild(ui.read);
      el.appendChild(act);

      // presets
      el.appendChild(head("Presets"));
      ui.presetBox = mk("div", "chips");
      PRESETS.forEach(function (p, i) {
        var c = mk("button", "chip", '<span class="ct">' + thumb(p[1], 52, 40) + '</span><span class="cn">' + esc(p[0]) + "</span>");
        c.type = "button"; c.setAttribute("data-i", String(i)); c.title = cssB(p[1]);
        c.addEventListener("click", function () { setB(p[1], true); });
        ui.presetBox.appendChild(c);
      });
      el.appendChild(ui.presetBox);

      // saved curves
      var addBtn = ghostBtn("Save this curve", function () { askName(); }, "Keep the current curve in My curves");
      el.appendChild(head("My curves", addBtn));
      ui.askRow = mk("div", "askrow"); ui.askRow.style.display = "none";
      ui.askInp = mk("input"); ui.askInp.type = "text"; ui.askInp.placeholder = "Name"; ui.askInp.maxLength = 24; ui.askInp.spellcheck = false;
      var okb = ghostBtn("Save", function () { saveMine(); });
      ui.askInp.addEventListener("keydown", function (e) { if (e.key === "Enter") saveMine(); if (e.key === "Escape") ui.askRow.style.display = "none"; e.stopPropagation(); });
      ui.askRow.appendChild(ui.askInp); ui.askRow.appendChild(okb);
      el.appendChild(ui.askRow);
      ui.mineBox = mk("div", "chips");
      el.appendChild(ui.mineBox);
      renderMine();
      el.appendChild(note("Tip: drag the two handles. Shift snaps to 0.05. In Speed view the handles work like After Effects: sideways is influence, up and down is speed."));
      draw();
    }

    function askName() {
      ui.askRow.style.display = "";
      ui.askInp.value = ""; ui.askInp.focus();
    }
    function saveMine() {
      var n = ui.askInp.value.replace(/[<>]/g, "").trim();
      if (!n) n = "Curve " + (st.mine.length + 1);
      st.mine.push({ n: n.slice(0, 24), b: st.b.slice() });
      ui.askRow.style.display = "none";
      renderMine(); draw(); E.save();
      E.toast("Saved “" + n + "”");
    }
    function renderMine() {
      ui.mineBox.innerHTML = "";
      if (!st.mine.length) { ui.mineBox.appendChild(mk("p", "snote muted", "Nothing here yet. Shape a curve, then press Save this curve.")); return; }
      st.mine.forEach(function (m, i) {
        var c = mk("div", "chip", '<span class="ct">' + thumb(m.b, 52, 40) + '</span><span class="cn">' + esc(m.n) + "</span>"), x = mk("i", "cx", "&times;");
        c.setAttribute("data-i", String(i)); c.setAttribute("role", "button"); c.tabIndex = 0; c.title = cssB(m.b);
        x.title = "Remove";
        x.addEventListener("click", function (e) { e.stopPropagation(); st.mine.splice(i, 1); renderMine(); draw(); E.save(); });
        c.addEventListener("click", function () { setB(m.b, true); });
        c.addEventListener("keydown", function (e) { if (e.key === "Enter") setB(m.b, true); });
        c.appendChild(x);
        ui.mineBox.appendChild(c);
      });
    }

    function readFromAE() {
      var g = E.gate();
      if (g) { E.toast(g, true); return; }
      ui.read.classList.add("busy");
      E.call("ops_curveRead").then(function (r) {
        ui.read.classList.remove("busy");
        if (r && r.ok && r.b) { setB(r.b, true); E.toast("Read the ease of " + (r.prop || "the keyframes")); }
        else E.toast((r && r.error) || "Could not read the keyframes", true);
      });
    }

    function frame(t) {
      var now = performance.now();
      if (tween) {
        var u = clamp((now - tween.t0) / 260, 0, 1), k = 1 - Math.pow(1 - u, 3), i, nb = [];
        for (i = 0; i < 4; i++) nb.push(lerp(tween.from[i], tween.to[i], k));
        st.b = nb;
        if (u >= 1) { st.b = tween.to.slice(); tween = null; E.save(); E.dockChanged(); }
        draw();
      }
      // playback: a dot travels along the track with the curve while a marker rides the graph
      var d = Math.max(0.2, st.dur), hold = 0.55, cyc = d + hold, ph = ((now - playT0) / 1000) % cyc, u2 = clamp(ph / d, 0, 1), val = ease(st.b, u2);
      var cv = ui.cv, f = fit(cv), g = cv.getContext("2d"), w = f.w, h = f.h, ac = accent(), x0 = 22, x1 = w - 22, cy = h / 2, i2, tx, ta;
      g.setTransform(f.d, 0, 0, f.d, 0, 0);
      g.clearRect(0, 0, w, h);
      g.lineCap = "round";
      g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, cy); g.lineTo(x1, cy); g.stroke();
      g.fillStyle = "rgba(255,255,255,.28)";
      g.beginPath(); g.arc(x0, cy, 3, 0, 6.3); g.arc(x1, cy, 3, 0, 6.3); g.fill();
      for (i2 = 7; i2 >= 1; i2--) {
        tx = ease(st.b, clamp((ph - i2 * 0.018) / d, 0, 1)); ta = (1 - i2 / 8) * 0.28;
        g.fillStyle = rgba(ac, ta);
        g.beginPath(); g.arc(lerp(x0, x1, tx), cy, 9 - i2 * 0.4, 0, 6.3); g.fill();
      }
      g.fillStyle = rgba(ac, 1);
      g.shadowColor = rgba(ac, 0.7); g.shadowBlur = 14;
      g.beginPath(); g.arc(lerp(x0, x1, val), cy, 9, 0, 6.3); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(255,255,255,.55)"; g.font = "600 10.5px Outfit, sans-serif"; g.textAlign = "right";
      g.fillText(fixed(ph < d ? ph : d, 2) + " s", w - 10, 14);
      g.textAlign = "left"; g.fillText(Math.round(val * 100) + "%", 10, 14);
      // marker on the graph
      if (view === "curve") {
        ui.play.setAttribute("cx", gx(u2)); ui.play.setAttribute("cy", gy(val));
        ui.pline.setAttribute("x1", gx(u2)); ui.pline.setAttribute("x2", gx(u2)); ui.pline.setAttribute("y1", gy(0)); ui.pline.setAttribute("y2", gy(val));
      } else {
        var sp = speedAt(st.b, u2);
        ui.play.setAttribute("cx", gx(u2)); ui.play.setAttribute("cy", gy(sp));
        ui.pline.setAttribute("x1", gx(u2)); ui.pline.setAttribute("x2", gx(u2)); ui.pline.setAttribute("y1", gy(0)); ui.pline.setAttribute("y2", gy(sp));
      }
    }

    Studio.register("curve", {
      title: "Curve", rgb: [255, 159, 10], icon: "curve", build: build, frame: frame,
      show: function () { playT0 = performance.now(); draw(); },
      refresh: function () { draw(); },
      dock: function () {
        var g = E.gate(), s = E.sel();
        var hint = g || (s.hasComp ? "Select two or more keyframes, then Apply" : "Open a composition first");
        return { name: nameOf(st.b), hint: hint, ok: !g && s.hasComp, label: "Apply" };
      },
      apply: function () {
        var g = E.gate();
        if (g) return Promise.resolve({ ok: false, msg: g });
        return E.call("ops_curve", { b: st.b.map(function (v) { return round(v, 4); }) }).then(function (r) {
          if (r && r.ok) return { ok: true, msg: "Curve set on " + r.segs + " keyframe pair" + (r.segs === 1 ? "" : "s") + (r.failed ? " · " + r.failed + " failed" : ""), done: "Applied" };
          return { ok: false, msg: (r && r.error) || "Could not set the curve" };
        });
      }
    });
    // exposed for tests
    Studio._curve = { ease: ease, speedAt: speedAt, PRESETS: PRESETS };
  })();
})();
