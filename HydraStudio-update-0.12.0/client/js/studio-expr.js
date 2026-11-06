/* Hydra Studio · studio-expr.js
 * Expressions: a short list of practical, ready-made expressions. Each one is shown LIVE on a small stage
 * (the preview runs a JavaScript twin of the expression), has sliders for its numbers, and puts the real
 * expression on your layer, with Slider Controls so you can keep tuning it inside After Effects.
 * All expressions here are written for Hydra from scratch.
 */
(function () {
  "use strict";
  var S = window.Studio, U = S.u, mk = U.mk, clamp = U.clamp, esc = U.esc, rgba = U.rgba, lerp = U.lerp;
  var E = null;

  // ------------------------------------------------------------------ noise (a smooth stand-in for wiggle())
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function vnoise(seed, x) {
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), s = seed * 17.3;
    return (hash(i + s) * (1 - u) + hash(i + 1 + s) * u) * 2 - 1;
  }
  function ease(u) { return u * u * (3 - 2 * u); }
  var TAU = Math.PI * 2, CYCLE = 4;

  var PROP_NAME = { position: "Position", rotation: "Rotation", scale: "Scale", opacity: "Opacity" };
  var PROP_PATH = { position: "position", rotation: "rotation", scale: "scale", opacity: "opacity" };
  var ALL = ["position", "rotation", "scale", "opacity"];

  // the two keyframes the keyed expressions (Loop, Bounce, Overshoot) are previewed with
  var KEYS = { position: [-90, 70], rotation: [-50, 50], scale: [35, 100], opacity: [0, 100] };
  function base() { return { x: 0, y: 0, s: 100, r: 0, o: 100 }; }
  // puts a plain number onto the channel that belongs to the property
  function put(o, prop, v, axis) {
    if (prop === "position") { if (axis === "x") o.x = v; else o.y = v; }
    else if (prop === "rotation") o.r = v;
    else if (prop === "scale") o.s = v;
    else o.o = clamp(v, 0, 100);
    return o;
  }

  // ------------------------------------------------------------------ the catalog
  // params: k = variable name in the code, n = Slider Control name in After Effects, by = per-property range
  // code(prop) -> the body, using the variables. sim(t, P, prop) -> { x, y, s, r, o } (a preview of the same motion)
  var ITEMS = [
    {
      id: "wiggle", name: "Wiggle", sub: "Organic random movement", props: ALL, prop: "position", dot: [10, 132, 255],
      params: [
        { k: "freq", n: "Wiggle Frequency", l: "Frequency", min: 0.2, max: 15, step: 0.1, def: 3, u: " /s" },
        { k: "amt", n: "Wiggle Amount", l: "Amount", min: 0, max: 300, step: 1, def: 40, u: " px", by: { position: { max: 300, def: 40, u: " px" }, rotation: { max: 90, def: 12, u: "°" }, scale: { max: 60, def: 10, u: " %" }, opacity: { max: 100, def: 30, u: " %" } } }
      ],
      code: function (prop) {
        if (prop === "scale") return "var w = wiggle(freq, amt)[0] - value[0];\nvalue + [w, w];";
        if (prop === "opacity") return "clamp(wiggle(freq, amt), 0, 100);";
        return "wiggle(freq, amt);";
      },
      sim: function (t, P, prop) {
        var o = base(), f = P.freq, a = P.amt;
        if (prop === "position") { o.x = a * vnoise(1, t * f); o.y = a * vnoise(2, t * f); }
        else if (prop === "rotation") o.r = a * vnoise(3, t * f);
        else if (prop === "scale") o.s = 100 + a * vnoise(4, t * f);
        else o.o = clamp(100 + a * vnoise(5, t * f), 0, 100);
        return o;
      }
    },
    {
      id: "shake", name: "Impact Shake", sub: "A hit that settles down", props: ["position", "rotation", "scale"], prop: "position", dot: [255, 69, 58],
      params: [
        { k: "freq", n: "Shake Frequency", l: "Frequency", min: 2, max: 30, step: 0.5, def: 14, u: " /s" },
        { k: "amt", n: "Shake Amount", l: "Amount", min: 0, max: 400, step: 1, def: 70, u: " px", by: { position: { max: 400, def: 70, u: " px" }, rotation: { max: 90, def: 10, u: "°" }, scale: { max: 80, def: 12, u: " %" } } },
        { k: "decay", n: "Shake Decay", l: "Settles in", min: 0.5, max: 12, step: 0.1, def: 4, u: " /s" }
      ],
      code: function (prop) {
        var head = "var t = Math.max(0, time - inPoint);\nvar a = amt * Math.exp(-decay * t);\n";
        if (prop === "scale") return head + "var w = wiggle(freq, a)[0] - value[0];\nvalue + [w, w];";
        return head + "wiggle(freq, a);";
      },
      sim: function (t, P, prop) {
        var o = base(), a = P.amt * Math.exp(-P.decay * t), f = P.freq;
        if (prop === "position") { o.x = a * vnoise(11, t * f); o.y = a * vnoise(12, t * f); }
        else if (prop === "rotation") o.r = a * vnoise(13, t * f);
        else o.s = 100 + a * vnoise(14, t * f);
        return o;
      },
      note: "The hit happens at the start of the layer. Slide the layer to move it."
    },
    {
      id: "loop", name: "Loop", sub: "Repeat your keyframes forever", props: ALL, prop: "position", dot: [48, 209, 88], keys: true,
      params: [{ k: "mode", n: "", l: "Style", choice: [["cycle", "Cycle"], ["pingpong", "Ping-pong"], ["offset", "Offset"], ["continue", "Continue"]], def: "cycle" }],
      code: function () { return "loopOut(mode);"; },
      codeVars: function (P) { return 'var mode = "' + P.mode + '";'; },
      sim: function (t, P, prop) {
        var k = KEYS[prop], a = k[0], b = k[1], t0 = 0.35, d = 0.9, u = (t - t0) / d, v, n, f;
        if (t < t0) v = a;
        else if (P.mode === "continue") v = a + (b - a) * u;
        else if (u <= 1) v = a + (b - a) * ease(u);
        else {
          n = Math.floor(u); f = u - n;
          if (P.mode === "cycle") v = a + (b - a) * ease(f);
          else if (P.mode === "pingpong") v = (n % 2 === 0) ? b + (a - b) * ease(f) : a + (b - a) * ease(f);
          else v = a + (b - a) * (n + ease(f));
        }
        return put(base(), prop, v, "x");
      },
      keyTimes: [0.35, 1.25],
      note: "Needs two or more keyframes on the property."
    },
    {
      id: "bounce", name: "Bounce", sub: "Settles with little hops", props: ALL, prop: "position", dot: [255, 159, 10], keys: true,
      params: [
        { k: "e", n: "Bounce Bounciness", l: "Bounciness", min: 0.1, max: 0.9, step: 0.01, def: 0.55, fmt: function (v) { return Math.round(v * 100) + " %"; } },
        { k: "hgt", n: "Bounce Height", l: "Height", min: 5, max: 100, step: 1, def: 35, u: " %" },
        { k: "per", n: "Bounce Time", l: "First hop", min: 0.1, max: 1, step: 0.01, def: 0.42, u: " s" }
      ],
      code: function () {
        return "var n = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\n" +
          "if (n < 2) {\n  value;\n} else {\n  var t = time - key(n).time;\n  var d = key(n).value - key(n - 1).value;\n  var T = per, a = 1, k = 0;\n" +
          "  while (t > T && k < 12) { t -= T; T *= Math.sqrt(e); a *= e; k++; }\n  var p = Math.min(1, t / T);\n  value - d * (hgt / 100) * a * 4 * p * (1 - p);\n}";
      },
      sim: function (t, P, prop) {
        var k = KEYS[prop], a = k[0], b = k[1], tA = 0.3, tB = 0.85, u, v, tt, T, amp, kk, p;
        if (t < tA) v = a;
        else if (t <= tB) { u = (t - tA) / (tB - tA); v = a + (b - a) * u * u; }
        else {
          tt = t - tB; T = P.per; amp = 1; kk = 0;
          while (tt > T && kk < 12) { tt -= T; T *= Math.sqrt(P.e); amp *= P.e; kk++; }
          p = Math.min(1, tt / T);
          v = b - (b - a) * (P.hgt / 100) * amp * 4 * p * (1 - p);
        }
        return put(base(), prop, v, "y");
      },
      keyTimes: [0.3, 0.85], axis: "y",
      note: "Needs two or more keyframes. It hops after every keyframe it passes."
    },
    {
      id: "overshoot", name: "Overshoot", sub: "Springs past the end, then settles", props: ALL, prop: "position", dot: [191, 90, 242], keys: true,
      params: [
        { k: "amp", n: "Overshoot Amount", l: "Overshoot", min: 2, max: 80, step: 1, def: 16, u: " %" },
        { k: "freq", n: "Overshoot Frequency", l: "Springiness", min: 0.5, max: 8, step: 0.1, def: 3, u: " /s" },
        { k: "decay", n: "Overshoot Decay", l: "Settles in", min: 1, max: 20, step: 0.5, def: 7, u: " /s" }
      ],
      code: function () {
        return "var n = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\n" +
          "if (n < 2) {\n  value;\n} else {\n  var t = time - key(n).time;\n  var d = key(n).value - key(n - 1).value;\n  value + d * (amp / 100) * Math.sin(t * freq * Math.PI * 2) / Math.exp(t * decay);\n}";
      },
      sim: function (t, P, prop) {
        var k = KEYS[prop], a = k[0], b = k[1], tA = 0.3, tB = 0.8, u, v, tt;
        if (t < tA) v = a;
        else if (t <= tB) { u = (t - tA) / (tB - tA); v = a + (b - a) * ease(u); }
        else { tt = t - tB; v = b + (b - a) * (P.amp / 100) * Math.sin(tt * P.freq * TAU) / Math.exp(tt * P.decay); }
        return put(base(), prop, v, "x");
      },
      keyTimes: [0.3, 0.8],
      note: "Needs two or more keyframes. It works with any keyframe ease."
    },
    {
      id: "spin", name: "Spin", sub: "Turns at a steady speed", props: ["rotation"], prop: "rotation", dot: [90, 200, 250],
      params: [{ k: "speed", n: "Spin Speed", l: "Speed", min: -720, max: 720, step: 5, def: 90, u: " °/s" }],
      code: function () { return "value + (time - inPoint) * speed;"; },
      sim: function (t, P) { var o = base(); o.r = t * P.speed; return o; }
    },
    {
      id: "float", name: "Float", sub: "Gentle hovering", props: ["position"], prop: "position", dot: [50, 173, 230],
      params: [
        { k: "hgt", n: "Float Height", l: "Height", min: 0, max: 200, step: 1, def: 22, u: " px" },
        { k: "sway", n: "Float Sway", l: "Sway", min: 0, max: 200, step: 1, def: 8, u: " px" },
        { k: "speed", n: "Float Speed", l: "Speed", min: 0.05, max: 3, step: 0.05, def: 0.6, u: " /s" }
      ],
      code: function () { return "var a = (time - inPoint + index * 0.37) * speed * Math.PI * 2;\nvalue + [Math.sin(a * 0.73) * sway, Math.sin(a) * hgt];"; },
      sim: function (t, P) { var o = base(), a = (t + 0.37) * P.speed * TAU; o.x = Math.sin(a * 0.73) * P.sway; o.y = Math.sin(a) * P.hgt; return o; },
      axis: "y"
    },
    {
      id: "pulse", name: "Pulse", sub: "A heartbeat", props: ["scale"], prop: "scale", dot: [255, 55, 95],
      params: [
        { k: "rate", n: "Pulse Rate", l: "Beats", min: 0.2, max: 6, step: 0.1, def: 1.2, u: " /s" },
        { k: "str", n: "Pulse Strength", l: "Strength", min: 0, max: 100, step: 1, def: 14, u: " %" },
        { k: "sharp", n: "Pulse Sharpness", l: "Sharpness", min: 1, max: 10, step: 0.5, def: 4, u: "" }
      ],
      code: function () { return "var p = ((time - inPoint) * rate) % 1;\nvar k = Math.pow(Math.sin(Math.PI * p), sharp);\nvalue * (1 + (str / 100) * k);"; },
      sim: function (t, P) { var o = base(), p = (t * P.rate) % 1, k = Math.pow(Math.sin(Math.PI * p), P.sharp); o.s = 100 * (1 + (P.str / 100) * k); return o; }
    },
    {
      id: "swing", name: "Swing", sub: "Pendulum rotation", props: ["rotation"], prop: "rotation", dot: [255, 196, 0],
      params: [
        { k: "ang", n: "Swing Angle", l: "Angle", min: 0, max: 90, step: 1, def: 18, u: "°" },
        { k: "freq", n: "Swing Speed", l: "Speed", min: 0.1, max: 4, step: 0.05, def: 0.8, u: " /s" },
        { k: "damp", n: "Swing Damping", l: "Damping", min: 0, max: 5, step: 0.1, def: 0, fmt: function (v) { return v === 0 ? "None" : v.toFixed(1); } }
      ],
      code: function () { return "var t = time - inPoint;\nvalue + ang * Math.sin(t * freq * Math.PI * 2) * Math.exp(-damp * t);"; },
      sim: function (t, P) { var o = base(); o.r = P.ang * Math.sin(t * P.freq * TAU) * Math.exp(-P.damp * t); return o; }
    },
    {
      id: "orbit", name: "Orbit", sub: "Circles around its spot", props: ["position"], prop: "position", dot: [94, 92, 230],
      params: [
        { k: "rad", n: "Orbit Radius", l: "Radius", min: 0, max: 400, step: 1, def: 60, u: " px" },
        { k: "rev", n: "Orbit Speed", l: "Speed", min: -2, max: 2, step: 0.05, def: 0.4, u: " rev/s" }
      ],
      code: function () { return "var a = (time - inPoint) * rev * Math.PI * 2;\nvalue + [Math.cos(a) * rad, Math.sin(a) * rad];"; },
      sim: function (t, P) { var o = base(), a = t * P.rev * TAU; o.x = Math.cos(a) * P.rad; o.y = Math.sin(a) * P.rad; return o; }
    },
    {
      id: "flicker", name: "Flicker", sub: "Unsteady light", props: ["opacity"], prop: "opacity", dot: [255, 214, 10],
      params: [
        { k: "rate", n: "Flicker Rate", l: "Speed", min: 2, max: 30, step: 1, def: 14, u: " fps" },
        { k: "low", n: "Flicker Depth", l: "Darkest", min: 0, max: 90, step: 1, def: 25, u: " %" },
        { k: "chance", n: "Flicker Chance", l: "How often", min: 5, max: 100, step: 1, def: 35, u: " %" }
      ],
      code: function () { return "posterizeTime(rate);\nrandom() < chance / 100 ? random(low, 70) : 100;"; },
      sim: function (t, P) {
        var o = base(), i = Math.floor(t * P.rate), r1 = hash(i * 1.37 + 3.1), r2 = hash(i * 2.11 + 9.7);
        o.o = r1 < P.chance / 100 ? P.low + (70 - P.low) * r2 : 100;
        return o;
      }
    },
    {
      id: "fade", name: "Auto Fade", sub: "In and out at the layer's ends", props: ["opacity"], prop: "opacity", dot: [100, 210, 255],
      params: [
        { k: "fi", n: "Fade In", l: "Fade in", min: 0, max: 5, step: 0.05, def: 0.5, u: " s" },
        { k: "fo", n: "Fade Out", l: "Fade out", min: 0, max: 5, step: 0.05, def: 0.5, u: " s" }
      ],
      code: function () {
        return "var a = fi > 0 ? linear(time, inPoint, inPoint + fi, 0, 100) : 100;\nvar b = fo > 0 ? linear(time, outPoint - fo, outPoint, 100, 0) : 100;\nMath.min(a, b) * value / 100;";
      },
      sim: function (t, P) {
        var o = base(), len = CYCLE - 0.2, tt = t, a = P.fi > 0 ? clamp(tt / P.fi, 0, 1) : 1, b = P.fo > 0 ? clamp((len - tt) / P.fo, 0, 1) : 1;
        o.o = Math.min(a, b) * 100;
        return o;
      },
      note: "Follows the layer's in and out points, so trimming the layer moves the fades."
    },
    {
      id: "follow", name: "Follow With Delay", sub: "Copies the layer above, a beat late", props: ALL, prop: "position", dot: [48, 209, 88], ghost: true,
      params: [{ k: "lag", n: "Follow Delay", l: "Delay", min: 0, max: 2, step: 0.01, def: 0.25, u: " s" }],
      code: function (prop) {
        var p = "transform." + PROP_PATH[prop];
        return "var L = thisComp.layer(index - 1);\nvar P = L." + p + ";\nvalue + P.valueAtTime(time - lag) - P.valueAtTime(inPoint);";
      },
      sim: function (t, P, prop) {
        var o = base(), v = leaderVal(t - P.lag, prop) - leaderVal(0, prop);
        return put(o, prop, (prop === "scale" ? 100 : prop === "opacity" ? 100 : 0) + v, "x");
      },
      leader: function (t, prop) { return put(base(), prop, leaderVal(t, prop) + (prop === "scale" || prop === "opacity" ? 100 : 0), "x"); },
      note: "Put it on the layer below the one it should follow."
    },
    {
      id: "stretch", name: "Speed Stretch", sub: "Stretches while it moves", props: ["scale"], prop: "scale", dot: [255, 159, 10], needsMove: true,
      params: [
        { k: "amt", n: "Stretch Amount", l: "Stretch", min: 0, max: 100, step: 1, def: 45, u: " %" },
        { k: "ref", n: "Stretch Full Speed", l: "Full at", min: 200, max: 4000, step: 50, def: 1400, u: " px/s" }
      ],
      code: function () { return "var v = length(thisLayer.transform.position.velocity);\nvar k = Math.min(1, v / ref) * amt / 100;\nvalue + [value[0] * k, -value[1] * k * 0.5];"; },
      sim: function (t, P) {
        var o = base(), x = 300 * Math.sin(TAU * t / 2.4), v = Math.abs(300 * TAU / 2.4 * Math.cos(TAU * t / 2.4)), k = Math.min(1, v / P.ref) * P.amt / 100;
        o.x = x; o.sx = 1 + k; o.sy = 1 - k * 0.5;
        return o;
      },
      note: "Reads the layer's own movement, so it needs a Position animation to react to."
    }
  ];
  function leaderVal(t, prop) {
    var x = Math.sin(TAU * t / 3.2);
    if (prop === "position") return 110 * x;
    if (prop === "rotation") return 60 * x;
    if (prop === "scale") return 38 * x;
    return 45 * x;
  }
  function byId(id) { var i; for (i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i]; return ITEMS[0]; }

  // ------------------------------------------------------------------ parameter ranges per property
  function pspec(item, p, prop) {
    var by = p.by && p.by[prop], o = { k: p.k, n: p.n, l: p.l, min: p.min, max: p.max, step: p.step, def: p.def, u: p.u, fmt: p.fmt, choice: p.choice };
    if (by) { if (by.min !== undefined) o.min = by.min; if (by.max !== undefined) o.max = by.max; if (by.def !== undefined) o.def = by.def; if (by.u !== undefined) o.u = by.u; if (by.step !== undefined) o.step = by.step; }
    return o;
  }
  function fmtOf(sp) {
    if (sp.fmt) return sp.fmt;
    var d = (sp.step && sp.step < 1) ? (sp.step < 0.1 ? 2 : 1) : 0;
    return function (v) { return (d ? v.toFixed(d) : String(Math.round(v))) + (sp.u || ""); };
  }

  // ------------------------------------------------------------------ the code
  // vals: { k: number | string }. useCtl: the variables read Slider Controls on the layer instead of holding the number.
  function buildCode(item, prop, vals, useCtl) {
    var lines = [], body = item.code(prop);
    item.params.forEach(function (p) {
      var sp = pspec(item, p, prop), v = vals[p.k];
      if (p.choice) return;
      lines.push("var " + p.k + " = " + (useCtl ? 'effect("' + p.n + '")(1)' : U.trimNum(v === undefined ? sp.def : v, 4)) + ";");
    });
    if (item.codeVars) lines.push(item.codeVars(vals));
    return (lines.length ? lines.join("\n") + "\n\n" : "") + body;
  }
  function ctlList(item, prop, vals) {
    var out = [];
    item.params.forEach(function (p) {
      if (p.choice) return;
      var sp = pspec(item, p, prop), v = vals[p.k];
      out.push({ n: p.n, v: U.round(v === undefined ? sp.def : v, 4) });
    });
    return out;
  }

  // ------------------------------------------------------------------ the pane
  var st = null, ui = {}, curItem = null, curProp = "position", vals = {}, plot = null, t0 = 0, sliders = {};

  function valsFor(item, prop) {
    var key = item.id + ":" + prop, o = st.vals[key];
    if (!o || typeof o !== "object") { o = {}; st.vals[key] = o; }
    item.params.forEach(function (p) {
      var sp = pspec(item, p, prop);
      if (p.choice) { if (typeof o[p.k] !== "string") o[p.k] = p.def; }
      else if (typeof o[p.k] !== "number" || !isFinite(o[p.k])) o[p.k] = sp.def;
      else o[p.k] = clamp(o[p.k], sp.min, sp.max);
    });
    return o;
  }

  function regen() {
    if (!curItem) return;
    ui.code.value = buildCode(curItem, curProp, vals, st.ctl);
    ui.code.rows = Math.min(16, ui.code.value.split("\n").length + 1);
    plot = null;
    E.dockChanged();
  }

  function pickItem(id, keepScroll) {
    curItem = byId(id); st.item = curItem.id;
    var saved = st.itemProp[curItem.id];
    curProp = (saved && curItem.props.indexOf(saved) >= 0) ? saved : curItem.prop;
    st.prop = curProp;
    Array.prototype.forEach.call(ui.pills.children, function (c) { c.classList.toggle("on", c.getAttribute("data-id") === curItem.id); });
    ui.pstage.name.textContent = curItem.name;
    ui.pstage.tag.textContent = curItem.keys ? "needs keyframes" : (curItem.needsMove ? "needs movement" : "");
    ui.sub.textContent = curItem.sub + (curItem.note ? " · " + curItem.note : "");
    buildControls();
    regen();
    t0 = performance.now();
    E.save();
  }

  function setProp(p) {
    curProp = p; st.prop = p;
    st.itemProp = st.itemProp || {}; st.itemProp[curItem.id] = p;
    buildControls();
    regen();
    E.save();
  }

  function buildControls() {
    var item = curItem;
    ui.ctrl.innerHTML = "";
    sliders = {};
    vals = valsFor(item, curProp);
    if (item.props.length > 1) {
      var tg = U.seg(item.props.map(function (p) { return [p, PROP_NAME[p]]; }), curProp, setProp);
      ui.ctrl.appendChild(tg.el);
      tg.el.style.marginBottom = "6px";
    }
    item.params.forEach(function (p) {
      var sp = pspec(item, p, curProp);
      if (p.choice) {
        var sg = U.seg(p.choice, vals[p.k], function (v) { vals[p.k] = v; regen(); E.save(); });
        var wrap = mk("div", "xchoice"); wrap.appendChild(mk("span", "", esc(p.l))); wrap.appendChild(sg.el);
        ui.ctrl.appendChild(wrap);
        return;
      }
      var sl = U.slider({
        label: sp.l, min: sp.min, max: sp.max, step: sp.step, value: vals[p.k], def: sp.def, fmt: fmtOf(sp),
        onInput: function (v) { vals[p.k] = v; regen(); },
        onChange: function () { E.save(); }
      });
      sliders[p.k] = sl;
      ui.ctrl.appendChild(sl.el);
    });
    ui.ctl.set(st.ctl);
    ui.ctl.show(item.params.some(function (p) { return !p.choice; }));
    ui.ctrl.appendChild(ui.ctl.el);
  }

  // ---- the stage
  function samplePlot(w, h) {
    var item = curItem, n = 120, i, chans = chansOf(item, curProp), series = chans.map(function () { return []; }), mn = [], mx = [], c, v, o;
    for (i = 0; i <= n; i++) {
      o = item.sim(i / n * CYCLE, vals, curProp);
      for (c = 0; c < chans.length; c++) { v = o[chans[c]]; series[c].push(v); }
    }
    var lo = Infinity, hi = -Infinity;
    series.forEach(function (s) { s.forEach(function (v2) { if (v2 < lo) lo = v2; if (v2 > hi) hi = v2; }); });
    var minSpan = curProp === "position" ? 30 : curProp === "rotation" ? 10 : curProp === "scale" ? 12 : 30;
    if (hi - lo < minSpan) { var mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    return { chans: chans, series: series, lo: lo, hi: hi };
  }
  function chansOf(item, prop) {
    if (prop === "position") return item.axis ? [item.axis] : ["x", "y"];
    return [prop === "rotation" ? "r" : prop === "scale" ? "s" : "o"];
  }

  function frame() {
    if (!curItem) return;
    var cv = ui.pstage.cv, f = U.fit(cv), g = cv.getContext("2d"), w = f.w, h = f.h, ac = U.accent();
    var t = ((performance.now() - t0) / 1000) % CYCLE, item = curItem, o = item.sim(t, vals, curProp), K = h / 540, gh = h * 0.28;
    g.setTransform(f.d, 0, 0, f.d, 0, 0);
    g.clearRect(0, 0, w, h);
    // soft stage light
    var bg = g.createRadialGradient(w / 2, h * 0.36, 4, w / 2, h * 0.36, w * 0.6);
    bg.addColorStop(0, "rgba(120,110,200,.20)"); bg.addColorStop(1, "rgba(13,12,20,0)");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.07)";
    var gx, gy;
    for (gx = 14; gx < w; gx += 22) for (gy = 14; gy < h * 0.68; gy += 22) g.fillRect(gx, gy, 1.3, 1.3);

    var cx = w / 2, cy = h * 0.36, sz = h * 0.2;
    function drawBox(ob, alpha, ghost) {
      var px = cx + (ob.x || 0) * K, py = cy + (ob.y || 0) * K, sc = (ob.s || 100) / 100, sx = sc * (ob.sx || 1), sy = sc * (ob.sy || 1), a = alpha * clamp((ob.o === undefined ? 100 : ob.o) / 100, 0, 1);
      g.save();
      g.translate(px, py); g.rotate((ob.r || 0) * Math.PI / 180); g.scale(sx, sy);
      U.rrect(g, -sz / 2, -sz / 2, sz, sz, sz * 0.26);
      if (ghost) { g.setLineDash([4, 4]); g.strokeStyle = "rgba(255,255,255," + (0.42 * alpha) + ")"; g.lineWidth = 1.4; g.stroke(); }
      else {
        var gr = g.createLinearGradient(0, -sz / 2, 0, sz / 2);
        gr.addColorStop(0, rgba(ac, a)); gr.addColorStop(1, rgba([ac[0] * 0.78, ac[1] * 0.74, ac[2] * 0.6], a));
        g.shadowColor = rgba(ac, 0.45 * a); g.shadowBlur = 18;
        g.fillStyle = gr; g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = "rgba(255,255,255," + (0.5 * a) + ")"; g.lineWidth = 1; g.stroke();
        // an eye mark so rotation reads clearly
        g.fillStyle = "rgba(20,20,24," + (0.75 * a) + ")";
        g.beginPath(); g.arc(-sz * 0.14, -sz * 0.08, sz * 0.055, 0, 6.3); g.arc(sz * 0.14, -sz * 0.08, sz * 0.055, 0, 6.3); g.fill();
        g.fillRect(-sz * 0.12, sz * 0.14, sz * 0.24, sz * 0.045);
      }
      g.restore();
    }
    // rest pose and, for Follow, the leader
    drawBox(base(), 1, true);
    if (item.leader) drawBox(item.leader(t, curProp), 0.9, true);
    // a trail for movement
    if (curProp === "position" || item.needsMove) {
      var i, tt, oo;
      for (i = 9; i >= 1; i--) {
        tt = t - i * 0.035;
        if (tt < 0) continue;
        oo = item.sim(tt, vals, curProp);
        g.fillStyle = rgba(ac, 0.28 * (1 - i / 10));
        g.beginPath(); g.arc(cx + (oo.x || 0) * K, cy + (oo.y || 0) * K, sz * 0.13 * (1 - i / 14), 0, 6.3); g.fill();
      }
    }
    drawBox(o, 1, false);

    // the value graph over one loop
    var gx0 = 14, gx1 = w - 14, gy0 = h - gh - 12, gy1 = h - 12;
    g.fillStyle = "rgba(255,255,255,.05)"; U.rrect(g, gx0 - 6, gy0 - 8, gx1 - gx0 + 12, gh + 16, 12); g.fill();
    if (!plot || f.dirty) { plot = samplePlot(w, h); cv.__dirty = false; }
    var span = plot.hi - plot.lo, pad = span * 0.12, lo = plot.lo - pad, hi = plot.hi + pad;
    function PX(tm) { return gx0 + tm / CYCLE * (gx1 - gx0); }
    function PY(v) { return gy1 - (v - lo) / (hi - lo) * (gh); }
    // the rest line
    var rest = curProp === "scale" || curProp === "opacity" ? 100 : 0;
    if (rest >= lo && rest <= hi) { g.strokeStyle = "rgba(255,255,255,.1)"; g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(gx0, PY(rest)); g.lineTo(gx1, PY(rest)); g.stroke(); g.setLineDash([]); }
    if (item.keyTimes) {
      item.keyTimes.forEach(function (kt) {
        var kx = PX(kt), ky = gy0 + gh / 2;
        g.save(); g.translate(kx, ky); g.rotate(Math.PI / 4); g.fillStyle = "rgba(255,255,255,.7)"; g.fillRect(-3, -3, 6, 6); g.restore();
        g.strokeStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.moveTo(kx, gy0); g.lineTo(kx, gy1); g.stroke();
      });
    }
    var c, n = plot.series[0].length;
    g.lineJoin = "round"; g.lineCap = "round";
    for (c = 0; c < plot.chans.length; c++) {
      g.strokeStyle = c === 0 ? rgba(ac, 1) : "rgba(255,255,255,.62)"; g.lineWidth = c === 0 ? 2 : 1.4;
      g.beginPath();
      for (i = 0; i < n; i++) { var px2 = PX(i / (n - 1) * CYCLE), py2 = PY(plot.series[c][i]); if (i) g.lineTo(px2, py2); else g.moveTo(px2, py2); }
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 1; g.beginPath(); g.moveTo(PX(t), gy0 - 4); g.lineTo(PX(t), gy1 + 4); g.stroke();
    for (c = 0; c < plot.chans.length; c++) {
      var v0 = o[plot.chans[c]];
      g.fillStyle = c === 0 ? rgba(ac, 1) : "#fff"; g.beginPath(); g.arc(PX(t), PY(v0), 3.4, 0, 6.3); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,.45)"; g.font = "600 9.5px Outfit, sans-serif"; g.textAlign = "left";
    g.fillText(PROP_NAME[curProp].toUpperCase() + (plot.chans.length === 1 && curProp === "position" ? " " + plot.chans[0].toUpperCase() : ""), gx0, gy0 - 14);
  }

  function build(el) {
    E = U.env();
    st = S.store("expr", { item: "wiggle", prop: "position", ctl: true, vals: {}, itemProp: {} });
    if (!st.vals || typeof st.vals !== "object") st.vals = {};
    if (!st.itemProp || typeof st.itemProp !== "object") st.itemProp = {};

    ui.pstage = U.stage(56.25);
    el.appendChild(ui.pstage.el);
    ui.sub = mk("div", "xsub"); el.appendChild(ui.sub);

    ui.pills = mk("div", "xpills");
    ITEMS.forEach(function (it) {
      var b = mk("button", "xpill", '<i style="background:rgb(' + it.dot.join(",") + ')"></i>' + esc(it.name));
      b.type = "button"; b.setAttribute("data-id", it.id);
      b.addEventListener("click", function () { pickItem(it.id); });
      ui.pills.appendChild(b);
    });
    el.appendChild(ui.pills);

    var card = mk("div", "card2");
    ui.ctrl = mk("div", "xctrl");
    ui.ctl = U.toggle("Sliders in After Effects", st.ctl, function (v) { st.ctl = v; regen(); E.save(); });
    card.appendChild(ui.ctrl);
    el.appendChild(card);

    el.appendChild(U.head("Expression"));
    // the code is for reading (and copying): it can not be edited or deleted here, so it always matches the sliders
    ui.code = mk("textarea", "codebox"); ui.code.spellcheck = false; ui.code.setAttribute("wrap", "off"); ui.code.readOnly = true;
    ui.code.setAttribute("aria-readonly", "true");
    ["cut", "paste", "drop", "beforeinput"].forEach(function (ev) { ui.code.addEventListener(ev, function (e) { e.preventDefault(); }); });
    ui.code.addEventListener("keydown", function (e) { e.stopPropagation(); });
    el.appendChild(ui.code);
    el.appendChild(U.note("Select a layer (or click the property itself in the timeline) and press Apply. The code follows your sliders; it is locked here so it can never be broken by accident."));

    var acts = mk("div", "gacts");
    ui.clear = U.ghostBtn("Remove expression from selection", function () { clearExpr(); }, "Takes the expression off the selected property");
    acts.appendChild(ui.clear);
    el.appendChild(acts);

    pickItem(byId(st.item).id);
  }

  function clearExpr() {
    var g = E.gate();
    if (g) { E.toast(g, true); return; }
    ui.clear.classList.add("busy");
    E.call("ops_exprClear").then(function (r) {
      ui.clear.classList.remove("busy");
      if (r && r.ok) E.toast("Expression removed from " + r.cleared + " propert" + (r.cleared === 1 ? "y" : "ies"));
      else E.toast((r && r.error) || "Select the property that has the expression", true);
    });
  }

  S.register("expr", {
    title: "Expressions", rgb: [191, 90, 242], icon: "code", build: build,
    frame: frame,
    show: function () { t0 = performance.now(); plot = null; },
    resize: function () { plot = null; },
    refresh: function () { plot = null; },
    dock: function () {
      var g = E.gate(), s = E.sel(), name = curItem ? curItem.name : "Expressions";
      var hint = g || (!s.hasComp ? "Open a composition first" : s.total === 0 ? "Select a layer, or a property" : "→ " + PROP_NAME[curProp] + " of " + (s.total > 1 ? s.total + " layers" : "your layer") + " (or the selected property)");
      return { name: name, hint: hint, ok: !g && s.hasComp, label: "Apply" };
    },
    apply: function () {
      var g = E.gate();
      if (g) return Promise.resolve({ ok: false, msg: g });
      var code = ui.code.value.trim();
      if (!code) return Promise.resolve({ ok: false, msg: "There is no expression to apply" });
      var useCtl = !!st.ctl && curItem.params.some(function (p) { return !p.choice; });
      return E.call("ops_expr", { name: curItem.name, expr: code, target: curProp, ctl: useCtl ? ctlList(curItem, curProp, vals) : [], bake: !useCtl, needKeys: !!curItem.keys }).then(function (r) {
        if (r && r.ok) {
          var w = r.warnings || [];
          return { ok: true, msg: "“" + curItem.name + "” on " + r.applied + " propert" + (r.applied === 1 ? "y" : "ies") + (w.length ? " · " + w.length + " note" + (w.length > 1 ? "s" : "") : ""), warn: w[0], done: "Applied" };
        }
        return { ok: false, msg: (r && r.error) || "Could not apply the expression" };
      });
    }
  });

  S._expr = { ITEMS: ITEMS, buildCode: buildCode, ctlList: ctlList, pspec: pspec, vnoise: vnoise };
})();
