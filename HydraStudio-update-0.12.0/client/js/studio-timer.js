/* Hydra Studio · studio-timer.js
 * Timer: makes a text layer whose Source Text is a counter expression (stopwatch, countdown, number, percent, money, clock).
 * The stage plays the same counter live while you adjust it. Numbers can be tuned later inside After Effects (Slider Controls).
 */
(function () {
  "use strict";
  var S = window.Studio, U = S.u, mk = U.mk, clamp = U.clamp, esc = U.esc, rgba = U.rgba;
  var E = null;

  var TYPES = [
    { id: "stopwatch", name: "Stopwatch", sub: "Counts up", dot: [48, 209, 88] },
    { id: "countdown", name: "Countdown", sub: "Counts down to zero", dot: [255, 69, 58] },
    { id: "number", name: "Number", sub: "Counts from one number to another", dot: [10, 132, 255] },
    { id: "percent", name: "Percent", sub: "0 to 100 %", dot: [191, 90, 242] },
    { id: "money", name: "Money", sub: "A growing amount with separators", dot: [255, 196, 0] },
    { id: "clock", name: "Clock", sub: "A running time of day", dot: [90, 200, 250] }
  ];
  var TF = [["m:ss", "1:05"], ["mm:ss", "01:05"], ["h:mm:ss", "0:01:05"], ["s.cc", "65.00"], ["mm:ss.cc", "01:05.00"]];
  var EASES = [["linear", "Linear"], ["ease", "Smooth"], ["easeOut", "Fast start"], ["easeIn", "Slow start"]];
  var SW = ["#FFFFFF", "#151517", "#FFD800", "#FF9F0A", "#FF375F", "#BF5AF2", "#0A84FF", "#30D158"];

  var DEFAULTS = {
    type: "stopwatch", color: "#FFFFFF", size: 160, span: 5, at: "playhead", font: "", ctl: true,
    v: {
      stopwatch: { start: 0, speed: 1, fmt: "mm:ss.cc", run: "speed", end: 170, dur: 5, ease: "linear" },
      countdown: { from: 10, speed: 1, fmt: "m:ss" },
      number: { from: 0, to: 1000, dur: 3, dec: 0, ease: "easeOut", sep: true, pre: "", suf: "" },
      percent: { from: 0, to: 100, dur: 3, dec: 0, ease: "ease", sep: false, pre: "", suf: "%" },
      money: { from: 0, to: 2400, dur: 3, dec: 0, ease: "easeOut", sep: true, pre: "$", suf: "" },
      clock: { hh: 9, mm: 41, ss: 0, speed: 60, h12: false, secs: true, run: "speed", eh: 10, em: 30, es: 0, dur: 5, ease: "linear" }
    }
  };

  // ------------------------------------------------------------------ the counters (JavaScript twin of each expression)
  function pad(n, l) { var s = "" + n; while (s.length < l) s = "0" + s; return s; }
  function group(str) { var out = "", c = 0, i; for (i = str.length - 1; i >= 0; i--) { out = str.charAt(i) + out; c++; if (c % 3 === 0 && i > 0) out = "," + out; } return out; }
  function lin(t, a, b, x, y) { if (t <= a) return x; if (t >= b) return y; return x + (y - x) * (t - a) / (b - a); }
  var EASEFN = {
    linear: function (t, a, b, x, y) { return lin(t, a, b, x, y); },
    ease: function (t, a, b, x, y) { var u = clamp((t - a) / (b - a), 0, 1); return x + (y - x) * (u * u * (3 - 2 * u)); },
    easeIn: function (t, a, b, x, y) { var u = clamp((t - a) / (b - a), 0, 1); return x + (y - x) * (u * u * u); },
    easeOut: function (t, a, b, x, y) { var u = clamp((t - a) / (b - a), 0, 1); return x + (y - x) * (1 - Math.pow(1 - u, 3)); }
  };
  // note: AE's own ease functions are used in the expression; this twin is only for the preview, so a cubic stands in for them

  var EPS = 0.0001;   // frame times are never exact: nudge so 3.4 s does not show as 3.39
  function timeText(t, fmt, down) {
    var whole = down ? Math.ceil(t - EPS) : Math.floor(t + EPS);
    if (fmt === "s.cc" || fmt === "mm:ss.cc") {
      var tt = Math.max(0, t) + EPS, c = Math.floor((tt % 1) * 100), m = Math.floor(tt / 60), s = Math.floor(tt % 60);
      return fmt === "s.cc" ? Math.floor(tt) + "." + pad(c, 2) : pad(m, 2) + ":" + pad(s, 2) + "." + pad(c, 2);
    }
    var m2 = Math.floor(whole / 60), s2 = whole % 60;
    if (fmt === "m:ss") return m2 + ":" + pad(s2, 2);
    if (fmt === "mm:ss") return pad(m2, 2) + ":" + pad(s2, 2);
    return Math.floor(whole / 3600) + ":" + pad(Math.floor(whole / 60) % 60, 2) + ":" + pad(s2, 2);
  }
  function numText(v, P) {
    var d = Math.round(P.dec), a = Math.abs(v).toFixed(d).split("."), ip = P.sep ? group(a[0]) : a[0];
    return P.pre + (v < 0 ? "-" : "") + ip + (a.length > 1 ? "." + a[1] : "") + P.suf;
  }
  function ranged(type, P) { return (type === "stopwatch" || type === "clock") && P.run === "range"; }
  // an end time earlier than the start time means "the next day" (23:00 to 01:00)
  function clockEnd(P) { var a = P.hh * 3600 + P.mm * 60 + P.ss, b = P.eh * 3600 + P.em * 60 + P.es; if (b < a) b += 86400; return b; }
  function textAt(type, P, t) {
    if (type === "stopwatch") return timeText(ranged(type, P) ? EASEFN[P.ease](Math.max(0, t), 0, P.dur, P.start, P.end) : Math.max(0, t * P.speed) + P.start, P.fmt, false);
    if (type === "countdown") return timeText(Math.max(0, P.from - t * P.speed), P.fmt, true);
    if (type === "clock") {
      var tot = (ranged(type, P) ? EASEFN[P.ease](Math.max(0, t), 0, P.dur, P.hh * 3600 + P.mm * 60 + P.ss, clockEnd(P)) : P.hh * 3600 + P.mm * 60 + P.ss + t * P.speed) + EPS, h = Math.floor(tot / 3600) % 24, m = Math.floor(tot / 60) % 60, s = Math.floor(tot % 60), hs = h;
      if (P.h12) hs = h % 12 || 12;
      return (P.h12 ? hs : pad(hs, 2)) + ":" + pad(m, 2) + (P.secs ? ":" + pad(s, 2) : "") + (P.h12 ? (h >= 12 ? " PM" : " AM") : "");
    }
    var tt = Math.max(0, t), v = P.dur > 0 ? EASEFN[P.ease](tt, 0, P.dur, P.from, P.to) : P.to;
    return numText(v, P);
  }
  function lengthOf(type, P) {
    if (ranged(type, P)) return Math.max(0.5, P.dur);
    if (type === "number" || type === "percent" || type === "money") return Math.max(0.5, P.dur);
    if (type === "countdown") return Math.max(0.5, P.from / Math.max(0.01, P.speed));
    return 5;
  }

  // ------------------------------------------------------------------ the expression text
  function q(s) { return JSON.stringify(String(s)); }
  var PADFN = 'function pad(n, l) { var s = "" + n; while (s.length < l) s = "0" + s; return s; }';
  var GROUPFN = 'function group(str) {\n  var out = "", c = 0, i;\n  for (i = str.length - 1; i >= 0; i--) {\n    out = str.charAt(i) + out; c++;\n    if (c % 3 === 0 && i > 0) out = "," + out;\n  }\n  return out;\n}';
  function fmtBody(fmt, down) {
    var w = down ? "Math.ceil(t - 0.0001)" : "Math.floor(t + 0.0001)";
    if (fmt === "s.cc") return "var u = t + 0.0001;\n" + 'Math.floor(u) + "." + pad(Math.floor((u % 1) * 100), 2);';
    if (fmt === "mm:ss.cc") return "var u = t + 0.0001;\n" + 'pad(Math.floor(u / 60), 2) + ":" + pad(Math.floor(u % 60), 2) + "." + pad(Math.floor((u % 1) * 100), 2);';
    if (fmt === "m:ss") return "var w = " + w + ';\nMath.floor(w / 60) + ":" + pad(w % 60, 2);';
    if (fmt === "mm:ss") return "var w = " + w + ';\npad(Math.floor(w / 60), 2) + ":" + pad(w % 60, 2);';
    return "var w = " + w + ';\nMath.floor(w / 3600) + ":" + pad(Math.floor(w / 60) % 60, 2) + ":" + pad(w % 60, 2);';
  }
  // refs: when useCtl, numbers are read from Slider Controls (unless they are too big for a slider)
  function ref(useCtl, name, v, big) {
    if (useCtl && !(big && Math.abs(v) > 1e6)) return 'effect("' + name + '")(1)';
    return U.trimNum(v, 4);
  }
  function buildCode(type, P, useCtl) {
    var L = [], v;
    if (type === "stopwatch" && ranged(type, P)) {
      L.push("var start = " + ref(useCtl, "Counter Start", P.start) + ";");
      L.push("var end = " + ref(useCtl, "Counter End", P.end) + ";");
      L.push("var dur = " + ref(useCtl, "Counter Duration", P.dur) + ";");
      L.push("var t = " + P.ease + "(Math.max(0, time - inPoint), 0, dur, start, end);");
      L.push(PADFN);
      L.push(fmtBody(P.fmt, false));
    } else if (type === "stopwatch") {
      L.push("var start = " + ref(useCtl, "Counter Start", P.start) + ";");
      L.push("var speed = " + ref(useCtl, "Counter Speed", P.speed) + ";");
      L.push("var t = Math.max(0, (time - inPoint) * speed) + start;");
      L.push(PADFN);
      L.push(fmtBody(P.fmt, false));
    } else if (type === "countdown") {
      L.push("var from = " + ref(useCtl, "Counter From", P.from) + ";");
      L.push("var speed = " + ref(useCtl, "Counter Speed", P.speed) + ";");
      L.push("var t = Math.max(0, from - (time - inPoint) * speed);");
      L.push(PADFN);
      L.push(fmtBody(P.fmt, true));
    } else if (type === "clock") {
      L.push("var hr = " + ref(useCtl, "Clock Hour", P.hh) + ", mn = " + ref(useCtl, "Clock Minute", P.mm) + ", sc = " + ref(useCtl, "Clock Second", P.ss) + ";");
      if (ranged(type, P)) {
        L.push("var eh = " + ref(useCtl, "Clock End Hour", P.eh) + ", em = " + ref(useCtl, "Clock End Minute", P.em) + ", es = " + ref(useCtl, "Clock End Second", P.es) + ";");
        L.push("var dur = " + ref(useCtl, "Clock Duration", P.dur) + ";");
        L.push("var a = hr * 3600 + mn * 60 + sc, b = eh * 3600 + em * 60 + es;");
        L.push("if (b < a) b += 86400;");
        L.push("var t = " + P.ease + "(Math.max(0, time - inPoint), 0, dur, a, b) + 0.0001;");
      } else {
        L.push("var speed = " + ref(useCtl, "Clock Speed", P.speed) + ";");
        L.push("var t = hr * 3600 + mn * 60 + sc + (time - inPoint) * speed + 0.0001;");
      }
      L.push("var h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = Math.floor(t % 60);");
      L.push(PADFN);
      if (P.h12) L.push('var hs = h % 12 || 12;\nhs + ":" + pad(m, 2)' + (P.secs ? ' + ":" + pad(s, 2)' : "") + ' + (h >= 12 ? " PM" : " AM");');
      else L.push('pad(h, 2) + ":" + pad(m, 2)' + (P.secs ? ' + ":" + pad(s, 2)' : "") + ";");
    } else {
      L.push("var from = " + ref(useCtl, "Counter From", P.from, true) + ";");
      L.push("var to = " + ref(useCtl, "Counter To", P.to, true) + ";");
      L.push("var dur = " + ref(useCtl, "Counter Duration", P.dur) + ";");
      L.push("var dec = Math.round(" + ref(useCtl, "Counter Decimals", P.dec) + ");");
      L.push("var t = Math.max(0, time - inPoint);");
      L.push("var v = dur > 0 ? " + P.ease + "(t, 0, dur, from, to) : to;");
      if (P.sep) L.push(GROUPFN);
      L.push("var a = Math.abs(v).toFixed(dec).split(\".\");");
      v = P.sep ? "group(a[0])" : "a[0]";
      L.push(q(P.pre) + ' + (v < 0 ? "-" : "") + ' + v + ' + (a.length > 1 ? "." + a[1] : "") + ' + q(P.suf) + ";");
    }
    return L.join("\n");
  }
  function ctlList(type, P) {
    var o = [];
    function add(n, v, big) { if (!(big && Math.abs(v) > 1e6)) o.push({ n: n, v: U.round(v, 4) }); }
    if (type === "stopwatch") { add("Counter Start", P.start); if (ranged(type, P)) { add("Counter End", P.end); add("Counter Duration", P.dur); } else add("Counter Speed", P.speed); }
    else if (type === "countdown") { add("Counter From", P.from); add("Counter Speed", P.speed); }
    else if (type === "clock") {
      add("Clock Hour", P.hh); add("Clock Minute", P.mm); add("Clock Second", P.ss);
      if (ranged(type, P)) { add("Clock End Hour", P.eh); add("Clock End Minute", P.em); add("Clock End Second", P.es); add("Clock Duration", P.dur); } else add("Clock Speed", P.speed);
    }
    else { add("Counter From", P.from, true); add("Counter To", P.to, true); add("Counter Duration", P.dur); add("Counter Decimals", P.dec); }
    return o;
  }

  // ------------------------------------------------------------------ the pane
  var st, ui = {}, type = "stopwatch", P = null, t0 = 0;

  function curDef() { var i; for (i = 0; i < TYPES.length; i++) if (TYPES[i].id === type) return TYPES[i]; return TYPES[0]; }

  function regen() {
    ui.code.value = buildCode(type, P, st.ctl);
    ui.code.rows = Math.min(18, ui.code.value.split("\n").length + 1);

    ui.pstage.tag.textContent = textAt(type, P, 0) + "  →  " + textAt(type, P, lengthOf(type, P));
    E.dockChanged();
  }

  function numField(label, key, opts) {
    var w = mk("label", "nfield"), s = mk("span", "", esc(label)), inp = mk("input");
    inp.type = "number"; inp.step = String(opts.step || 1); inp.autocomplete = "off";
    inp.value = U.trimNum(P[key], 4);
    inp.addEventListener("input", function () {
      var v = parseFloat(inp.value);
      if (!isFinite(v)) return;
      P[key] = clamp(v, opts.min === undefined ? -1e9 : opts.min, opts.max === undefined ? 1e9 : opts.max);
      regen();
    });
    inp.addEventListener("change", function () { inp.value = U.trimNum(P[key], 4); E.save(); });
    inp.addEventListener("keydown", function (e) { e.stopPropagation(); });
    w.appendChild(s); w.appendChild(inp);
    return w;
  }
  function textField(label, key, ph) {
    var w = mk("label", "nfield"), s = mk("span", "", esc(label)), inp = mk("input");
    inp.type = "text"; inp.maxLength = 12; inp.placeholder = ph || ""; inp.spellcheck = false; inp.autocomplete = "off"; inp.value = P[key];
    inp.addEventListener("input", function () { P[key] = inp.value; regen(); });
    inp.addEventListener("change", function () { E.save(); });
    inp.addEventListener("keydown", function (e) { e.stopPropagation(); });
    w.appendChild(s); w.appendChild(inp);
    return w;
  }
  function sl(label, key, min, max, step, fmt) {
    return U.slider({ label: label, min: min, max: max, step: step, value: P[key], fmt: fmt, def: DEFAULTS.v[type][key], onInput: function (v) { P[key] = v; regen(); }, onChange: function () { E.save(); } }).el;
  }

  // a time typed as 170, 2:50 or 1:02:30  ->  seconds
  function parseTime(str) {
    var parts = String(str).trim().split(":"), i, v = 0;
    if (!str || parts.length > 3) return NaN;
    for (i = 0; i < parts.length; i++) { if (!/^\d+(\.\d+)?$/.test(parts[i].trim())) return NaN; v = v * 60 + parseFloat(parts[i]); }
    return v;
  }
  function showTime(v) { var h = Math.floor(v / 3600), m = Math.floor(v / 60) % 60, s = Math.round((v % 60) * 100) / 100; return (h ? h + ":" + pad(m, 2) : m) + ":" + (s < 10 ? "0" : "") + s; }
  function timeField(label, key) {
    var w = mk("label", "nfield"), sp = mk("span", "", esc(label)), inp = mk("input");
    inp.type = "text"; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = "m:ss"; inp.value = showTime(P[key]);
    inp.addEventListener("input", function () { var v = parseTime(inp.value); if (isFinite(v)) { P[key] = clamp(v, 0, 359999); regen(); } });
    inp.addEventListener("change", function () { inp.value = showTime(P[key]); E.save(); });
    inp.addEventListener("keydown", function (e) { e.stopPropagation(); });
    w.appendChild(sp); w.appendChild(inp);
    return w;
  }
  function secFmt(v) { var m = Math.floor(v / 60), r = Math.round(v % 60); return m > 0 ? m + ":" + pad(r, 2) : v + " s"; }
  // Speed = runs by itself at a speed; To a time = goes from one time to another over a set number of seconds
  function runSeg() {
    var w = mk("div", "xchoice"); w.appendChild(mk("span", "", "Runs"));
    w.appendChild(U.seg([["speed", "At a speed"], ["range", "From → to a time"]], P.run, function (v) { P.run = v; buildParams(); regen(); t0 = performance.now(); E.save(); }).el);
    return w;
  }
  function easeSeg() {
    var w = mk("div", "xchoice"); w.appendChild(mk("span", "", "Motion"));
    w.appendChild(U.seg(EASES, P.ease, function (v) { P.ease = v; regen(); E.save(); }, "wrap").el);
    return w;
  }

  function buildParams() {
    var box = ui.params, def = DEFAULTS.v[type], row;
    box.innerHTML = "";
    P = st.v[type];
    Object.keys(def).forEach(function (k) { if (P[k] === undefined || typeof P[k] !== typeof def[k]) P[k] = def[k]; });
    if (type === "stopwatch" || type === "countdown") {
      if (type === "stopwatch") {
        box.appendChild(runSeg());
        if (ranged(type, P)) {
          row = mk("div", "ngrid");
          row.appendChild(timeField("From (m:ss)", "start"));
          row.appendChild(timeField("To (m:ss)", "end"));
          box.appendChild(row);
          box.appendChild(sl("Takes", "dur", 0.5, 60, 0.5, function (v) { return v.toFixed(1) + " s"; }));
          box.appendChild(easeSeg());
        } else {
          box.appendChild(sl("Start at", "start", 0, 600, 1, function (v) { return v + " s"; }));
          box.appendChild(sl("Speed", "speed", 0.1, 10, 0.1, function (v) { return v.toFixed(1) + "×"; }));
        }
      } else {
        box.appendChild(sl("From", "from", 1, 600, 1, function (v) { return v + " s"; }));
        box.appendChild(sl("Speed", "speed", 0.1, 10, 0.1, function (v) { return v.toFixed(1) + "×"; }));
      }
      var fw = mk("div", "xchoice"); fw.appendChild(mk("span", "", "Show as"));
      fw.appendChild(U.seg(TF.map(function (f) { return [f[0], f[1]]; }), P.fmt, function (v) { P.fmt = v; regen(); E.save(); }, "wrap").el);
      box.appendChild(fw);
    } else if (type === "clock") {
      box.appendChild(runSeg());
      var rg = ranged(type, P);
      box.appendChild(mk("div", "xsub2", rg ? "From" : "Start time"));
      box.appendChild(sl("Hour", "hh", 0, 23, 1, function (v) { return pad(v, 2); }));
      box.appendChild(sl("Minute", "mm", 0, 59, 1, function (v) { return pad(v, 2); }));
      box.appendChild(sl("Second", "ss", 0, 59, 1, function (v) { return pad(v, 2); }));
      if (rg) {
        box.appendChild(mk("div", "xsub2", "To"));
        box.appendChild(sl("Hour", "eh", 0, 23, 1, function (v) { return pad(v, 2); }));
        box.appendChild(sl("Minute", "em", 0, 59, 1, function (v) { return pad(v, 2); }));
        box.appendChild(sl("Second", "es", 0, 59, 1, function (v) { return pad(v, 2); }));
        box.appendChild(sl("Takes", "dur", 0.5, 60, 0.5, function (v) { return v.toFixed(1) + " s"; }));
        box.appendChild(easeSeg());
      } else box.appendChild(sl("Speed", "speed", 1, 3600, 1, function (v) { return v === 1 ? "Real time" : v + "×"; }));
      box.appendChild(U.toggle("12-hour clock (AM / PM)", P.h12, function (v) { P.h12 = v; regen(); E.save(); }).el);
      box.appendChild(U.toggle("Show seconds", P.secs, function (v) { P.secs = v; regen(); E.save(); }).el);
    } else {
      row = mk("div", "ngrid");
      row.appendChild(numField("From", "from", { step: 1 }));
      row.appendChild(numField("To", "to", { step: 1 }));
      box.appendChild(row);
      box.appendChild(sl("Duration", "dur", 0.5, 20, 0.1, function (v) { return v.toFixed(1) + " s"; }));
      box.appendChild(sl("Decimals", "dec", 0, 3, 1, function (v) { return String(v); }));
      var ew = mk("div", "xchoice"); ew.appendChild(mk("span", "", "Motion"));
      ew.appendChild(U.seg(EASES, P.ease, function (v) { P.ease = v; regen(); E.save(); }, "wrap").el);
      box.appendChild(ew);
      row = mk("div", "ngrid");
      row.appendChild(textField("Before", "pre", "$"));
      row.appendChild(textField("After", "suf", "%"));
      box.appendChild(row);
      box.appendChild(U.toggle("Thousands separator", P.sep, function (v) { P.sep = v; regen(); E.save(); }).el);
    }
    var big = type === "number" || type === "money" || type === "percent";
    ui.ctlRow.show(true);
    box.appendChild(ui.ctlRow.el);
    if (big) { /* from / to above 1,000,000 are written into the expression instead of a slider */ }
  }

  function pickType(id) {
    type = id; st.type = id;
    Array.prototype.forEach.call(ui.pills.children, function (c) { c.classList.toggle("on", c.getAttribute("data-id") === id); });
    ui.pstage.name.textContent = curDef().name;
    ui.sub.textContent = curDef().sub;
    buildParams();
    regen();
    t0 = performance.now();
    E.save();
  }

  // ---- stage
  function frame() {
    var cv = ui.pstage.cv, f = U.fit(cv), g = cv.getContext("2d"), w = f.w, h = f.h, ac = U.accent();
    var len = lengthOf(type, P), cyc = len + 1.2, t = Math.min(len, ((performance.now() - t0) / 1000) % cyc);
    if ((type === "clock" || type === "stopwatch") && !ranged(type, P)) { cyc = 6; t = ((performance.now() - t0) / 1000) % cyc; }
    var txt = textAt(type, P, t);
    g.setTransform(f.d, 0, 0, f.d, 0, 0);
    g.clearRect(0, 0, w, h);
    var bg = g.createRadialGradient(w / 2, h * 0.5, 4, w / 2, h * 0.5, w * 0.62);
    bg.addColorStop(0, "rgba(120,110,200,.20)"); bg.addColorStop(1, "rgba(13,12,20,0)");
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // text in fixed cells so the digits do not jitter, the way tabular figures behave
    var col = st.color, size = clamp(st.size, 30, 420) / 1080 * h * 1.5, font = "600 " + size + "px Outfit, -apple-system, sans-serif";
    g.font = font; g.textBaseline = "alphabetic"; g.textAlign = "left";
    var cell = g.measureText("0").width, chars = txt.split(""), widths = chars.map(function (c) { return /[0-9]/.test(c) ? cell : g.measureText(c).width; }), total = widths.reduce(function (a, b) { return a + b; }, 0);
    var maxW = w * 0.9;
    if (total > maxW) { size *= maxW / total; font = "600 " + size + "px Outfit, -apple-system, sans-serif"; g.font = font; cell = g.measureText("0").width; widths = chars.map(function (c) { return /[0-9]/.test(c) ? cell : g.measureText(c).width; }); total = widths.reduce(function (a, b) { return a + b; }, 0); }
    var x = (w - total) / 2, y = h / 2 + size * 0.35, i;
    g.fillStyle = col; g.shadowColor = rgba(U.hexToRgb(col), 0.35); g.shadowBlur = 24;
    for (i = 0; i < chars.length; i++) {
      var cw = widths[i], tw = g.measureText(chars[i]).width;
      g.fillText(chars[i], x + (cw - tw) / 2, y);
      x += cw;
    }
    g.shadowBlur = 0;
    // progress hairline
    var pr = ((type === "clock" || type === "stopwatch") && !ranged(type, P)) ? (t / cyc) : clamp(t / Math.max(0.01, len), 0, 1);
    g.fillStyle = "rgba(255,255,255,.1)"; g.fillRect(w * 0.12, h - 18, w * 0.76, 3);
    g.fillStyle = rgba(ac, 0.95); g.fillRect(w * 0.12, h - 18, w * 0.76 * pr, 3);
  }

  function build(el) {
    E = U.env();
    st = S.store("timer", DEFAULTS);
    if (!st.v || typeof st.v !== "object") st.v = JSON.parse(JSON.stringify(DEFAULTS.v));
    Object.keys(DEFAULTS.v).forEach(function (k) { if (!st.v[k] || typeof st.v[k] !== "object") st.v[k] = JSON.parse(JSON.stringify(DEFAULTS.v[k])); });
    if (!/^#[0-9a-f]{6}$/i.test(st.color)) st.color = "#FFFFFF";
    st.size = clamp(Number(st.size) || 160, 30, 420); st.span = clamp(Number(st.span) || 5, 1, 120);
    if (st.at !== "start") st.at = "playhead";
    if (typeof st.font !== "string") st.font = "";
    type = TYPES.some(function (t) { return t.id === st.type; }) ? st.type : "stopwatch";

    ui.pstage = U.stage(56.25);
    el.appendChild(ui.pstage.el);
    ui.sub = mk("div", "xsub"); el.appendChild(ui.sub);
    ui.pills = mk("div", "xpills");
    TYPES.forEach(function (t) {
      var b = mk("button", "xpill", '<i style="background:rgb(' + t.dot.join(",") + ')"></i>' + esc(t.name));
      b.type = "button"; b.setAttribute("data-id", t.id);
      b.addEventListener("click", function () { pickType(t.id); });
      ui.pills.appendChild(b);
    });
    el.appendChild(ui.pills);

    var card = mk("div", "card2");
    ui.params = mk("div", "xctrl");
    ui.ctlRow = U.toggle("Sliders in After Effects", st.ctl, function (v) { st.ctl = v; regen(); E.save(); });
    card.appendChild(ui.params);
    el.appendChild(card);

    el.appendChild(U.head("Look"));
    var look = mk("div", "card2");
    look.appendChild(U.slider({ label: "Size", min: 40, max: 420, step: 5, value: st.size, def: 160, fmt: function (v) { return v + " px"; }, onInput: function (v) { st.size = v; }, onChange: function () { E.save(); } }).el);
    look.appendChild(U.slider({ label: "Length", min: 1, max: 60, step: 1, value: st.span, def: 5, fmt: function (v) { return v + " s"; }, onInput: function (v) { st.span = v; }, onChange: function () { E.save(); } }).el);
    var cw = mk("div", "xchoice"); cw.appendChild(mk("span", "", "Color"));
    ui.sw = U.swatches(SW, st.color, function (v) { st.color = v; E.save(); }, true);
    cw.appendChild(ui.sw.el); look.appendChild(cw);
    var aw = mk("div", "xchoice"); aw.appendChild(mk("span", "", "Starts"));
    aw.appendChild(U.seg([["playhead", "At the playhead"], ["start", "At the start"]], st.at, function (v) { st.at = v; E.save(); }).el);
    look.appendChild(aw);
    var ff = mk("label", "field2"); ff.appendChild(mk("span", "", "Font (optional)"));
    var fi = mk("input"); fi.type = "text"; fi.placeholder = "PostScript name, e.g. Outfit-SemiBold"; fi.value = st.font; fi.spellcheck = false;
    fi.addEventListener("input", function () { st.font = fi.value.trim(); });
    fi.addEventListener("change", function () { E.save(); });
    fi.addEventListener("keydown", function (e) { e.stopPropagation(); });
    ff.appendChild(fi); look.appendChild(ff);
    el.appendChild(look);

    el.appendChild(U.head("Expression"));
    // read-only: the code always matches the settings above and can not be broken by accident
    ui.code = mk("textarea", "codebox"); ui.code.spellcheck = false; ui.code.setAttribute("wrap", "off"); ui.code.readOnly = true;
    ui.code.setAttribute("aria-readonly", "true");
    ["cut", "paste", "drop", "beforeinput"].forEach(function (ev) { ui.code.addEventListener(ev, function (e) { e.preventDefault(); }); });
    ui.code.addEventListener("keydown", function (e) { e.stopPropagation(); });
    el.appendChild(ui.code);
    el.appendChild(U.note("Creates a text layer in the open composition. Its Source Text is the expression above; change the sliders on the layer any time."));
    pickType(type);
  }

  function hex2(c) { var r = U.hexToRgb(c); return [U.round(r[0] / 255, 4), U.round(r[1] / 255, 4), U.round(r[2] / 255, 4)]; }

  S.register("timer", {
    title: "Timer", rgb: [48, 209, 88], icon: "timer", build: build, frame: frame,
    show: function () { t0 = performance.now(); },
    dock: function () {
      var g = E.gate(), s = E.sel();
      return { name: curDef().name, hint: g || (s.hasComp ? "→ a new text layer " + (st.at === "start" ? "at the start" : "at the playhead") : "Open a composition first"), ok: !g && s.hasComp, label: "Create" };
    },
    apply: function () {
      var g = E.gate();
      if (g) return Promise.resolve({ ok: false, msg: g });
      var code = ui.code.value.trim(), useCtl = !!st.ctl;
      if (!code) return Promise.resolve({ ok: false, msg: "There is no expression to apply" });
      return E.call("ops_counter", { name: curDef().name, expr: code, ctl: useCtl ? ctlList(type, P) : [], sample: textAt(type, P, 0), size: st.size, color: hex2(st.color), font: st.font || undefined, span: st.span, at: st.at }).then(function (r) {
        if (r && r.ok) return { ok: true, msg: "Created “" + r.name + "”", done: "Created" };
        return { ok: false, msg: (r && r.error) || "Could not create the counter" };
      });
    }
  });

  S._timer = { TYPES: TYPES, DEFAULTS: DEFAULTS, buildCode: buildCode, ctlList: ctlList, textAt: textAt, TF: TF, EASES: EASES };
})();
