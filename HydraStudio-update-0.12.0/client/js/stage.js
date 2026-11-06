// Hydra Studio - preview stage (v0.7)
// A tiny software "After Effects": it plays the very same effect list that host.jsx builds, on two themed gradient shots.
// Nothing here is a render of the real thing - it is an honest sketch of the motion, timing and feel.
(function (root) {
  "use strict";
  var BW = 288, BH = 162, N = BW * BH;
  var BG = [0.043, 0.043, 0.063];
  var HSR = {};

  // ---------- small math ----------
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function rnd(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function hsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  function hueOf(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d < 1e-6) return 0;
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360; return h;
  }
  function parseColor(c) {
    var m;
    if (typeof c !== "string") return [1, 0.85, 0];
    m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
    if (m) return [parseInt(m[1].substr(0, 2), 16) / 255, parseInt(m[1].substr(2, 2), 16) / 255, parseInt(m[1].substr(4, 2), 16) / 255];
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { m = m[1].split(","); return [parseFloat(m[0]) / 255, parseFloat(m[1]) / 255, parseFloat(m[2]) / 255]; }
    return [1, 0.85, 0];
  }

  // ---------- buffers: premultiplied RGBA floats ----------
  function newBuf() { return new Float32Array(N * 4); }
  var pool = [];
  function get() { return pool.length ? pool.pop() : newBuf(); }
  function put(b) { if (b && pool.length < 24) pool.push(b); }
  function copy(src) { var d = get(); d.set(src); return d; }

  // bilinear sample (u, v in 0..1 over the frame, edge clamped); writes into out[0..3]
  var tmp4 = [0, 0, 0, 0];
  function sample(buf, u, v, out) {
    var x = u * BW - 0.5, y = v * BH - 0.5, x0, y0, fx, fy, x1, y1, i00, i10, i01, i11, k;
    if (x < 0) x = 0; else if (x > BW - 1) x = BW - 1;
    if (y < 0) y = 0; else if (y > BH - 1) y = BH - 1;
    x0 = x | 0; y0 = y | 0; fx = x - x0; fy = y - y0;
    x1 = x0 + 1 < BW ? x0 + 1 : x0; y1 = y0 + 1 < BH ? y0 + 1 : y0;
    i00 = (y0 * BW + x0) * 4; i10 = (y0 * BW + x1) * 4; i01 = (y1 * BW + x0) * 4; i11 = (y1 * BW + x1) * 4;
    for (k = 0; k < 4; k++) out[k] = (buf[i00 + k] * (1 - fx) + buf[i10 + k] * fx) * (1 - fy) + (buf[i01 + k] * (1 - fx) + buf[i11 + k] * fx) * fy;
  }

  // ---------- keys: AE-style temporal easing ----------
  function tok(e) {
    var ch, rest, parts, a, b;
    e = (e === undefined || e === null || e === "") ? "E" : String(e);
    ch = e.charAt(0); rest = e.substr(1); parts = rest ? rest.split(",") : [];
    a = parts.length ? parseFloat(parts[0]) : 33.333; b = parts.length > 1 ? parseFloat(parts[1]) : a;
    if (!(a >= 0.1)) a = 33.333; if (!(b >= 0.1)) b = a;
    return { t: ch, a: Math.min(a, 100) / 100, b: Math.min(b, 100) / 100 };
  }
  // resolve frames: numbers are relative to the cut; "i" / "o" are the loop ends; looks without a cut count from the ends
  function resolveKeys(keys, span, i0, i1) {
    var out = [], j, f, t;
    for (j = 0; j < keys.length; j++) {
      f = keys[j][0];
      if (f === "i") f = i0; else if (f === "o") f = i1; else if (span === "auto") f = f >= 0 ? i0 + f : i1 + f;
      out.push({ f: f, v: keys[j][1], e: tok(keys[j][2]) });
    }
    out.sort(function (a, b) { return a.f - b.f; });
    return out;
  }
  function slopeOf(r, j, c) {
    var a = r[j > 0 ? j - 1 : j], b = r[j < r.length - 1 ? j + 1 : j], df = b.f - a.f;
    if (df <= 0) return 0;
    return ((Array.isArray(b.v) ? b.v[c] : b.v) - (Array.isArray(a.v) ? a.v[c] : a.v)) / df;
  }
  function comp1(v, c) { return Array.isArray(v) ? v[c] : v; }
  function bez(p0, p1, p2, p3, u) { var w = 1 - u; return w * w * w * p0 + 3 * w * w * u * p1 + 3 * w * u * u * p2 + u * u * u * p3; }
  function segValue(r, j, f, c) {
    var k0 = r[j], k1 = r[j + 1], v0 = comp1(k0.v, c), v1 = comp1(k1.v, c), df = k1.f - k0.f, sec = (v1 - v0) / df, s0, s1, a0, a1, lo, hi, mid, u, it;
    if (k0.e.t === "H") return v0;
    if (k0.e.t === "L") { s0 = sec; a0 = 1 / 3; } else if (k0.e.t === "S") { s0 = slopeOf(r, j, c); a0 = k0.e.b; } else { s0 = 0; a0 = k0.e.b; }
    if (k1.e.t === "L") { s1 = sec; a1 = 1 / 3; } else if (k1.e.t === "S") { s1 = slopeOf(r, j + 1, c); a1 = k1.e.a; } else { s1 = 0; a1 = k1.e.a; }
    if (k0.e.t === "L" && k1.e.t === "L") return v0 + sec * (f - k0.f);
    // x(u) = f, solve by bisection, then value
    lo = 0; hi = 1;
    for (it = 0; it < 18; it++) { mid = (lo + hi) / 2; if (bez(k0.f, k0.f + a0 * df, k1.f - a1 * df, k1.f, mid) < f) lo = mid; else hi = mid; }
    u = (lo + hi) / 2;
    return bez(v0, v0 + s0 * a0 * df, v1 - s1 * a1 * df, v1, u);
  }
  // value of a key list at frame f; returns a number or an array like the keys
  function evalKeys(r, f) {
    var n = r.length, j, c, out;
    if (n === 0) return 0;
    if (f <= r[0].f) return r[0].v;
    if (f >= r[n - 1].f) return r[n - 1].v;
    for (j = 0; j < n - 1; j++) if (f < r[j + 1].f) break;
    if (Array.isArray(r[0].v)) { out = []; for (c = 0; c < r[0].v.length; c++) out.push(segValue(r, j, f, c)); return out; }
    return segValue(r, j, f, 0);
  }
  HSR.evalKeys = evalKeys; HSR.resolveKeys = resolveKeys;

  // ---------- the two shots: themed gradients ----------
  // accent hue steers a purple range: always violet / indigo / magenta, tilted toward the theme
  function shotHue(accent) {
    var c = parseColor(accent), h0 = hueOf(c[0], c[1], c[2]), d = ((h0 - 272 + 540) % 360) - 180;
    return 272 + d * 0.2;
  }
  function paint(hs, spec, seed) {
    var b = newBuf(), x, y, i, k, bl, r, g, bb, u, v, a, t, d, c1, c2, c3, c4, gx, gy, fall, rr = rnd(seed), n;
    c1 = hsl(hs + spec.h[0], spec.s, spec.l[0]); c2 = hsl(hs + spec.h[1], spec.s, spec.l[1]); c3 = hsl(hs + spec.h[2], spec.s * 0.95, spec.l[2]);
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      u = x / (BW - 1); v = y / (BH - 1);
      t = clamp(u * spec.dir[0] + v * spec.dir[1] + 0.5 - (spec.dir[0] + spec.dir[1]) / 2, 0, 1);
      if (t < 0.5) { a = t / 0.5; r = mix(c1[0], c2[0], a); g = mix(c1[1], c2[1], a); bb = mix(c1[2], c2[2], a); }
      else { a = (t - 0.5) / 0.5; r = mix(c2[0], c3[0], a); g = mix(c2[1], c3[1], a); bb = mix(c2[2], c3[2], a); }
      for (k = 0; k < spec.blobs.length; k++) {
        bl = spec.blobs[k]; gx = (u - bl[0]) * (BW / BH); gy = v - bl[1]; d = Math.sqrt(gx * gx + gy * gy) / bl[2];
        fall = d >= 1 ? 0 : (1 - d * d); fall = fall * fall * bl[4];
        cb = hsl(hs + bl[3], 0.85, bl[5]); r = mix(r, cb[0], fall); g = mix(g, cb[1], fall); bb = mix(bb, cb[2], fall);
      }
      n = (rr() - 0.5) * 0.028;
      i = (y * BW + x) * 4;
      b[i] = clamp(r + n, 0, 1.4); b[i + 1] = clamp(g + n, 0, 1.4); b[i + 2] = clamp(bb + n, 0, 1.4); b[i + 3] = 1;
    }
    return b;
  }
  var cb;
  var SHOT_A = { h: [-34, -2, 30], s: 0.62, l: [0.16, 0.3, 0.5], dir: [0.82, 0.58], blobs: [[0.2, 0.28, 0.5, 12, 0.75, 0.62], [0.82, 0.78, 0.46, -38, 0.55, 0.55], [0.58, 0.14, 0.26, 44, 0.5, 0.78]] };
  var SHOT_B = { h: [40, 8, -38], s: 0.6, l: [0.5, 0.28, 0.17], dir: [-0.55, 0.84], blobs: [[0.78, 0.3, 0.52, -16, 0.7, 0.64], [0.2, 0.82, 0.45, 30, 0.6, 0.52], [0.36, 0.22, 0.24, -50, 0.5, 0.8]] };
  var shots = { key: "", a: null, b: null };
  function makeShots(accent) {
    var hs = shotHue(accent), key = String(Math.round(hs));
    if (shots.key === key && shots.a) return shots;
    shots.key = key; shots.a = paint(hs, SHOT_A, 11); shots.b = paint(hs, SHOT_B, 29);
    return shots;
  }
  HSR.makeShots = makeShots; HSR.shotHue = shotHue;
  HSR.dims = { BW: BW, BH: BH, N: N };
  HSR._u = { clamp: clamp, mix: mix, smooth: smooth, rnd: rnd, hsl: hsl, parseColor: parseColor, newBuf: newBuf, get: get, put: put, copy: copy, sample: sample, tmp4: tmp4, BG: BG };
  root.HSR = HSR;
})(typeof window !== "undefined" ? window : global);
// ---- part 2: geometry maps (tile, transform, 3D tilt, bulge, twirl, lens, displace) + the sampler that rasterizes them
(function (root) {
  "use strict";
  var HSR = root.HSR, U = HSR._u, BW = HSR.dims.BW, BH = HSR.dims.BH, N = HSR.dims.N, A = BW / BH;
  var clamp = U.clamp, sample = U.sample;

  // ---- value noise (for Turbulent Displace)
  function hash3(x, y, z) { var h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function fade(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi), a, b, c, d;
    a = hash3(xi, yi, zi) * (1 - xf) + hash3(xi + 1, yi, zi) * xf; b = hash3(xi, yi + 1, zi) * (1 - xf) + hash3(xi + 1, yi + 1, zi) * xf;
    c = hash3(xi, yi, zi + 1) * (1 - xf) + hash3(xi + 1, yi, zi + 1) * xf; d = hash3(xi, yi + 1, zi + 1) * (1 - xf) + hash3(xi + 1, yi + 1, zi + 1) * xf;
    return (a * (1 - yf) + b * yf) * (1 - zf) + (c * (1 - yf) + d * yf) * zf;
  }
  function fbm(x, y, z, oct) { var s = 0, a = 0.5, f = 1, i, n = 0; for (i = 0; i < oct; i++) { s += a * (vnoise(x * f, y * f, z + i * 7.1) - 0.5); n += a; a *= 0.5; f *= 2; } return s / n * 2; }
  HSR.fbm = fbm;

  // a map is { inv(p): p = [u, v, alpha] is moved to where the pixel comes from; clip: true cuts what falls outside the frame }
  function mapTile(g) {
    var cx = g.c[0], cy = g.c[1], hw = g.ow / 200, hh = g.oh / 200, mir = g.mir;
    return { clip: false, inv: function (p) {
      var x, y, iu, iv, fu, fv;
      if (Math.abs(p[0] - 0.5) > hw + 1e-6 || Math.abs(p[1] - 0.5) > hh + 1e-6) { p[2] = 0; return; }
      x = p[0] - cx + 0.5; y = p[1] - cy + 0.5; iu = Math.floor(x); iv = Math.floor(y); fu = x - iu; fv = y - iv;
      if (mir) { if (iu & 1) fu = 1 - fu; if (iv & 1) fv = 1 - fv; }
      p[0] = fu; p[1] = fv;
    } };
  }
  function mapTf(g) {
    var px = g.pos[0], py = g.pos[1], r = g.rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), sx = Math.max(0.01, g.sw / 100), sy = Math.max(0.01, g.sh / 100);
    return { clip: true, inv: function (p) {
      var dx = (p[0] - px) * A, dy = p[1] - py, x = dx * cs + dy * sn, y = -dx * sn + dy * cs;
      p[0] = x / sx / A + 0.5; p[1] = y / sy + 0.5;
    } };
  }
  function map3d(g) {
    var th = g.tilt * Math.PI / 180, ph = g.swivel * Math.PI / 180, d = 1.7, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
    return { clip: true, inv: function (p) {
      var x = (p[0] - 0.5) * A, y = p[1] - 0.5, den, yp, xp;
      if (Math.abs(g.tilt) > 0.01) {
        den = d * ct - y * st;
        if (Math.abs(ct) < 0.02 || den <= 0.02) { p[2] = 0; return; }
        yp = y * d / den; xp = x * (d + yp * st) / d; x = xp; y = yp;
      }
      if (Math.abs(g.swivel) > 0.01) {
        den = d * cp - x * sp;
        if (Math.abs(cp) < 0.02 || den <= 0.02) { p[2] = 0; return; }
        xp = x * d / den; yp = y * (d + xp * sp) / d; x = xp; y = yp;
      }
      p[0] = x / A + 0.5; p[1] = y + 0.5;
    } };
  }
  function mapBulge(g) {
    var cx = g.c[0], cy = g.c[1], rx = Math.max(1e-3, g.rx / 1080 / A), ry = Math.max(1e-3, g.ry / 1080), h = clamp(g.h * 0.28, -0.9, 0.93);
    return { clip: false, inv: function (p) {
      var dx = (p[0] - cx) / rx, dy = (p[1] - cy) / ry, d2 = dx * dx + dy * dy, k;
      if (d2 >= 1) return;
      k = 1 - h * (1 - d2);
      p[0] = cx + (p[0] - cx) * k; p[1] = cy + (p[1] - cy) * k;
    } };
  }
  function mapTwirl(g) {
    var cx = g.c[0], cy = g.c[1], R = Math.max(1e-3, g.rad / 1080), ang = g.ang * Math.PI / 180;
    return { clip: false, inv: function (p) {
      var dx = (p[0] - cx) * A, dy = p[1] - cy, r = Math.sqrt(dx * dx + dy * dy), a, c, s;
      if (r >= R) return;
      a = ang * Math.pow(1 - r / R, 2); c = Math.cos(a); s = Math.sin(a);
      p[0] = cx + (dx * c - dy * s) / A; p[1] = cy + dx * s + dy * c;
    } };
  }
  function mapOptic(g) {
    var kk = clamp(g.fov / 100, 0, 1.6) * 0.95 * (g.rev ? 1 : -1);
    return { clip: false, inv: function (p) {
      var dx = (p[0] - 0.5) * A, dy = p[1] - 0.5, r2 = (dx * dx + dy * dy) * 1.1, k = 1 + kk * r2;
      if (k < 0.05) k = 0.05;
      p[0] = 0.5 + dx * k / A; p[1] = 0.5 + dy * k;
    } };
  }
  function mapDisp(g) {
    var kind = g.type, amt = g.amt / 1080 * 1.6, sz = Math.max(4, g.size) / 1080 * 6, cx = Math.max(1, Math.round(g.cx)), z = g.evo / 60, smooth = (kind === 4 || kind === 5 || kind === 6);
    return { clip: false, inv: function (p) {
      var n1, n2, x = p[0] * A / sz, y = p[1] / sz;
      n1 = HSR.fbm(x, y, z, smooth ? 1 : cx); n2 = HSR.fbm(x + 31.7, y + 9.2, z, smooth ? 1 : cx);
      if (kind === 8) p[0] += n1 * amt / A * 1.5;
      else if (kind === 7) p[1] += n1 * amt * 1.5;
      else if (kind === 9) { p[0] += n1 * amt / A * 1.2; p[1] += n2 * amt * 1.2; }
      else if (kind === 2 || kind === 5) { p[0] += n1 * amt / A * 0.8; p[1] += n2 * amt * 0.8; }
      else { p[0] += n1 * amt / A * 1.1; p[1] += n2 * amt * 1.1; }
    } };
  }
  HSR.maps = { tile: mapTile, tf: mapTf, b3d: map3d, bul: mapBulge, twirl: mapTwirl, optic: mapOptic, td: mapDisp };

  // run the pending maps (outermost last) on a buffer. `sets` is a list of map lists (one per sub-frame tap of motion blur)
  function raster(src, sets) {
    var out = U.get(), x, y, i, t, m, p = [0, 0, 1], n = sets.length, acc = [0, 0, 0, 0], s4 = U.tmp4, k, maps, inv = 1 / n, clip;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      for (t = 0; t < n; t++) {
        maps = sets[t]; p[0] = (x + 0.5) / BW; p[1] = (y + 0.5) / BH; p[2] = 1;
        for (m = maps.length - 1; m >= 0 && p[2] > 0; m--) {
          maps[m].inv(p);
          if (maps[m].clip && (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1)) p[2] = 0;
        }
        if (p[2] > 0) {
          sample(src, p[0], p[1], s4);
          for (k = 0; k < 4; k++) acc[k] += s4[k];
        }
      }
      i = (y * BW + x) * 4; out[i] = acc[0] * inv; out[i + 1] = acc[1] * inv; out[i + 2] = acc[2] * inv; out[i + 3] = acc[3] * inv;
    }
    return out;
  }
  HSR.raster = raster;
  root.HSR = HSR;
})(typeof window !== "undefined" ? window : global);
// ---- part 3: pixel effects (blur family, color, light, glitch, flare ...)
(function (root) {
  "use strict";
  var HSR = root.HSR, U = HSR._u, BW = HSR.dims.BW, BH = HSR.dims.BH, N = HSR.dims.N, A = BW / BH;
  var clamp = U.clamp, mix = U.mix, sample = U.sample;
  var S = BH / 1080;                       // 1080-tall px -> buffer px
  HSR.S = S;

  // separable box blur with clamped edges, run `pass` times -> close to a Gaussian
  function boxH(src, dst, r) {
    var y, x, k, i, w = 2 * r + 1, acc = [0, 0, 0, 0], row, last = BW - 1, a, b;
    for (y = 0; y < BH; y++) {
      row = y * BW * 4; acc[0] = acc[1] = acc[2] = acc[3] = 0;
      for (k = -r; k <= r; k++) { i = row + clamp(k, 0, last) * 4; acc[0] += src[i]; acc[1] += src[i + 1]; acc[2] += src[i + 2]; acc[3] += src[i + 3]; }
      for (x = 0; x < BW; x++) {
        i = row + x * 4; dst[i] = acc[0] / w; dst[i + 1] = acc[1] / w; dst[i + 2] = acc[2] / w; dst[i + 3] = acc[3] / w;
        a = row + clamp(x + r + 1, 0, last) * 4; b = row + clamp(x - r, 0, last) * 4;
        acc[0] += src[a] - src[b]; acc[1] += src[a + 1] - src[b + 1]; acc[2] += src[a + 2] - src[b + 2]; acc[3] += src[a + 3] - src[b + 3];
      }
    }
  }
  function boxV(src, dst, r) {
    var y, x, k, i, w = 2 * r + 1, acc = [0, 0, 0, 0], last = BH - 1, a, b;
    for (x = 0; x < BW; x++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      for (k = -r; k <= r; k++) { i = (clamp(k, 0, last) * BW + x) * 4; acc[0] += src[i]; acc[1] += src[i + 1]; acc[2] += src[i + 2]; acc[3] += src[i + 3]; }
      for (y = 0; y < BH; y++) {
        i = (y * BW + x) * 4; dst[i] = acc[0] / w; dst[i + 1] = acc[1] / w; dst[i + 2] = acc[2] / w; dst[i + 3] = acc[3] / w;
        a = (clamp(y + r + 1, 0, last) * BW + x) * 4; b = (clamp(y - r, 0, last) * BW + x) * 4;
        acc[0] += src[a] - src[b]; acc[1] += src[a + 1] - src[b + 1]; acc[2] += src[a + 2] - src[b + 2]; acc[3] += src[a + 3] - src[b + 3];
      }
    }
  }
  // sigma in buffer px; returns a NEW buffer, src untouched
  function blur(src, sx, sy) {
    var out = U.get(), t = U.get(), p, r;
    out.set(src);
    for (p = 0; p < 3; p++) {
      r = Math.round(Math.sqrt(sx * sx / 3 + 0.25) - 0.4);
      if (sx > 0.35 && r >= 1) { boxH(out, t, r); r = t; t = out; out = r; }
      else if (sx > 0.35) { boxH(out, t, 1); r = t; t = out; out = r; /* min width */ }
    }
    for (p = 0; p < 3; p++) {
      r = Math.round(Math.sqrt(sy * sy / 3 + 0.25) - 0.4);
      if (sy > 0.35 && r >= 1) { boxV(out, t, r); r = t; t = out; out = r; }
      else if (sy > 0.35) { boxV(out, t, 1); r = t; t = out; out = r; }
    }
    U.put(t);
    return out;
  }
  HSR.blur = blur;

  function dirBlur(src, angDeg, lenPx) {
    var out = U.get(), a = angDeg * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a) * 0 + Math.sin(a), K = clamp(Math.round(lenPx * 0.8) + 3, 3, 21), x, y, k, i, s4 = U.tmp4, acc = [0, 0, 0, 0], t, c;
    // AE's direction 0 = horizontal, 90 = vertical
    dx = Math.cos(a); dy = Math.sin(a);
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      for (k = 0; k < K; k++) { t = (k / (K - 1) - 0.5) * lenPx; sample(src, (x + 0.5 + dx * t) / BW, (y + 0.5 + dy * t) / BH, s4); acc[0] += s4[0]; acc[1] += s4[1]; acc[2] += s4[2]; acc[3] += s4[3]; }
      i = (y * BW + x) * 4; out[i] = acc[0] / K; out[i + 1] = acc[1] / K; out[i + 2] = acc[2] / K; out[i + 3] = acc[3] / K;
    }
    return out;
  }
  function radBlur(src, amt, cx, cy, spin) {
    var out = U.get(), K = 10, x, y, k, i, s4 = U.tmp4, acc = [0, 0, 0, 0], dx, dy, f, a, c, s, X, Y, u, v;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      acc[0] = acc[1] = acc[2] = acc[3] = 0;
      dx = ((x + 0.5) / BW - cx); dy = ((y + 0.5) / BH - cy);
      for (k = 0; k < K; k++) {
        f = k / (K - 1) - 0.5;
        if (spin) { a = f * amt * Math.PI / 180; c = Math.cos(a); s = Math.sin(a); X = dx * A * c - dy * s; Y = dx * A * s + dy * c; u = cx + X / A; v = cy + Y; }
        else { f = 1 - f * amt * 0.0042 * 1.0; u = cx + dx * f; v = cy + dy * f; }
        sample(src, u, v, s4); acc[0] += s4[0]; acc[1] += s4[1]; acc[2] += s4[2]; acc[3] += s4[3];
      }
      i = (y * BW + x) * 4; out[i] = acc[0] / K; out[i + 1] = acc[1] / K; out[i + 2] = acc[2] / K; out[i + 3] = acc[3] / K;
    }
    return out;
  }

  var FX = {};
  // value helpers: q(e, key, def) is wired up by the stage
  FX.gblur = function (cur, q) { var r = q("rad", 0) * S * 0.5; if (r < 0.05) return cur; var o = blur(cur, r, r); U.put(cur); return o; };
  FX.dblur = function (cur, q) { var l = q("len", 0) * S; if (l < 0.4) return cur; var o = dirBlur(cur, q("ang", 0), l); U.put(cur); return o; };
  FX.rblur = function (cur, q, e, c) { var a = q("amt", 0); if (a < 0.5) return cur; var cc = q("c", [0.5, 0.5]); var o = radBlur(cur, a, cc[0], cc[1], false); U.put(cur); return o; };
  FX.sblur = function (cur, q) { var a = q("amt", 0); if (a < 0.3) return cur; var o = radBlur(cur, a * 0.9, 0.5, 0.5, true); U.put(cur); return o; };
  FX.chan = function (cur, q) {
    var r = q("r", 0) * S * 0.5, g = q("g", 0) * S * 0.5, b = q("b", 0) * S * 0.5, out, br, bb, i;
    if (r < 0.1 && b < 0.1 && g < 0.1) return cur;
    out = U.copy(cur);
    // a channel blur smears one color channel sideways: here a horizontal blur plus a small shift, so the fringe is easy to see
    br = r > 0.1 ? blur(cur, r, r * 0.35) : cur; bb = b > 0.1 ? blur(cur, b, b * 0.35) : cur;
    var s4 = U.tmp4, x, y, sh = Math.max(r, b) * 0.9;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      i = (y * BW + x) * 4;
      sample(br, (x + 0.5 + r * 0.9) / BW, (y + 0.5) / BH, s4); out[i] = s4[0];
      sample(bb, (x + 0.5 - b * 0.9) / BW, (y + 0.5) / BH, s4); out[i + 2] = s4[2];
    }
    if (br !== cur) U.put(br); if (bb !== cur) U.put(bb);
    U.put(cur); return out;
  };
  FX.expo = function (cur, q) {
    var ev = q("ev", 0), off = q("off", 0), gam = q("gam", 1), m = Math.pow(2, ev), i, k, v, inv = 1 / Math.max(0.2, gam);
    if (Math.abs(ev) < 1e-4 && Math.abs(off) < 1e-4 && Math.abs(gam - 1) < 1e-4) return cur;
    for (i = 0; i < N * 4; i += 4) for (k = 0; k < 3; k++) { v = cur[i + k] * m + off * cur[i + 3]; if (gam !== 1) v = Math.pow(Math.max(v, 0), inv); cur[i + k] = v; }
    return cur;
  };
  FX.hs = function (cur, q) {
    var hue = q("hue", 0) * Math.PI / 180, sat = 1 + q("sat", 0) / 100, lit = q("lit", 0) / 100, i, r, g, b, y, ch = Math.cos(hue), sh = Math.sin(hue), I, Q, I2, Q2, a;
    if (Math.abs(hue) < 1e-4 && Math.abs(sat - 1) < 1e-4 && Math.abs(lit) < 1e-4) return cur;
    for (i = 0; i < N * 4; i += 4) {
      r = cur[i]; g = cur[i + 1]; b = cur[i + 2]; a = cur[i + 3];
      y = 0.299 * r + 0.587 * g + 0.114 * b; I = 0.596 * r - 0.274 * g - 0.322 * b; Q = 0.211 * r - 0.523 * g + 0.312 * b;
      I2 = (I * ch - Q * sh) * sat; Q2 = (I * sh + Q * ch) * sat;
      r = y + 0.956 * I2 + 0.621 * Q2; g = y - 0.272 * I2 - 0.647 * Q2; b = y - 1.106 * I2 + 1.703 * Q2;
      if (lit > 0) { r = r + (a - r) * lit; g = g + (a - g) * lit; b = b + (a - b) * lit; } else if (lit < 0) { r *= 1 + lit; g *= 1 + lit; b *= 1 + lit; }
      cur[i] = r; cur[i + 1] = g; cur[i + 2] = b;
    }
    return cur;
  };
  FX.bc = function (cur, q) {
    var b = q("b", 0) / 100 * 0.5, c = 1 + q("c", 0) / 100 * 0.9, i, k;
    if (Math.abs(b) < 1e-4 && Math.abs(c - 1) < 1e-4) return cur;
    for (i = 0; i < N * 4; i += 4) for (k = 0; k < 3; k++) cur[i + k] = (cur[i + k] - 0.5 * cur[i + 3]) * c + 0.5 * cur[i + 3] + b * cur[i + 3];
    return cur;
  };
  FX.cb = function (cur, q) {
    var sr = q("sr", 0), sg = q("sg", 0), sb = q("sb", 0), mr = q("mr", 0), mg = q("mg", 0), mb = q("mb", 0), hr = q("hr", 0), hg = q("hg", 0), hb = q("hb", 0), i, l, ws, wm, wh, k = 0.0042;
    if (!(sr || sg || sb || mr || mg || mb || hr || hg || hb)) return cur;
    for (i = 0; i < N * 4; i += 4) {
      l = clamp(0.299 * cur[i] + 0.587 * cur[i + 1] + 0.114 * cur[i + 2], 0, 1); ws = (1 - l) * (1 - l); wh = l * l; wm = 4 * l * (1 - l);
      cur[i] += (sr * ws + mr * wm + hr * wh) * k; cur[i + 1] += (sg * ws + mg * wm + hg * wh) * k; cur[i + 2] += (sb * ws + mb * wm + hb * wh) * k;
    }
    return cur;
  };
  FX.pf = function (cur, q) {
    var d = q("den", 0) / 100, col = q("col", [1, 0.6, 0.2]), i, l;
    if (d < 1e-3) return cur;
    for (i = 0; i < N * 4; i += 4) { l = 0.299 * cur[i] + 0.587 * cur[i + 1] + 0.114 * cur[i + 2]; cur[i] += (l * col[0] - cur[i]) * d; cur[i + 1] += (l * col[1] - cur[i + 1]) * d; cur[i + 2] += (l * col[2] - cur[i + 2]) * d; }
    return cur;
  };
  FX.fill = function (cur, q) {
    var o = q("op", 100) / 100, col = q("col", [1, 1, 1]), i;
    if (o < 1e-3) return cur;
    for (i = 0; i < N * 4; i += 4) { cur[i] += (col[0] - cur[i]) * o; cur[i + 1] += (col[1] - cur[i + 1]) * o; cur[i + 2] += (col[2] - cur[i + 2]) * o; cur[i + 3] += (1 - cur[i + 3]) * o; }
    return cur;
  };
  FX.inv = function (cur, q) {
    var b = clamp(q("bl", 100), 0, 100) / 100, i, k;
    if (b > 0.999) return cur;
    for (i = 0; i < N * 4; i += 4) for (k = 0; k < 3; k++) cur[i + k] = cur[i + k] * b + (cur[i + 3] - cur[i + k]) * (1 - b);
    return cur;
  };
  FX.glow = function (cur, q) {
    var thr = q("thr", 60) / 100, rad = q("rad", 40) * S * 0.5, it = q("int", 1), br, bl, i, l, k, f;
    if (it < 0.01) return cur;
    br = U.get();
    for (i = 0; i < N * 4; i += 4) { l = 0.299 * cur[i] + 0.587 * cur[i + 1] + 0.114 * cur[i + 2]; f = l > thr ? (l - thr) / Math.max(0.05, 1.05 - thr) : 0; br[i] = cur[i] * f; br[i + 1] = cur[i + 1] * f; br[i + 2] = cur[i + 2] * f; br[i + 3] = 0; }
    bl = blur(br, Math.max(0.6, rad), Math.max(0.6, rad));
    for (i = 0; i < N * 4; i += 4) for (k = 0; k < 3; k++) cur[i + k] += bl[i + k] * it * 1.4;
    U.put(br); U.put(bl);
    return cur;
  };
  FX.usm = function (cur, q) {
    var amt = q("amt", 0) / 100, rad = q("rad", 1) * S * 0.9, bl, i, k;
    if (amt < 0.01) return cur;
    bl = blur(cur, Math.max(0.5, rad), Math.max(0.5, rad));
    for (i = 0; i < N * 4; i += 4) for (k = 0; k < 3; k++) cur[i + k] += (cur[i + k] - bl[i + k]) * amt;
    U.put(bl); return cur;
  };
  FX.noise = function (cur, q, e, env) {
    var a = q("amt", 0) / 100 * 0.5, col = q("col", 0), r = U.rnd(env.fi * 977 + 13), i, n, k;
    if (a < 1e-3) return cur;
    for (i = 0; i < N * 4; i += 4) { n = (r() - 0.5) * a; if (col) { for (k = 0; k < 3; k++) cur[i + k] += (r() - 0.5) * a; } else { cur[i] += n; cur[i + 1] += n; cur[i + 2] += n; } }
    return cur;
  };
  FX.med = function (cur, q) { var o = blur(cur, 0.7, 0.7); U.put(cur); return o; };
  FX.ramp = function (cur, q) {
    var a = q("a", [0.5, 0.1]), ac = q("ac", [1, 0.5, 0.1]), b = q("b", [0.5, 0.9]), bc = q("bc", [1, 0.1, 0.4]), shape = q("shape", 1), bl = clamp(q("bl", 100), 0, 100) / 100, x, y, i, t, k, dx, dy, ll, px, py, vx, vy;
    if (bl > 0.999) return cur;
    vx = (b[0] - a[0]) * A; vy = b[1] - a[1]; ll = vx * vx + vy * vy || 1;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      px = ((x + 0.5) / BW - a[0]) * A; py = (y + 0.5) / BH - a[1];
      if (shape === 2) t = Math.sqrt(px * px + py * py) / Math.sqrt(ll); else t = (px * vx + py * vy) / ll;
      t = clamp(t, 0, 1); i = (y * BW + x) * 4;
      for (k = 0; k < 3; k++) cur[i + k] = cur[i + k] * bl + mix(ac[k], bc[k], t) * (1 - bl);
    }
    return cur;
  };
  FX.flare = function (cur, q) {
    var c = q("c", [0.5, 0.4]), br = q("br", 100) / 100, x, y, i, dx, dy, d, f, st, k, gx, gy, ring, g;
    if (br < 0.02) return cur;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      dx = ((x + 0.5) / BW - c[0]) * A; dy = (y + 0.5) / BH - c[1]; d = Math.sqrt(dx * dx + dy * dy);
      f = 0.9 / (1 + d * d * 380) + 0.5 * Math.exp(-d * 5);
      st = 0.55 * Math.exp(-Math.abs(dy) * 60) * Math.exp(-Math.abs(dx) * 2.2);
      ring = 0;
      for (k = 1; k <= 3; k++) { gx = dx + (0.5 * A - c[0] * A) * 0 ; g = Math.sqrt(Math.pow(dx - (0.5 - c[0]) * A * 0.6 * k, 2) + Math.pow(dy - (0.5 - c[1]) * 0.6 * k, 2)); ring += 0.16 / (1 + Math.pow((g - 0.05 * k) * 28, 2)) / k; }
      i = (y * BW + x) * 4; f = (f + st + ring) * br;
      cur[i] += f * 1.0; cur[i + 1] += f * 0.82; cur[i + 2] += f * 0.62;
    }
    return cur;
  };
  // CC Light Sweep: a soft band that travels across the frame (Add = bright light, Composite = a dark band)
  FX.sweep = function (cur, q) {
    var c = q("c", [0.5, 0.5]), ang = q("ang", 30) * Math.PI / 180, w = Math.max(0.01, q("wid", 120) / 1080), si = q("si", 60) / 100,
      ei = q("ei", 0) / 100, col = q("col", [1, 1, 1]), rec = q("rec", 1), ca = Math.cos(ang), sa = Math.sin(ang), x, y, i, d, band, edge, k, v;
    if (si < 0.01 && ei < 0.01) return cur;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      d = (((x + 0.5) / BW - c[0]) * A * ca + ((y + 0.5) / BH - c[1]) * sa) / w;
      band = Math.exp(-d * d * 1.4) * si; edge = ei * Math.exp(-Math.pow(Math.abs(d) - 1, 2) * 22) * 0.5;
      v = band + edge;
      if (v < 0.002) continue;
      i = (y * BW + x) * 4;
      if (rec === 2) { for (k = 0; k < 3; k++) cur[i + k] = cur[i + k] * (1 - Math.min(1, v)) + col[k] * Math.min(1, v) * cur[i + 3]; }
      else { for (k = 0; k < 3; k++) cur[i + k] += col[k] * v * 1.15; }
    }
    return cur;
  };
  FX.mos = function (cur, q) {
    var hb = Math.max(2, Math.round(q("hb", 960))), vb = Math.max(2, Math.round(q("vb", 540))), bw = BW / hb, bh = BH / vb, out, x, y, i, j, s4 = U.tmp4;
    if (hb >= BW && vb >= BH) return cur;
    out = U.get();
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      sample(cur, (Math.floor(x / bw) * bw + bw / 2) / BW, (Math.floor(y / bh) * bh + bh / 2) / BH, s4);
      i = (y * BW + x) * 4; out[i] = s4[0]; out[i + 1] = s4[1]; out[i + 2] = s4[2]; out[i + 3] = s4[3];
    }
    U.put(cur); return out;
  };
  HSR.FX = FX;
  root.HSR = HSR;
})(typeof window !== "undefined" ? window : global);
// ---- part 4: the effect chain player (same recipes as host.jsx), layers, masks, blend, before / after
(function (root) {
  "use strict";
  var HSR = root.HSR, U = HSR._u, BW = HSR.dims.BW, BH = HSR.dims.BH, N = HSR.dims.N, A = BW / BH, S = HSR.S;
  var clamp = U.clamp, mix = U.mix;
  var MAPT = { tile: 1, tf: 1, b3d: 1, bul: 1, twirl: 1, optic: 1, td: 1 };

  // ---- resolve every key list of a recipe once (so playing a frame is cheap)
  function prep(r) {
    var p = r.p, pl = { r: r, p: p, span: p.span, i0: 0, i1: 0, lo: 0, hi: 0 }, lo = 0, hi = 0;
    function scanEntries(list) {
      var j, e, key, rk, fr;
      for (j = 0; j < list.length; j++) {
        e = list[j];
        if (e.k) for (key in e.k) if (e.k.hasOwnProperty(key)) {
          e.k[key].forEach(function (kk) { if (typeof kk[0] === "number" && p.span !== "auto") { if (kk[0] < lo) lo = kk[0]; if (kk[0] > hi) hi = kk[0]; } });
        }
      }
    }
    scanEntries(p.fx); (p.under || []).forEach(function (u) { scanEntries(u.fx); if (u.mask && u.mask.c && Array.isArray(u.mask.c[0])) u.mask.c.forEach(function (kk) { if (kk[0] < lo) lo = kk[0]; if (kk[0] > hi) hi = kk[0]; }); });
    if (p.span === "auto") { pl.i0 = 0; pl.i1 = 54; pl.f0 = 0; pl.f1 = 54; }
    else {
      lo = Math.min(lo, p.win[0]); hi = Math.max(hi, p.win[1]);
      pl.f0 = lo - 6; pl.f1 = hi + 8; pl.lo = lo; pl.hi = hi;
    }
    function resolve(list) {
      list.forEach(function (e) {
        e._r = {};
        if (e.k) for (var key in e.k) if (e.k.hasOwnProperty(key)) e._r[key] = HSR.resolveKeys(e.k[key], p.span, pl.i0, pl.i1);
      });
    }
    resolve(p.fx); (p.under || []).forEach(function (u) { resolve(u.fx); if (u.mask && u.mask.c && Array.isArray(u.mask.c[0]) && Array.isArray(u.mask.c[0][1])) u.mask._rc = HSR.resolveKeys(u.mask.c, p.span, pl.i0, pl.i1); });
    if (p.mask && p.mask.c && Array.isArray(p.mask.c[0]) && Array.isArray(p.mask.c[0][1])) p.mask._rc = HSR.resolveKeys(p.mask.c, p.span, pl.i0, pl.i1);
    if (p.lopk) p._rl = HSR.resolveKeys(p.lopk, p.span, pl.i0, pl.i1);
    return pl;
  }
  HSR.prep = prep;

  function scalePw(v, neu, k) {
    var o = [], i;
    if (k === 1) return v;
    if (Array.isArray(v)) { for (i = 0; i < v.length; i++) o.push((Array.isArray(neu) ? neu[i] : neu) + (v[i] - (Array.isArray(neu) ? neu[i] : neu)) * k); return o; }
    return neu + (v - neu) * k;
  }
  function wig(seed, t, oct) { return HSR.fbm(t, seed * 5.37, seed * 1.9, oct || 1) * 1.6; }

  // value of a parameter of effect e at frame f
  function val(e, key, def, f, env) {
    var r = e._r && e._r[key], v, pu, per, tt;
    if (e.pul && e.pul[key]) {
      pu = e.pul[key]; per = 30 / pu[0]; tt = (f - env.pl.i0) % per; if (tt < 0) tt += per;
      return pu[3] + pu[1] * env.k * Math.exp(-pu[2] * tt / 30);
    }
    if (r) v = HSR.evalKeys(r, f);
    else if (e.s && e.s[key] !== undefined) v = e.s[key];
    else v = def;
    if (e.pw && e.pw[key] !== undefined && env.k !== 1) v = scalePw(v, e.pw[key], env.k);
    return v;
  }
  // wiggle (hand-held sway) for the transform of an endless look
  function wiggleOf(e, f, env) {
    var w = e.wg, t = f / 30 * w.f, a = w.a * env.k / 1080, dx = wig(1, t, w.o) * a / A, dy = wig(2, t, w.o) * a;
    return { pos: [0.5 + (w.y ? 0 : dx), 0.5 + dy], rot: wig(3, t, w.o) * (w.r || 0) * env.k };
  }

  function mapParams(e, f, env) {
    var g = {}, q = function (k, d) { return val(e, k, d, f, env); }, sc, wg;
    if (e.t === "tile") { g.c = q("c", [0.5, 0.5]); g.ow = q("ow", 100); g.oh = q("oh", 100); g.mir = q("mir", 0); }
    else if (e.t === "tf") {
      wg = e.wg ? wiggleOf(e, f, env) : null;
      g.pos = wg ? wg.pos : q("pos", [0.5, 0.5]); g.rot = wg ? wg.rot : q("rot", 0);
      sc = (e._r && e._r.sc) || (e.pul && e.pul.sc) || (e.s && e.s.sc !== undefined) ? q("sc", 100) : null;
      if (sc !== null) { g.sh = sc; g.sw = sc; } else { g.sh = q("sh", 100); g.sw = (e.s && e.s.uni === 0) ? q("sw", 100) : g.sh; }
    }
    else if (e.t === "b3d") { g.tilt = q("tilt", 0); g.swivel = q("swivel", 0); }
    else if (e.t === "bul") { g.c = q("c", [0.5, 0.5]); g.rx = q("rx", 400); g.ry = q("ry", 400); g.h = q("h", 0); }
    else if (e.t === "twirl") { g.c = q("c", [0.5, 0.5]); g.rad = q("rad", 600); g.ang = q("ang", 0); }
    else if (e.t === "optic") { g.fov = q("fov", 0); g.rev = q("rev", 1); }
    else if (e.t === "td") { g.type = q("type", 1); g.amt = q("amt", 0); g.size = q("size", 20); g.cx = q("cx", 1); g.evo = q("evo", 0); }
    return g;
  }
  function flush(cur, pend, f, env) {
    var shut = 0, i, taps = 1, sets = [], j, off, span, maps, out;
    for (i = 0; i < pend.length; i++) if (pend[i].t === "tf" && pend[i].s && pend[i].s.shut) shut = Math.max(shut, pend[i].s.shut);
    if (shut > 5) taps = 5;
    span = shut / 360;
    for (j = 0; j < taps; j++) {
      off = taps === 1 ? 0 : (j / (taps - 1) - 0.5) * span;
      maps = [];
      for (i = 0; i < pend.length; i++) maps.push(HSR.maps[pend[i].t](mapParams(pend[i], f + off, env)));
      sets.push(maps);
    }
    out = HSR.raster(cur, sets);
    U.put(cur);
    return out;
  }

  function echoRun(cur, base, entries, i, e, f, env) {
    var n = Math.min(7, Math.round(val(e, "n", 1, f, env))), dt = Math.max(1, Math.abs(val(e, "time", -0.03, f, env)) * 30), int = val(e, "int", 0.8, f, env), dec = val(e, "dec", 0.6, f, env), j, w, im, k, x, step = 1;
    if (n < 1) return cur;
    for (j = 1; j <= n; j++) {
      w = int * Math.pow(dec, j - 1);
      im = runChain(base, entries, i, f - j * dt, env);
      for (x = 0; x < N * 4; x++) { k = im[x] * w; if (k > cur[x]) cur[x] = k; }
      U.put(im);
    }
    return cur;
  }

  function runChain(base, entries, upTo, f, env) {
    var cur = U.copy(base), pend = [], i, e, fq, q;
    for (i = 0; i < upTo; i++) {
      e = entries[i];
      if (MAPT[e.t]) { pend.push(e); continue; }
      if (pend.length) { cur = flush(cur, pend, f, env); pend = []; }
      if (e.t === "post") {
        fq = Math.floor(f / (30 / Math.max(1, val(e, "fps", 15, f, env)))) * (30 / Math.max(1, val(e, "fps", 15, f, env)));
        if (Math.abs(fq - f) > 1e-6 && !env.noPost) { U.put(cur); env.noPost = true; cur = runChain(base, entries, i, fq, env); env.noPost = false; }
        continue;
      }
      if (e.t === "echo") { cur = echoRun(cur, base, entries, i, e, f, env); continue; }
      if (HSR.FX[e.t]) {
        q = (function (ee) { return function (k, d) { return val(ee, k, d, f, env); }; })(e);
        cur = HSR.FX[e.t](cur, q, e, env);
      }
    }
    if (pend.length) cur = flush(cur, pend, f, env);
    return cur;
  }
  HSR.runChain = runChain;

  // mask coverage 0..1 (premultiplied into `out`)
  function maskAlpha(mk, f, env) {
    var out = U.get(), c = mk._rc ? HSR.evalKeys(mk._rc, f) : (mk.c || [0.5, 0.5]), cx = c[0] * BW, cy = c[1] * BH, hw = mk.size[0] * BW / 2, hh = mk.size[1] * BH / 2, fe = Math.max(0.9, (mk.feather || 0) * BH), x, y, d, a, i;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      if (mk.shape === "ellipse") d = (Math.sqrt(Math.pow((x + 0.5 - cx) / hw, 2) + Math.pow((y + 0.5 - cy) / hh, 2)) - 1) * Math.min(hw, hh);
      else d = Math.max(Math.abs(x + 0.5 - cx) - hw, Math.abs(y + 0.5 - cy) - hh);
      a = clamp(0.5 - d / fe, 0, 1); a = a * a * (3 - 2 * a);
      i = y * BW + x; out[i] = mk.inv ? 1 - a : a;
    }
    return out;
  }
  function applyLayer(input, spec, f, env) {
    var res = runChain(input, spec.fx, spec.fx.length, f, env), ma, i, k, a;
    if (spec.mask) {
      ma = maskAlpha(spec.mask, f, env);
      for (i = 0; i < N; i++) { a = ma[i]; for (k = 0; k < 4; k++) res[i * 4 + k] = input[i * 4 + k] + (res[i * 4 + k] - input[i * 4 + k]) * a; }
      U.put(ma);
    }
    return res;
  }

  // the full frame of a recipe: shots -> layers underneath -> main layer (mask, blend, opacity) -> before / after
  HSR.frameOf = function (pl, f, env) {
    var p = pl.p, base = env.baseAt(f), cur = U.copy(base), i, res, input, lop, a, k, blendN, orig = null;
    env.pl = pl; env.fi = Math.round(f * 3 + 1000);
    if (p.under) for (i = p.under.length - 1; i >= 0; i--) { res = applyLayer(cur, p.under[i], f, env); U.put(cur); cur = res; }
    input = cur;
    res = applyLayer(input, { fx: p.fx, mask: p.mask }, f, env);
    lop = p._rl ? HSR.evalKeys(p._rl, f) / 100 : (p.lop !== undefined ? p.lop / 100 : 1);
    if (p.blend === "add" || p.blend === "screen" || lop < 0.999) {
      for (i = 0; i < N * 4; i++) {
        a = input[i]; k = res[i];
        if (p.blend === "add") k = a + k; else if (p.blend === "screen") k = 1 - (1 - Math.min(a, 1)) * (1 - Math.min(Math.max(k, 0), 1));
        res[i] = a + (k - a) * lop;
      }
    }
    U.put(input);
    return res;
  };
  root.HSR = HSR;
})(typeof window !== "undefined" ? window : global);
// ---- part 5: the liquid glass scene (same construction as host.jsx: shadow / body / refracting edge / tint / rim)
(function (root) {
  "use strict";
  var HSR = root.HSR, U = HSR._u, BW = HSR.dims.BW, BH = HSR.dims.BH, N = HSR.dims.N, A = BW / BH, S = HSR.S;
  var clamp = U.clamp, mix = U.mix, smooth = U.smooth;

  // signed distance to a rounded rectangle centred at (cx, cy), half sizes hw, hh, corner radius r
  function sdRR(x, y, cx, cy, hw, hh, r) {
    var qx = Math.abs(x - cx) - (hw - r), qy = Math.abs(y - cy) - (hh - r), ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - r;
  }
  // the busy backdrop a lens needs: the themed shot with a few light orbs drifting over it
  HSR.glassBackdrop = function (shots, f, accent) {
    // the photo drifts slowly sideways behind a still lens, so the refraction is easy to read
    var src = HSR.scenes(shots, accent).photo, b = U.newBuf(), t = f / 30, off = Math.round(Math.sin(t * 0.6) * 16), x, y, sx, i, j;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      sx = x + off; sx = sx < 0 ? 0 : (sx > BW - 1 ? BW - 1 : sx);
      i = (y * BW + x) * 4; j = (y * BW + sx) * 4;
      b[i] = src[j]; b[i + 1] = src[j + 1]; b[i + 2] = src[j + 2]; b[i + 3] = 1;
    }
    return b;
  };

  // returns { buf, geo }  geo is what the overlay needs to draw the crisp rim
  HSR.glassFrame = function (p, f, bg, env) {
    var out = U.copy(bg), s = BW / 1920, popF = Math.max(2, p.pop), fade = clamp(f / (popF * 0.8), 0, 1), sc, pk, W, H, R, t, cx, cy, hw, hh, i, x, y, k, sd, sdi, a, m, fl, blurred, edgeImg, mag, tmp = U.tmp4, shadowOff, fRep;
    if (f < 0) return { buf: out, geo: null };
    fade = fade * fade * (3 - 2 * fade);
    pk = HSR.resolveKeys([[0, 0.86, "E"], [popF * 0.65, 1.03, "E"], [popF, 1, "E"]], "cut", 0, 0);
    sc = HSR.evalKeys(pk, f);
    cx = BW / 2 + Math.sin(f / 30 * 0.8) * 2.2; cy = BH / 2 + Math.sin(f / 30 * 1.1 + 1) * 1.6;
    W = p.w * s * sc; H = p.h * s * sc; R = (p.rad > 0 ? p.rad * s : Math.min(W, H) / 2) * sc; if (R > Math.min(W, H) / 2) R = Math.min(W, H) / 2;
    hw = W / 2; hh = H / 2;
    t = clamp(Math.min(W, H) * 0.16, 18 * s, 70 * s); if (t > Math.min(W, H) * 0.3) t = Math.min(W, H) * 0.3;
    // shadow ring under the glass
    shadowOff = Math.min(W, H) * 0.07; fl = (46 * s * (0.6 + p.shadow / 100)) * 0.5;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      sd = sdRR(x + 0.5, y + 0.5, cx, cy + shadowOff, hw, hh, R);
      a = clamp(0.5 - sd / (fl * 1.6 + 1), 0, 1); a = a * a * (3 - 2 * a);
      m = clamp(0.5 + sdRR(x + 0.5, y + 0.5, cx, cy, hw, hh, R) / 1.2, 0, 1);            // 1 outside the glass, 0 inside
      a = a * m * clamp(p.shadow * 1.2 / 100, 0, 1) * fade * 0.9;
      i = (y * BW + x) * 4; out[i] *= 1 - a; out[i + 1] *= 1 - a; out[i + 2] *= 1 - a;
    }
    // body: frosted blur + color, inside the glass
    blurred = HSR.blur(bg, Math.max(0.01, p.frost * 1.6 * s * 0.5), Math.max(0.01, p.frost * 1.6 * s * 0.5));
    // edge: magnified, wobbling, dispersed copy of the backdrop
    edgeImg = U.get();
    mag = 1 + p.lens / 100 * env.k; fRep = f / 30;
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      var u = (x + 0.5) / BW, v = (y + 0.5) / BH, du = (u - cx / BW) / mag, dv = (v - cy / BH) / mag, wob = p.wob * env.k * s * 0.9 / BW, n1 = HSR.fbm(x * 0.07, y * 0.07, fRep * 1.4, 2), n2 = HSR.fbm(x * 0.07 + 40, y * 0.07 + 9, fRep * 1.4, 2), sp = p.split * env.k * s * 0.5 / BW, uu, vv;
      uu = cx / BW + du + n1 * wob * 3; vv = cy / BH + dv + n2 * wob * 3;
      i = (y * BW + x) * 4;
      HSR._u.sample(bg, uu + sp, vv, tmp); edgeImg[i] = tmp[0];
      HSR._u.sample(bg, uu, vv, tmp); edgeImg[i + 1] = tmp[1];
      HSR._u.sample(bg, uu - sp * 1.3, vv, tmp); edgeImg[i + 2] = tmp[2]; edgeImg[i + 3] = 1;
    }
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      i = (y * BW + x) * 4;
      sd = sdRR(x + 0.5, y + 0.5, cx, cy, hw, hh, R);
      // body coverage (inset a little), ring coverage between the outer edge and t inside
      var body = clamp(0.5 - (sd + t * 0.3) / Math.max(1, t * 0.45), 0, 1), ring = clamp(0.5 - sd / Math.max(1, t * 0.5), 0, 1) * clamp(0.5 + (sd + t) / Math.max(1, t * 0.7), 0, 1);
      body *= fade; ring *= fade;
      var r0 = out[i], g0 = out[i + 1], b0 = out[i + 2], lum, r1, g1, b1, sat = 1 + p.sat / 100, li = p.lit / 100;
      r1 = blurred[i]; g1 = blurred[i + 1]; b1 = blurred[i + 2];
      lum = 0.299 * r1 + 0.587 * g1 + 0.114 * b1; r1 = lum + (r1 - lum) * sat; g1 = lum + (g1 - lum) * sat; b1 = lum + (b1 - lum) * sat;
      if (li > 0) { r1 += (1 - r1) * li; g1 += (1 - g1) * li; b1 += (1 - b1) * li; } else { r1 *= 1 + li; g1 *= 1 + li; b1 *= 1 + li; }
      out[i] = r0 + (r1 - r0) * body; out[i + 1] = g0 + (g1 - g0) * body; out[i + 2] = b0 + (b1 - b0) * body;
      var e0 = edgeImg[i] * 1.16, e1 = edgeImg[i + 1] * 1.16, e2 = edgeImg[i + 2] * 1.16;
      out[i] += (e0 - out[i]) * ring; out[i + 1] += (e1 - out[i + 1]) * ring; out[i + 2] += (e2 - out[i + 2]) * ring;
      var tint = clamp(0.5 - (sd + 1) / 1.5, 0, 1) * p.tint / 100 * fade;
      out[i] += (1 - out[i]) * tint; out[i + 1] += (1 - out[i + 1]) * tint; out[i + 2] += (1 - out[i + 2]) * tint;
    }
    U.put(blurred); U.put(edgeImg);
    return { buf: out, geo: { cx: cx / BW, cy: cy / BH, w: W / BW, h: H / BW, r: R / BW, fade: fade } };
  };
  root.HSR = HSR;
})(typeof window !== "undefined" ? window : global);
// ---- part 5b: scenes - "HYDRA STUDIO" text shots and a photo (the user's own, or a built-in landscape)
(function (root) {
  "use strict";
  var HSR = root.HSR, U = HSR._u, BW = HSR.dims.BW, BH = HSR.dims.BH, N = HSR.dims.N;
  var userImg = null, cache = { key: "", v: null };

  function mk() {
    var c = root.document.createElement("canvas"); c.width = BW; c.height = BH; return c;
  }
  function toBuf(c2d) {
    var d = c2d.getImageData(0, 0, BW, BH).data, b = U.newBuf(), i;
    for (i = 0; i < N * 4; i += 4) { b[i] = d[i] / 255; b[i + 1] = d[i + 1] / 255; b[i + 2] = d[i + 2] / 255; b[i + 3] = 1; }
    return b;
  }
  function fromBuf(c2d, buf) {
    var id = c2d.createImageData(BW, BH), i, d = id.data;
    for (i = 0; i < N * 4; i++) d[i] = Math.max(0, Math.min(255, Math.round(buf[i] * 255)));
    c2d.putImageData(id, 0, 0);
  }
  var FONT = "Outfit, 'Helvetica Neue', Arial, sans-serif";
  // luxury backdrop: near-black solid with one very soft, desaturated glow and a hint of grain
  function darkBase(accent, seed) {
    var c = mk(), x = c.getContext("2d"), hs = HSR.shotHue(accent), g, col;
    x.fillStyle = "#0b0b10"; x.fillRect(0, 0, BW, BH);
    col = U.hsl(hs, 0.34, 0.2);
    g = x.createRadialGradient(BW * (seed ? 0.72 : 0.28), BH * 0.2, 4, BW * 0.5, BH * 0.5, BW * 0.8);
    g.addColorStop(0, "rgba(" + Math.round(col[0] * 255) + "," + Math.round(col[1] * 255) + "," + Math.round(col[2] * 255) + ",0.55)");
    g.addColorStop(1, "rgba(11,11,16,0)");
    x.fillStyle = g; x.fillRect(0, 0, BW, BH);
    return c;
  }
  // words set in light Outfit capitals; the first letter of each word is larger ("HYDRA STUDIO" with a big H and S)
  function drawWords(x, words, cx, cy, big, small, track) {
    var parts = [], total = 0, i, j, w, ch, run, sp = small * 0.9;
    for (i = 0; i < words.length; i++) {
      for (j = 0; j < words[i].length; j++) {
        ch = words[i].charAt(j);
        x.font = (j === 0 ? "500 " + big : "300 " + small) + "px " + FONT;
        w = x.measureText(ch).width + track;
        parts.push({ ch: ch, w: w, px: j === 0 ? big : small }); total += w;
      }
      if (i < words.length - 1) { parts.push({ ch: " ", w: sp, px: small }); total += sp; }
    }
    run = cx - (total - track) / 2;
    x.textAlign = "left"; x.textBaseline = "alphabetic";
    for (i = 0; i < parts.length; i++) {
      x.font = (parts[i].px === big ? "500 " : "300 ") + parts[i].px + "px " + FONT;
      x.fillStyle = parts[i].px === big ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.8)";
      x.fillText(parts[i].ch, run, cy);
      run += parts[i].w;
    }
  }
  function textShot(seed, words, accent) {
    var c = darkBase(accent, seed), x = c.getContext("2d"), b;
    drawWords(x, words, BW / 2, BH / 2 + 14, 48, 29, 2.2);
    b = toBuf(x);
    var rr = U.rnd(40 + seed), i, n;
    for (i = 0; i < N * 4; i += 4) { n = (rr() - 0.5) * 0.02; b[i] += n; b[i + 1] += n; b[i + 2] += n; }
    return b;
  }
  // a built-in landscape: warm sky, low sun, ridges, still water - plenty of colour, highlight and fine detail
  function landscape() {
    var c = mk(), x = c.getContext("2d"), g, i, r = U.rnd(5), ridge, y0, j, px, py;
    g = x.createLinearGradient(0, 0, 0, BH * 0.62);
    g.addColorStop(0, "#27406e"); g.addColorStop(0.45, "#8a6aa8"); g.addColorStop(0.78, "#f0906a"); g.addColorStop(1, "#ffd08a");
    x.fillStyle = g; x.fillRect(0, 0, BW, BH);
    g = x.createRadialGradient(BW * 0.68, BH * 0.52, 2, BW * 0.68, BH * 0.52, BH * 0.5);
    g.addColorStop(0, "rgba(255,248,220,1)"); g.addColorStop(0.12, "rgba(255,226,160,0.9)"); g.addColorStop(0.5, "rgba(255,170,110,0.25)"); g.addColorStop(1, "rgba(255,140,90,0)");
    x.fillStyle = g; x.fillRect(0, 0, BW, BH);
    x.fillStyle = "rgba(255,246,214,1)"; x.beginPath(); x.arc(BW * 0.68, BH * 0.52, 7, 0, 6.283); x.fill();
    // clouds
    for (i = 0; i < 5; i++) { x.fillStyle = "rgba(255,190,170," + (0.12 + r() * 0.12) + ")"; x.beginPath(); x.ellipse(r() * BW, BH * (0.1 + r() * 0.28), 40 + r() * 40, 3 + r() * 4, 0, 0, 6.283); x.fill(); }
    // ridges, far to near
    var cols = ["#7a5a88", "#4d3d6a", "#2a2646"];
    for (j = 0; j < 3; j++) {
      x.fillStyle = cols[j]; x.beginPath(); y0 = BH * (0.5 + j * 0.07); x.moveTo(0, BH * 0.7);
      for (px = 0; px <= BW; px += 6) { py = y0 - (Math.sin(px * 0.035 + j * 2) * 9 + Math.sin(px * 0.011 + j) * 14 + Math.sin(px * 0.11 + j * 5) * 2.2) * (1 - j * 0.12); x.lineTo(px, py); }
      x.lineTo(BW, BH * 0.72); x.closePath(); x.fill();
    }
    // water with the sun's reflection
    g = x.createLinearGradient(0, BH * 0.68, 0, BH);
    g.addColorStop(0, "#e49a78"); g.addColorStop(0.35, "#6a5a86"); g.addColorStop(1, "#1d2142");
    x.fillStyle = g; x.fillRect(0, BH * 0.7, BW, BH * 0.3);
    for (i = 0; i < 46; i++) { var yy = BH * 0.7 + i * 1.9 + r() * 1.2, w = 6 + (i * 0.8) * r() + 2; x.fillStyle = "rgba(255,225,170," + Math.max(0.08, 0.6 - i * 0.012) + ")"; x.fillRect(BW * 0.68 - w / 2 + (r() - 0.5) * 8, yy, w, 1); }
    // a few trees in the foreground
    x.fillStyle = "#171630";
    for (i = 0; i < 9; i++) { var tx = 6 + i * 13 + r() * 6, th = 18 + r() * 24; x.beginPath(); x.moveTo(tx, BH * 0.74); x.lineTo(tx - 5, BH * 0.74); x.lineTo(tx - 0.5, BH * 0.74 - th); x.lineTo(tx + 0.5, BH * 0.74 - th); x.lineTo(tx + 5, BH * 0.74); x.fill(); }
    var b = toBuf(x), n, rr = U.rnd(99);
    for (i = 0; i < N * 4; i += 4) { n = (rr() - 0.5) * 0.05; b[i] += n; b[i + 1] += n; b[i + 2] += n; }
    return b;
  }
  function userShot(img) {
    var c = mk(), x = c.getContext("2d"), iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s, sw, sh;
    if (!iw || !ih) return null;
    s = Math.max(BW / iw, BH / ih); sw = iw * s; sh = ih * s;
    try { x.drawImage(img, (BW - sw) / 2, (BH - sh) / 2, sw, sh); return toBuf(x); } catch (e) { return null; }
  }
  // { a: HYDRA, b: STUDIO, c: HYDRA / STUDIO, photo }
  HSR.scenes = function (shots, accent) {
    var key = String(shots.key) + "|" + (userImg ? "u" : "b");
    if (cache.key === key && cache.v) return cache.v;
    var v = { a: null, b: null, c: null, photo: null };
    try { v.a = textShot(0, ["Hydra"], accent); v.b = textShot(1, ["Studio"], accent); v.c = textShot(0, ["Hydra", "Studio"], accent); } catch (e) {}
    v.photo = (userImg && userShot(userImg)) || null;
    if (!v.photo) { try { v.photo = landscape(); } catch (e2) {} }
    v.a = v.a || shots.a; v.b = v.b || shots.b; v.c = v.c || shots.a; v.photo = v.photo || shots.a;
    cache.key = key; cache.v = v;
    return v;
  };
  HSR.setPhoto = function (img) { userImg = img || null; cache.key = ""; };
  HSR.resetScenes = function () { cache.key = ""; };
})(typeof window !== "undefined" ? window : global);

// ---- part 5c: Pixel Scan - a pixelated wipe with a glowing, pixelated band at its leading edge (sketch of host.jsx's ops_pixelScan)
(function (root) {
  "use strict";
  var HSR = root.HSR, U = HSR._u, BW = HSR.dims.BW, BH = HSR.dims.BH, N = HSR.dims.N;
  var clamp = U.clamp, mix = U.mix;
  function hash(x, y, z) { var h = (x * 374761393 + y * 668265263 + (z | 0) * 1274126177) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vn(x, z) { var i = Math.floor(x), f = x - i, a = hash(i, 7, z), b = hash(i + 1, 7, z); f = f * f * (3 - 2 * f); return a + (b - a) * f; }
  function speedCurve(ease, u) {
    u = clamp(u, 0, 1);
    if (ease === "lin") return u;
    if (ease === "out") return 1 - Math.pow(1 - u, 2.2);
    return u * u * (3 - 2 * u);
  }
  // u: 0..1 progress of the sweep; base = the shot being wiped, next = the shot behind it
  HSR.pixscanFrame = function (p, u, base, next, k, frame) {
    var out = U.get(), dir = p.dir || "right", mode = p.mode || "out", vert = dir === "down" || dir === "up", rev = dir === "left" || dir === "up";
    var Lpx = vert ? BH : BW, S = BH / 1080;
    var bs = Math.max(2, Math.round((p.block || 24) * S * 1.5)), jit = (p.jit || 160) * S * Math.min(1.6, 0.6 + 0.4 * k), mm = (jit * 1.15 + bs * 3) / Lpx;
    var lagU = (p.lag || 0.07) / (p.dur || 1.2), pa = (p.pal && p.pal.a) || [0, 0.9, 1], pb = (p.pal && p.pal.b) || [1, 0.17, 0.84];
    var glowK = (p.glow || 1) * k, ease = p.ease || "io", fz = Math.floor(frame * 0.5);
    var e1 = mix(-mm, 1 + mm, speedCurve(ease, u)), e0 = mix(-mm, 1 + mm, speedCurve(ease, u - lagU));
    var cols = Math.ceil(BW / bs), rows = Math.ceil(BH / bs), nPerp = vert ? cols : rows, pj = [];
    var gx, gy, cxp, cyp, s, off, wiped, band, dist, S1, i, x, y, j, t, lit, r, g, b, gl, ar, ag, ab, ci, x1, y1, pr, pg, pbb;
    for (j = 0; j < nPerp; j++) pj.push(((vn(j * 0.33 + fz * 0.21, fz) - 0.5) * 1.5 + (hash(j, 3, fz) - 0.5) * 0.6) * jit / Lpx);
    var behind = mode === "out" ? next : base, ahead = mode === "out" ? base : (mode === "in" ? next : base);
    for (gy = 0; gy < rows; gy++) {
      for (gx = 0; gx < cols; gx++) {
        cxp = Math.min(BW - 1, gx * bs + (bs >> 1)); cyp = Math.min(BH - 1, gy * bs + (bs >> 1));
        s = vert ? (cyp + 0.5) / BH : (cxp + 0.5) / BW; if (rev) s = 1 - s;
        off = pj[vert ? gx : gy];
        wiped = s < e1 + off;                       // the front of the wipe has passed this cell
        band = wiped && s >= e0 + off;              // ... but the delayed copy has not yet: this is the scan band
        S1 = mode === "scan" ? base : (wiped ? behind : ahead);
        dist = wiped ? (s - (e0 + off)) : ((e1 + off) - s);
        t = clamp(s, 0, 1);
        pr = mix(pa[0], pb[0], t); pg = mix(pa[1], pb[1], t); pbb = mix(pa[2], pb[2], t);
        ar = 0; ag = 0; ab = 0;
        if (!band && dist > 0 && dist < 0.16) { gl = Math.exp(-dist * 22) * 0.34 * glowK; ar = pr * gl; ag = pg * gl; ab = pbb * gl; }
        ci = (cyp * BW + cxp) * 4;
        lit = 0.55 + 0.45 * hash(gx, gy, fz);
        x1 = Math.min(BW, gx * bs + bs); y1 = Math.min(BH, gy * bs + bs);
        for (y = gy * bs; y < y1; y++) {
          for (x = gx * bs; x < x1; x++) {
            j = (y * BW + x) * 4;
            if (band) {
              out[j] = S1[ci] * 1.18 + pr * lit * 0.85 * glowK; out[j + 1] = S1[ci + 1] * 1.18 + pg * lit * 0.85 * glowK; out[j + 2] = S1[ci + 2] * 1.18 + pbb * lit * 0.85 * glowK;
            } else {
              out[j] = S1[j] + ar; out[j + 1] = S1[j + 1] + ag; out[j + 2] = S1[j + 2] + ab;
            }
            out[j + 3] = 1;
          }
        }
      }
    }
    return out;
  };
})(typeof window !== "undefined" ? window : global);

// ---- part 6: the stage (canvas, loop, overlays, speed ramp scene)
(function (root) {
  "use strict";
  var HSR = root.HSR, U = HSR._u, BW = HSR.dims.BW, BH = HSR.dims.BH, N = HSR.dims.N, A = BW / BH;
  var clamp = U.clamp, mix = U.mix, smooth = U.smooth;
  var Stage = {};
  var cv = null, cx = null, off = null, offx = null, img = null, W = 0, H = 0, dpr = 1;
  var st = { r: null, pl: null, accent: "#ffd800", k: 1, slow: false, active: true, f: 0, hold: 0, raf: 0, last: 0, acc: 0, shots: null, cache: null, rampT: 0, glassBg: null, ba: 0 };
  var env = { k: 1, baseAt: null };

  // ---------- speed ramp model (the same smooth curve host.jsx uses) ----------
  function sm(x) { return x * x * (3 - 2 * x); }
  function speedAt(knots, u) {
    var i, a, b, x;
    if (u <= knots[0][0]) return knots[0][1];
    for (i = 1; i < knots.length; i++) if (u <= knots[i][0]) { a = knots[i - 1]; b = knots[i]; x = (u - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * sm(x); }
    return knots[knots.length - 1][1];
  }
  function rampModel(p, k) {
    var pre = 0.45, post = 0.45, dur = p.dur, T = pre + dur + post, n = 160, i, s, F = [0], t, kn = [], sp = [];
    for (i = 0; i < p.knots.length; i++) kn.push([p.knots[i][0], p.knots[i][1] > 0 ? Math.pow(p.knots[i][1], k) : 0]);
    for (i = 0; i <= n; i++) {
      t = i / n * T; s = (t < pre || t > pre + dur) ? 1 : speedAt(kn, (t - pre) / dur); sp.push(s);
      if (i) F.push(F[i - 1] + (sp[i] + sp[i - 1]) / 2 * (T / n));
    }
    return { T: T, pre: pre, dur: dur, n: n, sp: sp, F: F, knots: kn, max: Math.max(3.2, Math.max.apply(null, sp) * 1.1), zoom: p.zoom ? p.zoom * k / 100 : 0, zoomAt: p.zoomAt || 0.5 };
  }
  function atIdx(arr, n, T, t) { var x = clamp(t / T, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)); return arr[i] + (arr[i + 1] - arr[i]) * (x - i); }

  // ---------- sizing ----------
  function size() {
    var w = cv.clientWidth || 360, h = cv.clientHeight || 203;
    dpr = Math.min(2, root.devicePixelRatio || 1);
    W = Math.round(w * dpr); H = Math.round(h * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }

  // ---------- drawing helpers ----------
  function show(buf) {
    var d = img.data, i, k, v;
    for (i = 0; i < N; i++) {
      for (k = 0; k < 3; k++) { v = buf[i * 4 + k] + (1 - buf[i * 4 + 3]) * U.BG[k]; d[i * 4 + k] = v <= 0 ? 0 : (v >= 1 ? 255 : (v * 255 + 0.5) | 0); }
      d[i * 4 + 3] = 255;
    }
    offx.putImageData(img, 0, 0);
    cx.imageSmoothingEnabled = true;
    try { cx.imageSmoothingQuality = "high"; } catch (e) {}
    cx.drawImage(off, 0, 0, W, H);
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  }
  function rgba(c, a) { return "rgba(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + "," + a + ")"; }
  function font(px, w) { return (w || 600) + " " + Math.round(px * dpr) + "px Outfit, -apple-system, 'Segoe UI', system-ui, sans-serif"; }

  // thin strip at the bottom: the frames around the cut, the marker, the playhead
  function drawTimeline(pl, f) {
    var x0 = 14 * dpr, x1 = W - 14 * dpr, y = H - 13 * dpr, f0 = pl.f0, f1 = pl.f1, ac = U.parseColor(st.accent), px, fr, cutX, i, hh = 9 * dpr;
    cx.save();
    cx.fillStyle = "rgba(10,10,16,0.5)"; rr(cx, x0 - 8 * dpr, y - 9 * dpr, x1 - x0 + 16 * dpr, 20 * dpr, 10 * dpr); cx.fill();
    cx.strokeStyle = "rgba(255,255,255,0.22)"; cx.lineWidth = 1 * dpr;
    for (fr = Math.ceil(f0); fr <= f1; fr++) {
      px = x0 + (fr - f0) / (f1 - f0) * (x1 - x0); cx.beginPath(); cx.moveTo(px, y - (fr % 5 === 0 ? 3 : 2) * dpr); cx.lineTo(px, y + (fr % 5 === 0 ? 3 : 2) * dpr); cx.stroke();
    }
    // the layer span (what the adjustment layer covers)
    var a = pl.p.win[0], b = pl.p.win[1], sa = x0 + (Math.min(a, pl.lo) - f0) / (f1 - f0) * (x1 - x0), sb = x0 + (Math.max(b, pl.hi) + 1 - f0) / (f1 - f0) * (x1 - x0);
    cx.fillStyle = rgba(ac, 0.28); rr(cx, sa, y - 3.5 * dpr, sb - sa, 7 * dpr, 3.5 * dpr); cx.fill();
    // the one marker, on the cut / hit
    cutX = x0 + (0 - f0) / (f1 - f0) * (x1 - x0);
    cx.fillStyle = rgba(ac, 1);
    cx.beginPath(); cx.moveTo(cutX, y - hh * 0.55); cx.lineTo(cutX + hh * 0.5, y); cx.lineTo(cutX, y + hh * 0.55); cx.lineTo(cutX - hh * 0.5, y); cx.closePath(); cx.fill();
    // playhead
    px = x0 + (clamp(f, f0, f1) - f0) / (f1 - f0) * (x1 - x0);
    cx.strokeStyle = "rgba(255,255,255,0.95)"; cx.lineWidth = 1.6 * dpr; cx.beginPath(); cx.moveTo(px, y - 8 * dpr); cx.lineTo(px, y + 8 * dpr); cx.stroke();
    cx.restore();
  }
  function drawBA(cut, ac) {
    var x = cut * W;
    cx.save();
    cx.strokeStyle = "rgba(255,255,255,0.92)"; cx.lineWidth = 1.5 * dpr; cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke();
    cx.fillStyle = "rgba(255,255,255,0.96)"; cx.beginPath(); cx.arc(x, H / 2, 8 * dpr, 0, 6.2832); cx.fill();
    cx.fillStyle = "rgba(20,20,30,0.85)"; cx.beginPath(); cx.moveTo(x - 2.8 * dpr, H / 2 - 3.2 * dpr); cx.lineTo(x - 5 * dpr, H / 2); cx.lineTo(x - 2.8 * dpr, H / 2 + 3.2 * dpr); cx.closePath(); cx.fill();
    cx.beginPath(); cx.moveTo(x + 2.8 * dpr, H / 2 - 3.2 * dpr); cx.lineTo(x + 5 * dpr, H / 2); cx.lineTo(x + 2.8 * dpr, H / 2 + 3.2 * dpr); cx.closePath(); cx.fill();
    cx.restore();
  }

  // ---------- glass rim (crisp vectors on top of the low-res render) ----------
  function drawRim(p, geo, f) {
    var x, y, w, h, r, s, c, perim, tl, br, len, a;
    if (!geo) return;
    w = geo.w * W; h = geo.h * W; r = geo.r * W; x = geo.cx * W - w / 2; y = geo.cy * H - h / 2; a = geo.fade;
    perim = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
    cx.save();
    cx.lineJoin = "round";
    cx.shadowColor = "rgba(255,255,255," + (0.5 * a) + ")"; cx.shadowBlur = 9 * dpr;
    cx.strokeStyle = "rgba(255,255,255," + (p.rim / 100 * a * 0.9) + ")"; cx.lineWidth = Math.max(1, p.rimW * W / 1920 * 2.2);
    rr(cx, x, y, w, h, r); cx.stroke();
    cx.shadowBlur = 5 * dpr;
    // two shine arcs: top-left corner, and a dimmer one bottom-right (dash pattern along the outline)
    function arc(centerFrac, lenFrac, alpha, wd) {
      var start = (centerFrac - lenFrac / 2) * perim, L = lenFrac * perim;
      cx.setLineDash([L, perim]); cx.lineDashOffset = -start;
      cx.strokeStyle = "rgba(255,255,255," + (alpha * a) + ")"; cx.lineWidth = wd;
      // the outline is drawn from the top-left going clockwise: start the path at the top edge's left end, like host.jsx
      rr2(x, y, w, h, r); cx.stroke();
    }
    function rr2(x0, y0, w0, h0, r0) {
      cx.beginPath(); cx.moveTo(x0 + r0, y0); cx.lineTo(x0 + w0 - r0, y0); cx.arc(x0 + w0 - r0, y0 + r0, r0, -Math.PI / 2, 0); cx.lineTo(x0 + w0, y0 + h0 - r0); cx.arc(x0 + w0 - r0, y0 + h0 - r0, r0, 0, Math.PI / 2);
      cx.lineTo(x0 + r0, y0 + h0); cx.arc(x0 + r0, y0 + h0 - r0, r0, Math.PI / 2, Math.PI); cx.lineTo(x0, y0 + r0); cx.arc(x0 + r0, y0 + r0, r0, Math.PI, Math.PI * 1.5); cx.closePath();
    }
    tl = 1 - (Math.PI * r / 4) / perim; br = ((w - 2 * r) + Math.PI * r / 2 + (h - 2 * r) + Math.PI * r / 4) / perim;
    arc(tl, 0.15, p.shine / 100 * 0.95, Math.max(1.2, p.shineW * W / 1920 * 2.6));
    arc(br, 0.10, p.shine / 100 * 0.55, Math.max(1.2, p.shineW * W / 1920 * 2.6));
    cx.setLineDash([]);
    cx.restore();
  }

  // ---------- the speed ramp scene ----------
  function drawRamp(m, t, ac, bgBuf) {
    var pad = 14 * dpr, i, k, s, Fc, Ftot, F0, x, cr, zoomV = 1, tl, px, py, ang, u;
    var tx0 = pad + 24 * dpr, tx1 = W - pad - 24 * dpr, trackY = H * 0.2;
    var panY = H * 0.4, panH = H - panY - pad, gap = 8 * dpr, laneH = (panH - gap - 16 * dpr) / 2;
    var gx0 = pad + 8 * dpr, gx1 = W - pad - 8 * dpr;
    var lane1 = panY + 8 * dpr, lane2 = lane1 + laneH + gap + 8 * dpr;
    var white = [1, 1, 1];
    s = atIdx(m.sp, m.n, m.T, t);
    F0 = m.F[0]; Ftot = m.F[m.n] - F0;
    Fc = (atIdx(m.F, m.n, m.T, t) - F0) / Ftot;
    u = (t - m.pre) / m.dur;
    if (m.zoom && u > 0 && u < 1) zoomV = 1 + m.zoom * (u < m.zoomAt ? sm(u / m.zoomAt) : sm((1 - u) / (1 - m.zoomAt)));

    // dim the backdrop further so the graphs read
    cx.save();
    cx.fillStyle = "rgba(8,7,18,0.5)"; cx.fillRect(0, 0, W, H);

    // ---- the shape: one rounded square, its stroke is the speed (dashes run with it, thick + glowing when slow, solid at a freeze)
    cx.strokeStyle = "rgba(255,255,255,0.12)"; cx.lineWidth = 1 * dpr; cx.setLineDash([2 * dpr, 6 * dpr]);
    cx.beginPath(); cx.moveTo(tx0, trackY); cx.lineTo(tx1, trackY); cx.stroke(); cx.setLineDash([]);
    cr = 17 * dpr * zoomV; x = tx0 + Fc * (tx1 - tx0);
    tl = clamp((s - 1) * 16 * dpr, 0, 70 * dpr);
    if (s > 1.05) for (k = 1; k <= 6; k++) { cx.fillStyle = rgba(ac, 0.2 * (1 - k / 7)); rr(cx, x - tl * k / 6 - cr, trackY - cr, cr * 2, cr * 2, cr * 0.5); cx.fill(); }
    cx.shadowColor = rgba(ac, s < 0.4 ? 0.8 : 0.35); cx.shadowBlur = (s < 0.4 ? 18 : 7) * dpr;
    cx.fillStyle = "rgba(255,255,255,0.1)"; rr(cx, x - cr, trackY - cr, cr * 2, cr * 2, cr * 0.5); cx.fill();
    cx.lineWidth = (2 + clamp(1 - s, 0, 1) * 3.6) * dpr;
    cx.strokeStyle = s < 0.06 ? "rgba(255,255,255,0.98)" : rgba([mix(ac[0], 1, 0.15), mix(ac[1], 1, 0.15), mix(ac[2], 1, 0.15)], 0.96);
    if (s >= 0.06) { var per = (cr * 8 - 8 * cr * 0.5 * (2 - Math.PI / 2)), dash = per / 12; cx.setLineDash([dash * 0.62, dash * 0.38]); cx.lineDashOffset = -Fc * 160 * dpr; }
    rr(cx, x - cr, trackY - cr, cr * 2, cr * 2, cr * 0.5); cx.stroke(); cx.setLineDash([]); cx.shadowBlur = 0;
    // ---- graph panel
    cx.fillStyle = "rgba(10,10,20,0.55)"; rr(cx, pad, panY, W - pad * 2, panH, 12 * dpr); cx.fill();
    var xT = function (tt) { return gx0 + tt / m.T * (gx1 - gx0); };
    var xK = function (kk) { return xT(m.pre + kk * m.dur); };
    function label(txt, x0, y0, al, a) { cx.font = font(9, 600); cx.fillStyle = "rgba(255,255,255," + (a || 0.55) + ")"; cx.textAlign = al || "left"; cx.textBaseline = "top"; cx.fillText(txt, x0, y0); }
    function cursor(y0, h0, py0) {
      px = xT(t); cx.strokeStyle = "rgba(255,255,255,0.85)"; cx.lineWidth = 1.2 * dpr; cx.beginPath(); cx.moveTo(px, y0); cx.lineTo(px, y0 + h0); cx.stroke();
      cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(px, py0, 3.4 * dpr, 0, 6.2832); cx.fill();
    }
    function dot(px0, py0) { cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(px0, py0, 2.6 * dpr, 0, 6.2832); cx.fill(); cx.strokeStyle = rgba(ac, 1); cx.lineWidth = 1.5 * dpr; cx.stroke(); }
    // lane 1: speed (area + curve), keyframes with their values
    var yS = function (v) { return lane1 + laneH - (v / m.max) * (laneH - 10 * dpr) - 1 * dpr; };
    label("SPEED", gx0, lane1 - 4 * dpr);
    cx.font = font(14, 700); cx.fillStyle = "rgba(255,255,255,0.96)"; cx.textAlign = "right"; cx.textBaseline = "top";
    cx.fillText((s < 0.005 ? "0.00" : s.toFixed(2)) + "×", gx1, lane1 - 6 * dpr);
    cx.strokeStyle = "rgba(255,255,255,0.22)"; cx.lineWidth = 1 * dpr; cx.setLineDash([3 * dpr, 4 * dpr]); cx.beginPath(); cx.moveTo(gx0, yS(1)); cx.lineTo(gx1, yS(1)); cx.stroke(); cx.setLineDash([]);
    label("1×", gx1, yS(1) - 11 * dpr, "right", 0.4);
    cx.beginPath(); cx.moveTo(xT(0), yS(0));
    for (i = 0; i <= m.n; i++) cx.lineTo(xT(i / m.n * m.T), yS(m.sp[i]));
    cx.lineTo(xT(m.T), yS(0)); cx.closePath(); cx.fillStyle = rgba(ac, 0.22); cx.fill();
    cx.beginPath(); for (i = 0; i <= m.n; i++) { px = xT(i / m.n * m.T); py = yS(m.sp[i]); if (i) cx.lineTo(px, py); else cx.moveTo(px, py); }
    cx.strokeStyle = rgba(ac, 1); cx.lineWidth = 2 * dpr; cx.lineJoin = "round"; cx.stroke();
    var lastLab = -1e9;
    for (i = 0; i < m.knots.length; i++) {
      px = xK(m.knots[i][0]); py = yS(m.knots[i][1]); dot(px, py);
      if (i > 0 && i < m.knots.length - 1 && px - lastLab > 30 * dpr) { var vv = m.knots[i][1]; label((vv < 0.005 ? "0" : vv.toFixed(vv < 1 ? 2 : 1)) + "×", px, vv > 1.2 ? py - 12 * dpr : py + 5 * dpr, "center", 0.8); lastLab = px; }
    }
    cursor(lane1, laneH, yS(s));

    // lane 2: position (footage time) - and the zoom keys when the preset pushes in
    var bot = lane2 + laneH;
    cx.strokeStyle = "rgba(255,255,255,0.08)"; cx.lineWidth = 1 * dpr; cx.beginPath(); cx.moveTo(gx0, lane2 - 4 * dpr); cx.lineTo(gx1, lane2 - 4 * dpr); cx.stroke();
    var yP = function (f01) { return bot - 3 * dpr - f01 * (laneH - 12 * dpr); };
    if (m.zoom) {
      label("ZOOM", gx0, lane2 - 1 * dpr);
      var zmax = 1 + m.zoom, yZ = function (z) { return bot - 3 * dpr - ((z - 1) / m.zoom) * (laneH - 14 * dpr); };
      cx.strokeStyle = "rgba(255,255,255,0.2)"; cx.lineWidth = 1 * dpr; cx.setLineDash([3 * dpr, 4 * dpr]); cx.beginPath(); cx.moveTo(gx0, yZ(1)); cx.lineTo(gx1, yZ(1)); cx.stroke(); cx.setLineDash([]);
      cx.beginPath();
      for (i = 0; i <= 80; i++) { var tt = i / 80 * m.T, uu = (tt - m.pre) / m.dur, zz = 1; if (uu > 0 && uu < 1) zz = 1 + m.zoom * (uu < m.zoomAt ? sm(uu / m.zoomAt) : sm((1 - uu) / (1 - m.zoomAt))); px = xT(tt); py = yZ(zz); if (i) cx.lineTo(px, py); else cx.moveTo(px, py); }
      cx.strokeStyle = "rgba(255,255,255,0.92)"; cx.lineWidth = 2 * dpr; cx.stroke();
      dot(xK(0), yZ(1)); dot(xK(m.zoomAt), yZ(zmax)); dot(xK(1), yZ(1));
      label("100%", xK(0) - 4 * dpr, yZ(1) - 11 * dpr, "right", 0.7);
      label(Math.round(zmax * 100) + "%", xK(m.zoomAt), yZ(zmax) - 11 * dpr, "center", 0.85);
      cursor(lane2, laneH, yZ(zoomV));
    } else {
      label("POSITION", gx0, lane2 - 1 * dpr);
      cx.strokeStyle = "rgba(255,255,255,0.18)"; cx.lineWidth = 1 * dpr; cx.setLineDash([3 * dpr, 4 * dpr]); cx.beginPath(); cx.moveTo(xT(0), yP(0)); cx.lineTo(xT(m.T), yP(1)); cx.stroke(); cx.setLineDash([]);
      cx.beginPath(); for (i = 0; i <= m.n; i++) { px = xT(i / m.n * m.T); py = yP((m.F[i] - F0) / Ftot); if (i) cx.lineTo(px, py); else cx.moveTo(px, py); }
      cx.strokeStyle = "rgba(255,255,255,0.92)"; cx.lineWidth = 2 * dpr; cx.stroke();
      for (i = 0; i < m.knots.length; i++) { var kt = m.pre + m.knots[i][0] * m.dur; dot(xT(kt), yP((atIdx(m.F, m.n, m.T, kt) - F0) / Ftot)); }
      cursor(lane2, laneH, yP(Fc));
    }
    cx.restore();
  }

  // ---------- one frame ----------
  function glassWorld() { return null; }
  function renderFrame() {
    var r = st.r, pl = st.pl, f = st.f, buf, g, bgb, ac;
    if (!r || !cx) return;
    ac = U.parseColor(st.accent);
    env.k = st.k;
    if (r.kind === "stack") {
      if (st.cache && st.cache.ok) { show(st.cache.after); drawCached(); return; }
      buf = HSR.frameOf(pl, f, env);
      show(buf); U.put(buf);
      if (pl.span !== "auto") drawTimeline(pl, f);
    } else if (r.kind === "glass") {
      bgb = HSR.glassBackdrop(st.shots, f + 30, st.accent);
      g = HSR.glassFrame(r.p, f, bgb, env);
      show(g.buf); U.put(g.buf); U.put(bgb);
      drawRim(r.p, g.geo, f);
    } else if (r.kind === "pixscan") {
      var pp = r.p, uu = clamp((f - 8) / Math.max(4, (pp.dur || 1.2) * 30), 0, 1), sc2 = HSR.scenes(st.shots, st.accent);
      buf = HSR.pixscanFrame(pp, uu, sc2.photo, sc2.b, st.k, f);
      show(buf); U.put(buf);
    } else if (r.kind === "ramp") {
      var m = st.ramp, t = ((f % (m.T * 30 + 16)) / 30);
      bgb = U.copy(HSR.scenes(st.shots, st.accent).c); for (var i = 0; i < N * 4; i += 4) { bgb[i] *= 0.55; bgb[i + 1] *= 0.55; bgb[i + 2] *= 0.55; }
      show(bgb); U.put(bgb);
      drawRamp(m, clamp(t, 0, m.T), ac);
    }
  }
  function drawCached() {
    var c = st.cache, ac = U.parseColor(st.accent), x;
    if (c.before) {
      // before | after split, the divider glides slowly
      x = 0.5 + 0.28 * Math.sin(st.ba);
      var d = img.data, i, k, v, xs = Math.round(x * BW);
      for (i = 0; i < N; i++) {
        var px = i % BW;
        for (k = 0; k < 3; k++) { var b = px < xs ? c.before : c.after; v = b[i * 4 + k] + (1 - b[i * 4 + 3]) * U.BG[k]; d[i * 4 + k] = v <= 0 ? 0 : (v >= 1 ? 255 : (v * 255 + 0.5) | 0); }
        d[i * 4 + 3] = 255;
      }
      offx.putImageData(img, 0, 0); cx.imageSmoothingEnabled = true; cx.drawImage(off, 0, 0, W, H);
      drawBA(x, ac);
    }
  }

  // ---------- loop ----------
  function plan(r) {
    st.cache = null; st.glassBg = null; st.ramp = null; st.pl = null;
    if (r.kind === "stack") {
      var copy = JSON.parse(JSON.stringify(r)); st.pl = HSR.prep(copy); st.r = copy;
      var sh = st.shots, p = st.pl.p, cat = r.cat, sc = HSR.scenes(sh, st.accent);
      var photoCat = cat === "Clarity" || cat === "Light" || cat === "Color" || cat === "Flash & Glitch" || cat === "Blur & Glow";
      env.baseAt = function (f) {
        if (photoCat) return sc.photo;
        if (p.span === "cut") return f < 0 ? sc.a : sc.b;
        return sc.c;
      };
      st.f = st.pl.f0;
      var dyn = p.span !== "auto" || p.fx.some(function (e) { return e.k || e.wg || e.pul; }) || (p.under || []).some(function (u) { return u.fx.some(function (e) { return e.k; }); }) || p.lopk;
      if (!dyn) { st.needCache = true; }
    } else if (r.kind === "glass") { st.r = r; st.f = -8; }
    else if (r.kind === "pixscan") { st.r = r; st.f = 0; }
    else if (r.kind === "ramp") { st.r = r; st.ramp = rampModel(r.p, st.k); st.f = 0; }
  }
  function ensureCache() {
    if (!st.needCache || !st.pl) return;
    var pl = st.pl, f = pl.f0, a, b;
    env.k = st.k;
    a = HSR.frameOf(pl, f, env);
    if (pl.r.p.ba) { var base = env.baseAt(f); b = U.copy(base); st.cache = { ok: true, before: b, after: a }; }
    else st.cache = { ok: true, before: null, after: a };
    st.needCache = false;
  }
  function tick(now) {
    var dt, steps, pl, end;
    st.raf = 0;
    if (!st.active || !cv || !st.r) return;
    if (!st.last) st.last = now;
    dt = Math.min(100, now - st.last); st.last = now;
    if (st.r.kind === "ramp") {
      st.f += (st.slow ? 0.25 : 1) * dt * 0.03;
      try { renderFrame(); } catch (e) { if (root.console) console.error("stage:", e); }
      st.raf = root.requestAnimationFrame(tick);
      return;
    }
    st.acc += dt;
    if (st.acc >= 33) {
      var step = (st.slow ? 0.25 : 1) * (st.acc / 33.333); st.acc = 0;
      st.ba += 0.012 * (st.slow ? 0.5 : 1) * 2;
      if (st.r.kind === "stack") {
        pl = st.pl; end = pl.f1;
        if (st.hold > 0) st.hold -= step; else { st.f += step; if (st.f > end) { st.f = pl.f0; st.hold = 0; } else if (st.f >= end - 0.01) st.hold = 14; }
        if (st.needCache) ensureCache();
      } else if (st.r.kind === "pixscan") {
        st.f += step; if (st.f > (st.r.p.dur || 1.2) * 30 + 8 + 34) st.f = 0;
      } else if (st.r.kind === "glass") {
        st.f += step; if (st.f > 118) st.f = -10;
      } else if (st.r.kind === "ramp") {
        st.f += step;
      }
      try { renderFrame(); } catch (e) { if (root.console) console.error("stage:", e); }
    }
    st.raf = root.requestAnimationFrame(tick);
  }
  function kick() { if (!st.raf && st.active) { st.last = 0; st.raf = root.requestAnimationFrame(tick); } }

  Stage.init = function (canvas) {
    cv = canvas; cx = cv.getContext("2d");
    off = document.createElement("canvas"); off.width = BW; off.height = BH; offx = off.getContext("2d"); img = offx.createImageData(BW, BH);
    st.shots = HSR.makeShots(st.accent); addC();
    size();
    if (root.ResizeObserver) { try { new root.ResizeObserver(function () { size(); if (!st.raf) renderOnce(); }).observe(cv); } catch (e) {} }
    else root.addEventListener("resize", function () { size(); renderOnce(); });
  };
  function addC() {
    var sh = st.shots, i, x, y, c, r = U.rnd(77);
    if (sh.c) return;
    // a third shot for sharpen / clarity: the same gradient with fine, low-contrast detail (hatching and grain)
    c = U.copy(sh.a);
    for (y = 0; y < BH; y++) for (x = 0; x < BW; x++) {
      var d = (Math.sin((x * 0.9 + y * 0.55) * 1.7) * 0.5 + Math.sin((x * 0.5 - y * 0.8) * 2.3) * 0.5) * 0.035 + (r() - 0.5) * 0.06;
      i = (y * BW + x) * 4; c[i] += d; c[i + 1] += d; c[i + 2] += d;
    }
    sh.c = c;
  }
  function renderOnce() { try { renderFrame(); } catch (e) {} }
  Stage.setFx = function (r) {
    if (!cv || !r) return;
    st.shots = HSR.makeShots(st.accent); addC();
    plan(r); st.hold = 0; st.acc = 0; size();
    if (st.needCache) ensureCache();
    st.last = 0; renderOnce(); kick();
  };
  Stage.clear = function () { st.r = null; st.pl = null; if (cx) cx.clearRect(0, 0, W, H); };
  Stage.setAccent = function (c) {
    st.accent = c; var old = st.shots.key; st.shots = HSR.makeShots(c); st.shots.c = null; addC();
    if (st.r) { var r = st.r; plan(r); if (st.needCache) ensureCache(); renderOnce(); }
  };
  Stage.setPower = function (k) { st.k = k; if (st.r) { if (st.r.kind === "ramp") st.ramp = rampModel(st.r.p, k); if (st.pl) { st.needCache = true; ensureCache(); } renderOnce(); } };
  Stage.setPhoto = function (img) { HSR.setPhoto(img); if (st.r) { var r = st.r; plan(r); if (st.needCache) ensureCache(); renderOnce(); } };
  Stage.rescene = function () { HSR.resetScenes(); if (st.r) { var r = st.r; plan(r); if (st.needCache) ensureCache(); renderOnce(); } };
  Stage.setSlow = function (b) { st.slow = !!b; };
  Stage.setActive = function (b) { st.active = !!b; if (b) kick(); };
  Stage.current = function () { return st.r; };
  root.Stage = Stage;
})(typeof window !== "undefined" ? window : global);
