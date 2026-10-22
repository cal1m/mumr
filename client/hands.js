// HANDS: what a tracked hand (25 WebXR joints) or a controller is to the engine. No THREE and no DOM: the XR part (xr/input.js) reads
// the joints from the frame and hands them in here as numbers.
//
// A SOURCE is what the simulation and the other players get: { id, points: [{ name, x, y, z }], joints: [[x, y, z] x 25] }, on the
// floor plan (align.js Space: x = XR X, y = -XR Z, z = height above this headset's floor). The points are the five fingertips and
// the palm (halfway along the middle metacarpal).
//
// The PINCH: the headset's own pinch (a select event) or the thumb and index tips within 22 mm, let go at 35 mm (Nudgy, 2026-10-11:
// 15 mm never fired, the tip joints sit about 7 mm inside the finger pads; a recording showed tips 1 mm apart when touching).
(function (M) {
  const J = { wrist: 0, thumb: [1, 2, 3, 4], index: [5, 6, 7, 8, 9], middle: [10, 11, 12, 13, 14], ring: [15, 16, 17, 18, 19], pinky: [20, 21, 22, 23, 24] };
  const TIP = { thumb: 4, index: 9, middle: 14, ring: 19, pinky: 24 };
  const PALM = [10, 11];
  const PINCH_ON = 0.022, PINCH_OFF = 0.035;

  // jp: 75 numbers, the joints in XR space ([X, Y, Z] each); space: an align.Space (only floorY is needed for the floor plan)
  function source(id, jp, space) {
    const fy = space ? space.floorY : 0, at = (i) => [jp[i * 3], -jp[i * 3 + 2], jp[i * 3 + 1] - fy];
    const joints = [];
    for (let i = 0; i < 25; i++) joints.push(at(i));
    const points = Object.entries(TIP).map(([name, i]) => { const p = joints[i]; return { name, x: p[0], y: p[1], z: p[2] }; });
    const a = joints[PALM[0]], b = joints[PALM[1]];
    points.push({ name: 'palm', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 });
    return { id, points, joints };
  }
  // a controller: one point (its tip, 6 cm ahead of the grip), on the floor plan
  function controller(id, tipXR, space, extra = {}) {
    const fy = space ? space.floorY : 0;
    return Object.assign({ id, points: [{ name: 'ctrl', x: tipXR[0], y: -tipXR[2], z: tipXR[1] - fy }] }, extra);
  }
  const tipsDist = (jp) => Math.hypot(jp[TIP.thumb * 3] - jp[TIP.index * 3], jp[TIP.thumb * 3 + 1] - jp[TIP.index * 3 + 1], jp[TIP.thumb * 3 + 2] - jp[TIP.index * 3 + 2]);

  // the pinch of each hand, with hysteresis: update(id, jp, select) -> bool
  class Pinch {
    constructor(on = PINCH_ON, off = PINCH_OFF) { this.on = on; this.off = off; this.state = new Map(); }
    update(id, jp, select) {
      const was = this.state.get(id) || false, d = jp ? tipsDist(jp) : Infinity;
      const now = !!select || (was ? d < this.off : d < this.on);
      this.state.set(id, now);
      return now;
    }
    clear() { this.state.clear(); }
  }

  // The index fingertips as the line-up wants them: [{ id, x, y, z, pinch }] on the floor plan
  function tips(sources, pinches) {
    const out = [];
    for (const s of sources || []) {
      const p = (s.points || []).find((q) => q.name === 'index' || q.name === 'ctrl');
      if (p) out.push({ id: s.id, x: p.x, y: p.y, z: p.z, pinch: !!(pinches && pinches[s.id]) });
    }
    return out;
  }
  // the nearest distance from any point or joint of the sources to a point (floor plan), and which source
  function nearest(sources, x, y, z) {
    let best = Infinity, who = null;
    for (const s of sources || []) {
      for (const p of s.points || []) { const d = Math.hypot(p.x - x, p.y - y, p.z - z); if (d < best) { best = d; who = s; } }
      for (const j of s.joints || []) { const d = Math.hypot(j[0] - x, j[1] - y, j[2] - z); if (d < best) { best = d; who = s; } }
    }
    return { d: best, source: who };
  }

  // LEGS, to draw (not to touch anything): from the body-tracking sources (id 'left-foot' / 'right-foot', foot: true, points hip,
  // knee, ankle, toe) when a headset offers them, otherwise ESTIMATED from the head: hips at 53 % of the head's height, the feet under
  // them on the floor. Quest's tracked legs are a guess from the head and hands too (Nudgy, 2026-10-12: they follow walking, not a
  // single foot's swing). head: [x, y, heading, height, pitch] on the floor plan. -> [{ side, pts: [[x, y, z] x 4], estimated }]
  const LEG = { hip: 0.53, knee: 0.28, apart: 0.09, back: 0.05, foot: 0.12 };
  function legs(head, sources) {
    const out = [];
    for (const side of ['left', 'right']) {
      const s = (sources || []).find((q) => q.id === `${side}-foot` && q.foot);
      const by = (n) => { const p = s && s.points.find((q) => q.name === n); return p ? [p.x, p.y, p.z] : null; };
      const pts = s ? ['hip', 'knee', 'ankle', 'toe'].map(by) : null;
      if (pts && pts.every(Boolean)) { out.push({ side, pts, estimated: false }); continue; }
      if (!head) continue;
      const [x, y, th, h] = head, c = Math.cos(th), sn = Math.sin(th), sideK = side === 'left' ? 1 : -1;
      const at = (fwd, lat, z) => [x + c * fwd - sn * lat * sideK, y + sn * fwd + c * lat * sideK, z];
      out.push({ side, estimated: true, pts: [at(-LEG.back, LEG.apart, h * LEG.hip), at(-LEG.back + 0.03, LEG.apart, h * LEG.knee), at(-LEG.back, LEG.apart, 0.08), at(-LEG.back + LEG.foot, LEG.apart, 0.03)] });
    }
    return out;
  }

  M.hands = { J, TIP, PALM, PINCH_ON, PINCH_OFF, source, controller, Pinch, tips, nearest, tipsDist, legs, LEG };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
