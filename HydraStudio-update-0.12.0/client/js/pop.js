// Hydra Studio - pop presets (v0.8)
// Motion on a layer's own Transform, so it works on shapes, images, solids and text alike (the Plain / Bounce presets are
// text animators and only exist on text). Frames are 30 fps frames and the LAST key is the resting state.
//   sc   scale as a percentage of the layer's current scale, a number or [x, y]
//   pos  offset in px (1080 p tall) from where the layer already sits
//   rot  degrees added to the current rotation
//   op   percentage of the layer's current opacity
//   ease E easy ease, L linear, H hold, E80,25 = influence in,out
// An Out is the same list played backwards, ending on the layer's last visible frame (made in app.js).
(function () {
  "use strict";
  var HS = window.HS = window.HS || {};
  var P = [];
  function add(id, name, k, extra) { var o = { id: id, name: name, k: k }, e; if (extra) for (e in extra) if (extra.hasOwnProperty(e)) o[e] = extra[e]; P.push(o); }
  function slide(id, name, dx, dy) {
    add(id, name, {
      pos: [[0, [dx, dy], "E10,70"], [8, [-dx * 0.09, -dy * 0.09], "E70,30"], [13, [0, 0], "E"]],
      op: [[0, 0, "L"], [7, 100, "L"]]
    });
  }

  add("pop", "Pop", {
    sc: [[0, 0, "E10,60"], [6, 118, "E"], [10, 94, "E"], [14, 104, "E"], [18, 100, "E"]],
    op: [[0, 0, "L"], [3, 100, "L"]]
  });
  add("pop-soft", "Soft Pop", {
    sc: [[0, 82, "E"], [8, 104, "E"], [13, 100, "E"]],
    op: [[0, 0, "L"], [8, 100, "L"]]
  });
  add("elastic", "Elastic", {
    sc: [[0, 0, "E10,60"], [5, 136, "E"], [9, 82, "E"], [13, 113, "E"], [17, 94, "E"], [21, 104, "E"], [25, 99, "E"], [28, 100, "E"]],
    op: [[0, 0, "L"], [2, 100, "L"]]
  });
  add("punch", "Punch In", {
    sc: [[0, 170, "E"], [5, 92, "E"], [9, 104, "E"], [13, 100, "E"]],
    op: [[0, 0, "L"], [3, 100, "L"]]
  });
  add("drop", "Drop", {
    pos: [[0, [0, -430], "E"], [8, [0, 0], "E"], [11, [0, -64], "E"], [14, [0, 0], "E"], [16, [0, -16], "E"], [18, [0, 0], "E"]],
    sc: [[0, [100, 100], "L"], [8, [114, 86], "E"], [11, [95, 108], "E"], [14, [104, 96], "E"], [18, [100, 100], "E"]],
    op: [[0, 0, "L"], [2, 100, "L"]]
  });
  slide("slide-up", "Slide Up", 0, 140);
  slide("slide-down", "Slide Down", 0, -140);
  slide("slide-left", "Slide Left", 170, 0);
  slide("slide-right", "Slide Right", -170, 0);
  add("rise", "Rise", {
    pos: [[0, [0, 70], "E"], [16, [0, 0], "E"]],
    op: [[0, 0, "L"], [14, 100, "E"]]
  });
  add("spin", "Spin Pop", {
    rot: [[0, -150, "E10,60"], [11, 9, "E"], [16, -3, "E"], [20, 0, "E"]],
    sc: [[0, 0, "E10,60"], [9, 110, "E"], [14, 98, "E"], [18, 100, "E"]],
    op: [[0, 0, "L"], [4, 100, "L"]]
  });
  add("jelly", "Jelly", {
    sc: [[0, [100, 100], "E"], [4, [130, 76], "E"], [8, [84, 122], "E"], [12, [111, 92], "E"], [16, [96, 104], "E"], [20, [100, 100], "E"]],
    op: [[0, 0, "L"], [2, 100, "L"]]
  });
  add("swing", "Swing", {
    rot: [[0, 38, "E"], [8, -14, "E"], [13, 6, "E"], [17, -2, "E"], [21, 0, "E"]],
    sc: [[0, 88, "E"], [9, 102, "E"], [14, 100, "E"]],
    op: [[0, 0, "L"], [6, 100, "L"]]
  });
  add("flicker", "Flicker", {
    op: [[0, 0, "H"], [1, 100, "H"], [2, 0, "H"], [3, 100, "H"], [4, 30, "H"], [5, 100, "H"], [6, 0, "H"], [8, 100, "H"], [9, 55, "H"], [10, 100, "H"]]
  });

  HS.POP = P;
})();
