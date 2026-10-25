// The menu's two clicks (docs/WRIST-MENU-SPEC.md, "Sound"): the pitch follows the button's size, the press is lower and longer than the release,
// and what is rendered is a short, finite, quiet click that dies away.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../client/index.js');

test('a click: lower for a bigger button, the press lower and longer than the release, a few percent of random pitch', () => {
  const C = M.clicks, near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, `${m || ''} ${a} vs ${b}`);
  near(C.params('release', 30, 0.5).freq, 2024 * 1.25, 1, 'a wrist button, 10.1 x 3 cm');
  near(C.params('press', 30, 0.5).freq, 2024 * 0.8, 1, 'its press');
  near(C.params('release', 63, 0.5).freq / 1.25, 1397, 3, 'the full-width button: about 1.4 kHz before the press / release factor');
  near(C.params('release', 120, 0.5).freq * 2, C.params('release', 30, 0.5).freq, 1, 'four times the area: an octave lower');
  const small = C.params('release', 4, 0.5).freq / 1.25, wrist = C.params('release', 30, 0.5).freq / 1.25;
  assert.ok(small > wrist && small < 3500, `a 2 x 2 cm button rises only slowly: ${small} Hz (the square root would give 5.5 kHz)`);
  const p = C.params('press', 30, 0.5), r = C.params('release', 30, 0.5);
  assert.ok(p.freq < r.freq && p.noiseMs > r.noiseMs && p.ringMs > r.ringMs);
  assert.ok(C.params('press', 30, 1).freq / C.params('press', 30, 0).freq < 1.032 && C.params('press', 30, 1).freq > C.params('press', 30, 0).freq, 'about 1.5 % either way');
  for (const q of [p, r]) {
    const s = C.render(48000, q);
    assert.ok(s.length <= 48000 * (q.ringMs + 10) / 1000 + 1 && s.every(Number.isFinite));
    const peak = s.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
    assert.ok(peak > 0.1 && peak <= q.gain + 1e-6, `peak ${peak}`);
    const tail = s.slice(Math.floor(s.length * 0.8)).reduce((a, v) => Math.max(a, Math.abs(v)), 0);
    assert.ok(tail < peak * 0.1, 'it has died away by the end');
  }
});
