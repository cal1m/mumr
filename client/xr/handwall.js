// THE HAND WALL: a window fixed to a wall of the room that shows every hand in the world, drawn from its joints, with what the engine's
// gestures (grab.js) make of it: the gesture, the pinch gap, how far each fingertip is from the palm, how straight the index is, the
// palm's tilt and which side is up. For trying gestures out and tuning them (Marek, 2026-10-23). An ES module; THREE handed in.
//
// Where: by default the longest wall of the room, in its middle, WALL_H up, a little off the wall on the room's side; a player may move it
// to another wall in the room model (model.js), and then it hangs where the document's `wallspot` says (room.js SPOT_KIND). The room is
// the server's, so every player and the PC view see the window in the same place, showing the same hands.
//   const w = createHandWall({ THREE, parent });   parent: the floor group (inside it the floor plan (x, y, z) is THREE (x, z, -y))
//   w.update(room, hands, nowMs, spot)   hands: [{ name, colour, source, g (that source's Grips state) }], at most 4 are shown; spot
//                                        (floor plan) or null: the default
const W = 1.0, H = 0.56, WALL_H = 1.35, OFF = 0.02, PX = 1024, PY = 574, EVERY = 100;
const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19], [0, 20, 21, 22, 23, 24], [5, 10, 15, 20]];
const COL = { pinch: '#2e8b57', fist: '#d9822b', point: '#f2c14e', flat: '#4ea1ff', open: '#9aa3b5', none: '#6b7280' };

// where on the wall by default (room.js wallSpot: the middle of the longest wall): { x, y, h, yaw (heading of its front) } or null
export const SIZE = { w: W, h: H };
export function wallSpot(room, near) { return globalThis.MUMR.room.wallSpot(room, SIZE, near, WALL_H, OFF); }

export function createHandWall({ THREE, parent }) {
  const canvas = document.createElement('canvas'); canvas.width = PX; canvas.height = PY;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  mesh.visible = false; parent.add(mesh);
  const ctx = canvas.getContext('2d');
  let at = -1e9, shownRoom = null, shownSpot = null;

  // one hand in its own frame: the wrist at the bottom, the middle knuckle straight up, the palm facing you
  function drawHand(x0, y0, w, h, src, colour) {
    const j = src.joints;
    if (!j || j.length < 25) { ctx.fillStyle = '#6b7280'; ctx.font = '22px system-ui, sans-serif'; ctx.fillText('no joints', x0 + 12, y0 + h / 2); return; }
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
    const Y = nrm(sub(j[11], j[0])), a = sub(j[6], j[21]), X = nrm(a.map((v, i) => v - dot(a, Y) * Y[i]));
    const S = Math.min(w, h) / 0.22, P = (q) => { const d = sub(q, j[0]); return [x0 + w / 2 + dot(d, X) * S, y0 + h - 14 - dot(d, Y) * S]; };
    ctx.strokeStyle = colour; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const chain of BONES) { ctx.beginPath(); chain.forEach((k, i) => { const p = P(j[k]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke(); }
    ctx.fillStyle = '#ece9e2';
    for (const k of [4, 9, 14, 19, 24]) { const p = P(j[k]); ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, 7); ctx.fill(); }
  }
  const mm = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : `${Math.round(v * 1000)}`);
  function draw(hands) {
    ctx.clearRect(0, 0, PX, PY);
    ctx.fillStyle = 'rgba(18,20,26,0.88)'; ctx.beginPath(); ctx.roundRect(4, 4, PX - 8, PY - 8, 22); ctx.fill();
    ctx.fillStyle = '#ece9e2'; ctx.font = '600 30px system-ui, sans-serif'; ctx.fillText('Hands', 26, 46);
    ctx.font = '20px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5';
    ctx.fillText('pinch green, fist orange, point yellow, flat blue; distances in mm from the palm', 140, 44);
    const list = hands.slice(0, 4), cw = (PX - 40) / 4;
    if (!list.length) { ctx.fillStyle = '#9aa3b5'; ctx.font = '26px system-ui, sans-serif'; ctx.fillText('no hands tracked', 26, 120); }
    list.forEach((hd, i) => {
      const x = 20 + i * cw, g = hd.g || {}, m = g.m || {}, c = COL[g.gesture] || COL.none;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 4, 66, cw - 8, PY - 86);
      ctx.fillStyle = hd.colour || '#ece9e2'; ctx.font = '600 24px system-ui, sans-serif'; ctx.fillText(hd.name, x + 14, 96);
      ctx.fillStyle = c; ctx.font = '700 30px system-ui, sans-serif'; ctx.fillText(g.gesture || 'none', x + 14, 132);
      drawHand(x + 8, 140, cw - 16, 230, hd.source, c);
      ctx.fillStyle = '#ece9e2'; ctx.font = '21px ui-monospace, monospace';
      const t = m.tips || [];
      const lines = [`pinch gap ${mm(m.pinchGap)}`, `curl ${mm(m.curl)} (fist <${mm(globalThis.MUMR.grab.FIST_ON)})`, `i ${mm(t[0])} m ${mm(t[1])}`, `r ${mm(t[2])} p ${mm(t[3])}`,
        `index ${m.straight === null || m.straight === undefined ? '-' : `${Math.round(m.straight * 100)} % straight`}`, m.tilt === null || m.tilt === undefined ? 'palm: steep' : `palm ${m.face} ${Math.round(m.tilt * 57.3)} deg`];
      lines.forEach((l, k) => ctx.fillText(l, x + 14, 400 + k * 27));
    });
    tex.needsUpdate = true;
  }
  const api = {
    mesh, spot: null,
    update(room, hands, now, spot) {
      const key = spot ? `${spot.x},${spot.y},${spot.h},${spot.yaw}` : '';
      if (room !== shownRoom || key !== shownSpot) {
        shownRoom = room; shownSpot = key;
        const s = spot || (room ? wallSpot(room) : null);
        mesh.visible = !!s;
        if (s) { mesh.position.set(s.x, s.h, -s.y); mesh.rotation.set(0, Math.atan2(Math.cos(s.yaw), -Math.sin(s.yaw)), 0); }
        api.spot = s;
      }
      if (!mesh.visible || now - at < EVERY) return;
      at = now;
      draw(hands || []);
    },
    dispose() { parent.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); tex.dispose(); },
  };
  return api;
}
