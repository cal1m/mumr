// The room model drawn (model.js has the numbers): the room's outlines at the model's scale on a see-through floor plate, the things in
// it (a box for a cube, a flat card for a viewer), the place a thing being moved will go, and for its owner the three handles: a bar
// under the front edge (carry), a ball beside it (turn) and a pill at the front left corner pointing at the middle (scale). An ES
// module; THREE handed in. `parent` is the floor group (inside it the floor plan (x, y, z) is THREE (x, z, -y)).
//   const m = createModel3d({ THREE, parent }); m.update(pose, F, room, things, { handles, edge }); m.dispose()
//   things: [{ id, kind: 'box' | 'panel', at: [x, y, z] (the room, floor plan), yaw, size: [w, h], colour, ghost: true (where it will go) }]
import { createRoom3d } from './room3d.js';

export function createModel3d({ THREE, parent }) {
  const outer = new THREE.Group(), inner = new THREE.Group();
  outer.add(inner); parent.add(outer);
  const room3d = createRoom3d({ THREE, parent: inner, opacity: 1 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x20242c, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  plate.rotation.x = -Math.PI / 2; inner.add(plate);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0.35 }));
  inner.add(edge);
  const move = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.08, 4, 10), new THREE.MeshBasicMaterial({ color: 0xece9e2 }));
  move.rotation.z = Math.PI / 2;
  const turn = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
  const grow = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.045, 4, 10), new THREE.MeshBasicMaterial({ color: 0x7bd88f }));
  parent.add(move, turn, grow);
  const meshes = new Map();
  function thing(t) {
    let m = meshes.get(t.id + (t.ghost ? ':ghost' : ''));
    if (!m) {
      const geo = t.kind === 'panel' ? new THREE.PlaneGeometry(1, 1) : new THREE.BoxGeometry(1, 1, 1);
      m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: t.colour || 0xe8a33d, transparent: !!t.ghost, opacity: t.ghost ? 0.45 : 1, side: THREE.DoubleSide }));
      inner.add(m); meshes.set(t.id + (t.ghost ? ':ghost' : ''), m);
    }
    m.visible = true;
    m.material.color.set(t.colour || 0xe8a33d);
    m.position.set(t.at[0], t.at[2], -t.at[1]);
    if (t.kind === 'panel') { m.scale.set(t.size[0], t.size[1], 1); m.rotation.set(0, Math.atan2(Math.cos(t.yaw), -Math.sin(t.yaw)), 0); }
    else { m.scale.set(t.size[0], t.size[0], t.size[0]); m.rotation.set(0, t.yaw || 0, 0); }
  }
  return {
    outer,
    update(pose, F, room, things, opts = {}) {
      const M = globalThis.MUMR;
      outer.position.set(pose.x, pose.z, -pose.y); outer.rotation.set(0, pose.yaw, 0); outer.scale.setScalar(M.model.scaleOf(pose, F));
      inner.position.set(-F.cx, 0, F.cy);
      room3d.set(room);
      plate.position.set(F.cx, 0, -F.cy); plate.scale.set(F.w, F.d, 1);
      edge.position.set(F.cx, F.h / 2, -F.cy); edge.scale.set(F.w, F.h, F.d);
      edge.material.color.set(opts.edge === undefined ? 0x9aa3b5 : opts.edge);
      for (const m of meshes.values()) m.visible = false;
      for (const t of things || []) thing(t);
      move.visible = turn.visible = grow.visible = !!opts.handles;
      if (opts.handles) {
        const H = M.model.handles(pose, F);
        move.position.set(H.move[0], H.move[2], -H.move[1]); move.rotation.set(0, pose.yaw, Math.PI / 2);
        turn.position.set(H.turn[0], H.turn[2], -H.turn[1]);
        grow.position.set(H.scale[0], H.scale[2] + 0.01, -H.scale[1]); grow.rotation.set(0, Math.atan2(pose.y - H.scale[1], pose.x - H.scale[0]), Math.PI / 2);
        grow.material.color.set(opts.hot === 'scale' ? 0xffffff : 0x7bd88f);
        move.material.color.set(opts.hot === 'move' ? 0xf2c14e : 0xece9e2); turn.material.color.set(opts.hot === 'turn' ? 0xffffff : 0xf2c14e);
      }
    },
    dispose() { parent.remove(outer, move, turn, grow); room3d.dispose(); for (const m of meshes.values()) m.geometry.dispose(); },
  };
}
