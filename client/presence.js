// PRESENCE: where each player is (the head) and what their hands and feet are doing, 45 times a second, in the common frame. Only its
// owner writes it; nobody holds a token for it. The other players' hands count in every simulation (a push from another player is
// applied in the frame it happens), so this also gives the page everybody's hands in its own coordinates. No THREE and no DOM.
//
// Coordinates on this page are the floor plan (align.js Space): head [x, y, heading, height above this headset's floor, pitch];
// a source (a hand, a foot, a controller) { id, points: [{ name, x, y, z }], joints: [[x, y, z] x 25] (optional), pinch, grip, ... }.
(function (M) {
  const SEND_EVERY = 22;        // ms: 45 a second
  const FRESH = 500;            // ms: another player's hands older than this are not used

  class Presence {
    // session: a Session; space: this page's align.Space; opts: { every (ms), fresh (ms) }
    constructor(session, space, opts = {}) {
      this.session = session; this.space = space;
      this.every = opts.every || SEND_EVERY; this.fresh = opts.fresh || FRESH;
      this.guard = new M.wire.Guard();
      this.players = new Map();          // slot -> { at (ms, ours), clock (ms, theirs), head, sources } in our coordinates
      this._sentAt = -1e9;
      this.stats = { sent: 0, got: 0, old: 0 };
      session.on('peer', (slot, on) => { if (!on) { this.players.delete(slot); this.guard.forget(slot); } });
      session.on('leave', () => { this.players.clear(); });
    }
    // Every frame: this page's head and hands go out when there is somebody to see them. Says whether a packet went.
    send(nowMs, head, sources) {
      const S = this.session, sp = this.space;
      if (!S.sending() || !sp.ok || nowMs - this._sentAt < this.every) return false;
      this._sentAt = nowMs;
      const h = head || [0, 0, 0, 0, 0], c = sp.toCommon([h[0], h[1], h[3]]);
      const out = (sources || []).map((s) => Object.assign({}, s, {
        points: (s.points || []).map((p) => { const q = sp.toCommon([p.x, p.y, p.z]); return { name: p.name, x: q[0], y: q[1], z: q[2] }; }),
        joints: s.joints ? s.joints.map((j) => sp.toCommon(j)) : undefined,
        yaw: Number.isFinite(s.yaw) ? sp.yawToCommon(s.yaw) : undefined,
      }));
      const ok = S.link.sendBin(M.wire.encode('presence', { head: [c[0], c[1], sp.yawToCommon(h[2]), c[2], h[4] || 0], sources: out }, nowMs));
      if (ok) this.stats.sent++;
      return !!ok;
    }
    // A presence packet came (wire.decode's result). Taken in our own coordinates; it is also the sign that the player is alive.
    receive(p, nowMs) {
      if (!p || p.name !== 'presence') return false;
      if (!this.guard.fresh(p.type, p.slot, p.clock)) { this.stats.old++; return false; }
      this.session.seen(p.slot, nowMs);
      const sp = this.space;
      if (!sp.ok) return false;
      const h = p.data.head, c = sp.fromCommon([h[0], h[1], h[3]]);
      const sources = p.data.sources.map((s) => Object.assign({}, s, {
        points: s.points.map((q) => { const o = sp.fromCommon([q.x, q.y, q.z]); return { name: q.name, x: o[0], y: o[1], z: o[2] }; }),
        joints: s.joints ? s.joints.map((j) => sp.fromCommon(j)) : undefined,
        yaw: Number.isFinite(s.yaw) ? sp.yawFromCommon(s.yaw) : undefined,
      }));
      this.players.set(p.slot, { at: nowMs, clock: p.clock, head: [c[0], c[1], sp.yawFromCommon(h[2]), c[2], h[4]], sources });
      this.stats.got++;
      return true;
    }
    // the other players that are lined up and heard from lately: [{ slot, time (s, their clock), head, sources }]
    others(nowMs) {
      const S = this.session, out = [];
      for (const [slot, p] of this.players) if (nowMs - p.at <= this.fresh && S.lined(slot)) out.push({ slot, time: p.clock / 1000, head: p.head, sources: p.sources });
      return out;
    }
    // this page's hands and everybody else's, as one list for a simulation (ids made unique: 'p1-left')
    hands(own, nowMs) {
      const all = (own || []).slice();
      for (const o of this.others(nowMs)) for (const s of o.sources) all.push(Object.assign({}, s, { id: `p${o.slot}-${s.id}`, slot: o.slot, time: o.time }));
      return all;
    }
  }

  M.presence = { Presence, SEND_EVERY, FRESH };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
