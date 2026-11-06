// Hydra Studio - effect catalog (v0.7)
//
// One description drives both After Effects (host.jsx builds real effects from it) and the preview in the panel.
// Nothing here is a render: the preview just plays the same keyframes.
//
// kind "stack"  : an adjustment layer (or the selected layers) with a list of native effects.
//   p.win   [before, after]  frames around the cut / hit (a 30 fps feel, host rescales for other frame rates)
//   p.span  "cut"  the layer is placed around the cut (playhead, or the join of two selected clips) + one marker on the cut
//           "hit"  the layer starts at the playhead (a beat) + one marker
//           "auto" the layer covers the selected layers (continuous looks)
//   p.fx    [{ t: effect type, n: layer-effect name, s: {static values}, k: {keyframes}, pw: {intensity rules} }]
//           keyframes are [frame, value, ease]; frame is a number (0 = the cut) or "i" / "o" (in / out point of the span)
//           ease: L linear, H hold, E easy ease (E80 or E25,80 = in,out influence), S smooth-through (speed from the neighbours)
//           positions are fractions of the frame, [0.5, 0.5] = center; lengths ("px") are for a 1080 px tall frame
//   p.blend / p.lop  blend mode and opacity of the layer, p.lopk keyed opacity of the layer ([frame, %, ease] keys),
//   p.mask  { shape: rect | ellipse, inv, feather (x frame height), size [w, h] (x frame), c: [x, y] or keys }, p.ba  show a before / after wipe in the preview
//   p.under [{ n, mask, fx }]  extra adjustment layers below the main one (a masked invert bar, a vignette ...)
//   e.wg { f, a, r, o, y }  wiggle (hand-held sway), e.pul { key: [beats per second, amount, decay, base] }  beat pulse - the two endless looks
// kind "glass"  : liquid glass built from shape layers, masks and native effects
// kind "ramp"   : speed ramp on a video layer (time remapping)
// kind "pixscan": pixelated wipe + glowing scan band (p: mode out|in|scan, dir, pal {a, b}, dur, lag, block, jit, glow, ease lin|io|out)
(function () {
  "use strict";
  var HS = window.HS = window.HS || {};

  HS.CATS = ["Transitions", "Effects", "Shake", "Punch", "Flash & Glitch", "Blur & Glow", "Color", "Light", "Clarity"];

  // ---- helpers
  function R(id, cat, name, sub, icon, kind, p, extra) {
    var o = { id: id, cat: cat, name: name, sub: sub, icon: icon, kind: kind, p: p }, k;
    if (extra) for (k in extra) if (extra.hasOwnProperty(k)) o[k] = extra[k];
    return o;
  }
  function stack(id, cat, name, sub, icon, span, win, fx, more) {
    var p = { win: win, span: span, marker: span !== "auto", fx: fx }, k;
    if (more) for (k in more) if (more.hasOwnProperty(k)) p[k] = more[k];
    return R(id, cat, name, sub, icon, "stack", p);
  }
  var CEN = [0.5, 0.5];

  // a slide: the picture travels (dx, dy) frame-widths before the cut and the same distance after it,
  // so the cut lands at full speed, hidden in the blur, and the new shot arrives from the other side.
  function slide(dx, dy) {
    return [[-4, CEN, "E25,80"], [0, [0.5 + dx, 0.5 + dy], "S45"], [4, [0.5 + 2 * dx, 0.5 + 2 * dy], "E80,25"]];
  }
  function whip(dx, dy, ang, more) {
    var fx = [
      { t: "tile", n: "Slide", s: { ow: 300, oh: 300 }, k: { c: slide(dx, dy) } },
      { t: "dblur", n: "Motion Blur", s: { ang: ang }, k: { len: [[-4, 0, "E"], [-1, 250, "S40"], [0, 380, "S40"], [1, 250, "S40"], [4, 0, "E"]] }, pw: { len: 0 } },
      { t: "expo", n: "Hit Light", k: { ev: [[-2, 0, "L"], [0, 0.5, "E15"], [2, 0, "L"]] }, pw: { ev: 0 } }
    ];
    if (more) fx = fx.concat(more);
    return fx;
  }
  // deterministic random jitter, one new point per frame, scaled by an envelope (what a twitch / S-shake does)
  function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  function sinEnv(a, b, pw) { return function (f) { var x = (f - a) / (b - a); return x <= 0 || x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), pw || 1.4); }; }
  function decayEnv(len) { return function (f) { return f < 0 || f > len ? 0 : Math.pow(1 - f / len, 1.6); }; }
  function twitch(a, b, amp, rotAmp, env, seed) {
    var r = rnd(seed), pos = [], rot = [], f, e, dx, dy, sx = 1, sy = 1;
    for (f = a; f <= b; f++) {
      e = env(f);
      // alternate the direction every frame so the motion always reads as a shake, never a drift
      sx = -sx; sy = r() < 0.5 ? -sy : sy;
      dx = sx * (0.45 + r() * 0.55) * amp * e;
      dy = sy * (0.35 + r() * 0.65) * amp * e * 0.85;
      pos.push([f, [Math.round((0.5 + dx) * 10000) / 10000, Math.round((0.5 + dy) * 10000) / 10000], "L"]);
      rot.push([f, Math.round(sx * (0.3 + r() * 0.7) * rotAmp * e * 100) / 100, "L"]);
    }
    return { pos: pos, rot: rot };
  }
  function envKeys(a, b, peak, env, step) {
    var out = [], f;
    for (f = a; f <= b; f += (step || 1)) out.push([f, Math.round(peak * env(f) * 100) / 100, "L"]);
    return out;
  }

  var FX = [];

  // ================================================================== TRANSITIONS
  var T = "Transitions";
  FX.push(stack("tr-whip-left", T, "Whip Left", "Fast pan, hits on the cut", "whip", "cut", [-4, 4], whip(-1, 0, 0)));
  FX.push(stack("tr-whip-right", T, "Whip Right", "Fast pan, hits on the cut", "whip", "cut", [-4, 4], whip(1, 0, 0)));
  FX.push(stack("tr-whip-up", T, "Whip Up", "Fast tilt, hits on the cut", "whip", "cut", [-4, 4], whip(0, -1, 90)));
  FX.push(stack("tr-whip-down", T, "Whip Down", "Fast tilt, hits on the cut", "whip", "cut", [-4, 4], whip(0, 1, 90)));
  FX.push(stack("tr-whip-diag", T, "Diagonal Whip", "Corner to corner", "whip", "cut", [-4, 4], whip(-1, -1, 45)));
  FX.push(stack("tr-prism", T, "Prism Whip", "Whip with a color split", "prism", "cut", [-4, 4], whip(-1, 0, 0, [
    { t: "chan", n: "Color Split", k: { r: [[-3, 0, "E"], [0, 34, "E15"], [3, 0, "E"]], b: [[-3, 0, "E"], [0, 52, "E15"], [3, 0, "E"]] }, pw: { r: 0, b: 0 } }
  ])));
  FX.push(stack("tr-echo", T, "Ghost Whip", "Slide that leaves a trail", "whip", "cut", [-4, 4], [
    { t: "tile", n: "Slide", s: { ow: 300, oh: 300 }, k: { c: slide(1, 0) } },
    { t: "echo", n: "Trail", s: { time: -0.035, int: 0.85, dec: 0.62, op: 2 }, k: { n: [[-4, 1, "L"], [-1, 4, "L"], [0, 7, "L"], [2, 3, "L"], [4, 1, "L"]] } },
    { t: "dblur", n: "Motion Blur", s: { ang: 0 }, k: { len: [[-4, 0, "E"], [0, 220, "S40"], [4, 0, "E"]] }, pw: { len: 0 } }
  ]));
  FX.push(stack("tr-zoom-in", T, "Zoom Punch", "Dive in, land on the next shot", "zoom", "cut", [-4, 5], [
    { t: "tf", n: "Zoom", s: { shut: 180 }, k: { sc: [[-4, 100, "E20,85"], [-1, 230, "S40"], [0, 430, "E8"], [1, 260, "S40"], [5, 100, "E85,20"]] }, pw: { sc: 100 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[-4, 0, "E"], [-1, 60, "S40"], [0, 100, "E8"], [1, 70, "S40"], [5, 0, "E"]] }, pw: { amt: 0 } },
    { t: "expo", n: "Hit Light", k: { ev: [[-1, 0, "L"], [0, 0.9, "E10"], [2, 0, "E"]] }, pw: { ev: 0 } }
  ]));
  FX.push(stack("tr-zoom-out", T, "Mirror Zoom Out", "Pulls back into mirrored tiles", "zoom", "cut", [-4, 5], [
    { t: "tile", n: "Mirror Fill", s: { ow: 400, oh: 400, mir: 1 } },
    { t: "tf", n: "Zoom", s: { shut: 180 }, k: { sc: [[-4, 100, "E20,85"], [-1, 62, "S40"], [0, 34, "E8"], [1, 58, "S40"], [5, 100, "E85,20"]] }, pw: { sc: 100 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[-4, 0, "E"], [-1, 50, "S40"], [0, 85, "E8"], [1, 55, "S40"], [5, 0, "E"]] }, pw: { amt: 0 } },
    { t: "expo", n: "Hit Light", k: { ev: [[-1, 0, "L"], [0, 0.7, "E10"], [2, 0, "E"]] }, pw: { ev: 0 } }
  ]));
  FX.push(stack("tr-shake", T, "Shake Cut", "Violent shake on the cut", "shake", "cut", [-3, 4], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Shake", s: { shut: 180 }, k: {
      pos: [[-3, CEN, "L"], [-2, [0.53, 0.49], "L"], [-1, [0.465, 0.522], "L"], [0, [0.56, 0.455], "L"], [1, [0.45, 0.545], "L"], [2, [0.52, 0.49], "L"], [3, [0.492, 0.507], "L"], [4, CEN, "L"]],
      rot: [[-3, 0, "L"], [-2, 1.2, "L"], [-1, -1.8, "L"], [0, 2.6, "L"], [1, -1.7, "L"], [2, 0.8, "L"], [3, -0.3, "L"], [4, 0, "L"]],
      sc: [[-3, 100, "E"], [0, 114, "E15"], [4, 100, "E"]] }, pw: { pos: CEN, rot: 0, sc: 100 } },
    { t: "dblur", n: "Motion Blur", s: { ang: 22 }, k: { len: [[-3, 0, "L"], [-1, 70, "L"], [0, 120, "L"], [1, 80, "L"], [3, 20, "L"], [4, 0, "L"]] }, pw: { len: 0 } },
    { t: "chan", n: "Color Split", k: { r: [[-1, 0, "L"], [0, 18, "L"], [2, 0, "L"]], b: [[-1, 0, "L"], [0, 26, "L"], [2, 0, "L"]] }, pw: { r: 0, b: 0 } },
    { t: "expo", n: "Hit Light", k: { ev: [[-1, 0, "L"], [0, 0.7, "L"], [1, 0, "L"]] }, pw: { ev: 0 } }
  ]));
  FX.push(stack("tr-spin", T, "Spin Roll", "Full roll with spin blur", "spin", "cut", [-5, 5], [
    { t: "tile", n: "Mirror Fill", s: { ow: 300, oh: 300, mir: 1 } },
    { t: "tf", n: "Roll", s: { shut: 180 }, k: { rot: [[-5, 0, "E25,80"], [0, 180, "S45"], [5, 360, "E80,25"]], sc: [[-5, 100, "E"], [0, 135, "E15"], [5, 100, "E"]] }, pw: { sc: 100 } },
    { t: "sblur", n: "Spin Blur", s: { type: 1 }, k: { amt: [[-5, 0, "E"], [-1, 70, "S40"], [0, 100, "E10"], [1, 70, "S40"], [5, 0, "E"]] }, pw: { amt: 0 } }
  ]));
  FX.push(stack("tr-stretch", T, "Stretch Hit", "Squash and stretch through the cut", "stretch", "cut", [-4, 4], [
    { t: "tile", n: "Mirror Fill", s: { ow: 300, oh: 300, mir: 1 } },
    { t: "tf", n: "Stretch", s: { uni: 0, shut: 180 }, k: {
      sh: [[-4, 100, "E20,85"], [-1, 190, "S40"], [0, 330, "E8"], [1, 190, "S40"], [4, 100, "E85,20"]],
      sw: [[-4, 100, "E20,85"], [0, 52, "E10"], [4, 100, "E85,20"]] }, pw: { sh: 100, sw: 100 } },
    { t: "dblur", n: "Motion Blur", s: { ang: 90 }, k: { len: [[-4, 0, "E"], [0, 160, "E12"], [4, 0, "E"]] }, pw: { len: 0 } }
  ]));
  FX.push(stack("tr-fisheye", T, "Fisheye Pop", "Lens bulges as the shot changes", "lens", "cut", [-3, 4], [
    { t: "bul", n: "Lens", s: { rx: 900, ry: 900 }, k: { h: [[-3, 0, "E"], [-1, 0.9, "S40"], [0, 2.4, "E8"], [1, 1.0, "S40"], [4, 0, "E"]] }, pw: { h: 0 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[-3, 0, "E"], [0, 45, "E10"], [4, 0, "E"]] }, pw: { amt: 0 } },
    { t: "expo", n: "Hit Light", k: { ev: [[-1, 0, "L"], [0, 0.6, "E10"], [2, 0, "L"]] }, pw: { ev: 0 } }
  ]));
  FX.push(stack("tr-flash", T, "Flash Cut", "White flash, two frames", "bolt", "cut", [-2, 4], [
    { t: "tf", n: "Pop", s: { shut: 180 }, k: { sc: [[-2, 100, "L"], [0, 108, "E10"], [4, 100, "E"]] }, pw: { sc: 100 } },
    { t: "expo", n: "Flash", k: { ev: [[-2, 0, "L"], [-1, 1.8, "L"], [0, 5, "L"], [1, 2.2, "L"], [4, 0, "E80,25"]] }, pw: { ev: 0 } },
    { t: "glow", n: "Bloom", s: { thr: 55, rad: 60 }, k: { int: [[-1, 0, "L"], [0, 1.4, "L"], [3, 0, "E"]] }, pw: { int: 0 } }
  ]));
  FX.push(stack("tr-burn", T, "Film Burn", "Warm light burns through the cut", "burn", "cut", [-5, 8], [
    { t: "ramp", n: "Burn Color", s: { a: [0, 0.1], ac: [1, 0.42, 0.04], b: [1, 0.9], bc: [0.95, 0.08, 0.28], shape: 1 }, k: { bl: [[-5, 100, "L"], [-1, 55, "E"], [0, 8, "E10"], [2, 40, "E"], [8, 100, "E"]] }, pw: { bl: 100 } },
    { t: "expo", n: "Burn Light", k: { ev: [[-3, 0, "E"], [0, 1.7, "E10"], [4, 0.25, "E"], [8, 0, "E"]] }, pw: { ev: 0 } },
    { t: "glow", n: "Bloom", s: { thr: 45, rad: 80, int: 0.9 } },
    { t: "tf", n: "Breath", k: { sc: [[-5, 100, "E"], [0, 108, "E"], [8, 100, "E"]] }, pw: { sc: 100 } }
  ]));
  FX.push(stack("tr-strobe", T, "Strobe Cut", "Negative flicker on the cut", "strobe", "cut", [-3, 5], [
    { t: "inv", n: "Negative", k: { bl: [[-2, 100, "H"], [-1, 0, "H"], [0, 100, "H"], [1, 0, "H"], [2, 100, "H"], [3, 0, "H"], [4, 100, "H"]] } },
    { t: "expo", n: "Flicker", k: { ev: [[-2, 0, "H"], [-1, 0.9, "H"], [0, 1.6, "H"], [1, 0.6, "H"], [2, 0, "H"]] }, pw: { ev: 0 } },
    { t: "post", n: "Stutter", s: { fps: 15 } }
  ]));
  FX.push(stack("tr-glitch", T, "Glitch Cut", "Digital tear with a color split", "glitch", "cut", [-3, 4], [
    { t: "post", n: "Stutter", s: { fps: 12 } },
    { t: "td", n: "Tear", s: { type: 8, size: 38, cx: 1 }, k: {
      amt: [[-3, 0, "H"], [-2, 110, "H"], [-1, 30, "H"], [0, 280, "H"], [1, 80, "H"], [2, 150, "H"], [3, 20, "H"], [4, 0, "H"]],
      evo: [[-3, 0, "H"], [-2, 140, "H"], [-1, 260, "H"], [0, 30, "H"], [1, 200, "H"], [2, 90, "H"], [3, 320, "H"]] }, pw: { amt: 0 } },
    { t: "chan", n: "Color Split", k: { r: [[-2, 0, "H"], [0, 22, "H"], [1, 10, "H"], [2, 26, "H"], [3, 0, "H"]], b: [[-2, 0, "H"], [0, 34, "H"], [1, 16, "H"], [2, 40, "H"], [3, 0, "H"]] }, pw: { r: 0, b: 0 } },
    { t: "expo", n: "Spark", k: { ev: [[-1, 0, "H"], [0, 0.8, "H"], [1, 0, "H"], [2, 0.5, "H"], [3, 0, "H"]] }, pw: { ev: 0 } }
  ]));
  FX.push(stack("tr-mosaic", T, "Pixel Cut", "Shot breaks into pixels and back", "pixel", "cut", [-4, 4], [
    { t: "mos", n: "Pixels", s: {}, k: { hb: [[-4, 960, "E"], [-1, 40, "S40"], [0, 8, "E8"], [1, 40, "S40"], [4, 960, "E"]], vb: [[-4, 540, "E"], [-1, 22, "S40"], [0, 5, "E8"], [1, 22, "S40"], [4, 540, "E"]] } },
    { t: "expo", n: "Hit Light", k: { ev: [[-1, 0, "L"], [0, 0.6, "E10"], [2, 0, "L"]] }, pw: { ev: 0 } }
  ]));
  // ---- Pixel Scan: rebuilt from the studio's own pixel-logo-scan project (mosaic + turbulent displace wipe, a delayed copy cuts the band)
  var PAL = {
    neon: { a: [0, 0.9, 1], b: [1, 0.17, 0.84] }, sunset: { a: [1, 0.62, 0.04], b: [1, 0.22, 0.37] }, aurora: { a: [0.19, 0.82, 0.35], b: [0.37, 0.36, 0.9] },
    gold: { a: [1, 0.85, 0], b: [1, 0.62, 0.04] }, ice: { a: [1, 1, 1], b: [0.39, 0.82, 1] }, mono: { a: [1, 1, 1], b: [1, 1, 1] }
  };
  HS.PAL = PAL;
  function pix(id, name, sub, pp) {
    var p = { mode: "out", dir: "right", pal: PAL.neon, dur: 1.2, lag: 0.07, block: 24, jit: 160, glow: 1, ease: "lin" }, k;
    for (k in pp) if (pp.hasOwnProperty(k)) p[k] = pp[k];
    return R(id, T, name, sub, "pixel", "pixscan", p);
  }

  FX.push(stack("tr-twirl", T, "Twirl Warp", "Vortex through the cut", "twirl", "cut", [-4, 5], [
    { t: "twirl", n: "Vortex", s: { rad: 900 }, k: { ang: [[-4, 0, "E25,80"], [0, 260, "E10"], [5, 0, "E80,25"]] }, pw: { ang: 0 } },
    { t: "tf", n: "Zoom", s: { shut: 180 }, k: { sc: [[-4, 100, "E"], [0, 150, "E10"], [5, 100, "E"]] }, pw: { sc: 100 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[-4, 0, "E"], [0, 55, "E10"], [5, 0, "E"]] }, pw: { amt: 0 } }
  ]));

  // ---- viral styles: card grid + S-shake, inverted line slide + wide lens, 3D flip, hotspots
  // (the originals use Sapphire / Red Giant / Video Copilot plugins; these are rebuilt from After Effects' own effects)
  function cardShake(id, name, sub, cols, rows, amp, rotAmp, seed) {
    var tw = twitch(-5, 5, amp, rotAmp, sinEnv(-6, 6, 0.9), seed);
    return stack(id, T, name, sub, "cards", "cut", [-5, 5], [
      { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
      { t: "tf", n: "S-Shake", s: { shut: 180 }, k: { pos: tw.pos, rot: tw.rot }, pw: { pos: CEN, rot: 0 } },
      { t: "mos", n: "Cards", k: { hb: [[-2, 960, "H"], [-1, cols, "H"], [1, cols, "H"], [2, 960, "H"]], vb: [[-2, 540, "H"], [-1, rows, "H"], [1, rows, "H"], [2, 540, "H"]] } },
      { t: "echo", n: "Time Slice", s: { time: -0.04, int: 0.9, dec: 0.6, op: 2 }, k: { n: [[-3, 1, "L"], [-1, 4, "L"], [1, 4, "L"], [3, 1, "L"]] } },
      { t: "dblur", n: "Motion Blur", s: { ang: 0 }, k: { len: envKeys(-5, 5, 140, sinEnv(-6, 6, 1)) }, pw: { len: 0 } },
      { t: "chan", n: "Color Split", k: { r: [[-1, 0, "L"], [0, 20, "L"], [2, 0, "L"]], b: [[-1, 0, "L"], [0, 30, "L"], [2, 0, "L"]] }, pw: { r: 0, b: 0 } },
      { t: "expo", n: "Hit Light", k: { ev: [[-1, 0, "L"], [0, 0.8, "L"], [1, 0, "L"]] }, pw: { ev: 0 } }
    ]);
  }
  FX.push(cardShake("tr-card", "Card Shake", "Grid of cards under a hard shake", 11, 7, 0.05, 2.2, 7));
  FX.push(cardShake("tr-card-hard", "Card Shake Hard", "Finer grid, harder shake", 16, 9, 0.095, 3.6, 19));
  FX.push(cardShake("tr-card-big", "Big Cards", "Chunky cards, slower shake", 6, 4, 0.04, 1.8, 31));
  FX.push(stack("tr-slice", T, "Slice Echo", "Time-slice trail through the cut", "slice", "cut", [-4, 5], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Drift", s: { shut: 180 }, k: { pos: [[-4, CEN, "E25,80"], [0, [0.58, 0.5], "S45"], [5, CEN, "E80,25"]] }, pw: { pos: CEN } },
    { t: "echo", n: "Time Slice", s: { time: -0.06, int: 0.92, dec: 0.7, op: 2 }, k: { n: [[-4, 1, "L"], [-1, 6, "L"], [0, 9, "L"], [2, 5, "L"], [5, 1, "L"]] } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[-4, 0, "E"], [0, 40, "E10"], [5, 0, "E"]] }, pw: { amt: 0 } }
  ]));

  // an inverted black-and-white bar sweeps across (masked lower layer), the whole frame warps and flashes (main layer)
  function band(dir, wdt) {
    var a = dir > 0 ? -0.4 : 1.4, b = dir > 0 ? 1.4 : -0.4;
    return { shape: "rect", size: [wdt, 1.4], feather: 0, c: [[-5, [a, 0.5], "E60"], [5, [b, 0.5], "E60"]] };
  }
  function barLayer(dir, wdt) {
    return { n: "Line", mask: band(dir, wdt), fx: [{ t: "inv", n: "Invert", s: { bl: 0 } }, { t: "hs", n: "Black & White", s: { sat: -100 } }, { t: "bc", n: "Contrast", s: { c: 30 } }] };
  }
  function lineSlide(id, name, sub, dir, wdt, fov, twin) {
    var under = [barLayer(dir, wdt)];
    if (twin) under.push(barLayer(-dir, wdt));
    return stack(id, T, name, sub, "line", "cut", [-5, 5], [
      { t: "optic", n: "Wide Lens", s: { rev: 1 }, k: { fov: [[-4, 0, "E"], [-1, fov * 0.6, "E40"], [0, fov, "E10"], [1, fov * 0.6, "E40"], [4, 0, "E"]] }, pw: { fov: 0 } },
      { t: "tf", n: "Zoom", s: { shut: 180 }, k: { sc: [[-4, 100, "E"], [0, 112, "E10"], [4, 100, "E"]] }, pw: { sc: 100 } },
      { t: "td", n: "Cross Glitch", s: { type: 9, size: 30, cx: 1 }, k: { amt: [[-1, 0, "H"], [0, 120, "H"], [1, 40, "H"], [2, 0, "H"]], evo: [[-1, 0, "H"], [0, 200, "H"], [1, 90, "H"]] }, pw: { amt: 0 } },
      { t: "chan", n: "Color Split", k: { r: [[-2, 0, "L"], [0, 16, "L"], [2, 0, "L"]], b: [[-2, 0, "L"], [0, 24, "L"], [2, 0, "L"]] }, pw: { r: 0, b: 0 } },
      { t: "fill", n: "Flash", s: { col: [1, 1, 1] }, k: { op: [[-1, 0, "L"], [0, 72, "L"], [1, 0, "L"]] }, pw: { op: 0 } }
    ], { under: under });
  }
  FX.push(lineSlide("tr-line", "Line Slide", "Inverted bar sweeps across", 1, 0.3, 75, false));
  FX.push(lineSlide("tr-line-back", "Line Slide Back", "Same, from the right", -1, 0.3, 75, false));
  FX.push(lineSlide("tr-line-lens", "Wide Lens Line", "Thin bar, huge lens warp", 1, 0.16, 120, false));
  FX.push(lineSlide("tr-line-twin", "Twin Lines", "Two bars cross in the middle", 1, 0.14, 90, true));

  // vertical / sideways flip of the whole picture as a floating card
  function flipFx(prop, floatScale) {
    var k = {};
    k[prop] = [[-4, 0, "E25,80"], [-1, 72, "E45"], [0, 90, "H"], [1, -72, "E45"], [4, 0, "E80,25"]];
    return [
      { t: "tf", n: "Float", s: { shut: 180 }, k: { sc: [[-5, 100, "E25,80"], [-2, floatScale, "E"], [2, floatScale, "E"], [5, 100, "E80,25"]] }, pw: { sc: 100 } },
      { t: "b3d", n: "Flip", k: k, pw: {} },
      { t: "dblur", n: "Motion Blur", s: { ang: prop === "tilt" ? 90 : 0 }, k: { len: [[-4, 0, "E"], [-1, 120, "E"], [0, 160, "E"], [1, 120, "E"], [4, 0, "E"]] }, pw: { len: 0 } },
      { t: "rblur", n: "Zoom Blur", k: { amt: [[-4, 0, "E"], [0, 40, "E10"], [4, 0, "E"]] }, pw: { amt: 0 } }
    ];
  }
  FX.push(stack("tr-flip", T, "3D Flip", "Card flips top to bottom", "flip", "cut", [-5, 5], flipFx("tilt", 58)));
  FX.push(stack("tr-flip-side", T, "3D Flip Sideways", "Card flips left to right", "flip", "cut", [-5, 5], flipFx("swivel", 58)));
  FX.push(stack("tr-flip-float", T, "Floating Card", "Small card, flips and trails", "flip", "cut", [-5, 5],
    flipFx("tilt", 50).concat([{ t: "echo", n: "Trail", s: { time: -0.05, int: 0.8, dec: 0.6, op: 2 }, k: { n: [[-4, 1, "L"], [-1, 4, "L"], [1, 4, "L"], [4, 1, "L"]] } }])));

  // hotspots: highlights bloom and burn out on the cut, corners darken
  function hotspot(id, name, sub, warm, big) {
    var fx = [
      { t: "gblur", n: "Blur Input", s: { edge: 1 }, k: { rad: [[-3, 0, "E"], [0, 6, "E10"], [3, 0, "E"]] }, pw: { rad: 0 } },
      { t: "glow", n: "Hotspots", s: {}, k: { thr: [[-3, 100, "E"], [-1, 60, "E"], [0, 18, "E10"], [3, 100, "E"]], rad: [[-3, 10, "E"], [0, 150, "E10"], [3, 10, "E"]], int: [[-3, 0, "E"], [0, big ? 4 : 3, "E10"], [3, 0, "E"]] }, pw: { int: 0 } },
      { t: "expo", n: "Exposure", k: { ev: [[-2, 0, "L"], [0, big ? 8 : 4.2, "E10"], [3, 0.3, "E"], [5, 0, "E"]] }, pw: { ev: 0 } },
      { t: "tf", n: "Pop", s: { shut: 180 }, k: { sc: [[-3, 100, "E"], [0, 112, "E10"], [3, 100, "E"]] }, pw: { sc: 100 } }
    ];
    if (warm) fx.push({ t: "pf", n: "Heat", s: { col: [1, 0.5, 0.12], pl: 0 }, k: { den: [[-3, 0, "E"], [0, 70, "E10"], [4, 0, "E"]] }, pw: { den: 0 } });
    return stack(id, T, name, sub, "hot", "cut", [-3, 5], fx, { under: [{ n: "Vignette", mask: { shape: "ellipse", inv: 1, feather: 0.4, size: [0.85, 0.85] }, fx: [{ t: "expo", n: "Darken", s: { ev: -1.1 } }] }] });
  }
  FX.push(hotspot("tr-hot", "Hotspot Cut", "Highlights burn white on the cut", false, false));
  FX.push(hotspot("tr-hot-warm", "Hotspot Heat", "Burns orange, then clears", true, false));
  FX.push(hotspot("tr-hot-max", "Hotspot Overload", "Full white-out", false, true));
  FX.push(stack("tr-hot-add", T, "Hotspot Add", "Additive bloom on top", "hot", "cut", [-3, 5], [
    { t: "glow", n: "Hotspots", s: { rad: 120 }, k: { thr: [[-3, 100, "E"], [0, 14, "E10"], [3, 100, "E"]], int: [[-3, 0, "E"], [0, 5, "E10"], [3, 0, "E"]] }, pw: { int: 0 } },
    { t: "expo", n: "Exposure", k: { ev: [[-2, 0, "L"], [0, 3, "E10"], [3, 0, "E"]] }, pw: { ev: 0 } }
  ], { blend: "add", lop: 75, lopk: [[-3, 0, "E"], [0, 75, "E10"], [3, 0, "E"]] }));

  // ================================================================== SHAKE
  var SH = "Shake";
  FX.push(stack("sh-impact", SH, "Impact Shake", "One hit that settles", "shake", "hit", [0, 8], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Shake", s: { shut: 180 }, k: {
      pos: [[0, CEN, "L"], [1, [0.545, 0.468], "L"], [2, [0.463, 0.527], "L"], [3, [0.53, 0.484], "L"], [4, [0.48, 0.512], "L"], [5, [0.515, 0.495], "L"], [6, [0.495, 0.503], "L"], [7, CEN, "L"]],
      rot: [[0, 0, "L"], [1, 1.8, "L"], [2, -1.5, "L"], [3, 1, "L"], [4, -0.6, "L"], [5, 0.3, "L"], [6, -0.1, "L"], [7, 0, "L"]],
      sc: [[0, 100, "L"], [1, 109, "L"], [4, 103, "E"], [7, 100, "E"]] }, pw: { pos: CEN, rot: 0, sc: 100 } },
    { t: "dblur", n: "Motion Blur", s: { ang: 25 }, k: { len: [[0, 0, "L"], [1, 90, "L"], [2, 70, "L"], [3, 45, "L"], [4, 25, "L"], [5, 10, "L"], [7, 0, "L"]] }, pw: { len: 0 } }
  ]));
  FX.push(stack("sh-bass", SH, "Bass Drop", "Zoom slam with a color split", "zoom", "hit", [0, 10], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Slam", s: { shut: 180 }, k: {
      sc: [[0, 100, "L"], [1, 124, "E12"], [2, 113, "E"], [4, 105, "E"], [10, 100, "E"]],
      pos: [[0, CEN, "L"], [1, [0.5, 0.53], "L"], [2, [0.51, 0.49], "L"], [3, [0.5, 0.506], "L"], [5, CEN, "E"]] }, pw: { sc: 100, pos: CEN } },
    { t: "chan", n: "Color Split", k: { r: [[0, 0, "L"], [1, 16, "L"], [4, 6, "E"], [9, 0, "E"]], b: [[0, 0, "L"], [1, 24, "L"], [4, 9, "E"], [9, 0, "E"]] }, pw: { r: 0, b: 0 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[0, 0, "L"], [1, 38, "E10"], [5, 8, "E"], [10, 0, "E"]] }, pw: { amt: 0 } },
    { t: "expo", n: "Hit Light", k: { ev: [[0, 0, "L"], [1, 0.8, "E10"], [4, 0, "E"]] }, pw: { ev: 0 } }
  ]));
  FX.push(stack("sh-quake", SH, "Earthquake", "Rolling, then dies down", "shake", "hit", [0, 24], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Quake", s: { shut: 180 }, k: {
      pos: [[0, CEN, "S"], [2, [0.5, 0.56], "S"], [4, [0.5, 0.44], "S"], [6, [0.5, 0.54], "S"], [8, [0.5, 0.46], "S"], [10, [0.5, 0.529], "S"], [12, [0.5, 0.472], "S"], [15, [0.5, 0.514], "S"], [18, [0.5, 0.488], "S"], [21, [0.5, 0.504], "S"], [24, CEN, "E"]],
      rot: [[0, 0, "S"], [2, 2.6, "S"], [4, -2.6, "S"], [6, 2.1, "S"], [8, -2.1, "S"], [10, 1.5, "S"], [12, -1.4, "S"], [15, 0.9, "S"], [18, -0.6, "S"], [21, 0.2, "S"], [24, 0, "E"]],
      sc: [[0, 100, "E"], [2, 112, "E"], [24, 100, "E"]] }, pw: { pos: CEN, rot: 0, sc: 100 } },
    { t: "dblur", n: "Motion Blur", s: { ang: 90 }, k: { len: [[0, 0, "E"], [2, 70, "E"], [10, 30, "E"], [24, 0, "E"]] }, pw: { len: 0 } }
  ]));
  FX.push(stack("sh-glitch", SH, "Glitch Shake", "Jolt with a digital tear", "glitch", "hit", [0, 8], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "post", n: "Stutter", s: { fps: 15 } },
    { t: "tf", n: "Jolt", s: { shut: 0 }, k: { pos: [[0, CEN, "H"], [1, [0.54, 0.5], "H"], [2, [0.47, 0.51], "H"], [3, [0.52, 0.49], "H"], [4, [0.49, 0.5], "H"], [5, CEN, "H"]] }, pw: { pos: CEN } },
    { t: "td", n: "Tear", s: { type: 8, size: 34, cx: 1 }, k: { amt: [[0, 0, "H"], [1, 200, "H"], [2, 90, "H"], [3, 160, "H"], [4, 40, "H"], [5, 0, "H"]], evo: [[0, 0, "H"], [1, 120, "H"], [2, 250, "H"], [3, 60, "H"], [4, 300, "H"]] }, pw: { amt: 0 } },
    { t: "chan", n: "Color Split", k: { r: [[0, 0, "H"], [1, 20, "H"], [3, 12, "H"], [5, 0, "H"]], b: [[0, 0, "H"], [1, 30, "H"], [3, 18, "H"], [5, 0, "H"]] }, pw: { r: 0, b: 0 } }
  ]));
  // twitch: random jitter with a smooth envelope - soft and hard, around a cut or as a one-sided hit
  function twitchRecipe(id, name, sub, span, win, amp, rotAmp, env, blurLen, glowInt, seed) {
    var tw = twitch(win[0], win[1], amp, rotAmp, env, seed);
    return stack(id, SH, name, sub, "twitch", span, win, [
      { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
      { t: "tf", n: "Twitch", s: { shut: 180 }, k: { pos: tw.pos, rot: tw.rot }, pw: { pos: CEN, rot: 0 } },
      { t: "dblur", n: "Blur Boost", s: { ang: 30 }, k: { len: envKeys(win[0], win[1], blurLen, env) }, pw: { len: 0 } },
      { t: "glow", n: "Light", s: { thr: 55, rad: 60 }, k: { int: envKeys(win[0], win[1], glowInt, env) }, pw: { int: 0 } }
    ]);
  }
  FX.push(twitchRecipe("sh-tw-soft", "Soft Twitch", "Gentle jitter across the cut", "cut", [-8, 8], 0.012, 0.5, sinEnv(-9, 9, 1.2), 40, 0.25, 5));
  FX.push(twitchRecipe("sh-tw-hard", "Hard Twitch", "Violent jitter across the cut", "cut", [-8, 8], 0.058, 2.6, sinEnv(-9, 9, 1.2), 170, 0.5, 11));
  FX.push(twitchRecipe("sh-tw-soft-hit", "Soft Twitch Hit", "Gentle jolt that fades", "hit", [0, 16], 0.014, 0.6, decayEnv(16), 45, 0.25, 23));
  FX.push(twitchRecipe("sh-tw-hard-hit", "Hard Twitch Hit", "Violent jolt that fades", "hit", [0, 16], 0.07, 3.2, decayEnv(16), 190, 0.55, 41));
  FX.push(stack("sh-hand", SH, "Handheld", "Natural camera sway", "shake", "auto", [0, 0], [
    { t: "tile", n: "Mirror Fill", s: { ow: 150, oh: 150, mir: 1 } },
    { t: "tf", n: "Handheld", s: { shut: 180 }, wg: { f: 1.4, a: 10, r: 0.5, o: 3 } }
  ]));
  FX.push(stack("sh-walk", SH, "Light Sway", "Barely there", "shake", "auto", [0, 0], [
    { t: "tile", n: "Mirror Fill", s: { ow: 150, oh: 150, mir: 1 } },
    { t: "tf", n: "Sway", s: { shut: 180 }, wg: { f: 2.2, a: 5, r: 0.2, o: 2 } }
  ]));
  FX.push(stack("sh-rumble", SH, "Heavy Rumble", "Fast and aggressive", "shake", "auto", [0, 0], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Rumble", s: { shut: 240 }, wg: { f: 9, a: 28, r: 1.5, o: 1 } },
    { t: "dblur", n: "Motion Blur", s: { ang: 35, len: 18 }, pw: { len: 0 } }
  ]));

  // ================================================================== PUNCH
  var PU = "Punch";
  FX.push(stack("pu-zoom", PU, "Zoom Punch", "Quick pop on the beat", "zoom", "hit", [0, 7], [
    { t: "tf", n: "Punch", s: { shut: 180 }, k: { sc: [[0, 100, "L"], [1, 117, "E12"], [3, 106, "E"], [7, 100, "E"]] }, pw: { sc: 100 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[0, 0, "L"], [1, 30, "E10"], [4, 0, "E"]] }, pw: { amt: 0 } }
  ]));
  FX.push(stack("pu-double", PU, "Double Punch", "Two pops, back to back", "zoom", "hit", [0, 12], [
    { t: "tf", n: "Punch", s: { shut: 180 }, k: { sc: [[0, 100, "L"], [1, 114, "E12"], [3, 103, "E"], [5, 100, "L"], [6, 120, "E12"], [9, 105, "E"], [12, 100, "E"]] }, pw: { sc: 100 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[0, 0, "L"], [1, 24, "E10"], [3, 0, "E"], [5, 0, "L"], [6, 34, "E10"], [9, 0, "E"]] }, pw: { amt: 0 } }
  ]));
  FX.push(stack("pu-reverse", PU, "Reverse Punch", "Sucks in, springs back", "zoom", "hit", [0, 8], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Punch", s: { shut: 180 }, k: { sc: [[0, 100, "L"], [1, 86, "E12"], [3, 98, "E"], [4, 104, "E"], [8, 100, "E"]] }, pw: { sc: 100 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[0, 0, "L"], [1, 28, "E10"], [4, 0, "E"]] }, pw: { amt: 0 } }
  ]));
  FX.push(stack("pu-pulse", PU, "Beat Pulse", "Pulses every beat", "pulse", "auto", [0, 0], [
    { t: "tf", n: "Pulse", s: { shut: 180 }, pul: { sc: [2, 6, 7, 100] } }
  ]));
  FX.push(stack("pu-in", PU, "Slow Push-in", "Gentle zoom in", "push", "auto", [0, 0], [
    { t: "tf", n: "Push", k: { sc: [["i", 100, "E"], ["o", 112, "E"]] }, pw: { sc: 100 } }
  ]));
  FX.push(stack("pu-out", PU, "Slow Pull-out", "Gentle zoom out", "push", "auto", [0, 0], [
    { t: "tf", n: "Pull", k: { sc: [["i", 112, "E"], ["o", 100, "E"]] }, pw: { sc: 100 } }
  ]));

  // ================================================================== FLASH & GLITCH
  var FG = "Flash & Glitch";
  FX.push(stack("fg-flash", FG, "Flash Hit", "Burns to white, falls off", "bolt", "hit", [0, 8], [
    { t: "expo", n: "Flash", k: { ev: [[0, 0, "L"], [1, 4.2, "L"], [2, 1.8, "E"], [4, 0.5, "E"], [8, 0, "E"]] }, pw: { ev: 0 } },
    { t: "glow", n: "Bloom", s: { thr: 50, rad: 70 }, k: { int: [[0, 0, "L"], [1, 1.5, "L"], [6, 0, "E"]] }, pw: { int: 0 } },
    { t: "tf", n: "Pop", k: { sc: [[0, 100, "L"], [1, 105, "E"], [6, 100, "E"]] }, pw: { sc: 100 } }
  ]));
  FX.push(stack("fg-soft", FG, "Soft Flash", "Slow, bright bloom", "bolt", "hit", [0, 14], [
    { t: "expo", n: "Flash", k: { ev: [[0, 0, "E"], [3, 1.5, "E"], [14, 0, "E"]] }, pw: { ev: 0 } },
    { t: "glow", n: "Bloom", s: { thr: 45, rad: 90 }, k: { int: [[0, 0, "E"], [3, 1.1, "E"], [14, 0, "E"]] }, pw: { int: 0 } }
  ]));
  FX.push(stack("fg-double", FG, "Double Flash", "Two hits in a row", "bolt", "hit", [0, 12], [
    { t: "expo", n: "Flash", k: { ev: [[0, 0, "L"], [1, 3.4, "L"], [2, 0.6, "E"], [4, 0, "L"], [5, 4.6, "L"], [6, 1.5, "E"], [12, 0, "E"]] }, pw: { ev: 0 } },
    { t: "glow", n: "Bloom", s: { thr: 55, rad: 70 }, k: { int: [[0, 0, "L"], [1, 1.2, "L"], [3, 0, "E"], [5, 1.4, "L"], [9, 0, "E"]] }, pw: { int: 0 } }
  ]));
  FX.push(stack("fg-strobe", FG, "Strobe Beat", "Flashes every beat", "bolt", "auto", [0, 0], [
    { t: "expo", n: "Strobe", pul: { ev: [2, 1.4, 9, 0] } }
  ]));
  FX.push(stack("fg-burst", FG, "Glitch Burst", "Quick digital tear", "glitch", "hit", [0, 8], [
    { t: "post", n: "Stutter", s: { fps: 12 } },
    { t: "td", n: "Tear", s: { type: 8, size: 38, cx: 1 }, k: { amt: [[0, 0, "H"], [1, 240, "H"], [2, 90, "H"], [3, 180, "H"], [4, 50, "H"], [5, 120, "H"], [6, 20, "H"], [7, 0, "H"]], evo: [[0, 0, "H"], [1, 140, "H"], [2, 260, "H"], [3, 30, "H"], [4, 200, "H"], [5, 90, "H"], [6, 320, "H"]] }, pw: { amt: 0 } },
    { t: "chan", n: "Color Split", k: { r: [[0, 0, "H"], [1, 24, "H"], [3, 12, "H"], [5, 28, "H"], [7, 0, "H"]], b: [[0, 0, "H"], [1, 38, "H"], [3, 18, "H"], [5, 44, "H"], [7, 0, "H"]] }, pw: { r: 0, b: 0 } },
    { t: "hs", n: "Color Shift", k: { hue: [[0, 0, "H"], [1, 28, "H"], [2, -18, "H"], [3, 40, "H"], [5, -26, "H"], [6, 0, "H"]] }, pw: { hue: 0 } }
  ]));
  FX.push(stack("fg-rgb", FG, "RGB Split Hit", "Colors tear apart and snap back", "prism", "hit", [0, 9], [
    { t: "tile", n: "Mirror Fill", s: { ow: 200, oh: 200, mir: 1 } },
    { t: "tf", n: "Kick", s: { shut: 180 }, k: { pos: [[0, CEN, "L"], [1, [0.515, 0.5], "L"], [2, [0.49, 0.5], "E"], [5, CEN, "E"]], sc: [[0, 100, "L"], [1, 106, "E"], [9, 100, "E"]] }, pw: { pos: CEN, sc: 100 } },
    { t: "chan", n: "Color Split", k: { r: [[0, 0, "L"], [1, 48, "E10"], [4, 18, "E"], [9, 0, "E"]], b: [[0, 0, "L"], [1, 70, "E10"], [4, 26, "E"], [9, 0, "E"]] }, pw: { r: 0, b: 0 } }
  ]));
  FX.push(stack("fg-loss", FG, "Signal Loss", "Breaks up, then recovers", "glitch", "hit", [0, 12], [
    { t: "post", n: "Stutter", s: { fps: 10 } },
    { t: "td", n: "Wobble", s: { type: 8, size: 26, cx: 2 }, k: { amt: [[0, 0, "H"], [1, 160, "H"], [3, 70, "H"], [5, 200, "H"], [8, 60, "H"], [10, 20, "H"], [12, 0, "H"]], evo: [[0, 0, "H"], [1, 90, "H"], [3, 200, "H"], [5, 310, "H"], [8, 40, "H"], [10, 150, "H"]] }, pw: { amt: 0 } },
    { t: "noise", n: "Static", s: { col: 1 }, k: { amt: [[0, 0, "H"], [1, 38, "H"], [5, 55, "H"], [10, 12, "H"], [12, 0, "H"]] }, pw: { amt: 0 } },
    { t: "hs", n: "Fade", k: { sat: [[0, 0, "H"], [3, -60, "H"], [8, -30, "H"], [12, 0, "H"]] } }
  ]));
  FX.push(stack("fg-vhs", FG, "VHS Tape", "Worn tape, soft and wobbly", "glitch", "auto", [0, 0], [
    { t: "post", n: "Tape Rate", s: { fps: 15 } },
    { t: "chan", n: "Color Bleed", s: { r: 5, b: 7, g: 0 }, pw: { r: 0, b: 0 } },
    { t: "tf", n: "Wobble", s: { shut: 0 }, wg: { f: 0.7, a: 2.5, r: 0, o: 1, y: 1 } },
    { t: "noise", n: "Tape Noise", s: { amt: 7 }, pw: { amt: 0 } },
    { t: "hs", n: "Tape Color", s: { sat: -14, lit: -2 } }
  ]));

  // ================================================================== EFFECTS
  // Native replacements for the old Deep Glow based presets: nothing here needs a third-party plugin.
  var EF = "Effects";
  function flick(seed, n) {
    var r = rnd(seed), ev = [], tear = [], evo = [], cr = [], cb = [], f, v, on, E = [-0.9, 0.9, 0.45, -0.5, 1.4, -1.2, 0.2];
    for (f = 0; f <= n; f++) {
      if (f >= n - 1) { ev.push([f, 0, "H"]); tear.push([f, 0, "H"]); cr.push([f, 0, "H"]); cb.push([f, 0, "H"]); continue; }
      on = r() < 0.62;
      v = E[Math.floor(r() * E.length)];
      ev.push([f, on ? v : 0, "H"]);
      tear.push([f, on ? Math.round(80 + r() * 220) : 0, "H"]);
      evo.push([f, Math.round(r() * 900), "H"]);
      cr.push([f, on ? Math.round(10 + r() * 40) : 0, "H"]);
      cb.push([f, on ? Math.round(16 + r() * 56) : 0, "H"]);
    }
    return { ev: ev, tear: tear, evo: evo, cr: cr, cb: cb };
  }
  var FK = flick(11, 20);
  FX.push(stack("ef-sweep", EF, "Light Sweep", "A hot band of light crosses the frame", "light", "hit", [0, 24], [
    { t: "sweep", n: "Light Sweep", s: { ang: 28, shape: 2, wid: 190, si: 90, ei: 70, et: 4, col: [1, 0.95, 0.82], rec: 1 },
      k: { c: [[0, [-0.3, 0.45], "E15,60"], [22, [1.3, 0.55], "E60,15"]] }, pw: { si: 0, ei: 0 } },
    { t: "glow", n: "Bloom", s: { thr: 52, rad: 46, int: 0.9 }, pw: { int: 0 } }
  ]));
  FX.push(stack("ef-shadow", EF, "Sweep Shadow", "A dark wave rolls over the shot", "light", "hit", [0, 28], [
    { t: "sweep", n: "Shadow Sweep", s: { ang: 32, shape: 2, wid: 320, si: 92, ei: 0, et: 2, col: [0, 0, 0], rec: 2 },
      k: { c: [[0, [-0.35, 0.5], "E15,60"], [26, [1.35, 0.5], "E60,15"]] }, pw: { si: 0 } },
    { t: "expo", n: "Dip", k: { ev: [[0, 0, "E"], [12, -0.45, "E"], [28, 0, "E"]] }, pw: { ev: 0 } }
  ]));
  FX.push(stack("ef-turb", EF, "Turbulent Glow", "Heat-haze ripple with a hot bloom", "glow", "auto", [0, 0], [
    { t: "td", n: "Ripple", s: { type: 1, amt: 26, size: 55, cx: 3 }, k: { evo: [["i", 0, "L"], ["o", 900, "L"]] }, pw: { amt: 0 } },
    { t: "glow", n: "Hot Bloom", s: { thr: 30, rad: 120, int: 1.7 }, pw: { int: 0 } },
    { t: "hs", n: "Color", s: { sat: 20, lit: -2 } }
  ]));
  FX.push(stack("ef-flicker", EF, "Glitchy Flicker", "Strobing exposure with torn lines", "glitch", "hit", [0, 20], [
    { t: "expo", n: "Flicker", k: { ev: FK.ev }, pw: { ev: 0 } },
    { t: "td", n: "Tear", s: { type: 8, size: 30, cx: 2 }, k: { amt: FK.tear, evo: FK.evo }, pw: { amt: 0 } },
    { t: "chan", n: "Color Split", k: { r: FK.cr, b: FK.cb }, pw: { r: 0, b: 0 } },
    { t: "glow", n: "Glare", s: { thr: 45, rad: 36, int: 0.8 }, pw: { int: 0 } }
  ]));
  FX.push(stack("ef-vhs", EF, "VHS", "Worn tape: bleed, noise, tracking wobble", "glitch", "auto", [0, 0], [
    { t: "post", n: "Tape Rate", s: { fps: 12 } },
    { t: "chan", n: "Color Bleed", s: { r: 9, b: 12, g: 0 }, pw: { r: 0, b: 0 } },
    { t: "td", n: "Tracking", s: { type: 8, size: 5, cx: 1 }, k: { amt: [["i", 9, "L"], ["o", 9, "L"]], evo: [["i", 0, "L"], ["o", 5000, "L"]] }, pw: { amt: 0 } },
    { t: "tf", n: "Wobble", s: { shut: 0 }, wg: { f: 0.8, a: 3.5, r: 0, o: 1, y: 1 } },
    { t: "noise", n: "Tape Noise", s: { amt: 16, col: 1 }, pw: { amt: 0 } },
    { t: "hs", n: "Tape Color", s: { sat: -18, lit: -3 } },
    { t: "bc", n: "Fade", s: { b: -2, c: 8 } },
    { t: "glow", n: "Phosphor", s: { thr: 62, rad: 22, int: 0.5 }, pw: { int: 0 } }
  ]));

  // ================================================================== BLUR & GLOW
  var BG = "Blur & Glow";
  FX.push(stack("bg-in", BG, "Blur In", "Pulls into focus", "blur", "auto", [0, 0], [
    { t: "gblur", n: "Focus", s: { edge: 1 }, k: { rad: [["i", 40, "E"], [14, 0, "E"]] }, pw: { rad: 0 } }
  ], { tokens: { rel: true } }));
  FX.push(stack("bg-out", BG, "Blur Out", "Drifts out of focus", "blur", "auto", [0, 0], [
    { t: "gblur", n: "Focus", s: { edge: 1 }, k: { rad: [[-14, 0, "E"], ["o", 40, "E"]] }, pw: { rad: 0 } }
  ], { tokens: { rel: true } }));
  FX.push(stack("bg-zoomburst", BG, "Zoom Blur Burst", "Radial streak on a beat", "zoom", "hit", [0, 9], [
    { t: "tf", n: "Push", s: { shut: 180 }, k: { sc: [[0, 100, "L"], [1, 118, "E12"], [3, 107, "E"], [9, 100, "E"]] }, pw: { sc: 100 } },
    { t: "rblur", n: "Zoom Blur", k: { amt: [[0, 0, "L"], [1, 85, "E10"], [4, 22, "E"], [9, 0, "E"]] }, pw: { amt: 0 } }
  ]));
  FX.push(stack("bg-dream", BG, "Dream Glow", "Soft bloom, a touch of haze", "glow", "auto", [0, 0], [
    { t: "glow", n: "Bloom", s: { thr: 42, rad: 70, int: 1.0 }, pw: { int: 0 } },
    { t: "gblur", n: "Haze", s: { rad: 3, edge: 1 }, pw: { rad: 0 } },
    { t: "hs", n: "Color", s: { sat: 10 } }
  ]));
  FX.push(stack("bg-bloom", BG, "Bloom", "Highlights glow", "glow", "auto", [0, 0], [
    { t: "glow", n: "Bloom", s: { thr: 58, rad: 42, int: 0.85 }, pw: { int: 0 } }
  ]));
  FX.push(stack("bg-neon", BG, "Neon Bloom", "Big, hot glow", "glow", "auto", [0, 0], [
    { t: "glow", n: "Bloom", s: { thr: 28, rad: 95, int: 1.6 }, pw: { int: 0 } },
    { t: "hs", n: "Color", s: { sat: 24, lit: -2 } }
  ]));
  FX.push(stack("bg-soft", BG, "Soft Focus", "Orton glow, dreamy", "blur", "auto", [0, 0], [
    { t: "gblur", n: "Soft", s: { rad: 12, edge: 1 }, pw: { rad: 0 } }
  ], { blend: "screen", lop: 42 }));
  FX.push(stack("bg-radial", BG, "Radial Focus", "Sharp center, soft edges", "blur", "auto", [0, 0], [
    { t: "gblur", n: "Edge Blur", s: { rad: 20, edge: 1 }, pw: { rad: 0 } }
  ], { mask: { shape: "ellipse", inv: 1, feather: 0.32, size: [0.62, 0.62] } }));
  FX.push(stack("bg-halation", BG, "Halation", "Warm film glow", "glow", "auto", [0, 0], [
    { t: "glow", n: "Halation", s: { thr: 66, rad: 56, int: 0.9 }, pw: { int: 0 } },
    { t: "pf", n: "Warm", s: { col: [1, 0.45, 0.2], den: 18, pl: 1 } }
  ]));

  // ================================================================== COLOR
  var CO = "Color";
  FX.push(stack("co-teal", CO, "Teal & Orange", "Blockbuster split tone", "palette", "auto", [0, 0], [
    { t: "cb", n: "Split Tone", s: { sr: -24, sg: 4, sb: 28, mr: 6, mg: 0, mb: -8, hr: 26, hg: 10, hb: -26, pl: 1 }, pw: { sr: 0, sg: 0, sb: 0, mr: 0, mg: 0, mb: 0, hr: 0, hg: 0, hb: 0 } },
    { t: "hs", n: "Color", s: { sat: 10 }, pw: { sat: 0 } },
    { t: "bc", n: "Contrast", s: { c: 8 }, pw: { c: 0 } }
  ], { ba: true }));
  FX.push(stack("co-warm", CO, "Warm Film", "Amber highlights", "palette", "auto", [0, 0], [
    { t: "pf", n: "Warm", s: { col: [1, 0.62, 0.22], den: 20, pl: 1 }, pw: { den: 0 } },
    { t: "cb", n: "Balance", s: { mr: 7, mb: -9, hr: 10, hb: -8, pl: 1 }, pw: { mr: 0, mb: 0, hr: 0, hb: 0 } },
    { t: "hs", n: "Color", s: { sat: -4 } }
  ], { ba: true }));
  FX.push(stack("co-cool", CO, "Cool Steel", "Cold and clean", "palette", "auto", [0, 0], [
    { t: "pf", n: "Cool", s: { col: [0.25, 0.55, 1], den: 22, pl: 1 }, pw: { den: 0 } },
    { t: "hs", n: "Color", s: { sat: -12 }, pw: { sat: 0 } },
    { t: "bc", n: "Contrast", s: { c: 10 }, pw: { c: 0 } }
  ], { ba: true }));
  FX.push(stack("co-bleach", CO, "Bleach Bypass", "Gritty, desaturated", "palette", "auto", [0, 0], [
    { t: "hs", n: "Desaturate", s: { sat: -45 }, pw: { sat: 0 } },
    { t: "bc", n: "Contrast", s: { b: -4, c: 32 }, pw: { c: 0 } }
  ], { ba: true }));
  FX.push(stack("co-matte", CO, "Faded Matte", "Lifted blacks", "palette", "auto", [0, 0], [
    { t: "expo", n: "Lift", s: { off: 0.04 }, pw: { off: 0 } },
    { t: "hs", n: "Color", s: { sat: -14 }, pw: { sat: 0 } },
    { t: "bc", n: "Contrast", s: { c: -6 } }
  ], { ba: true }));
  FX.push(stack("co-vivid", CO, "Vivid Pop", "Punchy, saturated", "palette", "auto", [0, 0], [
    { t: "hs", n: "Saturation", s: { sat: 34 }, pw: { sat: 0 } },
    { t: "bc", n: "Contrast", s: { c: 14 }, pw: { c: 0 } }
  ], { ba: true }));
  FX.push(stack("co-bw", CO, "Black & White", "Contrasty mono", "palette", "auto", [0, 0], [
    { t: "hs", n: "Mono", s: { sat: -100 } },
    { t: "bc", n: "Contrast", s: { c: 14 }, pw: { c: 0 } }
  ], { ba: true }));
  FX.push(stack("co-cyber", CO, "Cyberpunk", "Magenta and cyan", "palette", "auto", [0, 0], [
    { t: "cb", n: "Neon Split", s: { sr: 18, sg: -10, sb: 38, mr: 8, mb: 6, hr: 40, hg: -18, hb: 24, pl: 1 }, pw: { sr: 0, sg: 0, sb: 0, mr: 0, mb: 0, hr: 0, hg: 0, hb: 0 } },
    { t: "hs", n: "Color", s: { sat: 22 }, pw: { sat: 0 } },
    { t: "bc", n: "Contrast", s: { c: 10 } }
  ], { ba: true }));
  FX.push(stack("co-golden", CO, "Golden Hour", "Low sun warmth", "palette", "auto", [0, 0], [
    { t: "pf", n: "Sun", s: { col: [1, 0.55, 0.15], den: 28, pl: 1 }, pw: { den: 0 } },
    { t: "cb", n: "Highlights", s: { hr: 14, hb: -10, pl: 1 }, pw: { hr: 0, hb: 0 } },
    { t: "expo", n: "Glow", s: { ev: 0.15 } },
    { t: "hs", n: "Color", s: { sat: 8 } }
  ], { ba: true }));
  FX.push(stack("co-noir", CO, "Noir", "Hard black and white", "palette", "auto", [0, 0], [
    { t: "hs", n: "Mono", s: { sat: -100 } },
    { t: "bc", n: "Contrast", s: { b: -10, c: 46 }, pw: { c: 0 } }
  ], { ba: true }));
  FX.push(stack("co-pastel", CO, "Pastel Dream", "Airy and soft", "palette", "auto", [0, 0], [
    { t: "hs", n: "Color", s: { sat: -10, lit: 8 } },
    { t: "expo", n: "Lift", s: { off: 0.04 } },
    { t: "cb", n: "Tint", s: { mr: 6, mb: 8, pl: 1 } }
  ], { ba: true }));

  // ================================================================== LIGHT
  var LI = "Light";
  FX.push(stack("li-bloom", LI, "Soft Bloom", "Gentle highlight glow", "light", "auto", [0, 0], [
    { t: "glow", n: "Bloom", s: { thr: 62, rad: 50, int: 0.7 }, pw: { int: 0 } }
  ]));
  FX.push(stack("li-haze", LI, "Dreamy Haze", "Milky light over everything", "light", "auto", [0, 0], [
    { t: "gblur", n: "Haze", s: { rad: 9, edge: 1 }, pw: { rad: 0 } },
    { t: "expo", n: "Lift", s: { off: 0.02 } }
  ], { blend: "screen", lop: 36 }));
  FX.push(stack("li-golden", LI, "Golden Glow", "Warm light wash", "light", "auto", [0, 0], [
    { t: "pf", n: "Warm", s: { col: [1, 0.6, 0.2], den: 22, pl: 1 }, pw: { den: 0 } },
    { t: "glow", n: "Bloom", s: { thr: 50, rad: 60, int: 0.8 }, pw: { int: 0 } }
  ], { ba: true }));
  FX.push(stack("li-leak", LI, "Light Leak", "Orange and pink spill", "light", "auto", [0, 0], [
    { t: "ramp", n: "Leak", s: { a: [0, 0.2], ac: [1, 0.5, 0.08], b: [1, 0.8], bc: [0.95, 0.12, 0.45], shape: 1, bl: 52 }, pw: { bl: 100 } }
  ], { blend: "screen", ba: true }));
  FX.push(stack("li-flare", LI, "Flare Sweep", "A lens flare drifts across", "light", "auto", [0, 0], [
    { t: "flare", n: "Flare", s: { br: 130, lens: 1, bl: 0 }, k: { c: [["i", [0.1, 0.3], "L"], ["o", [0.9, 0.42], "L"]] }, pw: { br: 0 } }
  ]));
  FX.push(stack("li-vignette", LI, "Cinematic Vignette", "Dark corners", "light", "auto", [0, 0], [
    { t: "expo", n: "Darken", s: { ev: -1.6 }, pw: { ev: 0 } }
  ], { mask: { shape: "ellipse", inv: 1, feather: 0.4, size: [0.82, 0.82] } }));
  FX.push(stack("li-spot", LI, "Spotlight", "Pools light in the center", "light", "auto", [0, 0], [
    { t: "expo", n: "Darken", s: { ev: -1.3 }, pw: { ev: 0 } }
  ], { mask: { shape: "ellipse", inv: 1, feather: 0.32, size: [0.5, 0.64] } }));
  FX.push(stack("li-lift", LI, "Shadow Lift", "Opens up the darks", "light", "auto", [0, 0], [
    { t: "expo", n: "Lift", s: { off: 0.05, gam: 1.14 }, pw: { off: 0 } }
  ], { ba: true }));
  FX.push(stack("li-up", LI, "Brighten", "Half a stop up", "light", "auto", [0, 0], [
    { t: "expo", n: "Exposure", s: { ev: 0.5 }, pw: { ev: 0 } }
  ], { ba: true }));
  FX.push(stack("li-down", LI, "Darken", "Half a stop down", "light", "auto", [0, 0], [
    { t: "expo", n: "Exposure", s: { ev: -0.5 }, pw: { ev: 0 } }
  ], { ba: true }));

  // ================================================================== CLARITY
  var CL = "Clarity";
  FX.push(stack("cl-sharp", CL, "Sharpen", "Clean, natural", "clarity", "auto", [0, 0], [
    { t: "usm", n: "Sharpen", s: { amt: 80, rad: 1.2, thr: 0 }, pw: { amt: 0 } }
  ], { ba: true }));
  FX.push(stack("cl-crisp", CL, "Crisp HD", "Fine detail, tight", "clarity", "auto", [0, 0], [
    { t: "usm", n: "Sharpen", s: { amt: 130, rad: 0.8, thr: 0 }, pw: { amt: 0 } },
    { t: "bc", n: "Contrast", s: { c: 6 } }
  ], { ba: true }));
  FX.push(stack("cl-clarity", CL, "Clarity", "Local contrast, big radius", "clarity", "auto", [0, 0], [
    { t: "usm", n: "Clarity", s: { amt: 60, rad: 28, thr: 0 }, pw: { amt: 0 } }
  ], { ba: true }));
  FX.push(stack("cl-detail", CL, "Detail Pop", "Fine and mid detail together", "clarity", "auto", [0, 0], [
    { t: "usm", n: "Fine", s: { amt: 90, rad: 2.2, thr: 0 }, pw: { amt: 0 } },
    { t: "usm", n: "Mid", s: { amt: 50, rad: 20, thr: 0 }, pw: { amt: 0 } }
  ], { ba: true }));
  FX.push(stack("cl-grain", CL, "Film Grain", "Fine organic grain", "clarity", "auto", [0, 0], [
    { t: "noise", n: "Grain", s: { amt: 6, col: 0, clip: 1 }, pw: { amt: 0 } }
  ], { ba: true }));
  FX.push(stack("cl-soften", CL, "Soften", "Smooths harsh detail", "clarity", "auto", [0, 0], [
    { t: "gblur", n: "Soften", s: { rad: 4, edge: 1 }, pw: { rad: 0 } }
  ], { lop: 45, ba: true }));
  FX.push(stack("cl-denoise", CL, "Denoise", "Calms noise, keeps edges", "clarity", "auto", [0, 0], [
    { t: "med", n: "Denoise", s: { rad: 1 } },
    { t: "usm", n: "Restore", s: { amt: 40, rad: 1, thr: 0 }, pw: { amt: 0 } }
  ], { ba: true }));

  // ---- Length: stretch the keyframes of the quick, tempo-driven looks so they read on real footage.
  // Only the categories that are about timing are stretched; cut-centred keys (frame 0) stay on the cut.
  var LEN_CATS = { "Transitions": 1, "Shake": 1, "Punch": 1, "Flash & Glitch": 1 };
  function isKeyArr(a) {
    var i, e;
    if (!(a instanceof Array) || !a.length) return false;
    for (i = 0; i < a.length; i++) { e = a[i]; if (!(e instanceof Array) || e.length < 2 || !(typeof e[0] === "number" || e[0] === "i" || e[0] === "o")) return false; }
    return true;
  }
  function stretchKeys(a, k) {
    var out = [], seen = {}, i, e, f, c;
    for (i = 0; i < a.length; i++) {
      e = a[i]; f = e[0];
      if (typeof f === "number") { f = Math.round(f * k); if (seen[f]) continue; seen[f] = 1; }
      c = e.slice(); c[0] = f; out.push(c);
    }
    return out;
  }
  function stretch(o, k) {
    var i, key, r;
    if (isKeyArr(o)) return stretchKeys(o, k);
    if (o instanceof Array) { r = []; for (i = 0; i < o.length; i++) r.push(stretch(o[i], k)); return r; }
    if (o && typeof o === "object") { r = {}; for (key in o) if (o.hasOwnProperty(key)) r[key] = stretch(o[key], k); return r; }
    return o;
  }
  // returns the recipe to build / preview for a Length factor (1 = as written)
  HS.retime = function (f, k) {
    var p;
    if (f && f.kind === "pixscan" && k) {
      // Length 2x = the sweep as written; longer / shorter scales its duration
      var q = {}, key, o2 = {};
      for (key in f.p) if (f.p.hasOwnProperty(key)) q[key] = f.p[key];
      q.dur = Math.round(f.p.dur * k / 2 * 100) / 100;
      for (key in f) if (f.hasOwnProperty(key)) o2[key] = f[key];
      o2.p = q;
      return o2;
    }
    if (!f || !LEN_CATS[f.cat] || !k || Math.abs(k - 1) < 0.01 || f.kind !== "stack") return f;
    p = stretch(f.p, k);
    if (f.p.win) p.win = [Math.round(f.p.win[0] * k), Math.round(f.p.win[1] * k)];
    var o = {}, key;
    for (key in f) if (f.hasOwnProperty(key)) o[key] = f[key];
    o.p = p;
    return o;
  };
  HS.stretches = function (f) { return !!f && ((!!LEN_CATS[f.cat] && f.kind === "stack") || f.kind === "pixscan"); };

  HS.FX = FX;
  HS.byId = function (id) { var i; for (i = 0; i < FX.length; i++) if (FX[i].id === id) return FX[i]; return null; };
})();
