// A menu floating in the room, drawn from a menus.grid layout on a canvas (an ES module; the page gives it THREE).
//
//   const { Panel, drawGrid } = makePanels(THREE, renderer)
//   const p = new Panel(widthMetres, lay, { handle })   p.mesh (add it to the scene), p.plane (for a raycast), p.draw(lay, look),
//                                             p.pose(pose) (menus.axes conventions), p.handleLook('idle' | 'near' | 'held')
//   drawGrid(ctx, lay, look)                  look: { hover, pressed, edge (a colour: another player's menu), note }
// Seen from behind a menu is a blank wall in its background colour (Nudgy, 2026-10-14: "make it so that menus from behind are just the
// menu background color"). Nudgy's cut-out of the real hand in front of a menu is not here; the ghost fingers are drawn over it.
const COL = { bg: 'rgba(18,20,26,0.93)', text: '#ece9e2', dim: '#9aa3b2', btn: '#262b36', btnOn: '#2f6fc8', off: '#1b1f27', hover: '#f2c14e', edge: '#39404f', cell: '#1e222c' };
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

export function drawGrid(ctx, lay, look = {}) {
  const g = ctx, W = lay.w, H = lay.h, r = 14;
  g.clearRect(0, 0, W, H);
  g.fillStyle = COL.bg; round(g, 0, 0, W, H, 22); g.fill();
  g.fillStyle = COL.text; g.font = '600 30px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(lay.title.text || '', 22, lay.title.h / 2);
  const note = look.note !== undefined ? look.note : lay.title.note;
  if (note) {
    const x = 22 + g.measureText(lay.title.text || '').width + 24, top = lay.buttons.filter((b) => b.top).reduce((a, b) => Math.min(a, b.x), W);
    g.fillStyle = COL.dim; g.font = '22px system-ui, sans-serif'; g.fillText(fit(g, note, top - x - 16), x, lay.title.h / 2);
  }
  // shapes under the buttons (the room picker's map): { pts: [[x, y]] (px), colour, fill }
  for (const s of lay.shapes || []) {
    g.beginPath(); s.pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    if (s.fill) { g.fillStyle = s.fill; g.fill(); }
    g.lineWidth = 4; g.strokeStyle = s.colour || COL.dim; g.stroke();
  }
  for (const b of lay.buttons) {
    const text = !b.id, hov = look.hover === b.id && !b.off && !text, prs = look.pressed === b.id;
    if (b.ghost) {                                       // (a button drawn as a frame only: what is under it shows)
      g.lineWidth = b.active ? 6 : 3; g.strokeStyle = b.active ? COL.hover : COL.dim; round(g, b.x, b.y, b.w, b.h, r); g.stroke();
    } else {
      g.fillStyle = text ? COL.cell : b.off ? COL.off : b.active ? COL.btnOn : COL.btn;
      round(g, b.x, b.y, b.w, b.h, r); g.fill();
    }
    if (hov || prs) { g.lineWidth = prs ? 8 : 5; g.strokeStyle = COL.hover; round(g, b.x + 2, b.y + 2, b.w - 4, b.h - 4, r); g.stroke(); }
    g.fillStyle = b.off ? COL.dim : COL.text; g.textAlign = 'center';
    const cx = b.x + b.w / 2;
    if (b.value !== undefined && b.value !== '') {
      g.font = '600 26px system-ui, sans-serif'; g.fillText(fit(g, b.label, b.w - 16), cx, b.y + b.h * 0.36);
      g.fillStyle = b.off ? COL.dim : b.active ? '#ffffff' : COL.dim; g.font = '22px system-ui, sans-serif'; g.fillText(fit(g, String(b.value), b.w - 16), cx, b.y + b.h * 0.7);
    } else { g.font = '600 28px system-ui, sans-serif'; g.fillText(fit(g, b.label || '', b.w - 16), cx, b.y + b.h / 2); }
  }
  if (look.edge !== undefined && look.edge !== null) { g.lineWidth = 10; g.strokeStyle = hex(look.edge); round(g, 5, 5, W - 10, H - 10, 20); g.stroke(); }
}
function round(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function fit(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }

export const HANDLE_GAP = 0.035, HANDLE_HALF = 0.07;

export function makePanels(THREE, renderer) {
  const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const FS = `uniform sampler2D map; varying vec2 vUv;
    void main() {
      vec4 c = gl_FrontFacing ? texture2D(map, vUv) : vec4(pow(vec3(18.0, 20.0, 26.0) / 255.0, vec3(2.2)), 0.93);
      gl_FragColor = c;
      #include <colorspace_fragment>
    }`;
  const handleGeo = new THREE.CapsuleGeometry(0.008, HANDLE_HALF * 2, 4, 12); handleGeo.rotateZ(Math.PI / 2);
  class Panel {
    // width: metres; lay: a menus.grid layout; opts.handle: a bar under the panel to carry it by (this player's own menu only)
    constructor(width, lay, opts = {}) {
      this.width = width; this.canvas = document.createElement('canvas'); this.ctx = this.canvas.getContext('2d');
      this.mesh = new THREE.Group();                         // (posed; the plane is scaled inside it, the handle is not)
      this.material = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, uniforms: { map: { value: null } }, vertexShader: VS, fragmentShader: FS });
      this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
      this.plane.renderOrder = 2; this.mesh.add(this.plane);
      this.handle = null;
      if (opts.handle) {
        this.handle = new THREE.Mesh(handleGeo, new THREE.MeshBasicMaterial({ color: 0xece9e2, transparent: true, opacity: 0.85 }));
        this.mesh.add(this.handle);
      }
      this.tex = null; this.lay = null;
      if (lay) this.setLayout(lay);
    }
    get h() { return this.lay ? this.width * this.lay.h / this.lay.w : this.width; }
    setLayout(lay) {
      if (!this.lay || this.lay.w !== lay.w || this.lay.h !== lay.h) {
        // A texture keeps the size of its first upload: a canvas of another size needs a new texture (or the old picture is shown,
        // stretched: the line-up menu in the first headset run, 2026-10-22)
        this.canvas.width = lay.w; this.canvas.height = lay.h;
        if (this.tex) this.tex.dispose();
        this.tex = new THREE.CanvasTexture(this.canvas); this.tex.colorSpace = THREE.SRGBColorSpace;
        if (renderer) this.tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        this.material.uniforms.map.value = this.tex;
        const h = this.width * lay.h / lay.w;
        this.plane.scale.set(this.width, h, 1);
        if (this.handle) this.handle.position.set(0, -h / 2 - HANDLE_GAP, 0);
      }
      this.lay = lay;
    }
    // the width in metres (a menu that opens and folds changes it)
    setWidth(w) {
      if (w === this.width) return;
      this.width = w;
      if (!this.lay) return;
      const h = w * this.lay.h / this.lay.w;
      this.plane.scale.set(w, h, 1);
      if (this.handle) this.handle.position.set(0, -h / 2 - HANDLE_GAP, 0);
    }
    draw(lay, look) { this.setLayout(lay); drawGrid(this.ctx, lay, look); this.tex.needsUpdate = true; }
    // 'idle', 'near' (a hand is at it), 'held' (it is being carried)
    handleLook(state) {
      if (!this.handle) return;
      this.handle.material.color.setHex(state === 'held' ? 0x4ea1ff : state === 'near' ? 0xf2c14e : 0xece9e2);
      this.handle.scale.setScalar(state === 'idle' ? 1 : 1.3);
    }
    // pose: { x, y (floor plan), h (XR height), yaw, pitch }, as menus.axes takes it
    pose(p) {
      this.mesh.position.set(p.x, p.h, -p.y);
      if (p.q) this.mesh.quaternion.set(p.q[0], p.q[1], p.q[2], p.q[3]);          // (a card that turns with a wrist)
      else this.mesh.rotation.set(-(p.pitch || 0), Math.atan2(Math.cos(p.yaw), -Math.sin(p.yaw)), 0, 'YXZ');
      this.mesh.updateMatrixWorld(true);
    }
    dispose() { if (this.mesh.parent) this.mesh.parent.remove(this.mesh); this.plane.geometry.dispose(); this.material.dispose(); if (this.tex) this.tex.dispose(); if (this.handle) this.handle.material.dispose(); }
  }
  return { Panel, drawGrid };
}
