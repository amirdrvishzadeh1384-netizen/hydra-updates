/* Hydra Studio · studio-photo.js
 * Photo Morph (part of the Morph tab): two pictures, a few matching points, one smooth morph.
 *
 * How it works. You put points on the first picture and the same spots on the second. From each pair the panel builds one smooth
 * "pull" field F (Gaussian radial basis functions) centred on the middle between the pair: F is the vector from the second
 * picture's spot to the first picture's spot, spread around that middle and fading to nothing far from every point. The field is
 * written as a small PNG warp map. After Effects gets a pre-comp with both pictures, a Displacement Map on each (reading that map)
 * and one "Morph Progress" slider.
 *
 *   picture A at progress t:  out(p) = A( p + t       * F(p) )
 *   picture B at progress t:  out(p) = B( p - (1 - t) * F(p) )
 *
 * At t = 0 A is untouched, at t = 1 B is untouched; in between the two are bent toward each other and cross-faded. Centring F on the
 * middle makes the matching spots meet exactly at t = 0.5, which is where both pictures are visible. The live preview here uses
 * exactly the same maths, so what you see is what the rig draws.
 */
(function () {
  "use strict";
  var S = window.Studio, U = S.u, mk = U.mk, clamp = U.clamp, esc = U.esc;

  // ------------------------------------------------------------------ maths
  function sm(u) { u = u < 0 ? 0 : (u > 1 ? 1 : u); return u * u * (3 - 2 * u); }

  // Gaussian RBF interpolation: nodes [[x, y]], vals [[vx, vy]] (same units), sigma in the node units
  function rbfFit(nodes, vals, sigma) {
    var n = nodes.length, M = [], i, j, k, d2, dx, dy, inv = 1 / (2 * sigma * sigma), lam = 1e-3, row, piv, best, t, f, m = { n: n, nx: [], ny: [], ax: [], ay: [], inv: inv };
    for (i = 0; i < n; i++) {
      row = new Array(n + 2);
      for (j = 0; j < n; j++) {
        dx = nodes[i][0] - nodes[j][0]; dy = nodes[i][1] - nodes[j][1]; d2 = dx * dx + dy * dy;
        row[j] = Math.exp(-d2 * inv) + (i === j ? lam : 0);
      }
      row[n] = vals[i][0]; row[n + 1] = vals[i][1];
      M.push(row);
      m.nx.push(nodes[i][0]); m.ny.push(nodes[i][1]);
    }
    for (k = 0; k < n; k++) {
      piv = k; best = Math.abs(M[k][k]);
      for (i = k + 1; i < n; i++) { if (Math.abs(M[i][k]) > best) { best = Math.abs(M[i][k]); piv = i; } }
      if (best < 1e-12) continue;
      if (piv !== k) { t = M[k]; M[k] = M[piv]; M[piv] = t; }
      for (i = 0; i < n; i++) {
        if (i === k) continue;
        f = M[i][k] / M[k][k];
        if (f === 0) continue;
        for (j = k; j < n + 2; j++) M[i][j] -= f * M[k][j];
      }
    }
    for (i = 0; i < n; i++) {
      m.ax.push(Math.abs(M[i][i]) > 1e-12 ? M[i][n] / M[i][i] : 0);
      m.ay.push(Math.abs(M[i][i]) > 1e-12 ? M[i][n + 1] / M[i][i] : 0);
    }
    return m;
  }
  // the field at one spot (no border window)
  function rbfAt(m, x, y) {
    var sx = 0, sy = 0, k, dx, dy, e;
    for (k = 0; k < m.n; k++) {
      dx = x - m.nx[k]; dy = y - m.ny[k];
      e = Math.exp(-(dx * dx + dy * dy) * m.inv);
      sx += m.ax[k] * e; sy += m.ay[k] * e;
    }
    return [sx, sy];
  }
  // the field on a grid (nx x ny), faded to zero at the frame edge so the picture's border never moves.
  // centered: samples at pixel centers (for the map file); otherwise at the grid corners (for the preview)
  function fieldGrid(m, W, H, nx, ny, centered) {
    var fx = new Float32Array(nx * ny), fy = new Float32Array(nx * ny), wm = 0.02 * H, i, j, k, x, y, sx, sy, dx, dy, e, w, o = 0, n = m ? m.n : 0;
    for (j = 0; j < ny; j++) {
      y = centered ? (j + 0.5) / ny * H : j / (ny - 1) * H;
      for (i = 0; i < nx; i++, o++) {
        if (!n) continue;
        x = centered ? (i + 0.5) / nx * W : i / (nx - 1) * W;
        sx = 0; sy = 0;
        for (k = 0; k < n; k++) {
          dx = x - m.nx[k]; dy = y - m.ny[k];
          e = Math.exp(-(dx * dx + dy * dy) * m.inv);
          sx += m.ax[k] * e; sy += m.ay[k] * e;
        }
        w = sm(Math.min(x, W - x, y, H - y) / wm);
        fx[o] = sx * w; fy[o] = sy * w;
      }
    }
    return { nx: nx, ny: ny, fx: fx, fy: fy };
  }

  // ------------------------------------------------------------------ small helpers
  var COLORS = ["#FF375F", "#FF9F0A", "#FFD60A", "#30D158", "#64D2FF", "#0A84FF", "#BF5AF2", "#FF6482"];
  var MAXPTS = 60;
  var PVW = 256;          // width of the preview frame the morph is calculated at
  var FRW = 640;          // width of a picture rendered into the frame (editors)
  var MAPW = 320;         // width of the warp map files
  var MIMES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };
  var DEFAULTS = { fit: "fit", reach: 25, warp: 100, fade: 60, soft: 8, cut: false, flip: false, hide: true, markers: true };

  function canvas(w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function fitXf(L, W, H, mode) {
    var k;
    if (mode === "placed" && L.xf) return { p: [L.xf.p[0], L.xf.p[1]], s: [L.xf.s[0], L.xf.s[1]], r: L.xf.r || 0, a: [L.xf.a[0], L.xf.a[1]] };
    k = (mode === "fill") ? Math.max(W / L.w, H / L.h) * 1.02 : Math.min(W / L.w, H / L.h);
    return { p: [W / 2, H / 2], s: [k * 100, k * 100], r: 0, a: [L.w / 2, L.h / 2] };
  }
  function extOf(f) { var m = String(f).match(/\.([A-Za-z0-9]+)$/); return m ? m[1].toLowerCase() : ""; }
  function baseName(f) { return String(f).split(/[\\/]/).pop(); }

  // ------------------------------------------------------------------ the module
  // ctx = { E, st (the Morph tab's saved state), stage (the shared preview stage), motion() -> { dur, b, at } }
  function create(ctx) {
    var E = ctx.E, st = ctx.st, stage = ctx.stage, ps, ui = {}, src = null, pts = [], sel = -1, pend = null, dragging = null, loading = false,
      pinUntil = 0, scrub = 50, t0 = performance.now(), fieldsDirty = true, edDirty = true, mdl = null, fld = null, pv = null, pvF = null,
      smp = [0, 0, 0, 0], k;

    ps = st.photo = (st.photo && typeof st.photo === "object") ? st.photo : {};
    for (k in DEFAULTS) { if (DEFAULTS.hasOwnProperty(k) && ps[k] === undefined) ps[k] = DEFAULTS[k]; }
    ps.fit = (ps.fit === "fill" || ps.fit === "placed") ? ps.fit : "fit";
    ps.reach = clamp(Number(ps.reach) || 25, 6, 70); ps.warp = clamp(Number(ps.warp) || 0, 0, 200); ps.fade = clamp(Number(ps.fade) || 60, 2, 100); ps.soft = clamp(Number(ps.soft) || 0, 0, 60);

    function save() { E.save(); }
    function pinned() { return !!dragging || Date.now() < pinUntil; }
    function pin(ms) { pinUntil = Math.max(pinUntil, Date.now() + (ms || 2200)); }

    // ---------------------------------------------------------- points
    function counts() {
      var n = pts.length;
      ui.count.textContent = n === 0 ? "No points yet" : n + (n === 1 ? " pair of points" : " pairs of points");
      ui.del.style.display = sel >= 0 ? "" : "none";
      stage.tag.textContent = src ? (n + (n === 1 ? " point" : " points")) : "";
    }
    function changed() { fieldsDirty = true; edDirty = true; counts(); E.dockChanged(); }
    function select(i) { sel = i; edDirty = true; counts(); }
    function removeAt(i) {
      if (i < 0 || i >= pts.length) return;
      pts.splice(i, 1);
      if (pend) { if (pend.i === i) pend = null; else if (pend.i > i) pend.i--; }
      sel = -1; changed();
    }
    function place(side, pos) {
      var other = side === "a" ? "b" : "a", p;
      if (pend && pend.needs === side && pts[pend.i]) {
        pts[pend.i][side] = pos.slice(); select(pend.i); pend = null; changed(); return;
      }
      if (pts.length >= MAXPTS) { E.toast("That's plenty of points (" + MAXPTS + ")", true); return; }
      p = { a: pos.slice(), b: pos.slice() };
      p[side] = pos.slice();
      pts.push(p); pend = { i: pts.length - 1, needs: other }; select(pts.length - 1); changed();
    }
    function hit(side, pos, ed) {
      var r = ed.stg.cv.getBoundingClientRect(), i, best = -1, bd = 15 * 15, dx, dy, d;
      for (i = pts.length - 1; i >= 0; i--) {
        dx = (pts[i][side][0] - pos[0]) * r.width; dy = (pts[i][side][1] - pos[1]) * r.height; d = dx * dx + dy * dy;
        if (d <= bd) { bd = d; best = i; }
      }
      return best;
    }
    function posOf(e, cv) {
      var r = cv.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1), clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1)];
    }

    // templates (positions are the same in both pictures: drag the second picture's points onto the matching spots)
    var FACE = [[0.38, 0.40], [0.62, 0.40], [0.50, 0.54], [0.50, 0.68], [0.50, 0.84], [0.30, 0.60], [0.70, 0.60]];
    function template(list) {
      if (!src) { E.toast("Press “Use the 2 selected layers” first", true); return; }
      pts = list.map(function (p) { return { a: [p[0], p[1]], b: [p[0], p[1]] }; });
      pend = null; sel = -1; changed(); pin(3000);
    }
    function gridPts() {
      var out = [], i, j;
      for (j = 0; j < 3; j++) for (i = 0; i < 3; i++) out.push([0.2 + i * 0.3, 0.2 + j * 0.3]);
      return out;
    }

    // ---------------------------------------------------------- pictures
    function readImage(info) {
      return new Promise(function (resolve, reject) {
        var fa = E.files && E.files(), buf, mime, url, img;
        if (!fa) { reject(new Error("The panel can't read files here. Open it inside After Effects.")); return; }
        mime = MIMES[extOf(info.file)];
        if (!mime) { reject(new Error("“" + info.name + "” is a ." + extOf(info.file) + " file. Photo Morph needs PNG or JPG pictures.")); return; }
        try { buf = fa.fs.readFileSync(info.file); } catch (e) { reject(new Error("Could not read “" + info.name + "”.")); return; }
        url = URL.createObjectURL(new Blob([buf], { type: mime }));
        img = new Image();
        img.onload = function () { resolve({ img: img, url: url }); };
        img.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) {} reject(new Error("Could not open “" + info.name + "” as a picture.")); };
        img.src = url;
      });
    }
    // the picture drawn into the comp frame the way it will sit there
    function renderFrame(L) {
      var W = src.comp.w, H = src.comp.h, cw = FRW, ch = Math.max(2, Math.round(FRW * H / W)), cv = canvas(cw, ch), g = cv.getContext("2d"), xf = fitXf(L, W, H, ps.fit), sc = cw / W, small, sg, d, i, n = 0, tot;
      g.setTransform(sc, 0, 0, sc, 0, 0);
      g.translate(xf.p[0], xf.p[1]); g.rotate((xf.r || 0) * Math.PI / 180); g.scale(xf.s[0] / 100, xf.s[1] / 100); g.translate(-xf.a[0], -xf.a[1]);
      try { g.imageSmoothingQuality = "high"; } catch (e) {}
      g.drawImage(L.img, 0, 0, L.w, L.h);
      L.xfNow = xf; L.frameCv = cv;
      // how much of the frame it covers (letterbox bars / transparent PNGs)
      small = canvas(48, Math.max(2, Math.round(48 * H / W))); sg = small.getContext("2d"); sg.drawImage(cv, 0, 0, small.width, small.height);
      d = sg.getImageData(0, 0, small.width, small.height).data; tot = small.width * small.height;
      for (i = 3; i < d.length; i += 4) { if (d[i] > 250) n++; }
      L.cover = n / tot;
    }
    function renderAll() {
      var i, partial = false;
      if (!src) return;
      for (i = 0; i < 2; i++) { renderFrame(src.layers[i]); if (src.layers[i].cover < 0.985) partial = true; }
      src.partial = partial;
      buildPv();
      fieldsDirty = true; edDirty = true;
      var ratio = src.comp.h / src.comp.w * 100;
      ui.edA.stg.el.style.paddingTop = ratio + "%"; ui.edB.stg.el.style.paddingTop = ratio + "%";
      stage.cv.__w = -1;
    }
    function buildPv() {
      var W = src.comp.w, H = src.comp.h, w = PVW, h = Math.max(2, Math.round(PVW * H / W)), out = [], i, j, c, g, d, buf, a;
      for (i = 0; i < 2; i++) {
        c = canvas(w, h); g = c.getContext("2d"); g.drawImage(src.layers[i].frameCv, 0, 0, w, h);
        d = g.getImageData(0, 0, w, h).data; buf = new Float32Array(w * h * 4);
        for (j = 0; j < d.length; j += 4) { a = d[j + 3]; buf[j] = d[j] * a / 255; buf[j + 1] = d[j + 1] * a / 255; buf[j + 2] = d[j + 2] * a / 255; buf[j + 3] = a; }
        out.push(buf);
      }
      c = canvas(w, h);
      pv = { w: w, h: h, a: out[0], b: out[1], cv: c, g: c.getContext("2d"), img: c.getContext("2d").createImageData(w, h) };
    }
    function load(quiet) {
      var g = E.gate();
      if (g) { if (!quiet) E.toast(g, true); return Promise.resolve(null); }
      if (loading) return Promise.resolve(null);
      loading = true; ui.use.classList.add("busy");
      return E.call("ops_morphSources").then(function (r) {
        if (!r || !r.ok) { loading = false; ui.use.classList.remove("busy"); ui.status.textContent = (r && r.error) || "Select two photo layers."; if (!quiet) E.toast((r && r.error) || "Could not read the layers", true); return null; }
        return Promise.all([readImage(r.layers[0]), readImage(r.layers[1])]).then(function (im) {
          var old = src, same = old && old.layers[0].file === r.layers[0].file && old.layers[1].file === r.layers[1].file && old.comp.w === r.comp.w && old.comp.h === r.comp.h, i, L;
          if (old) { for (i = 0; i < 2; i++) { try { URL.revokeObjectURL(old.layers[i].url); } catch (e) {} } }
          for (i = 0; i < 2; i++) { L = r.layers[i]; L.img = im[i].img; L.url = im[i].url; }
          src = { comp: r.comp, projDir: r.projDir || "", layers: r.layers, partial: false };
          if (!same) { pts = []; pend = null; sel = -1; }
          renderAll();
          if (src.partial && !ps.cut) { ps.cut = true; ui.cutTg.set(true); save(); }
          ui.status.textContent = "“" + r.layers[0].name + "” turns into “" + r.layers[1].name + "”" + (src.partial ? " · the pictures don't fill the frame, cut-out mode is on" : "");
          stage.name.textContent = r.layers[0].name + "  →  " + r.layers[1].name;
          counts(); E.dockChanged(); t0 = performance.now(); pin(1200);
          loading = false; ui.use.classList.remove("busy");
          return src;
        }, function (err) {
          loading = false; ui.use.classList.remove("busy");
          ui.status.textContent = err.message; if (!quiet) E.toast(err.message, true);
          return null;
        });
      }, function () { loading = false; ui.use.classList.remove("busy"); return null; });
    }

    // ---------------------------------------------------------- fields + preview
    function ensureFields() {
      var W, H, sig, nm = [], vals = [], i, ny, nx = 49, p;
      if (!fieldsDirty || !src) return;
      fieldsDirty = false;
      W = src.comp.w; H = src.comp.h; sig = ps.reach / 100 * H;
      for (i = 0; i < pts.length; i++) {
        p = pts[i];
        nm.push([(p.a[0] + p.b[0]) / 2 * W, (p.a[1] + p.b[1]) / 2 * H]);
        vals.push([(p.a[0] - p.b[0]) * W, (p.a[1] - p.b[1]) * H]);
      }
      mdl = pts.length ? rbfFit(nm, vals, sig) : null;
      ny = Math.max(3, Math.round((nx - 1) * H / W) + 1);
      fld = fieldGrid(mdl, W, H, nx, ny, false);
      bakePreview();
    }
    // the field resampled to the preview pixels (in preview pixels)
    function bakePreview() {
      var w = pv.w, h = pv.h, s = w / src.comp.w, F = fld, ox = new Float32Array(w * h), oy = new Float32Array(w * h), nx = F.nx, ny = F.ny, i, j, gx, gy, x0, y0, fx, fy, o, a, b, c, d;
      for (j = 0; j < h; j++) {
        gy = (j + 0.5) / h * (ny - 1); y0 = Math.min(ny - 2, Math.floor(gy)); fy = gy - y0;
        for (i = 0; i < w; i++) {
          gx = (i + 0.5) / w * (nx - 1); x0 = Math.min(nx - 2, Math.floor(gx)); fx = gx - x0;
          a = y0 * nx + x0; b = a + 1; c = a + nx; d = c + 1;
          o = j * w + i;
          ox[o] = ((F.fx[a] * (1 - fx) + F.fx[b] * fx) * (1 - fy) + (F.fx[c] * (1 - fx) + F.fx[d] * fx) * fy) * s;
          oy[o] = ((F.fy[a] * (1 - fx) + F.fy[b] * fx) * (1 - fy) + (F.fy[c] * (1 - fx) + F.fy[d] * fx) * fy) * s;
        }
      }
      pvF = { x: ox, y: oy };
    }
    // bilinear sample of a premultiplied picture; outside the picture is transparent
    function sample(buf, w, h, x, y) {
      var x0, y0, fx, fy, w00, w10, w01, w11, i, r = 0, g = 0, b = 0, a = 0;
      x -= 0.5; y -= 0.5; x0 = Math.floor(x); y0 = Math.floor(y); fx = x - x0; fy = y - y0;
      w00 = (1 - fx) * (1 - fy); w10 = fx * (1 - fy); w01 = (1 - fx) * fy; w11 = fx * fy;
      if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h) { i = (y0 * w + x0) * 4; r += buf[i] * w00; g += buf[i + 1] * w00; b += buf[i + 2] * w00; a += buf[i + 3] * w00; }
      if (x0 + 1 >= 0 && y0 >= 0 && x0 + 1 < w && y0 < h) { i = (y0 * w + x0 + 1) * 4; r += buf[i] * w10; g += buf[i + 1] * w10; b += buf[i + 2] * w10; a += buf[i + 3] * w10; }
      if (x0 >= 0 && y0 + 1 >= 0 && x0 < w && y0 + 1 < h) { i = ((y0 + 1) * w + x0) * 4; r += buf[i] * w01; g += buf[i + 1] * w01; b += buf[i + 2] * w01; a += buf[i + 3] * w01; }
      if (x0 + 1 >= 0 && y0 + 1 >= 0 && x0 + 1 < w && y0 + 1 < h) { i = ((y0 + 1) * w + x0 + 1) * 4; r += buf[i] * w11; g += buf[i + 1] * w11; b += buf[i + 2] * w11; a += buf[i + 3] * w11; }
      smp[0] = r; smp[1] = g; smp[2] = b; smp[3] = a;
    }
    // one frame of the morph at progress k (0..1) into pv.img
    function morphFrame(kk) {
      var w = pv.w, h = pv.h, d = pv.img.data, warp = ps.warp / 100, f = Math.max(0.02, ps.fade / 100), u = clamp((kk - (0.5 - f / 2)) / f, 0, 1), x = u * u * (3 - 2 * u),
        aop = 1 - x, bop = ps.cut ? x : 1, ka = kk * warp, kb = (1 - kk) * warp, i, j, o, q, ar, ag, ab, aa, cov, rr, rg, rb, ra, F = pvF;
      for (j = 0; j < h; j++) {
        for (i = 0; i < w; i++) {
          o = j * w + i;
          sample(pv.a, w, h, i + 0.5 + ka * F.x[o], j + 0.5 + ka * F.y[o]);
          ar = smp[0] * aop; ag = smp[1] * aop; ab = smp[2] * aop; aa = smp[3] * aop;
          sample(pv.b, w, h, i + 0.5 - kb * F.x[o], j + 0.5 - kb * F.y[o]);
          cov = 1 - aa / 255;
          rr = ar + smp[0] * bop * cov; rg = ag + smp[1] * bop * cov; rb = ab + smp[2] * bop * cov; ra = aa + smp[3] * bop * cov;
          q = o * 4;
          if (ra > 0.5) { d[q] = rr * 255 / ra; d[q + 1] = rg * 255 / ra; d[q + 2] = rb * 255 / ra; d[q + 3] = ra; }
          else { d[q] = 0; d[q + 1] = 0; d[q + 2] = 0; d[q + 3] = 0; }
        }
      }
      pv.g.putImageData(pv.img, 0, 0);
    }

    function progress() {
      var m = ctx.motion(), d = clamp(m.dur, 0.2, 4), hold = 0.45, cyc = (d + hold) * 2, ph, u;
      if (pinned()) return clamp(scrub / 100, 0, 1);
      ph = ((performance.now() - t0) / 1000) % cyc;
      if (ph < hold) u = 0; else if (ph < hold + d) u = (ph - hold) / d; else if (ph < hold * 2 + d) u = 1; else u = 1 - (ph - hold * 2 - d) / d;
      return clamp(U.ease(m.b, clamp(u, 0, 1)), 0, 1);
    }

    // ---------------------------------------------------------- drawing
    function drawStage() {
      var cv = stage.cv, f = U.fit(cv), g = cv.getContext("2d"), w = f.w, h = f.h, ac = U.accent(), kk, bg, dw, dh, dx, dy, x, y, sq, blur, text;
      g.setTransform(f.d, 0, 0, f.d, 0, 0);
      g.clearRect(0, 0, w, h);
      bg = g.createRadialGradient(w / 2, h * 0.5, 4, w / 2, h * 0.5, w * 0.6);
      bg.addColorStop(0, "rgba(120,110,200,.22)"); bg.addColorStop(1, "rgba(13,12,20,0)");
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      if (!src || !pv || !fld) {
        g.fillStyle = "rgba(255,255,255,.55)"; g.font = "500 12px Outfit, sans-serif"; g.textAlign = "center";
        g.fillText(loading ? "Opening your pictures…" : "Select two photo layers, then press “Use the 2 selected layers”", w / 2, h / 2);
        return;
      }
      kk = progress();
      morphFrame(kk);
      // the frame, fitted into the stage
      dw = w - 20; dh = dw * src.comp.h / src.comp.w;
      if (dh > h - 20) { dh = h - 20; dw = dh * src.comp.w / src.comp.h; }
      dx = (w - dw) / 2; dy = (h - dh) / 2;
      g.save();
      g.beginPath(); g.rect(dx, dy, dw, dh); g.clip();
      if (ps.cut || src.partial) {
        sq = 8;
        for (y = 0; y * sq < dh; y++) for (x = 0; x * sq < dw; x++) { g.fillStyle = ((x + y) & 1) ? "#2b2b33" : "#34343d"; g.fillRect(dx + x * sq, dy + y * sq, sq, sq); }
      } else { g.fillStyle = "#101014"; g.fillRect(dx, dy, dw, dh); }
      blur = ps.soft * Math.sin(Math.PI * kk) * (dw / src.comp.w);
      try { if (blur > 0.25) g.filter = "blur(" + blur.toFixed(2) + "px)"; } catch (e) {}
      g.imageSmoothingEnabled = true;
      g.drawImage(pv.cv, dx, dy, dw, dh);
      try { g.filter = "none"; } catch (e2) {}
      g.restore();
      g.strokeStyle = "rgba(255,255,255,.16)"; g.lineWidth = 1; g.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
      // landmarks on the frame at this moment (they travel from picture A's spots to picture B's)
      if (pts.length && pinned()) {
        var i, p, fx, fy;
        for (i = 0; i < pts.length; i++) {
          p = pts[i]; fx = p.a[0] + (p.b[0] - p.a[0]) * kk; fy = p.a[1] + (p.b[1] - p.a[1]) * kk;
          g.beginPath(); g.arc(dx + fx * dw, dy + fy * dh, 3.2, 0, 6.3); g.fillStyle = COLORS[i % COLORS.length]; g.fill();
          g.lineWidth = 1; g.strokeStyle = "rgba(255,255,255,.9)"; g.stroke();
        }
      }
      // progress hairline
      g.fillStyle = "rgba(255,255,255,.12)"; g.fillRect(w * 0.12, h - 9, w * 0.76, 2.5);
      g.fillStyle = U.rgba(ac, 0.95); g.fillRect(w * 0.12, h - 9, w * 0.76 * kk, 2.5);
      if (pinned()) {
        text = "HOLD  " + Math.round(kk * 100) + "%";
        g.font = "600 9.5px Outfit, sans-serif"; g.textAlign = "left"; g.fillStyle = "rgba(255,255,255,.72)";
        g.fillText(text, 12, h - 14);
      }
    }
    function drawEditor(ed) {
      var cv = ed.stg.cv, f = U.fit(cv), g = cv.getContext("2d"), w = f.w, h = f.h, side = ed.side, L, i, p, x, y, c, on, t;
      g.setTransform(f.d, 0, 0, f.d, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!src) {
        g.fillStyle = "rgba(255,255,255,.45)"; g.font = "500 11.5px Outfit, sans-serif"; g.textAlign = "center";
        g.fillText(side === "a" ? "First picture" : "Second picture", w / 2, h / 2);
        return;
      }
      L = src.layers[side === "a" ? 0 : 1];
      g.fillStyle = "#17171c"; g.fillRect(0, 0, w, h);
      if (L.cover < 0.985) {
        var sq = 8, xx, yy;
        for (yy = 0; yy * sq < h; yy++) for (xx = 0; xx * sq < w; xx++) { g.fillStyle = ((xx + yy) & 1) ? "#24242b" : "#2b2b33"; g.fillRect(xx * sq, yy * sq, sq, sq); }
      }
      g.drawImage(L.frameCv, 0, 0, w, h);
      t = performance.now() / 1000;
      for (i = 0; i < pts.length; i++) {
        p = pts[i][side]; x = p[0] * w; y = p[1] * h; c = COLORS[i % COLORS.length]; on = (i === sel);
        if (pend && pend.i === i && pend.needs === side) {
          g.beginPath(); g.arc(x, y, 11 + 2 * Math.sin(t * 5), 0, 6.3); g.setLineDash([3, 3]); g.lineWidth = 1.5; g.strokeStyle = "rgba(255,255,255,.9)"; g.stroke(); g.setLineDash([]);
        }
        if (on) { g.beginPath(); g.arc(x, y, 11, 0, 6.3); g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,.95)"; g.stroke(); }
        g.beginPath(); g.arc(x, y, 7, 0, 6.3); g.fillStyle = c; g.fill();
        g.lineWidth = 1.6; g.strokeStyle = "rgba(255,255,255,.95)"; g.stroke();
        g.font = "700 8.5px Outfit, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#101014";
        g.fillText(String(i + 1), x, y + 0.5);
        g.textBaseline = "alphabetic";
      }
    }

    // ---------------------------------------------------------- editors
    function editor(side) {
      var stg = U.stage(56.25), cv = stg.cv, ed = { side: side, stg: stg };
      stg.el.classList.add("phed");
      cv.setAttribute("tabindex", "0");
      stg.name.textContent = side === "a" ? "1 · Start picture" : "2 · End picture";
      cv.addEventListener("pointerdown", function (e) {
        var pos, h;
        if (!src) { E.toast("Press “Use the 2 selected layers” first", true); return; }
        if (e.button !== undefined && e.button !== 0) return;
        pos = posOf(e, cv); h = hit(side, pos, ed);
        try { cv.focus({ preventScroll: true }); } catch (e1) {}
        if (h >= 0) {
          select(h); dragging = { side: side, i: h };
          try { cv.setPointerCapture(e.pointerId); } catch (e2) {}
        } else place(side, pos);
        pin(2600);
        e.preventDefault();
      });
      cv.addEventListener("pointermove", function (e) {
        var pos = posOf(e, cv), h;
        pin(2200);
        if (dragging && dragging.side === side && pts[dragging.i]) {
          pts[dragging.i][side] = pos;
          if (pend && pend.i === dragging.i && pend.needs === side) pend = null;
          fieldsDirty = true; edDirty = true;
        } else if (src) {
          h = hit(side, pos, ed);
          cv.style.cursor = h >= 0 ? "grab" : "crosshair";
        }
      });
      function up(e) {
        if (dragging) { dragging = null; changed(); pin(1800); }
        try { cv.releasePointerCapture(e.pointerId); } catch (e3) {}
      }
      cv.addEventListener("pointerup", up);
      cv.addEventListener("pointercancel", up);
      cv.addEventListener("dblclick", function (e) {
        var h = src ? hit(side, posOf(e, cv), ed) : -1;
        if (h >= 0) removeAt(h);
      });
      cv.addEventListener("keydown", function (e) {
        if ((e.key === "Delete" || e.key === "Backspace") && sel >= 0) { removeAt(sel); e.preventDefault(); e.stopPropagation(); }
      });
      return ed;
    }

    // ---------------------------------------------------------- build the controls
    var box = mk("div", "mbox"), c1, c2, c3, row, w1;
    box.appendChild(U.head("Your pictures"));
    c1 = mk("div", "card2");
    ui.status = mk("p", "snote muted", "Select two photo layers (PNG or JPG) in the timeline. The lower one is where the morph starts.");
    ui.status.style.margin = "0 0 10px";
    c1.appendChild(ui.status);
    ui.use = U.ghostBtn("Use the 2 selected layers", function () { load(false); });
    ui.use.style.width = "100%"; ui.use.style.height = "36px";
    c1.appendChild(ui.use);
    w1 = mk("div", "xchoice"); w1.appendChild(mk("span", "", "Picture in the frame"));
    ui.fitSeg = U.seg([["fit", "Fit", "Whole picture visible"], ["fill", "Fill", "Cover the frame"], ["placed", "As placed", "Exactly as the layer sits in the comp"]], ps.fit, function (v) { ps.fit = v; save(); if (src) { renderAll(); if (src.partial && !ps.cut) { ps.cut = true; ui.cutTg.set(true); } } });
    w1.appendChild(ui.fitSeg.el); c1.appendChild(w1);
    box.appendChild(c1);

    ui.clear = U.ghostBtn("Clear", function () { pts = []; pend = null; sel = -1; changed(); });
    box.appendChild(U.head("Match the points", ui.clear));
    c2 = mk("div", "card2");
    c2.appendChild(mk("p", "snote muted", "Click a spot on the first picture (an eye, a corner of the mouth), then click the same spot on the second. Drag a point to fine-tune it, double-click to remove it."));
    c2.lastChild.style.margin = "0 0 10px";
    row = mk("div", "phrow");
    row.appendChild(U.ghostBtn("Face starter", function () { template(FACE); }, "7 points where a face usually has features: drag the second picture's points onto its features"));
    row.appendChild(U.ghostBtn("Grid 3×3", function () { template(gridPts()); }, "9 points in a grid: move the second picture's points to match"));
    c2.appendChild(row);
    ui.edA = editor("a"); ui.edB = editor("b");
    ui.edA.stg.el.style.marginTop = "10px"; ui.edB.stg.el.style.marginTop = "8px";
    c2.appendChild(ui.edA.stg.el); c2.appendChild(ui.edB.stg.el);
    row = mk("div", "phrow phinfo");
    ui.count = mk("span", "phcount", "No points yet");
    ui.del = U.ghostBtn("Remove selected", function () { removeAt(sel); });
    ui.del.style.display = "none";
    row.appendChild(ui.count); row.appendChild(ui.del);
    c2.appendChild(row);
    box.appendChild(c2);

    box.appendChild(U.head("Look"));
    c3 = mk("div", "card2");
    c3.appendChild(U.slider({ label: "Preview at", min: 0, max: 100, step: 1, value: scrub, def: 50, fmt: function (v) { return v + "%"; }, onInput: function (v) { scrub = v; pin(4000); } }).el);
    c3.appendChild(U.slider({ label: "Reach", min: 6, max: 70, step: 1, value: ps.reach, def: 25, fmt: function (v) { return v + "%"; }, onInput: function (v) { ps.reach = v; fieldsDirty = true; pin(2500); }, onChange: save }).el);
    c3.appendChild(U.slider({ label: "Warp", min: 0, max: 200, step: 1, value: ps.warp, def: 100, fmt: function (v) { return v + "%"; }, onInput: function (v) { ps.warp = v; pin(2500); }, onChange: save }).el);
    c3.appendChild(U.slider({ label: "Cross-fade", min: 2, max: 100, step: 1, value: ps.fade, def: 60, fmt: function (v) { return v + "%"; }, onInput: function (v) { ps.fade = v; pin(2500); }, onChange: save }).el);
    c3.appendChild(U.slider({ label: "Softness", min: 0, max: 60, step: 1, value: ps.soft, def: 8, fmt: function (v) { return v + " px"; }, onInput: function (v) { ps.soft = v; pin(2500); }, onChange: save }).el);
    ui.cutTg = U.toggle("Transparent pictures (cut-outs)", ps.cut, function (v) { ps.cut = v; save(); });
    ui.flipTg = U.toggle("Flip warp direction", ps.flip, function (v) { ps.flip = v; save(); });
    ui.hideTg = U.toggle("Hide the two original layers", ps.hide, function (v) { ps.hide = v; save(); });
    ui.markTg = U.toggle("Add markers", ps.markers, function (v) { ps.markers = v; save(); });
    c3.appendChild(ui.cutTg.el); c3.appendChild(ui.flipTg.el); c3.appendChild(ui.hideTg.el); c3.appendChild(ui.markTg.el);
    box.appendChild(c3);
    box.appendChild(U.note("Reach = how far each point pulls its surroundings. Warp = how strongly the pictures bend toward each other. If the landmarks drift apart instead of meeting in After Effects, switch on “Flip warp direction” (or tick Flip Warp on the morph layer)."));
    counts();

    // ---------------------------------------------------------- the maps + the call into After Effects
    function buildMap(model, W, H) {
      var mw = MAPW, mh = Math.max(2, Math.round(MAPW * H / W)), F = fieldGrid(model, W, H, mw, mh, true), mx = 1, my = 1, i, cv, g, id, d, url, bin, bytes;
      for (i = 0; i < F.fx.length; i++) { if (Math.abs(F.fx[i]) > mx) mx = Math.abs(F.fx[i]); if (Math.abs(F.fy[i]) > my) my = Math.abs(F.fy[i]); }
      mx = Math.ceil(mx * 100) / 100; my = Math.ceil(my * 100) / 100;
      cv = canvas(mw, mh); g = cv.getContext("2d"); id = g.createImageData(mw, mh); d = id.data;
      for (i = 0; i < F.fx.length; i++) {
        d[i * 4] = clamp(128 + Math.round(127 * F.fx[i] / mx), 0, 255);
        d[i * 4 + 1] = clamp(128 + Math.round(127 * F.fy[i] / my), 0, 255);
        d[i * 4 + 2] = 128; d[i * 4 + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      url = cv.toDataURL("image/png");
      bin = atob(url.split(",")[1]); bytes = new Uint8Array(bin.length);
      for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return { bytes: bytes, fmax: [mx, my] };
    }
    function writeMap(bytes) {
      var fa = E.files && E.files(), stamp = Date.now().toString(36), dirs = [], i, dir, pa;
      if (!fa) throw new Error("The panel can't write files here. Open it inside After Effects.");
      if (src.projDir) dirs.push(fa.path.join(src.projDir, "Hydra Morph"));
      dirs.push(fa.path.join(fa.data, "morph"));
      for (i = 0; i < dirs.length; i++) {
        dir = dirs[i];
        try {
          fa.mkdirp(dir);
          pa = fa.path.join(dir, "morph-" + stamp + ".png");
          fa.fs.writeFileSync(pa, bytes);
          return pa;
        } catch (e) { if (i === dirs.length - 1) throw new Error("Could not save the warp map: " + (e && e.message || e)); }
      }
      return null;
    }

    function apply() {
      var g = E.gate(), W, H, mp, file, m, payload, L0, L1;
      if (g) return Promise.resolve({ ok: false, msg: g });
      if (!src) return Promise.resolve({ ok: false, msg: "Press “Use the 2 selected layers” first" });
      if (!pts.length) return Promise.resolve({ ok: false, msg: "Place at least one pair of points" });
      ensureFields();
      W = src.comp.w; H = src.comp.h;
      try {
        mp = buildMap(mdl, W, H);
        file = writeMap(mp.bytes);
      } catch (e) { return Promise.resolve({ ok: false, msg: e.message || String(e) }); }
      m = ctx.motion();
      L0 = src.layers[0]; L1 = src.layers[1];
      payload = {
        a: { index: L0.index, name: L0.name }, b: { index: L1.index, name: L1.name },
        xfA: fitXf(L0, W, H, ps.fit), xfB: fitXf(L1, W, H, ps.fit),
        map: file, fmax: mp.fmax,
        dur: m.dur, at: m.at, ease: m.b.map(function (v) { return U.round(v, 4); }),
        warp: ps.warp, fade: ps.fade, soft: ps.soft, flip: !!ps.flip, cut: !!ps.cut, hide: !!ps.hide, markers: !!ps.markers, name: "Photo Morph"
      };
      return E.call("ops_photoMorph", payload).then(function (r) {
        if (r && r.ok) return { ok: true, msg: "Created “" + r.name + "”" + (r.warnings && r.warnings.length ? " · " + r.warnings.length + " note" + (r.warnings.length > 1 ? "s" : "") : ""), warn: r.warnings && r.warnings.length ? r.warnings.join(" ") : "", done: "Created" };
        return { ok: false, msg: (r && r.error) || "Could not create the photo morph" };
      });
    }

    return {
      el: box,
      frame: function () {
        ensureFields();
        drawStage();
        if (Math.round(ui.edA.stg.cv.getBoundingClientRect().width) !== ui.edA.stg.cv.__w) edDirty = true;
        if (edDirty || pend) { drawEditor(ui.edA); drawEditor(ui.edB); edDirty = false; }
      },
      show: function () {
        t0 = performance.now(); edDirty = true;
        if (!src && !loading && E.gate() === "" && E.sel().total === 2) load(true);
      },
      refreshStage: function () {
        stage.name.textContent = src ? src.layers[0].name + "  →  " + src.layers[1].name : "Photo Morph";
        counts();
      },
      restart: function () { t0 = performance.now(); },
      dock: function () {
        var g = E.gate(), s = E.sel(), hint, ok;
        if (g) hint = g;
        else if (!s.hasComp) hint = "Open a composition first";
        else if (!src) hint = "Select two photo layers, then press “Use the 2 selected layers”";
        else if (!pts.length) hint = "Click matching spots on both pictures";
        else hint = "→ a photo morph in this comp";
        ok = !g && s.hasComp && !!src && pts.length > 0;
        return { name: "Photo Morph" + (pts.length ? " · " + pts.length + (pts.length === 1 ? " point" : " points") : ""), hint: hint, ok: ok, label: "Create" };
      },
      apply: apply,
      // for tests
      _set: function (list, reach) {
        pts = list.map(function (p) { return { a: [p[0], p[1]], b: [p[2], p[3]] }; }); pend = null; sel = -1;
        if (reach) ps.reach = reach;
        changed();
      },
      _state: function () { return { src: src, pts: pts, ps: ps, sel: sel, pend: pend, mdl: mdl, fld: fld }; }
    };
  }

  S._photo = { create: create, rbfFit: rbfFit, rbfAt: rbfAt, fieldGrid: fieldGrid, fitXf: fitXf, DEFAULTS: DEFAULTS };
})();
