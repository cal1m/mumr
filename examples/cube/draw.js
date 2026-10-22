// How the cube looks, for the headset page and the PC view alike (one drawing for both: Nudgy drew its boxes and balls differently on
// the PC, and nobody noticed for days). An ES module; the page gives it THREE.
export function makeCube(THREE, size) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.55, metalness: 0.05 }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0x14161c }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(size * 0.18, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  dot.rotation.x = -Math.PI / 2; dot.position.y = size / 2 + 0.0005;                 // (a mark on top, so that its turning shows)
  dot.position.x = size * 0.22;
  g.add(box, edges, dot);
  g.userData = { box, edges };
  return g;
}
// d: { x, y, z, yaw, held } on the floor plan of whatever group the cube is in (inside it the floor plan (x, y, z) is THREE (x, z, -y))
export function setCube(g, d, colour) {
  g.position.set(d.x, d.z, -d.y);
  g.rotation.set(0, d.yaw, 0);
  g.userData.box.material.color.set(colour);
  g.userData.edges.material.color.set(d.held ? 0xffffff : 0x14161c);
}
