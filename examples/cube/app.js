// The MUMR cube: one cube that every player can push and pick up with bare hands, a menu that every player can press, other players'
// hands and heads, lining up on printed crosses. The headset page, and also the PC rehearsal: the same page in a desktop browser with
// a pretend line-up (?frame=x,y,deg) and the mouse as a fingertip (left button on the floor; right button turns the view).
//   py -3 server/serve.py examples/cube                    headsets: https://<PC>:8443/
//   py -3 server/serve.py examples/cube 8766 --http        two tabs: /?name=A&frame=0,0,0 and /?name=B&frame=1,0.5,40
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enterXR } from '/mumr/xr/session.js';
import { readInput, readLegs } from '/mumr/xr/input.js';
import { makeGhost, GHOST_COLOURS } from '/mumr/xr/ghost.js';
import { createPlayers, PLAYER_COLOURS } from '/mumr/xr/players3d.js';
import { makePanels } from '/mumr/xr/panel3d.js';
import { makeCube, setCube, ownerOf } from './draw.js';

const M = window.MUMR, C = window.CUBE, QS = new URLSearchParams(location.search), $ = (id) => document.getElementById(id);
const QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
let sayT = -1e9;
const LS = { getItem: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, setItem: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* not kept */ } } };

// ---- the scene. `world` is the floor: inside it the floor plan (x, y, z) is THREE (x, z, -y).
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.xr.enabled = true;
const scene = new THREE.Scene(), DESK_BG = new THREE.Color(0x20242c);
scene.background = DESK_BG;
const camera = new THREE.PerspectiveCamera(60, 1, 0.02, 50);
camera.position.set(0.2, 1.7, 2.2);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.5, 0.4, 0); controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }; controls.update();
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(1, 3, 2); scene.add(sun);
const world = new THREE.Group(); scene.add(world);
const grid = new THREE.GridHelper(6, 30, 0x55607a, 0x353b4a); world.add(grid);
const cubeMesh = makeCube(THREE, C.SIZE); world.add(cubeMesh, cubeMesh.userData.holder);
const GhostHand = makeGhost(THREE), ghosts = { left: new GhostHand(), right: new GhostHand() };
for (const g of Object.values(ghosts)) scene.add(g.mesh);
const players = createPlayers({ THREE, world, scene, GhostHand });
const { Panel } = makePanels(THREE, renderer);
const mouseDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf2c14e })); mouseDot.visible = false; world.add(mouseDot);

// ---- the shared world (MUMR)
const info = await fetch('/info').then((r) => r.json()).catch(() => ({ build: 0 }));
const NAME = QS.get('name') || (QUEST ? 'Quest' : 'PC tab');
const life = M.life.make({ name: NAME });
life(`page loaded (${navigator.userAgent.slice(0, 80)})`);
document.addEventListener('visibilitychange', () => { life(`page ${document.visibilityState}`); if (document.hidden && !xr) away(); });
const link = M.link.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { build: info.build, name: NAME });
link.onNote = (n) => life(`link: ${n}`);
const SysMenu = M.sysmenu.SysMenu;
const S = new M.session.Session(link, { game: C.GAME, player: C.PLAYER, actions: SysMenu.ACTIONS.concat(C.ACTIONS), press: C.press });
const space = new M.align.Space(null, 0);
const presence = new M.presence.Presence(S, space);
const menus = new M.menus.Menus(S, space, { known: (id) => id === 'main' || id === 'wrist' });
const lineup = new M.lineup.LineUp(S, space, { store: LS, say, life });
// the engine's menu on the left wrist: Line up, Room setup, Exit (the cube's own menu floats: cube.js menu)
const sys = new SysMenu(S, lineup, {
  exit: () => { if (xr) xr.session.end(); else say('Not in mixed reality'); },
  roomSetup: () => { const r = xr ? xr.roomSetup() : 'none'; say(r === 'started' ? 'Room setup: the headset takes over' : r === 'used' ? 'Room setup was used once: leave mixed reality and come back for it again' : 'No room setup here'); },
  roomUsed: () => !!(xr && xr.roomUsed),
});
const cube = new C.Cube();
const body = new M.body.Body(S, { token: 'cube', type: 'cube', adapter: C.adapter(cube, space) });
const pinch = new M.hands.Pinch(), poke = new M.menus.Poke(), follower = new M.follow.Follower();
link.onBin = (b) => {
  const p = M.wire.decode(b), now = performance.now();
  if (!p) return;
  if (p.name === 'presence') presence.receive(p, now); else if (p.name === 'menus') menus.receive(p, now); else if (p.name === 'cube') body.receive(p, now);
};
S.on('action', (id, from) => action(id, from));
S.on('press', (id, from) => { if (from !== S.me) say(`Player ${from + 1} pressed ${id} on your menu`); });
S.on('peer', (slot, on) => { say(on ? `Player ${slot + 1} is here` : `Player ${slot + 1} left`); life(`peer ${slot + 1} ${on ? 'joined' : 'left'}`); });
S.on('token', (t, mine) => { if (t === 'cube') life(`cube: ${mine ? 'simulated here' : `simulated by ${(ownerOf(S.holder('cube'), S.me, PLAYER_COLOURS) || { text: 'nobody' }).text}`}`); if (mine && document.hidden && !xr) away(); });
// a page nobody looks at (a hidden tab, a headset taken off) draws no frames: it must not hold the cube, or nobody sees it move
// (also when the frame loop has stopped without the page saying it is hidden: a paused tab, a frozen page)
setInterval(() => { if (performance.now() - last > 1000) away(); }, 500);
// the line-up note of another player's wrist menu (it comes in that player's menus info)
const oiNote = (slot) => { const o = menus.others(performance.now()).find((q) => q.slot === slot); return o && o.info && o.info.sys ? o.info.sys.note : ''; };
let awayAt = -1e9;
function away() { const now = performance.now(); if (now - awayAt < 5000 || !S.connected || !S.holds('cube') || !(S.others || S.hostHere)) return; awayAt = now; S.release('cube'); life('cube: given up (this page is not looked at)'); }
S.on('leave', (why) => { if (why === 'version') say('This page is older than the server\'s: reload it'); });
if (QS.has('frame')) {
  const [x, y, deg] = QS.get('frame').split(',').map(Number);
  lineup.given({ x: x || 0, y: y || 0, yaw: ((deg || 0) * Math.PI) / 180 });
  life(`pretend line-up ${QS.get('frame')}`);
}
// a button that is an action happened on this page's menu (pressed here or by another player)
function action(id, from) {
  if (sys.press(id)) return;
  if (id === 'cubeHere') {
    const h = head, x = h[0] + Math.cos(h[2]) * 0.5, y = h[1] + Math.sin(h[2]) * 0.5, c = space.ok ? space.toCommon([x, y]) : [x, y];
    body.ask('place', { x: c[0], y: c[1] });
    say(from === S.me || from === null ? 'The cube is in front of you' : `Player ${from + 1} put the cube in front of you`);
  }
}
function say(text) { $('say').textContent = text; sayT = performance.now(); life(`said: ${text}`); }

// ---- mixed reality
let xr = null, keeper = null;
if (navigator.xr && navigator.xr.isSessionSupported) navigator.xr.isSessionSupported('immersive-ar').then((ok) => { $('enter').hidden = !ok; if (!ok) $('xrNote').textContent = 'no mixed reality in this browser: desktop rehearsal'; });
$('enter').onclick = async () => {
  try {
    xr = await enterXR({ renderer, life, onReset: (F) => keeper && keeper.reset(F), onEnd: ended, onVisibility: (v) => { if (v === 'hidden') away(); } });
  } catch (e) { $('xrNote').textContent = `Could not start mixed reality: ${e && e.message ? e.message : e}`; return; }
  scene.background = null; grid.visible = false; mouseDot.visible = false;
  lineup.restart();
  keeper = new M.anchor.Keeper(xr.anchorIO('mumr.cube.anchor'));
  lineup.setKeeper(keeper);
  follower.pose = null;
  if (QS.get('shared') === '1') say('Shared space asked for: see the server log');
};
function ended() { xr = null; keeper = null; lineup.setKeeper(null); lineup.restart(); scene.background = DESK_BG; grid.visible = true; resize(); }

// ---- the desktop: the mouse as a fingertip on the floor, clicks on any menu
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
let mouse = null;              // { x, y, pinch (Shift held) } on the floor plan while the left button is down
const panelsAll = new Map();   // key -> { panel, owner, id, lay, pose }
function pointer(ev) { const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || xr) return;
  pointer(ev);
  const meshes = [...panelsAll.values()].map((q) => q.panel.plane), hit = ray.intersectObjects(meshes, false)[0];
  if (hit) {
    const q = [...panelsAll.values()].find((v) => v.panel.plane === hit.object), n = M.menus.axes(q.pose).normal;
    if (ray.ray.direction.x * n[0] + ray.ray.direction.y * n[1] + ray.ray.direction.z * n[2] > 0) return;      // (from behind: a blank wall)
    const id = M.menus.hit(q.lay, hit.uv.x, 1 - hit.uv.y);
    if (id) pressed(q.owner, id);
    return;
  }
  if (ray.ray.intersectPlane(floorPlane, hitP)) { mouse = { x: hitP.x, y: -hitP.z, pinch: ev.shiftKey }; canvas.setPointerCapture(ev.pointerId); }
});
canvas.addEventListener('pointermove', (ev) => { if (!mouse) return; pointer(ev); if (ray.ray.intersectPlane(floorPlane, hitP)) mouse = { x: hitP.x, y: -hitP.z, pinch: ev.shiftKey }; });
canvas.addEventListener('pointerup', () => { mouse = null; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
let pressedLook = { key: null, id: null, t: -1e9 };
function pressed(owner, id, key) {
  key = key || (owner === null || owner === S.me ? 'own:main' : `${owner}:main`);
  pressedLook = { key, id, t: performance.now() };
  S.press(owner === S.me ? null : owner, id);
}

// ---- every frame
let head = [0, 0, 0, 1.6, 0], last = performance.now(), redrawAt = 0, drag = null;
const handPinch = new Map();
const v3 = new THREE.Vector3();
function readHead(frame) {
  if (frame && xr) {
    const vp = frame.getViewerPose(xr.refSpace);
    if (vp) { const p = vp.transform.position, o = vp.transform.orientation; const fx = -2 * (o.x * o.z + o.w * o.y), fy = -2 * (o.y * o.z - o.w * o.x), fz = -(1 - 2 * (o.x * o.x + o.y * o.y)); return [p.x, -p.z, Math.atan2(-fz, fx), p.y - space.floorY, Math.asin(Math.max(-1, Math.min(1, fy)))]; }
    return head;
  }
  camera.getWorldDirection(v3);
  return [camera.position.x, -camera.position.z, Math.atan2(-v3.z, v3.x), camera.position.y, Math.asin(v3.y)];
}
function onFrame(time, frame) {
  const now = performance.now(), dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (xr) xr.frame = frame || null;
  if (keeper && frame) keeper.update();
  head = readHead(frame);
  // this page's hands: in mixed reality the tracked hands; on the desktop the mouse while its button is down
  let own = [], tips = [], legs = [], handsXR = [];
  if (xr && frame) {
    const r = readInput(xr, frame, space, pinch);
    own = r.sources; handsXR = r.hands; tips = r.hands.map((h) => ({ id: h.id, p: h.tip }));
    legs = readLegs(xr, frame, space);
    const st = S.stateOf(null);
    for (const id of ['left', 'right']) {
      const h = r.hands.find((q) => q.id === id && q.jp), g = ghosts[id];
      if (!h || !st.ghost) { g.mesh.visible = false; continue; }
      const held = cube.held && cube.held.by === id, near = cube.nearest(own.filter((s) => s.id === id)) < 0.01;
      g.update(h.jp, h.jr, held ? GHOST_COLOURS.hold : near ? GHOST_COLOURS.touch : GHOST_COLOURS.idle);
    }
  } else if (mouse) {
    // (Shift held: the thumb and the index touch, a pinch: it picks the cube up when it starts at the cube)
    own = [{ id: 'mouse', pinch: !!mouse.pinch, points: [{ name: 'index', x: mouse.x, y: mouse.y, z: 0.05 }, { name: 'thumb', x: mouse.x, y: mouse.y, z: 0.05 }] }];
  }
  mouseDot.visible = !xr && !!mouse;
  if (mouse) mouseDot.position.set(mouse.x, 0.05, -mouse.y);
  // lining up, then everything that is shared
  lineup.update(now, dt, M.hands.tips(own, Object.fromEntries(own.map((s) => [s.id, !!s.pinch]))));
  S.tick(now);
  presence.send(now, head, own.concat(legs));
  const all = presence.hands(lineup.active ? [] : own, now);         // (a hand that lines up does not push the cube)
  if (!lineup.active) body.frame(now, own);
  cube.step(dt, now / 1000, all);
  body.send(now);
  // the menus: ours follows us in mixed reality and stands still on the desktop; everybody's can be pressed
  if (!follower.pose) { if (xr) follower.snap({ x: head[0], y: head[1], th: head[2], py: head[3] + space.floorY }); else follower.set({ x: 0.9, y: 0.55, h: 0.95, yaw: -2.4, pitch: 0.15 }); }
  const st = S.stateOf(null), sysInfo = sys.info(), ownInfo = { players: S.others + 1, sys: sysInfo };
  const lay = C.menu(st, ownInfo), want = new Set(['own:main', 'own:wrist']);
  const busyKeys = new Set();
  const list = [{ key: 'own:main', owner: null, id: 'main', pose: follower.pose, w: 0.42, lay }];
  // the wrist menu: on the left wrist in mixed reality (while it looks at you), beside the cube's menu on the desktop
  const leftHand = handsXR.find((h) => h.id === M.sysmenu.WRIST_SIDE && h.jp);
  const wristPose = xr ? sys.place(head, leftHand ? leftHand.jp : null, space.floorY) : { x: 0.55, y: 0.85, h: 0.95, yaw: -2.0, pitch: 0.15 };
  if (wristPose) list.push({ key: 'own:wrist', owner: null, id: 'wrist', pose: wristPose, w: SysMenu.width(sysInfo), lay: SysMenu.layout(sysInfo), ignore: M.sysmenu.WRIST_SIDE });
  for (const o of menus.others(now)) for (const p of o.panels) {
    const key = `${o.slot}:${p.id}`, oi = o.info || {}, wrist = p.id === 'wrist', olay = wrist ? SysMenu.layout(oi.sys) : C.menu(S.stateOf(o.slot), oi);
    const q = panelsAll.get(key), cur = q && q.pose ? q.pose : p.pose, k = 1 - Math.exp(-dt * 18);
    const eased = { x: cur.x + (p.pose.x - cur.x) * k, y: cur.y + (p.pose.y - cur.y) * k, h: cur.h + (p.pose.h - cur.h) * k, yaw: cur.yaw + M.util.wrap(p.pose.yaw - cur.yaw) * k, pitch: p.pose.pitch };
    list.push({ key, owner: o.slot, id: p.id, pose: eased, w: wrist ? SysMenu.width(oi.sys) : 0.42, lay: olay });
    want.add(key);
  }
  for (const pn of list) pn.h = pn.w * pn.lay.h / pn.lay.w;
  let hover = null;
  if (tips.length) {
    const r = poke.update(list, tips, now);
    hover = r.hover;
    for (const k of r.busy) busyKeys.add(k);
    for (const pr of r.presses) pressed(pr.owner, pr.button, pr.key);
  }
  // the handle under our menu: a pinch that starts at it carries the menu; where it is let go is where it stays (and how far and how high
  // it keeps to us from then on: follow.js place)
  let handle = 'idle';
  const hd = { x: head[0], y: head[1], th: head[2], py: head[3] + space.floorY };
  for (const h of handsXR) {
    const d = M.menus.handleDist(follower.pose, list[0].h, h.at), was = handPinch.get(h.id) || false;
    handPinch.set(h.id, h.pinch);
    if (d < 0.06) { handle = 'near'; busyKeys.add('own:main'); }
    if (!drag && h.pinch && !was && d < 0.05) { const P = follower.pose; drag = { id: h.id, off: [P.x - h.at[0], P.h - h.at[1], P.y + h.at[2]] }; }
  }
  if (drag) {
    const h = handsXR.find((q) => q.id === drag.id);
    if (!h || !h.pinch) drag = null;
    else { follower.place(h.at[0] + drag.off[0], -h.at[2] + drag.off[2], h.at[1] + drag.off[1], hd); handle = 'held'; busyKeys.add('own:main'); }
  }
  if (xr) follower.update(hd, dt, busyKeys.has('own:main'));
  list[0].pose = follower.pose;
  menus.send(now, [{ id: 'main', pose: follower.pose }].concat(wristPose ? [{ id: 'wrist', pose: wristPose }] : []), ownInfo);
  const redraw = now - redrawAt > 100;
  if (redraw) redrawAt = now;
  for (const pn of list) {
    let q = panelsAll.get(pn.key);
    if (!q) { q = { panel: new Panel(pn.w, pn.lay, { handle: pn.key === 'own:main' }) }; panelsAll.set(pn.key, q); scene.add(q.panel.mesh); }
    q.panel.setWidth(pn.w);
    if (pn.key === 'own:main') q.panel.handleLook(handle);
    Object.assign(q, { owner: pn.owner, id: pn.id, lay: pn.lay, pose: pn.pose });
    q.panel.pose(pn.pose);
    if (redraw || pressedLook.key === pn.key) {
      const sayNote = pn.owner === null && now - sayT < 3000 ? $('say').textContent : undefined;
      q.panel.draw(pn.lay, { hover: hover && hover.key === pn.key ? hover.button : null, pressed: pressedLook.key === pn.key && now - pressedLook.t < 250 ? pressedLook.id : null,
        edge: pn.owner === null ? null : PLAYER_COLOURS[pn.owner % PLAYER_COLOURS.length], note: sayNote || (pn.id === 'wrist' ? (pn.owner === null ? lineup.note() : (oiNote(pn.owner) || `player ${pn.owner + 1}`)) : (pn.owner === null ? '' : `player ${pn.owner + 1}`)) });
    }
  }
  for (const [key, q] of [...panelsAll]) if (!want.has(key)) { q.panel.dispose(); panelsAll.delete(key); }
  // the others, the line-up marks, the cube
  players.update(presence.others(now).map((o) => ({ slot: o.slot, head: o.head, sources: o.sources })), dt);
  players.marks(lineup.marks());
  world.position.y = space.floorY;
  setCube(cubeMesh, cube.drawn(), C.COLOURS[(S.game('colour') || 0) % C.COLOURS.length], S.connected ? ownerOf(S.holder('cube'), S.me, PLAYER_COLOURS) : null);
  if (!xr) controls.update();
  renderer.render(scene, camera);
  if (now - statusAt > 300) status(now);
}
let statusAt = 0;
function status(now) {
  statusAt = now;
  const holder = S.holder('cube');
  $('status').textContent = [
    `${S.connected ? `player ${S.me + 1} of ${S.others + 1}` : 'alone'}${S.viewers ? `, ${S.viewers} watching` : ''}   ${lineup.note()}   cube: ${body.mine ? 'simulated here' : (ownerOf(holder, S.me, PLAYER_COLOURS) || { text: 'nobody' }).text}${cube.held ? ', held' : ''}   round trip ${link.rtt ?? '-'} ms`,
    xr ? `xr: ${xr.features.join(', ')}; shared space: ${xr.shared.state}${xr.shared.uuid ? ` (${xr.shared.uuid})` : ''}; anchor: ${keeper && keeper.anchor ? (keeper.lost ? 'lost' : 'tracked') : 'none'}` : 'desktop: left button = a fingertip on the floor (with Shift: a pinch, it picks the cube up), right button turns the view, click a menu to press it',
    ...life.lines().slice(-3),
  ].join('\n');
}
function resize() {
  if (xr) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
renderer.setAnimationLoop(onFrame);
// a page of another build reloads itself (outside mixed reality): a headset never runs an old page by accident
setInterval(async () => { if (xr) return; try { const i = await (await fetch('/info')).json(); if (i.build && info.build && i.build !== info.build) location.reload(); } catch (e) { /* the server is away */ } }, 3000);
window.__cube = { S, link, lineup, cube, body, presence, menus, space, life, panels: panelsAll, camera, controls, frame: () => onFrame(performance.now(), null), press: pressed, poke: (x, y) => { mouse = x === undefined ? null : { x, y }; } };
