/* Hydra Studio · studio-pixel.js
 * Pixel: a pixelated scan wipe that runs on the layers you select, and nothing else.
 * Every selected layer gets its own wipe as a track matte plus a glowing, pixelated copy of itself that shows only inside the
 * scan band. Markers on the layer show where the scan starts and where it ends.
 * The stage plays the same idea live: the rest of the composition stays put, only the layer is wiped.
 */
(function () {
  "use strict";
  var S = window.Studio, U = S.u, mk = U.mk, clamp = U.clamp, esc = U.esc, lerp = U.lerp;
  var E = null;

  var MODES = [
    { id: "out", name: "Wipe away", sub: "Pixels sweep the layer away. The scan band glows at the front.", dot: [255, 55, 95] },
    { id: "in", name: "Wipe in", sub: "The layer arrives through pixels. The scan band glows at the front.", dot: [48, 209, 88] },
    { id: "scan", name: "Scan line", sub: "Only the glowing pixel band passes over the layer. The layer itself stays whole.", dot: [10, 132, 255] }
  ];
  var DIRS = [["right", "→", "Left to right"], ["left", "←", "Right to left"], ["down", "↓", "Top to bottom"], ["up", "↑", "Bottom to top"]];
  var EASES = [["lin", "Linear"], ["io", "Smooth"], ["out", "Fast start"]];
  var ATS = [["auto", "Auto", "Starts at the playhead when it sits on the layer, otherwise at the layer's edge"], ["playhead", "Playhead"], ["edge", "Layer edge"]];
  var TARGETS = [["layers", "Selected layers", "Only the layers selected in After Effects"], ["comp", "Whole comp", "A scan band over everything below, like the old Pixel Scan"]];
  var PALS = [
    { id: "neon", name: "Neon", a: "#00E6FF", b: "#FF2BD6" },
    { id: "sunset", name: "Sunset", a: "#FF9E0A", b: "#FF385E" },
    { id: "aurora", name: "Aurora", a: "#30D159", b: "#5E5CE6" },
    { id: "gold", name: "Gold", a: "#FFD900", b: "#FF9E0A" },
    { id: "ice", name: "Ice", a: "#FFFFFF", b: "#63D1FF" },
    { id: "mono", name: "Mono", a: "#FFFFFF", b: "#FFFFFF" }
  ];
  var SW = ["#00E6FF", "#30D159", "#FFD900", "#FF9E0A", "#FF385E", "#FF2BD6", "#BF5AF2", "#FFFFFF"];

  var DEFAULTS = {
    mode: "out", dir: "right", dur: 1.2, lag: 0.07, block: 24, jit: 160, glow: 100, ease: "io", at: "auto",
    target: "layers", markers: true, pal: "neon", ca: "#00E6FF", cb: "#FF2BD6"
  };

  var st, ui = {}, t0 = 0;

  function modeDef() { var i; for (i = 0; i < MODES.length; i++) if (MODES[i].id === st.mode) return MODES[i]; return MODES[0]; }
  function palDef(id) { var i; for (i = 0; i < PALS.length; i++) if (PALS[i].id === id) return PALS[i]; return null; }
  function rgb01(hex) { var c = U.hexToRgb(hex) || [255, 255, 255]; return [U.round(c[0] / 255, 4), U.round(c[1] / 255, 4), U.round(c[2] / 255, 4)]; }
  function dirName() { var i; for (i = 0; i < DIRS.length; i++) if (DIRS[i][0] === st.dir) return DIRS[i][2]; return ""; }

  // what goes to After Effects
  function toHost() {
    return {
      target: st.target,
      p: {
        mode: st.mode, dir: st.dir, dur: st.dur, lag: st.lag, block: st.block, jit: st.jit, glow: st.glow / 100, ease: st.ease, at: st.at,
        markers: !!st.markers, pal: { a: rgb01(st.ca), b: rgb01(st.cb) }
      }
    };
  }

  // ------------------------------------------------------------------ the preview
  function hash(a, b, c) { var x = Math.sin(a * 127.1 + b * 311.7 + (c || 0) * 74.7) * 43758.5453; return x - Math.floor(x); }
  function vnoise(x, s) { var i = Math.floor(x), f = x - i; f = f * f * (3 - 2 * f); return hash(i, s, 1) * (1 - f) + hash(i + 1, s, 1) * f; }
  function easeU(kind, u) {
    u = clamp(u, 0, 1);
    if (kind === "lin") return u;
    if (kind === "out") return 1 - Math.pow(1 - u, 3);
    return u * u * (3 - 2 * u);
  }

  var pv = { key: "" };
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  function drawBg(g, w, h, d) {
    var x, y, gr, rd;
    g.setTransform(d, 0, 0, d, 0, 0);
    gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#181a25"); gr.addColorStop(1, "#0e0f17");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    rd = g.createRadialGradient(w * 0.86, h * 0.9, 2, w * 0.86, h * 0.9, w * 0.5); rd.addColorStop(0, "rgba(98,86,214,.34)"); rd.addColorStop(1, "rgba(98,86,214,0)");
    g.fillStyle = rd; g.fillRect(0, 0, w, h);
    rd = g.createRadialGradient(w * 0.08, h * 0.1, 2, w * 0.08, h * 0.1, w * 0.4); rd.addColorStop(0, "rgba(255,150,90,.16)"); rd.addColorStop(1, "rgba(255,150,90,0)");
    g.fillStyle = rd; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.07)";
    for (y = 9; y < h; y += 18) for (x = 9; x < w; x += 18) g.fillRect(x, y, 1.4, 1.4);
    if (h >= 190) {
      g.fillStyle = "rgba(255,255,255,.34)"; g.font = "500 9px Outfit, -apple-system, sans-serif"; g.textBaseline = "alphabetic"; g.textAlign = "center";
      g.fillText("Everything else in the comp stays untouched", w / 2, h * 0.84);
    }
  }
  function drawCard(g, w, h, d, r) {
    var x = r.x, y = r.y, cw = r.w, ch = r.h, rad = Math.min(cw, ch) * 0.07, sky;
    g.setTransform(d, 0, 0, d, 0, 0);
    U.rrect(g, x, y, cw, ch, rad); g.save(); g.clip();
    sky = g.createLinearGradient(x, y, x + cw * 0.35, y + ch);
    sky.addColorStop(0, "#ffd56e"); sky.addColorStop(0.46, "#ff7a6b"); sky.addColorStop(1, "#6b57d8");
    g.fillStyle = sky; g.fillRect(x, y, cw, ch);
    g.fillStyle = "rgba(255,250,226,.96)"; g.beginPath(); g.arc(x + cw * 0.68, y + ch * 0.36, ch * 0.17, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3b2d7c"; g.beginPath(); g.moveTo(x, y + ch); g.lineTo(x, y + ch * 0.7); g.lineTo(x + cw * 0.2, y + ch * 0.48); g.lineTo(x + cw * 0.38, y + ch * 0.72);
    g.lineTo(x + cw * 0.56, y + ch * 0.56); g.lineTo(x + cw * 0.78, y + ch * 0.8); g.lineTo(x + cw, y + ch * 0.64); g.lineTo(x + cw, y + ch); g.closePath(); g.fill();
    g.fillStyle = "#1f1650"; g.beginPath(); g.moveTo(x, y + ch); g.lineTo(x, y + ch * 0.86); g.lineTo(x + cw * 0.3, y + ch * 0.74); g.lineTo(x + cw * 0.55, y + ch * 0.9);
    g.lineTo(x + cw * 0.8, y + ch * 0.78); g.lineTo(x + cw, y + ch * 0.88); g.lineTo(x + cw, y + ch); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,.34)"; g.lineWidth = 1; U.rrect(g, x + 0.5, y + 0.5, cw - 1, ch - 1, rad); g.stroke();
  }

  // everything that only depends on the stage size and the pixel size
  function prep(w, h, d, csz) {
    var key = [w, h, d, csz].join("x"), cols, rows, c, lg, rect;
    if (pv.key === key) return;
    pv.key = key;
    cols = Math.ceil(w / csz); rows = Math.ceil(h / csz);
    pv.cols = cols; pv.rows = rows; pv.csz = csz;
    rect = { x: Math.round(w * 0.14 / csz) * csz, y: Math.round(h * 0.16 / csz) * csz, w: Math.round(w * 0.72 / csz) * csz, h: Math.round(h * 0.58 / csz) * csz };
    pv.rect = rect;
    pv.cl = Math.floor(rect.x / csz); pv.cr = Math.min(cols - 1, Math.ceil((rect.x + rect.w) / csz) - 1);
    pv.rt = Math.floor(rect.y / csz); pv.rb = Math.min(rows - 1, Math.ceil((rect.y + rect.h) / csz) - 1);
    pv.bg = canvas(w * d, h * d); drawBg(pv.bg.getContext("2d"), w, h, d);
    pv.lay = canvas(w * d, h * d); drawCard(pv.lay.getContext("2d"), w, h, d, rect);
    c = canvas(cols, rows); lg = c.getContext("2d"); lg.imageSmoothingEnabled = true;
    try { lg.imageSmoothingQuality = "high"; } catch (e) {}
    lg.drawImage(pv.lay, 0, 0, pv.lay.width, pv.lay.height, 0, 0, cols, rows);
    pv.low = lg.getImageData(0, 0, cols, rows).data;
    pv.sm = canvas(cols, rows); pv.smg = pv.sm.getContext("2d"); pv.im = pv.smg.createImageData(cols, rows);
    pv.gw = Math.max(2, Math.ceil(cols / 3)); pv.gh = Math.max(2, Math.ceil(rows / 3));
    pv.gl = canvas(pv.gw, pv.gh); pv.glg = pv.gl.getContext("2d");
  }

  function cycle() { return 0.6 + st.dur + st.lag + 1.0; }

  // hold: the preview stands still while you work in the Pixels / Color & glow cards (and for a moment after your last touch,
  // so you can look at it), or whenever the Pause button is on
  var pin = false, lastAct = 0, LINGER = 2500;
  function isHeld() {
    var i;
    if (pin) return true;
    if (!ui.holdEls) return false;
    if (Date.now() - lastAct < LINGER) return true;
    for (i = 0; i < ui.holdEls.length; i++) { try { if (ui.holdEls[i].matches(":hover")) return true; } catch (e) {} }
    return false;
  }
  function watchHold(card) {
    ["pointermove", "pointerdown", "input", "change", "focusin", "keydown"].forEach(function (ev) { card.addEventListener(ev, function () { lastAct = Date.now(); }, true); });
  }
  // the time (relative to the start of the scan) at which the front sits a little past the middle, so the band lies over the layer
  function holdAt(m) {
    var want = (0.56 + m) / (1 + 2 * m), lo = 0, hi = 1, mid, i;
    for (i = 0; i < 26; i++) { mid = (lo + hi) / 2; if (easeU(st.ease, mid) < want) lo = mid; else hi = mid; }
    return (lo + hi) / 2 * st.dur;
  }

  function frame() {
    var cv = ui.pstage.cv, f = U.fit(cv), g = cv.getContext("2d"), w = f.w, h = f.h, d = f.d, ac = U.accent();
    var csz = Math.max(3, Math.round(st.block * (h / 1080) * 1.5)), cyc = cycle(), held = isHeld(), now, tt;
    var mode = st.mode, dir = st.dir, vert = dir === "down" || dir === "up", rev = dir === "left" || dir === "up";
    var L = vert ? 1080 : 1920, m = (st.jit * 1.15 + st.block * 3) / L;
    // while you tune pixels, colors or glow the scan stands still in the middle of the layer (and its noise stops moving)
    if (held) tt = holdAt(m); else tt = ((performance.now() - t0) / 1000) % cyc - 0.6;
    now = tt + 0.6;
    var u1 = easeU(st.ease, tt / st.dur), u0 = easeU(st.ease, (tt - st.lag) / st.dur), e1 = lerp(-m, 1 + m, u1), e0 = lerp(-m, 1 + m, u0);
    var fz = held ? 7 : Math.floor(now * 15), nAxis, nLine, aLo, aHi, lLo, lHi, j, a, s, off, wiped, band, vis, runA, pj = [], rect, im, ix, k, cc, rr, lum, pa, pb, tr, tg, tb, lit, glowK, r0, g0, b0;
    prep(w, h, d, csz);
    rect = pv.rect;
    nAxis = vert ? pv.rows : pv.cols; nLine = vert ? pv.cols : pv.rows;
    aLo = vert ? pv.rt : pv.cl; aHi = vert ? pv.rb : pv.cr; lLo = vert ? pv.cl : pv.rt; lHi = vert ? pv.cr : pv.rb;
    for (j = 0; j < nLine; j++) pj.push(((vnoise(j * 0.33 + fz * 0.21, fz) - 0.5) * 1.5 + (hash(j, 3, fz) - 0.5) * 0.6) * st.jit / L);
    pa = U.hexToRgb(st.ca) || [255, 255, 255]; pb = U.hexToRgb(st.cb) || [255, 255, 255];
    glowK = st.glow / 100;

    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(d, 0, 0, d, 0, 0);
    g.drawImage(pv.bg, 0, 0, w, h);

    im = pv.im.data; for (k = 0; k < im.length; k++) im[k] = 0;
    function flush(line, a0, a1) {
      var sx, sy, sw, sh;
      if (vert) { sx = line * csz; sy = a0 * csz; sw = csz; sh = (a1 - a0 + 1) * csz; } else { sx = a0 * csz; sy = line * csz; sw = (a1 - a0 + 1) * csz; sh = csz; }
      sw = Math.min(sw, w - sx); sh = Math.min(sh, h - sy);
      if (sw <= 0 || sh <= 0) return;
      g.drawImage(pv.lay, Math.round(sx * d), Math.round(sy * d), Math.round(sw * d), Math.round(sh * d), sx, sy, sw, sh);
    }
    for (j = lLo; j <= lHi; j++) {
      off = pj[j]; runA = -1;
      for (a = aLo; a <= aHi; a++) {
        s = (a + 0.5) / nAxis; if (rev) s = 1 - s;
        wiped = s < e1 + off;
        band = wiped && s >= e0 + off;
        vis = mode === "out" ? !wiped : (mode === "in" ? wiped : true);
        if (vis) { if (runA < 0) runA = a; } else if (runA >= 0) { flush(j, runA, a - 1); runA = -1; }
        if (band) {
          cc = vert ? j : a; rr = vert ? a : j; ix = (rr * pv.cols + cc) * 4;
          if (pv.low[ix + 3] > 40) {
            r0 = pv.low[ix]; g0 = pv.low[ix + 1]; b0 = pv.low[ix + 2];
            lum = (0.299 * r0 + 0.587 * g0 + 0.114 * b0) / 255;
            lit = 0.8 + 0.4 * hash(cc, rr, fz);
            // Tint maps black to a dim color A and white to color B, 85 %; a little exposure on top
            tr = (r0 * 0.15 + (pa[0] * 0.3 + (pb[0] - pa[0] * 0.3) * lum) * 0.85) * 1.12 * lit;
            tg = (g0 * 0.15 + (pa[1] * 0.3 + (pb[1] - pa[1] * 0.3) * lum) * 0.85) * 1.12 * lit;
            tb = (b0 * 0.15 + (pa[2] * 0.3 + (pb[2] - pa[2] * 0.3) * lum) * 0.85) * 1.12 * lit;
            im[ix] = clamp(tr, 0, 255); im[ix + 1] = clamp(tg, 0, 255); im[ix + 2] = clamp(tb, 0, 255); im[ix + 3] = 255;
          }
        }
      }
      if (runA >= 0) flush(j, runA, aHi);
    }
    // the band: crisp cells, then a soft halo
    pv.smg.putImageData(pv.im, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(pv.sm, 0, 0, pv.cols, pv.rows, 0, 0, pv.cols * csz, pv.rows * csz);
    if (glowK > 0.02) {
      pv.glg.clearRect(0, 0, pv.gw, pv.gh); pv.glg.imageSmoothingEnabled = true;
      pv.glg.drawImage(pv.sm, 0, 0, pv.cols, pv.rows, 0, 0, pv.gw, pv.gh);
      g.imageSmoothingEnabled = true; g.globalCompositeOperation = "lighter";
      g.globalAlpha = clamp(0.5 * glowK, 0, 1); g.drawImage(pv.gl, 0, 0, pv.gw, pv.gh, 0, 0, pv.gw * 3 * csz, pv.gh * 3 * csz);
      if (glowK > 1) { g.globalAlpha = clamp(0.3 * (glowK - 1), 0, 1); g.drawImage(pv.gl, 0, 0, pv.gw, pv.gh, 0, 0, pv.gw * 3 * csz, pv.gh * 3 * csz); }
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    g.imageSmoothingEnabled = true;

    // the layer's timeline: scan range and the two markers
    (function () {
      var x0 = w * 0.1, x1 = w * 0.9, y = h - 13, X = function (t) { return x0 + (x1 - x0) * clamp(t / cyc, 0, 1); }, sx = X(0.6), ex = X(0.6 + st.dur), bx = X(0.6 + st.dur + st.lag), px = X(now);
      g.fillStyle = "rgba(255,255,255,.14)"; U.rrect(g, x0, y - 2, x1 - x0, 4, 2); g.fill();
      g.fillStyle = U.rgba(ac, 0.32); U.rrect(g, sx, y - 2, Math.max(2, bx - sx), 4, 2); g.fill();
      if (st.markers) {
        g.fillStyle = U.rgba(ac, 0.95); g.fillRect(sx, y - 1, Math.max(1, ex - sx), 2);
        g.beginPath(); g.moveTo(sx, y - 7); g.lineTo(sx + 4.5, y); g.lineTo(sx, y + 7); g.lineTo(sx - 4.5, y); g.closePath(); g.fill();
        g.fillStyle = "#fff"; g.beginPath(); g.moveTo(ex, y - 7); g.lineTo(ex + 4.5, y); g.lineTo(ex, y + 7); g.lineTo(ex - 4.5, y); g.closePath(); g.fill();
        g.font = "600 8.5px Outfit, -apple-system, sans-serif"; g.textAlign = "center"; g.textBaseline = "alphabetic";
        g.fillStyle = "rgba(255,255,255,.62)"; g.fillText("start", sx, y - 10); g.fillText("end", ex, y - 10);
      }
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(px - 0.5, y - 8, 1, 16);
    })();
    ui.pstage.tag.textContent = held ? "Paused mid-scan" : modeDef().name + " · " + dirName() + " · " + U.trimNum(st.dur, 2) + " s";
  }

  // ------------------------------------------------------------------ the pane
  function pickMode(id) {
    st.mode = id;
    Array.prototype.forEach.call(ui.pills.children, function (c) { c.classList.toggle("on", c.getAttribute("data-id") === id); });
    ui.sub.textContent = modeDef().sub;
    ui.atBox.style.display = id === "scan" ? "none" : "";
    t0 = performance.now();
    E.save(); E.dockChanged();
  }
  function syncPal() {
    var i, hit = "";
    for (i = 0; i < PALS.length; i++) if (PALS[i].a.toUpperCase() === st.ca.toUpperCase() && PALS[i].b.toUpperCase() === st.cb.toUpperCase()) hit = PALS[i].id;
    st.pal = hit;
    Array.prototype.forEach.call(ui.pal.children, function (c) { c.classList.toggle("on", c.getAttribute("data-id") === hit); });
  }
  function setPal(p) {
    st.ca = p.a; st.cb = p.b;
    ui.swA.set(p.a); ui.swB.set(p.b);
    syncPal(); E.save();
  }
  function slider(label, key, min, max, step, fmt) {
    return U.slider({ label: label, min: min, max: max, step: step, value: st[key], fmt: fmt, def: DEFAULTS[key], onInput: function (v) { st[key] = v; }, onChange: function () { E.save(); } }).el;
  }

  function build(el) {
    var card, row, i;
    E = U.env();
    st = S.store("pixel", DEFAULTS);
    if (!MODES.some(function (x) { return x.id === st.mode; })) st.mode = "out";
    if (!DIRS.some(function (x) { return x[0] === st.dir; })) st.dir = "right";
    if (!EASES.some(function (x) { return x[0] === st.ease; })) st.ease = "io";
    if (!ATS.some(function (x) { return x[0] === st.at; })) st.at = "auto";
    if (st.target !== "comp") st.target = "layers";
    st.markers = st.markers !== false;
    st.dur = clamp(Number(st.dur) || 1.2, 0.3, 6); st.lag = clamp(Number(st.lag) || 0.07, 0.02, 0.5);
    st.block = clamp(Number(st.block) || 24, 6, 80); st.jit = clamp(isFinite(Number(st.jit)) ? Number(st.jit) : 160, 0, 400);
    st.glow = clamp(isFinite(Number(st.glow)) ? Number(st.glow) : 100, 0, 300);
    if (!/^#[0-9a-f]{6}$/i.test(st.ca)) st.ca = DEFAULTS.ca;
    if (!/^#[0-9a-f]{6}$/i.test(st.cb)) st.cb = DEFAULTS.cb;

    ui.pstage = U.stage(44);
    ui.pstage.el.classList.add("psticky");   // stays in view while you scroll down to the colors
    ui.pstage.name.textContent = "Pixel Scan";
    el.appendChild(ui.pstage.el);
    ui.sub = mk("div", "xsub"); el.appendChild(ui.sub);
    ui.pills = mk("div", "xpills");
    MODES.forEach(function (t) {
      var b = mk("button", "xpill", '<i style="background:rgb(' + t.dot.join(",") + ')"></i>' + esc(t.name));
      b.type = "button"; b.setAttribute("data-id", t.id);
      b.addEventListener("click", function () { pickMode(t.id); });
      ui.pills.appendChild(b);
    });
    el.appendChild(ui.pills);

    el.appendChild(U.head("Motion"));
    card = mk("div", "card2");
    row = mk("div", "xchoice"); row.appendChild(mk("span", "", "Direction"));
    ui.dirSeg = U.seg(DIRS, st.dir, function (v) { st.dir = v; t0 = performance.now(); E.save(); }); row.appendChild(ui.dirSeg.el); card.appendChild(row);
    card.appendChild(slider("Duration", "dur", 0.3, 6, 0.1, function (v) { return v.toFixed(1) + " s"; }));
    card.appendChild(slider("Band width", "lag", 0.02, 0.5, 0.01, function (v) { return Math.round(v * 1000) + " ms"; }));
    row = mk("div", "xchoice"); row.appendChild(mk("span", "", "Motion"));
    ui.easeSeg = U.seg(EASES, st.ease, function (v) { st.ease = v; E.save(); }); row.appendChild(ui.easeSeg.el); card.appendChild(row);
    ui.atBox = mk("div", "xchoice"); ui.atBox.appendChild(mk("span", "", "Starts"));
    ui.atSeg = U.seg(ATS, st.at, function (v) { st.at = v; E.save(); }); ui.atBox.appendChild(ui.atSeg.el); card.appendChild(ui.atBox);
    el.appendChild(card);

    ui.holdEls = [];
    el.appendChild(U.head("Pixels"));
    card = mk("div", "card2"); ui.holdEls.push(card); watchHold(card);
    card.appendChild(slider("Pixel size", "block", 6, 80, 1, function (v) { return Math.round(v) + " px"; }));
    card.appendChild(slider("Roughness", "jit", 0, 400, 5, function (v) { return v === 0 ? "Straight edge" : String(Math.round(v)); }));
    el.appendChild(card);

    ui.pauseBtn = U.ghostBtn("Pause preview", function () {
      pin = !pin; ui.pauseBtn.textContent = pin ? "Play preview" : "Pause preview"; ui.pauseBtn.classList.toggle("on", pin);
    }, "Hold the preview in the middle of the scan (it also holds by itself while you work in Pixels or Color & glow)");
    el.appendChild(U.head("Color & glow", ui.pauseBtn));
    card = mk("div", "card2"); ui.holdEls.push(card); watchHold(card);
    ui.pal = mk("div", "xpills");
    PALS.forEach(function (p) {
      var b = mk("button", "xpill", '<i class="pgrad" style="background:linear-gradient(90deg,' + p.a + "," + p.b + ')"></i>' + esc(p.name));
      b.type = "button"; b.setAttribute("data-id", p.id);
      b.addEventListener("click", function () { setPal(p); });
      ui.pal.appendChild(b);
    });
    card.appendChild(ui.pal);
    row = mk("div", "xchoice"); row.appendChild(mk("span", "", "Color A (dark side of the band)"));
    ui.swA = U.swatches(SW, st.ca, function (v) { st.ca = v; syncPal(); E.save(); }, true); row.appendChild(ui.swA.el); card.appendChild(row);
    row = mk("div", "xchoice"); row.appendChild(mk("span", "", "Color B (bright side of the band)"));
    ui.swB = U.swatches(SW, st.cb, function (v) { st.cb = v; syncPal(); E.save(); }, true); row.appendChild(ui.swB.el); card.appendChild(row);
    card.appendChild(slider("Glow", "glow", 0, 300, 5, function (v) { return v === 0 ? "Off" : Math.round(v) + " %"; }));
    el.appendChild(card);

    el.appendChild(U.head("Apply to"));
    card = mk("div", "card2");
    ui.tgSeg = U.seg(TARGETS, st.target, function (v) { st.target = v; E.save(); E.dockChanged(); });
    card.appendChild(ui.tgSeg.el);
    ui.mkTg = U.toggle("Markers: where it starts and ends", st.markers, function (v) { st.markers = v; E.save(); });
    card.appendChild(ui.mkTg.el);
    el.appendChild(card);
    el.appendChild(U.note("Select one layer or several (shapes, photos, videos, text, pre-comps) and press Apply. Each selected layer gets its own wipe and its own glowing pixel band, so nothing else in the composition changes. Helper pre-comps go into a project folder called “Hydra Pixel Scan”. A layer that already has a track matte, a locked layer and an adjustment layer are skipped."));
    syncPal();
    pickMode(st.mode);
  }

  S.register("pixel", {
    title: "Pixel", rgb: [0, 199, 190], icon: "pixel", build: build, frame: frame,
    show: function () { t0 = performance.now(); },
    dock: function () {
      var g = E.gate(), s = E.sel(), n = s.total || 0, hint, ok;
      if (st.target === "comp") { hint = g || (s.hasComp ? "→ a scan band over the whole composition" : "Open a composition first"); ok = !g && s.hasComp; }
      else { hint = g || (!s.hasComp ? "Open a composition first" : n > 0 ? "→ " + (n === 1 ? "the selected layer" : n + " selected layers") : "Select a layer first"); ok = !g && s.hasComp && n > 0; }
      return { name: "Pixel Scan · " + modeDef().name, hint: hint, ok: ok, label: "Apply" };
    },
    apply: function () {
      var g = E.gate();
      if (g) return Promise.resolve({ ok: false, msg: g });
      return E.call("ops_pixelStudio", toHost()).then(function (r) {
        var w, msg;
        if (r && r.ok) {
          w = r.warnings || [];
          msg = st.target === "comp" ? "Pixel scan over the composition" : "Pixel scan on " + (r.targets || 1) + (r.targets === 1 ? " layer" : " layers");
          if (w.length) msg += " · " + w.length + " note" + (w.length > 1 ? "s" : "");
          return { ok: true, msg: msg, warn: w[0], done: "Applied" };
        }
        return { ok: false, msg: (r && r.error) || "Could not build the pixel scan" };
      });
    }
  });

  S._pixel = { toHost: function () { return toHost(); }, DEFAULTS: DEFAULTS, PALS: PALS };
})();
