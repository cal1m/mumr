# Plan: a repo structure that makes a new MUMR app easy

Status: proposed, 2026-10-25. Nothing in it is built.

## Why

Kastle2 (bastl-instruments) keeps one shared base and puts every app in `code/src/apps/<Name>/`. An app is a small class. A `Template` app
and `create-app.sh` make a new one in a minute and register it in the build. MUMR already has the shared base (`client/`, `server/`) and
an app is already a folder (`mumr.json`, `index.html`, `app.js`). What is missing is the surrounding scaffolding:

- A new app is made by reading `docs/HOWTO-NEW-APP.md` and copying the cube's `index.html` and `app.js` by hand.
- `examples/` mixes a non-XR demo (counter, raw `Session`) with the full cube (`createApp`). There is no single starting point.
- The run command is `py -3 server/serve.py <folder> [port] [--http]`.
- The engine and the apps sit side by side with no line between them.

## Decisions

- There is **one kind of app**: a `createApp` app. No flavors. The viewer page and the host process are opt-in parts of it.
- The counter is folded into the template: its minimum (a shared game setting, a player setting, an owned note) becomes what `apps/_template`
  runs, on `createApp`. The counter folder goes away.
- Engine code moves under `engine/`. This is Claude's call; the cost is path churn, and it is one commit.
- Tools are Node scripts (Windows, Node already required). No build step is added.

## Target layout

```
engine/
  client/  server/  test/            moved as they are
apps/
  _template/   mumr.json  index.html  app.js  app.test.js  README.md   (runs as it is)
  cube/        the full example (cube.js, draw.js, host.js, view.html, view.js, ...)
tools/
  new-app.js                         scaffolder
  run.js                             run any app by name, list apps
docs/        ARCHITECTURE.md, HOWTO-NEW-APP.md (short), NOTES.md, PLAN.md, ...
APPS.md                              one line per app
```

## Steps

Each step ends with `node --test` and the Python tests green, and is its own commit.

1. **Move the engine.** `git mv client engine/client`, `server` and `test` likewise. Update:
   - `server/serve.py`: `CLIENT` path (line 47), the docstring, the host command `node client/host.js`.
   - every `require('../client/index.js')` and `require('../examples/cube/...')` in `test/*.test.js`.
   - `client/host.js`, `host.test.js` (it rewrites a `require('../../client/index.js')` path in a copy of the cube).
   - `package.json` scripts, `.claude/launch.json`, `README.md`, `docs/*`.
   `git mv` keeps history. The server must serve the same URLs (`/mumr/...`), so no page changes.
2. **Rename `examples/` to `apps/`.** Fix the same references.
3. **Write `apps/_template`.** `index.html` is a few lines (the shell is step 4). `app.js` calls `createApp` with the counter's settings
   (`game.count`, `player.hue`, an owned note) and one button on the app's menu. `app.test.js` tests the app's plain logic with
   `test/hubfake.js`. `README.md` says what to change and where.
4. **A page shell in `createApp`.** It creates `#view`, `#enter`, `#xrNote`, `#say`, `#status` if the page lacks them, so the template's
   `index.html` is a script tag and a title. The cube keeps its own page and still works. Risk: touches `engine/client/xr/app.js`, so it
   gets its own test and a check in two tabs.
5. **`tools/new-app.js`.** `node tools/new-app.js MyApp` checks the name, copies `_template`, fills in the title, `anchorKey`, and the next
   free packet type from `mumr.json` files, and appends a line to `APPS.md`. It refuses an existing name.
6. **`tools/run.js`.** `node tools/run.js cube [port] [--http]` finds `apps/cube` and starts `serve.py`; with no argument it lists the apps.
   `package.json` gets `run`, `new-app`; the `counter` script goes.
7. **Test discovery.** Make `node --test` pick up `apps/*/*.test.js` as well as `engine/test`. Check the Node version supports the glob;
   if not, `run.js test` collects the files.
8. **Docs.** `HOWTO-NEW-APP.md` is rewritten as "run `new-app`, then fill in these three things" and keeps the reference sections
   (document, bodies, coordinates, logging, testing) below. `ARCHITECTURE.md` paths and `README.md` are updated. `APPS.md` is created.
9. **Delete `apps/counter`** after the template covers it, and note it in `docs/NOTES.md`.

## Done when

- `node tools/new-app.js Foo`, then `node tools/run.js foo --http --no-browser`, opens a working app in two tabs, with a passing test, and
  no hand-copying.
- `node --test` and the Python tests pass; the cube behaves as before (page, view, host).
- No file mentions `examples/counter`, `examples/cube` or the old `client/` and `server/` paths.

## Not covered (needs a headset, so Marek checks)

- The cube in two headsets after the move: serving paths and the build stamp are the risk, not the game logic.
- The step 4 shell inside a headset browser.

## Settled by Marek (2026-10-25)

- The engine goes under `engine/`.
- `new-app` creates the PC viewer page (`view.html`, `view.js`) only with a flag (`--viewer`).

## Progress

- Step 1 done: `client/`, `server/`, `test/` are under `engine/`; `node --test` (102) and the Python tests (48) pass.
