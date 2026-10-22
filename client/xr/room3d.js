// The room's planes as outlines (an ES module; the page gives it THREE). The room is room.js's: { planes: [{ l, v, p: [[x, y, h], ...] }] }
// in the floor plan of the group it is drawn in (THREE (x, h, -y)). What each plane is comes from room.js kind() (Marek, 2026-10-22: lines
// only, no blocks, but a table must look different from an object):
//   table     the outline of its top only (there is space under it)
//   solid     the outline of its top, an upright line from every corner down to the floor and its outline on the floor: a block
//   wall      its outline;  floor, ceiling, opening (door and window frames)  their outline, fainter
//   const r3 = createRoom3d({ THREE, parent }); r3.set(room) (it redraws only when the room object changes); r3.group.visible
const COLOURS = { floor: 0x8a93a6, ceiling: 0x5a6070, wall: 0x4ea1ff, opening: 0xc792ea, table: 0x7bd88f, solid: 0xe8a33d };
const FAINT = { floor: 0.35, ceiling: 0.25, opening: 0.5 };

export function createRoom3d({ THREE, parent, opacity = 0.85 }) {
  const group = new THREE.Group(), mats = new Map(), kindOf = (pl) => globalThis.MUMR.room.kind(pl);
  parent.add(group);
  let shown = null;
  const mat = (k) => {
    if (!mats.has(k)) { const a = opacity * (FAINT[k] || 1); mats.set(k, new THREE.LineBasicMaterial({ color: COLOURS[k], transparent: a < 1, opacity: a })); }
    return mats.get(k);
  };
  const v = (q, h) => new THREE.Vector3(q[0], (h === undefined ? q[2] : h) + 0.002, -q[1]);
  function clear() { for (const o of [...group.children]) { group.remove(o); o.geometry.dispose(); } }
  return {
    group,
    set(room) {
      if (room === shown) return;
      shown = room; clear();
      for (const pl of (room && room.planes) || []) {
        const k = kindOf(pl), m = mat(k);
        group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pl.p.map((q) => v(q))), m));
        if (k !== 'solid') continue;
        group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pl.p.map((q) => v(q, 0))), m));
        const sides = [];
        for (const q of pl.p) sides.push(v(q), v(q, 0));
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(sides), m));
      }
    },
    dispose() { clear(); for (const m of mats.values()) m.dispose(); parent.remove(group); },
  };
}
