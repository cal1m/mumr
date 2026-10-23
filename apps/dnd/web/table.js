// The floor seen from above, drawn on a canvas: the room, the heroes, the creatures (with the way they face) and the items. One drawing
// for the player's page and the game master's (HOWTO 5: a shared thing is drawn by one module). Coordinates are the common frame in
// metres: x along the room (cross 1 to cross 2), y across it.
//   DND.table.draw(canvas, doc, { me, gm, selected }) ; DND.table.toFloor(canvas, doc, event) -> [x, y]
(function (D) {
  const MOOD = { asleep: '#6a6f8a', watch: '#c9a227', talk: '#4f9fd6', fight: '#d64f3c', flee: '#a06cd5', gone: '#555', dead: '#333' };
  function frame(canvas, doc) {
    const room = (doc.world && doc.world.room) || { w: 4, d: 3 }, pad = 18;
    const s = Math.min((canvas.width - pad * 2) / room.w, (canvas.height - pad * 2) / room.d);
    return { room, s, ox: (canvas.width - room.w * s) / 2, oy: (canvas.height - room.d * s) / 2 };
  }
  function fit(canvas) {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return dpr;
  }
  function draw(canvas, doc, opts = {}) {
    const dpr = fit(canvas), g = canvas.getContext('2d'), f = frame(canvas, doc), css = getComputedStyle(canvas);
    const P = (x, y) => [f.ox + x * f.s, f.oy + (f.room.d - y) * f.s];
    const ink = css.getPropertyValue('--ink').trim() || '#ddd', dim = css.getPropertyValue('--dim').trim() || '#888', floor = css.getPropertyValue('--floor').trim() || '#1c1a17';
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = floor; g.fillRect(f.ox, f.oy, f.room.w * f.s, f.room.d * f.s);
    g.strokeStyle = dim; g.lineWidth = 1 * dpr; g.setLineDash([]);
    for (let x = 0; x <= f.room.w; x++) { const [a, b] = P(x, 0), [, c] = P(x, f.room.d); g.globalAlpha = 0.25; g.beginPath(); g.moveTo(a, b); g.lineTo(a, c); g.stroke(); }
    for (let y = 0; y <= f.room.d; y++) { const [a, b] = P(0, y), [c] = P(f.room.w, y); g.beginPath(); g.moveTo(a, b); g.lineTo(c, b); g.stroke(); }
    g.globalAlpha = 1; g.strokeRect(f.ox, f.oy, f.room.w * f.s, f.room.d * f.s);
    g.font = `${11 * dpr}px system-ui, sans-serif`; g.textAlign = 'center';
    // the crosses of the line-up
    for (const [x, y, n] of [[0, 0, 1], [f.room.w, 0, 2]]) { const [a, b] = P(x, y); g.fillStyle = dim; g.fillText(`+${n}`, a + (n === 1 ? 10 : -10) * dpr, b - 4 * dpr); }
    for (const it of Object.values(doc.items || {})) {
      if (it.holder || !Number.isFinite(it.x) || (!it.shown && !opts.gm)) continue;
      const [a, b] = P(it.x, it.y), r = 6 * dpr;
      g.fillStyle = it.shown ? '#e0b84c' : 'transparent'; g.strokeStyle = '#e0b84c'; g.setLineDash(it.shown ? [] : [3 * dpr, 3 * dpr]);
      g.beginPath(); g.moveTo(a, b - r); g.lineTo(a + r, b); g.lineTo(a, b + r); g.lineTo(a - r, b); g.closePath(); g.fill(); g.stroke(); g.setLineDash([]);
      g.fillStyle = dim; g.fillText(it.name, a, b + r + 12 * dpr);
    }
    for (const c of Object.values(doc.creatures || {})) {
      if (c.mood === 'gone') continue;
      const [a, b] = P(c.x, c.y), r = Math.max(10 * dpr, (c.size || 1) * f.s * 0.5);
      g.fillStyle = MOOD[c.mood] || '#999'; g.globalAlpha = 0.35; g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = MOOD[c.mood] || '#999'; g.lineWidth = 2 * dpr; g.stroke();
      g.beginPath(); g.moveTo(a, b); g.lineTo(a + Math.cos(c.yaw) * r * 1.3, b - Math.sin(c.yaw) * r * 1.3); g.stroke();
      g.fillStyle = ink; g.fillText(opts.gm ? `${c.name} ${c.hp}/${c.maxHp} ${c.mood}` : c.name, a, b - r - 6 * dpr);
    }
    for (const h of Object.values(doc.heroes || {})) {
      if (!h.here || !Number.isFinite(h.x)) continue;
      const [a, b] = P(h.x, h.y), r = 9 * dpr, mine = h.id === opts.me, sel = h.id === opts.selected;
      g.fillStyle = h.down ? '#555' : mine ? '#5fbf7f' : '#7fa7d9'; g.beginPath(); g.arc(a, b, r, 0, Math.PI * 2); g.fill();
      if (sel) { g.strokeStyle = ink; g.lineWidth = 2 * dpr; g.stroke(); }
      g.fillStyle = ink; g.fillText(h.name, a, b + r + 12 * dpr);
    }
  }
  function toFloor(canvas, doc, ev) {
    const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width, f = frame(canvas, doc);
    const px = (ev.clientX - r.left) * dpr, py = (ev.clientY - r.top) * dpr;
    const x = (px - f.ox) / f.s, y = f.room.d - (py - f.oy) / f.s;
    return [Math.max(0, Math.min(f.room.w, x)), Math.max(0, Math.min(f.room.d, y))];
  }
  D.table = { draw, toFloor };
})(globalThis.DND = globalThis.DND || {});
