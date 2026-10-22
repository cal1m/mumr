// Pointing rays: a thin line from a pointing fingertip to what it points at, a dot there and a small sign saying what it is. For any
// app (grab.js POINT and pointAt give the rays and the hits). An ES module; THREE handed in. `parent` is the floor group (inside it the
// floor plan (x, y, z) is THREE (x, z, -y)).
//   const P = createPointers({ THREE, parent }); P.update([{ from, at, label, colour }])
export function createPointers({ THREE, parent, max = 8 }) {
  const items = [];
  const V = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
  function item() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0.9 }));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf2c14e }));
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sign.scale.set(0.16, 0.04, 1);
    parent.add(line, dot, sign);
    return { line, dot, sign, canvas, tex, text: null };
  }
  return {
    update(list) {
      list = (list || []).slice(0, max);
      while (items.length < list.length) items.push(item());
      items.forEach((it, i) => {
        const p = list[i], on = !!p;
        it.line.visible = it.dot.visible = it.sign.visible = on;
        if (!on) return;
        const a = V(p.from), b = V(p.at), col = p.colour === undefined ? 0xf2c14e : p.colour;
        it.line.geometry.attributes.position.setXYZ(0, a.x, a.y, a.z); it.line.geometry.attributes.position.setXYZ(1, b.x, b.y, b.z);
        it.line.geometry.attributes.position.needsUpdate = true; it.line.geometry.computeBoundingSphere();
        it.line.material.color.set(col); it.dot.material.color.set(col);
        it.dot.position.copy(b); it.sign.position.set(b.x, b.y + 0.05, b.z);
        const text = p.label || '';
        if (text !== it.text) {
          it.text = text;
          const c = it.canvas.getContext('2d');
          c.clearRect(0, 0, 256, 64);
          if (text) { c.fillStyle = 'rgba(18,20,26,0.85)'; c.beginPath(); c.roundRect(4, 4, 248, 56, 16); c.fill(); c.fillStyle = '#ece9e2'; c.font = '600 32px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 34); }
          it.tex.needsUpdate = true;
        }
      });
    },
  };
}
