# MUMR: extraction plan (refreshed 2026-10-22)

**For the session that continues the extraction.** Read [NOTES.md](NOTES.md) first (what the Nudgy chats decided and what was
streamlined), then [ARCHITECTURE.md](ARCHITECTURE.md). The first plan was written inside Nudgy on 2026-10-15
(`KTE/Project2/docs/superpowers/plans/2026-10-15-mr-multiplayer-extraction.md`); this file replaces it.

**Why:** Marek wants more multi-user mixed-reality projects without rebuilding Nudgy's each time: "a virtual physical world where it is
easy to make these types of experiences, where all virtual objects behave as if they were physical" (2026-10-16). The realistic scope
named then, and kept here: **2-4 co-located players, tens of rigid objects, authority by touch, a PC on the LAN, a browser and no
install on the headsets.**

## 1. What changed since the 2026-10-15 plan

| 2026-10-15 plan | Now | Why |
|---|---|---|
| Make Nudgy's files generic **in place** (phase 1), then move them | The engine is written **fresh in its own repo** from Nudgy's files; Nudgy is untouched until a migration phase | Nudgy works and was tested on two headsets; Marek cannot test now. A fresh copy let the API be cleaned (self-describing events, owned things, one packet header) without breaking it. Migration is one deliberate step (phase 6). |
| Name `mrmp` (to be chosen) | **MUMR** (Marek's name for it), repo `machmar/mumr`, private | |
| Hub keeps Nudgy's kinds; `Hub(build, bodies, owned)` | The hub keeps **any** app's document: events carry `key/drop/clear/scope/own` | NOTES 2.1 |
| Cameras were not in the map (built later, 10-15) | **Owned things** are a general feature (`own`, `gone`, `ask`) | NOTES 2.2 |
| The PC feed (viewer role, compacted document, clocks) was a separate plan | It is part of the engine (`WorldFeed`, viewer role); the unused `feed` role is dropped | Built and proven in Nudgy 10-15 |
| Players sync from the `sim` holder | Players get the document from the hub (like viewers); a body's full state comes from its holder (`keyframe`) | NOTES 2.15; the document now outlives everyone leaving (Marek's room rule of 10-21) |
| `Body` with the touch policy | Policies `touch` and `owner` built; `host` planned | Lumber Tycoon discussion, 10-16 |
| Example: one cube | First example is a **counter** (no XR, two tabs); the cube follows with XR | A page that loads the engine from `/mumr/` had to be proven first |
| Not planned | Always-on server log and page life log are engine features | Debugging lessons of 10-21/22 |

## 2. Status

| Phase | What | State |
|---|---|---|
| 0 | Repo, notes, refreshed plan | **done** 2026-10-22 |
| 1 | Core without THREE: server (`ws`, `hub`, `serverlog`, `serve`), client (`util`, `link`, `align`, `wire`, `session`, `presence`, `body`, `worldfeed`, `life`), tests, `examples/counter` | **done** 2026-10-22: 58 Node tests, 39 Python tests, the counter checked in two browser tabs. Not on a headset. |
| 2 | Everyone's menus (no THREE): panel poses through `Space`, the `M` stream, the other player's menu drawn from that player's state and mode, a press on anyone's menu | **built** 2026-10-22: `menus.js` (`grid`, `hit`, `axes`, `Poke`, `Menus`), `follow.js`; tested; checked in two tabs (B pressed A's buttons, A's line-up mode showed on B). Not on a headset. |
| 3 | XR glue (ES modules with THREE, `xr/`): session start, hand sources from the 25 joints, pinch rule, line-up UI on `Aligner`, persistent anchor + reset handling (`anchor.js`, from Nudgy's 2026-10-22 fix), ghost hands of others, depth-only hand mask, build-stamp self-reload | **built** 2026-10-22 except the depth-only hand mask (ghost fingers are drawn over the menus instead): `hands.js`, `anchor.js` (Keeper), `lineup.js` (LineUp) with tests (one replays the 10-22 put-on), `xr/session.js` (also asks for the `shared` space and logs the answer), `xr/input.js`, `xr/ghost.js`, `xr/players3d.js`, `xr/panel3d.js`. The XR modules only ran as far as loading in a desktop browser. |
| 4 | `examples/cube`: floor, one cube (a Body), a counter on a menu, both players' hands; PC rehearsal with two tabs, then one headset run | **done** 2026-10-22 (rehearsed in two tabs + the PC view: push, token handover, presses across menus, lining up with the mouse); first run on one Quest Pro (2026-10-22) found five faults, all fixed the same day; **the two-headset run the same evening worked** ("it seems to have worked well"); two faults from its log fixed (NOTES 27, 28). The app is 235 lines and `cube.js` 155: over the 150-line target, mostly the desktop rehearsal and the menus' wiring, which a helper could take (NOTES 2.20). |
| 4c | Coming back after a Wi-Fi drop (first headset run: a 4 s stall made the headset a new player) | **done** 2026-10-22: the hub keeps a dropped player's place for 10 s, the link rejoins with its key, `bye` for a deliberate close; tested in Node, Python and against the real server; not yet seen on a headset |
| **6** | **Host role (NEXT):** a Node client on the PC that holds bodies at rest and runs rules that need no hand (policy `host`); a touch hands the token to that headset at once, letting go hands it back. Also keeps the cube where it was left when every headset leaves | not started |
| 6b | A small `xr/app.js` helper for what every app wires again (frame-loop order, a Panel per menu in step with `menus.others()`, easing the others' panels, the handle, the desktop rehearsal), so the cube app shrinks to about 100 lines (NOTES 20) | not started; after the host, so that it wires the host in too |
| 4b | The line-up menu's other two rows, as in Nudgy (Marek, 2026-10-22: "should still be present"): **Room** (the room scan from plane/mesh detection as one document thing; the first headset in supplies it, it changes hands only by the button, the server keeps the last one) and **Camera** (real webcams as owned things from a webcam page, three knobs in front of each and Reset). Both wait for the thing they control: the room scan, then the webcam page | not started; a later stage (Marek agreed) |
| 5 | Many bodies: an entity-list packet with a per-entry token check on the hub; sleeping bodies (kept on the hub, not sent); contact islands (one token for a touching group) | not started (tokens by name are already done); **waits for Marek's three experiments** (pile, drift, island: NOTES 4.2), which he will run later |
| 7 | Nudgy on MUMR (see 4.) | **not now** (Marek, 2026-10-22) |
| 8 | Direct lane between headsets (WebRTC data channel behind `link`, server lane as fallback) | not needed so far (Nudgy probe 10-15: same median, no long silences) |
| - | Automatic line-up from the `shared` reference space | not usable yet: granted on both headsets (his flag is on) but never got a UUID, even with two headsets in the room (2026-10-22); the touched spots stay |

Rows are in the order they will be done. Open from the runs and only measured, not fixed: the PC view felt about 300 ms late in the
second run; its log line now says how late each stream arrives by its stamps, to be read after the next run.

## 3. Phases 2 to 6 in more detail

**2. Menus.** Nudgy's `menus.js` (`panelOut/In`, `wristOut/In`) becomes `Space.poseToCommon` plus a small `Menus` class: this page's
panel poses out at 10/s as `M` (JSON, now with a clock), the others' in, a `known(id)` filter given by the app. The panel drawing stays
the app's; the rule from Nudgy that the other player's menu is drawn **from that player's state and mode** (Nudgy M4) goes in the HOWTO
and in the class (the `M` packet carries the mode). Presses are already routed by `Session.press`.

**3. XR glue.** What every MR app repeats, taken from `app.js` (about 2700 lines, of which roughly 600 were multiplayer glue and 150 the
anchor dance). Put the decisions in plain modules (testable) and the WebXR/THREE calls in thin ES modules:
- `anchor.js` (plain): `Resets` (in `align.js` already) plus the re-find state machine: settle 2 s without a reset and visible, ask for
  the persistent anchor again, believe it once its pose has been the same for 0.7 s, give up after 9 s; save/load of the line-up against
  the anchor's handle. Inputs injected (`restore(uuid)`, `pose(anchor)`), so Node tests can play the 2026-10-22 recordings.
- `hands.js` (plain): sources from the 25 joints, the pinch rule (select event, or index and thumb tips < 22 mm), the palm platform.
- `xr/session.js`, `xr/hands3d.js`, `xr/lineup3d.js`, `xr/players3d.js`, `xr/handmask.js` (THREE).
- Interaction rule to keep: **physical and literal** (a fingertip through a button, a hand in a node, no gesture guessing).

**4. Cube.** If the app is under about 150 lines, the API is right; if not, what is missing is the finding. Before investing in phase 5,
the three cheap experiments proposed on 2026-10-16 could run on it (NOTES 4.2): 20-30 cubes in a pile (Quest frame time, handover
jitter), 10 minutes of both players touching one marker (drift), one player pushes a stack while the other takes its top (islands).

**5. Many bodies.** A packet `E` = list of `(id u16, token holder implied by the hub's table, state)`. The hub checks each entry against
its token and drops the ones the sender does not hold (today it checks whole packets by type). Only moving entries are sent; the hub keeps
the newest per id for newcomers. Objects resting on a carrier become its children in the document (no physics of their own).

**6. Host.** `node client/host.js app/rules.js` connects as a player with role `host` (a new role: not counted, no presence, holds bodies
at rest). The rules are a plain script that also runs in the page when nobody hosts (the alone rule). Needed for joystick games and for
"nothing is lost when every headset leaves" with bodies (the document already survives).

## 4. Nudgy on MUMR (phase 7, when Marek says so)

What changes in Nudgy, so the size of it is known:

| Nudgy | Becomes |
|---|---|
| `mr/link.js`, `mr/align.js`, `mr/ws.py` | MUMR's (same behaviour; `Space` replaces the conversions in `holoshare.js`, `menus.js`, `cams.js`, `capture.js`) |
| `mr/wire.js` | MUMR's registry; Nudgy registers `S` (1) and `H` (3). `P` and `S` are byte-identical (their clock already sits in bytes 2-5); `H` and `M` gain the 4-byte clock |
| `mr/session.js` | MUMR's `Session` with Nudgy's kinds: `mark+`/`mark-`/`mark~` (send the whole mark again for `~`: an event with a key says all of it), `room`, `net`, `cam+`/`cam-` (owned), `game`/`player` (field `key` -> `name`) |
| `mr/hub.py` | MUMR's hub with `bodies: ["sim", "holo"]`, `owned: {1: "sim", 3: "holo"}`; `_keep`, `_forget`, the camera code and `cam>` go (owned things, `ask`) |
| `mr/share.js`, `mr/holoshare.js`, `mr/replica.js` | two `Body` adapters (the loco with the balls, the viewer); `Replica`'s smoothing stays Nudgy's (or becomes a helper) |
| `mr/worldfeed.js` | MUMR's `WorldFeed` with Nudgy's kinds and types; `view.js` reads `sample('loco')` etc. as before |
| `serve_https.py` | a start script that calls `serve.run(app, routes={...})` with `/relay/*`, `/networks.json`, `/probe/log` |
| `app.js` | the "players" sections shrink to wiring; after phase 3, the anchor dance and hand sources go too |

Check after the move: all of Nudgy's tests (497 Node, 72 Python on 2026-10-22) that are not now MUMR's, two tabs, then one two-headset
session with the server log running first (loco, balls, marks, room, settings, menus, viewer, cameras, take-off/put-on).

## 5. Definition of done (for the extraction as a whole)

- The engine works on its own: its tests pass without Nudgy's files. **(done for phase 1)**
- `examples/cube` runs with two tabs and once on two headsets.
- Nudgy runs on MUMR with its tests green and one two-headset session as before, **or** Marek decided it stays as it is.
- ARCHITECTURE.md and HOWTO-NEW-APP.md are current, and Nudgy's `CLAUDE.md` points at them.
