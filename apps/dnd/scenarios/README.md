# Writing a scenario

A scenario is a CommonJS file here that exports one object, listed in `index.js`. After any change run `node tools/dnd-sim.js <id>`:
it lints the file and plays it 200 times with pretend players. Everything in a scenario is our own (names, creatures, texts).

```js
module.exports = {
  id: 's03_example', title: 'Example', blurb: 'one sentence', minutes: 40, players: [2, 5],
  room: { w: 4, d: 3 },            // metres; x from cross 1 toward cross 2, y across
  hintAfter: 60,                   // seconds of silence before a hint
  vars: { 'door.open': false },    // the story's variables (every one used must be here)
  heroVars: { lied: 0 },           // per hero (changed with `me`, read with top()/sum() and me.lied)
  creatures: [{ id, name, voice, kind, hp, hpPerHero, def, at: [x, y], yaw, size, mood: 'asleep' | 'watch' | 'talk',
                attack: { name, bonus, dmg: '1d8+1' }, breath: { name, dmg, dc, stat, every, len, angle }, flee: 0.25,
                lines: { hurt: [...], flee: [...] } }],
  items: [{ id, name, kind, at: [x, y], heal: '2d4+2', shown: false }],
  start: 'first',
  nodes: { first: { ... } },
};
```

## Nodes

| Field | What |
|---|---|
| `act`, `scene` | shown on the pages (`act` stays until another node sets it) |
| `say` | lines said on entering (see Lines) |
| `enter` | effects on entering (see Effects) |
| `choices` | what the players can do here (see Choices) |
| `hints` | lines said one by one after silence; after the last, the narrator lists the choices' labels |
| `go` | where to go next when the node has no choices: a node id, or `[{ when, go }, ..., { go }]` (the first that holds) |
| `check` | a check made on entering (see Checks) |
| `fight` | `{ foes: [ids], win, lose, fled, escape }`: a fight; its outcome goes to that node. The node's choices stay open in it |
| `end` | `{ title }`: an ending |
| `on` | `{ take: { itemId: outcome }, drop: { ... } }`: when an item is picked up or put down here |

## Choices

`{ label, hear: ['phrase', ...], when, once, again, confirm, quiet, say, ...effects, check, go }`

- `hear`: phrases the host listens for. All the words of a phrase (without "the", "we", "let's" ...) must be said, in order; a word
  matches its own start ("attack" hears "attacking"). A phrase after "don't", "not", "never" does not count. Prefer two or three
  short phrases over one long one.
- `label`: how the narrator offers it ("You could look at the rope, ..."). `quiet: true` keeps it out of that list.
- `when`: open only while this holds. `once`: once only; `again`: what is said if it is asked again.
- `confirm: true`: the narrator asks "Does everyone agree?"; a no cancels, a yes or 20 s of silence goes on. Use it for what cannot be undone.

## Lines

A string (the narrator), or `{ t, v, when }`: `v` is the voice (`narrator`, or a creature's voice), `when` a condition. In the text:
`{hero}` (who spoke or acted), `{heroes}` (everyone standing), `{top:var}` (the hero with the most of a per-hero value, e.g.
`{top:vhorr.threat}`, `{top:dealt}`). Never a number: players hear what happened.

## Effects

`set: { var: value }`, `add: { var: n }`, `me: { heroVar: n }` (the hero who spoke), `show: [items]`, `hide: [items]`, `give: item`
(to the hero who spoke), `mood: { creature: mood }`, `respect: { creature: n }`, `threat: { creature: n }` (in that creature's memory
of the hero who spoke), `hurt: { who: 'all' | 'speaker', dmg: '1d4' }`, `heal: true` (everyone).

## Checks

`{ stat: 'might' | 'grace' | 'wits' | 'heart', dc: 12, who: 'speaker' | 'best' | 'group' | 'luck', label, edge, pass: outcome, fail: outcome }`
An outcome is `{ say, ...effects, go }`. `group`: everyone rolls, half must pass. `luck`: a plain d20 (the world's own roll).

## Conditions

`vhorr.awake && village.trust >= 2`, `!cellar.lit`, with `== != < <= > >= && || ! + - * /` and these functions: `has("item")` (somebody
holds it), `top("x")` / `sum("x")` (over the heroes here: a creature's memory `vhorr.respect`, or a per-hero variable), `hp("creature")`
(0 to 1), `mood("creature")`, `heroes()`, `standing()`, `last()` (the last check passed), `visited("node")`, `me.var`.
