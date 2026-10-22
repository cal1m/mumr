// THE ROOM: the planes a headset found (its room scan: floor, walls, tables, ...), shared so that every player's world has the same room.
// No THREE and no DOM.
//
// The room is ONE, Nudgy's rule (2026-10-21): the first headset in supplies it (its own scan) while no room has been supplied; after that it
// changes hands only when a player says so (the Room button of the line-up menu, 'supplyRoom', acts for the menu's owner) or a room setup
// is started on a headset (take()). When the supplier goes, nobody supplies it and the last room stays (in the server too); the others
// keep using it. The supplier sends its scan in the common frame when it starts supplying, when the scan changes and when its line-up
// moves (at most every SEND_EVERY ms). Alone, or not lined up, a page uses its own scan.
//
//   const room = new Room(session, space, { life, say })
//   setScan(planes)       this headset's own scan, floor plan (fromXR); call it when it may have changed (it compares)
//   take()                a room setup was started here: this headset's scan is the room from now on
//   press(id)             'supplyRoom' (ACTIONS) -> true; supplying here starts or stops
//   update(nowMs)         every frame
//   local()               the room this page uses, in its floor plan: { planes: [{ l: label, v: vertical?, p: [[x, y, h], ...] }] } or null
//   info()                for the menus: { from (slot or null), me, have, n }
// Planes: l the headset's label ('floor', 'wall', 'table', 'couch', 'door frame', ... or 'other'), v true for an upright plane, p the
// outline, x, y on the floor plan and h the height above the floor (this headset's, or in the common frame the common floor).
// For an app's physics: support(room, x, y, top), pushOut(room, x, y, z0, z1, r), walls(room), surfaces(room).
(function (M) {
  const SEND_EVERY = 500;       // ms: a scan or a line-up that keeps changing goes out at most this often
  const CLAIM_EVERY = 1000;     // ms: asking to supply the room again (the answer takes a moment)
  const ACTIONS = ['supplyRoom'];
  const r2 = (v) => Math.round(v * 100) / 100;            // (centimetres are enough for a room)

  // XR planes -> the floor plan. planes: [{ matrix (16, column-major: the plane's pose in the XR reference space), polygon: [{ x, z }] (in
  // the plane's own space), label, orientation ('horizontal' / 'vertical') }]; floorY: where this headset's floor is in XR space
  function fromXR(planes, floorY = 0) {
    const out = [];
    for (const pl of planes || []) {
      const m = pl.matrix, poly = pl.polygon || [];
      if (!m || poly.length < 3) continue;
      const p = poly.map((q) => { const X = m[0] * q.x + m[8] * q.z + m[12], Y = m[1] * q.x + m[9] * q.z + m[13], Z = m[2] * q.x + m[10] * q.z + m[14]; return [r2(X), r2(-Z), r2(Y - floorY)]; });
      const v = pl.orientation ? pl.orientation === 'vertical' : Math.abs(m[5]) < 0.5;        // (the plane's normal is its local Y)
      out.push({ l: String(pl.label || 'other'), v, p });
    }
    return out.length ? { planes: out } : null;
  }
  const mapRoom = (room, fn) => (room ? { planes: room.planes.map((q) => ({ l: q.l, v: q.v, p: q.p.map((pt) => fn(pt).map(r2)) })) } : null);

  class Room {
    constructor(session, space, opts = {}) {
      this.S = session; this.space = space; this.opts = opts;
      this.own = null; this.ownSig = '';
      this.taken = false; this.noAuto = false;
      this._sentSig = null; this._sentAt = -1e9; this._claimAt = -1e9; this._cache = { room: null, sig: null, out: null };
      session.on('roomFrom', (slot, prev) => this._life(`room: supplied by ${slot === null ? 'nobody (the room stays)' : slot === session.me ? 'this headset' : `player ${slot + 1}`}${prev === null || prev === undefined ? '' : ` (was ${prev === session.me ? 'this headset' : `player ${prev + 1}`})`}`));
    }
    static get ACTIONS() { return ACTIONS; }
    _life(t) { if (this.opts.life) this.opts.life(t); }
    _say(t) { if (this.opts.say) this.opts.say(t); }
    setScan(room) {
      const sig = room ? JSON.stringify(room.planes) : '';
      if (sig === this.ownSig) return false;
      this.own = room; this.ownSig = sig;
      this._life(`room: this headset's scan has ${room ? room.planes.length : 0} planes`);
      return true;
    }
    take() { this.taken = true; this.noAuto = false; }
    supplying() { return this.S.connected && this.S.doc.roomFrom === this.S.me; }
    press(id) {
      if (id !== 'supplyRoom') return false;
      const S = this.S;
      if (!S.connected) { this._say('Alone: the room is this headset\'s own'); return true; }
      if (this.supplying()) { this.noAuto = true; S.emit({ k: 'roomFrom', slot: null }); this._say('Nobody supplies the room now: it stays as it is'); }
      else if (!this.own) this._say('This headset has no room scan to supply');
      else { this.noAuto = false; this._claimAt = -1e9; this._claim(M.util.nowMs()); this._say('The room comes from this headset now'); }
      return true;
    }
    _claim(now) { if (now - this._claimAt < CLAIM_EVERY) return; this._claimAt = now; this.S.emit({ k: 'roomFrom', slot: this.S.me }); }
    update(now) {
      const S = this.S, sp = this.space;
      if (!S.connected || !sp.ok || S.isViewer) return;
      const first = S.doc.roomFrom === null && !S.doc.room && !this.noAuto;          // (the first headset in, and nobody switched it off here)
      if (this.own && (first || this.taken) && S.doc.roomFrom !== S.me) this._claim(now);
      if (S.doc.roomFrom !== S.me) return;
      this.taken = false;
      if (!this.own) return;
      const f = sp.frame, sig = `${this.ownSig}|${f.x.toFixed(3)},${f.y.toFixed(3)},${f.yaw.toFixed(4)},${(sp.fz || 0).toFixed(3)}`;
      if (sig === this._sentSig || now - this._sentAt < SEND_EVERY) return;
      this._sentSig = sig; this._sentAt = now;
      S.emit({ k: 'room', data: mapRoom(this.own, (p) => sp.toCommon(p)) });
      this._life(`room: sent (${this.own.planes.length} planes)`);
    }
    local() {
      const S = this.S, sp = this.space, d = S.doc.room;
      if (!S.connected || !sp.ok || !d || S.doc.roomFrom === S.me) return this.own;
      const f = sp.frame, sig = `${f.x},${f.y},${f.yaw},${sp.fz || 0}`, c = this._cache;
      if (c.room !== d || c.sig !== sig) { c.room = d; c.sig = sig; c.out = mapRoom(d, (p) => sp.fromCommon(p)); }
      return c.out;
    }
    info() {
      const S = this.S, from = S.connected ? S.doc.roomFrom : null, r = this.local();
      return { from, me: from !== null && from === S.me, have: !!r, n: r ? r.planes.length : 0 };
    }
  }

  // ---- for an app's physics (any room in one frame: local() for a page)
  const NOT_WALL = /door|window|opening/i, NOT_FLOOR = /ceiling/i;
  const prepped = new WeakMap();
  function prep(room) {
    let q = prepped.get(room);
    if (q) return q;
    q = { tops: [], walls: [] };
    for (const pl of room.planes) {
      if (!pl.v) {
        if (NOT_FLOOR.test(pl.l)) continue;
        const h = pl.p.reduce((a, p) => a + p[2], 0) / pl.p.length, xs = pl.p.map((p) => p[0]), ys = pl.p.map((p) => p[1]);
        q.tops.push({ h, pts: pl.p, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), l: pl.l });
      } else if (!NOT_WALL.test(pl.l)) {
        let best = -1, a = pl.p[0], b = pl.p[0];          // its two ends on the floor plan: the two points furthest apart
        for (const p of pl.p) for (const o of pl.p) { const d = (p[0] - o[0]) ** 2 + (p[1] - o[1]) ** 2; if (d > best) { best = d; a = p; b = o; } }
        const hs = pl.p.map((p) => p[2]);
        if (best > 1e-4) q.walls.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], lo: Math.min(...hs), hi: Math.max(...hs), l: pl.l });
      }
    }
    prepped.set(room, q);
    return q;
  }
  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  // the height of what (x, y) stands on: the highest level surface under it no higher than `top` (+ 2 cm), else 0 (the floor)
  function support(room, x, y, top = Infinity) {
    let h = 0;
    if (!room) return h;
    for (const t of prep(room).tops) if (t.h > h && t.h <= top + 0.02 && x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1 && inside(t.pts, x, y)) h = t.h;
    return h;
  }
  // a round thing of radius r at (x, y), from height z0 to z1, kept out of the walls -> { x, y, nx, ny } (n: the way it was pushed) or null
  function pushOut(room, x, y, z0, z1, r) {
    if (!room) return null;
    let nx = 0, ny = 0, moved = false;
    for (const w of prep(room).walls) {
      if (z1 < w.lo || z0 > w.hi) continue;
      const dx = w.x1 - w.x0, dy = w.y1 - w.y0, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - w.x0) * dx + (y - w.y0) * dy) / L2));
      const px = w.x0 + dx * t, py = w.y0 + dy * t, ex = x - px, ey = y - py, d = Math.hypot(ex, ey);
      if (d >= r) continue;
      const ux = d > 1e-6 ? ex / d : -dy / Math.sqrt(L2), uy = d > 1e-6 ? ey / d : dx / Math.sqrt(L2);
      x += ux * (r - d); y += uy * (r - d); nx += ux; ny += uy; moved = true;
    }
    if (!moved) return null;
    const l = Math.hypot(nx, ny) || 1;
    return { x, y, nx: nx / l, ny: ny / l };
  }
  const walls = (room) => (room ? prep(room).walls : []);
  const surfaces = (room) => (room ? prep(room).tops : []);

  M.room = { Room, ACTIONS, fromXR, mapRoom, support, pushOut, walls, surfaces, SEND_EVERY };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
