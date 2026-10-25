// The packets (engine/client/wire.js): one header for every type, the registry, presence (byte for byte Nudgy's), JSON types, the order guard.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../client/index.js');
const W = M.wire;

// Nudgy's simulator/mr/wire.js packPresence of the same object, 2026-10-22
const NUDGY_P = '020040e20100e2040cfe581b540618fc020011b80b0000000084030a00ecff85031400d8ff86031e00c4ff87032800b0ff880332009cff89033c0088ff8a03460074ff8b03500060ff8c035a004cff8d03640038ff8e036e0024ff8f03780010ff90038200fcfe91038c00e8fe92039600d4fe9303a000c0fe9403aa00acfe9503b40098fe9603be0084fe9703c80070fe9803d2005cfe9903dc0048fe9a03e60034fe9b03f00020fe9c030502008002006400c8001e00079cfffa000000';
const joints = () => Array.from({ length: 25 }, (_, i) => [0.01 * i, -0.02 * i, 0.9 + 0.001 * i]);
const SAMPLE = { head: [1.25, -0.5, 0.7, 1.62, -0.1], sources: [{ id: 'left', joints: joints(), pinch: true, yaw: 0.3 },
  { id: 'mouse', points: [{ name: 'index', x: 0.1, y: 0.2, z: 0.03 }, { name: 'toe', x: -0.1, y: 0.25, z: 0 }], foot: true }] };
const hex = (u8) => Buffer.from(u8).toString('hex');

test('presence is byte for byte the packet Nudgy sends, and comes back', () => {
  const b = W.encode('presence', SAMPLE, 123456);
  assert.strictEqual(hex(b), NUDGY_P);
  const p = W.decode(b);
  assert.deepStrictEqual([p.type, p.name, p.slot, p.clock], [2, 'presence', 0, 123456]);
  assert.deepStrictEqual(p.data.head, [1.25, -0.5, 0.7, 1.62, -0.1]);
  const [hand, mouse] = p.data.sources;
  assert.strictEqual(hand.joints.length, 25);
  assert.ok(Math.abs(hand.joints[24][2] - 0.924) < 1e-9);
  assert.deepStrictEqual([hand.pinch, hand.yaw, hand.points.map((q) => q.name)], [true, 0.3, ['thumb', 'index', 'middle', 'ring', 'pinky', 'palm']]);
  assert.deepStrictEqual([mouse.id, mouse.foot, mouse.points.map((q) => [q.name, q.x, q.y, q.z])], ['mouse', true, [['index', 0.1, 0.2, 0.03], ['toe', -0.1, 0.25, 0]]]);
});

test('an app registers its own types; a name or a type cannot be taken twice; unknown or broken packets decode to null', () => {
  const s = W.register({ type: 16, name: 'cube', token: 'cube',
    pack: (o) => { const b = new Uint8Array(12), d = new DataView(b.buffer); o.p.forEach((v, i) => d.setFloat32(i * 4, v, true)); return b; },
    unpack: (d) => (d.byteLength === 12 ? { p: [0, 1, 2].map((i) => d.getFloat32(i * 4, true)) } : null),
    blend: (a, b, f) => ({ p: W.blend.lerpArr(a.p, b.p, f) }) });
  assert.strictEqual(W.spec('cube'), s); assert.strictEqual(W.spec(16), s);
  assert.throws(() => W.register({ type: 16, name: 'other', pack() {}, unpack() {} }), /cube already/);
  assert.throws(() => W.register({ type: 17, name: 'cube', pack() {}, unpack() {} }), /type 16 already/);
  assert.throws(() => W.register({ type: 300, name: 'x', pack() {}, unpack() {} }), /not a byte/);
  const b = W.encode('cube', { p: [1, 2, 3] }, 5);
  assert.deepStrictEqual(W.decode(b), { type: 16, name: 'cube', slot: 0, clock: 5, data: { p: [1, 2, 3] } });
  assert.strictEqual(W.decode(b.slice(0, 10)), null, 'cut short');
  assert.strictEqual(W.decode(new Uint8Array([99, 0, 0, 0, 0, 0])), null, 'nobody registered type 99');
  assert.strictEqual(W.decode(new Uint8Array([2, 0])), null);
  assert.deepStrictEqual([W.typeOf(b), W.slotOf(b)], [16, 0]);
});

test('JSON types carry a clock too (Nudgy\'s M did not)', () => {
  const b = W.encode('menus', { main: [1, 2, 3], mode: 'lineup' }, 77);
  b[1] = 3;
  assert.deepStrictEqual(W.decode(b), { type: 4, name: 'menus', slot: 3, clock: 77, data: { main: [1, 2, 3], mode: 'lineup' } });
  assert.strictEqual(W.decode(new Uint8Array([4, 0, 0, 0, 0, 0, 0x5b, 0x5d])), null, 'an array is not a menu');
  W.jsonType(40, 'notes');
  assert.deepStrictEqual(W.decode(W.encode(40, { hi: 1 }, 2)).data, { hi: 1 });
});

test('the guard drops what is older than the newest from the same sender and type, and takes a sender that started again', () => {
  const g = new W.Guard();
  assert.deepStrictEqual([g.fresh(2, 0, 100), g.fresh(2, 0, 90), g.fresh(2, 1, 90), g.fresh(4, 0, 50), g.fresh(2, 0, 100), g.fresh(2, 0, 101)], [true, false, true, true, false, true]);
  assert.strictEqual(g.fresh(2, 0, 20000), true);
  assert.strictEqual(g.fresh(2, 0, 3), true, 'more than 5 s back: a page that started again');
  g.forget(1);
  assert.strictEqual(g.fresh(2, 1, 1), true);
  assert.strictEqual(g.dropped, 2);
});

test('the presence lists can be the app\'s own', () => {
  const before = { ids: W.presence.ids.slice(), names: W.presence.names.slice() };
  W.configurePresence({ ids: ['left', 'right', 'stick'], names: ['tip', 'grip'] });
  const p = W.decode(W.encode('presence', { head: [0, 0, 0, 0, 0], sources: [{ id: 'stick', points: [{ name: 'grip', x: 0, y: 0, z: 1 }] }] }, 1));
  assert.deepStrictEqual([p.data.sources[0].id, p.data.sources[0].points[0].name], ['stick', 'grip']);
  W.configurePresence(before);
});
