# The wrist menu: design spec

The engine's own menu (`client/sysmenu.js`, drawn by `client/xr/panel3d.js`) is the only part of MUMR a game's player sees. This is its look and its
feel, as decided with Marek on 2026-10-22 to 2026-10-25. Nothing here is built yet: `sysmenu.js`, `menus.js` (`Poke`) and `panel3d.js` still do the
old thing (rounded blue buttons, a press is a fingertip passing through a button, no depth, no sound).

The pictures: <https://claude.ai/artifact/ERSs3PH9gdcbnCJxYqJjHt> (private, Marek's account). Page "The design", the big board "The wrist menu: the full spec".
The older pages (Round 1 to 3, Logo, Menu in 3D) show how it got here. Where this file and a picture disagree, this file wins.

## Principles

- Interaction first. The menu is poked by a hand-tracked fingertip of one hand on a card that moves with the other wrist, so tracking is imprecise:
  targets are big, gaps are wide, and only things that can be pressed look pressable.
- Plain. One sans-serif, flat fills, sharp corners, no shadows, no gradients, no decoration, no accent colour. Black, white and neutral grays only.
- The menu is flat at rest. Only a nearby or pressing fingertip changes it.

## Look

| Thing | Value |
| --- | --- |
| Menu card, folded button, fold arrow | `#F0F0F0` |
| Buttons | `#DCDCDC` |
| Hover, pressed, all text | `#111111` (text on a dark button `#F0F0F0`) |
| Second line of text | `#555555` |
| Type | Inter 600 for button text (22 px on the 768 px card), Inter 500 for the second line (14 px), Inter 600 for the title (18 px) |
| Logo | `docs/brand/mumr-logo.svg` / `.png` (gray `#444444` on white), `mumr-logo-inverse.*` (white on gray) |

The logo: MU over MR in Archivo ExtraBold. M, U and R have the same width. U and R are the same height. The M is two stretched Ms at 160% (of the height
of U or R) with the overlap hidden, so one thin separation runs through all three letters. Margins and gaps are one thin unit; the logo sits centred in a square.

## Layout: design C, six fixed slots

- The card is 22 cm wide with a 0.5 cm margin. Two columns, rows of 3 cm, 8 mm between buttons and between rows.
- Every screen uses the same six places. Only buttons are drawn as buttons; a thing that cannot be pressed now is a line of text, not a grey button.
- Home: Line up, Room setup, Exit. Line up: one slot per spot (Spot 1, Spot 2, Check spot), Room (with Upload), Done. Spot menu (after poking a spot):
  Lock, Replace, Delete, Back, with Delete away from the others. Exit asks again, with the confirming button in another place.
- A button is at least 4 × 3 cm. Nothing smaller.

## Fold and unfold

- Folded: a 2 × 2 cm button with the logo, on the inside of the left wrist (shown while that side of the wrist looks at the player, as now).
- Fold: nothing inside the menu folds it. A 2 × 2 cm arrow floats 8 mm above the menu, pointing down. Poking it folds the menu.
- Unfold: poking the folded button makes the menu grow out of it, the button rises and turns into the arrow, and a ripple runs up through the menu while it
  opens, only 2 mm tall (as tall as a button is when a fingertip is near). Fold is the same backwards: the menu shrinks into the arrow, the arrow goes
  down and turns into the button. The 5-second auto-fold of a hidden home menu uses the same animation.
- Durations are not decided; about a quarter of a second to start.

## A press

All depths are measured from the menu surface, along the push, in cm.

| State | Fingertip | The menu |
| --- | --- | --- |
| Flat | away | flat |
| Near | within 6 cm, above a button | that button stands up 2 mm, as a sharp-edged block; nothing else moves |
| Pushing | 0 to 1 cm into the button | nothing moves; the button stays at its 2 mm |
| Pressed | reaches 1 cm | the button snaps down 1 cm as one block into a square pit with sharp vertical walls, turns near-black, and activates (once, only on the way down) |
| Following | 1 to 2.5 cm | the block follows the fingertip exactly |
| Deep | past 2.5 cm | the button stops at 2.5 cm; the whole menu moves back 1 mm for every cm of extra push, in the direction of the press |
| Released | back up to the surface (0 cm) | the button disengages, the menu returns to flat, nothing is activated. The main way to let go |
| Left sideways | 5 to 10 cm away in any direction | lets go too, the same way |

- No plastic deformation: no slopes, no bowl, no curves. Only rigid blocks and vertical walls.
- Moving the hand up, down or sideways never moves the menu (only the push beyond 2.5 cm does).
- While a button is held, no other button can be pressed; moving the fingertip over another button does nothing until the first is released.
- A new press has to come in from the top again; letting go and coming back sideways does not activate anything.

## Sound

Two distinct clicks, a click and not a tone, rendered on the fly (Web Audio), one short voice each. Bigger button, lower click. The audio originates from the
menu or the button itself, never from the head or the hand.

- Press click: when the button snaps down (1 cm). A little lower, sharper.
- Release click: when the button lets go (0 cm, or sideways). Higher, lighter, shorter.
- Nothing plays for the hover lift, for following the finger, or for unfold and fold.
- Starting values, to tune by ear: ring frequency 3200 Hz × sqrt(12 / area in cm²) (4 × 3 cm about 3.2 kHz, full width about 1.4 kHz, 2 × 2 cm about 5.5 kHz),
  times 0.8 for the press and 1.25 for the release, times a random 0.97 to 1.03. A few ms of band-passed noise plus a damped sine; the press longer
  (about 6 ms and 35 ms) than the release (about 3 ms and 20 ms). Played from a PannerNode at the button's centre.

## Not decided

Animation durations. Whether a soft thud should play when a button reaches the 2.5 cm limit. The click frequencies and levels. The exact release distance
(5 to 10 cm) for leaving sideways. Whether the hover lift should grow as the fingertip comes closer than 6 cm (it is a flat 2 mm now).

## Building it

Where the pieces would go: the press states and the held-button lock in `Poke` (`client/menus.js`), the drawing (flat card, lift, pit, whole-menu push, arrow,
folded button) in `client/xr/panel3d.js`, the new layout in `SysMenu.layout` (`client/sysmenu.js`), the clicks in a new small client file that `panel3d.js`
or the page calls. The menu is shared (it goes out in the `M` packet) and other players press it, so the depth state must be part of what is sent.
