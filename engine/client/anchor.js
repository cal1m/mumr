// The ANCHOR KEEPER: one persistent anchor on the floor that the page finds again in every session and after the headset was taken
// off, so that what is kept in this headset's own coordinates (the line-up, the app's own marks) comes back to the same real place.
// No THREE and no DOM: the XR calls are handed in (xr/session.js anchorIO), so Node tests can play recorded runs.
//
// What was measured on a Quest Pro (Nudgy, 2026-10-21/22), and what this does about it:
//   * taking the headset off and on fires 2-4 `reset` events on the reference space within about a second; their transforms are
//     WRONG (they claimed 2-12 m; the room planes moved under 4 m with turns of -54, 141, -14 degrees) and do not always cancel out.
//     They are passed on at once ('reset', so the line-up is carried roughly), and the anchor is looked at once they have stopped;
//   * the anchor object the page holds does NOT move with the room after a reset (it reports the pose it had: "stale");
//   * what always worked is what entering mixed reality does: ask for the anchor again by its saved handle. So after the resets, and
//     once the page is visible and nothing has reset for SETTLE ms, a stale or unknown anchor is asked for again, and its pose is
//     believed once it has said the same thing for STABLE ms ('found'). Three passes came back within 3 cm.
//
// io: { supported: bool, stored() -> uuid | null, store(uuid), restore(uuid) -> Promise<anchor>, create() -> Promise<anchor> (called
//       from inside a frame), persist(anchor) -> Promise<uuid>, pose(anchor) -> { x, y, yaw } on the floor plan | null, visible() -> bool,
//       now() -> ms, life(text) }
// Listen with on(name, fn): 'reset'(F | null)  'moved'(from, to)  'ready'(frame, restored)  'found'(frame)  'new'()  'lost'  'tracked'
(function (M) {
  const SETTLE = 2000;          // ms with no reset (and the page visible) before the anchor is looked at again
  const STABLE = 700, STABLE_M = 0.02, STABLE_RAD = 0.02, GIVE_UP = 9000;
  const YOUNG = 10000;          // ms: an anchor made in this session less than this long ago is not looked for again after a reset
  const NO_POSE = 6000;         // ms after the last reset with no anchor pose at all: stop waiting

  class Keeper {
    constructor(io) {
      this.io = io; this.bus = new M.util.Emitter();
      this.anchor = null; this.frame = null; this.persistent = false; this.posed = false; this.lost = false;
      this.tried = false; this.wantCreate = false; this.restoring = false; this.reanchor = null;
      this.track = new M.align.Resets(); this.errAt = -1e9; this.madeAt = null;
      this.stats = { resets: 0, moves: 0, finds: 0 };
    }
    on(name, fn) { this.bus.on(name, fn); return this; }
    get pending() { return this.track.pending() || !!this.reanchor; }
    // the line-up may be saved against the anchor now (its pose is known and nothing is being sorted out)
    get canSave() { return !!this.anchor && this.persistent && this.posed && !this.pending; }
    get uuid() { return this.io.stored(); }
    _life(t) { if (this.io.life) this.io.life(t); }

    // the reference space was reset: F = align.frameFromPose of the event's transform (the new origin in the old coordinates), or null
    reset(F) {
      const now = this.io.now(), cm = (v) => Math.round(v * 100), deg = (v) => Math.round(v * 180 / Math.PI);
      this.stats.resets++; this.reanchor = null;
      if (!F) { this._life('xr: tracking reset (no transform given)'); this.bus.emit('reset', null); return; }
      if (this.anchor && this.posed) this.track.begin(F, now, Object.assign({}, this.frame));
      this._life(`xr: tracking reset: origin moved by ${cm(F.x)}, ${cm(F.y)} cm, turned ${deg(F.yaw)} degrees`);
      this.bus.emit('reset', F);
    }
    // every XR frame (inside the frame callback: a new anchor can only be made there)
    update() {
      try { this._update(); } catch (e) {
        const now = this.io.now();
        if (now - this.errAt > 5000) { this.errAt = now; this._life(`anchor: error ${e && e.name ? e.name : ''}: ${e && e.message ? e.message : e}`); }
        this.reanchor = null; this.track.drop();          // (it must never stop the frame loop: that takes the whole page with it)
      }
    }
    _update() {
      const io = this.io, now = io.now();
      if (!this.tried && io.supported) {
        this.tried = true;
        const uuid = io.stored();
        if (uuid) { this.restoring = true; io.restore(uuid).then((a) => { this.anchor = a; this.persistent = true; }, () => { this.restoring = false; this.wantCreate = true; }); }
        else this.wantCreate = true;
      }
      if (this.wantCreate) {
        this.wantCreate = false; this.restoring = false;
        io.create().then(async (a) => {
          this.anchor = a; this.madeAt = io.now();
          try { const uuid = await io.persist(a); if (uuid) { io.store(uuid); this.persistent = true; } } catch (e) { this.persistent = false; }
          this._life(`anchor: a new one${this.persistent ? ', kept' : ' (not kept: this browser cannot)'}`);
          this.bus.emit('new');
        }, (e) => this._life(`anchor: could not make one (${e && e.message ? e.message : e})`));
      }
      if (this.track.ready(now, NO_POSE)) { this.track.drop(); this._life('anchor: no pose after the resets, not waiting for it any more'); }
      this._reanchor(now);
      if (!this.anchor) return;
      const raw = io.pose(this.anchor);
      if (!raw !== this.lost) { this.lost = !raw; this._life(raw ? 'anchor: tracked again' : 'anchor: not tracked (no pose)'); this.bus.emit(raw ? 'tracked' : 'lost'); }
      if (!raw) return;
      let settled = false;
      if (this.track.ready(now, SETTLE) && io.visible()) {
        const r = this.track.settle(raw), n = (v) => Math.round(v * 100);
        settled = true;
        this._life(`anchor after the resets: ${r.kind}${r.toWant ? ` (${n(r.toWant[0])} cm from where the move puts it, ${n(r.toWas[0])} cm from where it was)` : ''}`);
        if (r.kind !== 'followed') {
          // an anchor made new in this session a moment ago has nothing saved against it, and asking for it again by its handle fails while
          // it is that young (second headset, first two-headset run, 2026-10-22: a reset 0.1 s after the start): it is kept as the move puts it
          if (this.madeAt !== null && now - this.madeAt < YOUNG) this._life('anchor: made a moment ago, kept as the reset moved it');
          else this.findAgain();
        }
      }
      const f = this.track.effective(raw), g = this.frame;
      if (!g || Math.hypot(f.x - g.x, f.y - g.y) > 0.002 || Math.abs(M.util.wrap(f.yaw - g.yaw)) > 0.003) {
        if (g && this.posed && !settled && !this.track.pending() && !this.reanchor) { this.stats.moves++; this.bus.emit('moved', g, f); }
        this.frame = f;
      }
      if (!this.posed) { this.posed = true; this.bus.emit('ready', this.frame, this.restoring); this.restoring = false; }
    }
    // ask for the anchor again by its saved handle (what entering mixed reality does)
    findAgain() {
      const uuid = this.io.stored();
      if (!uuid || this.reanchor || !this.persistent) return false;
      const R = this.reanchor = { t: this.io.now(), a: null, last: null, since: 0 };
      const failed = (e) => { if (this.reanchor !== R) return; this._life(`anchor: could not be found again (${e && e.message ? e.message : e}); the carried line-up stays`); this.reanchor = null; };
      try { this.io.restore(uuid).then((a) => { if (this.reanchor === R) R.a = a; }, failed); } catch (e) { failed(e); }
      return true;
    }
    _reanchor(now) {
      const R = this.reanchor;
      if (!R) return;
      if (now - R.t > GIVE_UP) { this._life(R.a ? 'anchor: found again but its pose never settled; the carried line-up stays' : 'anchor: not found again in time; the carried line-up stays'); this.reanchor = null; return; }
      if (!R.a) return;
      const cur = this.io.pose(R.a);
      if (!cur) { R.last = null; return; }
      if (!R.last || Math.hypot(cur.x - R.last.x, cur.y - R.last.y) > STABLE_M || Math.abs(M.util.wrap(cur.yaw - R.last.yaw)) > STABLE_RAD) { R.last = cur; R.since = now; return; }
      if (now - R.since < STABLE) return;
      this.anchor = R.a; this.lost = false; this.track = new M.align.Resets(); this.frame = cur; this.reanchor = null; this.stats.finds++;
      const cm = (v) => Math.round(v * 100);
      this._life(`anchor found again at (${cm(cur.x)}, ${cm(cur.y)} cm, ${Math.round(cur.yaw * 180 / Math.PI)} deg)`);
      this.bus.emit('found', cur);
    }
  }

  M.anchor = { Keeper, SETTLE, STABLE, GIVE_UP };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
