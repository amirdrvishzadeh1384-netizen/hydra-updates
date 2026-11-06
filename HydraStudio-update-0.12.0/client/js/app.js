(function () {
  "use strict";

  var VERSION = "0.12.0";

  // ------------------------------------------------------------------ config
  var BUILTIN_ORDER = ["Plain", "Bounce", "Pop", "Effects", "My Shakes"];

  var DEFAULT_LOOK = { surface: "paper", accent: "#FFD800", bg: "", cats: "spectrum", catColors: {} };
  var DEFAULT_SETTINGS = {
    surface: "paper", accent: "#FFD800", bg: "", cats: "spectrum", catColors: {},
    density: "cozy", motion: true, live: true, start: "inpoint", quick: false, dir: "in",
    mode: "presets", fxTarget: "adj", fxInt: 100, fxLen: 200, tabs: null, studio: {},
    autoUpdate: true, autoInstall: false
  };
  var DENSITIES = ["cozy", "compact", "list"];

  // Section colors (Apple system palette). Built-in sections get fixed colors so they never shuffle.
  var SPECTRUM = [[10, 132, 255], [255, 159, 10], [191, 90, 242], [48, 209, 88], [255, 55, 95], [90, 200, 250], [94, 92, 230]];
  var DEFAULT_CAT = {
    Plain: SPECTRUM[0], Bounce: SPECTRUM[1], Pop: SPECTRUM[3], Effects: SPECTRUM[2], "My Shakes": SPECTRUM[4],
    Transitions: SPECTRUM[6], Glass: [50, 173, 230], "Speed Ramp": SPECTRUM[3], Shake: SPECTRUM[1], Punch: SPECTRUM[4],
    "Flash & Glitch": SPECTRUM[2], "Blur & Glow": [10, 132, 255], Color: [255, 107, 87], Light: [255, 196, 0], Clarity: [64, 200, 224]
  };
  var GOLD = [235, 188, 0], TEAL = [48, 190, 215], NEUTRAL = [140, 140, 150];

  var ACCENTS = [
    ["Yellow", "#FFD800"], ["Orange", "#FF9F0A"], ["Coral", "#FF6B57"], ["Pink", "#FF375F"], ["Purple", "#BF5AF2"], ["Indigo", "#5E5CE6"],
    ["Blue", "#0A84FF"], ["Cyan", "#32ADE6"], ["Green", "#30D158"], ["White", "#F5F5F7"], ["Ink", "#1D1D1F"]
  ];

  var SURFACES = {
    paper:    { name: "Paper",    dark: false, bg: "#fafaf8", card: "#ffffff", muted: "#f0f0ed" },
    fog:      { name: "Fog",      dark: false, bg: "#f2f2f7", card: "#ffffff", muted: "#e6e6ec" },
    sand:     { name: "Sand",     dark: false, bg: "#f6f1e7", card: "#fffcf5", muted: "#ebe4d4" },
    sage:     { name: "Sage",     dark: false, bg: "#eef3ee", card: "#ffffff", muted: "#e0e9e0" },
    sky:      { name: "Sky",      dark: false, bg: "#eef4fb", card: "#ffffff", muted: "#e0eaf5" },
    midnight: { name: "Midnight", dark: true,  bg: "#0b0b0d", card: "#151518", muted: "#1b1b1f" },
    graphite: { name: "Graphite", dark: true,  bg: "#1c1c1e", card: "#2a2a2d", muted: "#323235" },
    navy:     { name: "Navy",     dark: true,  bg: "#0a1020", card: "#121a2f", muted: "#18223b" },
    forest:   { name: "Forest",   dark: true,  bg: "#0a1410", card: "#11201a", muted: "#172a22" },
    plum:     { name: "Plum",     dark: true,  bg: "#140c1a", card: "#1f1428", muted: "#281a33" }
  };
  var SURFACE_ORDER = ["paper", "fog", "sand", "sage", "sky", "midnight", "graphite", "navy", "forest", "plum"];

  var LOOKS = [
    { name: "Studio", surface: "paper",    accent: "#FFD800", cats: "spectrum" },
    { name: "Night",  surface: "midnight", accent: "#FFD800", cats: "spectrum" },
    { name: "Ocean",  surface: "navy",     accent: "#0A84FF", cats: "spectrum" },
    { name: "Forest", surface: "forest",   accent: "#30D158", cats: "spectrum" },
    { name: "Berry",  surface: "plum",     accent: "#FF375F", cats: "spectrum" },
    { name: "Slate",  surface: "graphite", accent: "#FF9F0A", cats: "spectrum" },
    { name: "Sand",   surface: "sand",     accent: "#FF9F0A", cats: "spectrum" },
    { name: "Sage",   surface: "sage",     accent: "#30D158", cats: "spectrum" },
    { name: "Fog",    surface: "fog",      accent: "#5E5CE6", cats: "spectrum" },
    { name: "Mono",   surface: "paper",    accent: "#1D1D1F", cats: "mono" }
  ];

  function svg(inner, extra) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"' + (extra || "") + ">" + inner + "</svg>";
  }
  var ICON = {
    sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
    palette: svg('<path d="M12 3.4a8.6 8.6 0 100 17.2c1.3 0 1.9-.8 1.9-1.7 0-1.2-.9-1.5-.9-2.6 0-.9.7-1.6 1.7-1.6h2.2a3.2 3.2 0 003.2-3.3C20.1 6.8 16.5 3.4 12 3.4z"/><circle cx="7.9" cy="11.2" r="1" fill="currentColor"/><circle cx="10.6" cy="7.5" r="1" fill="currentColor"/><circle cx="15" cy="7.5" r="1" fill="currentColor"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    star: svg('<path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.6l5.9-.8z"/>'),
    clock: svg('<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3 2"/>'),
    trash: svg('<path d="M5 7h14M9.5 7V4.5h5V7M7 7l.8 12h8.4L17 7"/>'),
    grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>'),
    grid3: svg('<rect x="3.5" y="3.5" width="4.4" height="4.4" rx="1.2"/><rect x="9.8" y="3.5" width="4.4" height="4.4" rx="1.2"/><rect x="16.1" y="3.5" width="4.4" height="4.4" rx="1.2"/><rect x="3.5" y="9.8" width="4.4" height="4.4" rx="1.2"/><rect x="9.8" y="9.8" width="4.4" height="4.4" rx="1.2"/><rect x="16.1" y="9.8" width="4.4" height="4.4" rx="1.2"/><rect x="3.5" y="16.1" width="4.4" height="4.4" rx="1.2"/><rect x="9.8" y="16.1" width="4.4" height="4.4" rx="1.2"/><rect x="16.1" y="16.1" width="4.4" height="4.4" rx="1.2"/>'),
    list: svg('<path d="M4 6.5h16M4 12h16M4 17.5h16"/>'),
    type: svg('<path d="M4 18l4.6-12L13 18M5.8 14h5.6M15.2 18l2.8-7 2.8 7M16.2 16h3.6"/>'),
    bounce: svg('<circle cx="12" cy="7.5" r="3"/><path d="M5 20c2-3.4 12-3.4 14 0"/>'),
    sparkle: svg('<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15v5M16.5 17.5h5"/>'),
    folder: svg('<path d="M3.5 7.5a2 2 0 012-2h4l2 2.5h7a2 2 0 012 2v7.5a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>')
  };
  // the sections of the panel, in their default order: label, icon, and the colour the dock glyph uses
  var MODES = {
    presets: { label: "Presets", icon: "type", rgb: [10, 132, 255] },
    fx:      { label: "FX", icon: "bolt", rgb: [255, 196, 0] },
    curve:   { label: "Curve", icon: "curve", rgb: [255, 159, 10] },
    expr:    { label: "Expressions", icon: "code", rgb: [191, 90, 242] },
    morph:   { label: "Morph", icon: "morph", rgb: [255, 55, 95] },
    glass:   { label: "Glass", icon: "glass", rgb: [50, 173, 230] },
    pixel:   { label: "Pixel", icon: "pixel", rgb: [0, 199, 190] },
    timer:   { label: "Timer", icon: "timer", rgb: [48, 209, 88] },
    safe:    { label: "Safe Zone", icon: "safe", rgb: [214, 41, 118] },
    tools:   { label: "Tools", icon: "layers", rgb: [94, 92, 230] }
  };
  var MODE_ORDER = ["presets", "fx", "curve", "expr", "morph", "glass", "pixel", "timer", "safe", "tools"];
  var NEW_TABS = ["pixel", "safe"];   // sections added after 0.9.0
  var STUDIO_MODES = ["curve", "expr", "morph", "glass", "pixel", "timer"];
  // a speed ramp's glyph is its own speed curve (smooth between the knots, the way time remapping plays it)
  var glyphCache = {};
  function fxGlyph(f) {
    if (f.kind !== "ramp" || !f.p || !f.p.knots) return ICON[f.icon];
    if (glyphCache[f.id]) return glyphCache[f.id];
    var kn = f.p.knots, mx = 1.2, i, d = "", u, v, x, y, j, a, b, t;
    for (i = 0; i < kn.length; i++) mx = Math.max(mx, kn[i][1]);
    function at(u) {
      var q;
      for (q = 1; q < kn.length; q++) if (u <= kn[q][0]) { a = kn[q - 1]; b = kn[q]; t = (u - a[0]) / (b[0] - a[0]); t = t * t * (3 - 2 * t); return a[1] + (b[1] - a[1]) * t; }
      return kn[kn.length - 1][1];
    }
    for (i = 0; i <= 32; i++) {
      u = i / 32; v = at(u); x = 3 + u * 18; y = 19 - (v / mx) * 14;
      d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }
    var y1 = 19 - (1 / mx) * 14;
    glyphCache[f.id] = svg('<path d="M3 ' + y1.toFixed(1) + 'h18" opacity=".35" stroke-dasharray="1.5 2.5"/><path d="' + d + '"/>');
    return glyphCache[f.id];
  }
  var TAB_ICON = { all: "grid", recent: "clock", favorites: "star", plain: "type", bounce: "bounce", effects: "sparkle" };
  var VIEW_ICON = { cozy: "grid", compact: "grid3", list: "list" };

  ICON.bolt = svg('<path d="M13.5 3L6 13.2h5.2L10 21l8-11h-5.3z"/>');
  ICON.layers = svg('<path d="M12 4l8 4.5-8 4.5-8-4.5z"/><path d="M4 12.5l8 4.5 8-4.5M4 16.5l8 4.5 8-4.5"/>');
  ICON.shake = svg('<rect x="9" y="5.5" width="6" height="13" rx="1.8"/><path d="M5.8 9v6M3.5 10.8v2.4M18.2 9v6M20.5 10.8v2.4"/>');
  ICON.zoom = svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><circle cx="12" cy="12" r="2.6"/>');
  ICON.pulse = svg('<path d="M3 12h3.5l2-6 3.5 12 2.5-9 1.5 3H21"/>');
  ICON.push = svg('<path d="M9 5H5v4M15 5h4v4M9 19H5v-4M15 19h4v-4"/><circle cx="12" cy="12" r="1.8"/>');
  ICON.blur = svg('<circle cx="9" cy="12" r="5.2"/><circle cx="15" cy="12" r="5.2" opacity=".5"/>');
  ICON.glow = svg('<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>');
  ICON.adjust = svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none" opacity=".35"/><path d="M12 4v16"/>');
  ICON.nullObj = svg('<rect x="5" y="5" width="14" height="14" rx="2.2" stroke-dasharray="2.6 2.6"/><path d="M12 9v6M9 12h6"/>');
  ICON.parent = svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.7"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.7"/><path d="M7 10.5V15a2 2 0 002 2h4.5"/>');
  ICON.solid = svg('<rect x="4" y="5" width="16" height="14" rx="2.4" fill="currentColor" fill-opacity=".3"/>');
  ICON.camera = svg('<rect x="3.5" y="7" width="12" height="10" rx="2.4"/><path d="M15.5 11l5-3v8l-5-3z"/>');
  ICON.textT = svg('<path d="M6 7.5V5h12v2.5M12 5v14M9.5 19h5"/>');
  ICON.light = svg('<path d="M9.2 18h5.6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z"/>');
  ICON.precomp = svg('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2"/><path d="M15.5 8.5V6.2A2.2 2.2 0 0013.3 4H6.2A2.2 2.2 0 004 6.2v7.1A2.2 2.2 0 006.2 15.5h2.3"/>');
  ICON.glass = svg('<rect x="3.5" y="6.5" width="17" height="11" rx="5.5"/><path d="M7.4 10.4c.9-.9 2.1-1.3 3.4-1.3"/><path d="M15.6 14.2c.5-.2 1-.6 1.4-1.1" opacity=".6"/>');
  ICON.ramp = svg('<path d="M3.5 17.5C7.5 17.5 7.8 6.5 12 6.5s4.6 11 8.5 11"/><circle cx="12" cy="6.5" r="1.3" fill="currentColor" stroke="none"/>');
  ICON.whip = svg('<path d="M3.5 8h8M3.5 12h11M3.5 16h6"/><path d="M16 7.5l4.5 4.5-4.5 4.5"/>');
  ICON.glitch = svg('<path d="M4 7.5h9M11 12h9M4 16.5h8"/><path d="M15.5 7.5h4.5M4 12h3.5M14.5 16.5H20" opacity=".5"/>');
  ICON.vignette = svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4" fill="currentColor" fill-opacity=".25"/>');
  TAB_ICON.shake = "shake"; TAB_ICON.punch = "zoom"; TAB_ICON["blur & glow"] = "glow"; TAB_ICON.glass = "glass"; TAB_ICON["speed ramp"] = "ramp";
  TAB_ICON.transitions = "whip"; TAB_ICON["flash & glitch"] = "bolt";
  ICON.prism = svg('<path d="M12 4l8 14H4z"/><path d="M2.5 11.5l6.6 1.2M15 10.8l6.5-2.3M16.2 14.2l5.3 1.6" opacity=".7"/>');
  ICON.spin = svg('<path d="M19 12a7 7 0 11-2.1-5"/><path d="M19.6 4v4.2h-4.2"/>');
  ICON.stretch = svg('<path d="M4 12h16M7.2 8.6L3.6 12l3.6 3.4M16.8 8.6l3.6 3.4-3.6 3.4"/>');
  ICON.lens = svg('<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.8"/><path d="M7.6 8.2a5.6 5.6 0 013-1.6" opacity=".6"/>');
  ICON.burn = svg('<path d="M12 3.2c.5 3.2-3.8 5.2-3.8 9.6A3.8 3.8 0 0012 16.6a3.8 3.8 0 003.8-3.8c0-2-1-3.3-2.2-4.6.1 1.4-.5 2.3-1.3 2.8.4-2.7-.1-5.6-.3-7.8z"/><path d="M9 20.2h6"/>');
  ICON.strobe = svg('<path d="M4.5 7v10M8.8 9.5v5M13.2 7v10M17.5 9.5v5M21 8v8" />');
  ICON.curve = svg('<path d="M4 19c6 0 4-14 16-14"/><circle cx="4" cy="19" r="1.6" fill="currentColor" stroke="none"/><circle cx="20" cy="5" r="1.6" fill="currentColor" stroke="none"/><path d="M4 19l4-5M20 5l-4 5" opacity=".45"/>');
  ICON.code = svg('<path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.2 5.5l-2.4 13"/>');
  ICON.pixel = svg('<rect x="4" y="4" width="5" height="5" rx="1"/><rect x="10" y="4" width="5" height="5" rx="1" opacity=".6"/><rect x="4" y="10" width="5" height="5" rx="1"/><rect x="10" y="10" width="5" height="5" rx="1" fill="currentColor" stroke="none"/><rect x="16" y="10" width="4" height="5" rx="1" opacity=".45"/><rect x="4" y="16" width="5" height="4" rx="1" opacity=".5"/><rect x="10" y="16" width="5" height="4" rx="1" opacity=".8"/>');
  ICON.safe = svg('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><rect x="9" y="6.2" width="6" height="9.4" rx="1" stroke-dasharray="1.6 1.6" opacity=".75"/><path d="M10.4 18.4h3.2"/>');
  ICON.timer = svg('<circle cx="12" cy="13.2" r="7.2"/><path d="M12 9.4v4l2.6 1.6M9.5 3.6h5M12 3.6v2.4"/>');
  ICON.morph = svg('<circle cx="8" cy="12" r="4.6"/><rect x="11.8" y="7.4" width="9.2" height="9.2" rx="2.2" opacity=".55"/>');
  ICON.arrange = svg('<path d="M5 7.5h14M5 12h14M5 16.5h14"/><circle cx="9" cy="7.5" r="1.9" fill="var(--card)"/><circle cx="15.5" cy="12" r="1.9" fill="var(--card)"/><circle cx="8" cy="16.5" r="1.9" fill="var(--card)"/>');
  ICON.up = svg('<path d="M6 14l6-6 6 6"/>');
  ICON.down = svg('<path d="M6 10l6 6 6-6"/>');
  ICON.twirl = svg('<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M12 4.6a7.4 7.4 0 017.4 7.4M12 8.4a3.6 3.6 0 013.6 3.6M12 19.4A7.4 7.4 0 014.6 12M12 15.6A3.6 3.6 0 018.4 12"/>');
  ICON.cards = svg('<rect x="4" y="8" width="11" height="12" rx="2"/><path d="M8.5 4.6h8.6a2.9 2.9 0 012.9 2.9v8.4" opacity=".6"/>');
  ICON.slice = svg('<rect x="4" y="5" width="16" height="14" rx="2.6"/><path d="M14.4 5L9.6 19"/>');
  ICON.line = svg('<path d="M12 3.5v17"/><path d="M5 8h4M5 12h4M5 16h4M15 8h4M15 12h4M15 16h4" opacity=".5"/>');
  ICON.flip = svg('<path d="M12 3.5v17" stroke-dasharray="2 2.4"/><path d="M9 7.2L4 17h5zM15 7.2l5 9.8h-5z"/>');
  ICON.hot = svg('<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.4 2.4M15.6 15.6L18 18M18 6l-2.4 2.4M8.4 15.6L6 18"/>');
  ICON.twitch = svg('<path d="M3 10l3-2.4 3 4.4 3-6.4 3 8.4 3-4.4 3 2.4"/>');
  ICON.clarity = svg('<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z"/><path d="M12 8.2v7.6M8.2 12h7.6" opacity=".6"/>');
  TAB_ICON.color = "palette"; TAB_ICON.light = "light"; TAB_ICON.clarity = "clarity";

  // the effect catalog lives in recipes.js: one description drives both After Effects and the preview
  var HS = window.HS, FX = HS.FX, FX_CATS = HS.CATS;
  function fxById(id) { return HS.byId(id); }
  // recipes that need their own adjustment layer(s): masks, extra layers, blend modes, keyed opacity
  // what each recipe is built from, in After Effects' own words (shown under the preview)
  var FXN = {"sweep":"CC Light Sweep","tf":"Transform","tile":"Motion Tile","dblur":"Directional Blur","rblur":"CC Radial Fast Blur","sblur":"Radial Blur","gblur":"Gaussian Blur","echo":"Echo","chan":"Channel Blur","expo":"Exposure","hs":"Hue/Saturation","bc":"Brightness & Contrast","cb":"Color Balance","pf":"Tint","fill":"Fill","inv":"Invert","glow":"Glow","usm":"Unsharp Mask","noise":"Noise","med":"Median","ramp":"Gradient Ramp","flare":"Lens Flare","mos":"Mosaic","post":"Posterize Time","bul":"Bulge","twirl":"Twirl","td":"Turbulent Displace","b3d":"Basic 3D","optic":"Optics Compensation"};
  function chainOf(f) {
    var out = [], seen = {}, p = f.p || {};
    function add(n) { if (n && !seen[n]) { seen[n] = 1; out.push(n); } }
    function addFx(list) { (list || []).forEach(function (e) { add(FXN[e.t] || e.n); }); }
    if (f.kind === "ramp") { add("Time Remap"); if (p.zoom) add("Scale"); }
    else if (f.kind === "glass") { ["Adjustment lens", "Displacement Map", "Fast Box Blur", "Trim Paths"].forEach(add); }
    else if (f.kind === "pixscan") { ["Turbulent Displace", "Mosaic", "Alpha matte", "Gradient Ramp", "Glow"].forEach(add); }
    else {
      addFx(p.fx);
      (p.under || []).forEach(function (u) { addFx(u.fx); });
      if (p.mask) add("Mask");
      if (p.blend) add(p.blend.charAt(0).toUpperCase() + p.blend.slice(1) + " blend");
      if (p.marker) add("Marker");
    }
    return out;
  }
  function fxNeedsAdj(f) { var p = f.p || {}; return f.kind === "stack" && !!(p.under || p.mask || p.blend || p.lop || p.lopk); }

  var TOOLS = [
    { id: "adjustment", name: "Adjustment Layer", hint: "Above your selection", icon: "adjust" },
    { id: "null", name: "Null Object", hint: "At the comp center", icon: "nullObj" },
    { id: "nullParent", name: "Null + Parent", hint: "Parents your selection", icon: "parent" },
    { id: "solid", name: "Solid", hint: "Dark background", icon: "solid" },
    { id: "camera", name: "Camera", hint: "Centered", icon: "camera" },
    { id: "text", name: "Text", hint: "Centered", icon: "textT" },
    { id: "light", name: "Light", hint: "Point light", icon: "light" },
    { id: "precomp", name: "Pre-compose", hint: "Selected layers", icon: "precomp" }
  ];

  // ------------------------------------------------------------------ helpers
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hashStr(s) { var x = 0, i; for (i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x; }

  var toastTimer;
  function toast(msg, isErr) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast show" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, isErr ? 4500 : 2200);
  }

  // ------------------------------------------------------------------ color math
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function hexToRgb(hex) {
    var s = String(hex || "").trim().replace(/^#/, "");
    if (s.length === 3) s = s.replace(/(.)/g, "$1$1");
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)];
  }
  function rgbToHex(c) {
    return "#" + c.map(function (v) {
      var x = clamp(Math.round(v), 0, 255).toString(16);
      return x.length < 2 ? "0" + x : x;
    }).join("").toUpperCase();
  }
  function rgbStr(c, a) {
    var r = c.map(function (v) { return Math.round(v); });
    return a === undefined ? "rgb(" + r.join(",") + ")" : "rgba(" + r.join(",") + "," + a + ")";
  }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function luma(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function hsvToRgb(hh, s, v) {
    var c = v * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = v - c, r = 0, g = 0, b = 0;
    if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; }
    else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgbToHue(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, hh = 0;
    if (d === 0) return 0;
    if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4;
    hh *= 60; return hh < 0 ? hh + 360 : hh;
  }
  function hslToRgb(hh, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hh / 60) % 2) - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; }
    else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgbToHsl(c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, d = mx - mn, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: rgbToHue(c), s: s, l: l };
  }

  // ------------------------------------------------------------------ node / filesystem
  var fs = null, path = null, os = null, nodeOK = false;
  try {
    var req = (typeof require === "function") ? require : window.require;
    fs = req("fs"); path = req("path"); os = req("os");
    nodeOK = true;
  } catch (e) { nodeOK = false; }

  function exists(p) { try { return fs.existsSync(p); } catch (e) { return false; } }
  function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
  function mkdirp(p) {
    if (exists(p)) return;
    var parent = path.dirname(p);
    if (parent !== p) mkdirp(parent);
    try { fs.mkdirSync(p); } catch (e) { if (!exists(p)) throw e; }
  }
  function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } }
  function writeJSON(p, o) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(o, null, 1)); }
  function rmrf(p) {
    if (!exists(p)) return;
    if (isDir(p)) {
      fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); });
      try { fs.rmdirSync(p); } catch (e) {}
    } else {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }

  // ------------------------------------------------------------------ state
  var P = {};
  var emptySel = { hasComp: false, total: 0, texts: 0, others: 0, name: "" };
  var S = {
    presets: [], outs: [], meta: null, sel: emptySel, selKnown: false,
    connected: false, phase: "connecting", reachErr: "", started: Date.now(),
    current: null, cat: "All", query: "", pollBusy: false, applying: false, hintOverride: "",
    hover: true, lastMove: Date.now(), look: { dark: false, accent: [255, 216, 0] },
    fxCurrent: null, catByMode: { presets: "All", fx: "All" }, lastFx: ""
  };
  function modeNow() { return S.meta.settings.mode; }
  function isFx() { return modeNow() === "fx"; }
  function isStudio() { return STUDIO_MODES.indexOf(modeNow()) >= 0; }

  function initPaths() {
    var ext = cep.systemPath("extension");
    if (!ext) {
      ext = decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, "$1").replace(/\/client\/index\.html$/, "");
    }
    var plat = (typeof process !== "undefined" && process.platform) || "";
    var home = os.homedir(), data;
    if (plat === "win32") data = path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "HydraStudio");
    else if (plat === "darwin") data = path.join(home, "Library", "Application Support", "HydraStudio");
    else data = path.join(home, ".config", "HydraStudio");
    P.ext = ext;
    P.builtin = path.join(ext, "presets");
    P.data = data;
    P.lib = path.join(data, "library");
    P.meta = path.join(data, "meta.json");
  }

  // v0.2 and earlier lived in "PresetStudio": bring the library and settings along once.
  function copyDir(from, to) {
    mkdirp(to);
    fs.readdirSync(from).forEach(function (f) {
      var a = path.join(from, f), b = path.join(to, f);
      if (isDir(a)) copyDir(a, b); else fs.copyFileSync(a, b);
    });
  }
  function migrateOld() {
    var old = path.join(path.dirname(P.data), "PresetStudio");
    if (exists(P.data) || !exists(old)) return;
    try { copyDir(old, P.data); } catch (e) {}
  }

  // the visible sections, in the order the person arranged them (always at least one)
  function cleanTabs(t) {
    var out = [];
    if (Array.isArray(t)) t.forEach(function (k) { if (MODES[k] && out.indexOf(k) < 0) out.push(k); });
    else out = MODE_ORDER.slice();
    return out.length ? out : MODE_ORDER.slice();
  }

  function loadMeta() {
    var m = readJSON(P.meta) || {};
    var st = Object.assign({}, DEFAULT_SETTINGS, m.settings || {});
    // v0.2 stored theme = auto | light | dark
    if (m.settings && m.settings.theme && !m.settings.surface) {
      st.surface = m.settings.theme === "dark" ? "midnight" : m.settings.theme === "auto" ? "auto" : "paper";
    }
    delete st.theme;
    if (!hexToRgb(st.accent)) st.accent = DEFAULT_SETTINGS.accent;
    st.accent = rgbToHex(hexToRgb(st.accent));
    if (st.surface !== "auto" && st.surface !== "custom" && !SURFACES[st.surface]) st.surface = "paper";
    if (st.surface === "custom" && !hexToRgb(st.bg)) st.surface = "paper";
    if (["spectrum", "accent", "mono"].indexOf(st.cats) < 0) st.cats = "spectrum";
    if (DENSITIES.indexOf(st.density) < 0) st.density = "cozy";
    if (st.dir !== "out") st.dir = "in";
    st.tabs = cleanTabs(st.tabs);
    // a section that arrived after this panel's tab list was saved is added once, next to its neighbours
    if (m.settings && Array.isArray(m.settings.tabs)) {
      var seenT = Array.isArray(st.tabsSeen) ? st.tabsSeen : [];
      NEW_TABS.forEach(function (k) {
        if (seenT.indexOf(k) >= 0 || st.tabs.indexOf(k) >= 0) return;
        var at = MODE_ORDER.indexOf(k), j, put = -1;
        for (j = at - 1; j >= 0 && put < 0; j--) put = st.tabs.indexOf(MODE_ORDER[j]);
        st.tabs.splice(put + 1, 0, k);
      });
    }
    st.tabsSeen = MODE_ORDER.slice();
    if (!MODES[st.mode]) st.mode = "presets";
    if (st.tabs.indexOf(st.mode) < 0) st.mode = st.tabs[0];
    if (!st.studio || typeof st.studio !== "object") st.studio = {};
    if (st.fxTarget !== "layers") st.fxTarget = "adj";
    st.fxInt = clamp(Number(st.fxInt) || 100, 25, 200);
    st.fxLen = clamp(Number(st.fxLen) || 200, 100, 400);
    if (!st.catColors || typeof st.catColors !== "object") st.catColors = {};
    S.meta = {
      favorites: Array.isArray(m.favorites) ? m.favorites : [],
      recent: Array.isArray(m.recent) ? m.recent : [],
      types: m.types && typeof m.types === "object" ? m.types : {},
      roles: m.roles && typeof m.roles === "object" ? m.roles : {},
      settings: st
    };
  }
  function saveMeta() { try { writeJSON(P.meta, S.meta); } catch (e) {} }
  var saveTimer;
  function saveMetaSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveMeta, 350); }

  // ------------------------------------------------------------------ look engine (live theming)
  function deriveSurface(bgHex) {
    var c = hexToRgb(bgHex) || [250, 250, 248], dark = luma(c) < 0.2;
    return {
      dark: dark, bg: rgbToHex(c),
      card: rgbToHex(dark ? mixc(c, [255, 255, 255], 0.06) : mixc(c, [255, 255, 255], 0.75)),
      muted: rgbToHex(dark ? mixc(c, [255, 255, 255], 0.1) : mixc(c, [0, 0, 0], 0.045))
    };
  }

  function resolveSurface(st) {
    var key = st.surface;
    if (key === "auto") {
      var b = cep.hostBrightness();
      key = (b !== null && b < 128) ? "midnight" : "paper";
    }
    if (key === "custom") return deriveSurface(st.bg);
    return SURFACES[key] || SURFACES.paper;
  }

  function lookVars(sf, accentHex) {
    var bg = hexToRgb(sf.bg), card = hexToRgb(sf.card), muted = hexToRgb(sf.muted), dark = sf.dark;
    var text = dark ? [245, 245, 247] : [21, 21, 23];
    var ac = hexToRgb(accentHex) || [255, 216, 0];
    var accentInk = (1.05 / (luma(ac) + 0.05) >= 3) ? "#ffffff" : "#151517";
    var glow = dark ? 0.12 : 0.2;
    if (luma(ac) < 0.08) glow = dark ? 0.03 : 0.06;
    return {
      "--bg": sf.bg, "--card": sf.card, "--muted": sf.muted, "--bg-rgb": bg.join(", "), "--card-rgb": card.join(", "),
      "--text": rgbStr(text), "--text-2": rgbStr(mixc(text, bg, 0.37)), "--text-3": rgbStr(mixc(text, bg, 0.62)),
      "--line": dark ? "rgba(255,255,255,.07)" : "rgba(20,20,24,.07)",
      "--line-strong": dark ? "rgba(255,255,255,.15)" : "rgba(20,20,24,.14)",
      "--ind": dark ? rgbStr(mixc(muted, [255, 255, 255], 0.1)) : "#ffffff",
      "--accent": rgbToHex(ac), "--accent-hover": rgbStr(mixc(ac, [255, 255, 255], 0.3)),
      "--accent-ink": accentInk, "--accent-shadow": rgbStr(ac, 0.35), "--glow": rgbStr(ac, glow)
    };
  }

  function applyLook() {
    var st = S.meta.settings, sf = resolveSurface(st), vars = lookVars(sf, st.accent), root = document.documentElement;
    Object.keys(vars).forEach(function (k) { root.style.setProperty(k, vars[k]); });
    root.setAttribute("data-theme", sf.dark ? "dark" : "light");
    S.look = { dark: sf.dark, accent: hexToRgb(st.accent) || [255, 216, 0] };
    document.body.classList.toggle("calm", !st.motion);
  }

  // a section color tuned so icons/labels stay readable on the current surface
  function inkRGB(rgb) {
    var L = luma(rgb);
    if (!S.look.dark) {
      if (L > 0.55) return mixc(rgb, [0, 0, 0], 0.38);
      if (L > 0.38) return mixc(rgb, [0, 0, 0], 0.22);
      return rgb;
    }
    if (L < 0.06) return mixc(rgb, [255, 255, 255], 0.6);
    if (L < 0.14) return mixc(rgb, [255, 255, 255], 0.3);
    return rgb;
  }
  function colorVars(rgb) { return "--c:" + rgbStr(inkRGB(rgb)) + ";--c-soft:" + rgbStr(rgb, 0.16); }
  function paintEl(el, rgb) {
    el.style.setProperty("--c", rgbStr(inkRGB(rgb)));
    el.style.setProperty("--c-soft", rgbStr(rgb, 0.16));
  }

  function catRGB(name) {
    var st = S.meta.settings;
    if (st.cats === "accent") return S.look.accent;
    if (st.cats === "mono") return NEUTRAL;
    var ov = hexToRgb(st.catColors[name]);
    if (ov) return ov;
    if (DEFAULT_CAT[name]) return DEFAULT_CAT[name];
    return SPECTRUM[3 + (hashStr(String(name)) % 4)];
  }
  function tabRGB(key) {
    var st = S.meta.settings;
    if (key === "All") return NEUTRAL;
    if (key === "Favorites") return GOLD;
    if (key === "Recent") return st.cats === "accent" ? S.look.accent : st.cats === "mono" ? NEUTRAL : TEAL;
    return catRGB(key);
  }

  function toolRGB(i) {
    var st = S.meta.settings;
    return st.cats === "accent" ? S.look.accent : st.cats === "mono" ? NEUTRAL : SPECTRUM[i % SPECTRUM.length];
  }
  function recolor() {
    $$(".tool").forEach(function (el) { paintEl(el, toolRGB(Number(el.getAttribute("data-i")))); });
    $$(".card, .section-head").forEach(function (el) { paintEl(el, catRGB(el.getAttribute("data-cat"))); });
    Preview.tint();
    $$(".tab").forEach(function (el) { paintEl(el, tabRGB(el.getAttribute("data-cat"))); });
    moveIndicator(true);
    renderDock();
    if (window.Studio) Studio.refresh();
  }

  var rafId = 0;
  function refreshTheme() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      applyLook(); recolor(); saveMetaSoon();
    });
  }

  // ------------------------------------------------------------------ library scan
  function pretty(fn) {
    var s = fn.replace(/\.ffx$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
    return s.split(" ").map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }

  function scanRoot(root, source, manifest) {
    var out = [];
    if (!exists(root)) return out;
    fs.readdirSync(root).forEach(function (cat) {
      var cp = path.join(root, cat);
      if (cat.charAt(0) === "." || !isDir(cp)) return;
      fs.readdirSync(cp).forEach(function (fn) {
        if (!/\.ffx$/i.test(fn)) return;
        var rel = cat + "/" + fn;
        var id = source + "/" + rel;
        var mf = (manifest && manifest[rel]) || {};
        out.push({
          id: id, source: source, category: cat, file: path.join(cp, fn),
          name: mf.name || pretty(fn),
          type: S.meta.types[id] || mf.type || (/^effects?$/i.test(cat) ? "any" : "text"),
          role: (S.meta.roles[id] || mf.role) === "out" ? "out" : "in",
          order: typeof mf.order === "number" ? mf.order : 999
        });
      });
    });
    return out;
  }

  // "Pop" presets are motion on the layer's own Transform (pop.js), so they work on shapes, images and any layer, not only text
  function popPresets() {
    return (HS.POP || []).map(function (r, i) {
      return { id: "builtin/Pop/" + r.id, source: "builtin", category: "Pop", file: "", name: r.name, type: "any", role: "in", order: i, pop: r };
    });
  }

  function scanAll() {
    var manifest = readJSON(path.join(P.builtin, "manifest.json")) || {};
    var list = scanRoot(P.builtin, "builtin", manifest).concat(popPresets()).concat(scanRoot(P.lib, "user", null));
    function catRank(p) {
      if (p.source === "builtin") { var i = BUILTIN_ORDER.indexOf(p.category); return i < 0 ? 50 : i; }
      return 100;
    }
    list.sort(function (a, b) {
      return (catRank(a) - catRank(b)) || a.category.localeCompare(b.category) ||
        (a.order - b.order) || a.name.localeCompare(b.name);
    });
    S.presets = list;
    S.outs = makeOuts(list);
  }

  // "Out" is every text preset played backwards so it ends on the layer's out-point. The label shows the direction
  // the text travels while leaving, so "Word Up" (out) is the reverse of the "Word Down" (in) animation.
  var FLIP = { up: "down", down: "up", left: "right", right: "left", "in": "out", on: "off" };
  var DIR_RANK = ["up", "down", "left", "right"];
  function flipName(name) {
    return name.replace(/\b(up|down|left|right|in|on)\b/gi, function (m) {
      var to = FLIP[m.toLowerCase()];
      return m.charAt(0) === m.charAt(0).toUpperCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to;
    });
  }
  function baseKey(p) { return p.category + "|" + p.name.toLowerCase().replace(/\b(up|down|left|right)\b/g, "").replace(/\s+/g, " ").trim(); }
  function dirRank(p) { var m = p.name.toLowerCase().match(/\b(up|down|left|right)\b/); return m ? DIR_RANK.indexOf(m[1]) : -1; }
  function makeOuts(list) {
    var outs = [];
    list.forEach(function (p, i) {
      var q;
      if (p.role === "out") {            // already an out animation: use as-is, just place it at the end of the layer
        q = Object.assign({}, p); q.id = p.id + "#out"; q.dir = "out"; q.asIs = true; q.base = p; q.idx = i; outs.push(q);
      } else if (p.type === "text" || p.pop) {    // an in animation: play it backwards
        q = Object.assign({}, p); q.id = p.id + "#out"; q.name = flipName(p.name); q.dir = "out"; q.base = p; q.idx = i; outs.push(q);
      }
    });
    var first = {};
    outs.forEach(function (q) { var k = baseKey(q); if (first[k] === undefined) first[k] = q.idx; });
    outs.sort(function (a, b) {
      return (first[baseKey(a)] - first[baseKey(b)]) || (dirRank(a) - dirRank(b)) || (a.idx - b.idx);
    });
    return outs;
  }

  function allCategoryNames() {
    var out = [];
    S.presets.forEach(function (p) { if (out.indexOf(p.category) < 0) out.push(p.category); });
    return out.concat(FX_CATS);
  }
  function dirNow() { return S.meta.settings.dir === "out" ? "out" : "in"; }
  function view() { return dirNow() === "out" ? S.outs : S.presets.filter(function (p) { return p.role !== "out"; }); }
  function categories() {
    var out = [];
    view().forEach(function (p) { if (out.indexOf(p.category) < 0) out.push(p.category); });
    return out;
  }
  function isFav(p) { return S.meta.favorites.indexOf(p.id) >= 0; }
  function presetById(id) {
    return S.presets.filter(function (x) { return x.id === id; })[0] || S.outs.filter(function (x) { return x.id === id; })[0];
  }
  function recentList() {
    var v = view();
    return S.meta.recent.map(presetById).filter(function (p) { return !!p && v.indexOf(p) >= 0; });
  }
  function iconFor(name) { return ICON[TAB_ICON[String(name).toLowerCase()] || "folder"]; }

  // ------------------------------------------------------------------ glyphs (each preset gets a small motion icon)
  var ARROW = {
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  function glyphInfo(p) {
    var n = p.name.toLowerCase(), dir = "", unit = "", inner, fx = "";
    ["up", "down", "left", "right"].forEach(function (d) { if (new RegExp("\\b" + d + "\\b").test(n)) dir = d; });
    if (/\bword\b/.test(n)) unit = "w";
    else if (/\bchar(acter)?\b/.test(n)) unit = "c";

    if (dir) inner = ARROW[dir];
    else if (/fade/.test(n)) inner = '<path d="M5 7h14"/><path d="M5 12h14" opacity=".6"/><path d="M5 17h14" opacity=".3"/>';
    else if (/1 by 1|1by1/.test(n)) inner = '<g fill="currentColor" stroke="none"><circle cx="6" cy="12" r="2.4"/><circle cx="12" cy="12" r="2.4" opacity=".6"/><circle cx="18" cy="12" r="2.4" opacity=".3"/></g>';
    else if (/vhs/.test(n)) inner = '<rect x="4" y="7" width="16" height="12" rx="2.4"/><path d="M8.5 3.5L12 7l3.5-3.5"/>';
    else if (/glow/.test(n)) inner = '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>';
    else if (/sweep/.test(n)) inner = '<path d="M5 19L19 5"/><path d="M5 12l7-7M12 19l7-7" opacity=".5"/>';
    else if (/glitch|flicker/.test(n)) inner = '<path d="M13.5 3L6 13.2h5.2L10 21l8-11h-5.3z"/>';
    else if (/bounce/.test(n)) inner = '<circle cx="12" cy="7.5" r="3"/><path d="M5 20c2-3.4 12-3.4 14 0"/>';
    else if (p.pop && /spin/.test(n)) inner = '<path d="M19 12a7 7 0 11-2.1-5"/><path d="M19 4.5V8h-3.5"/>';
    else if (p.pop && /swing/.test(n)) inner = '<path d="M12 3v7"/><path d="M12 10l-5 8h10z"/>';
    else if (p.pop && /drop/.test(n)) inner = '<circle cx="12" cy="8" r="3"/><path d="M12 12v4"/><path d="M6 20h12"/>';
    else if (p.pop && /jelly|elastic/.test(n)) inner = '<rect x="5" y="7" width="14" height="10" rx="4"/><path d="M3 12h2M19 12h2M12 3v2M12 19v2" opacity=".6"/>';
    else if (p.pop && /punch/.test(n)) inner = '<rect x="8" y="8" width="8" height="8" rx="2"/><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3"/>';
    else if (p.pop && /\bpop\b|rise/.test(n)) inner = '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.8 1.8M16.2 16.2L18 18M18 6l-1.8 1.8M7.8 16.2L6 18"/>';
    else if (p.type === "any") inner = '<path d="M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z"/><path d="M19 15v5M16.5 17.5h5"/>';
    else inner = '<path d="M4 18l4.6-12L13 18M5.8 14h5.6M15.2 18l2.8-7 2.8 7M16.2 16h3.6"/>';

    if (!dir) {
      if (/bounce/.test(n)) fx = "bounce";
      else if (p.type === "any" || /glitch|flicker|vhs|glow|sweep/.test(n)) fx = "fx";
    }
    return { svg: svg(inner), dir: dir, unit: unit, fx: fx };
  }

  function subtitle(p) {
    if (p.type === "any") return "Any layer";
    var n = p.name.toLowerCase();
    if (/\bword\b/.test(n)) return "By word";
    if (/\bchar(acter)?\b/.test(n)) return "By character";
    return "Text";
  }

  // ------------------------------------------------------------------ rendering: pill / dock
  function renderPill() {
    var pill = $("#selPill"), txt = $("#selText"), s = S.sel, cls = "pill", msg;
    if (!S.connected) { cls += " warn"; msg = "Open this panel inside After Effects"; }
    else if (S.phase === "connecting") { cls += " busy"; msg = "Connecting to After Effects…"; }
    else if (S.phase === "lost") { cls += " err"; msg = "Can’t reach After Effects · click to retry"; }
    else if (!S.meta.settings.live && !S.selKnown) { msg = "Auto-detect is off · click to check selection"; }
    else if (!s.hasComp) { cls += " warn"; msg = "No composition open"; }
    else if (s.texts > 0) {
      cls += " ok";
      msg = "“" + (s.name || "Text layer") + "”" + (s.texts > 1 ? "  +" + (s.texts - 1) : "");
    }
    else if (s.total > 0) { cls += " warn"; msg = s.total + " layer" + (s.total > 1 ? "s" : "") + " selected · no text"; }
    else { msg = "Select a layer in your comp"; }
    pill.className = cls;
    txt.textContent = msg;
    pill.title = S.phase === "lost" && S.reachErr ? S.reachErr : "";
  }

  function applyState() {
    if (isFx()) return fxApplyState();
    var p = S.current, s = S.sel;
    if (!p) return { ok: false, hint: "Pick one from the list" };
    if (!S.connected) return { ok: false, hint: "Open this panel inside After Effects" };
    if (S.phase !== "ready") return { ok: false, hint: S.phase === "connecting" ? "Connecting…" : "Not connected · click the status above" };
    var tail = p.dir === "out" ? " · out" : "";
    if (!S.meta.settings.live) return { ok: true, hint: (p.type === "text" ? "→ selected text layers" : "→ selected layers") + tail };
    if (!s.hasComp) return { ok: false, hint: "Open a composition first" };
    if (p.type === "text") {
      if (s.texts === 0) return { ok: false, hint: "Select a text layer to apply" };
      return { ok: true, hint: "→ " + s.texts + " text layer" + (s.texts > 1 ? "s" : "") + tail };
    }
    if (s.total === 0) return { ok: false, hint: "Select a layer to apply" };
    return { ok: true, hint: "→ " + s.total + " layer" + (s.total > 1 ? "s" : "") + tail };
  }

  function fxApplyState() {
    var f = S.fxCurrent, s = S.sel, st = S.meta.settings;
    if (!f) return { ok: false, hint: "Pick an effect from the list" };
    if (!S.connected) return { ok: false, hint: "Open this panel inside After Effects" };
    if (S.phase !== "ready") return { ok: false, hint: S.phase === "connecting" ? "Connecting…" : "Not connected · click the status above" };
    if (f.kind === "ramp") {
      if (!st.live) return { ok: true, hint: "→ speed ramp at the playhead" };
      if (!s.hasComp) return { ok: false, hint: "Open a composition first" };
      if (s.total === 0) return { ok: false, hint: "Select a video layer first" };
      return { ok: true, hint: "→ speed ramp at the playhead" + (s.total > 1 ? " · " + s.total + " layers" : "") };
    }
    if (f.kind === "glass") {
      if (st.live && !s.hasComp) return { ok: false, hint: "Open a composition first" };
      return { ok: true, hint: "→ glass rig above your selection" };
    }
    if (f.kind === "pixscan") {
      var pm = f.p && f.p.mode;
      if (st.live && !s.hasComp) return { ok: false, hint: "Open a composition first" };
      if (pm === "scan") return { ok: true, hint: "→ scan line at the playhead" };
      if (st.live && s.total === 0) return { ok: false, hint: "Select the layer to " + (pm === "in" ? "reveal" : "wipe away") };
      return { ok: true, hint: "→ pixel " + (pm === "in" ? "reveal" : "wipe") + " on your layer" };
    }
    var span = f.p && f.p.span, where = span === "cut" ? " at the cut" : span === "hit" ? " at the playhead" : " over your selection";
    if (st.fxTarget === "adj" || fxNeedsAdj(f)) {
      if (st.live && !s.hasComp) return { ok: false, hint: "Open a composition first" };
      if (span === "cut") where = st.live && s.total >= 2 ? " on your cut" : " at the playhead";
      else if (span === "hit") where = " at the playhead";
      else where = " over your selection";
      return { ok: true, hint: "→ adjustment layer" + where };
    }
    if (!st.live) return { ok: true, hint: "→ selected layers" };
    if (!s.hasComp) return { ok: false, hint: "Open a composition first" };
    if (s.total === 0) return { ok: false, hint: "Select a layer to apply" };
    return { ok: true, hint: "→ " + s.total + " layer" + (s.total > 1 ? "s" : "") + (span === "cut" ? " · keys at the cut" : span === "hit" ? " · keys at the playhead" : "") };
  }

  function renderStudioDock() {
    var d = Studio.dock(), md = MODES[modeNow()], b = $("#btnApply");
    if (!d) d = { name: md.label, hint: "", ok: false };
    $("#dockName").textContent = d.name;
    var hint = $("#dockHint");
    hint.textContent = S.hintOverride || d.hint || "";
    hint.className = "dock-hint" + (S.hintOverride ? " err" : "");
    var g = $("#dockGlyph");
    g.style.cssText = colorVars(md.rgb) + ";background:var(--c-soft);color:var(--c)";
    g.innerHTML = ICON[md.icon];
    if (!b.classList.contains("busy") && !b.classList.contains("done")) { b.disabled = !d.ok; setApplyLabel(d.label || "Apply"); }
  }

  async function applyStudio() {
    var b = $("#btnApply"), d = Studio.dock();
    if (S.applying) return;
    if (d && !d.ok) { toast(d.hint || "Not ready yet", true); return; }
    S.applying = true;
    b.classList.add("busy");
    var okFlag = false, label = "Added";
    try {
      var r = await Studio.apply();
      if (r && r.ok) {
        okFlag = true; label = r.done || "Added";
        toast(r.msg || "Done");
        if (r.warn) S.hintOverride = "Note: " + r.warn;
      } else {
        var msg = (r && r.msg) || "Could not do that";
        toast(msg, true); S.hintOverride = msg;
        if (/No response|EvalScript|Not running/i.test(msg)) { S.phase = "lost"; renderPill(); }
      }
    } catch (e) {
      toast(String(e && e.message || e), true);
    } finally {
      S.applying = false;
      b.classList.remove("busy");
      if (okFlag) {
        b.classList.add("done");
        setApplyLabel(label);
        await sleep(1100);
        b.classList.remove("done");
      }
      renderDock();
    }
  }

  function renderDock() {
    if (isStudio()) return renderStudioDock();
    if (isFx()) return renderFxDock();
    var p = S.current, st = applyState();
    $("#dockName").textContent = p ? p.name : "Choose a preset";
    var hint = $("#dockHint");
    hint.textContent = S.hintOverride || st.hint;
    hint.className = "dock-hint" + (S.hintOverride ? " err" : "");
    var g = $("#dockGlyph");
    if (p) { g.style.cssText = colorVars(catRGB(p.category)) + ";background:var(--c-soft);color:var(--c)"; g.innerHTML = glyphInfo(p).svg; }
    else { g.style.cssText = ""; g.innerHTML = ICON.sparkle; }
    var b = $("#btnApply");
    if (!b.classList.contains("busy") && !b.classList.contains("done")) b.disabled = !st.ok;
  }

  function renderFxDock() {
    var f = S.fxCurrent, st = fxApplyState();
    $("#dockName").textContent = f ? f.name : "Choose an effect";
    var hint = $("#dockHint");
    hint.textContent = S.hintOverride || st.hint;
    hint.className = "dock-hint" + (S.hintOverride ? " err" : "");
    var g = $("#dockGlyph");
    if (f) { g.style.cssText = colorVars(catRGB(f.cat)) + ";background:var(--c-soft);color:var(--c)"; g.innerHTML = fxGlyph(f); }
    else { g.style.cssText = ""; g.innerHTML = ICON.bolt; }
    var b = $("#btnApply");
    if (!b.classList.contains("busy") && !b.classList.contains("done")) b.disabled = !st.ok;
  }

  // ------------------------------------------------------------------ rendering: tabs
  function tabItems() {
    if (isFx()) {
      var fi = [{ key: "All", icon: ICON.grid, count: FX.length }];
      FX_CATS.forEach(function (c) {
        fi.push({ key: c, icon: iconFor(c), count: FX.filter(function (f) { return f.cat === c; }).length });
      });
      return fi;
    }
    var items = [{ key: "All", icon: ICON.grid, count: view().length }];
    var rc = recentList().length;
    if (rc) items.push({ key: "Recent", icon: ICON.clock, count: rc });
    var fc = view().filter(isFav).length;
    if (fc) items.push({ key: "Favorites", icon: ICON.star, count: fc });
    categories().forEach(function (c) {
      items.push({ key: c, icon: iconFor(c), count: view().filter(function (p) { return p.category === c; }).length });
    });
    return items;
  }

  function renderTabs() {
    var box = $("#tabs");
    $$(".tab", box).forEach(function (t) { box.removeChild(t); });
    var items = tabItems();
    if (!items.some(function (i) { return i.key === S.cat; })) S.cat = "All";
    items.forEach(function (it) {
      var b = h("button", { class: "tab" + (S.cat === it.key ? " on" : ""), "data-cat": it.key, type: "button", style: colorVars(tabRGB(it.key)) });
      b.innerHTML = it.icon + "<span>" + esc(it.key) + '</span><span class="n">' + it.count + "</span>";
      box.appendChild(b);
    });
    moveIndicator();
  }

  function moveIndicator(noScroll) {
    var box = $("#tabs"), ind = $("#tabInd"), on = box.querySelector(".tab.on");
    if (!on) { ind.style.opacity = "0"; return; }
    ind.style.opacity = "1";
    ind.style.width = on.offsetWidth + "px";
    ind.style.transform = "translateX(" + on.offsetLeft + "px)";
    paintEl(ind, tabRGB(on.getAttribute("data-cat")));
    if (noScroll !== true) {
      var need = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2;
      if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: Math.max(0, need), behavior: "smooth" });
    }
    updateRailFade();
  }

  function updateRailFade() {
    var box = $("#tabs");
    var more = box.scrollWidth - box.clientWidth - box.scrollLeft > 6;
    var less = box.scrollLeft > 6;
    box.classList.toggle("fade-r", more);
    box.classList.toggle("fade-l", less);
  }

  // ------------------------------------------------------------------ rendering: list
  function filtered() {
    var q = S.query.trim().toLowerCase();
    var base = S.cat === "Recent" ? recentList() : view();
    return base.filter(function (p) {
      if (S.cat === "Favorites" && !isFav(p)) return false;
      if (S.cat !== "All" && S.cat !== "Favorites" && S.cat !== "Recent" && p.category !== S.cat) return false;
      if (q && (p.name + " " + p.category).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }

  function cardEl(p, i) {
    var g = glyphInfo(p), fav = isFav(p), rgb = catRGB(p.category);
    var el = h("div", {
      class: "card" + (S.current && S.current.id === p.id ? " sel" : "") + (fav ? " fav" : ""),
      "data-id": p.id, "data-cat": p.category, tabindex: "0", role: "button", "aria-label": p.name + ", " + subtitle(p),
      style: colorVars(rgb) + ";--i:" + i
    });
    var unit = g.unit === "w" ? '<span class="u w"><i></i><i></i></span>' : g.unit === "c" ? '<span class="u"><i></i><i></i><i></i></span>' : "";
    el.innerHTML =
      '<div class="glyph"' + (g.dir ? ' data-dir="' + g.dir + '"' : "") + (g.fx ? ' data-fx="' + g.fx + '"' : "") + ">" + g.svg + unit + "</div>" +
      '<div class="card-text"><div class="card-name">' + esc(p.name) + '</div><div class="card-sub">' + esc(subtitle(p)) + "</div></div>" +
      '<div class="card-actions"><button type="button" tabindex="-1" class="fav-btn' + (fav ? " on" : "") + '" title="Favorite" aria-label="Favorite">' + ICON.star + "</button>" +
      (p.source === "user" ? '<button type="button" tabindex="-1" class="del-btn" title="Remove from library" aria-label="Remove from library">' + ICON.trash + "</button>" : "") + "</div>";
    return el;
  }

  function fxCardEl(f, i) {
    var el = h("div", {
      class: "card" + (S.fxCurrent && S.fxCurrent.id === f.id ? " sel" : ""),
      "data-id": f.id, "data-cat": f.cat, tabindex: "0", role: "button", "aria-label": f.name + ", " + f.sub,
      style: colorVars(catRGB(f.cat)) + ";--i:" + i
    });
    el.innerHTML = '<div class="glyph" data-fx="fx">' + fxGlyph(f) + "</div>" +
      '<div class="card-text"><div class="card-name">' + esc(f.name) + '</div><div class="card-sub">' + esc(f.sub) + "</div></div>";
    return el;
  }

  function renderFxList(keepScroll, still) {
    var box = $("#list"), top = box.scrollTop;
    box.classList.toggle("still", !!still);
    box.setAttribute("data-density", S.meta.settings.density);
    box.innerHTML = "";
    var cats = S.cat === "All" ? FX_CATS : [S.cat], i = 0;
    cats.forEach(function (c) {
      var items = FX.filter(function (f) { return f.cat === c; });
      if (!items.length) return;
      var sec = h("section", { class: "section" });
      if (cats.length > 1) sec.appendChild(h("div", { class: "section-head", "data-cat": c, style: colorVars(catRGB(c)), html: "<i></i>" + esc(c) + " <b>" + items.length + "</b>" }));
      var grid = h("div", { class: "grid" });
      items.forEach(function (f) { grid.appendChild(fxCardEl(f, Math.min(i++, 22))); });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    box.style.scrollBehavior = "auto";
    box.scrollTop = keepScroll ? top : 0;
    box.style.scrollBehavior = "";
  }

  function renderList(keepScroll, still) {
    if (isFx()) return renderFxList(keepScroll, still);
    var box = $("#list"), top = box.scrollTop;
    box.classList.toggle("still", !!still);
    box.setAttribute("data-density", S.meta.settings.density);
    box.innerHTML = "";
    var list = filtered();
    if (!list.length) {
      box.appendChild(h("div", { class: "empty", html: view().length
        ? (S.cat === "Favorites" ? "No favorites yet.<br>Tap the star on any preset." : S.cat === "Recent" ? "Nothing used yet.<br>Presets you apply show up here." : "No presets match.")
        : "Your library is empty.<br>Tap <b>Add</b> to import .ffx presets." }));
      return;
    }
    var groups = [], map = {};
    if (S.cat === "Recent") {
      groups.push({ cat: "Recent", items: list });
    } else {
      list.forEach(function (p) {
        if (!map[p.category]) { map[p.category] = { cat: p.category, items: [] }; groups.push(map[p.category]); }
        map[p.category].items.push(p);
      });
    }
    var heads = groups.length > 1 && S.cat !== "Recent", i = 0;
    groups.forEach(function (gr) {
      var sec = h("section", { class: "section" });
      if (heads) {
        sec.appendChild(h("div", { class: "section-head", "data-cat": gr.cat, style: colorVars(catRGB(gr.cat)), html: "<i></i>" + esc(gr.cat) + " <b>" + gr.items.length + "</b>" }));
      }
      var grid = h("div", { class: "grid" });
      gr.items.forEach(function (p) { grid.appendChild(cardEl(p, Math.min(i++, 22))); });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
    box.style.scrollBehavior = "auto";
    box.scrollTop = keepScroll ? top : 0;
    box.style.scrollBehavior = "";
  }

  // ------------------------------------------------------------------ select / apply
  function selectPreset(p) {
    S.current = p;
    S.hintOverride = "";
    $$(".card").forEach(function (c) { c.classList.toggle("sel", c.getAttribute("data-id") === p.id); });
    renderDock();
  }

  function setApplyLabel(t) { $("#btnApply .apply-label").textContent = t; }

  function recordRecent(p) {
    var before = recentList().length;
    S.meta.recent = [p.id].concat(S.meta.recent.filter(function (id) { return id !== p.id; })).slice(0, 10);
    saveMetaSoon();
    if (before === 0 || S.cat === "Recent") { renderTabs(); if (S.cat === "Recent") renderList(true, true); }
    else { var n = $(".tab[data-cat=\"Recent\"] .n"); if (n) n.textContent = recentList().length; }
  }

  function fxSelect(f) {
    S.fxCurrent = f;
    S.hintOverride = "";
    $$(".card").forEach(function (c) { c.classList.toggle("sel", c.getAttribute("data-id") === f.id); });
    renderDock();
    renderFxControls();
    Preview.setFx(f, true);
  }

  async function applyFx() {
    var st = applyState(), f = S.fxCurrent, b = $("#btnApply"), cfg = S.meta.settings;
    if (!f || S.applying) return;
    if (!st.ok) { toast(st.hint, true); return; }
    S.applying = true;
    b.classList.add("busy");
    var okFlag = false;
    try {
      var r = await cep.call("ops_fx", { name: f.name, kind: f.kind, p: HS.retime(f, cfg.fxLen / 100).p, target: cfg.fxTarget, intensity: cfg.fxInt / 100 });
      S.lastFx = JSON.stringify(r);
      if (r.ok) {
        okFlag = true;
        var w = r.warnings || [];
        var tip = "";
        if (r.markers) tip = r.cutHow === "join" ? " · marker on the cut" : " · marker at the playhead";
        else if (f.kind === "stack" && f.p.span !== "auto" && r.cutT !== undefined && !fxNeedsAdj(f) && cfg.fxTarget === "layers") tip = r.cutHow === "join" ? " · keys on the cut" : " · keys at the playhead";
        toast("Added “" + f.name + "”" + (f.kind === "ramp" && r.layers > 1 ? " to " + r.layers + " layers" : "") + tip + (w.length ? " · " + w.length + " note" + (w.length > 1 ? "s" : "") : ""), false);
        if (w.length) S.hintOverride = "Note: " + w[0];
      } else {
        toast(r.error || "Could not add the effect", true);
        S.hintOverride = r.error || "Could not add the effect";
        if (/No response|EvalScript|Not running/i.test(String(r.error))) { S.phase = "lost"; renderPill(); }
      }
    } finally {
      S.applying = false;
      b.classList.remove("busy");
      if (okFlag) {
        b.classList.add("done");
        setApplyLabel("Added");
        await sleep(1100);
        b.classList.remove("done");
        setApplyLabel("Apply");
      }
      renderDock();
    }
  }

  async function runTool(tool, el) {
    if (el.classList.contains("busy")) return;
    if (!S.connected || S.phase !== "ready") { toast(S.connected ? "Not connected · click the status above" : "Open this panel inside After Effects", true); return; }
    el.classList.add("busy");
    try {
      var r = await cep.call("ops_tool", tool.id);
      if (r.ok) {
        el.classList.add("ok");
        setTimeout(function () { el.classList.remove("ok"); }, 1200);
        toast(r.precomp ? "Pre-composed into “" + r.name + "”" : "Created “" + r.name + "”");
      } else {
        toast(r.error || "Couldn’t do that", true);
        if (/No response|EvalScript|Not running/i.test(String(r.error))) { S.phase = "lost"; renderPill(); }
      }
    } finally { el.classList.remove("busy"); }
  }

  // ------------------------------------------------------------------ Safe Zone: guide pictures laid over the comp
  var SAFE_ZONES = [
    { id: "instagram", label: "Instagram", name: "Instagram Reels", hint: "What the app covers on a Reel", file: "instagram.png", thumb: "instagram-thumb.png" }
  ];

  async function runSafe(z, action, el) {
    if (el.classList.contains("busy")) return;
    if (!S.connected || S.phase !== "ready") { toast(S.connected ? "Not connected · click the status above" : "Open this panel inside After Effects", true); return; }
    el.classList.add("busy");
    try {
      var r = await cep.call("ops_safeZone", action, z.label, P.ext + "/assets/safe-zones/" + z.file);
      if (r.ok) {
        if (action === "remove") { toast(r.removed ? "Safe zone removed from this comp" : "There is no safe zone in this comp"); }
        else {
          el.classList.add("ok");
          setTimeout(function () { el.classList.remove("ok"); }, 1400);
          toast((r.existed ? "Safe zone refreshed" : "Safe zone added") + (r.ratioOk ? " · locked on top, guide only" : " · this comp isn’t 9:16, so the guide is stretched to fit"));
        }
      } else {
        toast(r.error || "Couldn’t do that", true);
        if (/No response|EvalScript|Not running/i.test(String(r.error))) { S.phase = "lost"; renderPill(); }
      }
    } finally { el.classList.remove("busy"); }
  }

  function renderSafe(box) {
    box.appendChild(h("p", { class: "tools-lead" }, ["Shows what the app draws on top of your video. It is only a guide: visible in the preview, never in the render."]));
    SAFE_ZONES.forEach(function (z, i) {
      var card = h("div", { class: "safe", style: colorVars(MODES.safe.rgb) + ";--i:" + i });
      card.innerHTML = '<button type="button" class="safe-main" title="Add it to the open composition">' +
        '<span class="safe-ph"><img alt="" draggable="false" src="../assets/safe-zones/' + esc(z.thumb) + '"></span>' +
        '<span class="safe-tx"><span class="nm">' + esc(z.name) + '</span><span class="ht">' + esc(z.hint) + '</span>' +
        '<span class="safe-go">Add to this comp</span></span></button>' +
        '<button type="button" class="safe-rm">Remove from this comp</button>';
      card.querySelector(".safe-main").addEventListener("click", function () { runSafe(z, "add", card); });
      card.querySelector(".safe-rm").addEventListener("click", function () { runSafe(z, "remove", card); });
      box.appendChild(card);
    });
    box.appendChild(h("p", { class: "tools-note" }, ["The guide is locked on top. To hide it for a moment, switch off its eye in the timeline."]));
  }

  function renderTools() {
    var box = $("#toolsPanel");
    box.innerHTML = "";
    if (modeNow() === "safe") { renderSafe(box); return; }
    box.appendChild(h("p", { class: "tools-lead" }, ["One click, straight into the open composition."]));
    var grid = h("div", { class: "tools-grid" });
    TOOLS.forEach(function (t, i) {
      var b = h("button", { class: "tool", type: "button", "data-i": String(i), style: colorVars(toolRGB(i)) + ";--i:" + i });
      b.innerHTML = '<span class="ico">' + ICON[t.icon] + '</span><span><span class="nm">' + esc(t.name) + '</span><br><span class="ht">' + esc(t.hint) + "</span></span>";
      b.addEventListener("click", function () { runTool(t, b); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }

  async function applyCurrent() {
    if (isStudio()) return applyStudio();
    if (isFx()) return applyFx();
    var st = applyState(), p = S.current, b = $("#btnApply");
    if (!p || S.applying) return;
    if (!st.ok) { toast(st.hint, true); return; }
    S.applying = true;
    b.classList.add("busy");
    var okFlag = false;
    try {
      var r = p.pop ? await cep.call("ops_pop", { name: p.name, k: p.pop.k, dir: p.dir === "out" ? "out" : "in", start: S.meta.settings.start, center: true })
        : await cep.call("ops_apply", p.file, p.type, S.meta.settings.start, p.asIs ? "outAs" : p.dir === "out" ? "out" : "in");
      S.lastApply = JSON.stringify(r);
      if (r.ok && r.unchanged && r.unchanged === r.applied) {
        var why = "AE ran the preset but nothing new appeared on the layer.";
        toast(why, true);
        S.hintOverride = why;
      } else if (r.ok && (r.dir === "out") && (r.noKeys || r.reverseFailed)) {
        // the preset went onto the layer but could not be moved to the end of it: say so instead of pretending it worked
        var why2 = r.noKeys && !r.reverseFailed ? "Added, but this preset has no keyframes to move, so it still plays at the start. Ctrl/Cmd+Z to undo."
          : "Added, but the Out timing failed: " + (r.outErr || "unknown error") + ". Ctrl/Cmd+Z to undo.";
        toast(why2, true);
        S.hintOverride = why2;
      } else if (r.ok) {
        okFlag = true;
        recordRecent(p);
        var msg = "Applied “" + p.name + "”";
        if (r.applied > 1) msg += " to " + r.applied + " layers";
        if (r.failed) msg += " · " + r.failed + " failed";
        if (r.warnings && r.warnings.length) { msg += " · " + r.warnings.length + " note" + (r.warnings.length > 1 ? "s" : ""); S.hintOverride = "Note: " + r.warnings[0]; }
        if (r.dir === "out" && r.outFrom >= 0) msg += " · plays at " + (Math.round(r.outFrom * 10) / 10) + "–" + (Math.round(r.outTo * 10) / 10) + " s";
        toast(msg);
      } else {
        toast(r.error || "Could not apply", true);
        S.hintOverride = r.error || "Could not apply";
        if (/No response|EvalScript|Not running/i.test(String(r.error))) { S.phase = "lost"; renderPill(); }
      }
    } finally {
      S.applying = false;
      b.classList.remove("busy");
      if (okFlag) {
        b.classList.add("done");
        setApplyLabel("Applied");
        await sleep(1100);
        b.classList.remove("done");
        setApplyLabel("Apply");
      }
      renderDock();
    }
  }

  // ------------------------------------------------------------------ FX preview (a sketch, not a render: see stage.js)
  // the preview photo lives next to the panel's settings so it survives restarts
  function photoFile() { return path.join(path.dirname(P.meta), "preview-photo.txt"); }
  function loadPhotoData() { try { return fs.readFileSync(photoFile(), "utf8"); } catch (e) { return ""; } }
  function savePhoto(dataUrl) {
    try { if (dataUrl) fs.writeFileSync(photoFile(), dataUrl); else if (exists(photoFile())) fs.unlinkSync(photoFile()); } catch (e) {}
    applyPhoto(dataUrl);
  }
  function applyPhoto(dataUrl) {
    if (!dataUrl) { Stage.setPhoto(null); return; }
    var im = new Image();
    im.onload = function () { Stage.setPhoto(im); };
    im.onerror = function () { Stage.setPhoto(null); };
    im.src = dataUrl;
  }
  var Preview = (function () {
    var locked = null, hover = null, slow = false, ready = false, awake = true;
    // the preview only runs while the FX tab is showing and the pointer has been over the panel lately,
    // so it never competes with After Effects for the CPU
    function wanted() { return isFx() && !document.hidden && S.hover && Date.now() - S.lastMove < 15000; }
    function sync() { var w = wanted(); if (ready && w !== awake) { awake = w; Stage.setActive(w); } }
    function accentHex() { return rgbToHex(S.look.accent); }
    function show(f) {
      if (!ready || !f) return;
      Stage.setFx(HS.retime(f, S.meta.settings.fxLen / 100));
      $("#stageName").textContent = f.name;
      $("#stageCap").textContent = f.sub || "";
      paintChain(chainOf(f));
    }
    // as many effect names as fit on one line, then "+N" (the full list is in its tooltip)
    function paintChain(chain) {
      var box = $("#fxChain"), total = chain.length, k = total;
      function build(shown) {
        var i, html = "";
        for (i = 0; i < shown; i++) html += "<span>" + esc(chain[i]) + "</span>";
        if (shown < total) html += '<span class="more" title="' + esc(chain.slice(shown).join(", ")) + '">+' + (total - shown) + "</span>";
        box.innerHTML = html;
      }
      build(k);
      while (k > 1 && box.scrollWidth > box.clientWidth + 1) { k--; build(k); }
    }
    function tint() { if (ready) Stage.setAccent(accentHex()); }
    return {
      init: function () {
        var cv = $("#stageCv");
        try { Stage.init(cv); ready = true; } catch (e) { ready = false; $("#stage").classList.add("off"); return; }
        tint();
        $("#stageSlow").addEventListener("click", function () {
          slow = !slow; Stage.setSlow(slow);
          this.classList.toggle("on", slow); this.setAttribute("aria-pressed", slow ? "true" : "false");
        });
        document.addEventListener("visibilitychange", sync);
        document.addEventListener("mousemove", function () { S.lastMove = Date.now(); S.hover = true; sync(); }, true);
        setInterval(sync, 1000);
      },
      setFx: function (f, lock) {
        if (lock) { locked = f; hover = null; } else { hover = f; }
        show(hover || locked);
      },
      refresh: function () { show(hover || locked); },
      hovering: function () { return hover; },
      clearHover: function () { if (hover) { hover = null; show(locked); } },
      tint: tint,
      power: function (k) { if (ready) Stage.setPower(k); },
      start: function () { if (ready) { awake = true; Stage.setActive(true); } },
      stop: function () { if (ready) { awake = false; Stage.setActive(false); } }
    };
  })();

  // ------------------------------------------------------------------ modes: Presets / FX / Tools
  function renderModeBar() {
    var m = modeNow(), bar = $("#modeBar"), tabs = S.meta.settings.tabs, sig = tabs.join(",");
    if (bar.getAttribute("data-sig") !== sig) {
      bar.innerHTML = "";
      tabs.forEach(function (k) {
        var d = MODES[k], b = h("button", { type: "button", role: "tab", "data-mode": k, title: d.label });
        b.innerHTML = ICON[d.icon] + "<span>" + esc(d.label) + "</span>";
        b.addEventListener("click", function () { setMode(k); });
        bar.appendChild(b);
      });
      bar.setAttribute("data-sig", sig);
    }
    $$("#modeBar button").forEach(function (b) {
      var k = b.getAttribute("data-mode");
      b.classList.toggle("on", k === m);
      b.setAttribute("aria-selected", k === m ? "true" : "false");
    });
    var on = $("#modeBar button.on");
    if (on && on.scrollIntoView) {
      // keep the open section in view; the label grows after a moment, so look again then
      var keep = function () {
        var l = on.offsetLeft, r = l + on.offsetWidth;
        if (l < bar.scrollLeft + 6) bar.scrollLeft = Math.max(0, l - 6);
        else if (r > bar.scrollLeft + bar.clientWidth - 6) bar.scrollLeft = r - bar.clientWidth + 6;
        updateModeFade();
      };
      keep(); setTimeout(keep, 330);
    }
  }
  function updateModeFade() {
    var bar = $("#modeBar"), w = bar.parentNode;
    if (!w) return;
    w.classList.toggle("fade-l", bar.scrollLeft > 4);
    w.classList.toggle("fade-r", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
  }

  function syncModeUI() {
    var m = modeNow();
    $("#app").setAttribute("data-mode", m);
    $("#app").setAttribute("data-group", isStudio() ? "studio" : m);
    renderModeBar();
    if (m === "fx") Preview.start(); else Preview.stop();
    Studio.setMode(isStudio() ? m : "");
  }

  function setMode(m) {
    var st = S.meta.settings;
    if (st.mode === m || !MODES[m]) return;
    S.catByMode[st.mode] = S.cat;
    st.mode = m; saveMeta();
    S.cat = S.catByMode[m] || "All";
    S.hintOverride = "";
    syncModeUI();
    if (m === "safe" || m === "tools") renderTools();
    if (m === "presets" || m === "fx") { renderTabs(); renderList(false); }
    renderDock();
  }

  // ---- choose and arrange the sections
  function openTabsSheet() {
    openSheet(function (sh, close) {
      var st = S.meta.settings, list = h("div", { class: "tabman" });
      function order() {
        // visible ones first (in their order), then the hidden ones in the default order
        var vis = st.tabs.slice(), hid = MODE_ORDER.filter(function (k) { return vis.indexOf(k) < 0; });
        return { vis: vis, all: vis.concat(hid) };
      }
      function commit(vis) {
        st.tabs = cleanTabs(vis);
        if (st.tabs.indexOf(st.mode) < 0) { setMode(st.tabs[0]); }
        saveMeta(); renderModeBar(); paint();
      }
      function paint() {
        list.innerHTML = "";
        var o = order();
        o.all.forEach(function (k, i) {
          var d = MODES[k], on = o.vis.indexOf(k) >= 0, vi = o.vis.indexOf(k);
          var row = h("div", { class: "tmrow" + (on ? "" : " off"), style: colorVars(d.rgb) });
          var ico = h("span", { class: "tmico", html: ICON[d.icon] }), nm = h("span", { class: "tmname" }, [d.label]);
          var up = h("button", { class: "tmbtn", type: "button", title: "Move up", html: ICON.up }), dn = h("button", { class: "tmbtn", type: "button", title: "Move down", html: ICON.down });
          up.disabled = !on || vi === 0; dn.disabled = !on || vi === o.vis.length - 1;
          up.addEventListener("click", function () { var v = o.vis.slice(); v.splice(vi, 1); v.splice(vi - 1, 0, k); commit(v); });
          dn.addEventListener("click", function () { var v = o.vis.slice(); v.splice(vi, 1); v.splice(vi + 1, 0, k); commit(v); });
          var sw = h("button", { class: "switch" + (on ? " on" : ""), type: "button", role: "switch", "aria-checked": on ? "true" : "false", "aria-label": "Show " + d.label });
          sw.addEventListener("click", function () {
            if (on && o.vis.length <= 1) { toast("Keep at least one section", true); return; }
            commit(on ? o.vis.filter(function (x) { return x !== k; }) : o.vis.concat([k]));
          });
          [ico, nm, up, dn, sw].forEach(function (x) { row.appendChild(x); });
          list.appendChild(row);
        });
      }
      var reset = h("button", { class: "btn small ghost", type: "button" }, ["Reset"]);
      reset.addEventListener("click", function () { commit(MODE_ORDER.slice()); toast("All sections back in the usual order"); });
      var done = h("button", { class: "btn small primary", type: "button" }, ["Done"]);
      done.addEventListener("click", close);
      sh.appendChild(h("div", { class: "sheet-head" }, [h("h2", {}, ["Sections"]), h("div", { class: "head-actions" }, [reset, done])]));
      sh.appendChild(h("p", { class: "hint" }, ["Switch off what you don't use, and use the arrows to put your favourites first."]));
      sh.appendChild(list);
      paint();
    });
  }

  function renderFxControls() {
    var st = S.meta.settings;
    $$("#fxTarget button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-t") === st.fxTarget); });
    var r = $("#fxInt");
    r.value = String(st.fxInt);
    r.style.setProperty("--p", ((st.fxInt - 25) / 175 * 100) + "%");
    $("#fxIntVal").textContent = (st.fxInt / 100).toFixed(2).replace(/0$/, "") + "×";
    var f = S.fxCurrent, own = !!f && (f.kind === "ramp" || f.kind === "glass" || f.kind === "pixscan" || fxNeedsAdj(f));
    $("#fxTarget").style.display = own ? "none" : "";
    $("#fxIntLbl").textContent = f && f.kind === "ramp" ? "Depth" : "Power";
    var lr = $("#fxLen"), lenOn = HS.stretches(f);
    lr.value = String(st.fxLen);
    lr.style.setProperty("--p", ((st.fxLen - 100) / 300 * 100) + "%");
    $("#fxLenVal").textContent = (st.fxLen / 100).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "×";
    $("#fxLenRow").style.display = lenOn ? "" : "none";
    Preview.power(st.fxInt / 100);
  }

  // ------------------------------------------------------------------ connection + selection
  // The panel talks to After Effects only while it is needed: while the pointer is over the panel (or you click
  // Apply). Polling while you type in a text layer is what triggered AE's "(76 :: 59)" error before.
  var connecting = false, tickTimer = null, kickTimer = null;

  function isActive() { return S.hover && (Date.now() - S.lastMove < 6000); }

  async function connect() {
    if (connecting) return false;
    connecting = true;
    try {
      var r = await cep.connect(VERSION);
      if (r.ok) { S.phase = "ready"; S.reachErr = ""; return true; }
      S.reachErr = String(r.error || "") + (cep.loadLog().length ? "  [" + cep.loadLog().join(" | ") + "]" : "");
      return false;
    } finally { connecting = false; }
  }

  async function poll() {
    if (document.hidden || S.pollBusy || S.applying || !S.connected || S.phase !== "ready") return;
    S.pollBusy = true;
    try {
      var r = await cep.call("ops_selection");
      var before = JSON.stringify([S.sel, S.phase]);
      if (r.ok) { S.sel = r; S.selKnown = true; }
      else if (/No response|EvalScript|Not running/i.test(String(r.error))) { S.sel = emptySel; S.phase = "lost"; S.reachErr = String(r.error); }
      else { S.sel = emptySel; S.selKnown = true; }
      if (before !== JSON.stringify([S.sel, S.phase])) { S.hintOverride = ""; renderPill(); renderDock(); }
    } finally { S.pollBusy = false; }
  }

  async function refreshNow() {
    var pill = $("#selPill");
    pill.classList.add("spin");
    setTimeout(function () { pill.classList.remove("spin"); }, 500);
    if (S.phase !== "ready") {
      S.phase = "connecting"; S.started = Date.now(); renderPill(); renderDock();
      var ok = await connect();
      if (!ok) { S.phase = "lost"; renderPill(); renderDock(); return; }
      S.phase = "ready";
    }
    await poll();
    renderPill(); renderDock();
  }

  // When panel was opened while AE was still starting, its channel to AE can stay dead until the panel is reopened.
  // Reloading the page does the same thing by itself (at most 3 times), so nobody has to close and reopen it.
  var notReadySince = 0;
  function maybeSelfHeal() {
    if (S.phase === "ready") { notReadySince = 0; try { sessionStorage.setItem("hs.reloads", "0"); } catch (e) {} return; }
    if (!cep.available) return;
    if (cep.outstanding() > 0) { notReadySince = 0; return; }   // AE still owes us an answer: reloading would not help
    if (!notReadySince) notReadySince = Date.now();
    if (Date.now() - notReadySince < 10000) return;
    var n = 0;
    try { n = Number(sessionStorage.getItem("hs.reloads") || "0"); } catch (e) {}
    if (n >= 3) return;
    try { sessionStorage.setItem("hs.reloads", String(n + 1)); } catch (e) { return; }
    location.reload();
  }

  async function tick() {
    clearTimeout(tickTimer);
    var delay = 1000;
    try {
      maybeSelfHeal();
      if (S.phase !== "ready") {
        var ok = await connect();
        if (ok) { renderPill(); renderDock(); await poll(); }
        else {
          // keep trying quietly; only call it "lost" after 20 s of silence at startup
          if (S.phase === "connecting" && Date.now() - S.started > 20000) S.phase = "lost";
          renderPill(); renderDock();
          delay = Date.now() - S.started < 20000 ? 900 : 2500;
        }
      } else if (S.meta.settings.live && isActive()) {
        await poll();
        delay = 700;
      }
    } catch (e) { delay = 2000; }
    tickTimer = setTimeout(tick, delay);
  }

  function kick() {
    if (!S.connected || S.phase !== "ready" || !S.meta.settings.live) return;
    clearTimeout(kickTimer);
    kickTimer = setTimeout(function () { if (isActive()) poll(); }, 90);
  }

  function wireHover() {
    document.addEventListener("mousemove", function () {
      var was = isActive();
      S.lastMove = Date.now(); S.hover = true;
      if (!was) kick();
    }, true);
    document.documentElement.addEventListener("mouseleave", function () { S.hover = false; });
    window.addEventListener("focus", function () { S.hover = true; S.lastMove = Date.now(); kick(); });
    $("#selPill").addEventListener("click", refreshNow);
  }

  // ------------------------------------------------------------------ sheets
  var sheetClose = null;

  function openSheet(build, opts) {
    opts = opts || {};
    if (sheetClose) sheetClose(true);
    var root = $("#sheetRoot"), closed = false;
    var ov = h("div", { class: "overlay" + (opts.live ? " live" : "") }), sh = h("div", { class: "sheet" + (opts.live ? " live" : "") });
    ov.appendChild(sh);
    function close(instant) {
      if (closed) return;
      closed = true; sheetClose = null;
      document.body.classList.remove("sheet-live");
      if (opts.onClose) opts.onClose();
      if (instant === true) { if (ov.parentNode) ov.parentNode.removeChild(ov); return; }
      ov.classList.add("out");
      setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 190);
    }
    sheetClose = close;
    document.body.classList.toggle("sheet-live", !!opts.live);
    if (!opts.live) ov.addEventListener("mousedown", function (e) { if (e.target === ov) close(); });
    build(sh, close);
    root.appendChild(ov);
  }

  function segControl(options, value, onChange) {
    var box = h("div", { class: "seg2" });
    options.forEach(function (o) {
      var b = h("button", { class: value === o[0] ? "on" : "", type: "button" }, [o[1]]);
      b.addEventListener("click", function () {
        $$("button", box).forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        onChange(o[0]);
      });
      box.appendChild(b);
    });
    return box;
  }

  function sanitizeName(s) { return String(s).replace(/[\\\/:*?"<>|]/g, "").replace(/^\.+/, "").trim(); }

  function openAddSheet(files) {
    var ffx = files.filter(function (f) { return f && f.path && /\.ffx$/i.test(f.name); });
    if (!ffx.length) { toast("Only .ffx animation presets can be added.", true); return; }
    var userCats = [];
    S.presets.forEach(function (p) { if (p.source === "user" && userCats.indexOf(p.category) < 0) userCats.push(p.category); });
    var state = { type: "text", role: "in" };

    openSheet(function (sh, close) {
      sh.appendChild(h("h2", {}, ["Add presets"]));
      sh.appendChild(h("p", { class: "sub" }, [ffx.length + " file" + (ffx.length > 1 ? "s" : "") + " ready to import"]));
      var list = h("div", { class: "filelist" });
      ffx.forEach(function (f) { list.appendChild(h("div", {}, [f.name])); });
      sh.appendChild(list);

      var catInput = h("input", { type: "text", value: userCats[0] || "My Presets", list: "catList", placeholder: "My Presets" });
      var dl = h("datalist", { id: "catList" });
      userCats.forEach(function (c) { dl.appendChild(h("option", { value: c })); });
      sh.appendChild(h("div", { class: "field" }, [h("label", {}, ["Category"]), catInput, dl]));
      sh.appendChild(h("div", { class: "field" }, [
        h("label", {}, ["Works on"]),
        segControl([["text", "Text layers"], ["any", "Any layer"]], state.type, function (v) { state.type = v; })
      ]));
      sh.appendChild(h("div", { class: "field" }, [
        h("label", {}, ["Plays as"]),
        segControl([["in", "In animation"], ["out", "Out animation"]], state.role, function (v) { state.role = v; }),
        h("div", { class: "d", style: "font-size:11.5px;color:var(--text-2)" }, ["In presets also get a reversed Out version automatically."])
      ]));

      var add = h("button", { class: "btn primary", type: "button" }, ["Add to library"]);
      add.addEventListener("click", function () {
        var cat = sanitizeName(catInput.value) || "My Presets";
        close();
        commitAdd(ffx, cat, state.type, state.role);
      });
      var cancel = h("button", { class: "btn", type: "button" }, ["Cancel"]);
      cancel.addEventListener("click", close);
      sh.appendChild(h("div", { class: "btn-row" }, [cancel, add]));
    });
  }

  function uniqueFile(dir, name) {
    if (!exists(path.join(dir, name))) return name;
    var base = name.replace(/\.ffx$/i, ""), n = 2;
    while (exists(path.join(dir, base + " " + n + ".ffx"))) n++;
    return base + " " + n + ".ffx";
  }

  function commitAdd(files, cat, type, role) {
    var added = [], failed = 0, dir = path.join(P.lib, cat);
    try { mkdirp(dir); } catch (e) { toast("Can’t create the library folder.", true); return; }
    files.forEach(function (f) {
      try {
        var fn = uniqueFile(dir, sanitizeName(f.name) || "preset.ffx");
        fs.copyFileSync(f.path, path.join(dir, fn));
        var id = "user/" + cat + "/" + fn;
        S.meta.types[id] = type;
        if (role === "out") S.meta.roles[id] = "out"; else delete S.meta.roles[id];
        added.push(id);
      } catch (e) { failed++; }
    });
    saveMeta();
    scanAll();
    if (modeNow() !== "presets") setMode("presets");
    S.cat = cat; S.query = ""; $("#search").value = "";
    if (role === "out" && dirNow() !== "out") { S.meta.settings.dir = "out"; renderDirSeg(); }
    else if (role !== "out" && dirNow() === "out" && type !== "text") { S.meta.settings.dir = "in"; renderDirSeg(); }
    renderTabs(); renderList(false);
    if (added.length) {
      toast("Added " + added.length + " preset" + (added.length > 1 ? "s" : "") + (failed ? " · " + failed + " failed" : ""));
      var first = presetById(added[0] + (dirNow() === "out" ? "#out" : "")) || presetById(added[0]);
      if (first) selectPreset(first);
    } else toast("Couldn’t add the files.", true);
  }

  function openRemoveSheet(p) {
    openSheet(function (sh, close) {
      sh.appendChild(h("h2", {}, ["Remove “" + p.name + "”?"]));
      sh.appendChild(h("p", { class: "sub" }, ["This deletes the preset from your Hydra Studio library. The original file you imported isn’t touched."]));
      var del = h("button", { class: "btn danger", type: "button" }, ["Remove"]);
      del.addEventListener("click", function () {
        close();
        try { fs.unlinkSync(p.file); } catch (e) {}
        delete S.meta.types[p.id]; delete S.meta.roles[p.id];
        function gone(id) { return id === p.id || id === p.id + "#out"; }
        S.meta.favorites = S.meta.favorites.filter(function (id) { return !gone(id); });
        S.meta.recent = S.meta.recent.filter(function (id) { return !gone(id); });
        saveMeta();
        if (S.current && gone(S.current.id)) S.current = null;
        scanAll(); renderTabs(); renderList(true, true); renderDock();
        toast("Removed");
      });
      var cancel = h("button", { class: "btn", type: "button" }, ["Cancel"]);
      cancel.addEventListener("click", close);
      sh.appendChild(h("div", { class: "btn-row" }, [cancel, del]));
    });
  }

  function switchRow(title, desc, on, onChange) {
    var sw = h("button", { class: "switch" + (on ? " on" : ""), type: "button", role: "switch", "aria-checked": on ? "true" : "false" });
    sw.addEventListener("click", function () {
      var v = !sw.classList.contains("on");
      sw.classList.toggle("on", v); sw.setAttribute("aria-checked", v ? "true" : "false");
      onChange(v);
    });
    return h("div", { class: "row" }, [h("div", {}, [h("div", { class: "t" }, [title]), h("div", { class: "d" }, [desc])]), sw]);
  }

  // ------------------------------------------------------------------ updates
  // The engine is js/updater.js (signed update note -> download -> checks -> install, with a backup). This is only the face of it.
  var Upd = null, updFrom = "", updKey = "", updGone = "", updBoxRender = null, updAutoTried = "";
  var UPD_ICON = {
    down: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    warn: svg('<path d="M12 8.5v4.5M12 16.6v.1"/><path d="M10.3 4.6L3.4 17a2 2 0 001.7 3h13.8a2 2 0 001.7-3L13.7 4.6a2 2 0 00-3.4 0z"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>')
  };
  function updSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function updAgo(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    var hh = Math.round(m / 60); if (hh < 24) return hh + " h ago";
    return Math.round(hh / 24) + " d ago";
  }
  function updBusy(s) { return s.phase === "downloading" || s.phase === "verifying" || s.phase === "installing"; }

  function updInstall() {
    if (!Upd) return;
    if (S.applying) { toast("Finish what you’re applying first", true); return; }
    updFrom = "install"; updGone = "";
    Upd.install();
  }
  function updRetry() {
    if (!Upd) return;
    updFrom = "install"; updGone = "";
    Upd.check({ manual: true }).then(function (s) { if (s.phase === "available") updInstall(); });
  }
  function updReload() {
    if (S.applying) { toast("Finish what you’re applying first", true); return; }
    location.reload();
  }
  function updRollback() {
    if (!Upd) return;
    if (S.applying) { toast("Finish what you’re applying first", true); return; }
    updFrom = "rollback"; updGone = "";
    Upd.rollback();
  }
  function updCheckNow() {
    if (!Upd) return;
    updFrom = "check"; updGone = "";
    Upd.check({ manual: true }).then(function (s) { if (s.phase === "uptodate") toast("You’re up to date"); });
  }

  function openUpdateSheet() {
    if (!Upd) return;
    var s = Upd.state();
    if (s.phase !== "available") return;
    openSheet(function (sh, close) {
      sh.appendChild(h("h2", {}, ["Hydra Studio " + s.latest]));
      var bits = ["You have " + s.current];
      if (s.size) bits.push(updSize(s.size));
      sh.appendChild(h("p", { class: "sub" }, [bits.join(" · ")]));
      var ul = h("ul", { class: "upd-notes" });
      (s.notes && s.notes.length ? s.notes : ["Improvements and fixes."]).forEach(function (n) { ul.appendChild(h("li", {}, [n])); });
      sh.appendChild(ul);
      if (s.restart) sh.appendChild(h("p", { class: "hint", style: "margin-top:10px" }, ["After this update, close After Effects and open it again to finish."]));
      var later = h("button", { class: "btn", type: "button" }, ["Not now"]);
      later.addEventListener("click", close);
      var go = h("button", { class: "btn primary", type: "button" }, ["Update now"]);
      if (s.needsFull || s.writable === false) { go.disabled = true; go.style.opacity = ".5"; }
      go.addEventListener("click", function () { close(); updInstall(); });
      sh.appendChild(h("div", { class: "btn-row" }, [later, go]));
    });
  }

  function renderUpdate() {
    var bn = $("#updBanner"), s = Upd ? Upd.state() : null, btn = $("#btnSettings");
    if (updBoxRender) updBoxRender(s);
    if (!s) { bn.classList.add("hidden"); btn.classList.remove("has-dot"); return; }
    btn.classList.toggle("has-dot", s.phase === "available" && !s.needsFull);
    if (S.meta && S.meta.settings.autoInstall && s.phase === "available" && !s.needsFull && s.writable !== false && updAutoTried !== s.latest && !S.applying) {
      updAutoTried = s.latest; updFrom = "install"; Upd.install(); return;
    }
    var m = null, work = updBusy(s);
    if (s.phase === "available") {
      if (s.needsFull) m = { t: "Version " + s.latest + " needs a fresh install", d: "Download the full version once; updates work from there.", x: true };
      else if (s.writable === false) m = { t: "Version " + s.latest + " is available", d: "This copy can’t update itself here. Run the installer once more.", x: true };
      else m = { t: "Version " + s.latest + " is ready", d: (s.notes && s.notes[0]) || "Tap for what’s new", btn: ["Update", updInstall], x: true, tap: openUpdateSheet };
    } else if (s.phase === "downloading") m = { t: "Downloading " + s.latest, d: Math.round(s.progress * 100) + "%", bar: s.progress };
    else if (s.phase === "verifying") m = { t: "Checking the download…", d: "Making sure it’s really from Otiner Studio", bar: -1 };
    else if (s.phase === "installing") m = { t: "Installing…", d: "Keeping a copy of your current version", bar: -1 };
    else if (s.phase === "installed") {
      m = { ok: true, t: (updFrom === "rollback" ? "Went back to version " : "Updated to version ") + s.installed,
        d: s.restart ? "Close After Effects and open it again to finish" : "Reload the panel to start using it", btn: s.restart ? null : ["Reload", updReload], x: true };
    } else if (s.phase === "error" && (updFrom === "install" || updFrom === "rollback") && s.error) {
      m = { err: true, t: "The update didn’t install", d: s.error.message, btn: s.error.kind === "full" || s.error.kind === "perm" || s.error.kind === "where" ? null : ["Try again", updRetry], x: true };
    }
    if (m && updGone === updKeyOf(s, m)) m = null;
    if (!m) { bn.classList.add("hidden"); updKey = ""; return; }
    var key = updKeyOf(s, m);
    if (key === updKey && !bn.classList.contains("hidden")) {      // same banner, only the numbers moved
      var sp = bn.querySelector(".upd-tx span"), br = bn.querySelector(".upd-bar");
      if (sp) sp.textContent = m.d;
      if (br && m.bar >= 0) br.style.width = Math.round(m.bar * 100) + "%";
      return;
    }
    updKey = key;
    bn.innerHTML = ""; bn.className = "upd" + (m.ok ? " ok" : m.err ? " err" : work ? " work" : "");
    bn.appendChild(h("span", { class: "upd-ic", html: m.ok ? UPD_ICON.check : m.err ? UPD_ICON.warn : UPD_ICON.down }));
    var tx = h(m.tap ? "button" : "div", { class: "upd-tx" + (m.tap ? "" : " plain"), type: "button", title: m.d }, [h("b", {}, [m.t]), h("span", {}, [m.d])]);
    if (m.tap) tx.addEventListener("click", m.tap);
    bn.appendChild(tx);
    if (m.btn) { var b = h("button", { class: "btn small primary", type: "button" }, [m.btn[0]]); b.addEventListener("click", m.btn[1]); bn.appendChild(b); }
    if (m.x) {
      var x = h("button", { class: "upd-x", type: "button", "aria-label": "Hide", title: "Hide", html: UPD_ICON.close });
      x.addEventListener("click", function () { if (s.phase === "available") Upd.dismiss(); updGone = key; bn.classList.add("hidden"); updKey = ""; });
      bn.appendChild(x);
    }
    if (m.bar !== undefined) { var bar = h("i", { class: "upd-bar" + (m.bar < 0 ? " ind" : "") }); if (m.bar >= 0) bar.style.width = Math.round(m.bar * 100) + "%"; bn.appendChild(bar); }
    bn.classList.remove("hidden");
  }
  function updKeyOf(s, m) { return [s.phase, s.latest, s.installed, s.restart, s.writable, s.needsFull, s.error ? s.error.kind + s.error.message : "", m.t].join("|"); }

  // the "Updates" block inside Settings
  function updateField() {
    var line = h("div", { class: "upd-line" }), btns = h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" });
    var box = h("div", { class: "upd-set" }, [line, btns]);
    function btn(label, cls, fn, off) {
      var b = h("button", { class: "btn small " + (cls || ""), type: "button" }, [label]);
      if (off) { b.disabled = true; b.style.opacity = ".5"; } else b.addEventListener("click", fn);
      btns.appendChild(b);
    }
    function paint(s) {
      btns.innerHTML = ""; line.className = "upd-line"; line.innerHTML = "";
      function say(main, small, cls) { if (cls) line.classList.add(cls); line.appendChild(document.createTextNode(main)); if (small) line.appendChild(h("small", {}, [small])); }
      if (!s) { say("Updates aren’t available in this copy.", "Install Hydra Studio with its installer to turn them on."); return; }
      if (!s.configured) { say("Version " + s.current, "Updates aren’t set up yet in this copy."); return; }
      var busy = updBusy(s);
      if (s.phase === "checking") say("Looking for updates…", "");
      else if (busy) say(s.phase === "downloading" ? "Downloading " + s.latest + "… " + Math.round(s.progress * 100) + "%" : s.phase === "verifying" ? "Checking the download…" : "Installing…", "");
      else if (s.phase === "available") say("Version " + s.latest + " is available", s.needsFull ? "This one needs a fresh install." : (s.notes && s.notes[0]) || "");
      else if (s.phase === "installed") say("Version " + s.installed + " is installed", s.restart ? "Close After Effects and open it again to finish." : "Reload the panel to start using it.", "ok");
      else if (s.phase === "error" && s.error) say(s.error.message, "", "err");
      else if (s.phase === "uptodate") say("You’re up to date", "Version " + s.current + (s.latest && s.latest !== s.current ? " · newest published: " + s.latest : "") + (s.checkedAt ? " · checked " + updAgo(s.checkedAt) : ""), "ok");
      else say("Version " + s.current, s.checkedAt ? "Checked " + updAgo(s.checkedAt) : "");
      if (s.phase === "available" && !s.needsFull && s.writable !== false) { btn("Update to " + s.latest, "primary", updInstall); btn("What’s new", "", openUpdateSheet); }
      else if (s.phase === "installed" && !s.restart) btn("Reload panel", "primary", updReload);
      else btn(s.phase === "checking" ? "Checking…" : "Check now", "", updCheckNow, s.phase === "checking" || busy);
      if (s.previous && !busy && s.phase !== "checking") btn("Go back to " + s.previous, "ghost", updRollback);
    }
    updBoxRender = paint; paint(Upd ? Upd.state() : null);
    return box;
  }

  function initUpdates() {
    var cfg = window.HYDRA_UPDATE || {};
    try {
      if (typeof HydraUpdate === "undefined") return;
      Upd = HydraUpdate.create({ deps: HydraUpdate.defaultDeps(req), extDir: P.ext, dataDir: P.data, feeds: cfg.feeds || [], publicKey: cfg.publicKey || "", version: VERSION });
    } catch (e) { Upd = null; return; }
    Upd.onChange(renderUpdate);
    var ju = null;
    try { ju = Upd.consumeJustUpdated(); } catch (e) {}
    if (ju) setTimeout(function () { toast((ju.rolled ? "Went back to version " : "Updated to version ") + ju.version + (ju.restart ? " · restart After Effects to finish" : "")); }, 900);
    function auto() { if (Upd && S.meta.settings.autoUpdate !== false && Upd.state().configured) { updFrom = "auto"; Upd.checkIfDue(6); } }
    setTimeout(auto, 6000);
    setInterval(auto, 30 * 60 * 1000);
    renderUpdate();
  }

  // ------------------------------------------------------------------ settings
  function openSettings() {
    openSheet(function (sh, close) {
      var st = S.meta.settings;
      sh.appendChild(h("h2", {}, ["Settings"]));
      sh.appendChild(h("p", { class: "sub" }, ["Hydra Studio · v" + VERSION]));

      sh.appendChild(h("div", { class: "field" }, [h("label", {}, ["Timing"]),
        segControl([["inpoint", "Layer in / out point"], ["playhead", "Playhead"]], st.start, function (v) { st.start = v; saveMeta(); }),
        h("div", { class: "d", style: "font-size:11.5px;color:var(--text-2)" }, ["In animations start here. Out animations end here."])]));
      sh.appendChild(switchRow("Quick apply", "Clicking a preset applies it right away", st.quick, function (v) { st.quick = v; saveMeta(); }));
      sh.appendChild(switchRow("Auto-detect selection", "Reads your selection while the pointer is over this panel. Turn off if you edit text a lot.", st.live, function (v) {
        st.live = v; saveMeta(); renderPill(); renderDock(); if (v) kick();
      }));
      sh.appendChild(switchRow("Animations", "Soft motion on hover and while switching tabs", st.motion, function (v) {
        st.motion = v; saveMeta(); document.body.classList.toggle("calm", !v);
      }));

      sh.appendChild(h("div", { class: "field" }, [h("label", {}, ["Updates"]), updateField()]));
      sh.appendChild(switchRow("Check for updates", "Looks when the panel opens, then every few hours. Nothing installs unless you press Update.", st.autoUpdate !== false, function (v) { st.autoUpdate = v; saveMeta(); }));
      sh.appendChild(switchRow("Install updates automatically", "Downloads and installs a new version by itself, then asks you to reload.", !!st.autoInstall, function (v) { st.autoInstall = v; saveMeta(); if (v) renderUpdate(); }));

      var openLib = h("button", { class: "btn small", type: "button" }, ["Open library folder"]);
      openLib.addEventListener("click", async function () {
        try { mkdirp(P.lib); } catch (e) {}
        var r = await cep.call("ops_reveal", P.lib);
        if (!r.ok) toast(r.error || "Couldn’t open the folder", true);
      });
      sh.appendChild(h("div", { class: "field" }, [h("label", {}, ["Library"]), h("div", {}, [openLib])]));

      var phBtn = h("button", { class: "btn small", type: "button" }, ["Choose photo…"]);
      var phClr = h("button", { class: "btn small", type: "button" }, ["Use built-in"]);
      var phIn = h("input", { type: "file", accept: "image/*", style: "display:none" });
      phBtn.addEventListener("click", function () { phIn.click(); });
      phIn.addEventListener("change", function () {
        var f = phIn.files && phIn.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { savePhoto(String(rd.result)); toast("Preview photo updated", false); };
        rd.readAsDataURL(f);
        phIn.value = "";
      });
      phClr.addEventListener("click", function () { savePhoto(""); toast("Using the built-in photo", false); });
      sh.appendChild(h("div", { class: "field" }, [h("label", {}, ["Preview photo"]),
        h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [phBtn, phClr, phIn]),
        h("div", { class: "d", style: "font-size:11.5px;color:var(--text-2)" }, ["Used by Flash, Blur, Color, Light and Clarity previews. Pick one of your own shots to judge them on."])]));

      var out = h("div", { class: "diag hidden" });
      var diag = h("button", { class: "btn small", type: "button" }, ["Run check"]);
      diag.addEventListener("click", async function () {
        out.classList.remove("hidden");
        out.textContent = "Checking…";
        var deep = await cep.deepCheck();
        var r = await cep.call("ops_diagnose");
        var lines = ["panel: v" + VERSION, "node: " + (nodeOK ? "ok" : "MISSING (enable-nodejs)"), "connection: " + S.phase,
          "host script: " + (cep.hostLoaded() ? "loaded" : "not loaded"), "platform: " + (cep.isWin ? "Windows" : "Mac/other") + (typeof process !== "undefined" ? " (" + process.platform + ")" : ""), "load log: " + (cep.loadLog().join(" | ") || "-"), "last error: " + (S.reachErr || "-"), "library: " + P.lib, "extension: " + P.ext].concat(deep);
        Object.keys(r).forEach(function (k) { lines.push(k + ": " + r[k]); });
        if (S.lastApply) lines.push("last preset: " + S.lastApply);
        if (S.lastFx) lines.push("last effect: " + S.lastFx);
        out.textContent = lines.join("\n");
      });
      var chk = h("button", { class: "btn small", type: "button" }, ["Check effects"]);
      chk.addEventListener("click", async function () {
        out.classList.remove("hidden");
        out.textContent = "Testing every effect on a temporary comp…";
        var r = await cep.call("ops_checkFx");
        if (!r.ok) { out.textContent = r.error || "The check could not run."; return; }
        var bad = (r.missing || []).concat((r.badParams || []).map(function (x) { return "parameter: " + x; }), (r.shapeMissing || []).map(function (x) { return "shape: " + x; }));
        out.textContent = "effects found: " + r.found + " of " + r.total + (bad.length ? "\nproblems:\n- " + bad.join("\n- ") : "\nAll good: every effect and parameter was found.");
      });
      sh.appendChild(h("div", { class: "field" }, [h("label", {}, ["Diagnostics"]), h("div", { style: "display:flex;gap:8px;flex-wrap:wrap" }, [diag, chk]), out]));

      sh.appendChild(h("p", { class: "sub", style: "margin-top:16px;font-size:11px" }, ["Typeface: Outfit (SIL Open Font License)."]));
      var done = h("button", { class: "btn primary", type: "button" }, ["Done"]);
      done.addEventListener("click", close);
      sh.appendChild(h("div", { class: "btn-row" }, [done]));
    }, { onClose: function () { updBoxRender = null; } });
  }

  // ------------------------------------------------------------------ theme studio (live, no dimming)
  function openThemeSheet() {
    openSheet(function (sh, close) {
      var st = S.meta.settings, syncs = [], paneName = "looks";

      function sync() { syncs.forEach(function (f) { f(); }); }
      function change(fn) { fn(); refreshTheme(); sync(); }
      function accentUp() { return String(st.accent).toUpperCase(); }

      var reset = h("button", { class: "btn small ghost", type: "button" }, ["Reset"]);
      reset.addEventListener("click", function () {
        change(function () {
          st.surface = DEFAULT_LOOK.surface; st.accent = DEFAULT_LOOK.accent; st.bg = ""; st.cats = DEFAULT_LOOK.cats; st.catColors = {};
        });
        toast("Back to the Studio look");
      });
      var done = h("button", { class: "btn small primary", type: "button" }, ["Done"]);
      done.addEventListener("click", close);
      sh.appendChild(h("div", { class: "sheet-head" }, [h("h2", {}, ["Theme"]), h("div", { class: "head-actions" }, [reset, done])]));

      var body = h("div", { class: "sheet-body" });
      sh.appendChild(segControl([["looks", "Looks"], ["accent", "Accent"], ["base", "Base"], ["sections", "Sections"]], paneName, function (v) { show(v); }));
      sh.appendChild(body);

      function hint(t) { return h("p", { class: "hint" }, [t]); }
      function range(cls, min, max, val) {
        var r = h("input", { type: "range", class: "range " + cls, min: String(min), max: String(max), step: "1", value: String(Math.round(val)) });
        return r;
      }
      function hexField(get, set) {
        var f = h("input", { type: "text", class: "hex", maxlength: "7", spellcheck: "false", autocomplete: "off", "aria-label": "Hex color" });
        f.addEventListener("input", function () {
          var v = f.value.trim();
          if (!/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { f.classList.add("bad"); return; }
          f.classList.remove("bad");
          change(function () { set(rgbToHex(hexToRgb(v))); });
        });
        f.addEventListener("blur", function () { f.classList.remove("bad"); f.value = get(); });
        syncs.push(function () { if (document.activeElement !== f) f.value = get(); });
        return f;
      }

      // ---- Looks
      function paneLooks() {
        var grid = h("div", { class: "looks" });
        LOOKS.forEach(function (lk) {
          var sf = SURFACES[lk.surface];
          var b = h("button", { class: "look", type: "button", title: lk.name });
          b.innerHTML = '<span class="thumb" style="background:' + sf.bg + '"><i class="c1" style="background:' + sf.card + '"></i><i class="c2" style="background:' + sf.card + '"></i><b style="background:' + lk.accent + '"></b></span><span class="nm">' + esc(lk.name) + "</span>";
          b.addEventListener("click", function () {
            change(function () { st.surface = lk.surface; st.accent = lk.accent; st.cats = lk.cats; st.bg = ""; st.catColors = {}; });
          });
          syncs.push(function () { b.classList.toggle("on", st.surface === lk.surface && accentUp() === lk.accent && st.cats === lk.cats); });
          grid.appendChild(b);
        });
        return h("div", { class: "pane" }, [hint("One tap restyles the whole panel. Fine-tune it in the other tabs."), grid]);
      }

      // ---- Accent
      function paneAccent() {
        var grid = h("div", { class: "swatches" });
        ACCENTS.forEach(function (a) {
          var b = h("button", { class: "sw", type: "button", title: a[0], "aria-label": a[0], style: "--sw:" + a[1] });
          b.addEventListener("click", function () { change(function () { st.accent = a[1]; }); });
          syncs.push(function () { b.classList.toggle("on", accentUp() === a[1]); });
          grid.appendChild(b);
        });
        var nat = h("label", { class: "sw custom", title: "Pick any color" });
        var picker = h("input", { type: "color", "aria-label": "Custom accent color" });
        picker.addEventListener("input", function () { change(function () { st.accent = picker.value.toUpperCase(); }); });
        nat.appendChild(picker);
        grid.appendChild(nat);
        syncs.push(function () {
          var custom = !ACCENTS.some(function (a) { return a[1] === accentUp(); });
          nat.classList.toggle("on", custom);
          nat.style.setProperty("--sw", st.accent);
          picker.value = st.accent.toLowerCase();
        });

        var hue = range("hue", 0, 360, rgbToHue(hexToRgb(st.accent) || [255, 216, 0]));
        hue.addEventListener("input", function () {
          change(function () { st.accent = rgbToHex(hsvToRgb(Number(hue.value) % 360, 0.9, 1)); });
        });
        syncs.push(function () { if (document.activeElement !== hue) hue.value = String(Math.round(rgbToHue(hexToRgb(st.accent) || [255, 216, 0]))); });

        var hex = hexField(function () { return accentUp(); }, function (v) { st.accent = v; });
        return h("div", { class: "pane" }, [
          hint("Buttons, highlights and the glow behind the header."), grid,
          h("div", { class: "label sp" }, ["Custom"]),
          h("div", { class: "custom-row" }, [hue, hex])
        ]);
      }

      // ---- Base (surface)
      function paneBase() {
        var tiles = h("div", { class: "tiles" });
        function tile(key, label, thumbStyle) {
          var b = h("button", { class: "tile", type: "button", title: label });
          var th = h("span", { class: "thumb" });
          th.innerHTML = "<i></i>";
          b.appendChild(th); b.appendChild(h("span", { class: "nm" }, [label]));
          b.addEventListener("click", function () {
            change(function () {
              if (key === "custom" && !hexToRgb(st.bg)) st.bg = resolveSurface(st).bg;
              st.surface = key;
            });
          });
          syncs.push(function () {
            b.classList.toggle("on", st.surface === key);
            var ts = thumbStyle();
            th.style.background = ts.bg;
            th.firstChild.style.background = ts.card;
          });
          tiles.appendChild(b);
        }
        tile("auto", "Auto", function () { return { bg: "linear-gradient(135deg," + SURFACES.paper.bg + " 50%," + SURFACES.midnight.bg + " 50%)", card: "rgba(128,128,128,.55)" }; });
        SURFACE_ORDER.forEach(function (k) { tile(k, SURFACES[k].name, function () { return { bg: SURFACES[k].bg, card: SURFACES[k].card }; }); });
        tile("custom", "Custom", function () { var d = deriveSurface(hexToRgb(st.bg) ? st.bg : "#8a8a8a"); return { bg: hexToRgb(st.bg) ? d.bg : "conic-gradient(#ff5f6d,#ffd800,#30d158,#0a84ff,#bf5af2,#ff5f6d)", card: d.card }; });

        var box = h("div", { class: "custom-base hidden" });
        function curHsl() { return rgbToHsl(hexToRgb(st.bg) || [138, 138, 138]); }
        function setFromSliders() {
          change(function () { st.surface = "custom"; st.bg = rgbToHex(hslToRgb(Number(sH.value) % 360, Number(sS.value) / 100, Number(sL.value) / 100)); });
        }
        var sH = range("hue", 0, 360, curHsl().h), sS = range("sat", 0, 70, curHsl().s * 100), sL = range("lum", 2, 98, curHsl().l * 100);
        [sH, sS, sL].forEach(function (r) { r.addEventListener("input", setFromSliders); });
        function line(label, r) { return h("div", { class: "slider-row" }, [h("span", {}, [label]), r]); }
        var hex = hexField(function () { return String(st.bg || "").toUpperCase(); }, function (v) { st.surface = "custom"; st.bg = v; });
        box.appendChild(line("Tint", sH)); box.appendChild(line("Vibrance", sS)); box.appendChild(line("Brightness", sL));
        box.appendChild(h("div", { class: "slider-row" }, [h("span", {}, ["Hex"]), hex]));
        syncs.push(function () {
          box.classList.toggle("hidden", st.surface !== "custom");
          var c = curHsl();
          if (document.activeElement !== sH) sH.value = String(Math.round(c.h));
          if (document.activeElement !== sS) sS.value = String(Math.round(c.s * 100));
          if (document.activeElement !== sL) sL.value = String(Math.round(c.l * 100));
        });
        return h("div", { class: "pane" }, [hint("The base tone of the whole panel. Auto follows After Effects’ own brightness."), tiles, box]);
      }

      // ---- Sections
      function paneSections() {
        var wrap = h("div", { class: "pane" });
        wrap.appendChild(hint("Give every section its own color so you can tell them apart at a glance."));
        wrap.appendChild(segControl([["spectrum", "Colorful"], ["accent", "Accent"], ["mono", "Mono"]], st.cats, function (v) {
          change(function () { st.cats = v; });
        }));
        var rows = h("div", { class: "cat-rows" });
        allCategoryNames().forEach(function (c) {
          var dot = h("i", { class: "cdot" });
          var sw = h("div", { class: "mini-sw" });
          SPECTRUM.forEach(function (rgb) {
            var hx = rgbToHex(rgb);
            var b = h("button", { class: "msw", type: "button", "aria-label": c + " color " + hx, style: "--sw:" + rgbStr(rgb) });
            b.addEventListener("click", function () {
              change(function () {
                st.cats = "spectrum";
                var def = DEFAULT_CAT[c] || SPECTRUM[3 + (hashStr(c) % 4)];
                if (rgbToHex(def) === hx) delete st.catColors[c]; else st.catColors[c] = hx;
              });
            });
            syncs.push(function () { b.classList.toggle("on", rgbToHex(catRGB(c)) === hx && st.cats === "spectrum"); });
            sw.appendChild(b);
          });
          syncs.push(function () { dot.style.background = rgbStr(inkRGB(catRGB(c))); });
          rows.appendChild(h("div", { class: "cat-row" }, [h("div", { class: "cat-name" }, [dot, h("span", {}, [c])]), sw]));
        });
        syncs.push(function () { rows.classList.toggle("dim", st.cats !== "spectrum"); });
        wrap.appendChild(rows);
        return wrap;
      }

      var PANES = { looks: paneLooks, accent: paneAccent, base: paneBase, sections: paneSections };
      function show(name) {
        paneName = name; syncs = [];
        body.innerHTML = "";
        body.appendChild(PANES[name]());
        sync();
      }
      show("looks");
    }, { live: true });
  }

  // ------------------------------------------------------------------ files in (picker + drag & drop)
  function pickedFiles(list) {
    return Array.prototype.map.call(list || [], function (f) { return { name: f.name, path: f.path }; });
  }

  function wireInputs() {
    var input = $("#fileInput");
    $("#btnAdd").addEventListener("click", function () { input.value = ""; input.click(); });
    input.addEventListener("change", function () {
      var files = pickedFiles(input.files);
      if (files.length && !files[0].path) { toast("Can’t read file paths here. Copy the files into the library folder instead.", true); return; }
      openAddSheet(files);
    });
    var depth = 0;
    window.addEventListener("dragenter", function (e) { e.preventDefault(); depth++; document.body.classList.add("dropzone-on"); });
    window.addEventListener("dragover", function (e) { e.preventDefault(); });
    window.addEventListener("dragleave", function (e) { e.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove("dropzone-on"); });
    window.addEventListener("drop", function (e) {
      e.preventDefault(); depth = 0;
      document.body.classList.remove("dropzone-on");
      var files = pickedFiles(e.dataTransfer && e.dataTransfer.files);
      if (files.length) openAddSheet(files);
    });
  }

  // ------------------------------------------------------------------ wiring
  function renderViewButton() {
    var d = S.meta.settings.density;
    $("#btnView").innerHTML = ICON[VIEW_ICON[d]];
    $("#btnView").title = "Card size: " + d;
  }

  function renderDirSeg() {
    var d = dirNow();
    $$("#dirSeg button").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-dir") === d); });
    $("#dirSeg").setAttribute("data-dir", d);
  }

  function setDir(d) {
    var st = S.meta.settings;
    if (st.dir === d) return;
    st.dir = d; saveMeta(); renderDirSeg();
    // carry the selected preset over to its counterpart
    if (S.current) {
      var baseId = S.current.base ? S.current.base.id : S.current.id;
      var cand = presetById(d === "out" ? baseId + "#out" : baseId) || null;
      S.current = (cand && view().indexOf(cand) >= 0) ? cand : null;
    }
    S.hintOverride = "";
    renderTabs(); renderList(false); renderDock();
  }

  function wireUI() {
    renderDirSeg();
    $$("#dirSeg button").forEach(function (b) { b.addEventListener("click", function () { setDir(b.getAttribute("data-dir")); }); });
    $("#btnSettings").innerHTML = ICON.sliders;
    $("#btnTheme").innerHTML = ICON.palette;
    $("#btnAdd").innerHTML = ICON.plus + "<span>Add</span>";
    renderViewButton();
    $("#btnSettings").addEventListener("click", openSettings);
    $("#btnTheme").addEventListener("click", openThemeSheet);
    $("#btnApply").addEventListener("click", applyCurrent);
    $("#btnView").addEventListener("click", function () {
      var st = S.meta.settings;
      st.density = DENSITIES[(DENSITIES.indexOf(st.density) + 1) % DENSITIES.length];
      saveMeta(); renderViewButton();
      $("#list").setAttribute("data-density", st.density);
      toast("Card size: " + st.density);
    });

    var search = $("#search");
    search.addEventListener("input", function (e) { S.query = e.target.value; renderList(false); });
    search.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && search.value) { search.value = ""; S.query = ""; renderList(false); e.stopPropagation(); }
      if (e.key === "Enter") { var first = $(".card"); if (first) { var p = presetById(first.getAttribute("data-id")); if (p) selectPreset(p); } }
    });

    $("#tabs").addEventListener("click", function (e) {
      var t = e.target.closest(".tab");
      if (!t) return;
      S.cat = t.getAttribute("data-cat");
      $$(".tab").forEach(function (x) { x.classList.toggle("on", x === t); });
      moveIndicator();
      renderList(false);
    });

    var list = $("#list");
    list.addEventListener("click", function (e) {
      var card = e.target.closest(".card");
      if (!card) return;
      if (isFx()) {
        var fxs = fxById(card.getAttribute("data-id"));
        if (fxs) { fxSelect(fxs); if (S.meta.settings.quick && applyState().ok) applyCurrent(); }
        return;
      }
      var p = presetById(card.getAttribute("data-id"));
      if (!p) return;
      if (e.target.closest(".fav-btn")) {
        var i = S.meta.favorites.indexOf(p.id);
        if (i >= 0) S.meta.favorites.splice(i, 1); else S.meta.favorites.push(p.id);
        saveMeta();
        var btn = card.querySelector(".fav-btn");
        btn.classList.toggle("on", isFav(p));
        card.classList.toggle("fav", isFav(p));
        renderTabs();
        if (S.cat === "Favorites") renderList(true, true);
        return;
      }
      if (e.target.closest(".del-btn")) { openRemoveSheet(p.base || p); return; }
      selectPreset(p);
      if (S.meta.settings.quick && applyState().ok) applyCurrent();
    });
    list.addEventListener("dblclick", function (e) {
      var card = e.target.closest(".card");
      if (!card || e.target.closest(".card-actions")) return;
      if (isFx()) {
        var fxd = fxById(card.getAttribute("data-id"));
        if (fxd) { fxSelect(fxd); if (applyState().ok) applyCurrent(); }
        return;
      }
      var p = presetById(card.getAttribute("data-id"));
      if (p) { selectPreset(p); if (applyState().ok) applyCurrent(); }
    });
    // keyboard: arrows move, Space selects, Enter applies
    list.addEventListener("keydown", function (e) {
      var card = e.target.closest ? e.target.closest(".card") : null;
      if (!card) return;
      var cards = $$(".card", list), i = cards.indexOf(card);
      var top = Math.round(card.getBoundingClientRect().top);
      var cols = Math.max(1, cards.filter(function (c) { return Math.round(c.getBoundingClientRect().top) === top; }).length);
      var next = -1;
      if (e.key === "ArrowRight") next = i + 1;
      else if (e.key === "ArrowLeft") next = i - 1;
      else if (e.key === "ArrowDown") next = i + cols;
      else if (e.key === "ArrowUp") next = i - cols;
      if (next !== -1) { e.preventDefault(); if (cards[next]) cards[next].focus(); return; }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (isFx()) {
          var fk = fxById(card.getAttribute("data-id"));
          if (!fk) return;
          fxSelect(fk);
          if (e.key === "Enter" && applyState().ok) applyCurrent();
          return;
        }
        var p = presetById(card.getAttribute("data-id"));
        if (!p) return;
        selectPreset(p);
        if (e.key === "Enter" && applyState().ok) applyCurrent();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && sheetClose) sheetClose();
    });

    // modes, FX controls, hover preview
    $("#btnTabs").innerHTML = ICON.arrange;
    $("#btnTabs").addEventListener("click", openTabsSheet);
    $("#modeBar").addEventListener("scroll", updateModeFade);
    $("#modeBar").addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { this.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    $$("#fxTarget button").forEach(function (b) {
      b.addEventListener("click", function () {
        S.meta.settings.fxTarget = b.getAttribute("data-t"); saveMeta(); renderFxControls(); renderDock();
      });
    });
    $("#fxLen").addEventListener("input", function (e) {
      S.meta.settings.fxLen = Number(e.target.value); saveMetaSoon(); renderFxControls(); Preview.refresh();
    });
    $("#fxInt").addEventListener("input", function (e) {
      S.meta.settings.fxInt = Number(e.target.value); saveMetaSoon(); renderFxControls();
    });
    list.addEventListener("mouseover", function (e) {
      if (!isFx()) return;
      var c = e.target.closest(".card");
      if (!c) return;
      var f = fxById(c.getAttribute("data-id"));
      if (f && Preview.hovering() !== f) Preview.setFx(f, false);
    });
    list.addEventListener("mouseleave", function () { if (isFx()) Preview.clearHover(); });

    $("#tabs").addEventListener("scroll", updateRailFade);
    window.addEventListener("resize", function () { moveIndicator(true); updateModeFade(); });
  }

  // ------------------------------------------------------------------ start
  function init() {
    S.connected = cep.available;

    if (!nodeOK) {
      document.documentElement.setAttribute("data-theme", "light");
      $("#selPill").className = "pill err";
      $("#selText").textContent = "Node.js is disabled for this panel";
      toast("Reinstall the panel: Node.js access is required.", true);
      return;
    }

    initPaths();
    migrateOld();
    try { mkdirp(P.data); mkdirp(P.lib); } catch (e) {}
    rmrf(path.join(P.data, "previews")); // leftovers from v0.1
    rmrf(path.join(P.data, "live"));

    // persistent sliding indicator for the category rail
    $("#tabs").appendChild(h("i", { class: "ind", id: "tabInd" }));

    loadMeta();
    applyLook();
    cep.onThemeChanged(function () { applyLook(); recolor(); });
    scanAll();
    wireUI();
    wireInputs();
    Preview.init(); Preview.setFx(FX[0], true);
    try { var pd = loadPhotoData(); if (pd) applyPhoto(pd); } catch (e) {}
    try { if (document.fonts && document.fonts.load) document.fonts.load("800 60px Outfit").then(function () { Stage.rescene(); }); } catch (e) {}
    Studio.init({
      settings: function () { return S.meta.settings; },
      save: saveMetaSoon,
      dockChanged: function () { if (isStudio()) renderStudioDock(); },
      toast: toast,
      call: function () { return cep.call.apply(cep, arguments); },
      gate: function () {
        if (!S.connected) return "Open this panel inside After Effects";
        if (S.phase !== "ready") return S.phase === "connecting" ? "Connecting…" : "Not connected · click the status above";
        return "";
      },
      sel: function () { return S.meta.settings.live ? S.sel : { hasComp: true, total: 1, texts: 0, others: 1, name: "" }; },
      accent: function () { return rgbToHex(S.look.accent); },
      dark: function () { return !!S.look.dark; },
      files: function () { return nodeOK ? { fs: fs, path: path, mkdirp: mkdirp, data: P.data } : null; },
      awake: function () { return !document.hidden && S.hover && Date.now() - S.lastMove < 15000; }
    });
    renderTools(); renderFxControls(); syncModeUI();
    setTimeout(updateModeFade, 60);
    renderPill(); if (modeNow() !== "tools" && modeNow() !== "safe") { renderTabs(); renderList(false); } renderDock();
    initUpdates();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveIndicator(); });

    if (S.connected) {
      wireHover();
      tick();
    }
    window.__ps = { S: S, P: P };
  }

  init();
})();
