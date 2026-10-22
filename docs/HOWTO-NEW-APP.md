# Making a new MUMR app

The smallest working app is [`examples/counter`](../examples/counter) (no XR). Read [ARCHITECTURE.md](ARCHITECTURE.md) first.

## 1. A folder and the server

```
myapp/
  mumr.json        {"title": "My app", "index": "index.html", "bodies": ["ball"], "owned": {"16": "ball"}}
  index.html       loads /mumr/*.js, then the app's scripts
  app.js
```

```bash
py -3 path/to/mumr/server/serve.py path/to/myapp
```

It prints the address for the headsets (`https://<PC>:8443/`), writes `mumr-server.log` in the app's folder, and serves the engine at
`/mumr/`. For plain http on the PC only (rehearsals): `... 8766 --http --no-browser`. An app that needs its own routes writes a start
script that calls `serve.run(app, routes={"GET /x.json": fn})`.

## 2. The document: settings, buttons, kinds

```js
const S = new MUMR.session.Session(link, {
  game: { speed: 1 },                    // one set for everyone
  player: { hue: 'red' },                // each player's own (what their menu shows)
  actions: ['exit'],                     // buttons that happen at the menu owner's headset ('action' event)
  press: (id, st) => ...,                // what a settings button does: the state after it
  init: (doc) => { doc.marks = new Map(); },
  kinds: {
    'mark+': { keep: (e) => ({ key: `mark:${e.id}` }), apply: (S, e, from) => { S.doc.marks.set(e.id, e); S.notify('marks'); } },
    'mark-': { keep: (e) => ({ key: `mark:${e.id}`, drop: true }), apply: (S, e) => { S.doc.marks.delete(e.id); S.notify('marks'); } },
  },
});
S.on('first', () => { /* the first one here: publish this page's own world (S.emit(...) for each mark) */ });
S.on('synced', () => { /* the server's world was taken: redraw everything */ });
```

- An event with a key says **all** of the thing. To change a mark, send the whole mark again with the same key.
- A thing that belongs to one page (a camera, a note): `keep: (e) => ({ key, own: true, gone: { k: 'thing-', id } })`; others use
  `S.request(key, m)` and the owner hears `S.on('ask', ...)`.
- A thing that belongs to one player and must go with them: `scope: 'slot'`.
- A button on someone else's menu: `S.press(owner, id)`. It acts for the owner.

## 3. Things that move: register a packet, make a Body

```js
MUMR.wire.register({ type: 16, name: 'ball', token: 'ball', pack: (o) => bytes, unpack: (dataView) => o, blend: (a, b, f) => ... });
const ball = new MUMR.body.Body(S, { token: 'ball', type: 'ball', adapter: {
  reach: (hands) => ..., touching: (hands) => ..., pack: () => stateInCommonFrame, apply: (data, info) => ...,
  settle: (mine) => ..., do: (what, args, from) => ..., moving: () => ... } });
// every frame:
const hands = presence.hands(ownHands, now);   // everybody's hands, in this page's coordinates
ball.frame(now, ownHands); simulate(hands); ball.send(now); presence.send(now, head, ownHands);
link.onBin = (b) => { const p = MUMR.wire.decode(b); if (p.name === 'presence') presence.receive(p, now); else ball.receive(p, now); };
```

- Every page simulates every body with **everybody's** hands, including what is derived from them (Nudgy's palm platform: the other
  player's hand had none, so a loco dropped on it fell through).
- Requests from a page that does not hold the body: `ball.ask('place', { x, y })` in the common frame.
- Packet types 1-255; 2 and 4 are the engine's.

## 3b. Menus, lining up, XR

`examples/cube/app.js` is the worked example. The pieces:

- `new MUMR.lineup.LineUp(session, space, { store: localStorage, say, life })`; add `MUMR.lineup.ACTIONS` to the session's `actions`
  and call `lineup.press(id)` from the `action` listener; when mixed reality starts, `lineup.restart()` and
  `lineup.setKeeper(new MUMR.anchor.Keeper(xr.anchorIO('myapp.anchor')))`, and `keeper.update()` every XR frame.
- `enterXR({ renderer, life, onReset: (F) => keeper.reset(F), onEnd })` (`/mumr/xr/session.js`), then every frame
  `xr.frame = frame` and `readInput(xr, frame, space, pinch)` (`/mumr/xr/input.js`) for the sources and the fingertips.
- A menu is a layout function of **its owner's state and info**: `layout(session.stateOf(slot), info)`. This page sends its own panel
  poses and info with `menus.send(now, panels, Object.assign(lineup.info(), ...))`; the others' come from `menus.others(now)`.
  Test the fingertips against all of them with one `Poke`, and press with `session.press(owner, id)`.
- Draw with `makePanels(THREE, renderer)`, `createPlayers({ THREE, world, scene, GhostHand })`, `makeGhost(THREE)`.
- On the desktop, a pretend line-up `lineup.given({ x, y, yaw })` lets two tabs share a world.

## 4. Coordinates

Make one `new MUMR.align.Space(frame, floorY)` per page and update it when the line-up or the floor changes. Use it for everything that is
sent or received. Never write the conversion again by hand (NOTES 2.5 says why).

## 5. The PC can see it

A PC page: `MUMR.worldfeed.WorldFeed.connect(url, { build, session: sameOptionsAsThePlayers })`; `feed.doc` is the document,
`feed.sample('ball', null, feed.serverNow() - delay)` a stream. **The drawing of a shared thing lives in one module that the headset page
and the PC page both use** (Nudgy drew boxes, rugs and balls differently on the PC, and nobody noticed for days).

## 6. Logging

```js
const life = MUMR.life.make({ name: 'Quest 3' });
life('entered mixed reality');  // goes to mumr-server.log at once, also while the page is hidden
link.onNote = (n) => life(`link: ${n}`);
```

Write a life line for everything that happens to the page itself (visibility, XR session start and end, tracking resets, anchors, the
link). Check that `mumr-server.log` grows **before** anyone puts a headset on.

## 7. Testing

1. Logic in plain scripts (no THREE, no DOM), tested in Node with two pretend headsets: `test/hubfake.js` (`hub.link('A')`,
   `hub.flush()`). See `test/session.test.js` and `test/body.test.js`.
2. Two browser tabs on the PC (`--http`), each with a pretend line-up.
3. Two headsets, with the server (and its log) started first. Before reporting a two-headset fault, check in the log that both headsets
   fetched the page after the last change.

```bash
node --test
```
