// The ENGINE's own menu, on the inside of the left wrist: what every MUMR app has, apart from the app's own menu (Marek, 2026-10-22: "parts
// of the menu are engine-essential ... a wrist based popup that minimizes into a wrist button"). No THREE and no DOM.
//
//   folded    a small round button on the wrist ("MUMR"), shown while the inside of the wrist looks at you
//   open      Line up (and while lining up the three spot rows with Create / Delete / Lock, and Done), Room setup, Exit; "-" folds it;
//             the home menu (Line up, Room setup, Exit) folds by itself when you look away from it: the card leaves the middle of
//             your view (LOOK) for AWAY ms, or the wrist turns so that it hides. Anything else that is open (lining up) never folds by itself
// Like every menu it is shared: it goes out in the `M` packet as panel 'wrist' with its state in info.sys, the other players see it on its
// owner's wrist and may press it, and a press acts for the owner (session.press). The app's own menu is separate (the app's layout).
//
//   const sys = new SysMenu(session, lineup, { exit, roomSetup, say })
//   ACTIONS                  add them to the session's actions; press(id) from the 'action' listener -> true when it was one of ours
//   info()                   what another page needs to draw this menu: { open, lining, fields, lined, dist, note }
//   SysMenu.layout(info)     the layout (menus.grid) for anybody's wrist menu; SysMenu.width(info): its width in metres
//   place(head, jp, floorY)  where it floats this frame (a panel pose), or null while the wrist does not look at you
(function (M) {
  const OWN = ['sysOpen', 'sysClose', 'exit', 'roomSetup'];
  const OPEN_W = 0.22, FOLDED_W = 0.06;
  const LOOK_ON = Math.cos(30 * Math.PI / 180), LOOK_OFF = Math.cos(38 * Math.PI / 180);      // the card is looked at: within 30 degrees of where
                                                                                           // the head points (no longer: beyond 38)
  const AWAY = 500;             // ms looked away before the open home menu folds (a glance aside does not)
  const WRIST_SIDE = 'left';

  class SysMenu {
    constructor(session, lineup, opts = {}) {
      this.session = session; this.lineup = lineup; this.opts = opts;
      this.open = false; this.shown = false; this.pose = null;
      this.now = opts.now || M.util.nowMs; this.awayAt = null; this.lookedAt = false;
    }
    static get ACTIONS() { return OWN.concat(M.lineup.ACTIONS); }
    // the open menu is the home menu (nothing else, such as lining up, is open in it): only that one folds by itself
    get home() { return this.open && !(this.lineup && this.lineup.active); }
    _fold(why) { this.open = false; this.awayAt = null; this.lookedAt = false; if (this.opts.life) this.opts.life(`wrist menu folded: ${why}`); }
    press(id) {
      if (id === 'sysOpen') { this.open = true; return true; }
      if (id === 'sysClose') { this.open = false; return true; }
      if (id === 'exit') { if (this.opts.exit) this.opts.exit(); return true; }
      if (id === 'roomSetup') { if (this.opts.roomSetup) this.opts.roomSetup(); return true; }
      if (this.lineup && this.lineup.press(id)) { if (id === 'lineUp' && this.lineup.active) this.open = true; return true; }      // (lining up: the fields must be seen)
      return false;
    }
    info() {
      const L = this.lineup, f = L ? L.frame : null;
      return { open: this.open, lining: !!(L && L.active), fields: L && L.active ? L.aligner.fields() : null, lined: !!f,
        dist: f && f.how !== 'given' ? +(f.dist || 0).toFixed(2) : null, note: L ? L.note() : '', roomUsed: !!this.opts.roomUsed && this.opts.roomUsed() };
    }
    static width(info) { return info && info.open ? OPEN_W : FOLDED_W; }
    static layout(info) {
      info = info || {};
      if (!info.open) return M.menus.grid({ w: 256, titleH: 0, rowH: 200, rows: [[{ id: 'sysOpen', label: 'MUMR', value: info.lining ? 'lining up' : '', active: !!info.lining }]] });
      if (info.lining) {
        return M.menus.grid({ w: 768, title: 'Line up', note: info.note || '', top: [{ id: 'sysClose', label: '-', w: 80 }, { id: 'lineUp', label: 'Done', active: true, w: 150 }],
          rows: M.lineup.rowsFrom(info.fields, info.lined) });
      }
      return M.menus.grid({ w: 768, title: 'MUMR', note: info.note || '', top: [{ id: 'sysClose', label: '-', w: 80 }],
        rows: [[
          { id: 'lineUp', label: info.lined ? 'Lined up' : 'Line up', value: info.dist ? `${info.dist} m` : info.lined ? 'given' : 'not yet', active: !!info.lined },
          { id: 'roomSetup', label: 'Room setup', value: info.roomUsed ? 'restarts MR' : 'scan / edit' },
          { id: 'exit', label: 'Exit', value: 'leave MR' },
        ]] });
    }
    // Where it is: a card lying on the inside of the left wrist and turning with it, as Nudgy's wrist card did (follow.js wristCard: a little up
    // the forearm, clear of the skin, its top the top for whoever looks at it); shown while that side of the wrist looks at you (with some slack,
    // so that it does not flicker at the edge). head: [x, y, heading, height above the floor, pitch]; jp: that hand's 25 joints
    // in XR space (null: the hand is not tracked). -> a panel pose { x, y, h (XR), q (its orientation in XR space) } or null
    place(head, jp, floorY) {
      if (!jp || !head) { this.shown = false; if (this.home) this._fold('the hand is not tracked'); return (this.pose = null); }
      const at = (i) => [jp[i * 3], jp[i * 3 + 1], jp[i * 3 + 2]];
      const cp = Math.cos(head[4] || 0), eye = [head[0], head[3] + floorY, -head[1]], fwd = [cp * Math.cos(head[2]), Math.sin(head[4] || 0), -cp * Math.sin(head[2])];
      const c = M.follow.wristCard({ wrist: at(0), index: at(6), middle: at(11), pinky: at(21) }, WRIST_SIDE, eye, fwd);
      if (!c) { this.shown = false; if (this.home) this._fold('the hand is not tracked'); return (this.pose = null); }
      const W = M.follow.WRIST;
      this.shown = c.dist < W.far && c.facing > (this.shown ? W.hide : W.show);
      if (!this.shown) { if (this.home) this._fold('the wrist turned away'); return (this.pose = null); }
      // looked at: the card within LOOK of where the head points. The open home menu folds when it has not been looked at for AWAY ms
      const d = [c.pos[0] - eye[0], c.pos[1] - eye[1], c.pos[2] - eye[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1, look = (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / dl;
      this.lookedAt = look > (this.lookedAt ? LOOK_OFF : LOOK_ON);
      if (!this.home || this.lookedAt) this.awayAt = null;
      else if (this.awayAt === null) this.awayAt = this.now();
      else if (this.now() - this.awayAt >= AWAY) this._fold('looked away');
      const p = c.pos;                                 // (open or folded, the card has its middle at the same point: it opens round the button)
      return (this.pose = { x: p[0], y: -p[2], h: p[1], yaw: 0, pitch: 0, q: M.align.quatFromBasis(c.right, c.up, c.normal) });
    }
  }

  M.sysmenu = { SysMenu, OPEN_W, FOLDED_W, WRIST_SIDE, AWAY };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
