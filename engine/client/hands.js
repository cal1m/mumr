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

  // FEET (Marek, 2026-10-23: only the feet, as in Nudgy; off unless the app turns them on). No sensor of the headset sees them: WebXR
  // body tracking gives a whole skeleton whose legs are a guess from how the head and the hands move. Each foot becomes a SHOE of two
  // points, the toe and the heel, from the ankle and the ball of the foot (Nudgy's offsets, EST): a source { id: 'left-foot', foot: true,
  // noHold: true, points: [toe, heel] }. A foot never holds anything; whether it pushes things is the app's choice.
  const SHOE = { ahead: 0.03, back: 0.02, up: 0.02, heelDown: 0.05, len: 0.16, r: 0.045 };
  // ankle, ball: [x, y, z] on the floor plan -> the source
  function shoe(side, ankle, ball) {
    const dx = ball[0] - ankle[0], dy = ball[1] - ankle[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    return { id: `${side}-foot`, foot: true, noHold: true, points: [
      { name: 'toe', x: ball[0] + ux * SHOE.ahead, y: ball[1] + uy * SHOE.ahead, z: ball[2] + SHOE.up },
      { name: 'heel', x: ankle[0] - ux * SHOE.back, y: ankle[1] - uy * SHOE.back, z: ankle[2] - SHOE.heelDown }] };
  }

  M.hands = { J, TIP, PALM, PINCH_ON, PINCH_OFF, source, controller, Pinch, tips, nearest, tipsDist, shoe, SHOE };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
