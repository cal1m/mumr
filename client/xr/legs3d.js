// Legs drawn as three rounded segments each (hip-knee, knee-ankle, ankle-toe), for the headset (the other players) and the PC view
// alike. An ES module; THREE handed in. `parent` is the floor group: inside it the floor plan (x, y, z) is THREE (x, z, -y).
//   const L = makeLegs(THREE, parent, colour); L.update(hands.legs(head, sources)); L.dispose()
// Estimated legs (no body tracking) are fainter than tracked ones.
export function makeLegs(THREE, parent, colour) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false), up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
  const mat = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.45, depthWrite: false });
  const segs = [];
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(geo, mat); m.visible = false; parent.add(m); segs.push(m); }
  const R = [0.06, 0.045, 0.035];                              // m: thigh, shin, foot
  function put(m, a, b, r) {
    const A = new THREE.Vector3(a[0], a[2], -a[1]), B = new THREE.Vector3(b[0], b[2], -b[1]);
    d.subVectors(B, A);
    const len = d.length();
    if (len < 1e-4) { m.visible = false; return; }
    m.position.addVectors(A, B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(up, d.divideScalar(len));
    m.scale.set(r, len, r);
    m.visible = true;
  }
  return {
    update(list) {
      let n = 0, est = true;
      for (const leg of list || []) {
        if (!leg.estimated) est = false;
        for (let k = 0; k < 3 && n < segs.length; k++) put(segs[n++], leg.pts[k], leg.pts[k + 1], R[k]);
      }
      for (; n < segs.length; n++) segs[n].visible = false;
      mat.opacity = est ? 0.3 : 0.5;
    },
    dispose() { for (const m of segs) parent.remove(m); geo.dispose(); mat.dispose(); },
  };
}
