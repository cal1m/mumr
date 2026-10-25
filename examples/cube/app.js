// The MUMR cube: one cube that every player can push, pick up (pinch or fist), put on a flat hand and point at, a menu that every player
// can press, other players' hands and heads, lining up on printed crosses, the hand wall. The headset page, and also the PC rehearsal:
// the same page in a desktop browser with a pretend line-up (?frame=x,y,deg) and the mouse as a fingertip (left button on the floor;
// right button turns the view).
//   py -3 engine/server/serve.py examples/cube                    headsets: https://<PC>:8443/
//   py -3 engine/server/serve.py examples/cube 8766 --http        two tabs: /?name=A&frame=0,0,0 and /?name=B&frame=1,0.5,40
// Everything that is not the cube (the scene, the menus, the wrist menu, lining up, the hands, the desktop rehearsal) is /mumr/xr/app.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createApp, PLAYER_COLOURS } from '/mumr/xr/app.js';
import { createPointers } from '/mumr/xr/pointer3d.js';
import { makeCube, setCube, ownerOf } from './draw.js';

const M = window.MUMR, C = window.CUBE, cube = new C.Cube(), cubeMesh = makeCube(THREE, C.SIZE);
const owner = (S) => (S.connected ? ownerOf(S.holder('cube'), S.me, PLAYER_COLOURS) : null);
let pointers = null, pointing = [];

// The pointing demo: every pointing hand in the world (this player's and the others', from their joints: nothing is sent for it) gets a
// ray to what it points at, the cube or a part of the room, with a sign saying what that is; the cube's edges turn yellow while
// somebody points at it.
function pointingNow(app) {
  const d = cube.drawn(), box = { id: 'cube', label: 'cube', x: d.x, y: d.y, z: d.z, half: C.HALF, yaw: d.yaw }, room = app.room.local();
  return app.gestures.filter((g) => g.point).map((g) => {
    const hit = M.grab.pointAt(g.point, [box], room, 8), src = app.everyone.find((s) => s.id === g.id), slot = src && src.slot !== undefined ? src.slot : app.S.me;
    const at = hit ? hit.at : g.point.from.map((v, i) => v + g.point.dir[i] * 3);
    return { id: g.id, from: g.point.from, at, what: hit ? (hit.what === 'thing' ? hit.label : hit.label || hit.what) : '', colour: slot === null ? 0xf2c14e : PLAYER_COLOURS[slot % PLAYER_COLOURS.length], cube: !!hit && hit.id === 'cube' };
  });
}

const app = await createApp({
  THREE, OrbitControls, anchorKey: 'mumr.cube.anchor',
  session: { game: C.GAME, player: C.PLAYER, actions: C.ACTIONS, press: C.press },
  menu: C.menu,
  feet: 'off',                  // (the engine's feet: off here)
  handWall: true,               // (the hand window on the room's longest wall, with what the engine makes of every hand)
  // the room model (from the menu): the cube can be moved in it (the viewer is the engine's); a hand in it may be shown full size
  roomModel: {
    open: (st) => !!st.model, handIrl: (st) => !!st.handIrl,
    things: () => {
      const d = cube.drawn();
      // moved in the model, the cube is held by the hand there: this page takes it and it follows (here and in every model), and
      // falls where it is let go
      return [{ id: 'cube', label: 'cube', kind: 'box', at: [d.x, d.y, d.z], yaw: d.yaw, size: [C.SIZE], colour: C.COLOURS[(app.S.game('colour') || 0) % C.COLOURS.length],
        drag: (phase, at) => { cube.steer = phase === 'drop' ? null : at; } }];
    },
  },
  bodies: ({ space }) => [{ token: 'cube', type: 'cube', adapter: C.adapter(cube, space) }],
  setup: ({ world }) => { world.add(cubeMesh, cubeMesh.userData.holder); pointers = createPointers({ THREE, parent: world }); },
  step: (dt, t, hands) => { cube.room = app.room.local(); cube.cfg.kick = app.feet === 'kick'; cube.step(dt, t, hands); },
  // the ghost fingers: green while the hand pinches, orange while it makes a fist (the engine's grips: what can take the cube)
  ghostColour: 'grips',
  // the cube's one action: put it half a metre in front of the menu's owner
  onAction: (id, from) => {
    if (id !== 'cubeHere') return;
    const { S, space } = app, h = app.head(), x = h[0] + Math.cos(h[2]) * 0.5, y = h[1] + Math.sin(h[2]) * 0.5, c = space.ok ? space.toCommon([x, y]) : [x, y];
    app.bodies[0].ask('place', { x: c[0], y: c[1] });
    app.say(from === S.me || from === null ? 'The cube is in front of you' : `Player ${from + 1} put the cube in front of you`);
  },
  draw: ({ S }) => {
    pointing = pointingNow(app);
    pointers.update(pointing.map((p) => ({ from: p.from, at: p.at, label: p.what, colour: p.colour })));
    setCube(cubeMesh, Object.assign(cube.drawn(), { pointed: pointing.some((p) => p.cube) }), C.COLOURS[(S.game('colour') || 0) % C.COLOURS.length], owner(S));
  },
  status: () => `cube: ${app.bodies[0].mine ? 'simulated here' : (owner(app.S) || { text: 'nobody' }).text}${cube.held ? `, held (${cube.held.kind})` : cube.steer ? ', held in the room model' : ''}${cube.onHand ? ', on a hand' : ''}`
    + `${pointing.length ? `   pointing at: ${pointing.map((p) => p.what || 'nothing').join(', ')}` : ''}`,
});
window.__cube = Object.assign(app, { cube, body: app.bodies[0], pointing: () => pointing });
