// Ghost fingers: a dark, see-through sleeve over each finger from the second knuckle to the tip, fading in towards the tip. It shows
// where the TRACKED finger is (which is what touches things) without hiding the real hand in passthrough. Drawn over everything
// (depthTest off), so a fingertip is visible in front of a menu too. From Nudgy (app.js GhostHand), made a factory: makeGhost(THREE).
// With { full: true } it is the whole hand instead, every finger from the wrist to its tip and not faded (the room model's hand IRL,
// drawn many times its size: its thickness grows with it, 2026-10-23), with round ends at both ends; { full: true, solid: true } is that
// hand solid and lit (the hand wall's hands).
const FINGERS = [[2, 3, 4], [7, 8, 9], [12, 13, 14], [17, 18, 19], [22, 23, 24]];
const WHOLE = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19], [0, 20, 21, 22, 23, 24]];
const TIP = { rings: [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.0, 1.0], scale: [1, 1, 1, 1, 1, 1, 0.82, 0.4], out: [0, 0, 0, 0, 0, 0, 0.55, 0.92] };
const FULL = { rings: [0, 0].concat(Array.from({ length: 17 }, (_, i) => i / 16), [1, 1]), scale: [0.4, 0.82].concat(Array(17).fill(1), [0.82, 0.4]),
  out: [-0.92, -0.55].concat(Array(17).fill(0), [0.55, 0.92]) };
const SEG = 8;
// typical joint radii (m) for a hand whose own are not known (another player's): wrist, thumb, then index, middle, ring, little finger
export const RADII = [0.022, 0.019, 0.014, 0.011, 0.009, 0.02, 0.012, 0.01, 0.009, 0.008, 0.02, 0.012, 0.01, 0.009, 0.008, 0.019, 0.011, 0.009, 0.008, 0.007, 0.018, 0.01, 0.008, 0.007, 0.006];
// (idle is the engine's default for every hand; an app may colour them: createApp's ghostColour, 'grips' for pinch and fist)
export const GHOST_COLOURS = { idle: 0x0b0d12, touch: 0x2f6fc8, hold: 0x2e8b57, point: 0xf2c14e, pinch: 0x2e8b57, fist: 0xd9822b };

export function makeGhost(THREE) {
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), c = new THREE.Vector3(), t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3();
  return class GhostHand {
    constructor(opacity = 0.4, opts = {}) {
      this.chains = opts.full ? WHOLE : FINGERS; this.R = opts.full ? FULL : TIP;
      const R = this.R, nV = this.chains.length * (R.rings.length * SEG + 1), pos = new Float32Array(nV * 3), col = new Float32Array(nV * 4), idx = [];
      let v = 0;
      for (let f = 0; f < this.chains.length; f++) {
        const base = v;
        for (let r = 0; r < R.rings.length; r++) for (let s = 0; s < SEG; s++, v++) {
          const a = opts.full ? 1 : Math.min(1, R.rings[r] / 0.6); col.set([1, 1, 1, a * a * (3 - 2 * a)], v * 4);
          if (r) { const p = base + (r - 1) * SEG, q = base + r * SEG, s1 = (s + 1) % SEG; idx.push(p + s, q + s, q + s1, p + s, q + s1, p + s1); }
        }
        col.set([1, 1, 1, 1], v * 4);
        const last = base + (R.rings.length - 1) * SEG;
        for (let s = 0; s < SEG; s++) idx.push(last + s, v, last + (s + 1) % SEG);
        v++;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4)); geo.setIndex(idx);
      this.solid = !!opts.solid;
      const mat = this.solid ? new THREE.MeshStandardMaterial({ color: GHOST_COLOURS.idle, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide })
        : new THREE.MeshBasicMaterial({ color: GHOST_COLOURS.idle, vertexColors: true, transparent: true, opacity, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.frustumCulled = false; this.mesh.visible = false; if (!this.solid) this.mesh.renderOrder = 5;
    }
    // jp: 25 joint positions (XR, 75 numbers), jr: their radii. Each finger is a tube along its joints, as thick as the joints say, with
    // a round end past its tip.
    update(jp, jr, colour) {
      const pos = this.mesh.geometry.attributes.position.array, R = this.R;
      let v = 0;
      for (const chain of this.chains) {
        const lens = [];
        let L = 0;
        for (let i = 1; i < chain.length; i++) { P.fromArray(jp, chain[i - 1] * 3); Q.fromArray(jp, chain[i] * 3); const l = P.distanceTo(Q); lens.push(l); L += l; }
        L = L || 1e-6;
        for (let r = 0; r < R.rings.length; r++) {
          // where along the chain, which segment, and how thick there
          let d = R.rings[r] * L, k = 0;
          while (k < lens.length - 1 && d > lens[k]) { d -= lens[k]; k++; }
          const u = Math.min(1, d / (lens[k] || 1)), ia = chain[k], ib = chain[k + 1];
          P.fromArray(jp, ia * 3); Q.fromArray(jp, ib * 3);
          c.lerpVectors(P, Q, u); t.subVectors(Q, P).normalize();
          const rad = (jr[ia] + (jr[ib] - jr[ia]) * u) * 1.12;
          c.addScaledVector(t, R.out[r] * rad);
          up.set(0, 1, 0); if (Math.abs(t.y) > 0.9) up.set(1, 0, 0);
          n.crossVectors(t, up).normalize(); b.crossVectors(t, n);
          for (let s = 0; s < SEG; s++, v++) {
            const a = s / SEG * Math.PI * 2, m = rad * R.scale[r];
            pos[v * 3] = c.x + (Math.cos(a) * n.x + Math.sin(a) * b.x) * m; pos[v * 3 + 1] = c.y + (Math.cos(a) * n.y + Math.sin(a) * b.y) * m; pos[v * 3 + 2] = c.z + (Math.cos(a) * n.z + Math.sin(a) * b.z) * m;
          }
        }
        const tip = chain[chain.length - 1];
        Q.fromArray(jp, tip * 3); c.copy(Q).addScaledVector(t, jr[tip] * 1.12); pos[v * 3] = c.x; pos[v * 3 + 1] = c.y; pos[v * 3 + 2] = c.z; v++;
      }
      this.mesh.geometry.attributes.position.needsUpdate = true;
      if (this.solid) this.mesh.geometry.computeVertexNormals();
      this.mesh.material.color.setHex(colour === undefined ? GHOST_COLOURS.idle : colour);
      this.mesh.visible = true;
    }
    dispose() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  };
}
