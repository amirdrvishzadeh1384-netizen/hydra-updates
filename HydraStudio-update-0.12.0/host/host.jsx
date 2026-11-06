// Hydra Studio - host script (ExtendScript, ES3 only: no let/const, no JSON, no trailing commas)
// Every public function returns a JSON string: {"ok":true,...} or {"ok":false,"error":"..."}.

// ---------- tiny JSON helpers (ExtendScript has no JSON object) ----------
function ops_esc(s) {
    var out = "", i, c, code, h;
    s = String(s);
    for (i = 0; i < s.length; i++) {
        c = s.charAt(i);
        code = s.charCodeAt(i);
        if (c === "\\") out += "\\\\";
        else if (c === '"') out += '\\"';
        else if (code === 10) out += "\\n";
        else if (code === 13) out += "\\r";
        else if (code === 9) out += "\\t";
        else if (code < 32 || code === 0x2028 || code === 0x2029) {
            h = code.toString(16);
            while (h.length < 4) h = "0" + h;
            out += "\\u" + h;
        } else out += c;
    }
    return out;
}

function ops_json(v) {
    var t = typeof v, parts, i, k;
    if (v === null || v === undefined) return "null";
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (t === "string") return '"' + ops_esc(v) + '"';
    if (v instanceof Array) {
        parts = [];
        for (i = 0; i < v.length; i++) parts.push(ops_json(v[i]));
        return "[" + parts.join(",") + "]";
    }
    parts = [];
    for (k in v) {
        if (v.hasOwnProperty(k)) parts.push('"' + ops_esc(k) + '":' + ops_json(v[k]));
    }
    return "{" + parts.join(",") + "}";
}

function ops_ok(extra) {
    var o = { ok: true }, k;
    if (extra) for (k in extra) { if (extra.hasOwnProperty(k)) o[k] = extra[k]; }
    return ops_json(o);
}

function ops_fail(msg) {
    return ops_json({ ok: false, error: String(msg) });
}

function ops_comp() {
    var c = app.project ? app.project.activeItem : null;
    return (c && c instanceof CompItem) ? c : null;
}

// ---------- diagnostics ----------
function ops_diagnose() {
    var r = { ae: String(app.version), build: String(app.buildName), os: String($.os) };
    try {
        var c = ops_comp();
        r.activeComp = c ? c.name : "(none)";
    } catch (e) { r.activeComp = "error: " + e.toString(); }
    return ops_ok(r);
}

// ---------- liveness check (touches nothing in the project) ----------
function ops_ping() {
    return ops_ok({ pong: true, host: "0.12.0" });
}

// ---------- pop presets: motion on the layer's own Transform (works on shapes, images, solids, text, anything) ----------
// o = { name, k: { sc:[[frame, pct | [x, y], ease]], pos:[[frame, [dx, dy]]], rot:[[frame, deg]], op:[[frame, pct]] },
//       dir: "in" | "out", start: "inpoint" | "playhead", center: true }
// frames are 30 fps frames; scale / opacity are percentages OF THE LAYER'S CURRENT VALUE, position is an offset in px (1080 p),
// rotation is added. An "out" is the same list played backwards and ends on the last visible frame.
function ops_popCenter(l, t) {
    // pivot at the middle of the shape / text so it scales and spins around itself (position is compensated, nothing moves)
    var tr, r, cx, cy, ap, dx, dy, sc, rot, px, py, ca, sa, pos;
    try {
        if (!(l instanceof TextLayer || l instanceof ShapeLayer)) return;
        if (l.threeDLayer) return;
        tr = l.property("ADBE Transform Group");
        if (tr.property("ADBE Anchor Point").numKeys > 0 || tr.property("ADBE Position").numKeys > 0) return;
        if (tr.property("ADBE Position").dimensionsSeparated) return;
        r = l.sourceRectAtTime(t, false);
        if (!r || !(r.width > 0 || r.height > 0)) return;
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        ap = tr.property("ADBE Anchor Point").value;
        dx = cx - ap[0]; dy = cy - ap[1];
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        sc = tr.property("ADBE Scale").value;
        rot = tr.property("ADBE Rotate Z").value * Math.PI / 180;
        px = dx * sc[0] / 100; py = dy * sc[1] / 100;
        ca = Math.cos(rot); sa = Math.sin(rot);
        pos = tr.property("ADBE Position").value;
        tr.property("ADBE Anchor Point").setValue([cx, cy]);
        tr.property("ADBE Position").setValue([pos[0] + px * ca - py * sa, pos[1] + px * sa + py * ca]);
    } catch (e) {}
}

function ops_popKeys(keys, out) {
    var res = [], i;
    for (i = 0; i < keys.length; i++) res.push([out ? -keys[i][0] : keys[i][0], keys[i][1], keys[i][2]]);
    return res;
}

function ops_popProp(prop, keys, ctx, conv, warn, label) {
    if (!prop) return 0;
    if (prop.numKeys > 0) { warn.push(label + ": already animated, left as it was"); return 0; }
    return ops_writeKeys(prop, keys, ctx, conv, warn, label, false);
}

function ops_pop(o) {
    var c = ops_comp(), sel, i, l, ctx, k = o.k || {}, out = (o.dir === "out"), warn = [], applied = 0, failed = 0, lastErr = "", locked = 0, t0, fd, tr, p, base, any;
    if (!c) return ops_fail("Open a composition first.");
    sel = c.selectedLayers;
    if (!sel.length) return ops_fail("Select a layer first.");
    fd = c.frameDuration;
    ctx = ops_ctx(c);
    ctx.span = "hit";
    app.beginUndoGroup("Hydra Pop: " + (o.name || "Pop"));
    try {
        for (i = 0; i < sel.length; i++) {
            l = sel[i];
            if (l.locked) { locked++; continue; }
            try {
                tr = l.property("ADBE Transform Group");
                if (!tr) { failed++; continue; }
                if (out) {
                    t0 = (o.start === "playhead") ? c.time : (l.outPoint - fd);
                    if (t0 > c.duration - fd) t0 = c.duration - fd;
                } else {
                    t0 = (o.start === "playhead") ? c.time : l.inPoint;
                    if (t0 < 0) t0 = 0;
                }
                if (o.center !== false) ops_popCenter(l, t0);
                ctx.T = t0;
                any = 0;
                if (k.sc) {
                    p = tr.property("ADBE Scale"); base = p.value;
                    any += ops_popProp(p, ops_popKeys(k.sc, out), ctx, function (v) {
                        var vx = (v instanceof Array) ? v[0] : v, vy = (v instanceof Array) ? v[1] : v, r = [base[0] * vx / 100, base[1] * vy / 100];
                        if (base.length > 2) r.push(base[2]);
                        return r;
                    }, warn, l.name + " scale");
                }
                if (k.rot) {
                    p = tr.property("ADBE Rotate Z"); base = p.value;
                    any += ops_popProp(p, ops_popKeys(k.rot, out), ctx, function (v) { return base + v; }, warn, l.name + " rotation");
                }
                if (k.op) {
                    p = tr.property("ADBE Opacity"); base = p.value;
                    any += ops_popProp(p, ops_popKeys(k.op, out), ctx, function (v) { return base * v / 100; }, warn, l.name + " opacity");
                }
                if (k.pos) {
                    p = tr.property("ADBE Position");
                    if (p.dimensionsSeparated) {
                        var px = tr.property("ADBE Position_0"), py = tr.property("ADBE Position_1"), bx = px.value, by = py.value, kx = [], ky = [], j;
                        for (j = 0; j < k.pos.length; j++) { kx.push([k.pos[j][0], k.pos[j][1][0], k.pos[j][2]]); ky.push([k.pos[j][0], k.pos[j][1][1], k.pos[j][2]]); }
                        any += ops_popProp(px, ops_popKeys(kx, out), ctx, function (v) { return bx + v * ctx.sc; }, warn, l.name + " position X");
                        any += ops_popProp(py, ops_popKeys(ky, out), ctx, function (v) { return by + v * ctx.sc; }, warn, l.name + " position Y");
                    } else {
                        base = p.value;
                        any += ops_popProp(p, ops_popKeys(k.pos, out), ctx, function (v) {
                            var r = [base[0] + v[0] * ctx.sc, base[1] + v[1] * ctx.sc];
                            if (base.length > 2) r.push(base[2]);
                            return r;
                        }, warn, l.name + " position");
                    }
                }
                if (any > 0) applied++; else failed++;
            } catch (e1) { failed++; lastErr = e1.toString(); }
        }
    } finally { app.endUndoGroup(); }
    if (applied === 0) return ops_fail(lastErr || (locked ? "The selected layers are locked." : (warn.length ? warn[0] : "Nothing could be animated.")));
    return ops_ok({ applied: applied, failed: failed, locked: locked, warnings: warn });
}

// ---------- selection info ----------
// Deliberately light: only layer types are read. Never touches Source Text, because reading a text
// document while the user is typing in the comp makes AE raise "After Effects error (76 :: 59)".
function ops_selection() {
    try {
        var c = ops_comp();
        if (!c) return ops_ok({ hasComp: false, total: 0, texts: 0, others: 0, name: "" });
        var sel = c.selectedLayers, texts = 0, others = 0, name = "", i, l;
        for (i = 0; i < sel.length; i++) {
            l = sel[i];
            if (l instanceof TextLayer) {
                texts++;
                if (texts === 1) name = l.name;
            } else {
                others++;
            }
        }
        if (name.length > 60) name = name.substr(0, 60) + "...";
        return ops_ok({ hasComp: true, total: sel.length, texts: texts, others: others, name: name });
    } catch (e) {
        return ops_fail(e);
    }
}

// rough fingerprint of a layer's animation state (used to detect whether a preset changed anything)
function ops_sig(l) {
    var n = 0, g, i, names = ["ADBE Position", "ADBE Scale", "ADBE Opacity", "ADBE Rotate Z"];
    try { n += l.property("ADBE Effect Parade").numProperties * 1000; } catch (e) {}
    try { n += l.property("ADBE Text Properties").property("ADBE Text Animators").numProperties * 100000; } catch (e1) {}
    try {
        g = l.property("ADBE Transform Group");
        for (i = 0; i < names.length; i++) {
            try { n += g.property(names[i]).numKeys; } catch (e2) {}
        }
    } catch (e3) {}
    return n;
}

// ---------- "Out" animations: play the keyframes a preset just added backwards ----------
var OPS_XFORM = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Orientation", "ADBE Rotate X", "ADBE Rotate Y", "ADBE Rotate Z", "ADBE Opacity"];

// what a layer has before the preset is applied, so we can tell afterwards what is new
function ops_state(l) {
    var s = { anim: 0, fx: 0, keys: {} }, g, i;
    try { s.anim = l.property("ADBE Text Properties").property("ADBE Text Animators").numProperties; } catch (e) {}
    try { s.fx = l.property("ADBE Effect Parade").numProperties; } catch (e1) {}
    try {
        g = l.property("ADBE Transform Group");
        for (i = 0; i < OPS_XFORM.length; i++) {
            try { s.keys[OPS_XFORM[i]] = g.property(OPS_XFORM[i]).numKeys; } catch (e2) {}
        }
    } catch (e3) {}
    return s;
}

function ops_collectKeyed(grp, out) {
    var i, p, n;
    try { n = grp.numProperties; } catch (e) { return; }
    for (i = 1; i <= n; i++) {
        try {
            p = grp.property(i);
            if (p.propertyType === PropertyType.PROPERTY) {
                if (p.numKeys > 0) out.push(p);
            } else {
                ops_collectKeyed(p, out);
            }
        } catch (e1) {}
    }
}

// animated properties that the preset added (new text animators, new effects, newly keyed transform properties)
function ops_newKeyed(l, pre) {
    var out = [], i, grp, g, name, p;
    try {
        grp = l.property("ADBE Text Properties").property("ADBE Text Animators");
        for (i = pre.anim + 1; i <= grp.numProperties; i++) ops_collectKeyed(grp.property(i), out);
    } catch (e) {}
    try {
        grp = l.property("ADBE Effect Parade");
        for (i = pre.fx + 1; i <= grp.numProperties; i++) ops_collectKeyed(grp.property(i), out);
    } catch (e1) {}
    try {
        g = l.property("ADBE Transform Group");
        for (name in pre.keys) {
            if (!pre.keys.hasOwnProperty(name)) continue;
            try {
                p = g.property(name);
                if (pre.keys[name] === 0 && p.numKeys > 0) out.push(p);
            } catch (e2) {}
        }
    } catch (e3) {}
    return out;
}

// Re-times one property's keyframes.
//   mirror = true : play them backwards, ending at endTime (in/out easing is swapped so the motion feels the same)
//   mirror = false: keep the motion as it is, just slide it so it ends at endTime
// Writes the keys, reads them back to make sure AE really holds them where we wanted, and restores the
// original keyframes if anything went wrong. Returns "" on success, otherwise a short reason.
function ops_remapWrite(p, keys, times, rev) {
    var n = keys.length, i, j, k;
    try { while (p.numKeys > 0) p.removeKey(p.numKeys); } catch (e0) {}
    for (i = 0; i < n; i++) p.setValueAtTime(times[i], keys[i].v);
    if (p.numKeys !== n) throw new Error("expected " + n + " keyframes, found " + p.numKeys);
    for (i = 0; i < n; i++) {
        j = rev ? (n - i) : (i + 1);
        if (Math.abs(p.keyTime(j) - times[i]) > 0.0005) throw new Error("keyframe " + j + " landed at " + p.keyTime(j) + " instead of " + times[i]);
    }
    for (i = 0; i < n; i++) {
        j = rev ? (n - i) : (i + 1);
        k = keys[i];
        try { p.setInterpolationTypeAtKey(j, rev ? k.oi : k.ii, rev ? k.ii : k.oi); } catch (e3) {}
        if (k.ie && k.oe) { try { p.setTemporalEaseAtKey(j, rev ? k.oe : k.ie, rev ? k.ie : k.oe); } catch (e4) {} }
        if (k.ist && k.ost) { try { p.setSpatialTangentsAtKey(j, rev ? k.ost : k.ist, rev ? k.ist : k.ost); } catch (e5) {} }
    }
}

function ops_remapOne(p, tMin, tMax, endTime, mirror) {
    var n = p.numKeys, keys = [], times = [], i, k, orig = [];
    try {
        for (i = 1; i <= n; i++) {
            k = { t: p.keyTime(i), v: p.keyValue(i), ii: p.keyInInterpolationType(i), oi: p.keyOutInterpolationType(i) };
            try { k.ie = p.keyInTemporalEase(i); k.oe = p.keyOutTemporalEase(i); } catch (e1) {}
            try { if (p.isSpatial) { k.ist = p.keyInSpatialTangent(i); k.ost = p.keyOutSpatialTangent(i); } } catch (e2) {}
            keys.push(k);
            orig.push(k.t);
        }
    } catch (e) { return "could not read its keyframes (" + e + ")"; }
    for (i = 0; i < n; i++) times.push(mirror ? (endTime - (keys[i].t - tMin)) : (keys[i].t + (endTime - tMax)));
    try {
        ops_remapWrite(p, keys, times, mirror);
        return "";
    } catch (e6) {
        try { ops_remapWrite(p, keys, orig, false); } catch (e7) {}
        return String(e6);
    }
}

// Re-times everything the preset just animated. Returns { found, failed, errs, tStart, tEnd }.
function ops_remapNew(l, pre, endTime, mirror) {
    var props = ops_newKeyed(l, pre), tMin = 1e9, tMax = -1e9, i, j, t, r, out = { found: props.length, failed: 0, errs: [], tStart: endTime, tEnd: endTime };
    if (props.length === 0) return out;
    for (i = 0; i < props.length; i++) {
        for (j = 1; j <= props[i].numKeys; j++) {
            t = props[i].keyTime(j);
            if (t < tMin) tMin = t;
            if (t > tMax) tMax = t;
        }
    }
    out.tEnd = endTime;
    out.tStart = mirror ? (endTime - (tMax - tMin)) : endTime - (tMax - tMin);
    for (i = 0; i < props.length; i++) {
        r = ops_remapOne(props[i], tMin, tMax, endTime, mirror);
        if (r) { out.failed++; if (out.errs.length < 3) out.errs.push(props[i].name + ": " + r); }
    }
    return out;
}

// ---------- apply a preset to the selected layers ----------
// kind: "text" (text layers only) or "any"; startMode: "inpoint" or "playhead";
// dirMode: "in" (default) - the animation starts at the layer's in-point (or the playhead);
//          "out"        - an in preset, applied then reversed so it ends at the layer's out-point (or the playhead);
//          "outAs"      - an out preset, applied then slid so it ends at the layer's out-point (or the playhead).
function ops_apply(presetPath, kind, startMode, dirMode) {
    var c = ops_comp();
    if (!c) return ops_fail("Open a composition and select a layer first.");
    var f = new File(presetPath);
    if (!f.exists) return ops_fail("Preset file is missing: " + f.fsName);
    var isOut = (dirMode === "out" || dirMode === "outAs"), mirror = (dirMode === "out");

    var sel = c.selectedLayers, targets = [], all = [], lockedCount = 0, i, l;
    for (i = 0; i < sel.length; i++) {
        l = sel[i];
        all.push(l);
        if (kind === "text" && !(l instanceof TextLayer)) continue;
        if (l.locked) { lockedCount++; continue; }
        targets.push(l);
    }
    if (targets.length === 0) {
        if (lockedCount > 0) return ops_fail("The selected layers are locked.");
        return ops_fail(kind === "text" ? "Select a text layer first." : "Select a layer first.");
    }

    var keepTime = c.time, applied = 0, failed = 0, unchanged = 0, revFailed = 0, noKeys = 0, lastErr = "", outErr = "", t, maxT, before, pre, endT, rr, seek = -1, outFrom = -1, outTo = -1;
    app.beginUndoGroup((isOut ? "Apply out preset: " : "Apply preset: ") + f.displayName);
    try {
        for (i = 1; i <= c.numLayers; i++) c.layer(i).selected = false;
        for (i = 0; i < targets.length; i++) {
            l = targets[i];
            try {
                if (startMode !== "playhead" || isOut) {
                    t = l.inPoint;
                    if (t < 0) t = 0;
                    maxT = c.duration - c.frameDuration;
                    if (t > maxT) t = maxT;
                    c.time = t;
                }
                l.selected = true;
                before = ops_sig(l);
                pre = ops_state(l);
                l.applyPreset(f);
                applied++;
                if (ops_sig(l) === before) unchanged++;
                else if (isOut) {
                    // end on the last frame the layer is visible (the out-point itself is the first frame after it)
                    endT = (startMode === "playhead") ? keepTime : (l.outPoint - c.frameDuration);
                    if (startMode !== "playhead" && endT <= l.inPoint) endT = l.outPoint;
                    if (endT > c.duration) endT = c.duration;
                    rr = ops_remapNew(l, pre, endT, mirror);
                    if (rr.found === 0) noKeys++;
                    revFailed += rr.failed;
                    if (rr.errs.length && !outErr) outErr = rr.errs[0];
                    if (rr.found > 0 && rr.failed < rr.found) {
                        if (outFrom < 0 || rr.tStart < outFrom) outFrom = rr.tStart;
                        if (rr.tEnd > outTo) outTo = rr.tEnd;
                    }
                }
            } catch (e1) {
                failed++;
                lastErr = e1.toString();
            }
            try { l.selected = false; } catch (e2) {}
        }
    } catch (e3) {
        lastErr = e3.toString();
    }
    try {
        // for an out animation placed at the end of the layers, park the playhead just before it so the result is visible
        if (isOut && startMode !== "playhead" && outFrom >= 0) { seek = Math.max(0, outFrom - 0.35); c.time = seek; }
        else c.time = keepTime;
        for (i = 0; i < all.length; i++) all[i].selected = true;
    } catch (e4) {}
    app.endUndoGroup();

    if (applied === 0) return ops_fail("Could not apply the preset. " + lastErr);
    return ops_ok({ applied: applied, failed: failed, unchanged: unchanged, locked: lockedCount, reverseFailed: revFailed, noKeys: noKeys, outErr: outErr,
                    outFrom: outFrom, outTo: outTo, seek: seek, dir: isOut ? "out" : "in", mode: String(dirMode), startMode: String(startMode) });
}

// ---------- open a folder in Explorer / Finder ----------
function ops_reveal(folderPath) {
    try {
        var f = new Folder(folderPath);
        if (!f.exists) return ops_fail("Folder not found.");
        f.execute();
        return ops_ok({});
    } catch (e) {
        return ops_fail(e);
    }
}

// =====================================================================================================
// Tools: one-click layers
// =====================================================================================================
// plain = true : "Name", "Name 2", "Name 3" ...   plain = false : "Name 1", "Name 2" ... (like AE's own layers)
function ops_uniqueName(c, base, plain) {
    var k, i, nm, taken;
    for (k = 1; k < 999; k++) {
        nm = (plain && k === 1) ? base : (base + " " + k);
        taken = false;
        for (i = 1; i <= c.numLayers; i++) {
            if (c.layer(i).name === nm) { taken = true; break; }
        }
        if (!taken) return nm;
    }
    return base;
}

function ops_selectedSpan(sel, c) {
    var tin = 1e9, tout = -1e9, i;
    for (i = 0; i < sel.length; i++) {
        if (sel[i].inPoint < tin) tin = sel[i].inPoint;
        if (sel[i].outPoint > tout) tout = sel[i].outPoint;
    }
    if (sel.length === 0 || tout <= tin) return { tin: 0, tout: c.duration };
    if (tin < 0) tin = 0;
    if (tout > c.duration) tout = c.duration;
    return { tin: tin, tout: tout };
}

// puts a new layer directly above the top-most selected layer (new layers are added at the top by script)
function ops_placeAbove(layer, sel) {
    var i, top = null;
    for (i = 0; i < sel.length; i++) {
        if (sel[i] !== layer && (top === null || sel[i].index < top.index)) top = sel[i];
    }
    if (top) { try { layer.moveBefore(top); } catch (e) {} }
}

function ops_addAdjustment(c, sel, name, spanMode, dur) {
    var l = c.layers.addSolid([1, 1, 1], name, c.width, c.height, c.pixelAspect, c.duration), sp, t0, t1;
    l.adjustmentLayer = true;
    try { l.motionBlur = true; } catch (e0) {}
    if (spanMode === "hit") {
        t0 = c.time;
        t1 = t0 + (dur > 0 ? dur : 1);
        if (t1 > c.duration) t1 = c.duration;
        if (t1 <= t0) { t0 = Math.max(0, c.duration - 1); t1 = c.duration; }
    } else {
        sp = ops_selectedSpan(sel, c);
        t0 = sp.tin; t1 = sp.tout;
    }
    try { l.inPoint = t0; l.outPoint = t1; } catch (e1) {}
    ops_placeAbove(l, sel);
    return l;
}

function ops_onlySelect(c, layers) {
    var i;
    try {
        for (i = 1; i <= c.numLayers; i++) c.layer(i).selected = false;
        for (i = 0; i < layers.length; i++) layers[i].selected = true;
    } catch (e) {}
}

// kind: adjustment | null | nullParent | solid | camera | text | light | precomp
function ops_tool(kind) {
    var c = ops_comp();
    if (!c) return ops_fail("Open a composition first.");
    var sel = [], i, l, name, made = null, extra = {};
    for (i = 0; i < c.selectedLayers.length; i++) sel.push(c.selectedLayers[i]);
    var cx = c.width / 2, cy = c.height / 2;

    if (kind === "precomp" && sel.length === 0) return ops_fail("Select one or more layers to pre-compose.");
    if (kind === "nullParent" && sel.length === 0) return ops_fail("Select the layers you want to parent first.");

    app.beginUndoGroup("Hydra: " + kind);
    try {
        if (kind === "adjustment") {
            name = ops_uniqueName(c, "Adjustment Layer");
            made = ops_addAdjustment(c, sel, name, "auto", 0);
        } else if (kind === "null") {
            name = ops_uniqueName(c, "Null");
            made = c.layers.addNull(c.duration);
            made.name = name;
            made.transform.position.setValue([cx, cy]);
            ops_placeAbove(made, sel);
        } else if (kind === "nullParent") {
            var px = 0, py = 0, n = 0, p;
            for (i = 0; i < sel.length; i++) {
                try { p = sel[i].transform.position.value; px += p[0]; py += p[1]; n++; } catch (e1) {}
            }
            if (n > 0) { px /= n; py /= n; } else { px = cx; py = cy; }
            name = ops_uniqueName(c, "Null");
            made = c.layers.addNull(c.duration);
            made.name = name;
            made.transform.position.setValue([px, py]);
            ops_placeAbove(made, sel);
            for (i = 0; i < sel.length; i++) {
                try { sel[i].parent = made; } catch (e2) {}
            }
        } else if (kind === "solid") {
            name = ops_uniqueName(c, "BG Solid");
            made = c.layers.addSolid([0.08, 0.08, 0.09], name, c.width, c.height, c.pixelAspect, c.duration);
            try { made.moveToEnd(); } catch (e3) {}
        } else if (kind === "camera") {
            name = ops_uniqueName(c, "Camera");
            made = c.layers.addCamera(name, [cx, cy]);
        } else if (kind === "light") {
            name = ops_uniqueName(c, "Light");
            made = c.layers.addLight(name, [cx, cy]);
        } else if (kind === "text") {
            made = c.layers.addText("Your text");
            try {
                var tp = made.property("ADBE Text Properties").property("ADBE Text Document"), td = tp.value;
                td.justification = ParagraphJustification.CENTER_JUSTIFY;
                tp.setValue(td);
            } catch (e4) {}
            made.transform.position.setValue([cx, cy]);
            ops_placeAbove(made, sel);
            name = made.name;
        } else if (kind === "precomp") {
            var idx = [];
            for (i = 0; i < sel.length; i++) idx.push(sel[i].index);
            idx.sort(function (a, b) { return a - b; });
            name = sel[0].name + " Comp";
            var pc = c.layers.precompose(idx, name, true);
            name = pc.name;
            made = null;
            extra.precomp = true;
        } else {
            app.endUndoGroup();
            return ops_fail("Unknown tool: " + kind);
        }
        if (made) ops_onlySelect(c, [made]);
    } catch (e) {
        app.endUndoGroup();
        return ops_fail(String(e) + (OPS_STEP ? " (step: " + OPS_STEP + ")" : ""));
    }
    app.endUndoGroup();
    extra.name = name;
    extra.kind = kind;
    return ops_ok(extra);
}


// =====================================================================================================
// v0.6 effect engine.
// The panel sends a recipe (see client/js/recipes.js): a list of native After Effects effects with real keyframes.
// Nothing is driven by expressions, except the endless looks (handheld sway, beat pulse).
// =====================================================================================================

// parameter spec: "English name/other name|index|kind|unit"
//   kind: one | pos | bool | col | any      unit: px (length for a 1080 px tall frame) | pos (fraction of the frame) | pct255 (auto) | ""
function ops_P(s) {
    var a = s.split("|");
    return { names: a[0].split("/"), idx: parseInt(a[1], 10), want: a[2] || "any", unit: a[3] || "" };
}

// effect table: short key -> match name(s), display name (fallback lookup) and parameters
var OPS_FXT = {
    tf: { mn: ["ADBE Geometry2"], dn: "Transform", p: {
        pos: "Position|2|pos|pos", uni: "Uniform Scale|3|bool", sh: "Scale Height/Scale|4|one", sw: "Scale Width|5|one",
        rot: "Rotation|8|one", op: "Opacity|9|one", useShut: "Use Composition's Shutter Angle|10|bool", shut: "Shutter Angle|11|one" } },
    tile: { mn: ["ADBE Tile"], dn: "Motion Tile", p: {
        c: "Tile Center|1|pos|pos", tw: "Tile Width|2|one", th: "Tile Height|3|one", ow: "Output Width|4|one", oh: "Output Height|5|one",
        mir: "Mirror Edges|6|bool", ph: "Phase|7|one" } },
    dblur: { mn: ["ADBE Motion Blur"], dn: "Directional Blur", p: { ang: "Direction|1|one", len: "Blur Length|2|one|px" } },
    rblur: { mn: ["CC Radial Fast Blur"], dn: "CC Radial Fast Blur", p: { c: "Center|1|pos|pos", amt: "Amount|2|one" } },
    sblur: { mn: ["ADBE Radial Blur"], dn: "Radial Blur", p: { amt: "Amount|1|one", type: "Type|3|any" } },
    gblur: { mn: ["ADBE Gaussian Blur 2"], dn: "Gaussian Blur", p: { rad: "Blurriness|1|one|px", dim: "Blur Dimensions|2|any", edge: "Repeat Edge Pixels|3|bool" } },
    echo: { mn: ["ADBE Echo"], dn: "Echo", p: {
        time: "Echo Time (seconds)/Echo Time|1|one", n: "Number Of Echoes|2|one", "int": "Starting Intensity|3|one", dec: "Decay|4|one", op: "Echo Operator|5|any" } },
    chan: { mn: ["ADBE Channel Blur"], dn: "Channel Blur", d: { dir: 2, edge: 1 }, p: {
        r: "Red Blurriness|1|one|px", g: "Green Blurriness|2|one|px", b: "Blue Blurriness|3|one|px", a: "Alpha Blurriness|4|one|px",
        dir: "Blur Direction|5|any", edge: "Repeat Edge Pixels|6|bool" } },
    expo: { mn: ["ADBE Exposure2"], dn: "Exposure", p: { ev: "Exposure|3|one", off: "Offset|4|one", gam: "Gamma Correction|5|one" } },
    hs: { mn: ["ADBE HUE SATURATION"], dn: "Hue/Saturation", p: { hue: "Master Hue|3|one", sat: "Master Saturation|4|one", lit: "Master Lightness|5|one" } },
    bc: { mn: ["ADBE Brightness & Contrast 2"], dn: "Brightness & Contrast", p: { b: "Brightness|1|one", c: "Contrast|2|one" } },
    cb: { mn: ["ADBE Color Balance 2"], dn: "Color Balance", p: {
        sr: "Shadow Red Balance|1|one", sg: "Shadow Green Balance|2|one", sb: "Shadow Blue Balance|3|one",
        mr: "Midtone Red Balance|4|one", mg: "Midtone Green Balance|5|one", mb: "Midtone Blue Balance|6|one",
        hr: "Hilight Red Balance/Highlight Red Balance|7|one", hg: "Hilight Green Balance/Highlight Green Balance|8|one",
        hb: "Hilight Blue Balance/Highlight Blue Balance|9|one", pl: "Preserve Luminosity|10|bool" } },
    // "pf" (photo filter) is built from the Tint effect: it needs no filter menu, so it works the same on every build
    pf: { mn: ["ADBE Tint"], dn: "Tint", p: { black: "Map Black To|1|col", col: "Map White To|2|col", den: "Amount to Tint|3|one" } },
    fill: { mn: ["ADBE Fill"], dn: "Fill", p: { col: "Color|3|col", op: "Opacity|7|one" } },
    inv: { mn: ["ADBE Invert"], dn: "Invert", p: { bl: "Blend With Original|2|one" } },
    // CC Light Sweep: looked up by match name (-0001..-0009) so it works in every AE language
    sweep: { mn: ["CC Light Sweep"], dn: "CC Light Sweep", p: {
        c: "CC Light Sweep-0001|1|pos|pos", ang: "CC Light Sweep-0002|2|one", shape: "CC Light Sweep-0003|3|any",
        wid: "CC Light Sweep-0004|4|one|px", si: "CC Light Sweep-0005|5|one", ei: "CC Light Sweep-0006|6|one",
        et: "CC Light Sweep-0007|7|one", col: "CC Light Sweep-0008|8|col", rec: "CC Light Sweep-0009|9|any" } },
    glow: { mn: ["ADBE Glo2"], dn: "Glow", p: { thr: "Glow Threshold|2|one|pct255", rad: "Glow Radius|3|one|px", "int": "Glow Intensity|4|one", cols: "Glow Colors|7|any", ca: "Color A|12|col", cb: "Color B|13|col" } },
    usm: { mn: ["ADBE Unsharp Mask2"], dn: "Unsharp Mask", p: { amt: "Amount|1|one", rad: "Radius|2|one|px", thr: "Threshold|3|one" } },
    noise: { mn: ["ADBE Noise"], dn: "Noise", p: { amt: "Amount of Noise|1|one", col: "Use Color Noise|2|bool", clip: "Clip Result Values|3|bool" } },
    med: { mn: ["ADBE Median"], dn: "Median", p: { rad: "Radius|1|one" } },
    ramp: { mn: ["ADBE Ramp"], dn: "Gradient Ramp", p: {
        a: "Start of Ramp|1|pos|pos", ac: "Start Color|2|col", b: "End of Ramp|3|pos|pos", bc: "End Color|4|col", shape: "Ramp Shape|5|any", bl: "Blend With Original|7|one" } },
    flare: { mn: ["ADBE Lens Flare"], dn: "Lens Flare", p: { c: "Flare Center|1|pos|pos", br: "Flare Brightness|2|one", lens: "Lens Type|3|any", bl: "Blend With Original|4|one" } },
    mos: { mn: ["ADBE Mosaic"], dn: "Mosaic", p: { hb: "Horizontal Blocks|1|one", vb: "Vertical Blocks|2|one" } },
    post: { mn: ["ADBE Posterize Time"], dn: "Posterize Time", p: { fps: "Frame Rate|1|one" } },
    bul: { mn: ["ADBE Bulge"], dn: "Bulge", p: { rx: "Horizontal Radius|1|one|px", ry: "Vertical Radius|2|one|px", c: "Bulge Center|3|pos|pos", h: "Bulge Height|4|one" } },
    twirl: { mn: ["ADBE Twirl"], dn: "Twirl", p: { ang: "Angle|1|one", rad: "Twirl Radius|2|one|px", c: "Twirl Center|3|pos|pos" } },
    // Displacement menu: 1 Turbulent, 2 Bulge, 3 Twist, 4-6 smoother versions, 7 Vertical, 8 Horizontal, 9 Cross
    td: { mn: ["ADBE Turbulent Displace"], dn: "Turbulent Displace", p: {
        type: "Displacement|1|any", amt: "Amount|2|one|px", size: "Size|3|one", cx: "Complexity|5|one", evo: "Evolution|6|one" } },
    b3d: { mn: ["ADBE Basic 3D"], dn: "Basic 3D", p: { swivel: "Swivel|1|one", tilt: "Tilt|2|one", dist: "Distance to Image Plane|3|one" } },
    optic: { mn: ["ADBE Optics Compensation", "ADBE Optical Comp", "ADBE Lens Distortion"], dn: "Optics Compensation", p: {
        fov: "Field Of View (FOV)/Field Of View/FOV|1|one", rev: "Reverse Lens Distortion|2|bool" } }
};

var OPS_FXP = {};   // parsed once: OPS_FXP[type][key] = { names, idx, want, unit }
function ops_fxSpec(t, key) {
    var def = OPS_FXT[t], k;
    if (!def) return null;
    if (!OPS_FXP[t]) {
        OPS_FXP[t] = {};
        for (k in def.p) { if (def.p.hasOwnProperty(k)) OPS_FXP[t][k] = ops_P(def.p[k]); }
    }
    return OPS_FXP[t][key] || null;
}

// ---------- property helpers ----------
function ops_kindOk(p, want) {
    var t = p.propertyValueType;
    if (want === "pos") return t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.TwoD;
    if (want === "one") return t === PropertyValueType.OneD;
    if (want === "bool") return true; // checkboxes report as OneD on some builds
    if (want === "color") return t === PropertyValueType.COLOR;
    if (want === "col") return t === PropertyValueType.COLOR;
    return true;
}

// looks a name up in a group, and one level deeper (some effects keep their controls in sub-groups)
function ops_findName(g, names, depth) {
    var i, p, j, ch;
    for (i = 0; i < names.length; i++) {
        try { p = g.property(names[i]); if (p) return p; } catch (e) {}
    }
    if (depth > 0) {
        try {
            for (j = 1; j <= g.numProperties; j++) {
                ch = g.property(j);
                if (ch && ch.numProperties > 0 && ch.propertyType !== PropertyType.PROPERTY) {
                    p = ops_findName(ch, names, depth - 1);
                    if (p) return p;
                }
            }
        } catch (e1) {}
    }
    return null;
}

// finds an effect property by (English) name first, then by its position in the effect, checking its type
function ops_fxProp(fx, names, idx, want) {
    var p = ops_findName(fx, names, 2);
    if (p) return p;
    try { p = fx.property(idx); if (p && ops_kindOk(p, want)) return p; } catch (e1) {}
    return null;
}

function ops_setVal(prop, v, warn, label) {
    try {
        if (!prop) { warn.push(label + ": property not found"); return false; }
        prop.setValue(v);
        return true;
    } catch (e) { warn.push(label + ": " + e); return false; }
}

function ops_setExpr(prop, expr, warn, label) {
    try {
        if (!prop) { warn.push(label + ": property not found"); return false; }
        if (prop.expression !== "" && prop.expressionEnabled) { warn.push(label + ": already has an expression, skipped"); return false; }
        prop.expression = expr;
        return true;
    } catch (e) { warn.push(label + ": " + e); return false; }
}

function ops_q(s) { return '"' + String(s).split("\\").join("\\\\").split('"').join('\\"') + '"'; }

// adds an effect: tries every match name, then looks the effect up by its display name
function ops_addFx(par, def) {
    var i, fx = null, mn;
    for (i = 0; i < def.mn.length && !fx; i++) {
        try { fx = par.addProperty(def.mn[i]); } catch (e) { fx = null; }
    }
    if (!fx) {
        try {
            for (i = 0; i < app.effects.length && !fx; i++) {
                if (app.effects[i].displayName === def.dn) { mn = app.effects[i].matchName; try { fx = par.addProperty(mn); } catch (e1) { fx = null; } }
            }
        } catch (e2) {}
    }
    return fx;
}

// ---------- frames, times and keyframes ----------
// Recipes count frames at a nominal 30 fps (0 = the cut / the hit). The comp's real frame rate rescales them,
// every key keeps at least one frame of room, and the cut itself always stays on frame 0.
function ops_ctx(c) {
    var fr = c.frameRate > 0 ? c.frameRate : 30;
    return { c: c, W: c.width, H: c.height, sc: c.height / 1080, fd: c.frameDuration, k30: fr / 30,
        T: 0, tin: 0, tout: c.duration, span: "cut" };
}

// comp-frame offsets for the numeric frames of a key list (tokens "i" / "o" are skipped)
function ops_frames(keys, k30) {
    var res = [], neg = [], pos = [], i, prev, cf, f;
    for (i = 0; i < keys.length; i++) {
        res.push(null);
        f = keys[i][0];
        if (typeof f === "number") { if (f < 0) neg.push(i); else pos.push(i); }
    }
    neg.sort(function (a, b) { return keys[b][0] - keys[a][0]; });
    pos.sort(function (a, b) { return keys[a][0] - keys[b][0]; });
    prev = -1;
    for (i = 0; i < pos.length; i++) {
        cf = Math.round(keys[pos[i]][0] * k30);
        if (cf < prev + 1) cf = prev + 1;
        res[pos[i]] = cf; prev = cf;
    }
    prev = 0;
    for (i = 0; i < neg.length; i++) {
        cf = Math.round(keys[neg[i]][0] * k30);
        if (cf > prev - 1) cf = prev - 1;
        res[neg[i]] = cf; prev = cf;
    }
    return res;
}

// the neutral value of a rule: scales a value around it by the Power slider
function ops_pw(v, neu, k) {
    var out, i;
    if (k === 1 || neu === undefined) return v;
    if (v instanceof Array) {
        out = [];
        for (i = 0; i < v.length; i++) out.push((neu instanceof Array ? neu[i] : neu) + (v[i] - (neu instanceof Array ? neu[i] : neu)) * k);
        return out;
    }
    return neu + (v - neu) * k;
}

// recipe value -> After Effects value (power rule, then units)
function ops_conv(v, spec, ctx, neu, k, mul) {
    v = ops_pw(v, neu, k);
    if (spec.unit === "px") return v * ctx.sc * (mul || 1);
    if (spec.unit === "pct255") return v * (mul || 1);
    if (spec.unit === "pos") return [v[0] * ctx.W, v[1] * ctx.H];
    if (spec.want === "col") return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];
    if (spec.want === "bool") return v ? 1 : 0;
    return v;
}

// -> [{ t, v, e }] sorted by time, inside the comp, one key per frame
function ops_times(keys, ctx) {
    var fr = ops_frames(keys, ctx.k30), out = [], i, f, t, last;
    for (i = 0; i < keys.length; i++) {
        f = keys[i][0];
        if (f === "i") t = ctx.tin;
        else if (f === "o") t = ctx.tout - ctx.fd;
        else if (ctx.span === "auto") t = (fr[i] >= 0 ? ctx.tin : ctx.tout) + fr[i] * ctx.fd;
        else t = ctx.T + fr[i] * ctx.fd;
        out.push({ t: t, v: keys[i][1], e: keys[i][2] });
    }
    out.sort(function (a, b) { return a.t - b.t; });
    last = [];
    for (i = 0; i < out.length; i++) {
        if (out[i].t < -1e-6 || out[i].t > ctx.c.duration + 1e-6) continue;
        if (last.length && Math.abs(out[i].t - last[last.length - 1].t) < ctx.fd * 0.4) continue;
        last.push(out[i]);
    }
    return last;
}

// "E" "E80" "E25,80" "S45" "L" "H"
function ops_tok(e) {
    var ch, rest, parts, a, b;
    e = (e === undefined || e === null || e === "") ? "E" : String(e);
    ch = e.charAt(0);
    rest = e.substr(1);
    parts = rest ? rest.split(",") : [];
    a = parts.length ? parseFloat(parts[0]) : 33.333;
    b = parts.length > 1 ? parseFloat(parts[1]) : a;
    if (!(a >= 0.1)) a = 33.333;
    if (!(b >= 0.1)) b = a;
    if (a > 100) a = 100;
    if (b > 100) b = 100;
    return { type: ch, a: a, b: b };
}

function ops_dims(v) { return (v instanceof Array) ? v.length : 1; }

// slope (units per second) of the values around key i
function ops_slope(items, i) {
    var a = items[i > 0 ? i - 1 : i], b = items[i < items.length - 1 ? i + 1 : i], dt = b.t - a.t, out = [], j, n = ops_dims(items[i].cv);
    if (dt <= 0) dt = 1;
    for (j = 0; j < n; j++) {
        out.push((n === 1 ? (b.cv - a.cv) : (b.cv[j] - a.cv[j])) / dt);
    }
    return out;
}

function ops_setEase(prop, idx, spIn, spOut, aIn, aOut, spatial) {
    var n = spIn.length, mi, mo, i, ei, eo, s1, s2;
    try {
        if (n === 1) {
            prop.setTemporalEaseAtKey(idx, [new KeyframeEase(spIn[0], aIn)], [new KeyframeEase(spOut[0], aOut)]);
        } else if (spatial) {
            mi = 0; mo = 0;
            for (i = 0; i < n; i++) { mi += spIn[i] * spIn[i]; mo += spOut[i] * spOut[i]; }
            prop.setTemporalEaseAtKey(idx, [new KeyframeEase(Math.sqrt(mi), aIn)], [new KeyframeEase(Math.sqrt(mo), aOut)]);
        } else {
            ei = []; eo = [];
            for (i = 0; i < n; i++) { ei.push(new KeyframeEase(spIn[i], aIn)); eo.push(new KeyframeEase(spOut[i], aOut)); }
            prop.setTemporalEaseAtKey(idx, ei, eo);
        }
        return true;
    } catch (e) {
        // some 2-D parameters want one ease, others one per dimension: try the other form
        try {
            if (n > 1) {
                s1 = spIn[0]; s2 = spOut[0];
                if (spatial) {
                    ei = []; eo = [];
                    for (i = 0; i < n; i++) { ei.push(new KeyframeEase(spIn[i], aIn)); eo.push(new KeyframeEase(spOut[i], aOut)); }
                    prop.setTemporalEaseAtKey(idx, ei, eo);
                } else {
                    prop.setTemporalEaseAtKey(idx, [new KeyframeEase(s1, aIn)], [new KeyframeEase(s2, aOut)]);
                }
                return true;
            }
        } catch (e2) {}
    }
    return false;
}

// writes keys [[frame, value, ease], ...] onto a property.
//   conv(v) turns a recipe value into an After Effects value. Returns the number of keys written.
function ops_writeKeys(prop, keys, ctx, conv, warn, label, plain) {
    var items = ops_times(keys, ctx), i, j, tk, it, idx, spatial, sIn, sOut, zero, zs, ok = true;
    if (items.length === 0) return 0;
    for (i = 0; i < items.length; i++) {
        try { items[i].cv = conv(items[i].v); prop.setValueAtTime(items[i].t, items[i].cv); }
        catch (e) { warn.push(label + ": " + e); return 0; }
    }
    if (items.length < 2) return items.length;
    try { spatial = (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL); } catch (e0) { spatial = false; }
    for (i = 0; i < items.length; i++) {
        it = items[i];
        tk = ops_tok(it.e);
        idx = prop.nearestKeyIndex(it.t);
        try {
            if (tk.type === "H") {
                prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
            } else if (tk.type === "L") {
                prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
            } else {
                prop.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                if (plain) {
                    zero = [0];
                    ops_setEase(prop, idx, zero, zero, tk.a, tk.b, spatial);
                } else {
                    if (tk.type === "S") { sIn = ops_slope(items, i); sOut = sIn; }
                    else {
                        zs = []; zero = ops_dims(it.cv);
                        for (j = 0; j < zero; j++) zs.push(0);
                        sIn = zs; sOut = zs;
                    }
                    ops_setEase(prop, idx, sIn, sOut, tk.a, tk.b, spatial);
                }
            }
        } catch (e1) { ok = false; }
    }
    if (!ok) warn.push(label + ": easing could not be set on every key");
    return items.length;
}

// ---------- one effect of a recipe ----------
// finds the property for a recipe key; { p, s, mul } or null
function ops_param(fx, t, key) {
    var spec = ops_fxSpec(t, key), prop, mul = 1, v;
    if (!spec) return null;
    prop = ops_fxProp(fx, spec.names, spec.idx, spec.want);
    if (!prop) return null;
    if (spec.unit === "pct255") {
        // the glow threshold is 0-100 on some builds and 0-255 on others: judge by the default value
        try { v = prop.value; if (typeof v === "number" && v > 100) mul = 2.55; } catch (e) {}
    }
    return { p: prop, s: spec, mul: mul };
}

function ops_setStatic(pr, v, ctx, neu, k, warn, label) {
    try { pr.p.setValue(ops_conv(v, pr.s, ctx, neu, k, pr.mul)); return true; }
    catch (e) { warn.push(label + ": " + e); return false; }
}

// beat pulse: base + amp * e^(-decay * time since the last beat)
function ops_pulseExpr(rate, amp, decay, base, k) {
    return "var per = 1 / " + rate + "; var tt = (time - inPoint) % per; if (tt < 0) tt += per; " + base + " + " + (amp * k) + " * Math.exp(-" + decay + " * tt);";
}

// effect entry -> real effect on the layer, with its values and keyframes
function ops_applyEntry(layer, e, ctx, k, warn) {
    var def = OPS_FXT[e.t], par, fx, key, pr, label, neu, nm, w, a, kk, f, pos, rot, expr, did = {};
    if (!def) { warn.push("Unknown effect: " + e.t); return null; }
    par = layer.property("ADBE Effect Parade");
    fx = ops_addFx(par, def);
    nm = e.n || def.dn;
    if (!fx) { warn.push(nm + ": this effect is not available in your After Effects"); return null; }
    try { fx.name = nm; } catch (e0) {}

    // sensible defaults of this effect type
    if (def.d) {
        for (key in def.d) {
            if (!def.d.hasOwnProperty(key)) continue;
            pr = ops_param(fx, e.t, key);
            if (pr) ops_setStatic(pr, def.d[key], ctx, undefined, 1, warn, nm + " / " + key);
        }
    }
    // pf (tint): whites go to the chosen color, blacks stay black
    if (e.t === "pf") {
        pr = ops_param(fx, "pf", "black");
        if (pr) ops_setStatic(pr, [0, 0, 0], ctx, undefined, 1, warn, nm + " / black");
    }
    // a custom shutter angle needs the "use comp shutter" switch off
    if (e.t === "tf" && e.s && e.s.shut !== undefined) {
        pr = ops_param(fx, "tf", "useShut");
        if (pr) ops_setStatic(pr, 0, ctx, undefined, 1, warn, nm + " / shutter");
    }

    // static values
    if (e.s) {
        // uniform scale switch first, so Scale Height / Width behave
        if (e.t === "tf" && e.s.uni !== undefined) {
            pr = ops_param(fx, "tf", "uni");
            if (pr) ops_setStatic(pr, e.s.uni, ctx, undefined, 1, warn, nm + " / uniform scale");
            did.uni = true;
        }
        for (key in e.s) {
            if (!e.s.hasOwnProperty(key) || did[key]) continue;
            kk = (e.t === "tf" && key === "sc") ? "sh" : key;
            pr = ops_param(fx, e.t, kk);
            if (!pr) { if (key !== "pl" && !(e.t === "pf" && key === "pl")) warn.push(nm + ": no parameter '" + key + "'"); continue; }
            neu = e.pw ? e.pw[key] : undefined;
            ops_setStatic(pr, e.s[key], ctx, neu, k, warn, nm + " / " + key);
        }
    }
    // keyframes
    if (e.k) {
        for (key in e.k) {
            if (!e.k.hasOwnProperty(key)) continue;
            kk = (e.t === "tf" && key === "sc") ? "sh" : key;
            pr = ops_param(fx, e.t, kk);
            if (!pr) { warn.push(nm + ": no parameter '" + key + "'"); continue; }
            neu = e.pw ? e.pw[key] : undefined;
            (function (prr, nn) {
                ops_writeKeys(prr.p, e.k[key], ctx, function (v) { return ops_conv(v, prr.s, ctx, nn, k, prr.mul); }, warn, nm + " / " + key, false);
            })(pr, neu);
        }
    }
    // endless looks: wiggle (handheld sway) and beat pulse
    if (e.wg) {
        w = e.wg;
        pos = ops_param(fx, "tf", "pos");
        rot = ops_param(fx, "tf", "rot");
        a = w.a * ctx.sc * k;
        if (pos) {
            expr = "var w = wiggle(" + w.f + ", " + a + ", " + (w.o || 1) + "); " + (w.y ? "[value[0], w[1]];" : "w;");
            ops_setExpr(pos.p, expr, warn, nm + " / sway");
        }
        if (rot && w.r) ops_setExpr(rot.p, "wiggle(" + w.f + ", " + (w.r * k) + ", " + (w.o || 1) + ");", warn, nm + " / roll");
    }
    if (e.pul) {
        for (key in e.pul) {
            if (!e.pul.hasOwnProperty(key)) continue;
            kk = (e.t === "tf" && key === "sc") ? "sh" : key;
            pr = ops_param(fx, e.t, kk);
            f = e.pul[key];
            if (pr) ops_setExpr(pr.p, ops_pulseExpr(f[0], f[1], f[2], f[3], k), warn, nm + " / beat");
            else warn.push(nm + ": no parameter '" + key + "'");
        }
    }
    return fx;
}

// ---------- masks ----------
function ops_maskShape(kind, cx, cy, w, h) {
    var s = new Shape(), kx, ky;
    if (kind === "ellipse") {
        kx = w / 2 * 0.5523; ky = h / 2 * 0.5523;
        s.vertices = [[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]];
        s.inTangents = [[-kx, 0], [0, -ky], [kx, 0], [0, ky]];
        s.outTangents = [[kx, 0], [0, ky], [-kx, 0], [0, -ky]];
    } else {
        s.vertices = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
        s.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
        s.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
    }
    s.closed = true;
    return s;
}

// mk: { shape: "rect"|"ellipse", inv, feather (fraction of the frame height), size [w, h] (fractions), c: static [x, y] or keys }
function ops_addMask(layer, mk, ctx, warn) {
    var mp = layer.property("ADBE Mask Parade"), m, path, w = mk.size[0] * ctx.W, h = mk.size[1] * ctx.H, items, i, tk, idx, f, c0;
    try {
        m = mp.addProperty("ADBE Mask Atom");
        m.maskMode = MaskMode.ADD;
        m.inverted = !!mk.inv;
        path = m.property("ADBE Mask Shape");
        if (mk.c && mk.c.length && mk.c[0] instanceof Array && mk.c[0].length >= 2 && mk.c[0][1] instanceof Array) {
            items = ops_times(mk.c, ctx);
            for (i = 0; i < items.length; i++) {
                path.setValueAtTime(items[i].t, ops_maskShape(mk.shape, items[i].v[0] * ctx.W, items[i].v[1] * ctx.H, w, h));
            }
            if (items.length > 1) {
                for (i = 0; i < items.length; i++) {
                    tk = ops_tok(items[i].e);
                    idx = path.nearestKeyIndex(items[i].t);
                    try {
                        if (tk.type === "L") path.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                        else {
                            path.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                            path.setTemporalEaseAtKey(idx, [new KeyframeEase(0, tk.a)], [new KeyframeEase(0, tk.b)]);
                        }
                    } catch (e1) {}
                }
            }
        } else {
            c0 = mk.c || [0.5, 0.5];
            path.setValue(ops_maskShape(mk.shape, c0[0] * ctx.W, c0[1] * ctx.H, w, h));
        }
        if (mk.feather) {
            f = mk.feather * ctx.H;
            m.property("ADBE Mask Feather").setValue([f, f]);
        }
        m.name = mk.inv ? "Outside" : "Area";
    } catch (e) { warn.push("Mask: " + e); }
}

// ---------- where is the cut? ----------
// two touching / overlapping selected clips -> their join; otherwise the playhead
function ops_findCut(c, sel) {
    var fd = c.frameDuration, best = null, bg = 1e9, i, j, a, b, gap, t;
    for (i = 0; i < sel.length; i++) {
        for (j = 0; j < sel.length; j++) {
            if (i === j) continue;
            a = sel[i]; b = sel[j];
            if (a instanceof CameraLayer || b instanceof CameraLayer) continue;
            if (b.inPoint <= a.inPoint + fd * 0.5) continue;
            gap = b.inPoint - a.outPoint;
            if (gap > fd * 6 || gap < -1.2) continue;
            if (Math.abs(gap) < bg) {
                bg = Math.abs(gap);
                t = (gap <= 0) ? (b.inPoint + a.outPoint) / 2 : (a.outPoint + b.inPoint) / 2;
                best = t;
            }
        }
    }
    if (best !== null) return { t: Math.round(best / fd) * fd, how: "join" };
    return { t: Math.round(c.time / fd) * fd, how: "playhead" };
}

function ops_blendMode(name) {
    if (name === "add") return BlendingMode.ADD;
    if (name === "screen") return BlendingMode.SCREEN;
    if (name === "overlay") return BlendingMode.OVERLAY;
    if (name === "softlight") return BlendingMode.SOFT_LIGHT;
    if (name === "multiply") return BlendingMode.MULTIPLY;
    return null;
}

// a new adjustment layer, placed above the selection and trimmed to the span of the effect
function ops_newAdj(c, sel, name, ctx, win, tIn, tOut) {
    var l = c.layers.addSolid([1, 1, 1], name, c.width, c.height, c.pixelAspect, c.duration), t0, t1;
    l.adjustmentLayer = true;
    try { l.motionBlur = true; } catch (e0) {}
    t0 = tIn; t1 = tOut;
    if (t0 < 0) t0 = 0;
    if (t1 > c.duration) t1 = c.duration;
    if (t1 <= t0) { t0 = Math.max(0, c.duration - ctx.fd * 4); t1 = c.duration; }
    try { l.inPoint = t0; l.outPoint = t1; } catch (e1) {}
    ops_placeAbove(l, sel);
    return l;
}

// the widest span (in comp frames, around the cut) that any key of the recipe reaches
function ops_extent(p, k30) {
    var ext = { lo: 0, hi: 0 }, i, key;
    function scan(list) {
        var fr, j;
        if (!(list instanceof Array) || !list.length || !(list[0] instanceof Array) || list[0].length < 2) return;
        fr = ops_frames(list, k30);
        for (j = 0; j < fr.length; j++) {
            if (fr[j] === null) continue;
            if (fr[j] < ext.lo) ext.lo = fr[j];
            if (fr[j] > ext.hi) ext.hi = fr[j];
        }
    }
    function entries(fxl) {
        var q, kk;
        for (q = 0; q < fxl.length; q++) {
            if (!fxl[q].k) continue;
            for (kk in fxl[q].k) { if (fxl[q].k.hasOwnProperty(kk)) scan(fxl[q].k[kk]); }
        }
    }
    entries(p.fx || []);
    if (p.mask && p.mask.c) scan(p.mask.c);
    if (p.under) {
        for (i = 0; i < p.under.length; i++) {
            entries(p.under[i].fx || []);
            if (p.under[i].mask && p.under[i].mask.c) scan(p.under[i].mask.c);
        }
    }
    return ext;
}

// the whole recipe: [main adjustment layer] + [layers underneath it] + one marker on the cut
function ops_stack(c, sel, r, targets, warn, out) {
    var p = r.p, k = r.intensity, ctx = ops_ctx(c), direct, cut, a, b, tIn, tOut, main, name, i, j, u, ul, made = [], last, mv, needsAdj, blend, tl, ext;
    needsAdj = !!(p.under || p.mask || p.blend || p.lop || p.lopk);
    direct = (r.target === "layers") && !needsAdj;
    ctx.span = p.span;
    a = Math.round(p.win[0] * ctx.k30);
    b = Math.round(p.win[1] * ctx.k30);
    if (p.span !== "auto") {
        ext = ops_extent(p, ctx.k30);
        if (ext.lo < a) a = ext.lo;
        if (ext.hi > b) b = ext.hi;
    }

    if (p.span === "cut") { cut = ops_findCut(c, sel); ctx.T = cut.t; }
    else if (p.span === "hit") { cut = { t: Math.round(c.time / ctx.fd) * ctx.fd, how: "playhead" }; ctx.T = cut.t; }
    if (cut) { out.cutT = ctx.T; out.cutHow = cut.how; }

    if (direct) {
        // effects straight onto the selected layers
        for (i = 0; i < targets.length; i++) {
            tl = targets[i];
            if (p.span === "auto") { ctx.tin = tl.inPoint; ctx.tout = tl.outPoint; }
            for (j = 0; j < p.fx.length; j++) ops_applyEntry(tl, p.fx[j], ctx, k, warn);
            made.push(tl);
        }
        out.markers = 0;
        return made;
    }

    if (p.span === "auto") {
        a = ops_selectedSpan(sel, c);
        tIn = a.tin; tOut = a.tout;
        ctx.tin = tIn; ctx.tout = tOut;
    } else {
        tIn = ctx.T + a * ctx.fd;
        tOut = ctx.T + (b + 1) * ctx.fd;
        ctx.tin = tIn; ctx.tout = tOut;
    }
    name = ops_uniqueName(c, r.name, true);
    main = ops_newAdj(c, sel, name, ctx, p.win, tIn, tOut);
    made.push(main);

    // layers underneath (a masked invert bar, a vignette ...) are built first so the main layer sits on top
    if (p.under) {
        last = main;
        for (i = 0; i < p.under.length; i++) {
            u = p.under[i];
            ul = ops_newAdj(c, sel, name + " - " + (u.n || "Part"), ctx, p.win, tIn, tOut);
            try { ul.moveAfter(last); } catch (e1) {}
            last = ul;
            if (u.mask) ops_addMask(ul, u.mask, ctx, warn);
            for (j = 0; j < u.fx.length; j++) ops_applyEntry(ul, u.fx[j], ctx, k, warn);
            made.push(ul);
        }
    }

    for (j = 0; j < p.fx.length; j++) ops_applyEntry(main, p.fx[j], ctx, k, warn);
    if (p.mask) ops_addMask(main, p.mask, ctx, warn);
    if (p.blend) {
        blend = ops_blendMode(p.blend);
        if (blend !== null) { try { main.blendingMode = blend; } catch (e2) { warn.push("Blend mode: " + e2); } }
    }
    if (p.lopk) {
        try { ops_writeKeys(main.property("ADBE Transform Group").property("ADBE Opacity"), p.lopk, ctx, function (v) { return v; }, warn, "Layer opacity", false); }
        catch (e3b) { warn.push("Opacity keys: " + e3b); }
    } else if (p.lop) { try { main.property("ADBE Transform Group").property("ADBE Opacity").setValue(p.lop); } catch (e3) { warn.push("Opacity: " + e3); } }

    // the one marker: where the cut sits between the two clips
    out.markers = 0;
    if (p.marker && cut) {
        try {
            mv = new MarkerValue(p.span === "cut" ? "Cut" : "Hit");
            main.property("ADBE Marker").setValueAtTime(ctx.T, mv);
            out.markers = 1;
        } catch (e4) { warn.push("Marker: " + e4); }
    }
    return made;
}
// ---------- speed ramps (time remapping) ----------
function ops_smooth(x) { return x * x * (3 - 2 * x); }

// speed (1 = normal) at u (0..1) for knots [[u, speed, influence], ...]
function ops_rampSpeed(knots, u) {
    var i, a, b, x;
    if (u <= knots[0][0]) return knots[0][1];
    for (i = 1; i < knots.length; i++) {
        if (u <= knots[i][0]) {
            a = knots[i - 1]; b = knots[i];
            x = (u - a[0]) / (b[0] - a[0]);
            return a[1] + (b[1] - a[1]) * ops_smooth(x);
        }
    }
    return knots[knots.length - 1][1];
}

// how far (in normal-speed seconds) the footage has advanced at every knot
function ops_rampAdvance(knots, dur) {
    var out = [0], i, j, steps = 100, u0, u1, h, sum = 0;
    for (i = 1; i < knots.length; i++) {
        u0 = knots[i - 1][0]; u1 = knots[i][0]; h = (u1 - u0) / steps;
        for (j = 0; j < steps; j++) sum += ops_rampSpeed(knots, u0 + (j + 0.5) * h) * h * dur;
        out.push(sum);
    }
    return out;
}

function ops_ease1(speed, infl) { return [new KeyframeEase(speed, infl)]; }

function fx_ramp(layer, r, warn, out) {
    var c = ops_comp(), p = r.p, k = r.intensity, tr, n, ta, tb, tEnd, vEnd, v0, base, dur, room, knots = [], adv, i, t, v, vb, vEndNew, idx, sp, spIn, spOut, infl, src, sc, cur, z, zt, zv, ea;
    if (!layer.canSetTimeRemapEnabled) throw new Error("Speed ramps need a video, footage or pre-comp layer.");
    if (layer.timeRemapEnabled) {
        tr = layer.property("ADBE Time Remapping");
        if (tr.numKeys > 2) throw new Error("This layer already has a speed ramp. Undo it, or turn off Layer > Time > Enable Time Remapping first.");
    } else {
        layer.timeRemapEnabled = true;
        tr = layer.property("ADBE Time Remapping");
    }
    n = tr.numKeys;
    tEnd = tr.keyTime(n);
    vEnd = tr.keyValue(n);
    ta = c.time;
    if (ta < layer.inPoint) ta = layer.inPoint;
    room = tEnd - ta;
    if (room < 0.25) throw new Error("Move the playhead earlier: the layer ends too soon after it.");
    dur = p.dur;
    if (dur > room - 2 * c.frameDuration) dur = room - 2 * c.frameDuration;
    v0 = tr.valueAtTime(ta, false);
    base = (vEnd - v0) / (tEnd - ta);
    if (!(base > 0.01)) base = 1;

    for (i = 0; i < p.knots.length; i++) {
        sp = p.knots[i][1];
        if (sp > 0) sp = Math.pow(sp, k);
        knots.push([p.knots[i][0], sp, p.knots[i][2] || 33.333]);
    }
    adv = ops_rampAdvance(knots, dur);
    for (i = 0; i < knots.length; i++) {
        tr.setValueAtTime(ta + knots[i][0] * dur, v0 + adv[i] * base);
    }
    tb = ta + dur;
    vb = v0 + adv[knots.length - 1] * base;
    vEndNew = vb + (tEnd - tb) * base;          // after the ramp the clip plays at normal speed again
    tr.setValueAtKey(tr.nearestKeyIndex(tEnd), vEndNew);

    // smooth curves: every ramp key gets the speed it should have at that moment
    for (i = 0; i < knots.length; i++) {
        t = ta + knots[i][0] * dur;
        idx = tr.nearestKeyIndex(t);
        sp = knots[i][1] * base;
        infl = knots[i][2];
        // the clip plays at normal speed before the first key and after the last one, so those sides keep that speed
        spIn = (i === 0) ? base : sp;
        spOut = (i === knots.length - 1) ? base : sp;
        try {
            tr.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            tr.setTemporalEaseAtKey(idx, ops_ease1(spIn, infl), ops_ease1(spOut, infl));
        } catch (e1) { warn.push("Ramp easing: " + e1); }
    }
    try {
        if (tr.keyTime(1) < ta - c.frameDuration / 2) {
            tr.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            tr.setTemporalEaseAtKey(1, ops_ease1(base, 33.333), ops_ease1(base, 33.333));
        }
        idx = tr.nearestKeyIndex(tEnd);
        tr.setInterpolationTypeAtKey(idx, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        tr.setTemporalEaseAtKey(idx, ops_ease1(base, 33.333), ops_ease1(base, 33.333));
    } catch (e2) { warn.push("Ramp easing at the ends: " + e2); }

    // smoother slow motion
    try { layer.frameBlendingType = FrameBlendingType.FRAME_MIX; layer.frameBlending = true; c.frameBlending = true; } catch (e3) { warn.push("Frame blending: " + e3); }
    try { layer.motionBlur = true; c.motionBlur = true; } catch (e4) { warn.push("Motion blur: " + e4); }

    // optional push-in that peaks in the slowest moment
    if (p.zoom) {
        try {
            sc = layer.property("ADBE Transform Group").property("ADBE Scale");
            if (sc.numKeys === 0 && !sc.expressionEnabled) {
                cur = sc.value;
                z = 1 + (p.zoom * k) / 100;
                zt = ta + p.zoomAt * dur;
                zv = [];
                ea = [];
                for (i = 0; i < cur.length; i++) { zv.push(cur[i] * z); ea.push(new KeyframeEase(0, 40)); }
                sc.setValueAtTime(ta, cur);
                sc.setValueAtTime(zt, zv);
                sc.setValueAtTime(tb, cur);
                for (i = 1; i <= 3; i++) {
                    sc.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                    sc.setTemporalEaseAtKey(i, ea, ea);
                }
            } else warn.push("Zoom skipped: the layer's scale is already animated.");
        } catch (e6) { warn.push("Zoom: " + e6); }
    }
    try {
        src = layer.source;
        if (src && src.duration && vEndNew > src.duration + 0.05) warn.push("The ramp speeds the clip up: its footage runs out about " + (Math.round((vEndNew - src.duration) * 10) / 10) + " s before the layer ends (it holds the last frame).");
    } catch (e7) {}
    out.rampFrom = ta;
    out.rampTo = tb;
}

// =====================================================================================================
// Liquid glass (v0.6): no expressions, no mattes. Built the way the tutorials do it, from native pieces:
//   shadow (solid, masked ring) / body (adjustment layer: frost blur) / edge (adjustment layer on a ring mask:
//   magnify + Turbulent Displace wobble + Channel Blur dispersion) / tint (white veil) / rim (shape layer: stroke, shine arcs, glow)
// All of them hang on one "Controller" null: move or scale it and the whole glass follows.
// =====================================================================================================
function ops_rrShape(cx, cy, w, h, r) {
    var s = new Shape(), x0, x1, y0, y1, k;
    if (r > w / 2) r = w / 2;
    if (r > h / 2) r = h / 2;
    if (r < 0) r = 0;
    x0 = cx - w / 2; x1 = cx + w / 2; y0 = cy - h / 2; y1 = cy + h / 2;
    k = 0.5523 * r;
    s.vertices = [[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r]];
    s.inTangents = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
    s.outTangents = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
    s.closed = true;
    return s;
}

function ops_glassMask(layer, name, mode, shape, feather, inverted) {
    var m = layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    m.name = name;
    m.maskMode = mode;
    m.inverted = !!inverted;
    m.property("ADBE Mask Shape").setValue(shape);
    if (feather > 0) m.property("ADBE Mask Feather").setValue([feather, feather]);
    return m;
}

function ops_glassLayer(c, name, adj, tIn, tOut, col) {
    var l = c.layers.addSolid(col || (adj ? [1, 1, 1] : [0, 0, 0]), name, c.width, c.height, c.pixelAspect, c.duration);
    if (adj) l.adjustmentLayer = true;
    try { l.inPoint = tIn; l.outPoint = tOut; } catch (e) {}
    return l;
}

// opacity 0 -> target over `len` seconds from tIn
function ops_fadeIn(layer, tIn, len, target, warn) {
    var op = layer.property("ADBE Transform Group").property("ADBE Opacity");
    try {
        op.setValueAtTime(tIn, 0);
        op.setValueAtTime(tIn + len, target);
        op.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        op.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        op.setTemporalEaseAtKey(1, [new KeyframeEase(0, 33.333)], [new KeyframeEase(0, 33.333)]);
        op.setTemporalEaseAtKey(2, [new KeyframeEase(0, 60)], [new KeyframeEase(0, 60)]);
    } catch (e) { warn.push("Fade-in: " + e); }
}

function ops_glassFx(layer, t, name, ctx, st, sk, warn) {
    // tiny wrapper around the recipe engine: st = static values, sk = keyed values
    return ops_applyEntry(layer, { t: t, n: name, s: st, k: sk }, ctx, 1, warn);
}

function ops_glass(c, sel, r, warn, out) {
    var p = r.p, kk = r.intensity, ctx = ops_ctx(c), s = c.width / 1920, cx = c.width / 2, cy = c.height / 2, W = p.w * s, H = p.h * s, R, t, pf, i,
        tIn, tOut, sp, lay = [], ctrl, base, shadow, body, edge, tint, rim, popF, popS, ey, ring, cap, sh, root, g, gv, path, stroke, fx, tr, P, fTL, fBR, kcol, ln, items, sc, ea;
    R = (p.rad > 0 ? p.rad * s : Math.min(W, H) / 2);
    if (R > Math.min(W, H) / 2) R = Math.min(W, H) / 2;
    t = Math.min(Math.max(Math.min(W, H) * 0.16, 18 * s), 70 * s);
    if (t > Math.min(W, H) * 0.3) t = Math.min(W, H) * 0.3;

    tIn = Math.round(c.time / ctx.fd) * ctx.fd;
    if (sel.length > 0) { sp = ops_selectedSpan(sel, c); tOut = sp.tout; } else tOut = c.duration;
    if (tOut <= tIn + ctx.fd * 8) tOut = c.duration;
    if (tOut <= tIn + ctx.fd * 8) tIn = Math.max(0, c.duration - ctx.fd * 30);
    ctx.span = "auto"; ctx.tin = tIn; ctx.tout = tOut;
    popF = Math.max(2, Math.round(p.pop * ctx.k30)) * ctx.fd;

    base = ops_uniqueName(c, r.name, true);
    ln = base;

    // --- the layers (created bottom to top, so each new one is moved above the selection afterwards)
    // shadow: a soft dark shape under the glass, with the glass area cut out so it never dims the inside
    shadow = ops_glassLayer(c, base + " Shadow", false, tIn, tOut);
    ey = Math.min(W, H) * 0.07;
    ops_glassMask(shadow, "Shadow", MaskMode.ADD, ops_rrShape(cx, cy + ey, W * 1.0, H * 1.0, R), 46 * s * (0.6 + p.shadow / 100));
    ops_glassMask(shadow, "Glass cut-out", MaskMode.SUBTRACT, ops_rrShape(cx, cy, W - 2, H - 2, R), 3 * s);
    // keep the additive mask first
    try { shadow.property("ADBE Mask Parade").property("Shadow").moveTo(1); } catch (e1) {}

    // body: frosted blur + color inside the glass
    body = ops_glassLayer(c, base + " Body", true, tIn, tOut);
    ops_glassMask(body, "Body", MaskMode.ADD, ops_rrShape(cx, cy, W - t * 0.6, H - t * 0.6, Math.max(R - t * 0.3, 2)), Math.max(2, t * 0.45));
    if (p.frost > 0) ops_glassFx(body, "gblur", "Frost", ctx, { rad: p.frost * 1.6 * s / ctx.sc, edge: 1 }, null, warn);
    ops_glassFx(body, "hs", "Glass Color", ctx, { sat: p.sat, lit: p.lit }, null, warn);

    // edge: the refracting rim, a ring that magnifies, wobbles and splits colors
    edge = ops_glassLayer(c, base + " Edge", true, tIn, tOut);
    ring = ops_glassMask(edge, "Outer", MaskMode.ADD, ops_rrShape(cx, cy, W, H, R), Math.max(2, t * 0.5));
    ops_glassMask(edge, "Inner", MaskMode.SUBTRACT, ops_rrShape(cx, cy, W - 2 * t, H - 2 * t, Math.max(R - t, 2)), Math.max(2, t * 0.7));
    try { ring.moveTo(1); } catch (e2) {}
    ops_glassFx(edge, "tf", "Magnify", ctx, { sh: 100 + p.lens * kk, shut: 0 }, null, warn);
    ops_glassFx(edge, "td", "Liquid Wobble", ctx, { type: 4, amt: p.wob * kk * s / ctx.sc, size: 70 * s, cx: 2 }, { evo: [["i", 0, "L"], ["o", 360 * Math.max(1, Math.round((tOut - tIn) / 4)), "L"]] }, warn);
    fx = ops_applyEntry(edge, { t: "chan", n: "Dispersion", s: { r: p.split * 0.8 * kk * s / ctx.sc, g: 0, b: p.split * 1.3 * kk * s / ctx.sc, dir: 1 } }, ctx, 1, warn);
    ops_glassFx(edge, "gblur", "Soften", ctx, { rad: 1.2 * s / ctx.sc, edge: 1 }, null, warn);
    ops_glassFx(edge, "expo", "Edge Light", ctx, { ev: 0.18 }, null, warn);

    // tint: a very light veil
    tint = ops_glassLayer(c, base + " Tint", false, tIn, tOut, [1, 1, 1]);
    ops_glassMask(tint, "Tint", MaskMode.ADD, ops_rrShape(cx, cy, W - 2, H - 2, R), 2 * s);

    // rim: stroke + two shine arcs, on a shape layer
    rim = c.layers.addShape();
    rim.name = base + " Rim";
    try { rim.inPoint = tIn; rim.outPoint = tOut; } catch (e4) {}
    root = rim.property("ADBE Root Vectors Group");
    P = 2 * (W - 2 * R) + 2 * (H - 2 * R) + 2 * Math.PI * R;
    fTL = 1 - (Math.PI * R / 4) / P;
    fBR = ((W - 2 * R) + Math.PI * R / 2 + (H - 2 * R) + Math.PI * R / 4) / P;
    items = [["Rim", p.rimW * s, p.rim, 0, 100, 0], ["Shine", p.shineW * s, p.shine, 0, 15, 360 * (fTL - 0.075)], ["Shine 2", p.shineW * s, p.shine * 0.55, 0, 10, 360 * (fBR - 0.05)]];
    for (i = 0; i < items.length; i++) {
        g = root.addProperty("ADBE Vector Group");
        g.name = items[i][0];
        gv = g.property("ADBE Vectors Group");
        path = gv.addProperty("ADBE Vector Shape - Group");
        path.property("ADBE Vector Shape").setValue(ops_rrShape(0, 0, W, H, R));
        stroke = gv.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Color").setValue([1, 1, 1, 1]);
        stroke.property("ADBE Vector Stroke Width").setValue(items[i][1]);
        stroke.property("ADBE Vector Stroke Opacity").setValue(items[i][2]);
        try { stroke.property("ADBE Vector Stroke Line Cap").setValue(2); } catch (e5) {}
        if (i > 0) {
            tr = gv.addProperty("ADBE Vector Filter - Trim");
            tr.property("ADBE Vector Trim Start").setValue(items[i][3]);
            tr.property("ADBE Vector Trim End").setValue(items[i][4]);
            tr.property("ADBE Vector Trim Offset").setValue(items[i][5]);
        }
    }
    ops_glassFx(rim, "glow", "Rim Glow", ctx, { thr: 60, rad: 14 * s / ctx.sc, "int": 0.45 }, null, warn);

    // stacking: each new layer lands on top, so the order is already controller, rim, tint, edge, body, shadow
    lay = [rim, tint, edge, body, shadow];

    // --- controller
    ctrl = c.layers.addNull(c.duration);
    ctrl.name = ops_uniqueName(c, base + " Controller", true);
    try { ctrl.inPoint = tIn; ctrl.outPoint = tOut; } catch (e9) {}
    ctrl.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
    ctrl.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy]);
    try { ctrl.moveToBeginning(); } catch (e10) {}
    for (i = 0; i < lay.length; i++) {
        try {
            lay[i].parent = ctrl;
            lay[i].property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
        } catch (e11) { warn.push("Parenting " + lay[i].name + ": " + e11); }
    }

    // --- pop-in: the controller scales in with a small overshoot, every layer fades up
    sc = ctrl.property("ADBE Transform Group").property("ADBE Scale");
    try {
        sc.setValueAtTime(tIn, [86, 86]);
        sc.setValueAtTime(tIn + popF * 0.65, [103, 103]);
        sc.setValueAtTime(tIn + popF, [100, 100]);
        for (i = 1; i <= 3; i++) {
            sc.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
            ea = [new KeyframeEase(0, 40), new KeyframeEase(0, 40)];
            try { sc.setTemporalEaseAtKey(i, ea, ea); } catch (e12) { sc.setTemporalEaseAtKey(i, [new KeyframeEase(0, 40)], [new KeyframeEase(0, 40)]); }
        }
    } catch (e13) { warn.push("Pop-in: " + e13); }
    ops_fadeIn(rim, tIn, popF * 0.8, 100, warn);
    ops_fadeIn(tint, tIn, popF * 0.8, p.tint, warn);
    ops_fadeIn(edge, tIn, popF * 0.8, 100, warn);
    ops_fadeIn(body, tIn, popF * 0.8, 100, warn);
    ops_fadeIn(shadow, tIn, popF * 1.2, Math.min(100, p.shadow * 1.2), warn);

    ops_onlySelect(c, [ctrl]);
    out.name = base;
    out.glassLayers = 6;
    return ctrl;
}


// ---------- Liquid Glass v2: rebuilt from the studio's own Glass.aep (Comp 2) with fewer layers ----------
// lens (adjustment shape: Fast Box Blur 15 + Transform 110% + Displacement Map from a soft "map" pre-comp),
// optional shadow, optional inner glows, and a rim-light layer (two CC Light Sweeps).  All numbers are the
// 3840 x 2160 values of the original project, scaled to the comp.  Styles: 1 With background, 2 Light, 3 Dark.
var OPS_STEP = "";
function ops_g2Shape(layer, gname, w, h, rad, strokeW, strokeCol, fillCol) {
    var g = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"), cont, rc, st, fl;
    g.name = gname || "Rectangle 1";
    cont = g.property("ADBE Vectors Group");
    rc = cont.addProperty("ADBE Vector Shape - Rect");
    rc.name = "Rectangle Path 1";
    rc.property("ADBE Vector Rect Size").setValue([w, h]);
    rc.property("ADBE Vector Rect Roundness").setValue(rad);
    if (strokeW > 0) {
        st = cont.addProperty("ADBE Vector Graphic - Stroke");
        st.property("ADBE Vector Stroke Color").setValue(strokeCol || [1, 1, 1]);
        st.property("ADBE Vector Stroke Width").setValue(strokeW);
    }
    if (fillCol) {
        fl = cont.addProperty("ADBE Vector Graphic - Fill");
        fl.property("ADBE Vector Fill Color").setValue(fillCol);
    }
    return layer;
}
// property handles go stale when siblings are added ("Object is invalid"), so always fetch the rectangle fresh
function ops_g2Rect(layer, grp) {
    return layer.property("ADBE Root Vectors Group").property(grp || "Rectangle 1").property("ADBE Vectors Group").property("Rectangle Path 1");
}
function ops_g2Expr(prop, ex, warn, what) {
    try { prop.expression = ex; } catch (e) { warn.push(what + " link: " + e); }
}
function ops_g2Fx(layer, mn, name) {
    var fx = layer.property("ADBE Effect Parade").addProperty(mn);
    if (name) fx.name = name;
    return fx;
}
function ops_g2Set(fx, mn, v, warn) {
    try { fx.property(mn).setValue(v); } catch (e) { warn.push(mn + ": " + e); }
}

function ops_glass2(c, sel, r, warn, out) {
    OPS_STEP = "start";
    var p = r.p, G = p.g || { w: 1800, h: 500, rad: 100 }, style = p.style || 2, kk = c.height / 2160, ws, W, H, RAD, ctx = ops_ctx(c),
        tIn, tOut, sp, base, nLens, nMap, cx = c.width / 2, cy = c.height / 2, made = [], lens, shadow, edge, rim, soft, sweep, mapL, mapC, mc, ml, i, fx, k = r.intensity || 1,
        ref, refRC, purple = [30 / 255, 16 / 255, 57 / 255];
    ws = Math.min(kk, c.width * 0.9 / G.w);           // the box must fit the comp
    W = G.w * ws; H = G.h * ws; RAD = G.rad * ws;

    tIn = Math.round(c.time / ctx.fd) * ctx.fd;
    if (sel.length > 0) { sp = ops_selectedSpan(sel, c); tOut = sp.tout; } else tOut = c.duration;
    if (tOut <= tIn + ctx.fd * 8) tOut = c.duration;
    if (tOut <= tIn + ctx.fd * 8) tIn = Math.max(0, c.duration - ctx.fd * 30);

    base = ops_uniqueName(c, r.name, true);
    nLens = base; nMap = base + " Map";
    var Q = 'thisComp.layer("' + nLens.replace(/"/g, '\\"') + '")';
    var RECT = '.content("Rectangle 1").content("Rectangle Path 1")';

    OPS_STEP = "map";
    // ---- map pre-comp: soft rounded shape, gray inside (no displacement) with a bright rim (edge refraction)
    mapC = app.project.items.addComp(nMap, c.width, c.height, c.pixelAspect, c.duration, c.frameRate);
    ml = mapC.layers.addShape();
    ml.name = "Map";
    mc = ops_g2Shape(ml, "Rectangle 1", W, H, RAD, 50 * kk, [1, 1, 1], [0.5, 0.5, 0.5]);
    ml.property("ADBE Root Vectors Group").property("Rectangle 1").property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([0, 0]);
    ml.property("ADBE Transform Group").property("ADBE Position").setValue([mapC.width / 2, mapC.height / 2]);
    ops_g2Expr(ops_g2Rect(ml).property("ADBE Vector Rect Size"), 'comp("' + c.name.replace(/"/g, '\\"') + '").layer("' + nLens.replace(/"/g, '\\"') + '")' + RECT + '.size', warn, "Map size");
    var QM = 'comp("' + c.name.replace(/"/g, '\\"') + '").layer("' + nLens.replace(/"/g, '\\"') + '")' + RECT;
    ops_g2Expr(ops_g2Rect(ml).property("ADBE Vector Rect Roundness"), "s = " + QM + ".size; Math.min(" + QM + ".roundness, Math.min(s[0], s[1]) / 2)", warn, "Map roundness");
    fx = ops_g2Fx(ml, "ADBE Box Blur2", "Fast Box Blur");
    ops_g2Set(fx, "ADBE Box Blur2-0001", 20 * kk, warn);
    mapL = c.layers.add(mapC);
    mapL.name = nMap;
    // the Displacement Map only follows the map layer's move / scale when this pre-comp layer has "Collapse Transformations" on
    try { mapL.collapseTransformation = true; } catch (ecl) { warn.push("Could not switch on Collapse Transformations for \"" + nMap + "\": turn on its sun switch yourself, or the glass will not follow the controller."); }
    try { if (mapL.collapseTransformation !== true) warn.push("Collapse Transformations is off on \"" + nMap + "\": turn on its sun switch, or the glass will not follow the controller."); } catch (ecl2) {}
    try { mapL.enabled = false; } catch (e0) {}
    try { mapL.inPoint = tIn; mapL.outPoint = tOut; } catch (e1) {}

    function mkShape(nm) {
        var l = c.layers.addShape();
        l.name = nm;
        try { l.inPoint = tIn; l.outPoint = tOut; } catch (e) {}
        return l;
    }
    var kids = [];
    function follow(l) { kids.push(l); }      // parented to the lens at the end: move / scale / rotate the lens and everything follows
    function groupPos(l, y) { l.property("ADBE Root Vectors Group").property("Rectangle 1").property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([0, y || 0]); }
    function link(lay, sw, grp) {
        var rc = ops_g2Rect(lay, grp);          // size / roundness follow the lens; sw = inset (the stroke sits inside the edge)
        var inset = sw > 0 ? " - " + sw : "";
        ops_g2Expr(rc.property("ADBE Vector Rect Size"), "s = " + Q + RECT + ".size; [s[0]" + inset + ", s[1]" + inset + "]", warn, "Size");
        ops_g2Expr(rc.property("ADBE Vector Rect Roundness"), "s = " + Q + RECT + ".size; Math.max(0, Math.min(" + Q + RECT + ".roundness, Math.min(s[0], s[1]) / 2)" + (sw > 0 ? " - " + (sw / 2) : "") + ")", warn, "Roundness");
    }
    function opacity(l, v) { l.property("ADBE Transform Group").property("ADBE Opacity").setValue(v); }

    OPS_STEP = "map follow";
    follow(mapL);

    OPS_STEP = "shadow";
    // ---- shadow (styles 2, 3): soft color blob under the glass
    if (style === 2 || style === 3) {
        shadow = mkShape(base + " Shadow");
        var scol = style === 3 ? [0, 0, 0] : purple;
        ref = ops_g2Shape(shadow, "Rectangle 1", W, H, RAD, 160 * kk, scol, scol);
        groupPos(shadow, 230 * kk);
        link(shadow, 0);
        fx = ops_g2Fx(shadow, "ADBE Box Blur2", "Fast Box Blur"); ops_g2Set(fx, "ADBE Box Blur2-0001", 130 * kk, warn);
        shadow.property("ADBE Transform Group").property("ADBE Scale").setValue([95, 95, 95]);
        opacity(shadow, 40);
        follow(shadow);
        made.push(shadow);
    }

    OPS_STEP = "lens";
    // ---- the lens (adjustment layer)
    lens = c.layers.addShape();
    lens.name = nLens;
    try { lens.inPoint = tIn; lens.outPoint = tOut; } catch (e2) {}
    refRC = ops_g2Shape(lens, "Rectangle 1", W, H, RAD, 5 * kk, [1, 1, 1], [1, 1, 1]);
    lens.adjustmentLayer = true;
    lens.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy]);
    // the lens' own Rectangle Path (Size / Roundness) is the master: edit it directly, every other glass layer follows
    fx = ops_g2Fx(lens, "ADBE Box Blur2", "Fast Box Blur"); ops_g2Set(fx, "ADBE Box Blur2-0001", 15 * kk, warn);
    fx = ops_g2Fx(lens, "ADBE Geometry2", "Transform");
    ops_g2Set(fx, "ADBE Geometry2-0003", 110, warn);
    ops_g2Set(fx, "ADBE Geometry2-0001", [0, 0], warn);     // the lens is drawn around its own anchor, so (0, 0) is its center
    ops_g2Set(fx, "ADBE Geometry2-0002", [0, 0], warn);
    OPS_STEP = "lens displacement";
    var dm = ops_g2Fx(lens, "ADBE Displacement Map", "Displacement Map");
    ops_g2Set(dm, "ADBE Displacement Map-0001", mapL.index, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0002", 5, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0003", 335 * kk * k, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0004", 5, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0005", 210 * kk * k, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0006", 1, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0007", 1, warn);
    made.push(lens);

    OPS_STEP = "glows";
    // ---- inner glows
    function glow(nm, sw, blur, op, col) {
        var l = mkShape(nm), rc = ops_g2Shape(l, "Rectangle 1", W, H, RAD, sw * kk, col, null), f;
        groupPos(l, 0);
        link(l, sw * kk);
        f = ops_g2Fx(l, "ADBE Box Blur2", "Fast Box Blur"); ops_g2Set(f, "ADBE Box Blur2-0001", blur * kk, warn);
        opacity(l, op);
        follow(l);
        made.push(l);
        return l;
    }
    if (style === 1) soft = glow(base + " Soft Glow", 30, 30, 40, [1, 1, 1]);
    if (style === 1 || style === 3) rim = glow(base + " Rim", 19, 4, 20, [1, 1, 1]);
    if (style === 2 || style === 3) edge = glow(base + " Edge", 8, 5, 80, style === 3 ? [1, 1, 1] : purple);

    OPS_STEP = "shine";
    // ---- rim light: two bright arcs of the glass edge (a trimmed stroke on the very same rounded rectangle,
    // so they can never drift off the box). Trim Start / End / Offset are plain values you can change.
    sweep = mkShape(base + " Shine");
    var arcs = [["Shine 1", 62, 97], ["Shine 2", 4, 36]], sg, gcont, grc, gst, gtr, aw = 5 * kk;
    for (i = 0; i < arcs.length; i++) {
        sg = sweep.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        sg.name = arcs[i][0];
        gcont = sg.property("ADBE Vectors Group");
        grc = gcont.addProperty("ADBE Vector Shape - Rect");
        grc.name = "Rectangle Path 1";
        grc.property("ADBE Vector Rect Size").setValue([W - aw, H - aw]);
        grc.property("ADBE Vector Rect Roundness").setValue(Math.max(0, RAD - aw / 2));
        gst = gcont.addProperty("ADBE Vector Graphic - Stroke");
        gst.property("ADBE Vector Stroke Color").setValue([1, 1, 1]);
        gst.property("ADBE Vector Stroke Width").setValue(aw);
        try { gst.property("ADBE Vector Stroke Line Cap").setValue(2); } catch (ec) {}
        gtr = gcont.addProperty("ADBE Vector Filter - Trim");
        gtr.property("ADBE Vector Trim Start").setValue(arcs[i][1]);
        gtr.property("ADBE Vector Trim End").setValue(arcs[i][2]);
        link(sweep, aw, arcs[i][0]);
    }
    fx = ops_g2Fx(sweep, "ADBE Box Blur2", "Fast Box Blur"); ops_g2Set(fx, "ADBE Box Blur2-0001", 2.5 * kk, warn);
    follow(sweep);
    made.push(sweep);

    OPS_STEP = "parenting";
    for (i = 0; i < kids.length; i++) {
        try {
            kids[i].parent = lens;
            // AE keeps a child where it was when it gets a parent, so put it back on the parent's anchor afterwards
            kids[i].property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
            if (kids[i] === shadow) kids[i].property("ADBE Transform Group").property("ADBE Scale").setValue([95, 95, 95]);
        } catch (ep) { warn.push("Parent: " + ep); }
    }
    OPS_STEP = "ordering";
    // ---- order: [shine, glows, lens, shadow, map] and park everything above the selection
    var order = [sweep, edge, rim, soft, lens, shadow, mapL], j, top = null, lst = [];
    for (j = 0; j < order.length; j++) if (order[j]) lst.push(order[j]);
    for (j = 0; j < sel.length; j++) if (top === null || sel[j].index < top.index) top = sel[j];
    try {
        if (top) { for (j = 0; j < lst.length; j++) lst[j].moveBefore(top); }
        else { for (j = lst.length - 1; j >= 0; j--) lst[j].moveToBeginning(); }
    } catch (e4) {}
    // the map pre-comp may have moved: point the displacement at its final index
    try { ops_g2Set(lens.property("ADBE Effect Parade").property("Displacement Map"), "ADBE Displacement Map-0001", mapL.index, warn); } catch (e5) {}
    ops_onlySelect(c, [lens]);
    out.name = base;
    out.layers = lst.length;
    return lens;
}

// recipe: { name, kind: "stack" | "glass" | "ramp", p: {...}, target: "adj" | "layers", intensity }
function ops_fx(r) {
    var c = ops_comp();
    if (!c) return ops_fail("Open a composition first.");
    var sel = [], i, targets = [], warn = [], made = [], n = 0, locked = 0, l, extra = {}, needTargets, p = r.p || {};
    for (i = 0; i < c.selectedLayers.length; i++) sel.push(c.selectedLayers[i]);
    if (r.kind === "ramp") r.target = "layers";
    needTargets = (r.kind === "ramp") || (r.kind === "stack" && r.target === "layers" && !(p.under || p.mask || p.blend || p.lop || p.lopk));
    if (needTargets) {
        for (i = 0; i < sel.length; i++) { if (sel[i].locked) locked++; else targets.push(sel[i]); }
        if (targets.length === 0) return ops_fail(locked ? "The selected layers are locked." : (r.kind === "ramp" ? "Select a video layer first." : "Select a layer first."));
    }
    if (!r.intensity || r.intensity <= 0) r.intensity = 1;
    if (r.kind === "stack" && (!p.fx || !p.fx.length)) return ops_fail("This effect has no content.");

    app.beginUndoGroup("Hydra: " + r.name);
    try {
        if (r.kind === "glass") {
            if (p.style) { made.push(ops_glass2(c, sel, r, warn, extra)); n = extra.layers || 1; }
            else { made.push(ops_glass(c, sel, r, warn, extra)); n = 1; }
        } else if (r.kind === "stack") {
            made = ops_stack(c, sel, r, targets, warn, extra);
            n = made.length;
            if (r.target !== "layers" || p.under || p.mask || p.blend || p.lop || p.lopk) { if (made.length) ops_onlySelect(c, [made[0]]); extra.name = made.length ? made[0].name : r.name; }
        } else if (r.kind === "pixscan") {
            made.push(ops_pixelScan(c, sel, r, warn, extra));
            n = extra.layers || 1;
        } else if (r.kind === "ramp") {
            for (i = 0; i < targets.length; i++) {
                l = targets[i];
                try { fx_ramp(l, r, warn, extra); n++; }
                catch (e1) { warn.push(l.name + ": " + String(e1.message || e1)); }
            }
        } else {
            app.endUndoGroup();
            return ops_fail("Unknown effect kind: " + r.kind);
        }
    } catch (e) {
        app.endUndoGroup();
        return ops_fail(e);
    }
    app.endUndoGroup();
    if (n === 0) return ops_fail("Could not build the effect. " + (warn.length ? warn[0] : ""));
    extra.layers = n;
    if (!extra.name) extra.name = r.name;
    extra.warnings = warn;
    return ops_ok(extra);
}

// ---------- effect check: does this After Effects have every effect (and parameter) the recipes use? ----------
// Builds a throw-away 64 px comp, tries to add each effect from the table, and removes the comp again.
function ops_checkFx() {
    var comp = null, solid = null, lay, par, k, def, fx, p, spec, missing = [], badParams = [], found = 0, total = 0, shapeMiss = [], sh, g, src, i, nm, items;
    var shapeTypes = ["ADBE Vector Shape - Rect", "ADBE Vector Shape - Ellipse", "ADBE Vector Graphic - Stroke", "ADBE Vector Graphic - Fill", "ADBE Vector Filter - Trim"];
    try {
        comp = app.project.items.addComp("Hydra check", 64, 64, 1, 1, 30);
        lay = comp.layers.addSolid([0.5, 0.5, 0.5], "Hydra check", 64, 64, 1);
        src = lay.source;
        par = lay.property("ADBE Effect Parade");
        for (k in OPS_FXT) {
            if (!OPS_FXT.hasOwnProperty(k)) continue;
            def = OPS_FXT[k]; total++;
            fx = ops_addFx(par, def);
            if (!fx) { missing.push(def.dn + " (" + k + ")"); continue; }
            found++;
            for (p in def.p) {
                if (!def.p.hasOwnProperty(p)) continue;
                spec = ops_fxSpec(k, p);
                if (spec && !ops_fxProp(fx, spec.names, spec.idx, spec.want)) badParams.push(def.dn + ": " + spec.names[0]);
            }
        }
        try {
            var gl = ["ADBE Displacement Map", "CC Light Sweep", "ADBE Geometry2", "ADBE Box Blur2", "ADBE Slider Control", "ADBE Minimax"], gi;
            for (gi = 0; gi < gl.length; gi++) { total++; try { par.addProperty(gl[gi]); found++; } catch (eg) { missing.push(gl[gi] + " (glass)"); } }
        } catch (eg2) {}
        try {
            sh = comp.layers.addShape();
            g = sh.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
            for (i = 0; i < shapeTypes.length; i++) {
                try { g.property("ADBE Vectors Group").addProperty(shapeTypes[i]); } catch (e1) { shapeMiss.push(shapeTypes[i]); }
            }
        } catch (e2) { shapeMiss.push("shape layers: " + e2); }
    } catch (e) {
        try { if (comp) comp.remove(); } catch (e3) {}
        return ops_fail("Check failed: " + e);
    }
    try { comp.remove(); } catch (e4) {}
    try { if (src) src.remove(); } catch (e5) {}
    return ops_ok({ total: total, found: found, missing: missing, badParams: badParams, shapeMissing: shapeMiss });
}

// =====================================================================================================
// v0.9 - Curve, Expressions, Timer, Morph, Liquid Glass studio, Pixel Scan
// =====================================================================================================
function ops_clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function ops_num(v, d) { var n = parseFloat(v); return (n === n && isFinite(n)) ? n : d; }

// all selected *properties* (not groups) of the comp
function ops_selProps(c) {
    var out = [], sp, i;
    try { sp = c.selectedProperties; } catch (e) { sp = []; }
    for (i = 0; i < sp.length; i++) {
        try { if (sp[i].propertyType === PropertyType.PROPERTY) out.push(sp[i]); } catch (e1) {}
    }
    return out;
}

function ops_layerOf(p) {
    try { return p.propertyGroup(p.propertyDepth); } catch (e) { return null; }
}

// a Slider Control effect with this name on the layer (re-used when it exists); returns the effect
function ops_sliderFx(layer, name, v) {
    var par = layer.property("ADBE Effect Parade"), fx = null, i, sl = null;
    for (i = 1; i <= par.numProperties; i++) {
        try {
            if (par.property(i).name === name && par.property(i).matchName === "ADBE Slider Control") { fx = par.property(i); break; }
        } catch (e) {}
    }
    if (!fx) { fx = par.addProperty("ADBE Slider Control"); fx.name = name; }
    try { sl = fx.property("ADBE Slider Control-0001"); } catch (e1) { sl = null; }
    if (!sl) { try { sl = fx.property(1); } catch (e2) { sl = null; } }
    if (sl && v !== undefined && v !== null) { try { sl.setValue(v); } catch (e3) {} }
    return fx;
}

// ---------- Curve: a cubic-bezier [x1, y1, x2, y2] -> After Effects keyframe ease ----------
// For the segment between key i0 and key i1: the out-ease of i0 gets influence x1 and the slope y1/x1,
// the in-ease of i1 gets influence (1 - x2) and the slope (1 - y2) / (1 - x2); slopes are scaled by the value change per second.
function ops_bezEase(prop, i0, i1, b) {
    var vt, spatial, isShape, v0, v1, dt, n, j, d, len, x1, y1, x2, y2, inf1, inf2, so = [], si = [], inE0, outE1, m0, m1, a0, a1, k;
    try { vt = prop.propertyValueType; } catch (e) { return false; }
    isShape = (vt === PropertyValueType.SHAPE);
    spatial = (vt === PropertyValueType.TwoD_SPATIAL || vt === PropertyValueType.ThreeD_SPATIAL);
    dt = prop.keyTime(i1) - prop.keyTime(i0);
    if (!(dt > 0)) return false;
    x1 = ops_clamp(b[0], 0, 1); x2 = ops_clamp(b[2], 0, 1); y1 = b[1]; y2 = b[3];
    inf1 = ops_clamp(x1 * 100, 0.1, 100);
    inf2 = ops_clamp((1 - x2) * 100, 0.1, 100);
    if (isShape) {
        so = [0]; si = [0];
    } else {
        v0 = prop.keyValue(i0); v1 = prop.keyValue(i1);
        n = ops_dims(v0);
        if (spatial) {
            len = 0;
            for (j = 0; j < n; j++) len += (v1[j] - v0[j]) * (v1[j] - v0[j]);
            len = Math.sqrt(len);
            so = [Math.max(0, y1 / Math.max(x1, 0.02) * len / dt)];
            si = [Math.max(0, (1 - y2) / Math.max(1 - x2, 0.02) * len / dt)];
        } else {
            for (j = 0; j < n; j++) {
                d = (n === 1) ? (v1 - v0) : (v1[j] - v0[j]);
                so.push(y1 / Math.max(x1, 0.02) * d / dt);
                si.push((1 - y2) / Math.max(1 - x2, 0.02) * d / dt);
            }
        }
    }
    try {
        prop.setInterpolationTypeAtKey(i0, prop.keyInInterpolationType(i0), KeyframeInterpolationType.BEZIER);
        prop.setInterpolationTypeAtKey(i1, KeyframeInterpolationType.BEZIER, prop.keyOutInterpolationType(i1));
    } catch (e1) { return false; }
    try {
        inE0 = prop.keyInTemporalEase(i0);
        outE1 = prop.keyOutTemporalEase(i1);
        m0 = inE0.length; m1 = outE1.length;
        a0 = []; a1 = [];
        for (k = 0; k < m0; k++) a0.push(new KeyframeEase(so.length === m0 ? so[k] : so[0], inf1));
        for (k = 0; k < m1; k++) a1.push(new KeyframeEase(si.length === m1 ? si[k] : si[0], inf2));
        // out ease of the first key, in ease of the second: the other side of each key stays as it was
        prop.setTemporalEaseAtKey(i0, inE0, a0);
        prop.setTemporalEaseAtKey(i1, a1, outE1);
        return true;
    } catch (e2) {
        try {
            // some properties want one ease for all dimensions
            prop.setTemporalEaseAtKey(i0, [prop.keyInTemporalEase(i0)[0]], [new KeyframeEase(so[0], inf1)]);
            prop.setTemporalEaseAtKey(i1, [new KeyframeEase(si[0], inf2)], [prop.keyOutTemporalEase(i1)[0]]);
            return true;
        } catch (e3) {}
    }
    return false;
}

// the segments (property, first key, next key) the curve goes onto
function ops_collectSegs(c) {
    var props = ops_selProps(c), keyed = [], segs = [], i, j, p, ks, layers, tr;
    for (i = 0; i < props.length; i++) {
        try { if (props[i].numKeys >= 2) keyed.push(props[i]); } catch (e) {}
    }
    if (keyed.length === 0) {
        // no property selected: use every animated Transform property of the selected layers
        layers = c.selectedLayers;
        for (i = 0; i < layers.length; i++) {
            try {
                tr = layers[i].property("ADBE Transform Group");
                for (j = 1; j <= tr.numProperties; j++) {
                    p = tr.property(j);
                    if (p.propertyType === PropertyType.PROPERTY && p.numKeys >= 2) keyed.push(p);
                }
            } catch (e2) {}
        }
    }
    for (i = 0; i < keyed.length; i++) {
        p = keyed[i]; ks = [];
        try { for (j = 0; j < p.selectedKeys.length; j++) ks.push(p.selectedKeys[j]); } catch (e3) {}
        ks.sort(function (x, y) { return x - y; });
        if (ks.length === 0) { for (j = 1; j <= p.numKeys; j++) ks.push(j); }
        if (ks.length === 1) {
            if (ks[0] < p.numKeys) segs.push({ p: p, i0: ks[0], i1: ks[0] + 1 });
            else segs.push({ p: p, i0: ks[0] - 1, i1: ks[0] });
        } else {
            for (j = 0; j < ks.length - 1; j++) {
                if (ks[j + 1] === ks[j] + 1) segs.push({ p: p, i0: ks[j], i1: ks[j + 1] });
            }
        }
    }
    return segs;
}

// o = { b: [x1, y1, x2, y2] }
function ops_curve(o) {
    var c = ops_comp(), b, segs, i, ok = 0, bad = 0;
    if (!c) return ops_fail("Open a composition first.");
    if (!o || !(o.b instanceof Array) || o.b.length < 4) return ops_fail("No curve to apply.");
    b = [ops_num(o.b[0], 0.42), ops_num(o.b[1], 0), ops_num(o.b[2], 0.58), ops_num(o.b[3], 1)];
    segs = ops_collectSegs(c);
    if (!segs.length) return ops_fail("Select two or more keyframes first.");
    app.beginUndoGroup("Hydra: curve");
    try {
        for (i = 0; i < segs.length; i++) {
            if (ops_bezEase(segs[i].p, segs[i].i0, segs[i].i1, b)) ok++; else bad++;
        }
    } catch (e) { app.endUndoGroup(); return ops_fail(e); }
    app.endUndoGroup();
    if (!ok) return ops_fail("Could not set the curve on those keyframes.");
    return ops_ok({ segs: ok, failed: bad });
}

// reads the ease of the first selected pair of keyframes back as a cubic-bezier
function ops_curveRead() {
    var c = ops_comp(), segs, s, p, i0, i1, vt, spatial, v0, v1, dt, n, j, dm, best, d, len, oe, ie, x1, y1, x2, y2, so, si;
    if (!c) return ops_fail("Open a composition first.");
    segs = ops_collectSegs(c);
    if (!segs.length) return ops_fail("Select two keyframes first.");
    s = segs[0]; p = s.p; i0 = s.i0; i1 = s.i1;
    try {
        vt = p.propertyValueType;
        if (vt === PropertyValueType.SHAPE) return ops_fail("Paths have no speed graph to read.");
        spatial = (vt === PropertyValueType.TwoD_SPATIAL || vt === PropertyValueType.ThreeD_SPATIAL);
        dt = p.keyTime(i1) - p.keyTime(i0);
        v0 = p.keyValue(i0); v1 = p.keyValue(i1); n = ops_dims(v0);
        oe = p.keyOutTemporalEase(i0); ie = p.keyInTemporalEase(i1);
        if (spatial) {
            len = 0;
            for (j = 0; j < n; j++) len += (v1[j] - v0[j]) * (v1[j] - v0[j]);
            d = Math.sqrt(len) / dt; j = 0;
        } else if (n === 1) { d = (v1 - v0) / dt; j = 0; }
        else {
            best = 0; j = 0;
            for (n = n - 1; n >= 0; n--) { if (Math.abs(v1[n] - v0[n]) >= best) { best = Math.abs(v1[n] - v0[n]); j = n; } }
            d = (v1[j] - v0[j]) / dt;
        }
        if (Math.abs(d) < 1e-9) return ops_fail("These two keyframes have the same value: there is no curve to read.");
        so = oe[j < oe.length ? j : 0]; si = ie[j < ie.length ? j : 0];
        x1 = so.influence / 100; y1 = x1 * so.speed / d;
        x2 = 1 - si.influence / 100; y2 = 1 - (1 - x2) * si.speed / d;
    } catch (e) { return ops_fail("Could not read the keyframes: " + e); }
    return ops_ok({ b: [Math.round(x1 * 1000) / 1000, Math.round(y1 * 1000) / 1000, Math.round(x2 * 1000) / 1000, Math.round(y2 * 1000) / 1000], prop: String(p.name) });
}

// ---------- Expressions ----------
var OPS_TMN = { position: "ADBE Position", scale: "ADBE Scale", rotation: "ADBE Rotate Z", opacity: "ADBE Opacity", anchor: "ADBE Anchor Point" };

// o = { name, expr, target, ctl: [{ n, v }], bake, needKeys }
function ops_expr(o) {
    var c = ops_comp(), props = [], sp, i, j, p, L, cnt = 0, warn = [], layers, mn, ctl, err;
    if (!c) return ops_fail("Open a composition first.");
    if (!o || !o.expr) return ops_fail("No expression to apply.");
    ctl = o.ctl || [];
    sp = ops_selProps(c);
    for (i = 0; i < sp.length; i++) {
        try { if (sp[i].canSetExpression) props.push(sp[i]); } catch (e0) {}
    }
    if (!props.length) {
        layers = c.selectedLayers;
        if (!layers.length) return ops_fail("Select a layer (or a property) first.");
        mn = OPS_TMN[o.target || "position"] || OPS_TMN.position;
        for (i = 0; i < layers.length; i++) {
            try {
                p = layers[i].property("ADBE Transform Group").property(mn);
                if (p && p.canSetExpression) props.push(p);
                else warn.push(layers[i].name + ": this property can't take an expression (separated dimensions?)");
            } catch (e1) { warn.push(layers[i].name + ": " + e1); }
        }
    }
    if (!props.length) return ops_fail(warn.length ? warn[0] : "Nothing to put the expression on.");
    app.beginUndoGroup("Hydra: " + (o.name || "expression"));
    try {
        for (i = 0; i < props.length; i++) {
            p = props[i]; L = ops_layerOf(p);
            if (L && ctl.length && !o.bake) {
                for (j = 0; j < ctl.length; j++) ops_sliderFx(L, ctl[j].n, ctl[j].v);
            }
            try {
                p.expression = o.expr;
                p.expressionEnabled = true;
                cnt++;
                err = "";
                try { err = p.expressionError; } catch (e3) {}
                if (err) warn.push(p.name + ": " + err);
                if (o.needKeys && p.numKeys < 2) warn.push(p.name + ": this one reacts to keyframes: add two or more");
            } catch (e2) { warn.push(p.name + ": " + e2); }
        }
    } catch (e) { app.endUndoGroup(); return ops_fail(e); }
    app.endUndoGroup();
    if (!cnt) return ops_fail(warn.length ? warn[0] : "Could not apply the expression.");
    return ops_ok({ applied: cnt, warnings: warn });
}

// removes the expression (and keeps the value it gave right now) from the selected properties
function ops_exprClear() {
    var c = ops_comp(), sp, i, n = 0, p;
    if (!c) return ops_fail("Open a composition first.");
    sp = ops_selProps(c);
    app.beginUndoGroup("Hydra: remove expression");
    try {
        for (i = 0; i < sp.length; i++) {
            p = sp[i];
            try { if (p.canSetExpression && p.expression !== "") { p.expression = ""; n++; } } catch (e1) {}
        }
    } catch (e) { app.endUndoGroup(); return ops_fail(e); }
    app.endUndoGroup();
    if (!n) return ops_fail("Select the property that has the expression.");
    return ops_ok({ cleared: n });
}

// ---------- Timer / counter: a text layer whose Source Text is an expression ----------
// o = { name, expr, ctl: [{ n, v }], sample, size, color: [r, g, b], span (seconds), at: "playhead" | "start" }
function ops_counter(o) {
    var c = ops_comp(), L, name, tp, doc, i, sc, t0, t1, ctl;
    if (!c) return ops_fail("Open a composition first.");
    if (!o || !o.expr) return ops_fail("No counter.");
    ctl = o.ctl || [];
    app.beginUndoGroup("Hydra: " + (o.name || "counter"));
    try {
        L = c.layers.addText(o.sample || "0");
        name = ops_uniqueName(c, o.name || "Counter", true);
        L.name = name;
        sc = c.height / 1080;
        tp = L.property("ADBE Text Properties").property("ADBE Text Document");
        doc = tp.value;
        try { doc.fontSize = Math.round((o.size || 160) * sc); } catch (e1) {}
        try { doc.justification = ParagraphJustification.CENTER_JUSTIFY; } catch (e2) {}
        try { if (o.color) { doc.applyFill = true; doc.fillColor = [o.color[0], o.color[1], o.color[2]]; } } catch (e3) {}
        try { if (o.font) doc.font = o.font; } catch (e4) {}
        tp.setValue(doc);
        L.property("ADBE Transform Group").property("ADBE Position").setValue([c.width / 2, c.height / 2]);
        for (i = 0; i < ctl.length; i++) ops_sliderFx(L, ctl[i].n, ctl[i].v);
        tp.expression = o.expr;
        t0 = (o.at === "start") ? 0 : c.time;
        t1 = Math.min(c.duration, t0 + (o.span > 0 ? o.span : 5));
        if (t1 <= t0) { t0 = Math.max(0, c.duration - 3); t1 = c.duration; }
        try { L.inPoint = t0; L.outPoint = t1; } catch (e5) {}
        ops_onlySelect(c, [L]);
    } catch (e) { app.endUndoGroup(); return ops_fail(e); }
    app.endUndoGroup();
    return ops_ok({ name: name });
}

// ---------- Shapes and Morph ----------
function ops_shapeToObj(s) {
    var v = [], a = [], b = [], k;
    for (k = 0; k < s.vertices.length; k++) {
        v.push([s.vertices[k][0], s.vertices[k][1]]);
        a.push([s.inTangents[k][0], s.inTangents[k][1]]);
        b.push([s.outTangents[k][0], s.outTangents[k][1]]);
    }
    return { v: v, i: a, o: b, c: s.closed ? 1 : 0 };
}
function ops_objToShape(o) {
    var s = new Shape();
    s.vertices = o.v; s.inTangents = o.i; s.outTangents = o.o; s.closed = !!o.c;
    return s;
}
function ops_rectObj(w, h, r, cx, cy) {
    var hw = w / 2, hh = h / 2, K = 0.5523, v, a, b, z = [0, 0], q, m, i;
    r = Math.min(r, hw, hh);
    if (r <= 0.01) {
        v = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]; a = [z, z, z, z]; b = [z, z, z, z];
    } else {
        q = K * r;
        v = [[-hw + r, -hh], [hw - r, -hh], [hw, -hh + r], [hw, hh - r], [hw - r, hh], [-hw + r, hh], [-hw, hh - r], [-hw, -hh + r]];
        a = [[-q, 0], z, [0, -q], z, [q, 0], z, [0, q], z];
        b = [z, [q, 0], z, [0, q], z, [-q, 0], z, [0, -q]];
    }
    for (i = 0; i < v.length; i++) v[i] = [v[i][0] + cx, v[i][1] + cy];
    return { v: v, i: a, o: b, c: 1 };
}
function ops_ellipseObj(w, h, cx, cy) {
    var hw = w / 2, hh = h / 2, K = 0.5523;
    return { v: [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]],
        i: [[-K * hw, 0], [0, -K * hh], [K * hw, 0], [0, K * hh]],
        o: [[K * hw, 0], [0, K * hh], [-K * hw, 0], [0, -K * hh]], c: 1 };
}
// p' = pos + R * S * (p - anchor), tangents only get R * S
function ops_xformObj(o, anchor, pos, scl, rot) {
    var a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a), sx = scl[0] / 100, sy = scl[1] / 100, k, x, y;
    var v = [], ti = [], to = [];
    for (k = 0; k < o.v.length; k++) {
        x = (o.v[k][0] - anchor[0]) * sx; y = (o.v[k][1] - anchor[1]) * sy;
        v.push([pos[0] + x * ca - y * sa, pos[1] + x * sa + y * ca]);
        x = o.i[k][0] * sx; y = o.i[k][1] * sy; ti.push([x * ca - y * sa, x * sa + y * ca]);
        x = o.o[k][0] * sx; y = o.o[k][1] * sy; to.push([x * ca - y * sa, x * sa + y * ca]);
    }
    return { v: v, i: ti, o: to, c: o.c };
}

// first path / rectangle / ellipse inside a "Contents" group, looking into groups
function ops_findGeo(grp, depth) {
    var j, ch, mn, r;
    for (j = 1; j <= grp.numProperties; j++) {
        ch = grp.property(j);
        mn = ch.matchName;
        if (mn === "ADBE Vector Shape - Group" || mn === "ADBE Vector Shape - Rect" || mn === "ADBE Vector Shape - Ellipse") return { g: ch, mn: mn, owner: grp, vgroup: null };
        if (mn === "ADBE Vector Group" && depth > 0) {
            r = ops_findGeo(ch.property("ADBE Vectors Group"), depth - 1);
            if (r) { if (!r.vgroup) r.vgroup = ch; return r; }
        }
    }
    return null;
}
function ops_findIn(grp, mn) {
    var j;
    for (j = 1; j <= grp.numProperties; j++) { if (grp.property(j).matchName === mn) return grp.property(j); }
    return null;
}
function ops_vecVal(grp, mn, d) {
    try { return grp.property(mn).value; } catch (e) { return d; }
}

// -> { name, idx, shape, fill, stroke, sw, xf } or a string with the reason
function ops_layerGeo(L) {
    var geo = null, root, so = null, sh, xg, g, fl, st, tr, res, w, h, r, pos, anc, scl, rot, vt;
    try { root = L.property("ADBE Root Vectors Group"); } catch (e0) { root = null; }
    if (root) geo = ops_findGeo(root, 4);
    if (geo) {
        g = geo.g;
        if (geo.mn === "ADBE Vector Shape - Group") so = ops_shapeToObj(g.property("ADBE Vector Shape").value);
        else if (geo.mn === "ADBE Vector Shape - Rect") {
            w = g.property("ADBE Vector Rect Size").value; r = g.property("ADBE Vector Rect Roundness").value; pos = g.property("ADBE Vector Rect Position").value;
            so = ops_rectObj(w[0], w[1], r, pos[0], pos[1]);
        } else {
            w = g.property("ADBE Vector Ellipse Size").value; pos = g.property("ADBE Vector Ellipse Position").value;
            so = ops_ellipseObj(w[0], w[1], pos[0], pos[1]);
        }
        if (geo.vgroup) {
            tr = geo.vgroup.property("ADBE Vector Transform Group");
            anc = ops_vecVal(tr, "ADBE Vector Anchor", [0, 0]); pos = ops_vecVal(tr, "ADBE Vector Position", [0, 0]);
            scl = ops_vecVal(tr, "ADBE Vector Scale", [100, 100]); rot = ops_vecVal(tr, "ADBE Vector Rotation", 0);
            so = ops_xformObj(so, anc, pos, scl, rot);
        }
        fl = ops_findIn(geo.owner, "ADBE Vector Graphic - Fill");
        st = ops_findIn(geo.owner, "ADBE Vector Graphic - Stroke");
    } else {
        try {
            if (L.property("ADBE Mask Parade").numProperties > 0) {
                so = ops_shapeToObj(L.property("ADBE Mask Parade").property(1).property("ADBE Mask Shape").value);
            }
        } catch (e1) { so = null; }
    }
    if (!so) return "“" + L.name + "” has no path, rectangle, ellipse or mask to morph.";
    res = { name: L.name, idx: L.index, shape: so, fill: null, stroke: null, sw: 0, xf: {} };
    try { if (fl) res.fill = fl.property("ADBE Vector Fill Color").value; } catch (e2) {}
    try { if (st) { res.stroke = st.property("ADBE Vector Stroke Color").value; res.sw = st.property("ADBE Vector Stroke Width").value; } } catch (e3) {}
    try {
        tr = L.property("ADBE Transform Group");
        scl = tr.property("ADBE Scale").value;
        res.xf = { a: tr.property("ADBE Anchor Point").value, p: tr.property("ADBE Position").value, s: [scl[0], scl[1]], r: tr.property("ADBE Rotate Z").value, o: tr.property("ADBE Opacity").value };
        res.xf.a = [res.xf.a[0], res.xf.a[1]]; res.xf.p = [res.xf.p[0], res.xf.p[1]];
    } catch (e4) {}
    return res;
}

// the two selected layers: the lower one is where the morph starts
function ops_morphRead() {
    var c = ops_comp(), sel = [], i, a, b, A, B;
    if (!c) return ops_fail("Open a composition first.");
    for (i = 0; i < c.selectedLayers.length; i++) sel.push(c.selectedLayers[i]);
    if (sel.length !== 2) return ops_fail("Select exactly two shape layers (the lower one is the start).");
    sel.sort(function (x, y) { return y.index - x.index; });
    a = ops_layerGeo(sel[0]); if (typeof a === "string") return ops_fail(a);
    b = ops_layerGeo(sel[1]); if (typeof b === "string") return ops_fail(b);
    return ops_ok({ from: a, to: b });
}

// o = { A, B (equal shapes, same number of points), from, to (info of ops_morphRead), dur, at, b, color, hide, name }
function ops_scaleObj(s, k) {
    var v = [], a = [], b = [], i;
    for (i = 0; i < s.v.length; i++) { v.push([s.v[i][0] * k, s.v[i][1] * k]); a.push([s.i[i][0] * k, s.i[i][1] * k]); b.push([s.o[i][0] * k, s.o[i][1] * k]); }
    return { v: v, i: a, o: b, c: s.c };
}
// o.size > 0: A and B are unit shapes (-1..1) from the panel's library; they get this many pixels (at 1080p) and the layer sits at the comp center
function ops_morphApply(o) {
    var c = ops_comp(), L, name, root, grp, cont, pg, path, fl, st, t0, t1, tr, cn, i, fx, tx, props, p, La = null, Lb = null, lay, hs, SA, SB, hasXf;
    if (!c) return ops_fail("Open a composition first.");
    if (!o || !o.A || !o.B) return ops_fail("Nothing to morph.");
    SA = o.A; SB = o.B;
    if (o.size > 0) { hs = o.size * (c.height / 1080) / 2; SA = ops_scaleObj(o.A, hs); SB = ops_scaleObj(o.B, hs); }
    hasXf = !!(o.from && o.to && o.from.xf && o.to.xf && o.from.xf.p && o.to.xf.p);
    t0 = (o.at === "start") ? 0 : c.time;
    t1 = t0 + (o.dur > 0.05 ? o.dur : 1);
    if (t1 > c.duration) { t1 = c.duration; t0 = Math.max(0, t1 - (o.dur > 0.05 ? o.dur : 1)); }
    for (i = 1; i <= c.numLayers; i++) {
        lay = c.layer(i);
        if (o.from && lay.name === o.from.name && !La) La = lay;
        else if (o.to && lay.name === o.to.name && !Lb) Lb = lay;
    }
    app.beginUndoGroup("Hydra: morph");
    try {
        L = c.layers.addShape();
        name = ops_uniqueName(c, o.name || "Morph", true);
        L.name = name;
        root = L.property("ADBE Root Vectors Group");
        grp = root.addProperty("ADBE Vector Group"); grp.name = "Morph";
        cont = grp.property("ADBE Vectors Group");
        pg = cont.addProperty("ADBE Vector Shape - Group");
        path = pg.property("ADBE Vector Shape");
        path.setValueAtTime(t0, ops_objToShape(SA));
        path.setValueAtTime(t1, ops_objToShape(SB));
        if (o.b) ops_bezEase(path, 1, 2, o.b);
        // colors
        cn = o.from && o.from.fill ? o.from.fill : (o.to && o.to.fill ? o.to.fill : null);
        if (cn || (o.to && o.to.fill)) {
            fl = cont.addProperty("ADBE Vector Graphic - Fill");
            p = fl.property("ADBE Vector Fill Color");
            if (o.color !== false && o.from && o.from.fill && o.to && o.to.fill) {
                p.setValueAtTime(t0, o.from.fill); p.setValueAtTime(t1, o.to.fill);
                if (o.b) ops_bezEase(p, 1, 2, o.b);
            } else p.setValue(cn || o.to.fill);
        }
        if ((o.from && o.from.stroke) || (o.to && o.to.stroke)) {
            st = cont.addProperty("ADBE Vector Graphic - Stroke");
            p = st.property("ADBE Vector Stroke Color");
            cn = (o.from && o.from.stroke) ? o.from.stroke : o.to.stroke;
            if (o.from && o.from.stroke && o.to && o.to.stroke && o.color !== false) {
                p.setValueAtTime(t0, o.from.stroke); p.setValueAtTime(t1, o.to.stroke);
                if (o.b) ops_bezEase(p, 1, 2, o.b);
            } else p.setValue(cn);
            p = st.property("ADBE Vector Stroke Width");
            p.setValue((o.from && o.from.sw) ? o.from.sw : (o.to && o.to.sw ? o.to.sw : 4));
            if (o.from && o.to && o.from.sw !== o.to.sw) {
                p.setValueAtTime(t0, o.from.sw || 0); p.setValueAtTime(t1, o.to.sw || 0);
                if (o.b) ops_bezEase(p, 1, 2, o.b);
            }
        }
        // transform: animates from the first layer's to the second layer's
        tr = L.property("ADBE Transform Group");
        if (!hasXf) tr.property("ADBE Position").setValue([c.width / 2, c.height / 2]);
        if (hasXf) {
            props = [["ADBE Anchor Point", "a"], ["ADBE Position", "p"], ["ADBE Scale", "s"], ["ADBE Rotate Z", "r"], ["ADBE Opacity", "o"]];
            for (i = 0; i < props.length; i++) {
                p = tr.property(props[i][0]);
                fx = o.from.xf[props[i][1]]; tx = o.to.xf[props[i][1]];
                if (fx === undefined || tx === undefined) continue;
                if (props[i][1] === "s" && !(fx instanceof Array)) continue;
                if (props[i][1] === "s") { fx = [fx[0], fx[1], 100]; tx = [tx[0], tx[1], 100]; }
                p.setValue(fx);
                if (ops_json(fx) !== ops_json(tx)) {
                    p.setValueAtTime(t0, fx); p.setValueAtTime(t1, tx);
                    if (o.b) ops_bezEase(p, 1, 2, o.b);
                }
            }
        }
        try { L.inPoint = (La ? Math.min(La.inPoint, t0) : t0); L.outPoint = (Lb ? Math.max(Lb.outPoint, t1) : c.duration); } catch (e1) {}
        if (La) { try { L.moveBefore(La); } catch (e2) {} }
        if (o.hide !== false) {
            try { if (La) La.enabled = false; } catch (e3) {}
            try { if (Lb) Lb.enabled = false; } catch (e4) {}
        }
        ops_onlySelect(c, [L]);
    } catch (e) { app.endUndoGroup(); return ops_fail(e + (e.line ? " (line " + e.line + ")" : "")); }
    app.endUndoGroup();
    return ops_ok({ name: name, from: t0, to: t1 });
}

// a new shape layer from a path the panel sends: { name, shape: { v, i, o, c }, size, color: [r, g, b] }
function ops_makeShape(o) {
    var c = ops_comp(), L, root, grp, cont, pg, fl, name, s, k, v = [], a = [], b = [], hs;
    if (!c) return ops_fail("Open a composition first.");
    if (!o || !o.shape) return ops_fail("No shape.");
    hs = (o.size > 0 ? o.size : 400) * (c.height / 1080) / 2;
    s = o.shape;
    for (k = 0; k < s.v.length; k++) {
        v.push([s.v[k][0] * hs, s.v[k][1] * hs]); a.push([s.i[k][0] * hs, s.i[k][1] * hs]); b.push([s.o[k][0] * hs, s.o[k][1] * hs]);
    }
    app.beginUndoGroup("Hydra: shape");
    try {
        L = c.layers.addShape();
        name = ops_uniqueName(c, o.name || "Shape", false);
        L.name = name;
        root = L.property("ADBE Root Vectors Group");
        grp = root.addProperty("ADBE Vector Group"); grp.name = o.name || "Shape";
        cont = grp.property("ADBE Vectors Group");
        pg = cont.addProperty("ADBE Vector Shape - Group");
        pg.property("ADBE Vector Shape").setValue(ops_objToShape({ v: v, i: a, o: b, c: s.c }));
        fl = cont.addProperty("ADBE Vector Graphic - Fill");
        fl.property("ADBE Vector Fill Color").setValue(o.color ? [o.color[0], o.color[1], o.color[2], 1] : [1, 0.85, 0, 1]);
        L.property("ADBE Transform Group").property("ADBE Position").setValue([c.width / 2, c.height / 2]);
        ops_onlySelect(c, [L]);
    } catch (e) { app.endUndoGroup(); return ops_fail(e); }
    app.endUndoGroup();
    return ops_ok({ name: name });
}

// ---------- Liquid Glass studio: the glass2 rig, driven by a "Controls" null with sliders ----------
// o = { name, w, h, rad, glass (%), frost (px), edge (px), light (%), angle (deg), style: 1 Clear | 2 Light | 3 Dark, tint: [r, g, b] }
function ops_glassStudio(o) {
    var c = ops_comp(), sel = [], i, out = {}, warn = [], lens, kk;
    if (!c) return ops_fail("Open a composition first.");
    o = o || {};
    if (o.rel) {
        // the panel sends fractions of the comp (w, h), a 0..1 roundness, and blur / edge widths as if the comp were 4K
        kk = c.height / 2160;
        o.w = ops_clamp(ops_num(o.w, 0.45), 0.02, 1.5) * c.width;
        o.h = ops_clamp(ops_num(o.h, 0.22), 0.02, 1.5) * c.height;
        o.rad = ops_clamp(ops_num(o.rad, 1), 0, 1) * Math.min(o.w, o.h) / 2;
        o.frost = ops_num(o.frost, 15) * kk;
        o.edge = ops_num(o.edge, 8) * kk;
    }
    for (i = 0; i < c.selectedLayers.length; i++) sel.push(c.selectedLayers[i]);
    app.beginUndoGroup("Hydra: Liquid Glass");
    try {
        lens = ops_glass3(c, sel, o || {}, warn, out);
    } catch (e) {
        app.endUndoGroup();
        return ops_fail(String(e) + (OPS_STEP ? " (step: " + OPS_STEP + ")" : "") + (e.line ? " line " + e.line : ""));
    }
    app.endUndoGroup();
    out.warnings = warn;
    return ops_ok(out);
}

function ops_glass3(c, sel, o, warn, out) {
    OPS_STEP = "start";
    var style = o.style || 2, kk = c.height / 2160, ctx = ops_ctx(c), cx = c.width / 2, cy = c.height / 2, tIn, tOut, sp,
        W = ops_clamp(ops_num(o.w, 900), 40, c.width * 1.5), H = ops_clamp(ops_num(o.h, 250), 20, c.height * 1.5), RAD = ops_clamp(ops_num(o.rad, 125), 0, Math.min(W, H) / 2),
        GL = ops_num(o.glass, 100), FR = ops_num(o.frost, 15 * kk), ED = ops_num(o.edge, 8 * kk), LI = ops_num(o.light, 100), AN = ops_num(o.angle, 0),
        tint = (o.tint instanceof Array && o.tint.length >= 3) ? [o.tint[0], o.tint[1], o.tint[2]] : [30 / 255, 16 / 255, 57 / 255],
        base, nLens, nMap, nCtl, ctrl, lens, shadow, edge, rim, soft, sweep, mapL, mapC, ml, fx, dm, made = [], kids = [], j, top = null, lst = [], order;
    tIn = Math.round(c.time / ctx.fd) * ctx.fd;
    if (sel.length > 0) { sp = ops_selectedSpan(sel, c); tOut = sp.tout; } else tOut = c.duration;
    if (tOut <= tIn + ctx.fd * 8) tOut = c.duration;
    if (tOut <= tIn + ctx.fd * 8) tIn = Math.max(0, c.duration - ctx.fd * 30);

    base = ops_uniqueName(c, o.name || "Liquid Glass", true);
    nLens = base; nMap = base + " Map"; nCtl = base + " Controls";
    var Q = "thisComp.layer(" + ops_q(nLens) + ")";
    var RECT = '.content("Rectangle 1").content("Rectangle Path 1")';
    var PRE = "var C = thisComp.layer(" + ops_q(nCtl) + "); ";
    function cs(nm) { return "C.effect(" + ops_q(nm) + ")(1)"; }

    OPS_STEP = "controls";
    ctrl = c.layers.addNull(c.duration);
    ctrl.name = nCtl;
    ctrl.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy]);
    // the null is the master: its anchor sits at the glass center (and at the null's own corner), so a child at [0, 0] lands exactly on it
    try { ctrl.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]); } catch (ean) {}
    try { ctrl.inPoint = tIn; ctrl.outPoint = tOut; } catch (ec) {}
    ops_sliderFx(ctrl, "Width", W);
    ops_sliderFx(ctrl, "Height", H);
    ops_sliderFx(ctrl, "Roundness", RAD);
    ops_sliderFx(ctrl, "Glass", GL);
    ops_sliderFx(ctrl, "Frost", FR);
    ops_sliderFx(ctrl, "Edge", ED);
    ops_sliderFx(ctrl, "Light", LI);
    ops_sliderFx(ctrl, "Angle", AN);

    OPS_STEP = "map";
    mapC = app.project.items.addComp(nMap, c.width, c.height, c.pixelAspect, c.duration, c.frameRate);
    ml = mapC.layers.addShape();
    ml.name = "Map";
    ops_g2Shape(ml, "Rectangle 1", W, H, RAD, 50 * kk, [1, 1, 1], [0.5, 0.5, 0.5]);
    ml.property("ADBE Root Vectors Group").property("Rectangle 1").property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([0, 0]);
    ml.property("ADBE Transform Group").property("ADBE Position").setValue([mapC.width / 2, mapC.height / 2]);
    var QM = 'comp(' + ops_q(c.name) + ').layer(' + ops_q(nLens) + ')' + RECT;
    ops_g2Expr(ops_g2Rect(ml).property("ADBE Vector Rect Size"), QM + ".size", warn, "Map size");
    ops_g2Expr(ops_g2Rect(ml).property("ADBE Vector Rect Roundness"), "s = " + QM + ".size; Math.min(" + QM + ".roundness, Math.min(s[0], s[1]) / 2)", warn, "Map roundness");
    fx = ops_g2Fx(ml, "ADBE Box Blur2", "Fast Box Blur");
    ops_g2Set(fx, "ADBE Box Blur2-0001", 20 * kk, warn);
    mapL = c.layers.add(mapC);
    mapL.name = nMap;
    // the Displacement Map only follows the map layer's move / scale when this pre-comp layer has "Collapse Transformations" on
    try { mapL.collapseTransformation = true; } catch (ecl) { warn.push("Could not switch on Collapse Transformations for \"" + nMap + "\": turn on its sun switch yourself, or the glass will not follow the controller."); }
    try { if (mapL.collapseTransformation !== true) warn.push("Collapse Transformations is off on \"" + nMap + "\": turn on its sun switch, or the glass will not follow the controller."); } catch (ecl2) {}
    try { mapL.enabled = false; } catch (e0) {}
    try { mapL.inPoint = tIn; mapL.outPoint = tOut; } catch (e1) {}
    kids.push(mapL);

    function mkShape(nm) {
        var l = c.layers.addShape();
        l.name = nm;
        try { l.inPoint = tIn; l.outPoint = tOut; } catch (e) {}
        return l;
    }
    function groupPos(l, y) { l.property("ADBE Root Vectors Group").property("Rectangle 1").property("ADBE Vector Transform Group").property("ADBE Vector Position").setValue([0, y || 0]); }
    // size / roundness follow the lens; swx = the stroke width as an expression (the stroke sits inside the edge)
    function link(lay, swx, grp) {
        var rc = ops_g2Rect(lay, grp), inset = swx ? " - (" + swx + ")" : "";
        ops_g2Expr(rc.property("ADBE Vector Rect Size"), PRE + "s = " + Q + RECT + ".size; [s[0]" + inset + ", s[1]" + inset + "]", warn, "Size");
        ops_g2Expr(rc.property("ADBE Vector Rect Roundness"), PRE + "s = " + Q + RECT + ".size; Math.max(0, Math.min(" + Q + RECT + ".roundness, Math.min(s[0], s[1]) / 2)" + (swx ? " - (" + swx + ") / 2" : "") + ")", warn, "Roundness");
    }
    function strokeW(lay, swx, grp) {
        try {
            lay.property("ADBE Root Vectors Group").property(grp || "Rectangle 1").property("ADBE Vectors Group").property("ADBE Vector Graphic - Stroke").property("ADBE Vector Stroke Width").expression = PRE + swx;
        } catch (e) { warn.push("Edge width: " + e); }
    }
    function opacityX(l, v) {
        try { l.property("ADBE Transform Group").property("ADBE Opacity").expression = PRE + "(" + cs("Light") + " / 100) * " + v; } catch (e) { warn.push("Light: " + e); }
    }

    OPS_STEP = "shadow";
    if (style === 2 || style === 3) {
        shadow = mkShape(base + " Shadow");
        var scol = style === 3 ? [0, 0, 0] : tint;
        ops_g2Shape(shadow, "Rectangle 1", W, H, RAD, 160 * kk, scol, scol);
        groupPos(shadow, 230 * kk);
        link(shadow, "");
        fx = ops_g2Fx(shadow, "ADBE Box Blur2", "Fast Box Blur"); ops_g2Set(fx, "ADBE Box Blur2-0001", 130 * kk, warn);
        shadow.property("ADBE Transform Group").property("ADBE Scale").setValue([95, 95, 95]);
        shadow.property("ADBE Transform Group").property("ADBE Opacity").setValue(40);
        kids.push(shadow);
        made.push(shadow);
    }

    OPS_STEP = "lens";
    lens = c.layers.addShape();
    lens.name = nLens;
    try { lens.inPoint = tIn; lens.outPoint = tOut; } catch (e2) {}
    ops_g2Shape(lens, "Rectangle 1", W, H, RAD, 5 * kk, [1, 1, 1], [1, 1, 1]);
    lens.adjustmentLayer = true;
    lens.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy]);
    var lrc = ops_g2Rect(lens);
    // Width / Height are the size at 100%; scaling the null scales the SIZE (the rectangle path), never the drawing,
    // so strokes, blur and roundness are not stretched. The lens itself is counter-scaled so it never inherits the null's scale.
    var SZ = "var p = C.transform.scale; var w = " + cs("Width") + " * p[0] / 100; var h = " + cs("Height") + " * p[1] / 100; ";
    ops_g2Expr(lrc.property("ADBE Vector Rect Size"), PRE + SZ + "[w, h]", warn, "Width / Height");
    ops_g2Expr(lrc.property("ADBE Vector Rect Roundness"), PRE + SZ + "Math.max(0, Math.min(" + cs("Roundness") + ", Math.min(w, h) / 2))", warn, "Roundness");
    try {
        lens.property("ADBE Transform Group").property("ADBE Scale").expression = PRE + "var p = C.transform.scale; [10000 / Math.max(Math.abs(p[0]), 0.01), 10000 / Math.max(Math.abs(p[1]), 0.01)]";
    } catch (esc) { warn.push("Scale of the controller: " + esc); }
    fx = ops_g2Fx(lens, "ADBE Box Blur2", "Fast Box Blur");
    ops_g2Set(fx, "ADBE Box Blur2-0001", FR, warn);
    try { fx.property("ADBE Box Blur2-0001").expression = PRE + cs("Frost"); } catch (ef) { warn.push("Frost: " + ef); }
    fx = ops_g2Fx(lens, "ADBE Geometry2", "Transform");
    ops_g2Set(fx, "ADBE Geometry2-0003", 110, warn);
    ops_g2Set(fx, "ADBE Geometry2-0001", [0, 0], warn);
    ops_g2Set(fx, "ADBE Geometry2-0002", [0, 0], warn);
    OPS_STEP = "lens displacement";
    dm = ops_g2Fx(lens, "ADBE Displacement Map", "Displacement Map");
    ops_g2Set(dm, "ADBE Displacement Map-0001", mapL.index, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0002", 5, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0003", 335 * kk * GL / 100, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0004", 5, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0005", 210 * kk * GL / 100, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0006", 1, warn);
    ops_g2Set(dm, "ADBE Displacement Map-0007", 1, warn);
    try { dm.property("ADBE Displacement Map-0003").expression = PRE + (335 * kk) + " * " + cs("Glass") + " / 100"; } catch (eg1) { warn.push("Glass: " + eg1); }
    try { dm.property("ADBE Displacement Map-0005").expression = PRE + (210 * kk) + " * " + cs("Glass") + " / 100"; } catch (eg2) { warn.push("Glass: " + eg2); }
    made.push(lens);

    OPS_STEP = "glows";
    function glow(nm, edgeK, blur, op, col) {
        var l = mkShape(nm), swx = cs("Edge") + " * " + edgeK;
        ops_g2Shape(l, "Rectangle 1", W, H, RAD, ED * edgeK, col, null);
        groupPos(l, 0);
        link(l, swx);
        strokeW(l, swx);
        fx = ops_g2Fx(l, "ADBE Box Blur2", "Fast Box Blur"); ops_g2Set(fx, "ADBE Box Blur2-0001", blur * kk, warn);
        opacityX(l, op);
        kids.push(l);
        made.push(l);
        return l;
    }
    if (style === 1) soft = glow(base + " Soft Glow", 3.75, 30, 40, [1, 1, 1]);
    if (style === 1 || style === 3) rim = glow(base + " Rim", 2.375, 4, 20, [1, 1, 1]);
    if (style === 2 || style === 3) edge = glow(base + " Edge", 1, 5, 80, style === 3 ? [1, 1, 1] : tint);

    OPS_STEP = "shine";
    sweep = mkShape(base + " Shine");
    var arcs = [["Shine 1", 62, 97], ["Shine 2", 4, 36]], sg, gcont, grc, gst, gtr, aw = 5 * kk;
    for (j = 0; j < arcs.length; j++) {
        sg = sweep.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
        sg.name = arcs[j][0];
        gcont = sg.property("ADBE Vectors Group");
        grc = gcont.addProperty("ADBE Vector Shape - Rect");
        grc.name = "Rectangle Path 1";
        grc.property("ADBE Vector Rect Size").setValue([W - aw, H - aw]);
        grc.property("ADBE Vector Rect Roundness").setValue(Math.max(0, RAD - aw / 2));
        gst = gcont.addProperty("ADBE Vector Graphic - Stroke");
        gst.property("ADBE Vector Stroke Color").setValue([1, 1, 1]);
        gst.property("ADBE Vector Stroke Width").setValue(aw);
        try { gst.property("ADBE Vector Stroke Line Cap").setValue(2); } catch (ecp) {}
        gtr = gcont.addProperty("ADBE Vector Filter - Trim");
        gtr.property("ADBE Vector Trim Start").setValue(arcs[j][1]);
        gtr.property("ADBE Vector Trim End").setValue(arcs[j][2]);
        try { gtr.property("ADBE Vector Trim Offset").expression = PRE + cs("Angle"); } catch (eo) { warn.push("Angle: " + eo); }
        link(sweep, String(aw), arcs[j][0]);
    }
    fx = ops_g2Fx(sweep, "ADBE Box Blur2", "Fast Box Blur"); ops_g2Set(fx, "ADBE Box Blur2-0001", 2.5 * kk, warn);
    opacityX(sweep, 100);
    kids.push(sweep);
    made.push(sweep);

    OPS_STEP = "parenting";
    for (j = 0; j < kids.length; j++) {
        try {
            kids[j].parent = lens;
            kids[j].property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
            if (kids[j] === shadow) kids[j].property("ADBE Transform Group").property("ADBE Scale").setValue([95, 95, 95]);
        } catch (ep) { warn.push("Parent: " + ep); }
    }
    try {
        lens.parent = ctrl;
        lens.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
    } catch (ep2) { warn.push("Parent: " + ep2); }

    OPS_STEP = "ordering";
    order = [ctrl, sweep, edge, rim, soft, lens, shadow, mapL];
    for (j = 0; j < order.length; j++) if (order[j]) lst.push(order[j]);
    for (j = 0; j < sel.length; j++) if (top === null || sel[j].index < top.index) top = sel[j];
    try {
        if (top) { for (j = 0; j < lst.length; j++) lst[j].moveBefore(top); }
        else { for (j = lst.length - 1; j >= 0; j--) lst[j].moveToBeginning(); }
    } catch (e4) {}
    try { ops_g2Set(lens.property("ADBE Effect Parade").property("Displacement Map"), "ADBE Displacement Map-0001", mapL.index, warn); } catch (e5) {}
    ops_onlySelect(c, [ctrl]);
    out.name = base;
    out.controls = nCtl;
    out.layers = lst.length;
    return lens;
}

// ---------- Pixel Scan: a pixelated wipe whose leading edge is a glowing, pixelated scan band ----------
// Builds (1) a "Pixel Wipe" pre-comp: a big white rectangle with Turbulent Displace + Mosaic that sweeps across,
// (2) a "Pixel Scan" pre-comp: that wipe minus a slightly delayed copy of itself = the band at its leading edge,
// then in the comp: the wipe as a track matte on the layer, a color/glow layer and a distort layer clipped to the band.
function ops_matte(layer, matte, type) {
    if (typeof layer.setTrackMatte === "function") { layer.setTrackMatte(matte, type); return "api"; }
    matte.moveBefore(layer);
    layer.trackMatteType = type;
    return "legacy";
}

// small shared helpers of the Pixel Scan
function ops_pixPlace(layer, t0, t1) {
    try { layer.startTime = t0; } catch (e) {}
    try { layer.inPoint = t0; layer.outPoint = t1; } catch (e1) {}
}
function ops_pixAbove(layer, other) { if (other) { try { layer.moveBefore(other); } catch (e) {} } }

// geometry / timing numbers shared by the whole-comp scan and the per-layer scan
function ops_pixGeom(c, p, k, ctx) {
    var base = Math.min(c.width, c.height) / 1080, bs = Math.max(4, ops_num(p.block, 24) * base), jit = ops_num(p.jit, 160) * Math.min(1.6, 0.6 + 0.4 * k), g = {};
    g.mode = p.mode || "out"; g.dir = p.dir || "right"; g.base = base; g.ease = p.ease;
    g.dur = ops_clamp(ops_num(p.dur, 1.2), 0.2, 20); g.lag = ops_clamp(ops_num(p.lag, 0.07), 0.01, 1);
    g.bs = bs; g.jit = jit;
    g.hb = ops_clamp(Math.round(c.width / bs), 2, 2000); g.vb = ops_clamp(Math.round(c.height / bs), 2, 2000);
    g.W = c.width; g.H = c.height; g.m = jit * ctx.sc * 1.15 + bs * 3;
    g.scanDur = g.dur + g.lag + 0.2;
    return g;
}

// the project folder that keeps the helper comps tidy
function ops_pixFolder() { return ops_projFolder("Hydra Pixel Scan"); }

// when does the scan start: at the playhead if that sits on the layer, else at the layer's edge
function ops_pixStart(c, A, g, p, ph) {
    var tStart, onLayer;
    if (g.mode === "scan") tStart = ph;
    else {
        onLayer = ph > A.inPoint + 0.05 && ph < A.outPoint - 0.05;
        if (p.at === "playhead" || (p.at !== "edge" && onLayer)) tStart = ph;
        else tStart = (g.mode === "in") ? A.inPoint : A.outPoint - g.dur;
    }
    if (tStart + g.dur > c.duration) tStart = c.duration - g.dur;
    if (tStart < 0) tStart = 0;
    return tStart;
}

// one wipe: a big white rectangle, ragged and pixelated, sweeping across; it starts `off` seconds into its comp
function ops_pixWipe(c, g, nm, off, wdur, warn, ctx, folder) {
    var cc = app.project.items.addComp(ops_uniqueName(c, nm, true), g.W, g.H, c.pixelAspect, wdur, c.frameRate), wl = cc.layers.addShape(), p0, p1, pos, f, pr, W = g.W, H = g.H, m = g.m, dir = g.dir;
    if (folder) { try { cc.parentFolder = folder; } catch (ef) {} }
    wl.name = "Wipe";
    ops_g2Shape(wl, "Rectangle 1", W + 4 * m, H + 4 * m, 0, 0, null, [1, 1, 1]);
    // the leading edge travels from m outside the frame to m outside the opposite side
    if (dir === "right") { p0 = [-m - (W + 4 * m) / 2, H / 2]; p1 = [W / 2 - m, H / 2]; }
    else if (dir === "left") { p0 = [W + m + (W + 4 * m) / 2, H / 2]; p1 = [W / 2 + m, H / 2]; }
    else if (dir === "down") { p0 = [W / 2, -m - (H + 4 * m) / 2]; p1 = [W / 2, H / 2 - m]; }
    else { p0 = [W / 2, H + m + (H + 4 * m) / 2]; p1 = [W / 2, H / 2 + m]; }
    pos = wl.property("ADBE Transform Group").property("ADBE Position");
    pos.setValue(p0);
    pos.setValueAtTime(off, p0);
    pos.setValueAtTime(off + g.dur, p1);
    if (g.ease === "lin") {
        try { pos.setInterpolationTypeAtKey(1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); pos.setInterpolationTypeAtKey(2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (e0) {}
    } else {
        ops_bezEase(pos, 1, 2, g.ease === "out" ? [0.2, 0.7, 0.2, 1] : [0.55, 0, 0.3, 1]);
    }
    f = ops_applyEntry(wl, { t: "td", n: "Pixel Noise", s: { type: 1, amt: g.jit, size: 30, cx: 2 } }, ctx, 1, warn);
    if (f) { pr = ops_param(f, "td", "evo"); if (pr) ops_setExpr(pr.p, "(time - " + off + ") * 120", warn, "Pixel Noise / evolution"); }
    ops_applyEntry(wl, { t: "mos", n: "Pixelate", s: { hb: g.hb, vb: g.vb } }, ctx, 1, warn);
    return cc;
}

// the band: the wipe minus a delayed, slightly bigger copy of itself
function ops_pixBand(c, g, wc, warn, folder) {
    var sc = app.project.items.addComp(ops_uniqueName(c, "Pixel Scan", true), g.W, g.H, c.pixelAspect, g.scanDur + 0.3, c.frameRate), w1, w2, fx;
    if (folder) { try { sc.parentFolder = folder; } catch (ef) {} }
    w1 = sc.layers.add(wc); w1.name = "Front";
    w2 = sc.layers.add(wc); w2.name = "Back";
    try { w2.startTime = g.lag; w2.outPoint = sc.duration; w1.outPoint = sc.duration; } catch (e1) { warn.push("Scan timing: " + e1); }
    try {
        fx = w2.property("ADBE Effect Parade").addProperty("ADBE Minimax");
        fx.property("ADBE Minimax-0002").setValue(Math.max(1, Math.round(2 * g.base)));
    } catch (e2) { warn.push("Minimax is not available: the band edge may look thinner."); }
    try { ops_matte(w1, w2, TrackMatteType.ALPHA_INVERTED); } catch (e3) { warn.push("Track matte: " + e3); }
    return sc;
}

// a marker (with a length, where this After Effects supports it) on a layer or on the comp
function ops_addMarker(prop, t, text, dur, warn) {
    var mv;
    try {
        mv = new MarkerValue(text);
        if (dur > 0) { try { mv.duration = dur; } catch (e1) {} }
        prop.setValueAtTime(t, mv);
        return true;
    } catch (e) { warn.push("Marker: " + e); return false; }
}

// ---------- Pixel Scan: a pixelated wipe whose leading edge is a glowing, pixelated scan band ----------
// Whole-comp version: (1) a "Pixel Wipe" pre-comp, (2) a "Pixel Scan" pre-comp (the band), then in the comp: the wipe as a track
// matte on the top selected layer, a color/glow layer and a distort layer clipped to the band (these two act on everything below).
function ops_pixelScan(c, sel, r, warn, out) {
    OPS_STEP = "start";
    var p = r.p || {}, k = r.intensity || 1, ctx = ops_ctx(c), g = ops_pixGeom(c, p, k, ctx), mode = g.mode, dir = g.dir, dur = g.dur, lag = g.lag, hb = g.hb, vb = g.vb,
        A = null, i, tStart, tEnd, tm0, scanDur = g.scanDur, wc, wcm = null, sc, w1, w2, fx, ca, cb, s1, s2, m1, m2, mw = null, top = null,
        total = 0, ph = c.time, pal = p.pal || {}, ga, gb, bandEnd, folder = ops_pixFolder();
    if (mode !== "scan") {
        for (i = 0; i < sel.length; i++) { if (!sel[i].locked && (A === null || sel[i].index < A.index)) A = sel[i]; }
        if (!A) throw "Select the layer that should wipe " + (mode === "in" ? "in" : "away") + " (or use a Scan Line).";
        if (sel.length > 1) warn.push("Only the top selected layer (" + A.name + ") gets the wipe.");
    } else {
        for (i = 0; i < sel.length; i++) { if (top === null || sel[i].index < top.index) top = sel[i]; }
    }

    tStart = ops_pixStart(c, A, g, p, ph);
    bandEnd = Math.min(c.duration, tStart + scanDur);
    tm0 = A ? Math.min(A.inPoint, tStart) : tStart;
    tEnd = A ? Math.max(A.outPoint, tStart + dur + lag + 0.1) : bandEnd;
    if (tEnd > c.duration) tEnd = c.duration;

    OPS_STEP = "wipe comp";
    wc = ops_pixWipe(c, g, "Pixel Wipe", 0, scanDur + 0.3, warn, ctx, folder);
    if (A) wcm = ops_pixWipe(c, g, "Pixel Wipe", tStart - tm0, Math.max(tEnd - tm0 + 0.1, tStart - tm0 + scanDur + 0.3), warn, ctx, folder);
    OPS_STEP = "scan comp";
    sc = ops_pixBand(c, g, wc, warn, folder);

    OPS_STEP = "comp layers";
    // the wipe as a matte on the layer
    if (A) {
        mw = c.layers.add(wcm); mw.name = "Pixel Wipe";
        ops_pixPlace(mw, tm0, tEnd);
        ops_pixAbove(mw, A);
        try { ops_matte(A, mw, mode === "in" ? TrackMatteType.ALPHA : TrackMatteType.ALPHA_INVERTED); } catch (e4) { warn.push("Track matte: " + e4); }
        total++;
    }
    // distort: an adjustment layer clipped to the band
    OPS_STEP = "scan distort";
    s2 = c.layers.addSolid([1, 1, 1], "Pixel Scan Distort", g.W, g.H, c.pixelAspect, c.duration);
    s2.adjustmentLayer = true;
    ops_pixPlace(s2, tStart, bandEnd);
    ops_applyEntry(s2, { t: "mos", n: "Band Pixels", s: { hb: Math.max(2, Math.round(hb * 0.7)), vb: Math.max(2, Math.round(vb * 0.7)) } }, ctx, 1, warn);
    ops_applyEntry(s2, { t: "expo", n: "Band Light", s: { ev: 0.35 * k } }, ctx, 1, warn);
    ops_pixAbove(s2, mw || A || top);
    m2 = c.layers.add(sc); m2.name = "Pixel Scan Matte";
    ops_pixPlace(m2, tStart, bandEnd);
    ops_pixAbove(m2, s2);
    try { ops_matte(s2, m2, TrackMatteType.ALPHA); } catch (e5) { warn.push("Track matte: " + e5); }
    total += 2;

    // color + glow: a gradient clipped to the band
    OPS_STEP = "scan color";
    ca = pal.a || [0, 0.9, 1]; cb = pal.b || [1, 0.17, 0.84];
    s1 = c.layers.addSolid([1, 1, 1], "Pixel Scan Glow", g.W, g.H, c.pixelAspect, c.duration);
    ops_pixPlace(s1, tStart, bandEnd);
    try { s1.blendingMode = BlendingMode.ADD; } catch (e6) {}
    if (dir === "right") { ga = [0, 0.5]; gb = [1, 0.5]; } else if (dir === "left") { ga = [1, 0.5]; gb = [0, 0.5]; }
    else if (dir === "down") { ga = [0.5, 0]; gb = [0.5, 1]; } else { ga = [0.5, 1]; gb = [0.5, 0]; }
    ops_applyEntry(s1, { t: "ramp", n: "Scan Color", s: { a: ga, ac: [ca[0], ca[1], ca[2], 1], b: gb, bc: [cb[0], cb[1], cb[2], 1], shape: 1 } }, ctx, 1, warn);
    ops_applyEntry(s1, { t: "glow", n: "Scan Glow", s: { thr: 20, rad: 70, "int": ops_clamp(0.9 * k * ops_num(p.glow, 1), 0, 6) } }, ctx, 1, warn);
    ops_pixAbove(s1, m2);
    m1 = c.layers.add(sc); m1.name = "Pixel Scan Matte";
    ops_pixPlace(m1, tStart, bandEnd);
    ops_pixAbove(m1, s1);
    try { ops_matte(s1, m1, TrackMatteType.ALPHA); } catch (e7) { warn.push("Track matte: " + e7); }
    total += 2;

    if (p.markers === true) {
        try { ops_addMarker(c.markerProperty, tStart, "Pixel Scan start", dur, warn); ops_addMarker(c.markerProperty, tStart + dur, "Pixel Scan end", 0, warn); } catch (em) { warn.push("Marker: " + em); }
    }
    OPS_STEP = "done";
    ops_onlySelect(c, [s1]);
    out.name = "Pixel Scan";
    out.layers = total + 1;
    out.from = tStart; out.to = tStart + dur;
    return s1;
}

// layers the per-layer scan can not work on, with the reason
function ops_pixSkip(L) {
    try { if (L.locked) return "is locked"; } catch (e) {}
    try { if (L.adjustmentLayer) return "is an adjustment layer (it has no pixels of its own)"; } catch (e1) {}
    try { if (L.matchName === "ADBE Camera Layer" || L.matchName === "ADBE Light Layer") return "is a camera or a light"; } catch (e2) {}
    try { if (L.isTrackMatte) return "is used as a track matte"; } catch (e3) {}
    try { if (L.hasTrackMatte) return "already has a track matte (pre-compose it with its matte first)"; } catch (e4) {}
    return "";
}

// Per-layer version: only the selected layers are touched. Each one gets the wipe as its own track matte, and a copy of that same layer
// (pixelated, tinted and glowing) that shows only inside the scan band. No adjustment layer, so nothing else in the comp changes.
function ops_pixelLayers(c, sel, r, warn, out) {
    OPS_STEP = "start";
    var p = r.p || {}, k = r.intensity || 1, ctx = ops_ctx(c), g = ops_pixGeom(c, p, k, ctx), mode = g.mode, dur = g.dur, lag = g.lag, scanDur = g.scanDur, tg = [], i, T, why,
        wc, sc, folder = ops_pixFolder(), pal = p.pal || {}, ca = pal.a || [0, 0.9, 1], cb = pal.b || [1, 0.17, 0.84], ph = c.time, tStart, tEnd, tm0, bandEnd, wcm, mw, D, mb,
        total = 0, firstT = 1e9, lastT = 0, gk = ops_clamp(ops_num(p.glow, 1), 0, 6);
    for (i = 0; i < sel.length; i++) {
        why = ops_pixSkip(sel[i]);
        if (why) { warn.push(sel[i].name + " " + why + ": skipped."); continue; }
        tg.push(sel[i]);
    }
    if (tg.length === 0) throw "Select the layer (or layers) the pixel scan should run on." + (warn.length ? " " + warn.join(" ") : "");

    OPS_STEP = "band comps";
    wc = ops_pixWipe(c, g, "Pixel Wipe", 0, scanDur + 0.3, warn, ctx, folder);
    sc = ops_pixBand(c, g, wc, warn, folder);

    for (i = 0; i < tg.length; i++) {
        T = tg[i];
        OPS_STEP = "layer " + T.name;
        tStart = ops_pixStart(c, T, g, p, ph);
        bandEnd = Math.min(c.duration, tStart + scanDur);
        tm0 = Math.min(T.inPoint, tStart);
        tEnd = Math.min(c.duration, Math.max(T.outPoint, tStart + dur + lag + 0.1));
        if (tStart < firstT) firstT = tStart;
        if (tStart + dur > lastT) lastT = tStart + dur;

        // 1. the band copy of the layer, made before anything else touches the layer
        D = T.duplicate();
        D.name = T.name + " Pixel Band";
        try { D.selected = false; } catch (es) {}
        try { D.inPoint = tStart; D.outPoint = bandEnd; } catch (et) {}
        ops_applyEntry(D, { t: "mos", n: "Band Pixels", s: { hb: Math.max(2, Math.round(g.hb * 0.7)), vb: Math.max(2, Math.round(g.vb * 0.7)) } }, ctx, 1, warn);
        ops_applyEntry(D, { t: "pf", n: "Band Color", s: { black: [ca[0] * 0.3, ca[1] * 0.3, ca[2] * 0.3], col: [cb[0], cb[1], cb[2]], den: 85 } }, ctx, 1, warn);
        ops_applyEntry(D, { t: "expo", n: "Band Light", s: { ev: 0.35 * k } }, ctx, 1, warn);
        ops_applyEntry(D, { t: "glow", n: "Band Glow", s: { thr: 25, rad: 55, "int": ops_clamp(1.2 * k * gk, 0, 8), cols: 2, ca: [ca[0], ca[1], ca[2], 1], cb: [cb[0], cb[1], cb[2], 1] } }, ctx, 1, warn);
        total++;

        // 2. the wipe as the layer's own matte (the matte sits directly above the layer, under its band copy)
        mw = null;
        if (mode !== "scan") {
            wcm = ops_pixWipe(c, g, "Pixel Wipe", tStart - tm0, Math.max(tEnd - tm0 + 0.1, tStart - tm0 + scanDur + 0.3), warn, ctx, folder);
            mw = c.layers.add(wcm); mw.name = T.name + " Pixel Wipe";
            ops_pixPlace(mw, tm0, tEnd);
            ops_pixAbove(mw, T);
            try { ops_matte(T, mw, mode === "in" ? TrackMatteType.ALPHA : TrackMatteType.ALPHA_INVERTED); } catch (e4) { warn.push("Track matte: " + e4); }
            total++;
        }

        // 3. the band copy is cut to the scan band
        mb = c.layers.add(sc); mb.name = T.name + " Pixel Band Matte";
        ops_pixPlace(mb, tStart, bandEnd);
        ops_pixAbove(mb, D);
        try { ops_matte(D, mb, TrackMatteType.ALPHA); } catch (e5) { warn.push("Track matte: " + e5); }
        total++;

        // 4. markers: where the scan starts and where it ends
        if (p.markers === true) {
            ops_addMarker(T.property("ADBE Marker"), tStart, "Pixel Scan start", dur, warn);
            ops_addMarker(T.property("ADBE Marker"), tStart + dur, "Pixel Scan end", 0, warn);
        }
    }
    OPS_STEP = "done";
    ops_onlySelect(c, tg);
    out.name = "Pixel Scan";
    out.layers = total;
    out.targets = tg.length;
    out.from = firstT; out.to = lastT;
    return tg[0];
}

// the Pixel tab: target "layers" = only the selected layers, "comp" = the band over everything
function ops_pixelStudio(o) {
    var c = ops_comp(), sel = [], i, out = {}, warn = [], r;
    if (!c) return ops_fail("Open a composition first.");
    o = o || {};
    for (i = 0; i < c.selectedLayers.length; i++) sel.push(c.selectedLayers[i]);
    r = { p: o.p || {}, intensity: 1, name: "Pixel Scan" };
    app.beginUndoGroup("Hydra: Pixel Scan");
    try {
        if (o.target === "comp") ops_pixelScan(c, sel, r, warn, out);
        else ops_pixelLayers(c, sel, r, warn, out);
    } catch (e) {
        app.endUndoGroup();
        return ops_fail(typeof e === "string" ? e : String(e) + (OPS_STEP ? " (step: " + OPS_STEP + ")" : "") + (e && e.line ? " line " + e.line : ""));
    }
    app.endUndoGroup();
    out.warnings = warn;
    return ops_ok(out);
}

// =====================================================================================================
// Photo Morph: two photos + matching points. The panel computes two warp maps (PNG files); this builds the rig:
// a pre-comp holding both photos, each pushed around by a Displacement Map, cross-faded by one "Morph Progress" slider.
// =====================================================================================================
// a project folder that keeps the helper comps / footage tidy
function ops_projFolder(name) {
    var i, it, f = null;
    try {
        for (i = 1; i <= app.project.numItems; i++) {
            it = app.project.item(i);
            if (it instanceof FolderItem && it.name === name) return it;
        }
        f = app.project.items.addFolder(name);
    } catch (e) { f = null; }
    return f;
}

// one photo layer: its file, size and where it sits in the comp
function ops_photoInfo(L) {
    var s, ms, tr, p, sc, an, rot;
    if (!(L instanceof AVLayer) || !L.source) return "\"" + L.name + "\" is not a picture layer. Select two photo layers (PNG or JPG files).";
    s = L.source;
    if (!(s instanceof FootageItem)) return "\"" + L.name + "\" is a pre-comp or a solid. Select two photo layers (PNG or JPG files).";
    ms = s.mainSource;
    if (!(ms instanceof FileSource) || !ms.file) return "\"" + L.name + "\" is not an image file (solids and placeholders are not supported).";
    try { if (ms.isStill === false) return "\"" + L.name + "\" is a video or an image sequence. Photo Morph needs still images (PNG or JPG)."; } catch (e0) {}
    try { if (!ms.file.exists) return "\"" + L.name + "\" is missing on disk: " + ms.file.fsName; } catch (e1) {}
    tr = L.property("ADBE Transform Group");
    p = tr.property("ADBE Position").value;
    sc = tr.property("ADBE Scale").value;
    an = tr.property("ADBE Anchor Point").value;
    rot = tr.property("ADBE Rotate Z").value;
    return { index: L.index, name: L.name, w: s.width, h: s.height, file: String(ms.file.fsName), xf: { p: [p[0], p[1]], s: [sc[0], sc[1]], r: rot, a: [an[0], an[1]] } };
}

// the two selected photo layers (the lower one is where the morph starts) + where the panel may write its map files
function ops_morphSources() {
    var c = ops_comp(), sel = [], i, out = [], info, pd = "";
    if (!c) return ops_fail("Open a composition first.");
    for (i = 0; i < c.selectedLayers.length; i++) sel.push(c.selectedLayers[i]);
    if (sel.length !== 2) return ops_fail("Select exactly two photo layers: the lower one is the start picture, the upper one the end picture.");
    sel.sort(function (x, y) { return y.index - x.index; });
    for (i = 0; i < 2; i++) {
        info = ops_photoInfo(sel[i]);
        if (typeof info === "string") return ops_fail(info);
        out.push(info);
    }
    try { if (app.project.file) pd = String(app.project.file.parent.fsName); } catch (e) { pd = ""; }
    return ops_ok({ comp: { name: c.name, w: c.width, h: c.height, fps: c.frameRate, dur: c.duration }, projDir: pd, layers: out });
}

function ops_findLayerBy(c, idx, nm) {
    var i;
    try { if (idx >= 1 && idx <= c.numLayers && c.layer(idx).name === nm) return c.layer(idx); } catch (e) {}
    for (i = 1; i <= c.numLayers; i++) { if (c.layer(i).name === nm) return c.layer(i); }
    return null;
}

// a name nobody uses yet: not a layer of this comp, not a project item (the rig's comps / footage are named after it)
function ops_morphBase(c, want) {
    var k, nm, taken, i, j, it, ends = ["", " A", " B", " Map"], np = app.project.numItems;
    for (k = 1; k < 999; k++) {
        nm = (k === 1) ? want : (want + " " + k);
        taken = false;
        for (i = 1; i <= c.numLayers && !taken; i++) { if (c.layer(i).name === nm) taken = true; }
        for (i = 1; i <= np && !taken; i++) {
            it = app.project.item(i);
            for (j = 0; j < ends.length; j++) { if (it.name === nm + ends[j]) { taken = true; break; } }
        }
        if (!taken) return nm;
    }
    return want;
}

// where a photo sits in its own comp: anchor, position, scale, rotation
function ops_morphXf(L, xf, cw, ch, w, h) {
    var tr = L.property("ADBE Transform Group");
    if (!xf || !xf.p || !xf.s || !xf.a) xf = { p: [cw / 2, ch / 2], s: [100, 100], r: 0, a: [w / 2, h / 2] };
    tr.property("ADBE Anchor Point").setValue([ops_num(xf.a[0], w / 2), ops_num(xf.a[1], h / 2)]);
    tr.property("ADBE Position").setValue([ops_num(xf.p[0], cw / 2), ops_num(xf.p[1], ch / 2)]);
    tr.property("ADBE Scale").setValue([ops_num(xf.s[0], 100), ops_num(xf.s[1], 100), 100]);
    tr.property("ADBE Rotate Z").setValue(ops_num(xf.r, 0));
}

function ops_morphMap(path, nm, folder) {
    var f = new File(String(path).split("\\").join("/")), it = null;
    if (!f.exists) throw "The warp map file is missing: " + path;
    it = app.project.importFile(new ImportOptions(f));
    try { it.name = nm; } catch (e) {}
    if (folder) { try { it.parentFolder = folder; } catch (e2) {} }
    return it;
}

function ops_boxFx(layer, name, on) {
    var fx = layer.property("ADBE Effect Parade").addProperty("ADBE Checkbox Control"), cb = null;
    fx.name = name;
    try { cb = fx.property("ADBE Checkbox Control-0001"); } catch (e) { cb = null; }
    if (!cb) { try { cb = fx.property(1); } catch (e2) { cb = null; } }
    if (cb) { try { cb.setValue(on ? 1 : 0); } catch (e3) {} }
    return fx;
}

function ops_morphNum(v) { return String(Math.round(v * 1000) / 1000); }

// o = { a: {index, name}, b: {index, name}, xfA, xfB, map: path of the warp map (PNG), fmax: [fx, fy] = the displacement (px) a full-range map value means,
//       dur, at: "playhead" | "start", ease: [x1, y1, x2, y2], warp, fade, soft, flip, cut, hide, markers, name }
function ops_photoMorph(o) {
    OPS_STEP = "start";
    var c = ops_comp(), warn = [], La, Lb, ctx, base, folder, fm0, ca, cb, pm, la, lb, ml, pa, pb, PL, fx, dm, i, tStart, tEnd, tIn, tOut, ph, dur,
        W, H, fm, PRE, FADE, prog, par, name = "", cut, soft, mk = [];
    if (!c) return ops_fail("Open a composition first.");
    if (!o || !o.a || !o.b || !o.map) return ops_fail("Nothing to morph: pick two photos and place some points first.");
    La = ops_findLayerBy(c, o.a.index, o.a.name);
    Lb = ops_findLayerBy(c, o.b.index, o.b.name);
    if (!La || !Lb) return ops_fail("The photo layers changed. Select the two photos again and press \"Use the 2 selected layers\".");
    ctx = ops_ctx(c);
    W = c.width; H = c.height;
    dur = ops_clamp(ops_num(o.dur, 1.5), 0.1, 600);
    cut = !!o.cut;
    soft = ops_clamp(ops_num(o.soft, 0), 0, 400) * (H / 1080);
    fm = (o.fmax instanceof Array && o.fmax.length >= 2) ? o.fmax : [0, 0];
    try { if (app.project.bitsPerChannel === 8) warn.push("This project is 8 bits per channel: the warp can look slightly stepped. 16 bits (Project Settings > Color) is smoother."); } catch (e8) {}

    app.beginUndoGroup("Hydra: Photo Morph");
    try {
        base = ops_morphBase(c, o.name || "Photo Morph");
        folder = ops_projFolder("Hydra Morph");

        OPS_STEP = "photo comps";
        ca = app.project.items.addComp(base + " A", W, H, c.pixelAspect, c.duration, c.frameRate);
        cb = app.project.items.addComp(base + " B", W, H, c.pixelAspect, c.duration, c.frameRate);
        if (folder) { try { ca.parentFolder = folder; cb.parentFolder = folder; } catch (ef) {} }
        la = ca.layers.add(La.source); la.name = La.name;
        lb = cb.layers.add(Lb.source); lb.name = Lb.name;
        ops_morphXf(la, o.xfA, W, H, La.source.width, La.source.height);
        ops_morphXf(lb, o.xfB, W, H, Lb.source.width, Lb.source.height);

        OPS_STEP = "maps";
        fm0 = ops_morphMap(o.map, base + " Map", folder);

        OPS_STEP = "rig";
        pm = app.project.items.addComp(base, W, H, c.pixelAspect, c.duration, c.frameRate);
        if (folder) { try { pm.parentFolder = folder; } catch (ef2) {} }
        // layers are added on top, so: warp map, photo B, photo A  ->  A, B, map from the top
        ml = pm.layers.add(fm0); ml.name = "Warp Map";
        pb = pm.layers.add(cb); pb.name = base + " B";
        pa = pm.layers.add(ca); pa.name = base + " A";
        // the warp map is stretched over the whole comp; the layer only serves as the picture for the Displacement Maps
        try { ml.property("ADBE Transform Group").property("ADBE Scale").setValue([W / fm0.width * 100, H / fm0.height * 100, 100]); } catch (es1) {}
        try { ml.enabled = false; } catch (eh) {}

        PRE = "var L = comp(" + ops_q(c.name) + ").layer(" + ops_q(base) + "); var T = time + L.startTime; function V(n) { return L.effect(n)(1).valueAtTime(T); } " +
              "var p = V(\"Morph Progress\") / 100, w = V(\"Warp Amount\") / 100, s = V(\"Flip Warp\") ? -1 : 1; ";
        FADE = "var f = Math.max(0.02, V(\"Fade Width\") / 100), u = Math.min(1, Math.max(0, (p - (0.5 - f / 2)) / f)), x = u * u * (3 - 2 * u); ";

        // one warp field F (around the middle between each pair of points): A is pushed by p * F (p = 0 -> untouched), B by -(1 - p) * F (p = 1 -> untouched)
        var rig = [[pa, "s * w * p * "], [pb, "-s * w * (1 - p) * "]], r;
        for (i = 0; i < 2; i++) {
            r = rig[i];
            dm = ops_g2Fx(r[0], "ADBE Displacement Map", "Morph Warp");
            ops_g2Set(dm, "ADBE Displacement Map-0001", ml.index, warn);
            ops_g2Set(dm, "ADBE Displacement Map-0002", 1, warn);   // horizontal from Red
            ops_g2Set(dm, "ADBE Displacement Map-0004", 2, warn);   // vertical from Green
            ops_g2Set(dm, "ADBE Displacement Map-0006", 2, warn);   // stretch the map to fit
            ops_g2Set(dm, "ADBE Displacement Map-0007", 0, warn);   // no pixel wrap
            ops_g2Set(dm, "ADBE Displacement Map-0003", 0, warn);
            ops_g2Set(dm, "ADBE Displacement Map-0005", 0, warn);
            try { dm.property("ADBE Displacement Map-0003").expression = PRE + r[1] + ops_morphNum(ops_num(fm[0], 0)); } catch (ex1) { warn.push("Warp (horizontal): " + ex1); }
            try { dm.property("ADBE Displacement Map-0005").expression = PRE + r[1] + ops_morphNum(ops_num(fm[1], 0)); } catch (ex2) { warn.push("Warp (vertical): " + ex2); }
            // a touch of blur at the middle of the morph hides the places where the two warps do not line up exactly
            fx = ops_g2Fx(r[0], "ADBE Box Blur2", "Morph Soft");
            ops_g2Set(fx, "ADBE Box Blur2-0001", 0, warn);
            if (!cut) ops_g2Set(fx, "ADBE Box Blur2-0004", 1, warn);
            try { fx.property("ADBE Box Blur2-0001").expression = PRE + "V(\"Softness\") * Math.sin(Math.PI * Math.min(1, Math.max(0, p)))"; } catch (ex3) { warn.push("Softness: " + ex3); }
        }
        // the cross-fade: A goes away over the middle of the morph; B is underneath (or fades in, for cut-outs)
        try { pa.property("ADBE Transform Group").property("ADBE Opacity").expression = PRE + FADE + "100 * (1 - x)"; } catch (ex4) { warn.push("Fade: " + ex4); }
        if (cut) { try { pb.property("ADBE Transform Group").property("ADBE Opacity").expression = PRE + FADE + "100 * x"; } catch (ex5) { warn.push("Fade: " + ex5); } }

        OPS_STEP = "main comp";
        ph = c.time;
        tStart = (o.at === "start") ? 0 : ph;
        tStart = Math.round(tStart / ctx.fd) * ctx.fd;
        tEnd = tStart + dur;
        if (tEnd > c.duration) { tEnd = c.duration; tStart = Math.max(0, tEnd - dur); }
        PL = c.layers.add(pm);
        PL.name = base;
        try { PL.startTime = 0; } catch (est) {}
        // the rig stands in for both photos: from where the first starts to where the second ends
        tIn = Math.max(0, Math.min(La.inPoint, Lb.inPoint, tStart));
        tOut = Math.min(c.duration, Math.max(La.outPoint, Lb.outPoint, tEnd));
        try { PL.inPoint = tIn; PL.outPoint = tOut; } catch (eio) { warn.push("Layer length: " + eio); }
        try { PL.moveBefore((La.index < Lb.index) ? La : Lb); } catch (emv) {}

        par = PL.property("ADBE Effect Parade");
        prog = ops_sliderFx(PL, "Morph Progress", 0);
        ops_sliderFx(PL, "Warp Amount", ops_clamp(ops_num(o.warp, 100), 0, 300));
        ops_sliderFx(PL, "Fade Width", ops_clamp(ops_num(o.fade, 60), 2, 100));
        ops_sliderFx(PL, "Softness", soft);
        ops_boxFx(PL, "Flip Warp", !!o.flip);
        try {
            prog = par.property("Morph Progress").property("ADBE Slider Control-0001");
            prog.setValueAtTime(tStart, 0);
            prog.setValueAtTime(tEnd, 100);
            if (o.ease && o.ease.length === 4) ops_bezEase(prog, 1, 2, o.ease);
        } catch (ek) { warn.push("Morph Progress keyframes: " + ek); }
        if (o.markers !== false) {
            try {
                ops_addMarker(PL.property("ADBE Marker"), tStart, "Photo Morph start", tEnd - tStart, warn);
                ops_addMarker(PL.property("ADBE Marker"), tEnd, "Photo Morph end", 0, warn);
            } catch (em) { warn.push("Marker: " + em); }
        }
        if (o.hide !== false) {
            try { La.enabled = false; } catch (eh1) {}
            try { Lb.enabled = false; } catch (eh2) {}
        }
        ops_onlySelect(c, [PL]);
        name = base;
    } catch (e) {
        app.endUndoGroup();
        return ops_fail(typeof e === "string" ? e : String(e) + (OPS_STEP ? " (step: " + OPS_STEP + ")" : "") + (e && e.line ? " line " + e.line : ""));
    }
    app.endUndoGroup();
    return ops_ok({ name: name, from: tStart, to: tEnd, warnings: warn });
}

// =====================================================================================================
// v0.11 safe-zone guides.
// A guide picture (a PNG the size of a phone screen) is laid over the whole comp: top of the stack, locked and set as a
// Guide Layer, so it shows in the preview but never in a render. Running it again re-uses the same layer (no duplicates).
//   action "add"    : put / refresh the guide        action "remove" : take it out of this comp
// =====================================================================================================
function ops_safeZone(action, label, assetPath) {
    var c = ops_comp(), i, l, names, found = [], prev = [], footage = null, layer = null, existed = false, name, warn = [], f, it, io, same, keep, r;
    if (!c) return ops_fail("Open a composition first.");
    label = String(label || "Instagram");
    name = "Safe Zone - " + label;
    names = [name];
    if (label === "Instagram") names.push("Haditor Safe Zone - Instagram");   // made by the earlier stand-alone script
    for (i = 1; i <= c.numLayers; i++) {
        l = c.layer(i);
        for (r = 0; r < names.length; r++) { if (l.name === names[r]) { found.push(l); break; } }
    }

    if (action === "remove") {
        app.beginUndoGroup("Hydra: remove safe zone");
        try {
            for (i = 0; i < found.length; i++) { try { found[i].locked = false; } catch (e1) {} found[i].remove(); }
        } catch (e2) {
            app.endUndoGroup();
            return ops_fail(String(e2));
        }
        app.endUndoGroup();
        return ops_ok({ removed: found.length, name: name });
    }

    f = new File(String(assetPath || ""));
    if (!f.exists) return ops_fail("The guide picture is missing (" + f.fsName + "). Reinstall Hydra Studio.");
    same = function (a, b) { return String(a).split("\\").join("/").toLowerCase() === String(b).split("\\").join("/").toLowerCase(); };
    for (i = 0; i < c.selectedLayers.length; i++) prev.push(c.selectedLayers[i]);

    app.beginUndoGroup("Hydra: safe zone " + label);
    try {
        for (i = 1; i <= app.project.numItems && !footage; i++) {
            it = app.project.item(i);
            try { if (it instanceof FootageItem && it.file && same(it.file.fsName, f.fsName)) footage = it; } catch (e3) {}
        }
        if (!footage) {
            io = new ImportOptions(f);
            try { io.importAs = ImportAsType.FOOTAGE; } catch (e4) {}
            footage = app.project.importFile(io);
            footage.name = name + ".png";
            try { footage.parentFolder = ops_projFolder("Hydra Safe Zones"); } catch (e5) {}
        }

        if (found.length) {
            existed = true;
            layer = found[0];
            for (i = 1; i < found.length; i++) { try { found[i].locked = false; found[i].remove(); } catch (e6) {} }
            layer.locked = false;
            layer.name = name;
            if (layer.source !== footage) layer.replaceSource(footage, false);
        } else {
            layer = c.layers.add(footage);
            layer.name = name;
        }

        layer.startTime = 0;
        layer.inPoint = 0;
        layer.outPoint = c.duration;
        keep = [[layer.transform.anchorPoint, [footage.width / 2, footage.height / 2], "Anchor Point"],
                [layer.transform.position, [c.width / 2, c.height / 2], "Position"],
                [layer.transform.scale, [(c.width / footage.width) * 100, (c.height / footage.height) * 100], "Scale"],
                [layer.transform.rotation, 0, "Rotation"],
                [layer.transform.opacity, 100, "Opacity"]];
        for (i = 0; i < keep.length; i++) {
            try { keep[i][0].setValue(keep[i][1]); } catch (e7) { warn.push(keep[i][2] + " could not be reset (is it keyframed?)"); }
        }
        layer.enabled = true;
        layer.guideLayer = true;
        layer.moveToBeginning();
        layer.locked = true;

        // leave the user's own selection as it was (the other Hydra sections work on it)
        for (i = 1; i <= c.numLayers; i++) { try { c.layer(i).selected = false; } catch (e8) {} }
        for (i = 0; i < prev.length; i++) { try { if (prev[i] !== layer) prev[i].selected = true; } catch (e9) {} }
    } catch (e) {
        app.endUndoGroup();
        return ops_fail(typeof e === "string" ? e : String(e) + (e && e.line ? " line " + e.line : ""));
    }
    app.endUndoGroup();
    r = c.width / c.height;
    return ops_ok({ name: name, existed: existed, w: c.width, h: c.height, ratioOk: Math.abs(r - 9 / 16) < 0.02, warnings: warn });
}

// ---------- export to global scope ----------
// Some AE builds evaluate a loaded file in the scope of the CALLER (a function), so the functions below would vanish
// as soon as that call returns. Putting them on the global object makes them available to every later call.
(function () {
    var g = $.global, names = ["ops_esc","ops_json","ops_ok","ops_fail","ops_comp","ops_diagnose","ops_ping","ops_popCenter","ops_popKeys","ops_popProp","ops_pop","ops_selection","ops_sig","ops_state","ops_collectKeyed","ops_newKeyed","ops_writeKeys","ops_remapOne","ops_remapNew","ops_apply","ops_reveal","ops_uniqueName","ops_selectedSpan","ops_placeAbove","ops_addAdjustment","ops_onlySelect","ops_tool","ops_P","ops_fxSpec","ops_kindOk","ops_findName","ops_fxProp","ops_setVal","ops_setExpr","ops_q","ops_addFx","ops_ctx","ops_frames","ops_pw","ops_conv","ops_times","ops_tok","ops_dims","ops_slope","ops_setEase","ops_param","ops_setStatic","ops_pulseExpr","ops_applyEntry","ops_maskShape","ops_addMask","ops_findCut","ops_blendMode","ops_newAdj","ops_extent","ops_stack","ops_smooth","ops_rampSpeed","ops_rampAdvance","ops_ease1","fx_ramp","ops_rrShape","ops_glassMask","ops_glassLayer","ops_fadeIn","ops_glassFx","ops_glass","ops_g2Shape","ops_g2Rect","ops_g2Expr","ops_g2Fx","ops_g2Set","ops_glass2","ops_fx","ops_checkFx","ops_clamp","ops_num","ops_selProps","ops_layerOf","ops_sliderFx","ops_bezEase","ops_collectSegs","ops_curve","ops_curveRead","ops_expr","ops_exprClear","ops_counter","ops_shapeToObj","ops_objToShape","ops_rectObj","ops_ellipseObj","ops_xformObj","ops_findGeo","ops_findIn","ops_vecVal","ops_layerGeo","ops_morphRead","ops_morphApply","ops_scaleObj","ops_remapWrite","ops_makeShape","ops_glassStudio","ops_glass3","ops_matte","ops_pixelScan","ops_pixPlace","ops_pixAbove","ops_pixGeom","ops_pixFolder","ops_pixStart","ops_pixWipe","ops_pixBand","ops_addMarker","ops_pixSkip","ops_pixelLayers","ops_pixelStudio","ops_projFolder","ops_photoInfo","ops_morphSources","ops_findLayerBy","ops_morphBase","ops_morphXf","ops_morphMap","ops_boxFx","ops_morphNum","ops_photoMorph","ops_safeZone"], fns = [ops_esc,ops_json,ops_ok,ops_fail,ops_comp,ops_diagnose,ops_ping,ops_popCenter,ops_popKeys,ops_popProp,ops_pop,ops_selection,ops_sig,ops_state,ops_collectKeyed,ops_newKeyed,ops_writeKeys,ops_remapOne,ops_remapNew,ops_apply,ops_reveal,ops_uniqueName,ops_selectedSpan,ops_placeAbove,ops_addAdjustment,ops_onlySelect,ops_tool,ops_P,ops_fxSpec,ops_kindOk,ops_findName,ops_fxProp,ops_setVal,ops_setExpr,ops_q,ops_addFx,ops_ctx,ops_frames,ops_pw,ops_conv,ops_times,ops_tok,ops_dims,ops_slope,ops_setEase,ops_param,ops_setStatic,ops_pulseExpr,ops_applyEntry,ops_maskShape,ops_addMask,ops_findCut,ops_blendMode,ops_newAdj,ops_extent,ops_stack,ops_smooth,ops_rampSpeed,ops_rampAdvance,ops_ease1,fx_ramp,ops_rrShape,ops_glassMask,ops_glassLayer,ops_fadeIn,ops_glassFx,ops_glass,ops_g2Shape,ops_g2Rect,ops_g2Expr,ops_g2Fx,ops_g2Set,ops_glass2,ops_fx,ops_checkFx,ops_clamp,ops_num,ops_selProps,ops_layerOf,ops_sliderFx,ops_bezEase,ops_collectSegs,ops_curve,ops_curveRead,ops_expr,ops_exprClear,ops_counter,ops_shapeToObj,ops_objToShape,ops_rectObj,ops_ellipseObj,ops_xformObj,ops_findGeo,ops_findIn,ops_vecVal,ops_layerGeo,ops_morphRead,ops_morphApply,ops_scaleObj,ops_remapWrite,ops_makeShape,ops_glassStudio,ops_glass3,ops_matte,ops_pixelScan,ops_pixPlace,ops_pixAbove,ops_pixGeom,ops_pixFolder,ops_pixStart,ops_pixWipe,ops_pixBand,ops_addMarker,ops_pixSkip,ops_pixelLayers,ops_pixelStudio,ops_projFolder,ops_photoInfo,ops_morphSources,ops_findLayerBy,ops_morphBase,ops_morphXf,ops_morphMap,ops_boxFx,ops_morphNum,ops_photoMorph,ops_safeZone], i;
    for (i = 0; i < names.length; i++) { try { g[names[i]] = fns[i]; } catch (e) {} }
})();
