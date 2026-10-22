// Small helpers every client file uses. No THREE and no DOM.
(function (M) {
  // a finite number (and within [lo, hi] when they are given)
  const num = (v, lo = -Infinity, hi = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const round = (v, d = 4) => { const k = Math.pow(10, d); return Math.round(v * k) / k; };
  const nowMs = () => (globalThis.performance ? performance.now() : Date.now());
  // listeners by name: on(name, fn) adds one, emit(name, ...args) calls them all (one that throws does not stop the others), ask(name, ...args)
  // returns the first answer that is not undefined
  class Emitter {
    constructor() { this._on = {}; }
    on(name, fn) { (this._on[name] = this._on[name] || []).push(fn); return this; }
    off(name, fn) { const l = this._on[name]; if (l) this._on[name] = l.filter((f) => f !== fn); return this; }
    emit(name, ...a) { for (const f of this._on[name] || []) { try { f(...a); } catch (e) { if (M.util.onError) M.util.onError(e, name); } } }
    ask(name, ...a) { for (const f of this._on[name] || []) { const r = f(...a); if (r !== undefined) return r; } return undefined; }
  }
  M.util = { num, wrap, clone, round, nowMs, Emitter, onError: null };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
