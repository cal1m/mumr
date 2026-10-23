# Trial runs of the DnD app

How to try the game with people before any of it runs in mixed reality. The app: [apps/dnd](../apps/dnd/README.md). Written
2026-10-23.

The trials test **the story and the voice decisions**, not the headsets: players stand on the floor and speak out loud, as they will in
mixed reality; the game master types what they said (or they type it themselves on a phone). This is the "Wizard of Oz" way to try a
voice interface before the speech recognition exists, and the notes from it tell us which phrases the scenarios must listen for.

## The runs

| # | Scenario | Players | Time | What we learn |
|---|---|---|---|---|
| 0 | The Lantern Test, alone | the game master, 2 browser tabs | 20 min | everything starts; the PC speaker; the log grows |
| 1 | The Lantern Test | 2-5 | 20 min + 10 min talk | do people understand "just speak"? the fight by turns? the agreement (yes / no)? |
| 2 | The Toll at Greyford | 2-5 | 45 min + 15 min talk | talking to a creature; does the ferryman's memory feel alive? |
| 3 | The Ember Hollow | 3-5 | 2 h 10 min + 20 min talk | the whole one-shot: pacing, hints, the four endings, Vhorr |

Run 1 before 2, and 2 before 3: each one changes the phrases and lines of the next.

## Before (30 min)

1. PC: Python 3, Node.js, this repository. Speakers (the narrator plays on the PC: one voice for the room).
2. Everyone on the same Wi-Fi as the PC.
3. `py -3 server/serve.py apps/dnd`. Check that `apps/dnd/mumr-server.log` grows and says `host: started for dnd`.
4. On the PC open `https://localhost:8443/gm.html`. The tag at the top says **host here**.
5. On each phone open the printed `https://<PC>:8443/` address, accept the certificate, make a hero (name and calling).
   The game master's page lists each hero.
6. Optional: `node tools/dnd-sim.js all` (must say `stuck 0`), and the narrator's recordings (`node tools/dnd-voice.js --piper=...`);
   without recordings the PC's own voice reads the lines.
7. Mark the floor 4 x 3 m with tape, crosses 1 and 2 on one long side. In the trials it only shows where things are; the map on the
   phones has the same shape.
8. To start clean: the game master's **New campaign** (keeps the heroes who are here, forgets the rest and the creatures' memory).

## Roles

- **Game master** at the PC. Types what a player said into "They said" (pick the player first), as they said it, word for word.
  Does not explain the rules; the narrator does. Steps in only when stuck: **Hint**, a choice button, or a line of their own in
  "Narrate". Uses **Pause** for breaks.
- **Observer** (if there is one): writes down, with the time, every moment people did not know what to do, what they said that was not
  understood (the game master's page lists it under Notes as `not understood ...`), and what made them laugh or go quiet.
- **Players** stand, speak out loud to each other and to the narrator. They may type on their phone instead of the game master. The
  phone shows captions and their hero; ask them to keep it in a pocket as much as they can.

## Tell the players (2 minutes, no more)

> You are your hero. There is nothing to press: say out loud what you do, and the narrator answers. The dice are rolled for you; you
> will never hear numbers, only what happens. In a fight the narrator calls your name when it is your turn. When someone wants to do
> something that cannot be undone, the narrator asks if everyone agrees: say yes or no.

## During

- Let silence happen: after a minute the narrator gives a hint by itself.
- If the matcher misses something obvious, choose the choice by hand and write the phrase down.
- Let the observer note how long each act took (the acts are on the game master's page).

## After (talk, 10-20 min)

Ask, and write down the answers:

1. When did you not know what to do or say?
2. Did the narrator ever misunderstand you? When?
3. Did your choices matter? Which one most?
4. The fight: too slow, too fast, too hard? Did you feel the dice without seeing them?
5. The creature (Vhorr, Old Moss): did it feel like it remembered you?
6. Would a headset (seeing Vhorr in the room) change what you did?
7. One thing to keep, one thing to change.

Keep: `apps/dnd/mumr-server.log`, `apps/dnd/saves/campaign.json`, the observer's notes, the answers. Phrases that were not understood go
into the scenario's `hear` lists; check with `node tools/dnd-sim.js` and the tests.

## Faults to expect

| What | Why | What to do |
|---|---|---|
| The page says "no game master PC yet" | the host is not running (no Node.js, or it is restarting) | the log says why; a changed `.js` file restarts the host, it carries on from its save |
| A phone shows an old page | it has not reloaded after a change | it reloads by itself when it reconnects; else reload it |
| Nothing is heard on the PC | the browser's voice needs a click on the page first | click the game master's page once |
| The narrator talks over itself | lines arrive while the last ones are said | they queue; **Hush** empties the queue |
| A player's hero vanished | they changed browser or cleared it (the hero lives in the browser) | make it again; the old one can be removed with `x` |
