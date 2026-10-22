# Scenario 01: The Ember Hollow (draft)

A one-shot for 2 to 5 players, 2 to 3 hours, on a 3 × 4 m floor. The narrator speaks English. Players decide out loud; the
host listens, picks the matching branch, and the dragon remembers what happened. All content is written for this project.

## Premise

A village bell has stopped ringing since the last winter. Under the ruined chapel of Saint Aldric lies a cellar that
the villagers no longer enter. The party is hired to bring back the **Ashen Bell**, a relic that keeps the dragon Vhorr
asleep. Someone has already been in the cellar: the bell is gone and the dragon is awake.

## State the host keeps

| Variable | Start | Changed by |
|---|---|---|
| `vhorr.awake` | false | the party's noise, the bell's removal |
| `vhorr.threat[player]` | 0 for each | damage dealt to Vhorr, by player |
| `vhorr.respect[player]` | 0 for each | a player who speaks to Vhorr politely or offers a gift |
| `bell.holder` | none | a player who picks it up |
| `village.trust` | 2 | honest or dishonest answers in Act 1 |
| `cellar.lit` | false | a player who lights the lantern |

Every variable is in the shared document, so a player who joins late or a restart carries on from the same place.

## Acts

**Act 1: the chapel (about 30 min).** The party walks into the ruined nave; the narrator describes what is seen and heard
(a bell rope, wet footprints, a chalk sign). Players ask questions aloud; the answers are fixed facts, not dice.
- Ask the villager's ghost, or the priest's diary, about the bell. A true answer raises `village.trust`.
- Find the cellar stairs. Opening the cellar without a light is a choice that brings a cold draught and a sound: a wake-up
  check for Vhorr (a roll the host makes, not the players).

**Act 2: the cellar (about 40 min).** A stone hall with the dragon, sleeping on a pile of coins, its chest rising slowly.
- If nobody is loud: Vhorr stays asleep and the party may take the bell. Branch **quiet**.
- If someone shouts or breaks a crate: Vhorr wakes, turns its head to the loudest player, and speaks. Branch **awake**.

Vhorr's first line depends on `respect` and `threat` (the host picks the line from the table in the dragon's file).

**Act 3: the choice (about 40 min).** The party must decide, by voice, what to do. The host listens for these intents:

| Heard (examples) | Branch | What happens |
|---|---|---|
| "we take the bell", "sneak past" | steal | the bell is picked up; a check for Vhorr's waking; a chase if it wakes |
| "we talk", "we offer", "we need the bell back" | bargain | Vhorr asks for something in return (a memory, a name, a promise) |
| "attack", "fire", "for the village" | fight | initiative starts; Vhorr fights to the death or flees when hurt |

The host gives the players a clear spoken choice when they are stuck (after about 60 s of silence), never a hidden rule.

**Act 4: the ending (about 20 min).** Four endings, picked from the variables, not from a single vote:
1. **Bell returned, Vhorr sleeps again.** Needs `bargain` and high `respect`.
2. **Bell stolen, Vhorr hunts the village.** Needs `steal` and low `trust`; the narrator describes the bells ringing again, from the wrong direction.
3. **Vhorr dead.** Needs `fight` and most damage by one player; that player's name is read aloud in the village.
4. **Vhorr flies away with the bell.** Needs `steal` and a successful chase; a sequel hook.

## Dragon Vhorr (behaviour, not a script)

- Moves toward the player with the highest `threat` when awake; toward the player with the highest `respect` when talking.
- Remembers, for the whole campaign, who hurt it. Next time it meets that player it is faster to attack them.
- Uses breath when two or more players stand in the same cone (in front of its head, 4 m long). Breath is a save: the host
  rolls it; the player hears only the consequence ("your cloak burns at the hem").
- Speaks in short lines (one or two sentences). The narrator voices everything; the dragon has its own voice (deep, slow).

## What the players hear and see

- **The narrator** (voice, English) describes results and consequences. Results of rolls are never read out as numbers.
- **Sound effects:** bell, wings, breath, coins sliding, chain, a door.
- **On the headset:** only what is near the player (the dragon, the bell, the cellar stairs). No menu during Act 2 and 3.

## Length and pacing

- Act 1: 30 min. Act 2: 40 min. Act 3: 40 min. Act 4: 20 min. Total about 2 h 10 min, with a 10-minute break before Act 3.
- Acts can be skipped: if the party is fast, Act 1 ends at the cellar door; if slow, Act 2 has an extra event (a second cellar door).

## Open points for this draft

- Exact wording of the narrator's lines (write them in the scenario file as they become real).
- The dragon's table of first lines (from `respect` and `threat`).
- The number of checks for the wake-up and breath (keep to three or four, so the story stays readable).
