// The cube demo's logic (examples/cube/cube.js): pushed by a hand, held between a thumb and a finger, falling, shared by two headsets.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../client/index.js');
const C = require('../examples/cube/cube.js');
const { Hub } = require('./hubfake.js');

const pt = (name, x, y, z) => ({ name, x, y, z });
const finger = (id, x, y, z) => ({ id, points: [pt('index', x, y, z)] });

test('a fingertip that moves into the cube pushes it along, and it slides to a stop', () => {
  const c = new C.Cube();
  c.place(0.5, 0);
  let t = 0;
  for (let k = 0; k < 30; k++) { t += 1 / 60; c.step(1 / 60, t, [finger('right', 0.40 + k * 0.004, 0, 0.05)]); }
  assert.ok(c.x > 0.52, `moved: ${c.x}`);
  assert.ok(c.vx > 0, 'with the hand\'s speed');
  for (let k = 0; k < 300; k++) { t += 1 / 60; c.step(1 / 60, t, []); }
  assert.strictEqual(c.moving(), false);
  assert.ok(Math.abs(c.y) < 0.02);
});

test('only a pinch that starts at the cube holds it; it goes up with the hand and falls when the fingers part', () => {
  const c = new C.Cube();
  c.place(0, 0);
  const hand = (x, z, pinch) => ({ id: 'left', pinch, points: [pt('thumb', x - 0.005, 0, z), pt('index', x + 0.005, 0, z)] });
  let t = 0;
  c.step(0.016, t += 0.016, [hand(C.HALF + 0.01, C.HALF, false)]);
  c.step(0.016, t += 0.016, [hand(C.HALF + 0.01, C.HALF, true)]);
  assert.ok(c.held && c.held.by === 'left', 'pinched at its side');
  for (let k = 1; k <= 20; k++) c.step(0.016, t += 0.016, [hand(C.HALF + 0.01, C.HALF + k * 0.01, true)]);
  assert.ok(Math.abs(c.z - (C.HALF + 0.2)) < 1e-6, `lifted 20 cm: ${c.z}`);
  c.step(0.016, t += 0.016, [hand(C.HALF + 0.01, C.HALF + 0.2, false)]);
  assert.strictEqual(c.held, null, 'the fingers parted');
  for (let k = 0; k < 60; k++) c.step(0.016, t += 0.016, []);
  assert.ok(Math.abs(c.z - C.HALF) < 1e-6, 'on the floor again');
  // a pinch that started away from the cube and then came to it does not take it; nor do a thumb and a finger on opposite sides
  c.step(0.016, t += 0.016, [hand(0.3, C.HALF, true)]);
  c.step(0.016, t += 0.016, [hand(C.HALF + 0.01, C.HALF, true)]);
  assert.strictEqual(c.held, null, 'the pinch has to start at the cube');
  c.step(0.016, t += 0.016, [{ id: 'r', pinch: false, points: [pt('thumb', -C.HALF - 0.005, 0, C.HALF), pt('index', C.HALF + 0.005, 0, C.HALF)] }]);
  assert.strictEqual(c.held, null, 'fingers that do not touch each other do not hold it');
  c.place(0, 0);
  c.step(0.016, t += 0.016, [{ id: 'leg', foot: true, points: [pt('ankle', 0.05, 0, 0.05)] }]);
  assert.ok(Math.abs(c.x) < 1e-6, 'a leg does not push it');
});

test('two headsets: B pushes the cube, takes the token by touching it, and A sees it where B has it in the room', () => {
  const hub = new Hub({ bodies: ['cube'], owned: { 16: 'cube' } });
  const mk = (name, frame) => {
    const S = new M.session.Session(hub.link(name), { game: C.GAME, player: C.PLAYER, actions: C.ACTIONS, press: C.press });
    const sp = new M.align.Space(frame, 0), cube = new C.Cube(), body = new M.body.Body(S, { token: 'cube', type: 'cube', adapter: C.adapter(cube, sp) });
    S.link.onBin = (b) => body.receive(M.wire.decode(b), 0);
    return { S, sp, cube, body };
  };
  const a = mk('A', { x: 0, y: 0, yaw: 0, z: 0 }), b = mk('B', { x: 2, y: 1, yaw: 1.2, z: 0.02 });
  hub.flush();
  a.S.setLined({ dist: 3 }); b.S.setLined({ dist: 3 }); hub.flush();
  for (const h of [a, b]) { const p = h.sp.fromCommon([0.5, 0]); h.cube.place(p[0], p[1]); }
  // B's finger moves towards +x of the common frame, into the cube
  let t = 0;
  for (let k = 0; k < 40; k++) {
    t += 1 / 60;
    const tip = b.sp.fromCommon([0.36 + k * 0.004, 0, 0.05]), own = [finger('right', tip[0], tip[1], tip[2])];
    b.body.frame(t * 1000, own); hub.flush();
    b.cube.step(1 / 60, t, own); b.body.send(t * 1000); hub.flush();
    a.cube.step(1 / 60, t, []);
  }
  assert.strictEqual(b.body.mine, true, 'the toucher holds the token');
  const ca = a.sp.toCommon([a.cube.x, a.cube.y]), cb = b.sp.toCommon([b.cube.x, b.cube.y]);
  assert.ok(cb[0] > 0.52, `B pushed it: ${cb}`);
  assert.ok(Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) < 0.02, `A has it where B has it: ${ca} ${cb}`);
  // Cube here from A's menu: a request to B, who holds it
  a.S.press(null, 'colour'); hub.flush();
  assert.strictEqual(b.S.doc.game.colour, 1);
  a.body.ask('place', { x: -1, y: -1 }); hub.flush();
  const nb = b.sp.toCommon([b.cube.x, b.cube.y]);
  assert.ok(Math.hypot(nb[0] + 1, nb[1] + 1) < 1e-6);
});

test('the cube menu has only the cube’s items; the engine items are on the wrist menu', () => {
  const lay = C.menu({ count: 4, colour: 1, ghost: true }, { players: 2 });
  assert.deepStrictEqual(lay.buttons.filter((q) => q.id).map((q) => q.id), ['plus', 'colour', 'cubeHere', 'ghost']);
  assert.strictEqual(lay.buttons.find((q) => q.id === 'plus').value, '4');
  const SM = M.sysmenu.SysMenu;
  const ids = (l) => l.buttons.filter((q) => q.id).map((q) => q.id);
  assert.deepStrictEqual(ids(SM.layout({ open: false })), ['sysOpen'], 'folded: one wrist button');
  assert.deepStrictEqual(ids(SM.layout({ open: true, lined: true, dist: 3.34 })), ['sysClose', 'lineUp', 'roomSetup', 'exit']);
  assert.deepStrictEqual(ids(SM.layout({ open: true, lining: true, fields: [{ placed: true }, {}, {}] })), ['sysClose', 'lineUp', 'p1create', 'p1delete', 'p1lock', 'p2create', 'p2delete', 'p2lock', 'p3create', 'p3delete', 'p3lock']);
  assert.ok(SM.width({ open: true }) > SM.width({ open: false }) * 3);
});

test('the wrist menu: its buttons act at its owner, Line up opens it, and it shows while the inside of the left wrist looks at you', () => {
  const S = new M.session.Session(null, {}), sp = new M.align.Space(null, 0), L = new M.lineup.LineUp(S, sp), done = [];
  const sys = new M.sysmenu.SysMenu(S, L, { exit: () => done.push('exit'), roomSetup: () => done.push('room') });
  assert.deepStrictEqual([sys.press('sysOpen'), sys.open, sys.press('sysClose'), sys.open], [true, true, true, false]);
  sys.press('lineUp');
  assert.deepStrictEqual([L.active, sys.open, sys.info().lining], [true, true, true], 'lining up opens it, so that the fields are seen');
  sys.press('exit'); sys.press('roomSetup');
  assert.deepStrictEqual(done, ['exit', 'room']);
  assert.strictEqual(sys.press('plus'), false, 'not one of the engine’s');
  // a left hand held up in front of the eyes (1.6 m), palm side towards them: wrist joints in XR space
  const jp = new Float32Array(75), set = (i, x, y, z) => { jp[i * 3] = x; jp[i * 3 + 1] = y; jp[i * 3 + 2] = z; };
  set(0, 0, 1.3, -0.35); set(6, 0.03, 1.38, -0.35); set(11, 0, 1.39, -0.35); set(21, -0.035, 1.37, -0.35);
  const head = [0, 0, Math.PI / 2, 1.6, -0.5];
  let pose = sys.place(head, jp, 0);
  const flipped = new Float32Array(jp); flipped[6 * 3] = -0.03; flipped[21 * 3] = 0.035;
  const other = sys.place(head, flipped, 0);
  assert.ok((pose === null) !== (other === null), 'one side of the wrist shows it, the other hides it');
  pose = pose || sys.place(head, jp, 0) || sys.place(head, flipped, 0);
  assert.ok(pose && Number.isFinite(pose.yaw) && pose.h > 1, JSON.stringify(pose));
  assert.strictEqual(sys.place(head, null, 0), null, 'no hand: no menu');
  // open and unused for a minute: it folds by itself (not while lining up)
  let t = 0;
  const S2 = new M.session.Session(null, {}), L2 = new M.lineup.LineUp(S2, new M.align.Space(null, 0)), said = [];
  const s2 = new M.sysmenu.SysMenu(S2, L2, { now: () => t, say: (x) => said.push(x) });
  s2.press('sysOpen'); t = 59000; s2.tick();
  assert.strictEqual(s2.open, true);
  s2.use(); t = 118000; assert.strictEqual(s2.tick(), false, 'a fingertip at it a minute ago');
  t = 120500; assert.strictEqual(s2.tick(), true); assert.strictEqual(s2.open, false);
  s2.press('lineUp'); t = 400000; s2.tick();
  assert.strictEqual(s2.open, true, 'not while lining up');
  assert.strictEqual(said.length, 1);
});
