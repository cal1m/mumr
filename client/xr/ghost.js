// Ghost fingers: a dark, see-through sleeve over each finger from the second knuckle to the tip, fading in towards the tip. It shows
// where the TRACKED finger is (which is what touches things) without hiding the real hand in passthrough. Drawn over everything
// (depthTest off), so a fingertip is visible in front of a menu too. From Nudgy (app.js GhostHand), made a factory: makeGhost(THREE).
const FINGERS = [[2, 3, 4], [7, 8, 9], [12, 13, 14], [17, 18, 19], [22, 23, 24]];
const RINGS = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.0, 1.0], SCALE = [1, 1, 1, 1, 1, 1, 0.82, 0.4], OUT = [0, 0, 0, 0, 0, 0, 0.55, 0.92], SEG = 8;
// (idle is the engine's default for every hand; an app may colour them: createApp's ghostColour, 'grips' for pinch and fist)
export const GHOST_COLOURS = { idle: 0x0b0d12, touch: 0x2f6fc8, hold: 0x2e8b57, point: 0xf2c14e, pinch: 0x2e8b57, fist: 0xd9822b };

export function makeGhost(THREE) {
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), c = new THREE.Vector3(), t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3();
  return class GhostHand {
    constructor(opacity = 0.4) {
      const nV = FINGERS.length * (RINGS.length * SEG + 1), pos = new Float32Array(nV * 3), col = new Float32Array(nV * 4), idx = [];
      let v = 0;
      for (let f = 0; f < FINGERS.length; f++) {
        const base = v;
        for (let r = 0; r < RINGS.length; r++) for (let s = 0; s < SEG; s++, v++) {
          const a = Math.min(1, RINGS[r] / 0.6); col.set([1, 1, 1, a * a * (3 - 2 * a)], v * 4);
          if (r) { const p = base + (r - 1) * SEG, q = base + r * SEG, s1 = (s + 1) % SEG; idx.push(p + s, q + s, q + s1, p + s, q + s1, p + s1); }
        }
        col.set([1, 1, 1, 1], v * 4);
        const last = base + (RINGS.length - 1) * SEG;
        for (let s = 0; s < SEG; s++) idx.push(last + s, v, last + (s + 1) % SEG);
        v++;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setIndex(idx);
      this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: GHOST_COLOURS.idle, vertexColors: true, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
      this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 5;
    }
    // jp: 25 joint positions (XR, 75 numbers), jr: their radii
    update(jp, jr, colour) {
      const pos = this.mesh.geometry.attributes.position.array;
      let v = 0;
      for (const [ia, ib, ic] of FINGERS) {
        A.fromArray(jp, ia * 3); B.fromArray(jp, ib * 3); C.fromArray(jp, ic * 3);
        const l1 = A.distanceTo(B), l2 = B.distanceTo(C), L = l1 + l2 || 1e-6;
        for (let r = 0; r < RINGS.length; r++) {
          const d = RINGS[r] * L, rad = (d < l1 ? jr[ia] + (jr[ib] - jr[ia]) * d / (l1 || 1) : jr[ib] + (jr[ic] - jr[ib]) * (d - l1) / (l2 || 1)) * 1.12;
          if (d < l1) { c.lerpVectors(A, B, d / (l1 || 1)); t.subVectors(B, A); } else { c.lerpVectors(B, C, (d - l1) / (l2 || 1)); t.subVectors(C, B); }
          t.normalize();
          c.addScaledVector(t, OUT[r] * rad);
          up.set(0, 1, 0); if (Math.abs(t.y) > 0.9) up.set(1, 0, 0);
          n.crossVectors(t, up).normalize(); b.crossVectors(t, n);
          for (let s = 0; s < SEG; s++, v++) {
            const a = s / SEG * Math.PI * 2, k = rad * SCALE[r];
            pos[v * 3] = c.x + (Math.cos(a) * n.x + Math.sin(a) * b.x) * k; pos[v * 3 + 1] = c.y + (Math.cos(a) * n.y + Math.sin(a) * b.y) * k; pos[v * 3 + 2] = c.z + (Math.cos(a) * n.z + Math.sin(a) * b.z) * k;
          }
        }
        c.copy(C).addScaledVector(t, jr[ic] * 1.12); pos[v * 3] = c.x; pos[v * 3 + 1] = c.y; pos[v * 3 + 2] = c.z; v++;
      }
      this.mesh.geometry.attributes.position.needsUpdate = true;
      this.mesh.material.color.setHex(colour === undefined ? GHOST_COLOURS.idle : colour);
      this.mesh.visible = true;
    }
    dispose() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  };
}
