// The room model (model.js): its scale and the way between the room and the model; its handles (only its owner's hands carry and turn
// it); a thing dragged in it; the viewer's place shared through the document (room.js wallSpot, SPOT_KIND); the cube put somewhere.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../client/index.js');
const C = require('../examples/cube/cube.js');
const { Hub } = require('./hubfake.js');
const MD = M.model, AL = M.align;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);

const room = () => ({ planes: [
  { l: 'floor', v: false, p: [[-1, -1.5, 0], [3, -1.5, 0], [3, 1.6, 0], [-1, 1.6, 0]] },
  { l: 'table', v: false, p: [[0.9, 0, 0.72], [1.7, 0, 0.72], [1.7, 0.6, 0.72], [0.9, 0.6, 0.72]] },
  { l: 'wall', v: true, p: [[-1, 1.6, 0], [3, 1.6, 0], [3, 1.6, 2.4], [-1, 1.6, 2.4]] },
  { l: 'wall', v: true, p: [[3, -1.5, 0], [3, 1.6, 0], [3, 1.6, 2.4], [3, -1.5, 2.4]] },
] });
// a hand that pinches (or not) at `at`
const hand = (id, at, pinch) => ({ id, pinch, points: [{ name: 'thumb', x: at[0] - 0.003, y: at[1], z: at[2] }, { name: 'index', x: at[0] + 0.003, y: at[1], z: at[2] }] });

test('the model is the room at its scale: half a metre for the longest side, there and back', () => {
  const F = MD.frameOf(room()), pose = { x: 0.3, y: 0.2, z: 0.9, yaw: 0.6 };
  near(F.s, 0.5 / 4, 1e-9); near(F.cx, 1, 1e-9); near(F.cy, 0.05, 1e-9); near(F.h, 2.4, 1e-9);
  const p = [1.3, 0.3, 0.72], q = MD.toModel(pose, F, p), back = MD.fromModel(pose, F, q);
  back.forEach((v, i) => near(v, p[i], 1e-9));
  near(MD.toModel(pose, F, [F.cx, F.cy, 0])[2], 0.9, 1e-9, 'the floor\'s middle is the pose');
  assert.ok(MD.inside(pose, F, q) && !MD.inside(pose, F, [pose.x, pose.y, pose.z + 0.5]));
});

test('its handles: the owner carries and turns it; another player\'s hands only move the things in it', () => {
  const F = MD.frameOf(room()), pose = { x: 0, y: 0, z: 1, yaw: 0 }, H = MD.handles(pose, F);
  const things = [{ id: 'cube', at: [1.3, 0.3, 0.78] }];
  const mine = () => [{ key: 'own', mine: true, pose, F, things }], theirs = () => [{ key: 'p1', mine: false, pose, F, things }];
  const h = new MD.Hands();
  h.update([hand('r', H.move, false)], mine());
  let ev = h.update([hand('r', H.move, true)], mine());
  assert.deepStrictEqual(ev.map((e) => [e.what, e.phase]), [['move', 'start']]);
  ev = h.update([hand('r', [H.move[0] + 0.1, H.move[1], H.move[2] + 0.05], true)], mine());
  near(ev[0].pose.x, 0.1, 1e-9); near(ev[0].pose.z, 1.05, 1e-9);
  h.update([hand('r', H.move, false)], mine());
  // the ball: walked a quarter round the model's middle, it turns the model a quarter
  h.update([hand('r', H.turn, true)], mine());
  const r = Math.hypot(H.turn[0] - pose.x, H.turn[1] - pose.y);
  ev = h.update([hand('r', [pose.x, pose.y + r, H.turn[2]], true)], mine());
  near(ev[0].pose.yaw, Math.PI / 2, 1e-9);
  h.update([hand('r', H.turn, false)], mine());
  // another player's model: its handles are not ours
  const o = new MD.Hands();
  o.update([hand('r', H.move, false)], theirs());
  assert.deepStrictEqual(o.update([hand('r', H.move, true)], theirs()), []);
  // the cube in it: taken, dragged, let go, at the room's place under the hand
  const c = MD.toModel(pose, F, things[0].at), g = new MD.Hands();
  g.update([hand('l', c, false)], theirs());
  assert.deepStrictEqual(g.update([hand('l', c, true)], theirs()).map((e) => [e.what, e.id, e.phase]), [['thing', 'cube', 'start']]);
  const to = MD.toModel(pose, F, [0, -1, 0.3]);
  g.update([hand('l', to, true)], theirs());
  ev = g.update([hand('l', to, false)], theirs());
  assert.strictEqual(ev[0].phase, 'drop'); [0, -1, 0.3].forEach((v, i) => near(ev[0].at[i], v, 1e-9));
});

test('the viewer goes only onto a wall: the nearest one to where it is let go, at that height, facing into the room', () => {
  const r = room(), size = { w: 1, h: 0.56 };
  const d = M.room.wallSpot(r, size);
  near(d.y, 1.58, 1e-9, 'the longest wall, a little off it'); near(d.x, 1, 1e-9); near(d.yaw, -Math.PI / 2, 1e-9, 'facing into the room');
  const s = M.room.wallSpot(r, size, [2.6, -0.4, 1.7]);
  near(s.x, 2.98, 1e-9, 'the other wall'); near(s.y, -0.4, 1e-9); near(s.h, 1.7, 1e-9); near(Math.abs(s.yaw), Math.PI, 1e-9);
  const e = M.room.wallSpot(r, size, [-5, 1.5, 9]);
  near(e.x, -1 + 0.5, 1e-9, 'kept on the wall: its end'); near(e.h, 2.4 - 0.28, 1e-9, 'and under its top');
});

test('two headsets: where the viewer hangs is one place for both (and for a newcomer); the cube is put where a model said', () => {
  const hub = new Hub({ bodies: ['cube'], owned: { 16: 'cube' } });
  const FA = { x: 0, y: 0, yaw: 0, z: 0 }, FB = { x: 1, y: 0.5, yaw: 0.7, z: 0 };
  const mk = (name, frame) => {
    const S = new M.session.Session(hub.link(name), { game: C.GAME, player: C.PLAYER, kinds: { wallspot: M.room.SPOT_KIND } }), sp = new AL.Space(frame, 0), cube = new C.Cube();
    const body = new M.body.Body(S, { token: 'cube', type: 'cube', adapter: C.adapter(cube, sp) });
    S.link.onBin = (b) => body.receive(M.wire.decode(b), 0);
    return { S, sp, cube, body };
  };
  const a = mk('A', FA), b = mk('B', FB);
  hub.flush(); a.S.setLined({ dist: 3 }); b.S.setLined({ dist: 3 }); hub.flush();
  // B moves the viewer (in B's floor plan) to (0.4, 0.9), 1.5 m up, facing heading 2
  const c = b.sp.toCommon([0.4, 0.9, 1.5]);
  b.S.emit({ k: 'wallspot', x: c[0], y: c[1], h: c[2], yaw: b.sp.yawToCommon(2) }); hub.flush();
  const w = a.S.doc.wallspot, inA = a.sp.fromCommon([w.x, w.y, w.h]), same = AL.fromCommon(FA, ...AL.toCommon(FB, 0.4, 0.9));
  near(inA[0], same[0], 1e-9); near(inA[1], same[1], 1e-9); near(inA[2], 1.5, 1e-9);
  const n = mk('N', FA); hub.flush();
  assert.deepStrictEqual(n.S.doc.wallspot, a.S.doc.wallspot, 'a newcomer gets it');
  // the cube: B (not holding it) puts it 30 cm up at (0.5, 0.5) of A's plan; A holds it and does it; it falls to the floor
  const holder = [a, b].find((p) => p.S.holds('cube')), other = holder === a ? b : a;
  const pc = holder.sp.toCommon([0.5, 0.5, 0.3]);
  other.body.ask('put', { x: pc[0], y: pc[1], z: pc[2] }); hub.flush();
  near(holder.cube.x, 0.5, 1e-9); near(holder.cube.z, 0.3, 1e-9);
  for (let i = 0; i < 60; i++) holder.cube.step(0.016, i * 0.016, []);
  near(holder.cube.z, C.HALF, 1e-9, 'it fell onto the floor');
});
