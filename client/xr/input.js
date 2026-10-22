// This headset's hands and controllers, read from the XR frame (an ES module).
//
//   readInput(xr, frame, space, pinch) -> { sources, hands }
//     sources   for the simulation, presence and the line-up: hands.js sources on the floor plan ({ id, points, joints })
//     hands     for poking menus and drawing: [{ id, tip (index tip, XR), at (between thumb and index, XR), pinch, jp (75 numbers),
//               jr (25 radii), ctrl (a controller: no joints), src }]
// A controller's tip is 6 cm ahead of its grip and its trigger is its pinch.
const M = () => globalThis.MUMR;
const jointBuf = new Float32Array(16 * 25), radBuf = new Float32Array(25), spaces = new WeakMap(), bufs = {};

function readJoints(frame, hand, ref, out) {
  let sp = spaces.get(hand);
  if (!sp) { sp = Array.from(hand.values()); spaces.set(hand, sp); }
  if (sp.length < 25) return false;
  if (frame.fillPoses) {
    frame.fillPoses(sp, ref, jointBuf);
    for (let i = 0; i < 25; i++) { out.jp[i * 3] = jointBuf[i * 16 + 12]; out.jp[i * 3 + 1] = jointBuf[i * 16 + 13]; out.jp[i * 3 + 2] = jointBuf[i * 16 + 14]; }
  } else {
    for (let i = 0; i < 25; i++) { const p = frame.getJointPose(sp[i], ref); if (!p) return false; out.jp[i * 3] = p.transform.position.x; out.jp[i * 3 + 1] = p.transform.position.y; out.jp[i * 3 + 2] = p.transform.position.z; }
  }
  for (const i of [0, 4, 9, 10, 11]) if (!Number.isFinite(out.jp[i * 3])) return false;
  if (!(frame.fillJointRadii && frame.fillJointRadii(sp, radBuf))) radBuf.fill(0.009);
  for (let i = 0; i < 25; i++) out.jr[i] = Number.isFinite(radBuf[i]) && radBuf[i] > 0.003 ? radBuf[i] : 0.009;
  return true;
}

// The legs from body tracking (frame.body, Meta's joint names; Nudgy read left-foot-ankle and left-foot-ball on a Quest Pro): two sources
// marked foot, to draw only. [] when the browser gives no body.
const LEG_JOINTS = { hip: 'upper-leg', knee: 'lower-leg', ankle: 'foot-ankle', toe: 'foot-ball' };
export function readLegs(xr, frame, space) {
  const body = frame && frame.body, out = [];
  if (!body || !body.get) return out;
  try {
    for (const side of ['left', 'right']) {
      const points = [];
      for (const [name, joint] of Object.entries(LEG_JOINTS)) {
        const sp = body.get(`${side}-${joint}`), p = sp && frame.getPose(sp, xr.refSpace);
        if (!p) break;
        const q = p.transform.position;
        points.push({ name, x: q.x, y: -q.z, z: q.y - space.floorY });
      }
      if (points.length === 4) out.push({ id: `${side}-foot`, foot: true, noHold: true, points });
    }
  } catch (e) { /* a browser whose body has other joints: no legs, nothing else breaks */ }
  return out;
}

export function readInput(xr, frame, space, pinch) {
  const H = M().hands, ref = xr.refSpace, sources = [], hands = [];
  for (const src of xr.session.inputSources) {
    const id = src.handedness === 'left' || src.handedness === 'right' ? src.handedness : 'hand';
    const sel = !!xr.select.get(src);
    if (src.hand) {
      const buf = bufs[id] || (bufs[id] = { jp: new Float32Array(75), jr: new Float32Array(25) });
      if (!readJoints(frame, src.hand, ref, buf)) continue;
      const jp = buf.jp, at = (i) => [jp[i * 3], jp[i * 3 + 1], jp[i * 3 + 2]];
      const on = pinch.update(id, jp, sel), th = at(4), ix = at(9);
      sources.push(Object.assign(H.source(id, jp, space), { pinch: on }));
      hands.push({ id, tip: ix, at: [(th[0] + ix[0]) / 2, (th[1] + ix[1]) / 2, (th[2] + ix[2]) / 2], pinch: on, jp, jr: buf.jr, src, sel });
    } else if (src.gripSpace) {
      const pose = frame.getPose(src.gripSpace, ref);
      if (!pose) continue;
      const p = pose.transform.position, o = pose.transform.orientation;
      // forward (0, 0, -1) turned by the grip's orientation
      const fx = -2 * (o.x * o.z + o.w * o.y), fy = -2 * (o.y * o.z - o.w * o.x), fz = -(1 - 2 * (o.x * o.x + o.y * o.y));
      const tip = [p.x + fx * 0.06, p.y + fy * 0.06, p.z + fz * 0.06], gp = src.gamepad;
      const trig = !!(gp && gp.buttons[0] && gp.buttons[0].pressed), grip = !!(gp && gp.buttons[1] && gp.buttons[1].pressed);
      sources.push(H.controller(id, tip, space, { grip, pinch: trig || sel, yaw: Math.atan2(-fz, fx) }));
      hands.push({ id, tip, at: tip, pinch: trig || sel, ctrl: true, src, sel, grip: [p.x, p.y, p.z] });
    }
  }
  return { sources, hands };
}

// The planes this headset found (plane detection: its room setup), as room.js fromXR takes them -> { planes } on the floor plan, or
// undefined when nothing changed since the last call (state: one object kept by the page). Read again when a plane changed, and every
// REREAD ms anyway (a tracking reset moves the planes in the reference space without changing them).
const REREAD = 2000;
export function readPlanes(xr, frame, space, state) {
  const set = frame.detectedPlanes;
  if (!set) return undefined;
  let sig = `${set.size}:`;
  for (const p of set) sig += `${p.lastChangedTime | 0},`;
  const now = performance.now();
  if (sig === state.sig && now - (state.at || 0) < REREAD) return undefined;
  const list = [];
  for (const p of set) {
    const pose = frame.getPose(p.planeSpace, xr.refSpace);
    if (!pose) return undefined;                                     // (not ready: try again in the next frame)
    list.push({ matrix: pose.transform.matrix, polygon: Array.from(p.polygon || [], (q) => ({ x: q.x, z: q.z })), label: p.semanticLabel || 'other', orientation: p.orientation });
  }
  state.sig = sig; state.at = now;
  return M().room.fromXR(list, space.floorY);
}
