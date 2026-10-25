// A stand-in player for the cube demo, in Node: it joins like a headset, lines up with a given frame, waves two whole hands (25 joints
// each) round a circle, holds the cube's token when it is the first one in and sends the cube, and sends its menu, at the rates a
// headset does. For rehearsals without headsets and for measuring the PC view.
//   node tools/standin.js [ws://localhost:8766/ws] [name] [x,y,deg]
const M = require('../engine/client/index.js');
const C = require('../examples/cube/cube.js');

const url = process.argv[2] || 'ws://localhost:8766/ws', name = process.argv[3] || 'stand-in';
const [fx, fy, fdeg] = (process.argv[4] || '0,0,0').split(',').map(Number);
(async () => {
  const info = await (await fetch(url.replace(/^ws/, 'http').replace(/\/ws$/, '/info'))).json();
  const link = M.link.connect(url, { build: info.build, name });
  link.onNote = (n) => console.log(new Date().toISOString().slice(11, 19), n);
  const S = new M.session.Session(link, { game: C.GAME, player: C.PLAYER, actions: C.ACTIONS, press: C.press });
  const space = new M.align.Space(null, 0), lineup = new M.lineup.LineUp(S, space);
  lineup.given({ x: fx || 0, y: fy || 0, yaw: ((fdeg || 0) * Math.PI) / 180 });
  const presence = new M.presence.Presence(S, space), menus = new M.menus.Menus(S, space);
  const cube = new C.Cube(), body = new M.body.Body(S, { token: 'cube', type: 'cube', adapter: C.adapter(cube, space) });
  link.onBin = (b) => { const p = M.wire.decode(b), now = performance.now(); if (!p) return; if (p.name === 'presence') presence.receive(p, now); else if (p.name === 'menus') menus.receive(p, now); else if (p.name === 'cube') body.receive(p, now); };
  const hand = (id, cx, cy, cz) => {
    const jp = new Float32Array(75);
    for (let i = 0; i < 25; i++) { jp[i * 3] = cx + (i % 5) * 0.012 * (id === 'left' ? -1 : 1); jp[i * 3 + 1] = cz + Math.floor(i / 5) * 0.015; jp[i * 3 + 2] = -cy; }
    return M.hands.source(id, jp, space);
  };
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000, t = now / 1000; last = now;
    const a = t * 0.8, cx = 0.6 + 0.35 * Math.cos(a), cy = 0.35 * Math.sin(a);
    const own = [hand('left', cx - 0.15, cy, 1.0), hand('right', cx + 0.15, cy, 1.0)];
    lineup.update(now, dt, []);
    S.tick(now);
    presence.send(now, [cx, cy - 0.4, Math.PI / 2, 1.6, 0], own);
    body.frame(now, own);
    cube.step(dt, t, presence.hands(own, now));
    body.send(now);
    menus.send(now, [{ id: 'main', pose: { x: cx, y: cy - 0.2, h: 1.2, yaw: Math.PI / 2, pitch: 0.2 } }], Object.assign(lineup.info(), { players: S.others + 1 }));
  }, 11);
})();
