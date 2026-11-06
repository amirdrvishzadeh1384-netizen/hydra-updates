// Minimal bridge to Adobe's CEP runtime (same calls CSInterface.js makes, nothing else).
(function () {
  "use strict";
  // Looked up on every use: on some Windows setups the CEP bridge shows up a moment after the page starts.
  function getRaw() { return window.__adobe_cep__ || null; }
  var raw = getRaw();
  var isWin = /Win/i.test(navigator.platform || "") || /Windows/i.test(navigator.userAgent || "");
  var loadLog = [];   // what happened while loading the host script (shown in Settings > Diagnostics)

  // AE can swallow a call while it is busy or still starting and answer only much later. A timeout keeps the panel from
  // waiting forever, but a call that timed out is STILL queued inside AE, so we count them and never pile new ones on top
  // of a silent AE (that pile-up is what kept the panel stuck on "Connecting" on slower Macs).
  var stats = { sent: 0, answered: 0, late: 0, lastMs: 0, maxLateMs: 0, outstanding: 0, oldest: 0 };
  var pendingAt = {};   // id -> time sent, for calls AE has not answered yet
  var seq = 0;
  function oldestPending() { var m = 0, k, t = Date.now(); for (k in pendingAt) { if (t - pendingAt[k] > m) m = t - pendingAt[k]; } return m; }
  function evalScript(code, ms) {
    return new Promise(function (resolve) {
      raw = getRaw();
      if (!raw) { resolve(""); return; }
      var done = false, id = ++seq, t0 = Date.now();
      var timer = setTimeout(function () { if (!done) { done = true; resolve(""); } }, ms || 120000);
      pendingAt[id] = t0; stats.sent++;
      function back() { delete pendingAt[id]; stats.answered++; stats.lastMs = Date.now() - t0; }
      try {
        raw.evalScript(code, function (r) {
          back();
          if (done) { stats.late++; stats.maxLateMs = Math.max(stats.maxLateMs, Date.now() - t0); return; }
          done = true; clearTimeout(timer); resolve(r);
        });
      } catch (e) { delete pendingAt[id]; if (!done) { done = true; clearTimeout(timer); resolve(""); } }
    });
  }
  function outstanding() { var n = 0, k; for (k in pendingAt) n++; return n; }

  // JSON text that is pure ASCII: a user name with Persian / accented letters can't get mangled on the way into AE
  function lit(a) {
    return JSON.stringify(a).replace(/[\u0080-\uffff]/g, function (c) { return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4); }).split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029");
  }

  function parse(r) {
    if (!raw) return { ok: false, error: "Not running inside After Effects." };
    try {
      var parsed = JSON.parse(r);
      return parsed && typeof parsed === "object" ? parsed : { ok: false, error: String(r) };
    } catch (e) {
      return { ok: false, error: r ? String(r) : "No response from After Effects." };
    }
  }

  // Read-only calls can be retried safely when AE wasn't ready (the host script not loaded yet).
  var SAFE = { ops_ping: 1, ops_selection: 1, ops_diagnose: 1 };
  var hostLoaded = false;

  // (Re)loads host/host.jsx into AE's scripting engine. Doing it ourselves means the panel never depends on
  // AE having finished starting up when the panel opened, and it always picks up the newest host code.
  // Three ways, tried in order, so one failing path (spaces, non-English user names, a blocked file read) can't stop it:
  //   1. $.evalFile on the file   2. the same through a file:// style path   3. the script's text sent straight in (eval)
  function extDirs() {
    var out = [], a = systemPath("extension"), b = "";
    if (a) out.push(a);
    try { b = decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, "$1").replace(/\/client\/index\.html$/, ""); } catch (e) {}
    if (b && out.indexOf(b) < 0) out.push(b);
    return out;
  }
  function readHostText() {
    var dirs = extDirs(), i, fs, p;
    try { fs = window.require ? window.require("fs") : null; } catch (e) { fs = null; }
    if (fs) {
      for (i = 0; i < dirs.length; i++) {
        try { p = dirs[i].replace(/\\/g, "/") + "/host/host.jsx"; return fs.readFileSync(p.replace(/\//g, isWin ? "\\" : "/"), "utf8"); } catch (e) { loadLog.push("read " + dirs[i] + ": " + e.message); }
      }
    }
    return "";
  }
  // IMPORTANT: the load code runs at the TOP LEVEL of the evalScript call (no wrapping function). On some AE builds a file
  // loaded from inside a function defines its functions only inside that function, and they vanish when the call returns
  // ("evalFile -> ok" but typeof ops_ping === "undefined" a moment later). host.jsx also exports itself to the global object.
  function ensureHost() {
    raw = getRaw();
    if (!raw) { loadLog = ["no CEP bridge (window.__adobe_cep__ missing)"]; return Promise.resolve("no-cep"); }
    loadLog = [];
    var dirs = extDirs(), tries = [], i;
    var TAIL = "catch(e){__hsE=String(e)+' (line '+e.line+')';}__hsE||'loaded'";
    function verify(label, r) {
      loadLog.push(label + " -> " + (r === "" ? "no answer" : String(r).slice(0, 160)));
      return evalScript("typeof ops_ping", 8000).then(function (t) {
        loadLog.push("  then typeof ops_ping = " + (t === "" ? "no answer" : t));
        return String(t) === "function";
      });
    }
    for (i = 0; i < dirs.length; i++) {
      tries.push((function (d) { return function () {
        var c = "var __hsE='';try{var __hsF=new File(" + lit(d.replace(/\\/g, "/") + "/host/host.jsx") + ");if(!__hsF.exists){__hsE='missing '+__hsF.fsName;}else{$.evalFile(__hsF);}}" + TAIL;
        return evalScript(c, 15000).then(function (r) { return verify("evalFile " + d, r); });
      }; })(dirs[i]));
    }
    tries.push(function () {
      var txt = readHostText();
      if (!txt) { loadLog.push("eval text: host.jsx could not be read"); return Promise.resolve(false); }
      var c = "var __hsE='';try{eval(" + lit(txt) + ");}" + TAIL;
      return evalScript(c, 30000).then(function (r) { return verify("eval text", r); });
    });
    var k = 0;
    function next() {
      if (k >= tries.length) { hostLoaded = false; return Promise.resolve("ERR " + loadLog.join(" | ")); }
      return tries[k++]().then(function (ok) { if (ok) { hostLoaded = true; return "ok"; } return next(); });
    }
    return next();
  }

  // The one entry point the panel uses to get connected.
  //   1. ping what AE already has (cheap). If AE answers with the right host version we are done: host.jsx is NOT re-read.
  //   2. AE answered but the host is missing / old -> load host.jsx (3 ways), ping again.
  //   3. AE did not answer: send nothing more while an earlier call is still waiting inside AE (it may just be slow).
  var PING = "(function(){try{return typeof ops_ping==='function'?ops_ping():'NOFN';}catch(e){return 'ERR '+e;}})()";
  var connecting = null;
  function connect(want) {
    if (connecting) return connecting;
    connecting = (function () {
      raw = getRaw();
      if (!raw) return Promise.resolve({ ok: false, error: "Not running inside After Effects." });
      if (outstanding() > 0 && oldestPending() < 90000) {
        return Promise.resolve({ ok: false, pending: true, error: "No response from After Effects (still waiting for its answer, " + Math.round(oldestPending() / 1000) + " s)." });
      }
      function pingOnce() {
        return evalScript(PING, 25000).then(function (r) {
          r = String(r || "");
          if (!r) return { ok: false, pending: true, error: "No response from After Effects." };
          var p = null; try { p = JSON.parse(r); } catch (e) {}
          return p && typeof p === "object" ? p : { ok: false, wrong: true, error: r };
        });
      }
      return pingOnce().then(function (p) {
        if (p.ok && (!want || p.host === want)) { hostLoaded = true; return p; }
        if (p.pending) return p;
        return ensureHost().then(function (res) {
          if (res !== "ok") return { ok: false, error: "Could not load the host script: " + res };
          return pingOnce().then(function (q) { if (q.ok) hostLoaded = true; return q; });
        });
      });
    })().then(function (r) { connecting = null; return r; }, function (e) { connecting = null; return { ok: false, error: String(e) }; });
    return connecting;
  }

  // What to show in Settings > Diagnostics even when the host script does not answer at all.
  function deepCheck() {
    var lines = [], raw0 = getRaw(), env = null;
    lines.push("cep bridge: " + (raw0 ? "present" : "MISSING"));
    if (!raw0) return Promise.resolve(lines);
    try { lines.push("cep api: " + JSON.stringify(raw0.getCurrentApiVersion())); } catch (e) {}
    try { env = JSON.parse(raw0.getHostEnvironment()); lines.push("host: " + env.appName + " " + env.appVersion + " (" + env.appLocale + ")"); } catch (e) { lines.push("host env: unreadable"); }
    lines.push("webview: " + (navigator.userAgent.match(/Chrome\/[\d.]+/) || ["?"])[0] + " · " + navigator.platform);
    lines.push("calls: sent " + stats.sent + ", answered " + stats.answered + ", late " + stats.late + (stats.maxLateMs ? " (slowest " + Math.round(stats.maxLateMs / 1000) + " s)" : "") + ", waiting " + outstanding() + (outstanding() ? " (oldest " + Math.round(oldestPending() / 1000) + " s)" : ""));
    function step(label, code, ms) {
      var t0 = Date.now();
      return evalScript(code, ms || 12000).then(function (r) { lines.push(label + ": " + (r === "" ? "NO ANSWER in " + Math.round((Date.now() - t0) / 100) / 10 + " s" : String(r).slice(0, 140) + "  (" + (Date.now() - t0) + " ms)")); return r; });
    }
    var dirs = extDirs();
    return step("echo 1+1", "1+1")
      .then(function () { return step("AE", "app.version+' | '+app.buildName+' | '+$.os"); })
      .then(function () { return step("host function", "typeof ops_ping"); })
      .then(function () { return dirs.length ? step("host file", "(function(){var f=new File(" + lit(dirs[0].replace(/\\/g, "/") + "/host/host.jsx") + ");return f.exists?('exists, '+f.length+' bytes'):'MISSING '+f.fsName;})()") : lines.push("host file: no extension path"); })
      .then(function () { return lines; });
  }

  // Calls a host.jsx function with JSON-encoded arguments; always resolves to {ok, ...}.
  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1).map(lit).join(",");
    var code = fn + "(" + args + ")";
    return evalScript(code, SAFE[fn] ? 20000 : 120000).then(function (r) {
      var res = parse(r);
      var notReady = !res.ok && (!r || /^EvalScript error/i.test(String(r)));
      // "EvalScript error." means the function doesn't exist yet, so nothing ran: safe to load the host and retry once.
      if (notReady && raw && (SAFE[fn] || /^EvalScript error/i.test(String(r)))) {
        return ensureHost().then(function () { return evalScript(code, SAFE[fn] ? 20000 : 120000).then(parse); });
      }
      return res;
    });
  }

  function systemPath(type) {
    raw = getRaw();
    if (!raw) return "";
    var p = "";
    try { p = raw.getSystemPath(type) || ""; } catch (e) { return ""; }
    try { p = decodeURIComponent(p); } catch (e2) {}
    // "file:///C:/Users/..." on Windows, "file:///Users/..." on macOS
    p = p.replace(/^file:\/\/\/?/, "");
    if (!/^[A-Za-z]:/.test(p) && p.charAt(0) !== "/") p = "/" + p;
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return p;
  }

  function hostEnv() {
    try { return JSON.parse(raw.getHostEnvironment()); } catch (e) { return null; }
  }

  // 0..255 brightness of AE's own panel background (to follow its light/dark skin)
  function hostBrightness() {
    var env = hostEnv();
    try {
      var c = env.appSkinInfo.panelBackgroundColor.color;
      return (c.red + c.green + c.blue) / 3;
    } catch (e) { return null; }
  }

  function onThemeChanged(cb) {
    try { raw.addEventListener("com.adobe.csxs.events.ThemeColorChanged", cb); } catch (e) {}
  }

  window.cep = {
    get available() { return !!getRaw(); },
    loadLog: function () { return loadLog.slice(); },
    evalScript: evalScript,
    call: call,
    ensureHost: ensureHost,
    connect: connect,
    deepCheck: deepCheck,
    outstanding: outstanding,
    stats: function () { return stats; },
    hostLoaded: function () { return hostLoaded; },
    systemPath: systemPath,
    hostBrightness: hostBrightness,
    onThemeChanged: onThemeChanged,
    isWin: isWin
  };
})();
