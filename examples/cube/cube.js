// The cube demo's own logic, with no THREE and no DOM (the headset page, the PC view and the Node tests all use it):
//   * the CUBE: a 12 cm cube on the floor. Every hand pushes it (each fingertip, the palm and every joint), except a hand that is closing
//     on it (about to grip it, or on two sides of it). It is HELD by either grip of the engine (client/grab.js): a pinch (index and thumb
//     touching) that starts within 3 cm of it, or a fist that closes with its middle within 8 cm of it. The hold is a spring: the cube follows the hand
//     but is stopped by whatever is in the way, and a hand that pulls more than 30 cm away (through a wall) lets go. It falls when let
//     go, slides and slows on the floor; with a room (cube.room: room.js, this page's floor plan) it rests on tables and on solid
//     objects, passes under tables, stops at walls and objects, and never goes through anything: it moves in 1 cm steps;
//   * its BODY adapter (MUMR body.js): the token 'cube' follows touch, the holder sends packet 16;
//   * the MENU: the app's own (the engine's menu, with Line up, Room setup and Exit, is on the wrist: client/sysmenu.js); the same layout
//     for this player's menu, another player's menu, and the PC view.
// The cube is simulated on this page's floor plan (x, y on the floor, z = height of its middle above this headset's floor).
(function (C) {
  const M = typeof module !== 'undefined' ? require('../../client/index.js') : globalThis.MUMR;
  const SIZE = 0.12, HALF = SIZE / 2;
  const COLOURS = ['#e8a33d', '#4ea1ff', '#7bd88f', '#ff6b81', '#c792ea'];
  const DEF = { gravity: 9.81, friction: 3.0, touch: 0.012, grab: 0.03, grabFist: 0.08, spring: 20, holdSpeed: 5, breakAway: 0.3,
    smooth: 12, snap: 0.25, reach: 0.06, busy: 0.02, tip: 2.5, closeNear: 0.05 };
  const R = HALF * 1.3;          // the cube against walls and objects: a round thing a little wider than its half (its corners are at 1.41)
  const STEP = 0.01;             // m, the longest single move (shorter than R: nothing can be passed in one step)

  // packet 16: x, y, z, yaw, vx, vy, vz (common frame), flags (1: held)
  M.wire.register({ type: 16, name: 'cube', token: 'cube',
    pack: (s) => { const b = new Uint8Array(32), d = new DataView(b.buffer); s.forEach((v, i) => d.setFloat32(i * 4, +v || 0, true)); return b; },
    unpack: (d) => { if (d.byteLength !== 32) return null; const s = []; for (let i = 0; i < 8; i++) s.push(d.getFloat32(i * 4, true)); return s.every(Number.isFinite) ? s : null; },
    blend: (a, b, f) => a.map((v, i) => (i === 3 ? v + Math.atan2(Math.sin(b[3] - v), Math.cos(b[3] - v)) * f : i === 7 ? a[7] : v + (b[i] - v) * f)) });

  const pt = (s, name) => (s.points || []).find((p) => p.name === name);
  // a hand that is closing on the cube: the thumb and index coming together, or the fingers curling, near it (it is about to grip)
  function closingOn(cube, s, C) {
    if (cube.nearest([s]) > C.closeNear) return false;
    const th = pt(s, 'thumb'), ix = pt(s, 'index');
    return (th && ix && Math.hypot(th.x - ix.x, th.y - ix.y, th.z - ix.z) < 0.06) || M.grab.closing(s) > 0.5;
  }

  class Cube {
    constructor(cfg = {}) {
      this.cfg = Object.assign({}, DEF, cfg);
      this.x = 0.5; this.y = 0; this.z = HALF; this.yaw = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.wz = 0;
      this.held = null;                     // { by: source id, kind: 'pinch' | 'fist', off: [dx, dy, dz] } while a grip holds it
      this.off = { x: 0, y: 0, z: 0, yaw: 0 }; // drawn = simulated + this (a correction from the holder, fading)
      this.prev = new Map();                // source id + point -> [x, y, z, t]: for the hands' speed
      this.grips = new M.grab.Grips();      // everybody's pinches and fists
      this.touched = false;
      this.room = null;                     // the room (room.js local()), or null: the floor only
      this.ground = HALF;                   // the height of its middle when it rests where it is
    }
    // a point in the cube's own frame (its middle, turned with it)
    local(x, y, z) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw), dx = x - this.x, dy = y - this.y; return [c * dx + s * dy, -s * dx + c * dy, z - this.z]; }
    // how far a point is from the cube's surface (0 inside)
    dist(x, y, z) { const l = this.local(x, y, z); return Math.hypot(Math.max(0, Math.abs(l[0]) - HALF), Math.max(0, Math.abs(l[1]) - HALF), Math.max(0, Math.abs(l[2]) - HALF)); }
    nearest(sources) {
      let best = Infinity;
      for (const s of sources || []) {
        for (const p of s.points || []) best = Math.min(best, this.dist(p.x, p.y, p.z));
        for (const j of s.joints || []) best = Math.min(best, this.dist(j[0], j[1], j[2]));
      }
      return best;
    }
    _vel(key, p, t) {
      const q = this.prev.get(key), v = q && t > q[3] ? [(p[0] - q[0]) / (t - q[3]), (p[1] - q[1]) / (t - q[3]), (p[2] - q[2]) / (t - q[3])] : [0, 0, 0];
      this.prev.set(key, [p[0], p[1], p[2], t]);
      return v.map((c) => Math.max(-4, Math.min(4, c)));
    }
    // What it stands on at (x, y) with its bottom at `bottom`: the highest support under any of nine points of its footprint (the middle,
    // the corners and the middles of the sides), so it cannot drop through a gap narrower than itself. -> { h, mid (under the middle),
    // off: [x, y] from the middle towards the points that carry it }
    _ground(x, y, bottom) {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw), k = HALF * 0.9, pts = [];
      for (const a of [-k, 0, k]) for (const b of [-k, 0, k]) pts.push([x + c * a - s * b, y + s * a + c * b]);
      const hs = pts.map((q) => M.room.support(this.room, q[0], q[1], bottom)), h = Math.max(...hs);
      let ox = 0, oy = 0, n = 0;
      hs.forEach((v, i) => { if (v >= h - 0.005) { ox += pts[i][0] - x; oy += pts[i][1] - y; n++; } });
      return { h, mid: hs[4], off: [ox / n, oy / n] };
    }
    // Move by (dx, dy, dz) in steps no longer than STEP, against the room: up into a table's underside, down onto what carries it, and
    // sideways out of walls and objects, always back to the side it came from. -> { hitWall: [nx, ny] or null, landed, ceiling }
    _move(dx, dy, dz) {
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / STEP)), out = { hitWall: null, landed: false, ceiling: false };
      for (let i = 0; i < n; i++) {
        let z = this.z + dz / n;
        if (dz > 0) { const top = M.room.ceiling(this.room, this.x, this.y, this.z + HALF - 0.005); if (z + HALF > top) { z = top - HALF; out.ceiling = true; } }
        const g = HALF + this._ground(this.x, this.y, Math.min(this.z, z) - HALF).h;
        if (z < g) { z = g; out.landed = true; }
        this.z = z;
        const fx = this.x, fy = this.y;
        this.x += dx / n; this.y += dy / n;
        const w = M.room.pushOut(this.room, this.x, this.y, this.z - HALF + 0.005, this.z + HALF - 0.005, R, [fx, fy]);
        if (w) { this.x = w.x; this.y = w.y; out.hitWall = [w.nx, w.ny]; }
      }
      return out;
    }
    // one step of dt seconds at time t (s) with every hand there is (this page's and the others', floor plan)
    step(dt, t, sources) {
      const C = this.cfg, grips = this.grips.update(sources);
      this.touched = false;
      // holding: a grip of the engine (client/grab.js) that starts at the cube: a pinch within C.grab of it, a fist within C.grabFist.
      // It holds while that grip lasts (Marek: "nothing clever").
      for (const g of grips) {
        if (this.held && this.held.by === g.id && g.kind !== this.held.kind) this.held = null;
        if (!this.held && g.start && g.at && this.dist(g.at[0], g.at[1], g.at[2]) <= (g.kind === 'fist' ? C.grabFist : C.grab)) {
          this.held = { by: g.id, kind: g.kind, off: [this.x - g.at[0], this.y - g.at[1], this.z - g.at[2]] };
        }
      }
      if (this.held && !grips.some((g) => g.id === this.held.by)) this.held = null;            // the hand was lost: it falls
      if (this.held) {
        // the hold is a spring: the cube goes towards where the hand wants it, at most holdSpeed, and stops at whatever is in the way
        const g = grips.find((q) => q.id === this.held.by), o = this.held.off;
        const ex = g.at[0] + o[0] - this.x, ey = g.at[1] + o[1] - this.y, ez = g.at[2] + o[2] - this.z, e = Math.hypot(ex, ey, ez);
        if (e > C.breakAway) this.held = null;                                                  // (pulled away through something: it stays)
        else {
          const k = Math.min(C.spring, e > 0 ? C.holdSpeed / e : C.spring), x0 = this.x, y0 = this.y, z0 = this.z;
          this._move(ex * k * dt, ey * k * dt, ez * k * dt);
          if (dt > 0) { this.vx = (this.x - x0) / dt; this.vy = (this.y - y0) / dt; this.vz = (this.z - z0) / dt; }
          this.wz = 0; this.touched = true;
        }
      }
      if (!this.held) {
        // pushing: every point and joint of every hand that is in the cube moves it out, with the hand's speed; not a hand that is
        // closing on it (about to grip) or that touches it from two sides at once (it is holding it, not pushing it)
        for (const s of sources || []) {
          if (s.foot || closingOn(this, s, C)) continue;
          const pts = (s.points || []).map((p) => [p.x, p.y, p.z]).concat(s.joints || []), pushes = [];
          pts.forEach((p, i) => {
            const v = this._vel(`${s.id}:${i}`, p, t), l = this.local(p[0], p[1], p[2]), r = C.touch;
            const px = HALF + r - Math.abs(l[0]), py = HALF + r - Math.abs(l[1]), pz = HALF + r - Math.abs(l[2]);
            if (px <= 0 || py <= 0 || pz <= 0) return;
            if (pz < Math.min(px, py) && l[2] > 0) return;                    // (from above: it is not pressed into the floor)
            const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
            let ax, ay, depth;
            if (px < py) { ax = l[0] > 0 ? -1 : 1; ay = 0; depth = px; } else { ax = 0; ay = l[1] > 0 ? -1 : 1; depth = py; }
            pushes.push({ wx: c * ax - sn * ay, wy: sn * ax + c * ay, depth, v, l, ax, ay });
          });
          if (!pushes.length) continue;
          this.touched = true;
          if (pushes.some((a) => pushes.some((b) => a.wx * b.wx + a.wy * b.wy < -0.5))) continue;      // (on two sides)
          for (const q of pushes) {
            const hit = this._move(q.wx * q.depth, q.wy * q.depth, 0);
            const along = q.v[0] * q.wx + q.v[1] * q.wy;
            if (along > 0 && !hit.hitWall) { const cur = this.vx * q.wx + this.vy * q.wy; if (along > cur) { this.vx += q.wx * (along - cur); this.vy += q.wy * (along - cur); } }
            this.wz += (q.l[0] * q.ay - q.l[1] * q.ax) * Math.max(0, along) * 6;    // off the middle, it turns
          }
        }
        // free: it falls onto what carries it, tips off an edge it hangs over, slides to a stop, and stops at walls and objects
        const G = this._ground(this.x, this.y, this.z - HALF), g = HALF + G.h, resting = this.z <= g + 1e-4 && this.vz <= 0;
        if (!resting) this.vz -= C.gravity * dt;
        else if (G.mid < G.h - 0.01) {                                       // (its middle hangs over a lower place: it slides off that way)
          const ol = Math.hypot(G.off[0], G.off[1]);
          if (ol > HALF * 0.15) { this.vx -= (G.off[0] / ol) * C.tip * dt; this.vy -= (G.off[1] / ol) * C.tip * dt; }
        }
        this.yaw = M.util.wrap(this.yaw + this.wz * dt);
        const hit = this._move(this.vx * dt, this.vy * dt, resting ? 0 : this.vz * dt);
        if (hit.landed && this.vz < 0) this.vz = this.vz < -0.8 ? -this.vz * 0.2 : 0;
        if (hit.ceiling && this.vz > 0) this.vz = 0;
        if (hit.hitWall) { const [nx, ny] = hit.hitWall, into = this.vx * nx + this.vy * ny; if (into < 0) { this.vx -= 1.3 * into * nx; this.vy -= 1.3 * into * ny; } }
        this.ground = HALF + this._ground(this.x, this.y, this.z - HALF).h;
        if (this.z <= this.ground + 1e-4 && this.vz <= 0) {
          const k = Math.exp(-C.friction * dt); this.vx *= k; this.vy *= k; this.wz *= k;
          if (Math.hypot(this.vx, this.vy) < 0.003) { this.vx = 0; this.vy = 0; }
          if (Math.abs(this.wz) < 0.01) this.wz = 0;
        }
      }
      if (Math.hypot(this.x, this.y) > 8) this.place(0.5, 0);             // (it went too far: back near the middle)
      const k = Math.exp(-C.smooth * dt);
      this.off.x *= k; this.off.y *= k; this.off.z *= k; this.off.yaw *= k;
    }
    place(x, y) { this.x = x; this.y = y; this.z = HALF; this.vx = this.vy = this.vz = this.wz = 0; this.held = null; }
    moving() { return !!this.held || Math.hypot(this.vx, this.vy, this.vz) > 0.002 || Math.abs(this.wz) > 0.01 || this.z > this.ground + 1e-3; }
    drawn() { return { x: this.x + this.off.x, y: this.y + this.off.y, z: this.z + this.off.z, yaw: this.yaw + this.off.yaw, held: !!this.held }; }
  }

  // The Body adapter: this page's hands (`own`, floor plan) decide whether it reaches; the state goes out in the common frame.
  function adapter(cube, space) {
    const C = cube.cfg, rot = (yaw, x, y) => M.align.toCommon({ x: 0, y: 0, yaw }, x, y);
    return {
      reach: (own) => cube.nearest(own) <= C.reach,
      touching: (own) => cube.nearest(own) <= C.busy || (!!cube.held && (own || []).some((s) => s.id === cube.held.by)),
      pack: () => {
        const p = space.toCommon([cube.x, cube.y, cube.z]), v = rot(space.frame.yaw, cube.vx, cube.vy);
        return [p[0], p[1], p[2], space.yawToCommon(cube.yaw), v[0], v[1], cube.vz, cube.held ? 1 : 0];
      },
      apply: (s, info) => {
        if (!space.ok) return false;
        const p = space.fromCommon([s[0], s[1], s[2]]), v = rot(-space.frame.yaw, s[4], s[5]), was = cube.drawn();
        cube.x = p[0]; cube.y = p[1]; cube.z = p[2]; cube.yaw = space.yawFromCommon(s[3]); cube.vx = v[0]; cube.vy = v[1]; cube.vz = s[6]; cube.wz = 0; cube.held = null;
        const far = info.first || Math.hypot(was.x - cube.x, was.y - cube.y, was.z - cube.z) > C.snap;
        cube.off = far ? { x: 0, y: 0, z: 0, yaw: 0 } : { x: was.x - cube.x, y: was.y - cube.y, z: was.z - cube.z, yaw: M.util.wrap(was.yaw - cube.yaw) };
        cube.heldByOther = s[7] > 0.5;
        return true;
      },
      settle: () => {},
      do: (what, args) => {
        if (what === 'place' && M.util.num(args.x) && M.util.num(args.y)) { const p = space.ok ? space.fromCommon([args.x, args.y]) : [args.x, args.y]; cube.place(p[0], p[1]); return true; }
        return false;
      },
      moving: () => cube.moving(),
    };
  }

  // ---- the menu, for whoever draws it: state = that player's (session.stateOf), info = what its owner says about it (lining up ...)
  const GAME = { count: 0, colour: 0 };
  const PLAYER = { ghost: true };
  const ACTIONS = ['cubeHere'];                    // (the app's own; the engine's are client/sysmenu.js SysMenu.ACTIONS)
  function press(id, st) {
    if (id === 'plus') return Object.assign({}, st, { count: st.count + 1 });
    if (id === 'colour') return Object.assign({}, st, { colour: (st.colour + 1) % COLOURS.length });
    if (id === 'ghost') return Object.assign({}, st, { ghost: !st.ghost });
    return null;
  }
  function menu(st, info) {
    info = info || {};
    return M.menus.grid({ w: 1024, title: 'MUMR cube', note: info.note || '',
      rows: [
        [{ id: 'plus', label: 'Count', value: String(st.count) }, { id: 'colour', label: 'Cube colour', value: COLOURS[st.colour % COLOURS.length].slice(1), active: true }, { id: 'cubeHere', label: 'Cube here', value: 'in front of me' }],
        [{ id: 'ghost', label: 'Ghost fingers', value: st.ghost ? 'shown' : 'hidden', active: !!st.ghost }, { label: 'Players', value: String(info.players || 1) }],
      ] });
  }

  Object.assign(C, { SIZE, HALF, R, COLOURS, Cube, adapter, GAME, PLAYER, ACTIONS, press, menu });
})(typeof module !== 'undefined' ? module.exports : (globalThis.CUBE = {}));
