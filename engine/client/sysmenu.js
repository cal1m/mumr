// The ENGINE's own menu, on the inside of the left wrist: what every MUMR app has, apart from the app's own menu (Marek, 2026-10-22: "parts
// of the menu are engine-essential ... a wrist based popup that minimizes into a wrist button"). No THREE and no DOM.
//
//   folded    a small round button on the wrist ("MUMR"), shown while the inside of the wrist looks at you
//   open      Line up (and while lining up the three spot rows with Create / Delete / Lock, the Room row, and Done), Room setup, Exit;
//             "-" folds it;
//             the home menu (Line up, Room setup, Exit) folds by itself once it has been hidden for HIDDEN ms in a row (the hand turned away
//             from the face, or not tracked; Marek, 2026-10-22). Anything else that is open (lining up) never folds by itself
// Like every menu it is shared: it goes out in the `M` packet as panel 'wrist' with its state in info.sys, the other players see it on its
// owner's wrist and may press it, and a press acts for the owner (session.press). The app's own menu is separate (the app's layout).
//
//   const sys = new SysMenu(session, lineup, { exit, roomSetup, roomUsed, room, life })     room: room.js Room (its Room row and button)
//   ACTIONS                  add them to the session's actions; press(id) from the 'action' listener -> true when it was one of ours
//   info()                   what another page needs to draw this menu: { open, lining, fields, lined, dist, note }
//   SysMenu.layout(info)     the layout (menus.grid) for anybody's wrist menu; SysMenu.width(info): its width in metres
//   place(head, jp, floorY)  where it floats this frame (a panel pose), or null while the wrist does not look at you
(function (M) {
  const OWN = ['sysOpen', 'sysClose', 'exit', 'roomSetup'];
  const OPEN_W = 0.22, FOLDED_W = 0.06, MAP_W = 0.32;
  const HIDDEN = 5000;          // ms hidden in a row before the open home menu folds (Marek: 10 s, then 5)
  const WRIST_SIDE = 'left';

  // the Room row of the line-up menu: the server's room (who uploaded it, when), and the button that uploads this headset's scan once
  function roomRow(r) {
    r = r || {};
    const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const what = r.kept ? `server's: ${r.n} planes${r.by === null || r.by === undefined ? '' : ` from player ${r.by + 1}`}${r.at ? ` at ${hm(r.at)}` : ''}` : r.own ? `none on the server; own scan ${r.own} planes` : 'no room';
    return [{ label: 'Room', value: what, span: 4, active: !!r.kept }, { id: 'supplyRoom', label: 'Upload', value: r.own ? `my ${r.own} planes` : 'no scan here', off: !r.own }];
  }

  // The room picker (room.js: a scan with more than one room): a map of the rooms' floors, seen from above with the front of the headset
  // up when the scan was made; each room is a button (pick it or leave it), and Cancel / Import under the map
  function roomMap(ch) {
    const W = 768, MAP = { x: 14, y: 74, w: 740, h: 440 }, pts = ch.rooms.flatMap((r) => r.poly);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const sc = 0.92 * Math.min(MAP.w / Math.max(0.5, x1 - x0), MAP.h / Math.max(0.5, y1 - y0)), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const X = (x) => MAP.x + MAP.w / 2 + (x - mx) * sc, Y = (y) => MAP.y + MAP.h / 2 - (y - my) * sc;
    const shapes = ch.rooms.map((r) => ({ pts: r.poly.map((q) => [X(q[0]), Y(q[1])]), colour: r.picked ? '#4ea1ff' : '#6b7280', fill: r.picked ? 'rgba(78,161,255,0.22)' : 'rgba(255,255,255,0.04)' }));
    const buttons = ch.rooms.map((r) => {
      const px = r.poly.map((q) => X(q[0])), py = r.poly.map((q) => Y(q[1]));
      let bx = Math.min(...px), by = Math.min(...py), bw = Math.max(...px) - bx, bh = Math.max(...py) - by;
      if (bw < 130) { bx -= (130 - bw) / 2; bw = 130; }
      if (bh < 70) { by -= (70 - bh) / 2; bh = 70; }
      return { id: `roomPick${r.k + 1}`, label: `Room ${r.k + 1}${r.here ? ' (you)' : ''}`, value: `${r.w} x ${r.d} m`, x: bx, y: by, w: bw, h: bh, active: r.picked, off: false, ghost: true };
    });
    // (a press goes to the first button under the fingertip: the smallest room first, so a room inside a bigger one can still be picked)
    buttons.sort((a, b) => a.w * a.h - b.w * b.h);
    const n = ch.rooms.filter((r) => r.picked).length, by = MAP.y + MAP.h + 14, bh = 84;
    buttons.push({ id: 'roomCancel', label: 'Cancel', value: '', x: 14, y: by, w: 240, h: bh, active: false, off: false },
      { id: 'roomImport', label: 'Import', value: `${n} of ${ch.rooms.length} rooms`, x: 268, y: by, w: 486, h: bh, active: n > 0, off: n === 0 });
    return { w: W, h: by + bh + 14, title: { text: 'Import rooms', note: 'press a room to pick it', h: 60 }, buttons, shapes };
  }

  class SysMenu {
    constructor(session, lineup, opts = {}) {
      this.session = session; this.lineup = lineup; this.opts = opts;
      this.open = false; this.shown = false; this.pose = null;
      this.now = opts.now || M.util.nowMs; this.hiddenAt = null;
    }
    static get ACTIONS() { return OWN.concat(M.lineup.ACTIONS, M.room.ACTIONS); }
    // the open menu is the home menu (nothing else, such as lining up, is open in it): only that one folds by itself
    get home() { return this.open && !(this.lineup && this.lineup.active) && !(this.opts.room && this.opts.room.choice); }
    _fold(why) { this.open = false; this.hiddenAt = null; if (this.opts.life) this.opts.life(`wrist menu folded: ${why}`); }
    // hidden this frame: the open home menu folds once it has been hidden for HIDDEN ms in a row
    _hidden(why) {
      this.shown = false; this.pose = null;
      if (!this.home) { this.hiddenAt = null; return null; }
      if (this.hiddenAt === null) this.hiddenAt = this.now();
      else if (this.now() - this.hiddenAt >= HIDDEN) this._fold(`${why} for ${HIDDEN / 1000} s`);
      return null;
    }
    press(id) {
      if (id === 'sysOpen') { this.open = true; return true; }
      if (id === 'sysClose') { this.open = false; return true; }
      if (id === 'exit') { if (this.opts.exit) this.opts.exit(); return true; }
      if (id === 'roomSetup') { if (this.opts.roomSetup) this.opts.roomSetup(); return true; }
      if (this.opts.room && this.opts.room.press(id)) { if (this.opts.room.choice) this.open = true; return true; }     // (the room picker must be seen)
      if (this.lineup && this.lineup.press(id)) { if (id === 'lineUp' && this.lineup.active) this.open = true; return true; }      // (lining up: the fields must be seen)
      return false;
    }
    info() {
      const L = this.lineup, f = L ? L.frame : null;
      return { open: this.open, lining: !!(L && L.active), fields: L && L.active ? L.aligner.fields() : null, lined: !!f,
        dist: f && f.how !== 'given' ? +(f.dist || 0).toFixed(2) : null, note: L ? L.note() : '', roomUsed: !!this.opts.roomUsed && this.opts.roomUsed(),
        room: this.opts.room ? this.opts.room.info() : null };
    }
    static width(info) { return info && info.open ? (info.room && info.room.choice ? MAP_W : OPEN_W) : FOLDED_W; }
    static layout(info) {
      info = info || {};
      if (info.open && info.room && info.room.choice) return roomMap(info.room.choice);
      if (!info.open) return M.menus.grid({ w: 256, titleH: 0, rowH: 200, rows: [[{ id: 'sysOpen', label: 'MUMR', value: info.lining ? 'lining up' : '', active: !!info.lining }]] });
      if (info.lining) {
        return M.menus.grid({ w: 768, title: 'Line up', note: info.note || '', top: [{ id: 'sysClose', label: '-', w: 80 }, { id: 'lineUp', label: 'Done', active: true, w: 150 }],
          rows: M.lineup.rowsFrom(info.fields, info.lined).concat([roomRow(info.room)]) });
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
      if (!jp || !head) return this._hidden('the hand not tracked');
      const at = (i) => [jp[i * 3], jp[i * 3 + 1], jp[i * 3 + 2]];
      const cp = Math.cos(head[4] || 0), eye = [head[0], head[3] + floorY, -head[1]], fwd = [cp * Math.cos(head[2]), Math.sin(head[4] || 0), -cp * Math.sin(head[2])];
      const c = M.follow.wristCard({ wrist: at(0), index: at(6), middle: at(11), pinky: at(21) }, WRIST_SIDE, eye, fwd);
      if (!c) return this._hidden('the hand not tracked');
      const W = M.follow.WRIST;
      this.shown = c.dist < W.far && c.facing > (this.shown ? W.hide : W.show);
      if (!this.shown) return this._hidden('the hand turned away');
      this.hiddenAt = null;
      const p = c.pos;                                 // (open or folded, the card has its middle at the same point: it opens round the button)
      return (this.pose = { x: p[0], y: -p[2], h: p[1], yaw: 0, pitch: 0, q: M.align.quatFromBasis(c.right, c.up, c.normal) });
    }
  }

  M.sysmenu = { SysMenu, OPEN_W, FOLDED_W, WRIST_SIDE, HIDDEN };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
