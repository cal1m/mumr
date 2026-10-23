# Questions for later (DnD app)

Collected while building [apps/dnd](../apps/dnd/README.md) on 2026-10-23. Each says what was assumed meanwhile, so nothing waits on it.

## Decisions that change what gets built next

1. **Speech recognition.** The design says whisper.cpp on the PC, each headset sending its own audio. Until then the game master types
   what was said (or the player types it). Is that fine for the first trials? Should the next phase be speech recognition (phones and
   headsets stream their microphone to the PC), or the 3D phase (Vhorr in the room)? *Assumed: trials with typing first.*
2. **A dragon model.** Phase 3 needs a glTF dragon with a licence that allows our use (and later, the other creatures). Do we have one,
   buy one, or start with a stand-in shape? *Assumed: nothing yet; the 2D map shows a circle and the way it faces.*
3. **Piper voices.** Which voice models (narrator, Vhorr, Pip, Sister Wenna, Old Moss)? Each model's licence must allow our use. Lines
   with names in them ("Mira, your move") are read by the browser's local voice; is that mix acceptable, or should names be recorded too?
4. **A human game master in the room, or none?** The app works either way: the host runs everything, the game master only helps. For
   the finished game, is a person at the PC expected (typing, hinting), or must it run alone?
5. **Engine change.** A page could overwrite the host's kept things for newcomers (the hub does not know which keys are the host's).
   May I add to MUMR's hub a `mumr.json` list of keys only the host may write? It touches `server/hub.py` and `test/hubfake.js`.

## The rules and the story

6. **Ember Hollow, a contradiction in the draft:** it says both "the bell is gone and the dragon is awake" and "if nobody is loud, Vhorr
   stays asleep and the party may take the bell". *Built:* the thief (a boy, Tam) dropped the bell in the cellar; Vhorr is stirring,
   and wakes at any loud act. OK?
7. **Ember Hollow endings:** the draft ties ending 1 (bell returned, Vhorr sleeps) to bargaining. *Built:* stealing the bell cleanly with
   the village's trust also gets ending 1; without the trust, ending 2. And if the whole party falls, Vhorr carries them out and flies
   off with the bell (ending 4). OK?
8. **Heroes die?** *Built:* a hero at 0 is "down" (a Mender's mend or a potion brings them back); nobody dies. Permanent death in a
   campaign?
9. **What players see.** *Built:* no numbers anywhere on the player's page; wounds are words (unhurt ... badly hurt), a gift's uses are
   dots. Is even that too much, or too little?
10. **Fights by turns.** The narrator calls each hero by name and waits for them (45 s, then they hesitate); speech out of turn is
    ignored. Turn-based is easy to follow, but less like a larp. Keep it, or try everyone-at-once?
11. **Agreement.** For choices that cannot be undone the narrator asks "does everyone agree?"; a no stops it, a yes or 20 s of silence
    goes on. Is silence = yes right?
12. **Difficulty.** In the simulator, two players lose most fights with Vhorr; four or five win or drive him off about half the time.
    Should a fight with two players be easier (Vhorr's damage scaled too, not only his hit points)?
13. **Creature memory across games.** Creatures remember heroes for the whole campaign (Old Moss lets a hero he liked across at once).
    Trial runs will fill that memory; the game master has "Make them forget everybody" and "New campaign". Enough?
14. **Callings.** Five, our own: Warden, Outrider, Mender, Kindler, Wanderer, each with one gift. Fine as a start, or do you want others?

## Practical

15. **Positions in trials.** Players tap where they stand on the phone's map (Vhorr's fire uses it); in mixed reality it will come from
    the headset. Worth it in trials, or leave positions out (the fire then catches people by chance)?
16. **Phones in hand** break the larp a little (captions, the hero card). For trials it helps; later, on headsets, there will be no
    page at all. Agreed?
17. **Name and place.** The app is `apps/dnd`, titled "DnD in mixed reality". A real name? And may `examples/dnd` (phase 1) be deleted?
18. **Language.** The narrator, the scenarios and the pages are in English; the design document is in Czech. Should the documents for
    players (trial guide) be in Czech too?
19. **Git.** The work is committed on branch `add-dnd-example`, not pushed. Push it and open a pull request, or keep it local?
