// Hydra Studio - self-updater. Runs inside the panel (CEP gives the page Node.js).
//
//  update.json (signed)  ->  check  ->  download  ->  sha256 + size  ->  safe unzip  ->  sanity checks  ->  backup  ->  apply  ->  verify
//  Anything that goes wrong after the first file was touched puts the previous version back.
//
// Only an update signed with Otiner's private key is ever installed: the public key is inside the panel, the signature covers the
// version, the download address(es), the sha256 and the size of the package. A hacked web server or a man in the middle can't make
// the panel install anything else.
//
// Written for the older Node versions inside CEP (no fs.rm, no fs.cp, no optional chaining in the Node-facing parts).
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  if (root) root.HydraUpdate = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  var APP_ID = "studio.otiner.hydrastudio";
  var LIMITS = { feed: 64 * 1024, zip: 80 * 1024 * 1024, files: 4000, total: 200 * 1024 * 1024 };

  // ------------------------------------------------------------------ small helpers
  function err(kind, message) { var e = new Error(message); e.kind = kind; return e; }

  var FRIENDLY = {
    config: "Updates are not set up in this copy of Hydra Studio.",
    net: "Couldn't reach the update server.",
    http: "The update server didn't have the file.",
    sig: "The update's signature is not valid, so it was NOT installed.",
    feed: "The update information is not readable.",
    size: "The update file is too big or the wrong size.",
    hash: "The download is damaged (checksum mismatch), so it was NOT installed.",
    zip: "The update package is not valid, so it was NOT installed.",
    perm: "This copy can't update itself: its folder is protected. Run the installer once (install-mac.command / install-windows.bat).",
    busy: "Another Hydra Studio window is updating right now.",
    full: "This update needs a fresh install: download the full Hydra Studio zip once.",
    where: "This copy isn't an installed Hydra Studio folder, so it won't update itself.",
    apply: "The update could not be installed. Your previous version was put back."
  };
  var QUIET = { config: 1, busy: 1, full: 1, perm: 1, sig: 1, hash: 1, where: 1 };
  function friendly(e) {
    var k = e && e.kind, base = FRIENDLY[k] || "Something went wrong.", more = e ? (e.detail || e.message || "") : "";
    return base + (more && !QUIET[k] ? " (" + more + ")" : "");
  }

  function parseVersion(v) {
    var m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:\.(\d{1,4}))?$/.exec(String(v == null ? "" : v).trim());
    return m ? [+m[1], +m[2], +m[3], +(m[4] || 0)] : null;
  }
  // -1 / 0 / 1, or NaN if either is not a plain numeric version
  function compareVersions(a, b) {
    var x = parseVersion(a), y = parseVersion(b), i;
    if (!x || !y) return NaN;
    for (i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  }

  var CRC_T = null;
  function crc32(buf) {
    var i, j, c, n;
    if (!CRC_T) { CRC_T = new Array(256); for (i = 0; i < 256; i++) { c = i; for (j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_T[i] = c >>> 0; } }
    c = 0xFFFFFFFF; n = buf.length;
    for (i = 0; i < n; i++) c = CRC_T[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // A name from inside a zip: forward slashes only, relative, no "..", no drive letters.
  function normalizeName(name) {
    var n = String(name).replace(/\\/g, "/"), parts, i, p, out = [], dir;
    if (!n || n.length > 240 || n.indexOf("\u0000") >= 0) return null;
    if (n.charAt(0) === "/" || n.indexOf(":") >= 0) return null;
    dir = n.charAt(n.length - 1) === "/";
    parts = n.split("/");
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p === "" || p === ".") continue;
      if (p === "..") return null;
      out.push(p);
    }
    return out.length ? out.join("/") + (dir ? "/" : "") : null;
  }

  // ------------------------------------------------------------------ zip reader (stored + deflate, no zip64, no encryption)
  function unzip(buf, zlib) {
    var n = buf.length, i, eocd = -1, count, cdSize, cdOff, p, out = [], total = 0, seen = {};
    if (n < 22) throw err("zip", "too small");
    for (i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw err("zip", "no directory");
    count = buf.readUInt16LE(eocd + 10); cdSize = buf.readUInt32LE(eocd + 12); cdOff = buf.readUInt32LE(eocd + 16);
    if (count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) throw err("zip", "zip64 is not supported");
    if (count > LIMITS.files) throw err("zip", "too many files");
    if (cdOff + cdSize > n) throw err("zip", "directory is outside the file");
    p = cdOff;
    for (i = 0; i < count; i++) {
      if (p + 46 > n || buf.readUInt32LE(p) !== 0x02014b50) throw err("zip", "bad directory entry");
      var made = buf.readUInt16LE(p + 4), flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
      var crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
      var nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
      var ext = buf.readUInt32LE(p + 38), lho = buf.readUInt32LE(p + 42);
      if (p + 46 + nl > n) throw err("zip", "bad name");
      var raw = buf.toString("utf8", p + 46, p + 46 + nl);
      p += 46 + nl + xl + cl;
      if (flags & 1) throw err("zip", "encrypted entries are not supported");
      if ((made >> 8) === 3 && (((ext >>> 16) & 0xF000) === 0xA000)) throw err("zip", "links are not allowed");
      var name = normalizeName(raw);
      if (name === null) throw err("zip", "unsafe file name: " + raw.slice(0, 60));
      if (/^__MACOSX\//.test(name) || /(^|\/)\.DS_Store$/.test(name) || /(^|\/)Thumbs\.db$/i.test(name)) continue;
      var isDir = name.charAt(name.length - 1) === "/";
      if (isDir) { out.push({ name: name, dir: true, data: null }); continue; }
      if (seen[name]) throw err("zip", "duplicate file: " + name);
      seen[name] = 1;
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF) throw err("zip", "zip64 is not supported");
      if (usize > 60 * 1024 * 1024) throw err("zip", "a file is too big");
      total += usize; if (total > LIMITS.total) throw err("zip", "too big when unpacked");
      if (lho + 30 > n || buf.readUInt32LE(lho) !== 0x04034b50) throw err("zip", "bad file header");
      var start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
      if (start + csize > n) throw err("zip", "file data is cut off");
      var comp = buf.slice(start, start + csize), data;
      if (method === 0) { if (csize !== usize) throw err("zip", "size mismatch"); data = Buffer.from(comp); }
      else if (method === 8) { try { data = zlib.inflateRawSync(comp); } catch (e) { throw err("zip", "can't unpack " + name); } }
      else throw err("zip", "unsupported compression");
      if (data.length !== usize) throw err("zip", "size mismatch in " + name);
      if (crc32(data) !== crc) throw err("zip", "checksum mismatch in " + name);
      out.push({ name: name, dir: false, data: data });
    }
    return out;
  }

  // ------------------------------------------------------------------ the signed feed
  // update.json = { "format": 1, "payload": "<json text>", "signature": "<base64 RSA-SHA256 of the payload text>" }
  function verifyFeed(text, publicKey, crypto, appId) {
    var j, info, ok = false, i, u;
    try { j = JSON.parse(String(text)); } catch (e) { throw err("feed", "not JSON"); }
    if (!j || j.format !== 1 || typeof j.payload !== "string" || typeof j.signature !== "string") throw err("feed", "unexpected layout");
    try { var v = crypto.createVerify("RSA-SHA256"); v.update(j.payload, "utf8"); ok = v.verify(publicKey, j.signature, "base64"); } catch (e) { ok = false; }
    if (!ok) throw err("sig", "bad signature");
    try { info = JSON.parse(j.payload); } catch (e) { throw err("feed", "payload is not JSON"); }
    if (!info || info.app !== (appId || APP_ID)) throw err("feed", "this update is for another app");
    if (!parseVersion(info.version)) throw err("feed", "bad version");
    var pk = info.package;
    if (!pk || !Array.isArray(pk.urls) || !pk.urls.length || pk.urls.length > 6) throw err("feed", "no download address");
    for (i = 0; i < pk.urls.length; i++) { u = pk.urls[i]; if (typeof u !== "string" || !/^https?:\/\//i.test(u) || u.length > 500) throw err("feed", "bad download address"); }
    if (typeof pk.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(pk.sha256)) throw err("feed", "bad checksum");
    if (typeof pk.size !== "number" || !(pk.size > 0) || pk.size > LIMITS.zip || Math.floor(pk.size) !== pk.size) throw err("size", "bad size");
    if (info.min != null && !parseVersion(info.min)) throw err("feed", "bad minimum version");
    var notes = Array.isArray(info.notes) ? info.notes.filter(function (s) { return typeof s === "string"; }).slice(0, 20).map(function (s) { return s.slice(0, 300); }) : [];
    return { version: String(info.version).trim(), released: typeof info.released === "string" ? info.released.slice(0, 40) : "", notes: notes,
      urls: pk.urls.slice(), sha256: pk.sha256, size: pk.size, restart: info.restart === true, min: info.min ? String(info.min) : "" };
  }

  // ------------------------------------------------------------------ http(s) GET, redirects, size + idle limits
  function httpGet(D, url, opt) {
    opt = opt || {};
    var maxBytes = opt.maxBytes || LIMITS.feed, idle = opt.idleMs || 15000, totalMs = opt.totalMs || 120000;
    return new Promise(function (resolve, reject) {
      var done = false, redirects = 0, req = null, tt = null;
      function fail(e) { if (done) return; done = true; clearTimeout(tt); try { if (req) req.destroy(); } catch (x) {} reject(e); }
      function ok(b) { if (done) return; done = true; clearTimeout(tt); resolve(b); }
      tt = setTimeout(function () { fail(err("net", "timed out")); }, totalMs);
      function go(u) {
        var p;
        try { p = new URL(u); } catch (e) { return fail(err("net", "bad address")); }
        if (p.protocol !== "https:" && p.protocol !== "http:") return fail(err("net", "unsupported address"));
        var mod = p.protocol === "https:" ? D.https : D.http;
        var host = p.hostname.replace(/^\[|\]$/g, "");
        req = mod.get({ protocol: p.protocol, hostname: host, port: p.port || undefined, path: (p.pathname || "/") + (p.search || ""),
          headers: { "User-Agent": "HydraStudio-Updater", "Cache-Control": "no-cache", "Accept": "*/*" } }, function (res) {
          var code = res.statusCode || 0, loc = res.headers && res.headers.location;
          if (code >= 300 && code < 400 && loc) {
            res.resume();
            if (++redirects > 5) return fail(err("net", "too many redirects"));
            var next; try { next = new URL(loc, u).href; } catch (e) { return fail(err("net", "bad redirect")); }
            return go(next);
          }
          if (code !== 200) { res.resume(); var e2 = err("http", "HTTP " + code); e2.detail = "HTTP " + code; return fail(e2); }
          var len = parseInt(res.headers["content-length"], 10), got = 0, chunks = [];
          if (len > maxBytes) { res.resume(); return fail(err("size", "too big")); }
          res.on("data", function (c) {
            got += c.length;
            if (got > maxBytes) return fail(err("size", "too big"));
            chunks.push(c);
            if (opt.onProgress) { try { opt.onProgress(got, len > 0 ? len : 0); } catch (x) {} }
          });
          res.on("end", function () {
            if (len > 0 && got !== len) return fail(err("net", "connection dropped"));
            ok(Buffer.concat(chunks));
          });
          res.on("aborted", function () { fail(err("net", "connection dropped")); });
          res.on("error", function (e) { fail(err("net", e.message || "connection error")); });
          res.on("close", function () { if (!res.complete) fail(err("net", "connection dropped")); });
        });
        req.setTimeout(idle, function () { fail(err("net", "timed out")); });
        req.on("error", function (e) { fail(err("net", (e && e.message) || "connection error")); });
      }
      go(url);
    });
  }

  function defaultDeps(req) {
    return { fs: req("fs"), path: req("path"), os: req("os"), http: req("http"), https: req("https"), crypto: req("crypto"), zlib: req("zlib") };
  }

  // ------------------------------------------------------------------ the updater
  function create(o) {
    var D = o.deps, fs = D.fs, path = D.path, crypto = D.crypto;
    var extDir = o.extDir, dataDir = o.dataDir, feeds = (o.feeds || []).filter(function (u) { return typeof u === "string" && /^https?:\/\//i.test(u); });
    var pub = o.publicKey || "", cur = o.version, appId = o.appId || APP_ID, now = o.now || function () { return Date.now(); };
    var updDir = path.join(dataDir, "updates"), bakDir = path.join(dataDir, "backup"), stateFile = path.join(dataDir, "update-state.json"), lockFile = path.join(updDir, "lock");
    var S = { phase: "idle", current: cur, latest: "", released: "", notes: [], size: 0, restart: false, checkedAt: 0, error: null, progress: 0, writable: null, configured: feeds.length > 0 && /BEGIN PUBLIC KEY/.test(pub), needsFull: false, installed: "", skipped: "" };
    var subs = [], busy = false, checking = null, info = null, lastEmit = 0;

    // ---- fs helpers
    function exists(p) { try { fs.statSync(p); return true; } catch (e) { return false; } }
    function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
    function mkdirp(p) { if (exists(p)) return; var par = path.dirname(p); if (par !== p) mkdirp(par); try { fs.mkdirSync(p); } catch (e) { if (!isDir(p)) throw e; } }
    function rmrf(p) {
      var st; try { st = fs.lstatSync(p); } catch (e) { return; }
      if (st.isDirectory() && !st.isSymbolicLink()) { fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); }); try { fs.rmdirSync(p); } catch (e) {} }
      else { try { fs.unlinkSync(p); } catch (e) {} }
    }
    function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } }
    function writeJSON(p, v) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(v, null, 1)); }
    function safeJoin(rootDir, rel) {
      var full = path.join(rootDir, rel.replace(/\/$/, ""));
      if (full !== rootDir && full.indexOf(rootDir + path.sep) !== 0) throw err("zip", "path escapes the folder");
      return full;
    }
    // rel path ("client/js/app.js") -> { dir, size } for everything under `dir`
    function listTree(dir) {
      var out = {};
      (function walk(d, rel) {
        var names; try { names = fs.readdirSync(d); } catch (e) { return; }
        names.forEach(function (nm) {
          var p = path.join(d, nm), r = rel ? rel + "/" + nm : nm, st;
          try { st = fs.lstatSync(p); } catch (e) { return; }
          if (st.isSymbolicLink()) return;
          if (st.isDirectory()) { out[r] = { dir: true }; walk(p, r); } else out[r] = { dir: false, size: st.size };
        });
      })(dir, "");
      return out;
    }
    function readTreeFiles(dir) {
      var t = listTree(dir), files = [];
      Object.keys(t).forEach(function (r) { if (!t[r].dir) files.push({ rel: r, data: fs.readFileSync(path.join(dir, r)) }); });
      return files;
    }
    function copyTree(from, to) {
      mkdirp(to);
      var t = listTree(from);
      Object.keys(t).sort().forEach(function (r) {
        var src = path.join(from, r), dst = path.join(to, r);
        if (t[r].dir) mkdirp(dst); else { mkdirp(path.dirname(dst)); fs.writeFileSync(dst, fs.readFileSync(src)); }
      });
    }
    function writeAtomic(dest, data) {
      mkdirp(path.dirname(dest));
      var tmp = dest + ".hydra-new";
      fs.writeFileSync(tmp, data);
      try { fs.renameSync(tmp, dest); }
      catch (e) { try { fs.writeFileSync(dest, data); } finally { try { fs.unlinkSync(tmp); } catch (x) {} } }
    }

    // ---- state
    function loadState() { return readJSON(stateFile) || {}; }
    function saveState(patch) { var s = loadState(); Object.keys(patch).forEach(function (k) { if (patch[k] === null) delete s[k]; else s[k] = patch[k]; }); try { writeJSON(stateFile, s); } catch (e) {} return s; }
    function backupVersions() {
      var names = []; try { names = fs.readdirSync(bakDir); } catch (e) {}
      return names.filter(function (n) { return parseVersion(n) && isDir(path.join(bakDir, n)); }).sort(function (a, b) { return compareVersions(a, b); });
    }
    function previousVersion() {
      var base = S.installed || cur, v = backupVersions().filter(function (n) { return compareVersions(n, base) < 0; });
      return v.length ? v[v.length - 1] : "";
    }
    function isOurFolder() {
      try { var m = /ExtensionBundleId="([^"]+)"/.exec(fs.readFileSync(path.join(extDir, "CSXS", "manifest.xml"), "utf8")); return !!m && m[1] === appId; } catch (e) { return false; }
    }
    function canWrite() {
      var t = path.join(extDir, ".hydra-write-test");
      try { fs.writeFileSync(t, "x"); fs.unlinkSync(t); return true; } catch (e) { return false; }
    }

    function snap() {
      var s = Object.assign({}, S); s.notes = S.notes.slice(); s.previous = previousVersion();
      s.error = S.error ? { kind: S.error.kind, message: friendly(S.error) } : null;
      return s;
    }
    function emit(force) {
      var t = now();
      if (!force && t - lastEmit < 90) return;
      lastEmit = t;
      var s = snap(); subs.slice().forEach(function (f) { try { f(s); } catch (e) {} });
    }
    function setPhase(p) { S.phase = p; emit(true); }

    // ---- check
    function check(opt) {
      opt = opt || {};
      if (S.phase === "downloading" || S.phase === "verifying" || S.phase === "installing" || S.phase === "installed") return Promise.resolve(snap());
      if (checking) return checking;
      if (!S.configured) { S.error = err("config", ""); S.phase = "idle"; emit(true); return Promise.resolve(snap()); }
      S.error = null; setPhase("checking");
      checking = (async function () {
        var i, lastErr = null, sigErr = null, got = null;
        for (i = 0; i < feeds.length && !got; i++) {
          try {
            var u = feeds[i] + (feeds[i].indexOf("?") < 0 ? "?" : "&") + "_=" + now();
            var buf = await httpGet(D, u, { maxBytes: LIMITS.feed, idleMs: 12000, totalMs: 30000 });
            got = verifyFeed(buf.toString("utf8"), pub, crypto, appId);
          } catch (e) { lastErr = e; got = null; if (e && e.kind === "sig") sigErr = e; }
        }
        if (!got) { S.error = sigErr || lastErr || err("net", ""); S.phase = "error"; emit(true); return snap(); }
        S.checkedAt = now(); saveState({ lastCheck: S.checkedAt });
        S.writable = canWrite();
        info = got;
        var cmp = compareVersions(got.version, cur);
        if (!(cmp > 0)) { S.latest = got.version; S.notes = []; S.size = 0; S.restart = false; info = null; S.phase = "uptodate"; emit(true); return snap(); }
        var st = loadState();
        S.latest = got.version; S.released = got.released; S.notes = got.notes; S.size = got.size; S.restart = got.restart;
        S.needsFull = !!(got.min && compareVersions(cur, got.min) < 0);
        S.skipped = "";
        if (!opt.manual && st.dismissed === got.version) { S.skipped = got.version; S.phase = "uptodate"; emit(true); return snap(); }
        S.phase = "available"; emit(true); return snap();
      })().then(function (r) { checking = null; return r; }, function (e) { checking = null; S.error = e; S.phase = "error"; emit(true); return snap(); });
      return checking;
    }
    function checkIfDue(hours) {
      var last = loadState().lastCheck || 0;
      if (now() - last < (hours || 6) * 3600e3 && last <= now()) return Promise.resolve(snap());
      return check({});
    }
    function dismiss() { if (S.latest) saveState({ dismissed: S.latest }); }

    // ---- install
    async function download() {
      var i, lastErr = null, u, buf, sha;
      for (i = 0; i < info.urls.length; i++) {
        u = info.urls[i];
        try {
          buf = await httpGet(D, u, { maxBytes: Math.min(LIMITS.zip, info.size + 1024), idleMs: 20000, totalMs: 600000,
            onProgress: function (got, len) { S.progress = Math.min(1, got / (info.size || len || 1)); emit(false); } });
          if (buf.length !== info.size) { lastErr = err("size", "wrong size"); continue; }
          setPhase("verifying");
          sha = crypto.createHash("sha256").update(buf).digest("hex");
          if (sha !== info.sha256) { lastErr = err("hash", "checksum mismatch"); setPhase("downloading"); continue; }
          return buf;
        } catch (e) { lastErr = e; }
      }
      throw lastErr || err("net", "no download address worked");
    }

    function validatePackage(entries) {
      var map = {}, ok;
      entries.forEach(function (e) { if (!e.dir) map[e.name] = e.data; });
      ["CSXS/manifest.xml", "client/index.html", "client/js/app.js", "host/host.jsx"].forEach(function (f) { if (!map[f]) throw err("zip", "the package has no " + f); });
      var man = map["CSXS/manifest.xml"].toString("utf8");
      ok = /ExtensionBundleId="([^"]+)"/.exec(man);
      if (!ok || ok[1] !== appId) throw err("zip", "the package is for another app");
      ok = /ExtensionBundleVersion="([^"]+)"/.exec(man);
      if (!ok || ok[1] !== info.version) throw err("zip", "the package version does not match the update");
      ok = /var VERSION = "([^"]+)"/.exec(map["client/js/app.js"].toString("utf8"));
      if (!ok || ok[1] !== info.version) throw err("zip", "app.js has a different version");
      ok = /host:\s*"(\d+\.\d+\.\d+)"/.exec(map["host/host.jsx"].toString("utf8"));
      if (!ok || ok[1] !== info.version) throw err("zip", "host.jsx has a different version");
      return map;
    }

    function manifestKey(dir) {
      function rd(f) { try { return fs.readFileSync(path.join(dir, f), "utf8"); } catch (e) { return ""; } }
      return rd("CSXS/manifest.xml").replace(/ExtensionBundleVersion="[^"]*"/g, "").replace(/(<Extension\s+Id="[^"]*"\s+Version=")[^"]*(")/g, "$1$2").replace(/\s+/g, " ") + "|" + rd(".debug").replace(/\s+/g, " ");
    }
    function manifestKeyOf(map) {
      function rd(f) { return map[f] ? map[f].toString("utf8") : ""; }
      return rd("CSXS/manifest.xml").replace(/ExtensionBundleVersion="[^"]*"/g, "").replace(/(<Extension\s+Id="[^"]*"\s+Version=")[^"]*(")/g, "$1$2").replace(/\s+/g, " ") + "|" + rd(".debug").replace(/\s+/g, " ");
    }

    // Put `files` ([{rel, data}]) into the extension folder, remove what is no longer part of it, then read everything back.
    function applyFiles(files) {
      var before = listTree(extDir), want = {}, wantDir = {}, i;
      for (i = 0; i < files.length; i++) {
        want[files[i].rel] = 1;
        var parts = files[i].rel.split("/"), k; for (k = 1; k < parts.length; k++) wantDir[parts.slice(0, k).join("/")] = 1;
        writeAtomic(safeJoin(extDir, files[i].rel), files[i].data);
      }
      Object.keys(before).forEach(function (r) { if (!before[r].dir && !want[r]) { try { fs.unlinkSync(path.join(extDir, r)); } catch (e) {} } });
      Object.keys(before).filter(function (r) { return before[r].dir && !wantDir[r]; }).sort(function (a, b) { return b.length - a.length; }).forEach(function (r) { try { fs.rmdirSync(path.join(extDir, r)); } catch (e) {} });
      for (i = 0; i < files.length; i++) {
        var disk = fs.readFileSync(path.join(extDir, files[i].rel));
        if (disk.length !== files[i].data.length || !disk.equals(files[i].data)) throw err("apply", "read-back mismatch in " + files[i].rel);
      }
    }

    function lock() {
      mkdirp(updDir);
      var l = readJSON(lockFile);
      if (l && now() - l.at < 10 * 60e3 && l.at <= now() + 60e3) throw err("busy", "");
      writeJSON(lockFile, { at: now() });
    }
    function unlock() { try { fs.unlinkSync(lockFile); } catch (e) {} }

    function pruneBackups(keep) {
      var v = backupVersions(); while (v.length > keep) rmrf(path.join(bakDir, v.shift()));
    }

    async function install() {
      if (busy) return snap();
      if (S.phase !== "available" || !info) { S.error = err("feed", "nothing to install"); emit(true); return snap(); }
      if (S.needsFull) { S.error = err("full", ""); S.phase = "error"; emit(true); return snap(); }
      busy = true; S.error = null; S.progress = 0;
      var touched = false, bak = path.join(bakDir, cur), needsRestart = false;
      try {
        if (!isOurFolder()) throw err("where", "");
        if (!canWrite()) throw err("perm", "");
        lock();
        setPhase("downloading");
        var buf = await download();
        var entries = unzip(buf, D.zlib), map = validatePackage(entries);
        setPhase("installing");
        needsRestart = info.restart || manifestKey(extDir) !== manifestKeyOf(map);
        rmrf(bak); copyTree(extDir, bak); pruneBackups(2);
        var files = [];
        entries.forEach(function (e) { if (!e.dir) files.push({ rel: e.name, data: e.data }); });
        touched = true;
        applyFiles(files);
        S.installed = info.version; S.restart = needsRestart;
        saveState({ justUpdated: info.version, from: cur, restart: needsRestart, rolled: null, dismissed: null });
        S.phase = "installed"; emit(true);
      } catch (e) {
        var failure = e;
        if (touched) {
          try { applyFiles(readTreeFiles(bak)); failure = err("apply", ""); failure.detail = (e && e.message) || ""; }
          catch (e2) { failure = err("apply", "could not restore: " + ((e2 && e2.message) || e2)); }
        }
        S.error = failure; S.phase = "error"; emit(true);
      } finally { unlock(); busy = false; }
      return snap();
    }

    // Put the previous version (the newest backup older than the one on disk) back.
    async function rollback() {
      if (busy) return snap();
      var prev = previousVersion();
      if (!prev) { S.error = err("apply", "there is no earlier version to go back to"); emit(true); return snap(); }
      busy = true; S.error = null;
      try {
        if (!isOurFolder()) throw err("where", "");
        if (!canWrite()) throw err("perm", "");
        lock(); setPhase("installing");
        var files = readTreeFiles(path.join(bakDir, prev));
        var man = null; files.forEach(function (f) { if (f.rel === "CSXS/manifest.xml") man = f.data; });
        if (!man || !/ExtensionBundleId="studio\.otiner\.hydrastudio"/.test(man.toString("utf8"))) throw err("zip", "the saved copy is not complete");
        var from = S.installed || cur;
        applyFiles(files);
        S.installed = prev; S.restart = false; S.phase = "installed";
        saveState({ justUpdated: prev, from: from, restart: false, rolled: true, dismissed: from });
        emit(true);
      } catch (e) { S.error = e; S.phase = "error"; emit(true); }
      finally { unlock(); busy = false; }
      return snap();
    }

    // After a reload: was this start the first one of a freshly installed version?
    function consumeJustUpdated() {
      var s = loadState();
      if (s.justUpdated && s.justUpdated === cur) { saveState({ justUpdated: null, from: null, restart: null, rolled: null }); return { version: cur, from: s.from || "", restart: !!s.restart, rolled: !!s.rolled }; }
      if (s.justUpdated && compareVersions(s.justUpdated, cur) !== 0) saveState({ justUpdated: null, from: null, restart: null, rolled: null });
      return null;
    }

    S.writable = null;
    return {
      check: check, checkIfDue: checkIfDue, install: install, rollback: rollback, dismiss: dismiss, consumeJustUpdated: consumeJustUpdated,
      state: snap, onChange: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; },
      reset: function () { if (S.phase === "error" || S.phase === "uptodate") { S.phase = "idle"; S.error = null; emit(true); } }
    };
  }

  return { create: create, defaultDeps: defaultDeps, parseVersion: parseVersion, compareVersions: compareVersions, crc32: crc32, unzip: unzip,
    verifyFeed: verifyFeed, normalizeName: normalizeName, httpGet: httpGet, friendly: friendly, APP_ID: APP_ID, LIMITS: LIMITS };
});
