// The ENGINE's own menu, on the inside of the left wrist: what every MUMR app has, apart from the app's own menu (Marek, 2026-10-22: "parts
// of the menu are engine-essential ... a wrist based popup that minimizes into a wrist button"). No THREE and no DOM.
//
//   folded    a small round button on the wrist ("MUMR"), shown while the inside of the wrist looks at you
//   open      Line up (and while lining up the three spot rows with Create / Delete / Lock, and Done), Room setup, Exit; "-" folds it
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
  const WRIST_SIDE = 'left';

  class SysMenu {
    constructor(session, lineup, opts = {}) {
      this.session = session; this.lineup = lineup; this.opts = opts;
      this.open = false; this.shown = false; this.pose = null;
    }
    static get ACTIONS() { return OWN.concat(M.lineup.ACTIONS); }
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
      if (!jp || !head) { this.shown = false; return (this.pose = null); }
      const at = (i) => [jp[i * 3], jp[i * 3 + 1], jp[i * 3 + 2]];
      const cp = Math.cos(head[4] || 0), eye = [head[0], head[3] + floorY, -head[1]], fwd = [cp * Math.cos(head[2]), Math.sin(head[4] || 0), -cp * Math.sin(head[2])];
      const c = M.follow.wristCard({ wrist: at(0), index: at(6), middle: at(11), pinky: at(21) }, WRIST_SIDE, eye, fwd);
      if (!c) { this.shown = false; return (this.pose = null); }
      const W = M.follow.WRIST;
      this.shown = c.dist < W.far && c.facing > (this.shown ? W.hide : W.show);
      if (!this.shown) return (this.pose = null);
      // (open, the card is larger: its middle goes a little further up the forearm, so that it does not cover the hand)
      const arm = [at(0)[0] - at(11)[0], at(0)[1] - at(11)[1], at(0)[2] - at(11)[2]], al = Math.hypot(arm[0], arm[1], arm[2]) || 1, k = this.open ? 0.07 : 0;
      const p = [0, 1, 2].map((i) => c.pos[i] + (arm[i] / al) * k);
      return (this.pose = { x: p[0], y: -p[2], h: p[1], yaw: 0, pitch: 0, q: M.align.quatFromBasis(c.right, c.up, c.normal) });
    }
  }

  M.sysmenu = { SysMenu, OPEN_W, FOLDED_W, WRIST_SIDE };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
