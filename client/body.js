// A BODY: a thing that moves under physics or under hands (Nudgy's loco and balls, its network hologram, a cube). Every page simulates
// it all the time, with everybody's hands, so it answers a hand in the frame the hand touches it. One page's simulation is the game's:
// whoever holds the body's TOKEN. The holder sends the state (a packet type registered in wire.js, owned by the token on the server);
// the others take it in. No THREE and no DOM.
//
// Who holds it (opts.policy):
//   'touch'   (default) whoever's hand reaches for it asks for the token (adapter.reach) and keeps it while a hand is on it
//             (adapter.touching): the one who touches never waits for the network. Give the token to the server as one of its `bodies`
//             so that somebody always simulates it.
//   'owner'   one player's thing (opts.owner: a slot, or 'me' for this page's own): that page claims it and keeps it; others only ask
//   (planned: 'host', a host page on the PC holds it at rest and a touch takes it: docs/PLAN.md)
//
// The adapter is the app's (all in the common frame where it says so):
//   reach(hands) -> bool          a hand of THIS page is near enough to ask for it
//   touching(hands) -> bool       a hand of this page is on it
//   pack() -> obj                 the state to send (common frame): what wire.encode(type, obj) takes
//   apply(data, info) -> bool     take in the holder's state. info: { slot, clock (ms, theirs), now (ms, ours), first (the first since
//                                 the holder changed: snap, do not glide) }
//   settle(mine)                  the token changed hands (mine: this page holds it now)
//   do(what, args, from) -> bool  carry out a request (on the holder, or alone)
//   moving() -> bool              (optional) a still body is sent slowly (opts.slowEvery), or not at all with slowEvery: 0
//   keyframe() / takeKeyframe(d)  (optional) the full state for a newcomer (things the fast packet leaves out)
(function (M) {
  class Body {
    // opts: { token, type (wire type name or number), adapter, policy, owner, every (ms, 21: 45 a second), slowEvery (ms, 250) }
    constructor(session, opts) {
      this.session = session;
      this.token = opts.token; this.type = opts.type; this.a = opts.adapter;
      this.policy = opts.policy || 'touch'; this.owner = opts.owner === undefined ? null : opts.owner;
      this.every = opts.every || 21; this.slowEvery = opts.slowEvery === undefined ? 250 : opts.slowEvery;
      this.guard = new M.wire.Guard();
      this._sentAt = -1e9; this._first = true; this._held = undefined;
      this.stats = { claims: 0, grants: 0, handovers: 0, sent: 0, got: 0, applied: 0, old: 0, requests: 0 };
      const S = session;
      S.on('token', (t, mine) => { if (t === this.token) this._token(mine); });
      S.on('do', (t, what, args, from) => { if (t === this.token) this.a.do(what, args, from); });
      S.on('keyframe?', (t) => (t === this.token && this.a.keyframe ? this.a.keyframe() : undefined));
      S.on('keyframe', (t, data, from) => { if (t === this.token && this.a.takeKeyframe && !S.holds(t)) this.a.takeKeyframe(data, from); });
    }
    get mine() { return this.session.holds(this.token); }
    _ownerSlot() { return this.owner === 'me' ? this.session.me : this.owner; }
    _token(mine) {
      this.guard = new M.wire.Guard();          // (the one that sends now has a clock of its own)
      this._first = true;
      if (this._held !== undefined && this._held !== mine) { this.stats.handovers++; if (mine) this.stats.grants++; }       // (the first word on it is not a handover)
      this._held = mine;
      if (this.a.settle) this.a.settle(mine);
    }

    // Every frame, before the simulation steps. own: this page's hands (floor plan). Claims and says busy as the policy says.
    frame(nowMs, own) {
      const S = this.session;
      if (!S.connected || S.isViewer) return;
      if (this.policy === 'owner') {
        const mineToOwn = this._ownerSlot() === S.me;
        if (mineToOwn && !S.holds(this.token) && S.claim(this.token, nowMs)) this.stats.claims++;
        S.setBusy(this.token, mineToOwn && S.holds(this.token));
        return;
      }
      if (!S.sharing()) { S.setBusy(this.token, false); return; }
      if (!S.holds(this.token) && this.a.reach(own)) { if (S.claim(this.token, nowMs)) this.stats.claims++; }
      S.setBusy(this.token, S.holds(this.token) && !!this.a.touching(own));
    }
    // After the simulation stepped: the holder's state goes out when somebody can see it. Says whether a packet went.
    send(nowMs) {
      const S = this.session;
      if (!S.sending() || !S.holds(this.token)) return false;
      const still = this.a.moving && !this.a.moving();
      if (still && !this.slowEvery) return false;
      if (nowMs - this._sentAt < (still ? this.slowEvery : this.every)) return false;
      this._sentAt = nowMs;
      const ok = S.link.sendBin(M.wire.encode(this.type, this.a.pack(), nowMs));
      if (ok) this.stats.sent++;
      return !!ok;
    }
    // A packet came (wire.decode's result). Only the holder's is taken, and only by a page that does not hold it.
    receive(p, nowMs) {
      const S = this.session, s = M.wire.spec(this.type);
      if (!p || !s || p.type !== s.type) return false;
      this.stats.got++;
      if (S.holds(this.token) || p.slot !== S.holder(this.token)) return false;
      if (!this.guard.fresh(p.type, p.slot, p.clock)) { this.stats.old++; return false; }
      const ok = this.a.apply(p.data, { slot: p.slot, clock: p.clock, now: nowMs, first: this._first });
      if (ok !== false) { this.stats.applied++; this._first = false; }
      return ok !== false;
    }
    // Something to be done to the body on behalf of this page (args in the common frame): shared, it goes to the holder as an event;
    // alone, or held here, it is done at once. Says which.
    ask(what, args) {
      const S = this.session;
      this.stats.requests++;
      if (S.connected && !S.holds(this.token)) { S.emit({ k: 'do', token: this.token, what, args: args || {} }); return 'sent'; }
      this.a.do(what, args || {}, S.me);
      return 'local';
    }
    status() {
      const S = this.session;
      return Object.assign({ token: this.token, policy: this.policy, holder: S.holder(this.token), mine: this.mine }, this.stats);
    }
  }

  M.body = { Body };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
