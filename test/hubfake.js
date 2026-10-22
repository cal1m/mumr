// A pretend server for tests with several pretend headsets in one Node process: the part of server/hub.py that the pages see
// (slots, viewers, numbered events to everybody, the kept document with key/drop/clear/scope/own/gone, ask, tokens with bodies and
// tokens made by a claim, busy, release, motion with the slot byte written, owned packet types, the newest packets for newcomers).
// Messages wait in a queue until flush(), so a test decides when the network delivers. net.test.js checks the real hub against the
// same expectations.
const assert = require('node:assert');

class Hub {
  constructor(opts = {}) {
    this.bodies = opts.bodies || []; this.owned = opts.owned || {};
    this.links = new Map(); this.n = 0; this.queue = [];
    this.tokens = {}; this.busy = {};
    for (const b of this.bodies) { this.tokens[b] = null; this.busy[b] = false; }
    this.doc = new Map(); this.latest = new Map(); this.clocks = {};
  }
  _hello(id, role) {
    const players = [...this.links].filter(([s]) => s < 100 && s !== id);
    return { t: 'hello', role, slot: id, peers: players.map(([s, o]) => ({ slot: s, name: o.name })), tokens: Object.assign({}, this.tokens), n: this.n,
      doc: [...this.doc.values()].map((d) => ({ from: d.from, e: d.e })), clocks: Object.assign({}, this.clocks), viewers: [...this.links.keys()].filter((s) => s >= 100).length };
  }
  // a pretend link.js connection; role 'viewer' for a watcher
  link(name, role = 'player') {
    const hub = this, l = { slot: null, open: false, hello: null, name, role, sent: [], onOpen: null, onText: null, onBin: null, onClose: null, clockOffset: null,
      sendText(m) { if (!l.open) return false; hub.text(l.slot, JSON.parse(JSON.stringify(m))); return true; },
      sendBin(b) { if (!l.open) return false; hub.binary(l.slot, new Uint8Array(b)); return true; } };
    let id = role === 'viewer' ? 100 : 0;
    while (this.links.has(id)) id++;
    const given = role !== 'viewer' ? this.bodies.filter((b) => this.tokens[b] === null) : [];
    for (const b of given) this.tokens[b] = id;
    this.links.set(id, l);
    this.queue.push([id, this._hello(id, role)]);
    if (role !== 'viewer') { for (const s of this.links.keys()) if (s !== id) { this.queue.push([s, { t: 'peer', slot: id, name, on: true }]); for (const b of given) this.queue.push([s, { t: 'token', body: b, slot: id }]); } }
    else for (const s of this.links.keys()) if (s < 100) this.queue.push([s, { t: 'viewers', n: [...this.links.keys()].filter((k) => k >= 100).length }]);
    for (const [k, b] of this.latest) if (k % 256 !== id) this.queue.push([id, { bin: b }]);
    return l;
  }
  all(m, but) { for (const s of this.links.keys()) if (s !== but) this.queue.push([s, m]); }
  give(body, slot) { this.tokens[body] = slot; this.busy[body] = false; this.all({ t: 'token', body, slot }); }
  event(who, e) {
    if (!e || typeof e.k !== 'string') return;
    const key = e.key, own = e.own === true, ent = key !== undefined ? this.doc.get(key) : undefined;
    if (who >= 100 && !(own && key !== undefined)) return;
    if (ent && ent.owner !== null && ent.owner !== who) return;
    if (own && (key === undefined || (ent && ent.owner === null))) return;
    if (own && ent && !e.drop && JSON.stringify(ent.e) === JSON.stringify(e)) return;
    if (typeof e.clear === 'string' && e.clear) for (const [k, d] of [...this.doc]) if (k.startsWith(e.clear) && (d.owner === null || d.owner === who)) this.doc.delete(k);
    if (key !== undefined) {
      this.doc.delete(key);
      if (!e.drop) this.doc.set(key, { e, from: who, scope: e.scope === 'slot' && who < 100 ? who : null, owner: own ? who : null,
        gone: own && e.gone ? Object.assign({}, e.gone, { key, drop: true }) : null });
    }
    this.all({ t: 'ev', n: ++this.n, from: who, e });
  }
  text(who, m) {
    if (m.t === 'ev') this.event(who, m.e);
    else if (who >= 100) return;
    else if (m.t === 'to') { if (this.links.has(m.to) && m.to < 100) this.queue.push([m.to, { t: 'to', from: who, m: m.m }]); }
    else if (m.t === 'ask') { const d = this.doc.get(m.key); if (d && d.owner !== null && d.owner !== who) this.queue.push([d.owner, { t: 'ask', key: m.key, m: m.m, from: who }]); }
    else if (m.t === 'claim') {
      if (!(m.body in this.tokens)) { this.tokens[m.body] = null; this.busy[m.body] = false; }
      if (this.tokens[m.body] !== who && !this.busy[m.body]) this.give(m.body, who);
    } else if (m.t === 'busy') { if (this.tokens[m.body] === who) this.busy[m.body] = !!m.on; }
    else if (m.t === 'release') {
      if (this.tokens[m.body] !== who) return;
      if (!this.bodies.includes(m.body)) this.give(m.body, null);
      else { const heir = [...this.links.keys()].filter((s) => s < 100 && s !== who).sort((x, y) => x - y)[0]; if (heir !== undefined) this.give(m.body, heir); }
    }
    else if (m.t === 'clock') { this.clocks[who] = m.off; this.all({ t: 'clock', slot: who, off: m.off }, who); }
  }
  binary(who, b) {
    if (who >= 100) return;
    const body = this.owned[b[0]];
    if (body !== undefined && this.tokens[body] !== who) return;
    const out = new Uint8Array(b); out[1] = who;
    this.latest.set(out[0] * 256 + who, out);
    for (const s of this.links.keys()) if (s !== who) this.queue.push([s, { bin: out }]);
  }
  leave(id) {
    const l = this.links.get(id); this.links.delete(id);
    for (const [k, d] of [...this.doc]) {
      if (d.owner === id) { this.doc.delete(k); if (d.gone) this.all({ t: 'ev', n: ++this.n, from: id, e: d.gone }); }
      else if (d.scope === id) this.doc.delete(k);
    }
    if (id < 100) {
      delete this.clocks[id];
      for (const k of [...this.latest.keys()]) if (k % 256 === id) this.latest.delete(k);
      this.all({ t: 'peer', slot: id, name: l.name, on: false });
      for (const b of Object.keys(this.tokens)) if (this.tokens[b] === id) {
        const heir = this.bodies.includes(b) ? [...this.links.keys()].filter((s) => s < 100).sort((x, y) => x - y)[0] : undefined;
        this.give(b, heir === undefined ? null : heir);
      }
    } else for (const s of this.links.keys()) if (s < 100) this.queue.push([s, { t: 'viewers', n: [...this.links.keys()].filter((k) => k >= 100).length }]);
    l.open = false; l.slot = null; if (l.onClose) l.onClose('lost');
  }
  // deliver everything that is waiting (and whatever that causes)
  flush() {
    for (let k = 0; this.queue.length; k++) {
      assert.ok(k < 20000, 'the pretend network never went quiet');
      const [id, m] = this.queue.shift(), l = this.links.get(id);
      if (!l) continue;
      if (m.bin) { if (l.onBin) l.onBin(m.bin); continue; }
      const msg = JSON.parse(JSON.stringify(m));
      if (msg.t === 'hello') { l.slot = msg.slot; l.open = true; l.hello = msg; if (l.onOpen) l.onOpen(msg); } else if (l.onText) l.onText(msg);
    }
  }
}

module.exports = { Hub };
