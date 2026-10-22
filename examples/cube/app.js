// The MUMR cube: one cube that every player can push and pick up with bare hands, a menu that every player can press, other players'
// hands and heads, lining up on printed crosses. The headset page, and also the PC rehearsal: the same page in a desktop browser with
// a pretend line-up (?frame=x,y,deg) and the mouse as a fingertip (left button on the floor; right button turns the view).
//   py -3 server/serve.py examples/cube                    headsets: https://<PC>:8443/
//   py -3 server/serve.py examples/cube 8766 --http        two tabs: /?name=A&frame=0,0,0 and /?name=B&frame=1,0.5,40
// Everything that is not the cube (the scene, the menus, the wrist menu, lining up, the desktop rehearsal) is /mumr/xr/app.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createApp, GHOST_COLOURS, PLAYER_COLOURS } from '/mumr/xr/app.js';
import { makeCube, setCube, ownerOf } from './draw.js';

const C = window.CUBE, cube = new C.Cube(), cubeMesh = makeCube(THREE, C.SIZE);
const owner = (S) => (S.connected ? ownerOf(S.holder('cube'), S.me, PLAYER_COLOURS) : null);

const app = await createApp({
  THREE, OrbitControls, anchorKey: 'mumr.cube.anchor',
  session: { game: C.GAME, player: C.PLAYER, actions: C.ACTIONS, press: C.press },
  menu: C.menu,
  bodies: ({ space }) => [{ token: 'cube', type: 'cube', adapter: C.adapter(cube, space) }],
  setup: ({ world }) => world.add(cubeMesh, cubeMesh.userData.holder),
  step: (dt, t, hands) => { cube.room = app.room.local(); cube.step(dt, t, hands); },
  // the ghost fingers: holding the cube, touching it, or neither
  ghostColour: (id, own) => (cube.held && cube.held.by === id ? GHOST_COLOURS.hold : cube.nearest(own.filter((s) => s.id === id)) < 0.01 ? GHOST_COLOURS.touch : GHOST_COLOURS.idle),
  // the cube's one action: put it half a metre in front of the menu's owner
  onAction: (id, from) => {
    if (id !== 'cubeHere') return;
    const { S, space } = app, h = app.head(), x = h[0] + Math.cos(h[2]) * 0.5, y = h[1] + Math.sin(h[2]) * 0.5, c = space.ok ? space.toCommon([x, y]) : [x, y];
    app.bodies[0].ask('place', { x: c[0], y: c[1] });
    app.say(from === S.me || from === null ? 'The cube is in front of you' : `Player ${from + 1} put the cube in front of you`);
  },
  draw: ({ S }) => setCube(cubeMesh, cube.drawn(), C.COLOURS[(S.game('colour') || 0) % C.COLOURS.length], owner(S)),
  status: () => `cube: ${app.bodies[0].mine ? 'simulated here' : (owner(app.S) || { text: 'nobody' }).text}${cube.held ? ', held' : ''}`,
});
window.__cube = Object.assign(app, { cube, body: app.bodies[0] });
