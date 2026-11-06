/* Hydra Studio · studio-glass.js
 * Liquid Glass studio: a live, shader-style preview of the glass (refraction, frost, rim light, shine) and a button that builds
 * the matching rig in After Effects: one Controls null with eight sliders (Width, Height, Roundness, Glass, Frost, Edge, Light, Angle),
 * an adjustment-layer lens driven by them, and the rim / shine / shadow layers that follow it.
 * The preview is a sketch of the look, not a render: After Effects does the real displacement and blur.
 */
(function () {
  "use strict";
  var S = window.Studio, U = S.u, mk = U.mk, clamp = U.clamp, esc = U.esc, rgba = U.rgba;
  var E = null;

  var RW = 576, RH = 324, Z = RW / 1920;   // the preview is drawn at a fixed size and scaled by CSS

  var SHAPES = [
    ["Pill", { w: 0.46, h: 0.2, rad: 100 }], ["Card", { w: 0.4, h: 0.5, rad: 22 }], ["Round", { w: 0.3, h: 0.3, rad: 100 }],
    ["Bar", { w: 0.8, h: 0.13, rad: 100 }], ["Tile", { w: 0.3, h: 0.3, rad: 28 }]
  ];
  var TINTS = ["#1E1039", "#0A2A66", "#6B1740", "#0F4A33", "#6A3A0B", "#2A2A2E"];
  var STYLES = [["1", "Clear"], ["2", "Light"], ["3", "Dark"]];
  var BGS = [["aurora", "Aurora"], ["grid", "Grid"], ["sunset", "Sunset"]];
  var DEF = { style: "2", w: 0.46, h: 0.2, rad: 100, glass: 100, frost: 15, edge: 8, light: 100, angle: 0, tint: "#1E1039", bg: "aurora", name: "Liquid Glass" };

  // ------------------------------------------------------------------ background scenes (painted once per kind)
  function blob(g, x, y, r, c, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(" + c + "," + a + ")"); gr.addColorStop(1, "rgba(" + c + ",0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function paintScene(g, w, h, kind) {
    var i, x, y, u = Math.min(w, h) / 100;
    if (kind === "grid") {
      g.fillStyle = "#0b0a14"; g.fillRect(0, 0, w, h);
      blob(g, w * 0.2, h * 0.3, w * 0.5, "255,55,120", 0.5); blob(g, w * 0.82, h * 0.72, w * 0.5, "50,173,230", 0.5); blob(g, w * 0.55, h * 0.15, w * 0.35, "255,216,0", 0.25);
      g.lineWidth = Math.max(1, u * 0.3);
      var step = w / 16;
      for (i = 0; i <= 16; i++) { g.strokeStyle = i % 4 === 0 ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.22)"; g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, h); g.stroke(); }
      for (i = 0; i * step <= h + step; i++) { g.strokeStyle = i % 4 === 0 ? "rgba(255,255,255,.6)" : "rgba(255,255,255,.22)"; g.beginPath(); g.moveTo(0, i * step); g.lineTo(w, i * step); g.stroke(); }
      g.fillStyle = "#fff";
      for (i = 0; i < 18; i++) { x = ((i * 53) % 17) * step; y = ((i * 31) % 9) * step; g.beginPath(); g.arc(x, y, u * 0.9, 0, 6.3); g.fill(); }
      g.lineWidth = u * 1; g.strokeStyle = "#ffd800"; g.beginPath(); g.arc(w * 0.3, h * 0.55, h * 0.22, 0, 6.3); g.stroke();
      g.strokeStyle = "#30d158"; g.beginPath(); g.arc(w * 0.72, h * 0.4, h * 0.16, 0, 6.3); g.stroke();
    } else if (kind === "sunset") {
      var sk = g.createLinearGradient(0, 0, 0, h);
      sk.addColorStop(0, "#1b1442"); sk.addColorStop(0.45, "#b0306a"); sk.addColorStop(0.72, "#ff7a45"); sk.addColorStop(1, "#ffd27a");
      g.fillStyle = sk; g.fillRect(0, 0, w, h);
      var sun = g.createRadialGradient(w * 0.64, h * 0.62, 0, w * 0.64, h * 0.62, h * 0.5);
      sun.addColorStop(0, "rgba(255,245,200,1)"); sun.addColorStop(0.18, "rgba(255,225,150,1)"); sun.addColorStop(0.19, "rgba(255,170,90,.55)"); sun.addColorStop(1, "rgba(255,120,80,0)");
      g.fillStyle = sun; g.fillRect(0, 0, w, h);
      [["#5a2a6e", 0.62, 0.1], ["#3a1f5c", 0.72, 0.13], ["#1d1238", 0.84, 0.1]].forEach(function (L, li) {
        g.fillStyle = L[0]; g.beginPath(); g.moveTo(0, h);
        for (i = 0; i <= 24; i++) { x = i / 24 * w; y = h * L[1] + Math.sin(i * 1.3 + li * 2) * h * L[2] * 0.5 + Math.sin(i * 0.5 + li) * h * L[2]; g.lineTo(x, y); }
        g.lineTo(w, h); g.closePath(); g.fill();
      });
      g.fillStyle = "rgba(255,240,200,.9)";
      for (i = 0; i < 26; i++) { x = ((i * 37) % 97) / 97 * w; y = ((i * 53) % 41) / 41 * h * 0.4; g.fillRect(x, y, u * 0.6, u * 0.6); }
    } else {
      var bgc = g.createLinearGradient(0, 0, w, h);
      bgc.addColorStop(0, "#0e1233"); bgc.addColorStop(1, "#2a0f3d");
      g.fillStyle = bgc; g.fillRect(0, 0, w, h);
      blob(g, w * 0.18, h * 0.28, w * 0.42, "255,138,61", 0.95); blob(g, w * 0.78, h * 0.25, w * 0.4, "61,200,255", 0.85);
      blob(g, w * 0.55, h * 0.85, w * 0.45, "255,61,129", 0.9); blob(g, w * 0.35, h * 0.7, w * 0.3, "122,92,255", 0.8);
      g.fillStyle = "rgba(255,255,255,.92)"; g.font = "800 " + (h * 0.34) + "px Outfit, -apple-system, Helvetica, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("HYDRA", w * 0.5, h * 0.4);
      g.fillStyle = "rgba(255,255,255,.55)"; g.font = "500 " + (h * 0.085) + "px Outfit, -apple-system, Helvetica, sans-serif";
      g.fillText("liquid glass studio", w * 0.5, h * 0.66);
      g.fillStyle = "rgba(255,255,255,.8)";
      for (i = 0; i < 9; i++) { g.beginPath(); g.arc(w * (0.28 + i * 0.055), h * 0.8, u * 0.9, 0, 6.3); g.fill(); }
    }
  }

  // ------------------------------------------------------------------ blur (running sums; the whole picture is blurred once and cached)
  function boxBlur(src, w, h, r) {
    var ir = Math.round(r);
    if (ir < 1) return src;
    var tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length), x, y, c, k, acc, win = ir * 2 + 1, a, b;
    for (y = 0; y < h; y++) {
      for (c = 0; c < 4; c++) {
        acc = 0;
        for (k = -ir; k <= ir; k++) acc += src[(y * w + clamp(k, 0, w - 1)) * 4 + c];
        for (x = 0; x < w; x++) {
          tmp[(y * w + x) * 4 + c] = acc / win;
          a = clamp(x + ir + 1, 0, w - 1); b = clamp(x - ir, 0, w - 1);
          acc += src[(y * w + a) * 4 + c] - src[(y * w + b) * 4 + c];
        }
      }
    }
    for (x = 0; x < w; x++) {
      for (c = 0; c < 4; c++) {
        acc = 0;
        for (k = -ir; k <= ir; k++) acc += tmp[(clamp(k, 0, h - 1) * w + x) * 4 + c];
        for (y = 0; y < h; y++) {
          out[(y * w + x) * 4 + c] = acc / win;
          a = clamp(y + ir + 1, 0, h - 1); b = clamp(y - ir, 0, h - 1);
          acc += tmp[(a * w + x) * 4 + c] - tmp[(b * w + x) * 4 + c];
        }
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ the renderer
  var Ren = { scene: null, tmp: null, kind: "", sharp: null, blur: null, blurKey: "", drift: true, cx: 0.5, cy: 0.5, last: null };

  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  function ensure(P) {
    var g, key, fr;
    if (!Ren.scene) {
      Ren.scene = document.createElement("canvas"); Ren.scene.width = RW; Ren.scene.height = RH;
      Ren.tmp = document.createElement("canvas"); Ren.tmp.width = RW; Ren.tmp.height = RH;
      Ren.kind = ""; Ren.blurKey = "";
    }
    if (Ren.kind !== P.bg) {
      g = Ren.scene.getContext("2d"); g.clearRect(0, 0, RW, RH); paintScene(g, RW, RH, P.bg);
      Ren.kind = P.bg; Ren.blurKey = ""; Ren.sharp = null;
    }
    fr = Math.max(0, P.frost) * 0.5 * Z * 0.8;
    key = P.bg + "|" + Math.round(fr * 10);
    if (Ren.blurKey !== key) {
      if (!Ren.sharp) Ren.sharp = Ren.scene.getContext("2d").getImageData(0, 0, RW, RH).data;
      Ren.blur = boxBlur(boxBlur(Ren.sharp, RW, RH, fr), RW, RH, fr);
      Ren.blurKey = key;
    }
  }

  // P: { w, h (fractions of the stage), rad (0..100), glass, frost, edge, light, angle, style, tint, bg }
  function renderGlass(cv, P, t) {
    var style = Number(P.style), G = P.glass / 100, LI = P.light / 100;
    if (cv.width !== RW || cv.height !== RH) { cv.width = RW; cv.height = RH; }
    ensure(P);
    var g = cv.getContext("2d"), W = RW, H = RH;
    var lw = clamp(P.w, 0.05, 1.4) * W, lh = clamp(P.h, 0.04, 1.4) * H, hw = lw / 2, hh = lh / 2, rad = clamp(P.rad, 0, 100) / 100 * Math.min(hw, hh), cx, cy;
    if (Ren.drift) { cx = W * (0.5 + 0.06 * Math.sin(t * 0.55)); cy = H * (0.5 + 0.045 * Math.sin(t * 0.8 + 1.2)); }
    else { cx = Ren.cx * W; cy = Ren.cy * H; }
    Ren.last = { cx: cx / W, cy: cy / H };

    // the picture, and the soft shadow under the lens (shadowBlur works in every Chromium that CEP ships)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.drawImage(Ren.scene, 0, 0);
    if (style !== 1) {
      var tc = U.hexToRgb(P.tint), sc = style === 3 ? [0, 0, 0] : tc;
      g.save();
      g.shadowColor = rgba(sc, style === 3 ? 0.55 : 0.5); g.shadowBlur = 80 * Z; g.shadowOffsetX = 10000; g.shadowOffsetY = 105 * Z;
      g.fillStyle = "#000";
      U.rrect(g, cx - hw - 10000, cy - hh, lw, lh, rad);
      g.fill();
      g.restore();
    }

    // the glass itself, pixel by pixel inside the lens box
    var x0 = Math.max(0, Math.floor(cx - hw - 2)), x1 = Math.min(W, Math.ceil(cx + hw + 2)), y0 = Math.max(0, Math.floor(cy - hh - 2)), y1 = Math.min(H, Math.ceil(cy + hh + 2));
    var rw = x1 - x0, rh = y1 - y0;
    if (rw < 2 || rh < 2) return;
    var out = g.createImageData(rw, rh), od = out.data, bl = Ren.blur;
    var tint = U.hexToRgb(P.tint), edgeCol = style === 2 ? [Math.min(255, tint[0] * 1.6 + 70), Math.min(255, tint[1] * 1.6 + 70), Math.min(255, tint[2] * 1.6 + 90)] : [255, 255, 255];
    var ew = 1.4 + P.edge * 0.2, ring = Math.max(5, Math.min(hw, hh) * 0.55), B = 95 * Z * G * (0.6 + 0.4 * Math.min(1, Math.min(hw, hh) / 40)), mag = 0.09 * G;
    var ca = [1.14, 1, 0.86], arcs = [[225 + P.angle, 58, 1], [45 + P.angle, 40, 0.8]];
    var x, y, X, Y, qx, qy, d, depth, cover, tt, prof, nx, ny, l, c, sx, sy, ix, iy, fx, fy, i0, a00, a10, a01, a11, p, v, k, dd, arcM, spec, phi, glow, soft, rimv, col = [0, 0, 0], sgx, sgy;
    for (y = y0; y < y1; y++) {
      for (x = x0; x < x1; x++) {
        X = x + 0.5; Y = y + 0.5;
        qx = Math.abs(X - cx) - (hw - rad); qy = Math.abs(Y - cy) - (hh - rad);
        l = Math.sqrt(Math.max(qx, 0) * Math.max(qx, 0) + Math.max(qy, 0) * Math.max(qy, 0));
        d = l + Math.min(Math.max(qx, qy), 0) - rad;
        if (d > 0.7) continue;
        cover = d < -0.7 ? 1 : (0.7 - d) / 1.4;
        depth = Math.max(0, -d);
        // outward normal of the shape here
        sgx = X >= cx ? 1 : -1; sgy = Y >= cy ? 1 : -1;
        if (qx > 0 || qy > 0) { nx = sgx * Math.max(qx, 0) / (l || 1); ny = sgy * Math.max(qy, 0) / (l || 1); }
        else if (qx > qy) { nx = sgx; ny = 0; } else { nx = 0; ny = sgy; }
        tt = clamp(depth / ring, 0, 1); prof = (1 - tt) * (1 - tt);
        // refraction: the middle is a touch magnified, the rim pulls the picture inward, each color by a slightly different amount
        for (c = 0; c < 3; c++) {
          sx = X + (cx - X) * mag - nx * B * prof * ca[c];
          sy = Y + (cy - Y) * mag - ny * B * prof * ca[c];
          sx = clamp(sx - 0.5, 0, W - 1.001); sy = clamp(sy - 0.5, 0, H - 1.001);
          ix = sx | 0; iy = sy | 0; fx = sx - ix; fy = sy - iy;
          i0 = (iy * W + ix) * 4 + c;
          a00 = bl[i0]; a10 = bl[i0 + 4]; a01 = bl[i0 + W * 4]; a11 = bl[i0 + W * 4 + 4];
          col[c] = (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy;
        }
        // body of the glass
        if (style === 1) { col[0] = col[0] * 1.03 + 6; col[1] = col[1] * 1.03 + 6; col[2] = col[2] * 1.03 + 8; }
        else if (style === 2) { col[0] = col[0] * 0.88 + 255 * 0.12 * LI; col[1] = col[1] * 0.88 + 255 * 0.12 * LI; col[2] = col[2] * 0.88 + 255 * 0.13 * LI; }
        else { col[0] *= 0.66; col[1] *= 0.66; col[2] *= 0.7; }
        // light on the rim
        glow = Math.exp(-depth / ew); soft = Math.exp(-depth / (ew * 3.6)); rimv = Math.exp(-depth / (ew * 2.3));
        if (style === 2) v = glow * 0.8 * LI;
        else if (style === 3) v = (glow * 0.8 + rimv * 0.2) * LI;
        else v = (soft * 0.4 + rimv * 0.2) * LI;
        v = clamp(v, 0, 1) * (style === 2 ? 0.8 : 0.62);
        col[0] += (edgeCol[0] - col[0]) * v; col[1] += (edgeCol[1] - col[1]) * v; col[2] += (edgeCol[2] - col[2]) * v;
        // the shine: two bright arcs that hug the inside of the rim
        phi = Math.atan2(Y - cy, X - cx) * 180 / Math.PI;
        spec = 0;
        for (k = 0; k < 2; k++) {
          dd = Math.abs(((phi - arcs[k][0] + 540) % 360) - 180);
          arcM = 1 - smooth(arcs[k][1] * 0.45, arcs[k][1], dd);
          spec += arcM * arcs[k][2];
        }
        dd = (depth - ew * 0.7) / Math.max(0.8, ew * 0.55);
        spec = clamp(spec * Math.exp(-dd * dd) * LI * 0.9, 0, 1);
        col[0] += (255 - col[0]) * spec; col[1] += (255 - col[1]) * spec; col[2] += (255 - col[2]) * spec;
        p = ((y - y0) * rw + (x - x0)) * 4;
        od[p] = col[0]; od[p + 1] = col[1]; od[p + 2] = col[2]; od[p + 3] = cover * 255;
      }
    }
    var tg = Ren.tmp.getContext("2d");
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.clearRect(0, 0, W, H);
    tg.putImageData(out, x0, y0);
    g.drawImage(Ren.tmp, 0, 0);
  }

  // ------------------------------------------------------------------ the pane
  var st, ui = {}, sl = {};

  function toHost() {
    var tc = U.hexToRgb(st.tint);
    return {
      rel: 1, name: st.name || "Liquid Glass", w: U.round(st.w, 4), h: U.round(st.h, 4), rad: U.round(st.rad / 100, 4),
      glass: st.glass, frost: st.frost, edge: st.edge, light: st.light, angle: st.angle, style: Number(st.style),
      tint: [U.round(tc[0] / 255, 4), U.round(tc[1] / 255, 4), U.round(tc[2] / 255, 4)]
    };
  }

  function styleName() { return STYLES.filter(function (s) { return s[0] === st.style; })[0][1]; }
  function tag() { ui.pstage.tag.textContent = Math.round(st.w * 1920) + " × " + Math.round(st.h * 1080); }
  function sync() {
    ui.pstage.name.textContent = "Liquid Glass · " + styleName();
    tag();
    ui.tintBox.style.display = st.style === "2" ? "" : "none";
    sl.w.set(Math.round(st.w * 100)); sl.h.set(Math.round(st.h * 100)); sl.rad.set(st.rad);
    ui.styleSeg.set(st.style);
    E.dockChanged();
  }

  function slider(label, key, min, max, step, fmt, scale) {
    var s = U.slider({
      label: label, min: min, max: max, step: step, value: scale ? Math.round(st[key] * scale) : st[key], def: scale ? Math.round(DEF[key] * scale) : DEF[key], fmt: fmt,
      onInput: function (v) { st[key] = scale ? v / scale : v; tag(); },
      onChange: function () { E.save(); E.dockChanged(); }
    });
    sl[key] = s;
    return s.el;
  }

  function reset() {
    ["w", "h", "rad", "glass", "frost", "edge", "light", "angle"].forEach(function (k) { st[k] = DEF[k]; });
    sl.glass.set(st.glass); sl.frost.set(st.frost); sl.edge.set(st.edge); sl.light.set(st.light); sl.angle.set(st.angle);
    sync(); E.save();
  }

  function frame(t) { if (ui.pstage) renderGlass(ui.pstage.cv, st, t); }

  function build(el) {
    E = U.env();
    st = S.store("glass", DEF);
    if (["1", "2", "3"].indexOf(String(st.style)) < 0) st.style = "2";
    st.style = String(st.style);
    if (!/^#[0-9a-f]{6}$/i.test(st.tint)) st.tint = DEF.tint;
    if (!BGS.some(function (b) { return b[0] === st.bg; })) st.bg = "aurora";
    ["w", "h", "rad", "glass", "frost", "edge", "light", "angle"].forEach(function (k) { if (typeof st[k] !== "number" || isNaN(st[k])) st[k] = DEF[k]; });

    ui.pstage = U.stage(56.25);
    el.appendChild(ui.pstage.el);
    ui.pstage.el.style.cursor = "grab";
    // drag the glass around the preview (double-click lets it float again)
    ui.pstage.el.addEventListener("mousedown", function (e) {
      var r = ui.pstage.cv.getBoundingClientRect(), last = Ren.last || { cx: 0.5, cy: 0.5 };
      Ren.drift = false; Ren.cx = last.cx; Ren.cy = last.cy;
      var sx = e.clientX, sy = e.clientY, ox = Ren.cx, oy = Ren.cy;
      ui.pstage.el.style.cursor = "grabbing";
      function move(ev) { Ren.cx = clamp(ox + (ev.clientX - sx) / r.width, 0.04, 0.96); Ren.cy = clamp(oy + (ev.clientY - sy) / r.height, 0.04, 0.96); frame(0); }
      function up() { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); ui.pstage.el.style.cursor = "grab"; }
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
      e.preventDefault();
    });
    ui.pstage.el.addEventListener("dblclick", function () { Ren.drift = true; });

    var top = mk("div", "mtop");
    ui.styleSeg = U.seg(STYLES, st.style, function (v) { st.style = v; sync(); E.save(); });
    top.appendChild(ui.styleSeg.el);
    el.appendChild(top);

    var chips = mk("div", "xpills");
    SHAPES.forEach(function (s) {
      var b = mk("button", "xpill", esc(s[0])); b.type = "button";
      b.addEventListener("click", function () { st.w = s[1].w; st.h = s[1].h; st.rad = s[1].rad; sync(); E.save(); });
      chips.appendChild(b);
    });
    el.appendChild(chips);

    el.appendChild(U.head("Shape"));
    var c1 = mk("div", "card2");
    c1.appendChild(slider("Width", "w", 8, 140, 1, function (v) { return Math.round(v) + " %"; }, 100));
    c1.appendChild(slider("Height", "h", 4, 140, 1, function (v) { return Math.round(v) + " %"; }, 100));
    c1.appendChild(slider("Roundness", "rad", 0, 100, 1, function (v) { return v >= 100 ? "Round" : Math.round(v) + " %"; }));
    el.appendChild(c1);

    el.appendChild(U.head("Glass", U.ghostBtn("Reset", reset, "Back to the default glass")));
    var c2 = mk("div", "card2");
    c2.appendChild(slider("Glass", "glass", 0, 200, 1, function (v) { return Math.round(v) + " %"; }));
    c2.appendChild(slider("Frost", "frost", 0, 60, 1, function (v) { return v === 0 ? "Clear" : String(Math.round(v)); }));
    c2.appendChild(slider("Edge", "edge", 0, 30, 1, function (v) { return String(Math.round(v)); }));
    c2.appendChild(slider("Light", "light", 0, 200, 1, function (v) { return Math.round(v) + " %"; }));
    c2.appendChild(slider("Angle", "angle", 0, 360, 1, function (v) { return Math.round(v) + "°"; }));
    ui.tintBox = mk("div", "xchoice"); ui.tintBox.appendChild(mk("span", "", "Tint (Light style)"));
    ui.sw = U.swatches(TINTS, st.tint, function (v) { st.tint = v; E.save(); }, true); ui.tintBox.appendChild(ui.sw.el);
    c2.appendChild(ui.tintBox);
    el.appendChild(c2);

    el.appendChild(U.head("Preview background"));
    var bgc = mk("div", "card2");
    ui.bgSeg = U.seg(BGS, st.bg, function (v) { st.bg = v; E.save(); });
    bgc.appendChild(ui.bgSeg.el);
    el.appendChild(bgc);
    el.appendChild(U.note("The preview is a sketch of the look: After Effects renders the real glass with a displacement map, blur and a lit rim. Drag the glass around the preview; double-click lets it float again. In After Effects the “Liquid Glass Controls” null is the master: move, scale or rotate it to place and resize the whole glass (corners and edges are never stretched), and use its sliders, Roundness included, for the look."));
    sync();
    frame(0.6);
  }

  S.register("glass", {
    title: "Glass", rgb: [50, 173, 230], icon: "glass", build: build, frame: frame,
    show: function () { frame(0.6); },
    dock: function () {
      var g = E.gate(), s = E.sel(), hint;
      hint = g || (!s.hasComp ? "Open a composition first" : s.total > 0 ? "→ glass above your selection" : "→ glass over the whole composition");
      return { name: "Liquid Glass · " + (st ? styleName() : "Light"), hint: hint, ok: !g && s.hasComp, label: "Create" };
    },
    apply: function () {
      var g = E.gate();
      if (g) return Promise.resolve({ ok: false, msg: g });
      return E.call("ops_glassStudio", toHost()).then(function (r) {
        if (r && r.ok) {
          var w = r.warnings || [];
          return { ok: true, msg: "Created “" + r.name + "” · " + r.layers + " layers" + (w.length ? " · " + w.length + " note" + (w.length > 1 ? "s" : "") : ""), warn: w[0], done: "Created" };
        }
        return { ok: false, msg: (r && r.error) || "Could not build the glass" };
      });
    }
  });
  S._glass = { renderGlass: renderGlass, toHost: function () { return toHost(); } };
})();
