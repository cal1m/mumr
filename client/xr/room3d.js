// The room's planes as outlines (an ES module; the page gives it THREE). The room is room.js's: { planes: [{ l, v, p: [[x, y, h], ...] }] }
// in the floor plan of the group it is drawn in (THREE (x, h, -y)).
//   const r3 = createRoom3d({ THREE, parent }); r3.set(room) (it redraws only when the room object changes); r3.group.visible
const COLOURS = { floor: 0x8a93a6, wall: 0x4ea1ff, ceiling: 0x5a6070, table: 0x7bd88f, couch: 0xe8a33d, door: 0xc792ea, window: 0xc792ea };
const colourOf = (l) => { for (const [k, c] of Object.entries(COLOURS)) if (l.includes(k)) return c; return 0xf2c14e; };

export function createRoom3d({ THREE, parent, opacity = 0.8 }) {
  const group = new THREE.Group(), mats = new Map();
  parent.add(group);
  let shown = null;
  const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.LineBasicMaterial({ color: c, transparent: opacity < 1, opacity })); return mats.get(c); };
  function clear() { for (const o of [...group.children]) { group.remove(o); o.geometry.dispose(); } }
  return {
    group,
    set(room) {
      if (room === shown) return;
      shown = room; clear();
      for (const pl of (room && room.planes) || []) {
        const pts = pl.p.map((q) => new THREE.Vector3(q[0], q[2] + 0.002, -q[1]));
        group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat(colourOf(pl.l))));
      }
    },
    dispose() { clear(); for (const m of mats.values()) m.dispose(); parent.remove(group); },
  };
}
