// EVERYONE'S MENUS. A menu is a flat panel floating in the room, with buttons pressed by a fingertip going through them (no ray, no
// gesture: Nudgy rule). Every player sees every player's menus where their owners have them, and can press any button on any of them;
// a button acts for the menu's owner (session.press). No THREE and no DOM: the drawing is xr/panel3d.js.
//
//   grid(spec)           a layout of buttons in rows, on a canvas of spec.w pixels: { w, h, title, buttons: [{ id, label, value, active,
//                        off, x, y, w, h }] }. A cell without an id is text, not a button.
//   hit(lay, u, v)       the button at (u, v) (0..1 from the top left), or null
//   axes(pose)           a panel pose { x, y (floor plan), h (XR height), yaw (the way it faces), pitch (how far it leans back) } as XR
//                        vectors: pos, right, up, normal (out of its front) and ry (its turn about XR Y). THREE uses the same numbers.
//   Poke                 fingertips through panels -> presses, hover, and which panels have a hand at them
//   Menus                this page's panels out (the `M` packet, ten a second, common frame) and the other players' in
(function (M) {
  const PAD = 14, TITLE_H = 60, ROW_H = 96;

  // spec: { w (px, 1024), titleH (px, 60; 0: no title bar), rowH (px, 96), title, top: [{ id, label, active }] (buttons in the title bar, from the right), rows: [[{ id, label, value,
  // active, off, span }]] }
  function grid(spec) {
    const W = spec.w || 1024, rows = spec.rows || [], rowH = spec.rowH || ROW_H, TH = spec.titleH === undefined ? TITLE_H : spec.titleH;
    const H = TH + rows.length * (rowH + PAD) + PAD, buttons = [];
    let x = W - PAD;
    for (const b of (spec.top || [])) {
      const bw = b.w || 200;
      x -= bw;
      buttons.push(Object.assign({ value: '', active: false, off: false, top: true }, b, { x, y: 8, w: bw, h: TH - 16 }));
      x -= PAD;
    }
    rows.forEach((row, r) => {
      const units = row.reduce((a, c) => a + (c.span || 1), 0), unit = (W - PAD * (units + 1)) / units;
      let cx = PAD;
      for (const c of row) {
        const cw = unit * (c.span || 1) + PAD * ((c.span || 1) - 1);
        buttons.push(Object.assign({ value: '', active: false, off: false }, c, { x: cx, y: TH + PAD / 2 + r * (rowH + PAD), w: cw, h: rowH }));
        cx += cw + PAD;
      }
    });
    return { w: W, h: H, title: { text: spec.title || '', note: spec.note || '', h: TH }, buttons };
  }
  function hit(lay, u, v) {
    if (!lay || u < 0 || u > 1 || v < 0 || v > 1) return null;
    const x = u * lay.w, y = v * lay.h;
    for (const b of lay.buttons) if (b.id && !b.off && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    return null;
  }

  // A pose may instead carry `q`, an XR orientation [x, y, z, w] (a card on a wrist turns with the wrist): then yaw and pitch are not used.
  function axes(p) {
    if (p.q) { const A = M.align; return { pos: [p.x, p.h, -p.y], right: A.quatApply(p.q, [1, 0, 0]), up: A.quatApply(p.q, [0, 1, 0]), normal: A.quatApply(p.q, [0, 0, 1]), q: p.q }; }
    const ry = Math.atan2(Math.cos(p.yaw), -Math.sin(p.yaw)), sp = Math.sin(p.pitch || 0), cp = Math.cos(p.pitch || 0), sr = Math.sin(ry), cr = Math.cos(ry);
    return { pos: [p.x, p.h, -p.y], right: [cr, 0, -sr], up: [-sr * sp, cp, -cr * sp], normal: [sr * cp, sp, cr * cp], ry, pitch: p.pitch || 0 };
  }
  // How far an XR point is from the handle under a panel (a bar HALF either side of the middle, GAP below the bottom edge): metres
  function handleDist(pose, h, p, gap = 0.035, half = 0.07) {
    const A = axes(pose), c = [0, 1, 2].map((i) => A.pos[i] - A.up[i] * (h / 2 + gap)), d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const along = d[0] * A.right[0] + d[1] * A.right[1] + d[2] * A.right[2], k = Math.max(-half, Math.min(half, along));
    return Math.hypot(d[0] - A.right[0] * k, d[1] - A.right[1] * k, d[2] - A.right[2] * k);
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // Fingertips through panels. A press is a tip that was more than 4 mm in front of a button and is now at or behind its surface,
  // within 8 cm of it (so a hand that comes round from behind presses nothing: from behind a menu is a blank wall). One press in 400 ms.
  class Poke {
    constructor(cfg = {}) { this.cfg = Object.assign({ front: 0.004, depth: 0.08, hover: 0.06, busy: 0.25, gap: 400 }, cfg); this.was = new Map(); this.pressedAt = -1e9; }
    // panels: [{ key, owner, id, pose, w, h (metres), lay, ignore (a tip id that does not press it) }]; tips: [{ id, p: [x, y, z] (XR) }];
    // -> { presses, hover, busy (keys with a hand within 25 cm: a menu must not glide away from under it), at (keys with a fingertip at
    //    the card itself: within 5 cm of its face and over it, someone is using it) }
    update(panels, tips, nowMs) {
      const C = this.cfg, out = { presses: [], hover: null, busy: new Set(), at: new Set() };
      const seen = new Set();
      for (const pn of panels) {
        const A = axes(pn.pose);
        for (const t of tips) {
          if (pn.ignore && pn.ignore === t.id) continue;          // (a menu on a wrist is not pressed by the fingers of that hand)
          const d = sub(t.p, A.pos), lx = dot(d, A.right), ly = dot(d, A.up), lz = dot(d, A.normal), k = `${pn.key}|${t.id}`;
          seen.add(k);
          const u = lx / pn.w + 0.5, v = 0.5 - ly / pn.h, inside = Math.abs(lx) <= pn.w / 2 && Math.abs(ly) <= pn.h / 2;
          if (Math.abs(lz) < C.busy && Math.abs(lx) < pn.w / 2 + 0.15 && Math.abs(ly) < pn.h / 2 + 0.15) out.busy.add(pn.key);
          if (Math.abs(lz) < 0.05 && Math.abs(lx) < pn.w / 2 + 0.02 && Math.abs(ly) < pn.h / 2 + 0.02) out.at.add(pn.key);
          const id = inside && Math.abs(lz) < C.depth ? hit(pn.lay, u, v) : null, was = this.was.get(k);
          if (id) {
            if (lz > 0 && lz < C.hover) out.hover = { key: pn.key, owner: pn.owner, button: id };
            if (was !== undefined && was > C.front && lz <= C.front && nowMs - this.pressedAt > C.gap) {
              this.pressedAt = nowMs;
              out.presses.push({ key: pn.key, owner: pn.owner, panel: pn.id, button: id, u, v, tip: t.id });
            }
          }
          this.was.set(k, lz);
        }
      }
      for (const k of [...this.was.keys()]) if (!seen.has(k)) this.was.delete(k);
      return out;
    }
  }

  // The panels of every player. send() puts this page's panel poses (XR heights) out as `M`, in the common frame, with `info`: what
  // the app needs to draw this menu for others (its mode: lining up or not, the fields ...; Nudgy M4: the other player's menu must be
  // drawn from THAT player's state and mode). receive() takes the others'; others() gives them in this page's own coordinates.
  class Menus {
    constructor(session, space, opts = {}) {
      this.session = session; this.space = space; this.every = opts.every || 100; this.fresh = opts.fresh || 1500;
      this.known = opts.known || (() => true);
      this.guard = new M.wire.Guard(); this.peers = new Map(); this._sentAt = -1e9;
      this.stats = { sent: 0, got: 0 };
      session.on('peer', (slot, on) => { if (!on) { this.peers.delete(slot); this.guard.forget(slot); } });
      session.on('leave', () => this.peers.clear());
    }
    // panels: [{ id, pose: { x, y, h, yaw, pitch } }] on the floor plan, h in XR space
    send(nowMs, panels, info) {
      const S = this.session, sp = this.space;
      if (!sp.ok || !S.sending() || nowMs - this._sentAt < this.every) return false;
      this._sentAt = nowMs;
      const r3 = (v) => Math.round(v * 1000) / 1000, r4 = (v) => Math.round(v * 1e4) / 1e4;
      // a row: [id, x, y, h, yaw, pitch], or [id, x, y, h, qx, qy, qz, qw] for a pose with an orientation (a wrist card)
      const rows = (panels || []).map((p) => {
        const c = sp.poseToCommon({ x: p.pose.x, y: p.pose.y, yaw: p.pose.yaw || 0, h: p.pose.h - sp.floorY });
        if (p.pose.q) return [p.id, r3(c.x), r3(c.y), r3(c.h)].concat(sp.quatToCommon(p.pose.q).map(r4));
        return [p.id, r3(c.x), r3(c.y), r3(c.h), r4(c.yaw), r4(p.pose.pitch || 0)];
      });
      const ok = S.link.sendBin(M.wire.encode('menus', { panels: rows, info: info || null }, nowMs));
      if (ok) this.stats.sent++;
      return !!ok;
    }
    receive(p, nowMs) {
      if (!p || p.name !== 'menus' || !Array.isArray(p.data.panels)) return false;
      if (!this.guard.fresh(p.type, p.slot, p.clock)) return false;
      this.peers.set(p.slot, { at: nowMs, rows: p.data.panels.slice(0, 16), info: p.data.info && typeof p.data.info === 'object' ? p.data.info : null });
      this.stats.got++;
      return true;
    }
    // [{ slot, info, panels: [{ id, pose }] }] in this page's own coordinates (floor plan, XR heights)
    others(nowMs) {
      const S = this.session, sp = this.space, out = [];
      if (!sp.ok) return out;
      for (const [slot, m] of this.peers) {
        if (nowMs - m.at > this.fresh || !S.lined(slot)) continue;
        const panels = [];
        for (const r of m.rows) {
          if (!Array.isArray(r) || r.length < 6 || typeof r[0] !== 'string' || !r.slice(1, 6).every(Number.isFinite) || !this.known(r[0])) continue;
          if (r.length >= 8 && r.slice(4, 8).every(Number.isFinite)) {
            const o = sp.poseFromCommon({ x: r[1], y: r[2], h: r[3], yaw: 0 });
            panels.push({ id: r[0], pose: { x: o.x, y: o.y, h: o.h + sp.floorY, yaw: 0, pitch: 0, q: sp.quatFromCommon(r.slice(4, 8)) } });
            continue;
          }
          const o = sp.poseFromCommon({ x: r[1], y: r[2], h: r[3], yaw: r[4] });
          panels.push({ id: r[0], pose: { x: o.x, y: o.y, h: o.h + sp.floorY, yaw: o.yaw, pitch: r[5] } });
        }
        out.push({ slot, info: m.info, panels });
      }
      return out;
    }
  }

  M.menus = { grid, hit, axes, handleDist, Poke, Menus, TITLE_H, PAD };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
