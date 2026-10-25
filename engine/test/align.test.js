const test = require('node:test');
const assert = require('node:assert');
const N = require('../client/index.js');
const AL = N.align;

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b}`);
// a real spot (room coordinates) as a headset sees it whose own frame is turned by `yaw` and starts at (ox, oy)
const seenBy = (h) => (x, y) => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw), dx = x - h.ox, dy = y - h.oy; return [c * dx + s * dy, -s * dx + c * dy]; };
// hold a fingertip still at (x, y, z) for `secs`, 90 frames a second; returns everything update() said
function hold(al, tip, secs, extra = []) {
  const out = [];
  for (let k = 0; k < Math.round(secs * 90); k++) { const r = al.update(1 / 90, [tip, ...extra]); if (r) out.push(r); }
  return out;
}
const lift = (al, id = 'right') => al.update(1 / 90, [{ id, x: 9, y: 9, z: 0.5, pinch: false }]);

test('two players touch the same two spots: every other spot of the room then agrees between them', () => {
  const A = seenBy({ yaw: 0.3, ox: 1, oy: -2 }), B = seenBy({ yaw: -2.1, ox: -0.5, oy: 3 });
  const s1 = [0.4, 0.7], s2 = [1.9, 0.2];
  const fa = AL.fromPoints(A(...s1), A(...s2)), fb = AL.fromPoints(B(...s1), B(...s2));
  near(fa.dist, Math.hypot(1.5, 0.5), 1e-9); near(fa.dist, fb.dist, 1e-9, 'both measure the same distance');
  for (const p of [[0, 0], [2.5, -1.2], [-3, 4]]) {
    const ca = AL.toCommon(fa, ...A(...p)), cb = AL.toCommon(fb, ...B(...p));
    near(ca[0], cb[0], 1e-9); near(ca[1], cb[1], 1e-9);
    const back = AL.fromCommon(fb, ...ca), want = B(...p);
    near(back[0], want[0], 1e-9); near(back[1], want[1], 1e-9);
    // and straight from one headset to the other
    const t = AL.between(fa, fb), direct = AL.apply(t, ...A(...p));
    near(direct[0], want[0], 1e-9); near(direct[1], want[1], 1e-9);
    const inv = AL.apply(AL.invert(t), ...want); near(inv[0], A(...p)[0], 1e-9);
  }
  // spot 1 is the common origin and spot 2 lies on the common x axis, for everyone
  assert.deepStrictEqual(AL.toCommon(fa, ...A(...s1)).map((v) => +v.toFixed(9)), [0, 0]);
  const c2 = AL.toCommon(fb, ...B(...s2)); near(c2[0], fb.dist, 1e-9); near(c2[1], 0, 1e-9);
  // a heading goes with it
  near(AL.yawFromCommon(fa, AL.yawToCommon(fa, 1.1)), 1.1, 1e-12);
  near(AL.wrap(AL.yawToCommon(fa, 0.5 - 0.3) - AL.yawToCommon(fb, 0.5 + 2.1)), 0, 1e-9, 'the same real direction is the same common heading');
  assert.strictEqual(AL.fromPoints([0, 0], [0.1, 0]), null, 'too close together to give a direction');
});

test('a space both headsets share: its pose in each headset is that headset\'s frame', () => {
  const q = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const f = AL.fromPose({ x: 1, y: 0, z: -2 }, q(0));
  near(f.x, 1, 1e-12); near(f.y, 2, 1e-12); near(f.yaw, Math.PI / 2, 1e-12, 'unturned, it looks along -Z, which is +y on the floor');
  near(AL.fromPose({ x: 0, y: 0, z: 0 }, q(Math.PI / 2)).yaw, Math.PI, 1e-9, 'turned a quarter to the left');
});

test('how good touched points are: 1 cm off at spots 30 cm apart is 14 cm at 2 m, at 1.5 m apart it is under 4 cm', () => {
  near(AL.errorAt(0.3, 2), 0.143, 0.002);
  assert.ok(AL.errorAt(1.5, 2) < 0.04);
});

// (most of these take a spot in 0.8 s instead of the real 10 s, so that a test is not 900 frames per spot)
const quick = () => new AL.Aligner({ dwell: 0.8, still: 0.005 });
const tipAt = (x, y, z = 0.02, pinch = false, id = 'r') => ({ id, x, y, z, pinch });
function lined(al, p1 = [0, 0], p2 = [1, 0], z = 0.02) {
  hold(al, tipAt(p1[0], p1[1], z), al.cfg.dwell + 0.1); lift(al, 'r');
  hold(al, tipAt(p2[0], p2[1], z), al.cfg.dwell + 0.1); lift(al, 'r');
  return al;
}

test('a fingertip resting on the floor takes a spot: the first, then the second', () => {
  const al = quick(), tip = tipAt(0.5, 0.2, 0.02, false, 'right');
  assert.deepStrictEqual(hold(al, tip, 0.76), []);
  assert.ok(al.progress > 0.9 && al.progress < 1 && Math.abs(al.at[0] - 0.5) < 1e-9, `the ring is nearly full: ${al.progress}`);
  assert.deepStrictEqual(hold(al, tip, 0.06), ['took1']);
  near(al.points[0][0], 0.5, 1e-9); near(al.points[0][1], 0.2, 1e-9); near(al.points[0][2], 0.02, 1e-9, 'with its height'); assert.strictEqual(al.frame, null);
  // staying there takes nothing more
  assert.deepStrictEqual(hold(al, tip, 2), []); assert.strictEqual(al.progress, 0);
  lift(al, 'right');
  assert.deepStrictEqual(hold(al, tipAt(2.0, 0.2, 0.06, false, 'right'), 0.9), ['took2']);
  near(al.frame.dist, 1.5, 1e-9); near(al.frame.yaw, 0, 1e-9); near(al.frame.x, 0.5, 1e-9);
  near(al.frame.z, 0.04, 1e-9, 'the common floor is where the two spots lie: halfway between their heights');
  // lined up: a fingertip on the floor is just a fingertip on the floor
  lift(al, 'right');
  assert.deepStrictEqual(hold(al, tipAt(1, 1, 0.01, false, 'right'), 2), []);
  assert.strictEqual(al.progress, 0);
});

test('as built: ten seconds of resting, and the spot is the average of that time', () => {
  const al = new AL.Aligner();
  assert.strictEqual(al.cfg.dwell, 10); assert.strictEqual(al.cfg.floor, 0.10); assert.strictEqual(al.cfg.fine, 1 / 20);
  // the fingertip trembles 3 mm round (0.5, 0.2) at a height of 65 mm, as measured on a Quest 3
  const said = [];
  for (let k = 0; k < 10.2 * 90; k++) {
    const r = al.update(1 / 90, [tipAt(0.5 + 0.003 * Math.sin(k * 0.7), 0.2 + 0.003 * Math.cos(k * 1.3), 0.065 + 0.004 * Math.sin(k * 0.31))]);
    if (r) said.push([r, k / 90]);
    if (k === 450) assert.ok(Math.abs(al.progress - 0.5) < 0.02, `half way after 5 s: ${al.progress}`);
  }
  assert.strictEqual(said.length, 1); assert.strictEqual(said[0][0], 'took1'); assert.ok(said[0][1] > 9.9 && said[0][1] < 10.1, `taken at ${said[0][1]} s`);
  near(al.points[0][0], 0.5, 0.0005, 'the tremble averages out'); near(al.points[0][1], 0.2, 0.0005); near(al.points[0][2], 0.065, 0.001);
  // a move of 2 cm during the wait starts it again from there
  const b = new AL.Aligner();
  hold(b, tipAt(1, 1), 6); assert.ok(b.progress > 0.55);
  b.update(1 / 90, [tipAt(1.02, 1)]); assert.ok(b.progress < 0.01, 'it starts again');
  assert.deepStrictEqual(hold(b, tipAt(1.02, 1), 9.9), []); assert.deepStrictEqual(hold(b, tipAt(1.02, 1), 0.2), ['took1']);
  near(b.points[0][0], 1.02, 1e-9, 'and the first place is not in the average');
});

test('a fingertip that wanders, is above the floor or pinches takes nothing', () => {
  const al = quick();
  for (let k = 0; k < 180; k++) assert.strictEqual(al.update(1 / 90, [tipAt(0.5 + k * 0.00012, 0.2 + (k % 20 < 10 ? 0.004 : -0.004))]), null);
  assert.deepStrictEqual(hold(al, tipAt(0.5, 0.2, 0.12), 2), [], '12 cm above the floor');
  assert.deepStrictEqual(hold(quick(), tipAt(0.5, 0.2, 0.07), 1), ['took1'], 'a fingertip on the floor can read 7 cm up (measured on a Quest 3)');
  assert.deepStrictEqual(hold(al, tipAt(0.5, 0.2, 0.01, true), 2), [], 'pinching');
  assert.deepStrictEqual(hold(al, tipAt(NaN, 0.2, 0.01), 2), [], 'not tracked');
  assert.deepStrictEqual(al.points, [null, null]);
});

test('the second spot closer than 15 cm to the first is refused, and said so', () => {
  const al = quick();
  hold(al, tipAt(0, 0), 0.9); lift(al, 'r');
  assert.deepStrictEqual(hold(al, tipAt(0.1, 0), 0.9), ['tooClose']);
  assert.strictEqual(al.points[1], null); assert.strictEqual(al.frame, null);
  lift(al, 'r');
  assert.deepStrictEqual(hold(al, tipAt(0.5, 0), 0.9), ['took2']);
});

test('with two hands tracked only the one on the floor takes the spot; the other pinching in the air does nothing', () => {
  const al = quick();
  const got = hold(al, tipAt(0.3, 0.3, 0.02, false, 'right'), 0.9, [tipAt(0.1, 0.5, 0.9, true, 'left')]);
  assert.deepStrictEqual(got, ['took1']);
  near(al.points[0][0], 0.3, 1e-9); assert.strictEqual(al.held, -1);
});

test('every taken spot has three knobs: along the line to the other spot, across it, and up', () => {
  const al = lined(quick(), [0, 0], [1, 0], 0.02), K = al.knobs();
  assert.strictEqual(K.length, 6);
  const k = (i, axis) => K.find((q) => q.i === i && q.axis === axis);
  near(k(0, 'along').x, -0.10, 1e-9, 'away from the other spot, not between them'); near(k(0, 'along').y, 0, 1e-9);
  near(k(1, 'along').x, 1.10, 1e-9);
  near(Math.abs(k(0, 'across').y), 0.10, 1e-9); near(k(0, 'across').x, 0, 1e-9);
  near(k(0, 'up').x, 0, 1e-9); near(k(0, 'up').z, 0.02 + 0.16, 1e-9, 'above the spot');
  assert.ok(K.every((q) => !q.held && q.pull === 0));
  assert.strictEqual(new AL.Aligner().knobs().length, 0);
});

test('fine adjustment: a knob pulled 20 cm moves its spot 1 cm, in its own direction only', () => {
  const al = lined(quick(), [0, 0], [1, 0], 0.02);
  const pull = (i, axis, d) => {
    const k = al.knobs().find((q) => q.i === i && q.axis === axis), dir = al._dirs(i)[axis];
    let said = null;
    al.update(1 / 90, [tipAt(k.x, k.y, k.z, false)]);
    assert.strictEqual(al.update(1 / 90, [tipAt(k.x + 0.01, k.y, k.z, true)]), null, 'taking it moves nothing');
    assert.strictEqual(al.held, i); assert.strictEqual(al.grabbed.axis, axis);
    // the hand goes d along the knob's direction, and wanders 5 cm sideways on the way
    for (let n = 1; n <= 20; n++) { const u = d * n / 20, w = 0.05 * Math.sin(n); said = al.update(1 / 90, [tipAt(k.x + 0.01 + dir[0] * u - dir[1] * w, k.y + dir[1] * u + dir[0] * w, k.z + dir[2] * u, true)]) || said; }
    const shown = al.knobs().find((q) => q.held);
    al.update(1 / 90, [tipAt(k.x, k.y, 0.5, false)]);
    return { said, shown };
  };
  let r = pull(1, 'across', 0.20);
  assert.strictEqual(r.said, 'moved');
  near(al.points[1][1], 0.01 * Math.sign(al._dirs(1).across[1] || 1), 2e-4, 'a twentieth of 20 cm, across');
  near(al.points[1][0], 1, 2e-4, 'and not along');
  near(r.shown.pull, 0.20, 1e-9, 'the knob itself went with the hand');
  near(al.frame.yaw, Math.atan2(al.points[1][1], 1), 1e-6, 'the frame follows');
  assert.strictEqual(al.held, -1); assert.strictEqual(al.grabbed, null);
  const before = al.points[0].slice();
  r = pull(0, 'up', 0.20);
  near(al.points[0][2], before[2] + 0.01, 1e-9, 'up: the spot is 1 cm higher'); near(al.points[0][0], before[0], 1e-12); near(al.points[0][1], before[1], 1e-12);
  near(al.frame.z, (al.points[0][2] + al.points[1][2]) / 2, 1e-12, 'and the common floor with it');
  r = pull(0, 'along', -0.10);
  near(Math.hypot(al.points[0][0] - before[0], al.points[0][1] - before[1]), 0.005, 1e-4, 'pushed in: half a centimetre towards the other spot');
  // a pinch away from every knob holds nothing, and a hand that tracking loses lets go
  al.update(1 / 90, [tipAt(0.5, 0.5, 0.3, false)]); al.update(1 / 90, [tipAt(0.5, 0.5, 0.3, true)]); assert.strictEqual(al.held, -1);
  al.update(1 / 90, [tipAt(0.5, 0.5, 0.3, false)]);
  const k = al.knobs()[0];
  al.update(1 / 90, [tipAt(k.x, k.y, k.z, false)]); al.update(1 / 90, [tipAt(k.x, k.y, k.z, true)]); assert.strictEqual(al.held, k.i);
  al.update(1 / 90, []); assert.strictEqual(al.held, -1);
});

test('the check spot: armed, the next spot taken comes back in the common frame and the two spots stay', () => {
  const al = quick();
  assert.strictEqual(al.armCheck(), false, 'not before lining up');
  lined(al, [1, 1], [1, 2.5]);
  const before = JSON.stringify(al.points);
  assert.strictEqual(al.armCheck(), true);
  assert.deepStrictEqual(hold(al, tipAt(0, 2), 0.9), ['check']);
  near(al.lastCheck[0], 1, 1e-9, 'one metre along the line from spot 1 to spot 2'); near(al.lastCheck[1], 1, 1e-9, 'one metre to its left');
  assert.strictEqual(JSON.stringify(al.points), before); assert.strictEqual(al.checking, false);
  // a frame given from outside (the PC rehearsal) and starting again
  al.use({ x: 1, y: 0.5, yaw: 0.7 }); assert.strictEqual(al.frame.how, 'given'); assert.strictEqual(al.frame.z, 0); assert.deepStrictEqual(al.points, [null, null]);
  al.restart(); assert.strictEqual(al.frame, null);
});

test('lining up entered again: the counter starts at spot 1, so both spots can be placed again (Marek, 2026-10-13)', () => {
  const al = lined(quick(), [0, 0], [1, 0], 0.02);
  const frame0 = Object.assign({}, al.frame);
  al.beginSession();
  assert.deepStrictEqual(al.frame, frame0, 'the line-up stays in force: the other player is not disturbed');
  assert.strictEqual(al.want(), 0);
  assert.ok(al.points[0] && al.points[1], 'and the spots stay (with their knobs) until they are replaced');
  assert.strictEqual(al.knobs().length, 6);
  // a fingertip resting on the floor now takes spot 1 again, not a check mark
  assert.deepStrictEqual(hold(al, tipAt(0.03, 0.02, 0.03), 0.9), ['took1']);
  near(al.points[0][0], 0.03, 1e-9); near(al.points[0][1], 0.02, 1e-9);
  assert.strictEqual(al.want(), 1); lift(al, 'r');
  assert.deepStrictEqual(hold(al, tipAt(1.02, 0.01, 0.03), 0.9), ['took2']);
  near(al.points[1][0], 1.02, 1e-9); assert.strictEqual(al.want(), null, 'then nothing more is waited for');
  near(al.frame.dist, Math.hypot(0.99, -0.01), 1e-9, 'the frame follows the new spots'); assert.strictEqual(al.lastCheck, null);
  lift(al, 'r');
  assert.deepStrictEqual(hold(al, tipAt(2, 2, 0.02), 1.5), [], 'a finger resting anywhere else takes nothing now');
  // a third time, with nothing placed in between
  al.endSession(); al.beginSession(); assert.strictEqual(al.want(), 0);
  // a spot that is locked is skipped
  assert.strictEqual(al.lock(0), 'locked'); assert.strictEqual(al.want(), 1);
  // first time ever: nothing there, spot 1
  assert.strictEqual(quick().want(), 0);
});

test('create, delete and lock, for each spot', () => {
  const al = quick();
  // empty: nothing to delete or lock; a check mark needs a line-up
  assert.strictEqual(al.remove(0), 'empty'); assert.strictEqual(al.lock(1), 'empty'); assert.strictEqual(al.remove(2), 'empty');
  assert.strictEqual(al.create(2), 'needframe'); assert.strictEqual(al.lock(2), 'empty');
  lined(al, [0, 0], [1, 0], 0.02);
  assert.strictEqual(al.want(), null);
  // create: the next resting fingertip takes that spot, whatever the counter says
  assert.strictEqual(al.create(1), 'armed'); assert.strictEqual(al.want(), 1);
  assert.deepStrictEqual(hold(al, tipAt(1.3, 0.2, 0.02), 0.9), ['took2']);
  near(al.points[1][0], 1.3, 1e-9); assert.strictEqual(al.want(), null, 'and then it is done'); lift(al, 'r');
  // pressing create again while it waits stops the waiting, even when the counter had it waiting already
  const b = quick(); assert.strictEqual(b.want(), 0);
  assert.strictEqual(b.create(0), 'cancelled'); assert.strictEqual(b.want(), null);
  assert.deepStrictEqual(hold(b, tipAt(0.5, 0.2), 1.5), [], 'nothing is taken');
  assert.strictEqual(b.create(0), 'armed'); assert.deepStrictEqual(hold(b, tipAt(0.5, 0.2), 0.9), ['took1']);
  assert.strictEqual(b.create(2), 'needframe');
  // the check mark: create it, rest a finger, it is there; delete it
  assert.strictEqual(al.create(2), 'armed');
  assert.deepStrictEqual(hold(al, tipAt(0.5, 1), 0.9), ['check']); assert.ok(al.lastCheck); assert.strictEqual(al.want(), null);
  assert.strictEqual(al.remove(2), 'deleted'); assert.strictEqual(al.lastCheck, null); assert.strictEqual(al.remove(2), 'empty');
  // delete a calibration spot: the line-up is gone, and it is the next one to be taken
  const frameBefore = al.frame, p1 = al.points[1].slice();
  assert.strictEqual(al.remove(0), 'deleted');
  assert.strictEqual(al.points[0], null); assert.strictEqual(al.frame, null); assert.deepStrictEqual(al.points[1], p1, 'the other spot stays');
  assert.strictEqual(al.want(), 0); assert.strictEqual(al.knobs().length, 3, 'only the knobs of the spot that is left');
  assert.strictEqual(al.create(2), 'needframe');
  lift(al, 'r');
  assert.deepStrictEqual(hold(al, tipAt(-0.2, 0.1), 0.9), ['took1']);
  assert.ok(al.frame && al.frame.dist > 1, 'placed again: lined up again'); assert.notStrictEqual(al.frame, frameBefore);
  // lock: its knobs are gone, a resting finger does not replace it, and it cannot be deleted or created over
  assert.strictEqual(al.lock(1), 'locked'); assert.strictEqual(al.knobs().length, 3);
  assert.strictEqual(al.remove(1), 'locked'); assert.strictEqual(al.create(1), 'locked');
  const keep = al.points[1].slice(); al.beginSession(); assert.strictEqual(al.want(), 0);
  lift(al, 'r'); assert.deepStrictEqual(hold(al, tipAt(-0.25, 0.1), 0.9), ['took1']); assert.strictEqual(al.want(), null, 'the locked one is not waited for');
  lift(al, 'r'); assert.deepStrictEqual(hold(al, tipAt(1.5, 1.5), 1.5), []); assert.deepStrictEqual(al.points[1], keep);
  // a pinch where its knob would be holds nothing
  const k0 = al._dirs(1).across; al.update(1 / 90, [tipAt(keep[0] + k0[0] * 0.1, keep[1] + k0[1] * 0.1, 0.02, true)]); assert.strictEqual(al.held, -1);
  al.update(1 / 90, [tipAt(9, 9, 0.5, false)]);
  assert.strictEqual(al.lock(1), 'unlocked'); assert.strictEqual(al.knobs().length, 6);
  // locking a spot that a pinch holds lets go of it
  const kn = al.knobs().find((q) => q.i === 1); al.update(1 / 90, [tipAt(kn.x, kn.y, kn.z, false)]); al.update(1 / 90, [tipAt(kn.x, kn.y, kn.z, true)]);
  assert.strictEqual(al.held, 1); assert.strictEqual(al.lock(1), 'locked'); assert.strictEqual(al.held, -1); assert.strictEqual(al.grabbed, null);
  // deleting a spot that a pinch holds lets go of it too
  al.lock(1); al.update(1 / 90, [tipAt(9, 9, 0.5, false)]);
  const kn2 = al.knobs().find((q) => q.i === 0); al.update(1 / 90, [tipAt(kn2.x, kn2.y, kn2.z, false)]); al.update(1 / 90, [tipAt(kn2.x, kn2.y, kn2.z, true)]);
  assert.strictEqual(al.held, 0); assert.strictEqual(al.remove(0), 'deleted'); assert.strictEqual(al.held, -1);
  assert.doesNotThrow(() => al.update(1 / 90, [tipAt(kn2.x + 0.2, kn2.y, kn2.z, true)]), 'the hand that held it moves on');
});

test('spot 3, the check mark, has the same knobs, lock and height as spots 1 and 2', () => {
  const al = lined(quick(), [0, 0], [1, 0], 0.02);
  assert.strictEqual(al.knobs().length, 6, 'no check mark yet: no knobs for it');
  assert.strictEqual(al.lock(2), 'empty');
  al.create(2); hold(al, tipAt(0.5, 1), 0.9);
  near(al.lastCheck[0], 0.5, 1e-9); near(al.lastCheck[1], 1, 1e-9); assert.strictEqual(al.lastCheck[2], 0, 'it rests on the common floor');
  const ks = al.knobs().filter((q) => q.i === 2);
  assert.deepStrictEqual(ks.map((q) => q.axis), ['along', 'across', 'up']); assert.strictEqual(al.knobs().length, 9);
  // the own place: the common floor lies where spots 1 and 2 are (z 0.02 here)
  near(al.checkOwn()[0], 0.5, 1e-9); near(al.checkOwn()[2], 0.02, 1e-9);
  // a pinch at the "across" knob (perpendicular to the line from spot 1 to the check mark) moves it a twentieth as far, in the common frame
  const k = ks.find((q) => q.axis === 'across'); lift(al, 'r');
  al.update(1 / 90, [tipAt(k.x, k.y, k.z, false)]); assert.strictEqual(al.held, -1);
  al.update(1 / 90, [tipAt(k.x, k.y, k.z, true)]); assert.strictEqual(al.held, 2); assert.deepStrictEqual(al.grabbed && [al.grabbed.i, al.grabbed.axis], [2, 'across']);
  const d = al._dirs(2).across, rev = al.rev, c0 = al.lastCheck.slice();
  assert.strictEqual(al.update(1 / 90, [tipAt(k.x + d[0] * 0.2, k.y + d[1] * 0.2, k.z, true)]), 'movedCheck');
  near(Math.hypot(al.lastCheck[0] - c0[0], al.lastCheck[1] - c0[1]), 0.2 / 20, 1e-9); near(al.lastCheck[2], 0, 1e-12); assert.ok(al.rev > rev, 'a change to save');
  assert.deepStrictEqual(al.points.map((p) => p.slice(0, 2)), [[0, 0], [1, 0]], 'the two spots stay');
  al.update(1 / 90, [tipAt(k.x, k.y, k.z, false)]); assert.strictEqual(al.held, -1);
  // up: its height changes, nothing else
  const up = al.knobs().find((q) => q.i === 2 && q.axis === 'up'); al.update(1 / 90, [tipAt(up.x, up.y, up.z, false)]); al.update(1 / 90, [tipAt(up.x, up.y, up.z, true)]);
  const c1 = al.lastCheck.slice(); al.update(1 / 90, [tipAt(up.x, up.y, up.z + 0.4, true)]);
  near(al.lastCheck[2] - c1[2], 0.4 / 20, 1e-9); near(al.lastCheck[0], c1[0], 1e-12); assert.strictEqual(al.fields()[2].mm, 20);
  al.update(1 / 90, [tipAt(9, 9, 0.5, false)]);
  // lock: no knobs, cannot be replaced or deleted; unlock gives it all back
  assert.strictEqual(al.lock(2), 'locked'); assert.strictEqual(al.knobs().length, 6); assert.strictEqual(al.fields()[2].locked, true);
  assert.strictEqual(al.remove(2), 'locked'); assert.strictEqual(al.create(2), 'locked'); assert.strictEqual(al.armCheck(), false);
  assert.strictEqual(al.lock(2), 'unlocked'); assert.strictEqual(al.knobs().length, 9);
  // locking it while a pinch holds it lets go; deleting a calibration spot while it is held lets go (its knobs need the frame)
  const k2 = al.knobs().find((q) => q.i === 2 && q.axis === 'along'); al.update(1 / 90, [tipAt(k2.x, k2.y, k2.z, false)]); al.update(1 / 90, [tipAt(k2.x, k2.y, k2.z, true)]);
  assert.strictEqual(al.held, 2); assert.strictEqual(al.lock(2), 'locked'); assert.strictEqual(al.held, -1); al.lock(2);
  al.update(1 / 90, [tipAt(9, 9, 0.5, false)]);
  const k3 = al.knobs().find((q) => q.i === 2 && q.axis === 'along'); al.update(1 / 90, [tipAt(k3.x, k3.y, k3.z, false)]); al.update(1 / 90, [tipAt(k3.x, k3.y, k3.z, true)]);
  assert.strictEqual(al.held, 2); assert.strictEqual(al.remove(1), 'deleted'); assert.strictEqual(al.held, -1);
  assert.strictEqual(al.checkOwn(), null, 'without a frame the check mark has no place in this headset'); assert.strictEqual(al.knobs().filter((q) => q.i === 2).length, 0);
  assert.ok(al.lastCheck, 'but it is kept in the common frame');
});

test('the check mark, with its height and lock, is saved and comes back; an older save without them still loads', () => {
  const f = { x: 1, y: 0, yaw: 0 }, al = lined(quick(), [0, 0], [1, 0], 0.02);
  al.create(2); hold(al, tipAt(0.5, 1), 0.9); al.lastCheck[2] = 0.013; al.lock(2);
  const saved = JSON.parse(JSON.stringify(al.save(f)));
  assert.deepStrictEqual(saved.locked, [false, false, true]); assert.strictEqual(saved.check.length, 3);
  const b = new AL.Aligner(); assert.strictEqual(b.load(saved, f), true);
  assert.deepStrictEqual(b.lastCheck, al.lastCheck); assert.deepStrictEqual(b.locked, [false, false, true]); assert.strictEqual(b.knobs().filter((q) => q.i === 2).length, 0, 'locked: no knobs');
  const old = new AL.Aligner(); assert.strictEqual(old.load({ v: 1, pts: [[0, 0, 0.02], [1, 0, 0.02]], locked: [false, true], check: [0.5, 1] }, f), true);
  assert.deepStrictEqual(old.lastCheck, [0.5, 1, 0]); assert.deepStrictEqual(old.locked, [false, true, false]);
  const gone = new AL.Aligner(); gone.load({ v: 1, pts: [[0, 0, 0.02], null], locked: [false, false, true] }, f); assert.deepStrictEqual(gone.locked, [false, false, false], 'a lock without a check mark is nothing');
  let r = b.rev; b.lock(2); assert.ok(b.rev > r, 'locking it is a change to save');
});

test('a spot too close to the other one is refused whichever one is being replaced, and stays wanted', () => {
  const al = lined(quick(), [0, 0], [1, 0], 0.02);
  assert.strictEqual(al.create(0), 'armed');
  assert.deepStrictEqual(hold(al, tipAt(0.95, 0), 0.9), ['tooClose']); assert.strictEqual(al.want(), 0); near(al.points[0][0], 0, 1e-9);
  lift(al, 'r');
  assert.deepStrictEqual(hold(al, tipAt(0.2, 0), 0.9), ['took1']);
});

test('what the panel shows for the three spots', () => {
  const al = quick();
  let f = al.fields();
  assert.strictEqual(f.length, 3); assert.deepStrictEqual(f.map((q) => q.armed), [true, false, false]);
  assert.ok(f.every((q) => !q.placed && !q.locked && q.left === null && q.mm === null));
  const d = new AL.Aligner(); for (let k = 0; k < 369; k++) d.update(1 / 90, [tipAt(0, 0, 0.02)]);
  assert.strictEqual(d.fields()[0].left, 6, 'a 10 s wait, 4.1 s in: 6 left');
  lined(al, [0, 0], [1, 0], 0.0344); lift(al, 'r'); al.lock(1);
  f = al.fields();
  assert.deepStrictEqual(f.map((q) => q.placed), [true, true, false]); assert.deepStrictEqual(f.map((q) => q.locked), [false, true, false]);
  assert.deepStrictEqual(f.map((q) => q.armed), [false, false, false]);
  assert.strictEqual(f[0].mm, 34); assert.strictEqual(f[2].mm, null);
  al.create(2); hold(al, tipAt(0.5, 1), 0.9); assert.strictEqual(al.fields()[2].placed, true);
});

test('deleting a calibration spot while the check mark is waited for: the check mark cannot be placed any more, the spot is waited for instead', () => {
  const al = lined(quick(), [0, 0], [1, 0], 0.02);
  assert.strictEqual(al.create(2), 'armed'); assert.strictEqual(al.want(), 2);
  assert.strictEqual(al.remove(1), 'deleted');
  assert.strictEqual(al.frame, null); assert.strictEqual(al.want(), 1, 'spot 2 is the one waited for now');
  assert.ok(!al.fields()[2].armed && al.fields()[1].armed, 'and the panel says so');
  assert.deepStrictEqual(hold(al, tipAt(1.2, 0), 0.9), ['took2']);
});

test('a line-up survives a new session of the headset: saved against the anchor, it comes back at the same real places', () => {
  // One headset, two sessions: the origin and heading of its own frame are somewhere else each time. A persistent
  // anchor on the floor is not: it is found again, and where it is in the new frame is all that has to be known.
  const frameOf = (h) => ({ own: (x, y) => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw), dx = x - h.ox, dy = y - h.oy; return [c * dx + s * dy, -s * dx + c * dy]; }, turn: (a) => a - h.yaw });
  const ses1 = frameOf({ yaw: 0.3, ox: 1, oy: -2 }), ses2 = frameOf({ yaw: -1.9, ox: -0.6, oy: 0.4 });
  const anchorReal = { x: 0.7, y: 0.2, yaw: 0.5 };
  const anchorIn = (ses) => { const p = ses.own(anchorReal.x, anchorReal.y); return { x: p[0], y: p[1], yaw: ses.turn(anchorReal.yaw) }; };
  const P1 = [0.4, 0.7], P2 = [1.9, 0.2], C = [3, -1], Q = [-1.3, 2.2];
  const al = quick();
  hold(al, tipAt(...ses1.own(...P1), 0.035), 0.9); lift(al, 'r');
  hold(al, tipAt(...ses1.own(...P2), 0.020), 0.9); lift(al, 'r');
  al.create(2); hold(al, tipAt(...ses1.own(...C), 0.02), 0.9); lift(al, 'r');
  assert.strictEqual(al.lock(1), 'locked');
  assert.ok(al.frame && al.lastCheck);
  const saved = JSON.parse(JSON.stringify(al.save(anchorIn(ses1))));          // it goes through localStorage
  // a new session
  const b = new AL.Aligner();
  assert.strictEqual(b.load(saved, anchorIn(ses2)), true);
  b.points.forEach((pt, i) => { const want = ses2.own(...[P1, P2][i]); near(pt[0], want[0], 1e-9); near(pt[1], want[1], 1e-9); near(pt[2], [0.035, 0.02][i], 1e-12, 'its height'); });
  near(b.frame.dist, al.frame.dist, 1e-9); assert.ok(b.frame.restored && b.frame.how === 'points');
  for (const R of [Q, C, [0, 0]]) { const a = AL.toCommon(al.frame, ...ses1.own(...R)), c = AL.toCommon(b.frame, ...ses2.own(...R)); near(a[0], c[0], 1e-9); near(a[1], c[1], 1e-9); }
  assert.deepStrictEqual(b.lastCheck, al.lastCheck); assert.deepStrictEqual(b.locked, [false, true, false]);
  assert.strictEqual(b.want(), null, 'both are there: nothing is waited for'); assert.strictEqual(b.knobs().length, 6, 'spot 1 and the check mark have theirs, the locked spot 2 has none');
  near(b.frame.z, al.frame.z, 1e-12);
  // the other direction, too: the spots of a new session go back to where the old session had them
  const back = new AL.Aligner(); back.load(b.save(anchorIn(ses2)), anchorIn(ses1));
  back.points.forEach((pt, i) => { near(pt[0], al.points[i][0], 1e-9); near(pt[1], al.points[i][1], 1e-9); });
});

test('a saved line-up that is not good is not used, and leaves the aligner as it was', () => {
  const f = { x: 0, y: 0, yaw: 0 };
  for (const bad of [null, undefined, 'x', {}, { v: 2, pts: [[0, 0, 0], null] }, { v: 1 }, { v: 1, pts: [] }, { v: 1, pts: [null, null] }, { v: 1, pts: [[NaN, 0, 0], null] }, { v: 1, pts: [[0, 0, 0]] }, { v: 1, pts: ['a', null] }]) {
    const al = new AL.Aligner();
    assert.strictEqual(al.load(bad, f), false, JSON.stringify(bad));
    assert.deepStrictEqual(al.points, [null, null]); assert.strictEqual(al.frame, null); assert.strictEqual(al.want(), 0);
  }
  assert.strictEqual(new AL.Aligner().load({ v: 1, pts: [[0, 0, 0], null] }, null), false, 'no anchor: no place to put it');
  assert.strictEqual(new AL.Aligner().load({ v: 1, pts: [[0, 0, 0], null] }, { x: NaN, y: 0, yaw: 0 }), false);
  // one spot only: that one comes back, and the other is waited for
  const one = new AL.Aligner();
  assert.strictEqual(one.load({ v: 1, pts: [[0.5, 0.5, 0.01], null], locked: [true, true], check: [1, 1] }, { x: 1, y: 0, yaw: 0 }), true);
  near(one.points[0][0], 1.5, 1e-12); assert.strictEqual(one.points[1], null); assert.strictEqual(one.frame, null);
  assert.deepStrictEqual(one.locked, [true, false, false], 'a spot that is not there is not locked'); assert.strictEqual(one.want(), 1);
  // two spots on top of each other cannot make a line-up: they come back as spots, not as a frame
  const near2 = new AL.Aligner(); near2.load({ v: 1, pts: [[0, 0, 0], [0.05, 0, 0]] }, f); assert.strictEqual(near2.frame, null);
});

test('the aligner counts its changes, so that the page knows when to save', () => {
  const al = quick(); const r0 = al.rev;
  hold(al, tipAt(0, 0), 0.9); assert.ok(al.rev > r0);
  let r = al.rev; lift(al, 'r'); hold(al, tipAt(1, 0), 0.9); assert.ok(al.rev > r);
  r = al.rev; al.lock(0); assert.ok(al.rev > r);
  r = al.rev; al.lock(0); al.remove(1); assert.ok(al.rev > r);
  r = al.rev; al.update(1 / 90, [tipAt(9, 9, 0.5)]); assert.strictEqual(al.rev, r, 'a frame in which nothing changed is not a change');
  r = al.rev; al.beginSession(); al.create(0); assert.strictEqual(al.rev, r, 'waiting for a spot is not saved: it is not part of the line-up');
  r = al.rev; al.load({ v: 1, pts: [[0, 0, 0], null] }, { x: 0, y: 0, yaw: 0 }); assert.ok(al.rev > r);
  const k = al.knobs()[0]; al.update(1 / 90, [tipAt(k.x, k.y, k.z, false)]); al.update(1 / 90, [tipAt(k.x, k.y, k.z, true)]);
  r = al.rev; al.update(1 / 90, [tipAt(k.x + 0.1, k.y, k.z, true)]); assert.ok(al.rev > r, 'a spot moved with a knob');
});

test('the headset moves its origin in the middle of a session: the line-up follows the anchor, and stays at the same real places', () => {
  const frameOf = (h) => ({ own: (x, y) => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw), dx = x - h.ox, dy = y - h.oy; return [c * dx + s * dy, -s * dx + c * dy]; }, turn: (a) => a - h.yaw });
  const before = frameOf({ yaw: 0.3, ox: 1, oy: -2 }), after = frameOf({ yaw: -1.2, ox: -0.6, oy: 0.4 });         // (the reference space was reset: taken off, put on)
  const anchorReal = { x: 0.7, y: 0.2, yaw: 0.5 };
  const anchorIn = (ses) => { const p = ses.own(anchorReal.x, anchorReal.y); return { x: p[0], y: p[1], yaw: ses.turn(anchorReal.yaw) }; };
  const P1 = [0.4, 0.7], P2 = [1.9, 0.2], C = [3, -1], Q = [-1.3, 2.2];
  const al = quick();
  hold(al, tipAt(...before.own(...P1), 0.035), 0.9); lift(al, 'r');
  hold(al, tipAt(...before.own(...P2), 0.020), 0.9); lift(al, 'r');
  al.create(2); hold(al, tipAt(...before.own(...C), 0.02), 0.9); lift(al, 'r');
  const old = { frame: al.frame, rev: al.rev }, check = al.lastCheck.slice();
  al.rebase(anchorIn(before), anchorIn(after));
  assert.ok(al.rev > old.rev, 'the page and the shared world are told it changed');
  al.points.forEach((pt, i) => { const want = after.own(...[P1, P2][i]); near(pt[0], want[0], 1e-9); near(pt[1], want[1], 1e-9); near(pt[2], [0.035, 0.02][i], 1e-12, 'its height is its own'); });
  // the frame is the same line-up: any real place has the same common coordinates as before, and what was derived from the spots agrees with the frame
  for (const R of [Q, C, [0, 0], P1, P2]) { const a = AL.toCommon(old.frame, ...before.own(...R)), c = AL.toCommon(al.frame, ...after.own(...R)); near(a[0], c[0], 1e-9); near(a[1], c[1], 1e-9); }
  const refit = AL.fromPoints(al.points[0], al.points[1]);
  near(al.frame.x, refit.x, 1e-9); near(al.frame.y, refit.y, 1e-9); near(AL.wrap(al.frame.yaw - refit.yaw), 0, 1e-9); near(al.frame.dist, old.frame.dist, 1e-12); assert.strictEqual(al.frame.how, 'points');
  assert.deepStrictEqual(al.lastCheck, check, 'the check mark is in the common frame: it did not move');
  const own = al.checkOwn(); near(own[0], after.own(...C)[0], 1e-9); near(own[1], after.own(...C)[1], 1e-9);
  // a frame that was given (a rehearsal on the PC) follows too, and a line-up that is not there is left alone
  const g = new AL.Aligner(); g.use({ x: 1, y: 2, yaw: 0.4 }); g.rebase(anchorIn(before), anchorIn(after));
  const gc = AL.toCommon(g.frame, ...after.own(...Q)), go = AL.toCommon({ x: 1, y: 2, yaw: 0.4 }, ...before.own(...Q)); near(gc[0], go[0], 1e-9); near(gc[1], go[1], 1e-9);
  const none = new AL.Aligner(); none.rebase(anchorIn(before), anchorIn(after)); assert.strictEqual(none.frame, null); assert.deepStrictEqual(none.points, [null, null]);
});

// ---- reset events (the headset moves the origin of its reference space), measured on a Quest Pro on 2026-10-22: several in a row, some of them wild
const quatY = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
// the world: where the headset's origin is on the real floor (a frame), and what a real point is called in the headset's own coordinates
const own = (origin, w) => AL.toCommon(origin, w[0], w[1]);
// a reset event for a move of the origin from `a` to `b` (real-world frames): the new origin in the old coordinates, as the browser gives it (x, y, z, orientation)
const eventFor = (a, b) => { const o = AL.poseIn(a, b); return { pos: { x: o.x, y: 0, z: -o.y }, quat: quatY(o.yaw) }; };

test('a reset event is a frame: the new origin in the old coordinates, and what it says about a real point', () => {
  const a = { x: 0.3, y: -1.2, yaw: 0.4 }, b = { x: -0.5, y: 0.9, yaw: 0.4 + 1.5 };          // (the origin moved, and turned by about 90 degrees)
  const ev = eventFor(a, b), F = AL.frameFromPose(ev.pos, ev.quat);
  const o = AL.poseIn(a, b); near(F.x, o.x, 1e-12); near(F.y, o.y, 1e-12); near(AL.wrap(F.yaw - o.yaw), 0, 1e-12);
  for (const w of [[0, 0], [2, 1], [-1.3, 2.2]]) { const was = own(a, w), now = AL.toCommon(F, ...was), want = own(b, w); near(now[0], want[0], 1e-9); near(now[1], want[1], 1e-9); }
  // a pitched or rolled origin does not disturb the heading
  const q = { x: 0.05, y: Math.sin(0.35), z: -0.04, w: Math.cos(0.35) }, n = Math.hypot(q.x, q.y, q.z, q.w);
  near(AL.frameFromPose({ x: 0, y: 0, z: 0 }, { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n }).yaw, 0.7, 0.05);
});

test('four resets in a row, two of them wild: the spots end up at the same real places, and the line-up is the same one', () => {
  const O0 = { x: 0.2, y: 0.1, yaw: -0.3 };
  const world = { P1: [1.0, 2.0], P2: [3.5, 1.2], C: [2.0, -1.0], Q: [-1, 4] };
  const al = quick(), at = (o, w) => own(o, w);
  hold(al, tipAt(...at(O0, world.P1), 0.035), 0.9); lift(al, 'r');
  hold(al, tipAt(...at(O0, world.P2), 0.020), 0.9); lift(al, 'r');
  al.create(2); hold(al, tipAt(...at(O0, world.C), 0.02), 0.9); lift(al, 'r');
  const before = al.frame, check = al.lastCheck.slice();
  // the origin goes: 80 cm away and a quarter turn, then 9 metres off, then back, then a little again
  const path = [O0, { x: 0.9, y: -0.5, yaw: -0.3 + 1.6 }, { x: -8.5, y: 4.0, yaw: 2.9 }, { x: 0.9, y: -0.5, yaw: -0.3 + 1.6 }, { x: 0.95, y: -0.45, yaw: -0.3 + 1.62 }];
  for (let k = 1; k < path.length; k++) { const ev = eventFor(path[k - 1], path[k]); al.rebase(AL.frameFromPose(ev.pos, ev.quat), AL.IDENTITY); }
  const O = path[path.length - 1];
  [world.P1, world.P2].forEach((w, i) => { const want = at(O, w); near(al.points[i][0], want[0], 1e-9, `spot ${i + 1} x`); near(al.points[i][1], want[1], 1e-9, `spot ${i + 1} y`); });
  for (const R of [world.Q, world.C, [0, 0]]) { const a = AL.toCommon(before, ...at(O0, R)), c = AL.toCommon(al.frame, ...at(O, R)); near(a[0], c[0], 1e-9); near(a[1], c[1], 1e-9); }
  near(al.frame.dist, before.dist, 1e-12); assert.deepStrictEqual(al.lastCheck, check);
});

test('after the resets stop: an anchor that went with the origin is carried across, one that stayed in the room is used as it is', () => {
  const O0 = { x: 0.2, y: 0.1, yaw: -0.3 }, O1 = { x: 0.9, y: -0.5, yaw: -0.3 + 1.6 }, O2 = { x: -8.5, y: 4, yaw: 2.9 }, anchorReal = [1.0, 0.5, 0.7];
  const poseOf = (o) => { const p = own(o, anchorReal); return { x: p[0], y: p[1], yaw: AL.wrap(anchorReal[2] - o.yaw) }; };
  const events = (path) => path.slice(1).map((o, k) => AL.frameFromPose(...Object.values(eventFor(path[k], o))));
  const run = (path, rawAfter) => {
    const r = new AL.Resets(); let t = 0;
    for (const F of events(path)) { r.begin(F, t += 5, r.pending() ? null : r.effective(poseOf(path[0]))); }
    assert.ok(r.pending() && !r.ready(t + 100) && r.ready(t + 900), 'it waits until the resets have stopped');
    return { r, res: r.settle(rawAfter) };
  };
  const path = [O0, O1, O2, O1];
  // 1) a world-locked anchor: its pose is where the move says
  let x = run(path, poseOf(O1)); assert.strictEqual(x.res.kind, 'followed'); assert.strictEqual(x.r.G, null);
  // 2) the Quest Pro's: it did not change at all. From now on its pose is carried across, and agrees with the world
  x = run(path, poseOf(O0)); assert.strictEqual(x.res.kind, 'stale');
  const eff = x.r.effective(poseOf(O0)), want = poseOf(O1); near(eff.x, want.x, 1e-9); near(eff.y, want.y, 1e-9); near(AL.wrap(eff.yaw - want.yaw), 0, 1e-9);
  // ... and a second burst on top of it
  const O3 = { x: 0.2, y: 2.0, yaw: 0.1 }, b2 = [O1, O3];
  for (const F of events(b2)) x.r.begin(F, 1000, x.r.pending() ? null : x.r.effective(poseOf(O0)));
  const res2 = x.r.settle(poseOf(O0)); assert.strictEqual(res2.kind, 'stale');
  const e2 = x.r.effective(poseOf(O0)), w2 = poseOf(O3); near(e2.x, w2.x, 1e-9); near(e2.y, w2.y, 1e-9); near(AL.wrap(e2.yaw - w2.yaw), 0, 1e-9);
  // 3) somewhere else altogether: used as it is, nothing carried
  x = run(path, { x: 5, y: 5, yaw: 1 }); assert.strictEqual(x.res.kind, 'unknown'); assert.strictEqual(x.r.G, null);
  // 4) no anchor: nothing to decide
  const r = new AL.Resets(); r.begin(events([O0, O1])[0], 0, null); assert.strictEqual(r.settle({ x: 0, y: 0, yaw: 0 }).kind, 'none'); assert.ok(!r.pending());
});
