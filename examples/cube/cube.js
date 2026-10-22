// The cube demo's own logic, with no THREE and no DOM (the headset page, the PC view and the Node tests all use it):
//   * the CUBE: a 12 cm cube on the floor. Every hand pushes it (each fingertip, the palm and every joint), and it is HELD when a thumb
//     and another fingertip touch it from opposite sides (the literal physical rule from Nudgy: no gesture, no pinch-in-the-air). It
//     falls when let go, slides and slows on the floor;
//   * its BODY adapter (MUMR body.js): the token 'cube' follows touch, the holder sends packet 16;
//   * the MENU: the same layout for this player's menu, another player's menu, and the PC view.
// The cube is simulated on this page's floor plan (x, y on the floor, z = height of its middle above this headset's floor).
(function (C) {
  const M = typeof module !== 'undefined' ? require('../../client/index.js') : globalThis.MUMR;
  const SIZE = 0.12, HALF = SIZE / 2;
  const COLOURS = ['#e8a33d', '#4ea1ff', '#7bd88f', '#ff6b81', '#c792ea'];
  const DEF = { gravity: 9.81, friction: 3.0, touch: 0.012, grab: 0.015, letGo: 0.035, smooth: 12, snap: 0.25, reach: 0.06, busy: 0.02 };

  // packet 16: x, y, z, yaw, vx, vy, vz (common frame), flags (1: held)
  M.wire.register({ type: 16, name: 'cube', token: 'cube',
    pack: (s) => { const b = new Uint8Array(32), d = new DataView(b.buffer); s.forEach((v, i) => d.setFloat32(i * 4, +v || 0, true)); return b; },
    unpack: (d) => { if (d.byteLength !== 32) return null; const s = []; for (let i = 0; i < 8; i++) s.push(d.getFloat32(i * 4, true)); return s.every(Number.isFinite) ? s : null; },
    blend: (a, b, f) => a.map((v, i) => (i === 3 ? v + Math.atan2(Math.sin(b[3] - v), Math.cos(b[3] - v)) * f : i === 7 ? a[7] : v + (b[i] - v) * f)) });

  class Cube {
    constructor(cfg = {}) {
      this.cfg = Object.assign({}, DEF, cfg);
      this.x = 0.5; this.y = 0; this.z = HALF; this.yaw = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.wz = 0;
      this.held = null;                     // { by: source id, off: [dx, dy, dz] } while a thumb and a finger hold it
      this.off = { x: 0, y: 0, z: 0, yaw: 0 }; // drawn = simulated + this (a correction from the holder, fading)
      this.prev = new Map();                // source id + point -> [x, y, z, t]: for the hands' speed
      this.touched = false;
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
    // one step of dt seconds at time t (s) with every hand there is (this page's and the others', floor plan)
    step(dt, t, sources) {
      const C = this.cfg, seen = new Set();
      this.touched = false;
      // holding: a thumb and another fingertip touch it from opposite sides
      for (const s of sources || []) {
        seen.add(s.id);
        const th = (s.points || []).find((p) => p.name === 'thumb'), others = (s.points || []).filter((p) => p.name !== 'thumb' && p.name !== 'palm');
        if (!th) continue;
        const lt = this.local(th.x, th.y, th.z), dt0 = this.dist(th.x, th.y, th.z);
        const opp = others.find((p) => { const l = this.local(p.x, p.y, p.z); return this.dist(p.x, p.y, p.z) < C.grab && lt[0] * l[0] + lt[1] * l[1] + lt[2] * l[2] < 0; });
        if (!this.held && dt0 < C.grab && opp) {
          const mid = [(th.x + opp.x) / 2, (th.y + opp.y) / 2, (th.z + opp.z) / 2];
          this.held = { by: s.id, finger: opp.name, off: [this.x - mid[0], this.y - mid[1], this.z - mid[2]] };
        }
        if (this.held && this.held.by === s.id) {
          const f = (s.points || []).find((p) => p.name === this.held.finger);
          if (!f || dt0 > C.letGo || this.dist(f.x, f.y, f.z) > C.letGo) { this.held = null; continue; }
          const mid = [(th.x + f.x) / 2, (th.y + f.y) / 2, (th.z + f.z) / 2], o = this.held.off;
          const nx = mid[0] + o[0], ny = mid[1] + o[1], nz = Math.max(HALF, mid[2] + o[2]);
          if (dt > 0) { this.vx = (nx - this.x) / dt; this.vy = (ny - this.y) / dt; this.vz = (nz - this.z) / dt; }
          this.x = nx; this.y = ny; this.z = nz; this.touched = true;
        }
      }
      if (this.held && !seen.has(this.held.by)) this.held = null;            // the hand was lost: it falls
      // pushing: every point and joint of every hand that is in the cube moves it out, with the hand's speed
      if (!this.held) {
        for (const s of sources || []) {
          const pts = (s.points || []).map((p) => [p.x, p.y, p.z]).concat(s.joints || []);
          pts.forEach((p, i) => {
            const v = this._vel(`${s.id}:${i}`, p, t), l = this.local(p[0], p[1], p[2]), r = C.touch;
            const px = HALF + r - Math.abs(l[0]), py = HALF + r - Math.abs(l[1]), pz = HALF + r - Math.abs(l[2]);
            if (px <= 0 || py <= 0 || pz <= 0) return;
            this.touched = true;
            const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
            if (pz < Math.min(px, py) && l[2] > 0) return;                    // (from above: it is not pressed into the floor)
            let ax, ay, depth;
            if (px < py) { ax = l[0] > 0 ? -1 : 1; ay = 0; depth = px; } else { ax = 0; ay = l[1] > 0 ? -1 : 1; depth = py; }
            const wx = c * ax - sn * ay, wy = sn * ax + c * ay;              // the push, on the floor
            this.x += wx * depth; this.y += wy * depth;
            const along = v[0] * wx + v[1] * wy;
            if (along > 0) { const cur = this.vx * wx + this.vy * wy; if (along > cur) { this.vx += wx * (along - cur); this.vy += wy * (along - cur); } }
            this.wz += (l[0] * ay - l[1] * ax) * Math.max(0, along) * 6;    // off the middle, it turns
          });
        }
        // free: it falls, and slides to a stop on the floor
        if (this.z > HALF || this.vz !== 0) { this.vz -= C.gravity * dt; this.z += this.vz * dt; if (this.z <= HALF) { this.z = HALF; this.vz = this.vz < -0.8 ? -this.vz * 0.2 : 0; } }
        this.x += this.vx * dt; this.y += this.vy * dt; this.yaw = M.util.wrap(this.yaw + this.wz * dt);
        if (this.z <= HALF + 1e-4) { const k = Math.exp(-C.friction * dt); this.vx *= k; this.vy *= k; this.wz *= k; if (Math.hypot(this.vx, this.vy) < 0.003) { this.vx = 0; this.vy = 0; } if (Math.abs(this.wz) < 0.01) this.wz = 0; }
      }
      if (Math.hypot(this.x, this.y) > 8) this.place(0.5, 0);             // (it went too far: back near the middle)
      const k = Math.exp(-C.smooth * dt);
      this.off.x *= k; this.off.y *= k; this.off.z *= k; this.off.yaw *= k;
    }
    place(x, y) { this.x = x; this.y = y; this.z = HALF; this.vx = this.vy = this.vz = this.wz = 0; this.held = null; }
    moving() { return !!this.held || Math.hypot(this.vx, this.vy, this.vz) > 0.002 || Math.abs(this.wz) > 0.01 || this.z > HALF + 1e-3; }
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
  const ACTIONS = M.lineup.ACTIONS.concat(['cubeHere', 'exit']);
  function press(id, st) {
    if (id === 'plus') return Object.assign({}, st, { count: st.count + 1 });
    if (id === 'colour') return Object.assign({}, st, { colour: (st.colour + 1) % COLOURS.length });
    if (id === 'ghost') return Object.assign({}, st, { ghost: !st.ghost });
    return null;
  }
  function menu(st, info) {
    info = info || {};
    if (info.lining) {
      return M.menus.grid({ w: 1024, title: 'Line up', note: info.note || '', top: [{ id: 'lineUp', label: 'Done', active: true, w: 180 }], rows: M.lineup.rowsFrom(info.fields, info.lined) });
    }
    return M.menus.grid({ w: 1024, title: 'MUMR cube', note: info.note || '', top: [{ id: 'lineUp', label: info.lined ? 'Lined up' : 'Line up', w: 200 }],
      rows: [
        [{ id: 'plus', label: 'Count', value: String(st.count) }, { id: 'colour', label: 'Cube colour', value: COLOURS[st.colour % COLOURS.length].slice(1), active: true }, { id: 'cubeHere', label: 'Cube here', value: 'in front of me' }],
        [{ id: 'ghost', label: 'Ghost fingers', value: st.ghost ? 'shown' : 'hidden', active: !!st.ghost }, { label: 'Players', value: String(info.players || 1) }, { id: 'exit', label: 'Exit', value: 'leave MR' }],
      ] });
  }

  Object.assign(C, { SIZE, HALF, COLOURS, Cube, adapter, GAME, PLAYER, ACTIONS, press, menu });
})(typeof module !== 'undefined' ? module.exports : (globalThis.CUBE = {}));
