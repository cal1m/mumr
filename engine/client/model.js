// THE ROOM MODEL: a small copy of the room floating in front of a player, in which the things of the room can be picked up and put
// somewhere else (Marek, 2026-10-23: the cube and the hand wall's viewer, opened from the game's menu). No THREE and no DOM: the drawing
// is xr/roommodel3d.js, the wiring createApp's (roomModel option).
//
// Like a menu it is shared: its pose goes out in its owner's `M` packet as panel 'model', so every player sees every open model where
// its owner has it, and may reach into it and move a thing (the thing then moves for real, for everybody). Only its owner moves, turns
// or scales the model itself, by its three handles: a bar under its front edge (pinch it and carry the model), a ball beside it (pinch
// it and walk it round: the model turns about the vertical) and a pill at its front left corner pointing at its middle (pinch it and
// pull it out or push it in: the model grows or shrinks, K_MIN to K_MAX times its first size; its owner's menus info carries it).
//
//   frameOf(room)              the model's frame for a room (this page's floor plan): { cx, cy, w, d, h, s (the scale) } or null
//   toModel(pose, F, p), fromModel(pose, F, q)    a point of the room <-> the same point in the model; pose { x, y, z, yaw, k }: where
//                              the middle of the model's floor is (floor plan, z above this headset's floor), how it is turned and how
//                              much bigger than its first size it is (k, 1 when missing)
//   scaleOf(pose, F)           metres in the model per metre of the room
//   inside(pose, F, q, m)      whether q (floor plan) is in the model's box (m: metres of slack around it)
//   handles(pose, F)           where its handles are: { move, turn, scale: [x, y, z] }
//   class Hands                this page's hands at the models: update(sources, models) -> what they do (see below)
(function (M) {
  const SIZE = 0.5;                       // m: the model's longest side
  const REACH = { handle: 0.04, thing: 0.035 };   // m: how close a pinch must start to a handle / to a thing (in the model) to take it
  const K_MIN = 0.3, K_MAX = 4;
  const scaleOf = (pose, F) => F.s * (pose.k || 1);

  function frameOf(room) {
    const pts = [];
    for (const pl of (room && room.planes) || []) for (const p of pl.p) pts.push(p);
    if (!pts.length) return null;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), zs = pts.map((p) => p[2]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = x1 - x0, d = y1 - y0, h = Math.max(0.5, Math.max(...zs));
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, d, h, s: SIZE / Math.max(w, d, 1) };
  }
  function toModel(pose, F, p) {
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), dx = p[0] - F.cx, dy = p[1] - F.cy, S = scaleOf(pose, F);
    return [pose.x + S * (c * dx - s * dy), pose.y + S * (s * dx + c * dy), pose.z + S * (p[2] || 0)];
  }
  function fromModel(pose, F, q) {
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), S = scaleOf(pose, F), dx = (q[0] - pose.x) / S, dy = (q[1] - pose.y) / S;
    return [F.cx + c * dx + s * dy, F.cy - s * dx + c * dy, (q[2] - pose.z) / S];
  }
  function inside(pose, F, q, m = 0.02) {
    const r = fromModel(pose, F, q), k = m / scaleOf(pose, F);
    return Math.abs(r[0] - F.cx) <= F.w / 2 + k && Math.abs(r[1] - F.cy) <= F.d / 2 + k && r[2] >= -k && r[2] <= F.h + k;
  }
  // (the handles keep their own size: so many metres off the model, whatever its scale)
  function handles(pose, F) {
    const S = scaleOf(pose, F);
    return {
      move: toModel(pose, F, [F.cx, F.cy - F.d / 2 - 0.05 / S, -0.02 / S]),            // (under the front edge, a little out)
      turn: toModel(pose, F, [F.cx + F.w / 2 + 0.06 / S, F.cy, 0]),                     // (beside the right side, at floor level)
      scale: toModel(pose, F, [F.cx - F.w / 2 - 0.04 / S, F.cy - F.d / 2 - 0.04 / S, 0]),     // (off the front left corner)
    };
  }
  const pinchAt = (s) => (M.grab ? M.grab.pinchAt(s) : null);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // This page's hands at the open models (its own and the other players'). A pinch that starts at a handle of its own model carries or
  // turns it; a pinch that starts at a thing in any model drags that thing.
  //   update(sources, models) with sources: this page's hand sources (floor plan, `pinch`), models: [{ key, mine, pose, F, things:
  //   [{ id, at (the room, floor plan) }] }] -> [{ key, what: 'move' | 'turn' | 'scale' | 'thing', id, phase: 'start' | 'drag' |
  //   'drop', pose (move, turn, scale: the model's new pose), at (thing: where it is in the room now, floor plan) }]
  class Hands {
    constructor() { this.held = new Map(); this.was = new Map(); }
    busy(key) { for (const h of this.held.values()) if (h.key === key) return true; return false; }
    update(sources, models) {
      const out = [], seen = new Set();
      for (const s of sources || []) {
        if (s.foot) continue;
        seen.add(s.id);
        const at = pinchAt(s), on = !!s.pinch && !!at, was = this.was.get(s.id) || false;
        this.was.set(s.id, on);
        let h = this.held.get(s.id);
        const m = h ? models.find((q) => q.key === h.key) : null;
        if (h && (!on || !m)) {
          if (m && h.what === 'thing') out.push({ key: h.key, what: 'thing', id: h.id, phase: 'drop', at: fromModel(m.pose, m.F, at || h.last) });
          this.held.delete(s.id); h = null;
          continue;
        }
        if (h) {
          h.last = at;
          if (h.what === 'move') out.push({ key: h.key, what: 'move', phase: 'drag', pose: Object.assign({}, m.pose, { x: at[0] + h.off[0], y: at[1] + h.off[1], z: at[2] + h.off[2] }) });
          else if (h.what === 'turn') out.push({ key: h.key, what: 'turn', phase: 'drag', pose: Object.assign({}, m.pose, { yaw: h.yaw0 + M.util.wrap(Math.atan2(at[1] - m.pose.y, at[0] - m.pose.x) - h.a0) }) });
          else if (h.what === 'scale') {
            const d = Math.hypot(at[0] - m.pose.x, at[1] - m.pose.y);
            out.push({ key: h.key, what: 'scale', phase: 'drag', pose: Object.assign({}, m.pose, { k: Math.max(K_MIN, Math.min(K_MAX, h.k0 * d / h.d0)) }) });
          }
          else out.push({ key: h.key, what: 'thing', id: h.id, phase: 'drag', at: fromModel(m.pose, m.F, at) });
          continue;
        }
        if (!on || was) continue;
        // a pinch starts: at a handle of this page's own model, else at a thing in any model
        let best = null;
        for (const q of models) {
          if (q.mine) {
            const H = handles(q.pose, q.F), dm = dist(at, H.move), dt = dist(at, H.turn);
            if (dm < REACH.handle && (!best || dm < best.d)) best = { d: dm, key: q.key, what: 'move', off: [q.pose.x - at[0], q.pose.y - at[1], q.pose.z - at[2]] };
            if (dt < REACH.handle && (!best || dt < best.d)) best = { d: dt, key: q.key, what: 'turn', yaw0: q.pose.yaw, a0: Math.atan2(at[1] - q.pose.y, at[0] - q.pose.x) };
            const ds = dist(at, H.scale), d0 = Math.hypot(at[0] - q.pose.x, at[1] - q.pose.y);
            if (ds < REACH.handle && d0 > 0.02 && (!best || ds < best.d)) best = { d: ds, key: q.key, what: 'scale', k0: q.pose.k || 1, d0 };
          }
          for (const th of q.things || []) {
            const d = dist(at, toModel(q.pose, q.F, th.at));
            if (d < REACH.thing && (!best || d < best.d)) best = { d, key: q.key, what: 'thing', id: th.id };
          }
        }
        if (!best) continue;
        best.last = at;
        this.held.set(s.id, best);
        const q = models.find((x) => x.key === best.key);
        out.push(best.what === 'thing' ? { key: best.key, what: 'thing', id: best.id, phase: 'start', at: fromModel(q.pose, q.F, at) } : { key: best.key, what: best.what, phase: 'start', pose: q.pose });
      }
      // a hand that is gone (no longer tracked) lets go of what it held where it last was
      for (const [id, h] of [...this.held]) {
        if (seen.has(id)) continue;
        const m = models.find((q) => q.key === h.key);
        if (m && h.what === 'thing' && h.last) out.push({ key: h.key, what: 'thing', id: h.id, phase: 'drop', at: fromModel(m.pose, m.F, h.last) });
        this.held.delete(id);
      }
      for (const id of [...this.was.keys()]) if (!seen.has(id)) this.was.delete(id);
      return out;
    }
  }

  M.model = { SIZE, REACH, K_MIN, K_MAX, frameOf, scaleOf, toModel, fromModel, inside, handles, Hands };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
