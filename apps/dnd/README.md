# DnD in mixed reality (the app)

The game of [documents/design_and_implementations.md](../../documents/design_and_implementations.md), built on MUMR. Started
2026-10-23. Not an example: `examples/dnd` (phase 1) stays as it was; this is where the game grows.

**State:** the game runs end to end **without XR**: players on phones, laptops or the headset's browser (2D page), a game master's page
on the PC, the narrator through the PC's speaker. Three scenarios. 11 tests (`test/dnd.test.js`), and a simulator that plays every
scenario with pretend players. The 3D part (Vhorr standing in the room, hands, the line-up) is the next phase; nothing here has run on
a headset.

## Run it

```bash
py -3 server/serve.py apps/dnd
```

The server prints an `https://<PC>:8443/` address. On each player's device open it (accept the certificate once) and make a hero. On the
PC open `https://localhost:8443/gm.html`: the game master's page. Pick a scenario and press **Start**. The host (the game master's
brain, `host.js`) is started by the server; it needs Node.js on the PC.

Only one PC, no phones (rehearsal): `py -3 server/serve.py apps/dnd 8766 --http --no-browser`, then `http://localhost:8766/` in
a tab or two and `http://localhost:8766/gm.html` in another.

How to run a trial with people: [documents/trial_runs.md](../../documents/trial_runs.md).

## How it works

| Part | What it does |
|---|---|
| `host.js` | the host module: runs the director, hears the players' and the game master's events, saves to `saves/campaign.json` |
| `lib/director.js` | the game master: scenario nodes, checks, the fight (initiative, turns, the creatures' moves), agreement, hints after silence, items, saves |
| `lib/creature.js` | the creatures' minds: who they go for (threat, respect, distance), grudges, fleeing, breath on who stands in front |
| `lib/intent.js` | what a player said, to a choice the scenario listens for (phrases, word starts, "don't ..." ignored); yes / no |
| `lib/rules.js` | dice, checks (d20 + bonus vs a number), the five callings (Warden, Outrider, Mender, Kindler, Wanderer), words for wounds |
| `lib/expr.js` | the scenarios' conditions (`vhorr.awake && top("vhorr.respect") >= 3`), parsed, never `eval`ed |
| `lib/game.js` | the shared document's kinds: what the host writes (world, heroes, creatures, items, fight, narration, dice) and what pages ask |
| `lib/lines.js` | the narrator's stock lines (hits, misses, turns, falls), a few variants each, never a number |
| `lib/lint.js`, `lib/sim.js` | the scenario linter, and pretend players |
| `scenarios/` | the scenarios: [format](scenarios/README.md) |
| `index.html`, `web/player.js` | the player's page |
| `gm.html`, `web/gm.js` | the game master's page (a viewer: it takes no player's place) |
| `web/table.js`, `web/speak.js` | the floor seen from above (both pages); the narrator's voice (a recording if there is one, else the browser's local voice) |

The rule of the design holds: **the host decides everything random**. Players only say things and ask (take this, I stand here); the
host's kinds are ignored from anybody else. Rolls go to the game master's page with numbers; players hear only what happened.

Players speak; until speech recognition exists (question 1 in [follow_up_questions.md](../../documents/follow_up_questions.md)) they
type what they said, or the game master types it for them ("They said"), which is also how the voice part is best tried first.

## Tools

```bash
node tools/dnd-sim.js all                 # lint every scenario; 200 games each with pretend players: endings, dead ends, stuck runs
node tools/dnd-sim.js s01_ember_hollow --show --players=4 --seed=3     # one game, as the narrator would say it
node tools/dnd-voice.js                   # the fixed lines to record (audio/lines.json)
node tools/dnd-voice.js --piper=C:\piper\piper.exe     # record them with Piper (voices in audio/voices.json)
node --test test/dnd.test.js
```

## Known limits

- The hub keeps the newest event of each key for newcomers, whoever sent it: a page that sends a `hero:` or `world` event by mistake
  replaces the host's copy for pages that join later (those pages ignore it, so they see nothing until the host sends again). Fix in the
  engine: let `mumr.json` name keys only the host may write.
- A hero who joins in the middle of a fight waits for the next fight.
- Lines with names in them are said by the browser's voice, not recorded.
- 2-player parties lose most fights with Vhorr (simulator, 2026-10-23); 4-5 players win or drive him off about half the time.
