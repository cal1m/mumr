// The page's end of the connection, with a pretend socket: what it does when the other end goes quiet, when the page
// itself was paused, and what it reports about a close.
const test = require('node:test');
const assert = require('node:assert');
const N = require('../client/index.js');
const { connect } = N.link;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class FakeWS {
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(d) { this.sent.push(typeof d === 'string' ? JSON.parse(d) : d); }
  close() { this.readyState = 3; }
  // the pretend server
  open() { this.readyState = 1; if (this.onopen) this.onopen(); }
  say(obj) { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }
  hang(code, reason) { this.readyState = 3; if (this.onclose) this.onclose({ code, reason, wasClean: code === 1000 }); }
}
FakeWS.all = [];
function make(extra = {}) {
  FakeWS.all = [];
  let clock = 1000;
  const notes = [], closes = [];
  const link = connect('ws://x/ws', Object.assign({ build: 5, name: 'q', WebSocket: FakeWS, pingMs: 10, deadMs: 200, retryMs: 20, now: () => clock }, extra));
  link.onNote = (w) => notes.push(w); link.onClose = (w) => closes.push(w);
  return { link, notes, closes, tick: (ms) => { clock += ms; }, ws: () => FakeWS.all[FakeWS.all.length - 1] };
}
const join = (m) => { m.ws().open(); m.ws().say({ t: 'hello', slot: 0, peers: [], tokens: { sim: 0, holo: 0 }, n: 0 }); };

test('a connection that says nothing any more is given up on and made again, instead of being believed in', async () => {
  const m = make(); join(m);
  assert.ok(m.link.open); assert.strictEqual(FakeWS.all.length, 1);
  for (let k = 0; k < 16; k++) { await sleep(12); m.tick(20); }         // 320 ms of nothing, in pretend time (the limit is 200)
  await sleep(40);
  assert.deepStrictEqual(m.closes, ['stalled']);
  assert.ok(!m.link.open);
  assert.ok(m.notes.some((n) => /nothing heard for .* reconnecting/.test(n)), m.notes.join(' | '));
  await sleep(80);
  assert.ok(FakeWS.all.length >= 2, 'a new one was opened');
  const second = m.ws(); second.open();
  assert.strictEqual(second.sent[0].t, 'join', 'and it joins again');
  m.link.close();
});

test('an answering connection is never given up on', async () => {
  const m = make(); join(m);
  for (let k = 0; k < 30; k++) { await sleep(12); m.tick(20); m.ws().say({ t: 'pong', c: 1 }); }
  assert.ok(m.link.open); assert.deepStrictEqual(m.closes, []); assert.strictEqual(FakeWS.all.length, 1);
  m.link.close();
});

test('a page that was paused (headset off, page frozen) is not mistaken for a dead server', async () => {
  const m = make(); join(m);
  m.tick(10 * 60 * 1000);                                    // ten minutes pass with no timer running
  await sleep(40);                                           // the first tick after it
  assert.ok(m.link.open, 'it is still believed in: messages that were waiting may arrive now');
  assert.ok(m.notes.some((n) => /page was paused for \d+\.\d s/.test(n)), m.notes.join(' | '));
  m.ws().say({ t: 'pong', c: 1 });
  for (let k = 0; k < 5; k++) { await sleep(12); m.tick(20); m.ws().say({ t: 'pong', c: 1 }); }
  assert.ok(m.link.open);
  m.link.close();
});

test('why a connection closed is kept and reported: the code and the reason', async () => {
  const m = make(); join(m);
  m.ws().hang(1001, 'going away');
  assert.deepStrictEqual(m.link.lastClose, { code: 1001, reason: 'going away', clean: false });
  assert.ok(m.notes.some((n) => /closed, code 1001, going away/.test(n)), m.notes.join(' | '));
  assert.deepStrictEqual(m.closes, ['lost']);
  await sleep(60);
  assert.ok(m.notes.some((n) => /reconnecting in 0\.0\d s/.test(n)) && FakeWS.all.length === 2, 'and it comes back');
  m.link.close();
});

test('a refusal is not retried, and is reported', async () => {
  const m = make();
  m.ws().open(); m.ws().say({ t: 'refused', why: 'version' }); m.ws().hang(1000, '');
  await sleep(80);
  assert.strictEqual(FakeWS.all.length, 1, 'no second try');
  assert.ok(m.notes.some((n) => /refused: version/.test(n)));
  assert.deepStrictEqual(m.closes, ['version']);
  m.link.close();
});

test('the clock of the server is worked out from the pongs, from the quickest round trips', () => {
  const m = make({ pingMs: 100000 }); join(m);
  assert.strictEqual(m.link.clockOffset, null); assert.strictEqual(m.link.serverNow(), null);
  const ws = m.ws(); let t = 1000;                                              // (t: the pretend clock of make())
  // a server whose clock is 5000 ms ahead of ours; the ping goes out, the server reads its clock after the first leg, the pong is back after the second
  const pong = (out, back) => { const t0 = t; t += out + back; m.tick(out + back); ws.say({ t: 'pong', c: t0, s: t0 + out + 5000 }); t += 100; m.tick(100); };
  for (const [o, b] of [[10, 10], [10, 10], [10, 290], [10, 10], [11, 11], [10, 10], [10, 390]]) pong(o, b);    // (two of them waited on the way back)
  assert.ok(Math.abs(m.link.clockOffset - 5000) < 1, `the offset ${m.link.clockOffset}`);
  assert.ok(m.link.clockSpread < 1, `the spread ${m.link.clockSpread}`);
  assert.ok(Math.abs(m.link.serverNow() - (t + 5000)) < 1);
  m.link.close();
});

test('the join message carries the role of the page when it asks for one', () => {
  const m = make({ join: { role: 'feed', for: 1, key: 'k' } });
  m.ws().open();
  assert.deepStrictEqual(m.ws().sent[0], { t: 'join', build: 5, name: 'q', role: 'feed', for: 1, key: 'k' });
  m.link.close();
});
