// Shoes: each foot source (hands.js shoe: a toe and a heel) drawn as a dark see-through capsule, as Nudgy did, for this headset's own feet,
// the other players' and the PC view alike. An ES module; THREE handed in. `parent` is the floor group: inside it the floor plan (x, y, z)
// is THREE (x, z, -y).
//   const F = makeShoes(THREE, parent, colour); F.update(sources) (the foot sources among them are drawn); F.dispose()
export function makeShoes(THREE, parent, colour = 0x0b0d12) {
  const S = globalThis.MUMR.hands.SHOE;
  const geo = new THREE.CapsuleGeometry(S.r, S.len, 6, 14); geo.rotateZ(Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.6, depthWrite: false });
  const shoes = [0, 1].map(() => { const m = new THREE.Mesh(geo, mat); m.visible = false; parent.add(m); return m; });
  const X = new THREE.Vector3(1, 0, 0), D = new THREE.Vector3();
  return {
    update(sources) {
      const feet = (sources || []).filter((s) => s.foot && s.points && s.points.length >= 2);
      shoes.forEach((m, i) => {
        const f = feet[i];
        m.visible = !!f;
        if (!f) return;
        const t = f.points[0], h = f.points[1];
        D.set(t.x - h.x, t.z - h.z, -(t.y - h.y));
        const len = D.length();
        if (len < 1e-4) { m.visible = false; return; }
        m.position.set((t.x + h.x) / 2, (t.z + h.z) / 2, -(t.y + h.y) / 2); m.quaternion.setFromUnitVectors(X, D.divideScalar(len)); m.scale.set(len / S.len, 1, 1);
      });
    },
    dispose() { for (const m of shoes) parent.remove(m); geo.dispose(); mat.dispose(); },
  };
}
