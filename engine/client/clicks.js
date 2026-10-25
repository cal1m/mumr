// THE MENU'S CLICKS (docs/WRIST-MENU-SPEC.md, "Sound"): two short clicks, a click and not a tone, made on the fly with Web Audio. Press: when a
// button snaps down at 1 cm, a little lower and sharper. Release: when it lets go, higher, lighter, shorter. A bigger button clicks lower. The
// sound comes from the button itself (a PannerNode at its centre), never from the head or the hand. Nothing plays for the hover lift,
// for following the finger, or for unfold and fold.
//
//   params(kind, areaCm2, rnd)      what one click is made of: { freq (Hz), noiseMs, ringMs, gain }; kind: 'press' | 'release'; rnd: 0..1
//   render(rate, p)                 its samples (Float32Array): a few ms of band-passed noise plus a damped sine
//   new Clicks()                    unlock() on a tap (a page may not make sound before); play(kind, areaCm2, [x, y, z] (XR)); listen(pos, fwd, up)
(function (M) {
  // The pitch of a button's ring (before the press / release factor): a button of the wrist menu (10.1 x 3 cm, 30 cm²) rings at 2 kHz, and a bigger one lower
  // (the square root of the area: the full-width one at 1.4 kHz). A smaller one rises only slowly (the fourth root: a 2 x 2 cm button at 3.3 kHz,
  // not the 5.5 the square root would give; Marek, 2026-10-25: "smaller button is too high")
  const BASE_HZ = 2024, REF_CM2 = 30;
  const KIND = { press: { pitch: 0.8, noiseMs: 6, ringMs: 35, gain: 0.5 }, release: { pitch: 1.25, noiseMs: 3, ringMs: 20, gain: 0.3 } };

  function params(kind, areaCm2, rnd = 0.5) {
    const k = KIND[kind] || KIND.press, a = Math.max(1, areaCm2), scale = a >= REF_CM2 ? Math.sqrt(REF_CM2 / a) : Math.pow(REF_CM2 / a, 0.25);
    return { freq: BASE_HZ * scale * k.pitch * (0.985 + 0.03 * rnd), noiseMs: k.noiseMs, ringMs: k.ringMs, gain: k.gain };
  }

  // The samples of one click. The noise is white noise through a band-pass (RBJ biquad, Q 2) at the ring frequency, faded out over noiseMs; the
  // ring is a sine at the same frequency that dies away with a time constant of ringMs / 4 (so it is gone after ringMs).
  function render(rate, p) {
    const n = Math.ceil(rate * (p.ringMs + 10) / 1000), out = new Float32Array(n), w0 = 2 * Math.PI * p.freq / rate, al = Math.sin(w0) / 4, b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * Math.cos(w0), a2 = 1 - al;
    const nn = Math.max(1, Math.round(rate * p.noiseMs / 1000)), tau = rate * p.ringMs / 4000;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, seed = 12345;
    for (let i = 0; i < n; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = i < nn ? ((seed / 4294967296) * 2 - 1) * (1 - i / nn) : 0, y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      out[i] = y * 3 + Math.sin(w0 * i) * Math.exp(-i / tau) * 0.6;
    }
    let peak = 1e-6;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (let i = 0; i < n; i++) out[i] = out[i] / peak * p.gain;
    return out;
  }

  class Clicks {
    constructor() { this.ctx = null; this.cache = new Map(); this.on = true; }
    // call from a tap or click (entering mixed reality): a page may make no sound before that
    unlock() {
      try {
        if (!this.ctx) { const C = globalThis.AudioContext || globalThis.webkitAudioContext; if (!C) return false; this.ctx = new C(); }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      } catch (e) { return false; }
    }
    // where the listener is (the head, XR space), once a frame
    listen(pos, fwd, up) {
      const L = this.ctx && this.ctx.listener;
      if (!L) return;
      try {
        if (L.positionX) { L.positionX.value = pos[0]; L.positionY.value = pos[1]; L.positionZ.value = pos[2]; L.forwardX.value = fwd[0]; L.forwardY.value = fwd[1]; L.forwardZ.value = fwd[2]; L.upX.value = up[0]; L.upY.value = up[1]; L.upZ.value = up[2]; }
        else { L.setPosition(pos[0], pos[1], pos[2]); L.setOrientation(fwd[0], fwd[1], fwd[2], up[0], up[1], up[2]); }
      } catch (e) { /* no listener: the click is not spatial */ }
    }
    play(kind, areaCm2, at) {
      const c = this.ctx;
      if (!this.on || !c || c.state !== 'running') return false;
      try {
        const p = params(kind, areaCm2, Math.random()), buf = c.createBuffer(1, Math.ceil(c.sampleRate * (p.ringMs + 10) / 1000), c.sampleRate);
        buf.copyToChannel(render(c.sampleRate, p), 0);
        const src = c.createBufferSource(), pan = c.createPanner();
        src.buffer = buf; pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 0.3; pan.rolloffFactor = 1;
        if (pan.positionX) { pan.positionX.value = at[0]; pan.positionY.value = at[1]; pan.positionZ.value = at[2]; } else pan.setPosition(at[0], at[1], at[2]);
        src.connect(pan); pan.connect(c.destination); src.start();
        return true;
      } catch (e) { return false; }
    }
  }

  M.clicks = { params, render, Clicks, BASE_HZ, REF_CM2 };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
