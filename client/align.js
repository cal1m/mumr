// Several headsets in one room: one common frame for all, and how a player gets it. No THREE and no DOM.
// From Nudgy (simulator/mr/align.js); Space and turnQ are new (they replace four copies of the same conversion).
//
// Every headset has its own floor frame (x, y on the floor, as everywhere in the mixed-reality page; its origin and
// its heading are wherever that headset happened to start). A `frame` says where the COMMON frame lies in a
// headset's own one: { x, y (the common origin), yaw (the direction of the common x axis) }.
//
// With touched points the common origin IS spot 1 on the real floor and the common x axis points at spot 2, for
// every player. So nobody needs anybody else's numbers: each player turns what it sends into the common frame
// (toCommon) and what it gets back into its own (fromCommon). It also means that the marks at spots 1 and 2 agree
// between the players whatever the error: a check needs a third spot (see Aligner.armCheck).
//
// The floors are taken as level and as the same floor; each headset keeps its own floor height.
(function (M) {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // The frame from two touched points [x, y] (own coordinates), or null when they are too close to give a direction.
  function fromPoints(p1, p2, minDist = 0.15) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dist = Math.hypot(dx, dy);
    if (dist < minDist) return null;
    return { x: p1[0], y: p1[1], yaw: Math.atan2(dy, dx), dist, how: 'points' };
  }
  // The frame from a pose of a space both headsets share, in the headset's own XR frame: its position (X, Y, Z) and
  // its orientation as a quaternion. On the floor: x = X, y = -Z; the heading is where its -Z axis (forward) points.
  function fromPose(pos, quat) {
    const { x, y, z, w } = quat;
    const fx = -(2 * (x * z + w * y)), fz = -(1 - 2 * (x * x + y * y));      // forward (0, 0, -1) turned by the quaternion
    return { x: pos.x, y: -pos.z, yaw: Math.atan2(-fz, fx), how: 'shared' };
  }

  // a point of the common frame in the headset's own, and back; and a heading
  const fromCommon = (f, x, y) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw); return [f.x + c * x - s * y, f.y + s * x + c * y]; };
  const toCommon = (f, x, y) => { const c = Math.cos(f.yaw), s = Math.sin(f.yaw), dx = x - f.x, dy = y - f.y; return [c * dx + s * dy, -s * dx + c * dy]; };
  const yawToCommon = (f, th) => wrap(th - f.yaw);
  const yawFromCommon = (f, th) => wrap(th + f.yaw);

  // The turn and shift that take a point of headset A's frame into headset B's: { yaw, x, y } with
  // b = R(yaw) a + (x, y). fa, fb: each one's frame.
  function between(fa, fb) {
    const yaw = wrap(fb.yaw - fa.yaw), c = Math.cos(yaw), s = Math.sin(yaw);
    return { yaw, x: fb.x - (c * fa.x - s * fa.y), y: fb.y - (s * fa.x + c * fa.y) };
  }
  const apply = (t, x, y) => { const c = Math.cos(t.yaw), s = Math.sin(t.yaw); return [t.x + c * x - s * y, t.y + s * x + c * y]; };
  const invert = (t) => { const c = Math.cos(t.yaw), s = Math.sin(t.yaw); return { yaw: -t.yaw, x: -(c * t.x + s * t.y), y: -(-s * t.x + c * t.y) }; };
  const IDENTITY = { yaw: 0, x: 0, y: 0 };

  // The headset moves the origin of its reference space (taken off and put on, recentred): a `reset` event with a `transform`, the pose of the NEW origin in
  // the OLD coordinates. As a frame on the floor (own convention: x = X, y = -Z, the heading turns counter-clockwise), a point of the new coordinates is
  // fromCommon(frame, ...) in the old ones, and toCommon(frame, ...) takes an old point into the new. pos: { x, y, z }, quat: { x, y, z, w }.
  function frameFromPose(pos, quat) {
    const { x, y, z, w } = quat;
    return { x: pos.x, y: -pos.z, yaw: Math.atan2(2 * (w * y - x * z), 1 - 2 * (y * y + z * z)) };
  }
  // The frame b given in a's: the pose of the second origin in the coordinates a is in (two resets in a row make one)
  const compose = (a, b) => { const o = fromCommon(a, b.x, b.y); return { x: o[0], y: o[1], yaw: wrap(a.yaw + b.yaw) }; };
  // A pose { x, y, yaw } given in the coordinates a frame is in, in the frame's own
  const poseIn = (f, p) => { const o = toCommon(f, p.x, p.y); return { x: o[0], y: o[1], yaw: wrap(p.yaw - f.yaw) }; };

  // How far off a spot `far` metres from the first point can be, when each touch is off by up to `touch` metres and
  // the two points are `dist` apart: the shift of the origin plus the turn times the distance.
  const errorAt = (dist, far, touch = 0.01) => touch + (2 * touch / Math.max(1e-6, dist)) * far;

  const DEF = {
    // m: a fingertip lower than this is on the floor. Not 3 cm: on Marek's Quest 3 (2026-10-13) a fingertip resting
    // on the floor read 60 to 70 mm above the headset's floor, steadily; on his Quest Pro 3 cm was enough.
    floor: 0.10,
    still: 0.010,      // m: and one that stays within this of where it has been on average...
    dwell: 10,         // s: ...for this long takes the spot: the average of that time. (No pinch: pinching moves the fingertip.)
    minDist: 0.15,     // m: the second spot at least this far from the first
    // Fine adjustment: each taken spot has three knobs, one for each direction (along the line to the other spot,
    // across it, up). A pinch that starts at a knob holds it; the knob then follows the hand along its direction
    // and the spot moves a twentieth as far. Spot 3 (the check mark) has them too: its "other spot" is spot 1.
    knob: 0.10,        // m: how far a knob sits from its spot (the "up" one: this far above it, plus `knobUp`)
    knobUp: 0.06,
    grab: 0.04,        // m: a pinch this near a knob takes it
    fine: 1 / 20,
  };
  const AXES = ['along', 'across', 'up'];

  // Taking the two spots, and moving them afterwards. Call update() every frame while the player is lining up.
  // A spot is [x, y, z]: where it is on the floor plan, and how high this headset has it (a fingertip resting on
  // the floor is not at height 0 for every headset: the floors differ by centimetres).
  class Aligner {
    constructor(cfg = {}) {
      this.cfg = Object.assign({}, DEF, cfg);
      this.rev = 0;                    // counts every change of the line-up (the spots, their locks, the check mark): the page saves when it moves
      this.restart();
    }
    restart() {
      this.rev++;
      this.points = [null, null];      // own coordinates, [x, y, z]
      this.frame = null;
      this.progress = 0;               // 0..1: how far the resting fingertip is towards taking its spot
      this.at = null;                  // [x, y, z] where that fingertip rests (for the ring that fills)
      this.held = -1;                  // the spot whose knob a pinch holds (0, 1 or 2), or -1
      this.grabbed = null;             // { i, axis, pull }: that knob, and how far the hand has pulled it (m)
      this.lastCheck = null;           // the check mark (spot 3) [x, y, z], common frame: z is its height above the common floor
      this.counter = 0;                // which spot a resting fingertip takes next on its own: 0 = spot 1, 1 = spot 2, 2 = none
      this.target = null;              // a spot asked for with create(): 0, 1 or 2 (the check mark). It wins over the counter
      this.locked = [false, false, false];    // a locked spot cannot be moved, replaced or deleted
      this._tips = new Map();          // id -> what that fingertip has been doing
    }
    // Lining up is entered (again): the next fingertip takes spot 1, then spot 2. The spots that are there stay (with
    // their knobs, and the frame stays in force) until the new ones replace them; a locked spot is skipped.
    beginSession() {
      this.counter = 0; this.target = null;
      this.held = -1; this.grabbed = null; this.progress = 0; this.at = null;
      this._tips.clear();
    }
    // The line-up as numbers that outlive a session of the headset. `f` is the frame of something that stays where it is
    // in the room between sessions (a persistent anchor), in this session's own coordinates: the spots are kept as
    // where they are seen from there, and load() puts them back in a later session, whatever its own frame is then.
    save(f) {
      const to = (p) => (p ? toCommon(f, p[0], p[1]).concat([p[2] || 0]) : null);
      return { v: 1, pts: this.points.map(to), locked: this.locked.slice(), check: this.lastCheck ? this.lastCheck.slice() : null };
    }
    // Take a saved line-up back. false (and nothing changed): it is not a line-up, or there is no frame to put it in.
    load(d, f) {
      if (!d || d.v !== 1 || !Array.isArray(d.pts) || d.pts.length !== 2 || !f || ![f.x, f.y, f.yaw].every(Number.isFinite)) return false;
      const good = (p) => p === null || (Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite));
      if (!d.pts.every(good) || !d.pts.some(Boolean)) return false;
      this.points = d.pts.map((p) => (p ? fromCommon(f, p[0], p[1]).concat([p[2] || 0]) : null));
      this.lastCheck = Array.isArray(d.check) && (d.check.length === 2 || d.check.length === 3) && d.check.every(Number.isFinite) ? [d.check[0], d.check[1], d.check[2] || 0] : null;      // (an older save has no height)
      this.locked = [0, 1, 2].map((i) => !!(d.locked && d.locked[i]) && !!(i === 2 ? this.lastCheck : this.points[i]));
      this.frame = null; this.target = null; this.held = -1; this.grabbed = null; this.progress = 0; this.at = null; this._tips.clear();
      this.counter = this.points[0] ? (this.points[1] ? 2 : 1) : 0;
      if (this._refit()) this.frame.restored = true;
      this.rev++;
      return true;
    }
    // The headset moved its own origin (its reference space was reset: taken off and put on again) while something fixed to the room did not (the persistent
    // anchor): the spots, which are real places on the floor, are now somewhere else in this headset's own coordinates. `from` and `to` are the anchor's frame
    // in the old and in the new coordinates ({ x, y, yaw } on the floor plan). The spots and the frame follow; the check mark is in the common frame and
    // stays. The line-up is the same one in the real room, so what other players know of it (how far apart the spots are) does not change.
    rebase(from, to) {
      const T = (x, y) => { const q = toCommon(from, x, y); return fromCommon(to, q[0], q[1]); };
      this.points = this.points.map((p) => { if (!p) return p; const q = T(p[0], p[1]); return [q[0], q[1]].concat(p.slice(2)); });
      if (this.frame) { const o = T(this.frame.x, this.frame.y); this.frame = Object.assign({}, this.frame, { x: o[0], y: o[1], yaw: wrap(this.frame.yaw + to.yaw - from.yaw) }); }
      this._tips.clear(); this.grabbed = null; this.held = -1; this.progress = 0; this.at = null;      // (what the hands were doing was in the old coordinates)
      this.rev++;
    }
    // Lining up is left: nothing is waited for any more.
    endSession() { this.target = null; this.held = -1; this.grabbed = null; this.progress = 0; this.at = null; this._tips.clear(); }
    // What a resting fingertip takes now: 0, 1 (the calibration spots), 2 (the check mark) or null (nothing).
    want() {
      if (this.target !== null) return this.target;
      for (let i = this.counter; i < 2; i++) if (!this.locked[i]) return i;
      return null;
    }
    _release() { for (const s of this._tips.values()) s.grab = null; this.grabbed = null; this.held = -1; }
    // The three buttons of a spot, which the panel shows while lining up. Each says what happened.
    //   create: the next resting fingertip takes this spot (again: not any more)   'armed' | 'cancelled' | 'locked' | 'needframe'
    //   remove: forget this spot (spot 3: the check mark)                           'deleted' | 'empty' | 'locked'
    //   lock:   freeze this spot                                                     'locked' | 'unlocked' | 'empty' | 'none'
    create(i) {
      if (i === 2 && !this.frame) return 'needframe';
      if (this.locked[i]) return 'locked';
      if (this.want() === i) { this.target = null; this.counter = 2; return 'cancelled'; }      // it was waited for already: stop waiting
      this.target = i;
      return 'armed';
    }
    remove(i) {
      if (this.locked[i]) return 'locked';
      if (i === 2) { if (!this.lastCheck) return 'empty'; if (this.grabbed && this.grabbed.i === 2) this._release(); this.lastCheck = null; this.rev++; if (this.target === 2) this.target = null; return 'deleted'; }
      if (!this.points[i]) return 'empty';
      if (this.grabbed && (this.grabbed.i === i || this.grabbed.i === 2)) this._release();      // (the check mark's knobs need the frame, which goes with a spot)
      this.points[i] = null;
      this.rev++;
      this.frame = null;                                        // with a spot gone, the two rooms are not lined up
      this.counter = Math.min(this.counter, i);                 // and it is the next one to be taken
      if (this.target === i || this.target === 2) this.target = null;      // (a check mark needs a line-up: it is not waited for now)
      return 'deleted';
    }
    lock(i) {
      if (!(i === 2 ? this.lastCheck : this.points[i])) return 'empty';
      this.locked[i] = !this.locked[i];
      this.rev++;
      if (this.locked[i] && this.grabbed && this.grabbed.i === i) this._release();
      if (this.locked[i] && i === 2 && this.target === 2) this.target = null;
      return this.locked[i] ? 'locked' : 'unlocked';
    }
    // What the panel shows for the three spots: [{ placed, locked, armed, left (seconds), mm (height of the spot: of spot 3 above the common floor) }]
    fields() {
      const w = this.want(), dwell = this.cfg.dwell;
      return [0, 1, 2].map((i) => ({ placed: i === 2 ? !!this.lastCheck : !!this.points[i], locked: this.locked[i], armed: w === i,
        left: w === i && this.progress > 0 ? Math.ceil(dwell * (1 - this.progress)) : null,
        mm: i === 2 ? (this.lastCheck ? Math.round((this.lastCheck[2] || 0) * 1000) : null) : this.points[i] ? Math.round((this.points[i][2] || 0) * 1000) : null }));
    }
    // The check mark where this headset sees it: [x, y, z] (z above this headset's floor), or null without a check mark or without a frame.
    checkOwn() {
      const f = this.frame, c = this.lastCheck;
      if (!f || !c) return null;
      const p = fromCommon(f, c[0], c[1]);
      return [p[0], p[1], (f.z || 0) + (c[2] || 0)];
    }
    // A frame that came from somewhere else (a rehearsal on the PC, a space the headsets share).
    use(frame) { this.restart(); this.frame = frame ? Object.assign({ dist: 0, z: 0, how: 'given' }, frame) : null; }
    // The next spot taken is not a calibration spot: it is a check mark at a third spot. Needs a frame.
    armCheck() { if (!this.frame || this.locked[2]) return false; this.target = 2; return true; }
    get checking() { return this.target === 2; }
    _refit() {
      const [a, b] = this.points;
      const f = a && b ? fromPoints(a, b, this.cfg.minDist) : null;
      if (f) { f.z = ((a[2] || 0) + (b[2] || 0)) / 2; this.frame = f; }      // the common floor: where the two spots lie
      return !!f;
    }
    // The three directions at spot i, as unit vectors on the floor plan (the third is straight up).
    _spot(i) { return i === 2 ? this.checkOwn() : this.points[i]; }
    _dirs(i) {
      const p = this._spot(i), o = i === 2 ? this.points[0] : this.points[1 - i];      // (the check mark's other spot is spot 1)
      let ax = 1, ay = 0;
      if (p && o) { const d = Math.hypot(o[0] - p[0], o[1] - p[1]); if (d > 1e-6) { ax = (o[0] - p[0]) / d; ay = (o[1] - p[1]) / d; } }
      return { along: [-ax, -ay, 0], across: [-ay, ax, 0], up: [0, 0, 1] };      // (along: away from the other spot, so the knob is not between them)
    }
    // Move spot i by `by` metres along dir (own coordinates). false: nothing moved (it would put spots 1 and 2 on top of each other).
    _nudge(i, dir, by) {
      if (i === 2) {
        const f = this.frame, c = this.lastCheck;
        if (!f || !c) return false;
        const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw), dx = dir[0] * by, dy = dir[1] * by;      // (the check mark is kept in the common frame)
        this.lastCheck = [c[0] + cs * dx + sn * dy, c[1] - sn * dx + cs * dy, (c[2] || 0) + dir[2] * by];
        return true;
      }
      const p = this.points[i], old = p.slice();
      p[0] += dir[0] * by; p[1] += dir[1] * by; p[2] = (p[2] || 0) + dir[2] * by;
      if (this.points[0] && this.points[1] && !this._refit()) { p[0] = old[0]; p[1] = old[1]; p[2] = old[2]; return false; }
      return true;
    }
    // The knobs to draw and to take: [{ i, axis, x, y, z, held, pull }]
    knobs() {
      const out = [], C = this.cfg, g = this.grabbed;
      [0, 1, 2].forEach((i) => {
        const p = this._spot(i);
        if (!p || this.locked[i]) return;                      // a locked spot has no knobs
        const D = this._dirs(i);
        for (const axis of AXES) {
          const d = D[axis], r = axis === 'up' ? C.knob + C.knobUp : C.knob, held = !!g && g.i === i && g.axis === axis, pull = held ? g.pull : 0;
          out.push({ i, axis, held, pull, x: p[0] + d[0] * (r + pull), y: p[1] + d[1] * (r + pull), z: (p[2] || 0) + (axis === 'up' ? r + pull : 0.02) });
        }
      });
      return out;
    }
    // tips: the index fingertips now, [{ id, x, y, z (above this headset's floor), pinch }]. Returns what happened
    // in this frame: 'took1' / 'took2' (spot 1 or 2 was taken or replaced), 'tooClose', 'moved' (spot 1 or 2), 'movedCheck', 'check' or null.
    update(dt, tips) {
      const C = this.cfg, seen = new Set();
      let result = null, progress = 0, at = null;
      for (const tip of tips || []) {
        if (!Number.isFinite(tip.x) || !Number.isFinite(tip.y) || !Number.isFinite(tip.z)) continue;
        seen.add(tip.id);
        let s = this._tips.get(tip.id);
        if (!s) this._tips.set(tip.id, s = { t: 0, n: 0, sx: 0, sy: 0, sz: 0, spent: null, pinch: false, grab: null });
        // ---- fine adjustment: a pinch that starts at a knob holds it until the pinch ends
        if (tip.pinch && !s.pinch && !this.grabbed) {
          let best = null, bd = C.grab;
          for (const k of this.knobs()) { const d = Math.hypot(tip.x - k.x, tip.y - k.y, tip.z - k.z); if (d < bd) { bd = d; best = k; } }
          if (best) { s.grab = { i: best.i, axis: best.axis, x: tip.x, y: tip.y, z: tip.z, dir: this._dirs(best.i)[best.axis] }; this.grabbed = { i: best.i, axis: best.axis, pull: 0 }; this.held = best.i; }
        }
        if (!tip.pinch && s.grab) { s.grab = null; this.grabbed = null; this.held = -1; }
        s.pinch = !!tip.pinch;
        if (s.grab) {
          const g = s.grab;
          const step = (tip.x - g.x) * g.dir[0] + (tip.y - g.y) * g.dir[1] + (tip.z - g.z) * g.dir[2];      // how far the hand went along the knob's direction
          g.x = tip.x; g.y = tip.y; g.z = tip.z;
          this.grabbed.pull += step;
          if (this._nudge(g.i, g.dir, step * C.fine) && step !== 0) { result = g.i === 2 ? 'movedCheck' : 'moved'; this.rev++; }      // (not onto the other spot)
          s.t = 0; s.n = 0;
          continue;
        }
        // ---- taking a spot: resting on the floor, not pinching, for long enough. The spot is where it was on average.
        const want = this.want();
        if (tip.z >= C.floor || tip.pinch) { s.t = 0; s.n = 0; s.spent = null; continue; }
        if (s.spent) { if (Math.hypot(tip.x - s.spent[0], tip.y - s.spent[1]) > 0.05) s.spent = null; else continue; }      // it has to leave before it can take another
        if (want === null || (want === 2 && !this.frame)) { s.t = 0; s.n = 0; continue; }
        if (s.n && Math.hypot(tip.x - s.sx / s.n, tip.y - s.sy / s.n) > C.still) { s.t = 0; s.n = 0; }      // it moved: start again from here
        s.n++; s.sx += s.n === 1 ? tip.x - s.sx : tip.x; s.sy += s.n === 1 ? tip.y - s.sy : tip.y; s.sz += s.n === 1 ? tip.z - s.sz : tip.z;
        s.t += dt;
        const mean = [s.sx / s.n, s.sy / s.n, s.sz / s.n];
        if (s.t < C.dwell) { if (s.t / C.dwell > progress) { progress = s.t / C.dwell; at = mean; } continue; }
        s.t = 0; s.n = 0; s.spent = mean;
        if (want === 2) { this.target = null; this.lastCheck = toCommon(this.frame, mean[0], mean[1]).concat([0]); result = 'check'; this.rev++; }      // (it rests on the common floor: the up knob lifts it)
        else {
          const o = this.points[1 - want];
          if (o && Math.hypot(mean[0] - o[0], mean[1] - o[1]) < C.minDist) result = 'tooClose';        // (it stays wanted: try again)
          else {
            this.points[want] = mean;
            if (o) this._refit();
            if (this.target === want) this.target = null;
            this.counter = Math.max(this.counter, want + 1);
            result = want === 0 ? 'took1' : 'took2';
            this.rev++;
          }
        }
      }
      for (const [id, s] of this._tips) if (!seen.has(id)) { if (s.grab) { this.grabbed = null; this.held = -1; } this._tips.delete(id); }      // a hand that tracking lost lets go
      this.progress = progress; this.at = at;
      return result;
    }
  }

  // What a headset's own anchor (the persistent one the marks and the saved line-up hang on) does when the reference space is reset. Measured on a Quest Pro
  // (2026-10-22): the anchor's pose did not change at all while the origin moved by about 80 cm and turned, so the anchor is no help to find the room again;
  // the reset event's transform is. Others may follow the world. So: the page puts every reset's transform on what it keeps in its own coordinates (the
  // spots: Aligner.rebase), and this decides what the anchor's pose means afterwards, once the resets have stopped (a few come in a row, some of them wild):
  //   followed   the anchor is where the origin move says it must be: it is world-locked, its pose is used as it is
  //   stale      the anchor still has the pose it had: it went with the origin. Its pose is carried across by the move, from now on
  //   unknown    neither: its pose is used as it is
  class Resets {
    constructor() { this.G = null; this.burst = null; }
    // A reset arrived: F = frameFromPose of its transform; t in ms; pre = the anchor's pose now (null: no anchor)
    begin(F, t, pre) {
      if (!this.burst) this.burst = { pre: pre || null, F: IDENTITY, t };
      this.burst.F = compose(this.burst.F, F); this.burst.t = t;
    }
    pending() { return !!this.burst; }
    drop() { this.burst = null; }
    ready(t, quiet = 800) { return !!this.burst && t - this.burst.t >= quiet; }
    // The anchor's pose as the page's coordinates now have it, from the pose the headset reports
    effective(raw) { return this.G ? poseIn(this.G, raw) : raw; }
    // The resets have stopped; raw = the anchor's reported pose. -> { kind, moved: [m, rad] (how far it is from where the move says it should be, and from where it was) }
    settle(raw, tol = { d: 0.05, a: 0.05 }) {
      const b = this.burst; this.burst = null;
      if (!b || !b.pre) return { kind: 'none' };
      const now = this.effective(raw), want = poseIn(b.F, b.pre);
      const off = (p, q) => [Math.hypot(p.x - q.x, p.y - q.y), Math.abs(wrap(p.yaw - q.yaw))];
      const toWant = off(now, want), toWas = off(now, b.pre), ok = (o) => o[0] <= tol.d && o[1] <= tol.a;
      if (ok(toWant)) return { kind: 'followed', toWant, toWas };
      if (ok(toWas)) { this.G = this.G ? compose(this.G, b.F) : Object.assign({}, b.F); return { kind: 'stale', toWant, toWas }; }
      return { kind: 'unknown', toWant, toWas };
    }
  }

  // A turn about the vertical (THREE's Y axis) by `a`, applied after the quaternion q = [x, y, z, w]
  function turnQ(a, q) {
    const s = Math.sin(a / 2), c = Math.cos(a / 2), [x2, y2, z2, w2] = q;
    return [c * x2 + s * z2, c * y2 + s * w2, c * z2 - s * x2, c * w2 - s * y2];
  }

  // One headset's way into the common frame and back: its frame (from a line-up: where the common frame lies in this headset's floor
  // plan, and frame.z, the common floor's height above this headset's own floor) and floorY (where this headset's floor is in its XR
  // space). Everything that is sent goes through here; nothing else should know the conventions:
  //   floor plan   x, y on the floor (x = XR X, y = -XR Z), headings counter-clockwise; heights above THIS headset's floor
  //   XR space     [X, Y up, Z towards you at the start], metres
  //   common       x, y on the floor of the common frame, heights above the COMMON floor; a turn about the vertical is the same
  //                turn in the floor plan and about XR Y
  class Space {
    constructor(frame = null, floorY = 0) { this.set(frame, floorY); }
    set(frame, floorY = this.floorY || 0) { this.frame = frame || null; this.floorY = +floorY || 0; return this; }
    get ok() { return !!this.frame; }
    get fz() { return (this.frame && this.frame.z) || 0; }
    // floor plan <-> common, [x, y] or [x, y, height]
    toCommon(p) { const c = toCommon(this.frame, p[0], p[1]); return p.length > 2 ? [c[0], c[1], p[2] - this.fz] : c; }
    fromCommon(c) { const p = fromCommon(this.frame, c[0], c[1]); return c.length > 2 ? [p[0], p[1], c[2] + this.fz] : p; }
    yawToCommon(th) { return yawToCommon(this.frame, th); }
    yawFromCommon(th) { return yawFromCommon(this.frame, th); }
    // XR space <-> common, [X, Y, Z] <-> [x, y, height above the common floor]
    xrToCommon(p) { const c = toCommon(this.frame, p[0], -p[2]); return [c[0], c[1], p[1] - this.floorY - this.fz]; }
    commonToXr(c) { const q = fromCommon(this.frame, c[0], c[1]); return [q[0], c[2] + this.fz + this.floorY, -q[1]]; }
    // an XR orientation [x, y, z, w] <-> the same orientation in the common frame (only the turn about the vertical differs)
    quatToCommon(q) { return turnQ(-this.frame.yaw, q); }
    quatFromCommon(q) { const r = turnQ(this.frame.yaw, q), l = Math.hypot(r[0], r[1], r[2], r[3]) || 1; return r.map((v) => v / l); }
    // a pose { x, y, yaw, h } on the floor plan (h above this headset's floor) <-> common
    poseToCommon(p) { const c = toCommon(this.frame, p.x, p.y); return Object.assign({}, p, { x: c[0], y: c[1], yaw: yawToCommon(this.frame, p.yaw || 0), h: (p.h || 0) - this.fz }); }
    poseFromCommon(p) { const c = fromCommon(this.frame, p.x, p.y); return Object.assign({}, p, { x: c[0], y: c[1], yaw: yawFromCommon(this.frame, p.yaw || 0), h: (p.h || 0) + this.fz }); }
  }

  M.align = { fromPoints, fromPose, fromCommon, toCommon, yawToCommon, yawFromCommon, between, apply, invert, errorAt, IDENTITY, wrap, frameFromPose, compose, poseIn, turnQ, Space, Resets, Aligner, DEF, AXES };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
