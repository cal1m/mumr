// GRIPS: the two ways a hand holds something, for an app's simulation to use (Marek, 2026-10-22: the engine gives the game a pinch and a
// full-fist grab; the game decides what they pick up). No THREE and no DOM. Works on hands.js sources (floor plan), this page's and the
// other players' alike, so every page sees the same grips.
//
//   PINCH   the thumb and index tips touching: the source's `pinch` flag (hands.js Pinch, which the other players get on the wire too).
//           Where it holds: between the two tips.
//   FIST    the four fingers curled in: their tips on average within FIST_ON of the palm (let go beyond FIST_OFF). Where it holds: the
//           middle of the fist (the palm, the curled tips and the middle knuckles).
// A grip that has started stays the kind it started as until it ends (a fist that also brings the thumb to the index is still a fist).
//
//   const grips = new Grips();
//   grips.update(sources) -> [{ id, kind: 'pinch' | 'fist' | null, start (it began now), end (the one it was has ended now: `was`), at }]
//   grips.of(id)          the last state of that source; closing(source) 0..1, how far a hand is curled (1: a fist), for "about to grip"
(function (M) {
  const FIST_ON = 0.045, FIST_OFF = 0.06, OPEN = 0.09;    // m, the fingertips' mean distance from the palm: a fist / let go / open
  const FINGERS = ['index', 'middle', 'ring', 'pinky'], KNUCKLES = [7, 12, 17, 22];

  const pt = (s, name) => (s.points || []).find((p) => p.name === name);
  const curl = (s) => {
    const palm = pt(s, 'palm');
    if (!palm) return Infinity;
    let sum = 0;
    for (const f of FINGERS) { const p = pt(s, f); if (!p) return Infinity; sum += Math.hypot(p.x - palm.x, p.y - palm.y, p.z - palm.z); }
    return sum / FINGERS.length;
  };
  function pinchAt(s) {
    const th = pt(s, 'thumb'), ix = pt(s, 'index'), c = pt(s, 'ctrl');
    if (th && ix) return [(th.x + ix.x) / 2, (th.y + ix.y) / 2, (th.z + ix.z) / 2];
    return c ? [c.x, c.y, c.z] : null;
  }
  function fistAt(s) {
    const ps = ['palm'].concat(FINGERS).map((n) => pt(s, n)).filter(Boolean).map((p) => [p.x, p.y, p.z]);
    for (const k of KNUCKLES) if (s.joints && s.joints[k]) ps.push(s.joints[k]);
    if (!ps.length) return null;
    return [0, 1, 2].map((i) => ps.reduce((a, p) => a + p[i], 0) / ps.length);
  }
  // how far a hand is curled: 0 open, 1 a fist (a controller: 0)
  function closing(s) { const d = curl(s); return Number.isFinite(d) ? Math.max(0, Math.min(1, (OPEN - d) / (OPEN - FIST_ON))) : 0; }

  class Grips {
    constructor(opts = {}) { this.state = new Map(); this.fist = new Map(); this.opts = Object.assign({ pinch: true, fist: true }, opts); }
    of(id) { return this.state.get(id) || { id, kind: null, start: false, end: false, at: null }; }
    update(sources) {
      const out = [], seen = new Set();
      for (const s of sources || []) {
        if (s.foot) continue;
        seen.add(s.id);
        const prev = this.state.get(s.id), was = prev ? prev.kind : null;
        const d = curl(s), fw = this.fist.get(s.id) || false, fistOn = this.opts.fist && Number.isFinite(d) && (fw ? d < FIST_OFF : d < FIST_ON);
        this.fist.set(s.id, fistOn);
        const pinchOn = this.opts.pinch && !!s.pinch;
        let kind = was === 'fist' && fistOn ? 'fist' : was === 'pinch' && pinchOn ? 'pinch' : fistOn ? 'fist' : pinchOn ? 'pinch' : null;
        const st = { id: s.id, kind, start: !!kind && kind !== was, end: !!was && kind !== was, was, at: kind === 'fist' ? fistAt(s) : kind === 'pinch' ? pinchAt(s) : null };
        this.state.set(s.id, st);
        out.push(st);
      }
      for (const id of [...this.state.keys()]) if (!seen.has(id)) { this.state.delete(id); this.fist.delete(id); }
      return out;
    }
  }

  M.grab = { Grips, closing, pinchAt, fistAt, curl, FIST_ON, FIST_OFF, OPEN };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
