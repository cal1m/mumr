# The MUMR cube

One 12 cm cube on the floor that every player can push with bare hands and pick up (a thumb and another fingertip touching it from
opposite sides), a menu that every player can press, everybody's hands and heads, lining up on the printed crosses, and a PC view.
Built on 2026-10-22 and rehearsed in browser tabs on the PC. **It has not run on a headset yet.**

## On two headsets

```bash
py -3 server/serve.py examples/cube
```

1. Start the server first and check that `examples/cube/mumr-server.log` is being written (it is from the first line).
2. On each headset open the `https://` address the server prints, accept the certificate once, press **Enter mixed reality**.
3. Press **Line up** on the menu, rest an index fingertip on cross 1 and then cross 2 (10 s each), Create on spot 3 and rest on cross
   3 to check. Press **Done**. Do the same on the other headset (or press its Line up for it: every button works from every menu).
4. Push the cube, pick it up, drop it on the floor or into the other player's hand. Press buttons on the other player's menu.
5. On the PC, open `view.html` (the link on the page) to watch.
6. Take a headset off and put it back on without leaving mixed reality: the line-up should come back from the anchor within a few
   seconds (the log says `anchor found again` and `line-up put back`).

The log also says whether the browser offered the `shared` reference space (`xr: shared space ...`). It is behind the Quest Browser flag
"WebXR experiments" (`chrome://flags`); add `?shared=1` to the address only to say it in the log, the line-up does not use it.

## On the PC (rehearsal)

```bash
py -3 server/serve.py examples/cube 8766 --http --no-browser
```

Two tabs: `http://localhost:8766/?name=A&frame=0,0,0` and `http://localhost:8766/?name=B&frame=1,0.5,40` (a pretend line-up: where
the common frame lies in that tab's own floor plan, in metres and degrees). Left button on the floor = a fingertip (it pushes the cube,
and rests on a spot while lining up), right button turns the view, a click on a menu presses it (also on the other tab's menu). A tab in
the background gets no animation frames: `__cube.frame()` steps it by hand.

## Files

| File | What |
|---|---|
| `cube.js` | the cube's physics, its Body adapter and packet (16), the menu layout and buttons; no THREE, tested in `test/cube.test.js` |
| `draw.js` | how the cube looks, for both pages |
| `app.js`, `index.html` | the headset page (also the desktop rehearsal) |
| `view.js`, `view.html` | the PC view (a WorldFeed watcher) |
| `mumr.json` | the server's settings: the token `cube` always has a holder, packet 16 belongs to it |
