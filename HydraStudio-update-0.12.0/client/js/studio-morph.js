/* Hydra Studio · studio-morph.js
 * Morph: turns one shape into another. Pick two shapes from the library, or morph your own two shape layers.
 * The panel makes both outlines have the same number of points (splitting curves without changing their look),
 * lines the points up, and sends After Effects one shape layer whose Path animates from A to B.
 */
(function () {
  "use strict";
  var S = window.Studio, U = S.u, mk = U.mk, clamp = U.clamp, esc = U.esc, rgba = U.rgba, lerp = U.lerp;
  var E = null;
  var K = 0.5523;

  // ------------------------------------------------------------------ bezier outlines
  // a segment is [p0, c1, c2, p1] (absolute points). A shape is { v, i, o, c } the way After Effects stores a path:
  // vertices plus in / out tangents relative to each vertex.
  function toSegs(s) {
    var n = s.v.length, segs = [], k, k2, p0, p1, last = s.c ? n : n - 1;
    for (k = 0; k < last; k++) {
      k2 = (k + 1) % n; p0 = s.v[k]; p1 = s.v[k2];
      segs.push([[p0[0], p0[1]], [p0[0] + s.o[k][0], p0[1] + s.o[k][1]], [p1[0] + s.i[k2][0], p1[1] + s.i[k2][1]], [p1[0], p1[1]]]);
    }
    return segs;
  }
  function fromSegs(segs) {
    var n = segs.length, v = [], i = [], o = [], k, sg, pv;
    for (k = 0; k < n; k++) {
      sg = segs[k]; pv = segs[(k - 1 + n) % n];
      v.push([sg[0][0], sg[0][1]]);
      o.push([sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]]);
      i.push([pv[2][0] - pv[3][0], pv[2][1] - pv[3][1]]);
    }
    return { v: v, i: i, o: o, c: 1 };
  }
  function mid(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function split(sg, t) {
    var a = mid(sg[0], sg[1], t), b = mid(sg[1], sg[2], t), c = mid(sg[2], sg[3], t), d = mid(a, b, t), e = mid(b, c, t), m = mid(d, e, t);
    return [[sg[0], a, d, m], [m, e, c, sg[3]]];
  }
  function pointAt(sg, t) {
    var u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * sg[0][0] + b * sg[1][0] + c * sg[2][0] + d * sg[3][0], a * sg[0][1] + b * sg[1][1] + c * sg[2][1] + d * sg[3][1]];
  }
  function segLen(sg) {
    var n = 10, i, p = sg[0], q, len = 0;
    for (i = 1; i <= n; i++) { q = pointAt(sg, i / n); len += Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1])); p = q; }
    return len;
  }
  function area(segs) {
    var a = 0, k, i, n = 6, p, q;
    for (k = 0; k < segs.length; k++) {
      p = segs[k][0];
      for (i = 1; i <= n; i++) { q = pointAt(segs[k], i / n); a += p[0] * q[1] - q[0] * p[1]; p = q; }
    }
    return a / 2;
  }
  function reverse(segs) {
    var out = [], k;
    for (k = segs.length - 1; k >= 0; k--) out.push([segs[k][3], segs[k][2], segs[k][1], segs[k][0]]);
    return out;
  }
  // splits the longest curve until there are `n`
  function subdivideTo(segs, n) {
    var list = segs.map(function (s) { return { s: s, parts: 1, len: segLen(s) }; }), k, best, bi, i, pieces, a, b;
    // each original curve is cut into equal parts: pick the curve whose pieces are the longest
    var total = list.length;
    while (total < n) {
      best = -1; bi = 0;
      for (i = 0; i < list.length; i++) { if (list[i].len / list[i].parts > best) { best = list[i].len / list[i].parts; bi = i; } }
      list[bi].parts++; total++;
    }
    var out = [];
    for (i = 0; i < list.length; i++) {
      pieces = [list[i].s];
      for (k = list[i].parts; k > 1; k--) {
        // cut the first piece off the remaining curve so every piece has about the same share
        var t = 1 / k, last = pieces.pop(), pr = split(last, t);
        pieces.push(pr[0]); pieces.push(pr[1]);
      }
      for (k = 0; k < pieces.length; k++) out.push(pieces[k]);
    }
    return out;
  }
  function rotateSegs(segs, s) { var n = segs.length, out = [], k; for (k = 0; k < n; k++) out.push(segs[(k + s) % n]); return out; }
  function d2(a, b) { return (a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]); }

  // same number of points, same direction, best starting point. Returns { A, B } (closed paths) or null for open paths
  function equalize(A, B) {
    if (!A || !B || !A.c || !B.c) return null;
    var a = toSegs(A), b = toSegs(B), n, k, s, best = Infinity, bs = 0, cost;
    if (!a.length || !b.length) return null;
    n = Math.max(a.length, b.length);
    a = subdivideTo(a, n); b = subdivideTo(b, n);
    if (area(a) * area(b) < 0) b = reverse(b);
    for (s = 0; s < n; s++) {
      cost = 0;
      for (k = 0; k < n; k++) cost += d2(a[k][0], b[(k + s) % n][0]);
      if (cost < best - 1e-9) { best = cost; bs = s; }
    }
    b = rotateSegs(b, bs);
    return { A: fromSegs(a), B: fromSegs(b) };
  }
  function lerpShape(A, B, t) {
    var v = [], i = [], o = [], k, n = A.v.length;
    for (k = 0; k < n; k++) {
      v.push([lerp(A.v[k][0], B.v[k][0], t), lerp(A.v[k][1], B.v[k][1], t)]);
      i.push([lerp(A.i[k][0], B.i[k][0], t), lerp(A.i[k][1], B.i[k][1], t)]);
      o.push([lerp(A.o[k][0], B.o[k][0], t), lerp(A.o[k][1], B.o[k][1], t)]);
    }
    return { v: v, i: i, o: o, c: 1 };
  }
  function bounds(s) {
    var segs = toSegs(s), mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity, k, i, p;
    for (k = 0; k < segs.length; k++) for (i = 0; i <= 8; i++) { p = pointAt(segs[k], i / 8); mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); }
    return { x0: mnx, y0: mny, x1: mxx, y1: mxy };
  }
  // path text for svg / Path2D, scaled and moved
  function pathD(s, sc, ox, oy) {
    var n = s.v.length, d = "", k, k2, p, q, c1, c2;
    function X(x) { return (x * sc + ox).toFixed(2); }
    function Y(y) { return (y * sc + oy).toFixed(2); }
    for (k = 0; k < n; k++) {
      k2 = (k + 1) % n; p = s.v[k]; q = s.v[k2];
      if (k === 0) d += "M" + X(p[0]) + " " + Y(p[1]);
      c1 = [p[0] + s.o[k][0], p[1] + s.o[k][1]]; c2 = [q[0] + s.i[k2][0], q[1] + s.i[k2][1]];
      d += "C" + X(c1[0]) + " " + Y(c1[1]) + " " + X(c2[0]) + " " + Y(c2[1]) + " " + X(q[0]) + " " + Y(q[1]);
    }
    return d + "Z";
  }
  function trace(g, s, sc, ox, oy) {
    var n = s.v.length, k, k2, p, q;
    g.beginPath();
    for (k = 0; k < n; k++) {
      k2 = (k + 1) % n; p = s.v[k]; q = s.v[k2];
      if (k === 0) g.moveTo(p[0] * sc + ox, p[1] * sc + oy);
      g.bezierCurveTo((p[0] + s.o[k][0]) * sc + ox, (p[1] + s.o[k][1]) * sc + oy, (q[0] + s.i[k2][0]) * sc + ox, (q[1] + s.i[k2][1]) * sc + oy, q[0] * sc + ox, q[1] * sc + oy);
    }
    g.closePath();
  }

  // ------------------------------------------------------------------ the shape library (unit size, y points down)
  function poly(pts) { var z = [0, 0]; return { v: pts.map(function (p) { return [p[0], p[1]]; }), i: pts.map(function () { return z.slice(); }), o: pts.map(function () { return z.slice(); }), c: 1 }; }
  function ngon(n, R, rot) { var pts = [], k, a; for (k = 0; k < n; k++) { a = rot + Math.PI * 2 * k / n; pts.push([Math.cos(a) * R, Math.sin(a) * R]); } return poly(pts); }
  function starShape(n, R, r, rot) { var pts = [], k, a, rr; for (k = 0; k < n * 2; k++) { a = rot + Math.PI * k / n; rr = k % 2 ? r : R; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return poly(pts); }
  function roundRect(hw, hh, r) {
    r = Math.min(r, hw, hh);
    var q = K * r, z = [0, 0];
    return {
      v: [[-hw + r, -hh], [hw - r, -hh], [hw, -hh + r], [hw, hh - r], [hw - r, hh], [-hw + r, hh], [-hw, hh - r], [-hw, -hh + r]],
      i: [[-q, 0], z, [0, -q], z, [q, 0], z, [0, q], z], o: [z, [q, 0], z, [0, q], z, [-q, 0], z, [0, -q]], c: 1
    };
  }
  var LIB = [
    { id: "circle", name: "Circle", shape: { v: [[0, -1], [1, 0], [0, 1], [-1, 0]], i: [[-K, 0], [0, -K], [K, 0], [0, K]], o: [[K, 0], [0, K], [-K, 0], [0, -K]], c: 1 } },
    { id: "square", name: "Square", shape: poly([[-0.86, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86]]) },
    { id: "rounded", name: "Rounded", shape: roundRect(0.88, 0.88, 0.34) },
    { id: "pill", name: "Pill", shape: roundRect(1, 0.5, 0.5) },
    { id: "triangle", name: "Triangle", shape: ngon(3, 1.02, -Math.PI / 2) },
    { id: "diamond", name: "Diamond", shape: poly([[0, -1], [0.78, 0], [0, 1], [-0.78, 0]]) },
    { id: "pentagon", name: "Pentagon", shape: ngon(5, 1, -Math.PI / 2) },
    { id: "hexagon", name: "Hexagon", shape: ngon(6, 1, 0) },
    { id: "star", name: "Star", shape: starShape(5, 1.05, 0.44, -Math.PI / 2) },
    { id: "heart", name: "Heart", shape: fromSegs([
      [[0, 0.95], [-0.45, 0.55], [-1, 0.2], [-1, -0.25]], [[-1, -0.25], [-1, -0.62], [-0.78, -0.9], [-0.5, -0.9]], [[-0.5, -0.9], [-0.25, -0.9], [-0.02, -0.68], [0, -0.45]],
      [[0, -0.45], [0.02, -0.68], [0.25, -0.9], [0.5, -0.9]], [[0.5, -0.9], [0.78, -0.9], [1, -0.62], [1, -0.25]], [[1, -0.25], [1, 0.2], [0.45, 0.55], [0, 0.95]]
    ]) },
    { id: "drop", name: "Drop", shape: fromSegs([
      [[0, -1], [0.12, -0.55], [0.7, -0.2], [0.7, 0.35]], [[0.7, 0.35], [0.7, 0.72], [0.38, 0.95], [0, 0.95]], [[0, 0.95], [-0.38, 0.95], [-0.7, 0.72], [-0.7, 0.35]], [[-0.7, 0.35], [-0.7, -0.2], [-0.12, -0.55], [0, -1]]
    ]) },
    { id: "plus", name: "Plus", shape: poly([[-0.3, -0.95], [0.3, -0.95], [0.3, -0.3], [0.95, -0.3], [0.95, 0.3], [0.3, 0.3], [0.3, 0.95], [-0.3, 0.95], [-0.3, 0.3], [-0.95, 0.3], [-0.95, -0.3], [-0.3, -0.3]]) },
    { id: "arrow", name: "Arrow", shape: poly([[-1, -0.3], [0.1, -0.3], [0.1, -0.78], [1, 0], [0.1, 0.78], [0.1, 0.3], [-1, 0.3]]) },
    { id: "bolt", name: "Bolt", shape: poly([[0.2, -1], [-0.6, 0.12], [-0.06, 0.12], [-0.2, 1], [0.62, -0.22], [0.06, -0.22], [0.5, -1]]) }
  ];
  function libById(id) { var i; for (i = 0; i < LIB.length; i++) if (LIB[i].id === id) return LIB[i]; return LIB[0]; }

  var EASES = { smooth: [0.65, 0, 0.35, 1], snappy: [0.16, 1, 0.3, 1], overshoot: [0.34, 1.56, 0.64, 1], linear: [0, 0, 1, 1] };
  var SWC = ["#FFD800", "#FF9F0A", "#FF375F", "#BF5AF2", "#0A84FF", "#32ADE6", "#30D158", "#FFFFFF"];

  // ------------------------------------------------------------------ the pane
  var st, ui = {}, t0 = 0, eq = null, layerInfo = null, busyRead = false, photo = null;

  function easeB() {
    if (st.ease === "curve") { var c = E.settings().studio && E.settings().studio.curve; if (c && Array.isArray(c.b) && c.b.length === 4) return c.b; return EASES.smooth; }
    return EASES[st.ease] || EASES.smooth;
  }

  // which two shapes the stage is showing
  function pair() {
    if (st.mode === "layers") {
      if (!layerInfo) return null;
      return layerInfo.eq;
    }
    return eq;
  }
  function recompute() {
    if (st.mode === "photos") { if (photo) photo.refreshStage(); E.dockChanged(); return; }
    var a = libById(st.A).shape, b = libById(st.B).shape;
    eq = equalize(a, b);
    if (st.mode === "layers") { ui.pstage.name.textContent = layerInfo ? layerInfo.from.name + "  →  " + layerInfo.to.name : "Your two layers"; }
    else ui.pstage.name.textContent = libById(st.A).name + "  →  " + libById(st.B).name;
    ui.pstage.tag.textContent = (pair() ? pair().A.v.length + " points" : "");
    E.dockChanged();
  }

  function thumbSvg(sh, size) {
    var b = bounds(sh), w = b.x1 - b.x0, h = b.y1 - b.y0, sc = (size - 8) / Math.max(w, h), ox = size / 2 - (b.x0 + w / 2) * sc, oy = size / 2 - (b.y0 + h / 2) * sc;
    return '<svg viewBox="0 0 ' + size + " " + size + '" width="' + size + '" height="' + size + '"><path d="' + pathD(sh, sc, ox, oy) + '" fill="currentColor"/></svg>';
  }

  function shapeGrid(key) {
    var box = mk("div", "mgrid");
    LIB.forEach(function (it) {
      var b = mk("button", "mshape", thumbSvg(it.shape, 30));
      b.type = "button"; b.title = it.name; b.setAttribute("data-id", it.id);
      b.addEventListener("click", function () { st[key] = it.id; syncGrids(); recompute(); t0 = performance.now(); E.save(); });
      box.appendChild(b);
    });
    return box;
  }
  function syncGrids() {
    [["A", ui.gridA], ["B", ui.gridB]].forEach(function (p) {
      Array.prototype.forEach.call(p[1].children, function (c) { c.classList.toggle("on", c.getAttribute("data-id") === st[p[0]]); });
    });
  }

  function setMode(m) {
    st.mode = m;
    ui.shapesBox.style.display = m === "shapes" ? "" : "none";
    ui.layersBox.style.display = m === "layers" ? "" : "none";
    if (ui.photosBox) ui.photosBox.style.display = m === "photos" ? "" : "none";
    ui.pstage.el.classList.toggle("psticky", m === "photos");
    ui.sizeRow.show(m === "shapes");
    ui.colBox.style.display = m === "shapes" ? "" : "none";
    ui.hideTg.show(m === "layers");
    ui.colTg.show(m === "layers");
    ui.note.style.display = m === "photos" ? "none" : "";
    if (m === "photos" && photo) photo.show();
    ui.modeSeg.set(m);
    recompute();
    t0 = performance.now();
    E.save();
  }

  // ---- reading the two selected layers
  function readLayers(quiet) {
    var g = E.gate();
    if (g) { if (!quiet) E.toast(g, true); return Promise.resolve(null); }
    if (busyRead) return Promise.resolve(null);
    busyRead = true; ui.read.classList.add("busy");
    return E.call("ops_morphRead").then(function (r) {
      busyRead = false; ui.read.classList.remove("busy");
      if (!r || !r.ok) { if (!quiet) E.toast((r && r.error) || "Could not read the layers", true); layerInfo = null; ui.layerNote.textContent = (r && r.error) || "Select exactly two shape layers."; recompute(); return null; }
      var e = equalize(r.from.shape, r.to.shape);
      if (!e) { layerInfo = null; ui.layerNote.textContent = "Both shapes need to be closed paths."; recompute(); return null; }
      layerInfo = { from: r.from, to: r.to, eq: e };
      ui.layerNote.textContent = "“" + r.from.name + "” turns into “" + r.to.name + "” · " + e.A.v.length + " points";
      recompute(); t0 = performance.now();
      return layerInfo;
    });
  }

  // ---- stage
  function colors() {
    if (st.mode === "layers" && layerInfo) {
      var f = layerInfo.from.fill, t = layerInfo.to.fill;
      return [f ? [f[0] * 255, f[1] * 255, f[2] * 255] : U.hexToRgb(st.cA), t ? [t[0] * 255, t[1] * 255, t[2] * 255] : U.hexToRgb(st.cB)];
    }
    return [U.hexToRgb(st.cA), U.hexToRgb(st.cB)];
  }
  function frame() {
    if (st.mode === "photos") { if (photo) photo.frame(); return; }
    var cv = ui.pstage.cv, f = U.fit(cv), g = cv.getContext("2d"), w = f.w, h = f.h, p = pair(), ac = U.accent();
    g.setTransform(f.d, 0, 0, f.d, 0, 0);
    g.clearRect(0, 0, w, h);
    var bg = g.createRadialGradient(w / 2, h * 0.5, 4, w / 2, h * 0.5, w * 0.6);
    bg.addColorStop(0, "rgba(120,110,200,.22)"); bg.addColorStop(1, "rgba(13,12,20,0)");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    var gx, gy;
    g.fillStyle = "rgba(255,255,255,.07)";
    for (gx = 14; gx < w; gx += 22) for (gy = 14; gy < h; gy += 22) g.fillRect(gx, gy, 1.3, 1.3);
    if (!p) {
      g.fillStyle = "rgba(255,255,255,.5)"; g.font = "500 12px Outfit, sans-serif"; g.textAlign = "center";
      g.fillText(st.mode === "layers" ? "Select two shape layers, then press Read" : "", w / 2, h / 2);
      return;
    }
    // timeline: hold A, morph, hold B, morph back
    var d = clamp(st.dur, 0.2, 4), hold = 0.45, cyc = (d + hold) * 2, ph = ((performance.now() - t0) / 1000) % cyc, u;
    if (ph < hold) u = 0; else if (ph < hold + d) u = (ph - hold) / d; else if (ph < hold * 2 + d) u = 1; else u = 1 - (ph - hold * 2 - d) / d;
    var k = U.ease(easeB(), clamp(u, 0, 1)), cur = lerpShape(p.A, p.B, k), cols = colors();
    // fit both shapes into the stage
    var ba = bounds(p.A), bb = bounds(p.B), x0 = Math.min(ba.x0, bb.x0), x1 = Math.max(ba.x1, bb.x1), y0 = Math.min(ba.y0, bb.y0), y1 = Math.max(ba.y1, bb.y1);
    var sc = Math.min(w * 0.46 / Math.max(1e-6, x1 - x0), h * 0.7 / Math.max(1e-6, y1 - y0)), ox = w / 2 - (x0 + x1) / 2 * sc, oy = h / 2 - (y0 + y1) / 2 * sc;
    g.setLineDash([4, 4]); g.lineWidth = 1.2; g.strokeStyle = "rgba(255,255,255,.2)";
    trace(g, p.A, sc, ox, oy); g.stroke(); trace(g, p.B, sc, ox, oy); g.stroke();
    g.setLineDash([]);
    var c0 = cols[0], c1 = cols[1], ca = (st.mode === "layers" ? st.animColor : st.animColor) ? [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)] : c0;
    var gr = g.createLinearGradient(0, h * 0.2, 0, h * 0.8);
    gr.addColorStop(0, rgba([Math.min(255, ca[0] + 28), Math.min(255, ca[1] + 28), Math.min(255, ca[2] + 28)], 1)); gr.addColorStop(1, rgba([ca[0] * 0.8, ca[1] * 0.8, ca[2] * 0.8], 1));
    trace(g, cur, sc, ox, oy);
    g.shadowColor = rgba(ca, 0.5); g.shadowBlur = 22;
    g.fillStyle = gr; g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 1; g.stroke();
    // the points that move
    g.fillStyle = "rgba(255,255,255,.85)";
    var i;
    for (i = 0; i < cur.v.length; i++) { g.beginPath(); g.arc(cur.v[i][0] * sc + ox, cur.v[i][1] * sc + oy, 2.1, 0, 6.3); g.fill(); }
    // progress hairline
    g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(w * 0.12, h - 16, w * 0.76, 3);
    g.fillStyle = rgba(ac, 0.95); g.fillRect(w * 0.12, h - 16, w * 0.76 * clamp(u, 0, 1), 3);
  }

  function build(el) {
    E = U.env();
    st = S.store("morph", { mode: "shapes", A: "circle", B: "star", dur: 1.2, ease: "smooth", cA: "#FFD800", cB: "#FF375F", animColor: true, size: 420, at: "playhead", hide: true });
    if (!LIB.some(function (l) { return l.id === st.A; })) st.A = "circle";
    if (!LIB.some(function (l) { return l.id === st.B; })) st.B = "star";
    if (st.mode !== "layers" && st.mode !== "photos") st.mode = "shapes";
    if (!EASES[st.ease] && st.ease !== "curve") st.ease = "smooth";
    st.dur = clamp(Number(st.dur) || 1.2, 0.2, 4); st.size = clamp(Number(st.size) || 420, 100, 1200);

    ui.pstage = U.stage(56.25);
    el.appendChild(ui.pstage.el);
    var top = mk("div", "mtop");
    ui.modeSeg = U.seg([["shapes", "Shapes"], ["layers", "My layers"], ["photos", "Photos"]], st.mode, setMode);
    top.appendChild(ui.modeSeg.el);
    el.appendChild(top);

    // library mode
    ui.shapesBox = mk("div", "mbox");
    var swap = U.ghostBtn("Swap", function () { var a = st.A; st.A = st.B; st.B = a; syncGrids(); recompute(); t0 = performance.now(); E.save(); }, "Swap the two shapes");
    ui.shapesBox.appendChild(U.head("From", swap));
    ui.gridA = shapeGrid("A"); ui.shapesBox.appendChild(ui.gridA);
    ui.shapesBox.appendChild(U.head("To"));
    ui.gridB = shapeGrid("B"); ui.shapesBox.appendChild(ui.gridB);
    el.appendChild(ui.shapesBox);

    // layer mode
    ui.layersBox = mk("div", "mbox");
    ui.layersBox.appendChild(U.head("Your layers"));
    var lc = mk("div", "card2");
    ui.layerNote = mk("p", "snote muted", "Select two shape layers in the timeline. The lower one is where the morph starts.");
    ui.layerNote.style.margin = "0 0 10px";
    lc.appendChild(ui.layerNote);
    ui.read = U.ghostBtn("Read the selected layers", function () { readLayers(false); });
    ui.read.style.width = "100%"; ui.read.style.height = "36px";
    lc.appendChild(ui.read);
    ui.hideTg = U.toggle("Hide the two original layers", st.hide, function (v) { st.hide = v; E.save(); });
    ui.colTg = U.toggle("Animate the fill color too", st.animColor, function (v) { st.animColor = v; E.save(); });
    lc.appendChild(ui.hideTg.el); lc.appendChild(ui.colTg.el);
    ui.layersBox.appendChild(lc);
    el.appendChild(ui.layersBox);

    // photo mode (studio-photo.js): two pictures, matching points
    if (S._photo) {
      photo = S._photo.create({ E: E, st: st, stage: ui.pstage, motion: function () { return { dur: st.dur, b: easeB(), at: st.at }; } });
      ui.photosBox = photo.el;
      el.appendChild(ui.photosBox);
    }

    // how it moves
    el.appendChild(U.head("Motion"));
    var mc = mk("div", "card2");
    mc.appendChild(U.slider({ label: "Time", min: 0.2, max: 4, step: 0.05, value: st.dur, def: 1.2, fmt: function (v) { return v.toFixed(2) + " s"; }, onInput: function (v) { st.dur = v; t0 = performance.now(); if (photo) photo.restart(); }, onChange: function () { E.save(); } }).el);
    ui.sizeRow = U.slider({ label: "Size", min: 100, max: 1200, step: 10, value: st.size, def: 420, fmt: function (v) { return v + " px"; }, onInput: function (v) { st.size = v; }, onChange: function () { E.save(); } });
    mc.appendChild(ui.sizeRow.el);
    var ew = mk("div", "xchoice"); ew.appendChild(mk("span", "", "Ease"));
    ui.easeSeg = U.seg([["smooth", "Smooth"], ["snappy", "Snappy"], ["overshoot", "Overshoot"], ["linear", "Linear"], ["curve", "My Curve"]], st.ease, function (v) { st.ease = v; t0 = performance.now(); if (photo) photo.restart(); E.save(); }, "wrap");
    ew.appendChild(ui.easeSeg.el); mc.appendChild(ew);
    var aw = mk("div", "xchoice"); aw.appendChild(mk("span", "", "Starts"));
    aw.appendChild(U.seg([["playhead", "At the playhead"], ["start", "At the start"]], st.at, function (v) { st.at = v; E.save(); }).el);
    mc.appendChild(aw);
    el.appendChild(mc);

    ui.colBox = mk("div", "mbox");
    ui.colBox.appendChild(U.head("Colors"));
    var cc = mk("div", "card2");
    var r1 = mk("div", "xchoice"); r1.appendChild(mk("span", "", "From"));
    ui.swA = U.swatches(SWC, st.cA, function (v) { st.cA = v; E.save(); }, true); r1.appendChild(ui.swA.el); cc.appendChild(r1);
    var r2 = mk("div", "xchoice"); r2.appendChild(mk("span", "", "To"));
    ui.swB = U.swatches(SWC, st.cB, function (v) { st.cB = v; E.save(); }, true); r2.appendChild(ui.swB.el); cc.appendChild(r2);
    var tg = U.toggle("Blend between the two colors", st.animColor, function (v) { st.animColor = v; ui.colTg.set(v); E.save(); });
    cc.appendChild(tg.el);
    ui.colBox.appendChild(cc);
    el.appendChild(ui.colBox);
    ui.note = U.note("Both outlines get the same number of points, so the morph stays clean. The result is one shape layer whose Path is animated.");
    el.appendChild(ui.note);

    syncGrids();
    setMode(st.mode);
  }

  S.register("morph", {
    title: "Morph", rgb: [255, 55, 95], icon: "morph", build: build, frame: frame,
    show: function () { t0 = performance.now(); if (st.mode === "photos" && photo) { photo.show(); recompute(); } else if (st.mode === "layers" && !layerInfo && E.gate() === "") readLayers(true); },
    dock: function () {
      if (st.mode === "photos" && photo) return photo.dock();
      var g = E.gate(), s = E.sel(), hint;
      if (st.mode === "layers") hint = g || (!s.hasComp ? "Open a composition first" : s.total === 2 ? "→ a morph between your two layers" : "Select exactly two shape layers");
      else hint = g || (s.hasComp ? "→ a new shape layer " + (st.at === "start" ? "at the start" : "at the playhead") : "Open a composition first");
      var ok = !g && s.hasComp && (st.mode === "shapes" || s.total === 2);
      return { name: st.mode === "layers" ? "Morph your layers" : libById(st.A).name + " → " + libById(st.B).name, hint: hint, ok: ok, label: "Create" };
    },
    apply: function () {
      var g = E.gate();
      if (g) return Promise.resolve({ ok: false, msg: g });
      if (st.mode === "photos" && photo) return photo.apply();
      var b = easeB().map(function (v) { return U.round(v, 4); });
      function done(r) {
        if (r && r.ok) return { ok: true, msg: "Created “" + r.name + "”", done: "Created" };
        return { ok: false, msg: (r && r.error) || "Could not create the morph" };
      }
      if (st.mode === "shapes") {
        if (!eq) return Promise.resolve({ ok: false, msg: "These two shapes can't be matched up" });
        var fa = U.hexToRgb(st.cA), fb = U.hexToRgb(st.cB);
        return E.call("ops_morphApply", {
          A: eq.A, B: eq.B, size: st.size, dur: st.dur, at: st.at, b: b, color: !!st.animColor, hide: false, name: "Morph",
          from: { fill: [fa[0] / 255, fa[1] / 255, fa[2] / 255, 1] }, to: { fill: [fb[0] / 255, fb[1] / 255, fb[2] / 255, 1] }
        }).then(done);
      }
      // layers: read them fresh, match them up, then build
      return readLayers(true).then(function (info) {
        if (!info) return { ok: false, msg: ui.layerNote.textContent || "Select exactly two shape layers" };
        return E.call("ops_morphApply", { A: info.eq.A, B: info.eq.B, from: info.from, to: info.to, dur: st.dur, at: st.at, b: b, color: !!st.animColor, hide: !!st.hide, name: "Morph" }).then(done);
      });
    }
  });

  S._morph = { photo: function () { return photo; }, LIB: LIB, equalize: equalize, toSegs: toSegs, pointAt: pointAt, lerpShape: lerpShape, bounds: bounds, area: area };
})();
