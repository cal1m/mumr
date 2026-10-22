// The room: one headset's scan for everybody (the first in supplies it, a button moves it, it stays when its supplier goes), turned into
// each page's floor plan; the physics helpers; the cube on a table and at a wall.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../client/index.js');
const C = require('../examples/cube/cube.js');
const { Hub } = require('./hubfake.js');
const AL = M.align;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);

// a scan in a page's floor plan: a table top at 0.7 m over (1..2, 0..1) and a wall along y = 2
const scan = () => ({ planes: [
  { l: 'table', v: false, p: [[1, 0, 0.7], [2, 0, 0.7], [2, 1, 0.7], [1, 1, 0.7]] },
  { l: 'wall', v: true, p: [[0, 2, 0], [3, 2, 0], [3, 2, 2.4], [0, 2, 2.4]] },
  { l: 'door frame', v: true, p: [[3, 0, 0], [3, 1, 0], [3, 1, 2], [3, 0, 2]] },
  { l: 'ceiling', v: false, p: [[0, 0, 2.4], [3, 0, 2.4], [3, 2, 2.4], [0, 2, 2.4]] },
] });

test('XR planes become the floor plan: x = X, y = -Z, heights above the floor', () => {
  // a horizontal plane 0.75 m up (floorY 0.05), its own space moved to X 1, Z -2; polygon in its own x, z
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0.8, -2, 1];
  const r = M.room.fromXR([{ matrix: m, polygon: [{ x: 0, z: 0 }, { x: 0.5, z: 0 }, { x: 0.5, z: -0.4 }], label: 'table', orientation: 'horizontal' }], 0.05);
  assert.deepStrictEqual(r.planes[0], { l: 'table', v: false, p: [[1, 2, 0.75], [1.5, 2, 0.75], [1.5, 2.4, 0.75]] });
  assert.strictEqual(M.room.fromXR([], 0), null);
});

test('support and walls: a table carries what is on it, a door frame and the ceiling do not count', () => {
  const r = scan();
  near(M.room.support(r, 1.5, 0.5, 1), 0.7, 1e-9, 'over the table, above it');
  assert.strictEqual(M.room.support(r, 1.5, 0.5, 0.3), 0, 'under the table: the floor');
  assert.strictEqual(M.room.support(r, 0.5, 0.5, 3), 0, 'beside it (the ceiling is not a floor)');
  const w = M.room.pushOut(r, 1, 1.95, 0, 0.1, 0.07);
  near(w.y, 1.93, 1e-9, 'kept 7 cm off the wall'); near(w.ny, -1, 1e-9);
  assert.strictEqual(M.room.pushOut(r, 2.97, 0.5, 0, 0.1, 0.07), null, 'a doorway is not a wall');
  assert.strictEqual(M.room.pushOut(r, 1, 1.95, 2.5, 2.6, 0.07), null, 'above the wall');
  assert.strictEqual(M.room.walls(r).length, 1);
});

test('the server supplies the room: the first lined-up headset uploads its scan once, then only the Upload button changes it', () => {
  const hub = new Hub();
  const FA = { x: 0, y: 0, yaw: 0, z: 0 }, FB = { x: 1, y: 0.5, yaw: 0.7, z: 0.02 };
  const mk = (name, frame) => {
    const S = new M.session.Session(hub.link(name), {}), sp = new AL.Space(frame, 0), said = [];
    return { S, sp, R: new M.room.Room(S, sp, { say: (t) => said.push(t) }), said };
  };
  const a = mk('A', FA), b = mk('B', FB);
  hub.flush();
  a.S.setLined({ dist: 3 }); b.S.setLined({ dist: 3 }); hub.flush();
  a.R.setScan(scan());
  b.R.setScan({ planes: [{ l: 'floor', v: false, p: [[0, 0, 0], [1, 0, 0], [1, 1, 0]] }] });
  a.R.update(0); hub.flush();                                   // A is first: the server has no room, A uploads its scan
  b.R.update(0); hub.flush();                                   // (B does not: the server has one now)
  assert.strictEqual(b.S.doc.room.by, a.S.me);
  assert.deepStrictEqual([b.R.info().kept, b.R.info().n, b.R.info().own], [true, 4, 1]);
  // the table's corner (1, 0) of A's floor plan is the same place in B's: through the common frame
  const corner = b.R.local().planes[0].p[0], c = AL.fromCommon(FB, ...AL.toCommon(FA, 1, 0));
  near(corner[0], c[0], 0.011); near(corner[1], c[1], 0.011); near(corner[2], 0.72, 0.011, 'heights: common floor + B\'s');
  // A's scan changes: nothing goes up by itself (only the button sends a room)
  a.R.setScan({ planes: scan().planes.slice(0, 2) });
  for (let t = 1000; t < 5000; t += 1000) { a.R.update(t); hub.flush(); }
  assert.strictEqual(b.S.doc.room.data.planes.length, 4);
  // A goes: the server keeps the room, for B and for a newcomer
  hub.leave(0); hub.flush();
  assert.strictEqual(b.R.info().n, 4);
  const c2 = mk('C', FA); hub.flush();
  assert.strictEqual(c2.S.doc.room.data.planes.length, 4, 'a newcomer gets the kept room');
  c2.S.setLined({ dist: 3 }); c2.R.setScan(scan()); c2.R.update(0); hub.flush();
  assert.strictEqual(c2.S.doc.room.by, 0, 'C does not upload: the server has a room (from A, slot 0)');
  // B presses Upload (on its own menu, or C presses it on B's): B's scan is the server's room now, once
  assert.strictEqual(b.R.press('supplyRoom'), true); hub.flush();
  assert.strictEqual(c2.S.doc.room.by, b.S.me); assert.strictEqual(c2.S.doc.room.data.planes.length, 1);
  b.R.setScan(scan()); for (let t = 0; t < 3000; t += 500) { b.R.update(t); hub.flush(); }
  assert.strictEqual(c2.S.doc.room.data.planes.length, 1, 'and not again by itself');
  // not lined up: the button says so and sends nothing
  const d = mk('D', null); hub.flush(); d.R.setScan(scan()); d.R.press('supplyRoom'); hub.flush();
  assert.match(d.said.join(' '), /Line up first/); assert.strictEqual(c2.S.doc.room.by, b.S.me);
});

test('a server that restarted with no room takes the first headset\'s scan again, not an old copy', () => {
  let hub = new Hub();
  const S = new M.session.Session(hub.link('A'), {}), sp = new AL.Space({ x: 0, y: 0, yaw: 0, z: 0 }, 0), R = new M.room.Room(S, sp);
  hub.flush(); S.setLined({ dist: 3 }); R.setScan(scan()); R.update(0); hub.flush();
  assert.strictEqual(S.doc.room.data.planes.length, 4);
  R.setScan({ planes: scan().planes.slice(0, 1) });
  hub.leave(0);                                                 // the server goes away and comes back empty
  hub = new Hub(); const l = hub.link('A');
  S.link = l; l.onOpen = (h) => S._hello(h); l.onText = (m) => S._text(m); l.onClose = (w) => S._closed(w);
  hub.flush(); R.update(0); hub.flush();
  assert.strictEqual(S.doc.room.data.planes.length, 1);
});

test('alone, or not lined up, a page uses its own scan; the wrist menu shows the Room row while lining up', () => {
  const S = new M.session.Session(null, {}), sp = new AL.Space(null, 0), R = new M.room.Room(S, sp);
  R.setScan(scan()); R.update(0);
  assert.strictEqual(R.local().planes.length, 4); assert.strictEqual(S.doc.room, null, 'nothing sent');
  const L = new M.lineup.LineUp(S, sp), sys = new M.sysmenu.SysMenu(S, L, { room: R });
  sys.press('lineUp');
  const lay = M.sysmenu.SysMenu.layout(sys.info());
  assert.ok(lay.buttons.some((q) => q.id === 'supplyRoom'), 'the Room button');
  assert.ok(lay.buttons.some((q) => /own scan 4 planes/.test(q.value || '')), 'how many planes');
});

test('the cube rests on a table, falls off its edge and stops at a wall', () => {
  const cube = new C.Cube();
  cube.room = scan();
  cube.place(1.5, 0.5); cube.z = 1.0;                           // dropped over the table
  for (let i = 0; i < 100; i++) cube.step(0.01, i * 0.01, []);
  near(cube.z, 0.7 + C.HALF, 1e-6, 'on the table');
  assert.strictEqual(cube.moving(), false);
  cube.vx = -1.5;                                               // pushed off the table's edge (x = 1)
  for (let i = 0; i < 200; i++) cube.step(0.01, i * 0.01, []);
  near(cube.z, C.HALF, 1e-6, 'on the floor again'); assert.ok(cube.x < 1);
  cube.place(1, 1.7); cube.vy = 2;                              // slid at the wall (y = 2)
  for (let i = 0; i < 100; i++) cube.step(0.01, i * 0.01, []);
  assert.ok(cube.y <= 2 - C.HALF * 1.2 + 1e-9, `stopped at the wall: ${cube.y}`);
});
