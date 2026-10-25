// GESTURES: what a hand is doing, for an app's simulation to use (Marek, 2026-10-22/23: the engine gives the game a pinch, a full-fist
// grab, a pointing finger and a flat hand to put things on; the game decides what they do). No THREE and no DOM. Works on hands.js
// sources (floor plan) with joints, this page's and the other players' alike (their joints come in the presence packets), so every page
// sees the same gestures without sending anything.
//
//   PINCH   the thumb and index tips touching: the source's `pinch` flag (hands.js Pinch, which the other players get on the wire too).
//           Where it holds: between the two tips.
//   FIST    all four fingers curled in: their tips on average within FIST_ON of the palm and none beyond FIST_MAX (let go: on average
//           beyond FIST_OFF). Where it holds: the middle of the fist (the palm, the curled tips and the middle knuckles).
//   POINT   the index straight and out, the middle, ring and little fingers curled in (the thumb does not matter). A ray from the index
//           tip along the finger (from its knuckle through its tip).
//   PALM    a hand held out flat (tilted less than PLAT.maxTilt): a platform things can be put on, palm up or back of the hand up (face).
// A grip that has started stays the kind it started as until it ends (a fist that also brings the thumb to the index is still a fist).
//
//   const g = new Grips();
//   g.update(sources) -> [{ id, kind: 'pinch' | 'fist' | null, start, end, was, at, point: { from, dir } | null, palm: platform | null,
//                          gesture: 'pinch' | 'fist' | 'point' | 'flat' | 'open' | 'none', m: the measurements (for a debug view) }]
//   g.of(id)               the last state of that source
//   closing(source)        0..1, how far a hand is curled (1: a fist)
//   platform(source)       the flat hand: { cx, cy, ang, hx, hy, z (its top at the middle), nx, ny, nz (up), tilt, face } or null
//   platZ(q, x, y), onPlatform(q, x, y, margin)       the platform's top under (x, y); whether (x, y) is over it
//   castBox(from, dir, box)   a ray against a turned box { x, y, z, half, yaw } -> the distance along the ray, or null
//   pointAt(ray, things, room) what a pointing finger points at: the nearest box of the app's or plane of the room (or the floor)
(function (M) {
  const FIST_ON = 0.045, FIST_OFF = 0.06, FIST_MAX = 0.06, OPEN = 0.09;   // m, fingertips from the palm: a fist / let go / open
  const POINT = { straight: 0.92, straightOff: 0.85, out: 0.075, curled: 0.06, curledOff: 0.075 };
  const PLAT = { onTilt: 0.60, maxTilt: 0.80, inPlane: 0.03, thick: 0.015 };     // rad, rad, m, m (Nudgy's palm platform)
  const FINGERS = ['index', 'middle', 'ring', 'pinky'], KNUCKLES = [7, 12, 17, 22];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], len = (a) => Math.hypot(a[0], a[1], a[2]);

  const pt = (s, name) => (s.points || []).find((p) => p.name === name);
  const tipD = (s) => {
    const palm = pt(s, 'palm');
    if (!palm) return null;
    const d = FINGERS.map((f) => { const p = pt(s, f); return p ? Math.hypot(p.x - palm.x, p.y - palm.y, p.z - palm.z) : Infinity; });
    return d.every(Number.isFinite) ? d : null;
  };
  const curl = (s) => { const d = tipD(s); return d ? d.reduce((a, v) => a + v, 0) / 4 : Infinity; };
  function pinchAt(s) {
    const th = pt(s, 'thumb'), ix = pt(s, 'index'), c = pt(s, 'ctrl');
    if (th && ix) return [(th.x + ix.x) / 2, (th.y + ix.y) / 2, (th.z + ix.z) / 2];
    return c ? [c.x, c.y, c.z] : null;
  }
  function fistAt(s) {
    const ps = ['palm'].concat(FINGERS).map((n) => pt(s, n)).filter(Boolean).map((p) => [p.x, p.y, p.z]);
    for (const k of KNUCKLES) if (s.joints && s.joints[k]) ps.push(s.joints[k]);
    if (!ps.length) return null;
    return [0, 1, 2].map((i) => ps.reduce((a, p) => a + p[i], 0) / ps.length);
  }
  // how far a hand is curled: 0 open, 1 a fist (a controller: 0)
  function closing(s) { const d = curl(s); return Number.isFinite(d) ? Math.max(0, Math.min(1, (OPEN - d) / (OPEN - FIST_ON))) : 0; }
  // the index: how straight (its knuckle-to-tip distance over the length of its three bones) and how far out its tip is from the palm
  function indexShape(s) {
    const j = s.joints;
    if (!j || j.length < 25) return null;
    const bones = len(sub(j[7], j[6])) + len(sub(j[8], j[7])) + len(sub(j[9], j[8]));
    return { straight: bones > 1e-6 ? len(sub(j[9], j[6])) / bones : 0 };
  }
  function pointRay(s) {
    const j = s.joints, d = sub(j[9], j[6]), l = len(d) || 1;
    return { from: j[9].slice(), dir: d.map((v) => v / l) };
  }

  // The flat hand, from the wrist, the index, middle and little finger's knuckles and the middle fingertip (Nudgy's palmPlatform): a
  // rectangle from the wrist to the fingertips (to the knuckles when the fingers are curled), its top PLAT.thick above the joints, which
  // side is up (face: 'up' the palm, 'down' the back of the hand). null when the hand is steeper than PLAT.maxTilt or not a hand.
  function platform(s) {
    const j = s.joints;
    if (!j || j.length < 25) return null;
    const W = j[0], u = sub(j[6], W), v = sub(j[21], W);
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = len(n);
    if (!(l > 1e-6)) return null;
    // (index x little finger points out of the palm of a right hand and out of the back of a left one)
    const palmUp = (/left/.test(s.id) ? -n[2] : n[2]) > 0;          // (the other players' hands are 'p1-left' ...)
    n = n.map((c) => (n[2] < 0 ? -c : c) / l);
    const tilt = Math.acos(Math.min(1, n[2]));
    if (!(tilt <= PLAT.maxTilt)) return null;
    const t = sub(j[14], W), end = Math.abs(t[0] * n[0] + t[1] * n[1] + t[2] * n[2]) < PLAT.inPlane ? j[14] : j[11];
    const dx = end[0] - W[0], dy = end[1] - W[1], L = Math.hypot(dx, dy);
    if (!(L > 0.03)) return null;
    const cx = (W[0] + end[0]) / 2, cy = (W[1] + end[1]) / 2;
    const z = W[2] - (n[0] * (cx - W[0]) + n[1] * (cy - W[1])) / n[2] + PLAT.thick;
    return { cx, cy, ang: Math.atan2(dy, dx), hx: L / 2 + 0.005, hy: Math.hypot(j[6][0] - j[21][0], j[6][1] - j[21][1]) / 2 + 0.012, z, nx: n[0], ny: n[1], nz: n[2], tilt, face: palmUp ? 'up' : 'down' };
  }
  const platZ = (q, x, y) => q.z - (q.nx * (x - q.cx) + q.ny * (y - q.cy)) / q.nz;
  function onPlatform(q, x, y, m = 0) {
    const c = Math.cos(q.ang), s = Math.sin(q.ang), dx = x - q.cx, dy = y - q.cy;
    return Math.abs(c * dx + s * dy) <= q.hx + m && Math.abs(-s * dx + c * dy) <= q.hy + m;
  }
  // a ray (from, unit dir) against a box turned about the vertical: its middle (x, y, z), half its side, yaw -> distance or null
  function castBox(from, dir, b) {
    const c = Math.cos(b.yaw || 0), s = Math.sin(b.yaw || 0), h = b.half;
    const o = [c * (from[0] - b.x) + s * (from[1] - b.y), -s * (from[0] - b.x) + c * (from[1] - b.y), from[2] - b.z], d = [c * dir[0] + s * dir[1], -s * dir[0] + c * dir[1], dir[2]];
    let t0 = -Infinity, t1 = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (Math.abs(o[i]) > h) return null; continue; }
      let a = (-h - o[i]) / d[i], b2 = (h - o[i]) / d[i];
      if (a > b2) [a, b2] = [b2, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b2);
      if (t0 > t1) return null;
    }
    return t1 < 0 ? null : Math.max(0, t0);
  }

  // What a pointing ray hits (the POINT gesture's { from, dir }): the nearest of the app's things (boxes { id, label, x, y, z, half, yaw })
  // and the room (room.js cast: a table, a wall, the floor ...) -> { t, at: [x, y, z], what: 'thing' or the room's kind, label, id } or null
  function pointAt(ray, things, room, max = 8) {
    const r = M.room ? M.room.cast(room, ray.from, ray.dir, max) : null;
    let best = r ? { t: r.t, at: r.at, what: r.kind, label: r.label, id: null } : null;
    for (const th of things || []) {
      const t = castBox(ray.from, ray.dir, th);
      if (t !== null && t <= max && (!best || t < best.t)) best = { t, at: ray.from.map((v, i) => v + ray.dir[i] * t), what: 'thing', label: th.label || th.id, id: th.id };
    }
    return best;
  }

  class Grips {
    constructor(opts = {}) { this.state = new Map(); this.fist = new Map(); this.pt = new Map(); this.opts = Object.assign({ pinch: true, fist: true }, opts); }
    of(id) { return this.state.get(id) || { id, kind: null, start: false, end: false, at: null, point: null, palm: null, gesture: 'none', m: {} }; }
    update(sources) {
      const out = [], seen = new Set();
      for (const s of sources || []) {
        if (s.foot) continue;
        seen.add(s.id);
        const prev = this.state.get(s.id), was = prev ? prev.kind : null;
        const d = tipD(s), mean = d ? d.reduce((a, v) => a + v, 0) / 4 : Infinity, fw = this.fist.get(s.id) || false;
        const fistOn = this.opts.fist && (s.fist === true || (!!d && (fw ? mean < FIST_OFF : mean < FIST_ON && Math.max(...d) < FIST_MAX)));      // (s.fist: the desktop's Ctrl)
        this.fist.set(s.id, fistOn);
        const pinchOn = this.opts.pinch && !!s.pinch;
        const kind = was === 'fist' && fistOn ? 'fist' : was === 'pinch' && pinchOn ? 'pinch' : fistOn ? 'fist' : pinchOn ? 'pinch' : null;
        // pointing: the index straight and out, the other three curled in (with some slack once it points)
        const ix = indexShape(s), pw = this.pt.get(s.id) || false;
        const pointOn = !!ix && !!d && !kind && (pw
          ? ix.straight > POINT.straightOff && d[0] > POINT.out * 0.9 && Math.max(d[1], d[2], d[3]) < POINT.curledOff
          : ix.straight > POINT.straight && d[0] > POINT.out && Math.max(d[1], d[2], d[3]) < POINT.curled);
        this.pt.set(s.id, pointOn);
        const palm = platform(s), flat = !!palm && palm.tilt <= PLAT.onTilt && closing(s) < 0.3;
        const st = { id: s.id, kind, start: !!kind && kind !== was, end: !!was && kind !== was, was,
          at: kind === 'fist' ? fistAt(s) : kind === 'pinch' ? pinchAt(s) : null,
          point: pointOn ? pointRay(s) : null, palm,
          gesture: kind || (pointOn ? 'point' : flat ? 'flat' : d ? 'open' : 'none'),
          m: { tips: d, curl: mean, straight: ix ? ix.straight : null, pinchGap: (() => { const a = pt(s, 'thumb'), b = pt(s, 'index'); return a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : null; })(),
            tilt: palm ? palm.tilt : null, face: palm ? palm.face : null } };
        this.state.set(s.id, st);
        out.push(st);
      }
      for (const id of [...this.state.keys()]) if (!seen.has(id)) { this.state.delete(id); this.fist.delete(id); this.pt.delete(id); }
      return out;
    }
  }

  M.grab = { Grips, closing, pinchAt, fistAt, curl, platform, platZ, onPlatform, castBox, pointAt, FIST_ON, FIST_OFF, FIST_MAX, OPEN, POINT, PLAT };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
