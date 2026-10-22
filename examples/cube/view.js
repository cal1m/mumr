// The PC's view of the cube world: a watcher (WorldFeed), no game logic. Everything comes in the common frame, which is this page's
// floor plan: the floor is the common floor, spot 1 of the line-up is the origin. Drawn a little in the past (DELAY), between samples.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLAYER_COLOURS } from '/mumr/xr/players3d.js';
import { makePanels } from '/mumr/xr/panel3d.js';
import { makeLegs } from '/mumr/xr/legs3d.js';
import { makeCube, setCube } from './draw.js';

// DELAY: how far in the past the world is drawn, so that it can be blended between packets (they come every 22 ms); ?delay=ms changes it
const M = window.MUMR, C = window.CUBE, DELAY = Math.max(0, Math.min(1000, Number(new URLSearchParams(location.search).get('delay') ?? 50)));
const canvas = document.getElementById('view'), hud = document.getElementById('hud');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);                  // (the PC view is a monitor: a sharper picture is not worth the frame rate)
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x20242c);
const camera = new THREE.PerspectiveCamera(55, 1, 0.02, 60); camera.position.set(-1.5, 3.2, 3.5);
const controls = new OrbitControls(camera, canvas); controls.target.set(0.8, 0, -0.5); controls.update();
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1, 3, 2); scene.add(sun);
const world = new THREE.Group(); scene.add(world);
world.add(new THREE.GridHelper(8, 40, 0x55607a, 0x353b4a));
const cubeMesh = makeCube(THREE, C.SIZE); world.add(cubeMesh);
const { Panel } = makePanels(THREE, renderer);
const toV = (x, y, z) => new THREE.Vector3(x, z, -y);

const info = await fetch('/info').then((r) => r.json()).catch(() => ({ build: 0 }));
const life = M.life.make({ name: 'PC view' });
life(`PC view loaded (${navigator.userAgent.slice(0, 90)})`);
const feed = M.worldfeed.WorldFeed.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { build: info.build, name: 'PC view', session: { game: C.GAME, player: C.PLAYER } });

// each player: a cone for the head, a dot for every joint and point, two discs for the spots (1 at the origin, 2 at dist along x), the check mark
const drawn = new Map();
function playerObj(slot) {
  let o = drawn.get(slot);
  if (o) return o;
  const col = PLAYER_COLOURS[slot % PLAYER_COLOURS.length], mat = new THREE.MeshBasicMaterial({ color: col });
  const headM = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 }));
  headM.geometry.rotateZ(-Math.PI / 2);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 8, 6), mat, 160);
  const check = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.06, 32), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
  check.rotation.x = -Math.PI / 2;
  world.add(headM, dots, check);
  o = { headM, dots, check, panel: null, legs: makeLegs(THREE, world, col), key: '' };
  drawn.set(slot, o);
  return o;
}
const spotMat = new THREE.MeshBasicMaterial({ color: 0xece9e2, side: THREE.DoubleSide }), spots = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 32), spotMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.002; world.add(m); return m; });
const mtx = new THREE.Matrix4();

function frame() {
  const t = feed.serverNow(), at = t === null ? undefined : t - DELAY, S = feed.session;
  const c = feed.sample('cube', null, at);
  if (c) setCube(cubeMesh, { x: c.data[0], y: c.data[1], z: c.data[2], yaw: c.data[3], held: c.data[7] > 0.5 }, C.COLOURS[(S.doc.game.colour || 0) % C.COLOURS.length]);
  const here = new Set();
  let dist = null;
  for (const p of feed.players()) {
    here.add(p.slot);
    const o = playerObj(p.slot);
    if (p.lined) dist = p.lined.dist;
    const pr = feed.sample('presence', p.slot, at);
    o.headM.visible = !!pr;
    let n = 0;
    if (pr) {
      const h = pr.data.head;
      o.headM.position.copy(toV(h[0], h[1], h[3])); o.headM.rotation.set(0, h[2], 0);
      for (const s of pr.data.sources) if (!s.foot) for (const q of (s.joints || s.points.map((x) => [x.x, x.y, x.z]))) if (n < 160) { const v = toV(q[0], q[1], q[2]); mtx.makeTranslation(v.x, v.y, v.z); o.dots.setMatrixAt(n++, mtx); }
    }
    o.dots.count = n; o.dots.instanceMatrix.needsUpdate = true;
    o.legs.update(pr ? M.hands.legs(pr.data.head, pr.data.sources) : []);
    o.check.visible = !!p.check;
    if (p.check) o.check.position.copy(toV(p.check[0], p.check[1], (p.check[2] || 0) + 0.003));
    // that player's menu, where it floats, drawn from its own state and mode (the same layout the headsets draw)
    const m = feed.sample('menus', p.slot);
    const row = m && Array.isArray(m.data.panels) ? m.data.panels.find((r) => r[0] === 'main') : null;
    if (row) {
      const lay = C.menu(S.stateOf(p.slot), m.data.info || {});
      if (!o.panel) { o.panel = new Panel(0.42, lay); scene.add(o.panel.mesh); }
      o.panel.mesh.visible = true;
      o.panel.pose({ x: row[1], y: row[2], h: row[3], yaw: row[4], pitch: row[5] });
      const look = { edge: PLAYER_COLOURS[p.slot % PLAYER_COLOURS.length], note: (m.data.info && m.data.info.note) || `player ${p.slot + 1}` }, key = JSON.stringify([lay.buttons.map((b) => [b.label, b.value, b.active, b.off]), look.note]);
      if (key !== o.key) { o.key = key; o.panel.draw(lay, look); }        // (only when it changed: a redraw is a canvas and a texture upload)
    } else if (o.panel) o.panel.mesh.visible = false;
  }
  for (const [slot, o] of [...drawn]) if (!here.has(slot)) { for (const x of [o.headM, o.dots, o.check]) world.remove(x); if (o.panel) o.panel.dispose(); o.legs.dispose(); drawn.delete(slot); }
  spots[0].visible = spots[1].visible = dist !== null;
  if (dist !== null) spots[1].position.set(dist, 0.002, 0);
  const st = feed.status();
  hud.textContent = `${feed.ready ? 'connected' : 'waiting for the server'}, ${st.players} player(s), drawn ${DELAY} ms in the past (?delay=), event ${st.events}, ${st.packets} packets, clock spread ${st.clockSpreadMs === null ? '-' : st.clockSpreadMs.toFixed(1)} ms\n`
    + `cube: ${c ? `${c.data[0].toFixed(2)}, ${c.data[1].toFixed(2)} m${c.data[7] > 0.5 ? ', held' : ''}, simulated by player ${(S.holder('cube') ?? -1) + 1}` : 'not seen yet'}   count ${S.doc.game.count ?? 0}`;
  controls.update();
  renderer.render(scene, camera);
  perf.frames++;
  const now = performance.now();
  if (now - perf.t0 >= 10000) {
    // every 10 s to the server's log: how fast this page draws, how much comes in, and how old the newest is (the first headset run found
    // this view "super laggy" in Firefox, and the server had to drop packets for it)
    const ages = Object.entries(st.ages).map(([k, v]) => `${k} ${v.map((q) => q[1]).join('/')}`).join(', ');
    life(`view: ${(perf.frames * 1000 / (now - perf.t0)).toFixed(0)} fps, ${((st.packets - perf.p0) * 1000 / (now - perf.t0)).toFixed(0)} packets/s, ages (ms) ${ages}, late by their stamps (ms) ${Object.entries(st.late).map(([k, v]) => `${k} ${v}`).join(', ')}, drawn ${DELAY} ms back, clock fallbacks ${st.offClock}, clock spread ${st.clockSpreadMs === null ? '-' : st.clockSpreadMs.toFixed(1)} ms`);
    perf.t0 = now; perf.frames = 0; perf.p0 = st.packets;
  }
}
const perf = { t0: performance.now(), frames: 0, p0: 0 };
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(frame);
window.__view = { feed, frame };
// a page of another build reloads itself (the server refuses an old one)
setInterval(async () => { try { const i = await (await fetch('/info')).json(); if (i.build && info.build && i.build !== info.build) location.reload(); } catch (e) { /* the server is away */ } }, 3000);
