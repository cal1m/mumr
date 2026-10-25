// The PC's view of the world (engine/client/worldfeed.js) on the pretend server, and the life log (engine/client/life.js).
const test = require('node:test');
const assert = require('node:assert');
const M = require('../client/index.js');
const { Hub } = require('./hubfake.js');
const W = M.wire;

W.register({ type: 16, name: 'puck', token: 'puck',
  pack: (o) => { const b = new Uint8Array(8), d = new DataView(b.buffer); d.setFloat32(0, o.x, true); d.setFloat32(4, o.y, true); return b; },
  unpack: (d) => ({ x: d.getFloat32(0, true), y: d.getFloat32(4, true) }),
  blend: (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }) });
const KINDS = { 'mark+': { keep: (e) => ({ key: `mark:${e.id}` }), apply: (S, e) => { S.doc.marks[e.id] = e.x; } } };
const opts = { kinds: KINDS, init: (d) => { d.marks = {}; }, game: { floor: 'grid' } };

test('a viewer that comes late sees the document and the newest motion at once, then every packet, by the server\'s time', () => {
  const hub = new Hub({ bodies: ['puck'], owned: { 16: 'puck' } });
  const a = new M.session.Session(hub.link('A'), opts); hub.flush();
  a.emit({ k: 'mark+', id: 'm', x: 3 }); hub.flush();
  a.link.sendBin(W.encode('puck', { x: 1, y: 1 }, 1000));
  a.link.clockOffset = 500; a.tick(0); hub.flush();
  let now = 0;
  const feed = new M.worldfeed.WorldFeed({ link: hub.link('pc', 'viewer'), session: opts, now: () => now });
  const seen = []; feed.on('ready', () => seen.push('ready'));
  hub.flush();
  assert.deepStrictEqual([feed.ready, feed.doc.marks, feed.doc.game.floor], [true, { m: 3 }, 'grid']);
  assert.deepStrictEqual(feed.sample('puck', null), { slot: 0, t: 1500, data: { x: 1, y: 1 } }, 'the newest kept packet came with the hello; t = clock + offset');
  a.link.sendBin(W.encode('puck', { x: 3, y: 1 }, 1100)); hub.flush();
  assert.deepStrictEqual(feed.sample('puck', null, 1550).data, { x: 2, y: 1 }, 'half way between the two samples');
  assert.deepStrictEqual(feed.sample('puck', 0, 9999).data, { x: 3, y: 1 });
  a.link.sendBin(W.encode('puck', { x: 0, y: 0 }, 1050)); hub.flush();
  assert.strictEqual(feed.counts.ignored, 1, 'an older packet that came late is not kept');
  now = 40;
  assert.strictEqual(feed.age('puck', 0), 40);
  assert.deepStrictEqual(feed.players().map((p) => [p.slot, p.name]), [[0, 'A']]);
  a.emit({ k: 'mark+', id: 'n', x: 4 }); hub.flush();
  assert.deepStrictEqual(feed.doc.marks, { m: 3, n: 4 });
  hub.leave(0); hub.flush();
  assert.strictEqual(feed.sample('puck', 0), null, 'a player who left takes its streams along');
  assert.deepStrictEqual(seen, ['ready']);
});

test('the life log numbers its lines, posts each at once, sends again what failed, and keeps the last ones', async () => {
  const posts = [], store = new Map();
  let ok = false;
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const fetch = (url, o) => { posts.push([url, JSON.parse(o.body), o.keepalive]); return Promise.resolve({ ok }); };
  const life = M.life.make({ name: 'Quest 3', fetch, storage, keep: 2, clock: () => new Date(2026, 9, 22, 11, 8, 46) });
  life('entered mixed reality');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepStrictEqual(posts[0][1], { pid: life.pid, name: 'Quest 3', n: 1, lines: ['11:08:46 entered mixed reality'] });
  assert.strictEqual(posts[0][2], true, 'keepalive: it gets out while the page is being hidden');
  assert.strictEqual(life.pending(), 1, 'the server did not take it');
  ok = true;
  life('hidden'); life('visible');
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  const last = posts[posts.length - 1][1];
  assert.ok(posts.some((p) => p[1].n === 1 && p[1].lines.length >= 2), 'the failed line went again with the next');
  assert.strictEqual(life.pending(), 0, JSON.stringify(last));
  assert.deepStrictEqual(life.lines(), ['#2 11:08:46 hidden', '#3 11:08:46 visible']);
  const again = M.life.make({ fetch, storage, clock: () => new Date(2026, 9, 22, 11, 9, 0) });
  assert.strictEqual(again.pid, life.pid, 'a reload in the same tab is the same page');
  assert.strictEqual(again('reloaded'), 4, 'and goes on counting');
});
