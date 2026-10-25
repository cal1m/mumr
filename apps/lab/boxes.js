// The lab's own logic, with no THREE and no DOM (the headset page and the Node tests both use it):
//   * World: N boxes of 12 cm (axis-aligned: no turning) that hands push, pinch and fist-grab, with CUBE-TO-CUBE CONTACT: a box stands on
//     the highest box under its footprint (as room.js `support` does for tables), and boxes that overlap sideways are pushed apart in the
//     same 1 cm steps as the room's walls. This is the contact that apps/cube/cube.js does not have, for the pile and the island.
//   * Watch: what the island experiment counts (token hand-overs, jumps of a box, whether the stack stayed together).
//   * Drift: the line-up drift probe (a fingertip resting on a printed cross, once a minute).
//   * Perf: frame time and simulation time for the pile.
//   * the menu and the settings.
(function (L) {
  const M = typeof module !== 'undefined' ? require('../../engine/client/index.js') : globalThis.MUMR;
  const SIZE = 0.12, HALF = SIZE / 2, R = HALF * 1.3, STEP = 0.01, MAX_BOXES = 50, ISLAND = 5, FIRST_TYPE = 17;
  const CFG = { gravity: 9.81, friction: 3, touch: 0.012, grab: 0.03, grabFist: 0.08, spring: 20, holdSpeed: 5, breakAway: 0.3, closeNear: 0.05, reach: 0.06, busy: 0.02, tip: 2.5 };
  const SIDE = SIZE - 0.004;            // two boxes closer than this (both ways) are on top of each other, not side by side
  const pt = (s, name) => (s.points || []).find((p) => p.name === name);

  // packets 17..21, one per island box (a token each, today's rule): x, y, z, yaw (unused), vx, vy, vz (common frame), flags (1: held)
  const TYPES = Array.from({ length: ISLAND }, (_, i) => ({ type: FIRST_TYPE + i, name: `lab${i + 1}`, token: `b${i + 1}` }));
  for (const t of TYPES) {
    M.wire.register({ type: t.type, name: t.name, token: t.token,
      pack: (s) => { const b = new Uint8Array(32), d = new DataView(b.buffer); s.forEach((v, i) => d.setFloat32(i * 4, +v || 0, true)); return b; },
      unpack: (d) => { if (d.byteLength !== 32) return null; const s = []; for (let i = 0; i < 8; i++) s.push(d.getFloat32(i * 4, true)); return s.every(Number.isFinite) ? s : null; },
      blend: (a, b, f) => a.map((v, i) => (i === 7 ? a[7] : v + (b[i] - v) * f)) });
  }

  class World {
    constructor(n) {
      this.grips = new M.grab.Grips();
      this.prev = new Map();               // source id + point -> [x, y, z, t]: the hands' speed
      this.room = null;                    // room.js local(), or null: the floor only
      this.boxes = [];
      this.cfg = Object.assign({}, CFG);
      this.layout('grid', n);
    }
    // 'grid': n boxes in rows on the floor (from `at`); 'stack': a tower; 'pile': a heap of boxes dropped around `at`
    layout(kind, n, at = [0.5, 0]) {
      const N = Math.max(1, Math.min(MAX_BOXES, n | 0)), cols = Math.ceil(Math.sqrt(N));
      this.boxes = Array.from({ length: N }, (_, i) => {
        const b = { x: at[0], y: at[1], z: HALF, vx: 0, vy: 0, vz: 0, held: null, other: false, off: { x: 0, y: 0, z: 0 }, ground: HALF };
        if (kind === 'grid') { b.x += (i % cols) * 0.2 - ((cols - 1) * 0.2) / 2; b.y += Math.floor(i / cols) * 0.2 - ((cols - 1) * 0.2) / 2; }
        else if (kind === 'stack') b.z = HALF + i * SIZE;
        else { const a = i * 2.4, r = 0.05 + 0.045 * (i % 7); b.x += Math.cos(a) * r; b.y += Math.sin(a) * r; b.z = HALF + 0.05 + i * 0.07; }
        return b;
      });
      this.prev.clear();
    }
    // how far a point is from a box's surface (0 inside)
    dist(b, x, y, z) { return Math.hypot(Math.max(0, Math.abs(x - b.x) - HALF), Math.max(0, Math.abs(y - b.y) - HALF), Math.max(0, Math.abs(z - b.z) - HALF)); }
    nearest(b, sources) {
      let best = Infinity;
      for (const s of sources || []) {
        for (const p of s.points || []) best = Math.min(best, this.dist(b, p.x, p.y, p.z));
        for (const j of s.joints || []) best = Math.min(best, this.dist(b, j[0], j[1], j[2]));
      }
      return best;
    }
    // the height of what a box at (x, y) with its bottom at `bottom` stands on: the highest of the room's support (nine points of the
    // footprint, as the cube does) and of the boxes under it
    ground(b, x, y, bottom) {
      const k = HALF * 0.9;
      let h = 0;
      for (const a of [-k, 0, k]) for (const c of [-k, 0, k]) h = Math.max(h, M.room.support(this.room, x + a, y + c, bottom));
      for (const o of this.boxes) {
        if (o === b || Math.abs(o.x - x) >= SIDE || Math.abs(o.y - y) >= SIDE) continue;
        const top = o.z + HALF;
        if (top <= bottom + 0.03 && top > h) h = top;
      }
      return h;
    }
    // A box that rests with its middle past the edge of the box under it tips off (as the cube does off a table's edge): the way off, as a
    // unit vector, or null. Only boxes carry it here (the room's edges are the cube's business).
    tipOff(b) {
      let ox = 0, oy = 0, top = 0, mid = false;
      for (const o of this.boxes) {
        if (o === b || Math.abs(o.x - b.x) >= SIDE || Math.abs(o.y - b.y) >= SIDE || Math.abs(o.z + HALF - (b.z - HALF)) > 0.005) continue;
        top = o.z + HALF;
        ox += b.x - o.x; oy += b.y - o.y;
        if (Math.abs(o.x - b.x) < HALF && Math.abs(o.y - b.y) < HALF) mid = true;
      }
      const l = Math.hypot(ox, oy);
      return top && !mid && l > 1e-6 ? [ox / l, oy / l] : null;
    }
    // Move by (dx, dy, dz) in steps no longer than STEP: up into a table's underside, down onto what carries it, sideways out of walls.
    move(b, dx, dy, dz) {
      const n = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / STEP)), out = { hitWall: null, landed: false, ceiling: false };
      for (let i = 0; i < n; i++) {
        let z = b.z + dz / n;
        if (dz > 0) { const top = M.room.ceiling(this.room, b.x, b.y, b.z + HALF - 0.005); if (z + HALF > top) { z = top - HALF; out.ceiling = true; } }
        const g = HALF + this.ground(b, b.x, b.y, Math.min(b.z, z) - HALF);
        if (z < g) { z = g; out.landed = true; }
        b.z = z;
        const fx = b.x, fy = b.y;
        b.x += dx / n; b.y += dy / n;
        const w = M.room.pushOut(this.room, b.x, b.y, b.z - HALF + 0.005, b.z + HALF - 0.005, R, [fx, fy]);
        if (w) { b.x = w.x; b.y = w.y; out.hitWall = [w.nx, w.ny]; }
      }
      return out;
    }
    // Boxes that overlap sideways (and by more than a centimetre up and down) are pushed apart along the shorter way out. A held box does
    // not give way; a box that is pushed takes the speed of what pushes it.
    contacts() {
      const B = this.boxes;
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
        const a = B[i], c = B[j], dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z;
        const ox = SIZE - Math.abs(dx), oy = SIZE - Math.abs(dy), oz = SIZE - Math.abs(dz);
        if (ox <= 0 || oy <= 0 || oz <= 0.01) continue;
        const wa = a.held || a.steer ? 0 : 1, wc = c.held || c.steer ? 0 : 1;
        if (!wa && !wc) continue;
        const ax = ox < oy ? 'x' : 'y', v = 'v' + ax, s = (ax === 'x' ? dx : dy) >= 0 ? 1 : -1, o = ax === 'x' ? ox : oy;
        a[ax] -= s * o * (wa / (wa + wc)); c[ax] += s * o * (wc / (wa + wc));
        if ((c[v] - a[v]) * s < 0) {
          if (!wa) c[v] = a[v]; else if (!wc) a[v] = c[v]; else { const m = (a[v] + c[v]) / 2; a[v] = c[v] = m; }
        }
      }
    }
    _vel(key, p, t) {
      const q = this.prev.get(key), v = q && t > q[3] ? [(p[0] - q[0]) / (t - q[3]), (p[1] - q[1]) / (t - q[3]), (p[2] - q[2]) / (t - q[3])] : [0, 0, 0];
      this.prev.set(key, [p[0], p[1], p[2], t]);
      return v.map((c) => Math.max(-4, Math.min(4, c)));
    }
    // a hand that is closing on a box (about to grip it): the thumb and index coming together, or the fingers curling, near it
    _closing(b, s) {
      if (this.nearest(b, [s]) > this.cfg.closeNear || this.grips.of(s.id).gesture === 'point') return false;
      const th = pt(s, 'thumb'), ix = pt(s, 'index');
      return (th && ix && Math.hypot(th.x - ix.x, th.y - ix.y, th.z - ix.z) < 0.05) || M.grab.closing(s) > 0.6;
    }
    // one frame of dt seconds at time t (s) with every hand there is (floor plan)
    step(dt, t, sources) {
      const C = this.cfg, B = this.boxes, grips = this.grips.update(sources), noHold = new Set((sources || []).filter((s) => s.noHold).map((s) => s.id));
      // holding: a pinch starting within C.grab of a box, or a fist within C.grabFist; it lasts while the grip does
      for (const b of B) if (b.held && !grips.some((g) => g.id === b.held.by && g.kind === b.held.kind)) b.held = null;
      for (const g of grips) {
        if (!g.start || !g.at || !g.kind || noHold.has(g.id) || B.some((b) => b.held && b.held.by === g.id)) continue;
        const lim = g.kind === 'fist' ? C.grabFist : C.grab;
        let best = null, bd = Infinity;
        for (const b of B) { const d = this.dist(b, g.at[0], g.at[1], g.at[2]); if (!b.held && d <= lim && d < bd) { best = b; bd = d; } }
        if (best) best.held = { by: g.id, kind: g.kind, off: [best.x - g.at[0], best.y - g.at[1], best.z - g.at[2]] };
      }
      // pushing: every point and joint of every hand that is in a free box moves it out, with the hand's speed
      for (const s of sources || []) {
        if (s.foot) continue;
        const pts = (s.points || []).map((p) => [p.x, p.y, p.z]).concat(s.joints || []), vel = pts.map((p, i) => this._vel(`${s.id}:${i}`, p, t));
        if (!pts.length) continue;
        for (const b of B) {
          if (b.held || b.steer || Math.hypot(b.x - pts[0][0], b.y - pts[0][1]) > 0.6 && this.nearest(b, [s]) > 0.1 || this._closing(b, s)) continue;
          const pushes = [];
          pts.forEach((p, i) => {
            const lx = p[0] - b.x, ly = p[1] - b.y, lz = p[2] - b.z, px = HALF + C.touch - Math.abs(lx), py = HALF + C.touch - Math.abs(ly), pz = HALF + C.touch - Math.abs(lz);
            if (px <= 0 || py <= 0 || pz <= 0) return;
            if (pz < Math.min(px, py) && lz > 0) return;                    // (from above: it is not pressed into what it stands on)
            if (px < py) pushes.push({ wx: lx > 0 ? -1 : 1, wy: 0, depth: px, v: vel[i] }); else pushes.push({ wx: 0, wy: ly > 0 ? -1 : 1, depth: py, v: vel[i] });
          });
          if (!pushes.length || pushes.some((a) => pushes.some((c) => a.wx * c.wx + a.wy * c.wy < -0.5))) continue;      // (on two sides: it is held, not pushed)
          for (const q of pushes) {
            const hit = this.move(b, q.wx * q.depth, q.wy * q.depth, 0), along = q.v[0] * q.wx + q.v[1] * q.wy;
            if (along > 0 && !hit.hitWall) { const cur = b.vx * q.wx + b.vy * q.wy; if (along > cur) { b.vx += q.wx * (along - cur); b.vy += q.wy * (along - cur); } }
          }
        }
      }
      // physics in short sub-steps, so that a box does not pass another in one
      const n = Math.min(6, Math.max(1, Math.ceil(dt / 0.008))), h = dt / n;
      for (let k = 0; k < n; k++) {
        for (const b of B) {
          if (b.held || b.steer) {
            // held by a grip, or steered from the room model (b.steer: [x, y, z]): the same spring
            let tx, ty, tz;
            if (b.held) { const g = grips.find((q) => q.id === b.held.by), o = b.held.off; tx = g.at[0] + o[0]; ty = g.at[1] + o[1]; tz = g.at[2] + o[2]; }
            else [tx, ty, tz] = b.steer;
            const ex = tx - b.x, ey = ty - b.y, ez = tz - b.z, e = Math.hypot(ex, ey, ez);
            if (b.held && e > C.breakAway) { b.held = null; continue; }
            const f = Math.min(C.spring, e > 0 ? C.holdSpeed / e : C.spring), x0 = b.x, y0 = b.y, z0 = b.z;
            this.move(b, ex * f * h, ey * f * h, ez * f * h);
            b.vx = (b.x - x0) / h; b.vy = (b.y - y0) / h; b.vz = (b.z - z0) / h;
            continue;
          }
          const g = HALF + this.ground(b, b.x, b.y, b.z - HALF), resting = b.z <= g + 1e-4 && b.vz <= 0;
          if (resting) {
            b.vz = 0;
            const tip = this.tipOff(b);
            if (tip) { b.vx += tip[0] * C.tip * h; b.vy += tip[1] * C.tip * h; }
            else if (!b.vx && !b.vy) { b.ground = g; continue; }
          }
          if (!resting) b.vz -= C.gravity * h;
          const hit = this.move(b, b.vx * h, b.vy * h, resting ? 0 : b.vz * h);
          if (hit.landed && b.vz < 0) b.vz = b.vz < -0.8 ? -b.vz * 0.2 : 0;
          if (hit.ceiling && b.vz > 0) b.vz = 0;
          if (hit.hitWall) { const [nx, ny] = hit.hitWall, into = b.vx * nx + b.vy * ny; if (into < 0) { b.vx -= 1.3 * into * nx; b.vy -= 1.3 * into * ny; } }
          b.ground = HALF + this.ground(b, b.x, b.y, b.z - HALF);
          if (b.z <= b.ground + 1e-4 && b.vz <= 0) {
            const f = Math.exp(-C.friction * h); b.vx *= f; b.vy *= f;
            if (Math.hypot(b.vx, b.vy) < 0.003) { b.vx = 0; b.vy = 0; }
          }
        }
        this.contacts();
      }
      const f = Math.exp(-12 * dt);
      for (const b of B) {
        b.off.x *= f; b.off.y *= f; b.off.z *= f;
        if (Math.hypot(b.x, b.y) > 8) { b.x = 0.5; b.y = 0; b.z = HALF; b.vx = b.vy = b.vz = 0; b.held = null; }
      }
    }
    isMoving(b) { return !!b.held || !!b.steer || Math.hypot(b.vx, b.vy, b.vz) > 0.002 || b.z > b.ground + 1e-3; }
    movingCount() { return this.boxes.filter((b) => this.isMoving(b)).length; }
    drawn(b) { return { x: b.x + b.off.x, y: b.y + b.off.y, z: b.z + b.off.z, held: !!b.held || !!b.steer || b.other }; }
  }

  // The island box as a Body adapter (the same shape as the cube's). A World simulates in the COMMON frame (every page's boxes are then
  // turned the same way, whatever its line-up), so the state goes out as it is; `common(sources)` turns this page's hands (floor plan)
  // into it. `active()` says whether the island experiment is on (the boxes are not touched, or claimed, in the other modes).
  function adapter(world, i, common, active) {
    const b = () => world.boxes[i], C = world.cfg;
    return {
      reach: (own) => active() && (!!b().steer || world.nearest(b(), common(own)) <= C.reach),            // (steered from this page's room model: it takes it)
      touching: (own) => active() && (!!b().steer || world.nearest(b(), common(own)) <= C.busy || (!!b().held && (own || []).some((s) => s.id === b().held.by))),
      pack: () => { const q = b(); return [q.x, q.y, q.z, 0, q.vx, q.vy, q.vz, q.held || q.steer ? 1 : 0]; },
      apply: (s, info) => {
        if (!active()) return false;
        const q = b(), was = world.drawn(q);
        q.x = s[0]; q.y = s[1]; q.z = s[2]; q.vx = s[4]; q.vy = s[5]; q.vz = s[6]; q.held = null;
        const far = info.first || Math.hypot(was.x - q.x, was.y - q.y, was.z - q.z) > 0.25;
        q.off = far ? { x: 0, y: 0, z: 0 } : { x: was.x - q.x, y: was.y - q.y, z: was.z - q.z };
        q.other = s[7] > 0.5;
        return true;
      },
      settle: (mine) => { if (mine) b().other = false; },
      do: () => false,
      moving: () => world.isMoving(b()),
    };
  }

  // A hand source (floor plan) in the common frame: what a World simulates with. toCommon([x, y, z]) -> [x, y, z].
  function commonSource(s, toCommon) {
    const out = Object.assign({}, s);
    if (s.points) out.points = s.points.map((p) => { const c = toCommon([p.x, p.y, p.z]); return Object.assign({}, p, { x: c[0], y: c[1], z: c[2] }); });
    if (s.joints) out.joints = s.joints.map((j) => toCommon(j));
    return out;
  }
  // the document's kind for a drift touch: the latest of each player, so that the others can compare theirs with it
  const KINDS = { drift: {
    keep: (e) => ({ key: `drift:${e.slot}` }),
    apply(S, e) { if ([e.x, e.y, e.round, e.slot].every(Number.isFinite)) { S.doc.drift = S.doc.drift || {}; S.doc.drift[e.slot] = { x: e.x, y: e.y, round: e.round }; S.notify('drift', e); } },
  } };

  // ---- the island's numbers, once a second: token hand-overs, jumps of a box (> 2 cm from where its speed said it would be), and whether
  // the stack stayed together (every box within one box's width of the bottom one, in a column)
  class Watch {
    constructor() { this.last = null; this.jumps = 0; this.handovers = 0; this.at = null; this.worstJump = 0; }
    // call every drawn frame; dt: seconds since the last one
    frame(world, dt) {
      const now = world.boxes.map((b) => world.drawn(b));
      if (this.last && this.last.length === now.length && dt > 0) {
        now.forEach((d, i) => {
          const b = world.boxes[i], p = this.last[i], e = Math.hypot(d.x - (p.x + b.vx * dt), d.y - (p.y + b.vy * dt), d.z - (p.z + b.vz * dt));
          if (e > 0.02) { this.jumps++; this.worstJump = Math.max(this.worstJump, e); }
        });
      }
      this.last = now;
    }
    together(world) {
      const B = world.boxes, base = B[0];
      return B.every((b, i) => Math.abs(b.x - base.x) < SIZE && Math.abs(b.y - base.y) < SIZE && b.z > base.z - 0.01 && (i === 0 || b.z - B[i - 1].z < SIZE * 1.5));
    }
    // handovers: the sum of the bodies' stats.handovers; -> a line when a second has passed, else null
    report(world, handovers, nowMs) {
      if (this.at === null) { this.at = nowMs; this.handovers = handovers; return null; }
      if (nowMs - this.at < 1000) return null;
      const line = { handovers: handovers - this.handovers, jumps: this.jumps, worst: Math.round(this.worstJump * 1000), together: this.together(world), moving: world.movingCount() };
      this.at = nowMs; this.handovers = handovers; this.jumps = 0; this.worstJump = 0;
      return line;
    }
  }

  // ---- the drift probe. Every `every` seconds after Start the page asks for a touch; the touch is a fingertip of the index resting on the
  // floor (lower than `low`, moving slower than `slow`) for `hold` seconds. The first touch is the cross; each later one is measured against
  // it in the common frame (mm), and against the other player's touch of the same round when there is one.
  const DRIFT = { every: 60, low: 0.06, slow: 0.03, hold: 1.5, window: 25, rounds: 10 };       // (low is 6 cm: the desktop rehearsal's pretend fingertip is 5 cm up)
  class Drift {
    constructor(cfg = {}) { this.cfg = Object.assign({}, DRIFT, cfg); this.reset(); }
    reset() { this.on = false; this.ref = null; this.round = 0; this.nextAt = null; this.askedAt = null; this.still = null; this.rows = []; this.largest = 0; }
    start(t) { this.reset(); this.on = true; this.round = 0; this.nextAt = t; }
    stop() { this.on = false; }
    get asking() { return this.on && this.askedAt !== null; }
    // every frame: t (s); tips: this page's index fingertips [{ id, x, y, z }] (floor plan); toCommon([x, y]) -> [x, y]
    // -> a row when a touch was taken, else null: { round, first, dx, dy, mm, common: [x, y] }
    update(t, tips, toCommon) {
      const c = this.cfg;
      if (!this.on) return null;
      if (this.askedAt === null && t >= this.nextAt) { this.askedAt = t; this.round++; this.nextAt += c.every; this.still = null; }
      if (this.askedAt === null) return null;
      if (t - this.askedAt > c.window) { this.askedAt = null; return this._done({ round: this.round, missed: true }); }
      const tip = tips.find((q) => q.z < c.low);
      if (!tip) { this.still = null; return null; }
      if (!this.still || Math.hypot(tip.x - this.still.x, tip.y - this.still.y) > c.slow * (t - this.still.t) + 0.004) { this.still = { x: tip.x, y: tip.y, t, t0: t }; return null; }
      if (t - this.still.t0 < c.hold) return null;
      const p = toCommon([tip.x, tip.y]), row = { round: this.round, first: !this.ref, common: p };
      if (!this.ref) this.ref = p;
      row.dx = Math.round((p[0] - this.ref[0]) * 1000); row.dy = Math.round((p[1] - this.ref[1]) * 1000); row.mm = Math.round(Math.hypot(row.dx, row.dy));
      this.largest = Math.max(this.largest, row.mm);
      this.askedAt = null;
      return this._done(row);
    }
    _done(row) { this.rows.push(row); if (this.round >= this.cfg.rounds) this.on = false; return row; }
  }

  // ---- how fast the page runs: p50 and p95 of the frame time and the mean simulation time over a window
  class Perf {
    constructor(every = 5000) { this.every = every; this.frames = []; this.sims = []; this.at = null; }
    // frameMs: time since the last frame; simMs: this frame's simulation. -> a report every `every` ms, else null
    add(nowMs, frameMs, simMs) {
      if (this.at === null) this.at = nowMs;
      this.frames.push(frameMs); this.sims.push(simMs);
      if (nowMs - this.at < this.every) return null;
      const f = this.frames.slice().sort((a, b) => a - b), q = (p) => f[Math.min(f.length - 1, Math.floor(p * f.length))];
      const r = { fps: Math.round(f.length / ((nowMs - this.at) / 1000)), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), sim: +(this.sims.reduce((a, v) => a + v, 0) / this.sims.length).toFixed(2) };
      this.frames = []; this.sims = []; this.at = nowMs;
      return r;
    }
  }

  // ---- settings and the menu
  const MODES = ['pile', 'island', 'drift'], COUNTS = [10, 20, 30, 50];
  const GAME = { mode: 'pile', n: 10 };
  const PLAYER = { ghost: true, model: false, handIrl: false };
  const ACTIONS = ['reset', 'dropPile', 'driftStart'];
  function press(id, st) {
    if (id === 'model') return Object.assign({}, st, { model: !st.model });
    if (id === 'handIrl') return Object.assign({}, st, { handIrl: !st.handIrl });
    if (id === 'mode') return Object.assign({}, st, { mode: MODES[(MODES.indexOf(st.mode) + 1) % MODES.length] });
    if (id === 'n') return Object.assign({}, st, { n: COUNTS[(COUNTS.indexOf(st.n) + 1) % COUNTS.length] });
    if (id === 'ghost') return Object.assign({}, st, { ghost: !st.ghost });
    return null;
  }
  const HELP = { pile: 'drop the cubes into a heap, poke it: the numbers go to the log', island: 'two players: one pushes the bottom, one lifts the top', drift: 'Start, then touch the cross when asked, each minute' };
  function menu(st, info) {
    info = info || {};
    const mode = st.mode || 'pile';
    return M.menus.grid({ w: 1024, title: 'MUMR lab', note: info.note || HELP[mode],
      rows: [
        [{ id: 'mode', label: 'Experiment', value: mode, active: true }, mode === 'pile' ? { id: 'n', label: 'Cubes', value: String(st.n || 10) } : { label: 'Players', value: String(info.players || 1) }, { id: 'ghost', label: 'Ghost fingers', value: st.ghost ? 'shown' : 'hidden', active: !!st.ghost }],
        [{ id: 'reset', label: 'Reset', value: mode === 'island' ? 'build the stack' : 'cubes on the floor' }].concat(mode === 'pile' ? [{ id: 'dropPile', label: 'Drop the pile', value: 'into one heap', span: 2 }] : mode === 'drift' ? [{ id: 'driftStart', label: 'Start drift', value: 'ten rounds', span: 2 }] : []),
        [{ id: 'model', label: 'Room model', value: st.model ? 'shown: move the windows and cubes' : 'rearrange the windows', active: !!st.model, span: 2 }, { id: 'handIrl', label: 'Show hand IRL', value: st.handIrl ? 'on' : 'off', active: !!st.handIrl }],
      ] });
  }

  // ---- the two text windows: a layout of lines (long ones are wrapped), '## ' starts a heading
  function wrap(text, width) {
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        if (line && (line + ' ' + word).length > width) { out.push(line); line = word; } else line = line ? line + ' ' + word : word;
      }
      out.push(line);
    }
    return out;
  }
  function textLayout(title, lines, note, width = 70) {
    const rows = [];
    for (const l of lines) for (const w of wrap(l.replace(/^## /, ''), width)) rows.push([{ label: w, left: true, flat: true, head: /^## /.test(l), size: 24 }]);
    return M.menus.grid({ w: 1024, title, note: note || '', rowH: 30, rows });
  }
  // what each experiment is for, what to try and what passes (the same as README.md)
  const DESCRIPTION = {
    pile: ['## What it is for', 'How many boxes one headset can simulate before the frame time suffers. The answer says whether sleeping bodies (phase 5) are needed or only nice.',
      '## What to try', 'Pick 10, 20, 30 and 50 cubes with the Cubes button. Press Drop the pile. Poke the heap with a finger, pinch a cube, throw one at it. Leave it alone and see that it comes to rest.',
      '## What passes', 'Frame time p95 under 13.9 ms (72 Hz) at 30 cubes, and the pile comes to rest. The numbers are on the data window and in the log every 5 s.',
      '## Note', 'The cubes are not shared: every page simulates its own pile.'],
    island: ['## What it is for', 'What happens to a stack when two players touch it at once. Today each cube has a token of its own and changes hands on touch. This run is the baseline: it shows today\'s failure so that phase 5 (one token for a touching group) has something to beat.',
      '## What to try', 'Two headsets, both lined up. Press Reset (builds a stack of 5). One player pushes the bottom cube while the other lifts the top one. A cube\'s colour is the player who simulates it.',
      '## What passes', 'Today: it will probably tear apart, which is the point. Phase 5 passes when the stack moves as one with no jumps. The data window counts hand-overs, jumps over 2 cm and whether the stack stayed together.'],
    drift: ['## What it is for', 'How far the line-up drifts over 10 minutes: one headset against the room, two headsets against each other.',
      '## What to try', 'Mark a cross on the floor. Line up, press Start drift, and walk about. When the page says so (once a minute, ten times) rest your index finger on the cross for 1.5 s. Two players: both touch the same cross.',
      '## What passes', 'Under 2 cm after 10 minutes. If not, the anchor keeper needs a re-check timer (anchor.js). The first touch defines the cross; the data window lists every round in mm.'],
  };
  const description = (mode) => textLayout(`About: ${mode}`, (DESCRIPTION[mode] || DESCRIPTION.pile).concat(['## The windows', 'Every window can be carried by its bar (pinch) or by a fist on it. The hand wall and the room model are on the menu.']), '', 62);
  // the data window's lines: info = { mode, perf (last report), pile (n, moving), island (together, moving, last, totals), drift (Drift), me, players, lined, room, rtt }
  function dataLines(info) {
    const out = [`## ${info.mode}`];
    if (info.mode === 'pile') {
      const p = info.perf;
      out.push(`cubes: ${info.pile.n}   moving: ${info.pile.moving}`);
      out.push(p ? `frames per second: ${p.fps}` : 'frames per second: (first report in 5 s)');
      if (p) { out.push(`frame time p50 / p95: ${p.p50} / ${p.p95} ms   ${p.p95 < 13.9 ? 'under' : 'OVER'} 13.9 ms (72 Hz)`); out.push(`simulation per frame: ${p.sim} ms`); }
    } else if (info.mode === 'island') {
      const i = info.island, t = i.totals;
      out.push(`stack: ${i.together ? 'together' : 'BROKEN'}   moving: ${i.moving}`);
      out.push(`last second: ${i.last ? `${i.last.handovers} hand-overs, ${i.last.jumps} jumps (worst ${i.last.worst} mm)` : '-'}`);
      out.push(`since reset: ${t.handovers} hand-overs, ${t.jumps} jumps (worst ${t.worst} mm), broken ${t.broken} s`);
      out.push(`simulated by: ${i.holders.join(', ')}`);
    } else {
      const d = info.drift;
      out.push(d.on ? (d.asking ? `round ${d.round} of ${d.cfg.rounds}: TOUCH THE CROSS` : `round ${d.round} of ${d.cfg.rounds} done, next in ${Math.max(0, Math.round(info.nextIn))} s`) : d.rows.length ? 'finished (or stopped)' : 'not started: press Start drift');
      out.push(`largest: ${d.largest} mm   ${d.largest ? (d.largest < 20 ? 'under' : 'OVER') + ' 2 cm' : ''}`);
      for (const r of d.rows.slice(-8)) out.push(r.missed ? `round ${r.round}: missed` : r.first ? `round ${r.round}: the cross` : `round ${r.round}: ${r.mm} mm (dx ${r.dx}, dy ${r.dy})${r.other !== undefined ? `, ${r.other} mm from the other player` : ''}`);
    }
    out.push('## the page');
    out.push(`${info.players > 1 ? `player ${info.me + 1} of ${info.players}` : 'alone'}   ${info.lined ? 'lined up' : 'not lined up'}   round trip ${info.rtt === undefined || info.rtt === null ? '-' : info.rtt} ms`);
    return out;
  }
  const dataLayout = (info) => textLayout('Data', dataLines(info), '', 62);

  Object.assign(L, { SIZE, HALF, MAX_BOXES, ISLAND, TYPES, KINDS, World, adapter, commonSource, Watch, Drift, Perf, MODES, COUNTS, GAME, PLAYER, ACTIONS, press, menu, wrap, textLayout, description, dataLines, dataLayout, DESCRIPTION });
})(typeof module !== 'undefined' ? module.exports : (globalThis.LAB = {}));
