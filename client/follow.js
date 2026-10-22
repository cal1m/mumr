// Where a panel floats. It stays where it is while you are near it, however you turn. When you walk away it comes
// after you like something on a lead: straight towards you until it is close again, so it ends up on the side you
// left it on (it was in front of you, you turn right and walk: it is on your left). Dragging it sets how close and
// how high it keeps to you; `locked` pins it to the room. No THREE, no DOM. From Nudgy (simulator/mr/follow.js).
//
// Poses are on the floor plan: { x, y } on the floor, h = height in XR space (XR Y), yaw = the direction the panel
// faces, pitch = how far it leans back (rad). head = { x, y, th, py }.
(function (M) {
  const DEF = {
    dist: 0.55,        // m, how far from you it settles
    bearing: -0.5,     // rad from straight ahead, for where it first appears; negative = to your right
    drop: 0.42,        // m below your eyes: chest height
    tilt: 0.6,         // share of the angle up to your eyes that it leans back
    minH: 0.45,        // m, never lower than this
    maxDist: 1.0,      // m: farther than this from you and it comes after you...
    minDist: 0.25,     // ...and closer than this, it backs off
    dropTol: 0.3,      // m: you sat down or stood up
    awayTime: 0.5,     // s that must last before it moves
    rate: 4,           // 1/s, how fast it glides
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  class Follower {
    constructor(cfg = {}) {
      this.cfg = Object.assign({}, DEF, cfg);
      this.off = { dist: this.cfg.dist, drop: this.cfg.drop };
      this.pose = null; this.locked = false; this.moving = false;
      this._away = 0;
    }
    _face(p, head) {
      p.yaw = Math.atan2(head.y - p.y, head.x - p.x);
      p.pitch = this.cfg.tilt * Math.atan2(head.py - p.h, Math.max(0.2, Math.hypot(head.x - p.x, head.y - p.y)));
      return p;
    }
    _height(head) { return Math.max(this.cfg.minH, head.py - this.off.drop); }
    // Where it first appears: ahead of you and to the side, at its distance and height.
    snap(head) {
      const a = head.th + this.cfg.bearing;
      this.pose = this._face({ x: head.x + this.off.dist * Math.cos(a), y: head.y + this.off.dist * Math.sin(a), h: this._height(head) }, head);
      this.moving = false; this._away = 0;
      return this.pose;
    }
    // Put it at an exact pose (a panel that is placed by the page, not relative to the user).
    set(pose) { this.pose = Object.assign({}, pose); this.moving = false; this._away = 0; return this.pose; }
    // The user dragged it to (x, y, h): it stays there, turned to face them, and keeps that distance and height.
    place(x, y, h, head) {
      this.off = { dist: clamp(Math.hypot(x - head.x, y - head.y), 0.3, 0.9), drop: clamp(head.py - h, -0.4, 0.9) };
      this.pose = this._face({ x, y, h }, head);
      this.moving = false; this._away = 0;
      return this.pose;
    }
    // Call every frame. `busy`: a hand is at the panel (poking, dragging), so it must not move away from under it.
    update(head, dt, busy) {
      if (!this.pose) return this.snap(head);
      const C = this.cfg, p = this.pose;
      if (this.locked || busy) { this.moving = false; this._away = 0; return p; }
      const dx = p.x - head.x, dy = p.y - head.y, d = Math.hypot(dx, dy), wantH = this._height(head);
      const far = d > C.maxDist || d < C.minDist || Math.abs(p.h - wantH) > C.dropTol;
      this._away = far ? this._away + dt : 0;
      if (!this.moving && this._away > C.awayTime) this.moving = true;
      if (this.moving) {
        // along the line between you and it, to its distance from you; which way you look plays no part
        const ux = d > 1e-3 ? dx / d : Math.cos(head.th), uy = d > 1e-3 ? dy / d : Math.sin(head.th);
        const gx = head.x + ux * this.off.dist, gy = head.y + uy * this.off.dist, k = 1 - Math.exp(-C.rate * dt);
        p.x += (gx - p.x) * k; p.y += (gy - p.y) * k; p.h += (wantH - p.h) * k;
        this._face(p, head);
        if (Math.hypot(gx - p.x, gy - p.y, wantH - p.h) < 0.01) { this.moving = false; this._away = 0; }
      }
      return p;
    }
  }

  // The card at the inside of a wrist. Everything here is in the headset's frame (x right, y up, z towards you).
  // j: the points [x, y, z] of the wrist and of the index, middle and little finger's knuckles; side: 'left' or
  // 'right'; eye: where the eyes are; fwd: the unit vector they look along.
  // Returns where the card's middle is (pos), its axes (right, up, normal: normal points out of the palm side of
  // the forearm), `facing` (1 = the inside of the wrist looks straight at the eyes, 0 = edge on, < 0 = turned away)
  // and how far it is from the eyes (dist). The card sits a little up the forearm from the wrist and clear of the
  // skin, and its top is the top for whoever looks at it, however the arm is turned.
  const WRIST = { along: 0.06, off: 0.05, show: 0.64, hide: 0.50, far: 0.9 };
  function wristCard(j, side, eye, fwd) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
    // wrist -> index knuckle crossed with wrist -> little finger knuckle points out of the palm of a right hand
    let n = unit(cross(sub(j.index, j.wrist), sub(j.pinky, j.wrist)));
    const arm = unit(sub(j.wrist, j.middle));                      // from the hand towards the elbow
    if (!n || !arm) return null;
    if (side === 'left') n = [-n[0], -n[1], -n[2]];
    const pos = [0, 1, 2].map((i) => j.wrist[i] + arm[i] * WRIST.along + n[i] * WRIST.off);
    const toEye = sub(eye, pos), dist = Math.hypot(toEye[0], toEye[1], toEye[2]), facing = dist > 1e-6 ? dot(n, toEye) / dist : 0;
    // upright for the reader: the head's own up (no roll), laid into the card's plane; looking straight down, the
    // forearm's direction instead
    const k = fwd[1], headUp = unit([-fwd[0] * k, 1 - fwd[1] * k, -fwd[2] * k]) || arm;
    let up = unit(sub(headUp, n.map((c) => c * dot(headUp, n))));
    if (!up) up = unit(sub(arm, n.map((c) => c * dot(arm, n))));
    if (!up) return null;
    return { pos, normal: n, up, right: cross(up, n), facing, dist };
  }

  M.follow = { DEF, Follower, WRIST, wristCard };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
